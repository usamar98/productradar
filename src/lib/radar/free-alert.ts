import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FREE_PLAN, FREE_ALERT_DAYS } from "@/config/pricing";
import { HttpError } from "@/lib/security";
import { createFreeAlertToken, hashToken, verifyFreeAlertToken } from "./access";
import { isLocalTestMode } from "./local-test";

export type FreeAlertInput = { email: string; itemId: string; variantId: string; sourceIds: string[] };
async function eligibleSources(tx: Prisma.TransactionClient, input: Omit<FreeAlertInput, "email">) {
  if (input.sourceIds.length !== 1) throw new HttpError(400, "Your free alert covers one retailer or store.");
  const source = await tx.radarSource.findFirst({ where: { id: input.sourceIds[0], itemId: input.itemId, variantId: input.variantId, item: { hidden: false } } });
  if (!source) throw new HttpError(400, "Choose a retailer for this exact configuration.");
  if (!source.approved || source.status !== "active" || source.connector === "mock" || (source.connector === "local-test" && !isLocalTestMode())) throw new HttpError(503, "This retailer is not connected yet. Your free alert has not been used.");
}
async function activate(tx: Prisma.TransactionClient, userId: string, alertId: string) {
  const providerRef = `free:${userId}`;
  if (await tx.radarSubscription.findUnique({ where: { providerRef } })) throw new HttpError(409, "Your first free alert has already been used. Choose a paid plan for another alert.");
  const activeUntil = new Date(Date.now() + FREE_ALERT_DAYS * 86400_000);
  const subscription = await tx.radarSubscription.create({ data: { userId, planId: FREE_PLAN.id, providerRef, priceCents: 0, alertLimit: 1, status: "active", currentPeriodEnd: activeUntil } });
  await tx.radarAlert.update({ where: { id: alertId }, data: { status: "active", activeUntil, subscriptionId: subscription.id, tokenHash: null } });
}
export async function requestFreeAlert(input: FreeAlertInput, authenticatedId: string | null, database = prisma) {
  return database.$transaction(async tx => {
    await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtextextended(${`radar-checkout:${input.email}`}, 0))`;
    await eligibleSources(tx, input);
    const user = await tx.radarUser.upsert({ where: { email: input.email }, create: { email: input.email }, update: {} });
    if (await tx.radarSubscription.findUnique({ where: { providerRef: `free:${user.id}` } })) throw new HttpError(409, "Your first free alert has already been used. Choose a paid plan for another alert.");
    const { description: _description, ...plan } = FREE_PLAN;
    await tx.radarPlan.upsert({ where: { id: plan.id }, create: plan, update: plan });
    const draft = await tx.radarAlert.findFirst({ where: { userId: user.id, planId: plan.id, status: "awaiting_verification" } });
    const data = { itemId: input.itemId, variantId: input.variantId, sourceIds: input.sourceIds };
    const alert = draft ? await tx.radarAlert.update({ where: { id: draft.id }, data }) : await tx.radarAlert.create({ data: { ...data, userId: user.id, planId: plan.id, status: "awaiting_verification" } });
    if (authenticatedId === user.id) { await activate(tx, user.id, alert.id); return { activated: true as const, user, alertId: alert.id }; }
    const token = createFreeAlertToken(user.id, alert.id);
    await tx.radarAlert.update({ where: { id: alert.id }, data: { tokenHash: hashToken(token) } });
    return { activated: false as const, user, alertId: alert.id, token };
  });
}
export async function confirmFreeAlert(token: string, database = prisma) {
  const payload = verifyFreeAlertToken(token);
  if (!payload) throw new HttpError(401, "This verification link has expired. Start your free alert again to request a new link.");
  return database.$transaction(async tx => {
    const user = await tx.radarUser.findUnique({ where: { id: payload.userId } });
    if (!user) throw new HttpError(401, "This verification link is invalid.");
    await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtextextended(${`radar-checkout:${user.email}`}, 0))`;
    const alert = await tx.radarAlert.findFirst({ where: { id: payload.alertId, userId: user.id, planId: FREE_PLAN.id, status: "awaiting_verification", tokenHash: hashToken(token) } });
    if (!alert) throw new HttpError(401, "This verification link has already been used or replaced.");
    await eligibleSources(tx, alert);
    await activate(tx, user.id, alert.id);
    return user.id;
  });
}
