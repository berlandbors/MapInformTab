// js/modules/api/usgs.js - USGS seismic data

import { escapeHtml } from '../utils/helpers.js';
import { retryWithBackoff } from '../utils/retry.js';

/**
 * Fetches recent seismic events near a location from the USGS API.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<{ seismicEvents: Array }>}
 */
export async function getSeismicData(lat, lng) {
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat}&longitude=${lng}&maxradiuskm=500&limit=5&orderby=time`;
    console.log(`🌍 GET ${url}`);
    try {
        const data = await retryWithBackoff(async () => {
            const startTime = performance.now();
            const response = await fetch(url);
            const elapsed = Math.round(performance.now() - startTime);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            console.log(`✅ getSeismicData (${elapsed}мс)`);
            return response.json();
        });
        const events = (data.features || []).map(f => ({
            magnitude: (f.properties.mag != null) ? f.properties.mag.toFixed(1) : '?',
            depth: (f.geometry.coordinates[2] != null) ? Math.round(f.geometry.coordinates[2]) : '?',
            place: escapeHtml(f.properties.place || 'Нет данных'),
            time: new Date(f.properties.time).toLocaleString('ru-RU'),
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0]
        }));
        return { seismicEvents: events };
    } catch (error) {
        console.error('Ошибка получения сейсмических данных:', error);
        return { seismicEvents: [] };
    }
}
