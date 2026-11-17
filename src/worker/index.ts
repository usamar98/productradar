import "dotenv/config";
import { prisma } from "../lib/db";
import { inventoryAdapters, PRODUCT } from "../lib/inventory";
import { checkSources, dispatchNotifications } from "./runtime";

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

async function main() {
  const adapters = inventoryAdapters();
  const configuredTick = Number(process.env.WORKER_TICK_SECONDS);
  const tickSeconds = Number.isFinite(configuredTick) && configuredTick > 0 ? Math.max(1, Math.min(60, configuredTick)) : 5;
  for (const adapter of adapters) {
    await prisma.retailer.upsert({ where: { id: adapter.id }, create: { id: adapter.id, name: adapter.name, sourceUrl: adapter.sourceUrl, productIdentifier: adapter.id === "bestbuy" ? PRODUCT.bestBuySku : PRODUCT.nvidiaMpn, enabled: adapter.enabled, intervalSeconds: adapter.intervalSeconds }, update: { enabled: adapter.enabled, intervalSeconds: adapter.intervalSeconds } });
    console.info(`[worker] ${adapter.name}: ${adapter.enabled ? `enabled, ${adapter.intervalSeconds}s interval` : adapter.disabledReason}`);
  }
  console.info("[worker] Durable inventory and notification loop started.");
  while (!stopping) {
    try {
      await checkSources(prisma, adapters);
      await dispatchNotifications(prisma);
    } catch {
      // Provider/DB exception objects may contain connection strings or API keys.
      console.error("[worker] Cycle failed; persisted leases/jobs will be retried.");
    }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, tickSeconds * 1000));
  }
}

main().catch(() => { console.error("[worker] Startup failed. Check database connectivity and migrations."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
