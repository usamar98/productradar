export type StockCheck = { inStock: boolean; priceCents?: number; raw?: string };
export type StockTransition = "open" | "close" | "unchanged";

/** The first observed available state opens a real observed availability period. */
export function stockTransition(previous: boolean | null, current: boolean): StockTransition {
  if (current && previous !== true) return "open";
  if (!current && previous === true) return "close";
  return "unchanged";
}

export function notificationIdentity(alertId: string, eventId: string, channel: string, target = "email") {
  return JSON.stringify([alertId, eventId, channel, target]);
}

export function pollDelayMs(seconds: number, failures = 0, random = Math.random) {
  const base = Math.max(15, seconds) * 1000;
  const backoff = Math.min(3_600_000, base * 2 ** Math.min(10, Math.max(0, failures)));
  return Math.round(backoff * (0.9 + random() * 0.2));
}

export function withinPlanLimit(sourceIds: string[], limit: number) {
  return Number.isInteger(limit) && limit > 0 && sourceIds.length > 0 && new Set(sourceIds).size === sourceIds.length && sourceIds.length <= limit;
}

export function canDeliver(alert: { status: string; activeUntil: Date | null; caughtAt: Date | null; plan: { type: string }; subscription: { status: string; currentPeriodEnd: Date | null } | null }, now = new Date()) {
  return alert.status === "active" && !!alert.activeUntil && alert.activeUntil > now &&
    (alert.plan.type !== "one_time_pass" || !alert.caughtAt) &&
    !!alert.subscription && alert.subscription.status === "active" && !!alert.subscription.currentPeriodEnd && alert.subscription.currentPeriodEnd > now;
}
