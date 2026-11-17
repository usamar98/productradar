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
  return <div className="rr-container rr-page-content"><header className="rr-page-intro"><span className="rr-eyebrow">A COMPLETE FLOW, WITH CONTROLLED INVENTORY</span><h1>Your local test lab.</h1><p>Stripe Checkout and webhook verification use a real Stripe sandbox. The stock changes below are deliberate simulations in a separate database. Email stays in your local inbox.</p></header><LocalTestPanel/></div>;
}
