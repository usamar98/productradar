import Stripe from "stripe";
import { getPlan, type RadarPlanConfig } from "@/config/pricing";
import { HttpError } from "@/lib/security";
import { radarOrigin } from "@/lib/radar/access";

/** Provider boundary: replace this module to use another hosted payment provider. */
export function paymentReadiness() {
  if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) return { ready: false, message: "Checkout is not connected yet. Only Stripe test mode is enabled." };
  if (!process.env.STRIPE_WEBHOOK_SECRET) return { ready: false, message: "Payment confirmation is not connected yet." };
  if (!process.env.RADAR_AUTH_SECRET || process.env.RADAR_AUTH_SECRET.length < 32 || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return { ready: false, message: "Email and secure account access are not connected yet." };
  return { ready: true, message: "Stripe test mode. No real charges." };
}
export function paymentClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_test_")) throw new HttpError(503, "Checkout is not connected yet. Only Stripe test mode is enabled.");
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 });
}
export function objectId(value: string | { id: string } | null | undefined) { return typeof value === "string" ? value : value?.id ?? null; }
export async function createPaymentCheckout(input: { alertId: string; userId: string; email: string; plan: RadarPlanConfig; createdAt: Date; checkoutRef?: string | null }) {
  const ready = paymentReadiness();
  if (!ready.ready) throw new HttpError(503, ready.message);
  if (input.checkoutRef) {
    const existing = await paymentClient().checkout.sessions.retrieve(input.checkoutRef);
    if (!existing.livemode && existing.status === "open" && existing.url) return { id: existing.id, url: existing.url };
    throw new HttpError(409, "This checkout is already complete or expired. Check your alerts or try again after it expires.");
  }
  const metadata = { radar: "true", userId: input.userId, alertId: input.alertId, planId: input.plan.id, priceCents: String(input.plan.priceCents), alertLimit: String(input.plan.alertLimit) };
  const recurring = input.plan.type === "subscription";
  const session = await paymentClient().checkout.sessions.create({
    mode: recurring ? "subscription" : "payment", customer_email: input.email,
    ...(!recurring ? { customer_creation: "always" as const, payment_intent_data: { metadata } } : { subscription_data: { metadata } }),
    client_reference_id: input.alertId, metadata,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: input.plan.priceCents, product_data: { name: `Restock Radar ${input.plan.name}`, description: input.plan.description }, ...(recurring ? { recurring: { interval: "month" as const } } : {}) } }],
    success_url: `${radarOrigin()}/alerts/manage?checkout=success`, cancel_url: `${radarOrigin()}/alerts?checkout=cancelled`,
    // Stable parameters permit safe retry after an ambiguous network failure.
    expires_at: Math.floor(input.createdAt.getTime() / 1000) + 1860,
  }, { idempotencyKey: `radar-checkout-${input.alertId}` });
  if (session.livemode || !session.url) throw new HttpError(503, "A test checkout could not be created.");
  return { id: session.id, url: session.url };
}
export function verifyPaymentWebhook(body: string, signature: string) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, "Payments are not configured.");
  let event: Stripe.Event;
  try { event = paymentClient().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET); } catch { throw new HttpError(400, "Invalid payment signature."); }
  if (event.livemode) throw new HttpError(400, "Live payments are not enabled.");
  return event;
}
export function planFromMetadata(metadata?: Stripe.Metadata | null) { return metadata?.radar === "true" ? getPlan(metadata.planId) : undefined; }

/** Purchase terms are written by our server into Stripe, then read from the
 * canonical Stripe object. Changing current pricing does not alter prior sales. */
export function paymentTerms(metadata: Stripe.Metadata | null | undefined, fallback: { priceCents: number; alertLimit: number }) {
  const priceCents = metadata?.priceCents == null ? fallback.priceCents : Number(metadata.priceCents);
  const alertLimit = metadata?.alertLimit == null ? fallback.alertLimit : Number(metadata.alertLimit);
  if (!Number.isInteger(priceCents) || priceCents < 1 || priceCents > 100_000_000 || !Number.isInteger(alertLimit) || alertLimit < 1 || alertLimit > 10_000) throw new HttpError(400, "Payment plan terms are invalid.");
  return { priceCents, alertLimit };
}
