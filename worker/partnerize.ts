import { createHash } from "node:crypto";
import { prisma } from "../src/lib/db";
import { HttpError } from "../src/lib/security";
import { receiveInventory } from "../src/lib/radar/inventory-feed";
import { partnerizeStockConfig, sonyPartnerRetailer } from "../src/lib/radar/partnerize-config";
import { downloadSonyFeed, FeedFormatError, listSonyFeeds } from "../src/lib/radar/partnerize-feed";
import { BlockedSourceError } from "../src/lib/radar/source-http";

export async function pollSonyPartnerFeed(database = prisma) {
  const config = partnerizeStockConfig();
  if (!config) return;
  const id = sonyPartnerRetailer, now = new Date();
  const sync = await database.radarFeedSync.upsert({ where: { id }, create: { id, nextCheckAt: now }, update: {} });
  if (sync.blocked || sync.nextCheckAt > now) return;
  const leaseUntil = new Date(now.getTime() + 120_000);
  const claimed = await database.radarFeedSync.updateMany({ where: { id, blocked: false, nextCheckAt: { lte: now },
    OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { leaseUntil } });
  if (!claimed.count) return;
  const owned = { id, leaseUntil };
  const nextCheckAt = new Date(now.getTime() + config.interval * 1000);
  try {
    const feeds = await listSonyFeeds(config);
    const feed = feeds.find(value => value.campaign_feeds_id === config.feed);
    if (!feed) throw new BlockedSourceError("The selected PlayStation campaign feed is no longer available to this publisher.");
    // Processing time identifies a file edition. Only merchant stock timestamps can open a stock period.
    const revision = feed.last_processed ? createHash("sha256").update(JSON.stringify([config.publisher, config.campaign, config.feed, feed.last_processed, config.columns])).digest("hex") : null;
    if (revision && revision === sync.revision) {
      await database.radarFeedSync.updateMany({ where: owned, data: { nextCheckAt, leaseUntil: null } });
      return;
    }
    const observations = await downloadSonyFeed(feed, config.columns);
    let recorded = 0;
    for (const observation of observations) {
      try {
        const result = await receiveInventory("playstation", observation, database, leaseUntil);
        if (result.result === "recorded") recorded++;
      } catch (error) {
        // An operator may pause individual products while the rest of the feed stays active.
        if (error instanceof HttpError && (error.status === 422 || error.message === "This inventory source is paused or its configuration has changed.")) continue;
        throw error;
      }
    }
    const message = observations.length ? "Fresh exact Sony items in this edition: " + observations.length + ". Updated: " + recorded + "." : "No fresh, explicit stock for an exact US PlayStation Direct SKU in this edition.";
    await database.radarFeedSync.updateMany({ where: owned, data: { revision, message, nextCheckAt, leaseUntil: null } });
  } catch (error) {
    const blocked = error instanceof BlockedSourceError || error instanceof FeedFormatError;
    const message = blocked ? error.message : "Partner feed sync failed. The worker will retry at the configured interval.";
    await database.$transaction(async tx => {
      const updated = await tx.radarFeedSync.updateMany({ where: owned, data: { blocked, message, revision: null, nextCheckAt, leaseUntil: null } });
      if (blocked && updated.count) {
        await tx.radarSource.updateMany({ where: { retailer: id, connector: "inventory-playstation", status: "feed" },
          data: { status: "blocked", lastError: message } });
      }
    });
  }
}

export async function resumeSonyPartnerFeed(database = prisma) {
  if (!partnerizeStockConfig()) throw new Error("Configure the approved campaign, feed and stock columns before resuming.");
  await database.$transaction(async tx => {
    const id = sonyPartnerRetailer;
    const result = await tx.radarFeedSync.updateMany({ where: { id, blocked: true }, data: { blocked: false, revision: null, message: null, nextCheckAt: new Date(), leaseUntil: null } });
    if (!result.count) return;
    const where = { retailer: id, connector: "inventory-playstation", status: "blocked" };
    await tx.radarStockEvent.updateMany({ where: { source: where, endedAt: null }, data: { endedAt: new Date() } });
    await tx.radarSource.updateMany({ where, data: { status: "feed", inStock: null, priceCents: null, lastCheckedAt: null, lastError: null } });
  });
}
