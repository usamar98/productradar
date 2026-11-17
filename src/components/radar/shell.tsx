"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Bell, Menu, Radar, X } from "lucide-react";
import styles from "./shell.module.css";

const navigation = [{ label: "Check stock", href: "/stock" }, { label: "Products", href: "/products" }, { label: "Buying guides", href: "/guides" }, { label: "Pricing", href: "/pricing" }, { label: "Our track record", href: "/proof" }];
const footerGroups = [
  { title: "Explore", links: [{ label: "All products", href: "/products" }, { label: "Apple products", href: "/brands/apple" }, { label: "PlayStation products", href: "/brands/playstation" }, { label: "NVIDIA graphics cards", href: "/brands/nvidia" }, { label: "Buying guides", href: "/guides" }] },
  { title: "Get to know us", links: [{ label: "How checks work", href: "/methodology" }, { label: "Our track record", href: "/proof" }, { label: "Pricing", href: "/pricing" }, { label: "Contact", href: "/contact" }] },
  { title: "The essentials", links: [{ label: "My alerts", href: "/alerts/manage" }, { label: "Terms", href: "/terms" }, { label: "Privacy", href: "/privacy" }, { label: "Refunds", href: "/refunds" }] },
];

export function RadarShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  return <>
    <a className="rr-skip" href="#main">Skip to content</a>
    <header className="rr-header"><div className="rr-nav rr-container">
      <Link href="/" className="rr-brand" aria-label="Restock Radar home" onClick={() => setOpen(false)}><span><Radar size={25}/></span>restock<span className="rr-brand-light">radar</span><i/></Link>
      <nav id="main-navigation" aria-label="Main navigation" className={open ? "rr-nav-links rr-nav-open" : "rr-nav-links"}>{navigation.map(link => {
        const current = path === link.href || (link.href === "/products" && path.startsWith("/brands/"));
        return <Link key={link.href} onClick={() => setOpen(false)} href={link.href} aria-current={current ? "page" : undefined} className={current ? "rr-nav-current" : ""}>{link.label}</Link>;
      })}<Link href="/alerts/manage" className="rr-mobile-account" onClick={() => setOpen(false)}>My alerts</Link></nav>
      <div className="rr-nav-actions"><Link href="/alerts/manage" className="rr-account-link">My alerts <ArrowUpRight size={14}/></Link><Link href="/alerts" className="rr-button rr-primary rr-nav-cta"><Bell size={15}/>Create alert</Link><button type="button" className="rr-mobile-toggle" aria-label={open ? "Close menu" : "Open menu"} aria-controls="main-navigation" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button></div>
    </div></header>
    <main id="main">{children}</main>
    <footer className="rr-footer"><div className="rr-container"><div className={styles.top}>
      <div className={styles.brand}><Link href="/" className="rr-brand" aria-label="Restock Radar home"><span><Radar size={25}/></span>restock<span className="rr-brand-light">radar</span><i/></Link><p>Less refreshing. More living.</p><span>Find your next favorite.<br/>Keep your time for you.</span></div>
      {footerGroups.map(group => <nav key={group.title} aria-label={`${group.title} footer links`} className={styles.group}><h2>{group.title}</h2>{group.links.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}</nav>)}
    </div><div className="rr-footer-bottom"><p>Independent service. Not affiliated with product manufacturers or retailers. Trademarks belong to their owners.</p><span>Made for the wait.</span></div></div></footer>
  </>;
}
