import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = "azure-functions/notification-scheduler";
const destination = "dist/notification-scheduler";
await mkdir(destination, { recursive: true });
const bundle = await build({
  entryPoints: [`${source}/src/timer.ts`],
  outfile: `${destination}/worker.cjs`,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["@azure/functions", "pg-native"],
  metafile: true,
  logLevel: "warning",
});
const inputs = Object.keys(bundle.metafile!.inputs);
if (
  inputs.some((file) =>
    /node_modules[\\/](next|better-auth|server-only|@google)[\\/]/.test(file),
  )
)
  throw new Error("Worker bundle includes a web-only dependency.");
for (const required of ["nodemailer", "pg", "drizzle-orm", "zod"]) {
  if (!inputs.some((file) => file.includes(`node_modules/${required}/`)))
    throw new Error(`Missing bundled runtime dependency: ${required}`);
}
for (const file of [
  "host.json",
  "package.json",
  "package-lock.json",
  ".funcignore",
])
  await copyFile(`${source}/${file}`, `${destination}/${file}`);
const manifest = JSON.parse(
  await readFile(`${destination}/package.json`, "utf8"),
);
if (manifest.main !== "worker.cjs")
  throw new Error("Worker entry point does not match package manifest.");
await writeFile(
  `${destination}/bundle-manifest.json`,
  JSON.stringify(
    {
      target: "node22",
      external: ["@azure/functions", "pg-native (optional)"],
      inputs,
      output: "worker.cjs",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Standalone worker prepared at ${resolve(destination)}. Install its locked runtime dependency with npm ci --omit=dev before starting/publishing.`,
);
