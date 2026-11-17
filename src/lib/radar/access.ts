import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/security";

export const RADAR_COOKIE = "radar_session";
export function radarOrigin() { return new URL(process.env.APP_URL || "http://localhost:3000").origin; }
export function radarSecret() {
  const secret = process.env.RADAR_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new HttpError(503, "Secure account access is not configured yet.");
  return secret;
}
export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
type SignedPayload = { purpose: "session" | "login" | "click"; userId?: string; alertId?: string; eventId?: string; nonce?: string; exp: number };
function sign(payload: SignedPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", radarSecret()).update(body).digest("base64url")}`;
}
function verify(token: string, purpose: SignedPayload["purpose"], now = Date.now()): SignedPayload | null {
  if (token.length > 2048) return null;
  try {
    const [body, signature, extra] = token.split(".");
    if (!body || !signature || extra) return null;
    const expected = createHmac("sha256", radarSecret()).update(body).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SignedPayload;
    return payload.purpose === purpose && Number.isFinite(payload.exp) && payload.exp > now ? payload : null;
  } catch { return null; }
}
export function createLoginToken(userId: string) { return sign({ purpose: "login", userId, nonce: randomBytes(24).toString("base64url"), exp: Date.now() + 10 * 60_000 }); }
export function verifyLoginToken(token: string) { const p = verify(token, "login"); return p?.userId ? { userId: p.userId } : null; }
export function createSessionToken(userId: string) { return sign({ purpose: "session", userId, exp: Date.now() + 30 * 86400_000 }); }
export function sessionUserId(token: string) { return verify(token, "session")?.userId ?? null; }
export function createClickToken(alertId: string, eventId: string, issuedAt = Date.now()) { return sign({ purpose: "click", alertId, eventId, exp: issuedAt + 30 * 86400_000 }); }
export function verifyClickToken(token: string) { const p = verify(token, "click"); return p?.alertId && p.eventId ? { alertId: p.alertId, eventId: p.eventId } : null; }
export function cookieToken(request: Request) { return request.headers.get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(`${RADAR_COOKIE}=`))?.slice(RADAR_COOKIE.length + 1) ?? ""; }
export async function radarUser(request: Request) {
  const id = sessionUserId(cookieToken(request));
  if (!id) throw new HttpError(401, "Enter your email to get a secure sign-in link.");
  const user = await prisma.radarUser.findUnique({ where: { id } });
  if (!user) throw new HttpError(401, "Your session has expired. Sign in again.");
  return user;
}
export function assertRadarOrigin(request: Request) { if (request.headers.get("origin") !== radarOrigin()) throw new HttpError(403, "This request must come from this website."); }

/** Atomic persistent rate limits work across Vercel instances. Never store raw IP/email. */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const record = await prisma.rateLimit.upsert({ where: { key: `radar:${hashToken(key)}:${bucket}` }, create: { key: `radar:${hashToken(key)}:${bucket}`, count: 1, lastRequest: BigInt(Date.now()) }, update: { count: { increment: 1 }, lastRequest: BigInt(Date.now()) } });
  if (record.count > limit) throw new HttpError(429, "Too many requests. Please try again in a few minutes.");
}
