import { z } from "zod";
import { prisma } from "../db";
import { HttpError } from "../security";
import { maxFeedAgeMs, type FeedBrand } from "./inventory-feed-auth";
import { isLocalTestMode } from "./local-test";
import { storeDirectory } from "./locations";
import { officialCatalogProduct } from "./official-catalog";
import { recordStockPeriod } from "./stock-period";
import { sonyPartnerRetailer } from "./partnerize-config";

const slug = z.string().min(1).max(100);
const report = z.object({
  item: slug, variant: slug, storeId: z.string().regex(/^apple-r\d{3,5}$/).optional(),
  inStock: z.boolean(), observedAt: z.iso.datetime(), priceCents: z.number().int().min(0).max(2_147_483_647).optional(),
}).strict();
const catalogConnector = { apple: "apple-pickup", playstation: "playstation-direct", nvidia: "nvidia-store" };

export function inventoryReport(brand: FeedBrand, value: unknown, now = Date.now()) {
  const parsed = report.safeParse(value);
  if (!parsed.success) throw new HttpError(400, "Choose an exact catalog item and variant and supply a dated stock observation.");
  const input = parsed.data;
  const observedAt = new Date(input.observedAt);
  if (observedAt.getTime() > now || now - observedAt.getTime() > maxFeedAgeMs) throw new HttpError(422, "The observation must be from the last five minutes.");
  const product = officialCatalogProduct(input.item, input.variant);
  if (!product || product.connector !== catalogConnector[brand]) throw new HttpError(422, "This configuration is outside the brand's tracked catalog.");
  const store = input.storeId ? storeDirectory.stores.find(store => store.id === input.storeId) : undefined;
  if (brand === "apple" ? !store : !!input.storeId) throw new HttpError(422, brand === "apple" ? "Choose a known Apple pickup store." : "This brand reports US online availability.");
  return { input, observedAt, product, store };
}

export async function receiveInventory(brand: FeedBrand, value: unknown, database = prisma, partnerLease?: Date) {
  const { input, observedAt, product, store } = inventoryReport(brand, value);
  const local = isLocalTestMode();
  if (partnerLease && (local || brand !== "playstation")) throw new HttpError(400, "This feed covers PlayStation Direct US online stock.");
  const retailer = partnerLease ? sonyPartnerRetailer : "feed-" + (store?.id || brand);
  const connector = local ? "local-test" : "inventory-" + brand;
  const label = (store?.name || (brand === "nvidia" ? "NVIDIA Marketplace" : "PlayStation Direct")) + (local ? " · LOCAL TEST" : "");
  return database.$transaction(async tx => {
    if (partnerLease) {
      const [sync] = await tx.$queryRaw<{ blocked: boolean; leaseUntil: Date | null }[]>`SELECT blocked, "leaseUntil" FROM inventory_feed_sync WHERE id = ${sonyPartnerRetailer} FOR SHARE`;
      if (!sync || sync.blocked || sync.leaseUntil?.getTime() !== partnerLease.getTime() || partnerLease.getTime() <= Date.now()) throw new HttpError(409, "The partner sync lease expired.");
    }
    const variant = await tx.radarVariant.findFirst({ where: { slug: input.variant, item: { slug: input.item, hidden: false } }, select: { id: true, itemId: true } });
    if (!variant) throw new HttpError(422, "This configuration is unavailable in the catalog.");
    // Serialize the initial insert as well as observations from concurrent supplier retries.
    const identity = "inventory-feed:" + variant.id + ":" + retailer;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))`;
    const source = await tx.radarSource.upsert({
      where: { variantId_retailer: { variantId: variant.id, retailer } }, update: {},
      create: { itemId: variant.itemId, variantId: variant.id, retailer, label, connector, status: "feed", approved: false,
        locationId: store?.id ?? null, fulfillment: product.fulfillment, productUrl: product.productUrl, pollSeconds: 300 },
    });
    if (source.status !== "feed" || source.connector !== connector || source.productUrl !== product.productUrl || source.locationId !== (store?.id ?? null)) {
      throw new HttpError(409, "This inventory source is paused or its configuration has changed.");
    }
    if (source.lastCheckedAt && observedAt < source.lastCheckedAt) return { sourceId: source.id, result: "older" };
    if (source.lastCheckedAt?.getTime() === observedAt.getTime()) {
      if (source.inStock !== input.inStock || source.priceCents !== (input.priceCents ?? null)) throw new HttpError(409, "Conflicting observations have the same timestamp.");
      return { sourceId: source.id, result: "duplicate" };
    }
    const changed = await tx.radarSource.updateMany({ where: { id: source.id, status: "feed", lastCheckedAt: source.lastCheckedAt },
      data: { inStock: input.inStock, lastCheckedAt: observedAt, priceCents: input.priceCents ?? null, lastError: null } });
    if (!changed.count) throw new HttpError(409, "The inventory source changed while processing this report.");
    await recordStockPeriod(tx, source, input, observedAt);
    return { sourceId: source.id, result: "recorded" };
  });
}
