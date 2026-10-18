import "server-only";
import { parseEnvironment, webEnvSchema } from "./schema";

export function getWebEnvironment() {
  return parseEnvironment(webEnvSchema, process.env);
}
