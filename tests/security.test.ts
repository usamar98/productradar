import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedPushEndpoint, assertSameOrigin, csvCell, ownerWhere, watchInput } from "../src/lib/security";
import { assertRadarOrigin } from "../src/lib/radar/access";

afterEach(() => vi.unstubAllEnvs());

describe("account boundaries", () => {
  it("always scopes private records to the authenticated user", () => {
    expect(ownerWhere("account-a")).toEqual({ userId: "account-a" });
    expect(ownerWhere("account-b")).toEqual({ userId: "account-b" });
    expect(() => ownerWhere("")).toThrow("Sign in");
  });
  it("rejects ownership fields in watch updates", () => {
    expect(watchInput.safeParse({ retailers: ["bestbuy"], maxPriceCents: 200000, emailEnabled: true, pushEnabled: false, userId: "victim" }).success).toBe(false);
  });
  it("rejects cross-site writes", () => {
    expect(() => assertSameOrigin(new Request("http://localhost:3000/api/watch", { headers: { origin: "https://evil.example" } }))).toThrow();
  });
  it("accepts same-origin stock checks at either local preview address and rejects cross-origin or wrong-port requests", () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      const origin = `http://${host}:3000`;
      expect(() => assertRadarOrigin(new Request(origin, { headers: { origin } }))).not.toThrow();
    }
    for (const origin of ["http://localhost:3000", "http://127.0.0.1:3001", "https://elsewhere.example", "null"]) {
      expect(() => assertRadarOrigin(new Request("http://127.0.0.1:3000", { headers: { origin } }))).toThrow();
    }
    vi.stubEnv("APP_URL", "https://radar.example");
    expect(() => assertRadarOrigin(new Request("https://radar.example", { headers: { origin: "http://127.0.0.1:3000" } }))).toThrow();
  });
  it("prevents push endpoints from targeting internal services", () => {
    expect(allowedPushEndpoint("http://127.0.0.1/admin")).toBe(false);
    expect(allowedPushEndpoint("https://fcm.googleapis.com.evil.example/send")).toBe(false);
    expect(allowedPushEndpoint("https://fcm.googleapis.com/fcm/send/token")).toBe(true);
  });
  it("neutralizes spreadsheet formulas in administrative exports", () => {
    expect(csvCell("=IMPORTXML()" )).toBe('"\'=IMPORTXML()"');
  });
});
