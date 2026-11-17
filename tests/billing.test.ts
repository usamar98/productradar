import { describe, expect, it } from "vitest";
import { checkoutPolicy, hasPaidAccess, type ReadinessInputs } from "../src/lib/billing/policy";

const now = new Date("2026-11-16T00:00:00Z");
describe("paid access", () => {
  it("requires an active, unexpired paid subscription", () => {
    expect(hasPaidAccess({ status: "active", currentPeriodEnd: "2026-12-01" }, now)).toBe(true);
    for (const status of ["past_due", "canceled", "unpaid", "trialing", "incomplete", "paused"]) expect(hasPaidAccess({ status, currentPeriodEnd: "2026-12-01" }, now)).toBe(false);
    expect(hasPaidAccess({ status: "active", currentPeriodEnd: "2026-11-01" }, now)).toBe(false);
    expect(hasPaidAccess({ status: "active", currentPeriodEnd: "2026-12-01", refundedAt: now }, now)).toBe(false);
  });
});

const ready: ReadinessInputs = { demo: false, stripeSecret: "sk_live_example", stripePrice: "price_example", webhookSecret: "whsec_example", authReady: true, sourceReady: true, notificationsReady: true, liveEnabled: true, authVerified: true, emailVerified: true, pushVerified: true, billingVerified: true, hackathon: false, trafficScript: undefined, trafficVerified: false };
describe("checkout gates", () => {
  it("never bills demo traffic", () => expect(checkoutPolicy({ ...ready, demo: true }).checkoutEnabled).toBe(false));
  it("requires a genuine verified source for live billing", () => expect(checkoutPolicy({ ...ready, sourceReady: false }).checkoutEnabled).toBe(false));
  it("requires operational delivery verification for live billing", () => expect(checkoutPolicy({ ...ready, emailVerified: false }).checkoutEnabled).toBe(false));
  it("requires actual traffic verification in hackathon mode", () => expect(checkoutPolicy({ ...ready, hackathon: true }).checkoutEnabled).toBe(false));
  it("rejects invalid or credential-bearing traffic script URLs", () => {
    for (const trafficScript of ["not-a-url", "http://tracker.example/script.js", "https://secret:password@tracker.example/script.js"]) expect(checkoutPolicy({ ...ready, hackathon: true, trafficVerified: true, trafficScript }).checkoutEnabled).toBe(false);
  });
  it("allows configured Stripe test checkout without claiming a live source", () => expect(checkoutPolicy({ ...ready, stripeSecret: "sk_test_example", sourceReady: false }).checkoutEnabled).toBe(true));
});
