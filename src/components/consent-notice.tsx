"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export function ConsentNotice({ trafficScriptUrl }: { trafficScriptUrl?: string }) {
  const [consent, setConsent] = useState<string | null>("pending");
  const firstVisit = useRef<{ query: string; pathname: string; referrer: string } | null>(null);
  useEffect(() => { firstVisit.current = { query: location.search, pathname: location.pathname, referrer: document.referrer }; try { setConsent(localStorage.getItem("gsw-measurement-consent")); } catch { setConsent("declined"); } }, []);
  useEffect(() => {
    if (consent !== "accepted" || !trafficScriptUrl) return;
    const script = document.createElement("script");
    script.src = trafficScriptUrl; script.async = true; script.dataset.gswMeasurement = "true";
    document.body.append(script);
    return () => { script.remove(); };
  }, [consent, trafficScriptUrl]);
  async function choose(value: string) {
    try { localStorage.setItem("gsw-measurement-consent", value); } catch { /* Privacy mode: apply only for this visit. */ }
    setConsent(value);
    if (value !== "accepted") return;
    const visit = firstVisit.current ?? { query: location.search, pathname: location.pathname, referrer: document.referrer };
    const params = new URLSearchParams(visit.query);
    let referringDomain: string | null = null;
    try { referringDomain = visit.referrer ? new URL(visit.referrer).hostname : null; } catch { /* Missing referrer remains unknown. */ }
    await fetch("/api/attribution", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consent: true, utmSource: params.get("utm_source"), utmMedium: params.get("utm_medium"), utmCampaign: params.get("utm_campaign"), utmTerm: params.get("utm_term"), utmContent: params.get("utm_content"), referringDomain, landingPage: visit.pathname, consentedAt: new Date().toISOString() }) }).catch(() => undefined);
  }
  if (consent !== null) return null;
  return <div className="consent-notice" role="region" aria-label="Optional measurement"><p><strong>A little insight, with your permission.</strong> Allow optional campaign and referral measurement? Essential sign-in cookies always work. <Link href="/privacy">Privacy details</Link></p><div><button className="button button-small button-quiet" onClick={() => choose("declined")}>No thanks</button><button className="button button-small button-primary" onClick={() => choose("accepted")}>Allow</button></div></div>;
}
