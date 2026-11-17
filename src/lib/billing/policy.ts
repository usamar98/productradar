export type AccessSubscription = {
  status: string;
  currentPeriodEnd: Date | string | null;
  refundedAt?: Date | string | null;
};

export function hasPaidAccess(subscription: AccessSubscription | null | undefined, now = new Date()) {
  return Boolean(subscription && subscription.status === "active" && !subscription.refundedAt && subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd).getTime() > now.getTime());
}

export type ReadinessInputs = {
  demo: boolean;
  stripeSecret: string | undefined;
  stripePrice: string | undefined;
  webhookSecret: string | undefined;
  authReady: boolean;
  sourceReady: boolean;
  notificationsReady: boolean;
  liveEnabled: boolean;
  authVerified: boolean;
  emailVerified: boolean;
  pushVerified: boolean;
  billingVerified: boolean;
  hackathon: boolean;
  trafficScript: string | undefined;
  trafficVerified: boolean;
};

export function checkoutPolicy(input: ReadinessInputs) {
  const testMode = input.stripeSecret?.startsWith("sk_test_") ?? true;
  const knownKey = Boolean(input.stripeSecret?.startsWith("sk_test_") || input.stripeSecret?.startsWith("sk_live_"));
  const baseReady = !input.demo && knownKey && Boolean(input.stripePrice) && Boolean(input.webhookSecret) && input.authReady;
  let trafficScriptValid = false;
  try { const url = new URL(input.trafficScript || ""); trafficScriptValid = url.protocol === "https:" && !url.username && !url.password; } catch { /* Missing or invalid script keeps the gate closed. */ }
  const liveReady = input.liveEnabled && input.sourceReady && input.notificationsReady && input.authVerified && input.emailVerified && input.pushVerified && input.billingVerified && (!input.hackathon || Boolean(trafficScriptValid && input.trafficVerified));
  const checkoutEnabled = baseReady && (testMode || liveReady);
  return { checkoutEnabled, testMode, reason: checkoutEnabled ? null : "Subscriptions are not available yet. You can explore the stock page while setup is completed." };
}

export function subscriptionStatus(status: string, paymentFailed = false) {
  return paymentFailed && status === "active" ? "past_due" : status;
}
