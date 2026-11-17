import { prisma } from "@/lib/db";
import { apiError, HttpError } from "@/lib/security";
import { verifyClickToken } from "@/lib/radar/access";
export async function GET(request: Request) {
  try {
    const payload = verifyClickToken(new URL(request.url).searchParams.get("token") || "");
    if (!payload) throw new HttpError(400, "This retailer link is invalid or has expired.");
    const [alert, event] = await Promise.all([prisma.radarAlert.findUnique({ where: { id: payload.alertId }, include: { plan: true } }), prisma.radarStockEvent.findUnique({ where: { id: payload.eventId }, include: { source: true } })]);
    if (!alert || !event || !alert.sourceIds.includes(event.sourceId)) throw new HttpError(404, "Retailer link not found.");
    const url = new URL(event.source.productUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new HttpError(400, "Retailer link is unavailable.");
    await prisma.$transaction(async tx => {
      const changed = await tx.radarAlert.updateMany({ where: { id: alert.id, caughtAt: null }, data: { caughtAt: new Date(), ...(alert.plan.type === "one_time_pass" ? { status: "expired", activeUntil: new Date() } : {}) } });
      if (changed.count && alert.plan.type === "one_time_pass" && alert.subscriptionId) {
        await tx.radarSubscription.updateMany({ where: { id: alert.subscriptionId, status: "active" }, data: { status: "expired" } });
      }
    });
    return new Response(null, { status: 303, headers: { Location: url.toString(), "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return apiError(error); }
}
