//So this needs to make decisions based on the data from the filtered summary
//And use the user's preferences to make a recommendation for the day
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MatchSummaryToPrefs } from "./PrefMatching.js";
import { Layers } from "./Layers.js";
import type { PreferencesConfig, SummaryPrefMatches } from "./PrefMatching.js";
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

export type WarmthLayerPlan = {
  minWarmth?: number;
  maxWarmth?: number;
  top?: ClothingItem;
  bottom?: ClothingItem;
  overlayer?: ClothingItem;
  layerAverage?: number;
};

export type LayeredOutfit = {
  inner?: { top?: ClothingItem; bottom?: ClothingItem };
  outer?: { top?: ClothingItem; bottom?: ClothingItem };
  overlayer?: ClothingItem;
  shoes?: ClothingItem;
  socks?: ClothingItem;
  items: ClothingItem[];
};

export type ClothesListGenOutput = {
  summaryMatches: SummaryPrefMatches;
  viableItems: ClothingItem[];
  warmthInnerLayerPlan: WarmthLayerPlan;
  warmthLayerPlan: WarmthLayerPlan;
  layeredOutfit: LayeredOutfit;
};

const clothingDatabase = clothingData as ClothingDatabase;

const OMSummary = omSummaryData as DaySummary;
const preferencesConfig = preferencesData as PreferencesConfig;

type GenerateOptions = {
  verbose?: boolean;
};

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

function pickClosestByWarmthExcluding(
  items: ClothingItem[],
  target: number,
  excludeIds: Set<string>,
): ClothingItem | undefined {
  const filtered = items.filter((item) => !excludeIds.has(item.id));
  return pickClosestByWarmth(filtered, target);
}

const filterByLayerPreference = (
  items: ClothingItem[],
  preferredLayers: number[],
): ClothingItem[] => {
  const preferred = items.filter((item) => preferredLayers.includes(item.layer));
  return preferred.length > 0 ? preferred : items;
};

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
function buildWarmthLayerForMaxWarmth(maxWarmth?: number): WarmthLayerPlan {
  if (maxWarmth === undefined) return {};

  const tops = filterByLayerPreference(
    clothingDatabase.items.filter((item) => item.category === "top"),
    [Layers.Mid],
  );
  const bottoms = filterByLayerPreference(
    clothingDatabase.items.filter((item) => item.category === "bottom"),
    [Layers.Mid],
  );
  const outers = filterByLayerPreference(
    clothingDatabase.items.filter((item) => item.category === "outerwear"),
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
function buildWarmthLayerForMinWarmth(minWarmth?: number): WarmthLayerPlan {
  if (minWarmth === undefined) return {};

  const tops = filterByLayerPreference(
    clothingDatabase.items.filter((item) => item.category === "top"),
    [Layers.Main],
  );
  const bottoms = filterByLayerPreference(
    clothingDatabase.items.filter((item) => item.category === "bottom"),
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

// Combine inner/outer plans while avoiding duplicate items.
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

function buildLayeredOutfit(
  innerPlan: WarmthLayerPlan,
  outerPlan: WarmthLayerPlan,
  summaryMatches: SummaryPrefMatches,
): LayeredOutfit {
  const tops = clothingDatabase.items.filter((item) => item.category === "top");
  const bottoms = clothingDatabase.items.filter((item) => item.category === "bottom");
  const outers = clothingDatabase.items.filter((item) => item.category === "outerwear");
  const outerTopCandidates = filterByLayerPreference(tops, [Layers.Mid]);
  const outerBottomCandidates = filterByLayerPreference(bottoms, [Layers.Mid]);
  const outerwearCandidates = filterByLayerPreference(outers, [Layers.Outer]);
  const shoes = pickBestShoes(clothingDatabase.items, summaryMatches);
  const socks = pickSocks(clothingDatabase.items, summaryMatches);

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
  summaryMatches: SummaryPrefMatches,
  category?: string,
): ClothingItem[] {
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

export function generateClothesList(options: GenerateOptions = {}): ClothesListGenOutput {
  const { verbose = false } = options;

  // Convert weather summary into preference targets (warmth, wind, rain).
  const summaryMatches = MatchSummaryToPrefs(OMSummary, preferencesConfig);
  if (verbose) {
    console.log("[ClothesListGen] Summary matches:", summaryMatches);
  }

  // Generate the list of viable clothing items.
  const viableItems = getRecommendedByCategory(summaryMatches);
  if (verbose) {
    console.log("[ClothesListGen] Viable item count:", viableItems.length);
  }

  const warmthInnerLayerPlan = buildWarmthLayerForMinWarmth(summaryMatches.warmthMinTemp);
  const warmthLayerPlan = buildWarmthLayerForMaxWarmth(summaryMatches.warmthMaxTemp);
  const layeredOutfit = buildLayeredOutfit(warmthInnerLayerPlan, warmthLayerPlan, summaryMatches);

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

const isMain =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  generateClothesList({ verbose: true });
}
