import Link from "next/link";
import { siteUrl } from "@/lib/radar/catalog";

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  if (!items.length) return null;
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: new URL(item.href, `${siteUrl}/`).toString() } : {}),
    })),
  };
  return <>
    <nav aria-label="Breadcrumb" className="rr-breadcrumbs" style={{ margin: "24px 0", fontSize: 12, color: "var(--product-muted, var(--rr-muted))" }}>
      <ol style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 9, listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((item, index) => <li key={`${index}-${item.label}`} style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {index > 0 ? <span aria-hidden="true" style={{ color: "#999" }}>/</span> : null}
          {item.href && index !== items.length - 1 ? <Link href={item.href}>{item.label}</Link> : <span aria-current={index === items.length - 1 ? "page" : undefined}>{item.label}</span>}
        </li>)}
      </ol>
    </nav>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
  </>;
}
