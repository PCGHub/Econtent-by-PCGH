import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupMedia } from "../../../supabase/functions/project-media-cleanup/cleanup";
const URL = "http://localhost:55321",
  PASSWORD = "Local-cloud-preview-123!";
function token(role: string) {
  const enc = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const text =
    enc({ alg: "HS256", typ: "JWT" }) +
    "." +
    enc({
      role,
      iss: "econtent-local-tests",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    });
  return (
    text +
    "." +
    createHmac("sha256", "local-econtent-test-secret-at-least-32-characters")
      .update(text)
      .digest("base64url")
  );
}
const anon = token("anon"),
  admin = createClient(URL, token("service_role"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
function sql(query: string) {
  const env = { ...process.env };
  for (const k of [
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
  ])
    delete env[k];
  return execFileSync(
    "docker",
    [
      "--host",
      "unix:///var/run/docker.sock",
      "exec",
      "-i",
      "econtent-auth-tests-db-1",
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input: query, env, encoding: "utf8" },
  );
}
async function user() {
  const email = "cloud-" + randomUUID() + "@example.test";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  expect(error).toBeNull();
  const client = createClient(URL, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect(
    (await client.auth.signInWithPassword({ email, password: PASSWORD })).error,
  ).toBeNull();
  return { client, email, id: data.user!.id };
}
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function call(
  client: SupabaseClient,
  action: string,
  payload: Record<string, unknown> = {},
) {
  const result = await client.rpc("project_media_action", { action, payload });
  if (result.error) throw Error(result.error.message);
  return result.data;
}
test("real cloud media: cross-device Cutter restore, ownership, actual deletion and quota reuse", async ({
  page,
  browser,
}) => {
  const a = await user(),
    b = await user(),
    dir = mkdtempSync(join(tmpdir(), "econtent-cloud-")),
    file = join(dir, "cloud.mp4");
  let fresh: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    expect((await cleanupMedia(admin)).failed).toBe(0);
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
    const bytes = readFileSync(file),
      sha256 = createHash("sha256").update(bytes).digest("hex");
    await login(page, a.email);
    await page.goto("/editor");
    await page.locator("input[type=file]").last().setInputFiles(file);
    await expect(page.getByText("Source identity verified")).toBeAttached();
    await page
      .getByRole("button", { name: "Save to account", exact: true })
      .click();
    await expect(page).toHaveURL(/\/projects\/[a-f0-9-]+$/, { timeout: 30000 });
    const pid = page.url().split("/").pop()!;
    const assets = (await call(a.client, "list", { projectId: pid })).assets;
    expect(assets).toHaveLength(1);
    expect(assets[0].sha256).toBe(sha256);
    expect(assets[0].state).toBe("ready");
    const usage = await call(a.client, "usage");
    expect(usage.usedBytes).toBe(bytes.length);
    expect(usage.limitBytes).toBe(500000000);
    expect(usage.retentionDays).toBe(3);
    const forbidden = await b.client.rpc("project_media_action", {
      action: "list",
      payload: { projectId: pid },
    });
    expect(forbidden.error).not.toBeNull();
    expect(
      (
        await b.client.storage
          .from("econtent-project-media")
          .download(assets[0].object_path)
      ).error,
    ).not.toBeNull();
    expect(
      (await a.client.from("projects").delete().eq("id", pid)).error,
    ).not.toBeNull();
    // A new browser context has no remembered videos or browser-local state.
    fresh = await browser.newContext();
    const second = await fresh.newPage();
    await login(second, a.email);
    await second.goto("/projects/" + pid);
    await expect(second.getByLabel("Cloud project media")).toContainText(
      "Cloud media available",
      { timeout: 30000 },
    );
    await expect(second.locator("video").first()).toBeVisible();
    expect(
      await second
        .locator("video")
        .first()
        .evaluate((v: HTMLVideoElement) => v.readyState >= 1),
    ).toBe(true);
    second.on("dialog", (d) => d.accept());
    await second.getByRole("button", { name: "Delete cloud file" }).click();
    await expect(second.getByLabel("Cloud project media")).toContainText(
      "storage space is available again",
    );
    expect((await call(a.client, "usage")).usedBytes).toBe(0);
    expect(
      (
        await admin.storage
          .from("econtent-project-media")
          .download(assets[0].object_path)
      ).error,
    ).not.toBeNull();
    expect(
      (await a.client.from("projects").select("id").eq("id", pid)).data,
    ).toHaveLength(1);
  } finally {
    await fresh?.close();
    for (const u of [a, b]) {
      const { data } = await admin
        .from("project_media")
        .select("object_path")
        .eq("owner_id", u.id);
      if (data?.length)
        await admin.storage
          .from("econtent-project-media")
          .remove(data.map((x) => x.object_path));
      await admin.from("project_media").delete().eq("owner_id", u.id);
      await admin.from("projects").delete().eq("owner_id", u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
test("server quotas serialize concurrent reservations, reject false sizes, preserve edits at expiry and grant Premium securely", async () => {
  const a = await user();
  let pid = "";
  try {
    await cleanupMedia(admin);
    const { data, error } = await a.client
      .from("projects")
      .insert({ title: "Quota test" })
      .select("id")
      .single();
    expect(error).toBeNull();
    pid = data!.id;
    const reserve = (n: number, sizeBytes = 50000000) =>
      call(a.client, "reserve", {
        projectId: pid,
        sha256: n.toString(16).padStart(64, "0"),
        name: "test-" + n + ".mp4",
        sizeBytes,
        mimeType: "video/mp4",
      });
    for (let n = 1; n <= 9; n++) await reserve(n);
    const concurrent = await Promise.allSettled([reserve(10), reserve(11)]);
    expect(concurrent.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await call(a.client, "usage")).usedBytes).toBe(500000000);
    expect(
      (
        await a.client
          .from("storage_plans")
          .insert({ owner_id: a.id, plan: "premium" })
      ).error,
    ).not.toBeNull();
    const rows = (await call(a.client, "list", { projectId: pid })).assets;
    for (const row of rows) {
      await call(a.client, "deleting", { projectId: pid, assetId: row.id });
      await call(a.client, "release", { projectId: pid, assetId: row.id });
    }
    const asset = await reserve(12, 4);
    expect(
      (
        await a.client.storage
          .from("econtent-project-media")
          .upload(asset.object_path, new Uint8Array([1, 2, 3, 4, 5]), {
            contentType: "video/mp4",
          })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await a.client.storage
          .from("econtent-project-media")
          .upload(asset.object_path, new Uint8Array([1, 2, 3, 4]), {
            contentType: "video/mp4",
          })
      ).error,
    ).toBeNull();
    await call(a.client, "finalize", { projectId: pid, assetId: asset.id });
    expect(
      (
        await a.client.rpc("project_media_action", {
          action: "release",
          payload: { projectId: pid, assetId: asset.id },
        })
      ).error,
    ).not.toBeNull();
    sql(
      `insert into public.storage_plans(owner_id,plan) values ('${a.id}','premium');`,
    );
    const premium = await call(a.client, "usage");
    expect(premium.limitBytes).toBe(5000000000);
    expect(premium.retentionDays).toBe(30);
    const extended = (await call(a.client, "list", { projectId: pid }))
      .assets[0];
    expect(Date.parse(extended.expires_at) - Date.parse(asset.expires_at)).toBe(
      27 * 86400000,
    );
    sql(
      `update public.project_media set expires_at=now()-interval '1 second' where project_id='${pid}';`,
    );
    expect(
      (
        await a.client.storage
          .from("econtent-project-media")
          .download(asset.object_path)
      ).error,
    ).not.toBeNull();
    expect((await cleanupMedia(admin)).failed).toBe(0);
    expect((await call(a.client, "usage")).usedBytes).toBe(0);
    expect(
      (await a.client.from("projects").select("id").eq("id", pid)).data,
    ).toHaveLength(1);
  } finally {
    const { data } = await admin
      .from("project_media")
      .select("object_path")
      .eq("owner_id", a.id);
    if (data?.length)
      await admin.storage
        .from("econtent-project-media")
        .remove(data.map((x) => x.object_path));
    await admin.from("project_media").delete().eq("owner_id", a.id);
    await admin.from("projects").delete().eq("owner_id", a.id);
    await admin.from("storage_plans").delete().eq("owner_id", a.id);
    await admin.auth.admin.deleteUser(a.id);
  }
});
