import { config } from "dotenv";
import { expect, test } from "vitest";
import { createDatabase } from "../../src/lib/db/connection";
import type { PoolClient } from "pg";

config({ path: [".env.test.local", ".env.test"], quiet: true });
test("PostgreSQL supports rollback and concurrent SKIP LOCKED claims", async () => {
  // Deliberately no DATABASE_URL fallback: never run integration writes on the app database.
  const url = process.env.TEST_DATABASE_URL;
  if (!url)
    throw new Error(
      "Set TEST_DATABASE_URL to an isolated PostgreSQL test database.",
    );
  const { pool } = createDatabase({ DATABASE_URL: url });
  const name = `foundation_${crypto.randomUUID().replaceAll("-", "")}`;
  let first: PoolClient | undefined;
  let second: PoolClient | undefined;
  try {
    first = await pool.connect();
    second = await pool.connect();
    await first.query(`CREATE TABLE ${name} (id integer PRIMARY KEY)`);
    await first.query(`INSERT INTO ${name} VALUES (1), (2)`);
    await first.query("BEGIN");
    await first.query(`INSERT INTO ${name} VALUES (3)`);
    await first.query("ROLLBACK");
    expect(
      (await first.query(`SELECT count(*)::int AS count FROM ${name}`)).rows[0]
        .count,
    ).toBe(2);
    await first.query("BEGIN");
    await second.query("BEGIN");
    const a = await first.query(
      `SELECT id FROM ${name} ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    const b = await second.query(
      `SELECT id FROM ${name} ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    expect(a.rows[0].id).toBe(1);
    expect(b.rows[0].id).toBe(2);
  } finally {
    await Promise.allSettled([
      first?.query("ROLLBACK"),
      second?.query("ROLLBACK"),
    ]);
    try {
      if (first) await first.query(`DROP TABLE IF EXISTS ${name}`);
    } finally {
      first?.release();
      second?.release();
      await pool.end();
    }
  }
});
