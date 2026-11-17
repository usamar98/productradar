import Link from "next/link";
import { Breadcrumbs } from "@/components/radar/breadcrumbs";
import { pageMetadata } from "@/lib/radar/seo";

export const metadata = pageMetadata({ title: "How we check stock and record restocks", description: "Understand Restock Radar's stock statuses, check times, event counting and coverage limits before relying on a retailer observation or setting an alert.", path: "/methodology" });

export default function MethodologyPage() {
  return <div className="rr-container rr-page-content">
    <Breadcrumbs items={[{label:"Products",href:"/products"},{label:"Monitoring methodology"}]}/>
    <header className="rr-page-intro"><span className="rr-eyebrow">EVERY STATUS NEEDS CONTEXT</span><h1>How we check. What we know.</h1><p>A stock tracker is useful when you can see the source, the timestamp and the limits of the observation.</p></header>
    <article className="rr-prose">
      <h2>A configuration and a source</h2><p>Every stock source belongs to one product variant and one retailer. Two colors at the same retailer are two separate checks. A positive result for one configuration is not applied to its siblings. The public <Link href="/products">product directory</Link> links to individual product and variant pages so you can keep that choice consistent.</p>
      <p>Catalog inclusion is separate from monitoring. A page may have verified manufacturer information and an official buying link while its inventory source is still paused. Product pages describe their coverage. The free checker requests Apple pickup availability for configured iPhone Duo variants, PlayStation Direct stock for PS5 Pro and NVIDIA’s own RTX 5090 offer. Other catalog products need their own verified integration.</p>
      <h2>Read a status before the price</h2><ul>
        <li><strong>Tracking pending:</strong> the source has not been enabled and approved. We do not know its current availability.</li>
        <li><strong>Live checks connected:</strong> a search received availability directly from the official store. These checks run on request and do not enable automatic alerts.</li>
        <li><strong>No data yet:</strong> an enabled source has not produced a usable availability observation.</li>
        <li><strong>In stock / Out of stock:</strong> the most recent usable check reports that status and is still within the freshness window.</li>
        <li><strong>Check again for current stock:</strong> the latest check failed or its result has expired. On-demand snapshots expire after 60 seconds. Background monitoring uses three configured check intervals or two minutes, whichever is longer. Earlier prices may remain visible with timestamps for context.</li>
        <li><strong>Check blocked:</strong> the retailer rejected automated access or presented a restriction. This is not an out-of-stock result.</li>
      </ul><p>The checking interval varies by source and includes scheduling variation. Network failures and retailer restrictions can create gaps. We stop checking blocked sources until the operator reviews them. We do not infer availability from a buy button, a generic homepage or another variant's listing.</p>
      <h2>What counts as an in-stock period</h2><p>A period opens when a valid observation first reports availability, including when the source's previous status was unknown. Repeated in-stock checks keep that period open. A later valid out-of-stock observation closes it. An error does not invent a sellout or a new shipment.</p>
      <p>An open period is not proof that stock is still available now: consult the current freshness status. A period's duration measures the time between our observed transitions. Stock may have changed between those checks, and a long gap may hide one or more real transitions.</p>
      <h2>How restock reports are calculated</h2><p>Product reports combine up to the latest 1,000 recorded periods per retailer-and-variant source. Hour and weekday charts use the first observed timestamp in UTC. Duration statistics include only closed periods; the median uses the middle value, or the average of the two middle values for an even sample.</p>
      <p>These are records of our coverage, not a census of a retailer's inventory. The same shipment may appear in several variant sources. Sources can be added, paused or blocked over time. A small sample or a gap in checks can change apparent patterns. We show empty states instead of estimating a restock schedule without evidence.</p>
      <h2>What happens after an alert</h2><p>For an approved source with active monitoring, a matching new period can queue email and browser notifications for eligible active alerts. On-demand searches do not send alerts. Delivery depends on the source check, the queue and the delivery provider. A successful send is distinct from the customer receiving, reading or acting on the message. <Link href="/proof">Our activity record</Link> separates recorded periods from notification sends and linked customer posts.</p>
      <p>Restock Radar does not reserve stock or complete purchases. Confirm the exact product, seller, final price and fulfillment option at checkout. Read <Link href="/pricing">plan definitions</Link> and the <Link href="/refunds">refund policy</Link> before paying for monitoring.</p>
      <h2>Using or correcting this information</h2><p>If you cite a restock report, link to its product history page and include the date accessed, UTC timezone, sample size and coverage limitations. Manufacturer links are product references, not endorsements of Restock Radar. <Link href="/contact">Contact the operator</Link> to report a misleading source or incorrect product detail.</p>
      <p><Link href="/guides">Read a product buying guide</Link> or <Link href="/products">browse all products</Link> to see the methodology applied to a specific purchase.</p>
    </article>
  </div>;
}
