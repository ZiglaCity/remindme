import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, createAuthMiddleware } from "better-auth/api";
import * as schema from "../db/schema";
import type { webEnvSchema } from "../env/schema";
import type { Database } from "../../repositories/preferences";
import { isTesterAllowed } from "./policy";
import { createRateLimiter } from "./rate-limit";
import { z } from "zod";

export function createAuth(db: Database, env: z.infer<typeof webEnvSchema>) {
  const consume = createRateLimiter(db, env.BETTER_AUTH_SECRET);
  const admit = (email: string) => {
    if (!isTesterAllowed(email, env))
      throw new APIError("FORBIDDEN", {
        message: "Access is limited to approved testers.",
      });
  };
  return betterAuth({
    appName: "RemindMe",
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    account: { accountLinking: { enabled: false } },
    session: { cookieCache: { enabled: false } },
    advanced: {
      disableCSRFCheck: false,
      disableOriginCheck: false,
      useSecureCookies:
        process.env.NODE_ENV === "production" ||
        new URL(env.BETTER_AUTH_URL).protocol === "https:",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
              mapProfileToUser: (profile) => {
                if (profile.email_verified !== true)
                  throw new APIError("FORBIDDEN", {
                    message: "Google must verify your email address.",
                  });
                admit(profile.email);
                return {};
              },
            },
          }
        : {},
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customStorage: { consume },
      customRules: {
        "/sign-in/email": { window: 900, max: 10 },
        "/sign-up/email": { window: 900, max: 10 },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ["/sign-in/email", "/sign-up/email"].includes(ctx.path) &&
          typeof ctx.body?.email === "string"
        ) {
          const email = ctx.body.email.trim().toLowerCase();
          if (!z.string().email().max(254).safeParse(email).success)
            throw new APIError("BAD_REQUEST", {
              message: "Enter a valid email address.",
            });
          if (ctx.path === "/sign-up/email") {
            const name = z
              .string()
              .trim()
              .min(1)
              .max(100)
              .safeParse(ctx.body.name);
            if (!name.success)
              throw new APIError("BAD_REQUEST", {
                message: "Enter a name of 1–100 characters.",
              });
          }
          const result = await consume(`account-auth:${email}`, {
            window: 900,
            max: 10,
          });
          if (!result.allowed) {
            throw new APIError(
              "TOO_MANY_REQUESTS",
              {
                message: "Too many attempts. Please try again later.",
              },
              { "Retry-After": String(result.retryAfter) },
            );
          }
          admit(email);
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            admit(user.email);
            return { data: user };
          },
        },
      },
      session: {
        create: {
          before: async (session, context) => {
            // Use the framework adapter so this sees an uncommitted user during signup.
            const owner = await context?.context.internalAdapter.findUserById(
              session.userId,
            );
            if (!owner)
              throw new APIError("FORBIDDEN", {
                message: "Account unavailable.",
              });
            admit(owner.email);
            return { data: session };
          },
        },
      },
    },
  });
}
export type Auth = ReturnType<typeof createAuth>;
