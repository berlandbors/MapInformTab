// js/modules/api/usgs.js - USGS seismic data

import { escapeHtml } from '../utils/helpers.js';

export async function getSeismicData(lat, lng) {
    try {
        const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat}&longitude=${lng}&maxradiuskm=500&limit=5&orderby=time`;
        const response = await fetch(url);
        const data = await response.json();
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
