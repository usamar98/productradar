import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { localSenderConnected, localSenderEnabled, localSenderToken, connectLocalSender } from "../src/lib/radar/resend-local";
import { assertEmailRecipient, emailReadiness, sendRadarEmail } from "../src/lib/radar/email";

vi.mock("../src/lib/db", () => ({ prisma: { $transaction: (work: (tx: unknown) => unknown) => work({ $executeRaw: async () => 1 }) } }));
let directory: string;
const grant = { token_type: "Bearer", scope: "emails:send", expires_in: 30, access_token: "fixture-access", refresh_token: "fixture-refresh" };
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "radar-oauth-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(directory);
  for (const [key, value] of Object.entries({ RADAR_RESEND_LOCAL_OAUTH: "true", RADAR_LOCAL_MAILBOX: "false", RADAR_LOCAL_TEST_MODE: "false",
    DEMO_MODE: "false", APP_URL: "http://127.0.0.1:3000", DATABASE_URL: "postgresql://localhost/radar", RADAR_AUTH_SECRET: "fixture".repeat(8),
    RESEND_API_KEY: "", EMAIL_FROM: "onboarding@resend.dev", RADAR_RESEND_TEST_TO: "owner@example.test" })) vi.stubEnv(key, value);
});
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  const target = resolve(directory);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("radar-oauth-test-")) throw new Error("Unexpected temporary directory.");
  await rm(target, { recursive: true, force: true });
});

describe("Resend send-only connection", () => {
  it("encrypts the grant, rotates the refresh token, and sends the owner's email through the SDK", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(grant))
      .mockResolvedValueOnce(Response.json({ ...grant, expires_in: 900, access_token: "renewed-access", refresh_token: "rotated-refresh" }))
      .mockResolvedValueOnce(Response.json({ id: "provider-message-id" }));
    vi.stubGlobal("fetch", fetcher);
    await connectLocalSender("client", "code", "verifier", "http://127.0.0.1/oauth/callback");
    const bytes = await readFile(join(directory, ".local", "resend-grant.enc"), "utf8");
    expect(Buffer.from(bytes, "base64").toString("utf8")).not.toContain("fixture-");
    expect(localSenderConnected()).toBe(true); expect(emailReadiness().mode).toBe("resend");
    expect(await localSenderToken()).toBe("renewed-access");
    expect(fetcher.mock.calls[1][1].body.get("refresh_token")).toBe(grant.refresh_token);
    await expect(sendRadarEmail({ to: "owner@example.test", subject: "Test", text: "Test" }, { idempotencyKey: "test-key" })).resolves.toEqual({ id: "provider-message-id", captured: false });
    const headers = new Headers(fetcher.mock.calls[2][1].headers);
    expect(headers.get("authorization")).toBe("Bearer renewed-access");
    expect(headers.get("idempotency-key")).toBe("test-key");
    expect(() => assertEmailRecipient("another@example.test")).toThrow("account owner's test");
    expect(() => assertEmailRecipient("OWNER@example.test")).not.toThrow();
  });
  it("rejects wider grants, separate test databases and external origins", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...grant, scope: "full_access" })));
    await expect(connectLocalSender("client", "code", "verifier", "http://127.0.0.1/oauth/callback")).rejects.toThrow("send-only");
    expect(localSenderConnected()).toBe(false);
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/radar_local_test"); expect(localSenderEnabled()).toBe(false);
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/radar"); vi.stubEnv("APP_URL", "https://example.test"); expect(localSenderEnabled()).toBe(false);
  });
});
