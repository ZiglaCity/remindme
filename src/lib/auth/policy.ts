import { z } from "zod";

export type AccessPolicy = {
  TESTER_ACCESS_MODE: "allowlist" | "public" | "all";
  TESTER_EMAIL_ALLOWLIST: string;
};
export function isTesterAllowed(email: string, policy: AccessPolicy) {
  return (
    ["public", "all"].includes(policy.TESTER_ACCESS_MODE) ||
    policy.TESTER_EMAIL_ALLOWLIST.split(",").some(
      (entry) =>
        entry.trim().toLowerCase() === email.trim().toLowerCase() &&
        entry.trim() !== "",
    )
  );
}
export const timeZoneSchema = z
  .string()
  .max(100)
  .refine((zone) => {
    try {
      if (/^[+-]/.test(zone)) return false;
      new Intl.DateTimeFormat("en", { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid IANA time zone.");
export const preferencesInput = z.object({ timeZone: timeZoneSchema }).strict();
