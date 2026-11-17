import type { RadarSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { rateLimit } from "./access";
import { storeDirectory } from "./locations";
import { lookupApplePickup, lookupOfficialOnline, type OfficialConnectorName } from "./official-connectors";
import { BlockedSourceError } from "./source-http";
import { recordObservation } from "../../../worker/runtime";
import type { StockCheck } from "./domain";

const blockPrefix = "Inventory endpoint blocked: ";
export type LiveLookup = { checkedAt: string; count: number; cached: boolean };
type Input = { itemId: string; variantId: string; connector: OfficialConnectorName; productUrl: string; zip?: string };
type Observation = { locationId: string | null; result: StockCheck | null; error: string | null };
const cache = new Map<string, { until: number; value: LiveLookup }>();
const inFlight = new Map<string, Promise<LiveLookup>>();
const canCheckOnDemand = (source: Pick<RadarSource, "status" | "approved" | "lastError">) => source.status === "on_demand"
  || (source.status === "active" && source.approved)
  || (source.status === "blocked" && source.lastError?.startsWith("Research 2026-11-17: ") === true);

/** Persists real, explicitly requested observations without granting background-monitor approval. */
export async function saveLiveObservation(input: Input, observation: Observation, checkedAt: Date, database = prisma) {
  const store = observation.locationId ? storeDirectory.stores.find(store => store.id === observation.locationId) : undefined;
  if (observation.locationId && !store) throw new Error("Unknown pickup store.");
  const retailer = store?.id || (input.connector === "playstation-direct" ? "playstation-direct" : "nvidia");
  const leaseUntil = new Date(Date.now() + 180000);
  const claimed = await database.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`official-source:${input.connector}`}))`;
    if (await tx.radarSource.findFirst({ where: { connector: input.connector, status: "blocked", lastError: { startsWith: blockPrefix } }, select: { id: true } })) return null;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`live-source:${input.variantId}:${retailer}`}))`;
    let source = await tx.radarSource.findUnique({ where: { variantId_retailer: { variantId: input.variantId, retailer } } });
    if (source && !canCheckOnDemand(source)) return null;
    if (source?.lastError?.startsWith(blockPrefix) || (source?.leaseUntil && source.leaseUntil > new Date())) return null;
    if (source && (source.productUrl !== input.productUrl || source.connector !== input.connector || source.itemId !== input.itemId || source.locationId !== observation.locationId)) throw new Error("The configured source does not match this exact official product and location.");
    if (source?.lastCheckedAt && source.lastCheckedAt > checkedAt) return null;
    if (!source) source = await tx.radarSource.create({ data: {
      itemId: input.itemId, variantId: input.variantId, retailer,
      label: store?.name || (input.connector === "playstation-direct" ? "PlayStation Direct" : "NVIDIA Marketplace"),
      locationId: observation.locationId, fulfillment: store ? "pickup" : "online", productUrl: input.productUrl,
      connector: input.connector, pollSeconds: 300, approved: false, status: "on_demand",
    } });
    // Old research blocks applied to the HTML/robots URL, not to these verified API operations.
    // A real inventory-operation protection block above can only be cleared by an operator.
    return tx.radarSource.update({ where: { id: source.id }, data: {
      status: source.approved && source.status === "active" ? "active" : "on_demand", leaseUntil,
      ...(observation.error ? { lastError: observation.error } : {}),
    } });
  });
  if (!claimed) return;
  if (!observation.result) {
    await database.radarSource.updateMany({ where: { id: claimed.id, leaseUntil }, data: { leaseUntil: null, lastError: observation.error || "The official store did not return this configuration." } });
    return;
  }
  await recordObservation(claimed, leaseUntil, observation.result, checkedAt, database);
}

export async function refreshLiveStock(input: Input): Promise<LiveLookup> {
  if (process.env.DEMO_MODE === "true") throw new Error("Live inventory is disabled in demo mode.");
  const blocked = await prisma.radarSource.findFirst({ where: { connector: input.connector, status: "blocked", lastError: { startsWith: blockPrefix } }, select: { id: true } });
  if (blocked) throw new BlockedSourceError("The official inventory endpoint blocked requests. An operator must review the connection before it can be retried.");
  const key = JSON.stringify([input.connector, input.itemId, input.variantId, input.productUrl, input.zip || ""]);
  const saved = cache.get(key);
  if (saved && saved.until > Date.now()) return { ...saved.value, cached: true };
  const pending = inFlight.get(key);
  if (pending) return pending;
  const lookup = (async () => {
    // Shared database limit also bounds callers spread across application processes.
    await rateLimit(`official-live:${input.connector}`, 12, 60);
    try {
      let observations: Observation[], checkedAt: Date;
      if (input.connector === "apple-pickup") {
        if (!input.zip) throw new Error("Enter a ZIP code to check Apple pickup availability.");
        const result = await lookupApplePickup(input.productUrl, input.zip);
        observations = result.observations; checkedAt = result.checkedAt;
      } else {
        const result = await lookupOfficialOnline({ connector: input.connector, productUrl: input.productUrl, fulfillment: "online", locationId: null });
        observations = [{ locationId: null, result, error: null }]; checkedAt = new Date();
      }
      for (const observation of observations) await saveLiveObservation(input, observation, checkedAt);
      const result = { checkedAt: checkedAt.toISOString(), count: observations.filter(value => value.result !== null).length, cached: false };
      if (!result.count) throw new Error("The store returned no usable availability for this configuration.");
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(key, { until: Date.now() + 30_000, value: result });
      return result;
    } catch (error) {
      const isBlocked = error instanceof BlockedSourceError;
      const message = (error instanceof Error ? error.message : "Official inventory check failed.").slice(0, 400);
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`official-source:${input.connector}`}))`;
        await tx.radarSource.updateMany({ where: isBlocked ? { connector: input.connector } : { connector: input.connector, variantId: input.variantId }, data: {
          lastError: isBlocked ? blockPrefix + message : message,
          ...(isBlocked ? { status: "blocked", leaseUntil: null } : {}),
        } });
      });
      throw error;
    }
  })();
  inFlight.set(key, lookup);
  try { return await lookup; } finally { inFlight.delete(key); }
}

export function liveInput(itemId: string, variantId: string, sources: RadarSource[], mode: "pickup" | "online", zip?: string): Input | null {
  const source = sources.find(source => canCheckOnDemand(source) && (mode === "pickup" ? source.connector === "apple-pickup" : ["playstation-direct", "nvidia-store"].includes(source.connector)));
  if (!source) return null;
  return { itemId, variantId, connector: source.connector as OfficialConnectorName, productUrl: source.productUrl, zip };
}
