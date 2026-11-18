import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, HttpError, readJson } from "@/lib/security";
import { assertRadarOrigin, createLoginToken, createSessionToken, hashToken, radarOrigin, radarSecret, RADAR_COOKIE, rateLimit, verifyLoginToken } from "@/lib/radar/access";
import { assertEmailRecipient, emailReadiness, sendRadarEmail } from "@/lib/radar/email";
import { assertLocalRequest } from "@/lib/radar/local-mode";

export async function POST(request: Request) {
  try {
    assertRadarOrigin(request); radarSecret();
    const emailMode = emailReadiness();
    if (!emailMode.ready) throw new HttpError(503, "Email sign-in is not connected yet. Please check back soon.");
    if (emailMode.mode === "local") assertLocalRequest(request);
    const { email } = await readJson(request, z.object({ email: z.email().max(254).transform(v => v.toLowerCase().trim()) }).strict());
    assertEmailRecipient(email);
    await rateLimit(`login:${email}`, 3, 600);
    const user = await prisma.radarUser.findUnique({ where: { email } });
    if (user) {
      const token = createLoginToken(user.id);
      await prisma.radarUser.update({ where: { id: user.id }, data: { tokenHash: hashToken(token) } });
      await sendRadarEmail({ to: email, subject: "Your Restock Radar sign-in link", text: `Sign in to manage your Restock Radar alerts. This single-use link expires in 10 minutes.\n\n${radarOrigin()}/api/radar/login?token=${encodeURIComponent(token)}\n\nIf you did not request this email, you can ignore it.` }, { idempotencyKey: `radar-login-${hashToken(token)}` });
    }
    return Response.json({ message: emailMode.mode === "local" ? "If this email has an account, a sign-in link was captured in the local inbox at /local-inbox. No email was sent." : "If this email has an account, a secure sign-in link is on its way. Check your inbox and spam folder.", ...(emailMode.mode === "local" ? { localInboxUrl: "/local-inbox" } : {}) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") || "";
    const payload = verifyLoginToken(token);
    if (!payload) throw new HttpError(401, "This sign-in link has expired. Request a new one.");
    const consumed = await prisma.radarUser.updateMany({ where: { id: payload.userId, tokenHash: hashToken(token) }, data: { tokenHash: null } });
    if (consumed.count !== 1) throw new HttpError(401, "This sign-in link has already been used. Request a new one.");
    const response = NextResponse.redirect(`${radarOrigin()}/alerts/manage`, 303);
    response.cookies.set(RADAR_COOKIE, createSessionToken(payload.userId), { httpOnly: true, sameSite: "lax", secure: radarOrigin().startsWith("https:"), path: "/", maxAge: 30 * 86400 });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch { return NextResponse.redirect(`${radarOrigin()}/alerts/manage?login=expired`, 303); }
}
