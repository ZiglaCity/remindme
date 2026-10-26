import { describe, expect, it } from "vitest";
import { preferencesInput } from "../../src/lib/auth/policy";
import { readBoundedBody } from "../../src/lib/http/body";

describe("preferences input", () => {
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
