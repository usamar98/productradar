import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, appOrigin, assertSameOrigin, HttpError, readJson } from "@/lib/security";

const campaign = z.string().max(200).nullable().optional();
const inputSchema = z.object({
  consent: z.literal(true),
  utmSource: campaign, utmMedium: campaign, utmCampaign: campaign, utmTerm: campaign, utmContent: campaign,
  referringDomain: z.string().max(253).regex(/^[a-zA-Z0-9.-]+$/).nullable().optional(),
  landingPage: z.string().max(500).regex(/^\/(?!\/)[^?#\s]*$/),
  consentedAt: z.string().optional(),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET || process.env.DEMO_MODE === "true") throw new HttpError(503, "Optional analytics are unavailable.");
    const input = await readJson(request, inputSchema);
    const jar = await cookies();
    if (jar.get("gsw_attribution")) return Response.json({ recorded: false });
    // Configure the deployment proxy to replace, never append untrusted forwarding headers.
    const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const key = `attribution:${createHash("sha256").update(process.env.BETTER_AUTH_SECRET + address).digest("hex")}:${Math.floor(Date.now() / 60000)}`;
    const limit = await prisma.rateLimit.upsert({ where: { key }, create: { key, count: 1, lastRequest: BigInt(Date.now()) }, update: { count: { increment: 1 }, lastRequest: BigInt(Date.now()) } });
    if (limit.count > 10) throw new HttpError(429, "Please try again later.");
    const { consent: _, consentedAt: __, ...values } = input;
    const attribution = await prisma.attribution.create({ data: { ...values, consentedAt: new Date() } });
    jar.set("gsw_attribution", attribution.id, { httpOnly: true, sameSite: "lax", secure: appOrigin().startsWith("https:"), path: "/", maxAge: 60 * 60 * 24 * 30 });
    return Response.json({ recorded: true });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    (await cookies()).delete("gsw_attribution");
    return Response.json({ recorded: false });
  } catch (error) { return apiError(error); }
}
