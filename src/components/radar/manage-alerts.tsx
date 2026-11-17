"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Bell, BellRing, CheckCircle2, ChevronRight, CreditCard, ExternalLink, LoaderCircle, LogOut, Mail, Pause, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import styles from "./manage-alerts.module.css";

type Plan = { name: string; type: string; priceCents: number; alertLimit: number };
type Subscription = { id: string; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; customerRef: string | null; priceCents?: number | null; alertLimit?: number | null; plan: Plan };
type Alert = { id: string; status: string; activeUntil: string | null; caughtAt: string | null; sourceIds: string[]; item: { name: string; slug: string }; variant: { label: string }; subscription: Subscription | null };
type Account = { user: { email: string }; alerts: Alert[]; subscriptions: Subscription[]; vapidPublicKey: string | null };

async function responseBody(response: Response) {
  let value: Record<string, unknown>;
  try { value = await response.json() as Record<string, unknown>; } catch { throw new Error("The service is temporarily unavailable. Please try again."); }
  if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : "Something went wrong. Please try again.");
  return value;
}
function date(value: string | null) { return value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "Awaiting confirmation"; }
function currency(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100); }
function active(alert: Alert) { return alert.status === "active" && !!alert.activeUntil && new Date(alert.activeUntil) > new Date(); }
function statusLabel(alert: Alert) { return alert.status === "active" && !active(alert) ? "Expired" : alert.status.replaceAll("_", " "); }
function pushKey(value: string) { const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/")); const buffer = new ArrayBuffer(raw.length); const bytes = new Uint8Array(buffer); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i); return bytes; }

export function ManageAlerts({ checkoutReturned = false, expiredLogin = false }: { checkoutReturned?: boolean; expiredLogin?: boolean }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pushConnected, setPushConnected] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch("/api/radar/me", { cache: "no-store", signal });
      if (response.status === 401) { setAccount(null); return; }
      const body = await responseBody(response);
      setAccount(body as unknown as Account);
    } catch (caught) { if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Unable to load your account."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("login"); setError(""); setMessage("");
    try { const body = await responseBody(await fetch("/api/radar/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) })); setMessage(String(body.message)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Your sign-in link could not be sent."); }
    finally { setBusy(null); }
  }
  async function action(key: string, url: string, method: "POST" | "DELETE", body?: unknown) {
    setBusy(key); setError(""); setMessage("");
    try {
      const result = await responseBody(await fetch(url, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) }));
      if (typeof result.url === "string") { window.location.assign(result.url); return; }
      if (key === "logout") { setAccount(null); setPushConnected(false); }
      else { await load(); setMessage("Your alert is paused. Manage billing separately if you also want to cancel your plan."); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "That change could not be saved."); }
    finally { setBusy(null); }
  }
  async function enablePush() {
    setBusy("push"); setError(""); setMessage("");
    try {
      if (!window.isSecureContext || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Browser push is not supported here. Try a supported browser over HTTPS; email alerts will still work.");
      if (!account?.vapidPublicKey) throw new Error("Browser push is not connected yet. Email alerts remain available.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error(permission === "denied" ? "Notifications are blocked. Allow them in your browser’s site settings, then try again." : "Notification permission was not granted. You can enable it whenever you’re ready.");
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushKey(account.vapidPublicKey) });
      await responseBody(await fetch("/api/radar/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) }));
      setPushConnected(true); setMessage("This browser is connected. We’ll notify you here when a matching restock is detected.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Browser notifications could not be enabled."); }
    finally { setBusy(null); }
  }

  const messages = <>{error && <div className={styles.error} role="alert">{error}</div>}{message && <div className={styles.success} role="status"><CheckCircle2 size={18}/><span>{message}</span></div>}</>;

  if (loading && !account) return <div className={styles.loading} role="status"><LoaderCircle size={25} className={styles.spin}/><p>Finding your radar…</p></div>;

  if (!account) return <div className={styles.loginGrid}>
    <section className={styles.loginIntro}><span className={styles.kicker}>YOUR PERSONAL LOOKOUT</span><h1>Good finds.<br/><em>All in one place.</em></h1><p>Manage your alerts, connect browser notifications, and make room for your next obsession.</p><div className={styles.introNote}><ShieldCheck size={22}/><span>A secure link. No password to remember.<br/>Only you can access your alerts.</span></div></section>
    <section className={styles.card} aria-labelledby="sign-in-title"><span className={styles.icon}><Mail size={25}/></span><h2 id="sign-in-title">Your radar is waiting.</h2><p>Enter the email you used for your alerts. We’ll send a secure, single-use sign-in link.</p>{checkoutReturned && <div className={styles.notice}>Back from checkout? Your alert activates after payment confirmation. Sign in to review it and enable browser push.</div>}{expiredLogin && <div className={styles.notice}>That sign-in link has expired or was already used. Request a fresh one below.</div>}{messages}<form onSubmit={login} className={styles.form}><label htmlFor="radar-login-email">Email address</label><input id="radar-login-email" type="email" name="email" placeholder="you@example.com" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy !== null}/><button className={styles.primary} disabled={busy !== null} type="submit">{busy === "login" ? <LoaderCircle size={17} className={styles.spin}/> : <Mail size={17}/>}Send me a sign-in link<ArrowRight size={17}/></button></form><p className={styles.fine}>The link expires in 10 minutes. By continuing, you agree to our <Link href="/terms">terms</Link> and <Link href="/privacy">privacy policy</Link>.</p><div className={styles.loginBottom}>Nothing on your radar yet?<Link href="/alerts">Create your first alert <ChevronRight size={14}/></Link></div></section>
  </div>;

  const activeAlerts = account.alerts.filter(active);
  const currentPlans = account.subscriptions.filter(s => s.status === "active" && !!s.currentPeriodEnd && new Date(s.currentPeriodEnd) > new Date());
  return <div className={styles.dashboard}>
    <div className={styles.heading}><div><span className={styles.kicker}>A LITTLE PEACE OF MIND</span><h1>Your radar.</h1><p>{account.user.email}</p></div><div className={styles.headingActions}><button type="button" className={styles.secondary} disabled={busy !== null} onClick={() => void action("logout", "/api/radar/me", "DELETE")}><LogOut size={16}/>Sign out</button><Link className={styles.primary} href="/alerts"><Plus size={16}/>Create alert</Link></div></div>
    {checkoutReturned && <div className={styles.notice}>Your plan activates after payment confirmation. If it still says pending, refresh shortly. Connect this browser below to receive push alerts.</div>}{messages}
    <div className={styles.stats}><div><Bell size={19}/><span>ACTIVE ALERTS<strong>{activeAlerts.length}</strong></span></div><div><CreditCard size={19}/><span>RETAILER SLOTS IN USE<strong>{activeAlerts.reduce((sum, alert) => sum + alert.sourceIds.length, 0)}</strong></span></div><div><ShieldCheck size={19}/><span>CURRENT PLANS<strong>{currentPlans.length}</strong></span></div></div>
    <div className={styles.dashboardGrid}><section className={styles.card}><div className={styles.sectionHeading}><div><span className={styles.kicker}>THE WISH LIST</span><h2>Your alerts</h2></div><button type="button" className={styles.iconButton} aria-label="Refresh alerts" disabled={loading || busy !== null} onClick={() => void load()}><RefreshCw size={17} className={loading ? styles.spin : ""}/></button></div>{account.alerts.length ? <div className={styles.alertList}>{account.alerts.map(alert => <article key={alert.id} className={styles.alert}><span className={styles.alertIcon}><Bell size={21}/></span><div className={styles.alertDetails}><Link href={`/${alert.item.slug}`}><h3>{alert.item.name}</h3></Link><p>{alert.variant.label} · {alert.sourceIds.length} {alert.sourceIds.length === 1 ? "retailer" : "retailers"}</p><small>{alert.caughtAt ? `Clicked through ${date(alert.caughtAt)}` : alert.activeUntil ? `Valid through ${date(alert.activeUntil)}` : alert.status === "awaiting_verification" ? "Check your email to activate your free alert" : "Awaiting payment confirmation"}</small></div><div className={styles.alertActions}><span className={`${styles.status} ${active(alert) ? styles.statusActive : ""}`}>{statusLabel(alert)}</span>{active(alert) && <button type="button" disabled={busy !== null} onClick={() => void action(alert.id, `/api/radar/alerts/${encodeURIComponent(alert.id)}`, "DELETE")}><Pause size={12}/>Pause</button>}</div></article>)}</div> : <div className={styles.empty}><Bell size={30}/><h3>Make room for a good find.</h3><p>You haven’t created an alert yet. Pick an item and we’ll keep an eye on it.</p><Link className={styles.secondary} href="/alerts">Create an alert<ArrowRight size={15}/></Link></div>}<p className={styles.cardFoot}>Each selected retailer uses one slot from your plan. Pausing an alert does not cancel billing.</p></section>
      <aside className={styles.pushCard}><span className={styles.icon}><BellRing size={25}/></span><span className={styles.kicker}>CATCH THE MOMENT</span><h2>A heads-up,<br/>right here.</h2><p>Connect this browser for a notification when your exact item comes back in stock.</p><button type="button" className={styles.primary} disabled={busy !== null || pushConnected || !account.vapidPublicKey} onClick={() => void enablePush()}>{busy === "push" ? <LoaderCircle size={17} className={styles.spin}/> : pushConnected ? <CheckCircle2 size={17}/> : <Bell size={17}/>} {pushConnected ? "Browser connected" : "Enable browser push"}</button><small>{account.vapidPublicKey ? "Your browser will ask for permission. You can change this in your site settings anytime." : "Browser push is awaiting setup. Email alerts are handled separately."}</small></aside>
    </div>
    <section className={styles.card}><div className={styles.sectionHeading}><div><span className={styles.kicker}>KEEP IT ON YOUR TERMS</span><h2>Plans & billing</h2></div><CreditCard size={22}/></div>{account.subscriptions.length ? <div className={styles.planList}>{account.subscriptions.map(subscription => <article className={styles.plan} key={subscription.id}><div><h3>{subscription.plan.name}<span className={styles.status}>{subscription.status.replaceAll("_", " ")}</span></h3><p>{currency(subscription.priceCents ?? subscription.plan.priceCents)} {subscription.plan.type === "subscription" ? "/ month" : subscription.plan.type === "free" ? "· no card · no renewal" : "one time"} · {subscription.alertLimit ?? subscription.plan.alertLimit} retailer {(subscription.alertLimit ?? subscription.plan.alertLimit) === 1 ? "slot" : "slots"}</p><small>{subscription.cancelAtPeriodEnd ? "Cancellation scheduled · access ends " : subscription.plan.type === "subscription" && subscription.status === "active" ? "Current period ends " : "Valid through "}{date(subscription.currentPeriodEnd)}</small></div>{subscription.customerRef && <button type="button" className={styles.secondary} disabled={busy !== null} onClick={() => void action(subscription.id, "/api/radar/portal", "POST", { subscriptionId: subscription.id })}>Manage billing<ExternalLink size={14}/></button>}</article>)}</div> : <p className={styles.noPlan}>No plan data yet. A confirmed free alert or paid plan will appear here.</p>}<p className={styles.cardFoot}>Subscriptions can be canceled through the secure billing portal. Free alerts and one-time passes never renew. <Link href="/refunds">Read our refund policy <ExternalLink size={11}/></Link></p></section>
  </div>;
}
