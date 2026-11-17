import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, HttpError, readJson } from "@/lib/security";
import { assertRadarOrigin, rateLimit } from "@/lib/radar/access";
import { lookupZip, nearbyStores, storeDirectory } from "@/lib/radar/locations";
import { pickupSource, stockReading } from "@/lib/radar/stock-finder";
import { getLaunchProduct } from "@/config/launch-catalog";
import { isLocalTestMode } from "@/lib/radar/local-test";
import { isOfficialListing, officialConnection } from "@/lib/radar/official-status";
import { liveInput, refreshLiveStock, type LiveLookup } from "@/lib/radar/live-stock";

const input = z.object({ item: z.string().min(1).max(100), variant: z.string().min(1).max(100), mode: z.enum(["pickup", "online"]), zip: z.string().max(10).optional(), search: z.string().max(100).optional(), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(), radius: z.union([z.literal(25), z.literal(50), z.literal(100), z.literal(250)]).default(50) }).strict();
export async function POST(request: Request) {
  try {
    assertRadarOrigin(request);
    const value = await readJson(request, input);
    if ((value.latitude === undefined) !== (value.longitude === undefined) || (value.zip && value.latitude !== undefined)) throw new HttpError(400, "Choose a ZIP code or your current location.");
    await rateLimit(`stock-search:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"}`, 90, 60);
    const local = isLocalTestMode();
    const item = await prisma.radarItem.findFirst({ where: { slug: value.item, hidden: false }, include: { variants: { where: { slug: value.variant } }, sources: { where: { connector: { notIn: local ? ["mock"] : ["mock", "local-test"] }, variant: { slug: value.variant } } } } });
    if (!item || item.variants.length !== 1) throw new HttpError(404, "Choose an available product and configuration.");
    const product = getLaunchProduct(item.slug);
    let live: LiveLookup | null = null, liveError: string | null = null;
    async function refresh(zip?: string) {
      if (local || !item) return;
      const target = liveInput(item.id, item.variants[0].id, item.sources, value.mode, zip);
      if (!target) return;
      try { live = await refreshLiveStock(target); }
      catch (error) { liveError = error instanceof Error ? error.message : "The official store could not be checked. Try again shortly."; }
      item.sources = await prisma.radarSource.findMany({ where: { itemId: item.id, variantId: item.variants[0].id, connector: { notIn: ["mock", "local-test"] } } });
    }
    const context = () => {
      const connection = local ? null : officialConnection(product?.brand, item.sources, product?.officialUrl);
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
    if (supportsPickup && found.length) await refresh(place?.zip || found[0].postalCode.slice(0, 5));
    const stores = found.map(store => ({ ...store, distance: store.distance === null ? null : Math.round(store.distance * 10) / 10, ...observation(pickupSource(item.sources, store.id)) }));
    return Response.json({ mode: "pickup", place, stores, total: found.length, directoryCount: storeDirectory.stores.length, reviewedAt: storeDirectory.reviewedAt, ...context(), message: supportsPickup ? "Apple returns a limited group of nearby stores per lookup. Stores without a fresh response remain unknown. Distances are straight-line estimates. Confirm pickup before travelling." : "Store pickup coverage is not connected for this product. Use Online official stores or the manufacturer’s store finder." }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
