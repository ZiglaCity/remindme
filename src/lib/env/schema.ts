import { z } from "zod";

const optionalText = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const databaseUrl = z
  .string()
  .url()
  .refine(
    (value) => /^postgres(?:ql)?:\/\//i.test(value),
    "A PostgreSQL URL is required",
  );
const integer = (fallback: number, max: number) =>
  z.coerce.number().int().min(1).max(max).default(fallback);

export const databaseEnvSchema = z.object({ DATABASE_URL: databaseUrl });
export const migrationEnvSchema = z.object({
  DATABASE_URL: databaseUrl,
  DATABASE_DIRECT_URL: databaseUrl.optional(),
});
export const webEnvSchema = databaseEnvSchema.extend({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  GOOGLE_CLIENT_ID: optionalText,
  GOOGLE_CLIENT_SECRET: optionalText,
  GEMINI_API_KEY: optionalText,
  TESTER_ACCESS_MODE: z.enum(["allowlist", "public"]).default("allowlist"),
  TESTER_EMAIL_ALLOWLIST: z.string().default(""),
  SMTP_APPROVED_RECIPIENTS: z.string().default(""),
});
export const smtpEnvSchema = z
  .object({
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: integer(587, 65535),
    SMTP_SECURE: z
      .enum(["true", "false"])
      .transform((value) => value === "true"),
    SMTP_USER: z.string().min(1),
    SMTP_PASS: z.string().min(1),
    EMAIL_FROM: z.string().email(),
  })
  .refine(
    (value) => value.SMTP_PORT !== 465 || value.SMTP_SECURE,
    "Port 465 requires implicit TLS",
  );
export const workerEnvSchema = databaseEnvSchema
  .extend({
    WORKER_BATCH_SIZE: integer(25, 100),
    WORKER_CONCURRENCY: integer(5, 10),
    PROCESSING_LEASE_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(1800)
      .default(300),
    SMTP_MAX_ATTEMPTS: integer(5, 10),
    SMTP_APPROVED_RECIPIENTS: z.string().default(""),
  })
  .and(smtpEnvSchema);

// Never print Zod's input values: they can contain credentials.
export function parseEnvironment<T>(
  schema: z.ZodType<T>,
  values: Record<string, unknown>,
): T {
  const result = schema.safeParse(values);
  if (!result.success) {
    throw new Error(
      `Invalid environment settings: ${[...new Set(result.error.issues.map((issue) => issue.path.join(".") || "configuration"))].join(", ")}`,
    );
  }
  return result.data;
}
