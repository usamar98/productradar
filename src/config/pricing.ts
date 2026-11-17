export const PLANS = [
  { id: "starter", name: "Starter", priceCents: 500, alertLimit: 2, type: "subscription", description: "A little heads-up for your next big find." },
  { id: "plus", name: "Plus", priceCents: 1000, alertLimit: 5, type: "subscription", description: "More retailers. More chances to catch it." },
  { id: "max", name: "Max", priceCents: 2000, alertLimit: 10, type: "subscription", description: "Keep your entire wish list on the radar." },
  { id: "pass", name: "Until caught", priceCents: 900, alertLimit: 1, type: "one_time_pass", description: "One item, one retailer, up to 14 days. No renewal." },
] as const;
export type PlanId = typeof PLANS[number]["id"];
export type RadarPlanConfig = typeof PLANS[number];
export const PASS_DAYS = 14;
export const REFUND_POLICY = "Full refund if no in-stock alert for your item arrives within 14 days of payment. Contact us with the email used at checkout to request your refund.";
export function getPlan(id: string) { return PLANS.find(plan => plan.id === id); }

/** One alert watches an item/variant; its selected retailers also consume slots. */
export function assertPlanLimits(plan: { alertLimit: number }, sourceIds: readonly string[], existingSlots = 0) {
  if (sourceIds.length === 0) throw new Error("Choose at least one retailer.");
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error("Choose each retailer only once.");
  if (!Number.isInteger(existingSlots) || existingSlots < 0 || sourceIds.length + existingSlots > plan.alertLimit) {
    throw new Error(`This plan supports up to ${plan.alertLimit} retailer alerts. Remove a retailer or choose a larger plan.`);
  }
}
