import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, copyFile, readdir, writeFile } from "node:fs/promises";
import { runOMSummary } from "../../Utils/OMSummary.js";
import { runUiCli } from "../../Utils/UiCli.js";
import { configFiles, dataFiles } from "./assets-manifest.mjs";

const getDefaultHome = () => {
  const appData = process.env.APPDATA;
  if (appData && appData.trim()) {
    return path.join(appData, "SkyWardrobe");
  }
  return path.resolve(process.cwd(), ".skywardrobe");
};

const findAssetsRoot = (startDir: string): string | null => {
  let current = startDir;
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(current, "tools", "pkg", "assets");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
};

const copyDir = async (src: string, dest: string, skipExisting = false) => {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
      continue;
    }
    if (skipExisting && existsSync(destPath)) continue;
    await copyFile(srcPath, destPath);
  }
};

const ensureSeeded = async (home: string) => {
  const assetsRoot =
    findAssetsRoot(__dirname) ??
    findAssetsRoot(path.dirname(process.execPath));

  const configDir = path.join(home, "config");
  const dataDir = path.join(home, "data");

  if (assetsRoot) {
    await copyDir(path.join(assetsRoot, "config"), configDir, true);
    await copyDir(path.join(assetsRoot, "data"), dataDir, true);
    return;
  }

  await mkdir(configDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });

  await Promise.all(
    Object.entries(configFiles).map(async ([relPath, content]) => {
      const dest = path.join(configDir, relPath);
      if (existsSync(dest)) return;
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, content, "utf-8");
    }),
  );

  await Promise.all(
    Object.entries(dataFiles).map(async ([relPath, content]) => {
      const dest = path.join(dataDir, relPath);
      if (existsSync(dest)) return;
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, content, "utf-8");
    }),
  );
};

const main = async () => {
  const home = getDefaultHome();
  await ensureSeeded(home);
  process.env.SKYWARDROBE_HOME = home;
  process.chdir(home);
  console.log(`[Launcher] Using data directory: ${home}`);

  await runOMSummary({ write: true });
  runUiCli();
};

main().catch((error) => {
  console.error("[Launcher] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
