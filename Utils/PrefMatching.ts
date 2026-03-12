// Types sourced from the daily summary so we can map weather to prefs.
import type { DaySummary } from "./OMSummary.js";

// Maps a warmth score to a temperature range.
export type WarmthBand = {
  warmth: number;
  min: number;
  max: number;
};

// Maps windchill prevention to a wind speed range.
export type WindchillBand = {
  windchillPrevention: number;
  min: number;
  max: number;
};

// Maps water resistance to a rainfall depth range.
export type WaterResistanceBand = {
  waterResistance: number;
  min: number;
  max: number;
};

// User preferences and band mappings.
export type PreferencesConfig = {
  version: string;
  notes?: string[];
  temperatureUnit: string;
  gender: string;
  fallbackMatches?: {
    warmthMaxTemp: number;
    warmthMinTemp: number;
    windchillPrevention: number;
    waterResistance: number;
  };
  warmthToTemperatureRangeC: WarmthBand[];
  windchillPreventionToWindSpeedKmh: WindchillBand[];
  waterResistanceToRainDepthMm: WaterResistanceBand[];
};

// Find the band whose min/max range includes the provided value.
function matchBand<T extends { min: number; max: number }>(value: number, bands: T[]): T | undefined {
  return bands.find((band) => value >= band.min && value <= band.max);
}

// Match a temperature to a warmth band.
export function TempWarmthMatch(tempC: number, prefs: PreferencesConfig): WarmthBand | undefined {
  return matchBand(tempC, prefs.warmthToTemperatureRangeC);
}

// Match wind speed to a windchill prevention band.
export function WindResMatch(
  windSpeedKmh: number,
  prefs: PreferencesConfig,
): WindchillBand | undefined {
  return matchBand(windSpeedKmh, prefs.windchillPreventionToWindSpeedKmh);
}

// Match rain depth to a water resistance band.
export function RainResMatch(
  rainDepthMm: number,
  prefs: PreferencesConfig,
): WaterResistanceBand | undefined {
  return matchBand(rainDepthMm, prefs.waterResistanceToRainDepthMm);
}

// Compact output for the matching step.
export type SummaryPrefMatches = {
  warmthMaxTemp: number | undefined;
  warmthMinTemp: number | undefined;
  windchillPrevention: number | undefined;
  waterResistance: number | undefined;
};

// Convert the daily summary into preferred targets for outfit picking.
export function MatchSummaryToPrefs(summary: DaySummary, prefs: PreferencesConfig): SummaryPrefMatches {
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
