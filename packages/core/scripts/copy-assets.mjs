// Copies non-TypeScript assets (e.g. .html templates) from src/ into dist/,
// mirroring the directory layout. tsc only emits .js/.d.ts, so example
// templates would otherwise be missing at runtime.
import { readdir, mkdir, copyFile } from "node:fs/promises";
import { join, extname, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const srcDir = join(root, "src");
const distDir = join(root, "dist");

// Extensions tsc does not emit but the runtime needs.
const ASSET_EXTS = new Set([".html", ".css", ".json", ".svg", ".png", ".jpg", ".ico"]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
    } else if (ASSET_EXTS.has(extname(entry.name).toLowerCase())) {
      const dest = join(distDir, relative(srcDir, full));
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(full, dest);
      console.log("copied", relative(root, dest));
    }
  }
}

await walk(srcDir);
