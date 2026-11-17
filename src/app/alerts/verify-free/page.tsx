import type { Metadata } from "next";
import { VerifyFreeAlert } from "@/components/radar/verify-free-alert";
export const metadata: Metadata = { title: "Confirm your free alert", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) { const { token } = await searchParams; return <div className="rr-container"><VerifyFreeAlert token={typeof token === "string" && token.length <= 2048 ? token : ""}/></div>; }
