import { describe, expect, it } from "vitest";
import { allowedPushEndpoint, assertSameOrigin, csvCell, ownerWhere, watchInput } from "../src/lib/security";

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
  it("prevents push endpoints from targeting internal services", () => {
    expect(allowedPushEndpoint("http://127.0.0.1/admin")).toBe(false);
    expect(allowedPushEndpoint("https://fcm.googleapis.com.evil.example/send")).toBe(false);
    expect(allowedPushEndpoint("https://fcm.googleapis.com/fcm/send/token")).toBe(true);
  });
  it("neutralizes spreadsheet formulas in administrative exports", () => {
    expect(csvCell("=IMPORTXML()" )).toBe('"\'=IMPORTXML()"');
  });
});
