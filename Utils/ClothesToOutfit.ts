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

  const top = items.find((item) => item.category === "top");
  const bottom = items.find((item) => item.category === "bottom");
  const outer = items.find((item) => item.category === "outerwear");

  if (top && bottom) {
    const warmthValues = [top.warmth, bottom.warmth];
    if (outer) warmthValues.push(outer.warmth);
    const averageWarmth = warmthValues.reduce((sum, value) => sum + value, 0) / warmthValues.length;

    if (
      summaryMatches.warmthMinTemp !== undefined &&
      averageWarmth < summaryMatches.warmthMinTemp
    ) {
      return false;
    }

    if (
      summaryMatches.warmthMaxTemp !== undefined &&
      averageWarmth > summaryMatches.warmthMaxTemp
    ) {
      return false;
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

    return {
      base: item,
      complements,
      items: [item, ...complements],
    };
  })
  .filter((outfit) => outfit.complements.length > 0)
  .filter((outfit) => isCompleteOutfit(outfit.items))
  .filter((outfit) => hasUniqueCategoryPerLayer(outfit.items))
  .filter((outfit) => meetsWeatherConditions(outfit.items));

// Remove duplicate outfits by normalizing item IDs.
export const complementOutfits: ComplementOutfit[] = (() => {
  const seen = new Set<string>();
  const deduped: ComplementOutfit[] = [];

  for (const outfit of rawComplementOutfits) {
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
