import { prisma } from "@/lib/db";
import { apiError, HttpError, pushInput, readJson } from "@/lib/security";
import { assertRadarOrigin, radarUser, rateLimit } from "@/lib/radar/access";
export async function POST(request: Request) {
  try {
    assertRadarOrigin(request); const user = await radarUser(request);
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) throw new HttpError(503, "Browser push is not connected yet.");
    await rateLimit(`push:${user.id}`, 10, 3600);
    const value = await readJson(request, pushInput);
    const existing = await prisma.radarPushSubscription.findUnique({ where: { endpoint: value.endpoint } });
    if (existing && existing.userId !== user.id) throw new HttpError(409, "This browser is linked to another account. Remove its notification permission before reconnecting.");
    await prisma.radarPushSubscription.upsert({ where: { endpoint: value.endpoint }, create: { userId: user.id, endpoint: value.endpoint, keys: value.keys }, update: { keys: value.keys } });
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request) {
  try { assertRadarOrigin(request); const user = await radarUser(request); await prisma.radarPushSubscription.deleteMany({ where: { userId: user.id } }); return Response.json({ ok: true }); } catch (error) { return apiError(error); }
}
