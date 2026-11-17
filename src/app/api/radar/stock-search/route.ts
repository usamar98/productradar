import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, HttpError, readJson } from "@/lib/security";
import { assertRadarOrigin, rateLimit } from "@/lib/radar/access";
import { lookupZip, nearbyStores, storeDirectory } from "@/lib/radar/locations";
import { pickupSource, pickupStockReading, stockReading } from "@/lib/radar/stock-finder";
import { getLaunchProduct } from "@/config/launch-catalog";
import { isLocalTestMode } from "@/lib/radar/local-test";
import { isOfficialListing, officialConnection } from "@/lib/radar/official-status";
import { liveInput, refreshLiveStock, type LiveLookup } from "@/lib/radar/live-stock";

const input = z.object({ item: z.string().min(1).max(100), variant: z.string().min(1).max(100), mode: z.enum(["pickup", "online"]), zip: z.string().max(10).optional(), search: z.string().max(100).optional(), storeId: z.string().regex(/^apple-r\d{3,5}$/).optional(), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(), radius: z.union([z.literal(25), z.literal(50), z.literal(100), z.literal(250)]).default(50) }).strict();
export async function POST(request: Request) {
  try {
    assertRadarOrigin(request);
    const value = await readJson(request, input);
    if ((value.latitude === undefined) !== (value.longitude === undefined) || (value.zip && value.latitude !== undefined)) throw new HttpError(400, "Choose a ZIP code or your current location.");
    if (value.storeId && value.mode !== "pickup") throw new HttpError(400, "A store check requires pickup mode.");
    await rateLimit(`stock-search:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"}`, 90, 60);
    const local = isLocalTestMode();
    const item = await prisma.radarItem.findFirst({ where: { slug: value.item, hidden: false }, include: { variants: { where: { slug: value.variant } }, sources: { where: { connector: { notIn: local ? ["mock"] : ["mock", "local-test"] }, variant: { slug: value.variant } } } } });
    if (!item || item.variants.length !== 1) throw new HttpError(404, "Choose an available product and configuration.");
    const product = getLaunchProduct(item.slug);
    let live: LiveLookup | null = null, liveError: string | null = null;
    async function refresh(zip?: string, storeIds?: string[]) {
      if (local || !item) return;
      const target = liveInput(item.id, item.variants[0].id, item.sources, value.mode, zip);
      if (!target) return;
      try { live = await refreshLiveStock({ ...target, storeIds, singleStore: !!value.storeId }); }
      catch (error) { liveError = error instanceof Error ? error.message : "The official store could not be checked. Try again shortly."; }
      item.sources = await prisma.radarSource.findMany({ where: { itemId: item.id, variantId: item.variants[0].id, connector: { notIn: ["mock", "local-test"] } } });
    }
    const context = (sources = item.sources) => {
      const connection = local ? null : officialConnection(product?.brand, sources, product?.officialUrl);
      return { connection, officialUrl: connection?.url || product?.officialUrl, live, liveError };
    };
    const observation = (source: typeof item.sources[number] | undefined) => ({ ...stockReading(source), sourceId: source?.id || null, priceCents: source?.lastCheckedAt && !source.lastError ? source.priceCents : null, lastCheckedAt: source?.lastCheckedAt?.toISOString() || null, simulated: source?.connector === "local-test", onDemand: source?.status === "on_demand" });
    if (value.mode === "online") {
      await refresh();
      return Response.json({ mode: "online", ...context(), stores: [], retailers: item.sources.filter(source => source.fulfillment !== "pickup" && (local || isOfficialListing(product?.brand, source.productUrl))).map(source => ({ name: source.label, url: source.productUrl, ...observation(source) })), total: 0, message: "Online stock is separate from local pickup. Confirm delivery to your ZIP at checkout. PlayStation account or membership requirements may apply to purchasing." }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const place = value.zip ? await lookupZip(value.zip) : null;
    const point = place || (value.latitude !== undefined && value.longitude !== undefined ? { latitude: value.latitude, longitude: value.longitude } : undefined);
    if (!point && !value.search?.trim()) throw new HttpError(400, "Enter a ZIP code, city or store name.");
    const supportsPickup = getLaunchProduct(item.slug)?.brand === "apple";
    const found = supportsPickup ? nearbyStores(point, value.radius, value.search) : [];
    const selectedStore = value.storeId ? found.find(store => store.id === value.storeId) : undefined;
    if (value.storeId && !selectedStore) throw new HttpError(400, "Choose a store from these search results.");
    if (selectedStore && pickupSource(item.sources, selectedStore.id)?.status === "paused") throw new HttpError(400, "Checks for this store have been paused.");
    const targets = (selectedStore ? [selectedStore] : found).filter(store => pickupSource(item.sources, store.id)?.status !== "paused");
    if (supportsPickup && targets.length) await refresh(selectedStore?.postalCode.slice(0, 5) || place?.zip || targets[0].postalCode.slice(0, 5), targets.map(store => store.id));
    const lookup = live as LiveLookup | null;
    const connected = !!liveInput(item.id, item.variants[0].id, item.sources, "pickup");
    const blocked = item.sources.some(source => source.connector === "apple-pickup" && source.status === "blocked" && source.lastError?.startsWith("Inventory endpoint blocked:"));
    const stores = found.map(store => {
      const source = pickupSource(item.sources, store.id);
      return { ...store, distance: store.distance === null ? null : Math.round(store.distance * 10) / 10, ...observation(source),
        ...(local ? { canCheckStore: false, reason: null } : pickupStockReading(source, { connected, blocked, omitted: lookup?.unresolvedStoreIds.includes(store.id) })),
      };
    });
    const coverage = { total: stores.length, checked: stores.filter(store => ["in_stock", "out_of_stock"].includes(store.state)).length };
    return Response.json({ mode: "pickup", place, stores, total: found.length, coverage, directoryCount: storeDirectory.stores.length, reviewedAt: storeDirectory.reviewedAt, ...context(item.sources.filter(source => found.some(store => store.id === source.locationId))), message: supportsPickup ? "The search checks additional areas to cover nearby stores. Use Check this store for any result Apple still omits. Missing results are not sold out. Distances are straight-line estimates; confirm pickup before travelling." : "Store pickup coverage is not connected for this product. Use Online official stores or the manufacturer’s store finder." }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
