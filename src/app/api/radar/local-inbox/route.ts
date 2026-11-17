import { apiError } from "@/lib/security";
import { listLocalEmails } from "@/lib/radar/email";
import { assertLocalRequest } from "@/lib/radar/local-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

export async function GET(request: Request) {
  try {
    assertLocalRequest(request);
    return Response.json({ label: "Local inbox — messages are captured, not emailed", messages: await listLocalEmails() }, { headers: privateHeaders });
  } catch (error) {
    const response = apiError(error);
    for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
    return response;
  }
}
