import { describe, expect, it } from "vitest";
import { isTesterAllowed, preferencesInput } from "../../src/lib/auth/policy";
import { readBoundedBody } from "../../src/lib/http/body";

describe("tester policy and preferences input", () => {
  it("denies an empty allowlist and normalizes exact email matches", () => {
    expect(
      isTesterAllowed("a@example.com", {
        TESTER_ACCESS_MODE: "allowlist",
        TESTER_EMAIL_ALLOWLIST: "",
      }),
    ).toBe(false);
    expect(
      isTesterAllowed("A@example.com", {
        TESTER_ACCESS_MODE: "allowlist",
        TESTER_EMAIL_ALLOWLIST: " b@example.com, a@example.com ",
      }),
    ).toBe(true);
    expect(
      isTesterAllowed("not-a@example.com", {
        TESTER_ACCESS_MODE: "allowlist",
        TESTER_EMAIL_ALLOWLIST: "a@example.com",
      }),
    ).toBe(false);
  });
  it("opens registration only with explicit public mode", () => {
    expect(
      isTesterAllowed("a@example.com", {
        TESTER_ACCESS_MODE: "public",
        TESTER_EMAIL_ALLOWLIST: "",
      }),
    ).toBe(true);
  });
  it("supports the owner's explicit all mode", () => {
    expect(
      isTesterAllowed("anyone@example.com", {
        TESTER_ACCESS_MODE: "all",
        TESTER_EMAIL_ALLOWLIST: "",
      }),
    ).toBe(true);
  });
  it("accepts IANA zones and rejects invalid zones and injected owners", () => {
    expect(preferencesInput.safeParse({ timeZone: "+01:00" }).success).toBe(
      false,
    );
    expect(
      preferencesInput.safeParse({ timeZone: "Atlantic/Reykjavik" }).success,
    ).toBe(true);
    expect(preferencesInput.safeParse({ timeZone: "Fake/Zone" }).success).toBe(
      false,
    );
    expect(
      preferencesInput.safeParse({ timeZone: "UTC", userId: "someone-else" })
        .success,
    ).toBe(false);
  });
});
it("bounds actual body bytes even without a content-length header", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    body: "é".repeat(10),
  });
  await expect(readBoundedBody(request, 19)).rejects.toMatchObject({
    status: 413,
  });
  expect(
    await readBoundedBody(
      new Request("http://localhost", { method: "POST", body: "hello" }),
      5,
    ),
  ).toBe("hello");
});
