import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  local: false,
  lab: false,
  send: vi.fn(),
  update: vi.fn(),
  find: vi.fn(),
}));
vi.mock("../src/lib/db", () => ({ prisma: { radarNotification: { updateMany: harness.update, findUniqueOrThrow: harness.find } } }));
vi.mock("../src/lib/radar/email", () => ({ sendRadarEmail: harness.send }));
vi.mock("../src/lib/radar/local-mode", () => ({ isLocalMailboxEnabled: () => harness.local }));
vi.mock("../src/lib/radar/local-test", () => ({ isLocalTestMode: () => harness.lab }));
import { deliverNotification } from "../worker/notifications";

function notification(connector = "jsonld", channel = "email") {
  const now = new Date(), until = new Date(Date.now() + 86_400_000);
  return {
    id: "job", channel, target: "email", attempts: 1, createdAt: now,
    alert: { id: "alert", itemId: "item", variantId: "variant", userId: "user", status: "active", activeUntil: until, caughtAt: null, sourceIds: ["source"], plan: { type: "subscription" }, subscription: { status: "active", currentPeriodEnd: until }, user: { email: "local@example.test", pushSubscriptions: [] }, item: { hidden: false, name: "Test item" }, variant: { label: "Test variant" } },
    stockEvent: { id: "event", endedAt: null, seenAt: now, priceCents: 1000, source: { id: "source", itemId: "item", variantId: "variant", connector, status: "active", approved: true, inStock: true, lastError: null, lastCheckedAt: now, pollSeconds: 15, label: "Test source" } },
  };
}

beforeEach(() => {
  vi.clearAllMocks(); harness.local = true; harness.lab = false;
  harness.update.mockResolvedValue({ count: 1 }); harness.send.mockResolvedValue({ id: "capture", captured: true }); harness.find.mockResolvedValue(notification());
  vi.stubEnv("APP_URL", "http://127.0.0.1:3001"); vi.stubEnv("RADAR_AUTH_SECRET", "a".repeat(48));
});
afterEach(() => vi.unstubAllEnvs());

describe("worker local-capture accounting", () => {
  it("records a captured email without a sent timestamp or delivery latency", async () => {
    await deliverNotification("job");
    expect(harness.send).toHaveBeenCalledOnce();
    expect(harness.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "captured", sentAt: null, latencyMs: null }) }));
  });
  it("retains sent accounting for actual provider delivery", async () => {
    harness.send.mockResolvedValue({ id: "provider-message", captured: false });
    await deliverNotification("job");
    expect(harness.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "sent", sentAt: expect.any(Date) }) }));
  });
  it("does not send a synthetic local notification outside the isolated lab", async () => {
    harness.find.mockResolvedValue(notification("local-test"));
    await deliverNotification("job");
    expect(harness.send).not.toHaveBeenCalled();
    expect(harness.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }));
  });
  it("does not send a local fixture by a real provider or browser push", async () => {
    harness.lab = true; harness.local = false; harness.find.mockResolvedValue(notification("local-test"));
    await deliverNotification("job"); expect(harness.send).not.toHaveBeenCalled();
    harness.local = true; harness.find.mockResolvedValue(notification("local-test", "push"));
    await deliverNotification("job"); expect(harness.send).not.toHaveBeenCalled();
  });
  it("clearly labels an allowed captured fixture email", async () => {
    harness.lab = true; harness.find.mockResolvedValue(notification("local-test"));
    await deliverNotification("job");
    expect(harness.send).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringMatching(/^LOCAL TEST:/) }), { idempotencyKey: "radar-notification-job" });
  });
});
