// js/modules/api/elevation.js - Slope calculation via Open-Meteo Elevation API

import { SimpleCache } from '../utils/cache.js';

const elevationCache = new SimpleCache(24 * 60 * 60 * 1000); // 24 hours

/**
 * Offset a latitude by approximately `distanceM` metres northward.
 * @param {number} lat
 * @param {number} distanceM
 * @returns {number}
 */
function offsetLat(lat, distanceM) {
    return lat + (distanceM / 111111);
}

/**
 * Offset a longitude by approximately `distanceM` metres eastward.
 * @param {number} lat - Reference latitude (for cosine correction)
 * @param {number} lng
 * @param {number} distanceM
 * @returns {number}
 */
function offsetLng(lat, lng, distanceM) {
    return lng + (distanceM / (111111 * Math.cos(lat * Math.PI / 180)));
}

/**
 * Fetches terrain slope at the given location using Open-Meteo Elevation API.
 * Queries 5 points (center + N/S/E/W at 50 m) and computes the maximum slope.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{elevation:number, slope:number}|null>}
 */
export async function getElevationAndSlope(lat, lng) {
    const key = `elevation-${lat.toFixed(3)}-${lng.toFixed(3)}`;
    const cached = elevationCache.get(key);
    if (cached) return cached;

    try {
        const D = 50; // metres
        const points = [
            { lat, lng },                            // center
            { lat: offsetLat(lat, D),  lng },        // N
            { lat: offsetLat(lat, -D), lng },        // S
            { lat, lng: offsetLng(lat, lng, D) },    // E
            { lat, lng: offsetLng(lat, lng, -D) }    // W
        ];

        const lats = points.map(p => p.lat.toFixed(6)).join(',');
        const lngs = points.map(p => p.lng.toFixed(6)).join(',');
        const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;

        const startTime = performance.now();
        const response = await fetch(url);
        const elapsed = Math.round(performance.now() - startTime);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        console.log(`✅ getElevationAndSlope (${elapsed}мс)`);

        const elevations = data.elevation;
        if (!elevations || elevations.length < 5) throw new Error('Недостаточно данных высоты');

        const center = elevations[0];
        const maxDeltaH = Math.max(
            Math.abs(elevations[1] - center),
            Math.abs(elevations[2] - center),
            Math.abs(elevations[3] - center),
            Math.abs(elevations[4] - center)
        );

        const slope = +(Math.atan(maxDeltaH / D) * (180 / Math.PI)).toFixed(1);
        const result = { elevation: Math.round(center), slope };

        elevationCache.set(key, result);
        return result;
    } catch (err) {
        console.warn('⚠️ Elevation API недоступен, используем значение по умолчанию:', err.message);
        return null;
    }
}
