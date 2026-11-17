import type Stripe from "stripe";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getStripe, objectId } from "./stripe";

const subscriptionEvents = new Set(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed"]);
const invoiceEvents = new Set(["invoice.paid", "invoice.payment_failed", "invoice.voided", "invoice.marked_uncollectible"]);

/** Marker and projections commit atomically. Failed transactions remain retryable. */
export async function processStripeEvent(event: Stripe.Event, database: PrismaClient = prisma, stripe: Stripe = getStripe()) {
  if (await database.stripeEvent.findUnique({ where: { id: event.id } })) return { duplicate: true };
  let subscriptionId: string | null = null;
  let invoice: Stripe.Invoice | null = null;
  let charge: Stripe.Charge | null = null;
  const refunds: Stripe.Refund[] = [];
  const object = event.data.object;
  if (subscriptionEvents.has(event.type)) subscriptionId = (object as Stripe.Subscription).id;
  else if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") subscriptionId = objectId((object as Stripe.Checkout.Session).subscription);
  else if (invoiceEvents.has(event.type)) {
    invoice = await stripe.invoices.retrieve((object as Stripe.Invoice).id, { expand: ["payments"] });
    subscriptionId = objectId(invoice.parent?.subscription_details?.subscription);
  } else if (["charge.refunded", "refund.created", "refund.updated", "refund.failed"].includes(event.type)) {
    const chargeId = event.type === "charge.refunded" ? (object as Stripe.Charge).id : objectId((object as Stripe.Refund).charge);
    if (!chargeId) throw new Error("Refund charge is not available.");
    charge = await stripe.charges.retrieve(chargeId);
    // Exhaust pagination so exports retain individual refund IDs, dates and statuses.
    for await (const refund of stripe.refunds.list({ charge: charge.id, limit: 100 })) refunds.push(refund);
    const customerId = objectId(charge.customer);
    if (customerId) {
      const local = await database.subscription.findUnique({ where: { stripeCustomerId: customerId } });
      if (local && !local.stripeSubscriptionId) throw new Error("Subscription event has not arrived yet; retry the refund event.");
      subscriptionId = local?.stripeSubscriptionId ?? null;
    }
  }
  try {
    return await database.$transaction(async tx => {
      // A unique conflict aborts the transaction before any projection is applied.
      await tx.stripeEvent.create({ data: { id: event.id, type: event.type } });
      if (!subscriptionId) return { duplicate: false, ignored: true };
      await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtextextended(${subscriptionId}, 0))`;
      // Fetch under a per-subscription lock: concurrent events (even in the same second)
      // cannot apply an older API response after a newer projection.
      const remote = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] }, { timeout: 10000, maxNetworkRetries: 0 });
      const customerId = objectId(remote.customer)!;
      const existing = await tx.subscription.findUnique({ where: { stripeCustomerId: customerId } });
      const userId = existing?.userId || remote.metadata.userId;
      if (!userId || !await tx.user.findUnique({ where: { id: userId }, select: { id: true } })) return { duplicate: false, ignored: true };
      if (existing && remote.metadata.userId && remote.metadata.userId !== existing.userId) throw new Error("Subscription owner mismatch.");
      const latestInvoice = typeof remote.latest_invoice === "object" ? remote.latest_invoice : null;
      const latestInvoiceId = objectId(remote.latest_invoice);
      const planItem = remote.items.data.find(item => item.price.id === process.env.STRIPE_PRICE_ID && item.quantity === 1);
      const paid = latestInvoice?.status === "paid" && latestInvoice.amount_paid > 0;
      let status: string = remote.status;
      if (!planItem || remote.items.data.length !== 1) status = "inactive";
      else if (status === "active" && !paid) status = "past_due";
      const canProject = !existing || event.created >= existing.lastEventCreated;
      if (canProject) {
        const data = {
          stripeCustomerId: customerId, stripeSubscriptionId: remote.id, status,
          currentPeriodEnd: planItem?.current_period_end ? new Date(planItem.current_period_end * 1000) : null,
          cancelAtPeriodEnd: remote.cancel_at_period_end,
          lastEventCreated: event.created,
        };
        await tx.subscription.upsert({ where: { userId }, create: { userId, ...data }, update: data });
      }
      if (invoice && invoice.status === "paid" && invoice.amount_paid > 0) {
        const paymentIntentId = objectId(invoice.payments?.data.find(payment => payment.status === "paid" && payment.payment.type === "payment_intent")?.payment.payment_intent);
        const attribution = await tx.attribution.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
        const payment = await tx.payment.upsert({
          where: { id: invoice.id },
          create: { id: invoice.id, userId, stripeCustomerId: customerId, stripePaymentIntentId: paymentIntentId, amountCents: invoice.amount_paid, currency: invoice.currency, status: "paid", paidAt: new Date((invoice.status_transitions.paid_at || event.created) * 1000), attributionId: attribution?.id },
          update: { stripePaymentIntentId: paymentIntentId },
        });
        // Only a different, successfully paid invoice restores access after a refund.
        if (invoice.id === latestInvoiceId && payment.refundedCents < payment.amountCents && canProject) await tx.subscription.update({ where: { userId }, data: { refundedAt: null } });
      }
      if (charge) {
        const paymentIntentId = objectId(charge.payment_intent);
        const payment = paymentIntentId ? await tx.payment.findUnique({ where: { stripePaymentIntentId: paymentIntentId } }) : null;
        if (!payment) throw new Error("Invoice payment has not arrived yet; retry the refund event.");
        for (const refund of refunds) {
          const recorded = await tx.refund.findUnique({ where: { id: refund.id } });
          const terminal = recorded && ["succeeded", "failed", "canceled"].includes(recorded.status);
          await tx.refund.upsert({
            where: { id: refund.id },
            create: { id: refund.id, paymentId: payment.id, amountCents: refund.amount, currency: refund.currency, status: refund.status || "unknown", createdAt: new Date(refund.created * 1000) },
            update: terminal ? {} : { status: refund.status || "unknown" },
          });
        }
        const completedRefunds = await tx.refund.aggregate({ where: { paymentId: payment.id, status: "succeeded" }, _sum: { amountCents: true } });
        const refundedCents = completedRefunds._sum.amountCents ?? 0;
        const fullRefund = refundedCents >= payment.amountCents;
        await tx.payment.update({ where: { id: payment.id }, data: { refundedCents, status: fullRefund ? "refunded" : refundedCents > 0 ? "partially_refunded" : "paid" } });
        if (fullRefund && payment.id === latestInvoiceId) await tx.subscription.update({ where: { userId }, data: { refundedAt: new Date(event.created * 1000) } });
      }
      return { duplicate: false };
    }, { timeout: 20000, maxWait: 15000 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002" && await database.stripeEvent.findUnique({ where: { id: event.id } })) return { duplicate: true };
    throw error;
  }
}
