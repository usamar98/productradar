import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { requestFreeAlert, confirmFreeAlert } from "../src/lib/radar/free-alert";
import { canDeliver } from "../src/lib/radar/domain";

const connectionString = process.env.TEST_DATABASE_URL;
const safe = connectionString && /_test$/.test(new URL(connectionString).pathname);
if (connectionString && !safe) throw new Error("Free-alert tests require an isolated _test database.");
describe.skipIf(!safe)("free alert lifecycle (real PostgreSQL)", () => {
  const db = new PrismaClient({adapter:new PrismaPg({connectionString,max:5})});
  const id = "free-alert-fixture", email = "free-alert-fixture@example.test";
  const selection = {email,itemId:id,variantId:id,sourceIds:[id]};
  async function cleanUser() {
    await db.radarNotification.deleteMany({where:{alert:{userId:id}}});
    await db.radarAlert.deleteMany({where:{userId:id}});
    await db.radarSubscription.deleteMany({where:{userId:id}});
    await db.radarUser.deleteMany({where:{id}});
  }
  beforeAll(async () => {
    vi.stubEnv("RADAR_AUTH_SECRET","test-free-alert-secret-".repeat(3));
    await db.radarCategory.upsert({where:{id},create:{id,slug:id,name:"Test"},update:{}});
    await db.radarItem.upsert({where:{id},create:{id,slug:id,categoryId:id,name:"Test",hidden:false},update:{}});
    await db.radarVariant.upsert({where:{id},create:{id,slug:"standard",itemId:id,label:"Test"},update:{}});
    await db.radarSource.upsert({where:{id},create:{id,itemId:id,variantId:id,retailer:id,label:"Test",productUrl:"https://example.com/test",approved:true,status:"active",connector:"jsonld"},update:{}});
  });
  beforeEach(async () => { await cleanUser(); await db.radarUser.create({data:{id,email}}); await db.radarSource.update({where:{id},data:{approved:true,status:"active"}}); });
  afterAll(async () => {
    await cleanUser(); await db.radarSource.deleteMany({where:{id}}); await db.radarVariant.deleteMany({where:{id}}); await db.radarItem.deleteMany({where:{id}}); await db.radarCategory.deleteMany({where:{id}}); await db.$disconnect(); vi.unstubAllEnvs();
  });
  it("requires verification, creates no payment, and activates exactly 14 days", async () => {
    const draft = await requestFreeAlert(selection,null,db);
    expect(draft.activated).toBe(false); if(draft.activated) throw new Error("Unexpected activation");
    expect(await db.radarSubscription.count({where:{userId:id}})).toBe(0);
    expect((await db.radarAlert.findUniqueOrThrow({where:{id:draft.alertId}})).status).toBe("awaiting_verification");
    const start = Date.now(); await confirmFreeAlert(draft.token,db);
    const alert = await db.radarAlert.findUniqueOrThrow({where:{id:draft.alertId},include:{plan:true,subscription:true}});
    expect(alert.activeUntil!.getTime()-start).toBeGreaterThanOrEqual(14*86400000);
    expect(alert.activeUntil!.getTime()-start).toBeLessThan(14*86400000+5000);
    expect(alert.tokenHash).toBeNull(); expect(canDeliver(alert)).toBe(true);
    expect(alert.subscription).toMatchObject({priceCents:0,alertLimit:1,customerRef:null});
    expect(await db.radarPayment.count({where:{userId:id}})).toBe(0);
    expect(canDeliver(alert,new Date(alert.activeUntil!.getTime()+1))).toBe(false);
  });
  it("allows only one concurrent activation and rejects token reuse", async () => {
    const draft = await requestFreeAlert(selection,null,db); if(draft.activated) throw new Error("Unexpected");
    const attempts = await Promise.allSettled([confirmFreeAlert(draft.token,db),confirmFreeAlert(draft.token,db)]);
    expect(attempts.filter(value=>value.status === "fulfilled")).toHaveLength(1);
    expect(await db.radarSubscription.count({where:{userId:id}})).toBe(1);
    await expect(confirmFreeAlert(draft.token,db)).rejects.toMatchObject({status:401});
  });
  it("does not replenish the free offer after pause or expiry", async () => {
    const result = await requestFreeAlert(selection,id,db); expect(result.activated).toBe(true);
    await db.radarAlert.update({where:{id:result.alertId},data:{status:"paused",activeUntil:new Date(0)}});
    await db.radarSubscription.updateMany({where:{userId:id},data:{status:"expired",currentPeriodEnd:new Date(0)}});
    await expect(requestFreeAlert(selection,id,db)).rejects.toMatchObject({status:409});
  });
  it("replaces unverified links and verifies the exact selected source again", async () => {
    const first = await requestFreeAlert(selection,null,db), second = await requestFreeAlert(selection,null,db);
    if(first.activated || second.activated) throw new Error("Unexpected");
    expect(first.alertId).toBe(second.alertId);
    await expect(confirmFreeAlert(first.token,db)).rejects.toMatchObject({status:401});
    await db.radarSource.update({where:{id},data:{status:"paused"}});
    await expect(confirmFreeAlert(second.token,db)).rejects.toMatchObject({status:503});
    expect(await db.radarSubscription.count({where:{userId:id}})).toBe(0);
  });
  it("rejects invalid selections without using the offer", async () => {
    await expect(requestFreeAlert({...selection,sourceIds:[id,id]},id,db)).rejects.toMatchObject({status:400});
    await expect(requestFreeAlert({...selection,variantId:"other-variant"},id,db)).rejects.toMatchObject({status:400});
    await db.radarSource.update({where:{id},data:{approved:false}});
    await expect(requestFreeAlert(selection,id,db)).rejects.toMatchObject({status:503});
    expect(await db.radarSubscription.count({where:{userId:id}})).toBe(0);
  });
});
