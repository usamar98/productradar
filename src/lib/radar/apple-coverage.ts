import { distanceMiles, storeDirectory, type StoreLocation } from "./locations";
import { BlockedSourceError } from "./source-http";
import type { lookupApplePickup } from "./official-connectors";

type Batch = Awaited<ReturnType<typeof lookupApplePickup>>;
export type AppleObservation = Batch["observations"][number] & { checkedAt: Date };
type Store = Pick<StoreLocation, "id" | "postalCode" | "latitude" | "longitude">;
export const maxAppleCoverageLookups = 5;

// Geography chooses the next search area only. Stock always comes from Apple's response.
export function nextAppleCoverageZip(targets: Store[], returned: Set<string>, searched: Set<string>, directory: Store[] = storeDirectory.stores) {
  let best: { zip: string; score: number } | undefined;
  for (const store of targets) {
    const zip = store.postalCode.slice(0, 5);
    if (returned.has(store.id) || searched.has(zip) || !/^\d{5}$/.test(zip)) continue;
    const nearby = [...directory].sort((a, b) => distanceMiles(store, a) - distanceMiles(store, b)).slice(0, 12);
    const score = nearby.filter(candidate => !returned.has(candidate.id) && targets.some(target => target.id === candidate.id)).length;
    if (!best || score > best.score) best = { zip, score };
  }
  return best?.zip;
}

/** A bounded set of lookups within one user search, never a background poll loop. */
export async function collectAppleCoverage(targets: Store[], initialZip: string, lookup: (zip: string) => Promise<Batch>, maxLookups = maxAppleCoverageLookups) {
  const observations = new Map<string, AppleObservation>();
  const searched = new Set<string>();
  const deadline = Date.now() + 25_000;
  let zip: string | undefined = initialZip;
  let warning: string | null = null;
  while (zip && searched.size < Math.min(maxLookups, maxAppleCoverageLookups)) {
    if (searched.has(zip)) break;
    searched.add(zip);
    try {
      const batch = await lookup(zip);
      for (const observation of batch.observations) {
        const previous = observations.get(observation.locationId);
        if (!previous || batch.checkedAt >= previous.checkedAt) observations.set(observation.locationId, { ...observation, checkedAt: batch.checkedAt });
      }
    } catch (error) {
      // Protection stops the whole provider. A later transient failure preserves the
      // usable batches and their original timestamps instead of invalidating them.
      if (error instanceof BlockedSourceError || !observations.size) throw error;
      warning = `Some store checks could not finish. ${error instanceof Error ? error.message : "Try an individual store again shortly."}`;
      break;
    }
    if (targets.every(store => observations.has(store.id)) || Date.now() >= deadline) break;
    zip = nextAppleCoverageZip(targets, new Set(observations.keys()), searched);
  }
  const values = [...observations.values()];
  if (!values.length) throw new Error("Apple returned no usable store responses.");
  return {
    observations: values,
    checkedAt: new Date(Math.max(...values.map(value => value.checkedAt.getTime()))),
    lookups: searched.size,
    unresolvedStoreIds: targets.filter(store => !observations.get(store.id)?.result).map(store => store.id),
    warning,
  };
}
