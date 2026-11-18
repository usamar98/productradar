import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Inbox, RefreshCw } from "lucide-react";
import { listLocalEmails } from "@/lib/radar/email";
import { assertLocalRequest } from "@/lib/radar/local-mode";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata: Metadata = { title: "Local inbox", description: "Development-only captured messages. No email is sent.", robots: { index: false, follow: false }, referrer: "no-referrer" };

function localActions(text: string) {
  const origin = new URL(process.env.APP_URL!).origin;
  return [...new Set(text.split(/\s+/).filter(part => {
    try { const url = new URL(part); return url.origin === origin && ["/api/radar/login", "/api/radar/click", "/alerts/verify-free"].includes(url.pathname); }
    catch { return false; }
  }))];
}

export default async function LocalInboxPage() {
  try { assertLocalRequest({ headers: await headers() }); } catch { notFound(); }
  const messages = await listLocalEmails();
  return <div className="rr-container" style={{ padding: "40px 0 65px" }}>
    <div className="rr-section-heading"><div><span className="rr-eyebrow">DEVELOPMENT ONLY</span><h1 style={{ fontSize: 32, letterSpacing: -1, margin: "12px 0" }}>Local inbox</h1><p>Messages are captured, not emailed. Only this local app can read this inbox.</p></div><a className="rr-button rr-secondary" href="/local-inbox"><RefreshCw size={15}/>Refresh</a></div>
    <div className="rr-data-notice"><Inbox size={18}/><span>This inbox keeps up to 50 messages for 24 hours. Sign-in links still expire after 10 minutes and can be used only once. Local captures do not count as sent customer alerts.</span></div>
    {!messages.length && <div className="rr-prose" style={{ marginTop: 24 }}><h2>Your local inbox is empty.</h2><p>Request a sign-in link from <a href="/alerts/manage">My alerts</a> using an existing account. A captured message will appear here after you refresh.</p></div>}
    <div style={{ display: "grid", gap: 20, marginTop: 25 }}>{messages.map(message => <article key={message.id} className="rr-prose" style={{ margin: 0, maxWidth: "none" }}>
      <h2 style={{ marginTop: 0 }}>{message.subject}</h2><p style={{ fontSize: 12 }}>To: {message.to}<br/><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC</time></p>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "inherit", fontSize: 13, lineHeight: 1.8, color: "var(--rr-muted)", background: "var(--rr-surface)", padding: 18, borderRadius: 10 }}>{message.text}</pre>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>{localActions(message.text).map(url => <a key={url} href={url} className="rr-button rr-primary" referrerPolicy="no-referrer">{new URL(url).pathname.endsWith("login") ? "Open single-use sign-in link" : new URL(url).pathname.endsWith("verify-free") ? "Verify email for free alert" : "Open captured alert link"}</a>)}</div>
    </article>)}</div>
  </div>;
}
