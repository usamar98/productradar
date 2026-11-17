import { getCatalog, siteUrl } from "@/lib/radar/catalog";
import { getProductContent } from "@/lib/radar/product-content";
import { hasObservations, isCatalogPublished } from "@/lib/radar/seo";

export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await getCatalog();
  const items = isCatalogPublished(catalog) ? catalog.items.filter(item => !item.hidden && getProductContent(item.slug)) : [];
  const products = items.length ? items.map(item => {
    const observed = hasObservations(item.sources);
    return [
      `- [${item.name}](${siteUrl}/${item.slug}): ${observed ? "Recorded retailer availability; check each source timestamp and status." : "Product information and retailer links. No stock observations have been recorded yet; tracking is pending."}`,
      `- [How to get ${item.name}](${siteUrl}/how-to-get-${item.slug}): Buying guidance with official sources.`,
      ...(observed ? [`- [${item.name} restock history](${siteUrl}/${item.slug}/restocks): Recorded availability periods; historical observations do not predict the next restock.`] : []),
    ].join("\n");
  }).join("\n") : "No published product catalog is available right now. Preview product information is not live stock data.";

  const text = `# Restock Radar

> An independent product stock-checking and restock-alert service. Browse product information and recorded retailer checks for free. Alert plans support selected product variants and retailers, with email and browser push delivery.

## Product coverage
${products}

## Find information
- [Products](${siteUrl}/products): Published product directory and tracking coverage.
- [Buying guides](${siteUrl}/guides): Product-specific buying advice and official links.
- [How stock is checked](${siteUrl}/methodology): Source permissions, freshness, event definitions and limitations.
- [Proof](${siteUrl}/proof): The record of observations, sent alerts and source-linked customer posts, if any. Empty sections mean no evidence has been recorded.
- [Pricing](${siteUrl}/pricing): Plan limits and the until-caught pass.
- [Sitemap](${siteUrl}/sitemap.xml): Public pages eligible for indexing.

## Accuracy and scope
Stock is an observation at a recorded timestamp, not a guarantee of current availability or a reserved purchase. Unknown, pending and delayed checks do not mean sold out. A configured retailer link does not mean its inventory is connected or monitored. Historical records remain historical when a source is paused. Read each product page for its actual retailer coverage.

Restock Radar does not sell these products, reserve inventory, auto-purchase or complete checkout. Buy directly from the retailer and confirm its current price, availability and delivery options. No Apple Store location or city-level pickup coverage is claimed. The service is not affiliated with manufacturers or retailers. Payments are currently in Stripe test mode. No guaranteed alert speed, traffic, customer results or revenue is claimed.

## Policies
- [Terms](${siteUrl}/terms)
- [Privacy](${siteUrl}/privacy)
- [Refunds](${siteUrl}/refunds)
- [Contact](${siteUrl}/contact)
`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
