import { test, expect, type Page } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { EMPTY_DRAFT } from "../../../lib/projects/model";
const PASSWORD = "Local-remember-test-123!",
  DB = "econtent-local-videos-v1";
async function register(page: Page) {
  const email = "remember-" + randomUUID() + "@example.test";
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Local storage test");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
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
  return email;
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "econtent-local-video-")),
    file = join(dir, "remember.mp4");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=160x90:rate=12",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000",
    "-t",
    "4",
    "-c:v",
    "libx264",
    "-g",
    "12",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    file,
  ]);
  const bytes = readFileSync(file);
  return {
    dir,
    file,
    source: {
      name: "remember.mp4",
      sizeBytes: bytes.length,
      durationSeconds: 4,
      width: 160,
      height: 90,
      mimeType: "video/mp4",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}
async function createProject(page: Page, f: ReturnType<typeof fixture>) {
  const response = await page.request.post("/api/projects", {
    headers: { Origin: "http://localhost:3000" },
    data: {
      ...EMPTY_DRAFT,
      title: "Remembered Cutter",
      source: f.source,
      settings: {
        ...EMPTY_DRAFT.settings,
        mode: "manual-trim",
        range: { start: 1, end: 3 },
      },
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).project;
}
async function count(page: Page) {
  return page.evaluate(
    async (DB) =>
      await new Promise<number>((resolve, reject) => {
        const r = indexedDB.open(DB, 1);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("files"),
            q = tx.objectStore("files").count();
          q.onsuccess = () => resolve(q.result);
          tx.oncomplete = () => db.close();
        };
      }),
    DB,
  );
}
async function connect(page: Page, file: string) {
  await expect(
    page.getByLabel("Reconnect video").filter({ visible: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Reconnect video")
    .filter({ visible: true })
    .setInputFiles(file);
  await expect(
    page
      .getByLabel("Start (seconds)", { exact: false })
      .filter({ visible: true }),
  ).toHaveValue("1");
  await expect(
    page.getByTestId("editor-local-video-status").filter({ visible: true }),
  ).not.toContainText("Checking");
}
async function signout(page: Page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL("/login");
}
test("opt-in local video survives reload, restores exact cuts and exports MP4; account separation and removal work", async ({
  page,
}) => {
  const f = fixture();
  try {
    const emailA = await register(page),
      project = await createProject(page, f);
    let uploads = 0;
    page.on("request", (r) => {
      if (
        ["POST", "PUT", "PATCH"].includes(r.method()) &&
        /video\/|multipart\/form-data/.test(r.headers()["content-type"] ?? "")
      )
        uploads++;
    });
    await page.goto("/projects/" + project.id);
    await connect(page, f.file);
    expect(await count(page)).toBe(0);
    await page
      .getByRole("button", {
        name: "Remember this video on this device",
        exact: true,
      })
      .click();
    await expect(
      page.getByTestId("editor-local-video-status").filter({ visible: true }),
    ).toHaveText("Video available on this device.");
    expect(await count(page)).toBe(1);
    expect(uploads).toBe(0);
    await page.reload();
    await expect(
      page
        .getByLabel("End (seconds)", { exact: false })
        .filter({ visible: true }),
    ).toHaveValue("3");
    await expect(
      page
        .getByLabel("Start (seconds)", { exact: false })
        .filter({ visible: true }),
    ).toHaveValue("1");
    await expect(
      page.getByTestId("editor-local-video-status").filter({ visible: true }),
    ).toContainText("Video available");
    await expect(
      page.getByLabel("Reconnect video").filter({ visible: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Process video", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Download MP4", exact: true }),
    ).toHaveCount(1, { timeout: 60000 });
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download MP4", exact: true })
      .click();
    const output = join(f.dir, "restored.mp4");
    await (await pending).saveAs(output);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-xerror",
      "-i",
      output,
      "-f",
      "null",
      "-",
    ]);
    const info = JSON.parse(
      execFileSync(
        "ffprobe",
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", output],
        { encoding: "utf8" },
      ),
    );
    expect(
      info.streams.map((s: { codec_name: string }) => s.codec_name),
    ).toEqual(["h264", "aac"]);
    // Fast Cut is stream copy, not frame-accurate. The source has one-second
    // keyframe spacing; require the selected clip rather than the entire 4s file.
    expect(Math.abs(Number(info.format.duration) - 2)).toBeLessThan(1.01);
    expect(info.streams[0].width).toBe(160);
    expect(info.streams[0].height).toBe(90);
    await page.goto("/projects");
    await expect(
      page.getByTestId("local-video-availability").filter({ visible: true }),
    ).toHaveText("Video available on this device");
    await signout(page);
    await register(page);
    const other = await createProject(page, f);
    await page.goto("/projects/" + other.id);
    await expect(
      page.getByLabel("Reconnect video").filter({ visible: true }),
    ).toBeEnabled();
    await expect(
      page
        .getByLabel("Start (seconds)", { exact: false })
        .filter({ visible: true }),
    ).toHaveCount(0);
    expect(await count(page)).toBe(1);
    await page.goto("/projects");
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", {
        name: "Clear remembered videos from this browser",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Remembered videos removed" }),
    ).toBeVisible();
    expect(await count(page)).toBe(1);
    await signout(page);
    await page.getByLabel("Email address").fill(emailA);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/dashboard");
    await page.goto("/projects/" + project.id);
    await expect(
      page
        .getByLabel("Start (seconds)", { exact: false })
        .filter({ visible: true }),
    ).toHaveValue("1");
    await page
      .getByRole("button", { name: "Remove local copy", exact: true })
      .click();
    await expect.poll(() => count(page)).toBe(0);
    await page.reload();
    await expect(
      page.getByLabel("Reconnect video").filter({ visible: true }),
    ).toBeEnabled();
    await expect(
      page
        .getByLabel("Start (seconds)", { exact: false })
        .filter({ visible: true }),
    ).toHaveCount(0);
    await page.goto("/projects");
    await expect(
      page.getByTestId("local-video-availability").filter({ visible: true }),
    ).toHaveText("Reconnect video required");
    expect(uploads).toBe(0);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});
test("low quota, failed writes, cancelled storage and corrupted copies fall back safely", async ({
  page,
}) => {
  const f = fixture();
  try {
    await register(page);
    const project = await createProject(page, f);
    await page.goto("/projects/" + project.id);
    await connect(page, f.file);
    await page.evaluate(() =>
      Object.defineProperty(navigator.storage, "estimate", {
        configurable: true,
        value: async () => ({ quota: 1024, usage: 1000 }),
      }),
    );
    await page
      .getByRole("button", {
        name: "Remember this video on this device",
        exact: true,
      })
      .click();
    await expect(
      page.getByTestId("editor-local-video-status").filter({ visible: true }),
    ).toContainText("Not enough browser storage");
    expect(await count(page)).toBe(0);
    await expect(
      page
        .getByLabel("Start (seconds)", { exact: false })
        .filter({ visible: true }),
    ).toHaveValue("1");
    // A quota failure during the actual transaction must leave neither half of a copy.
    await page.reload();
    await connect(page, f.file);
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (
        ...args: Parameters<IDBObjectStore["put"]>
      ) {
        if (this.name === "files")
          throw new DOMException("Quota", "QuotaExceededError");
        return put.apply(this, args);
      };
    });
    await page
      .getByRole("button", {
        name: "Remember this video on this device",
        exact: true,
      })
      .click();
    await expect(
      page.getByTestId("editor-local-video-status").filter({ visible: true }),
    ).toContainText("Browser storage is full");
    expect(await count(page)).toBe(0);
    await page.reload();
    await connect(page, f.file);
    await page.evaluate(() =>
      Object.defineProperty(navigator.storage, "estimate", {
        configurable: true,
        value: () => new Promise(() => {}),
      }),
    );
    await page
      .getByRole("button", {
        name: "Remember this video on this device",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Cancel local storage", exact: true })
      .click();
    await expect(
      page.getByTestId("editor-local-video-status").filter({ visible: true }),
    ).toContainText("cancelled");
    expect(await count(page)).toBe(0);
    await page.reload();
    await connect(page, f.file);
    await page
      .getByRole("button", {
        name: "Remember this video on this device",
        exact: true,
      })
      .click();
    await expect(
      page.getByTestId("editor-local-video-status").filter({ visible: true }),
    ).toContainText("Video available");
    await page.evaluate(
      async ({ DB, size }) =>
        await new Promise<void>((resolve, reject) => {
          const r = indexedDB.open(DB, 1);
          r.onsuccess = () => {
            const db = r.result,
              tx = db.transaction("files", "readwrite"),
              store = tx.objectStore("files"),
              keys = store.getAllKeys();
            keys.onsuccess = () =>
              store.put(new Blob([new Uint8Array(size)]), keys.result[0]);
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onabort = () => reject(tx.error);
          };
        }),
      { DB, size: f.source.sizeBytes },
    );
    await page.reload();
    await expect(
      page.getByTestId("editor-local-video-status").filter({ visible: true }),
    ).toContainText("fingerprint check");
    await expect(
      page.getByLabel("Reconnect video").filter({ visible: true }),
    ).toBeEnabled();
    await expect(
      page
        .getByLabel("Start (seconds)", { exact: false })
        .filter({ visible: true }),
    ).toHaveCount(0);
    expect(await count(page)).toBe(0);
    await connect(page, f.file);
    // Disabled/private storage must not prevent manual reconnection or editing.
    await page.addInitScript(() =>
      Object.defineProperty(window, "indexedDB", {
        configurable: true,
        value: undefined,
      }),
    );
    await page.reload();
    await expect(
      page.getByTestId("editor-local-video-status").filter({ visible: true }),
    ).toContainText("cannot remember videos");
    await connect(page, f.file);
    await expect(
      page
        .getByLabel("End (seconds)", { exact: false })
        .filter({ visible: true }),
    ).toHaveValue("3");
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test.describe("touch local video workflow", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test("remember before creating a cloud project and reopen without reattachment", async ({
    page,
  }) => {
    const f = fixture();
    try {
      await register(page);
      await page.goto("/editor");
      await page
        .getByLabel("Project title", { exact: true })
        .fill("Touch remembered project");
      await page
        .getByLabel("Choose video", { exact: true })
        .setInputFiles(f.file);
      await page
        .getByLabel("Mode", { exact: true })
        .selectOption("manual-trim");
      await page.getByLabel("Start (seconds)", { exact: false }).fill("1.25");
      await page.getByLabel("End (seconds)", { exact: false }).fill("2.75");
      await page
        .getByRole("button", {
          name: "Remember this video on this device",
          exact: true,
        })
        .tap();
      await expect(page.getByTestId("editor-local-video-status")).toContainText(
        "Video available",
      );
      await page
        .getByRole("button", { name: "Save to account", exact: true })
        .tap();
      await expect(page).toHaveURL(/\/projects\/[a-f0-9-]+$/);
      await expect(
        page
          .getByLabel("Start (seconds)", { exact: false })
          .filter({ visible: true }),
      ).toHaveValue("1.25");
      await expect(
        page
          .getByLabel("End (seconds)", { exact: false })
          .filter({ visible: true }),
      ).toHaveValue("2.75");
      await page.reload();
      await expect(
        page.getByLabel("Project title", { exact: true }),
      ).toHaveValue("Touch remembered project");
      await expect(
        page
          .getByLabel("Start (seconds)", { exact: false })
          .filter({ visible: true }),
      ).toHaveValue("1.25");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    } finally {
      rmSync(f.dir, { recursive: true, force: true });
    }
  });
});
