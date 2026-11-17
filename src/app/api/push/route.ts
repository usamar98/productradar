import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { pushConfigured } from "@/lib/billing/readiness";
import { apiError, assertSameOrigin, HttpError, pushInput, readJson } from "@/lib/security";

export async function GET() {
  return Response.json({ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null, configured: pushConfigured() });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    if (!pushConfigured() || process.env.DEMO_MODE === "true") throw new HttpError(503, "Browser notifications are not configured yet.");
    const input = await readJson(request, pushInput);
    const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: input.endpoint } });
    if (existing && existing.userId !== user.id) throw new HttpError(409, "This browser is linked to another account. Turn off its notifications before linking a new account.");
    if (!existing && await prisma.pushSubscription.count({ where: { userId: user.id } }) >= 10) throw new HttpError(400, "The limit of 10 notification devices has been reached.");
    if (existing) await prisma.pushSubscription.updateMany({ where: { endpoint: input.endpoint, userId: user.id }, data: input.keys });
    else await prisma.pushSubscription.create({ data: { userId: user.id, endpoint: input.endpoint, ...input.keys } });
    return Response.json({ success: true });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const { endpoint } = await readJson(request, z.object({ endpoint: z.string().max(2048) }).strict());
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
    return Response.json({ success: true });
  } catch (error) { return apiError(error); }
}
