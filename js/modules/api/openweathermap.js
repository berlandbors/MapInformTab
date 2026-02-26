// js/modules/api/openweathermap.js - Unified OpenWeatherMap API facade

import { OWM_CONFIG, oneCallLimiter } from './owm-config.js';
import {
    getCurrentWeather as owmCurrentWeather,
    getOneCallData,
    get5DayForecast,
    getAirPollution
} from './openweather.js';

const BASE_URL = OWM_CONFIG.baseUrl;

function getApiKey() {
    return (typeof window !== 'undefined' && window.OPENWEATHER_API_KEY) || '';
}

/** Returns a URL string with the API key replaced by '***' for safe logging. */
function sanitizeUrl(url, apiKey) {
    return apiKey ? url.replace(apiKey, '***') : url;
}

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------

/**
 * Geocodes a city name to coordinates via OWM Geocoding API.
 * @param {string} cityName
 * @param {number} [limit=5]
 * @returns {Promise<Array>}
 */
export async function geocodeLocation(cityName, limit = 5) {
    const apiKey = getApiKey();
    if (!apiKey) return [];

    const params = new URLSearchParams({ q: cityName, limit, appid: apiKey });
    const url = `${BASE_URL}${OWM_CONFIG.endpoints.geocoding}?${params}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.map(item => ({
            name:       item.name,
            localNames: item.local_names || {},
            lat:        item.lat,
            lon:        item.lon,
            country:    item.country,
            state:      item.state || null
        }));
    } catch (err) {
        console.error('❌ geocodeLocation:', err.message);
        return [];
    }
}

/**
 * Reverse geocodes coordinates to a place name via OWM Reverse Geocoding API.
 * @param {number} lat
 * @param {number} lon
 * @param {number} [limit=1]
 * @returns {Promise<Array>}
 */
export async function reverseGeocode(lat, lon, limit = 1) {
    const apiKey = getApiKey();
    if (!apiKey) return [];

    const params = new URLSearchParams({ lat, lon, limit, appid: apiKey });
    const url = `${BASE_URL}${OWM_CONFIG.endpoints.reverseGeocode}?${params}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.map(item => ({
            name:       item.name,
            localNames: item.local_names || {},
            lat:        item.lat,
            lon:        item.lon,
            country:    item.country,
            state:      item.state || null
        }));
    } catch (err) {
        console.error('❌ reverseGeocode:', err.message);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Complete weather data (parallel fetch of all endpoints)
// ---------------------------------------------------------------------------

/**
 * Fetches all available OWM data in parallel with graceful degradation.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<object>}
 */
export async function getCompleteWeatherData(lat, lon) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('OpenWeatherMap API key не настроен');

    const useOneCall = OWM_CONFIG.features.useOneCallAPI && oneCallLimiter.canMakeRequest();

    const requests = [
        owmCurrentWeather(lat, lon).catch(err => { console.error('❌ currentWeather:', err.message); return null; }),
        get5DayForecast(lat, lon).catch(err => { console.error('❌ forecast5day:', err.message); return null; }),
        getAirPollution(lat, lon).catch(err => { console.error('❌ airPollution:', err.message); return null; }),
        useOneCall
            ? getOneCallData(lat, lon).then(res => { oneCallLimiter.recordRequest(); return res; })
                .catch(err => { console.error('❌ oneCall:', err.message); return null; })
            : Promise.resolve(null),
        reverseGeocode(lat, lon, 1).catch(() => [])
    ];

    const [current, forecast5, airPollution, oneCall, geocodeArr] = await Promise.all(requests);

    const geocode = geocodeArr && geocodeArr.length > 0 ? geocodeArr[0] : null;

    if (useOneCall) {
        console.log(`📊 One Call API: использовано сегодня — ${oneCallLimiter.getUsedCalls()}, осталось — ${oneCallLimiter.getRemainingCalls()}`);
    }

    return {
        current,
        forecast5,
        airPollution,
        oneCall,
        geocode,
        source: 'OpenWeatherMap',
        timestamp: Date.now()
    };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Returns status information about OWM integration.
 * @returns {object}
 */
export function getOWMStatus() {
    return {
        oneCallEnabled:   OWM_CONFIG.features.useOneCallAPI,
        oneCallRemaining: oneCallLimiter.getRemainingCalls(),
        oneCallLimit:     OWM_CONFIG.features.oneCallDailyLimit,
        cacheEnabled:     OWM_CONFIG.features.cacheEnabled
    };
}

// Re-export the lower-level functions for backwards compatibility
export { owmCurrentWeather, getOneCallData, get5DayForecast, getAirPollution };
