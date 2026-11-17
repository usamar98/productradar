import type Stripe from "stripe";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PASS_DAYS, getPlan } from "@/config/pricing";
import { objectId, paymentClient, paymentTerms, planFromMetadata } from "@/lib/payments";

type Transaction = Prisma.TransactionClient;
const subscriptionEvents = new Set(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed"]);
const invoiceEvents = new Set(["invoice.paid", "invoice.payment_failed", "invoice.voided", "invoice.marked_uncollectible"]);
const chargeEvents = new Set(["charge.refunded", "charge.updated", "refund.created", "refund.updated", "refund.failed"]);

export function isCurrentPeriodRefund(payment: { amountCents: number; refundedCents: number; periodEnd: Date | null }, periodEnd: Date | null) {
  return payment.amountCents > 0 && payment.refundedCents >= payment.amountCents && !!payment.periodEnd && !!periodEnd && payment.periodEnd >= periodEnd;
}

async function paidCharge(stripe: Stripe, paymentIntent: string | Stripe.PaymentIntent | null | undefined) {
  const id = objectId(paymentIntent);
  if (!id) throw new Error("A confirmed payment is not available yet; retry this webhook.");
  const intent = await stripe.paymentIntents.retrieve(id, { expand: ["latest_charge.balance_transaction"] });
  if (intent.status !== "succeeded" || !intent.latest_charge) throw new Error("Payment has not settled yet.");
  return typeof intent.latest_charge === "object" ? intent.latest_charge : stripe.charges.retrieve(intent.latest_charge, { expand: ["balance_transaction"] });
}

async function recordPayment(tx: Transaction, charge: Stripe.Charge, userId: string, subscriptionId: string, periodEnd: Date | null) {
  if (charge.livemode || charge.currency !== "usd" || !charge.paid) throw new Error("Only confirmed USD test charges are supported.");
  const balance = typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
  const fees = balance ? { feeCents: balance.fee, feeRecorded: true } : {};
  return tx.radarPayment.upsert({ where: { providerRef: charge.id }, create: { userId, subscriptionId, providerRef: charge.id, amountCents: charge.amount, refundedCents: charge.amount_refunded, periodEnd, createdAt: new Date(charge.created * 1000), ...fees }, update: { refundedCents: charge.amount_refunded, ...fees } });
}

async function recordRefunds(tx: Transaction, stripe: Stripe, charge: Stripe.Charge, paymentId: string) {
  // Individual immutable dates avoid counting an old partial refund again when a
  // later partial refund or a charge metadata update arrives.
  let latestRefundAt: Date | null = null;
  for await (const refund of stripe.refunds.list({ charge: charge.id, limit: 100 })) {
    const createdAt = new Date(refund.created * 1000);
    const existing = await tx.radarRefund.findUnique({ where: { id: refund.id } });
    const terminal = existing && ["succeeded", "failed", "canceled"].includes(existing.status);
    await tx.radarRefund.upsert({ where: { id: refund.id }, create: { id: refund.id, paymentId, amountCents: refund.amount, status: refund.status || "pending", createdAt }, update: terminal ? {} : { status: refund.status || "pending" } });
    if (refund.status === "succeeded" && (!latestRefundAt || createdAt > latestRefundAt)) latestRefundAt = createdAt;
  }
  if (latestRefundAt) await tx.radarPayment.update({ where: { id: paymentId }, data: { refundedAt: latestRefundAt } });
}

async function invoiceCharge(stripe: Stripe, invoiceId: string) {
  const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ["payments"] });
  if (invoice.status !== "paid" || invoice.amount_paid <= 0) return null;
  const intent = invoice.payments?.data.find(p => p.status === "paid" && p.payment.type === "payment_intent")?.payment.payment_intent;
  return paidCharge(stripe, intent);
}

/** All projection writes and the event marker share one transaction. */
export async function processRadarWebhook(event: Stripe.Event, database: PrismaClient = prisma, stripe: Stripe = paymentClient()) {
  if (event.livemode) throw new Error("Live payments are disabled.");
  if (await database.radarWebhookEvent.findUnique({ where: { id: event.id } })) return { duplicate: true };
  try {
    return await database.$transaction(async tx => {
      await tx.radarWebhookEvent.create({ data: { id: event.id, type: event.type } });
      const incoming = event.data.object;
      let remoteId: string | null = null;
      let checkout: Stripe.Checkout.Session | null = null;
      let invoice: Stripe.Invoice | null = null;
      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        const candidate = incoming as Stripe.Checkout.Session;
        if (!planFromMetadata(candidate.metadata)) return { duplicate: false, ignored: true };
        checkout = await stripe.checkout.sessions.retrieve(candidate.id);
        if (checkout.livemode || checkout.payment_status !== "paid") return { duplicate: false, ignored: true };
        remoteId = objectId(checkout.subscription);
      } else if (subscriptionEvents.has(event.type)) {
        const candidate = incoming as Stripe.Subscription;
        if (!planFromMetadata(candidate.metadata)) return { duplicate: false, ignored: true };
        remoteId = candidate.id;
      } else if (invoiceEvents.has(event.type)) {
        invoice = await stripe.invoices.retrieve((incoming as Stripe.Invoice).id, { expand: ["payments"] });
        remoteId = objectId(invoice.parent?.subscription_details?.subscription);
      } else if (chargeEvents.has(event.type)) {
        const chargeId = event.type.startsWith("charge.") ? (incoming as Stripe.Charge).id : objectId((incoming as Stripe.Refund).charge);
        if (!chargeId) return { duplicate: false, ignored: true };
        await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtextextended(${`radar-charge:${chargeId}`}, 0))`;
        const charge = await stripe.charges.retrieve(chargeId, { expand: ["balance_transaction"] });
        const existing = await tx.radarPayment.findUnique({ where: { providerRef: charge.id } });
        if (!existing) {
          const customerRef = objectId(charge.customer);
          const known = customerRef ? await tx.radarSubscription.findFirst({ where: { customerRef } }) : null;
          const intentId = objectId(charge.payment_intent);
          const intent = intentId ? await stripe.paymentIntents.retrieve(intentId) : null;
          if (known || intent?.metadata.radar === "true") throw new Error("Payment projection has not arrived yet; retry this webhook.");
          return { duplicate: false, ignored: true };
        }
        if (!existing.subscriptionId) throw new Error("Payment subscription is missing.");
        const payment = await recordPayment(tx, charge, existing.userId, existing.subscriptionId, existing.periodEnd);
        await recordRefunds(tx, stripe, charge, payment.id);
        const subscription = await tx.radarSubscription.findUnique({ where: { id: existing.subscriptionId } });
        if (subscription && isCurrentPeriodRefund(payment, subscription.currentPeriodEnd)) {
          await tx.radarSubscription.update({ where: { id: subscription.id }, data: { status: "refunded" } });
          await tx.radarAlert.updateMany({ where: { subscriptionId: subscription.id, status: { in: ["active", "inactive"] } }, data: { status: "inactive", activeUntil: new Date() } });
        }
        return { duplicate: false };
      } else if (event.type === "checkout.session.expired") {
        const session = incoming as Stripe.Checkout.Session;
        if (planFromMetadata(session.metadata)) await tx.radarAlert.updateMany({ where: { id: session.metadata!.alertId, status: "pending" }, data: { status: "expired" } });
        return { duplicate: false };
      } else return { duplicate: false, ignored: true };

      if (checkout && checkout.mode === "payment") {
        const plan = planFromMetadata(checkout.metadata);
        if (!plan || plan.type !== "one_time_pass") throw new Error("Checkout plan does not match.");
        const terms = paymentTerms(checkout.metadata, plan);
        if (checkout.amount_total !== terms.priceCents || checkout.currency !== "usd") throw new Error("Checkout plan does not match.");
        const alertId = checkout.metadata!.alertId;
        await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtextextended(${`radar-alert:${alertId}`}, 0))`;
        const alert = await tx.radarAlert.findUnique({ where: { id: alertId } });
        if (!alert || alert.userId !== checkout.metadata!.userId || alert.planId !== plan.id || (alert.checkoutRef && alert.checkoutRef !== checkout.id)) throw new Error("Checkout owner mismatch.");
        const charge = await paidCharge(stripe, checkout.payment_intent);
        const periodEnd = new Date((charge.created + PASS_DAYS * 86400) * 1000);
        const refunded = charge.amount_refunded >= charge.amount;
        const subscription = await tx.radarSubscription.upsert({ where: { providerRef: checkout.id }, create: { userId: alert.userId, planId: plan.id, ...terms, providerRef: checkout.id, customerRef: objectId(checkout.customer), status: refunded ? "refunded" : "active", currentPeriodEnd: periodEnd, lastEventCreated: event.created }, update: {} });
        const payment = await recordPayment(tx, charge, alert.userId, subscription.id, periodEnd);
        if (charge.amount_refunded > 0) await recordRefunds(tx, stripe, charge, payment.id);
        const active = alert.status !== "paused" && !alert.caughtAt && !isCurrentPeriodRefund(payment, periodEnd) && periodEnd > new Date();
        // Distinct Stripe success events for the same Checkout are common. They
        // must not undo a customer's later pause or a completed until-caught pass.
        await tx.radarAlert.update({ where: { id: alert.id }, data: { checkoutRef: checkout.id, subscriptionId: subscription.id, status: alert.status === "paused" ? "paused" : active ? "active" : "expired", activeUntil: alert.status === "paused" || alert.caughtAt ? alert.activeUntil : periodEnd } });
        return { duplicate: false };
      }

      if (!remoteId) return { duplicate: false, ignored: true };
      await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtextextended(${`radar-subscription:${remoteId}`}, 0))`;
      // Fetch under the lock so out-of-order snapshots cannot overwrite current state.
      const remote = await stripe.subscriptions.retrieve(remoteId, { expand: ["latest_invoice"] });
      const plan = planFromMetadata(remote.metadata);
      if (!plan || plan.type !== "subscription") return { duplicate: false, ignored: true };
      const terms = paymentTerms(remote.metadata, plan);
      const item = remote.items.data[0];
      if (remote.livemode || remote.items.data.length !== 1 || item.quantity !== 1 || item.price.unit_amount !== terms.priceCents || item.price.currency !== "usd" || item.price.recurring?.interval !== "month") throw new Error("Subscription plan does not match.");
      const alert = await tx.radarAlert.findUnique({ where: { id: remote.metadata.alertId } });
      if (!alert || alert.userId !== remote.metadata.userId || alert.planId !== plan.id) throw new Error("Subscription owner mismatch.");
      const periodEnd = new Date(item.current_period_end * 1000);
      const latestInvoice = typeof remote.latest_invoice === "object" ? remote.latest_invoice : null;
      const latestPaid = latestInvoice?.status === "paid" && latestInvoice.amount_paid > 0;
      const status = remote.status === "active" && !latestPaid ? "past_due" : remote.status;
      const old = await tx.radarSubscription.findUnique({ where: { providerRef: remote.id } });
      const projected = { userId: alert.userId, planId: plan.id, ...terms, customerRef: objectId(remote.customer), status, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: remote.cancel_at_period_end, canceledAt: remote.status === "canceled" ? new Date((remote.canceled_at || event.created) * 1000) : null, lastEventCreated: Math.max(event.created, old?.lastEventCreated ?? 0) };
      const subscription = await tx.radarSubscription.upsert({ where: { providerRef: remote.id }, create: { providerRef: remote.id, ...projected }, update: projected });
      // Record the exact paid invoice in this event, even if a newer period exists.
      const paidInvoiceId = invoice?.status === "paid" ? invoice.id : checkout && latestPaid ? objectId(remote.latest_invoice) : null;
      if (paidInvoiceId) {
        const charge = await invoiceCharge(stripe, paidInvoiceId);
        if (charge) {
          const invoicePeriodEnd = invoice?.lines.data.reduce((max, line) => Math.max(max, line.period.end), 0);
          const payment = await recordPayment(tx, charge, alert.userId, subscription.id, invoicePeriodEnd ? new Date(invoicePeriodEnd * 1000) : periodEnd);
          if (charge.amount_refunded > 0) await recordRefunds(tx, stripe, charge, payment.id);
        }
      }
      const refundedPayment = await tx.radarPayment.findFirst({ where: { subscriptionId: subscription.id, periodEnd: { gte: periodEnd } }, orderBy: { createdAt: "desc" } });
      const refunded = !!refundedPayment && isCurrentPeriodRefund(refundedPayment, periodEnd);
      if (refunded) await tx.radarSubscription.update({ where: { id: subscription.id }, data: { status: "refunded" } });
      const active = status === "active" && !refunded && periodEnd > new Date();
      await tx.radarAlert.update({ where: { id: alert.id }, data: { subscriptionId: subscription.id, ...(checkout ? { checkoutRef: checkout.id } : {}) } });
      await tx.radarAlert.updateMany({ where: { subscriptionId: subscription.id, status: { notIn: ["paused", "expired"] } }, data: { status: active ? "active" : "inactive", activeUntil: active ? periodEnd : new Date() } });
      return { duplicate: false };
    }, { timeout: 60000, maxWait: 15000 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002" && await database.radarWebhookEvent.findUnique({ where: { id: event.id } })) return { duplicate: true };
    throw error;
  }
}
