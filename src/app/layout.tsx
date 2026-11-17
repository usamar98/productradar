import type { Metadata } from "next";
import { RadarShell } from "@/components/radar/shell";
import { siteUrl } from "@/lib/radar/catalog";
import "./globals.css";

export const metadata: Metadata = { metadataBase: new URL(siteUrl), title: { default: "Restock Radar — Your next obsession, back in stock", template: "%s | Restock Radar" }, description: "Check retailer stock for free. Create an email and browser push alert for PlayStation 5 Pro and other hard-to-find items.", openGraph: { siteName: "Restock Radar", type: "website" }, icons: { icon: "/radar-icon.svg" } };
export const dynamic = "force-dynamic";
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head>{/* HACKATHON TRAFFIC TRACKER SLOT: add the organizer-provided script here after configuring any required visitor consent. */}</head><body><RadarShell>{children}</RadarShell></body></html>;
}
