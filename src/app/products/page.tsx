import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/radar/breadcrumbs";
import { ProductCards } from "@/components/radar/catalog-cards";
import { DataNotice } from "@/components/radar/public";
import { getCatalog } from "@/lib/radar/catalog";
import { isCatalogPublished, pageMetadata } from "@/lib/radar/seo";
import styles from "@/components/radar/catalog-cards.module.css";

export async function generateMetadata() {
  const catalog = await getCatalog();
  return pageMetadata({ title: "Product stock trackers — browse every item", description: "Browse free product stock trackers by category. Compare configurations, review retailer observations, and choose the exact item for your restock alert.", path: "/products", indexable: isCatalogPublished(catalog) });
}

export default async function ProductsPage() {
  const catalog = await getCatalog();
  const categories = [...new Map(catalog.items.map(item => [item.category.slug, item.category])).values()];
  return <div className={`rr-container ${styles.page}`}>
    <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Products" }]}/>
    <header className={styles.intro}><span className="rr-eyebrow">FIND YOUR NEXT GOOD THING</span><h1>What’s on your radar?</h1><p>Pick your product. Find the right configuration. See retailer observations in one place, then let an alert take the refreshing off your hands.</p></header>
    <DataNotice available={catalog.available} seeded={catalog.seeded}/>
    <nav className={styles.filters} aria-label="Product categories"><Link href="/products" aria-current="page">All products <small>{catalog.items.length}</small></Link>{categories.map(category => <Link key={category.slug} href={`/categories/${category.slug}`}>{category.name}<small>{catalog.items.filter(item => item.category.slug === category.slug).length}</small></Link>)}</nav>
    <ProductCards items={catalog.items}/>
    <div className={styles.callout}><ShieldCheck size={22}/><div><h2>A clearer view, before you buy.</h2><p>Availability is shown only when a retailer check has observed it. A pending connection has no confirmed stock. Learn <Link href="/methodology">how our stock checks work</Link> and always confirm the edition, price, and delivery options at checkout.</p></div></div>
    <section className={styles.sectionHeading}><div><h2>A little research goes a long way.</h2><p>Our buying guides cover configurations, official sources, and what to check before ordering.</p></div><Link href="/guides">Explore buying guides<ArrowRight size={15}/></Link></section>
  </div>;
}
