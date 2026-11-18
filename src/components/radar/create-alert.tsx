"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Bell, Check, LockKeyhole, MapPin, ShieldCheck } from "lucide-react";
import { ALERT_PLANS, REFUND_POLICY } from "@/config/pricing";
import { resolveAlertSelection } from "@/lib/radar/alert-selection";
export type AlertItem = { id: string; slug: string; name: string; variants: { id: string; slug: string; label: string }[]; sources: { id: string; variantId: string; label: string; alertable: boolean; locationId?: string | null; fulfillment?: string }[] };
export function CreateAlert({ items, initialItem, initialVariant, initialPlan, initialSource, initialZip, available }: { items: AlertItem[]; initialItem?: string; initialVariant?: string; initialPlan?: string; initialSource?: string; initialZip?: string; available: boolean }) {
  const selection = resolveAlertSelection(items, { item: initialItem, variant: initialVariant, source: initialSource })!;
  const [itemId, setItemId] = useState(selection.item.id), [variantId, setVariantId] = useState(selection.variantId);
  const [planId, setPlanId] = useState<string>(ALERT_PLANS.find(plan => plan.id === initialPlan)?.id || "free");
  const [sourceIds, setSourceIds] = useState<string[]>(selection.sourceIds), [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [sent, setSent] = useState(""), [inbox, setInbox] = useState("");
  const [ready, setReady] = useState<{ ready: boolean; message?: string; freeReady?: boolean; freeMessage?: string } | null>(null);
  const item = items.find(value => value.id === itemId)!, variant = item.variants.find(value => value.id === variantId)!;
  const plan = ALERT_PLANS.find(value => value.id === planId)!, free = plan.type === "free";
  useEffect(() => { const controller = new AbortController(); fetch("/api/radar/config", {signal:controller.signal}).then(response => response.json()).then(setReady).catch(() => { if (!controller.signal.aborted) setReady({ready:false, freeReady:false,message:"Configuration could not be loaded. Try again shortly.",freeMessage:"Configuration could not be loaded. Try again shortly."}); }); return () => controller.abort(); }, []);
  function resetMessages() { setMessage(""); setSent(""); setInbox(""); }
  function changeItem(id: string) { const selected = items.find(value => value.id === id)!; setItemId(id); setVariantId(selected.variants[0]?.id || ""); setSourceIds([]); resetMessages(); }
  function toggleSource(id: string) { resetMessages(); if (sourceIds.includes(id)) setSourceIds(sourceIds.filter(value => value !== id)); else if (sourceIds.length < plan.alertLimit) setSourceIds([...sourceIds,id]); else setMessage(`${plan.name} includes ${plan.alertLimit} retailer or store slots. Remove a selection or choose a larger plan.`); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); resetMessages();
    if (!sourceIds.length) { setMessage("Choose a connected retailer or store to continue. Your free alert is not used until it activates."); return; }
    if (!available) { setMessage("Tracking is being set up. Your free alert has not been used."); return; }
    setBusy(true);
    try {
      const response = await fetch(free ? "/api/radar/free-alert" : "/api/radar/alerts", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemId,variantId,sourceIds,email:email.trim(),...(!free ? {planId} : {})})});
      const value = await response.json(); if (!response.ok) throw new Error(value.error || "Your alert could not be created.");
      if (value.url) { window.location.assign(value.url); return; }
      setSent(value.message || "Check your email to confirm your alert."); setInbox(value.localInboxUrl || "");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }
  const nearbyUrl = `/stock?${new URLSearchParams({item:item.slug,variant:variant?.slug || "",...(initialZip ? {zip:initialZip} : {})})}`;
  const readyMessage = free ? ready?.freeMessage : ready?.message;
  return <div className="rr-form-layout"><form className="rr-form-card" onSubmit={submit}>
    <span className="rr-test-badge"><LockKeyhole size={12}/>{free ? "No card required · Verify your email" : "Stripe test mode · No live charges"}</span>
    <h2>What’s on your wish list?</h2><p>Your first alert is free for 14 days. Choose one exact configuration and one connected retailer or store.</p>
    <fieldset className="rr-form-group" style={{border:0,padding:0}} disabled={busy}><legend className="rr-label">01 · Choose your product</legend><div className="rr-select-row"><div><label className="rr-label" htmlFor="alert-item">Your item</label><select className="rr-input" id="alert-item" value={itemId} onChange={event => changeItem(event.target.value)}>{items.map(value => <option value={value.id} key={value.id}>{value.name}</option>)}</select></div><div><label className="rr-label" htmlFor="alert-variant">Edition / variant</label><select className="rr-input" id="alert-variant" value={variantId} onChange={event => {setVariantId(event.target.value);setSourceIds([]);resetMessages();}}>{item.variants.map(value => <option value={value.id} key={value.id}>{value.label}</option>)}</select></div></div></fieldset>
    <fieldset className="rr-form-group" style={{border:0,padding:0}} disabled={busy}><legend className="rr-label">02 · Choose your plan</legend><div className="rr-radio-grid">{ALERT_PLANS.map(value => <label className="rr-option" key={value.id}><input type="radio" name="plan" value={value.id} checked={planId === value.id} onChange={() => {setPlanId(value.id);setSourceIds(sourceIds.slice(0,value.alertLimit));resetMessages();}}/><span><strong>{value.name} · ${value.priceCents / 100}{value.type === "subscription" ? "/mo" : ""}</strong><small>{value.alertLimit} {value.alertLimit === 1 ? "retailer/store" : "retailer/store slots"}{value.type === "subscription" ? " · cancel anytime" : " · 14 days · no renewal"}</small></span></label>)}</div><span className="rr-help">Free: once per verified email. Each selected retailer or store uses one slot.</span></fieldset>
    <fieldset className="rr-form-group" style={{border:0,padding:0}} disabled={busy}><legend className="rr-label">03 · Your retailers or stores ({sourceIds.length} / {plan.alertLimit})</legend><p><Link className="rr-text-link" href={nearbyUrl}><MapPin size={16}/>Find nearby stores by ZIP code<ArrowRight size={15}/></Link></p><div className="rr-radio-grid">{item.sources.filter(source => source.variantId === variantId).map(source => { const connected = source.alertable; return <label className="rr-option" key={source.id}><input type="checkbox" disabled={!connected} checked={sourceIds.includes(source.id)} onChange={() => toggleSource(source.id)}/><span><strong>{source.label}</strong><small>{source.fulfillment === "pickup" ? "Store pickup · " : "Online listing · "}{connected ? "Connected" : "Connection pending"}</small></span></label>; })}</div>{!item.sources.some(source => source.variantId === variantId && source.alertable) && <p className="rr-help">No connected sources for this configuration yet. You can check stores manually; your free alert stays unused.</p>}</fieldset>
    <div className="rr-form-group"><label className="rr-label" htmlFor="alert-email">Your email</label><input className="rr-input" id="alert-email" type="email" autoComplete="email" required disabled={busy} maxLength={254} placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)}/><span className="rr-help">{free ? "Confirm a secure email link before monitoring starts." : "Use the email on your existing plan."} <Link href="/alerts/manage">Already have alerts? Sign in</Link>.</span></div>
    {ready && !(free ? ready.freeReady : ready.ready) && <div className="rr-form-message" role="status">{readyMessage}</div>}{message && <div className="rr-form-message" role="alert">{message}</div>}{sent && <div className="rr-form-message" role="status">{sent}{inbox && <p><Link href={inbox}>Open local inbox →</Link></p>}</div>}
    <button className="rr-button rr-primary" type="submit" disabled={busy}>{busy ? "Preparing your alert…" : free ? "Start my free alert" : `Continue with ${plan.name}`}<ArrowRight size={16}/></button>
    <p className="rr-form-consent">By continuing, you agree to our <Link href="/terms">terms</Link> and <Link href="/privacy">privacy policy</Link>. {free ? "No payment details required. The free alert expires 14 days after activation and never renews." : "Payment is completed on Stripe. Sign in after checkout to enable browser push."}</p>
  </form><aside className="rr-form-aside"><Bell size={30}/><h2>Your first find.<br/>Our treat.</h2><p>Try one connected alert for 14 days. Choose the exact configuration you want and verify your email.</p><ul><li><Check size={15}/>No card or automatic renewal</li><li><Check size={15}/>Email + optional browser push</li><li><Check size={15}/>Buy directly from the retailer</li><li><ShieldCheck size={15}/>Stock is never reserved</li></ul><p>Need more stores or products? Paid plans add more slots. {REFUND_POLICY} <Link href="/refunds">Read the policy.</Link></p></aside></div>;
}
