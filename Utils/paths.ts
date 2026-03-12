import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

// Centralized app data path resolution.

// Resolve the base folder for config/data.
// Priority: SKYWARDROBE_HOME -> %APPDATA% -> local .skywardrobe.
const resolveHome = () => {
  const envHome = process.env.SKYWARDROBE_HOME;
  if (envHome && envHome.trim()) return envHome;

  const appData = process.env.APPDATA;
  if (appData && appData.trim()) {
    return path.join(appData, "SkyWardrobe");
  }

  return path.resolve(process.cwd(), ".skywardrobe");
};

// Ensure the base folder exists.
export const getSkyWardrobeHome = (): string => {
  const home = resolveHome();
  if (!existsSync(home)) {
    mkdirSync(home, { recursive: true });
  }
  return home;
};

// Absolute path to config files.
export const getConfigPath = (...segments: string[]): string =>
  path.join(getSkyWardrobeHome(), "config", ...segments);

// Absolute path to data files.
export const getDataPath = (...segments: string[]): string =>
  path.join(getSkyWardrobeHome(), "data", ...segments);
