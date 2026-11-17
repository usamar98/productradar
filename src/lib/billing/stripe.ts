import "server-only";
import Stripe from "stripe";
import { HttpError } from "@/lib/security";

let instance: Stripe | undefined;
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !/^sk_(test|live)_/.test(key)) throw new HttpError(503, "Billing is not configured yet.");
  // SDK pins its supported Stripe API version. Configure snapshot webhooks to match it.
  return instance ??= new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 });
}

export const objectId = (object: string | { id: string } | null | undefined) => typeof object === "string" ? object : object?.id ?? null;
