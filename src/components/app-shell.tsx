"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowUpRight, Bell, ChevronRight, CircleHelp, Cpu, LayoutGrid, Menu, Radio, ShieldCheck, UserRound, X } from "lucide-react";
import { useState } from "react";
import { ConsentNotice } from "./consent-notice";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/stock", label: "Retailer status", icon: Activity },
  { href: "/dashboard", label: "My watch", icon: Bell },
  { href: "/account", label: "Account & billing", icon: UserRound },
];

export function AppShell({ children, trafficScriptUrl }: { children: React.ReactNode; trafficScriptUrl?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const title = navigation.find((item) => item.href === pathname)?.label || ({ "/sign-in": "Sign in", "/privacy": "Privacy", "/terms": "Terms of service", "/support": "Support", "/cancellation": "Cancellation" }[pathname] ?? "GPU Stock Watch");
  return <div className="application">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <div className="mobile-bar"><Link href="/" className="brand"><span className="brand-mark"><Activity size={21} /></span>GPU Stock Watch<span className="brand-period">.</span></Link><button className="icon-button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button></div>
    {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <Link href="/" className="brand" onClick={() => setOpen(false)}><span className="brand-mark"><Activity size={22} /></span><span>GPU Stock<br />Watch<span className="brand-period">.</span></span></Link>
      <div className="workspace-label">YOUR ADVANTAGE</div>
      <nav aria-label="Main navigation">{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-item ${pathname === href ? "active" : ""}`} aria-current={pathname === href ? "page" : undefined}><Icon size={18} strokeWidth={1.7} />{label}{pathname === href && <span className="nav-active-dot" />}</Link>)}</nav>
      <div className="sidebar-product"><div className="mini-chip"><Cpu size={20} /></div><div><span className="eyebrow">CURRENTLY WATCHING</span><strong>GeForce RTX 5090</strong><span>Founders Edition · US</span></div><span className="tiny-dot" /></div>
      <div className="sidebar-bottom"><div className="sidebar-note"><ShieldCheck size={18} /><p>Independent tracking.<br /><span>Official retailers only.</span></p></div><Link href="/support" className="nav-item"><CircleHelp size={18} />Help & support<ArrowUpRight size={14} className="nav-end" /></Link><div className="sidebar-footer"><Link href="/privacy">Privacy</Link><span>·</span><Link href="/terms">Terms</Link><span className="version">v1.0</span></div></div>
    </aside>
    <div className="main-wrap"><header className="topbar"><div className="breadcrumb"><span>Workspace</span><ChevronRight size={13} /><strong>{title}</strong></div><div className="topbar-right"><span className="region"><span aria-hidden="true">🇺🇸</span> United States</span><span className="topbar-divider" /><Link href="/sign-in" className="header-sign-in">Sign in<ArrowUpRight size={14} /></Link></div></header><main id="main-content">{children}</main><footer className="main-footer"><span>© {new Date().getFullYear()} GPU Stock Watch</span><span>Independent. Not affiliated with NVIDIA, Best Buy, or other retailers.</span><Link href="/support">Get in touch <ArrowUpRight size={12} /></Link></footer></div>
    <ConsentNotice trafficScriptUrl={trafficScriptUrl} />
  </div>;
}

export function PageHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow heading-eyebrow"><Radio size={13} />{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>{children}</div>;
}
