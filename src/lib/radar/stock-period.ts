import type { Prisma, RadarSource } from "@prisma/client";
import { canDeliver, stockTransition, type StockCheck } from "./domain";
import { sourceCanAlert } from "./inventory-feed-auth";

/** Called inside the transaction that owns this source's observation. */
export async function recordStockPeriod(tx: Prisma.TransactionClient, previous: RadarSource, result: StockCheck, observedAt: Date) {
  const transition = stockTransition(previous.inStock, result.inStock);
  if (transition === "close") {
    await tx.radarStockEvent.updateMany({ where: { sourceId: previous.id, endedAt: null }, data: { endedAt: observedAt } });
  }
  if (transition !== "open") return null;
  const event = await tx.radarStockEvent.create({ data: { sourceId: previous.id, inStock: true, priceCents: result.priceCents, seenAt: observedAt } });
  // A supplier's first snapshot establishes a baseline. Only a later false → true is a restock.
  if (!sourceCanAlert(previous) || (previous.status === "feed" && previous.inStock !== false)) return event;
  const alerts = await tx.radarAlert.findMany({ where: {
    itemId: previous.itemId, variantId: previous.variantId, sourceIds: { has: previous.id },
    status: "active", activeUntil: { gt: observedAt },
    ...(previous.status === "feed" ? { createdAt: { lte: observedAt }, subscription: { createdAt: { lte: observedAt } } } : {}),
  }, include: { user: { include: { pushSubscriptions: true } }, subscription: true, plan: true } });
  const jobs: Prisma.RadarNotificationCreateManyInput[] = [];
  for (const alert of alerts) {
    if (!canDeliver(alert, observedAt)) continue;
    jobs.push({ alertId: alert.id, stockEventId: event.id, channel: "email", target: "email" });
    for (const push of alert.user.pushSubscriptions) jobs.push({ alertId: alert.id, stockEventId: event.id, channel: "push", target: push.id });
  }
  if (jobs.length) await tx.radarNotification.createMany({ data: jobs, skipDuplicates: true });
  return event;
}
