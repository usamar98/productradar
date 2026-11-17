import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type Stripe from "stripe";

const url = process.env.TEST_DATABASE_URL;
const enabled = !!url && new URL(url).pathname.endsWith("_test");
if (url && !enabled) throw new Error("An isolated database ending in _test is required.");
const prefix = `radar-billing-${Date.now()}`;
let db: PrismaClient;
let processEvent: typeof import("../src/lib/radar/billing").processRadarWebhook;
let click: typeof import("../src/app/api/radar/click/route").GET;
let portal: typeof import("../src/app/api/radar/portal/route").POST;
let access: typeof import("../src/lib/radar/access");
const metadata = { radar: "true", userId: `${prefix}-user`, alertId: `${prefix}-alert`, planId: "pass" };
const created = Math.floor(Date.now() / 1000);
let charge = { id: `${prefix}-charge`, created, currency: "usd", livemode: false, paid: true, amount: 900, amount_refunded: 0, customer: `${prefix}-customer`, balance_transaction: { fee: 56 } };
let refunds: { id: string; amount: number; status: string; created: number }[] = [];
const fakeStripe = {
  checkout: { sessions: { retrieve: vi.fn(async () => ({ id: `${prefix}-checkout`, metadata, mode: "payment", payment_status: "paid", amount_total: 900, currency: "usd", payment_intent: `${prefix}-intent`, customer: `${prefix}-customer` })) } },
  paymentIntents: { retrieve: vi.fn(async () => ({ status: "succeeded", latest_charge: charge })) },
  charges: { retrieve: vi.fn(async () => charge) },
  refunds: { list: () => ({ async *[Symbol.asyncIterator]() { for (const refund of refunds) yield refund; } }) },
} as unknown as Stripe;
function event(suffix: string, type = "checkout.session.completed", object: unknown = { id: `${prefix}-checkout`, metadata }) { return { id: `${prefix}-${suffix}`, type, created, livemode: false, data: { object } } as Stripe.Event; }

describe.skipIf(!enabled)("Restock Radar PostgreSQL payments and ownership", () => {
  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", url!); vi.stubEnv("RADAR_AUTH_SECRET", "integration-test-secret-".repeat(3)); vi.stubEnv("APP_URL", "http://localhost:3000");
    db = (await import("../src/lib/db")).prisma;
    processEvent = (await import("../src/lib/radar/billing")).processRadarWebhook;
    click = (await import("../src/app/api/radar/click/route")).GET;
    portal = (await import("../src/app/api/radar/portal/route")).POST;
    access = await import("../src/lib/radar/access");
    await db.radarCategory.create({ data: { id: `${prefix}-category`, slug: `${prefix}-category`, name: "Integration fixture" } });
    await db.radarItem.create({ data: { id: `${prefix}-item`, categoryId: `${prefix}-category`, slug: `${prefix}-item`, name: "Fixture item", hidden: true, msrpCents: 100 } });
    await db.radarVariant.create({ data: { id: `${prefix}-variant`, itemId: `${prefix}-item`, slug: "default", label: "Default" } });
    await db.radarSource.create({ data: { id: `${prefix}-source`, itemId: `${prefix}-item`, variantId: `${prefix}-variant`, retailer: "fixture", label: "Fixture", productUrl: "https://example.com/product" } });
    await db.radarStockEvent.create({ data: { id: `${prefix}-stock`, sourceId: `${prefix}-source` } });
    await db.radarPlan.upsert({ where: { id: "pass" }, create: { id: "pass", name: "Until caught", priceCents: 900, alertLimit: 1, type: "one_time_pass" }, update: {} });
    await db.radarUser.createMany({ data: [{ id: metadata.userId, email: `${prefix}@example.test` }, { id: `${prefix}-other`, email: `${prefix}-other@example.test` }] });
    await db.radarAlert.create({ data: { id: metadata.alertId, userId: metadata.userId, itemId: `${prefix}-item`, variantId: `${prefix}-variant`, planId: "pass", sourceIds: [`${prefix}-source`], checkoutRef: `${prefix}-checkout` } });
  });
  afterAll(async () => {
    if (!db) return;
    await db.radarAlert.deleteMany({ where: { userId: { startsWith: prefix } } });
    await db.radarPayment.deleteMany({ where: { userId: { startsWith: prefix } } });
    await db.radarSubscription.deleteMany({ where: { userId: { startsWith: prefix } } });
    await db.radarUser.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.radarStockEvent.deleteMany({ where: { sourceId: `${prefix}-source` } });
    await db.radarSource.deleteMany({ where: { id: `${prefix}-source` } });
    await db.radarVariant.deleteMany({ where: { id: `${prefix}-variant` } });
    await db.radarItem.deleteMany({ where: { id: `${prefix}-item` } });
    await db.radarCategory.deleteMany({ where: { id: `${prefix}-category` } });
    await db.radarWebhookEvent.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.$disconnect(); vi.unstubAllEnvs();
  });
  it("serializes simultaneous duplicates and persists exactly one payment and activation", async () => {
    const results = await Promise.all([processEvent(event("paid"), db, fakeStripe), processEvent(event("paid"), db, fakeStripe)]);
    expect(results.filter(result => result.duplicate)).toHaveLength(1);
    expect(await db.radarPayment.count({ where: { userId: metadata.userId } })).toBe(1);
    const alert = await db.radarAlert.findUniqueOrThrow({ where: { id: metadata.alertId } });
    expect(alert.status).toBe("active"); expect(alert.activeUntil?.getTime()).toBe((created + 14 * 86400) * 1000);
    expect((await db.radarPayment.findFirstOrThrow({ where: { userId: metadata.userId } })).feeCents).toBe(56);
  });
  it("rejects another account's portal and unsigned retailer clicks", async () => {
    const subscription = await db.radarSubscription.findFirstOrThrow({ where: { userId: metadata.userId } });
    const response = await portal(new Request("http://localhost:3000/api/radar/portal", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", cookie: `${access.RADAR_COOKIE}=${access.createSessionToken(`${prefix}-other`)}` }, body: JSON.stringify({ subscriptionId: subscription.id }) }));
    expect(response.status).toBe(404);
    expect((await click(new Request("http://localhost:3000/api/radar/click?token=fake"))).status).toBe(400);
  });
  it("does not resume a paused pass when a distinct checkout success event arrives", async () => {
    const before = await db.radarAlert.findUniqueOrThrow({ where: { id: metadata.alertId } });
    const pausedAt = new Date();
    await db.radarAlert.update({ where: { id: metadata.alertId }, data: { status: "paused", activeUntil: pausedAt } });
    await processEvent(event("late-checkout", "checkout.session.async_payment_succeeded"), db, fakeStripe);
    const paused = await db.radarAlert.findUniqueOrThrow({ where: { id: metadata.alertId } });
    expect(paused.status).toBe("paused"); expect(paused.activeUntil).toEqual(pausedAt);
    expect(await db.radarPayment.count({ where: { userId: metadata.userId } })).toBe(1);
    // Reset this isolated fixture for the independently exercised click path.
    await db.radarAlert.update({ where: { id: metadata.alertId }, data: { status: before.status, activeUntil: before.activeUntil } });
  });
  it("ends a one-time pass once on a signed matching retailer click", async () => {
    const token = access.createClickToken(metadata.alertId, `${prefix}-stock`);
    const request = new Request(`http://localhost:3000/api/radar/click?token=${token}`);
    expect((await click(request)).headers.get("location")).toBe("https://example.com/product");
    const caught = await db.radarAlert.findUniqueOrThrow({ where: { id: metadata.alertId } });
    expect(caught.status).toBe("expired"); expect(caught.caughtAt).toBeInstanceOf(Date);
    expect((await db.radarSubscription.findFirstOrThrow({ where: { userId: metadata.userId } })).status).toBe("expired");
    await click(request);
    expect((await db.radarAlert.findUniqueOrThrow({ where: { id: metadata.alertId } })).caughtAt).toEqual(caught.caughtAt);
    await processEvent(event("after-caught-checkout", "checkout.session.async_payment_succeeded"), db, fakeStripe);
    const stillCaught = await db.radarAlert.findUniqueOrThrow({ where: { id: metadata.alertId } });
    expect(stillCaught.status).toBe("expired"); expect(stillCaught.activeUntil).toEqual(caught.activeUntil);
    expect((await db.radarSubscription.findFirstOrThrow({ where: { userId: metadata.userId } })).status).toBe("expired");
  });
  it("records refund ledger dates once and does not move old refunds into a new window", async () => {
    const refundDate = created - 40 * 86400;
    charge = { ...charge, amount_refunded: 300 };
    refunds = [{ id: `${prefix}-refund1`, amount: 300, status: "succeeded", created: refundDate }];
    await processEvent(event("partial", "charge.refunded", charge), db, fakeStripe);
    charge = { ...charge, amount_refunded: 900 };
    refunds.push({ id: `${prefix}-refund2`, amount: 600, status: "succeeded", created });
    await processEvent(event("full", "charge.refunded", charge), db, fakeStripe);
    await processEvent(event("metadata-update", "charge.updated", charge), db, fakeStripe);
    expect(await db.radarRefund.count({ where: { payment: { userId: metadata.userId } } })).toBe(2);
    const recent = await db.radarRefund.aggregate({ where: { payment: { userId: metadata.userId }, status: "succeeded", createdAt: { gte: new Date((created - 30 * 86400) * 1000) } }, _sum: { amountCents: true } });
    expect(recent._sum.amountCents).toBe(600);
    expect((await db.radarSubscription.findFirstOrThrow({ where: { userId: metadata.userId } })).status).toBe("refunded");
  });
  it("renews a grandfathered monthly price and keeps cancellation despite an old active snapshot", async () => {
    await db.radarPlan.upsert({ where: { id: "starter" }, create: { id: "starter", name: "Starter", priceCents: 500, alertLimit: 2, type: "subscription" }, update: {} });
    const alertId = `${prefix}-monthly-alert`, subscriptionRef = `${prefix}-monthly-sub`;
    await db.radarAlert.create({ data: { id: alertId, userId: metadata.userId, itemId: `${prefix}-item`, variantId: `${prefix}-variant`, planId: "starter", sourceIds: [`${prefix}-source`] } });
    const periodEnd = created + 30 * 86400;
    const invoice = { id: `${prefix}-invoice`, status: "paid", amount_paid: 400, parent: { subscription_details: { subscription: subscriptionRef } }, payments: { data: [{ status: "paid", payment: { type: "payment_intent", payment_intent: `${prefix}-monthly-intent` } }] }, lines: { data: [{ period: { end: periodEnd } }] } };
    let remote = { id: subscriptionRef, status: "active", livemode: false, metadata: { radar: "true", userId: metadata.userId, alertId, planId: "starter", priceCents: "400", alertLimit: "1" }, customer: `${prefix}-customer`, latest_invoice: invoice, cancel_at_period_end: false, canceled_at: null as number | null, items: { data: [{ quantity: 1, current_period_end: periodEnd, price: { unit_amount: 400, currency: "usd", recurring: { interval: "month" } } }] } };
    const monthlyStripe = { subscriptions: { retrieve: async () => remote }, invoices: { retrieve: async () => invoice }, paymentIntents: { retrieve: async () => ({ status: "succeeded", latest_charge: { ...charge, id: `${prefix}-monthly-charge`, amount: 400, amount_refunded: 0, balance_transaction: { fee: 42 } } }) } } as unknown as Stripe;
    await processEvent(event("monthly-paid", "invoice.paid", invoice), db, monthlyStripe);
    const subscription = await db.radarSubscription.findUniqueOrThrow({ where: { providerRef: subscriptionRef } });
    expect(subscription).toMatchObject({ status: "active", priceCents: 400, alertLimit: 1 });
    expect((await db.radarAlert.findUniqueOrThrow({ where: { id: alertId } })).status).toBe("active");
    const oldActiveSnapshot = { ...remote };
    remote = { ...remote, status: "canceled", canceled_at: created };
    await processEvent(event("monthly-canceled", "customer.subscription.deleted", remote), db, monthlyStripe);
    await processEvent(event("monthly-late", "customer.subscription.updated", oldActiveSnapshot), db, monthlyStripe);
    expect((await db.radarSubscription.findUniqueOrThrow({ where: { providerRef: subscriptionRef } })).status).toBe("canceled");
    expect((await db.radarAlert.findUniqueOrThrow({ where: { id: alertId } })).status).toBe("inactive");
  });
});
