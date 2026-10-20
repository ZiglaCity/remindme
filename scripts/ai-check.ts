import { config } from "dotenv";
import { createGeminiParser } from "../src/services/ai/gemini";
import { AppError } from "../src/lib/http/errors";
config({ path: [".env.local", ".env"], quiet: true });
const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const parse = createGeminiParser(process.env.GEMINI_API_KEY, model);
// Synthetic inputs only. This command never connects to the database or saves reminders.
try {
  const recurring = await parse(
    {
      text: "Remind me to join the research meeting every Sunday at 2 PM and bring progress notes",
      clarification: [],
    },
    "UTC",
    new Date("2026-10-19T12:00Z"),
  );
  if (
    recurring.status !== "ready" ||
    recurring.draft.recurrence?.frequency !== "weekly" ||
    recurring.draft.recurrence.interval !== 1 ||
    JSON.stringify(recurring.draft.recurrence.weekdays) !== "[7]" ||
    recurring.draft.deadline.date !== "2026-10-25" ||
    recurring.draft.deadline.time !== "14:00" ||
    !/progress.*notes?/i.test(recurring.draft.description ?? "")
  )
    throw new Error("recurrence_mismatch");
  console.log(
    "PASS: live Gemini extracted Sunday 2 PM repeats and a description retaining the supplied progress notes. Nothing was saved.",
  );
  if (!process.argv.includes("--recurrence")) {
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
    if (ambiguous.status !== "clarify")
      throw new Error("clarification_missing");
    console.log(
      "PASS: live Gemini requested clarification for a vague time. Nothing was saved.",
    );
    for (const example of [
      {
        text: "Remind me to renew my subscription before January 1, 2027",
        date: "2026-12-31",
        time: "23:59",
        type: "date_time",
      },
      {
        text: "Remind me to renew my subscription by January 1, 2027",
        date: "2027-01-01",
        time: "",
        type: "date_only",
      },
      {
        text: "Remind me to call the dentist tomorrow at ate a.m.",
        date: "2026-12-31",
        time: "08:00",
        type: "date_time",
      },
      {
        text: "Remind me to submit the form on January 1, 2027 at 12 AM",
        date: "2027-01-01",
        time: "00:00",
        type: "date_time",
      },
    ]) {
      const result = await parse(
        { text: example.text, clarification: [] },
        "Pacific/Auckland",
        new Date("2026-12-30T00:00:00Z"),
      );
      if (
        result.status !== "ready" ||
        result.draft.deadline.date !== example.date ||
        result.draft.deadline.time !== example.time ||
        result.draft.deadline.type !== example.type ||
        result.draft.deadline.timeZone !== "Pacific/Auckland"
      )
        throw new Error("intent_mismatch");
      console.log(
        `PASS: ${example.text} → ${example.date} ${example.time || "end of day"} Pacific/Auckland.`,
      );
    }
  }
} catch (error) {
  console.error(
    "Gemini smoke check failed:",
    error instanceof AppError ? error.code : "unexpected_result",
  );
  process.exitCode = 1;
}
