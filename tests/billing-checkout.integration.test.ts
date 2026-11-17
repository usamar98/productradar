import "dotenv/config";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { PrismaClient } from "@prisma/client";
import { createCheckout } from "../src/lib/billing/checkout";

const testUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(testUrl && new URL(testUrl).pathname.endsWith("_test"));
const prefix = `checkout_${Date.now()}`;
let db: PrismaClient;
const user = { id: `${prefix}_user`, email: `${prefix}@example.test` };
const plan = { id: "price_local_checkout", amountCents: 799, testMode: true, origin: "http://localhost:3000" };
const sessions = new Map<string, Stripe.Checkout.Session>();
const keys = new Map<string, Stripe.Checkout.Session>();
let active = false;
let creationCount = 0;
const stripe = {
  prices: { retrieve: async () => ({ id: plan.id, active: true, currency: "usd", unit_amount: 799, recurring: { interval: "month", interval_count: 1 }, livemode: false }) },
  customers: { create: async () => ({ id: `${prefix}_customer` }) },
  subscriptions: { list: async () => ({ data: active ? [{ status: "active" }] : [] }) },
  checkout: { sessions: {
    retrieve: async (id: string) => sessions.get(id),
    list: async () => ({ data: [...sessions.values()].filter(session => session.status === "open") }),
    create: async (params: Stripe.Checkout.SessionCreateParams, options: Stripe.RequestOptions) => {
      const key = options.idempotencyKey!;
      if (keys.has(key)) return keys.get(key);
      const session = { id: `${prefix}_session_${++creationCount}`, status: "open", mode: "subscription", url: `https://checkout.stripe.com/test/${prefix}/${creationCount}`, metadata: params.metadata, expires_at: params.expires_at } as Stripe.Checkout.Session;
      keys.set(key, session); sessions.set(session.id, session);
      return session;
    },
  } },
} as unknown as Stripe;

describe.skipIf(!enabled)("durable checkout reservations with PostgreSQL", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl;
    db = (await import("../src/lib/db")).prisma;
    await db.user.create({ data: { ...user, name: "Checkout test", emailVerified: true } });
    await db.subscription.create({ data: { userId: user.id, stripeCustomerId: `${prefix}_customer` } });
  });
  afterAll(async () => { vi.restoreAllMocks(); if (db) { await db.user.deleteMany({ where: { id: user.id } }); await db.$disconnect(); } });
  it("reuses one session when checkout requests race", async () => {
    const urls = await Promise.all([createCheckout(user, plan, stripe, db), createCheckout(user, plan, stripe, db)]);
    expect(urls[0]).toBe(urls[1]);
    expect(creationCount).toBe(1);
    expect(await db.checkoutAttempt.count({ where: { userId: user.id } })).toBe(1);
  });
  it("reuses the open session across an hour boundary", async () => {
    const original = [...sessions.values()][0];
    const date = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 30 * 60 * 1000);
    try { expect(await createCheckout(user, plan, stripe, db)).toBe(original.url); }
    finally { date.mockRestore(); }
    expect(creationCount).toBe(1);
  });
  it("recovers an external session when saving its ID previously failed", async () => {
    await db.checkoutAttempt.update({ where: { userId: user.id }, data: { sessionId: null } });
    expect(await createCheckout(user, plan, stripe, db)).toBe([...sessions.values()][0].url);
    expect(creationCount).toBe(1);
    expect((await db.checkoutAttempt.findUnique({ where: { userId: user.id } }))?.sessionId).toBe([...sessions.values()][0].id);
  });
  it("does not replace completed sessions while the subscription webhook is pending", async () => {
    [...sessions.values()][0].status = "complete";
    await expect(createCheckout(user, plan, stripe, db)).rejects.toThrow("being processed");
    expect(creationCount).toBe(1);
  });
  it("blocks a second purchase once a paid subscription exists", async () => {
    active = true;
    await expect(createCheckout(user, plan, stripe, db)).rejects.toThrow("already have a subscription");
    expect(creationCount).toBe(1);
  });
  it("allows a new checkout after the old subscription ends and its reservation expires", async () => {
    active = false;
    await db.checkoutAttempt.update({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const url = await createCheckout(user, plan, stripe, db);
    expect(url).not.toBe([...sessions.values()][0].url);
    expect(creationCount).toBe(2);
  });
});
