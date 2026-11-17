import { paymentReadiness } from "@/lib/payments";
export async function GET() { return Response.json({ ...paymentReadiness(), testMode: true, vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null }); }
