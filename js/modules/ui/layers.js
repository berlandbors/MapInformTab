// js/modules/ui/layers.js - Map layers management

import { map, markers, layerGroups, connectionLines, layerStates } from '../../state.js';
import { deviceType } from '../../state.js';

export function initLayers() {
    layerGroups.earthquakes = L.layerGroup().addTo(map);
}

export function clearLayers() {
    Object.values(layerGroups).forEach(lg => { if (lg) lg.clearLayers(); });
    connectionLines.forEach(line => map.removeLayer(line));
    connectionLines.splice(0);
    const el = document.getElementById('count-earthquakes');
    if (el) el.textContent = '0';
}

export function showEarthquakeLayer(mainLat, mainLng, seismicEvents) {
    if (!layerGroups.earthquakes) return;
    layerGroups.earthquakes.clearLayers();

    seismicEvents.forEach(event => {
        if (event.lat == null || event.lng == null) return;

        const mag = parseFloat(event.magnitude) || 0;
        const color = mag >= 6 ? '#ff4444' : mag >= 4 ? '#ff6600' : '#ffaa00';
        const radius = Math.max(8, mag * 5);

        const circle = L.circleMarker([event.lat, event.lng], {
            radius, fillColor: color, color: color,
            weight: 2, opacity: 0.9, fillOpacity: 0.5
        });

        circle.bindPopup(`
            <div class="popup-title">🔴 ЗЕМЛЕТРЯСЕНИЕ</div>
            <div class="popup-section">
                <div class="popup-row">
                    <span class="popup-label">Магнитуда:</span>
                    <span class="popup-value"><span class="magnitude-indicator">M${event.magnitude}</span></span>
                </div>
                <div class="popup-row">
                    <span class="popup-label">Место:</span>
                    <span class="popup-value">${event.place}</span>
                </div>
                <div class="popup-row">
                    <span class="popup-label">Глубина:</span>
                    <span class="popup-value">${event.depth} км</span>
                </div>
                <div class="popup-row">
                    <span class="popup-label">Время:</span>
                    <span class="popup-value">${event.time}</span>
                </div>
            </div>
        `);

        layerGroups.earthquakes.addLayer(circle);

        const line = L.polyline([[mainLat, mainLng], [event.lat, event.lng]], {
            color: color, weight: 1, opacity: 0.4, dashArray: '5, 5'
        });
        connectionLines.push(line);
        map.addLayer(line);
    });

    const countEl = document.getElementById('count-earthquakes');
    if (countEl) countEl.textContent = seismicEvents.length;
}

export function toggleLayer(layerName) {
    layerStates[layerName] = !layerStates[layerName];
    const lg = layerGroups[layerName];
    if (!lg) return;
    if (layerStates[layerName]) {
        if (!map.hasLayer(lg)) map.addLayer(lg);
        if (layerName === 'earthquakes') {
            connectionLines.forEach(line => { if (!map.hasLayer(line)) map.addLayer(line); });
        }
    } else {
        if (map.hasLayer(lg)) map.removeLayer(lg);
        if (layerName === 'earthquakes') {
            connectionLines.forEach(line => { if (map.hasLayer(line)) map.removeLayer(line); });
        }
    }
}

export function updateLayersForLocation(lat, lng, fullData) {
    connectionLines.forEach(line => map.removeLayer(line));
    connectionLines.splice(0);

    showEarthquakeLayer(lat, lng, fullData.seismicEvents || []);

    Object.keys(layerStates).forEach(name => {
        const lg = layerGroups[name];
        if (!lg) return;
        if (layerStates[name] && !map.hasLayer(lg)) map.addLayer(lg);
        else if (!layerStates[name] && map.hasLayer(lg)) map.removeLayer(lg);
        if (name === 'earthquakes' && !layerStates[name]) {
            connectionLines.forEach(line => { if (map.hasLayer(line)) map.removeLayer(line); });
        }
    });
}

export function focusOnLayer(layerName) {
    if (deviceType === 'smartphone-portrait') {
        // switchMobileTab is called from main.js via window
        if (window.switchMobileTab) window.switchMobileTab('map');
    }
    if (!layerStates[layerName]) {
        toggleLayer(layerName);
        const cb = document.getElementById(`toggle-${layerName}`);
        if (cb) cb.checked = true;
    }
    const lg = layerGroups[layerName];
    if (lg) {
        try {
            const bounds = lg.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50] });
            }
        } catch (e) {
            console.debug('focusOnLayer: no bounds for layer', layerName, e.message);
        }
    }
}
