"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Bell, LocateFixed, MapPin, Search } from "lucide-react";
import styles from "./stock-finder.module.css";

type Item = { slug: string; name: string; brand?: string; variants: { slug: string; label: string }[] };
type Reading = { reason?: string | null; canCheckStore?: boolean; onDemand?: boolean; sourceId: string | null; state: string; label: string; alertable: boolean; lastCheckedAt: string | null; simulated: boolean };
type Store = Reading & { id: string; name: string; address: string; city: string; region: string; postalCode: string; distance: number | null; url: string; latitude: number; longitude: number };
function isStore(reading: Reading & {name: string; url: string}): reading is Store { return "address" in reading; }
type Connection = { onDemand?: boolean; name: string; state: string; message: string; scope: string; url?: string };
type SearchRequest = { item: string; variant: string; mode: "pickup" | "online"; radius: number; zip?: string; search?: string; latitude?: number; longitude?: number; storeId?: string };
type Result = { live?: { checkedAt: string; count: number; cached: boolean; lookups: number; warning?: string | null } | null; coverage?: { total: number; checked: number }; liveError?: string | null; connection?: Connection | null; mode: "pickup" | "online"; place?: { zip: string; city: string; region: string } | null; stores: Store[]; retailers?: (Reading & { name: string; url: string })[]; total: number; directoryCount?: number; officialUrl?: string; message?: string };
export function StockFinder({ items, initialItem, initialVariant, initialZip }: { items: Item[]; initialItem?: string; initialVariant?: string; initialZip?: string }) {
  const first = items.find(item => item.slug === initialItem) || items.find(item => item.slug === "iphone-duo") || items[0];
  const [itemSlug, setItemSlug] = useState(first.slug);
  const [variantSlug, setVariantSlug] = useState(first.variants.find(variant => variant.slug === initialVariant)?.slug || first.variants[0].slug);
  const item = items.find(value => value.slug === itemSlug)!;
  return <section className={styles.finder} aria-label="Free stock checker"><div className={styles.steps}><span>1 Choose your product</span><span>2 Find a store or retailer</span><span>3 Set an alert</span></div><div className={styles.selectors}><label>Product<select value={itemSlug} onChange={event => { const next = items.find(value => value.slug === event.target.value)!; setItemSlug(next.slug); setVariantSlug(next.variants[0].slug); }}>{items.map(value => <option key={value.slug} value={value.slug}>{value.name}</option>)}</select></label><label>Configuration<select value={variantSlug} onChange={event => setVariantSlug(event.target.value)}>{item.variants.map(value => <option key={value.slug} value={value.slug}>{value.label}</option>)}</select></label></div><NearbyStock key={`${itemSlug}:${variantSlug}`} item={itemSlug} variant={variantSlug} initialZip={initialZip} defaultMode={item.brand === "apple" ? "pickup" : "online"}/></section>;
}
export function NearbyStock({ item, variant, initialZip = "", defaultMode = "pickup" }: { item: string; variant: string; initialZip?: string; defaultMode?: "pickup" | "online" }) {
  const [mode, setMode] = useState(defaultMode), [zip, setZip] = useState(initialZip), [search, setSearch] = useState("");
  const [radius, setRadius] = useState(50), [onlyStock, setOnlyStock] = useState(false), [visibleLimit, setVisibleLimit] = useState(30);
  const [result, setResult] = useState<Result | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const lastSearch = useRef<SearchRequest | null>(null);
  const [checkingStore, setCheckingStore] = useState<string | null>(null);
  const [displayTime, setDisplayTime] = useState(Date.now());
  // Age snapshots locally without sending any automatic retailer requests.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiries = [...(result?.stores || []), ...(result?.retailers || [])]
      .filter(reading => reading.onDemand && reading.lastCheckedAt)
      .map(reading => new Date(reading.lastCheckedAt!).getTime() + 60_001);
    function update() {
      const now = Date.now(); setDisplayTime(now);
      const next = Math.min(...expiries.filter(time => time > now));
      if (Number.isFinite(next)) timer = setTimeout(update, next - now);
    }
    update();
    return () => { if (timer) clearTimeout(timer); };
  }, [result]);
  useEffect(() => () => { controller.current?.abort(); generation.current++; }, []);
  // A ZIP submitted from a product page should immediately show its results.
  useEffect(() => { if (initialZip || defaultMode === "online") void run(defaultMode); }, [initialZip]);
  async function run(selectedMode = mode, point?: { latitude: number; longitude: number }, storeId?: string) {
    controller.current?.abort(); const current = ++generation.current; const abort = new AbortController(); controller.current = abort;
    setBusy(true); setCheckingStore(storeId || null); setError("");
    if (!storeId) { setResult(null); setOnlyStock(false); setVisibleLimit(30); }
    const query: SearchRequest = storeId && lastSearch.current
      ? { ...lastSearch.current, storeId }
      : { item, variant, mode: selectedMode, radius, ...(point || (zip.trim() ? { zip: zip.trim() } : {})), ...(search.trim() ? { search: search.trim() } : {}) };
    if (!storeId) lastSearch.current = query;
    try {
      const response = await fetch("/api/radar/stock-search", { method: "POST", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(query) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Stock search is unavailable.");
      if (current === generation.current) setResult(body);
    } catch (caught) { if (current === generation.current && !abort.signal.aborted) setError(caught instanceof Error ? caught.message : "Try again shortly."); }
    finally { if (current === generation.current) { setBusy(false); setCheckingStore(null); } }
  }
  function changeMode(next: "pickup" | "online") { controller.current?.abort(); generation.current++; setMode(next); setResult(null); setError(""); setBusy(false); setOnlyStock(false); if (next === "online") void run(next); }
  function useLocation() {
    if (!navigator.geolocation) { setError("Location is unavailable in this browser. Enter your ZIP code instead."); return; }
    controller.current?.abort(); const current = ++generation.current;
    setBusy(true); setError(""); setResult(null);
    navigator.geolocation.getCurrentPosition(position => { if (current !== generation.current) return; setZip(""); void run("pickup", { latitude: position.coords.latitude, longitude: position.coords.longitude }); }, () => { if (current !== generation.current) return; setBusy(false); setError("Location wasn’t available. Enter your ZIP code or city instead."); }, { timeout: 10000, maximumAge: 300000, enableHighAccuracy: false });
  }
  function submit(event: FormEvent) { event.preventDefault(); void run(); }
  const alertUrl = (sourceId: string) => `/alerts?${new URLSearchParams({ item, variant, source: sourceId, plan: "free", ...(zip ? { zip } : {}) })}`;
  const readings = (result?.mode === "pickup" ? result.stores : result?.retailers || []).map(reading =>
    reading.onDemand && reading.lastCheckedAt && displayTime - new Date(reading.lastCheckedAt).getTime() > 60_000
      ? { ...reading, state: "stale", label: "Check again for current stock" } : reading);
  const matching = readings?.filter(reading => !onlyStock || reading.state === "in_stock") || [];
  const shown = matching.slice(0, visibleLimit);
  return <div><div className={styles.tabs} role="group" aria-label="Fulfillment"><button aria-pressed={mode === "pickup"} onClick={() => changeMode("pickup")}>Store pickup</button><button aria-pressed={mode === "online"} onClick={() => changeMode("online")}>Online official stores</button></div><form onSubmit={submit} className={styles.searchForm}>{mode === "pickup" ? <><div className={styles.searchRow}><label>US ZIP code<input inputMode="numeric" autoComplete="postal-code" maxLength={10} placeholder="e.g. 10001" value={zip} onChange={event => setZip(event.target.value)}/></label><span className={styles.or}>or</span><label>City or store name<input maxLength={100} placeholder="e.g. New York or Fifth Avenue" value={search} onChange={event => setSearch(event.target.value)}/></label><label>Within<select value={radius} onChange={event => setRadius(Number(event.target.value))}>{[25,50,100,250].map(distance => <option value={distance} key={distance}>{distance} miles</option>)}</select></label><button className="rr-button rr-primary" disabled={busy} type="submit"><Search size={17}/>{busy ? "Checking…" : "Check stock"}</button></div><div className={styles.searchFoot}><button type="button" className={styles.location} disabled={busy} onClick={useLocation}><LocateFixed size={16}/>Use my location</button><span>Free to check. No account needed. US Apple Store directory.</span></div><p className={styles.privacy}>ZIP lookup uses Zippopotam.us; Apple receives the product and nearby ZIP codes for pickup checks. Device location is used only after permission and is not stored in your account.</p></> : <div className={styles.onlineIntro}><p>Check availability directly with the official online store. This does not establish delivery to your ZIP or availability at a physical store.</p><button type="submit" disabled={busy} className="rr-button rr-secondary">{busy ? "Checking…" : "Refresh online checks"}</button></div>}</form>{error && <p role="alert" className={styles.error}>{error}</p>}{busy && <p role="status" className={styles.loading}>Checking official store availability…</p>}{!result && !busy && !error && <div className={styles.empty}><MapPin size={30}/><h2>What’s near you?</h2><p>Search by ZIP code or city to find stores. We show a stock status only when a source has checked this exact configuration.</p></div>}{result && <>{result.connection && <aside className={styles.connection} aria-label="Official store connection"><span className={styles.connectionLabel}>{result.connection.name} · {result.connection.state === "connected" ? (result.connection.onDemand ? "Live checks connected" : "Tracking connected") : result.connection.state === "blocked" ? "Check blocked" : "Tracking pending"}</span><p>{result.connection.message}</p>{result.live && <small>Latest direct check at {new Date(result.live.checkedAt).toLocaleTimeString()} · {result.live.count} availability results{result.live.cached ? " · recent cached response" : ""}</small>}{result.live?.warning && <p role="status">{result.live.warning}</p>}{result.liveError && <p role="status">{result.liveError}</p>}<small>{result.connection.scope}</small>{result.connection.url && <a href={result.connection.url} target="_blank" rel="noopener noreferrer">Check at {result.connection.name} ↗</a>}</aside>}<div className={styles.resultHeading}><div><h2>{result.mode === "online" ? "Official online stores" : result.place ? `Near ${result.place.city}, ${result.place.region} ${result.place.zip}` : "Matching stores"}</h2><p role="status">{result.mode === "pickup" ? `${result.total} stores found · ${readings.filter(reading => ["in_stock", "out_of_stock"].includes(reading.state)).length} of ${result.total} checked` : `${readings?.length || 0} retailer listings`} · {readings?.filter(reading => reading.state === "in_stock").length || 0} verified in stock</p></div><label className={styles.filter}><input type="checkbox" checked={onlyStock} onChange={event => { setOnlyStock(event.target.checked); setVisibleLimit(30); }}/>In stock only</label></div>{!shown?.length && <div className={styles.empty}><h3>{onlyStock ? "No verified in-stock results." : result.mode === "pickup" ? "No stores match this search." : "No online sources connected yet."}</h3><p>{onlyStock ? "Unknown availability does not mean sold out. Turn off this filter to see all results." : "Try a wider radius or a different city. You can also check directly with the manufacturer."}</p>{onlyStock && <button onClick={() => setOnlyStock(false)} className="rr-button rr-secondary">Show all results</button>}</div>}<div className={styles.results}>{shown?.map(reading => { const store = isStore(reading) ? reading : null; return <article className={styles.store} key={store?.id || reading.sourceId || reading.name}><div className={styles.storeTop}><span className={styles.pin}><MapPin size={21}/></span><div><h3>{reading.name}</h3>{store && <p>{store.city}, {store.region}{store.distance !== null && ` · ${store.distance.toFixed(1)} mi`}</p>}</div><span className={`${styles.status} ${reading.state === "in_stock" ? styles.inStock : ""}`}>{reading.simulated ? "LOCAL TEST · " : ""}{reading.label}</span></div>{store && <p className={styles.address}>{store.address}<br/>{store.city}, {store.region} {store.postalCode}</p>}<p className={styles.checked}>{reading.lastCheckedAt ? `Last observed ${new Date(reading.lastCheckedAt).toLocaleString()}` : "No inventory check recorded for this configuration."}</p>{reading.reason && <p className={styles.reason}>{reading.reason}</p>}<div className={styles.actions}>{store && reading.canCheckStore && <button type="button" className="rr-button rr-secondary" disabled={busy} aria-label={`Check stock at ${store.name}`} onClick={() => void run("pickup", undefined, store.id)}>{checkingStore === store.id ? "Checking this store…" : "Check this store"}</button>}{reading.alertable && reading.sourceId ? <Link href={alertUrl(reading.sourceId)} className="rr-button rr-primary"><Bell size={15}/>Set a free alert</Link> : <span className={styles.pending}>{reading.onDemand ? "Live checks available; automatic alerts not enabled" : "Alerts available when tracking is connected"}</span>}<a href={reading.url} target="_blank" rel="noopener noreferrer">{store ? "Official store" : "Check retailer"} ↗</a>{store && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name} ${store.address} ${store.city} ${store.region}`)}`} target="_blank" rel="noopener noreferrer">Directions ↗</a>}</div></article>; })}</div>{matching.length > visibleLimit && <div className={styles.more}><p>Showing {shown.length} of {matching.length} matching results</p><button className="rr-button rr-secondary" onClick={() => setVisibleLimit(limit => limit + 30)}>Show more stores</button></div>}{result.message && <p className={styles.note}>{result.message}</p>}{result.officialUrl && <p className={styles.note}><a href={result.officialUrl} target="_blank" rel="noopener noreferrer">Check the product with its manufacturer ↗</a></p>}</>}<div className={styles.freeNote}><Bell size={19}/><p><strong>Your first alert is on us.</strong> One configuration, one connected retailer or store, 14 days. Verify your email. No card or automatic renewal.</p><Link href={`/alerts?item=${item}&variant=${variant}&plan=free`}>Explore alerts<ArrowRight size={16}/></Link></div></div>;
}
