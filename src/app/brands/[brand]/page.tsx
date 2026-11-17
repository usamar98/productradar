import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandCatalog } from "@/components/radar/brand-catalog";
import { Breadcrumbs } from "@/components/radar/breadcrumbs";
import { DataNotice, JsonLd } from "@/components/radar/public";
import { brands, launchProducts, isRecentLaunch, launchDateLabel, type ProductBrand } from "@/config/launch-catalog";
import { getCatalog, siteUrl } from "@/lib/radar/catalog";
import { isCatalogPublished, pageMetadata } from "@/lib/radar/seo";
import styles from "@/components/radar/brand-catalog.module.css";

type Props = { params: Promise<{ brand: string }> };
export async function generateMetadata({ params }: Props) {
  const { brand: key } = await params;
  const brand = Object.hasOwn(brands, key) ? brands[key as ProductBrand] : undefined;
  const catalog = await getCatalog();
  return pageMetadata({ title: brand ? `${brand.name} products, launches and configurations` : "Brand not found", description: brand?.description ?? "Explore product lineups.", path: `/brands/${key}`, indexable: Boolean(brand) && isCatalogPublished(catalog) });
}
export default async function BrandPage({ params }: Props) {
  const { brand: key } = await params;
  if (!Object.hasOwn(brands, key)) notFound();
  const brandKey = key as ProductBrand, brand = brands[brandKey];
  const catalog = await getCatalog();
  const published = new Set(catalog.items.map(item => item.slug));
  const products = launchProducts.filter(product => product.brand === key && published.has(product.slug)).sort((a, b) => b.launchDate.localeCompare(a.launchDate) || a.name.localeCompare(b.name));
  const recent = products.filter(isRecentLaunch).length;
  return <div className={`${styles.page} ${styles[brandKey]}`}><div className={styles.container}>
    <Breadcrumbs items={[{ label: "Products", href: "/products" }, { label: brand.name }]}/>
    <nav className={styles.brandNav} aria-label="Choose a brand">{Object.entries(brands).map(([slug, value]) => <Link href={`/brands/${slug}`} key={slug} aria-current={key === slug ? "page" : undefined}>{value.name}</Link>)}</nav>
    <header className={styles.brandHero}><div><span className={styles.kicker}>{brand.name.toUpperCase()} · THE PRODUCT COLLECTION</span><h1>{brand.heading}</h1><p>{brand.description}</p><div className={styles.heroStats}><span><strong>{products.length}</strong> products to explore</span><span><strong>{recent}</strong> launches in the past year</span></div></div><div className={styles.heroArt}><img src={brand.image} alt={brand.imageAlt} width={750} height={460} fetchPriority="high"/></div></header>
    <div className={styles.steps}><span><b>1</b>Choose your product</span><span><b>2</b>Explore its features</span><span><b>3</b>Make it yours</span></div>
    <DataNotice available={catalog.available} seeded={catalog.seeded}/>
    <BrandCatalog key={brandKey} brand={brandKey} products={products.map(product => ({ slug: product.slug, name: product.name, family: product.family, description: product.description, tagline: product.tagline, image: product.image, launchDate: product.launchDate, launchDatePrecision: product.launchDatePrecision, launchSourceUrl: product.launchSourceUrl, features: product.features, recent: isRecentLaunch(product), dateLabel: launchDateLabel(product) }))}/>
    <JsonLd value={{ "@context": "https://schema.org", "@type": "ItemList", name: `${brand.name} product collection`, itemListElement: products.map((product, index) => ({ "@type": "ListItem", position: index + 1, name: product.name, url: `${siteUrl}/${product.slug}` })) }}/>
  </div></div>;
}
