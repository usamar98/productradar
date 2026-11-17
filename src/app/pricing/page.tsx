import type { Metadata } from "next";
import { Pricing, FAQ } from "@/components/radar/public";
export const metadata: Metadata = { title: "Pricing — restock alerts from $5 per month", description: "Compare Starter, Plus, Max and the one-time until-caught pass. All plans include email and browser push restock alerts.", alternates: { canonical: "/pricing" } };
export default function PricingPage() { return <div className="rr-container"><Pricing compact/><FAQ/></div>; }
