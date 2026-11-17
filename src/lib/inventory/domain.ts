import { createHash } from "node:crypto";
import type { CheckResult, InventoryObservation, StockState } from "./types";

/** An unavailable HTTP request must never replace the last successful observation. */
export function applyCheck(previous: InventoryObservation | null, result: CheckResult) {
  return {
    lastValid: result.ok ? result.observation : previous,
    checkState: result.ok ? result.observation.state : ("CHECK_FAILED" as const),
    lastCheckedAt: result.ok ? result.observation.checkedAt : result.checkedAt,
    errorCode: result.ok ? null : result.errorCode,
    restocked: result.ok && isRestock(previous?.state ?? null, result.observation.state),
  };
}

/** Initial discovery/UNKNOWN is deliberately not described as a restock. */
export function isRestock(previous: StockState | null, next: StockState) {
  return next === "IN_STOCK" && (previous === "OUT_OF_STOCK" || previous === "PREORDER" || previous === "BACKORDER");
}

export function eligibleForAlert(options: {
  observation: InventoryObservation;
  retailerIds: readonly string[];
  maxPriceCents: number | null;
  enabled: boolean;
  paid: boolean;
  lastAlertAt?: Date | null;
  cooldownSeconds: number;
  now: Date;
}) {
  if (!options.enabled || !options.paid || options.observation.state !== "IN_STOCK") return false;
  if (!options.retailerIds.includes(options.observation.retailerId)) return false;
  if (options.maxPriceCents !== null && (options.observation.priceCents === null || options.observation.priceCents > options.maxPriceCents)) return false;
  if (options.lastAlertAt && options.now.getTime() - options.lastAlertAt.getTime() < options.cooldownSeconds * 1000) return false;
  return true;
}

/** Use the persisted event id, not wall-clock time, to make retried enqueues stable. */
export function notificationDedupeKey(eventId: string, userId: string, channel: string) {
  return createHash("sha256").update(`${eventId}:${userId}:${channel}`).digest("hex");
}

export function checkInterval(value: string | undefined, fallback = 300) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.max(60, Math.min(86400, Math.floor(seconds))) : fallback;
}

export function isStale(checkedAt: Date | null, intervalSeconds: number, now = new Date()) {
  return !checkedAt || now.getTime() - checkedAt.getTime() > Math.max(intervalSeconds * 2, 600) * 1000;
}
