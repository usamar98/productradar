import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { emailReadiness, listLocalEmails, LOCAL_MAILBOX_MAX_BYTES, LOCAL_MAILBOX_MAX_MESSAGES, sendRadarEmail } from "../src/lib/radar/email";
import { assertLocalRequest, isLocalMailboxEnabled } from "../src/lib/radar/local-mode";
import { isStripeTestKey, paymentClient, paymentReadiness } from "../src/lib/payments";
import { GET as inbox } from "../src/app/api/radar/local-inbox/route";

let workspace: string;
const message = { to: "local@example.test", subject: "Local test message", text: "Plain text <script>not executable</script>" };
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "radar-mail-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(workspace);
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("RADAR_LOCAL_MAILBOX", "true"); vi.stubEnv("APP_URL", "http://127.0.0.1:3001");
  vi.stubEnv("RESEND_API_KEY", ""); vi.stubEnv("EMAIL_FROM", "");
});
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  const target = resolve(workspace);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("radar-mail-test-")) throw new Error("Refusing unsafe test cleanup.");
  await rm(target, { recursive: true, force: true });
});

describe("local mailbox boundary", () => {
  it("requires development, an explicit flag, and a loopback APP_URL", () => {
    expect(isLocalMailboxEnabled()).toBe(true);
    vi.stubEnv("APP_URL", "https://example.com"); expect(isLocalMailboxEnabled()).toBe(false);
    vi.stubEnv("APP_URL", "http://127.0.0.1:3001"); vi.stubEnv("RADAR_LOCAL_MAILBOX", "false"); expect(isLocalMailboxEnabled()).toBe(false);
    vi.stubEnv("RADAR_LOCAL_MAILBOX", "true"); vi.stubEnv("NODE_ENV", "production"); expect(isLocalMailboxEnabled()).toBe(false);
    vi.stubEnv("RESEND_API_KEY", "provider-key"); vi.stubEnv("EMAIL_FROM", "sender@example.test");
    expect(emailReadiness().ready).toBe(false);
  });
  it("requires the exact configured Host and rejects cross-origin reads", async () => {
    const local = new Request("http://127.0.0.1:3001/api/radar/local-inbox", { headers: { host: "127.0.0.1:3001" } });
    expect(() => assertLocalRequest(local)).not.toThrow();
    const wrong = new Request(local.url, { headers: { host: "localhost:3001" } });
    expect(() => assertLocalRequest(wrong)).toThrow("Not found");
    expect((await inbox(wrong)).status).toBe(404);
    const crossOrigin = new Request(local.url, { headers: { host: "127.0.0.1:3001", origin: "https://example.com" } });
    expect((await inbox(crossOrigin)).status).toBe(404);
    const response = await inbox(local);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
  it("cannot read or capture messages in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(sendRadarEmail(message)).rejects.toThrow("only in development");
    await expect(listLocalEmails()).rejects.toThrow("Not found");
  });
});

describe("bounded captured messages", () => {
  it("preserves plain text, omits HTML, and uses idempotent atomic files", async () => {
    const results = await Promise.all([1, 2].map(() => sendRadarEmail({ ...message, html: "<script>never rendered</script>" }, { idempotencyKey: "same-notification" })));
    expect(results[0]).toEqual(results[1]); expect(results[0].captured).toBe(true);
    const messages = await listLocalEmails(); expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe(message.text); expect(messages[0]).not.toHaveProperty("html");
    await expect(sendRadarEmail({ ...message, text: "different" }, { idempotencyKey: "same-notification" })).rejects.toThrow("different content");
  });
  it("caps message bytes and retained message count", async () => {
    await expect(sendRadarEmail({ ...message, text: "x".repeat(LOCAL_MAILBOX_MAX_BYTES) })).rejects.toThrow("size limit");
    for (let index = 0; index <= LOCAL_MAILBOX_MAX_MESSAGES; index++) await sendRadarEmail(message, { idempotencyKey: `fixture-${index}` });
    expect(await listLocalEmails()).toHaveLength(LOCAL_MAILBOX_MAX_MESSAGES);
    const [namespace] = await readdir(join(workspace, ".local", "mailbox"));
    const names = await readdir(join(workspace, ".local", "mailbox", namespace));
    expect(names).toHaveLength(LOCAL_MAILBOX_MAX_MESSAGES);
    expect(names.every(name => /^[a-f0-9]{64}\.json$/.test(name))).toBe(true);
  });
  it("separates local apps by their full origin including port", async () => {
    await sendRadarEmail(message);
    vi.stubEnv("APP_URL", "http://127.0.0.1:3000"); expect(await listLocalEmails()).toHaveLength(0);
    vi.stubEnv("APP_URL", "http://127.0.0.1:3001"); expect(await listLocalEmails()).toHaveLength(1);
  });
});

describe("Stripe test key boundary", () => {
  it("accepts only secret, restricted, and temporary sandbox test prefixes", () => {
    for (const prefix of ["sk_test_", "rk_test_", "rkcs_test_"]) {
      const key = `${prefix}fixture123`; expect(isStripeTestKey(key)).toBe(true);
      vi.stubEnv("STRIPE_SECRET_KEY", key); expect(() => paymentClient()).not.toThrow();
    }
    for (const key of [undefined, "", "sk_live_fixture", "rk_live_fixture", "rkcs_live_fixture", "pk_test_fixture", "other_test_fixture", "sk_test_"]) expect(isStripeTestKey(key)).toBe(false);
  });
  it("allows local capture for readiness without bypassing Stripe or auth", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "rkcs_test_fixture123"); vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture"); vi.stubEnv("RADAR_AUTH_SECRET", "a".repeat(48));
    expect(paymentReadiness().ready).toBe(true);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_fixture"); expect(paymentReadiness().ready).toBe(false);
    vi.stubEnv("STRIPE_SECRET_KEY", "rkcs_test_fixture123"); vi.stubEnv("STRIPE_WEBHOOK_SECRET", ""); expect(paymentReadiness().ready).toBe(false);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture"); vi.stubEnv("RADAR_AUTH_SECRET", ""); expect(paymentReadiness().ready).toBe(false);
  });
});
