import type { Metadata } from "next";
import { RadarShell } from "@/components/radar/shell";
import { BRAND, siteUrl } from "@/lib/radar/catalog";
import { pageMetadata } from "@/lib/radar/seo";
import { isLocalTestMode } from "@/lib/radar/local-test";
import { isLocalMailboxEnabled } from "@/lib/radar/local-mode";
import Link from "next/link";
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
  return <html lang="en"><head>{/* HACKATHON TRAFFIC TRACKER SLOT: add the organizer-provided script here after configuring any required visitor consent. */}</head><body>{isLocalTestMode() ? <aside style={{background:"#ffedbe",color:"#5b3f0a",padding:"12px 20px",textAlign:"center",fontSize:13,lineHeight:1.6}}><strong>LOCAL TEST LAB — simulated inventory · Stripe test payments</strong><br/>Separate test database. No live Apple availability is shown. <Link href="/local-test" style={{textDecoration:"underline"}}>Test controls</Link> · <Link href="/local-inbox" style={{textDecoration:"underline"}}>Local inbox</Link></aside> : isLocalMailboxEnabled() ? <aside style={{background:"#eee8f7",color:"#62457c",padding:"10px 20px",textAlign:"center",fontSize:12}}>Local development: email is captured in the <Link href="/local-inbox" style={{textDecoration:"underline"}}>local inbox</Link>.</aside> : null}<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(identity).replace(/</g, "\\u003c") }}/><RadarShell>{children}</RadarShell></body></html>;
}
