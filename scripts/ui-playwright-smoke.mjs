/**
 * Playwright: load pages, capture console errors and hydration failures.
 */
import { chromium } from "playwright";

const BASE = process.env.APP_URL || "http://localhost:3001";
const paths = [
  "/",
  "/dashboard/script",
  "/dashboard/visuals",
  "/dashboard/voice",
  "/dashboard/thumbnail",
  "/dashboard/edit",
  "/dashboard/export",
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
let failed = 0;

for (const path of paths) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 60000 });
  const status = res?.status() ?? 0;
  const body = await page.content();
  const appErr = /Application error|Hydration failed/i.test(body);
  const pass = status < 500 && !appErr && errors.length === 0;
  if (!pass) failed += 1;
  console.log(
    `${pass ? "PASS" : "FAIL"} ${path} status=${status}${appErr ? " appError" : ""}${
      errors.length ? ` consoleErrors=${errors.slice(0, 2).join(" | ")}"` : ""
    }`
  );
  await page.close();
}

await browser.close();
process.exit(failed ? 1 : 0);
