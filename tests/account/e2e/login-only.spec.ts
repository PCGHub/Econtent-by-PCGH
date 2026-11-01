import { test, expect, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

async function verificationLink(email: string) {
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
  return link;
}
async function editable(page: Page) {
  await expect(
    page.getByLabel("Email address", { exact: true }),
  ).toBeEditable();
  await expect(page.getByLabel("Password", { exact: true })).toBeEditable();
}

test("login inputs remain editable without build configuration and unavailable submit never sends credentials", async ({
  page,
}) => {
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", "3001"],
    {
      env: {
        ...process.env,
        NODE_ENV: "development",
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      },
      stdio: "ignore",
    },
  );
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch("http://localhost:3001/login")).status;
          } catch {
            return 0;
          }
        },
        { timeout: 60000 },
      )
      .toBe(200);
    let requests = 0;
    page.on("request", (r) => {
      if (r.url().includes("/auth/v1/")) requests++;
    });
    await page.goto("http://localhost:3001/login");
    await expect(
      page.getByText(/Cloud accounts are not configured/),
    ).toBeVisible();
    await editable(page);
    await page.getByLabel("Email address", { exact: true }).click();
    await page
      .getByLabel("Email address", { exact: true })
      .fill("creator@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("Disposable-only-123!");
    await page.getByRole("button", { name: "Show", exact: true }).click();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
      "type",
      "text",
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByText(/Your credentials have not been sent/),
    ).toBeVisible();
    await editable(page);
    expect(requests).toBe(0);
    await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
      "creator@example.test",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await editable(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    server.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (server.exitCode !== null) return resolve();
      const timer = setTimeout(() => {
        server.kill("SIGKILL");
        resolve();
      }, 3000);
      server.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
});

test("configured login accepts typing, handles invalid credentials, signs in, persists a session and signs out securely", async ({
  page,
}) => {
  const email = "login-" + randomUUID() + "@example.test",
    password = "Local-login-test-only-123!";
  // Prepare a real verified user in the disposable local GoTrue/Mailpit stack.
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Login Regression");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Check your inbox");
  await page.goto(await verificationLink(email));
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await editable(page);
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password + "wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toContainText(
    /Invalid login credentials/i,
  );
  await editable(page);
  expect((await page.request.get("/api/projects")).status()).toBe(401);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect((await page.request.get("/api/projects")).status()).toBe(200);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/projects")).status()).toBe(401);
  await editable(page);
});
