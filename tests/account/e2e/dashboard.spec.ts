import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { EMPTY_DRAFT } from "../../../lib/projects/model";
import { initialProject } from "../../../lib/titles/templates";
test.use({ hasTouch: true });
async function register(page: Page) {
  const email = "dashboard-" + randomUUID() + "@example.test";
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Dashboard Creator");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Local-dashboard-only-123!");
  await page.getByLabel("Confirm password").fill("Local-dashboard-only-123!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Check your inbox");
  let link = "";
  await expect
    .poll(
      async () => {
        const list = await (
          await fetch("http://localhost:55324/api/v1/messages")
        ).json();
        const item = list.messages?.find(
          (m: { ID: string; To: { Address: string }[] }) =>
            m.To.some((t) => t.Address === email),
        );
        if (!item) return false;
        const detail = await (
          await fetch("http://localhost:55324/api/v1/message/" + item.ID)
        ).json();
        link =
          String(detail.HTML)
            .match(
              /href="(http:\/\/localhost:55321\/auth\/v1\/verify[^"]*)"/,
            )?.[1]
            ?.replaceAll("&amp;", "&") ?? "";
        return !!link;
      },
      { timeout: 20000 },
    )
    .toBe(true);
  await page.goto(link);
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test("real authenticated dashboard data, saved-project recovery, search, navigation and responsive accessibility", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await register(page);
  await expect(page.getByTestId("metric-all")).toHaveText("0");
  await expect(
    page.getByText("A fresh space for your next idea"),
  ).toBeVisible();
  const titleDocument = initialProject();
  titleDocument.title = "Indian Movie";
  const completed = await page.request.post("/api/projects", {
    data: {
      ...EMPTY_DRAFT,
      title: "Indian Movie",
      status: "completed",
      titles: { version: 1, document: titleDocument, sources: [] },
    },
    headers: { Origin: "http://localhost:3000" },
  });
  expect(completed.status(), await completed.text()).toBe(201);
  const done = (await completed.json()).project;
  const failed = await page.request.post("/api/projects", {
    data: {
      ...EMPTY_DRAFT,
      title: "Untitled project",
      status: "failed",
      settings: { ...EMPTY_DRAFT.settings, range: { start: 0, end: 30 } },
      source: {
        name: "local-video.mp4",
        sizeBytes: 1024,
        durationSeconds: 60,
        width: 1280,
        height: 720,
        mimeType: "video/mp4",
        sha256: "a".repeat(64),
      },
    },
    headers: { Origin: "http://localhost:3000" },
  });
  expect(failed.status(), await failed.text()).toBe(201);
  const recovery = (await failed.json()).project;
  await page.reload();
  await expect(page.getByTestId("metric-all")).toHaveText("2");
  await expect(page.getByTestId("metric-completed")).toHaveText("1");
  await expect(page.getByTestId("metric-attention")).toHaveText("1");
  await expect(page.getByTestId("metric-draft")).toHaveText("0");
  await expect(
    page.getByRole("img", { name: "Saved title frame for Indian Movie" }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Untitled project" }),
  ).toContainText("Review saved settings");
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Workspace updates" }),
  ).toContainText("1 saved project needs attention");
  await page
    .getByRole("button", { name: "Review projects", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "All projects", exact: true }).click();
  await page.getByLabel("Search projects", { exact: true }).fill("INDIAN");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page.getByLabel("Sort recent projects").selectOption("name");
  await expect(page.getByRole("article").first()).toHaveAttribute(
    "aria-label",
    "Indian Movie",
  );
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "List view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await page.getByLabel("Search projects", { exact: true }).fill("missing");
  await expect(page.getByText("No matching projects")).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  for (const path of [
    "/video-editor",
    "/editor",
    "/overlay-studio",
    "/titles-studio",
    "/transcription-studio",
  ])
    expect(await page.locator('main a[href="' + path + '"]').count()).toBe(1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Expand sidebar", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand sidebar", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  for (const width of [1920, 1280, 1024, 768, 390, 375]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Search projects", { exact: true }).fill("Indian");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .tap();
  const drawer = page.getByRole("dialog", { name: "Dashboard navigation" });
  await expect(drawer).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close navigation", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await drawer.evaluate((n) => n.contains(document.activeElement))).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open navigation", exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("Search projects", { exact: true })).toHaveValue(
    "Indian",
  );
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .tap();
  await page
    .getByRole("button", { name: "Close navigation backdrop", exact: true })
    .click({ position: { x: 380, y: 400 } });
  await expect(drawer).not.toBeVisible();
  await page
    .getByRole("link", { name: "Recover Untitled project", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp("/projects/" + recovery.id + "$"));
  await expect(
    page.getByRole("heading", {
      name: "Reconnect original video",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/dashboard");
  await page
    .getByRole("link", { name: "Reopen Indian Movie", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp("/projects/" + done.id + "$"));
  await expect(
    page.getByLabel("Titles project name", { exact: true }),
  ).toHaveValue("Indian Movie");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Your account" }),
  ).toContainText("Dashboard Creator");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Account menu", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?next=%2Fdashboard)?$/);
  expect((await page.request.get("/api/projects")).status()).toBe(401);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(errors).toEqual([]);
});
test("failed project requests show an honest unavailable metric and support retry", async ({
  page,
}) => {
  await register(page);
  await page.route("**/api/projects?sort=recent", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporary project service unavailable" }),
    }),
  );
  await page.reload();
  await expect(page.locator("main [role=alert]")).toContainText(
    "Temporary project service unavailable",
  );
  await expect(page.getByTestId("metric-all")).toHaveText("—");
  await page.unroute("**/api/projects?sort=recent");
  await page
    .getByRole("button", { name: "Retry loading projects", exact: true })
    .click();
  await expect(page.getByTestId("metric-all")).toHaveText("0");
});
