import { prisma } from "./db";
import { inventoryAdapters, PRODUCT } from "./inventory";

export async function publicStock() {
  const adapters = inventoryAdapters();
  let databaseAvailable = false;
  let rows: Awaited<ReturnType<typeof getRetailers>> = [];
  let history: Awaited<ReturnType<typeof getHistory>> = [];
  if (process.env.DATABASE_URL) {
    try {
      [rows, history] = await Promise.all([getRetailers(), getHistory()]);
      databaseAvailable = true;
    } catch { /* A disconnected database cannot establish live inventory. */ }
  }
  const now = Date.now();
  const retailers = adapters.map(adapter => {
    const row = rows.find(item => item.id === adapter.id);
    const latest = row?.observations[0];
    const lastSuccessfulCheck = row?.lastSuccessfulCheck ?? null;
    const enabled = adapter.enabled && Boolean(row?.enabled) && databaseAvailable;
    const stale = !lastSuccessfulCheck || now - lastSuccessfulCheck.getTime() > Math.max(adapter.intervalSeconds * 3, 600) * 1000;
    return {
      id: adapter.id, name: adapter.name, sourceUrl: adapter.sourceUrl,
      productIdentifier: adapter.id === "bestbuy" ? PRODUCT.bestBuySku : PRODUCT.nvidiaMpn,
      enabled, state: row?.lastState ?? "UNKNOWN", priceCents: row?.lastPriceCents ?? null,
      currency: "USD", lastSuccessfulCheck, lastAttemptAt: row?.lastAttemptAt ?? null,
      error: adapter.disabledReason ?? (!databaseAvailable ? "Inventory monitoring is not connected yet." : row?.lastError ?? null),
      checkState: row?.lastError ? "CHECK_FAILED" : row?.lastState ?? "UNKNOWN",
      stale, shipping: latest?.shipping ?? null, pickup: latest?.pickup ?? null,
      intervalSeconds: adapter.intervalSeconds,
    };
  });
  const ready = retailers.some(item => item.enabled && !item.stale && !item.error && !["UNKNOWN", "CHECK_FAILED"].includes(item.state));
  return {
    product: PRODUCT, retailers,
    history: history.map(row => ({ id: row.id, retailerId: row.retailerId, retailer: row.retailer.name, state: row.state, priceCents: row.priceCents, checkedAt: row.checkedAt, sourceUrl: row.sourceUrl })),
    readiness: { ready, reasons: ready ? [] : ["Live stock monitoring is awaiting an approved, verified inventory connection."] },
    demoMode: process.env.DEMO_MODE === "true",
    fetchedAt: new Date().toISOString(),
  };
}
function getRetailers() { return prisma.retailer.findMany({ include: { observations: { orderBy: { checkedAt: "desc" }, take: 1 } } }); }
function getHistory() { return prisma.inventoryObservation.findMany({ take: 30, orderBy: { checkedAt: "desc" }, include: { retailer: { select: { name: true } } } }); }
