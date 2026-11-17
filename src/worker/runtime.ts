import { Prisma, type PrismaClient } from "@prisma/client";
import { hasPaidAccess } from "../lib/billing/policy";
import { eligibleForAlert, isRestock } from "../lib/inventory/domain";
import { inventoryAdapters } from "../lib/inventory";
import type { CheckResult, InventoryAdapter, RetailerId } from "../lib/inventory/types";
import { DeliveryError, sendEmail, sendPush, type NotificationMessage } from "./notifications";

function secondsSetting(key: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value >= min ? Math.min(Math.floor(value), max) : fallback;
}
const cooldownSeconds = () => secondsSetting("ALERT_COOLDOWN_SECONDS", 1800, 60, 86400);
const alertTtlSeconds = () => secondsSetting("ALERT_TTL_SECONDS", 900, 60, 3600);

/** The observation, transition event, and fanout jobs commit together. */
export async function recordCheck(db: PrismaClient, adapter: InventoryAdapter, result: CheckResult, leaseUntil: Date) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Retailer" WHERE id = ${adapter.id} FOR UPDATE`;
    const retailer = await tx.retailer.findUniqueOrThrow({ where: { id: adapter.id } });
    // A slow/crashed worker cannot overwrite the result of a newer lease owner.
    if (retailer.leaseUntil?.getTime() !== leaseUntil.getTime()) return { recorded: false, jobs: 0 };
    const checkedAt = result.ok ? result.observation.checkedAt : result.checkedAt;
    const backoff = !result.ok && ["PROVIDER_ACCESS_DENIED", "PROVIDER_RATE_LIMITED"].includes(result.errorCode) ? 3600 : adapter.intervalSeconds;
    const nextDelay = result.ok ? adapter.intervalSeconds : Math.max(backoff, result.retryAfterSeconds ?? 0);
    if (!result.ok) {
      await tx.retailer.update({ where: { id: adapter.id }, data: { lastAttemptAt: checkedAt, lastError: result.errorCode, nextCheckAt: new Date(Date.now() + nextDelay * 1000), leaseUntil: null } });
      return { recorded: true, jobs: 0 };
    }
    const value = result.observation;
    const existing = await tx.inventoryObservation.findUnique({ where: { retailerId_checkedAt: { retailerId: adapter.id, checkedAt } } });
    if (existing) {
      await tx.retailer.update({ where: { id: adapter.id }, data: { leaseUntil: null, nextCheckAt: new Date(Date.now() + nextDelay * 1000) } });
      return { recorded: false, jobs: 0 };
    }
    const observation = await tx.inventoryObservation.create({ data: { ...value, evidence: value.evidence as Prisma.InputJsonValue } });
    await tx.retailer.update({ where: { id: adapter.id }, data: { lastAttemptAt: checkedAt, lastSuccessfulCheck: checkedAt, lastState: value.state, lastPriceCents: value.priceCents, lastError: null, nextCheckAt: new Date(Date.now() + nextDelay * 1000), leaseUntil: null } });
    if (!isRestock(retailer.lastSuccessfulCheck ? retailer.lastState : null, value.state)) return { recorded: true, jobs: 0 };
    const event = await tx.stockEvent.create({ data: { retailerId: adapter.id, observationId: observation.id } });
    // Fanout considers only server-owned subscriptions; no client-supplied paid flag.
    const watches = await tx.watch.findMany({ where: { retailers: { has: adapter.id } }, orderBy: { userId: "asc" }, include: { user: { include: { subscription: true, pushSubscriptions: true } } } });
    let jobs = 0;
    const now = new Date();
    for (const watch of watches) {
      // Cross-retailer cooldown decisions are serialized for this recipient.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`alert:${watch.userId}`}))`;
      const latest = await tx.notificationJob.findFirst({ where: { userId: watch.userId, status: { in: ["pending", "processing", "retrying", "delivered"] } }, orderBy: { createdAt: "desc" } });
      if (!eligibleForAlert({ observation: value, retailerIds: watch.retailers, maxPriceCents: watch.maxPriceCents, enabled: true, paid: hasPaidAccess(watch.user.subscription, now) && watch.user.emailVerified, lastAlertAt: latest?.createdAt, cooldownSeconds: cooldownSeconds(), now })) continue;
      const entries: Prisma.NotificationJobCreateManyInput[] = [];
      if (watch.emailEnabled) entries.push({ userId: watch.userId, eventId: event.id, channel: "email", target: "email" });
      if (watch.pushEnabled) for (const push of watch.user.pushSubscriptions) entries.push({ userId: watch.userId, eventId: event.id, channel: "push", target: push.id });
      if (entries.length) jobs += (await tx.notificationJob.createMany({ data: entries, skipDuplicates: true })).count;
    }
    return { recorded: true, jobs };
  }, { timeout: 30000 });
}

export async function checkSources(db: PrismaClient, adapters = inventoryAdapters()) {
  if (process.env.DEMO_MODE === "true") return;
  for (const adapter of adapters.filter((source) => source.enabled)) {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + 60000);
    const claim = await db.retailer.updateMany({ where: { id: adapter.id, enabled: true, nextCheckAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { leaseUntil } });
    if (!claim.count) continue;
    const result = await adapter.check();
    await recordCheck(db, adapter, result, leaseUntil);
  }
}

export type DeliveryTransport = { email: typeof sendEmail; push: typeof sendPush };

export async function dispatchNotifications(db: PrismaClient, transport: DeliveryTransport = { email: sendEmail, push: sendPush }) {
  if (process.env.DEMO_MODE === "true") return;
  const now = new Date();
  const candidates = await db.notificationJob.findMany({ where: { status: { in: ["pending", "retrying", "processing"] }, nextAttemptAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, orderBy: { createdAt: "asc" }, take: 25 });
  for (const candidate of candidates) {
    const leaseUntil = new Date(Date.now() + 120000);
    const claimed = await db.notificationJob.updateMany({ where: { id: candidate.id, status: { in: ["pending", "retrying", "processing"] }, nextAttemptAt: { lte: new Date() }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] }, data: { status: "processing", leaseUntil, attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    const job = await db.notificationJob.findUniqueOrThrow({ where: { id: candidate.id }, include: { user: { include: { watch: true, subscription: true } }, event: { include: { observation: true, retailer: true } } } });
    const finish = (data: Prisma.NotificationJobUpdateManyMutationInput) => db.notificationJob.updateMany({ where: { id: job.id, leaseUntil }, data: { ...data, leaseUntil: null } });
    const observation = job.event.observation;
    const watch = job.user.watch;
    const enabledSource = inventoryAdapters().find((source) => source.id === job.event.retailerId)?.enabled;
    const stale = Date.now() - observation.checkedAt.getTime() > alertTtlSeconds() * 1000;
    const superseded = job.event.retailer.lastState !== "IN_STOCK" || Boolean(job.event.retailer.lastError);
    const allowed = watch && enabledSource && job.event.retailer.enabled && !stale && !superseded && job.user.emailVerified && eligibleForAlert({ observation: { ...observation, retailerId: observation.retailerId as RetailerId, state: observation.state === "CHECK_FAILED" ? "UNKNOWN" : observation.state, currency: "USD", evidence: {} }, retailerIds: watch.retailers, maxPriceCents: watch.maxPriceCents, enabled: job.channel === "email" ? watch.emailEnabled : job.channel === "push" && watch.pushEnabled, paid: hasPaidAccess(job.user.subscription, new Date()), cooldownSeconds: 0, now: new Date() });
    if (!allowed) { await finish({ status: "skipped", lastError: stale ? "OBSERVATION_EXPIRED" : "NO_LONGER_ELIGIBLE" }); continue; }
    const message: NotificationMessage = { eventId: job.eventId, jobId: job.id, retailerName: job.event.retailer.name, sourceUrl: observation.sourceUrl, priceCents: observation.priceCents, checkedAt: observation.checkedAt };
    try {
      if (job.channel === "email") await transport.email(message, job.user.email);
      else if (job.channel === "push") {
        const push = await db.pushSubscription.findFirst({ where: { id: job.target, userId: job.userId } });
        if (!push) throw new DeliveryError("PUSH_ENDPOINT_REMOVED", true);
        await transport.push(message, push);
      } else throw new DeliveryError("UNKNOWN_CHANNEL", true);
      await finish({ status: "delivered", deliveredAt: new Date(), lastError: null });
    } catch (error) {
      const failure = error instanceof DeliveryError ? error : new DeliveryError("DELIVERY_FAILED");
      if (failure.code === "PUSH_ENDPOINT_EXPIRED") await db.pushSubscription.deleteMany({ where: { id: job.target, userId: job.userId } });
      const exhausted = failure.permanent || job.attempts >= 6;
      await finish({ status: exhausted ? "failed" : "retrying", lastError: failure.code, nextAttemptAt: new Date(Date.now() + Math.min(600, 15 * 2 ** (job.attempts - 1)) * 1000) });
    }
  }
}
