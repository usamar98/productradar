import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Bell } from "lucide-react";
import { BrandDirectory } from "@/components/radar/brand-directory";
import { HomeHero } from "@/components/radar/home-hero";
import { DataNotice, EventLog, FAQ, HowItWorks, Pricing, RetailerTable } from "@/components/radar/public";
import { ZipSearchEntry } from "@/components/radar/zip-search-entry";
import { getCatalog, sourceState } from "@/lib/radar/catalog";
import { isCatalogPublished, pageMetadata } from "@/lib/radar/seo";

export async function generateMetadata(): Promise<Metadata> {
  const catalog = await getCatalog();
  return {
    ...pageMetadata({
      title: "Free product stock trackers and alerts",
      description: "Check Apple Store pickup by ZIP code and online stock at PlayStation Direct and NVIDIA. Explore exact product configurations and restock alerts from connected stores.",
      path: "/",
      indexable: isCatalogPublished(catalog),
    }),
    title: { absolute: "Restock Radar — Free product stock trackers and alerts" },
  };
}

export default async function HomePage() {
  const catalog = await getCatalog();
  const published = new Set(catalog.items.map(product => product.slug));
  const item = catalog.items.find(product => product.slug === "playstation-5-pro") || catalog.items[0];
  const checked = item.sources.filter(source => source.lastCheckedAt);
  const inStock = item.sources.filter(source => sourceState(source).tone === "green");

  return (
    <>
      <HomeHero published={published} />
      <div className="rr-container">
        <ZipSearchEntry />
        <section className="rr-section" aria-labelledby="browse-products-heading">
          <div className="rr-section-heading">
            <h2 id="browse-products-heading">Browse by brand</h2>
            <Link className="rr-text-link" href="/products">Browse all products <ArrowRight size={15} /></Link>
          </div>
          <BrandDirectory />
        </section>
        <section className="rr-section rr-stock-section" id="retailers">
          <div className="rr-section-heading">
            <div><h2>{item.name} stock</h2><p>Latest observations by retailer.</p></div>
            <Link className="rr-text-link" href={`/${item.slug}`}>View product details <ArrowUpRight size={15} /></Link>
          </div>
          <DataNotice available={catalog.available} seeded={catalog.seeded} />
          <RetailerTable item={item} />
          <div className="rr-stock-bottom">
            <span>
              <i className={checked.length ? "rr-dot-connected" : undefined} />
              {checked.length ? `${inStock.length} of ${item.sources.length} retailers currently reporting in stock` : "Retailer connections are being prepared. No stock data yet."}
            </span>
            <Link href={`/${item.slug}/restocks`}>Explore restock patterns <ArrowRight size={14} /></Link>
          </div>
        </section>
        <div className="rr-activity-grid">
          <section className="rr-panel">
            <div className="rr-panel-heading">
              <h2>The restock log</h2>
              <Link href={`/${item.slug}/restocks`} className="rr-text-link">View history <ArrowUpRight size={14} /></Link>
            </div>
            <EventLog item={item} limit={3} />
          </section>
          <section className="rr-signal-card">
            <span className="rr-signal-icon"><Bell size={25} /></span>
            <h2>Get a restock alert</h2>
            <p>Choose an exact configuration and a connected store. Your alert links straight to the retailer.</p>
            <Link href="/alerts" className="rr-button rr-dark">Create your first alert <ArrowRight size={16} /></Link>
            <span className="rr-signal-foot">First alert free for 14 days</span>
          </section>
        </div>
        <HowItWorks />
        <Pricing />
        <FAQ />
      </div>
    </>
  );
}
