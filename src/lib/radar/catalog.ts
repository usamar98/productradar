import { cache } from "react";
import { prisma } from "@/lib/db";
import { isLocalTestMode } from "@/lib/radar/local-test";
import { previewCatalog } from "@/config/radar-catalog";

export const BRAND = "Restock Radar";
export const siteUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
export type PublicEvent = { id: string; sourceId: string; inStock: boolean; priceCents: number | null; seenAt: Date; endedAt: Date | null };
export type PublicSource = { id: string; itemId: string; variantId: string; retailer: string; label: string; locationId?: string | null; fulfillment?: string; productUrl: string; connector: string; pollSeconds: number; status: string; approved: boolean; inStock: boolean | null; priceCents: number | null; lastCheckedAt: Date | null; lastError: string | null; createdAt: Date | null; events: PublicEvent[] };
export type PublicItem = { id: string; slug: string; name: string; msrpCents: number | null; imageUrl: string | null; hidden: boolean; category: { name: string; slug: string }; variants: {id: string; slug: string; label: string}[]; sources: PublicSource[] };
export type Catalog = { items: PublicItem[]; available: boolean; seeded: boolean };
export const getCatalog = cache(async (): Promise<Catalog> => {
  try {
    const items = await prisma.radarItem.findMany({ where: { hidden: false }, include: { category: true, variants: { orderBy: { slug: "asc" } }, sources: { where: { connector: { notIn: isLocalTestMode() ? ["mock"] : ["mock", "local-test"] } }, include: { events: { orderBy: { seenAt: "desc" }, take: 1000 } }, orderBy: { label: "asc" } } }, orderBy: { name: "asc" } });
    return { items: items.length ? items : previewCatalog, available: true, seeded: items.length > 0 };
  } catch { return { items: previewCatalog, available: false, seeded: false }; }
});
export const getItem = cache(async (slug: string) => { const catalog = await getCatalog(); return { ...catalog, item: catalog.items.find(item => item.slug === slug) }; });
export function allEvents(item: PublicItem) { return item.sources.flatMap(source => source.events.map(event => ({ ...event, source }))).sort((a, b) => b.seenAt.getTime() - a.seenAt.getTime()); }
export function money(value: number | null | undefined) { return value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100); }
export function dateTime(value: Date | null | undefined) { return value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(value) + " UTC" : "No data yet"; }
export function dateOnly(value: Date | null | undefined) { return value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(value) : "No data yet"; }
export function sourceState(source: PublicSource) {
  if (source.status === "blocked") return { label: "Check blocked", tone: "amber" };
  if (!source.approved || source.status !== "active") return { label: "Tracking pending", tone: "neutral" };
  if (!source.lastCheckedAt || source.inStock === null) return { label: "No data yet", tone: "neutral" };
  if (Date.now() - source.lastCheckedAt.getTime() > Math.max(source.pollSeconds * 3, 120) * 1000 || source.lastError) return { label: "Check delayed", tone: "amber" };
  return source.inStock ? { label: "In stock", tone: "green" } : { label: "Out of stock", tone: "neutral" };
}
export function duration(event: PublicEvent) { if (!event.endedAt) return "Open period"; const seconds = Math.max(0, Math.round((event.endedAt.getTime() - event.seenAt.getTime()) / 1000)); return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`; }
export const getProof = cache(async () => {
  try {
    const [sent, posts, events] = await Promise.all([
      prisma.radarNotification.count({ where: { status: "sent", sentAt: { not: null }, stockEvent: { source: { connector: { notIn: ["mock", "local-test"] }, item: { hidden: false } } } } }),
      prisma.radarCustomerPost.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.radarStockEvent.findMany({ where: { source: { connector: { notIn: ["mock", "local-test"] }, item: { hidden: false } } }, include: { source: { include: { item: true, variant: true } } }, orderBy: { seenAt: "desc" }, take: 50 }),
    ]);
    return { available: true, sent, posts, events };
  } catch { return { available: false, sent: null, posts: [], events: [] }; }
});
