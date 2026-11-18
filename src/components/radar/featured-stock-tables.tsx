"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Info, MapPin, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RefreshStock } from "./refresh-stock";
import type { FeaturedBrand, FeaturedProduct } from "@/lib/radar/featured-availability";
import { availabilityLabel, reportFromSearch, type FeaturedReport } from "@/lib/radar/featured-report";
import type { StockSearchResult } from "@/lib/radar/stock-search-result";
import styles from "./featured-stock-tables.module.css";

const timestamp = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
});
type Lookup = { report: FeaturedReport | null; message: string; zip: string; finishedAt: number };

function ProductRow({ product, initialTime, connected, pickupZip }: {
  product: FeaturedProduct; initialTime: number; connected: boolean; pickupZip?: () => string | null;
}) {
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [now, setNow] = useState(initialTime);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const newerSaved = lookup && product.report && Date.parse(product.report.observedAt) > lookup.finishedAt
    && (!pickupZip || product.report.location === lookup.report?.location);
  const override = newerSaved ? null : lookup;
  const report = override ? override.report : product.report;
  const current = !!report && report.freshUntil > now;
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!report) return;
    const time = Date.now();
    setNow(time);
    if (report.freshUntil <= time) return;
    const timer = window.setTimeout(() => setNow(Date.now()), report.freshUntil - time + 1);
    return () => window.clearTimeout(timer);
  }, [report]);

  async function check() {
    if (request.current) return;
    const zip = pickupZip ? pickupZip() : "";
    if (zip === null) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    const previous = (!pickupZip || lookup?.zip === zip) && report ? { ...report, freshUntil: 0 } : null;
    try {
      const response = await fetch("/api/radar/stock-search", {
        method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: product.slug, variant: product.variant,
          ...(pickupZip ? { mode: "pickup", zip, radius: 50 } : { mode: "online" }),
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || "The store check is temporarily unavailable.");
      }
      const result: StockSearchResult = await response.json();
      const checkedAt = Date.now();
      const next = reportFromSearch(result, checkedAt);
      const missing = zip ? `No current pickup report within 50 miles of ${zip}.` : "The store has no current stock report.";
      const feedback = result.liveError || result.configuration?.reason || (result.connection?.state === "blocked" ? result.connection.message : null);
      if (!controller.signal.aborted) {
        setNow(checkedAt);
        setLookup({ report: next ?? previous, zip, finishedAt: checkedAt, message: next ? "" : (feedback || missing) });
      }
    } catch (error) {
      if (!controller.signal.aborted) setLookup({ report: previous, zip, finishedAt: Date.now(), message: error instanceof Error ? error.message : "Could not check stock." });
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const params = new URLSearchParams({ item: product.slug, variant: product.variant });
  if (lookup?.zip) params.set("zip", lookup.zip);
  const time = report && <time dateTime={report.observedAt}>{timestamp.format(new Date(report.observedAt))} UTC</time>;
  return <tr>
    <th scope="row">
      <Link href={connected ? `/stock?${params}` : `/${product.slug}`} prefetch={false} className={styles.product}>
        <span aria-hidden="true" className={styles.thumb}><Image src={product.image} alt="" width={52} height={44} sizes="52px" /></span>
        <span><strong>{product.name}</strong><small>{product.configuration}</small></span>
      </Link>
    </th>
    <td className={styles.report} aria-live="polite" aria-atomic="true">
      <span className={`${styles.badge} ${current && report?.inStock ? styles.available : ""}`}>{availabilityLabel(report, now)}</span>
      {pickupZip && report && <small>{report.location}</small>}
      {time && <small className={styles.mobileTime}>{time}</small>}
      {override?.message && <small className={styles.feedback}>{override.message}</small>}
    </td>
    <td className={styles.timeCell}>{time ?? "—"}</td>
    <td className={styles.actionCell}>
      {connected
        ? <button type="button" onClick={check} disabled={busy} aria-label={`Check ${product.name} ${pickupZip ? "pickup" : "online stock"}`} className={styles.check}>
            <RefreshCw size={13} aria-hidden="true" /><span>{busy ? "Checking…" : "Check"}</span>
          </button>
        : <a className={styles.check} href={product.officialUrl} target="_blank" rel="noopener noreferrer" aria-label={`Check ${product.name} at the official store`}><span>Visit store</span><ArrowUpRight size={13} aria-hidden="true" /></a>}
    </td>
  </tr>;
}

function BrandTable({ group, connected, initialTime }: { group: FeaturedBrand; connected: boolean; initialTime: number }) {
  const input = useRef<HTMLInputElement>(null);
  const pickup = group.brand === "apple";
  function pickupZip() {
    if (!input.current?.reportValidity()) { input.current?.focus(); return null; }
    return input.current.value.trim().slice(0, 5);
  }
  return <section className={styles.brand} aria-labelledby={`featured-${group.brand}`}>
    <div className={styles.brandInfo}>
      <div><h3 id={`featured-${group.brand}`}>{group.name}</h3><p>{group.channel}</p></div>
      {pickup && connected && <label className={styles.zip}>ZIP for pickup checks
        <span><MapPin size={14} aria-hidden="true"/><input ref={input} type="text" required inputMode="numeric" autoComplete="postal-code"
          pattern="[0-9]{5}(-[0-9]{4})?" maxLength={10} placeholder="e.g. 10001" /></span>
      </label>}
    </div>
    <div className={styles.tableBox}>
      <table aria-label={`${group.name} product availability`}>
        <thead><tr><th scope="col">Product</th><th scope="col">Availability</th><th scope="col" className={styles.timeCell}>Last checked</th><th scope="col" className={styles.actionCell}><span className="rr-sr-only">Check stock</span></th></tr></thead>
        <tbody>{group.products.map(product => <ProductRow key={product.slug} product={product} connected={connected} initialTime={initialTime} pickupZip={pickup ? pickupZip : undefined} />)}
          {!group.products.length && <tr><td colSpan={4}>This brand has no featured products in the published catalog.</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}

export function FeaturedStockTables({ groups, connected, initialTime }: { groups: FeaturedBrand[]; connected: boolean; initialTime: number }) {
  return <section id="retailers" className={styles.section} aria-labelledby="featured-stock-heading">
    <header className={styles.intro}>
      <div><h2 id="featured-stock-heading">Featured product availability</h2>
        <p>Each report covers the configuration shown. Apple pickup is specific to the store listed.</p></div>
      <RefreshStock label="Refresh saved reports" />
    </header>
    {!connected && <p className={styles.notice}><Info size={16} aria-hidden="true" />Stock reports are unavailable. Check each product directly at its official store.</p>}
    {groups.map(group => <BrandTable key={group.brand} group={group} connected={connected} initialTime={initialTime} />)}
  </section>;
}
