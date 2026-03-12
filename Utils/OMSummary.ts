import { fetchWeatherApi } from "openmeteo";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Input config for selecting the forecast location.
type WeatherConfig = {
  latitude: number;
  longitude: number;
};

// Final aggregated metrics returned by this summary script.
export type DaySummary = {
  date: string;
  sunrise: string;
  sunset: string;
  daylightTemperatureC: { min: number; max: number };
  daylightHumidityPct: { average: number };
  dailyRain: { maxChancePct: number; maxStrengthMmPerHour: number; totalDepthMm: number };
  daylightWindSpeedKmh: { min: number; max: number };
  daylightWindGustKmh: { max: number };
};

// Load latitude/longitude from config/weather.config.json.
async function loadConfig(): Promise<WeatherConfig> {
  console.log("[OMSummary] Loading weather config...");
  const configPath = path.resolve(process.cwd(), "config", "weather.config.json");
  const raw = await readFile(configPath, "utf-8");
  const parsed = JSON.parse(raw) as WeatherConfig;

  if (typeof parsed.latitude !== "number" || typeof parsed.longitude !== "number") {
    throw new Error("config/weather.config.json must include numeric latitude and longitude.");
  }

  return parsed;
}

// Utility to get min and max from numeric arrays.
function minMax(values: number[]): { min: number; max: number } {
  return { min: Math.min(...values), max: Math.max(...values) };
}

// Utility to compute arithmetic mean for numeric arrays.
function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Round output values for cleaner JSON output.
function toRounded(value: number): number {
  return Number(value.toFixed(2));
}

// Open-Meteo may omit a variable or return a null backing array, so validate
// each hourly variable before converting it into a normal number[].
function getHourlyValues(hourlyData: NonNullable<typeof hourly>, index: number, variableName: string): number[] {
  const variable = hourlyData.variables(index);
  const values = variable?.valuesArray();
  if (!values) {
    throw new Error(`Missing ${variableName} values in hourly API response.`);
  }

  return Array.from(values);
}

// Daily sunrise/sunset values are exposed as int64 timestamps rather than a
// float array, so this helper validates and extracts one day-specific value.
function getDailyInt64Value(dailyData: NonNullable<typeof daily>, index: number, dayIndex: number, variableName: string): bigint {
  const variable = dailyData.variables(index);
  const value = variable?.valuesInt64(dayIndex);
  if (value === null || value === undefined) {
    throw new Error(`Missing ${variableName} value for date index ${dayIndex}.`);
  }

  return value;
}

// Build and run the Open-Meteo request using configured location.
const config = await loadConfig();
console.log("[OMSummary] Config loaded:", config);

const params = {
  latitude: config.latitude,
  longitude: config.longitude,
  hourly: [
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation_probability",
    "precipitation",
    "wind_speed_10m",
    "wind_gusts_10m",
  ],
  daily: ["sunrise", "sunset"],
  timezone: "auto",
};

const url = "https://api.open-meteo.com/v1/forecast";
console.log("[OMSummary] Fetching weather data...");
const responses = await fetchWeatherApi(url, params);
const response = responses[0];
console.log("[OMSummary] Weather API response received.");

// Prepare hourly arrays for weather variables we need to aggregate.
const utcOffsetSeconds = response.utcOffsetSeconds();

const hourly = response.hourly();
if (!hourly) {
  throw new Error("Missing hourly weather data in API response.");
}
console.log("[OMSummary] Hourly data loaded.");

const hourlyLength = (Number(hourly.timeEnd()) - Number(hourly.time())) / hourly.interval();
const hourlyTimes = Array.from({ length: hourlyLength }, (_, i) =>
  new Date((Number(hourly.time()) + i * hourly.interval() + utcOffsetSeconds) * 1000),
);

// Read the requested hourly variables in the same order they were requested in params.hourly.
const temperature = getHourlyValues(hourly, 0, "temperature_2m");
const humidity = getHourlyValues(hourly, 1, "relative_humidity_2m");
const rainChance = getHourlyValues(hourly, 2, "precipitation_probability");
const rainStrength = getHourlyValues(hourly, 3, "precipitation");
const windSpeed = getHourlyValues(hourly, 4, "wind_speed_10m");
const windGust = getHourlyValues(hourly, 5, "wind_gusts_10m");

// Use the first available hourly row to determine the target summary day.
const targetDate = hourlyTimes[0].toISOString().slice(0, 10);

// Read daily sunrise/sunset and match the same target date.
const daily = response.daily();
if (!daily) {
  throw new Error("Missing daily weather data in API response.");
}
console.log("[OMSummary] Daily data loaded.");

const dailyLength = (Number(daily.timeEnd()) - Number(daily.time())) / daily.interval();
const dailyDates = Array.from({ length: dailyLength }, (_, i) =>
  new Date((Number(daily.time()) + i * daily.interval() + utcOffsetSeconds) * 1000)
    .toISOString()
    .slice(0, 10),
);

const dayIndex = dailyDates.findIndex((d) => d === targetDate);
if (dayIndex === -1) {
  throw new Error(`Could not match daily sunrise/sunset data for date ${targetDate}.`);
}

// Pull sunrise/sunset timestamps for the matched day and convert them to Date objects.
const sunriseRaw = getDailyInt64Value(daily, 0, dayIndex, "sunrise");
const sunsetRaw = getDailyInt64Value(daily, 1, dayIndex, "sunset");

const sunrise = new Date(Number(sunriseRaw) * 1000 + utcOffsetSeconds * 1000);
const sunset = new Date(Number(sunsetRaw) * 1000 + utcOffsetSeconds * 1000);

// Build index sets for full-day rows and daylight-only rows.
const dayIndexes = hourlyTimes
  .map((t, index) => ({ index, date: t.toISOString().slice(0, 10) }))
  .filter((x) => x.date === targetDate)
  .map((x) => x.index);

const daylightIndexes = hourlyTimes
  .map((t, index) => ({ index, time: t }))
  .filter((x) => x.time >= sunrise && x.time <= sunset)
  .map((x) => x.index);

if (dayIndexes.length === 0 || daylightIndexes.length === 0) {
  throw new Error("No hourly rows found for selected day/daylight window.");
}
console.log("[OMSummary] Daylight window computed.");

// Slice raw hourly arrays down to the windows needed by each metric.
const daylightTemperature = daylightIndexes.map((i) => temperature[i]);
const daylightHumidity = daylightIndexes.map((i) => humidity[i]);
const daylightWindSpeed = daylightIndexes.map((i) => windSpeed[i]);
const daylightWindGust = daylightIndexes.map((i) => windGust[i]);

const dayRainChance = dayIndexes.map((i) => rainChance[i]);
const dayRainStrength = dayIndexes.map((i) => rainStrength[i]);
const dayRainTotal = dayRainStrength.reduce((sum, value) => sum + value, 0);

// Aggregate filtered weather data into the final summary payload.
const summary: DaySummary = {
  date: targetDate,
  sunrise: sunrise.toISOString(),
  sunset: sunset.toISOString(),
  daylightTemperatureC: {
    min: toRounded(minMax(daylightTemperature).min),
    max: toRounded(minMax(daylightTemperature).max),
  },
  daylightHumidityPct: {
    average: toRounded(average(daylightHumidity)),
  },
  dailyRain: {
    maxChancePct: toRounded(Math.max(...dayRainChance)),
    maxStrengthMmPerHour: toRounded(Math.max(...dayRainStrength)),
    totalDepthMm: toRounded(dayRainTotal),
  },
  daylightWindSpeedKmh: {
    min: toRounded(minMax(daylightWindSpeed).min),
    max: toRounded(minMax(daylightWindSpeed).max),
  },
  daylightWindGustKmh: {
    max: toRounded(Math.max(...daylightWindGust)),
  },
};

// Print structured JSON for downstream app/API usage.
const outputJson = JSON.stringify(summary, null, 2);
console.log(outputJson);
console.log("[OMSummary] Summary generated.");

// Optional: persist the summary to data/om_summary.json when requested.
if (process.argv.includes("--write")) {
  const outputPath = path.resolve(process.cwd(), "data", "om_summary.json");
  console.log(`[OMSummary] Writing summary to ${outputPath}`);
  await writeFile(outputPath, `${outputJson}\n`, "utf-8");
}
