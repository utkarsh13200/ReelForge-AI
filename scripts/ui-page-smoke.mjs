/**
 * Load dashboard pages; fail on HTTP >=500 or "Application error" in HTML.
 */
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

const results = [];
for (const path of paths) {
  try {
    const res = await fetch(`${BASE}${path}`, { redirect: "follow" });
    const text = await res.text();
    const appErr =
      /Application error|Hydration failed|Minified React error/i.test(text);
    const pass = res.status < 500 && !appErr;
    results.push({ path, status: res.status, pass, appErr });
    console.log(`${pass ? "PASS" : "FAIL"} ${path} status=${res.status}${appErr ? " appError" : ""}`);
  } catch (e) {
    results.push({ path, pass: false, error: String(e) });
    console.log(`FAIL ${path} ${e}`);
  }
}

const failed = results.filter((r) => !r.pass).length;
process.exit(failed ? 1 : 0);
