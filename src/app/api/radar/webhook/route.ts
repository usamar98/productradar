import { apiError, HttpError, readTextLimited } from "@/lib/security";
import { verifyPaymentWebhook } from "@/lib/payments";
import { processRadarWebhook } from "@/lib/radar/billing";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new HttpError(400, "Payment signature is missing.");
    const event = verifyPaymentWebhook(await readTextLimited(request, 1_048_576), signature);
    const result = await processRadarWebhook(event);
    return Response.json({ received: true, ...result });
  } catch (error) { return apiError(error); }
}
