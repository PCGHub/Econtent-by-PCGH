import { test, expect } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("cinematic titles scenes, templates, styling, timed animation and honest export handoff work on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  const errors: string[] = [],
    requests: string[] = [];
  let workers = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("worker", () => workers++);
  page.on("request", (r) => {
    if (r.method() === "POST" || r.url().includes("/ffmpeg/"))
      requests.push(r.url());
  });
  await page.goto("/editor");
  await page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("link", { name: "Cinematic Titles", exact: true })
    .click();
  await expect(page).toHaveURL(/\/titles-studio$/);
  await expect(
    page.getByRole("heading", { name: "Cinematic Titles Studio", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("workspace-shell")).toHaveCount(1);
  await expect(page.locator("main main")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Cinematic Titles", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  mkdirSync("test-results/titles", { recursive: true });
  await page.screenshot({
    path: "test-results/titles/desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "Toggle fullscreen titles preview",
      exact: true,
    })
    .click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  const fs = await page.getByTestId("titles-canvas").boundingBox();
  expect(Math.abs(fs!.width / fs!.height - 16 / 9)).toBeLessThan(0.01);
  await page.evaluate(() => document.exitFullscreen());
  await page.getByLabel("Scene duration (s)", { exact: true }).fill("10");
  await page.getByLabel("Scene duration (s)", { exact: true }).press("Tab");
  await page
    .getByRole("button", { name: "Duplicate title scene", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Select title scene / }),
  ).toHaveCount(4);
  await page
    .getByRole("button", { name: "Move title scene down", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete title scene", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Select title scene / }),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Dramatic reveal template", exact: true })
    .click();
  await expect(page.getByLabel("Title text content")).toHaveValue("BEYOND");
  await page.getByLabel("Title text content").fill("NEW FRONTIER");
  await page.getByLabel("Title font", { exact: true }).selectOption("sans");
  await page.getByLabel("Font size", { exact: true }).fill("36");
  await page.getByLabel("Font size", { exact: true }).press("Tab");
  await page.getByRole("tab", { name: "Animation", exact: true }).click();
  await page.getByLabel("Title entrance effect").selectOption("typewriter");
  await page.getByLabel("Titles scene scrubber", { exact: true }).fill("0");
  const rendered = page
    .getByRole("group", { name: "Title layer 1", exact: true })
    .locator('[data-testid^="title-content-"]');
  await expect(rendered).toHaveText("");
  await page.getByLabel("Titles scene scrubber", { exact: true }).fill("1");
  await expect(rendered).toHaveText("NEW FR");
  await page
    .getByRole("button", { name: "Play titles preview", exact: true })
    .click();
  await expect
    .poll(async () =>
      Number(
        await page
          .getByLabel("Titles scene scrubber", { exact: true })
          .inputValue(),
      ),
    )
    .toBeGreaterThan(1.2);
  await page
    .getByRole("button", { name: "Pause titles preview", exact: true })
    .click();
  await page.getByRole("tab", { name: "Export", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Render Preview",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: "Export MP4",
      exact: true,
    }),
  ).toBeEnabled();
  expect(workers).toBe(0);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("mobile touch manipulation, four ratios, mobile tabs and shared drawer preserve title edits", async ({
  browser,
}) => {
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    }),
    page = await context.newPage();
  try {
    await page.goto("/titles-studio");
    await expect(
      page.getByRole("tab", { name: "Text", exact: true }),
    ).toHaveCount(1);
    const box = page.getByRole("group", { name: "Title layer 2", exact: true });
    await box.scrollIntoViewIfNeeded();
    const b = await box.boundingBox();
    const session = await context.newCDPSession(page);
    const touch = async (
      type: "touchStart" | "touchMove" | "touchEnd",
      x = 0,
      y = 0,
    ) =>
      session.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 0 }],
      });
    await touch("touchStart", b!.x + b!.width / 2, b!.y + b!.height / 2);
    await touch(
      "touchMove",
      b!.x + b!.width / 2 + 20,
      b!.y + b!.height / 2 + 15,
    );
    await touch("touchEnd");
    await page.getByText("Position & transform", { exact: true }).click();
    expect(
      Number(await page.getByLabel("Text X (%)", { exact: true }).inputValue()),
    ).toBeGreaterThan(10);
    await expect(
      page.getByLabel("Titles scene scrubber", { exact: true }),
    ).toHaveValue("2.4");
    const handle = page.getByRole("button", {
      name: "Resize Title layer 2",
      exact: true,
    });
    await handle.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const hb = await handle.boundingBox();
    await touch("touchStart", hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
    await touch(
      "touchMove",
      hb!.x + hb!.width / 2 + 12,
      hb!.y + hb!.height / 2 + 12,
    );
    await touch("touchEnd");
    expect(
      Number(await page.getByLabel("Font size", { exact: true }).inputValue()),
    ).toBeGreaterThan(49);
    const beforeRotation=await page.getByLabel("Deterministic title animation",{exact:true}).evaluate((node:HTMLCanvasElement)=>node.toDataURL());
    await page.getByLabel("Text rotation", { exact: true }).fill("12");
    await page.getByLabel("Text rotation", { exact: true }).press("Tab");
    await expect.poll(()=>page.getByLabel("Deterministic title animation",{exact:true}).evaluate((node:HTMLCanvasElement)=>node.toDataURL())).not.toBe(beforeRotation);
    for (const ratio of ["9:16", "4:5", "1:1", "16:9"]) {
      await page.getByLabel("Titles aspect ratio").selectOption(ratio);
      const r = await page.getByTestId("titles-canvas").boundingBox(),
        [w, h] = ratio.split(":").map(Number);
      expect(Math.abs(r!.width / r!.height - w / h)).toBeLessThan(0.01);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.getByLabel("Titles aspect ratio").selectOption("4:5");
    const canvas = await page.getByTestId("titles-canvas").elementHandle();
    await page
      .getByRole("button", { name: "Open workspace navigation", exact: true })
      .tap();
    await page
      .getByRole("button", { name: "Close workspace navigation", exact: true })
      .tap();
    expect(await canvas!.evaluate((e) => e.isConnected)).toBe(true);
    for (const [label, value] of [
      ["Text X (%)", "10"],
      ["Text Y (%)", "36"],
      ["Text width (%)", "80"],
      ["Text height (%)", "40"],
      ["Font size", "49"],
      ["Text rotation", "0"],
    ] as const) {
      await page.getByLabel(label, { exact: true }).fill(value);
      await page.getByLabel(label, { exact: true }).press("Tab");
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    mkdirSync("test-results/titles", { recursive: true });
    await page.screenshot({
      path: "test-results/titles/mobile.png",
      fullPage: false,
    });
    await page.getByRole("tab", { name: "Scenes", exact: true }).tap();
    await expect(
      page.getByLabel("Scene duration (s)", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Templates", exact: true }).tap();
    await page
      .getByRole("button", {
        name: "Add Documentary intro template",
        exact: true,
      })
      .tap();
    await page.getByRole("tab", { name: "Text", exact: true }).tap();
    await expect(page.getByLabel("Title text content")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("local backgrounds stay local, duplicates share media safely and video volume/loop controls are real", async ({
  page,
}) => {
  const dir = mkdtempSync(join(tmpdir(), "econtent-titles-media-"));
  try {
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=blue:size=160x90:rate=24",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440",
      "-t",
      "2",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      join(dir, "background.mp4"),
    ]);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=red:size=160x90",
      "-frames:v",
      "1",
      join(dir, "photo.png"),
    ]);
    let workers = 0,
      posts = 0;
    page.on("worker", () => workers++);
    page.on("request", (r) => {
      if (r.method() === "POST") posts++;
    });
    await page.setViewportSize({ width: 1600, height: 1050 });
    await page.goto("/titles-studio");
    await page.getByRole("tab", { name: "Background", exact: true }).click();
    await page.getByLabel("Title background type").selectOption("image");
    await page
      .getByLabel("Upload title background")
      .setInputFiles(join(dir, "photo.png"));
    await expect(page.getByAltText("Local scene background")).toBeVisible();
    const url = await page
      .getByAltText("Local scene background")
      .getAttribute("src");
    expect(url).toMatch(/^blob:/);
    await page
      .getByRole("button", { name: "Duplicate title scene", exact: true })
      .click();
    expect(
      await page.getByAltText("Local scene background").getAttribute("src"),
    ).toBe(url);
    await page
      .getByRole("button", { name: "Delete title scene", exact: true })
      .click();
    await expect(page.getByAltText("Local scene background")).toBeVisible();
    await page.getByLabel("Title background type").selectOption("video");
    await page
      .getByLabel("Upload title background")
      .setInputFiles(join(dir, "background.mp4"));
    await expect(page.getByLabel("Titles background video")).toBeVisible();
    await page.getByLabel("Titles preview volume").fill("0.4");
    await page.getByLabel("Titles scene scrubber", { exact: true }).fill("0.2");
    await page
      .getByRole("button", { name: "Play titles preview", exact: true })
      .click();
    await expect
      .poll(() =>
        page
          .getByLabel("Titles background video")
          .evaluate((v: HTMLVideoElement) => v.currentTime),
      )
      .toBeGreaterThan(0.4);
    expect(
      await page
        .getByLabel("Titles background video")
        .evaluate((v: HTMLVideoElement) => v.volume),
    ).toBe(0.4);
    await page
      .getByRole("button", { name: "Pause titles preview", exact: true })
      .click();
    await page.getByLabel("Loop background video").check();
    await page.getByLabel("Titles scene scrubber", { exact: true }).fill("3");
    await expect
      .poll(() =>
        page
          .getByLabel("Titles background video")
          .evaluate((v: HTMLVideoElement) => v.currentTime),
      )
      .toBeCloseTo(1, 1);
    const originalVideoUrl = await page
      .getByLabel("Titles background video")
      .getAttribute("src");
    await page
      .getByRole("button", { name: "Duplicate title scene", exact: true })
      .click();
    await page
      .getByLabel("Upload title background")
      .setInputFiles(join(dir, "background.mp4"));
    await expect
      .poll(() =>
        page.getByLabel("Titles background video").getAttribute("src"),
      )
      .not.toBe(originalVideoUrl);
    await expect
      .poll(() =>
        page
          .getByLabel("Titles background video")
          .evaluate((v: HTMLVideoElement) => v.readyState),
      )
      .toBeGreaterThanOrEqual(1);
    await page
      .getByRole("button", { name: "Delete title scene", exact: true })
      .click();
    await expect(page.getByLabel("Titles background video")).toHaveAttribute(
      "src",
      originalVideoUrl!,
    );
    await expect
      .poll(() =>
        page
          .getByLabel("Titles background video")
          .evaluate((v: HTMLVideoElement) => v.readyState),
      )
      .toBeGreaterThanOrEqual(1);
    await page.getByLabel("Upload title background").setInputFiles({
      name: "damaged.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("damaged video"),
    });
    await expect(page.locator('main p[role="alert"]')).toContainText(
      "cannot preview",
    );
    expect(workers).toBe(0);
    expect(posts).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("title timing bars move and trim actual text intervals with keyboard alternatives", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.goto("/titles-studio");
  await page.getByRole("tab", { name: "Animation", exact: true }).click();
  await page.getByLabel("Text end (s)", { exact: true }).fill("5");
  await page.getByLabel("Text end (s)", { exact: true }).press("Tab");
  const bar = page.getByTestId("title-timing-titles-initial-0-text-1");
  await bar.scrollIntoViewIfNeeded();
  const row = await bar.locator("..").boundingBox(),
    b = await bar.boundingBox();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    b!.x + b!.width / 2 + row!.width / 7,
    b!.y + b!.height / 2,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect(page.getByLabel("Text start (s)", { exact: true })).toHaveValue(
    "1",
  );
  await expect(page.getByLabel("Text end (s)", { exact: true })).toHaveValue(
    "6",
  );
  const handle = page.getByRole("button", {
    name: "Trim text 2 start",
    exact: true,
  });
  const h = await handle.boundingBox();
  await page.mouse.move(h!.x + h!.width / 2, h!.y + h!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    h!.x + h!.width / 2 + row!.width / 14,
    h!.y + h!.height / 2,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect(page.getByLabel("Text start (s)", { exact: true })).toHaveValue(
    "1.5",
  );
  await bar.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("Text start (s)", { exact: true })).toHaveValue(
    "1.6",
  );
});
