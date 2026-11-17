import { BrandDirectory } from "@/components/radar/brand-directory";
import { Breadcrumbs } from "@/components/radar/breadcrumbs";
import { DataNotice } from "@/components/radar/public";
import { getCatalog } from "@/lib/radar/catalog";
import { isCatalogPublished, pageMetadata } from "@/lib/radar/seo";
import styles from "@/components/radar/brand-catalog.module.css";

export async function generateMetadata() {
  const catalog = await getCatalog();
  return pageMetadata({ title: "Apple, PlayStation and NVIDIA product collections", description: "Explore the past year's hardware launches and current product lineups. Choose a brand, compare product features, and build your exact configuration.", path: "/products", indexable: isCatalogPublished(catalog) });
}
export default async function ProductsPage() {
  const catalog = await getCatalog();
  return <div className={styles.page}><div className={styles.container}>
    <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Products" }]}/>
    <header className={styles.intro}><span className={styles.kicker}>GREAT PRODUCTS. A CLEARER WAY TO CHOOSE.</span><h1>Find your next<br/>favorite thing.</h1><p>Start with a brand. Explore its latest launches and familiar favorites. Then choose the features and configuration that fit you.</p></header>
    <div className={styles.steps}><span><b>1</b>Choose a brand</span><span><b>2</b>Find your product</span><span><b>3</b>Explore & configure</span></div>
    <DataNotice available={catalog.available} seeded={catalog.seeded}/><BrandDirectory/>
    <p className={styles.directoryNote}>The past-year collection covers launches from November 17, 2025 through November 17, 2026. Earlier products are clearly dated and stay available in each brand’s full catalog. Features and configurations come from manufacturer references; live retailer observations are shown separately.</p>
  </div></div>;
}
