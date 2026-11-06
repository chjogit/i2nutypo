// Copies the fonts in fonts.json into ../static/fonts/, so pages and the canvas load them from
// this site instead of Google Fonts (no request leaves for a third party). Run it only when
// fonts.json changes; its output is committed like the rest of static/.
//
//   node scripts/vendor-fonts.mjs
//
// Each family comes from its Fontsource package at the pinned version (the same files Google
// Fonts serves, split into unicode-range subsets, so a browser fetches only the glyphs a page
// uses). Only woff2 files for the listed weights are kept, with the font's licence beside them.
//
// A family not on Fontsource with Hangul (Pretendard) names "layout": "pretendard": its own
// package's dynamic-subset build is used the same way (woff2 subsets, listed weights only).
//
//   node scripts/vendor-fonts.mjs --only Pretendard   (adds or refreshes one family, keeps the rest)
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = fileURLToPath(new URL("../../static/fonts/", import.meta.url));
const fonts = JSON.parse(await readFile(join(root, "fonts.json"), "utf8"));

const slugOf = (family) => family.toLowerCase().replace(/ /g, "-");

const onlyArg = process.argv.indexOf("--only");
const only = onlyArg >= 0 ? process.argv[onlyArg + 1] : null;
if (!only) await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const work = await mkdtemp(join(tmpdir(), "fonts-"));
const index = only
  ? JSON.parse(await readFile(join(outDir, "fonts.json"), "utf8")).filter((f) => f.family !== only)
  : [];

/** Pretendard's own build: one stylesheet of unicode-range subsets for every weight. */
const PRETENDARD_NAMES = {
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black",
};
async function vendorPretendard(font, pkg, dest) {
  const dir = join(pkg, "dist", "web", "static");
  const sheet = await readFile(join(dir, "pretendard-dynamic-subset.css"), "utf8");
  const names = new Set(font.weights.map((w) => PRETENDARD_NAMES[w]));
  const header = sheet.slice(0, sheet.indexOf("*/") + 2);
  const faces = [];
  for (const [face] of sheet.matchAll(/@font-face\s*{[^}]*}/g)) {
    const file = /woff2-dynamic-subset\/(Pretendard-([A-Za-z]+)\.subset\.\d+\.woff2)/.exec(face);
    if (!file || !names.has(file[2])) continue;
    await cp(join(dir, "woff2-dynamic-subset", file[1]), join(dest, "files", file[1]));
    faces.push(
      face
        .replace(/url\(\.\/woff2-dynamic-subset\//g, "url(./files/")
        .replace(/, url\(\.\/woff-dynamic-subset\/[^)]+\) format\('woff'\)/g, ""),
    );
  }
  await writeFile(join(dest, "pretendard.css"), `${header}\n${faces.join("\n")}\n`);
  // The package keeps its licence in the stylesheet header; the full OFL text is the same for every OFL font
  const ofl = await readFile(join(outDir, "noto-sans-kr", "LICENSE"), "utf8").catch(() => "");
  const body = ofl.slice(Math.max(0, ofl.indexOf("-----")));
  await writeFile(join(dest, "LICENSE"), `${header.replace(/^\/\*\n?|\*\/$/g, "").trim()}\n\n${body}`);
}

try {
  for (const font of fonts) {
    if (only && font.family !== only) continue;
    const slug = slugOf(font.family);
    const tgz = execFileSync("npm", ["pack", `${font.package}@${font.version}`, "--silent"], { cwd: work })
      .toString()
      .trim();
    const pkg = join(work, slug);
    await mkdir(pkg, { recursive: true });
    execFileSync("tar", ["xzf", join(work, tgz), "-C", pkg, "--strip-components=1"]);
    const dest = join(outDir, slug);
    await rm(dest, { recursive: true, force: true });
    await mkdir(join(dest, "files"), { recursive: true });
    if (font.layout === "pretendard") {
      await vendorPretendard(font, pkg, dest);
      const meta = JSON.parse(await readFile(join(pkg, "package.json"), "utf8"));
      index.push({
        family: font.family,
        slug,
        license: meta.license,
        version: font.version,
        source: `the ${font.package} package ${font.version}`,
      });
      console.log(`${font.family}: ${font.weights.join(", ")}`);
      continue;
    }
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
