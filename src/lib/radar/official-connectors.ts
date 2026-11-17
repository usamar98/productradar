import stores from "@/config/stores.json";
import type { StockCheck } from "./domain";
import type { Connector, ConnectorSource } from "./source-types";
import { BlockedSourceError, fetchSourceText } from "./source-http";
import { parseJsonLd } from "./jsonld";

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
  if (!/^[A-Z0-9]{5,12}LL\/A$/.test(partNumber) || extra.length || (option && option !== "unlocked")) throw new Error("This Apple part or purchase option is not supported by the US pickup connector.");
  return { partNumber, priceCents: usdCents(offers[0].price, offers[0].priceCurrency) };
}

export function applePickupUrl(partNumber: string, storeNumber: string, zip: string) {
  if (!/^[A-Z0-9]{5,12}LL\/A$/.test(partNumber) || !/^R\d{3,5}$/.test(storeNumber) || !/^\d{5}$/.test(zip)) throw new Error("Apple pickup requires an exact US part, store and ZIP code.");
  const url = new URL("https://www.apple.com/shop/fulfillment-messages");
  url.search = new URLSearchParams({ fae: "true", pl: "true", "parts.0": partNumber, location: zip, store: storeNumber }).toString();
  return url.href;
}

export function parseApplePickup(payload: unknown, partNumber: string, storeNumber: string): StockCheck {
  const root = object(payload), body = object(root.body), content = object(body.content), pickup = object(content.pickupMessage);
  if (object(root.head).status !== "200" && object(root.head).status !== 200) throw new Error("Apple did not return a successful availability response.");
  if (!Array.isArray(pickup.stores)) throw new Error("Apple returned no store availability data.");
  const matched = pickup.stores.map(object).filter(store => store.storeNumber === storeNumber);
  if (matched.length !== 1) throw new Error("Apple did not return the selected store; availability is unknown.");
  const part = object(object(matched[0].partsAvailability)[partNumber]);
  // Missing entries, omitted stores, recommendations and future pickup dates are not stock.
  if (!Object.keys(part).length) throw new Error("Apple did not return the selected part at this store.");
  if (part.pickupDisplay === "available") {
    if (object(part.buyability).isBuyable === false) return { inStock: false, raw: "Apple: selected part is not buyable" };
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
  if (product.loginGated === true || product.psPlusGated === true) throw new Error("PlayStation requires an account or membership check; public availability is unknown.");
  if (typeof product.purchasable !== "boolean" || !["inStock", "lowStock", "outOfStock", "comingSoon"].includes(String(stock.stockLevelStatus))) throw new Error("PlayStation returned an unrecognized orderability state.");
  return {
    inStock: product.purchasable && product.preOrderProduct !== true && ["inStock", "lowStock"].includes(String(stock.stockLevelStatus)),
    priceCents: usdCents(price.value, price.currencyIso),
    raw: `PlayStation Direct US online: ${String(stock.stockLevelStatus)}`,
  };
}

export function validateOfficialSource(source: Pick<ConnectorSource, "connector" | "productUrl" | "locationId" | "fulfillment">) {
  const url = new URL(source.productUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.search) throw new Error("Use the exact official US product URL without credentials, query parameters or fragments.");
  if (source.connector === "apple-pickup") {
    if (url.hostname !== "www.apple.com" || !/^\/shop\/buy-[a-z-]+\/[^/]+\/[^/]+\/?$/.test(url.pathname)) throw new Error("Apple pickup needs a fully selected Apple purchase URL.");
    const store = stores.stores.find(store => store.id === source.locationId);
    if (source.fulfillment !== "pickup" || !store || !/^apple-r\d{3,5}$/.test(store.id)) throw new Error("Select a known US Apple Store for pickup.");
  } else if (source.connector === "playstation-direct") {
    if (url.hostname !== "direct.playstation.com" || !/^\/en-us\/buy-[a-z-]+\/[^/]+\/?$/.test(url.pathname) || source.fulfillment === "pickup" || source.locationId) throw new Error("PlayStation Direct needs an exact US product URL with online fulfillment.");
  } else if (source.connector === "nvidia-store") {
    if (url.hostname !== "marketplace.nvidia.com" || !/^\/en-us\/consumer\/graphics-cards\/geforce-rtx-[a-z0-9-]+-founders-edition\/?$/.test(url.pathname) || source.fulfillment === "pickup" || source.locationId) throw new Error("NVIDIA needs an exact US Founders Edition listing with online fulfillment.");
  } else throw new Error("Unknown official connector.");
}

type Reader = (url: string) => Promise<string>;
/** Injectable HTTP boundary lets tests exercise contracts without contacting retailers. */
export function createOfficialConnectors(read: Reader = fetchSourceText): Record<OfficialConnectorName, Connector> {
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
      const identity = appleProductIdentity(await read(source.productUrl), source.productUrl);
      const storeNumber = store.id.slice("apple-".length).toUpperCase();
      const payload = readJson(await read(applePickupUrl(identity.partNumber, storeNumber, store.postalCode.slice(0, 5))));
      return { ...parseApplePickup(payload, identity.partNumber, storeNumber), priceCents: identity.priceCents };
    }),
    "playstation-direct": checked(async source => {
      const code = playStationProductIdentity(await read(source.productUrl));
      // fetchSourceText independently checks api.direct.playstation.com's robots.txt.
      return parsePlayStationProducts(readJson(await read(playStationProductUrl(code))), code);
    }),
    "nvidia-store": checked(async source => {
      // Never infer stock from "Add to cart" text: the blocked/dynamic page can contain both states.
      return parseJsonLd(await read(source.productUrl), source.productUrl);
    }),
  };
}

export const officialConnectors = createOfficialConnectors();
