// js/modules/api/traffic.js - Real-time traffic via TomTom Flow + HERE Incidents APIs

import { SimpleCache } from '../utils/cache.js';

const trafficCache = new SimpleCache(2 * 60 * 1000);    // 2 minutes
const incidentsCache = new SimpleCache(2 * 60 * 1000);  // 2 minutes

/**
 * Returns the TomTom API key from config (window global or empty string).
 * @returns {string}
 */
function getTomTomKey() {
    return (typeof window !== 'undefined' && window.TOMTOM_API_KEY) || '';
}

/**
 * Returns the HERE API key from config (window global or empty string).
 * @returns {string}
 */
function getHereKey() {
    return (typeof window !== 'undefined' && window.HERE_API_KEY) || '';
}

/**
 * Fetches real-time traffic flow data from TomTom Traffic Flow API.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{currentSpeed:number, freeFlowSpeed:number, confidence:number, roadClosure:boolean}|null>}
 */
export async function getRealTimeTraffic(lat, lng) {
    const key = `traffic-${lat.toFixed(3)}-${lng.toFixed(3)}`;
    const cached = trafficCache.get(key);
    if (cached) return cached;

    const apiKey = getTomTomKey();
    if (!apiKey) {
        console.warn('⚠️ TomTom API ключ не задан, реальный трафик недоступен');
        return null;
    }

    try {
        const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lng}&key=${apiKey}`;
        const startTime = performance.now();
        const response = await fetch(url);
        const elapsed = Math.round(performance.now() - startTime);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        console.log(`✅ getRealTimeTraffic TomTom (${elapsed}мс)`);

        const fsd = data.flowSegmentData;
        if (!fsd) throw new Error('Нет данных flowSegmentData');

        const result = {
            currentSpeed:   Math.round(fsd.currentSpeed || 0),
            freeFlowSpeed:  Math.round(fsd.freeFlowSpeed || 0),
            confidence:     fsd.confidence || 0,
            roadClosure:    fsd.roadClosure || false
        };

        trafficCache.set(key, result);
        return result;
    } catch (err) {
        console.warn('⚠️ TomTom Traffic API недоступен, используем приблизительные данные:', err.message);
        return null;
    }
}

/**
 * Fetches traffic incidents from HERE Traffic Incidents API.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<Array<{type:string, description:string, distance:number, severity:string}>|null>}
 */
export async function getTrafficIncidents(lat, lng) {
    const key = `incidents-${lat.toFixed(3)}-${lng.toFixed(3)}`;
    const cached = incidentsCache.get(key);
    if (cached) return cached;

    const apiKey = getHereKey();
    if (!apiKey) {
        console.warn('⚠️ HERE API ключ не задан, инциденты трафика недоступны');
        return null;
    }

    try {
        const url = `https://data.traffic.hereapi.com/v7/incidents?in=circle:${lat},${lng};r=1000&apiKey=${apiKey}`;
        const startTime = performance.now();
        const response = await fetch(url);
        const elapsed = Math.round(performance.now() - startTime);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        console.log(`✅ getTrafficIncidents HERE (${elapsed}мс)`);

        const typeLabels = {
            'ACCIDENT':      'ДТП',
            'ROAD_CLOSURE':  'Перекрытие',
            'CONSTRUCTION':  'Строительство',
            'CONGESTION':    'Затор',
            'ROAD_HAZARD':   'Опасность'
        };
        const severityLabels = {
            'CRITICAL': 'critical',
            'MAJOR':    'major',
            'MINOR':    'minor',
            'LOWEST':   'low'
        };

        const incidents = (data.results || []).map(item => {
            const props = item.incidentDetails || {};
            return {
                type:        typeLabels[props.type] || props.type || 'Инцидент',
                description: props.description?.value || '',
                distance:    Math.round((item.location?.length || 0)),
                severity:    severityLabels[props.criticality] || 'minor'
            };
        }).slice(0, 5); // max 5 incidents

        incidentsCache.set(key, incidents);
        return incidents;
    } catch (err) {
        console.warn('⚠️ HERE Traffic Incidents API недоступен:', err.message);
        return null;
    }
}
