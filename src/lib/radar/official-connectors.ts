import stores from "@/config/stores.json";
import officialProducts from "@/config/official-products.json";
import type { StockCheck } from "./domain";
import type { Connector, ConnectorSource } from "./source-types";
import { BlockedSourceError } from "./source-http";
import { readOfficialResource } from "./official-api";

export const officialConnectorNames = ["apple-pickup", "playstation-direct", "nvidia-store"] as const;
export type OfficialConnectorName = typeof officialConnectorNames[number];
export const isOfficialConnector = (name: string): name is OfficialConnectorName => officialConnectorNames.some(value => value === name);
export const officialMinPollSeconds = 300;
export const officialProviderIntervalSeconds = 60;

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
function readJson(text: string): unknown {
  try { return JSON.parse(text); } catch { throw new Error("The official store returned an unreadable response; availability is unknown."); }
}
function nodes(value: unknown): ObjectValue[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  const record = object(value);
  return Object.keys(record).length ? [record, ...nodes(record["@graph"])] : [];
}
const sameUrl = (value: unknown, expected: string) => typeof value === "string" && value.replace(/\/$/, "") === expected.replace(/\/$/, "");
const usdCents = (value: unknown, currency: unknown) => {
  const amount = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return currency === "USD" && Number.isFinite(amount) && amount > 0 && amount < 10_000_000 ? Math.round(amount * 100) : undefined;
};

/** Product identity comes from the exact purchase page, never a guessed SKU. */
export function appleProductIdentity(html: string, productUrl: string) {
  const products: ObjectValue[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { products.push(...nodes(JSON.parse(match[1])).filter(node => node["@type"] === "Product" && sameUrl(node.url, productUrl))); } catch { /* Skip unrelated malformed structured data. */ }
  }
  if (products.length !== 1) throw new Error("Apple did not identify this exact product configuration.");
  const offers = nodes(products[0].offers).filter(node => node["@type"] === "Offer");
  if (offers.length !== 1 || typeof offers[0].sku !== "string") throw new Error("Apple did not provide one exact part number.");
  const [partNumber, option, ...extra] = offers[0].sku.split("+");
  if (!/^[A-Z0-9]{5,12}\/A$/.test(partNumber) || extra.length || (option && option !== "unlocked")) throw new Error("This Apple part or purchase option is not supported by the US pickup connector.");
  return { partNumber, priceCents: usdCents(offers[0].price, offers[0].priceCurrency) };
}

export function applePickupUrl(partNumber: string, storeNumber: string, zip: string) {
  if (!/^[A-Z0-9]{5,12}\/A$/.test(partNumber) || !/^R\d{3,5}$/.test(storeNumber) || !/^\d{5}$/.test(zip)) throw new Error("Apple pickup requires an exact US part, store and ZIP code.");
  const url = new URL("https://www.apple.com/shop/retail/pickup-message");
  url.search = new URLSearchParams({ pl: "true", location: zip, "parts.0": partNumber }).toString();
  return url.href;
}

/** Reviewed catalog identities, extracted from the manufacturer's own purchase pages.
 * Stock lookups do not re-scrape product HTML or guess IDs from product names. */
export function reviewedAppleIdentity(productUrl: string) {
  const identity = officialProducts.apple.find(product => product.productUrl === productUrl);
  if (!identity) throw new Error("This exact Apple configuration has no verified US part number yet.");
  return { partNumber: identity.partNumber };
}

export function parseApplePickup(payload: unknown, partNumber: string, storeNumber: string): StockCheck {
  const root = object(payload), body = object(root.body), content = object(body.content), pickup = object(content.pickupMessage);
  if (object(root.head).status !== "200" && object(root.head).status !== 200) throw new Error("Apple did not return a successful availability response.");
  const storeRows = body.stores ?? pickup.stores;
  if (!Array.isArray(storeRows)) throw new Error("Apple returned no store availability data.");
  const matched = storeRows.map(object).filter(store => store.storeNumber === storeNumber);
  if (matched.length !== 1) throw new Error("Apple did not return the selected store; availability is unknown.");
  const part = object(object(matched[0].partsAvailability)[partNumber]);
  // Missing entries, omitted stores, recommendations and future pickup dates are not stock.
  if (!Object.keys(part).length) throw new Error("Apple did not return the selected part at this store.");
  if (part.partNumber != null && part.partNumber !== partNumber) throw new Error("Apple returned a mismatched part number.");
  if (part.pickupDisplay === "available") {
    if (object(part.buyability).isBuyable === false || part.storePickEligible === false) return { inStock: false, raw: "Apple: selected part is not eligible for pickup" };
    return { inStock: true, raw: `Apple pickup: ${storeNumber} / ${partNumber}` };
  }
  if (["unavailable", "notAvailable", "ineligible"].includes(String(part.pickupDisplay))) return { inStock: false, raw: `Apple pickup: ${String(part.pickupDisplay)}` };
  throw new Error("Apple returned an unrecognized pickup state; availability is unknown.");
}

/** Primary hero attributes are used instead of recommendation SKUs elsewhere in the page. */
export function playStationProductIdentity(html: string) {
  const heroes = [...html.matchAll(/<div\b[^>]*class=["'][^"']*\bproductHero-component\b[^"']*["'][^>]*>/gi)];
  const codes = [...new Set(heroes.map(match => /data-product-code=["'](\d{8,14})["']/i.exec(match[0])?.[1]).filter(Boolean))];
  if (codes.length !== 1) throw new Error("PlayStation did not identify one exact product code.");
  return codes[0]!;
}
export function playStationProductUrl(code: string) {
  if (!/^\d{8,14}$/.test(code)) throw new Error("Invalid PlayStation product code.");
  const url = new URL("https://api.direct.playstation.com/commercewebservices/ps-direct-us/users/anonymous/products/productList");
  url.search = new URLSearchParams({ fields: "BASIC", productCodes: code }).toString();
  return url.href;
}
export function parsePlayStationProducts(payload: unknown, code: string): StockCheck {
  const products = object(payload).products;
  if (!Array.isArray(products)) throw new Error("PlayStation returned no product availability data.");
  const matched = products.map(object).filter(product => product.code === code);
  if (matched.length !== 1) throw new Error("PlayStation did not return the exact requested product.");
  const product = matched[0], stock = object(product.stock), price = object(product.price);
  if (typeof product.purchasable !== "boolean" || !["inStock", "lowStock", "outOfStock", "comingSoon"].includes(String(stock.stockLevelStatus))) throw new Error("PlayStation returned an unrecognized orderability state.");
  return {
    inStock: product.purchasable && product.preOrderProduct !== true && ["inStock", "lowStock"].includes(String(stock.stockLevelStatus)),
    priceCents: usdCents(price.value, price.currencyIso),
    raw: `PlayStation Direct US online: ${String(stock.stockLevelStatus)}${product.loginGated ? "; sign-in required to buy" : ""}${product.psPlusGated ? "; PlayStation Plus required" : ""}`,
  };
}

export function nvidiaProductsUrl(productUrl: string) {
  const url = new URL(productUrl);
  const match = /^\/en-us\/consumer\/graphics-cards\/geforce-rtx-(\d{4}(?:-ti)?)-founders-edition\/?$/.exec(url.pathname);
  if (url.hostname !== "marketplace.nvidia.com" || !match) throw new Error("Select an exact NVIDIA US Founders Edition listing.");
  const api = new URL("https://api.nvidia.partners/edge/product/search");
  api.search = new URLSearchParams({ page: "1", limit: "12", locale: "en-us", gpu: `RTX ${match[1].replace("-ti", " Ti")}`, manufacturer: "NVIDIA" }).toString().replaceAll("+", "%20");
  return api.href;
}

export function parseNvidiaProducts(payload: unknown, productUrl: string): StockCheck {
  const details = object(object(payload).searchedProducts).productDetails;
  if (!Array.isArray(details)) throw new Error("NVIDIA returned no product availability data.");
  const matches = details.map(object).filter(product => sameUrl(product.internalLink, productUrl) && product.manufacturer === "NVIDIA" && product.isFounderEdition === true && product.locale === "US");
  if (matches.length !== 1) throw new Error("NVIDIA did not return one exact US Founders Edition product.");
  const product = matches[0];
  const offers = Array.isArray(product.retailers) ? product.retailers.map(object).filter(offer => sameUrl(offer.purchaseLink, productUrl) && offer.sku === product.productSKU) : [];
  if (offers.length !== 1 || !product.productSKU) throw new Error("NVIDIA did not return its own exact-product offer.");
  // isAvailable describes a retailer listing, not GPU stock: observed true alongside stock:0.
  if (product.productAvailable === false && product.prdStatus === "out_of_stock" && offers[0].stock === 0) return { inStock: false, priceCents: usdCents(offers[0].salePrice, "USD"), raw: "NVIDIA official US product API: out_of_stock" };
  if (product.productAvailable === true && product.prdStatus === "in_stock" && typeof offers[0].stock === "number" && offers[0].stock > 0) return { inStock: true, priceCents: usdCents(offers[0].salePrice, "USD"), raw: "NVIDIA official US product API: in_stock" };
  throw new Error("NVIDIA availability signals disagree or are incomplete; stock is unknown.");
}

export async function lookupApplePickup(productUrl: string, zip: string, read: Reader = readOfficialResource) {
  if (!/^\d{5}$/.test(zip)) throw new Error("Apple pickup requires a US ZIP code.");
  const identity = reviewedAppleIdentity(productUrl);
  const url = new URL("https://www.apple.com/shop/retail/pickup-message");
  url.search = new URLSearchParams({ pl: "true", location: zip, "parts.0": identity.partNumber }).toString();
  const payload = readJson(await read(url.href));
  const rows = object(object(payload).body).stores;
  if (!Array.isArray(rows) || !rows.length) throw new Error("Apple returned no stores for this lookup.");
  const observations: { locationId: string; result: StockCheck | null; error: string | null }[] = [];
  for (const store of rows.map(object)) {
    if (typeof store.storeNumber !== "string" || !/^R\d{3,5}$/.test(store.storeNumber)) continue;
    const locationId = `apple-${store.storeNumber.toLowerCase()}`;
    if (!stores.stores.some(location => location.id === locationId)) continue;
    try { observations.push({ locationId, result: parseApplePickup(payload, identity.partNumber, store.storeNumber), error: null }); }
    catch (error) { observations.push({ locationId, result: null, error: error instanceof Error ? error.message : "Apple stock is unknown." }); }
  }
  if (!observations.length) throw new Error("Apple returned no recognized US stores.");
  return { observations, checkedAt: new Date(), partNumber: identity.partNumber };
}

export function validateOfficialSource(source: Pick<ConnectorSource, "connector" | "productUrl" | "locationId" | "fulfillment">) {
  const url = new URL(source.productUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) throw new Error("Use the exact official US product URL without credentials or fragments.");
  if (source.connector === "apple-pickup") {
    // Some exact Apple configurations use a reviewed product query (Watch), or
    // a single-SKU family URL (Apple TV). Never accept an arbitrary family URL.
    if (url.hostname !== "www.apple.com" || !officialProducts.apple.some(product => product.productUrl === source.productUrl)) throw new Error("Apple pickup needs a fully selected, reviewed Apple purchase URL.");
    const store = stores.stores.find(store => store.id === source.locationId);
    if (source.fulfillment !== "pickup" || !store || !/^apple-r\d{3,5}$/.test(store.id)) throw new Error("Select a known US Apple Store for pickup.");
  } else if (source.connector === "playstation-direct") {
    if (url.search || url.hostname !== "direct.playstation.com" || !/^\/en-us\/buy-[a-z-]+\/[^/]+\/?$/.test(url.pathname) || source.fulfillment === "pickup" || source.locationId) throw new Error("PlayStation Direct needs an exact US product URL with online fulfillment.");
  } else if (source.connector === "nvidia-store") {
    if (url.search || url.hostname !== "marketplace.nvidia.com" || !/^\/en-us\/consumer\/graphics-cards\/geforce-rtx-[a-z0-9-]+-founders-edition\/?$/.test(url.pathname) || source.fulfillment === "pickup" || source.locationId) throw new Error("NVIDIA needs an exact US Founders Edition listing with online fulfillment.");
  } else throw new Error("Unknown official connector.");
}

type Reader = (url: string) => Promise<string>;
/** One caller-requested public lookup. This does not approve a source for background monitoring. */
export async function lookupOfficialOnline(source: Pick<ConnectorSource, "connector" | "productUrl" | "fulfillment" | "locationId">, read: Reader = readOfficialResource): Promise<StockCheck> {
  validateOfficialSource(source);
  if (source.connector === "playstation-direct") {
    const code = officialProducts.playstation.find(product => product.productUrl === source.productUrl)?.productCode;
    if (!code) throw new Error("This PlayStation product has no verified US product code yet.");
    return parsePlayStationProducts(readJson(await read(playStationProductUrl(code))), code);
  }
  if (source.connector === "nvidia-store") return parseNvidiaProducts(readJson(await read(nvidiaProductsUrl(source.productUrl))), source.productUrl);
  throw new Error("This official source requires an Apple pickup location.");
}
/** Injectable HTTP boundary lets tests exercise contracts without contacting retailers. */
export function createOfficialConnectors(read: Reader = readOfficialResource): Record<OfficialConnectorName, Connector> {
  function checked(check: (source: ConnectorSource) => Promise<StockCheck>): Connector {
    return { async check(source) {
      if (!source.approved) throw new BlockedSourceError("Official-store monitoring has not been approved for this source.");
      validateOfficialSource(source);
      return check(source);
    } };
  }
  return {
    "apple-pickup": checked(async source => {
      const store = stores.stores.find(store => store.id === source.locationId)!;
      const identity = reviewedAppleIdentity(source.productUrl);
      const storeNumber = store.id.slice("apple-".length).toUpperCase();
      const payload = readJson(await read(applePickupUrl(identity.partNumber, storeNumber, store.postalCode.slice(0, 5))));
      return parseApplePickup(payload, identity.partNumber, storeNumber);
    }),
    "playstation-direct": checked(source => lookupOfficialOnline(source, read)),
    "nvidia-store": checked(source => lookupOfficialOnline(source, read)),
  };
}

export const officialConnectors = createOfficialConnectors();
