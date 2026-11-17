import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = { title: { default: "GPU Stock Watch — RTX 5090 Founders Edition", template: "%s · GPU Stock Watch" }, description: "A focused watch for the NVIDIA GeForce RTX 5090 Founders Edition at official US retailers. Configure your retailers, maximum price, and stock alert preferences.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let trafficScriptUrl: string | undefined;
  try { const value = new URL(process.env.TRAFFIC_VERIFICATION_SCRIPT_URL || ""); if (value.protocol === "https:" && !value.username && !value.password) trafficScriptUrl = value.toString(); } catch { /* Optional measurement is disabled until configured. */ }
  return <html lang="en"><body><AppShell trafficScriptUrl={trafficScriptUrl}>{process.env.DEMO_MODE === "true" && <div className="demo-banner">Demo mode · Billing and customer notifications are disabled.</div>}{children}</AppShell></body></html>;
}
