"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, Check, Search, X } from "lucide-react";
import type { LaunchProduct, ProductBrand } from "@/config/launch-catalog";
import styles from "./brand-catalog.module.css";

type CatalogProduct = Pick<LaunchProduct, "slug" | "name" | "family" | "description" | "tagline" | "image" | "launchDate" | "launchDatePrecision" | "launchSourceUrl" | "features"> & { recent: boolean; dateLabel: string };
export function BrandCatalog({ brand, products }: { brand: ProductBrand; products: CatalogProduct[] }) {
  const [family, setFamily] = useState("All products");
  const [period, setPeriod] = useState("all");
  const [query, setQuery] = useState("");
  const [comparison, setComparison] = useState<string[]>([]);
  const families = [...new Set(products.map(product => product.family))];
  const visible = products.filter(product => (family === "All products" || product.family === family) && (period !== "recent" || product.recent) && `${product.name} ${product.description} ${product.features.map(feature => `${feature.label} ${feature.value}`).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = comparison.map(slug => products.find(product => product.slug === slug)!).filter(Boolean);
  const rows = [...new Set(selected.flatMap(product => product.features.map(feature => feature.label)))];
  function toggleCompare(slug: string) { setComparison(previous => previous.includes(slug) ? previous.filter(value => value !== slug) : previous.length < 3 ? [...previous, slug] : previous); }
  return <div className={`${styles.browser} ${styles[brand]}`}>
    <div className={styles.familyRail} role="group" aria-label="Product family">{["All products", ...families].map(value => <button type="button" key={value} aria-pressed={family === value} onClick={() => setFamily(value)}>{value}</button>)}</div>
    <div className={styles.toolbar}>
      <label className={styles.search}><Search size={17}/><span className={styles.srOnly}>Search products and features</span><input type="search" placeholder="Search products or features" value={query} onChange={event => setQuery(event.target.value)}/></label>
      <label className={styles.period}>Launch period<select aria-label="Launch period" value={period} onChange={event => setPeriod(event.target.value)}><option value="all">Full catalog</option><option value="recent">Past year’s launches</option></select></label>
      <span className={styles.results} role="status">{visible.length} {visible.length === 1 ? "product" : "products"}</span>
    </div>
    <div className={styles.productGrid}>{visible.map(product => <article className={styles.productCard} key={product.slug}>
      <div className={styles.cardTop}><span className={product.recent ? styles.newBadge : styles.earlierBadge}>{product.recent ? "PAST YEAR’S LAUNCH" : "EARLIER RELEASE"}</span><button type="button" aria-pressed={comparison.includes(product.slug)} aria-label={`Compare ${product.name}`} disabled={comparison.length === 3 && !comparison.includes(product.slug)} className={styles.compareButton} onClick={() => toggleCompare(product.slug)}>{comparison.includes(product.slug) ? <Check size={14}/> : <span>+</span>} Compare</button></div>
      <Link className={styles.cardImage} href={`/${product.slug}`} aria-label={`Explore ${product.name}`}><img src={product.image.src} alt={product.image.alt} width={640} height={430} loading="lazy" decoding="async"/></Link>
      <div className={styles.cardBody}><span className={styles.familyLabel}>{product.family}</span><h2><Link href={`/${product.slug}`}>{product.name}</Link></h2><p>{product.tagline}</p><time dateTime={product.launchDatePrecision === "month" ? product.launchDate.slice(0, 7) : product.launchDate}>Launched {product.dateLabel}</time><ul>{product.features.slice(0, 3).map(feature => <li key={feature.label}><strong>{feature.value}</strong><span>{feature.label}</span></li>)}</ul><Link className={styles.exploreButton} href={`/${product.slug}`}>Explore & configure <ArrowRight size={16}/></Link><a className={styles.sourceLink} href={product.launchSourceUrl} target="_blank" rel="noopener noreferrer">Launch details <ArrowUpRight size={12}/></a></div>
    </article>)}</div>
    {visible.length === 0 && <div className={styles.empty}><h2>{period === "recent" ? "No verified launches match these filters." : "No products found."}</h2><p>{period === "recent" ? "Older models remain in the full catalog. A new feature update or partner design is not a new product launch here." : "Try another name, feature or product family."}</p><button type="button" onClick={() => { setFamily("All products"); setPeriod("all"); setQuery(""); }}>Show the full catalog <ArrowRight size={16}/></button></div>}
    {selected.length > 0 && <aside className={styles.comparison} aria-label="Product comparison">
      <div className={styles.compareHeading}><div><span className={styles.kicker}>SIDE BY SIDE</span><h2>Your shortlist.</h2><p>Compare up to three products. {selected.length < 2 ? "Choose another product above to see the differences." : "A dash means that specification is not listed for this product."}</p></div><button type="button" onClick={() => setComparison([])}>Clear all <X size={15}/></button></div>
      <div className={styles.tableScroll}><table><caption className={styles.srOnly}>Selected product feature comparison</caption><thead><tr><th scope="col">Feature</th>{selected.map(product => <th scope="col" key={product.slug}><Link href={`/${product.slug}`}>{product.name}</Link><button type="button" onClick={() => toggleCompare(product.slug)} aria-label={`Remove ${product.name} from comparison`}><X size={14}/></button></th>)}</tr></thead><tbody><tr><th scope="row">Launch</th>{selected.map(product => <td key={product.slug}>{product.dateLabel}</td>)}</tr>{rows.map(label => <tr key={label}><th scope="row">{label}</th>{selected.map(product => <td key={product.slug}>{product.features.find(feature => feature.label === label)?.value ?? "—"}</td>)}</tr>)}<tr><th scope="row">Make it yours</th>{selected.map(product => <td key={product.slug}><Link href={`/${product.slug}#configure`}>Choose configuration →</Link></td>)}</tr></tbody></table></div>
    </aside>}
    <p className={styles.researchNote}>Launch window: Nov 17, 2025–Nov 17, 2026. Dates refer to US availability where stated. Product specifications and launch history are separate from retailer stock. Configuration choices are curated; confirm additional custom options with the manufacturer.</p>
  </div>;
}
