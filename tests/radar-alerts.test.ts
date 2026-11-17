import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPlanLimits, getPlan, PLANS } from "../src/config/pricing";
import { createClickToken, createLoginToken, createSessionToken, sessionUserId, verifyClickToken, verifyLoginToken } from "../src/lib/radar/access";
import { paymentReadiness, paymentClient } from "../src/lib/payments";

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("plan retailer limits", () => {
  it.each(PLANS)("enforces $name's total active retailer slots", plan => {
    expect(() => assertPlanLimits(plan, ["retailer"], plan.alertLimit - 1)).not.toThrow();
    expect(() => assertPlanLimits(plan, ["retailer"], plan.alertLimit)).toThrow("up to");
  });
  it("rejects empty or duplicate retailers and unknown plans", () => {
    expect(() => assertPlanLimits(PLANS[0], [])).toThrow();
    expect(() => assertPlanLimits(PLANS[0], ["same", "same"])).toThrow();
    expect(getPlan("super-admin-unlimited")).toBeUndefined();
  });
});
describe("separate authentication and click capabilities", () => {
  it("keeps retry notification URLs byte-identical for a stable delivery timestamp", () => {
    vi.stubEnv("RADAR_AUTH_SECRET", "a".repeat(48)); vi.useFakeTimers();
    const issuedAt = Date.now();
    const original = createClickToken("alert-one", "event-one", issuedAt);
    vi.advanceTimersByTime(60_000);
    expect(createClickToken("alert-one", "event-one", issuedAt)).toBe(original);
    expect(verifyClickToken(original)).toEqual({ alertId: "alert-one", eventId: "event-one" });
  });
  it("binds a retailer click to the exact alert and event", () => {
    vi.stubEnv("RADAR_AUTH_SECRET", "a".repeat(48));
    const token = createClickToken("alert-one", "event-one");
    expect(verifyClickToken(token)).toEqual({ alertId: "alert-one", eventId: "event-one" });
    expect(verifyClickToken(token.slice(0, -3) + "bad")).toBeNull();
    expect(sessionUserId(token)).toBeNull();
    expect(verifyLoginToken(token)).toBeNull();
  });
  it("rejects an expired email link and prevents link use as a session", () => {
    vi.stubEnv("RADAR_AUTH_SECRET", "b".repeat(48)); vi.useFakeTimers();
    const token = createLoginToken("user-one");
    expect(verifyLoginToken(token)).toEqual({ userId: "user-one" });
    expect(sessionUserId(token)).toBeNull();
    vi.advanceTimersByTime(10 * 60_000 + 1);
    expect(verifyLoginToken(token)).toBeNull();
  });
  it("rejects forgery, wrong secrets, and expired sessions", () => {
    vi.stubEnv("RADAR_AUTH_SECRET", "c".repeat(48)); vi.useFakeTimers();
    const token = createSessionToken("real-owner");
    expect(sessionUserId(token)).toBe("real-owner");
    vi.stubEnv("RADAR_AUTH_SECRET", "d".repeat(48));
    expect(sessionUserId(token)).toBeNull();
    vi.stubEnv("RADAR_AUTH_SECRET", "c".repeat(48)); vi.advanceTimersByTime(31 * 86400_000);
    expect(sessionUserId(token)).toBeNull();
  });
});
describe("payment mode", () => {
  it("rejects a live secret even if every integration is configured", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_never_charge");
    expect(paymentReadiness().ready).toBe(false);
    expect(() => paymentClient()).toThrow("Only Stripe test mode");
  });
});
