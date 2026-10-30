import { expect, it } from "vitest";
import { assertIsolatedTestDatabase } from "../database-safety";

it("blocks the same Neon database through pooled/direct URLs and different credentials", () => {
  expect(() =>
    assertIsolatedTestDatabase({
      DATABASE_URL: "postgresql://owner:secret@ep-example.neon.tech/app",
      TEST_DATABASE_URL:
        "postgresql://tester:other@ep-example-pooler.neon.tech/app",
    }),
  ).toThrow("separate database");
  expect(() => assertIsolatedTestDatabase({})).toThrow("separate database");
});
it("allows a separate database and a disposable CI database without application credentials", () => {
  expect(() =>
    assertIsolatedTestDatabase({
      DATABASE_URL: "postgresql://owner:secret@localhost/app",
      TEST_DATABASE_URL: "postgresql://tester:other@127.0.0.1/test",
    }),
  ).not.toThrow();
  expect(() =>
    assertIsolatedTestDatabase({
      TEST_DATABASE_URL: "postgresql://tester:other@localhost/test",
    }),
  ).not.toThrow();
});
