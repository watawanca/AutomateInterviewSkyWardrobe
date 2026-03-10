//So this needs to make decisions based on the data from the filtered summary
//And use the user's preferences to make a recommendation for the day
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DaySummary } from "./OMSummary.js";
import { MatchSummaryToPrefs } from "./PrefMatching.js";
import type { PreferencesConfig } from "./PrefMatching.js";

type ClothingItem = {
  id: string;
  name: string;
  category: string;
  warmth: number;
  windchillPrevention: number;
  waterResistance: number;
  breathability: number;
};

type ClothingDatabase = {
  version: string;
  notes?: string;
  items: ClothingItem[];
};

async function loadClothingDatabase(): Promise<ClothingDatabase> {
  const clothingPath = path.resolve(process.cwd(), "data", "clothing.json");
  const raw = await readFile(clothingPath, "utf-8");
  return JSON.parse(raw) as ClothingDatabase;
}

async function loadPreferencesConfig(): Promise<PreferencesConfig> {
  const preferencesPath = path.resolve(process.cwd(), "config", "preferences.config.json");
  const raw = await readFile(preferencesPath, "utf-8");
  return JSON.parse(raw) as PreferencesConfig;
}

async function loadOMSummary(): Promise<DaySummary> {
  const summaryPath = path.resolve(process.cwd(), "data", "om_summary.json");
  const raw = await readFile(summaryPath, "utf-8");
  return JSON.parse(raw) as DaySummary;
}

export const clothingDatabase = await loadClothingDatabase();
export const preferencesConfig = await loadPreferencesConfig();
export const OMSummary = await loadOMSummary();
export const summaryMatches = MatchSummaryToPrefs(OMSummary, preferencesConfig);

async function recommendClothing(): Promise<ClothingItem[]> {
  //This is where the logic will go to recommend clothing based on the summary and the database
  /*
  1. Temperature
    - Max and min
      - Warmth
      - Breathability
  2. Rain
    - Rain resistance
  3. Wind
    - Windchill prevention
  4. Style
    - Gender
    - Formality
    - Complements
  */
  
  return [];
}
