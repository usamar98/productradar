import { pageMetadata } from "@/lib/radar/seo";
import { Pricing, FAQ } from "@/components/radar/public";
export const metadata = pageMetadata({ title: "Pricing — first restock alert free", description: "Start with one free alert for 14 days, then compare Starter, Plus, Max and the until-caught pass. All plans include email and browser push restock alerts.", path: "/pricing" });
export default function PricingPage() { return <div className="rr-container"><Pricing compact/><FAQ/></div>; }
