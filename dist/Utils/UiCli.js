import { generateClothesList } from "./ClothesListGen.js";
import omSummaryData from "../data/om_summary.json" with { type: "json" };
const summary = omSummaryData;
const { layeredOutfit, summaryMatches } = generateClothesList({ verbose: false });
const termWidth = Math.max(process.stdout.columns ?? 108, 90);
const contentWidth = Math.max(termWidth - 10, 80);
const leftWidth = Math.max(24, Math.floor(contentWidth * 0.3));
const middleWidth = Math.max(28, Math.floor(contentWidth * 0.35));
const rightWidth = Math.max(28, contentWidth - leftWidth - middleWidth);
const borderLine = "+" +
    "-".repeat(leftWidth + 2) +
    "+" +
    "-".repeat(middleWidth + 2) +
    "+" +
    "-".repeat(rightWidth + 2) +
    "+";
const divider = (width) => "-".repeat(Math.min(width, 20));
const formatTemp = (value) => `${value.toFixed(1)} C`;
const formatPct = (value) => `${value.toFixed(0)}%`;
const formatMm = (value) => `${value.toFixed(1)} mm`;
const formatKmh = (value) => `${value.toFixed(1)} km/h`;
const pad = (value, width) => {
    if (value.length === width)
        return value;
    if (value.length < width)
        return value + " ".repeat(width - value.length);
    if (width <= 3)
        return value.slice(0, width);
    return value.slice(0, width - 3) + "...";
};
const wrapText = (text, width) => {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return [" "];
    const lines = [];
    let current = "";
    for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length <= width) {
            current = next;
            continue;
        }
        if (current)
            lines.push(current);
        if (word.length > width) {
            lines.push(word.slice(0, width - 1) + "-");
            current = word.slice(width - 1);
        }
        else {
            current = word;
        }
    }
    if (current)
        lines.push(current);
    return lines;
};
const normalizeLines = (lines, width) => lines.flatMap((line) => wrapText(line, width));
const weatherLines = [
    "WEATHER",
    `Date: ${summary.date}`,
    `Max Temp: ${formatTemp(summary.daylightTemperatureC.max)}`,
    `Min Temp: ${formatTemp(summary.daylightTemperatureC.min)}`,
    divider(leftWidth),
    `Rain chance: ${formatPct(summary.dailyRain.maxChancePct)}`,
    `Rain depth: ${formatMm(summary.dailyRain.totalDepthMm)}`,
    `Rain rate: ${formatMm(summary.dailyRain.maxStrengthMmPerHour)}/h`,
    divider(leftWidth),
    `Wind STR: ${formatKmh(summary.daylightWindSpeedKmh.max)}`,
    `Gust STR: ${formatKmh(summary.daylightWindGustKmh.max)}`,
];
const groupByLayer = (items) => {
    const grouped = new Map();
    for (const item of items) {
        const list = grouped.get(item.layer) ?? [];
        list.push(item);
        grouped.set(item.layer, list);
    }
    return grouped;
};
const layerLabels = [
    { layer: 0, label: "Layer 0" },
    { layer: 1, label: "Layer 1" },
    { layer: 2, label: "Layer 2" },
    { layer: 3, label: "Layer 3" },
    { layer: 4, label: "Layer 4" },
];
const itemsByLayer = groupByLayer(layeredOutfit.items);
const layerLines = ["LAYERS"];
for (const entry of layerLabels) {
    const items = itemsByLayer.get(entry.layer) ?? [];
    layerLines.push(entry.label);
    if (items.length === 0) {
        layerLines.push("  -");
        continue;
    }
    const names = items.map((item) => item.name).join(", ");
    layerLines.push(`  ${names}`);
}
const outfitLines = ["CLOTHING"];
const slotLines = [
    ["Inner Top", layeredOutfit.inner?.top],
    ["Inner Bottom", layeredOutfit.inner?.bottom],
    ["Outer Top", layeredOutfit.outer?.top],
    ["Outer Bottom", layeredOutfit.outer?.bottom],
    ["Overlayer", layeredOutfit.overlayer],
    ["Shoes", layeredOutfit.shoes],
    ["Socks", layeredOutfit.socks],
];
for (const [label, item] of slotLines) {
    outfitLines.push(`${label}: ${item?.name ?? "-"}`);
}
const aggregateStats = (items) => {
    if (items.length === 0) {
        return {
            warmthAvg: 0,
            windMax: 0,
            waterMax: 0,
            breathAvg: 0,
        };
    }
    const warmthAvg = items.reduce((sum, item) => sum + item.warmth, 0) / items.length;
    const windMax = Math.max(...items.map((item) => item.windchillPrevention));
    const waterMax = Math.max(...items.map((item) => item.waterResistance));
    const breathAvg = items.reduce((sum, item) => sum + item.breathability, 0) / items.length;
    return {
        warmthAvg,
        windMax,
        waterMax,
        breathAvg,
    };
};
const stats = aggregateStats(layeredOutfit.items);
outfitLines.push(divider(rightWidth));
outfitLines.push("STATS");
outfitLines.push(`Warmth avg: ${stats.warmthAvg.toFixed(1)} (target ${summaryMatches.warmthMinTemp}-${summaryMatches.warmthMaxTemp})`);
outfitLines.push(`Wind max: ${stats.windMax.toFixed(1)} (target ${summaryMatches.windchillPrevention ?? 0})`);
outfitLines.push(`Water max: ${stats.waterMax.toFixed(1)} (target ${summaryMatches.waterResistance ?? 0})`);
outfitLines.push(`Breath avg: ${stats.breathAvg.toFixed(1)}`);
const leftBlock = normalizeLines(weatherLines, leftWidth);
const middleBlock = normalizeLines(layerLines, middleWidth);
const rightBlock = normalizeLines(outfitLines, rightWidth);
const height = Math.max(leftBlock.length, middleBlock.length, rightBlock.length);
const getLine = (lines, index) => (index < lines.length ? lines[index] : "");
const rows = [borderLine];
for (let i = 0; i < height; i += 1) {
    const left = pad(getLine(leftBlock, i), leftWidth);
    const middle = pad(getLine(middleBlock, i), middleWidth);
    const right = pad(getLine(rightBlock, i), rightWidth);
    rows.push(`| ${left} | ${middle} | ${right} |`);
}
rows.push(borderLine);
const title = `SkyWardrobe CLI - ${summary.date}`;
const titleLine = title.length <= borderLine.length
    ? title.padStart(Math.floor((borderLine.length + title.length) / 2)).padEnd(borderLine.length)
    : title;
console.log("\n" + titleLine);
console.log(rows.join("\n") + "\n");
