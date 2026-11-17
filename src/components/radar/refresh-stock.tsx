"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
export function RefreshStock() {
  const router = useRouter(); const [pending, startTransition] = useTransition();
  useEffect(() => { const interval = window.setInterval(() => { if (document.visibilityState === "visible") startTransition(() => router.refresh()); }, 30_000); return () => window.clearInterval(interval); }, [router]);
  return <button type="button" className="rr-refresh" onClick={() => startTransition(() => router.refresh())} disabled={pending} aria-label="Refresh retailer stock"><RefreshCw size={11}/>{pending ? "Refreshing…" : "Refresh stock"}</button>;
}
