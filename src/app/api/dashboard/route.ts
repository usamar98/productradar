import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { billingReadiness } from "@/lib/billing/readiness";
import { hasPaidAccess } from "@/lib/billing/policy";
import { apiError, ownerWhere } from "@/lib/security";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const attributionId = (await cookies()).get("gsw_attribution")?.value;
    if (attributionId) await prisma.attribution.updateMany({ where: { id: attributionId, userId: null }, data: { userId: user.id } });
    const [watch, subscription, jobs, readiness] = await Promise.all([
      prisma.watch.findUnique({ where: ownerWhere(user.id) }),
      prisma.subscription.findUnique({ where: ownerWhere(user.id) }),
      prisma.notificationJob.findMany({ where: ownerWhere(user.id), orderBy: { createdAt: "desc" }, take: 100, include: { event: { include: { observation: true } } } }),
      billingReadiness(),
    ]);
    return Response.json({
      user: { id: user.id, email: user.email, name: user.name },
      watch: watch ? { retailers: watch.retailers, maxPriceCents: watch.maxPriceCents, emailEnabled: watch.emailEnabled, pushEnabled: watch.pushEnabled } : { retailers: ["bestbuy"], maxPriceCents: null, emailEnabled: true, pushEnabled: false },
      subscription: { status: subscription?.status ?? "inactive", currentPeriodEnd: subscription?.currentPeriodEnd ?? null, cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false, hasPaidAccess: hasPaidAccess(subscription), hasCustomer: Boolean(subscription?.stripeCustomerId) },
      alerts: jobs.map(job => ({ id: job.id, retailerId: job.event.retailerId, state: job.event.observation.state, priceCents: job.event.observation.priceCents, status: job.status, createdAt: job.createdAt, observedAt: job.event.observation.checkedAt, deliveredAt: job.deliveredAt, sourceUrl: job.event.observation.sourceUrl, channel: job.channel })),
      readiness,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
