import { test, expect } from "@playwright/test";
test("guest Cutter can exit the editor hosted at the home URL without signing in or saving", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start editing free", exact: true })
    .click();
  await expect(page.getByLabel("Choose video", { exact: true })).toBeVisible();
  page.on("dialog", async (dialog) => {
    await dialog.dismiss();
    throw new Error("Guest exit must not require saving or sign-in");
  });
  await page.getByRole("button", { name: "Exit editor", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start editing free", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Choose video", { exact: true })).toHaveCount(0);
});
