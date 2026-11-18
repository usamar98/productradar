import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertPlanLimits, getPlan } from "@/config/pricing";
import { apiError, HttpError, readJson } from "@/lib/security";
import { assertRadarOrigin, cookieToken, rateLimit, sessionUserId } from "@/lib/radar/access";
import { createPaymentCheckout, paymentReadiness } from "@/lib/payments";
import { sourceCanAlert } from "@/lib/radar/inventory-feed-auth";

const input = z.object({ email: z.email().max(254).transform(v => v.toLowerCase().trim()), itemId: z.string().min(1).max(100), variantId: z.string().min(1).max(100), sourceIds: z.array(z.string().min(1).max(100)).min(1).max(10), planId: z.string().min(1).max(30) }).strict();
export async function POST(request: Request) {
  try {
    assertRadarOrigin(request);
    const value = await readJson(request, input);
    const plan = getPlan(value.planId);
    if (!plan) throw new HttpError(400, "Choose a valid plan.");
    try { assertPlanLimits({ alertLimit: 10 }, value.sourceIds); } catch (error) { throw new HttpError(400, (error as Error).message); }
    const ready = paymentReadiness();
    if (!ready.ready) throw new HttpError(503, ready.message);
    await rateLimit(`checkout:${value.email}`, 5, 3600);
    const authenticatedId = sessionUserId(cookieToken(request));
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtextextended(${`radar-checkout:${value.email}`}, 0))`;
      const sources = await tx.radarSource.findMany({ where: { id: { in: value.sourceIds }, itemId: value.itemId, variantId: value.variantId, item: { hidden: false } } });
      if (sources.length !== value.sourceIds.length) throw new HttpError(400, "Choose retailers for the selected item and variant.");
      if (sources.some(source => !sourceCanAlert(source))) throw new HttpError(503, "These retailers are not connected yet. You can browse stock for free while tracking is being set up.");
      const user = await tx.radarUser.upsert({ where: { email: value.email }, create: { email: value.email }, update: {} });
      const existing = await tx.radarSubscription.findFirst({ where: { userId: user.id, plan: { type: { not: "free" } }, status: "active", currentPeriodEnd: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
      if (existing) {
        if (authenticatedId !== user.id) throw new HttpError(401, "Sign in with an email link to add alerts to your existing plan.");
        if (existing.planId !== plan.id) throw new HttpError(409, "Choose your current plan to use its remaining alerts. Manage billing to change plans.");
        const alerts = await tx.radarAlert.findMany({ where: { subscriptionId: existing.id, status: "active", activeUntil: { gt: new Date() } } });
        try { assertPlanLimits({ alertLimit: existing.alertLimit ?? plan.alertLimit }, value.sourceIds, alerts.reduce((sum, a) => sum + a.sourceIds.length, 0)); } catch (error) { throw new HttpError(400, (error as Error).message); }
        const alert = await tx.radarAlert.create({ data: { userId: user.id, itemId: value.itemId, variantId: value.variantId, sourceIds: value.sourceIds, planId: plan.id, subscriptionId: existing.id, activeUntil: existing.currentPeriodEnd, status: "active" } });
        return { alert, user, paid: true };
      }
      try { assertPlanLimits(plan, value.sourceIds); } catch (error) { throw new HttpError(400, (error as Error).message); }
      // A short reservation prevents simultaneous new plans for the same email.
      const pending = await tx.radarAlert.findFirst({ where: { userId: user.id, status: "pending", createdAt: { gt: new Date(Date.now() - 31 * 60_000) } } });
      if (pending) {
        const sameSelection = pending.planId === plan.id && pending.itemId === value.itemId && pending.variantId === value.variantId && pending.sourceIds.length === value.sourceIds.length && pending.sourceIds.every(id => value.sourceIds.includes(id));
        if (sameSelection) return { alert: pending, user, paid: false };
        throw new HttpError(409, "You already have a checkout in progress. Complete it, or try again after 31 minutes.");
      }
      await tx.radarPlan.upsert({ where: { id: plan.id }, create: { id: plan.id, name: plan.name, priceCents: plan.priceCents, alertLimit: plan.alertLimit, type: plan.type }, update: {} });
      const alert = await tx.radarAlert.create({ data: { userId: user.id, itemId: value.itemId, variantId: value.variantId, sourceIds: value.sourceIds, planId: plan.id } });
      return { alert, user, paid: false };
    });
    if (result.paid) return Response.json({ url: "/alerts/manage" });
    const checkout = await createPaymentCheckout({ alertId: result.alert.id, userId: result.user.id, email: result.user.email, plan, createdAt: result.alert.createdAt, checkoutRef: result.alert.checkoutRef });
    await prisma.radarAlert.update({ where: { id: result.alert.id }, data: { checkoutRef: checkout.id } });
    return Response.json({ url: checkout.url });
  } catch (error) { return apiError(error); }
}
