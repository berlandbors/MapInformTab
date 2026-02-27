// js/modules/api/openmeteo-airquality.js - Open-Meteo Air Quality API

import { SimpleCache } from '../utils/cache.js';
import { retryWithBackoff } from '../utils/retry.js';

const airQualityCache = new SimpleCache(30 * 60 * 1000); // 30 minutes

/**
 * Fetches air quality data from Open-Meteo Air Quality API
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<object|null>} Air quality data or null if unavailable
 */
export async function getAirQuality(lat, lng) {
    const key = `airquality-${lat.toFixed(3)}-${lng.toFixed(3)}`;
    const cached = airQualityCache.get(key);
    if (cached) return cached;

    try {
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality?` +
            `latitude=${lat}&longitude=${lng}` +
            `&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,` +
            `dust,uv_index,ammonia,alder_pollen,birch_pollen,grass_pollen,olive_pollen,ragweed_pollen` +
            `&hourly=pm10,pm2_5,ozone` +
            `&timezone=auto&forecast_days=3`;

        const startTime = performance.now();
        const response = await retryWithBackoff(async () => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        });
        const elapsed = Math.round(performance.now() - startTime);
        console.log(`✅ getAirQuality (${elapsed}мс)`);

        const current = response.current;

        const result = {
            current: {
                pm10: Math.round(current.pm10 || 0),
                pm25: Math.round(current.pm2_5 || 0),
                carbonMonoxide: Math.round(current.carbon_monoxide || 0),
                nitrogenDioxide: Math.round(current.nitrogen_dioxide || 0),
                sulphurDioxide: Math.round(current.sulphur_dioxide || 0),
                ozone: Math.round(current.ozone || 0),
                ammonia: Math.round(current.ammonia || 0),
                dust: Math.round(current.dust || 0),
                uvIndex: current.uv_index || 0,
                alderPollen: Math.round(current.alder_pollen || 0),
                birchPollen: Math.round(current.birch_pollen || 0),
                grassPollen: Math.round(current.grass_pollen || 0),
                olivePollen: Math.round(current.olive_pollen || 0),
                ragweedPollen: Math.round(current.ragweed_pollen || 0),
                aqi: calculateAQI(current)
            },
            hourly: {
                time: response.hourly?.time || [],
                pm10: response.hourly?.pm10 || [],
                pm25: response.hourly?.pm2_5 || [],
                ozone: response.hourly?.ozone || []
            }
        };

        airQualityCache.set(key, result);
        return result;
    } catch (err) {
        console.warn('⚠️ Air Quality API недоступен:', err.message);
        return null;
    }
}

/**
 * Calculate Air Quality Index based on PM2.5
 * @param {object} data - Current air quality data
 * @returns {number} AQI value (0-500)
 */
function calculateAQI(data) {
    const pm25 = data.pm2_5 || 0;

    if (pm25 <= 12) return Math.round(pm25 * 4.17);
    if (pm25 <= 35.4) return Math.round(50 + (pm25 - 12) * 2.1);
    if (pm25 <= 55.4) return Math.round(100 + (pm25 - 35.4) * 2.5);
    if (pm25 <= 150.4) return Math.round(150 + (pm25 - 55.4) * 1.05);
    if (pm25 <= 250.4) return Math.round(200 + (pm25 - 150.4));
    return Math.round(300 + (pm25 - 250.4) * 0.8);
}

/**
 * Get AQI category and color
 * @param {number} aqi - AQI value
 * @returns {{level: string, color: string, icon: string}} Category info
 */
export function getAQICategory(aqi) {
    if (aqi <= 50) return { level: 'Хорошо', color: '#00e400', icon: '😊' };
    if (aqi <= 100) return { level: 'Умеренно', color: '#cccc00', icon: '😐' };
    if (aqi <= 150) return { level: 'Нездоровый для чувствительных', color: '#ff7e00', icon: '😷' };
    if (aqi <= 200) return { level: 'Нездоровый', color: '#ff0000', icon: '😨' };
    if (aqi <= 300) return { level: 'Очень нездоровый', color: '#8f3f97', icon: '🤢' };
    return { level: 'Опасный', color: '#7e0023', icon: '☠️' };
}
