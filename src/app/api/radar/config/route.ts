import { paymentReadiness } from "@/lib/payments";
import { emailReadiness } from "@/lib/radar/email";
export async function GET() { const email = emailReadiness(); const freeReady = email.ready && (process.env.RADAR_AUTH_SECRET?.length || 0) >= 32; return Response.json({ ...paymentReadiness(), freeReady, freeMessage: freeReady ? "No card required. Verify your email to start." : "Email verification is not connected yet. Your free alert has not been used.", testMode: true, vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null }); }
