import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, HttpError, readJson } from "@/lib/security";
import { assertRadarOrigin, rateLimit } from "@/lib/radar/access";
import { lookupZip, nearbyStores, storeDirectory } from "@/lib/radar/locations";
import { pickupSource, stockReading } from "@/lib/radar/stock-finder";
import { getLaunchProduct } from "@/config/launch-catalog";
import { isLocalTestMode } from "@/lib/radar/local-test";

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
    const officialUrl = getLaunchProduct(item.slug)?.officialUrl;
    const observation = (source: typeof item.sources[number] | undefined) => ({ ...stockReading(source), sourceId: source?.id || null, priceCents: source?.lastCheckedAt && !source.lastError ? source.priceCents : null, lastCheckedAt: source?.lastCheckedAt?.toISOString() || null, simulated: source?.connector === "local-test" });
    if (value.mode === "online") return Response.json({ mode: "online", officialUrl, stores: [], retailers: item.sources.filter(source => source.fulfillment !== "pickup").map(source => ({ name: source.label, url: source.productUrl, ...observation(source) })), total: 0 }, { headers: { "Cache-Control": "private, no-store" } });
    const place = value.zip ? await lookupZip(value.zip) : null;
    const point = place || (value.latitude !== undefined && value.longitude !== undefined ? { latitude: value.latitude, longitude: value.longitude } : undefined);
    if (!point && !value.search?.trim()) throw new HttpError(400, "Enter a ZIP code, city or store name.");
    const supportsPickup = getLaunchProduct(item.slug)?.brand === "apple";
    const found = supportsPickup ? nearbyStores(point, value.radius, value.search) : [];
    const stores = found.map(store => ({ ...store, distance: store.distance === null ? null : Math.round(store.distance * 10) / 10, ...observation(pickupSource(item.sources, store.id)) }));
    return Response.json({ mode: "pickup", place, stores, total: found.length, directoryCount: storeDirectory.stores.length, reviewedAt: storeDirectory.reviewedAt, officialUrl, message: supportsPickup ? "Distances are straight-line estimates. A store listing does not confirm product stock. Verify pickup with the retailer before travelling." : "Store pickup coverage is not connected for this product. Use Online retailers or the manufacturer’s store finder." }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
