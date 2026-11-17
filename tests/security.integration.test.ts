import "dotenv/config";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
const captured = vi.hoisted(() => ({ messages: [] as { to: string; text: string }[] }));
vi.mock("resend", () => ({ Resend: class { emails = { send: async (message: { to: string; text: string }) => { captured.messages.push(message); return { data: { id: "local-test-message" }, error: null }; } }; } }));
const testUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(testUrl && new URL(testUrl).pathname.endsWith("_test"));
const prefix = `security_${Date.now()}`;
let db: PrismaClient;
let auth: ReturnType<typeof import("../src/lib/auth").getAuth>;
let updateWatch: typeof import("../src/app/api/watch/route").PUT;
let dashboard: typeof import("../src/app/api/dashboard/route").GET;
let userA: { id: string; cookie: string };
let userB: { id: string; cookie: string };

function request(path: string, cookie = "", body?: object) {
  return new Request(`http://localhost:3000${path}`, { method: body ? "PUT" : "GET", headers: { origin: "http://localhost:3000", cookie, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
}

async function signIn(email: string) {
  const sent = await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/magic-link", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: JSON.stringify({ email, name: "Integration test", callbackURL: "/dashboard" }) }));
  expect(sent.status).toBe(200);
  const message = captured.messages.find(value => value.to === email)!;
  expect(message).toBeDefined();
  const url = message.text.match(/https?:\/\/\S+/)?.[0];
  expect(url).toBeTruthy();
  const verified = await auth.handler(new Request(url!, { headers: { origin: "http://localhost:3000" } }));
  expect([200, 302]).toContain(verified.status);
  const cookie = verified.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  expect(session?.user.emailVerified).toBe(true);
  // The one-time token is consumed and cannot create another authenticated session.
  const replay = await auth.handler(new Request(url!));
  expect(replay.headers.getSetCookie().some(value => value.includes("session_token=") && !value.includes("Max-Age=0"))).toBe(false);
  return { id: session!.user.id, cookie };
}

describe.skipIf(!enabled)("email authentication and private routes with PostgreSQL", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl;
    process.env.BETTER_AUTH_SECRET = "local-integration-secret-only-not-for-production-123456";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    process.env.RESEND_API_KEY = "re_local_integration_only";
    process.env.EMAIL_FROM = "GPU Stock Watch <test@example.test>";
    process.env.DEMO_MODE = "false";
    process.env.BESTBUY_USAGE_APPROVED = "false";
    db = (await import("../src/lib/db")).prisma;
    await db.rateLimit.deleteMany();
    auth = (await import("../src/lib/auth")).getAuth();
    updateWatch = (await import("../src/app/api/watch/route")).PUT;
    dashboard = (await import("../src/app/api/dashboard/route")).GET;
    // Request handlers using next/headers need a request context; the cookie is optional attribution only.
  });
  afterAll(async () => {
    if (!db) return;
    const ids = [userA?.id, userB?.id].filter(Boolean) as string[];
    await db.notificationJob.deleteMany({ where: { userId: { in: ids } } });
    await db.stockEvent.deleteMany({ where: { retailerId: prefix } });
    await db.inventoryObservation.deleteMany({ where: { retailerId: prefix } });
    await db.retailer.deleteMany({ where: { id: prefix } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  it("verifies single-use emailed links and creates independent secure sessions", async () => {
    userA = await signIn(`${prefix}_a@example.test`);
    userB = await signIn(`${prefix}_b@example.test`);
    expect(userA.id).not.toBe(userB.id);
  });
  it("requires authentication, rejects supplied owner IDs, and updates only the signed-in watch", async () => {
    const values = { retailers: ["bestbuy"], maxPriceCents: 250000, emailEnabled: true, pushEnabled: false };
    expect((await updateWatch(request("/api/watch", "", values))).status).toBe(401);
    expect((await updateWatch(request("/api/watch", userA.cookie, { ...values, userId: userB.id }))).status).toBe(400);
    expect((await updateWatch(request("/api/watch", userB.cookie, { ...values, maxPriceCents: 200000 }))).status).toBe(200);
    expect((await updateWatch(request(`/api/watch?userId=${userB.id}`, userA.cookie, values))).status).toBe(200);
    expect((await db.watch.findUnique({ where: { userId: userB.id } }))?.maxPriceCents).toBe(200000);
    expect((await db.watch.findUnique({ where: { userId: userA.id } }))?.maxPriceCents).toBe(250000);
  });
  it("returns only the authenticated account's alert history even with a forged user query", async () => {
    await db.retailer.create({ data: { id: prefix, name: "Local test fixture", sourceUrl: "https://www.bestbuy.com/", productIdentifier: "test-only" } });
    const observation = await db.inventoryObservation.create({ data: { retailerId: prefix, productIdentifier: "test-only", sourceUrl: "https://www.bestbuy.com/", state: "IN_STOCK", priceCents: 199999, checkedAt: new Date(), evidence: { testOnly: true } } });
    const event = await db.stockEvent.create({ data: { retailerId: prefix, observationId: observation.id } });
    const own = await db.notificationJob.create({ data: { userId: userA.id, eventId: event.id, channel: "email" } });
    const other = await db.notificationJob.create({ data: { userId: userB.id, eventId: event.id, channel: "email" } });
    const response = await dashboard(request(`/api/dashboard?userId=${userB.id}`, userA.cookie));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.user.id).toBe(userA.id);
    expect(data.alerts.map((alert: { id: string }) => alert.id)).toContain(own.id);
    expect(data.alerts.map((alert: { id: string }) => alert.id)).not.toContain(other.id);
  });
});
