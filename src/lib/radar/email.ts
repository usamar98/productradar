import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { Resend } from "resend";
import { HttpError } from "@/lib/security";
import { isLocalMailboxEnabled } from "@/lib/radar/local-mode";

export type RadarEmail = { to: string; subject: string; text: string; html?: string };
export type CapturedEmail = { id: string; to: string; subject: string; text: string; createdAt: string };
export const LOCAL_MAILBOX_MAX_MESSAGES = 50;
export const LOCAL_MAILBOX_MAX_BYTES = 64 * 1024;
const retentionMs = 24 * 60 * 60 * 1000;
const filePattern = /^[a-f0-9]{64}\.json$/;

export function emailReadiness(): { ready: boolean; mode: "local" | "resend" | null; message: string } {
  if (isLocalMailboxEnabled()) return { ready: true, mode: "local", message: "Local inbox — messages are captured, not emailed." };
  // An unsafe local-mode configuration must not accidentally send real email.
  if (process.env.RADAR_LOCAL_MAILBOX === "true") return { ready: false, mode: null, message: "Local email capture is available only in development on a loopback address." };
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return { ready: true, mode: "resend", message: "Email delivery is connected." };
  return { ready: false, mode: null, message: "Email delivery is not connected yet." };
}

function mailboxDirectory() {
  const origin = new URL(process.env.APP_URL!).origin;
  return join(process.cwd(), ".local", "mailbox", createHash("sha256").update(origin).digest("hex").slice(0, 16));
}
function fileError(error: unknown, code: string) { return error && typeof error === "object" && "code" in error && error.code === code; }

async function lockedMailbox<T>(operation: (directory: string) => Promise<T>): Promise<T> {
  if (!isLocalMailboxEnabled()) throw new HttpError(404, "Not found.");
  const directory = mailboxDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, ".lock");
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { lock = await open(lockPath, "wx", 0o600); break; }
    catch (error) {
      if (!fileError(error, "EEXIST")) throw error;
      const existing = await stat(lockPath).catch(() => null);
      if (existing && Date.now() - existing.mtimeMs > 30_000) await unlink(lockPath).catch(() => {});
      await setTimeout(20);
    }
  }
  if (!lock) throw new Error("Local inbox is busy. Please retry.");
  try { return await operation(directory); }
  finally { await lock.close(); await unlink(lockPath).catch(() => {}); }
}

async function readMessages(directory: string): Promise<CapturedEmail[]> {
  const messages: CapturedEmail[] = [];
  for (const name of await readdir(directory)) {
    if (!filePattern.test(name)) continue;
    const path = join(directory, name), details = await stat(path).catch(() => null);
    if (!details || !details.isFile()) continue;
    if (details.size > LOCAL_MAILBOX_MAX_BYTES || Date.now() - details.mtimeMs > retentionMs) { await unlink(path); continue; }
    try {
      const value = JSON.parse(await readFile(path, "utf8")) as CapturedEmail;
      if (typeof value.id !== "string" || `${value.id}.json` !== name || typeof value.to !== "string" || typeof value.subject !== "string" || typeof value.text !== "string" || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) { await unlink(path); continue; }
      messages.push(value);
    } catch { await unlink(path).catch(() => {}); }
  }
  return messages.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id));
}

async function captureEmail(message: RadarEmail, idempotencyKey?: string) {
  const id = createHash("sha256").update(idempotencyKey || randomUUID()).digest("hex");
  const captured: CapturedEmail = { id, to: message.to, subject: message.subject, text: message.text, createdAt: new Date().toISOString() };
  const body = JSON.stringify(captured);
  if (message.to.length > 254 || message.subject.length > 500 || Buffer.byteLength(body, "utf8") > LOCAL_MAILBOX_MAX_BYTES) throw new Error("Email exceeds the local inbox size limit.");
  await lockedMailbox(async directory => {
    const messages = await readMessages(directory), previous = messages.find(value => value.id === id);
    if (previous) {
      if (previous.to !== message.to || previous.subject !== message.subject || previous.text !== message.text) throw new Error("Local email idempotency key was reused with different content.");
      return;
    }
    const path = join(directory, `${id}.json`), temporary = join(directory, `.${id}.${randomUUID()}.tmp`);
    // Prune before writing, so the mailbox never exceeds its message cap.
    for (const stale of messages.slice(LOCAL_MAILBOX_MAX_MESSAGES - 1)) await unlink(join(directory, `${stale.id}.json`));
    try {
      const file = await open(temporary, "wx", 0o600);
      try { await file.writeFile(body, "utf8"); await file.sync(); }
      finally { await file.close(); }
      await rename(temporary, path);
    } finally { await unlink(temporary).catch(() => {}); }
  });
  return { id, captured: true };
}

export async function listLocalEmails(): Promise<CapturedEmail[]> {
  return lockedMailbox(async directory => {
    const messages = await readMessages(directory);
    for (const stale of messages.slice(LOCAL_MAILBOX_MAX_MESSAGES)) await unlink(join(directory, `${stale.id}.json`));
    return messages.slice(0, LOCAL_MAILBOX_MAX_MESSAGES);
  });
}

export async function sendRadarEmail(message: RadarEmail, options: { idempotencyKey?: string } = {}): Promise<{ id: string; captured: boolean }> {
  const readiness = emailReadiness();
  if (!readiness.ready) throw new HttpError(503, readiness.message);
  if (readiness.mode === "local") return captureEmail(message, options.idempotencyKey);
  const result = await new Resend(process.env.RESEND_API_KEY!).emails.send({ from: process.env.EMAIL_FROM!, ...message }, options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined);
  if (result.error || !result.data?.id) throw new HttpError(503, "Email provider did not accept the message. Please retry.");
  return { id: result.data.id, captured: false };
}
