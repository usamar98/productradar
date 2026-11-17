import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Bell } from "lucide-react";
import { Breadcrumbs } from "@/components/radar/breadcrumbs";
import { DataNotice, EventLog, RetailerLogo, RetailerTable } from "@/components/radar/public";
import { dateTime, getItem, money, sourceState } from "@/lib/radar/catalog";
import { getProductContent } from "@/lib/radar/product-content";
import { canVisitCatalogSource } from "@/lib/radar/catalog-reference";
import { hasObservations, isCatalogPublished, pageMetadata } from "@/lib/radar/seo";
import styles from "../../product.module.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ item: string; retailer: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { item: slug, retailer } = await params;
  const catalog = await getItem(slug), item = catalog.item;
  const sources = item?.sources.filter(source => source.retailer === retailer) || [];
  return item && sources.length ? pageMetadata({ title: `${item.name} at ${sources[0].label}`, description: `Review ${item.name} configurations, observed prices and stock history at ${sources[0].label}. Keep your chosen variant when setting up an alert.`, path: `/${slug}/at/${retailer}`, indexable: isCatalogPublished(catalog) && hasObservations(sources) }) : { title: "Retailer not found", robots: { index: false } };
}

export default async function RetailerPage({ params }: Props) {
  const { item: slug, retailer } = await params, catalog = await getItem(slug), { item } = catalog;
  const sources = item?.sources.filter(source => source.retailer === retailer) || [];
  if (!item || !sources.length) notFound();
  const label = sources[0].label, retailerItem = { ...item, sources };
  const content = getProductContent(item.slug);
  const lastSeen = sources.flatMap(source => source.events).sort((a, b) => b.seenAt.getTime() - a.seenAt.getTime())[0];
  const periodCount = sources.reduce((sum, source) => sum + source.events.length, 0);
  return <div className="rr-container">
    <Breadcrumbs items={[{ label: "Products", href: "/products" }, { label: item.name, href: `/${slug}` }, { label }]}/>
    <header className={styles.heading}><div><span className="rr-eyebrow">RETAILER & CONFIGURATION</span><div className={styles.retailerIdentity}><RetailerLogo source={sources[0]}/><h1>{item.name} at {label}</h1></div><p>Compare each configuration separately. A status for one variant does not apply to another.</p></div></header>
    <DataNotice available={catalog.available} seeded={catalog.seeded}/>
    {content && <div className={styles.callout}><strong>Current monitoring coverage</strong><p>{content.coverage}</p></div>}
    <div className={styles.stats}><div className={styles.stat}><span>Configurations listed</span><strong>{new Set(sources.map(source => source.variantId)).size}</strong><small>See individual status and price below</small></div><div className={styles.stat}><span>Recorded periods in view</span><strong>{periodCount ? periodCount.toLocaleString("en-US") : "No data yet"}</strong><small>Up to latest 1,000 per variant</small></div><div className={styles.stat}><span>Last seen in stock</span><strong style={{fontSize:18}}>{dateTime(lastSeen?.seenAt)}</strong><small>Latest observed period across configurations</small></div></div>
    <section className={styles.section}><h2>The current stock check</h2><RetailerTable item={item} sources={sources}/></section>
    <section className={styles.section}><h2>Pick the exact configuration.</h2><div className={styles.sourceGrid}>{sources.map(source => {
      const variant = item.variants.find(value => value.id === source.variantId);
      const state = sourceState(source);
      // Paused catalog links are references, not approval to poll or evidence of inventory.
      const canVisit = canVisitCatalogSource(item.slug, source);
      return <article className={styles.sourceCard} id={variant?.slug || source.id} key={source.id}>
        <h3>{variant ? <Link href={`/${slug}/variants/${variant.slug}`}>{variant.label}</Link> : item.name}</h3>
        <span className={`rr-status rr-status-${state.tone}`}><i/>{state.label}</span>
        <dl className={styles.detailList}><div><dt>Last observed price</dt><dd>{source.lastCheckedAt && source.priceCents != null ? money(source.priceCents) : "No data yet"}</dd></div><div><dt>Last check</dt><dd>{dateTime(source.lastCheckedAt)}</dd></div><div><dt>Checking interval</dt><dd>{source.approved && source.status === "active" ? `${source.pollSeconds} seconds, with jitter` : source.status === "on_demand" ? "When you request a check" : "Tracking pending"}</dd></div><div><dt>Market</dt><dd>United States · USD</dd></div></dl>
        <div className={styles.actions}><Link className="rr-button rr-primary" href={`/alerts?item=${slug}&variant=${variant?.slug || source.variantId}&source=${source.id}`}><Bell size={14}/>Set up this alert</Link>{canVisit && <a className="rr-button rr-secondary" href={source.productUrl} target="_blank" rel="noopener noreferrer">View at {label}<ArrowUpRight size={14}/></a>}</div>
        <p className={styles.note}>{canVisit ? "The retailer link identifies this configuration. Confirm price, fulfillment and availability there before purchasing." : "The retailer's exact product link is pending verification."}</p>
      </article>;
    })}</div></section>
    <section className={`rr-panel ${styles.history}`}><header><span className="rr-eyebrow">OBSERVED AT {label.toUpperCase()}</span><h2>The retailer restock log</h2><p className={styles.note}>Latest 30 in-stock periods across the configurations above. All times are UTC.</p></header><EventLog item={retailerItem} limit={30}/></section>
    <p className={styles.note}>Unknown, delayed and blocked checks cannot establish current availability. See <Link href="/methodology">how we measure stock</Link> for coverage, freshness and event definitions.</p>
    <nav className={styles.tabs} aria-label="Related product pages"><Link href={`/${slug}`}>All {item.name} retailers</Link><Link href={`/${slug}/restocks`}>Restock history</Link><Link href={`/how-to-get-${slug}`}>Buying guide</Link><Link href="/products">Browse products</Link></nav>
  </div>;
}
