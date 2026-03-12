// Fetch weather data from Open-Meteo with user-configured coordinates.
import { fetchWeatherApi } from "openmeteo";
// Read config from disk.
import { readFile } from "node:fs/promises";
// Resolve config path reliably from project root.
import path from "node:path";
// Read, parse, and validate the weather config JSON.
async function loadConfig() {
    const configPath = path.resolve(process.cwd(), "config", "weather.config.json");
    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.latitude !== "number" || typeof parsed.longitude !== "number") {
        throw new Error("config/weather.config.json must include numeric latitude and longitude.");
    }
    return parsed;
}
// Load API configuration and build the request parameters.
const config = await loadConfig();
// Default hourly fields if not supplied by config.
const params = {
    latitude: config.latitude,
    longitude: config.longitude,
    hourly: config.hourly ?? [
        "relative_humidity_2m",
        "precipitation_probability",
        "precipitation",
        "wind_speed_10m",
        "temperature_2m",
        "wind_gusts_10m",
    ],
};
// Open-Meteo base endpoint.
const url = "https://api.open-meteo.com/v1/forecast";
// Execute the API request.
const responses = await fetchWeatherApi(url, params);
// Process first location. Add a for-loop for multiple locations or weather models.
const response = responses[0];
// Read response metadata.
const latitude = response.latitude();
const longitude = response.longitude();
const elevation = response.elevation();
const utcOffsetSeconds = response.utcOffsetSeconds();
// Print metadata so users can verify the coordinates.
console.log(`\nCoordinates: ${latitude} degN ${longitude} degE`, `\nElevation: ${elevation}m asl`, `\nTimezone difference to GMT+0: ${utcOffsetSeconds}s`);
// Pull the hourly block from the response.
const hourly = response.hourly();
// Note: The order of weather variables in the URL query and the indices below need to match!
// Shape raw arrays into a simple JSON-friendly object.
const weatherData = {
    hourly: {
        time: Array.from({ length: (Number(hourly.timeEnd()) - Number(hourly.time())) / hourly.interval() }, (_, i) => new Date((Number(hourly.time()) + i * hourly.interval() + utcOffsetSeconds) * 1000)),
        relative_humidity_2m: hourly.variables(0).valuesArray(),
        precipitation_probability: hourly.variables(1).valuesArray(),
        precipitation: hourly.variables(2).valuesArray(),
        wind_speed_10m: hourly.variables(3).valuesArray(),
        temperature_2m: hourly.variables(4).valuesArray(),
        wind_gusts_10m: hourly.variables(5).valuesArray(),
    },
};
// The 'weatherData' object now contains a simple structure, with arrays of datetimes and weather information.
console.log("\nHourly data:\n", weatherData.hourly);
