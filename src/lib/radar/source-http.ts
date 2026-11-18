import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

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
export async function safeFetch(value: string, redirects = 0, allowRedirects: boolean | "publisher-file" = true): Promise<{ status: number; text: string; location?: string }> {
  if (redirects > 3) throw new Error("Too many source redirects.");
  const { url, address } = await validatePublicUrl(value);
  const response = await new Promise<{ status: number; text: string; location?: string }>((resolve, reject) => {
    const req = request(url, {
      headers: { "User-Agent": `RestockRadar/1.0 (+${process.env.APP_URL || "https://example.com"}; stock availability monitoring)`, Accept: "application/json,text/html,application/ld+json,text/plain", "Accept-Encoding": "identity" },
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
    // An authenticated publisher's file may live on a CDN. Every hop still uses a public, pinned HTTPS address.
    if (next.origin !== url.origin && allowRedirects !== "publisher-file") throw new BlockedSourceError("Source redirects to another origin; review its URL and permission.");
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

const robotsCache = new Map<string, { expires: number; text: string }>();
export async function fetchSourceText(value: string): Promise<string> {
  const url = new URL(value);
  let robots = robotsCache.get(url.origin);
  if (!robots || robots.expires <= Date.now()) {
    const response = await safeFetch(`${url.origin}/robots.txt`);
    assertUnblockedResponse(response, true);
    if (response.status !== 404 && response.status !== 200) throw new Error("Could not verify robots.txt; polling suspended until the next retry.");
    robots = { expires: Date.now() + 3_600_000, text: response.status === 404 ? "" : response.text }; robotsCache.set(url.origin, robots);
  }
  if (!robotsAllows(robots.text, `${url.pathname}${url.search}`)) throw new BlockedSourceError("robots.txt disallows this product path for RestockRadar.");
  const response = await safeFetch(value, 0, false);
  assertUnblockedResponse(response);
  if (response.status !== 200) throw new Error(`Retailer returned HTTP ${response.status}.`);
  return response.text;
}
