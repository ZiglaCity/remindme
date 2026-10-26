import "server-only";
import { headers } from "next/headers";
import { getAuth } from "./server";
import { authorize } from "./authorize";
import { redirect } from "next/navigation";
import { AppError } from "../http/errors";
import { cache } from "react";
export function requireSession(requestHeaders?: Headers) {
  return (async () =>
    authorize(getAuth(), requestHeaders ?? new Headers(await headers())))();
}
export const requirePageSession = cache(async () => {
  try {
    return await requireSession();
  } catch (error) {
    if (error instanceof AppError)
      redirect(error.status === 401 ? "/login" : "/access-denied");
    throw error;
  }
});
