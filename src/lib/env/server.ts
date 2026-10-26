import "server-only";
import { resolveWebEnvironment } from "./web";

export function getWebEnvironment() {
  return resolveWebEnvironment(process.env);
}
