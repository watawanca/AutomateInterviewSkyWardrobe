import type { DaySummary } from "./OMSummary.js";

export type WarmthBand = {
  warmth: number;
  min: number;
  max: number;
};

export type WindchillBand = {
  windchillPrevention: number;
  min: number;
  max: number;
};

export type WaterResistanceBand = {
  waterResistance: number;
  min: number;
  max: number;
};

export type PreferencesConfig = {
  version: string;
  notes?: string[];
  temperatureUnit: string;
  gender: string;
  warmthToTemperatureRangeC: WarmthBand[];
  windchillPreventionToWindSpeedKmh: WindchillBand[];
  waterResistanceToRainDepthMm: WaterResistanceBand[];
};

function matchBand<T extends { min: number; max: number }>(value: number, bands: T[]): T | undefined {
  return bands.find((band) => value >= band.min && value <= band.max) ?? bands.at(-1);
}

export function TempWarmthMatch(tempC: number, prefs: PreferencesConfig): WarmthBand | undefined {
  return matchBand(tempC, prefs.warmthToTemperatureRangeC);
}

export function WindResMatch(
  windSpeedKmh: number,
  prefs: PreferencesConfig,
): WindchillBand | undefined {
  return matchBand(windSpeedKmh, prefs.windchillPreventionToWindSpeedKmh);
}

export function RainResMatch(
  rainDepthMm: number,
  prefs: PreferencesConfig,
): WaterResistanceBand | undefined {
  return matchBand(rainDepthMm, prefs.waterResistanceToRainDepthMm);
}

export type SummaryPrefMatches = {
  warmthMaxTemp: number | undefined;
  warmthMinTemp: number | undefined;
  windchillPrevention: number | undefined;
  waterResistance: number | undefined;
};

export function MatchSummaryToPrefs(summary: DaySummary, prefs: PreferencesConfig): SummaryPrefMatches {
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
