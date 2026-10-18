import { config } from "dotenv";
import { createDatabase } from "../src/lib/db/connection";

config({ path: [".env.local", ".env"], quiet: true });
async function main() {
  const { pool } = createDatabase(process.env);
  try {
    await pool.query("select 1 as connected");
    console.log("Database connection verified.");
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Database check failed. Check private connection settings and network access.",
  );
  process.exitCode = 1;
});
