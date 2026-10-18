import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.REMINDME_E2E === "1" ? ".next-e2e" : ".next",
};
export default config;
