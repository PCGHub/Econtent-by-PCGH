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
  const httpAssets = [];
  context.on("response", (r) => {
    if (/\/ffmpeg\/releases\//.test(r.url())) {
      const h = r.headers();
      httpAssets.push({
        path: new URL(r.url()).pathname,
        status: r.status(),
        mime: h["content-type"],
        encoding: h["content-encoding"],
        length: h["content-length"],
        cache: h["x-vercel-cache"],
      });
    }
  });
  const metrics = [];
  page.on("worker", (worker) => {
    void worker
      .evaluate(
        `(()=>{const send=self.postMessage.bind(self);self.__startup=[];self.postMessage=(m,...args)=>{if(m.type==='ECONTENT_STARTUP')self.__startup.push(m.data);return send(m,...args)}})()`,
      )
      .catch(() => {});
  });
  const exports = [];
  for (const warm of [false, true]) {
    if (warm) await page.reload({ waitUntil: "networkidle" });
    if (
      (await page
        .getByRole("button", { name: /^Select title scene / })
        .count()) !== 3
    )
      throw Error("Expected default three-scene Titles project");
    await page.getByRole("tab", { name: "Export", exact: true }).click();
    const start = Date.now();
    await page
      .getByRole("button", { name: "Render Preview", exact: true })
      .click();
    await page
      .getByLabel("Rendered titles MP4", { exact: true })
      .waitFor({ timeout: 240000 });
    const renderMs = Date.now() - start,
      download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download MP4", exact: true })
      .click();
    const path = join(dir, warm ? "warm.mp4" : "cold.mp4");
    await (await download).saveAs(path);
    const info = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-count_frames",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          path,
        ],
        { encoding: "utf8" },
      ),
    );
    if (
      info.streams[0]?.codec_name !== "h264" ||
      info.streams[1]?.codec_name !== "aac" ||
      info.streams[0]?.width !== 854 ||
      info.streams[0]?.height !== 480 ||
      Number(info.streams[0]?.nb_read_frames) !== 648 ||
      Math.abs(Number(info.format.duration) - 27) > 0.12
    )
      throw Error(
        "Hosted 27-second MP4 codec/duration/frame validation failed",
      );
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
    const frame = execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-ss",
        "3",
        "-i",
        path,
        "-frames:v",
        "1",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "pipe:1",
      ],
      { maxBuffer: 8 * 1048576 },
    );
    if ([...frame].filter((n) => n > 180).length < 1000)
      throw Error("Hosted title frame did not contain expected visible text");
    await page
      .getByLabel("Rendered titles MP4", { exact: true })
      .evaluate(async (v) => {
        v.muted = true;
        await v.play();
      });
    await page.waitForTimeout(300);
    if (
      (await page
        .getByLabel("Rendered titles MP4", { exact: true })
        .evaluate((v) => v.currentTime)) < 0.1
    )
      throw Error("Hosted MP4 playback did not advance");
    for (const worker of page.workers())
      try {
        metrics.push(
          ...(await worker.evaluate(
            'self.__startup.filter(p=>p.phase==="ready")',
          )),
        );
      } catch {}
    exports.push({
      warm,
      renderMs,
      bytes: readFileSync(path).length,
      duration: info.format.duration,
      frames: info.streams[0].nb_read_frames,
    });
    console.log(
      JSON.stringify({
        hosted27SecondExport: exports.at(-1),
        startup: metrics.at(-1),
      }),
    );
  }
  const wasm = httpAssets.filter((a) => a.path.endsWith(".wasm"));
  if (
    !wasm.length ||
    wasm.some(
      (a) =>
        a.status !== 200 ||
        !a.mime?.includes("application/wasm") ||
        a.encoding !== "br",
    )
  )
    throw Error("Hosted WASM HTTP encoding/MIME/status contract failed");
  if (!metrics.some((m) => m.cacheStorage === true && m.networkBodyBytes === 0))
    throw Error("Hosted verified warm cache was not observed");
  await page.setViewportSize({ width: 390, height: 844 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Titles mobile overflow");
  console.log(
    JSON.stringify({ httpAssets, metrics, exports, androidHardware: false }),
  );
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
