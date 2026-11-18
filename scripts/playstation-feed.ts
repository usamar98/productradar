import "dotenv/config";
import { prisma } from "../src/lib/db";
import { partnerizeAccess, partnerizeStockConfig, sonyPartnerRetailer } from "../src/lib/radar/partnerize-config";
import { listSonyFeeds } from "../src/lib/radar/partnerize-feed";
import { resumeSonyPartnerFeed } from "../worker/partnerize";

try {
  const access = partnerizeAccess();
  const args = process.argv.slice(2);
  if (args.includes("--resume")) await resumeSonyPartnerFeed();
  if (args.includes("--list")) {
    if (!access) throw new Error("Feed discovery needs your approved PlayStation Direct campaign and Partnerize API credentials.");
    const feeds = await listSonyFeeds(access);
    console.table(feeds.map(feed => ({ feedId: feed.campaign_feeds_id, filename: feed.filename,
      processedAt: feed.last_processed ? new Date(feed.last_processed * 1000).toISOString() : null })));
  }
  const sync = await prisma.radarFeedSync.findUnique({ where: { id: sonyPartnerRetailer }, select: { blocked: true, nextCheckAt: true, message: true } });
  console.log(JSON.stringify({ campaignAccessConfigured: !!access, stockMappingConfigured: !!partnerizeStockConfig(), scheduler: sync }));
  if (!access) console.log("Request campaign access through https://direct.playstation.com/en-us/playstation-affiliate-programme");
} catch (error) {
  // Never print transport errors or signed download URLs.
  console.error(error instanceof Error && /^(Feed discovery needs|Configure the approved|Partnerize access stopped)/.test(error.message)
    ? error.message : "Could not inspect the PlayStation feed. Check the database, campaign access and configuration.");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
