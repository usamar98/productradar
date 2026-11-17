"use client";
import { useState } from "react";
import Link from "next/link";
export function VerifyFreeAlert({ token }: { token: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function confirm() {
    setBusy(true); setError("");
    try { const response = await fetch("/api/radar/free-alert", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); window.location.replace(body.url); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Your alert could not be activated."); setBusy(false); }
  }
  return <section className="rr-form-card" style={{maxWidth:600,margin:"48px auto"}}><span className="rr-eyebrow">YOUR FIRST ALERT · $0</span><h1>Ready to keep watch?</h1><p>Confirm your email and start 14 days of alerts for your selected configuration and retailer. No card. No automatic renewal.</p>{error && <p role="alert" className="rr-form-message">{error}</p>}<button className="rr-button rr-primary" disabled={busy || !token} onClick={() => void confirm()}>{busy ? "Activating…" : "Confirm email & start free alert"}</button><p><Link href="/alerts?plan=free">Choose again or request a new link</Link></p></section>;
}
