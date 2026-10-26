import { parseEnvironment, webEnvSchema } from "./schema";

// Trust hosting configuration, never a request's Host or Origin header.
// Vercel supplies the canonical production domain, so a stale localhost
// BETTER_AUTH_URL cannot break production sign-in and mutation checks.
export function resolveWebEnvironment(
  values: Record<string, string | undefined>,
) {
  const hostedDomain =
    values.VERCEL_ENV === "production"
      ? values.VERCEL_PROJECT_PRODUCTION_URL
      : undefined;
  const configuredUrl = hostedDomain
    ? `https://${hostedDomain}`
    : values.BETTER_AUTH_URL ||
      values.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";
  let origin: string;
  try {
    const url = new URL(configuredUrl.trim());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Invalid application origin");
    origin = url.origin;
  } catch {
    throw new Error("Invalid application URL configuration.");
  }
  return parseEnvironment(webEnvSchema, {
    ...values,
    BETTER_AUTH_URL: origin,
    NEXT_PUBLIC_APP_URL: origin,
  });
}
