"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, Menu, Radar, X } from "lucide-react";
import styles from "./shell.module.css";

const navigation = [{ label: "Check stock", href: "/stock" }, { label: "Products", href: "/products" }, { label: "Create an alert", href: "/alerts" }, { label: "Buying guides", href: "/guides" }, { label: "Pricing", href: "/pricing" }, { label: "Our track record", href: "/proof" }];
const footerGroups = [
  { title: "Explore", links: [{ label: "All products", href: "/products" }, { label: "Apple products", href: "/brands/apple" }, { label: "PlayStation products", href: "/brands/playstation" }, { label: "NVIDIA graphics cards", href: "/brands/nvidia" }, { label: "Buying guides", href: "/guides" }] },
  { title: "Get to know us", links: [{ label: "How checks work", href: "/methodology" }, { label: "Our track record", href: "/proof" }, { label: "Pricing", href: "/pricing" }, { label: "Contact", href: "/contact" }] },
  { title: "The essentials", links: [{ label: "My alerts", href: "/alerts/manage" }, { label: "Terms", href: "/terms" }, { label: "Privacy", href: "/privacy" }, { label: "Refunds", href: "/refunds" }] },
];

function Wordmark({ onClick }: { onClick?: () => void }) {
  return <Link href="/" className={styles.wordmark} aria-label="Restock Radar home" onClick={onClick}>
    <span className={styles.mark} aria-hidden="true"><Radar size={19} strokeWidth={1.8} /></span>
    Restock Radar
  </Link>;
}

export function RadarShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const path = usePathname();
  useEffect(() => {
    if (!open) return;
    function outside(event: Event) {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return <>
    <a className="rr-skip" href="#main">Skip to content</a>
    <header ref={header} className={styles.header}><div className={styles.bar}>
      <Wordmark onClick={() => setOpen(false)} />
      <div className={styles.tools}>
        <Link href="/alerts/manage" className={styles.account} onClick={() => setOpen(false)}><Bell size={16} aria-hidden="true" />My alerts</Link>
        <button ref={toggle} type="button" className={styles.toggle} aria-label={open ? "Close menu" : "Open menu"} aria-controls="main-navigation" aria-expanded={open} onClick={() => setOpen(wasOpen => !wasOpen)}>{open ? <X size={21} /> : <Menu size={21} />}</button>
      </div>
      <nav id="main-navigation" aria-label="Main navigation" className={styles.menu} hidden={!open}>{navigation.map(link => {
        const current = path === link.href || (link.href === "/products" && path.startsWith("/brands/"));
        return <Link key={link.href} onClick={() => setOpen(false)} href={link.href} aria-current={current ? "page" : undefined}>{link.label}</Link>;
      })}</nav>
    </div></header>
    <main id="main">{children}</main>
    <footer className="rr-footer"><div className="rr-container"><div className={styles.top}>
      <div className={styles.brand}><Wordmark /><p>US stock checks and restock alerts.</p></div>
      {footerGroups.map(group => <nav key={group.title} aria-label={`${group.title} footer links`} className={styles.group}><h2>{group.title}</h2>{group.links.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}</nav>)}
    </div><div className="rr-footer-bottom"><p>Independent service. Not affiliated with product manufacturers or retailers. Trademarks belong to their owners.</p></div></div></footer>
  </>;
}
