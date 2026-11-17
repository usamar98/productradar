import "dotenv/config";
import { prisma } from "../src/lib/db";
import { lookupZip, nearbyStores } from "../src/lib/radar/locations";
import { officialConnectorNames } from "../src/lib/radar/official-connectors";
import { officialCatalog } from "../src/lib/radar/official-catalog";
import type { Prisma } from "@prisma/client";

const args = process.argv.slice(2);
const value = (flag: string, fallback: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;

async function install(record: Prisma.RadarSourceUncheckedCreateInput) {
  const existing = await prisma.radarSource.findUnique({ where: { variantId_retailer: { variantId: record.variantId, retailer: record.retailer } }, include: { _count: { select: { events: true } } } });
  if (!existing) { await prisma.radarSource.create({ data: record }); return "created"; }
  // Setup never overwrites observations, approvals, active monitoring, or a prior block.
  if (existing.approved || existing.status !== "paused" || existing.lastCheckedAt || existing._count.events
    || existing.connector !== "jsonld" || !/^(Placeholder:|Catalog link only\.)/.test(existing.lastError || "")) return "preserved";
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
    const items = await prisma.radarItem.findMany({ include: { variants: true } });
    if (!items.length || !stores.length) throw new Error("Seed the product catalog and choose a ZIP near a US Apple Store first.");
    const counts: Record<string, number> = {};
    const save = async (record: Prisma.RadarSourceUncheckedCreateInput) => { const result = await install(record); counts[result] = (counts[result] || 0) + 1; };
    const missing: string[] = [];
    for (const product of officialCatalog) {
      const item = items.find(item => item.slug === product.itemSlug);
      const variant = item?.variants.find(variant => variant.slug === product.variantSlug);
      if (!item || !variant) { missing.push(`${product.itemSlug}/${product.variantSlug}`); continue; }
      if (product.connector === "apple-pickup") for (const store of stores) await save({
        id: `official-${variant.id}-${store.id}`, itemId: item.id, variantId: variant.id,
        retailer: store.id, label: store.name, locationId: store.id, fulfillment: "pickup",
        productUrl: product.productUrl,
        connector: "apple-pickup", pollSeconds: 300, status: "on_demand", approved: false,
        lastError: null,
      });
      else await save({
        id: `official-${variant.id}-${product.connector}`, itemId: item.id, variantId: variant.id,
        retailer: product.connector === "playstation-direct" ? "playstation-direct" : "nvidia",
        label: product.connector === "playstation-direct" ? "PlayStation Direct" : "NVIDIA Marketplace",
        fulfillment: "online", locationId: null, productUrl: product.productUrl, connector: product.connector,
        pollSeconds: 300, status: "on_demand", approved: false, lastError: null,
      });
    }
    console.log(JSON.stringify({ configuredNear: place.zip, stores: stores.map(store => ({ id: store.id, name: store.name })), ...counts, missing, activated: 0 }));
    if (missing.length) process.exitCode = 1;
  }
  const summary = await prisma.radarSource.groupBy({ by: ["connector", "status", "approved"], where: { connector: { in: [...officialConnectorNames] } }, _count: { _all: true } });
  console.log(JSON.stringify({ officialSources: summary, emailCredentialsPresent: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM), note: "Configuration is not proof of working live inventory or email delivery. No retailer requests or alerts are sent by this status report." }));
} finally { await prisma.$disconnect(); }
