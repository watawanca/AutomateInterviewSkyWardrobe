//So this needs to make decisions based on the data from the filtered summary
//And use the user's preferences to make a recommendation for the day
import { MatchSummaryToPrefs } from "./PrefMatching.js";
import type { PreferencesConfig } from "./PrefMatching.js";
import clothingData from "../data/clothing.json" with { type: "json" };
import type { DaySummary } from "./OMSummary.js";
import omSummaryData from "../data/om_summary.json" with { type: "json" };
import preferencesData from "../config/preferences.config.json" with { type: "json" };

//FOR AI: Import data from clothing.json and make an item type for it.
type ClothingItem = {
  id: string;
  name: string;
  category: string;
  layer: string;
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

const summaryMatches = MatchSummaryToPrefs(OMSummary, preferencesConfig);

function getRecommendedByCategory(category?: string): ClothingItem[] {
  return clothingDatabase.items.filter((item) => {
    if (category && item.category !== category) return false;
    if (summaryMatches.warmthMaxTemp !== undefined && item.warmth < summaryMatches.warmthMaxTemp) return false;
    if (summaryMatches.warmthMinTemp !== undefined && item.warmth < summaryMatches.warmthMinTemp) return false;
    if (summaryMatches.windchillPrevention !== undefined && item.windchillPrevention < summaryMatches.windchillPrevention) return false;
    if (summaryMatches.waterResistance !== undefined && item.waterResistance < summaryMatches.waterResistance) return false;
    return true;
  });
}

const recommended = getRecommendedByCategory();
