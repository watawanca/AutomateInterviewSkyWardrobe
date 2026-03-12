//So this needs to make decisions based on the data from the filtered summary
//And use the user's preferences to make a recommendation for the day
import { MatchSummaryToPrefs } from "./PrefMatching.js";
import { Layers } from "./Layers.js";
import type { PreferencesConfig } from "./PrefMatching.js";
import clothingData from "../data/clothing.json" with { type: "json" };
import type { DaySummary } from "./OMSummary.js";
import omSummaryData from "../data/om_summary.json" with { type: "json" };
import preferencesData from "../config/preferences.config.json" with { type: "json" };

// Clothing item schema derived from data/clothing.json.
export type ClothingItem = {
  id: string;
  name: string;
  category: string;
  layer: number;
  gender: string[];
  warmth: number;
  windchillPrevention: number;
  waterResistance: number;
  breathability: number;
  style: string[];
  complements: string[];
  weatherTags: string[];
  formality: string;
  activity: string[];
};

type ClothingDatabase = {
  version: string;
  notes: string;
  items: ClothingItem[];
};

const clothingDatabase = clothingData as ClothingDatabase;

const OMSummary = omSummaryData as DaySummary;
const preferencesConfig = preferencesData as PreferencesConfig;

// Convert weather summary into preference targets (warmth, wind, rain).
const summaryMatches = MatchSummaryToPrefs(OMSummary, preferencesConfig);
console.log("[ClothesListGen] Summary matches:", summaryMatches);

// Filter items that match the computed weather-driven requirements.
function getRecommendedByCategory(category?: string): ClothingItem[] {
  return clothingDatabase.items.filter((item) => {
    if (category && item.category !== category) return false;
    const warmthTargets = [summaryMatches.warmthMinTemp, summaryMatches.warmthMaxTemp].filter(
      (value): value is number => value !== undefined,
    );
    if (warmthTargets.length > 0) {
      const averageWarmth = warmthTargets.reduce((sum, value) => sum + value, 0) / warmthTargets.length;
      const minAcceptableWarmth = averageWarmth - 1;
      const maxAcceptableWarmth = averageWarmth + 1;
      if (item.warmth < minAcceptableWarmth || item.warmth > maxAcceptableWarmth) return false;
    }
    const isOverlayer =
      item.category === "outerwear" || (item.layer === Layers.Outer && item.category !== "shoes");
    if (
      isOverlayer &&
      summaryMatches.windchillPrevention !== undefined &&
      item.windchillPrevention < summaryMatches.windchillPrevention
    ) {
      return false;
    }
    if (summaryMatches.waterResistance !== undefined && item.waterResistance < summaryMatches.waterResistance) return false;
    return true;
  });
}

// Generate the list of viable clothing items.
const viableItems = getRecommendedByCategory();

console.log("[ClothesListGen] Viable item count:", viableItems.length);

export const clothesListGenOutput = {
  summaryMatches,
  viableItems,
};
