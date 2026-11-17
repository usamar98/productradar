import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins";
import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { appOrigin, HttpError } from "@/lib/security";

export function authConfigured() {
  return Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_SECRET.length >= 32 && process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

function createAuth() {
  return betterAuth({
    appName: "GPU Stock Watch",
    baseURL: appOrigin(),
    secret: process.env.BETTER_AUTH_SECRET!,
    trustedOrigins: [appOrigin()],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: { enabled: false },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    advanced: { useSecureCookies: appOrigin().startsWith("https:"), defaultCookieAttributes: { httpOnly: true, sameSite: "lax" } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30, customRules: { "/sign-in/magic-link": { window: 60, max: 3 } } },
    plugins: [magicLink({
      expiresIn: 600,
      storeToken: "hashed",
      sendMagicLink: async ({ email, url }) => {
        if (process.env.DEMO_MODE === "true") throw new Error("Email delivery is disabled in demo mode.");
        const resend = new Resend(process.env.RESEND_API_KEY!);
        const result = await resend.emails.send({
          from: process.env.EMAIL_FROM!, to: email,
          subject: "Sign in to GPU Stock Watch",
          text: `Sign in to GPU Stock Watch using this single-use link. It expires in 10 minutes.\n\n${url}\n\nIf you did not request this link, you can ignore this email.`,
        });
        if (result.error) throw new Error("Sign-in email could not be delivered.");
      },
    })],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  if (!authConfigured() || process.env.DEMO_MODE === "true") throw new HttpError(503, "Email sign-in is not configured yet. Please check back soon.");
  return instance ??= createAuth();
}

export async function requireUser(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user || !session.user.emailVerified) throw new HttpError(401, "Sign in to continue.");
  return session.user;
}
