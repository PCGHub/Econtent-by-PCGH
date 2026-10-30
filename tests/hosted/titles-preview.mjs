import { createServer } from "node:https";
import { chromium } from "playwright";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { shareUrl, origin } = JSON.parse(
  readFileSync(process.argv[2] || "/run/econtent-preview-access.json", "utf8"),
);
if (
  new URL(origin).origin !== origin ||
  new URL(origin).protocol !== "https:" ||
  !/^econtent-by-pcgh-[a-z0-9]{9}-pcgrowthhub-2263s-projects\.vercel\.app$/.test(
    new URL(origin).hostname,
  ) ||
  new URL(shareUrl).origin !== origin
)
  throw Error(
    "Use an authorized Econtent Vercel Preview origin and its same-origin share URL",
  );
const proxyURL = new URL(process.env.HTTPS_PROXY || process.env.HTTP_PROXY);
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/lib/chromium/chromium",
  proxy: {
    server: proxyURL.origin,
    username: decodeURIComponent(proxyURL.username),
    password: decodeURIComponent(proxyURL.password),
    bypass: "127.0.0.1,localhost",
  },
});
const context = await browser.newContext({
  ignoreHTTPSErrors: false,
  viewport: { width: 1600, height: 1100 },
});
const page = await context.newPage();
const dir = mkdtempSync(join(tmpdir(), "econtent-hosted-title-"));
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      join(dir, "untrusted.key"),
      "-out",
      join(dir, "untrusted.crt"),
      "-subj",
      "/CN=localhost",
      "-days",
      "1",
    ],
    { stdio: "ignore" },
  );
  const tlsServer = createServer(
    {
      key: readFileSync(join(dir, "untrusted.key")),
      cert: readFileSync(join(dir, "untrusted.crt")),
    },
    (req, res) => res.end("untrusted"),
  );
  await new Promise((resolve) => tlsServer.listen(9443, "127.0.0.1", resolve));
  let refused = false;
  const tlsPage = await context.newPage();
  try {
    await tlsPage.goto("https://127.0.0.1:9443");
  } catch (error) {
    refused = /ERR_CERT_AUTHORITY_INVALID/.test(error.message);
  } finally {
    await tlsPage.close();
    await new Promise((resolve) => tlsServer.close(resolve));
  }
  if (!refused)
    throw Error("Untrusted TLS certificate was not correctly rejected");
  console.log(
    "TLS negative control: untrusted self-signed certificate rejected",
  );
  await page.goto(shareUrl, { waitUntil: "domcontentloaded" });
  if (new URL(page.url()).origin !== origin)
    throw Error("Preview protection did not grant same-origin browser access");
  const response = await page.goto(origin + "/titles-studio", {
    waitUntil: "networkidle",
  });
  if (response.status() !== 200) throw Error("Titles route did not return 200");
  const security = await response.securityDetails();
  console.log(
    JSON.stringify({ hostedTLS: security?.protocol, issuer: security?.issuer }),
  );
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole("button", { name: /^Select title scene / })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Delete title scene", exact: true })
      .click();
  }
  await page.getByLabel("Scene duration (s)", { exact: true }).fill("1");
  await page.getByLabel("Scene duration (s)", { exact: true }).press("Tab");
  await page.getByRole("tab", { name: "Export", exact: true }).click();
  await page
    .getByLabel("Title output size", { exact: true })
    .selectOption("360");
  const start = Date.now();
  await page
    .getByRole("button", { name: "Render Preview", exact: true })
    .click();
  await page.getByLabel("Rendered titles MP4").waitFor({ timeout: 120000 });
  const renderedMs = Date.now() - start;
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download MP4", exact: true }).click();
  const path = join(dir, "titles.mp4");
  await (await download).saveAs(path);
  let info = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
      { encoding: "utf8" },
    ),
  );
  if (
    info.streams[0].codec_name !== "h264" ||
    info.streams[1].codec_name !== "aac" ||
    info.streams[0].width !== 640 ||
    info.streams[0].height !== 360 ||
    Math.abs(Number(info.format.duration) - 1) > 0.12
  )
    throw Error("Hosted title MP4 validation failed");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-xerror",
    "-i",
    path,
    "-f",
    "null",
    "-",
  ]);
  console.log(
    JSON.stringify({
      titlesRouteStatus: response.status(),
      renderedMs,
      codecs: info.streams.map((s) => s.codec_name),
      dimensions: "640x360",
      duration: info.format.duration,
      bytes: readFileSync(path).length,
    }),
  );
  await page.goto(origin + "/login");
  if (
    (await page.locator("body").innerText()).includes(
      "Cloud accounts are not configured",
    )
  )
    throw Error("Preview lost authorized account configuration");
  await page.goto(origin + "/projects");
  if (new URL(page.url()).pathname !== "/login")
    throw Error("Projects route was not protected");
  console.log(
    "Hosted login configuration and protected projects redirect verified",
  );
  await page.goto(origin + "/editor");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=320x180:r=24",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440",
    "-t",
    "4",
    "-c:v",
    "libx264",
    "-g",
    "24",
    "-c:a",
    "aac",
    join(dir, "source.mp4"),
  ]);
  await page
    .getByLabel("Choose video", { exact: true })
    .setInputFiles(join(dir, "source.mp4"));
  await page.getByText(/4.000 seconds/).waitFor();
  await page.getByLabel("End (seconds)", { exact: false }).fill("2");
  await page
    .getByRole("button", { name: "Process video", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Completed", exact: true })
    .waitFor({ timeout: 120000 });
  console.log("Hosted Video Cutter Fast Cut completed");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/titles-studio");
  await page
    .getByRole("button", { name: "Open workspace navigation", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Workspace navigation", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Mobile horizontal overflow");
  console.log("Hosted mobile layout/drawer verified (emulation only)");
  if (errors.length) throw Error("Browser page errors: " + errors.join("; "));
} catch (error) {
  console.error(
    String(error.message)
      .replaceAll(shareUrl, origin + "/<protected-access>")
      .replace(/_vercel_share=[^&\s"]+/g, "_vercel_share=<redacted>"),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
