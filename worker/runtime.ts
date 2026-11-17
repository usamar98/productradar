import type { Prisma, RadarSource } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { BlockedSourceError, connectorFor } from "../src/lib/radar/connectors";
import { canDeliver, pollDelayMs, stockTransition, type StockCheck } from "../src/lib/radar/domain";

const sourceLeaseMs = 180_000;
export async function recordObservation(source: RadarSource, leaseUntil: Date, result: StockCheck, checkedAt = new Date(), database = prisma) {
  return database.$transaction(async (tx) => {
    // Fence a stale worker before changing inventory or enqueueing anything.
    const updated = await tx.radarSource.updateMany({ where: { id: source.id, leaseUntil, status: "active" }, data: {
      inStock: result.inStock, priceCents: result.priceCents ?? null, lastCheckedAt: checkedAt,
      lastError: null, failureCount: 0, leaseUntil: null,
      nextCheckAt: new Date(checkedAt.getTime() + pollDelayMs(source.pollSeconds)),
    } });
    if (!updated.count) return null;
    const transition = stockTransition(source.inStock, result.inStock);
    if (transition === "close") await tx.radarStockEvent.updateMany({ where: { sourceId: source.id, endedAt: null }, data: { endedAt: checkedAt } });
    if (transition !== "open") return null;
    const event = await tx.radarStockEvent.create({ data: { sourceId: source.id, inStock: true, priceCents: result.priceCents, seenAt: checkedAt } });
    // Synthetic hidden-item observations never enter the customer delivery path.
    if (source.connector === "mock") return event;
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

async function pollSource(source: RadarSource & { item: { hidden: boolean } }) {
  const now = new Date(), leaseUntil = new Date(now.getTime() + sourceLeaseMs);
  const claimed = await prisma.radarSource.updateMany({ where: { id: source.id, status: "active", nextCheckAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { leaseUntil } });
  if (!claimed.count) return;
  try {
    const result = await connectorFor(source.connector).check(source);
    await recordObservation(source, leaseUntil, result);
  } catch (error) {
    const blocked = error instanceof BlockedSourceError;
    const failures = source.failureCount + 1;
    await prisma.radarSource.updateMany({ where: { id: source.id, leaseUntil }, data: {
      status: blocked ? "blocked" : "active", leaseUntil: null, lastCheckedAt: new Date(), failureCount: failures,
      // Connector messages contain no credentials or request bodies.
      lastError: error instanceof Error ? error.message.slice(0, 500) : "Source check failed.",
      nextCheckAt: new Date(Date.now() + pollDelayMs(source.pollSeconds, failures)),
    } });
  }
}

export async function pollDueSources() {
  if (process.env.DEMO_MODE === "true") return;
  const now = new Date();
  const sources = await prisma.radarSource.findMany({ where: { status: "active", nextCheckAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, include: { item: { select: { hidden: true } } }, orderBy: { nextCheckAt: "asc" }, take: 4 });
  await Promise.allSettled(sources.map(pollSource));
}
