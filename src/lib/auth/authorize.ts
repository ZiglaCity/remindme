import { AppError } from "../http/errors";
import { isTesterAllowed, type AccessPolicy } from "./policy";
import type { Auth } from "./core";

export async function authorize(
  auth: Auth,
  headers: Headers,
  policy: AccessPolicy,
) {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new AppError(401, "unauthorized", "Please sign in.");
  if (!isTesterAllowed(session.user.email, policy))
    throw new AppError(
      403,
      "access_denied",
      "Access is limited to approved testers.",
    );
  return {
    owner: { userId: session.user.id },
    user: { name: session.user.name, email: session.user.email },
  };
}
