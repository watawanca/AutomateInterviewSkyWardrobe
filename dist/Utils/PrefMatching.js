function matchBand(value, bands) {
    return bands.find((band) => value >= band.min && value <= band.max) ?? bands.at(-1);
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
    return {
        warmthMaxTemp: maxTempBand?.warmth,
        warmthMinTemp: minTempBand?.warmth,
        windchillPrevention: windBand?.windchillPrevention,
        waterResistance: rainBand?.waterResistance,
    };
}
