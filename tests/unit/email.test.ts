import { describe, expect, it } from "vitest";
import { reminderEmail } from "../../src/lib/email/template";
import {
  classifySmtpError,
  recipientApproved,
  retryAt,
} from "../../src/lib/email/policy";
describe("email content and policy", () => {
  it("escapes untrusted HTML and preserves date-only zone/threshold context", () => {
    const email = reminderEmail(
      {
        id: "fixture",
        title: '<img src=x onerror="bad()">',
        description: "A & B <script>bad()</script>",
        dueAt: new Date("2026-10-30T23:59Z"),
        dueDate: "2026-10-30",
        deadlineType: "date_only",
        timeZone: "UTC",
        thresholdPercent: 75,
      },
      "https://remind.example",
    );
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&amp;");
    expect(email.text).toContain("75%");
    expect(email.text).toContain("11:59 PM");
    expect(email.text).toContain("UTC");
    expect(email.text).toContain(
      "https://remind.example/app/reminders/fixture",
    );
    expect(() =>
      reminderEmail({ id: "x" } as never, "javascript:alert(1)"),
    ).toThrow();
  });
  it("uses exact approvals, bounded retry delays and safe error categories", () => {
    expect(
      recipientApproved("owner@example.test", " OWNER@example.test "),
    ).toBe(true);
    expect(recipientApproved("other@example.test", "owner@example.test")).toBe(
      false,
    );
    expect(
      recipientApproved(
        "owner@example.test,other@example.test",
        "owner@example.test",
      ),
    ).toBe(false);
    expect(
      classifySmtpError({ code: "EENVELOPE", responseCode: 450 }).category,
    ).toBe("transient");
    expect(classifySmtpError({ responseCode: 550 }).category).toBe("permanent");
    expect(classifySmtpError({ code: "EAUTH" }).category).toBe("permanent");
    expect(
      classifySmtpError({ code: "ETIMEDOUT", command: "DATA" }).category,
    ).toBe("uncertain");
    expect(retryAt(5, new Date(0), [60, 300, 900, 3600]).getTime()).toBe(
      3_600_000,
    );
  });
});
