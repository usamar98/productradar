import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import type { StockCheck } from "./domain";

export type ConnectorSource = { id: string; productUrl: string; connector: string; approved: boolean; item?: { hidden: boolean } };
export interface Connector { check(source: ConnectorSource): Promise<StockCheck> }
export class BlockedSourceError extends Error {}
export function assertUnblockedResponse(response: { status: number; text: string }, robots = false) {
  const challenge = /(?:verify (?:that )?you are human|captcha|access denied|unusual traffic)/i.test(response.text);
  // A robots directive such as Disallow: /captcha is not a challenge page.
  if (response.status === 403 || response.status === 429 || (challenge && (!robots || /<(?:html|!doctype|body|script|title)\b/i.test(response.text)))) {
    throw new BlockedSourceError(`Retailer protection detected (${response.status}); no further polling.`);
  }
}

export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    const c = Number(address.split(".")[2]);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
  }
  // Restrict IPv6 to globally routable unicast. IPv4-mapped/local/multicast are excluded.
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:db8:/i.test(address);
}

export async function validatePublicUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Sources require a public HTTPS product URL.");
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !publicAddress(entry.address))) throw new Error("Private or reserved source addresses are not allowed.");
  return { url, address: addresses[0] };
}

/** Pin the validated DNS result to the connection to prevent DNS rebinding. */
async function safeFetch(value: string, redirects = 0, allowRedirects = true): Promise<{ status: number; text: string; location?: string }> {
  if (redirects > 3) throw new Error("Too many source redirects.");
  const { url, address } = await validatePublicUrl(value);
  const response = await new Promise<{ status: number; text: string; location?: string }>((resolve, reject) => {
    const req = request(url, {
      headers: { "User-Agent": `RestockRadar/1.0 (+${process.env.APP_URL || "https://example.com"}; stock availability monitoring)`, Accept: "text/html,application/ld+json,text/plain", "Accept-Encoding": "identity" },
      lookup: (_host, options, callback) => options.all ? callback(null, [address]) : callback(null, address.address, address.family),
      timeout: 12_000,
    }, (res) => {
      let body = ""; let size = 0;
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => { size += Buffer.byteLength(chunk); if (size > 2_000_000) { req.destroy(new Error("Source exceeded the response size limit.")); } else body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode || 0, text: body, location: res.headers.location }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("Source request timed out.")));
    req.on("error", reject); req.end();
  });
  if ([301, 302, 303, 307, 308].includes(response.status) && response.location) {
    if (!allowRedirects) throw new BlockedSourceError("Product URL redirects; review the final exact URL and its robots policy before enabling.");
    const next = new URL(response.location, url);
    // Each origin needs an independent terms/robots assessment; do not follow away from it.
    if (next.origin !== url.origin) throw new BlockedSourceError("Source redirects to another origin; review its URL and permission.");
    return safeFetch(next.href, redirects + 1, allowRedirects);
  }
  return response;
}

type RobotRule = { allow: boolean; pattern: string };
export function robotsAllows(text: string, pathname: string, agent = "restockradar") {
  const groups: { agents: string[]; rules: RobotRule[] }[] = [];
  let group = { agents: [] as string[], rules: [] as RobotRule[] };
  let hasDirectives = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#", 1)[0].trim();
    const colon = line.indexOf(":"); if (colon < 0) continue;
    const key = line.slice(0, colon).toLowerCase().trim(), value = line.slice(colon + 1).trim();
    if (key === "user-agent") { if (hasDirectives) { groups.push(group); group = { agents: [], rules: [] }; hasDirectives = false; } group.agents.push(value.toLowerCase()); }
    else if ((key === "allow" || key === "disallow") && group.agents.length) { hasDirectives = true; if (value) group.rules.push({ allow: key === "allow", pattern: value }); }
  }
  groups.push(group);
  const specificity = (agents: string[]) => Math.max(-1, ...agents.map((a) => a === "*" ? 0 : agent.includes(a) ? a.length : -1));
  const best = Math.max(-1, ...groups.map((g) => specificity(g.agents)));
  const rules = groups.filter((g) => specificity(g.agents) === best && best >= 0).flatMap((g) => g.rules);
  const matches = rules.filter((rule) => {
    const end = rule.pattern.endsWith("$");
    const pattern = (end ? rule.pattern.slice(0, -1) : rule.pattern).split("*").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp(`^${pattern}${end ? "$" : ""}`).test(pathname);
  }).sort((a, b) => b.pattern.replaceAll("*", "").length - a.pattern.replaceAll("*", "").length || Number(b.allow) - Number(a.allow));
  return matches[0]?.allow ?? true;
}

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

const robotsCache = new Map<string, { expires: number; text: string }>();
export const jsonldConnector: Connector = { async check(source) {
  if (!source.approved) throw new BlockedSourceError("Operator approval of retailer terms is required before polling.");
  const url = new URL(source.productUrl);
  let robots = robotsCache.get(url.origin);
  if (!robots || robots.expires <= Date.now()) {
    const response = await safeFetch(`${url.origin}/robots.txt`);
    assertUnblockedResponse(response, true);
    if (response.status !== 404 && response.status !== 200) throw new Error("Could not verify robots.txt; polling suspended until the next retry.");
    robots = { expires: Date.now() + 3_600_000, text: response.status === 404 ? "" : response.text }; robotsCache.set(url.origin, robots);
  }
  if (!robotsAllows(robots.text, `${url.pathname}${url.search}`)) throw new BlockedSourceError("robots.txt disallows this product path for RestockRadar.");
  const response = await safeFetch(source.productUrl, 0, false);
  assertUnblockedResponse(response);
  if (response.status !== 200) throw new Error(`Retailer returned HTTP ${response.status}.`);
  return parseJsonLd(response.text, source.productUrl);
} };
export const mockConnector: Connector = { async check(source) {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_MOCK_CONNECTOR !== "true" || source.item?.hidden !== true) throw new BlockedSourceError("Mock checks require ALLOW_MOCK_CONNECTOR=true, development mode, and a hidden test item.");
  return { inStock: Math.random() > 0.5, raw: "development mock" };
} };
export function connectorFor(name: string): Connector {
  if (name === "jsonld") return jsonldConnector;
  if (name === "mock") return mockConnector;
  throw new BlockedSourceError(`Unsupported connector: ${name}`);
}
