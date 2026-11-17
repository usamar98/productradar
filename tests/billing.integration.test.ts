import "dotenv/config";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import type { PrismaClient } from "@prisma/client";
import { hasPaidAccess } from "../src/lib/billing/policy";

vi.mock("server-only", () => ({}));
const testUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(testUrl && new URL(testUrl).pathname.endsWith("_test"));
let db: PrismaClient;
let processEvent: typeof import("../src/lib/billing/webhooks").processStripeEvent;
let webhook: typeof import("../src/app/api/billing/webhook/route").POST;
const prefix = `billing_${Date.now()}`;
const userId = `${prefix}_user`;
const customerId = `${prefix}_customer`;
const subId = `${prefix}_subscription`;
let remote: Stripe.Subscription;
let invoice: Stripe.Invoice;
let charge: Stripe.Charge;
let refunds: Stripe.Refund[] = [];
const fakeStripe = {
  subscriptions: { retrieve: vi.fn(async () => remote) },
  invoices: { retrieve: vi.fn(async () => invoice) },
  charges: { retrieve: vi.fn(async () => charge) },
  refunds: { list: () => ({ async *[Symbol.asyncIterator]() { for (const refund of refunds) yield refund; } }) },
} as unknown as Stripe;

function event(id: string, type: Stripe.Event.Type, object: object, created: number): Stripe.Event {
  return { id: `${prefix}_${id}`, type, data: { object }, created, livemode: false, object: "event", api_version: "2026-10-28", pending_webhooks: 1, request: null } as unknown as Stripe.Event;
}

describe.skipIf(!enabled)("Stripe projections with PostgreSQL", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl;
    process.env.STRIPE_SECRET_KEY = "sk_test_local_integration_only";
    process.env.STRIPE_PRICE_ID = "price_test_local";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_local_integration_only";
    process.env.DEMO_MODE = "false";
    db = (await import("../src/lib/db")).prisma;
    processEvent = (await import("../src/lib/billing/webhooks")).processStripeEvent;
    webhook = (await import("../src/app/api/billing/webhook/route")).POST;
    await db.user.create({ data: { id: userId, name: "Billing test", email: `${prefix}@example.test`, emailVerified: true } });
    await db.subscription.create({ data: { userId, stripeCustomerId: customerId } });
    invoice = { id: `${prefix}_invoice`, status: "paid", customer: customerId, parent: { subscription_details: { subscription: subId } }, amount_paid: 799, currency: "usd", status_transitions: { paid_at: 1000 }, payments: { data: [{ status: "paid", payment: { type: "payment_intent", payment_intent: `${prefix}_pi` } }] } } as unknown as Stripe.Invoice;
    remote = { id: subId, customer: customerId, status: "active", metadata: { userId }, items: { data: [{ price: { id: "price_test_local" }, quantity: 1, current_period_end: Math.floor(Date.now() / 1000) + 86400 }] }, latest_invoice: invoice, cancel_at_period_end: false } as unknown as Stripe.Subscription;
  });
  afterAll(async () => {
    if (!db) return;
    await db.payment.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.stripeEvent.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("commits paid access and one payment despite duplicate webhook delivery", async () => {
    const paid = event("paid", "invoice.paid", invoice, 1000);
    await processEvent(paid, db, fakeStripe);
    const duplicate = await processEvent(paid, db, fakeStripe);
    expect(duplicate.duplicate).toBe(true);
    expect(await db.payment.count({ where: { userId } })).toBe(1);
    expect(hasPaidAccess(await db.subscription.findUnique({ where: { userId } }))).toBe(true);
  });
  it("handles simultaneous duplicate events atomically", async () => {
    const update = event("concurrent", "customer.subscription.updated", remote, 1001);
    const results = await Promise.all([processEvent(update, db, fakeStripe), processEvent(update, db, fakeStripe)]);
    expect(results.filter(result => result.duplicate)).toHaveLength(1);
    expect(await db.stripeEvent.count({ where: { id: update.id } })).toBe(1);
  });
  it("removes access on failed payment and restores it after a paid renewal", async () => {
    invoice = { ...invoice, id: `${prefix}_invoice_renewal`, status: "open" };
    remote = { ...remote, status: "past_due", latest_invoice: invoice };
    await processEvent(event("failed", "invoice.payment_failed", invoice, 1010), db, fakeStripe);
    expect(hasPaidAccess(await db.subscription.findUnique({ where: { userId } }))).toBe(false);
    invoice = { ...invoice, status: "paid", payments: { data: [{ status: "paid", payment: { type: "payment_intent", payment_intent: `${prefix}_pi_renewal` } }] } } as unknown as Stripe.Invoice;
    remote = { ...remote, status: "active", latest_invoice: invoice };
    await processEvent(event("renewed", "invoice.paid", invoice, 1020), db, fakeStripe);
    expect(hasPaidAccess(await db.subscription.findUnique({ where: { userId } }))).toBe(true);
  });
  it("records partial refunds, revokes full current-period refunds, and survives replay", async () => {
    charge = { id: `${prefix}_charge`, customer: customerId, payment_intent: `${prefix}_pi_renewal`, amount_refunded: 200 } as unknown as Stripe.Charge;
    refunds = [{ id: `${prefix}_refund1`, amount: 200, currency: "usd", status: "succeeded", created: 1030 }] as Stripe.Refund[];
    await processEvent(event("partial_refund", "charge.refunded", charge, 1030), db, fakeStripe);
    expect(hasPaidAccess(await db.subscription.findUnique({ where: { userId } }))).toBe(true);
    charge = { ...charge, amount_refunded: 799 };
    refunds.push({ id: `${prefix}_refund2`, amount: 599, currency: "usd", status: "succeeded", created: 1040 } as Stripe.Refund);
    await processEvent(event("full_refund", "charge.refunded", charge, 1040), db, fakeStripe);
    expect(hasPaidAccess(await db.subscription.findUnique({ where: { userId } }))).toBe(false);
    await processEvent(event("replayed_invoice", "invoice.paid", invoice, 1050), db, fakeStripe);
    expect(hasPaidAccess(await db.subscription.findUnique({ where: { userId } }))).toBe(false);
    expect((await db.payment.findUnique({ where: { id: invoice.id } }))?.refundedCents).toBe(799);
    expect(await db.refund.count({ where: { paymentId: invoice.id } })).toBe(2);
  });
  it("keeps canceled access revoked when an older event arrives late", async () => {
    remote = { ...remote, status: "canceled" };
    await processEvent(event("canceled", "customer.subscription.deleted", remote, 1060), db, fakeStripe);
    await processEvent(event("late", "customer.subscription.updated", { ...remote, status: "active" }, 1005), db, fakeStripe);
    expect((await db.subscription.findUnique({ where: { userId } }))?.status).toBe("canceled");
  });
  it("verifies signatures before accepting a webhook and accepts an exact signed replay safely", async () => {
    const stripe = new Stripe("sk_test_local_integration_only");
    const payload = JSON.stringify(event("signed", "customer.created", { id: customerId }, 1070));
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
    expect((await webhook(new Request("http://localhost:3000/api/billing/webhook", { method: "POST", headers: { "stripe-signature": "invalid" }, body: payload }))).status).toBe(400);
    for (let i = 0; i < 2; i++) expect((await webhook(new Request("http://localhost:3000/api/billing/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload }))).status).toBe(200);
    expect(await db.stripeEvent.count({ where: { id: `${prefix}_signed` } })).toBe(1);
  });
});
