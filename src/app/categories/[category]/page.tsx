import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Breadcrumbs } from "@/components/radar/breadcrumbs";
import { ProductCards } from "@/components/radar/catalog-cards";
import { DataNotice } from "@/components/radar/public";
import { getCatalog } from "@/lib/radar/catalog";
import { categoryContent } from "@/lib/radar/product-content";
import { isCatalogPublished, pageMetadata } from "@/lib/radar/seo";
import styles from "@/components/radar/catalog-cards.module.css";

type Props = { params: Promise<{ category: string }> };
export async function generateMetadata({ params }: Props) {
  const { category: slug } = await params, catalog = await getCatalog();
  const category = catalog.items.find(item => item.category.slug === slug)?.category;
  return pageMetadata({ title: category ? `${category.name} stock trackers and buying guides` : "Category not found", description: categoryContent[slug]?.description || "Browse product configurations and retailer stock observations.", path: `/categories/${slug}`, indexable: Boolean(category) && isCatalogPublished(catalog) });
}

export default async function CategoryPage({ params }: Props) {
  const { category: slug } = await params, catalog = await getCatalog();
  const items = catalog.items.filter(item => item.category.slug === slug), category = items[0]?.category;
  if (!category) notFound();
  const content = categoryContent[slug];
  const categories = [...new Map(catalog.items.map(item => [item.category.slug, item.category])).values()];
  return <div className={`rr-container ${styles.page}`}>
    <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Products", href: "/products" }, { label: category.name }]}/>
    <header className={styles.intro}><span className="rr-eyebrow">FIND YOUR NEXT FAVORITE</span><h1>{category.name}, on your radar.</h1><p>{content?.description || `Explore ${category.name.toLowerCase()}, compare the configurations in our catalog, and open a tracker for retailer observations.`}</p></header>
    <DataNotice available={catalog.available} seeded={catalog.seeded}/>
    <nav className={styles.filters} aria-label="Product categories"><Link href="/products">All products</Link>{categories.map(value => <Link key={value.slug} href={`/categories/${value.slug}`} aria-current={value.slug === slug ? "page" : undefined}>{value.name}</Link>)}</nav>
    <ProductCards items={items}/>
    {!!content?.buyingNotes.length && <section className={styles.section}><div className={styles.sectionHeading}><div><span className="rr-eyebrow">THE DETAILS THAT MATTER</span><h2>Before you choose.</h2></div></div><ul className={styles.notes}>{content.buyingNotes.map(note => <li key={note}>{note}</li>)}</ul></section>}
    <div className={styles.sectionHeading}><div><h2>Get the full picture.</h2><p>Official sources, configuration notes, and practical steps for each product.</p></div><Link href="/guides">Read our buying guides<ArrowRight size={15}/></Link></div>
  </div>;
}
