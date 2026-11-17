import Link from "next/link";
import { ArrowRight, BookOpen, ShieldCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/radar/breadcrumbs";
import { DataNotice } from "@/components/radar/public";
import { getCatalog } from "@/lib/radar/catalog";
import { getProductContent } from "@/lib/radar/product-content";
import { isCatalogPublished, pageMetadata } from "@/lib/radar/seo";
import styles from "@/components/radar/catalog-cards.module.css";

export async function generateMetadata() {
  const catalog = await getCatalog();
  return pageMetadata({ title: "Buying guides — choose your product and configuration", description: "Product-specific buying guides with official sources, configuration notes, retailer checks, and practical restock alert advice.", path: "/guides", indexable: isCatalogPublished(catalog) });
}

export default async function GuidesPage() {
  const catalog = await getCatalog();
  return <div className={`rr-container ${styles.page}`}>
    <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Buying guides" }]}/>
    <header className={styles.intro}><span className="rr-eyebrow">A LITTLE CLARITY BEFORE CHECKOUT</span><h1>The right find.<br/>The right details.</h1><p>Get to know the configurations, visit official sources, and decide what belongs on your wish list. Our guides connect the details to each product’s stock tracker.</p></header>
    <DataNotice available={catalog.available} seeded={catalog.seeded}/>
    <div className={styles.guides}>{catalog.items.map(item => {
      const content = getProductContent(item.slug);
      return <article className={styles.guide} key={item.id}><BookOpen size={23}/><span className="rr-eyebrow">{item.category.name}</span><h2 style={{ marginTop: 10 }}>How to get {item.name}</h2><p>{content?.summary || `Review ${item.name} configurations, source status, and the steps to set a matching alert.`}</p><Link href={`/how-to-get-${item.slug}`}>Read the buying guide<ArrowRight size={15}/></Link><small>{item.variants.length} {item.variants.length === 1 ? "configuration" : "configurations"} in the catalog{content?.officialLinks.length ? " · Links to official product information" : ""}</small></article>;
    })}</div>
    <div className={styles.callout}><ShieldCheck size={22}/><div><h2>Understand the signal.</h2><p>“No data yet” is different from “Out of stock.” Our <Link href="/methodology">stock-check methodology</Link> explains observed availability, freshness, and how restock periods are recorded.</p></div></div>
    <Link className="rr-text-link" href="/products">Browse all product trackers<ArrowRight size={15}/></Link>
  </div>;
}
