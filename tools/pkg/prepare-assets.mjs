import { mkdir, readdir, copyFile, stat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const assetsRoot = path.resolve(import.meta.dirname, "assets");

const copyDir = async (src, dest) => {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
      continue;
    }
    await copyFile(srcPath, destPath);
  }
};

const collectFiles = async (rootDir, currentDir = rootDir) => {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(rootDir, fullPath)));
      continue;
    }
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, "/");
    const content = await readFile(fullPath, "utf-8");
    files.push({ relPath, content });
  }
  return files;
};

const writeManifest = async (configFiles, dataFiles) => {
  const manifestPath = path.resolve(import.meta.dirname, "assets-manifest.mjs");
  const renderMap = (files) => {
    const lines = files.map((file) => {
      const safe = JSON.stringify(file.content);
      return `  ${JSON.stringify(file.relPath)}: ${safe}`;
    });
    return `{
${lines.join(",\n")}
}`;
  };

  const content = `export const configFiles = ${renderMap(configFiles)};\nexport const dataFiles = ${renderMap(dataFiles)};\n`;
  await writeFile(manifestPath, content, "utf-8");
};

const main = async () => {
  const configSrc = path.join(repoRoot, "config");
  const dataSrc = path.join(repoRoot, "data");
  const configDest = path.join(assetsRoot, "config");
  const dataDest = path.join(assetsRoot, "data");

  await copyDir(configSrc, configDest);
  await copyDir(dataSrc, dataDest);

  const configFiles = await collectFiles(configSrc);
  const dataFiles = await collectFiles(dataSrc);
  await writeManifest(configFiles, dataFiles);

  const stats = await stat(assetsRoot);
  if (!stats.isDirectory()) {
    throw new Error("Assets root was not created.");
  }

  console.log("[prepare-assets] Copied config/ and data/ into tools/pkg/assets");
};

main().catch((error) => {
  console.error("[prepare-assets] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
