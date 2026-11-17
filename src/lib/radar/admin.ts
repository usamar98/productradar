import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/security";

export const ADMIN_COOKIE = "radar_admin";
const lifetime = 8 * 60 * 60;
function secret() {
  const value = process.env.ADMIN_PASSWORD;
  if (!value || value.length < 16) throw new HttpError(503, "Set ADMIN_PASSWORD to at least 16 characters to enable administration.");
  return value;
}
function equal(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}
export function checkAdminPassword(password: string) { return equal(password, secret()); }
export function adminToken(now = Date.now()) {
  const expires = String(Math.floor(now / 1000) + lifetime);
  return `${expires}.${createHmac("sha256", secret()).update(`radar-admin:${expires}`).digest("hex")}`;
}
export function validAdminToken(token: string, now = Date.now()) {
  try {
    const [expires, signature, extra] = token.split(".");
    if (extra || !expires || !signature || !/^\d+$/.test(expires)) return false;
    if (Number(expires) <= Math.floor(now / 1000) || Number(expires) > Math.floor(now / 1000) + lifetime) return false;
    return equal(signature, createHmac("sha256", secret()).update(`radar-admin:${expires}`).digest("hex"));
  } catch { return false; }
}
export async function isAdmin() { return validAdminToken((await cookies()).get(ADMIN_COOKIE)?.value || ""); }
export async function requireAdmin() { if (!await isAdmin()) throw new HttpError(401, "Sign in to administration first."); }
export async function adminLoginLimit(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `radar-admin:${createHash("sha256").update(ip).digest("hex")}:${Math.floor(Date.now() / 900000)}`;
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimit" (id, key, count, "lastRequest")
    VALUES (${key}, ${key}, 1, ${BigInt(Date.now())})
    ON CONFLICT (key) DO UPDATE SET count = "RateLimit".count + 1
    RETURNING count`;
  if ((rows[0]?.count || 0) > 10) throw new HttpError(429, "Too many sign-in attempts. Try again in 15 minutes.");
}
export async function adminSummary() {
  const since = new Date(Date.now() - 30 * 86400000);
  const now = new Date();
  const [payments, costs, notifications, subscribers, cancellations, sources, items, posts, refundTotal] = await Promise.all([
    prisma.radarPayment.findMany({ where: { OR: [{ createdAt: { gte: since } }, { refundedAt: { gte: since } }] } }),
    prisma.radarCost.findMany({ where: { incurredAt: { gte: since } }, orderBy: { incurredAt: "desc" } }),
    prisma.radarNotification.findMany({ where: { status: "sent", sentAt: { gte: since } }, select: { latencyMs: true } }),
    prisma.radarSubscription.findMany({ where: { status: "active", currentPeriodEnd: { gt: now }, plan: { type: "subscription" } }, select: { userId: true } }),
    prisma.radarSubscription.count({ where: { canceledAt: { gte: since } } }),
    prisma.radarSource.findMany({ include: { item: true, variant: true }, orderBy: [{ item: { name: "asc" } }, { label: "asc" }] }),
    prisma.radarItem.findMany({ include: { variants: true }, orderBy: { name: "asc" } }),
    prisma.radarCustomerPost.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.radarRefund.aggregate({ where: { status: "succeeded", createdAt: { gte: since } }, _sum: { amountCents: true } }),
  ]);
  const revenue = payments.filter(p => p.createdAt >= since).reduce((s, p) => s + p.amountCents, 0);
  const fees = payments.filter(p => p.createdAt >= since).reduce((s, p) => s + p.feeCents, 0);
  const refunds = refundTotal._sum.amountCents || 0;
  const expenses = costs.reduce((s, c) => s + c.amountCents, 0);
  const latency = notifications.flatMap(n => n.latencyMs == null ? [] : [n.latencyMs]).sort((a,b) => a-b);
  const mid = Math.floor(latency.length / 2);
  const median = !latency.length ? null : latency.length % 2 ? latency[mid] : (latency[mid - 1] + latency[mid]) / 2;
  return { metrics: { revenue, fees, refunds, costs: expenses, profit: revenue-fees-refunds-expenses, alertsSent: notifications.length, medianLatencyMs: median, activeSubscribers: new Set(subscribers.map(s => s.userId)).size, cancellations, pendingFees: payments.filter(p => !p.feeRecorded).length }, sources, items, posts, costs };
}
