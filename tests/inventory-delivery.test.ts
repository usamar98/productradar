import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryError, notificationText, sendEmail, type NotificationMessage } from "../src/worker/notifications";
import { PRODUCT } from "../src/lib/inventory/types";

const message: NotificationMessage = { eventId: "event-test", jobId: "job-test", retailerName: "Best Buy", sourceUrl: PRODUCT.bestBuyUrl, priceCents: 199999, checkedAt: new Date("2026-11-16T12:00:00.000Z") };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("notification transport contract", () => {
  it("includes exact product, retailer, observed price/time and official purchase URL", () => {
    const text = notificationText(message);
    expect(text).toContain(PRODUCT.name);
    expect(text).toContain("Best Buy");
    expect(text).toContain("$1,999.99");
    expect(text).toContain("2026-11-16T12:00:00.000Z");
    expect(text).toContain(PRODUCT.bestBuyUrl);
    expect(text).toContain("Stock is not reserved");
    expect(notificationText({ ...message, priceCents: null })).toContain("Price unavailable");
  });
  it("reuses an identical provider idempotency key and body on retry", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-never-sent");
    vi.stubEnv("EMAIL_FROM", "GPU Stock Watch <alerts@example.test>");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id: "provider-id" }));
    vi.stubGlobal("fetch", fetcher);
    await sendEmail(message, "recipient@example.test");
    await sendEmail(message, "recipient@example.test");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toBe("stock-alert/job-test");
    expect(fetcher.mock.calls[1][1].headers["Idempotency-Key"]).toBe("stock-alert/job-test");
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("sanitizes provider failures and retries rate limits", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-never-sent");
    vi.stubEnv("EMAIL_FROM", "alerts@example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream secret", { status: 429 })));
    await expect(sendEmail(message, "recipient@example.test")).rejects.toMatchObject({ code: "EMAIL_PROVIDER_REJECTED", permanent: false });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream secret", { status: 422 })));
    await expect(sendEmail(message, "recipient@example.test")).rejects.toMatchObject({ code: "EMAIL_PROVIDER_REJECTED", permanent: true });
  });
  it("does not call a provider when email configuration is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(sendEmail(message, "recipient@example.test")).rejects.toBeInstanceOf(DeliveryError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
