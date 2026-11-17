import type { Metadata } from "next";
import { adminSummary, isAdmin } from "@/lib/radar/admin";
import { AdminPanel } from "./panel";

export const metadata: Metadata = { title: "Administration", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const authenticated = await isAdmin();
  let data: Awaited<ReturnType<typeof adminSummary>> | null = null;
  let unavailable = false;
  if (authenticated) { try { data = await adminSummary(); } catch { unavailable = true; } }
  return <AdminPanel authenticated={authenticated} configured={Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 16)} unavailable={unavailable} data={data ? JSON.parse(JSON.stringify(data)) : null} />;
}
