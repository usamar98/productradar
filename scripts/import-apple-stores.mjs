// One-time public directory import. This never requests product inventory.
import { readFile, writeFile, mkdir } from "node:fs/promises";
const directoryUrl = "https://www.apple.com/retail/storelist/";
const cache = new URL("../.local/store-directory/", import.meta.url);
await mkdir(cache, { recursive: true });
async function readPublic(url, name) {
  const file = new URL(name, cache);
  try { return await readFile(file, "utf8"); } catch { /* first import */ }
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "RestockRadar-DirectoryImport/1.0" } });
  if (!response.ok) throw new Error(`Directory import stopped: HTTP ${response.status} at ${url}`);
  const text = await response.text();
  await writeFile(file, text);
  return text;
}
const html = await readPublic(directoryUrl, "directory.html");
const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if (!match) throw new Error("Public directory format changed.");
const countries = JSON.parse(match[1]).props.pageProps.storeList;
const us = countries.find(country => country.locale === "en_US");
const entries = us.state.flatMap(state => state.store);
const stores = [];
// Two public page reads at a time; stop on errors instead of retrying protections.
for (let offset = 0; offset < entries.length; offset += 2) {
  const batch = await Promise.all(entries.slice(offset, offset + 2).map(async store => {
    const url = `https://www.apple.com/retail/${store.slug}/`;
    const page = await readPublic(url, `${store.slug}.html`);
    const data = [...page.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(value => JSON.parse(value[1])).find(value => value["@type"] === "LocalBusiness");
    if (!data?.geo || data.branchCode !== store.id) throw new Error(`Store identity or coordinates missing: ${store.slug}`);
    return { id: `apple-${store.id.toLowerCase()}`, slug: store.slug, retailer: "apple", name: `Apple ${store.name}`, country: "US", city: store.address.city, region: store.address.stateCode, postalCode: store.address.postalCode, address: [store.address.address1, store.address.address2].filter(Boolean).join(", "), latitude: Number(data.geo.latitude), longitude: Number(data.geo.longitude), url };
  }));
  stores.push(...batch);
  if (offset % 40 === 0) console.log(`Verified ${stores.length}/${entries.length} store addresses.`);
}
await writeFile(new URL("../src/config/stores.json", import.meta.url), JSON.stringify({ reviewedAt: "2026-11-17", source: directoryUrl, stores: stores.sort((a,b) => a.name.localeCompare(b.name)) }, null, 2) + "\n");
console.log(`Saved ${stores.length} official US store locations. No inventory collected.`);
