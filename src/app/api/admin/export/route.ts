import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError, csvCell, HttpError } from "@/lib/security";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const admins = (process.env.ADMIN_EMAILS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
    if (!admins.includes(user.email.toLowerCase())) throw new HttpError(403, "Administrator access is required.");
    const [payments, refunds, attributions, expenses] = await Promise.all([
      prisma.payment.findMany({ orderBy: { paidAt: "desc" }, take: 10000 }),
      prisma.refund.findMany({ orderBy: { createdAt: "desc" }, take: 10000, include: { payment: { select: { userId: true } } } }),
      prisma.attribution.findMany({ orderBy: { createdAt: "desc" }, take: 10000 }),
      prisma.marketingExpense.findMany({ orderBy: { date: "desc" }, take: 10000 }),
    ]);
    const columns = ["record_type", "id", "user_id", "recorded_at", "amount_cents", "currency", "status", "refunded_cents", "attribution_id", "stripe_customer_id", "stripe_payment_intent_id", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "referring_domain", "landing_page", "consented_at", "channel", "description", "payment_id"];
    const rows: unknown[][] = [columns];
    for (const payment of payments) rows.push(["payment", payment.id, payment.userId, payment.paidAt.toISOString(), payment.amountCents, payment.currency, payment.status, payment.refundedCents, payment.attributionId, payment.stripeCustomerId, payment.stripePaymentIntentId]);
    for (const refund of refunds) rows.push(["refund", refund.id, refund.payment.userId, refund.createdAt.toISOString(), refund.amountCents, refund.currency, refund.status, "", "", "", "", "", "", "", "", "", "", "", "", "", "", refund.paymentId]);
    for (const attribution of attributions) rows.push(["attribution", attribution.id, attribution.userId, attribution.createdAt.toISOString(), "", "", "", "", "", "", "", attribution.utmSource, attribution.utmMedium, attribution.utmCampaign, attribution.utmTerm, attribution.utmContent, attribution.referringDomain, attribution.landingPage, attribution.consentedAt.toISOString()]);
    for (const expense of expenses) rows.push(["marketing_expense", expense.id, "", expense.date.toISOString(), expense.amountCents, expense.currency, "", "", "", "", "", "", "", "", "", "", "", "", "", expense.channel, expense.description]);
    const csv = rows.map(row => columns.map((_, index) => csvCell(row[index])).join(",")).join("\r\n");
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="gpu-stock-watch-export-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store", "X-Export-Limit": "10000 records per category" } });
  } catch (error) { return apiError(error); }
}
