import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { billingReadiness } from "@/lib/billing/readiness";
import { getStripe } from "@/lib/billing/stripe";
import { createCheckout } from "@/lib/billing/checkout";
import { PLAN_PRICE_CENTS } from "@/lib/plan";
import { apiError, appOrigin, assertSameOrigin, HttpError } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const readiness = await billingReadiness();
    if (!readiness.checkoutEnabled) throw new HttpError(503, readiness.reason!);
    const url = await createCheckout(user, { id: process.env.STRIPE_PRICE_ID!, amountCents: PLAN_PRICE_CENTS, testMode: readiness.testMode, origin: appOrigin() }, getStripe(), prisma);
    return Response.json({ url });
  } catch (error) { return apiError(error); }
}
