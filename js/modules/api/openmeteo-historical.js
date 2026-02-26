// js/modules/api/openmeteo-historical.js - Historical precipitation and soil wetness via Open-Meteo

import { SimpleCache } from '../utils/cache.js';

const precipCache = new SimpleCache(10 * 60 * 1000);   // 10 minutes
const wetnessCache = new SimpleCache(10 * 60 * 1000);  // 10 minutes

/**
 * Fetches real historical precipitation totals for the last 1h/3h/6h/24h
 * using Open-Meteo's past_hours parameter.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{last1h:number, last3h:number, last6h:number, last24h:number}|null>}
 */
export async function getHistoricalPrecipitation(lat, lng) {
    const key = `hist-precip-${lat.toFixed(3)}-${lng.toFixed(3)}`;
    const cached = precipCache.get(key);
    if (cached) return cached;

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation&past_hours=24&forecast_days=0&timezone=auto`;
        const startTime = performance.now();
        const response = await fetch(url);
        const elapsed = Math.round(performance.now() - startTime);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        console.log(`✅ getHistoricalPrecipitation (${elapsed}мс)`);

        const hourly = data.hourly?.precipitation;
        if (!hourly || hourly.length === 0) throw new Error('Нет почасовых данных об осадках');

        // Sum over last N hours (array is ordered newest-last)
        const sum = (n) => hourly.slice(-n).reduce((acc, v) => acc + (v || 0), 0);
        const result = {
            last1h:  +sum(1).toFixed(1),
            last3h:  +sum(3).toFixed(1),
            last6h:  +sum(6).toFixed(1),
            last24h: +sum(24).toFixed(1)
        };

        precipCache.set(key, result);
        return result;
    } catch (err) {
        console.warn('⚠️ Historical Precipitation API недоступен, используем приблизительные данные:', err.message);
        return null;
    }
}

/**
 * Fetches last 7 days of precipitation and temperature to assess historical soil wetness.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{last7days:number, avgTemp:number, soilSaturation:'high'|'normal'|'low'}|null>}
 */
export async function getHistoricalWetness(lat, lng) {
    const key = `hist-wetness-${lat.toFixed(3)}-${lng.toFixed(3)}`;
    const cached = wetnessCache.get(key);
    if (cached) return cached;

    try {
        const now = new Date();
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() - 1); // yesterday (archive has ~1-day lag)
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 6); // 7 days total

        const fmt = (d) => d.toISOString().slice(0, 10);
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${fmt(startDate)}&end_date=${fmt(endDate)}&daily=precipitation_sum,temperature_2m_mean&timezone=auto`;

        const startTime = performance.now();
        const response = await fetch(url);
        const elapsed = Math.round(performance.now() - startTime);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        console.log(`✅ getHistoricalWetness (${elapsed}мс)`);

        const precips = data.daily?.precipitation_sum || [];
        const temps = data.daily?.temperature_2m_mean || [];

        const last7days = +precips.reduce((a, v) => a + (v || 0), 0).toFixed(1);
        const avgTemp = temps.length > 0
            ? +(temps.reduce((a, v) => a + (v || 0), 0) / temps.length).toFixed(1)
            : 10;

        const soilSaturation = last7days > 50 ? 'high' : last7days < 10 ? 'low' : 'normal';

        const result = { last7days, avgTemp, soilSaturation };
        wetnessCache.set(key, result);
        return result;
    } catch (err) {
        console.warn('⚠️ Historical Wetness API недоступен, используем приблизительные данные:', err.message);
        return null;
    }
}
