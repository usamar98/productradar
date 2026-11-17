import { getAuth } from "@/lib/auth";
import { apiError } from "@/lib/security";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return await getAuth().handler(request); } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try { return await getAuth().handler(request); } catch (error) { return apiError(error); }
}
