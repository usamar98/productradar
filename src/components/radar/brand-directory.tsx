import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { brands, launchProducts, isRecentLaunch, type ProductBrand } from "@/config/launch-catalog";
import styles from "./brand-catalog.module.css";

export function BrandDirectory() {
  return <div className={styles.brandGrid}>{(Object.keys(brands) as ProductBrand[]).map(key => {
    const brand = brands[key];
    const products = launchProducts.filter(product => product.brand === key);
    const recent = products.filter(isRecentLaunch).length;
    return <Link href={`/brands/${key}`} key={key} className={`${styles.brandCard} ${styles[key]}`}>
      <div className={styles.brandCardCopy}><span className={styles.kicker}>EXPLORE THE LINEUP</span><h2>{brand.name}</h2><p>{key === "apple" ? "Made for every part of your day." : key === "playstation" ? "Make more room for play." : "Find your next graphics card."}</p><span className={styles.brandCount}>{products.length} products · {recent ? `${recent} launches in the past year` : "Current lineup · earlier launches"}</span></div>
      <div className={styles.brandCardImage}><img src={brand.image} alt={brand.imageAlt} width={700} height={430} loading="lazy"/></div>
      <span className={styles.brandCardAction}>Choose a product <ArrowRight size={18}/></span>
    </Link>;
  })}</div>;
}
