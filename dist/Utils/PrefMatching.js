// Find the band whose min/max range includes the provided value.
function matchBand(value, bands) {
    return bands.find((band) => value >= band.min && value <= band.max);
}
// Match a temperature to a warmth band.
export function TempWarmthMatch(tempC, prefs) {
    return matchBand(tempC, prefs.warmthToTemperatureRangeC);
}
// Match wind speed to a windchill prevention band.
export function WindResMatch(windSpeedKmh, prefs) {
    return matchBand(windSpeedKmh, prefs.windchillPreventionToWindSpeedKmh);
}
// Match rain depth to a water resistance band.
export function RainResMatch(rainDepthMm, prefs) {
    return matchBand(rainDepthMm, prefs.waterResistanceToRainDepthMm);
}
// Convert the daily summary into preferred targets for outfit picking.
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
