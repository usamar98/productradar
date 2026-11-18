import { z } from "zod";
import { NextResponse } from "next/server";
import { apiError, HttpError, readJson } from "@/lib/security";
import { assertRadarOrigin, cookieToken, createSessionToken, hashToken, radarOrigin, radarSecret, RADAR_COOKIE, rateLimit, sessionUserId } from "@/lib/radar/access";
import { confirmFreeAlert, requestFreeAlert } from "@/lib/radar/free-alert";
import { assertEmailRecipient, emailReadiness, sendRadarEmail } from "@/lib/radar/email";
import { assertLocalRequest } from "@/lib/radar/local-mode";

const input = z.object({ email: z.email().max(254).transform(value => value.toLowerCase().trim()), itemId: z.string().min(1).max(100), variantId: z.string().min(1).max(100), sourceIds: z.array(z.string().min(1).max(100)).length(1) }).strict();
export async function POST(request: Request) {
  try {
    assertRadarOrigin(request); radarSecret();
    const mode = emailReadiness();
    if (!mode.ready) throw new HttpError(503, "Email verification is not connected yet. Your free alert has not been used.");
    if (mode.mode === "local") assertLocalRequest(request);
    const value = await readJson(request, input);
    assertEmailRecipient(value.email);
    await rateLimit(`free-alert:${value.email}`, 3, 600);
    await rateLimit(`free-alert-ip:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"}`, 15, 600);
    const result = await requestFreeAlert(value, sessionUserId(cookieToken(request)));
    if (result.activated) return Response.json({ url: "/alerts/manage?free=active" }, { headers: { "Cache-Control": "private, no-store" } });
    await sendRadarEmail({ to: value.email, subject: "Confirm your first free Restock Radar alert", text: `Confirm your email to start your free alert for one exact configuration at one retailer or store for 14 days. No card, no automatic renewal. This single-use link expires in 10 minutes.\n\n${radarOrigin()}/alerts/verify-free?token=${encodeURIComponent(result.token)}\n\nIf you did not request this alert, ignore this email. Monitoring will not start.` }, { idempotencyKey: `radar-free-${hashToken(result.token)}` });
    return Response.json({ message: mode.mode === "local" ? "Your verification link is in the local inbox. No email was sent. Open it to activate your free alert." : "Check your email. Confirm the link within 10 minutes to activate your free alert.", ...(mode.mode === "local" ? { localInboxUrl: "/local-inbox" } : {}) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
// Deliberate confirmation prevents email preview scanners from consuming the offer.
export async function PUT(request: Request) {
  try {
    assertRadarOrigin(request);
    const { token } = await readJson(request, z.object({ token: z.string().min(1).max(2048) }).strict());
    const userId = await confirmFreeAlert(token);
    const response = NextResponse.json({ url: "/alerts/manage?free=active" });
    response.cookies.set(RADAR_COOKIE, createSessionToken(userId), { httpOnly: true, sameSite: "lax", secure: radarOrigin().startsWith("https:"), path: "/", maxAge: 30 * 86400 });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return apiError(error); }
}
