import "dotenv/config";
import { prisma } from "../src/lib/db";
import { lookupZip, nearbyStores } from "../src/lib/radar/locations";
import { officialConnectorNames } from "../src/lib/radar/official-connectors";
import { officialCatalog } from "../src/lib/radar/official-catalog";
import { feedBrands, feedSecret } from "../src/lib/radar/inventory-feed-auth";
import { emailReadiness } from "../src/lib/radar/email";
import { partnerizeStockConfig, sonyPartnerRetailer } from "../src/lib/radar/partnerize-config";
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
  const feeds = await Promise.all(feedBrands.map(async brand => {
    const records = await prisma.radarSource.aggregate({ where: { connector: "inventory-" + brand, status: "feed" }, _count: true, _max: { lastCheckedAt: true } });
    return { brand, signingKeyConfigured: !!feedSecret(brand), sources: records._count, lastObservation: records._max.lastCheckedAt };
  }));
  const partnerSync = await prisma.radarFeedSync.findUnique({ where: { id: sonyPartnerRetailer }, select: { blocked: true, nextCheckAt: true, message: true } });
  const email = emailReadiness().mode;
  console.log(JSON.stringify({ officialSources: summary, feeds, playstationPartner: { configured: !!partnerizeStockConfig(), scheduler: partnerSync },
    email, emailCredentialsPresent: email === "resend", note: "Configuration status only. This command does not check stock or send email." }));
} finally { await prisma.$disconnect(); }
