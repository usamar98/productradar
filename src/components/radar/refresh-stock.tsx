"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
export function RefreshStock({ label }: { label?: string }) {
  const router = useRouter(); const [pending, startTransition] = useTransition();
  useEffect(() => { const interval = window.setInterval(() => { if (document.visibilityState === "visible") startTransition(() => router.refresh()); }, 30_000); return () => window.clearInterval(interval); }, [router]);
  return <button type="button" className="rr-refresh" onClick={() => startTransition(() => router.refresh())} disabled={pending} aria-label={label ?? "Refresh retailer stock"}><RefreshCw size={13} aria-hidden="true"/>{pending ? "Refreshing…" : label ?? "Refresh stock"}</button>;
}
