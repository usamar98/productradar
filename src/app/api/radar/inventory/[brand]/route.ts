import { apiError, HttpError, readTextLimited } from "@/lib/security";
import { feedSecret, isFeedBrand, verifyInventory } from "@/lib/radar/inventory-feed-auth";
import { receiveInventory } from "@/lib/radar/inventory-feed";
import { assertLocalRequest } from "@/lib/radar/local-mode";
import { isLocalTestMode } from "@/lib/radar/local-test";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ brand: string }> }) {
  try {
    const { brand } = await context.params;
    if (!isFeedBrand(brand)) throw new HttpError(404, "Unknown inventory feed.");
    const key = feedSecret(brand);
    if (!key) throw new HttpError(503, "This inventory feed has not been configured.");
    if (isLocalTestMode()) assertLocalRequest(request);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new HttpError(415, "JSON content is required.");
    const body = await readTextLimited(request, 8192);
    verifyInventory(brand, key, request.headers, body);
    let value: unknown;
    try { value = JSON.parse(body); } catch { throw new HttpError(400, "Invalid JSON."); }
    return Response.json(await receiveInventory(brand, value), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
