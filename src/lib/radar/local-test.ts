import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** The local flow lab must never share the normal application's database. */
export function isLocalTestMode(): boolean {
  if (process.env.NODE_ENV !== "development" || process.env.RADAR_LOCAL_TEST_MODE !== "true") return false;
  try {
    const app = new URL(process.env.APP_URL || "");
    const database = new URL(process.env.DATABASE_URL || "");
    return ["http:", "https:"].includes(app.protocol) && loopbackHosts.has(app.hostname) && !app.username && !app.password &&
      ["postgres:", "postgresql:"].includes(database.protocol) && /^\/[^/]+_local_test$/.test(decodeURIComponent(database.pathname));
  } catch { return false; }
}

function assertLocalTestMode() {
  if (!isLocalTestMode()) throw new Error("Local stock controls require development mode, a loopback APP_URL, RADAR_LOCAL_TEST_MODE=true and a separate database ending in _local_test.");
}

function assertSourceId(sourceId: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(sourceId) || ["__proto__", "constructor", "prototype"].includes(sourceId)) throw new Error("Invalid local-test source ID.");
}

function stockPath() { return resolve(process.cwd(), ".local", "test-stock.json"); }

async function readSignals(allowMissing = false): Promise<Record<string, boolean>> {
  let text: string;
  try { text = await readFile(stockPath(), "utf8"); }
  catch (error) {
    if (allowMissing && error && typeof error === "object" && "code" in error && error.code === "ENOENT") return Object.create(null) as Record<string, boolean>;
    throw new Error("Local stock signals are unavailable. Run the isolated local-test setup first.");
  }
  if (Buffer.byteLength(text) > 100_000) throw new Error("Local stock signal file is too large.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Local stock signal file contains invalid JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Local stock signals must be a map of source IDs to booleans.");
  for (const [id, inStock] of Object.entries(value)) {
    assertSourceId(id);
    if (typeof inStock !== "boolean") throw new Error("Every local stock signal must be a boolean.");
  }
  return value as Record<string, boolean>;
}

export async function readLocalStock(sourceId: string): Promise<boolean> {
  assertLocalTestMode();
  assertSourceId(sourceId);
  const signals = await readSignals();
  if (!Object.hasOwn(signals, sourceId)) throw new Error("No deterministic stock signal is configured for this local-test source.");
  return signals[sourceId];
}

// Only the lab web process writes signals. The worker only reads the atomic file.
let pendingWrite: Promise<void> = Promise.resolve();
export function setLocalStock(sourceId: string, inStock: boolean): Promise<void> {
  assertLocalTestMode();
  assertSourceId(sourceId);
  if (typeof inStock !== "boolean") throw new Error("Local stock status must be a boolean.");
  const operation = pendingWrite.catch(() => {}).then(async () => {
    assertLocalTestMode();
    const signals = await readSignals(true);
    signals[sourceId] = inStock;
    const target = stockPath();
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(temporary, `${JSON.stringify(signals, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      await rename(temporary, target);
    } finally { await unlink(temporary).catch(() => {}); }
  });
  pendingWrite = operation;
  return operation;
}
