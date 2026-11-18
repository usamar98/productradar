import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { prisma } from "../src/lib/db";
import { emailReadiness, sendRadarEmail } from "../src/lib/radar/email";
import { officialCatalogProduct } from "../src/lib/radar/official-catalog";
import { stockEmail } from "../src/lib/radar/stock-email";

type Evidence = { name: string; label: string; variant: string; url: string; observed: Date };

async function recordedObservation(): Promise<Evidence | null> {
  const rows = await prisma.$queryRaw<{ item: string; variant: string; name: string; configuration: string; label: string; url: string; observed: Date }[]>`
    SELECT i.slug AS item, v.slug AS variant, i.name, v.label AS configuration, s.label,
           s."productUrl" AS url, e."seenAt" AS observed
    FROM stock_events e JOIN sources s ON e."sourceId" = s.id
    JOIN items i ON i.id = s."itemId" JOIN variants v ON v.id = s."variantId" AND v."itemId" = i.id
    WHERE e."inStock" AND e."seenAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AND NOT i.hidden AND s.connector IN
      ('apple-pickup','playstation-direct','nvidia-store','inventory-apple','inventory-playstation','inventory-nvidia')
    ORDER BY e."seenAt" DESC, e.id LIMIT 100`;
  for (const row of rows) {
    if (officialCatalogProduct(row.item, row.variant)?.productUrl === row.url)
      return { name: row.name, label: row.label, variant: row.configuration, url: row.url, observed: row.observed };
  }
  return null;
}

async function run() {
  const app = new URL(process.env.APP_URL || ""), db = new URL(process.env.DATABASE_URL || "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(app.hostname) || !["http:", "https:"].includes(app.protocol) || app.username || app.password ||
      /_test$/.test(decodeURIComponent(db.pathname)) || process.env.RADAR_LOCAL_TEST_MODE === "true" ||
      process.env.RADAR_LOCAL_MAILBOX === "true" || process.env.DEMO_MODE === "true") throw new Error("Use the main local app with real email delivery enabled.");
  const to = z.email().parse(process.env.RADAR_RESEND_TEST_TO?.trim().toLowerCase());
  const evidence = await recordedObservation();
  const title = evidence ? "[Delivery test] Recorded availability for " + evidence.name : "[Delivery test] Your Restock Radar email is connected";
  const message = evidence
    ? stockEmail({ to, title, origin: app.origin, url: evidence.url, label: evidence.label,
      description: evidence.variant + " was recorded in stock at " + evidence.label + " on " + evidence.observed.toISOString() + ". This delivery test replays that observation. Check the store for current availability." })
    : { to, subject: title, text: "This is your requested Resend delivery test. Restock Radar has no recorded positive observation from an official store to include. You will receive a stock alert when a connected source confirms availability for your selected product." };
  console.log(message.subject + (evidence ? " | " + evidence.label + " | " + evidence.observed.toISOString() : ""));
  if (process.argv.includes("--dry-run")) { console.log("Preview only. No email was sent."); return; }
  const day = new Date().toISOString().slice(0, 10);
  const key = createHash("sha256").update("owner-email-test-v1:" + to + ":" + day).digest("hex");
  const directory = join(process.cwd(), ".local", "resend-tests"), receipt = join(directory, key + ".json");
  try {
    const prior = z.object({ id: z.string().min(1) }).parse(JSON.parse(await readFile(receipt, "utf8")));
    console.log("Resend already accepted today's test. Message ID " + prior.id); return;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (process.argv.includes("--wait") && emailReadiness().mode !== "resend") {
    console.log("Waiting for the Resend account owner's approval.");
    const deadline = Date.now() + 30 * 60_000;
    while (Date.now() < deadline && emailReadiness().mode !== "resend") await delay(2000);
  }
  if (emailReadiness().mode !== "resend") throw new Error("Approve the send-only connection with npm run email:connect, then run npm run email:test.");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const result = await sendRadarEmail(message, { idempotencyKey: "radar-owner-test-" + key });
  if (result.captured) throw new Error("The test unexpectedly used local capture.");
  await writeFile(receipt, JSON.stringify({ id: result.id, acceptedAt: new Date().toISOString() }), { mode: 0o600 });
  console.log("Resend accepted the test email. Message ID " + result.id);
}

try { await run(); }
catch (error) { console.error(error instanceof Error ? error.message : "The Resend delivery test failed."); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
