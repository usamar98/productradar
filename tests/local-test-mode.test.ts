import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => ({ files: new Map<string, string>(), transaction: vi.fn() }));
const fs = vi.hoisted(() => ({
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async (path: string) => {
    const value = memory.files.get(String(path));
    if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
    return value;
  }),
  writeFile: vi.fn(async (path: string, text: string) => { memory.files.set(String(path), text); }),
  rename: vi.fn(async (from: string, to: string) => { memory.files.set(String(to), memory.files.get(String(from))!); memory.files.delete(String(from)); }),
  unlink: vi.fn(async (path: string) => { memory.files.delete(String(path)); }),
}));
vi.mock("node:fs/promises", () => fs);
vi.mock("../src/lib/db", () => ({ prisma: { $transaction: memory.transaction } }));

import { isLocalTestMode, readLocalStock, setLocalStock } from "../src/lib/radar/local-test";
import { BlockedSourceError, connectorFor } from "../src/lib/radar/connectors";
import { recordObservation } from "../worker/runtime";
import type { RadarSource } from "@prisma/client";
import { resolve } from "node:path";

const signalPath = resolve(process.cwd(), ".local", "test-stock.json");
function enableLab() {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("RADAR_LOCAL_TEST_MODE", "true");
  vi.stubEnv("APP_URL", "http://127.0.0.1:3001");
  vi.stubEnv("DATABASE_URL", "postgresql://test@127.0.0.1:55432/restock_radar_local_test");
}
beforeEach(() => { vi.clearAllMocks(); memory.files.clear(); enableLab(); });
afterEach(() => vi.unstubAllEnvs());

describe("isolated local flow lab", () => {
  it("requires every guard and never accepts the normal app or ordinary integration database", () => {
    expect(isLocalTestMode()).toBe(true);
    for (const [key, value] of [
      ["NODE_ENV", "production"], ["NODE_ENV", "test"], ["RADAR_LOCAL_TEST_MODE", "false"],
      ["APP_URL", "https://radar.example"], ["APP_URL", "http://localhost.example:3001"], ["APP_URL", "http://user:pass@localhost:3001"],
      ["DATABASE_URL", "postgresql://test@localhost/restock_radar"], ["DATABASE_URL", "postgresql://test@localhost/restock_radar_test"],
      ["DATABASE_URL", "postgresql://test@localhost/a_local_test/other_local_test"], ["DATABASE_URL", "not-a-url"],
    ]) {
      enableLab(); vi.stubEnv(key, value); expect(isLocalTestMode(), `${key}=${value}`).toBe(false);
    }
  });

  it("denies filesystem access and observation writes outside the lab", async () => {
    vi.stubEnv("RADAR_LOCAL_TEST_MODE", "false");
    await expect(readLocalStock("source-one")).rejects.toThrow("Local stock controls");
    expect(() => setLocalStock("source-one", true)).toThrow("Local stock controls");
    await expect(recordObservation({ id: "source-one", connector: "local-test" } as RadarSource, new Date(), { inStock: true })).rejects.toBeInstanceOf(BlockedSourceError);
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(memory.transaction).not.toHaveBeenCalled();
  });

  it("uses only explicit boolean signals and never invents a missing observation", async () => {
    await expect(readLocalStock("unknown")).rejects.toThrow("setup");
    for (const invalid of ["broken", "[]", '{"source-one":"true"}', '{"__proto__":false}']) {
      memory.files.set(signalPath, invalid);
      await expect(readLocalStock("source-one")).rejects.toThrow();
    }
    memory.files.set(signalPath, "{}");
    await expect(readLocalStock("unknown")).rejects.toThrow("No deterministic stock signal");
    expect(() => setLocalStock("../source", true)).toThrow("Invalid local-test source");
    expect(() => setLocalStock("source-one", "yes" as unknown as boolean)).toThrow("must be a boolean");
  });

  it("atomically changes only requested signals and serializes simultaneous updates", async () => {
    await Promise.all([setLocalStock("source-one", false), setLocalStock("source-two", true)]);
    expect(await readLocalStock("source-one")).toBe(false);
    expect(await readLocalStock("source-two")).toBe(true);
    await setLocalStock("source-one", true);
    expect(await readLocalStock("source-one")).toBe(true);
    expect(await readLocalStock("source-two")).toBe(true);
    expect(fs.rename).toHaveBeenCalledTimes(3);
    expect([...memory.files.keys()]).toEqual([signalPath]);
  });

  it("runs the deterministic connector only with lab isolation and approval", async () => {
    const source = { id: "source-one", connector: "local-test", productUrl: "https://www.apple.com/", approved: true };
    await setLocalStock(source.id, false);
    const connector = connectorFor("local-test");
    expect(await connector.check(source)).toMatchObject({ inStock: false, raw: expect.stringContaining("LOCAL TEST") });
    expect(await connector.check(source)).toMatchObject({ inStock: false });
    await setLocalStock(source.id, true);
    expect(await connector.check(source)).toMatchObject({ inStock: true });
    await expect(connector.check({ ...source, approved: false })).rejects.toBeInstanceOf(BlockedSourceError);
    vi.stubEnv("DATABASE_URL", "postgresql://test@localhost/restock_radar");
    await expect(connector.check(source)).rejects.toBeInstanceOf(BlockedSourceError);
  });
});
