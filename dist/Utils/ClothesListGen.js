//So this needs to make decisions based on the data from the filtered summary
//And use the user's preferences to make a recommendation for the day
import { MatchSummaryToPrefs } from "./PrefMatching.js";
import clothingData from "../data/clothing.json" with { type: "json" };
import omSummaryData from "../data/om_summary.json" with { type: "json" };
import preferencesData from "../config/preferences.config.json" with { type: "json" };
const clothingDatabase = clothingData;
const OMSummary = omSummaryData;
const preferencesConfig = preferencesData;
const summaryMatches = MatchSummaryToPrefs(OMSummary, preferencesConfig);
console.log("[ClothesListGen] Summary matches:", summaryMatches);
function pickClosestByWarmth(items, target) {
    if (items.length === 0)
        return undefined;
    return items.reduce((best, current) => {
        if (!best)
            return current;
        const bestDiff = Math.abs(best.warmth - target);
        const currentDiff = Math.abs(current.warmth - target);
        if (currentDiff < bestDiff)
            return current;
        if (currentDiff > bestDiff)
            return best;
        return current.warmth > best.warmth ? current : best;
    });
}
function pickClosestByWarmthExcluding(items, target, excludeIds) {
    const filtered = items.filter((item) => !excludeIds.has(item.id));
    return pickClosestByWarmth(filtered, target);
}
function buildWarmthLayerForMaxWarmth(maxWarmth) {
    if (maxWarmth === undefined)
        return {};
    const tops = clothingDatabase.items.filter((item) => item.category === "top");
    const bottoms = clothingDatabase.items.filter((item) => item.category === "bottom");
    const outers = clothingDatabase.items.filter((item) => item.category === "outerwear");
    const top = pickClosestByWarmth(tops, maxWarmth);
    if (!top)
        return { maxWarmth };
    const bottomTarget = top.warmth > maxWarmth ? maxWarmth - 1 : maxWarmth;
    const bottom = pickClosestByWarmth(bottoms, bottomTarget);
    if (!bottom)
        return { maxWarmth, top };
    const layerAverage = (top.warmth + bottom.warmth) / 2;
    let overlayer;
    if (layerAverage < maxWarmth) {
        const overlaysMeetingTarget = outers.filter((outer) => Math.ceil((top.warmth + bottom.warmth + outer.warmth) / 3) >= maxWarmth);
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
function buildWarmthLayerForMinWarmth(minWarmth) {
    if (minWarmth === undefined)
        return {};
    const tops = clothingDatabase.items.filter((item) => item.category === "top");
    const bottoms = clothingDatabase.items.filter((item) => item.category === "bottom");
    const top = pickClosestByWarmth(tops, minWarmth);
    if (!top)
        return { minWarmth };
    const bottomTarget = top.warmth > minWarmth ? minWarmth - 1 : minWarmth;
    const bottom = pickClosestByWarmth(bottoms, bottomTarget);
    if (!bottom)
        return { minWarmth, top };
    const layerAverage = (top.warmth + bottom.warmth) / 2;
    return {
        minWarmth,
        top,
        bottom,
        layerAverage,
    };
}
function buildLayeredOutfit(innerPlan, outerPlan) {
    const tops = clothingDatabase.items.filter((item) => item.category === "top");
    const bottoms = clothingDatabase.items.filter((item) => item.category === "bottom");
    const outers = clothingDatabase.items.filter((item) => item.category === "outerwear");
    const items = [];
    const addUnique = (item) => {
        if (!item)
            return;
        if (items.some((existing) => existing.id === item.id))
            return;
        items.push(item);
    };
    const inner = { top: innerPlan.top, bottom: innerPlan.bottom };
    const usedIds = new Set();
    if (inner.top)
        usedIds.add(inner.top.id);
    if (inner.bottom)
        usedIds.add(inner.bottom.id);
    let outerTop = outerPlan.top;
    let outerBottom = outerPlan.bottom;
    if (outerTop && usedIds.has(outerTop.id)) {
        const target = outerPlan.maxWarmth ?? outerTop.warmth;
        outerTop = pickClosestByWarmthExcluding(tops, target, usedIds);
    }
    if (outerTop)
        usedIds.add(outerTop.id);
    if (outerBottom && usedIds.has(outerBottom.id)) {
        const target = outerPlan.maxWarmth ?? outerBottom.warmth;
        outerBottom = pickClosestByWarmthExcluding(bottoms, target, usedIds);
    }
    if (outerBottom)
        usedIds.add(outerBottom.id);
    let overlayer = outerPlan.overlayer;
    if (overlayer && usedIds.has(overlayer.id)) {
        const target = outerPlan.maxWarmth ?? overlayer.warmth;
        overlayer = pickClosestByWarmthExcluding(outers, target, usedIds);
    }
    if (overlayer)
        usedIds.add(overlayer.id);
    const outer = { top: outerTop, bottom: outerBottom };
    addUnique(inner.top);
    addUnique(inner.bottom);
    addUnique(outer.top);
    addUnique(outer.bottom);
    addUnique(overlayer);
    return {
        inner,
        outer,
        overlayer,
        items,
    };
}
function getRecommendedByCategory(category) {
    return clothingDatabase.items.filter((item) => {
        if (category && item.category !== category)
            return false;
        const warmthTargets = [summaryMatches.warmthMinTemp, summaryMatches.warmthMaxTemp].filter((value) => value !== undefined);
        if (warmthTargets.length > 0) {
            const averageWarmth = warmthTargets.reduce((sum, value) => sum + value, 0) / warmthTargets.length;
            const minAcceptableWarmth = averageWarmth - 1;
            const maxAcceptableWarmth = averageWarmth + 1;
            if (item.warmth < minAcceptableWarmth || item.warmth > maxAcceptableWarmth)
                return false;
        }
        const isOverlayer = item.category === "outerwear" || item.layer === "outer";
        if (isOverlayer &&
            summaryMatches.windchillPrevention !== undefined &&
            item.windchillPrevention < summaryMatches.windchillPrevention) {
            return false;
        }
        if (summaryMatches.waterResistance !== undefined && item.waterResistance < summaryMatches.waterResistance)
            return false;
        return true;
    });
}
const recommended = getRecommendedByCategory();
const warmthInnerLayerPlan = buildWarmthLayerForMinWarmth(summaryMatches.warmthMinTemp);
const warmthLayerPlan = buildWarmthLayerForMaxWarmth(summaryMatches.warmthMaxTemp);
const layeredOutfit = buildLayeredOutfit(warmthInnerLayerPlan, warmthLayerPlan);
console.log("[ClothesListGen] Recommended count:", recommended.length);
console.log("[ClothesListGen] Inner layer plan:", warmthInnerLayerPlan);
console.log("[ClothesListGen] Outer layer plan:", warmthLayerPlan);
console.log("[ClothesListGen] Layered outfit:", layeredOutfit);
