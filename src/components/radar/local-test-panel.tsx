"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Source = {
  id: string; item: string; itemSlug: string; variant: string; variantSlug: string; label: string;
  feed: boolean; paused: boolean; desired: boolean | null; observed: boolean | null; lastCheckedAt: string | null; error: string | null;
};
type State = {
  sources: Source[]; alerts: { id: string; status: string; caughtAt: string | null; variant: { label: string } }[];
  payment: { message: string }; payments: number; notifications: { status: string; count: number }[]; expiresAt: string | null;
};

const stockLabel = (value: boolean | null) => value === null ? "Awaiting first observation" : value ? "In stock" : "Out of stock";

export function LocalTestPanel() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/radar/local-test", { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load test controls.");
      setState(data);
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "Unable to refresh."); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = setInterval(() => void refresh(controller.signal), 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [refresh]);

  async function setStock(sourceId: string, inStock: boolean) {
    setBusy(sourceId); setError(""); setMessage("");
    try {
      const response = await fetch("/api/radar/local-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId, inStock }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to change stock.");
      setMessage(data.message); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update the stock signal."); }
    finally { setBusy(null); }
  }

  if (!state) return <p role="status">{error || "Loading local test controls…"}</p>;
  function cards(sources: Source[]) {
    return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 270px), 1fr))", gap: 18 }}>
      {sources.map(source => {
        const query = new URLSearchParams({ item: source.itemSlug, variant: source.variantSlug, source: source.id });
        return <article key={source.id} className="rr-form-card">
          <h3>{source.item}</h3><p>{source.variant}<br/>{source.label}</p>
          <p><strong>{source.paused ? "Paused" : stockLabel(source.observed)}</strong>{source.lastCheckedAt && <> · {new Date(source.lastCheckedAt).toLocaleTimeString()}</>}
            {!source.feed && source.desired !== source.observed && <><br/>Waiting for the worker to observe {stockLabel(source.desired).toLowerCase()}.</>}</p>
          {source.error && <p role="alert">{source.error}</p>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBlock: 16 }}>
            <button className="rr-button rr-secondary" disabled={busy !== null || source.paused} onClick={() => void setStock(source.id, false)}>Out of stock</button>
            <button className="rr-button rr-secondary" disabled={busy !== null || source.paused} onClick={() => void setStock(source.id, true)}>In stock</button>
          </div>
          <Link className="rr-button rr-primary" href={"/alerts?" + query + "&plan=free"}>Set a free alert</Link>
          <p><Link className="rr-text-link" href={"/alerts?" + query + "&plan=pass"}>Test Stripe checkout →</Link></p>
        </article>;
      })}
    </div>;
  }
  return <>
    <section className="rr-section">
      <div className="rr-section-heading"><h2>Test a restock email</h2><Link className="rr-text-link" href="/local-inbox">Open local inbox →</Link></div>
      <ol className="rr-prose"><li>Choose a product below, set it to <strong>Out of stock</strong>, and open <strong>Set a free alert</strong>.</li>
        <li>Enter an email address. Open the confirmation in the local inbox and activate the alert.</li>
        <li>Return here and set that product to <strong>In stock</strong>. Its restock email will appear in the inbox. You can close the signup tab after activation.</li></ol>
      {error && <p role="alert" className="rr-form-message">{error}</p>}
      {message && <p role="status" className="rr-form-message rr-success">{message}</p>}
      {cards(state.sources.filter(source => source.feed))}
    </section>
    <section className="rr-prose"><h2>Alert activity</h2>
      <p>{state.notifications.find(row => row.status === "captured")?.count || 0} restock emails captured · {state.notifications.filter(row => ["pending", "sending"].includes(row.status)).reduce((sum, row) => sum + row.count, 0)} notifications pending · {state.payments} verified test payments</p>
      {state.alerts.length > 0 && <ul>{state.alerts.map(alert => <li key={alert.id}>{alert.variant.label} · <strong>{alert.status}</strong>{alert.caughtAt && " · product link opened"}</li>)}</ul>}
      <Link href="/alerts/manage">Manage your alerts</Link>
    </section>
    <details className="rr-prose"><summary>Test Stripe checkout and iPhone pickup</summary>
      <p>Choose a test checkout link, use test card <strong>4242 4242 4242 4242</strong>, a future expiry and any three-digit CVC. Wait for the alert to become active after the Stripe webhook. Opening the product link ends an until-caught pass.</p>
      <p>{state.payment.message} {state.expiresAt && "Sandbox expiry " + state.expiresAt}</p>
      <p>You can also select Apple Fifth Avenue in the <Link href="/stock?item=iphone-duo&variant=256gb-star-white&zip=10001">ZIP stock finder</Link>. The worker checks these iPhone test signals on its next tick.</p>
      {cards(state.sources.filter(source => !source.feed))}
    </details>
  </>;
}
