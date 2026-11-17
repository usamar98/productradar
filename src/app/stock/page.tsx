import { getCatalog } from "@/lib/radar/catalog";
import { getLaunchProduct } from "@/config/launch-catalog";
import { StockFinder } from "@/components/radar/stock-finder";
import { pageMetadata } from "@/lib/radar/seo";
import { Breadcrumbs } from "@/components/radar/breadcrumbs";
export const metadata = pageMetadata({ title: "Free stock checker — find stores by ZIP code", description: "Find nearby Apple Stores by US ZIP code, city or current location. Compare exact product configurations, recorded pickup availability and online retailers.", path: "/stock" });
export default async function StockPage({ searchParams }: { searchParams: Promise<{ item?: string; variant?: string; zip?: string }> }) {
  const catalog = await getCatalog(), query = await searchParams;
  const items = catalog.items.filter(item => item.variants.length).map(item => ({ slug: item.slug, name: item.name, brand: getLaunchProduct(item.slug)?.brand, variants: item.variants.map(({ slug, label }) => ({ slug, label })) }));
  return <div className="rr-container"><Breadcrumbs items={[{label:"Products",href:"/products"},{label:"Check stock"}]}/><header className="rr-page-intro"><span className="rr-eyebrow">THE FREE STOCK CHECK</span><h1>Your next find.<br/>Closer than you think.</h1><p>Choose your exact product. Find nearby stores by ZIP, then check the latest recorded availability. Your first connected alert is free.</p></header><StockFinder key={`${query.item || ""}:${query.variant || ""}:${query.zip || ""}`} items={items} initialItem={query.item} initialVariant={query.variant} initialZip={query.zip}/></div>;
}
