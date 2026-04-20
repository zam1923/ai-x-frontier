// build.mjs — Pure ESM build script (no tsx required)
import { build as esbuild } from "esbuild";
import { rm, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Server deps to bundle (reduce cold start syscalls)
const allowlist = [
  "@google/generative-ai",
  "axios",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  // 1. Build client with Vite (dynamic import to get ESM vite)
  console.log("Building client with Vite...");
  await rm(path.join(rootDir, "dist"), { recursive: true, force: true });

  const { build: viteBuild } = await import("vite");
  await viteBuild({
    configFile: path.join(rootDir, "vite.config.ts"),
  });
  console.log("Client build done.");

  // 2. Build server with esbuild
  console.log("Building server with esbuild...");
  const pkgRaw = await readFile(path.join(rootDir, "package.json"), "utf-8");
  const pkg = JSON.parse(pkgRaw);
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: [path.join(rootDir, "server/index.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.join(rootDir, "dist/index.cjs"),
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
  console.log("Server build done.");
}

buildAll().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
