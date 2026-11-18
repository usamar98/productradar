import "dotenv/config";
import { setTimeout } from "node:timers/promises";
import { prisma } from "../src/lib/db";
import { pollDueSources } from "./runtime";
import { deliverPendingNotifications } from "./notifications";
import { pollSonyPartnerFeed } from "./partnerize";

let running = true;
let nextPartnerCheck = 0;
const once = process.argv.includes("--once");
process.on("SIGTERM", () => { running = false; });
process.on("SIGINT", () => { running = false; });
console.log("Restock Radar worker started. Only active, approved sources are monitored.");
try {
  while (running) {
    try {
      const partnerCheckDue = Date.now() >= nextPartnerCheck;
      if (partnerCheckDue) nextPartnerCheck = Date.now() + 30_000;
      await Promise.all([pollDueSources(), partnerCheckDue && pollSonyPartnerFeed(), deliverPendingNotifications()]);
      await prisma.radarAlert.updateMany({ where: { status: "active", activeUntil: { lte: new Date() } }, data: { status: "expired" } });
    } catch { console.error("Worker cycle failed; retrying. Check database connectivity and provider configuration."); }
    if (once) break;
    if (running) await setTimeout(1000);
  }
} finally { await prisma.$disconnect(); }
