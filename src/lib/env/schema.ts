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
  GEMINI_MODEL: z
    .string()
    .regex(/^gemini-[a-z0-9.-]+$/)
    .default("gemini-3.5-flash-lite"),
  TESTER_ACCESS_MODE: z
    .enum(["allowlist", "public", "all"])
    .default("allowlist"),
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
  )
  .refine(
    (value) => ![25, 587].includes(value.SMTP_PORT) || !value.SMTP_SECURE,
    "Ports 25 and 587 require STARTTLS",
  );
const approvedRecipients = z
  .string()
  .default("")
  .refine(
    (value) =>
      value
        .split(",")
        .every(
          (address) =>
            !address.trim() || z.email().safeParse(address.trim()).success,
        ),
    "Approved recipients must be exact email addresses",
  );
export const emailEnvSchema = z
  .object({
    APP_URL: z.url().refine((value) => {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    }),
    SMTP_APPROVED_RECIPIENTS: approvedRecipients,
    SMTP_MAX_ATTEMPTS: integer(5, 10),
    SMTP_RETRY_DELAYS_SECONDS: z
      .string()
      .default("60,300,900,3600")
      .transform((value) => value.split(",").map(Number))
      .pipe(
        z
          .array(z.number().int().min(1).max(86400))
          .min(1)
          .max(9)
          .refine((delays) =>
            delays.every(
              (delay, index) => index === 0 || delay >= delays[index - 1],
            ),
          ),
      ),
  })
  .and(smtpEnvSchema);
export const workerEnvSchema = databaseEnvSchema
  .extend({
    WORKER_BATCH_SIZE: integer(25, 100),
    WORKER_CONCURRENCY: integer(5, 10),
    WORKER_RUN_BUDGET_SECONDS: z.coerce
      .number()
      .int()
      .min(180)
      .max(240)
      .default(240),
    WORKER_MAX_RECOVERIES: integer(3, 10),
    PROCESSING_LEASE_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(1800)
      .default(300),
  })
  .and(emailEnvSchema);

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
