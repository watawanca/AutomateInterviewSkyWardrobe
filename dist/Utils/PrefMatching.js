function matchBand(value, bands) {
    return bands.find((band) => value >= band.min && value <= band.max);
}
export function TempWarmthMatch(tempC, prefs) {
    return matchBand(tempC, prefs.warmthToTemperatureRangeC);
}
export function WindResMatch(windSpeedKmh, prefs) {
    return matchBand(windSpeedKmh, prefs.windchillPreventionToWindSpeedKmh);
}
export function RainResMatch(rainDepthMm, prefs) {
    return matchBand(rainDepthMm, prefs.waterResistanceToRainDepthMm);
}
export function MatchSummaryToPrefs(summary, prefs) {
    const maxTempBand = TempWarmthMatch(summary.daylightTemperatureC.max, prefs);
    const minTempBand = TempWarmthMatch(summary.daylightTemperatureC.min, prefs);
    const windBand = WindResMatch(summary.daylightWindSpeedKmh.max, prefs);
    const rainBand = RainResMatch(summary.dailyRain.totalDepthMm, prefs);
    const fallback = prefs.fallbackMatches ?? {
        warmthMaxTemp: 5,
        warmthMinTemp: 6,
        windchillPrevention: 2,
        waterResistance: 0,
    };
    return {
        warmthMaxTemp: maxTempBand?.warmth ?? fallback.warmthMaxTemp,
        warmthMinTemp: minTempBand?.warmth ?? fallback.warmthMinTemp,
        windchillPrevention: windBand?.windchillPrevention ?? fallback.windchillPrevention,
        waterResistance: rainBand?.waterResistance ?? fallback.waterResistance,
    };
}
