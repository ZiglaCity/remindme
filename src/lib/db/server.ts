import "server-only";
import { createDatabase } from "./connection";

const state = globalThis as typeof globalThis & {
  remindMeDatabase?: ReturnType<typeof createDatabase>;
};
export function getDatabase() {
  state.remindMeDatabase ??= createDatabase(process.env);
  return state.remindMeDatabase.db;
}
