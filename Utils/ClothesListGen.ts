// Core outfit recommendation engine driven by weather summary + user prefs.
// Loads data lazily so the launcher can seed config/data before first use.
import { readFileSync } from "node:fs";
import path from "node:path";
// Map weather summary to preference targets.
import { MatchSummaryToPrefs } from "./PrefMatching.js";
// Numeric layer constants used by clothing data.
import { Layers } from "./Layers.js";
// Preference types used by the matcher.
import type { PreferencesConfig, SummaryPrefMatches } from "./PrefMatching.js";
// Daily summary type and data snapshot.
import type { DaySummary } from "./OMSummary.js";
import { getConfigPath, getDataPath } from "./paths.js";

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

// Root container for the clothing data JSON.
type ClothingDatabase = {
  version: string;
  notes: string;
  items: ClothingItem[];
};

// Plan for a layer based on target warmth.
export type WarmthLayerPlan = {
  minWarmth?: number;
  maxWarmth?: number;
  top?: ClothingItem;
  bottom?: ClothingItem;
  overlayer?: ClothingItem;
  layerAverage?: number;
};

// Output shape for the final outfit selection.
export type LayeredOutfit = {
  inner?: { top?: ClothingItem; bottom?: ClothingItem };
  outer?: { top?: ClothingItem; bottom?: ClothingItem };
  overlayer?: ClothingItem;
  shoes?: ClothingItem;
  socks?: ClothingItem;
  items: ClothingItem[];
};

// Top-level output used by the UI and CLI.
export type ClothesListGenOutput = {
  summaryMatches: SummaryPrefMatches;
  viableItems: ClothingItem[];
  warmthInnerLayerPlan: WarmthLayerPlan;
  warmthLayerPlan: WarmthLayerPlan;
  layeredOutfit: LayeredOutfit;
};

// Small JSON loader for runtime data files.
const readJson = <T>(filePath: string): T => {
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
};

// Cache loaded files to avoid repeated disk I/O.
let cachedDatabase: ClothingDatabase | null = null;
let cachedSummary: DaySummary | null = null;
let cachedPreferences: PreferencesConfig | null = null;

// Ensure config/data snapshots are loaded before generating output.
const ensureDataLoaded = () => {
  if (!cachedDatabase) {
    cachedDatabase = readJson<ClothingDatabase>(getDataPath("clothing.json"));
  }
  if (!cachedSummary) {
    cachedSummary = readJson<DaySummary>(getDataPath("om_summary.json"));
  }
  if (!cachedPreferences) {
    cachedPreferences = readJson<PreferencesConfig>(getConfigPath("preferences.config.json"));
  }
};

// Accessors keep call sites clean.
const getDatabase = () => {
  ensureDataLoaded();
  return cachedDatabase as ClothingDatabase;
};

const getSummary = () => {
  ensureDataLoaded();
  return cachedSummary as DaySummary;
};

const getPreferences = () => {
  ensureDataLoaded();
  return cachedPreferences as PreferencesConfig;
};

// Options for controlling runtime behavior.
type GenerateOptions = {
  verbose?: boolean;
};

// Pick the item with warmth closest to the target.
function pickClosestByWarmth(items: ClothingItem[], target: number): ClothingItem | undefined {
  if (items.length === 0) return undefined;
  return items.reduce((best, current) => {
    if (!best) return current;
    const bestDiff = Math.abs(best.warmth - target);
    const currentDiff = Math.abs(current.warmth - target);
    if (currentDiff < bestDiff) return current;
    if (currentDiff > bestDiff) return best;
    return current.warmth > best.warmth ? current : best;
  });
}

// Pick the best warmth match while excluding already-selected items.
function pickClosestByWarmthExcluding(
  items: ClothingItem[],
  target: number,
  excludeIds: Set<string>,
): ClothingItem | undefined {
  const filtered = items.filter((item) => !excludeIds.has(item.id));
  return pickClosestByWarmth(filtered, target);
}

// Prefer items from specified layers if they exist.
const filterByLayerPreference = (
  items: ClothingItem[],
  preferredLayers: number[],
): ClothingItem[] => {
  const preferred = items.filter((item) => preferredLayers.includes(item.layer));
  return preferred.length > 0 ? preferred : items;
};

// Prefer items that have complement relationships within the current selection.
const preferComplementMatches = (items: ClothingItem[]): ClothingItem[] => {
  const byKey = new Map<string, ClothingItem[]>();
  for (const item of items) {
    const key = `${item.layer}:${item.category}`;
    const list = byKey.get(key) ?? [];
    list.push(item);
    byKey.set(key, list);
  }

  const allIds = new Set(items.map((item) => item.id));
  const complementScore = (item: ClothingItem): number => {
    let score = 0;
    for (const id of item.complements ?? []) {
      if (allIds.has(id)) score += 1;
    }
    for (const other of items) {
      if (other.id === item.id) continue;
      if ((other.complements ?? []).includes(item.id)) score += 1;
    }
    return score;
  };

  const preferred: ClothingItem[] = [];
  for (const candidates of byKey.values()) {
    if (candidates.length === 1) {
      preferred.push(candidates[0]);
      continue;
    }

    let best = candidates[0];
    let bestScore = complementScore(best);
    for (const candidate of candidates.slice(1)) {
      const score = complementScore(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    preferred.push(best);
  }

  return preferred;
};

// Resolve an item from the normalized list to keep output consistent.
const resolveItemForSlot = (
  normalizedItems: ClothingItem[],
  original?: ClothingItem,
): ClothingItem | undefined => {
  if (!original) return undefined;
  const exact = normalizedItems.find((item) => item.id === original.id);
  if (exact) return exact;
  return normalizedItems.find(
    (item) => item.category === original.category && item.layer === original.layer,
  );
};

// Build a warmer outer layer plan for the max temperature target.
function buildWarmthLayerForMaxWarmth(
  database: ClothingDatabase,
  maxWarmth?: number,
): WarmthLayerPlan {
  if (maxWarmth === undefined) return {};

  const tops = filterByLayerPreference(
    database.items.filter((item) => item.category === "top"),
    [Layers.Mid],
  );
  const bottoms = filterByLayerPreference(
    database.items.filter((item) => item.category === "bottom"),
    [Layers.Mid],
  );
  const outers = filterByLayerPreference(
    database.items.filter((item) => item.category === "outerwear"),
    [Layers.Outer],
  );

  const top = pickClosestByWarmth(tops, maxWarmth);
  if (!top) return { maxWarmth };

  const bottomTarget = top.warmth > maxWarmth ? maxWarmth - 1 : maxWarmth;
  const bottom = pickClosestByWarmth(bottoms, bottomTarget);
  const layerPieces = [top, bottom].filter((item): item is ClothingItem => Boolean(item));
  const layerAverage =
    layerPieces.length > 0
      ? layerPieces.reduce((sum, item) => sum + item.warmth, 0) / layerPieces.length
      : undefined;
  let overlayer: ClothingItem | undefined;

  if (layerAverage !== undefined && layerAverage < maxWarmth) {
    const overlaysMeetingTarget = outers.filter(
      (outer) => {
        const totalWarmth =
          layerPieces.reduce((sum, item) => sum + item.warmth, 0) + outer.warmth;
        const averageWarmth = totalWarmth / (layerPieces.length + 1);
        return Math.ceil(averageWarmth) >= maxWarmth;
      },
    );
    overlayer =
      overlaysMeetingTarget.sort((a, b) => a.warmth - b.warmth)[0] ??
      outers.sort((a, b) => b.warmth - a.warmth)[0];
  }

  return {
    maxWarmth,
    top,
    bottom,
    overlayer,
    layerAverage,
  };
}

// Build a lighter inner layer plan for the min temperature target.
function buildWarmthLayerForMinWarmth(
  database: ClothingDatabase,
  minWarmth?: number,
): WarmthLayerPlan {
  if (minWarmth === undefined) return {};

  const tops = filterByLayerPreference(
    database.items.filter((item) => item.category === "top"),
    [Layers.Main],
  );
  const bottoms = filterByLayerPreference(
    database.items.filter((item) => item.category === "bottom"),
    [Layers.Main],
  );

  const top = pickClosestByWarmth(tops, minWarmth);
  if (!top) return { minWarmth };

  const bottomTarget = top.warmth > minWarmth ? minWarmth - 1 : minWarmth;
  const bottom = pickClosestByWarmth(bottoms, bottomTarget);
  if (!bottom) return { minWarmth, top };

  const layerAverage = (top.warmth + bottom.warmth) / 2;

  return {
    minWarmth,
    top,
    bottom,
    layerAverage,
  };
}

// Choose shoes based on wind/water requirements.
function pickBestShoes(items: ClothingItem[], summaryMatches: SummaryPrefMatches): ClothingItem | undefined {
  const shoes = items.filter((item) => item.category === "shoes");
  if (shoes.length === 0) return undefined;

  const targetWater = summaryMatches.waterResistance ?? 0;
  const targetWind = summaryMatches.windchillPrevention ?? 0;

  const candidates = shoes.filter(
    (item) => item.waterResistance >= targetWater && item.windchillPrevention >= targetWind,
  );

  const pool = candidates.length > 0 ? candidates : shoes;
  return pool.sort((a, b) => b.warmth - a.warmth)[0];
}

// Always add socks once it is too cold for thongs.
function pickSocks(items: ClothingItem[], summaryMatches: SummaryPrefMatches): ClothingItem | undefined {
  const warmthMin = summaryMatches.warmthMinTemp ?? 0;
  // "Too cold for thongs" starts at warmth band 4 (<= ~22C), so always add socks from there down.
  const requiresSocks = warmthMin >= 4;
  if (!requiresSocks) return undefined;

  const socks = items.filter(
    (item) => item.layer === Layers.Base && item.category === "accessory",
  );
  return socks.sort((a, b) => b.warmth - a.warmth)[0];
}

// Merge inner/outer selections and prevent duplicates.
function buildLayeredOutfit(
  database: ClothingDatabase,
  innerPlan: WarmthLayerPlan,
  outerPlan: WarmthLayerPlan,
  summaryMatches: SummaryPrefMatches,
): LayeredOutfit {
  const tops = database.items.filter((item) => item.category === "top");
  const bottoms = database.items.filter((item) => item.category === "bottom");
  const outers = database.items.filter((item) => item.category === "outerwear");
  const outerTopCandidates = filterByLayerPreference(tops, [Layers.Mid]);
  const outerBottomCandidates = filterByLayerPreference(bottoms, [Layers.Mid]);
  const outerwearCandidates = filterByLayerPreference(outers, [Layers.Outer]);
  const shoes = pickBestShoes(database.items, summaryMatches);
  const socks = pickSocks(database.items, summaryMatches);

  const items: ClothingItem[] = [];
  const addUnique = (item?: ClothingItem) => {
    if (!item) return;
    if (items.some((existing) => existing.id === item.id)) return;
    items.push(item);
  };

  const inner = { top: innerPlan.top, bottom: innerPlan.bottom };
  const usedIds = new Set<string>();
  if (inner.top) usedIds.add(inner.top.id);
  if (inner.bottom) usedIds.add(inner.bottom.id);

  let outerTop = outerPlan.top;
  let outerBottom = outerPlan.bottom;

  if (outerTop && usedIds.has(outerTop.id)) {
    const target = outerPlan.maxWarmth ?? outerTop.warmth;
    outerTop = pickClosestByWarmthExcluding(outerTopCandidates, target, usedIds);
  }
  if (outerTop) usedIds.add(outerTop.id);

  if (outerBottom && usedIds.has(outerBottom.id)) {
    const target = outerPlan.maxWarmth ?? outerBottom.warmth;
    outerBottom = pickClosestByWarmthExcluding(outerBottomCandidates, target, usedIds);
  }
  if (outerBottom) usedIds.add(outerBottom.id);

  let overlayer = outerPlan.overlayer;
  if (overlayer && usedIds.has(overlayer.id)) {
    const target = outerPlan.maxWarmth ?? overlayer.warmth;
    overlayer = pickClosestByWarmthExcluding(outerwearCandidates, target, usedIds);
  }
  if (overlayer) usedIds.add(overlayer.id);

  const outer = { top: outerTop, bottom: outerBottom };

  addUnique(inner.top);
  addUnique(inner.bottom);
  addUnique(outer.top);
  addUnique(outer.bottom);
  addUnique(overlayer);
  addUnique(shoes);
  addUnique(socks);

  const normalizedItems = preferComplementMatches(items);
  const resolvedInnerTop = resolveItemForSlot(normalizedItems, inner.top);
  const resolvedInnerBottom = resolveItemForSlot(normalizedItems, inner.bottom);
  const resolvedOuterTop = resolveItemForSlot(normalizedItems, outer.top);
  const resolvedOuterBottom = resolveItemForSlot(normalizedItems, outer.bottom);
  const resolvedOverlayer = resolveItemForSlot(normalizedItems, overlayer);
  const resolvedShoes = resolveItemForSlot(normalizedItems, shoes);
  const resolvedSocks = resolveItemForSlot(normalizedItems, socks);

  return {
    inner: { top: resolvedInnerTop, bottom: resolvedInnerBottom },
    outer: { top: resolvedOuterTop, bottom: resolvedOuterBottom },
    overlayer: resolvedOverlayer,
    shoes: resolvedShoes,
    socks: resolvedSocks,
    items: normalizedItems,
  };
}

// Filter items that match the computed weather-driven requirements.
function getRecommendedByCategory(
  database: ClothingDatabase,
  summaryMatches: SummaryPrefMatches,
  category?: string,
): ClothingItem[] {
  return database.items.filter((item) => {
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

// Main entry point for generating outfit suggestions.
export function generateClothesList(options: GenerateOptions = {}): ClothesListGenOutput {
  const { verbose = false } = options;

  const database = getDatabase();
  const OMSummary = getSummary();
  const preferencesConfig = getPreferences();

  // Convert weather summary into preference targets (warmth, wind, rain).
  const summaryMatches = MatchSummaryToPrefs(OMSummary, preferencesConfig);
  if (verbose) {
    console.log("[ClothesListGen] Summary matches:", summaryMatches);
  }

  // Generate the list of viable clothing items.
  const viableItems = getRecommendedByCategory(database, summaryMatches);
  if (verbose) {
    console.log("[ClothesListGen] Viable item count:", viableItems.length);
  }

  const warmthInnerLayerPlan = buildWarmthLayerForMinWarmth(database, summaryMatches.warmthMinTemp);
  const warmthLayerPlan = buildWarmthLayerForMaxWarmth(database, summaryMatches.warmthMaxTemp);
  const layeredOutfit = buildLayeredOutfit(database, warmthInnerLayerPlan, warmthLayerPlan, summaryMatches);

  if (verbose) {
    console.log("[ClothesListGen] Inner layer plan:", warmthInnerLayerPlan);
    console.log("[ClothesListGen] Outer layer plan:", warmthLayerPlan);
    console.log("[ClothesListGen] Layered outfit:", layeredOutfit);
    console.log(
      "[ClothesListGen] Layered outfit items:",
      layeredOutfit.items.map((item) => `${item.name} (${item.category}, layer ${item.layer})`),
    );
  }

  return {
    summaryMatches,
    viableItems,
    warmthInnerLayerPlan,
    warmthLayerPlan,
    layeredOutfit,
  };
}

// Run in standalone mode when invoked directly via tsx.
const isMain = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  const base = path.basename(entry);
  return base === "ClothesListGen.ts" || base === "ClothesListGen.js";
})();

if (isMain) {
  generateClothesList({ verbose: true });
}
