import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowUpRight, Bell, Info } from "lucide-react";
import { Breadcrumbs } from "@/components/radar/breadcrumbs";
import { ProductIllustration } from "@/components/radar/catalog-cards";
import { DataNotice, EventLog, RetailerTable } from "@/components/radar/public";
import { getItem } from "@/lib/radar/catalog";
import { getProductContent } from "@/lib/radar/product-content";
import { hasObservations, isCatalogPublished, pageMetadata } from "@/lib/radar/seo";
import styles from "@/components/radar/catalog-cards.module.css";

type Props = { params: Promise<{ item: string; variant: string }> };
export async function generateMetadata({ params }: Props) {
  const { item: slug, variant: variantSlug } = await params, catalog = await getItem(slug);
  const variant = catalog.item?.variants.find(value => value.slug === variantSlug);
  const sources = catalog.item?.sources.filter(source => source.variantId === variant?.id) || [];
  return pageMetadata({ title: catalog.item && variant ? `${catalog.item.name} ${variant.label} stock tracker` : "Configuration not found", description: catalog.item && variant ? `Check retailer observations for ${catalog.item.name}, ${variant.label}. Review the exact configuration and set a matching restock alert.` : "Product configuration not found.", path: `/${slug}/variants/${variantSlug}`, indexable: Boolean(variant) && isCatalogPublished(catalog) && hasObservations(sources) });
}

export default async function VariantPage({ params }: Props) {
  const { item: slug, variant: variantSlug } = await params, catalog = await getItem(slug), { item } = catalog;
  const variant = item?.variants.find(value => value.slug === variantSlug);
  if (!item || !variant) notFound();
  const sources = item.sources.filter(source => source.variantId === variant.id), scopedItem = { ...item, sources };
  const content = getProductContent(item.slug);
  const referenceSources = sources.filter(source => /^https:\/\//.test(source.productUrl) && (source.approved || (item.slug === "iphone-duo" && source.retailer === "apple" && source.productUrl.startsWith("https://www.apple.com/shop/buy-iphone/iphone-duo/"))));
  const alertPath = `/alerts?${new URLSearchParams({ item: item.slug, variant: variant.slug }).toString()}`;
  return <div className={`rr-container ${styles.page}`}>
    <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Products", href: "/products" }, { label: item.category.name, href: `/categories/${item.category.slug}` }, { label: item.name, href: `/${item.slug}` }, { label: variant.label }]}/>
    <div className={styles.variantHero}><header className={styles.intro}><span className="rr-eyebrow">THE EXACT CONFIGURATION</span><h1>{item.name}<br/>{variant.label}</h1><p>Keep your search focused on this configuration. The retailer checks and alert links below belong to {variant.label}.</p><div className={styles.actions}><Link className="rr-button rr-primary" href={alertPath}><Bell size={15}/>Alert me for this configuration<ArrowRight size={15}/></Link><Link className="rr-button rr-secondary" href={`/${item.slug}`}>All configurations</Link></div></header><ProductIllustration item={item}/></div>
    <DataNotice available={catalog.available} seeded={catalog.seeded}/>
    <dl className={styles.details}><div><dt>Product</dt><dd>{item.name}</dd></div><div><dt>Configuration</dt><dd>{variant.label}</dd></div><div><dt>Coverage</dt><dd>United States · USD</dd></div></dl>
    {!hasObservations(sources) && <div className={styles.callout}><Info size={22}/><div><h2>This configuration is being prepared.</h2><p>{content?.coverage || "No stock observations have been recorded for this configuration yet."} You can explore its alert setup and official product information. Checkout opens only for connected retailer sources.</p></div></div>}
    {referenceSources.length > 0 && <section className={styles.section}><div className={styles.sectionHeading}><div><span className="rr-eyebrow">MANUAL RETAILER CHECK</span><h2>Open this exact configuration.</h2><p>Confirm {variant.label}, fulfillment options, and the final price directly with the retailer.</p></div></div><div className={styles.officialLinks}>{referenceSources.map(source => <a key={source.id} href={source.productUrl} target="_blank" rel="noopener noreferrer">{variant.label} at {source.label}<ArrowUpRight size={14}/></a>)}</div><p className={styles.note}>A product link is a catalog reference. It does not confirm stock or local pickup availability.</p></section>}
    <section className={styles.section}><div className={styles.sectionHeading}><div><span className="rr-eyebrow">YOUR CONFIGURATION, YOUR RETAILERS</span><h2>Check the exact match.</h2><p>Each row below applies to {variant.label}. Confirm the configuration and final price with the retailer.</p></div></div><RetailerTable item={scopedItem} sources={sources}/><div className={styles.sourceActions}>{sources.map(source => <Link key={source.id} href={`${alertPath}&source=${encodeURIComponent(source.id)}`}><Bell size={13}/>Set up {source.label} alert</Link>)}</div></section>
    <section className={styles.section}><div className={styles.sectionHeading}><div><span className="rr-eyebrow">ACTUAL OBSERVATIONS</span><h2>Recent stock periods</h2><p>History for this configuration only. All timestamps use UTC.</p></div></div><EventLog item={scopedItem} limit={8}/></section>
    <section className={styles.section}><div className={styles.sectionHeading}><div><span className="rr-eyebrow">A FEW THINGS TO KNOW</span><h2>Check the details before ordering.</h2><p>{content?.summary || "Confirm the exact edition, retailer, fulfillment option, and final price before placing an order."}</p></div></div>{content && <><ul className={styles.notes}>{content.buyingNotes.map(note => <li key={note}>{note}</li>)}</ul><div className={styles.officialLinks}>{content.officialLinks.map(link => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<ArrowUpRight size={14}/></a>)}</div><p className={styles.note}>Official links describe the product. They do not confirm current availability for this configuration.</p></>}</section>
    <section className={styles.section}><div className={styles.sectionHeading}><div><h2>Explore other configurations.</h2></div><Link href={`/how-to-get-${item.slug}`}>Read the buying guide<ArrowRight size={15}/></Link></div><nav className={styles.variants} aria-label={`${item.name} configurations`}>{item.variants.map(value => <Link key={value.id} href={`/${item.slug}/variants/${value.slug}`} aria-current={value.id === variant.id ? "page" : undefined}>{value.label}</Link>)}</nav></section>
  </div>;
}
