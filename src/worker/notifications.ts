import webpush from "web-push";
import { PRODUCT } from "../lib/inventory/types";

export type NotificationMessage = {
  eventId: string;
  jobId: string;
  retailerName: string;
  sourceUrl: string;
  priceCents: number | null;
  checkedAt: Date;
};

export function notificationText(message: NotificationMessage) {
  const price = message.priceCents === null ? "Price unavailable" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(message.priceCents / 100);
  return `${PRODUCT.name}\nRetailer: ${message.retailerName}\nObserved price: ${price}\nChecked: ${message.checkedAt.toISOString()}\nOfficial product page: ${message.sourceUrl}\n\nStock is not reserved. Availability can change before you arrive; an alert does not guarantee a purchase.\nManage your alerts in GPU Stock Watch.`;
}

export class DeliveryError extends Error {
  constructor(public readonly code: string, public readonly permanent = false) { super(code); }
}

export async function sendEmail(message: NotificationMessage, email: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new DeliveryError("EMAIL_NOT_CONFIGURED");
  // Explicit request timeout and provider idempotency keep retries bounded and safe.
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `stock-alert/${message.jobId}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email], subject: `${PRODUCT.name} — stock observed at ${message.retailerName}`, text: notificationText(message) }),
  });
  if (!response.ok) throw new DeliveryError("EMAIL_PROVIDER_REJECTED", response.status >= 400 && response.status < 500 && ![408, 409, 429].includes(response.status));
}

export async function sendPush(message: NotificationMessage, subscription: { endpoint: string; p256dh: string; auth: string }) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) throw new DeliveryError("PUSH_NOT_CONFIGURED");
  try {
    await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({
      eventId: message.eventId, title: `${PRODUCT.name} at ${message.retailerName}`,
      body: notificationText(message), url: message.sourceUrl, tag: message.eventId,
    }), { TTL: 60, urgency: "high", topic: message.eventId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32), timeout: 15000, vapidDetails: { subject, publicKey, privateKey } });
  } catch (error) {
    const code = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 0;
    throw new DeliveryError([404, 410].includes(code) ? "PUSH_ENDPOINT_EXPIRED" : "PUSH_PROVIDER_REJECTED", [400, 401, 403, 404, 410, 413].includes(code));
  }
}
