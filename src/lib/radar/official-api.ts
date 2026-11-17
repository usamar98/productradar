import { assertUnblockedResponse, BlockedSourceError, validatePublicUrl } from "./source-http";

/** Exact anonymous storefront operations verified with ordinary requests, not a general proxy. */
export function isPublicInventoryOperation(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return false;
  return (url.hostname === "www.apple.com" && url.pathname === "/shop/retail/pickup-message")
    || (url.hostname === "api.direct.playstation.com" && url.pathname === "/commercewebservices/ps-direct-us/users/anonymous/products/productList")
    || (url.hostname === "api.nvidia.partners" && url.pathname === "/edge/product/search");
}

export async function readOfficialResource(value: string): Promise<string> {
  if (isPublicInventoryOperation(value)) {
    // A deliberate lookup of a fixed public API operation is separate from page crawling.
    // API gateways can return 403 for an unimplemented /robots.txt while this operation is 200.
    // Do not fall back to other hosts, authenticated sessions, or browser impersonation.
    // These fixed vendor hosts are not user-configurable URLs. Reject private DNS and
    // redirects as well; generic source URLs continue to use the DNS-pinned crawler.
    await validatePublicUrl(value);
    const response = await fetch(value, {
      method: "GET", redirect: "error", credentials: "omit", cache: "no-store",
      headers: { "User-Agent": "RestockRadar/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if ([401, 403, 429].includes(response.status)) {
      await response.body?.cancel();
      throw new BlockedSourceError(`Official inventory API returned HTTP ${response.status}; requests stopped.`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("The official inventory API returned an empty response.");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        bytes += chunk.byteLength;
        if (bytes > 2_000_000) throw new Error("Official inventory response exceeded the size limit.");
        chunks.push(chunk);
      }
    } finally { await reader.cancel(); }
    const text = Buffer.concat(chunks).toString("utf8");
    assertUnblockedResponse({ status: response.status, text });
    if (response.status !== 200) throw new Error(`Official inventory API returned HTTP ${response.status}.`);
    return text;
  }
  throw new BlockedSourceError("This URL is not a reviewed official inventory operation.");
}
