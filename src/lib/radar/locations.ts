import directory from "@/config/stores.json";
import { HttpError } from "@/lib/security";

export const storeDirectory = directory;
export type StoreLocation = typeof directory.stores[number];
export type Point = { latitude: number; longitude: number };
export type ZipLocation = Point & { zip: string; city: string; region: string };
export function normalizeZip(value: string) {
  const zip = value.trim();
  if (!/^\d{5}(?:-\d{4})?$/.test(zip)) throw new HttpError(400, "Enter a valid US ZIP code, such as 10001.");
  return zip.slice(0, 5);
}
export function distanceMiles(from: Point, to: Point) {
  const radians = Math.PI / 180;
  const a = Math.sin((to.latitude - from.latitude) * radians / 2) ** 2 + Math.cos(from.latitude * radians) * Math.cos(to.latitude * radians) * Math.sin((to.longitude - from.longitude) * radians / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
export function nearbyStores(point: Point | undefined, radius: number, search = "", stores = directory.stores) {
  const query = search.trim().toLowerCase();
  return stores.filter(store => !query || `${store.name} ${store.city} ${store.region} ${store.postalCode}`.toLowerCase().includes(query))
    .map(store => ({ ...store, distance: point ? distanceMiles(point, store) : null }))
    .filter(store => store.distance === null || store.distance <= radius)
    .sort((a,b) => a.distance !== null && b.distance !== null ? a.distance - b.distance : a.name.localeCompare(b.name));
}
const zipCache = new Map<string, { expires: number; value: ZipLocation }>();
export async function lookupZip(value: string, fetcher: typeof fetch = fetch): Promise<ZipLocation> {
  const zip = normalizeZip(value), cached = zipCache.get(zip);
  if (cached && cached.expires > Date.now()) return cached.value;
  let response: Response;
  try { response = await fetcher(`https://api.zippopotam.us/us/${zip}`, { signal: AbortSignal.timeout(6000), redirect: "error", headers: { Accept: "application/json" } }); }
  catch { throw new HttpError(503, "ZIP lookup is temporarily unavailable. Try searching by city or store name."); }
  if (response.status === 404) throw new HttpError(404, "We couldn’t find that US ZIP code. Check it or search by city.");
  if (!response.ok) throw new HttpError(503, "ZIP lookup is temporarily unavailable. Try searching by city or store name.");
  const text = await response.text();
  if (text.length > 64_000) throw new HttpError(503, "ZIP lookup returned an invalid result.");
  let data;
  try { data = JSON.parse(text); } catch { throw new HttpError(503, "ZIP lookup returned an invalid result."); }
  const place = data?.places?.[0];
  const latitude = Number(place?.latitude), longitude = Number(place?.longitude);
  if (data?.["country abbreviation"] !== "US" || data?.["post code"] !== zip || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || typeof place?.["place name"] !== "string" || typeof place?.["state abbreviation"] !== "string") throw new HttpError(503, "ZIP lookup returned an invalid result.");
  const result = { zip, city: place["place name"], region: place["state abbreviation"], latitude, longitude };
  if (zipCache.size >= 1000) zipCache.delete(zipCache.keys().next().value!);
  zipCache.set(zip, { value: result, expires: Date.now() + 86400_000 });
  return result;
}
