import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { isCurrentPeriodRefund, processRadarWebhook } from "../src/lib/radar/billing";
import { paymentTerms, verifyPaymentWebhook } from "../src/lib/payments";

afterEach(() => vi.unstubAllEnvs());
const metadata = { radar: "true", userId: "u1", alertId: "a1", planId: "pass" };
function event(id = "evt_paid") { return { id, type: "checkout.session.completed", created: 1800000000, livemode: false, data: { object: { id: "cs_test_1", metadata } } } as unknown as Stripe.Event; }
function harness() {
  const markers = new Set<string>();
  const payments: unknown[] = [];
  const alertUpdates: unknown[] = [];
  const tx = {
    radarWebhookEvent: { create: vi.fn(async ({ data }: { data: { id: string } }) => { if (markers.has(data.id)) throw { code: "P2002" }; markers.add(data.id); }) },
    $queryRaw: vi.fn(async () => []),
    radarAlert: { findUnique: vi.fn(async () => ({ id: "a1", userId: "u1", planId: "pass", checkoutRef: "cs_test_1", caughtAt: null })), update: vi.fn(async (value: unknown) => { alertUpdates.push(value); }) },
    radarSubscription: { upsert: vi.fn(async () => ({ id: "sub_local", currentPeriodEnd: new Date(1801209600000) })) },
    radarPayment: { upsert: vi.fn(async ({ create }: { create: { amountCents: number; refundedCents: number; periodEnd: Date } }) => { payments.push(create); return create; }) },
  };
  const database = { radarWebhookEvent: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => markers.has(where.id) ? { id: where.id } : null) }, $transaction: vi.fn(async (fn: (transaction: typeof tx) => Promise<unknown>) => { const oldMarkers = new Set(markers); const oldPayments = payments.length; const oldUpdates = alertUpdates.length; try { return await fn(tx); } catch (error) { markers.clear(); oldMarkers.forEach(id => markers.add(id)); payments.splice(oldPayments); alertUpdates.splice(oldUpdates); throw error; } }) };
  const charge = { id: "ch_test_1", created: 1800000000, currency: "usd", livemode: false, paid: true, amount: 900, amount_refunded: 0, balance_transaction: { fee: 56 } };
  const stripe = { checkout: { sessions: { retrieve: vi.fn(async () => ({ id: "cs_test_1", metadata, mode: "payment", payment_status: "paid", amount_total: 900, currency: "usd", payment_intent: "pi_test_1", customer: "cus_test_1" })) } }, paymentIntents: { retrieve: vi.fn(async () => ({ status: "succeeded", latest_charge: charge })) } };
  return { database: database as unknown as PrismaClient, stripe: stripe as unknown as Stripe, tx, markers, payments, alertUpdates, stripeMock: stripe };
}

describe("webhook payment idempotency", () => {
  it("records one payment and one activation when Stripe retries the same paid checkout", async () => {
    const h = harness();
    expect(await processRadarWebhook(event(), h.database, h.stripe)).toEqual({ duplicate: false });
    expect(await processRadarWebhook(event(), h.database, h.stripe)).toEqual({ duplicate: true });
    expect(h.payments).toHaveLength(1); expect(h.alertUpdates).toHaveLength(1);
    expect(h.payments[0]).toMatchObject({ amountCents: 900, feeCents: 56, feeRecorded: true, providerRef: "ch_test_1" });
  });
  it("rolls back the event marker if the provider is unavailable, allowing retry", async () => {
    const h = harness();
    h.stripeMock.paymentIntents.retrieve.mockRejectedValueOnce(new Error("temporary outage"));
    await expect(processRadarWebhook(event(), h.database, h.stripe)).rejects.toThrow("temporary outage");
    expect(h.markers.size).toBe(0); expect(h.payments).toHaveLength(0);
    await processRadarWebhook(event(), h.database, h.stripe);
    expect(h.payments).toHaveLength(1);
  });
  it("does not activate unpaid or incorrectly priced checkout sessions", async () => {
    const unpaid = harness();
    unpaid.stripeMock.checkout.sessions.retrieve.mockResolvedValueOnce({ id: "cs_test_1", metadata, mode: "payment", payment_status: "unpaid", amount_total: 900, currency: "usd", payment_intent: "pi_test_1", customer: "cus_test_1" });
    await processRadarWebhook(event(), unpaid.database, unpaid.stripe);
    expect(unpaid.alertUpdates).toHaveLength(0);
    const wrongPrice = harness();
    wrongPrice.stripeMock.checkout.sessions.retrieve.mockResolvedValueOnce({ id: "cs_test_1", metadata, mode: "payment", payment_status: "paid", amount_total: 1, currency: "usd", payment_intent: "pi_test_1", customer: "cus_test_1" });
    await expect(processRadarWebhook(event(), wrongPrice.database, wrongPrice.stripe)).rejects.toThrow("plan does not match");
    expect(wrongPrice.alertUpdates).toHaveLength(0);
  });
  it("verifies the signature against the exact request body", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example"); vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_example");
    const stripe = new Stripe("sk_test_example"); const body = JSON.stringify(event());
    const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_example" });
    expect(verifyPaymentWebhook(body, signature).id).toBe("evt_paid");
    expect(() => verifyPaymentWebhook(`${body} `, signature)).toThrow("Invalid payment signature");
  });
});
describe("refund entitlements", () => {
  it("revokes a fully refunded current period, preserving newer paid renewals", () => {
    const now = new Date("2026-11-01T00:00:00Z"); const later = new Date("2026-12-01T00:00:00Z");
    expect(isCurrentPeriodRefund({ amountCents: 500, refundedCents: 500, periodEnd: now }, now)).toBe(true);
    expect(isCurrentPeriodRefund({ amountCents: 500, refundedCents: 499, periodEnd: now }, now)).toBe(false);
    expect(isCurrentPeriodRefund({ amountCents: 500, refundedCents: 500, periodEnd: now }, later)).toBe(false);
  });
});

describe("purchased pricing snapshots", () => {
  it("keeps purchased price and retailer limit when the public plan changes", () => {
    const purchased = paymentTerms({ priceCents: "500", alertLimit: "2" }, { priceCents: 600, alertLimit: 1 });
    expect(purchased).toEqual({ priceCents: 500, alertLimit: 2 });
    expect(paymentTerms({}, { priceCents: 600, alertLimit: 1 })).toEqual({ priceCents: 600, alertLimit: 1 });
    expect(() => paymentTerms({ priceCents: "NaN", alertLimit: "2" }, { priceCents: 600, alertLimit: 1 })).toThrow();
  });
  it("accepts a paid older-price checkout even when current pass pricing is higher", async () => {
    const h = harness();
    const current = await h.stripeMock.checkout.sessions.retrieve();
    const payment = await h.stripeMock.paymentIntents.retrieve();
    const oldMetadata = { ...metadata, priceCents: "800", alertLimit: "1" };
    h.stripeMock.checkout.sessions.retrieve.mockResolvedValueOnce({ ...current, metadata: oldMetadata, amount_total: 800 });
    h.stripeMock.paymentIntents.retrieve.mockResolvedValueOnce({ ...payment, latest_charge: { ...payment.latest_charge, amount: 800 } });
    await processRadarWebhook(event("evt_older_price"), h.database, h.stripe);
    expect(h.tx.radarSubscription.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ priceCents: 800, alertLimit: 1 }) }));
    expect(h.payments[0]).toMatchObject({ amountCents: 800 });
  });
});
