import type { Metadata } from "next";
import { RadarShell } from "@/components/radar/shell";
import { BRAND, siteUrl } from "@/lib/radar/catalog";
import { pageMetadata } from "@/lib/radar/seo";
import "./globals.css";

const defaultMetadata = pageMetadata({ title: "Restock Radar — Free stock checks and restock alerts", description: "Browse products, compare recorded retailer availability and learn how to find your next purchase. Create an email and browser push alert for selected products.", path: "/" });
export const metadata: Metadata = {
  ...defaultMetadata,
  metadataBase: new URL(siteUrl),
  title: { default: "Restock Radar — Free stock checks and restock alerts", template: "%s | Restock Radar" },
  // Each page supplies its own canonical; never inherit the homepage canonical.
  alternates: undefined,
  icons: { icon: "/radar-icon.svg" },
};
export const dynamic = "force-dynamic";
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const identity = { "@context": "https://schema.org", "@graph": [
    { "@type": "Organization", "@id": `${siteUrl}/#organization`, name: BRAND, url: siteUrl, logo: `${siteUrl}/radar-icon.svg` },
    { "@type": "WebSite", "@id": `${siteUrl}/#website`, name: BRAND, url: siteUrl, inLanguage: "en", publisher: { "@id": `${siteUrl}/#organization` } },
  ] };
  return <html lang="en"><head>{/* HACKATHON TRAFFIC TRACKER SLOT: add the organizer-provided script here after configuring any required visitor consent. */}</head><body><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(identity).replace(/</g, "\\u003c") }}/><RadarShell>{children}</RadarShell></body></html>;
}
