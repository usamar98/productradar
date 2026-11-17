import type { Metadata } from "next";
import { ManageAlerts } from "@/components/radar/manage-alerts";

export const metadata: Metadata = { title: "Your alerts", description: "Manage your Restock Radar alerts, browser notifications, and billing.", robots: { index: false, follow: false } };
export default async function ManageAlertsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <div className="rr-container"><ManageAlerts checkoutReturned={query.checkout === "success"} expiredLogin={query.login === "expired"}/></div>;
}
