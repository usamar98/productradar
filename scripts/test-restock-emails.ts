import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";
import { isLocalTestMode } from "../src/lib/radar/local-test";
import { isLocalMailboxEnabled } from "../src/lib/radar/local-mode";
import { localFeedRequest, localFeedSamples } from "../src/lib/radar/local-feed";
import { officialCatalogProduct } from "../src/lib/radar/official-catalog";
import type { CapturedEmail } from "../src/lib/radar/email";

const loaded = config({ path: ".env.local-test", override: true, quiet: true });
if (loaded.error || !["APP_URL", "DATABASE_URL", "RADAR_LOCAL_TEST_MODE", "NODE_ENV", "RADAR_LOCAL_MAILBOX", "RADAR_AUTH_SECRET"].every(key => Object.hasOwn(loaded.parsed || {}, key)) ||
    !isLocalTestMode() || !isLocalMailboxEnabled()) throw new Error("Use the isolated local lab and local inbox.");
const origin = new URL(process.env.APP_URL!).origin;
if (!["http://localhost:3001", "http://127.0.0.1:3001"].includes(origin)) throw new Error("The lab must run on loopback port 3001.");
const { prisma } = await import("../src/lib/db");
const run = randomUUID().slice(0, 12);
type Sample = typeof localFeedSamples[number];
type Reading = { sourceId: string; state: string; alertable: boolean; simulated: boolean };

async function request(path: string, method = "GET", payload?: unknown, cookie?: string) {
  const response = await fetch(origin + path, { method, redirect: "error", headers: {
    Origin: origin, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}),
  }, ...(payload ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(method + " " + path.split("?")[0] + " returned " + response.status + ": " + (await response.json()).error);
  return response;
}
async function publish(sample: Sample, inStock: boolean, observedAt?: Date) {
  const response = await fetch(localFeedRequest(sample, inStock, observedAt), { signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, sample.brand + " signed inventory update");
  return await response.json() as { sourceId: string; result: string };
}
async function stockSearch(sample: Sample, sourceId: string, desired: string) {
  const response = await request("/api/radar/stock-search", "POST", {
    item: sample.item, variant: sample.variant, ...(sample.storeId ? { mode: "pickup", search: "Fifth Avenue", storeId: sample.storeId } : { mode: "online" }),
  });
  const { stores, retailers } = await response.json() as { stores: Reading[]; retailers?: Reading[] };
  const row = [...stores, ...(retailers || [])].find(row => row.sourceId === sourceId);
  assert.ok(row?.simulated && row.alertable && row.state === desired, sample.brand + " exact stock finder result");
}
async function inbox() {
  const { messages } = await (await request("/api/radar/local-inbox")).json();
  return messages as CapturedEmail[];
}
function emailAction(message: CapturedEmail, pathname: string) {
  const url = message.text.split(/\s+/).filter(word => word.startsWith(origin + "/")).map(word => new URL(word))
    .find(url => url.origin === origin && url.pathname === pathname);
  assert.ok(url && url.searchParams.get("token"), "Email contains the expected local action");
  return url;
}

try {
  const controls = await (await request("/api/radar/local-test")).json() as { sources: {
    id: string; item: string; itemId: string; itemSlug: string; variant: string; variantId: string; variantSlug: string; label: string; feed: boolean;
  }[] };
  for (const sample of localFeedSamples) {
    const source = controls.sources.find(row => row.feed && row.itemSlug === sample.item && row.variantSlug === sample.variant);
    assert.ok(source, "Run npm run local-test:setup before testing " + sample.brand);
    const email = "restock-" + sample.brand + "-" + run + "@example.test";
    let cookie: string | undefined, alertId: string | undefined;
    try {
      const baseline = await publish(sample, false);
      assert.equal(baseline.sourceId, source.id);
      await stockSearch(sample, source.id, "out_of_stock");
      await request("/api/radar/free-alert", "POST", { email, itemId: source.itemId, variantId: source.variantId, sourceIds: [source.id] });
      const confirmation = (await inbox()).find(mail => mail.to === email && mail.subject.startsWith("Confirm"));
      assert.ok(confirmation, "Captured signup verification");
      const verify = emailAction(confirmation, "/alerts/verify-free");
      const activated = await request("/api/radar/free-alert", "PUT", { token: verify.searchParams.get("token") });
      cookie = activated.headers.get("set-cookie")?.split(";")[0];
      assert.ok(cookie, "Verification established an account session");
      const { alerts } = await (await request("/api/radar/me", "GET", undefined, cookie)).json();
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].status, "active");
      assert.deepEqual(alerts[0].sourceIds, [source.id]);
      alertId = String(alerts[0].id);

      const observed = new Date();
      const retries = await Promise.all([publish(sample, true, observed), publish(sample, true, observed)]);
      assert.deepEqual(retries.map(report => report.result).sort(), ["duplicate", "recorded"]);
      assert.equal((await publish(sample, false, new Date(observed.getTime() - 1))).result, "older");
      await publish(sample, true);
      await stockSearch(sample, source.id, "in_stock");

      const deadline = Date.now() + 25_000;
      let restocks: CapturedEmail[] = [];
      while (Date.now() < deadline) {
        restocks = (await inbox()).filter(mail => mail.to === email && mail.subject.startsWith("LOCAL TEST:"));
        if (restocks.length && await prisma.radarNotification.count({ where: { alertId, status: "captured" } })) break;
        await delay(300);
      }
      assert.equal(restocks.length, 1, "One captured restock email for " + sample.brand);
      const [mail] = restocks;
      assert.ok(mail.subject.includes(source.item) && mail.subject.includes(source.label) && mail.text.includes(source.variant), "Email matches product, edition and store");
      assert.ok(mail.text.includes(new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(sample.priceCents / 100)), "Email includes the observed price");
      const click = await fetch(emailAction(mail, "/api/radar/click"), { redirect: "manual" });
      assert.equal(click.status, 303);
      assert.equal(click.headers.get("location"), officialCatalogProduct(sample.item, sample.variant)?.productUrl);
      await request("/api/radar/alerts/" + alertId, "DELETE", undefined, cookie);
      await publish(sample, false);
      await publish(sample, true);
      const jobs = await prisma.radarNotification.findMany({ where: { alertId }, select: { status: true, sentAt: true } });
      assert.deepEqual(jobs, [{ status: "captured", sentAt: null }], "Repeated reports and paused alerts must not enqueue more emails");
      console.log(sample.brand + " PASS · verified signup · stock finder · 1 captured restock email · exact retailer link · duplicate, stale and paused updates checked");
    } finally {
      if (cookie && alertId) await request("/api/radar/alerts/" + alertId, "DELETE", undefined, cookie);
      await publish(sample, false);
    }
  }
  console.log("3 of 3 brand flows passed. Evidence is available at " + origin + "/local-inbox");
} finally { await prisma.$disconnect(); }
