import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const resolveHome = () => {
  const envHome = process.env.SKYWARDROBE_HOME;
  if (envHome && envHome.trim()) return envHome;

  const appData = process.env.APPDATA;
  if (appData && appData.trim()) {
    return path.join(appData, "SkyWardrobe");
  }

  return path.resolve(process.cwd(), ".skywardrobe");
};

export const getSkyWardrobeHome = (): string => {
  const home = resolveHome();
  if (!existsSync(home)) {
    mkdirSync(home, { recursive: true });
  }
  return home;
};

export const getConfigPath = (...segments: string[]): string =>
  path.join(getSkyWardrobeHome(), "config", ...segments);

export const getDataPath = (...segments: string[]): string =>
  path.join(getSkyWardrobeHome(), "data", ...segments);
