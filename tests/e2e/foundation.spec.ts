import { test, expect } from "@playwright/test";
test("public entry point renders without external provider credentials", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("RemindMe");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "A little less to keep in your head.",
  );
  await expect(
    page.getByText("In development.", { exact: false }),
  ).toBeVisible();
});
