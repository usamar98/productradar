import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { apiError, HttpError, readJson } from "@/lib/security";
import { ADMIN_COOKIE, adminLoginLimit, adminToken, checkAdminPassword, requireAdmin } from "@/lib/radar/admin";

const url = z.string().url().max(2048).refine(value => { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && !u.port && u.hostname.includes(".") && !/localhost|\.local$|\.internal$/.test(u.hostname); }, "Use a public HTTPS URL.");
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("login"), password: z.string().min(1).max(512) }),
  z.object({ action: z.literal("logout") }),
  z.object({ action: z.literal("source"), id: z.string().optional(), itemId: z.string(), variantId: z.string(), retailer: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80), label: z.string().min(1).max(120), productUrl: url, connector: z.enum(["jsonld", "mock"]), pollSeconds: z.number().int().min(15).max(86400), status: z.enum(["active", "paused"]), approved: z.boolean() }),
  z.object({ action: z.literal("pause"), id: z.string() }),
  z.object({ action: z.literal("cost"), label: z.string().min(1).max(200), amountCents: z.number().int().min(0).max(100000000), category: z.string().min(1).max(80), incurredAt: z.iso.datetime() }),
  z.object({ action: z.literal("post"), url, text: z.string().min(1).max(3000) }),
  z.object({ action: z.literal("delete-post"), id: z.string() }),
]);
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(process.env.APP_URL || "http://localhost:3000").origin) throw new HttpError(403, "Open this form from the application website.");
    const data = await readJson(request, input);
    if (data.action === "login") {
      if (!checkAdminPassword(data.password)) { await adminLoginLimit(request); throw new HttpError(401, "Incorrect admin password."); }
      await adminLoginLimit(request);
      (await cookies()).set(ADMIN_COOKIE, adminToken(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 28800 });
    } else {
      await requireAdmin();
      if (data.action === "logout") (await cookies()).delete(ADMIN_COOKIE);
      if (data.action === "source") {
        const variant = await prisma.radarVariant.findFirst({ where: { id: data.variantId, itemId: data.itemId }, include: { item: true } });
        if (!variant) throw new HttpError(400, "The variant must belong to the selected item.");
        if (data.status === "active" && !data.approved) throw new HttpError(400, "Review retailer terms and approve this source before activating it.");
        if (data.connector === "mock" && (!variant.item.hidden || process.env.NODE_ENV === "production")) throw new HttpError(400, "Mock sources are restricted to hidden development items.");
        const { action: _action, id, ...record } = data;
        const existing = id ? await prisma.radarSource.findUnique({ where: { id } }) : null;
        if (id && !existing) throw new HttpError(404, "Source not found.");
        if (existing && (existing.itemId !== record.itemId || existing.variantId !== record.variantId)) throw new HttpError(400, "Create a new source to track another item or variant.");
        if (existing && (existing.productUrl !== record.productUrl || existing.connector !== record.connector) && await prisma.radarStockEvent.count({ where: { sourceId: existing.id } })) throw new HttpError(400, "A source with recorded history cannot change its product URL or connector. Add a new retailer slug to preserve its history.");
        if (id) await prisma.radarSource.update({ where: { id }, data: { ...record, nextCheckAt: new Date(), leaseUntil: null, failureCount: 0, lastError: null } });
        else await prisma.radarSource.create({ data: record });
      }
      if (data.action === "pause") await prisma.radarSource.update({ where: { id: data.id }, data: { status: "paused", leaseUntil: null } });
      if (data.action === "cost") await prisma.radarCost.create({ data: { label: data.label, amountCents: data.amountCents, category: data.category, incurredAt: new Date(data.incurredAt) } });
      if (data.action === "post") await prisma.radarCustomerPost.create({ data: { url: data.url, text: data.text } });
      if (data.action === "delete-post") await prisma.radarCustomerPost.delete({ where: { id: data.id } });
    }
    revalidatePath("/", "layout");
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
