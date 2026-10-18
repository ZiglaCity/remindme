import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseEnvSchema, parseEnvironment } from "../env/schema";
import * as schema from "./schema";

// Runtime-neutral for CLI/Azure reuse. Web code imports server.ts instead.
export function createDatabase(values: Record<string, unknown>) {
  const env = parseEnvironment(databaseEnvSchema, values);
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
    allowExitOnIdle: true,
  });
  return { pool, db: drizzle(pool, { schema }) };
}
