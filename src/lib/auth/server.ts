import "server-only";
import { getDatabase } from "../db/server";
import { getWebEnvironment } from "../env/server";
import { createAuth } from "./core";
let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (auth ??= createAuth(getDatabase(), getWebEnvironment()));
}
