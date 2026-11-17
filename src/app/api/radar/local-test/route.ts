import { z } from "zod";
import { prisma } from "@/lib/db";
import { isLocalTestMode, readLocalStock, setLocalStock } from "@/lib/radar/local-test";
import { assertLocalRequest } from "@/lib/radar/local-mode";
import { assertRadarOrigin } from "@/lib/radar/access";
import { paymentReadiness } from "@/lib/payments";
import { apiError, HttpError, readJson } from "@/lib/security";

function guard(request: Request) { if (!isLocalTestMode()) throw new HttpError(404,"Not found."); assertLocalRequest(request); }
const privateHeaders = {"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"};
export async function GET(request: Request) {
  try {
    guard(request);
    const [sources,alerts,payments,notifications] = await Promise.all([
      prisma.radarSource.findMany({where:{connector:"local-test",item:{hidden:false}},include:{variant:true},orderBy:{variant:{slug:"asc"}}}),
      prisma.radarAlert.findMany({orderBy:{createdAt:"desc"},take:10,select:{id:true,status:true,activeUntil:true,caughtAt:true,variant:{select:{label:true}}}}),
      prisma.radarPayment.count(),
      prisma.radarNotification.groupBy({by:["status"],_count:{_all:true}}),
    ]);
    return Response.json({payment:paymentReadiness(),sources:await Promise.all(sources.map(async source=>({id:source.id,variant:source.variant.label,variantSlug:source.variant.slug,itemSlug:"iphone-duo",desired:await readLocalStock(source.id),observed:source.inStock,lastCheckedAt:source.lastCheckedAt,error:source.lastError}))),alerts,payments,notifications:notifications.map(row=>({status:row.status,count:row._count._all})),expiresAt:process.env.STRIPE_SANDBOX_EXPIRES_AT||null},{headers:privateHeaders});
  } catch(error) {return apiError(error);}
}
export async function POST(request: Request) {
  try {
    guard(request);assertRadarOrigin(request);
    const {sourceId,inStock}=await readJson(request,z.object({sourceId:z.string().min(1).max(100),inStock:z.boolean()}).strict());
    const source=await prisma.radarSource.findUnique({where:{id:sourceId}});
    if(!source||source.connector!=="local-test") throw new HttpError(400,"Choose a local test source.");
    await setLocalStock(sourceId,inStock);
    await prisma.radarSource.update({where:{id:sourceId},data:{nextCheckAt:new Date()}});
    return Response.json({message:"Test signal changed. The worker will observe it on its next tick; no stock event or payment was inserted by this control."},{headers:privateHeaders});
  } catch(error) {return apiError(error);}
}
