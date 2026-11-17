import { z } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function appOrigin() {
  return new URL(process.env.BETTER_AUTH_URL || process.env.APP_URL || "http://localhost:3000").origin;
}

export function assertSameOrigin(request: Request) {
  if (request.headers.get("origin") !== appOrigin()) {
    throw new HttpError(403, "This request must come from this website.");
  }
}

export async function readTextLimited(request: Request, limit: number) {
  if (Number(request.headers.get("content-length") || 0) > limit) throw new HttpError(413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new HttpError(413, "Request is too large."); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new HttpError(415, "JSON content is required.");
  const text = await readTextLimited(request, 16_384);
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new HttpError(400, "Invalid JSON."); }
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Please check the submitted values.");
  return parsed.data;
}

export function apiError(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  // Do not expose provider responses, tokens, connection strings, or account data.
  return Response.json({ error: "This service is temporarily unavailable. Please try again later." }, { status: 503 });
}

export function ownerWhere(userId: string) {
  if (!userId) throw new HttpError(401, "Sign in to continue.");
  return { userId };
}

export function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function allowedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" || host.endsWith(".push.services.mozilla.com") || host === "web.push.apple.com" || host.endsWith(".notify.windows.com"));
  } catch { return false; }
}

export const watchInput = z.object({
  retailers: z.array(z.enum(["bestbuy", "nvidia"])).min(1).max(2).transform((value) => [...new Set(value)]),
  maxPriceCents: z.number().int().min(1).max(10_000_000).nullable(),
  emailEnabled: z.boolean(),
  pushEnabled: z.boolean(),
}).strict();

export const pushInput = z.object({
  endpoint: z.string().max(2048).refine(allowedPushEndpoint),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/).min(40).max(200), auth: z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/).min(16).max(100) }).strict(),
}).strict();
