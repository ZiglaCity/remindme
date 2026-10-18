import { config } from "dotenv";
import { createGeminiParser } from "../src/services/ai/gemini";
import { AppError } from "../src/lib/http/errors";
config({ path: [".env.local", ".env"], quiet: true });
const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const parse = createGeminiParser(process.env.GEMINI_API_KEY, model);
// Synthetic inputs only. This command never connects to the database or saves reminders.
try {
  const ready = await parse(
    { text: "Submit the report tomorrow at 3 PM", clarification: [] },
    "Pacific/Auckland",
    new Date("2026-10-18T23:30:00Z"),
  );
  if (
    ready.status !== "ready" ||
    ready.draft.deadline.date !== "2026-10-20" ||
    ready.draft.deadline.time !== "15:00" ||
    ready.draft.deadline.timeZone !== "Pacific/Auckland"
  )
    throw new Error("relative_date_mismatch");
  console.log(
    "PASS: live Gemini returned an editable draft using the local relative date.",
  );
  const ambiguous = await parse(
    { text: "Submit my report tomorrow morning", clarification: [] },
    "UTC",
    new Date("2026-10-18T12:00:00Z"),
  );
  if (ambiguous.status !== "clarify") throw new Error("clarification_missing");
  console.log(
    "PASS: live Gemini requested clarification for a vague time. Nothing was saved.",
  );
} catch (error) {
  console.error(
    "Gemini smoke check failed:",
    error instanceof AppError ? error.code : "unexpected_result",
  );
  process.exitCode = 1;
}
