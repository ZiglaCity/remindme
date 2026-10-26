import { z } from "zod";

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
