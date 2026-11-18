import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const scope = "emails:send";
const grantSchema = z.object({ clientId: z.string().min(1), access: z.string().min(1), refresh: z.string().min(1), expiresAt: z.number().finite() });
type Grant = z.infer<typeof grantSchema>;
const grantPath = () => join(process.cwd(), ".local", "resend-grant.enc");

export function localSenderEnabled() {
  if (process.env.RADAR_RESEND_LOCAL_OAUTH !== "true" || process.env.RADAR_LOCAL_TEST_MODE === "true" ||
      process.env.RADAR_LOCAL_MAILBOX === "true" || process.env.DEMO_MODE === "true" || (process.env.RADAR_AUTH_SECRET?.length ?? 0) < 32) return false;
  try {
    const app = new URL(process.env.APP_URL!), db = new URL(process.env.DATABASE_URL!);
    return ["http:", "https:"].includes(app.protocol) && !app.username && !app.password &&
      ["localhost", "127.0.0.1", "[::1]"].includes(app.hostname) &&
      ["postgresql:", "postgres:"].includes(db.protocol) && !/_test$/.test(decodeURIComponent(db.pathname));
  } catch { return false; }
}

export function localSenderConnected() { return localSenderEnabled() && existsSync(grantPath()); }

function encryptionKey() {
  if (!localSenderEnabled()) throw new Error("Enable local Resend setup in the main loopback app.");
  return Buffer.from(hkdfSync("sha256", process.env.RADAR_AUTH_SECRET!, "", "Restock Radar local Resend grant v1", 32));
}

function seal(grant: Grant) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(grant), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

async function readGrant(): Promise<Grant> {
  const bytes = Buffer.from(await readFile(grantPath(), "utf8"), "base64");
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  const plain = Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]);
  return grantSchema.parse(JSON.parse(plain.toString("utf8")));
}

async function writeGrant(grant: Grant) {
  const encrypted = seal(grant);
  await mkdir(join(process.cwd(), ".local"), { recursive: true, mode: 0o700 });
  const temporary = grantPath() + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temporary, encrypted, { flag: "wx", mode: 0o600 });
    await rename(temporary, grantPath());
  } finally { await unlink(temporary).catch(() => {}); }
}

const tokenResponse = z.object({
  access_token: z.string().min(1), refresh_token: z.string().min(1), expires_in: z.number().int().positive(),
  token_type: z.string().regex(/^bearer$/i), scope: z.literal(scope),
});
async function exchange(clientId: string, fields: Record<string, string>): Promise<Grant> {
  const response = await fetch("https://api.resend.com/oauth/token", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({ client_id: clientId, ...fields }),
  });
  if (!response.ok) throw new Error("Resend declined the authorization (" + response.status + "). Reconnect with npm run email:connect -- --reconnect.");
  const result = tokenResponse.safeParse(await response.json());
  if (!result.success) throw new Error("Resend did not return a send-only grant.");
  const { access_token, refresh_token, expires_in } = result.data;
  return { clientId, access: access_token, refresh: refresh_token, expiresAt: Date.now() + expires_in * 1000 };
}

// The main web server, worker and setup utility share this database and local credential.
// A refresh token rotates after one use, so reload it only after acquiring the same lock.
async function withGrantLock<T>(work: () => Promise<T>): Promise<T> {
  const { prisma } = await import("../db");
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('restock-radar-local-resend-grant'))`;
    return work();
  }, { timeout: 25_000, maxWait: 10_000 });
}

export async function connectLocalSender(clientId: string, code: string, verifier: string, redirectUri: string) {
  if (!localSenderEnabled()) throw new Error("Local Resend setup is disabled.");
  await withGrantLock(async () => writeGrant(await exchange(clientId, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri })));
}

export async function localSenderToken() {
  if (!localSenderConnected()) throw new Error("Connect Resend with npm run email:connect.");
  const grant = await readGrant();
  if (grant.expiresAt > Date.now() + 60_000) return grant.access;
  return withGrantLock(async () => {
    const current = await readGrant();
    if (current.expiresAt > Date.now() + 60_000) return current.access;
    const fresh = await exchange(current.clientId, { grant_type: "refresh_token", refresh_token: current.refresh });
    await writeGrant(fresh);
    return fresh.access;
  });
}
