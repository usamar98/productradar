import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocalTestMode } from "@/lib/radar/local-test";
import { assertLocalRequest } from "@/lib/radar/local-mode";
import { LocalTestPanel } from "@/components/radar/local-test-panel";

export const metadata = { title: "Local flow test lab", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function LocalTestPage() {
  if (!isLocalTestMode()) notFound();
  try { assertLocalRequest({headers:await headers()}); } catch { notFound(); }
  return <div className="rr-container rr-page-content"><header className="rr-page-intro"><h1>Local test lab</h1><p>Try restock emails for Apple pickup, PlayStation Direct and NVIDIA Marketplace. You control the inventory. Messages arrive in the local inbox.</p></header><LocalTestPanel/></div>;
}
