import { config } from "dotenv";
import { createGeminiParser } from "../src/services/ai/gemini";
import { AppError } from "../src/lib/http/errors";
config({ path: [".env.local", ".env"], quiet: true });
const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const parse = createGeminiParser(process.env.GEMINI_API_KEY, model);
async function checkTaskLists() {
  const text =
    "Review today's networking lesson next week on the same day before 9 AM. Check my notes, read about routing algorithms and look into the Python networking library.";
  for (const clarification of [
    [],
    [
      {
        question: "Which main task should I create a reminder for?",
        answer:
          "They are steps of one reminder. Summarize the topic in the title and keep all the steps in the description.",
      },
    ],
  ]) {
    const result = await parse(
      { text, clarification },
      "Africa/Accra",
      new Date("2026-10-28T12:00:00Z"),
    );
    if (
      result.status !== "ready" ||
      result.draft.deadline.date !== "2026-11-04" ||
      result.draft.deadline.time !== "09:00" ||
      result.draft.recurrence != null ||
      !/network/i.test(result.draft.title) ||
      !/notes/i.test(result.draft.description ?? "") ||
      !/routing/i.test(result.draft.description ?? "") ||
      !/python/i.test(result.draft.description ?? "")
    )
      throw new Error("task_list_mismatch");
    console.log(
      `PASS: related study tasks retained in one description with a generated title and next-week deadline${clarification.length ? " after a grouping answer" : " without unnecessary clarification"}. Nothing was saved.`,
    );
  }
  const errands = await parse(
    {
      text: "Tomorrow at 5 PM remind me to buy bread, collect the parcel and water the plants.",
      clarification: [],
    },
    "Africa/Accra",
    new Date("2026-10-28T12:00:00Z"),
  );
  if (
    errands.status !== "ready" ||
    errands.draft.deadline.date !== "2026-10-29" ||
    errands.draft.deadline.time !== "17:00" ||
    !/bread/i.test(errands.draft.description ?? "") ||
    !/parcel/i.test(errands.draft.description ?? "") ||
    !/plants/i.test(errands.draft.description ?? "")
  )
    throw new Error("errand_list_mismatch");
  console.log(
    "PASS: one shared deadline retains all three errands. Nothing was saved.",
  );
  const separate = await parse(
    {
      text: "Create separate reminders to pay rent on November 1, 2026 at 10 AM and call the dentist on November 3, 2026 at 2 PM.",
      clarification: [],
    },
    "Africa/Accra",
    new Date("2026-10-28T12:00:00Z"),
  );
  if (separate.status !== "clarify")
    throw new Error("separate_deadlines_silently_combined");
  console.log(
    "PASS: genuinely separate deadlines still request clarification. Nothing was saved.",
  );
}
async function checkStandardExamples() {
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
}
// Synthetic inputs only. This command never connects to the database or saves reminders.
try {
  if (process.argv.includes("--lists")) await checkTaskLists();
  else {
    await checkStandardExamples();
    if (!process.argv.includes("--recurrence")) await checkTaskLists();
  }
} catch (error) {
  console.error(
    "Gemini smoke check failed:",
    error instanceof AppError ? error.code : "unexpected_result",
  );
  process.exitCode = 1;
}
