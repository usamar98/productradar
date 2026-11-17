import type Stripe from "stripe";
import type { PrismaClient } from "@prisma/client";
import { HttpError } from "@/lib/security";

type User = { id: string; email: string };
type Plan = { id: string; amountCents: number; testMode: boolean; origin: string };
const requestOptions = { timeout: 8000, maxNetworkRetries: 0 };

export async function createCheckout(user: User, plan: Plan, stripe: Stripe, database: PrismaClient) {
  const price = await stripe.prices.retrieve(plan.id, {}, requestOptions);
  if (!price.active || price.currency !== "usd" || price.unit_amount !== plan.amountCents || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1 || price.livemode === plan.testMode) throw new HttpError(503, "The subscription plan is not configured correctly.");
  let customerId = (await database.subscription.findUnique({ where: { userId: user.id } }))?.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { userId: user.id } }, { ...requestOptions, idempotencyKey: `gsw-customer-${user.id}` });
    customerId = customer.id;
    await database.subscription.upsert({ where: { userId: user.id }, create: { userId: user.id, stripeCustomerId: customerId }, update: { stripeCustomerId: customerId } });
  }
  const result = await database.$transaction(async tx => {
    await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtextextended(${`checkout:${user.id}`}, 0))`;
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 }, requestOptions);
    if (subscriptions.data.some(sub => ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"].includes(sub.status))) throw new HttpError(409, "You already have a subscription. Use Manage billing to update it.");
    const pending = await tx.checkoutAttempt.findUnique({ where: { userId: user.id } });
    if (pending?.sessionId) {
      const session = await stripe.checkout.sessions.retrieve(pending.sessionId, {}, requestOptions);
      if (session.status === "complete" && pending.expiresAt.getTime() > Date.now()) throw new HttpError(409, "Your payment is being processed. Refresh your dashboard shortly.");
      if (session.status === "open" && session.url) {
        if (pending.priceId !== plan.id) throw new HttpError(409, "A previous checkout is still open. Please wait for it to expire before choosing the updated plan.");
        return { url: session.url };
      }
      // An explicitly expired Stripe session is safe to replace, even before its original deadline.
      if (session.status === "expired" || (session.status === "complete" && pending.expiresAt.getTime() <= Date.now())) await tx.checkoutAttempt.delete({ where: { userId: user.id } });
    }
    // Recover a session whose creation succeeded but whose database update did not.
    const openSessions = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 }, requestOptions);
    const open = openSessions.data.find(session => session.mode === "subscription" && session.metadata?.userId === user.id && session.expires_at * 1000 > Date.now());
    if (open?.url) {
      if (open.metadata?.priceId !== plan.id) throw new HttpError(409, "A previous checkout is still open. Please complete or expire it before starting another.");
      if (pending) await tx.checkoutAttempt.updateMany({ where: { userId: user.id }, data: { sessionId: open.id } });
      return { url: open.url };
    }
    const attempt = await tx.checkoutAttempt.findUnique({ where: { userId: user.id } });
    if (attempt && attempt.expiresAt.getTime() > Date.now()) {
      if (attempt.priceId !== plan.id) throw new HttpError(409, "A previous checkout is being prepared. Please try again after it expires.");
      return { attempt };
    }
    if (attempt) await tx.checkoutAttempt.delete({ where: { userId: user.id } });
    const attribution = await tx.attribution.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    return { attempt: await tx.checkoutAttempt.create({ data: { userId: user.id, customerId: customerId!, priceId: plan.id, attributionId: attribution?.id, expiresAt: new Date((Math.floor(Date.now() / 1000) + 3600) * 1000) } }) };
  }, { timeout: 30000, maxWait: 20000 });
  if ("url" in result) return result.url;
  const attempt = result.attempt;
  const metadata = { userId: user.id, priceId: attempt.priceId, ...(attempt.attributionId ? { attributionId: attempt.attributionId } : {}) };
  // The reservation has committed before this external mutation. A crash or a concurrent
  // request reuses its stable key and exact expiry, rather than creating a second session.
  const session = await stripe.checkout.sessions.create({
    mode: "subscription", customer: attempt.customerId, client_reference_id: user.id,
    line_items: [{ price: attempt.priceId, quantity: 1 }], metadata, subscription_data: { metadata },
    expires_at: Math.floor(attempt.expiresAt.getTime() / 1000),
    success_url: `${plan.origin}/dashboard?checkout=success`, cancel_url: `${plan.origin}/dashboard?checkout=canceled`,
    consent_collection: { terms_of_service: "required" },
    custom_text: { submit: { message: "Monthly recurring subscription. Cancel in Manage billing. Alerts do not reserve stock or guarantee a purchase." } },
  }, { ...requestOptions, idempotencyKey: `gsw-checkout-${attempt.id}` });
  if (session.status === "complete") throw new HttpError(409, "Your payment is being processed. Refresh your dashboard shortly.");
  if (!session.url || session.status === "expired") throw new HttpError(409, "This checkout has expired. Please try again.");
  await database.checkoutAttempt.updateMany({ where: { id: attempt.id, userId: user.id }, data: { sessionId: session.id } });
  return session.url;
}
