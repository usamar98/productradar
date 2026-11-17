import type { StockCheck } from "./domain";

function records(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(records);
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  return [object, ...records(object["@graph"])];
}
const typeIs = (value: unknown, type: string) => (Array.isArray(value) ? value : [value]).some((x) => typeof x === "string" && x.replace(/^https?:\/\/schema.org\//, "") === type);
const normalize = (value: string, base?: string) => { const url = new URL(value, base); url.searchParams.sort(); return `${url.origin}${url.pathname.replace(/\/$/, "")}${url.search}`; };
const matchesUrl = (candidate: unknown, expected: string) => { try { return typeof candidate === "string" && normalize(candidate, expected) === normalize(expected); } catch { return false; } };

export function parseJsonLd(html: string, productUrl?: string): StockCheck {
  const all: Record<string, unknown>[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { all.push(...records(JSON.parse(match[1]))); } catch { /* A malformed block must not hide other valid structured data. */ }
  }
  const products = all.filter((node) => typeIs(node["@type"], "Product"));
  let selected = products;
  if (products.length > 1) selected = products.filter((p) => productUrl && matchesUrl(p.url, productUrl));
  if (selected.length !== 1) throw new Error("No unambiguous product JSON-LD found on this exact product page.");
  if (productUrl && selected[0].url != null && !matchesUrl(selected[0].url, productUrl)) throw new Error("Product URL does not match the exact requested item or variant.");
  let offers = records(selected[0].offers).filter((offer) => typeIs(offer["@type"], "Offer"));
  if (offers.length > 1) {
    offers = offers.filter((offer) => productUrl && matchesUrl(offer.url, productUrl));
    if (offers.length !== 1) throw new Error("Multiple offers may represent different variants; use an exact offer URL.");
  }
  if (productUrl && offers.some(offer => offer.url != null && !matchesUrl(offer.url, productUrl))) throw new Error("Offer URL does not match the exact requested item or variant.");
  const states = offers.map((offer) => {
    const availability = typeof offer.availability === "string" ? offer.availability.replace(/^https?:\/\/schema.org\//, "") : "";
    if (!["InStock", "OutOfStock", "SoldOut", "Discontinued", "PreOrder", "PreSale", "BackOrder", "LimitedAvailability"].includes(availability)) return null;
    const amount = typeof offer.price === "string" || typeof offer.price === "number" ? Number(offer.price) : NaN;
    const price = offer.priceCurrency === "USD" && Number.isFinite(amount) && amount > 0 && amount < 10_000_000 ? Math.round(amount * 100) : undefined;
    // Limited availability is not a confirmed orderable state.
    return { inStock: availability === "InStock", priceCents: price, raw: availability };
  }).filter((value) => value !== null);
  if (!states.length) throw new Error("No recognized Offer availability found in product JSON-LD.");
  // Ambiguous offers can represent different editions; require agreement.
  if (states.some((value) => value.inStock !== states[0].inStock)) throw new Error("Product offers disagree about availability; select an exact variant URL.");
  return states[0];
}
