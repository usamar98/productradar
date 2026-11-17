import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Bell } from "lucide-react";
import { ProductExperience } from "@/components/radar/product-experience";
import { getLaunchProduct, launchProducts, brands, isRecentLaunch, launchDateLabel } from "@/config/launch-catalog";
import { Breadcrumbs } from "@/components/radar/breadcrumbs";
import { ProductCards } from "@/components/radar/catalog-cards";
import { DataNotice, EventLog, JsonLd, RetailerTable } from "@/components/radar/public";
import { allEvents, dateTime, getItem, siteUrl, sourceState, type PublicItem } from "@/lib/radar/catalog";
import { getProductContent } from "@/lib/radar/product-content";
import { hasObservations, isCatalogPublished, pageMetadata } from "@/lib/radar/seo";
import { prisma } from "@/lib/db";
import styles from "./product.module.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ item: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { item: route } = await params;
  const guide = route.startsWith("how-to-get-");
  const catalog = await getItem(guide ? route.slice(11) : route);
  if (!catalog.item) return { title: "Item not found", robots: { index: false } };
  const item = catalog.item;
  const metadata = pageMetadata({
    title: guide ? `How to get ${item.name}` : `${item.name} stock tracker`,
    description: guide ? `Plan your ${item.name} purchase with configuration advice, official buying links, retailer checks and honest guidance on restock alerts.` : `Explore ${item.name} configurations, retailer availability and restock history. Check coverage and official buying links before setting an alert.`,
    path: `/${route}`, indexable: isCatalogPublished(catalog) && !!getProductContent(item.slug),
  });
  if (!guide && item.imageUrl) {
    const images = [{ url: new URL(item.imageUrl, siteUrl).toString(), alt: item.name }];
    return { ...metadata, openGraph: { ...metadata.openGraph, images }, twitter: { ...metadata.twitter, images } };
  }
  return metadata;
}

function ProductSchema({ item }: { item: PublicItem }) {
  const content = getProductContent(item.slug);
  const offers = item.variants.length === 1 ? item.sources.filter(source => sourceState(source).tone === "green" && source.priceCents != null).map(source => ({ "@type": "Offer", url: source.productUrl, priceCurrency: "USD", price: source.priceCents! / 100, availability: "https://schema.org/InStock", seller: { "@type": "Organization", name: source.label } })) : [];
  return <JsonLd value={{ "@context": "https://schema.org", "@type": "Product", name: item.name, url: `${siteUrl}/${item.slug}`, description: content?.summary || `Observed retailer availability for ${item.name}.`, ...(content ? { brand: { "@type": "Brand", name: content.brand } } : {}), ...(item.imageUrl ? { image: new URL(item.imageUrl, siteUrl).toString() } : {}), ...(offers.length ? { offers } : {}) }}/>;
}

function ProductNavigation({ item, guide = false }: { item: PublicItem; guide?: boolean }) {
  return <nav className={styles.tabs} aria-label="Product navigation"><Link href={`/${item.slug}`} aria-current={!guide ? "page" : undefined}>Stock tracker</Link><Link href={`/${item.slug}/restocks`}>Restock history</Link><Link href={`/how-to-get-${item.slug}`} aria-current={guide ? "page" : undefined}>Buying guide</Link><Link href="/methodology">How we check</Link></nav>;
}

export default async function ProductPage({ params }: Props) {
  const { item: route } = await params;
  const guide = route.startsWith("how-to-get-");
  const catalog = await getItem(guide ? route.slice(11) : route);
  const { item } = catalog;
  if (!item) notFound();
  const content = getProductContent(item.slug);
  const events = allEvents(item);
  const launch = getLaunchProduct(item.slug);
  const publishedSlugs = new Set(catalog.items.map(value => value.slug));
  const models = launch ? launchProducts.filter(value => value.brand === launch.brand && value.family === launch.family && publishedSlugs.has(value.slug)).map(({ slug, name }) => ({ slug, name })) : [];
  let total: number | null = null;
  if (isCatalogPublished(catalog)) {
    try { total = await prisma.radarStockEvent.count({ where: { source: { itemId: item.id, connector: { not: "mock" } } } }); } catch { /* No invented activity when database is unavailable. */ }
  }
  const available = item.sources.filter(source => sourceState(source).tone === "green");
  const observed = hasObservations(item.sources);
  const crumbs = [{ label: "Products", href: "/products" }, launch ? { label: brands[launch.brand].name, href: `/brands/${launch.brand}` } : { label: item.category.name, href: `/categories/${item.category.slug}` }, { label: item.name, ...(guide ? { href: `/${item.slug}` } : {}) }, ...(guide ? [{ label: "Buying guide" }] : [])];
  const coverage = content?.coverage || "Only connected sources can report availability. Check each source's status and timestamp before acting.";

  if (guide) return <div className="rr-container">
    <Breadcrumbs items={crumbs}/>
    <header className={styles.heading}><div><span className="rr-eyebrow">THE BUYING GUIDE</span><h1>How to get {item.name}.</h1><p>{content?.summary || "Choose the right configuration, check the source, and buy directly from the retailer."}</p></div></header>
    <DataNotice available={catalog.available} seeded={catalog.seeded}/><ProductNavigation item={item} guide/>
    <article className={styles.guide}>
      {content && <p className={styles.note}>Editorial review: <time dateTime={content.reviewedAt}>{content.reviewedAt}</time>. Stock timestamps are shown separately and update only after actual checks.</p>}
      <div className={styles.callout}><strong>Current monitoring coverage</strong><p>{coverage}</p><p>{observed ? `${available.length} configuration-and-retailer checks currently show fresh in-stock observations.` : "No stock observations yet. Tracking is pending; we cannot say whether this item is currently available."}</p></div>
      {content?.guideSections.map(section => <section key={section.heading}><h2>{section.heading}</h2><p>{section.body}</p></section>)}
      <h2>Build your buying checklist.</h2><ol>{(content?.buyingNotes || ["Confirm the exact configuration, seller, fulfillment location and final price."]).map(note => <li key={note}>{note}</li>)}</ol>
      <h2>Keep your configuration consistent.</h2><p>Open the configuration you want below. Its stock checks and alert setup use the same variant, so a different color, capacity or edition does not silently replace your choice.</p>
      <ul className={styles.linkList}>{item.variants.map(variant => <li key={variant.id}><Link href={`/${item.slug}/variants/${variant.slug}`}>{item.name} — {variant.label}</Link></li>)}</ul>
      <h2>Read the checks with their timestamps.</h2><p><Link href={`/${item.slug}`}>The {item.name} tracker</Link> separates fresh observations from pending, delayed and blocked checks. A past in-stock period is history, not a reservation. <Link href={`/${item.slug}/restocks`}>Restock history</Link> shows the periods we have actually recorded; it cannot predict the next release.</p>
      <p>Compare a notification with the retailer's current checkout information. Product purchases happen at the retailer. The alert subscription is a separate service, and it cannot guarantee a successful purchase. Our <Link href="/methodology">monitoring methodology</Link> explains the gaps between checks and what each status means.</p>
      {content && <><h2>Official buying references</h2><ul className={styles.linkList}>{content.officialLinks.map(link => <li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a></li>)}</ul></>}
      <div className={styles.actions}><Link className="rr-button rr-primary" href={`/alerts?item=${item.slug}`}><Bell size={16}/>Set up an alert<ArrowRight size={16}/></Link><Link href="/guides" className="rr-button rr-secondary">All buying guides</Link></div>
    </article>
  </div>;

  return <div className={styles.productPage} data-product={item.slug} data-brand={launch?.brand}>
    <div className="rr-container"><Breadcrumbs items={crumbs}/></div>
    <ProductExperience key={item.slug} product={launch} dateLabel={launch && launchDateLabel(launch)} recent={launch && isRecentLaunch(launch)} models={models} item={{ slug: item.slug, name: item.name, imageUrl: item.imageUrl, variants: item.variants.map(({ id, slug, label }) => ({ id, slug, label })) }}/>
    <div className={`rr-container ${styles.productDetails}`}>
    <DataNotice available={catalog.available} seeded={catalog.seeded}/>
    <section className={styles.availabilityIntro} id="availability"><span className="rr-eyebrow">YOUR NEXT MOVE STARTS HERE</span><h2>Availability.<br/><span>Without the guesswork.</span></h2><p>Compare retailer observations for the exact product you want. A pending connection means availability is unknown.</p></section>
    <div className={styles.callout}><strong>Current tracking coverage</strong><p>{coverage}</p></div>
    <div className={styles.stats}><div className={styles.stat}><span>Configurations in stock</span><strong>{observed ? available.length : "No data yet"}</strong><small>Fresh checks, counted per retailer and variant</small></div><div className={styles.stat}><span>Recorded stock periods</span><strong>{total != null && total > 0 ? total.toLocaleString("en-US") : "No data yet"}</strong><small>Observed availability, across sources</small></div><div className={styles.stat}><span>Last seen in stock</span><strong style={{fontSize: 18}}>{dateTime(events[0]?.seenAt)}</strong><small>{events[0]?.source.label || "Awaiting a connected source"}</small></div></div>
    <section className={styles.section}><div className="rr-section-heading"><div><span className="rr-eyebrow">THE STOCK CHECK</span><h2>Find your retailer.</h2></div></div><RetailerTable item={item}/></section>
    <div className={styles.split}><section className={`rr-panel ${styles.history}`}><header><span className="rr-eyebrow">ACTUAL OBSERVATIONS</span><h2>The latest stock periods</h2><p className={styles.note}><Link href={`/${item.slug}/restocks`}>View timestamps, durations and observation coverage →</Link></p></header><EventLog item={item} limit={6}/></section><aside className={styles.aside}><Bell size={26}/><h2>Your time.<br/>Back in your hands.</h2><p>Choose the exact variant and retailers you want. Email and browser push can notify you when a connected source detects a new in-stock period.</p><Link className="rr-button rr-primary" href={`/alerts?item=${item.slug}`}>Put it on my radar<ArrowRight size={15}/></Link><Link className={styles.mutedLink} href="/pricing">Compare alert plans and retailer slots</Link></aside></div>
    {content && <section className={styles.guide}><h2>Before you buy {item.name}</h2><ul className={styles.linkList}>{content.buyingNotes.map(note => <li key={note}>{note}</li>)}</ul><p><Link href={`/how-to-get-${item.slug}`}>Read the full {item.name} buying guide</Link> for configuration advice, monitoring limits and purchase checks.</p><h2>Check the official information.</h2><ul className={styles.linkList}>{content.officialLinks.map(link => <li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a></li>)}</ul><p className={styles.note}>Product guidance reviewed {content.reviewedAt}. Prices and availability must be confirmed at the retailer. Restock Radar is an independent monitoring service.</p></section>}
    {catalog.items.length > 1 && <section className={styles.section}><span className="rr-eyebrow">ALSO ON THE RADAR</span><h2>Explore another product.</h2><ProductCards items={catalog.items.filter(other => other.id !== item.id && (!launch || getLaunchProduct(other.slug)?.brand === launch.brand)).slice(0,3)}/>{launch && <Link className={styles.mutedLink} href={`/brands/${launch.brand}`}>Explore the full {brands[launch.brand].name} collection →</Link>}</section>}
    <ProductSchema item={item}/>
    </div>
  </div>;
}
