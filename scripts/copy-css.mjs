import { copyFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

const root = process.cwd();
const cssDir = join(root, ".next", "static", "css");
const out = join(root, "public", "app.css");

if (!existsSync(cssDir)) {
  console.warn("copy-css: no .next/static/css yet — run npm run build first");
  process.exit(0);
}

const files = readdirSync(cssDir).filter((f) => f.endsWith(".css"));
if (!files.length) {
  console.warn("copy-css: no CSS files found");
  process.exit(0);
}

mkdirSync(join(root, "public"), { recursive: true });
copyFileSync(join(cssDir, files[0]), out);
console.log(`copy-css: wrote public/app.css from ${files[0]}`);
