import "server-only";
import { prisma } from "@/lib/db";
import { authConfigured } from "@/lib/auth";
import { checkoutPolicy } from "./policy";
import { inventoryAdapters } from "@/lib/inventory";

export function pushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

export async function billingReadiness() {
  let sourceReady = false;
  if (process.env.DATABASE_URL && inventoryAdapters().some(adapter => adapter.id === "bestbuy" && adapter.enabled)) {
    const retailer = await prisma.retailer.findUnique({ where: { id: "bestbuy" } });
    sourceReady = Boolean(retailer?.enabled && retailer.lastSuccessfulCheck && !retailer.lastError && retailer.lastState !== "UNKNOWN" && retailer.lastState !== "CHECK_FAILED" && Date.now() - retailer.lastSuccessfulCheck.getTime() < Math.max(900, retailer.intervalSeconds * 3) * 1000);
  }
  const policy = checkoutPolicy({
    demo: process.env.DEMO_MODE === "true",
    stripeSecret: process.env.STRIPE_SECRET_KEY,
    stripePrice: process.env.STRIPE_PRICE_ID,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    authReady: authConfigured(), sourceReady,
    notificationsReady: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && pushConfigured()),
    liveEnabled: process.env.ENABLE_LIVE_CHECKOUT === "true",
    authVerified: process.env.AUTH_FLOW_VERIFIED === "true",
    emailVerified: process.env.EMAIL_DELIVERY_VERIFIED === "true",
    pushVerified: process.env.PUSH_DELIVERY_VERIFIED === "true",
    billingVerified: process.env.BILLING_FLOW_VERIFIED === "true",
    hackathon: process.env.HACKATHON_MODE === "true",
    trafficScript: process.env.TRAFFIC_VERIFICATION_SCRIPT_URL,
    trafficVerified: process.env.TRAFFIC_VERIFICATION_VERIFIED === "true",
  });
  return { ...policy, pushConfigured: pushConfigured(), authConfigured: authConfigured() };
}
