import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, HttpError, readJson } from "@/lib/security";
import { assertRadarOrigin, radarOrigin, radarUser } from "@/lib/radar/access";
import { paymentClient } from "@/lib/payments";
export async function POST(request: Request) {
  try {
    assertRadarOrigin(request); const user = await radarUser(request);
    const { subscriptionId } = await readJson(request, z.object({ subscriptionId: z.string().min(1).max(100) }).strict());
    const subscription = await prisma.radarSubscription.findFirst({ where: { id: subscriptionId, userId: user.id } });
    if (!subscription?.customerRef) throw new HttpError(404, "Billing account not found.");
    const session = await paymentClient().billingPortal.sessions.create({ customer: subscription.customerRef, return_url: `${radarOrigin()}/alerts/manage`, ...(process.env.STRIPE_PORTAL_CONFIGURATION_ID ? {configuration:process.env.STRIPE_PORTAL_CONFIGURATION_ID} : {}) });
    return Response.json({ url: session.url });
  } catch (error) { return apiError(error); }
}
