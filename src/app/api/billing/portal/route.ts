import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getStripe } from "@/lib/billing/stripe";
import { apiError, appOrigin, assertSameOrigin, HttpError } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    if (process.env.DEMO_MODE === "true") throw new HttpError(503, "Billing is disabled in demo mode.");
    const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
    if (!subscription?.stripeCustomerId) throw new HttpError(404, "There is no billing account to manage yet.");
    const portal = await getStripe().billingPortal.sessions.create({ customer: subscription.stripeCustomerId, return_url: `${appOrigin()}/account` });
    return Response.json({ url: portal.url });
  } catch (error) { return apiError(error); }
}
