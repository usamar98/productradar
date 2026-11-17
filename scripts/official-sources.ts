import "dotenv/config";
import { prisma } from "../src/lib/db";
import { lookupZip, nearbyStores } from "../src/lib/radar/locations";
import { officialConnectorNames } from "../src/lib/radar/official-connectors";
import type { Prisma } from "@prisma/client";

const args = process.argv.slice(2);
const value = (flag: string, fallback: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;

async function install(record: Prisma.RadarSourceUncheckedCreateInput) {
  const existing = await prisma.radarSource.findUnique({ where: { variantId_retailer: { variantId: record.variantId, retailer: record.retailer } }, include: { _count: { select: { events: true } } } });
  if (!existing) { await prisma.radarSource.create({ data: record }); return "created"; }
  // Setup never overwrites observations, approvals, active monitoring, or a prior block.
  if (existing.approved || existing.status !== "paused" || existing.lastCheckedAt || existing._count.events) return "preserved";
  const { id: _id, ...data } = record;
  await prisma.radarSource.update({ where: { id: existing.id }, data });
  return "configured";
}

try {
  if (args.includes("--setup")) {
    const limit = Number(value("--limit", "5"));
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("Choose --limit between 1 and 20 stores.");
    const place = await lookupZip(value("--zip", "10001"));
    const stores = nearbyStores(place, 250).slice(0, limit);
    const apple = await prisma.radarItem.findUnique({ where: { id: "iphone-duo" }, include: { variants: true } });
    if (!apple || !stores.length) throw new Error("Seed the product catalog and choose a ZIP near a US Apple Store first.");
    const counts: Record<string, number> = {};
    const save = async (record: Prisma.RadarSourceUncheckedCreateInput) => { const result = await install(record); counts[result] = (counts[result] || 0) + 1; };
    for (const variant of apple.variants) {
      if (!/^(256gb|512gb|1tb|2tb)-(night-sky|star-white)$/.test(variant.slug)) continue;
      for (const store of stores) await save({
        id: `official-${variant.id}-${store.id}`, itemId: apple.id, variantId: variant.id,
        retailer: store.id, label: store.name, locationId: store.id, fulfillment: "pickup",
        productUrl: `https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-${variant.slug}-unlocked`,
        connector: "apple-pickup", pollSeconds: 300, status: "on_demand", approved: false,
        lastError: null,
      });
    }
    await save({ id: "ps5-sony", itemId: "ps5-pro", variantId: "ps5-pro-standard", retailer: "playstation-direct", label: "PlayStation Direct", fulfillment: "online", locationId: null,
      productUrl: "https://direct.playstation.com/en-us/buy-consoles/playstation5-pro-console", connector: "playstation-direct", pollSeconds: 300, status: "on_demand", approved: false,
      lastError: null,
    });
    await save({ id: "rtx-5090-nvidia", itemId: "rtx-5090", variantId: "rtx-5090-standard", retailer: "nvidia", label: "NVIDIA Marketplace", fulfillment: "online", locationId: null,
      productUrl: "https://marketplace.nvidia.com/en-us/consumer/graphics-cards/geforce-rtx-5090-founders-edition/", connector: "nvidia-store", pollSeconds: 300, status: "on_demand", approved: false,
      lastError: null,
    });
    console.log(JSON.stringify({ configuredNear: place.zip, stores: stores.map(store => ({ id: store.id, name: store.name })), ...counts, activated: 0 }));
  }
  const summary = await prisma.radarSource.groupBy({ by: ["connector", "status", "approved"], where: { connector: { in: [...officialConnectorNames] } }, _count: { _all: true } });
  console.log(JSON.stringify({ officialSources: summary, emailCredentialsPresent: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM), note: "Configuration is not proof of working live inventory or email delivery. No retailer requests or alerts are sent by this status report." }));
} finally { await prisma.$disconnect(); }
