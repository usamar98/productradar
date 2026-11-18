import webpush from "web-push";
import { prisma } from "../src/lib/db";
import { createClickToken } from "../src/lib/radar/access";
import { canDeliver } from "../src/lib/radar/domain";
import { allowedPushEndpoint } from "../src/lib/security";
import { sendRadarEmail } from "../src/lib/radar/email";
import { isLocalMailboxEnabled } from "../src/lib/radar/local-mode";
import { isLocalTestMode } from "../src/lib/radar/local-test";
import { sourceCanAlert } from "../src/lib/radar/inventory-feed-auth";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const lifetimeMs = 15 * 60_000;

export async function deliverNotification(id: string) {
  const now = new Date(), leaseUntil = new Date(now.getTime() + 60_000);
  const claim = await prisma.radarNotification.updateMany({ where: { id, status: { in: ["pending", "sending"] }, sentAt: null, nextAttemptAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { status: "sending", leaseUntil, attempts: { increment: 1 } } });
  if (!claim.count) return;
  const job = await prisma.radarNotification.findUniqueOrThrow({ where: { id }, include: {
    alert: { include: { user: { include: { pushSubscriptions: true } }, item: true, variant: true, subscription: true, plan: true } },
    stockEvent: { include: { source: true } },
  } });
  const { alert, stockEvent: event } = job, source = event.source;
  const terminal = async (reason: string) => prisma.radarNotification.updateMany({ where: { id, leaseUntil }, data: { status: "failed", lastError: reason, leaseUntil: null } });
  const localFixture = source.connector === "local-test";
  if (localFixture && (!isLocalTestMode() || !isLocalMailboxEnabled() || job.channel !== "email")) {
    await terminal("Local test notifications require the isolated test app and local email capture."); return;
  }
  if (!canDeliver(alert, now) || !alert.sourceIds.includes(source.id) || source.itemId !== alert.itemId || source.variantId !== alert.variantId || event.endedAt || alert.item.hidden || !sourceCanAlert(source) || !source.inStock || source.lastError || !source.lastCheckedAt || now.getTime() - source.lastCheckedAt.getTime() > Math.max(60_000, source.pollSeconds * 3000) || now.getTime() - event.seenAt.getTime() > lifetimeMs) {
    await terminal("Alert no longer eligible or stock evidence expired."); return;
  }
  try {
    const origin = new URL(process.env.APP_URL || "http://localhost:3000").origin;
    // Stable signing time keeps Resend's idempotent request body identical on retry.
    const url = `${origin}/api/radar/click?token=${encodeURIComponent(createClickToken(alert.id, event.id, job.createdAt.getTime()))}`;
    const price = event.priceCents == null ? "Price not reported" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(event.priceCents / 100);
    const title = `${localFixture ? "LOCAL TEST: " : ""}${alert.item.name} is in stock at ${source.label}`;
    const observed = event.seenAt.toISOString().replace("T", " ").slice(0, 19) + " UTC";
    const description = `${alert.variant.label} · ${price}. Observed ${observed}. Stock may sell out before checkout.`;
    if (job.channel === "email") {
      const response = await sendRadarEmail({ to: alert.user.email, subject: title,
        text: `${title}\n${description}\n\nView item: ${url}\n\nManage alerts: ${origin}/alerts/manage\nIndependent service. Not affiliated with product manufacturers or retailers.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px"><p style="color:#66754e;font-weight:bold">RESTOCK RADAR</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><p><a href="${escapeHtml(url)}" style="display:inline-block;background:#c6ef8a;color:#17200c;padding:14px 22px;text-decoration:none;border-radius:8px">View item at ${escapeHtml(source.label)}</a></p><p><a href="${escapeHtml(origin)}/alerts/manage">Manage or pause your alerts</a></p><p style="font-size:12px;color:#666">Independent service. Not affiliated with product manufacturers or retailers.</p></div>`,
      }, { idempotencyKey: `radar-notification-${job.id}` });
      if (response.captured) {
        await prisma.radarNotification.updateMany({ where: { id, leaseUntil }, data: { status: "captured", sentAt: null, latencyMs: null, leaseUntil: null, lastError: null } });
        return;
      }
    } else if (job.channel === "push") {
      const push = alert.user.pushSubscriptions.find((subscription) => subscription.id === job.target);
      if (!push || !allowedPushEndpoint(push.endpoint)) { await terminal("Push subscription is no longer available."); return; }
      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) throw new Error("Browser push is not configured.");
      const keys = push.keys as { p256dh: string; auth: string };
      webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
      try {
        await webpush.sendNotification({ endpoint: push.endpoint, keys }, JSON.stringify({ title, body: description, url, eventId: event.id, notificationId: job.id, tag: `radar-${alert.id}-${event.id}` }), { TTL: 300, timeout: 10_000 });
      } catch (error) {
        if (error && typeof error === "object" && "statusCode" in error && [404, 410].includes(Number(error.statusCode))) {
          await prisma.radarPushSubscription.deleteMany({ where: { id: push.id, userId: alert.userId } });
          await terminal("Browser push subscription expired."); return;
        }
        throw new Error("Browser push provider did not accept the alert.");
      }
    } else { await terminal("Unsupported notification channel."); return; }
    const sentAt = new Date();
    await prisma.radarNotification.updateMany({ where: { id, leaseUntil }, data: { status: "sent", sentAt, latencyMs: Math.min(2_147_483_647, sentAt.getTime() - event.seenAt.getTime()), leaseUntil: null, lastError: null } });
  } catch (error) {
    await prisma.radarNotification.updateMany({ where: { id, leaseUntil }, data: { status: job.attempts >= 8 ? "failed" : "pending", leaseUntil: null,
      nextAttemptAt: new Date(Date.now() + Math.min(120_000, 2000 * 2 ** job.attempts)), lastError: error instanceof Error ? error.message.slice(0, 200) : "Delivery failed.",
    } });
  }
}

export async function deliverPendingNotifications() {
  if (process.env.DEMO_MODE === "true") return;
  const now = new Date();
  const jobs = await prisma.radarNotification.findMany({ where: { status: { in: ["pending", "sending"] }, nextAttemptAt: { lte: now }, sentAt: null, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, orderBy: { createdAt: "asc" }, take: 10, select: { id: true } });
  await Promise.allSettled(jobs.map((job) => deliverNotification(job.id)));
}
