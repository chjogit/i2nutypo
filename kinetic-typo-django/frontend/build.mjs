// Builds the editor into the Django app's static folder:
//   ../static/js/studio.js           editor (React app)
//   ../static/js/whisper-worker.js   speech recognition worker
//   ../static/js/ffmpeg-worker.js    ProRes export worker
//   ../static/css/studio.css         Tailwind styles
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/postcss";
import * as esbuild from "esbuild";
import postcss from "postcss";

const watch = process.argv.includes("--watch");
const root = fileURLToPath(new URL(".", import.meta.url));
const staticDir = fileURLToPath(new URL("../static/", import.meta.url));
const cssIn = `${root}src/styles.css`;
const cssOut = `${staticDir}css/studio.css`;

/** Tailwind scans src/ for class names, so it reruns whenever the editor bundle rebuilds. */
async function buildCss() {
  const result = await postcss([tailwindcss({ base: root, optimize: !watch })]).process(
    await readFile(cssIn, "utf8"),
    {
      from: cssIn,
      to: cssOut,
    },
  );
  await writeFile(cssOut, result.css);
}

/** @type {esbuild.Plugin} */
const cssOnRebuild = {
  name: "tailwind",
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length === 0) await buildCss();
    });
  },
};

/** @type {esbuild.BuildOptions} */
const shared = {
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  minify: !watch,
  sourcemap: watch,
  logLevel: "info",
  absWorkingDir: root,
  alias: { "@": "./src" },
  // transformers.js runs in the browser only; its Node backends are never loaded
  external: ["sharp", "onnxruntime-node"],
  define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
};

const studio = {
  ...shared,
  entryPoints: { studio: "src/main.tsx" },
  outdir: `${staticDir}js`,
  plugins: [cssOnRebuild],
};
const worker = {
  ...shared,
  entryPoints: {
    "whisper-worker": "src/workers/whisper.worker.ts",
    // FFmpeg (WebAssembly) runs here for ProRes export; the program itself is fetched when first used
    "ffmpeg-worker": "node_modules/@ffmpeg/ffmpeg/dist/esm/worker.js",
  },
  outdir: `${staticDir}js`,
};

if (watch) {
  await (await esbuild.context(studio)).watch();
  await (await esbuild.context(worker)).watch();
} else {
  await Promise.all([esbuild.build(studio), esbuild.build(worker)]);
}
