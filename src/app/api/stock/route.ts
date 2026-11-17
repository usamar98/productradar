import { publicStock } from "@/lib/stock";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await publicStock(), { headers: { "Cache-Control": "no-store" } });
}
