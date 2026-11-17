import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/security";
import { assertRadarOrigin, RADAR_COOKIE, radarUser } from "@/lib/radar/access";
export async function GET(request: Request) {
  try {
    const user = await radarUser(request);
    const [alerts, subscriptions] = await Promise.all([
      prisma.radarAlert.findMany({ where: { userId: user.id }, include: { item: true, variant: true, subscription: { include: { plan: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.radarSubscription.findMany({ where: { userId: user.id }, include: { plan: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    ]);
    return Response.json({ user: { email: user.email }, alerts: alerts.map(({ tokenHash: _secret, checkoutRef: _checkout, ...alert }) => alert), subscriptions, vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request) {
  try { assertRadarOrigin(request); const response = NextResponse.json({ ok: true }); response.cookies.delete(RADAR_COOKIE); return response; } catch (error) { return apiError(error); }
}
