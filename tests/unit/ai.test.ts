import { describe, expect, it } from "vitest";
import {
  parsingContext,
  validateModelOutput,
} from "../../src/services/ai/parser";
import { createGeminiParser } from "../../src/services/ai/gemini";

const output = {
  status: "ready",
  title: "Submit report",
  description: null,
  priority: null,
  date: "2026-10-20",
  time: "15:00",
  deadlineType: "date_time",
  timeZone: null,
  question: null,
};
describe("AI drafts", () => {
  it("uses a fixed local clock context and validates an editable draft", () => {
    const context = JSON.parse(
      parsingContext(
        { text: "Tomorrow at 3 PM", clarification: [] },
        "Pacific/Auckland",
        new Date("2026-10-18T23:30:00Z"),
      ),
    );
    expect(context.currentLocalDateTime).toContain("2026-10-19T12:30");
    expect(
      validateModelOutput(JSON.stringify(output), "Pacific/Auckland"),
    ).toMatchObject({
      status: "ready",
      draft: {
        priority: "normal",
        deadline: { date: "2026-10-20", timeZone: "Pacific/Auckland" },
      },
    });
  });
  it("rejects malformed and incomplete ready output", () => {
    for (const raw of [
      "not json",
      JSON.stringify({ ...output, title: null }),
      JSON.stringify({ ...output, time: "27:00" }),
      JSON.stringify({ ...output, userId: "injected" }),
    ])
      expect(() => validateModelOutput(raw, "UTC")).toThrow(
        "Couldn’t interpret",
      );
  });
  it("asks for clarification for invalid dates and repeated DST times", () => {
    for (const change of [
      { date: "2026-02-30" },
      { date: "2026-11-01", time: "01:30", timeZone: "America/New_York" },
    ])
      expect(
        validateModelOutput(JSON.stringify({ ...output, ...change }), "UTC")
          .status,
      ).toBe("clarify");
    expect(
      validateModelOutput(
        JSON.stringify({
          ...output,
          status: "clarify",
          question: "What time?",
        }),
        "UTC",
      ),
    ).toEqual({ status: "clarify", question: "What time?" });
  });
  it("keeps missing-provider failure actionable without a network request", async () => {
    await expect(
      createGeminiParser(undefined, "gemini-3.8-flash")(
        { text: "report", clarification: [] },
        "UTC",
        new Date(),
      ),
    ).rejects.toMatchObject({ status: 503, code: "ai_unavailable" });
  });
});
