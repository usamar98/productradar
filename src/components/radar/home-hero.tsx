import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Bell, ScanLine } from "lucide-react";
import { brands } from "@/config/launch-catalog";
import { JsonLd } from "./public";
import { siteUrl } from "@/lib/radar/catalog";
import styles from "./home-hero.module.css";

const featured = [
  { slug: "iphone-duo", brand: "apple", name: "iPhone Duo", image: "iphone-duo", width: 792, height: 520 },
  { slug: "playstation-5-pro", brand: "playstation", name: "PS5 Pro", image: "ps5-pro", width: 645, height: 715 },
  { slug: "rtx-5090", brand: "nvidia", name: "GeForce RTX 5090", image: "rtx-5090", width: 1076, height: 520 },
] as const;

export function HomeHero({ published }: { published: Set<string> }) {
  const products = featured.filter(product => published.has(product.slug));
  return (
    <section className={styles.hero} aria-labelledby="home-heading">
      <div className={styles.intro}>
        <p className={styles.market}><ScanLine size={14} aria-hidden="true" /> Free US stock checker</p>
        <h1 id="home-heading">Find your next upgrade<br />while it’s in stock.</h1>
        <p className={styles.summary}>
          Check Apple Store pickup by ZIP code and online stock at PlayStation Direct and NVIDIA.
          Get restock alerts from connected stores.
        </p>
        <div className={styles.actions}>
          <Link href="/stock" className={styles.primary}>Check stock <ArrowRight size={17} aria-hidden="true" /></Link>
          <Link href="/alerts" className={styles.secondary}><Bell size={16} aria-hidden="true" />Create an alert</Link>
        </div>
      </div>
      {products.length > 0 && (
        <ul className={styles.lineup} aria-label="Featured product trackers">
          {products.map(product => (
            <li key={product.slug}>
              <Link className={styles.product} href={`/${product.slug}`} aria-label={`Explore the ${product.name} stock tracker`}>
                <span className={`${styles.photo} ${styles[product.brand]}`}>
                  <Image
                    src={`/images/hero/${product.image}.webp`}
                    alt=""
                    width={product.width}
                    height={product.height}
                    sizes="(max-width: 700px) 30vw, (max-width: 1150px) 29vw, 340px"
                    loading="eager"
                  />
                </span>
                <span className={styles.caption}>
                  <span className={styles.maker}>{brands[product.brand].name}</span>
                  <span className={styles.model}>{product.name}<ArrowUpRight size={15} aria-hidden="true" /></span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {products.length > 0 && <JsonLd value={{
        "@context": "https://schema.org", "@type": "ItemList", name: "Featured product trackers",
        itemListElement: products.map((product, index) => ({
          "@type": "ListItem", position: index + 1, name: product.name, url: `${siteUrl}/${product.slug}`,
        })),
      }} />}
    </section>
  );
}
