import { getStripe } from "@/lib/billing/stripe";
import { processStripeEvent } from "@/lib/billing/webhooks";
import { apiError, HttpError, readTextLimited } from "@/lib/security";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.DATABASE_URL || process.env.DEMO_MODE === "true") throw new HttpError(503, "Webhook processing is unavailable.");
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new HttpError(400, "Missing signature.");
    const raw = await readTextLimited(request, 1024 * 1024);
    const stripe = getStripe();
    let event;
    try { event = stripe.webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET); }
    catch { throw new HttpError(400, "Invalid webhook signature."); }
    const expectsLive = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ?? false;
    if (event.livemode !== expectsLive) throw new HttpError(400, "Webhook mode mismatch.");
    const result = await processStripeEvent(event);
    return Response.json({ received: true, ...result });
  } catch (error) { return apiError(error); }
}
