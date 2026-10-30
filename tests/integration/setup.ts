import { config } from "dotenv";
import { assertIsolatedTestDatabase } from "../database-safety";

config({
  path: [".env.test.local", ".env.test", ".env.local", ".env"],
  quiet: true,
});
assertIsolatedTestDatabase(process.env);
