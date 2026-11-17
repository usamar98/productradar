import type { Metadata } from "next";
import { getCatalog } from "@/lib/radar/catalog";
import { CreateAlert } from "@/components/radar/create-alert";
import { PageIntro } from "@/components/radar/public";
export const metadata: Metadata = { title: "Create a restock alert", description: "Choose your item, edition, retailers and plan. Set up email and browser push alerts with Restock Radar.", alternates: { canonical: "/alerts" }, robots: { index: false } };
export default async function AlertsPage({ searchParams }: { searchParams: Promise<{item?: string; variant?: string; plan?: string; source?: string; zip?: string}> }) {
  const catalog = await getCatalog(); const query = await searchParams;
  const items = catalog.items.map(item => ({ id:item.id,slug:item.slug,name:item.name,variants:item.variants.map(variant => ({id:variant.id,slug:variant.slug,label:variant.label})),sources:item.sources.map(source => ({id:source.id,variantId:source.variantId,label:source.label,approved:source.approved,status:source.status,locationId:source.locationId,fulfillment:source.fulfillment})) }));
  return <div className="rr-container"><PageIntro eyebrow="YOUR FIRST ALERT IS FREE" title="Your next find, one alert away." description="One configuration. One connected retailer or store. 14 days of alerts, with no card required."/><CreateAlert key={`${query.item || ""}:${query.variant || ""}:${query.source || ""}:${query.plan || ""}`} items={items} initialItem={query.item} initialVariant={query.variant} initialPlan={query.plan} initialSource={query.source} initialZip={query.zip} available={catalog.available && catalog.seeded}/></div>;
}
