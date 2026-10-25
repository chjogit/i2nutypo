// Copies the fonts in fonts.json into ../static/fonts/, so pages and the canvas load them from
// this site instead of Google Fonts (no request leaves for a third party). Run it only when
// fonts.json changes; its output is committed like the rest of static/.
//
//   node scripts/vendor-fonts.mjs
//
// Each family comes from its Fontsource package at the pinned version (the same files Google
// Fonts serves, split into unicode-range subsets, so a browser fetches only the glyphs a page
// uses). Only woff2 files for the listed weights are kept, with the font's licence beside them.
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = fileURLToPath(new URL("../../static/fonts/", import.meta.url));
const fonts = JSON.parse(await readFile(join(root, "fonts.json"), "utf8"));

const slugOf = (family) => family.toLowerCase().replace(/ /g, "-");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const work = await mkdtemp(join(tmpdir(), "fonts-"));
const index = [];
try {
  for (const font of fonts) {
    const slug = slugOf(font.family);
    const tgz = execFileSync("npm", ["pack", `${font.package}@${font.version}`, "--silent"], { cwd: work })
      .toString()
      .trim();
    const pkg = join(work, slug);
    await mkdir(pkg, { recursive: true });
    execFileSync("tar", ["xzf", join(work, tgz), "-C", pkg, "--strip-components=1"]);
    const dest = join(outDir, slug);
    await mkdir(join(dest, "files"), { recursive: true });
    const css = [];
    for (const weight of font.weights) {
      const sheet = await readFile(join(pkg, `${weight}.css`), "utf8");
      // woff2 only: every browser that runs the editor reads it
      css.push(sheet.replace(/, url\(\.\/files\/[^)]+\.woff\) format\('woff'\)/g, ""));
      for (const [, file] of sheet.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)) {
        await cp(join(pkg, "files", file), join(dest, "files", file));
      }
    }
    await writeFile(join(dest, `${slug}.css`), css.join("\n"));
    const licence = (await readdir(pkg)).find((f) => /^licen[cs]e/i.test(f));
    if (licence) await cp(join(pkg, licence), join(dest, "LICENSE"));
    const meta = JSON.parse(await readFile(join(pkg, "package.json"), "utf8"));
    index.push({ family: font.family, slug, license: meta.license, version: font.version });
    console.log(`${font.family}: ${font.weights.join(", ")}`);
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
await writeFile(join(outDir, "fonts.json"), `${JSON.stringify(index, null, 2)}\n`);
