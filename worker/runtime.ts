import type { Prisma, RadarSource } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { BlockedSourceError, connectorFor } from "../src/lib/radar/connectors";
import { canDeliver, pollDelayMs, stockTransition, type StockCheck } from "../src/lib/radar/domain";
import { isLocalTestMode } from "../src/lib/radar/local-test";
import { isOfficialConnector, officialMinPollSeconds, officialProviderIntervalSeconds } from "../src/lib/radar/official-connectors";

const sourceInterval = (source: RadarSource) => isOfficialConnector(source.connector) ? Math.max(officialMinPollSeconds, source.pollSeconds) : source.pollSeconds;
const sourceDelay = (source: RadarSource, failures = 0) => Math.max(isOfficialConnector(source.connector) ? officialMinPollSeconds * 1000 : 0, pollDelayMs(sourceInterval(source), failures));

const sourceLeaseMs = 180_000;
export async function recordObservation(source: RadarSource, leaseUntil: Date, result: StockCheck, checkedAt = new Date(), database = prisma) {
  if (source.connector === "local-test" && !isLocalTestMode()) throw new BlockedSourceError("Local-test observations cannot be recorded outside the isolated local lab.");
  return database.$transaction(async (tx) => {
    // Fence a stale worker before changing inventory or enqueueing anything.
    const updated = await tx.radarSource.updateMany({ where: { id: source.id, leaseUntil, status: { in: ["active", "on_demand"] }, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lte: checkedAt } }] }, data: {
      inStock: result.inStock, priceCents: result.priceCents ?? null, lastCheckedAt: checkedAt,
      lastError: null, failureCount: 0, leaseUntil: null,
      nextCheckAt: new Date(checkedAt.getTime() + sourceDelay(source)),
    } });
    if (!updated.count) return null;
    const transition = stockTransition(source.inStock, result.inStock);
    if (transition === "close") await tx.radarStockEvent.updateMany({ where: { sourceId: source.id, endedAt: null }, data: { endedAt: checkedAt } });
    if (transition !== "open") return null;
    const event = await tx.radarStockEvent.create({ data: { sourceId: source.id, inStock: true, priceCents: result.priceCents, seenAt: checkedAt } });
    // Synthetic hidden-item observations never enter the customer delivery path.
    if (source.connector === "mock" || source.status !== "active" || !source.approved) return event;
    const alerts = await tx.radarAlert.findMany({ where: {
      itemId: source.itemId, variantId: source.variantId, status: "active", activeUntil: { gt: checkedAt }, sourceIds: { has: source.id },
    }, include: { user: { include: { pushSubscriptions: true } }, subscription: true, plan: true } });
    const jobs: Prisma.RadarNotificationCreateManyInput[] = [];
    for (const alert of alerts) {
      if (!canDeliver(alert, checkedAt)) continue;
      jobs.push({ alertId: alert.id, stockEventId: event.id, channel: "email", target: "email" });
      for (const push of alert.user.pushSubscriptions) jobs.push({ alertId: alert.id, stockEventId: event.id, channel: "push", target: push.id });
    }
    if (jobs.length) await tx.radarNotification.createMany({ data: jobs, skipDuplicates: true });
    return event;
  });
}

export async function claimSource(source: RadarSource, database = prisma) {
  const now = new Date(), leaseUntil = new Date(now.getTime() + sourceLeaseMs);
  return database.$transaction(async tx => {
    // Serialize claims across worker processes, not only within one JavaScript process.
    if (isOfficialConnector(source.connector)) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`official-source:${source.connector}`}))`;
    const claimed = await tx.radarSource.updateMany({ where: { id: source.id, status: "active", nextCheckAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { leaseUntil } });
    if (!claimed.count) return null;
    if (isOfficialConnector(source.connector)) {
      const next = new Date(now.getTime() + officialProviderIntervalSeconds * 1000);
      await tx.radarSource.updateMany({ where: { connector: source.connector, status: "active", nextCheckAt: { lt: next } }, data: { nextCheckAt: next } });
    }
    return leaseUntil;
  });
}

export async function recordSourceFailure(source: RadarSource, leaseUntil: Date, error: unknown, database = prisma) {
  const blocked = error instanceof BlockedSourceError;
  const failures = source.failureCount + 1;
  const message = `${blocked && isOfficialConnector(source.connector) ? "Inventory endpoint blocked: " : ""}${error instanceof Error ? error.message : "Source check failed."}`.slice(0, 500);
  return database.$transaction(async tx => {
    if (blocked && isOfficialConnector(source.connector)) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`official-source:${source.connector}`}))`;
    const updated = await tx.radarSource.updateMany({ where: { id: source.id, leaseUntil }, data: {
      status: blocked ? "blocked" : "active", leaseUntil: null, failureCount: failures,
      // A failed attempt must not advance the last successful stock observation time.
      lastError: message, nextCheckAt: new Date(Date.now() + sourceDelay(source, failures)),
    } });
    if (updated.count && blocked && isOfficialConnector(source.connector)) {
      // Protection stops the provider's other active sources as well, including leased work.
      await tx.radarSource.updateMany({ where: { connector: source.connector, status: "active" }, data: { status: "blocked", leaseUntil: null, lastError: message } });
    }
  });
}

async function pollSource(source: RadarSource & { item: { hidden: boolean } }) {
  const leaseUntil = await claimSource(source);
  if (!leaseUntil) return;
  try {
    const result = await connectorFor(source.connector).check(source);
    await recordObservation(source, leaseUntil, result);
  } catch (error) {
    await recordSourceFailure(source, leaseUntil, error);
  }
}

export async function pollDueSources() {
  if (process.env.DEMO_MODE === "true") return;
  const now = new Date();
  const sources = await prisma.radarSource.findMany({ where: { status: "active", nextCheckAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, include: { item: { select: { hidden: true } } }, orderBy: { nextCheckAt: "asc" }, take: 4 });
  await Promise.allSettled(sources.map(pollSource));
}
