import { pageMetadata } from "@/lib/radar/seo";
import { Pricing, FAQ } from "@/components/radar/public";
export const metadata = pageMetadata({ title: "Pricing — restock alerts from $5 per month", description: "Compare Starter, Plus, Max and the one-time until-caught pass. All plans include email and browser push restock alerts.", path: "/pricing" });
export default function PricingPage() { return <div className="rr-container"><Pricing compact/><FAQ/></div>; }
