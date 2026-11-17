import Link from "next/link";
import { ArrowRight, ArrowUpRight, Gamepad2, Radio, Smartphone } from "lucide-react";
import { sourceState, type PublicItem } from "@/lib/radar/catalog";
import { getProductContent } from "@/lib/radar/product-content";
import styles from "./catalog-cards.module.css";

export function ProductIllustration({ item }: { item: PublicItem }) {
  const phone = item.category.slug === "smartphones";
  return <div className={`${styles.illustration} ${phone ? styles.phoneIllustration : ""}`} aria-hidden="true">
    <span className={styles.orbit}/>
    {phone ? <div className={styles.phone}><span className={styles.phoneCamera}/><span className={styles.phoneScreen}/><Smartphone size={25}/></div> : item.category.slug === "consoles" ? <div className={styles.console}><span/><Gamepad2 size={53} strokeWidth={1.2}/></div> : <Radio size={88} strokeWidth={1}/>}
    <span className={styles.spark}>✦</span><small>Product illustration</small>
  </div>;
}

export function ProductCards({ items }: { items: PublicItem[] }) {
  return <div className={styles.cards}>{items.filter(item => !item.hidden).map(item => {
    const content = getProductContent(item.slug);
    const connected = item.sources.filter(source => source.approved && source.status === "active").length;
    const freshInStock = item.sources.filter(source => sourceState(source).tone === "green").length;
    return <article className={styles.card} key={item.id}>
      <Link className={styles.artLink} href={`/${item.slug}`} aria-label={`View ${item.name} stock tracker`}><ProductIllustration item={item}/></Link>
      <div className={styles.cardBody}>
        <Link className={styles.categoryLabel} href={`/categories/${item.category.slug}`}>{item.category.name}<ArrowUpRight size={12}/></Link>
        <h3><Link href={`/${item.slug}`}>{item.name}</Link></h3>
        <p>{content?.summary || `Explore ${item.name} configurations, retailer observations, and restock alert options.`}</p>
        <div className={styles.cardMeta}><span>{item.variants.length} {item.variants.length === 1 ? "configuration" : "configurations"}</span><span>{freshInStock ? `${freshInStock} in-stock ${freshInStock === 1 ? "source" : "sources"}` : connected ? "Check retailer observations" : "Tracking being prepared"}</span></div>
        <div className={styles.cardLinks}><Link href={`/${item.slug}`}>Explore tracker<ArrowRight size={15}/></Link><Link href={`/how-to-get-${item.slug}`}>Buying guide</Link></div>
      </div>
    </article>;
  })}</div>;
}
