import { afterEach, describe, expect, it, vi } from "vitest";
import { adminToken, checkAdminPassword, validAdminToken } from "../src/lib/radar/admin";

afterEach(() => vi.unstubAllEnvs());
describe("admin sessions", () => {
  it("rejects unconfigured administration and incorrect passwords", () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(() => checkAdminPassword("anything")).toThrow("ADMIN_PASSWORD");
    vi.stubEnv("ADMIN_PASSWORD", "test-only-long-admin-password");
    expect(checkAdminPassword("wrong-password")).toBe(false);
    expect(checkAdminPassword("test-only-long-admin-password")).toBe(true);
  });
  it("rejects tampered, expired, and old-secret session cookies", () => {
    vi.stubEnv("ADMIN_PASSWORD", "test-only-long-admin-password");
    const now = Date.now();
    const token = adminToken(now);
    expect(validAdminToken(token, now)).toBe(true);
    expect(validAdminToken(token + "x", now)).toBe(false);
    expect(validAdminToken(token, now + 28800_001)).toBe(false);
    vi.stubEnv("ADMIN_PASSWORD", "rotated-long-admin-password");
    expect(validAdminToken(token, now)).toBe(false);
  });
});
