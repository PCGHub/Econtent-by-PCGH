import { test, expect, type Page, type Route } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { EMPTY_DRAFT } from "../../../lib/projects/model";
async function register(page: Page) {
  const email = "save-exit-" + randomUUID() + "@example.test";
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Save regression");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Local-save-test-123!");
  await page.getByLabel("Confirm password").fill("Local-save-test-123!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Check your inbox");
  let link = "";
  await expect
    .poll(async () => {
      const list = await (
        await fetch("http://localhost:55324/api/v1/messages")
      ).json();
      const message = list.messages?.find((m: { To: { Address: string }[] }) =>
        m.To.some((to) => to.Address === email),
      );
      if (!message) return false;
      const detail = await (
        await fetch("http://localhost:55324/api/v1/message/" + message.ID)
      ).json();
      link =
        String(detail.HTML)
          .match(
            /href="(http:\/\/localhost:55321\/auth\/v1\/verify[^\"]*)"/,
          )?.[1]
          ?.replaceAll("&amp;", "&") ?? "";
      return !!link;
    })
    .toBe(true);
  await page.goto(link);
  await expect(page).toHaveURL(/\/dashboard$/);
}
test("Cutter saves, releases stalled requests, retries and exits without waiting or duplicate warnings", async ({
  page,
}) => {
  await register(page);
  const created = await page.request.post("/api/projects", {
    data: { ...EMPTY_DRAFT, title: "Original saved title" },
    headers: { Origin: "http://localhost:3000" },
  });
  expect(created.status()).toBe(201);
  const { project } = await created.json(),
    path = "/api/projects/" + project.id;
  await page.goto("/projects/" + project.id);
  const save = page.getByRole("button", { name: "Save project", exact: true });
  const title = page.getByLabel("Project title", { exact: true });
  await title.fill("Normal save");
  const started = Date.now();
  await save.click();
  await expect(save).toBeEnabled();
  await expect
    .poll(
      async () => (await (await page.request.get(path)).json()).project.title,
    )
    .toBe("Normal save");
  console.log(JSON.stringify({ normalSaveMs: Date.now() - started }));
  await page.reload();
  await expect(title).toHaveValue("Normal save");
  let blocked = true;
  const held: Route[] = [];
  await page.route("**" + path, (route) => {
    if (blocked && route.request().method() === "PATCH") {
      held.push(route);
      return;
    }
    return route.continue();
  });
  await title.fill("Retained after timeout");
  await save.click();
  await expect(
    page.getByRole("button", { name: "Saving…", exact: true }),
  ).toBeDisabled();
  await expect(page.locator('p[role="alert"]')).toContainText(
    "Cloud request timed out",
    { timeout: 20000 },
  );
  await expect(save).toBeEnabled();
  await expect(title).toHaveValue("Retained after timeout");
  expect((await (await page.request.get(path)).json()).project.title).toBe(
    "Normal save",
  );
  blocked = false;
  for (const route of held.splice(0)) await route.abort().catch(() => {});
  await save.click();
  await expect(save).toBeEnabled();
  await expect
    .poll(
      async () => (await (await page.request.get(path)).json()).project.title,
    )
    .toBe("Retained after timeout");
  // Cancel the save itself, without losing the local title or requiring navigation.
  blocked = true;
  await title.fill("Still editable after cancel");
  await save.click();
  await page
    .getByRole("button", { name: "Cancel saving", exact: true })
    .click();
  await expect(save).toBeEnabled();
  await expect(title).toHaveValue("Still editable after cancel");
  await expect(page.locator('p[role="alert"]')).toContainText("cancelled");
  for (const route of held.splice(0)) await route.abort().catch(() => {});
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Exit editor", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/projects/" + project.id + "$"));
  await expect(title).toHaveValue("Still editable after cancel");
  // A single accepted discard must leave immediately even while PATCH is stalled.
  await title.fill("Discard local changes");
  await save.click();
  await expect(
    page.getByRole("button", { name: "Cancel saving", exact: true }),
  ).toBeVisible();
  let dialogs = 0;
  page.on("dialog", async (dialog) => {
    dialogs++;
    expect(dialog.type()).toBe("confirm");
    await dialog.accept();
  });
  const exitStarted = Date.now();
  await page.getByRole("button", { name: "Exit editor", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3000/", { timeout: 5000 });
  expect(dialogs).toBe(1);
  console.log(
    JSON.stringify({ exitWhileSavingMs: Date.now() - exitStarted, dialogs }),
  );
  expect((await (await page.request.get(path)).json()).project.title).toBe(
    "Retained after timeout",
  );
  for (const route of held.splice(0)) await route.abort().catch(() => {});
});
