import { generateClothesList } from "./ClothesListGen.js";
import omSummaryData from "../data/om_summary.json" with { type: "json" };
// Load summary snapshot and computed outfit.
const summary = omSummaryData;
const { layeredOutfit, summaryMatches } = generateClothesList({ verbose: false });
// Terminal sizing and column widths.
const termWidth = Math.max(process.stdout.columns ?? 108, 90);
const contentWidth = Math.max(termWidth - 10, 80);
const leftWidth = Math.max(24, Math.floor(contentWidth * 0.3));
const middleWidth = Math.max(28, Math.floor(contentWidth * 0.35));
const rightWidth = Math.max(28, contentWidth - leftWidth - middleWidth);
// Outer border line for the table layout.
const borderLine = "+" +
    "-".repeat(leftWidth + 2) +
    "+" +
    "-".repeat(middleWidth + 2) +
    "+" +
    "-".repeat(rightWidth + 2) +
    "+";
// Short divider to visually split sections.
const divider = (width) => "-".repeat(Math.min(width, 20));
// Format helpers for numeric output.
const formatTemp = (value) => `${value.toFixed(1)} C`;
const formatPct = (value) => `${value.toFixed(0)}%`;
const formatMm = (value) => `${value.toFixed(1)} mm`;
const formatKmh = (value) => `${value.toFixed(1)} km/h`;
// Pad or truncate to fit fixed-width columns.
const pad = (value, width) => {
    if (value.length === width)
        return value;
    if (value.length < width)
        return value + " ".repeat(width - value.length);
    if (width <= 3)
        return value.slice(0, width);
    return value.slice(0, width - 3) + "...";
};
// Wrap text on word boundaries for narrow columns.
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
// Expand each input line into wrapped output lines.
const normalizeLines = (lines, width) => lines.flatMap((line) => wrapText(line, width));
// Weather column content.
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
// Build the middle column (replacing layers) with the old right column content.
const buildSummaryLines = () => {
    const outfitLines = ["LAYERS"];
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
    outfitLines.push(divider(middleWidth));
    outfitLines.push("STATS");
    outfitLines.push(`Warmth avg: ${stats.warmthAvg.toFixed(1)} (target ${summaryMatches.warmthMinTemp}-${summaryMatches.warmthMaxTemp})`);
    outfitLines.push(`Wind max: ${stats.windMax.toFixed(1)} (target ${summaryMatches.windchillPrevention ?? 0})`);
    outfitLines.push(`Water max: ${stats.waterMax.toFixed(1)} (target ${summaryMatches.waterResistance ?? 0})`);
    outfitLines.push(`Breath avg: ${stats.breathAvg.toFixed(1)}`);
    return outfitLines;
};
// Build the right column showing per-item stats and allow cycling.
const buildItemDetailLines = (item, index, total) => {
    const lines = ["ITEM DETAIL"];
    if (!item) {
        lines.push("No items available");
        return lines;
    }
    lines.push(`Item ${index + 1} of ${total}`);
    lines.push(divider(rightWidth));
    lines.push(`Name: ${item.name}`);
    lines.push(`Category: ${item.category}`);
    lines.push(`Layer: ${item.layer}`);
    lines.push(`Warmth: ${item.warmth}`);
    lines.push(`Wind: ${item.windchillPrevention}`);
    lines.push(`Water: ${item.waterResistance}`);
    lines.push(`Breath: ${item.breathability}`);
    lines.push(`Style: ${item.style.join(", ") || "-"}`);
    lines.push(`Activity: ${item.activity.join(", ") || "-"}`);
    lines.push(`Formality: ${item.formality}`);
    lines.push(divider(rightWidth));
    lines.push("Controls:");
    lines.push("  [N]/Right  Next");
    lines.push("  [P]/Left   Prev");
    lines.push("  [Q]/Esc    Quit");
    return lines;
};
const itemList = layeredOutfit.items;
let itemIndex = 0;
// ANSI color helpers (legible by default).
const supportsColor = Boolean(process.stdout.isTTY);
const ansi = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    white: "\x1b[97m",
    yellow: "\x1b[93m",
};
const colorText = (text, code) => supportsColor ? `${code}${text}${ansi.reset}` : text;
const rgbText = (text, r, g, b) => supportsColor ? `\x1b[38;2;${r};${g};${b}m${text}${ansi.reset}` : text;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const colorNumberGradient = (value, min, max, text) => {
    if (!supportsColor)
        return text;
    const safeMin = Math.min(min, max - 0.0001);
    const t = clamp((value - safeMin) / (max - safeMin), 0, 1);
    const r = Math.round(40 + t * (230 - 40));
    const g = Math.round(110 + t * (70 - 110));
    const b = Math.round(230 + t * (70 - 230));
    return rgbText(text, r, g, b);
};
const isHeading = (raw) => {
    const trimmed = raw.trim().toUpperCase();
    return ["WEATHER", "LAYERS", "ITEM DETAIL", "STATS", "CONTROLS:"]
        .includes(trimmed);
};
const styleTitle = (text) => colorText(text, `${ansi.bold}${ansi.white}`);
const styleHeading = (text) => colorText(text, ansi.white);
const getScaleForLine = (raw, totalItems) => {
    const lower = raw.toLowerCase();
    if (lower.includes("temp"))
        return { min: -5, max: 40 };
    if (lower.includes("wind") || lower.includes("gust"))
        return { min: 0, max: 80 };
    if (lower.includes("rain") || lower.includes("water") || lower.includes("mm"))
        return { min: 0, max: 50 };
    if (lower.includes("warmth") || lower.includes("breath"))
        return { min: 0, max: 10 };
    if (lower.includes("layer"))
        return { min: 0, max: 4 };
    if (lower.includes("item") && lower.includes("of"))
        return { min: 1, max: Math.max(totalItems, 1) };
    return { min: 0, max: 100 };
};
const colorizeNumbers = (line, raw, scheme, totalItems) => {
    if (!supportsColor)
        return line;
    const scale = scheme === "right" ? getScaleForLine(raw, totalItems) : { min: 0, max: 100 };
    return line.replace(/-?\d+(?:\.\d+)?/g, (match) => {
        const value = Number(match);
        if (Number.isNaN(value))
            return match;
        if (scheme === "left") {
            return colorText(match, ansi.yellow);
        }
        return colorNumberGradient(value, scale.min, scale.max, match);
    });
};
const styleColumn = (raw, padded, scheme, totalItems) => {
    if (isHeading(raw))
        return styleHeading(padded);
    return colorizeNumbers(padded, raw, scheme, totalItems);
};
const render = () => {
    const leftBlock = normalizeLines(weatherLines, leftWidth);
    const middleBlock = normalizeLines(buildSummaryLines(), middleWidth);
    const currentItem = itemList[itemIndex];
    const rightBlock = normalizeLines(buildItemDetailLines(currentItem, itemIndex, itemList.length), rightWidth);
    const height = Math.max(leftBlock.length, middleBlock.length, rightBlock.length);
    const getLine = (lines, index) => (index < lines.length ? lines[index] : "");
    const rows = [borderLine];
    for (let i = 0; i < height; i += 1) {
        const leftRaw = getLine(leftBlock, i);
        const middleRaw = getLine(middleBlock, i);
        const rightRaw = getLine(rightBlock, i);
        const leftPadded = pad(leftRaw, leftWidth);
        const middlePadded = pad(middleRaw, middleWidth);
        const rightPadded = pad(rightRaw, rightWidth);
        const left = styleColumn(leftRaw, leftPadded, "left", itemList.length);
        const middle = styleColumn(middleRaw, middlePadded, "right", itemList.length);
        const right = styleColumn(rightRaw, rightPadded, "right", itemList.length);
        rows.push(`| ${left} | ${middle} | ${right} |`);
    }
    rows.push(borderLine);
    const title = `SkyWardrobe CLI - ${summary.date}`;
    const titleLine = title.length <= borderLine.length
        ? title.padStart(Math.floor((borderLine.length + title.length) / 2)).padEnd(borderLine.length)
        : title;
    console.clear();
    console.log("\n" + styleTitle(titleLine));
    console.log(rows.join("\n") + "\n");
};
const supportsInput = Boolean(process.stdin.isTTY);
if (!supportsInput) {
    render();
    process.exit(0);
}
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");
const moveIndex = (delta) => {
    if (itemList.length === 0)
        return;
    itemIndex = (itemIndex + delta + itemList.length) % itemList.length;
};
process.stdin.on("data", (key) => {
    if (key === "\u0003" || key.toLowerCase() === "q" || key === "\u001b") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        console.log("\nExited.");
        process.exit(0);
    }
    if (key === "\u001b[D" || key.toLowerCase() === "p") {
        moveIndex(-1);
        render();
        return;
    }
    if (key === "\u001b[C" || key.toLowerCase() === "n") {
        moveIndex(1);
        render();
    }
});
render();
