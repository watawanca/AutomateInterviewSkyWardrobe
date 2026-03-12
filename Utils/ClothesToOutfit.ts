import { clothesListGenOutput, type ClothingItem } from "./ClothesListGen.js";
import { Layers } from "./Layers.js";

export const {
  summaryMatches,
  recommended,
  warmthInnerLayerPlan,
  warmthLayerPlan,
  layeredOutfit,
} = clothesListGenOutput;

// Source items from the layered outfit plan.
const layeredItems = layeredOutfit.items ?? [];
const layeredById = new Map(layeredItems.map((item) => [item.id, item]));

type ComplementOutfit = {
  base: ClothingItem;
  complements: ClothingItem[];
  items: ClothingItem[];
};

// Below this warmth target, require socks in the minimal outfit.
const SOCKS_REQUIRED_WARMTH = 4;

const maxWarmthStackPossible = (() => {
  const byLayer = new Map<number, ClothingItem[]>();
  for (const item of layeredItems) {
    const list = byLayer.get(item.layer) ?? [];
    list.push(item);
    byLayer.set(item.layer, list);
  }

  let total = 0;
  for (const items of byLayer.values()) {
    const maxWarmth = items.reduce((max, item) => Math.max(max, item.warmth), 0);
    total += maxWarmth;
  }

  return total === 0 ? undefined : total;
})();

const getStackedWarmth = (items: ClothingItem[]): number => {
  const byLayer = new Map<number, ClothingItem[]>();
  for (const item of items) {
    const list = byLayer.get(item.layer) ?? [];
    list.push(item);
    byLayer.set(item.layer, list);
  }

  let total = 0;
  for (const layerItems of byLayer.values()) {
    const layerAverage =
      layerItems.reduce((sum, item) => sum + item.warmth, 0) / layerItems.length;
    total += layerAverage;
  }

  return total;
};

const pickFirstByIds = (
  candidates: ClothingItem[],
  preferredIds: Set<string>,
): ClothingItem | undefined => {
  const preferred = candidates.find((item) => preferredIds.has(item.id));
  return preferred ?? candidates[0];
};

const completeOutfit = (
  items: ClothingItem[],
  preferredIds: Set<string>,
): ClothingItem[] | null => {
  const result = [...items];

  const addIfMissing = (category: string, layer: number) => {
    if (result.some((item) => item.category === category && item.layer === layer)) return;
    const candidates = layeredItems.filter(
      (item) => item.category === category && item.layer === layer,
    );
    const pick = pickFirstByIds(candidates, preferredIds);
    if (pick) result.push(pick);
  };

  addIfMissing("top", Layers.Main);
  addIfMissing("bottom", Layers.Main);
  addIfMissing("shoes", Layers.Outer);

  const warmthMin = summaryMatches.warmthMinTemp ?? 0;
  const requiresSocks = warmthMin <= SOCKS_REQUIRED_WARMTH;
  if (requiresSocks) {
    const hasSocks = result.some(
      (item) => item.layer === Layers.Base && item.category === "accessory",
    );
    if (!hasSocks) {
      const sockCandidates = layeredItems.filter(
        (item) => item.layer === Layers.Base && item.category === "accessory",
      );
      const socks = pickFirstByIds(sockCandidates, preferredIds);
      if (!socks) return null;
      result.push(socks);
    }
  }

  return result;
};

const normalizeUniquePerLayerCategory = (
  items: ClothingItem[],
  preferredIds: Set<string>,
): ClothingItem[] => {
  const byKey = new Map<string, ClothingItem[]>();

  for (const item of items) {
    const key = `${item.layer}:${item.category}`;
    const list = byKey.get(key) ?? [];
    list.push(item);
    byKey.set(key, list);
  }

  const normalized: ClothingItem[] = [];
  for (const [_, candidates] of byKey) {
    const pick = pickFirstByIds(candidates, preferredIds);
    if (pick) normalized.push(pick);
  }

  return normalized;
};

// Enforce the minimum outfit: main-layer top/bottom + outer-layer shoes (+ socks if cold).
const isCompleteOutfit = (items: ClothingItem[]): boolean => {
  const hasTop = items.some((item) => item.category === "top" && item.layer === Layers.Main);
  const hasBottom = items.some((item) => item.category === "bottom" && item.layer === Layers.Main);
  const hasShoes = items.some((item) => item.category === "shoes" && item.layer === Layers.Outer);

  if (!(hasTop && hasBottom && hasShoes)) return false;

  const warmthMin = summaryMatches.warmthMinTemp ?? 0;
  const requiresSocks = warmthMin <= SOCKS_REQUIRED_WARMTH;
  if (!requiresSocks) return true;

  const hasSocks = items.some(
    (item) => item.layer === Layers.Base && item.category === "accessory",
  );
  return hasSocks;
};

// Prevent duplicates of the same category within the same layer.
const hasUniqueCategoryPerLayer = (items: ClothingItem[]): boolean => {
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.layer}:${item.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
};

// Check warmth, wind, and rain thresholds against outfit capabilities.
const meetsWeatherConditions = (items: ClothingItem[]): boolean => {
  if (items.length === 0) return false;

  const maxWindchill = Math.max(...items.map((item) => item.windchillPrevention ?? 0));
  const maxWaterResistance = Math.max(...items.map((item) => item.waterResistance ?? 0));

  if (
    summaryMatches.windchillPrevention !== undefined &&
    maxWindchill < summaryMatches.windchillPrevention
  ) {
    return false;
  }

  if (
    summaryMatches.waterResistance !== undefined &&
    maxWaterResistance < summaryMatches.waterResistance
  ) {
    return false;
  }

  if (items.length > 0) {
    const totalWarmth = getStackedWarmth(items);

    const minTarget = summaryMatches.warmthMinTemp;
    const maxTarget = summaryMatches.warmthMaxTemp;

    if (minTarget !== undefined && maxTarget !== undefined) {
      const low = Math.min(minTarget, maxTarget);
      const high = Math.max(minTarget, maxTarget);

      const canMeetLow =
        maxWarmthStackPossible === undefined || maxWarmthStackPossible >= low;
      if (canMeetLow && totalWarmth < low) {
        return false;
      }

      if (totalWarmth > high) {
        return false;
      }
    }
  }

  return true;
};

// Build candidate outfits based on complement relationships.
const rawComplementOutfits: ComplementOutfit[] = layeredItems
  .map((item) => {
    const complements = (item.complements ?? [])
      .map((id) => layeredById.get(id))
      .filter((match): match is ClothingItem => Boolean(match));

    const preferredIds = new Set<string>([item.id, ...complements.map((c) => c.id)]);
    const completedItems = completeOutfit([item, ...complements], preferredIds);
    if (!completedItems) return null;

    const normalizedItems = normalizeUniquePerLayerCategory(completedItems, preferredIds);

    return {
      base: item,
      complements,
      items: normalizedItems,
    };
  })
  .filter((outfit): outfit is ComplementOutfit => Boolean(outfit));

const withComplements = rawComplementOutfits.filter(
  (outfit) => outfit.complements.length > 0 || outfit.base.category === "shoes",
);
const withMinimum = withComplements.filter((outfit) => isCompleteOutfit(outfit.items));
const withUnique = withMinimum.filter((outfit) => hasUniqueCategoryPerLayer(outfit.items));
const withWeather = withUnique.filter((outfit) => meetsWeatherConditions(outfit.items));

console.log("[ClothesToOutfit] Outfit counts:", {
  layeredItems: layeredItems.length,
  raw: rawComplementOutfits.length,
  withComplements: withComplements.length,
  withMinimum: withMinimum.length,
  withUnique: withUnique.length,
  withWeather: withWeather.length,
});

// Remove duplicate outfits by normalizing item IDs.
export const complementOutfits: ComplementOutfit[] = (() => {
  const seen = new Set<string>();
  const deduped: ComplementOutfit[] = [];

  for (const outfit of withWeather) {
    const key = outfit.items
      .map((item) => item.id)
      .sort()
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(outfit);
  }

  return deduped;
})();

// Format output for console logging.
const formatOutfit = (outfit: ComplementOutfit): string => {
  const top = outfit.items.find((item) => item.category === "top");
  const bottom = outfit.items.find((item) => item.category === "bottom");
  const shoes = outfit.items.find((item) => item.category === "shoes");
  const over = outfit.items.find((item) => item.category === "outerwear");
  const other = outfit.items
    .filter(
      (item) =>
        item.category !== "top" &&
        item.category !== "bottom" &&
        item.category !== "shoes" &&
        item.category !== "outerwear",
    )
    .map((item) => item.name)
    .join(" + ");

  return `Outfit: ${top?.name ?? "None"}, ${bottom?.name ?? "None"}, ${shoes?.name ?? "None"}, ${over?.name ?? "None"}, ${
    other || "None"
  }`;
};

// Log output in console
console.log("[ClothesToOutfit] Complement outfit list:");
complementOutfits.forEach((outfit, index) => {
  const formatted = formatOutfit(outfit);
  console.log(`Outfit ${index + 1} : ${formatted.replace("Outfit: ", "")}`);
});
