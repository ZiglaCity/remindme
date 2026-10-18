import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { migrationEnvSchema, parseEnvironment } from "./src/lib/env/schema";

config({ path: [".env.local", ".env"], quiet: true });
const env = parseEnvironment(migrationEnvSchema, process.env);
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./migrations",
  dbCredentials: { url: env.DATABASE_DIRECT_URL ?? env.DATABASE_URL },
  strict: true,
});
