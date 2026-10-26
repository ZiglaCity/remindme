import { AppError } from "../http/errors";
import type { Auth } from "./core";

export async function authorize(auth: Auth, headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new AppError(401, "unauthorized", "Please sign in.");
  return {
    owner: { userId: session.user.id },
    user: { name: session.user.name, email: session.user.email },
  };
}
