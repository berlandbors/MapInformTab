// js/modules/ui/map.js - Leaflet map management

import { map, markers, isMobile, setMap, setMarkerCount } from '../../state.js';
import { showError } from './loading.js';
import { clearLayers } from './layers.js';
import { getCurrentTimeForTimezone } from '../api/worldtime.js';
import { createPopupContent } from './popup.js';
import { displayFullInfo } from './modal.js';

export function initMap(scanLocationFn) {
    const initialZoom = isMobile ? 11 : 12;
    const m = L.map('map', { tap: true }).setView([55.7558, 37.6173], initialZoom);

    // Определяем базовые слои карт
    const baseLayers = {
        "OSM Standard": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }),
        "OSM HOT (Детальный)": L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors, Tiles style by HOT',
            maxZoom: 20
        }),
        "OpenTopoMap": L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors, © OpenTopoMap',
            maxZoom: 17
        }),
        "CyclOSM (Велодорожки)": L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors, © CyclOSM',
            maxZoom: 20
        }),
        "Transport Map": L.tileLayer('https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        })
    };

    // Оверлейные слои
    const overlayLayers = {
        "Надписи и номера": L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© CartoDB'
        }),
        "Погода (Температура)": L.tileLayer('https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=452c27213f9904c2140f7b65897bfbef', {
            maxZoom: 19,
            opacity: 0.5
        })
    };

    // Устанавливаем слой по умолчанию (OSM HOT - наиболее детальный)
    baseLayers["OSM HOT (Детальный)"].addTo(m);

    // Добавляем контроллер переключения слоёв
    L.control.layers(baseLayers, overlayLayers, {
        position: 'topright',
        collapsed: true
    }).addTo(m);

    // Полноэкранный режим
    if (L.Control.Fullscreen) {
        m.addControl(new L.Control.Fullscreen({
            position: 'topleft'
        }));
    }

    // Линейка для измерений
    if (L.control.ruler) {
        L.control.ruler({
            position: 'topleft',
            lengthUnit: {
                display: 'км',
                decimal: 2,
                factor: 0.001
            }
        }).addTo(m);
    }

    // Координатная сетка
    if (L.latlngGraticule) {
        L.latlngGraticule({
            showLabel: true,
            color: '#777',
            weight: 0.5,
            fontColor: '#555'
        }).addTo(m);
    }

    // Мини-карта (обзор)
    if (L.Control.MiniMap) {
        const miniMapLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 13
        });
        new L.Control.MiniMap(miniMapLayer, {
            toggleDisplay: true,
            minimized: false,
            position: 'bottomright'
        }).addTo(m);
    }

    setMap(m);

    m.on('click', async function(e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        if (scanLocationFn) await scanLocationFn(lat, lng);
    });

    return m;
}

export function createMarker(lat, lng, data) {
    const m = map;
    if (!m) return;

    const marker = L.marker([lat, lng]).addTo(m);

    const popupContent = createPopupContent(data);
    marker.bindPopup(popupContent, {
        maxWidth: 400,
        minWidth: isMobile ? 280 : 350,
        closeButton: true,
        autoClose: false,
        autoPan: true,
        className: 'custom-popup'
    });

    marker.on('click', function() {
        displayFullInfo(data);
    });

    setTimeout(() => { marker.openPopup(); }, 100);

    markers.push({ marker, data });
}

export function clearMarkers() {
    const m = map;
    if (m) {
        markers.forEach(function(item) {
            if (item && item.marker) {
                m.removeLayer(item.marker);
            } else if (item instanceof L.Layer) {
                m.removeLayer(item);
            }
        });
    }
    markers.length = 0;
    setMarkerCount(0);

    clearLayers();

    const content = document.getElementById('infoContent');
    if (content) {
        content.innerHTML = `
            <div class="no-selection">
                ▼ КЛИКНИТЕ НА КАРТУ ▼<br><br>
                [ ОЖИДАНИЕ КООРДИНАТ... ]<br><br>
                Система готова к сканированию<br>
                любой точки на карте
            </div>
        `;
    }
    updateTimestamp();
}

export function getCurrentLocation(scanLocationFn) {
    if (!navigator.geolocation) {
        showError('Геолокация не поддерживается браузером.');
        return;
    }
    navigator.geolocation.getCurrentPosition(
        async function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            if (map) map.setView([lat, lng], 15);
            if (scanLocationFn) await scanLocationFn(lat, lng);
        },
        function(error) {
            showError('Не удалось получить геолокацию: ' + error.message);
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

export function updateTimestamp() {
    const ts = document.getElementById('timestamp');
    if (ts) {
        const now = new Date();
        ts.textContent = now.toLocaleString('ru-RU');
    }
}

export function updateVisibleTimeDisplay() {
    const lastMarkerItem = markers.slice().reverse().find(item => item && item.data);
    const lastMarkerData = lastMarkerItem ? lastMarkerItem.data : null;

    if (lastMarkerData && lastMarkerData.timezone) {
        const currentTime = getCurrentTimeForTimezone(lastMarkerData.timezone);
        document.querySelectorAll('.info-row').forEach(row => {
            const label = row.querySelector('.info-label');
            if (label && label.textContent.includes('Местное:')) {
                const valueSpan = row.querySelector('.info-value');
                if (valueSpan) valueSpan.textContent = currentTime;
            }
        });
    }

    const openPopup = document.querySelector('.leaflet-popup');
    if (openPopup) {
        let popupTimezone = null;
        openPopup.querySelectorAll('.popup-row').forEach(row => {
            const label = row.querySelector('.popup-label');
            if (label && label.textContent.includes('Часовой пояс:')) {
                const valueSpan = row.querySelector('.popup-value');
                if (valueSpan) popupTimezone = valueSpan.textContent;
            }
        });
        if (popupTimezone) {
            openPopup.querySelectorAll('.popup-row').forEach(row => {
                const label = row.querySelector('.popup-label');
                if (label && label.textContent.includes('Местное время:')) {
                    const valueSpan = row.querySelector('.popup-value');
                    if (valueSpan) valueSpan.textContent = getCurrentTimeForTimezone(popupTimezone);
                }
            });
        }
    }

    const modalOverlay = document.getElementById('modalOverlay');
    if (modalOverlay && modalOverlay.classList.contains('active')) {
        let modalTimezone = null;
        modalOverlay.querySelectorAll('.modal-row').forEach(row => {
            const label = row.querySelector('.modal-label');
            if (label && label.textContent.includes('Часовой пояс:')) {
                const valueSpan = row.querySelector('.modal-value');
                if (valueSpan) modalTimezone = valueSpan.textContent;
            }
        });
        if (modalTimezone) {
            modalOverlay.querySelectorAll('.modal-row').forEach(row => {
                const label = row.querySelector('.modal-label');
                if (label && label.textContent.includes('Местное время:')) {
                    const valueSpan = row.querySelector('.modal-value');
                    if (valueSpan) valueSpan.textContent = getCurrentTimeForTimezone(modalTimezone);
                }
            });
        }
    }
}

export function updateAllMarkerTimes() {
    if (markers.length === 0) return;
    markers.forEach(item => {
        if (!item || !item.data) return;
        const tz = item.data.timezone;
        if (tz && tz !== 'Н/Д') {
            item.data.localTime = getCurrentTimeForTimezone(tz);
        }
    });
    const infoContent = document.getElementById('infoContent');
    if (infoContent) updateVisibleTimeDisplay();
}

// НОВОЕ: Визуализация границ объекта (если есть boundingBox)
export function drawBoundingBox(locationData) {
    if (!locationData.boundingBox) return null;

    const { south, north, west, east } = locationData.boundingBox;
    const bounds = [[south, west], [north, east]];

    const rectangle = L.rectangle(bounds, {
        color: '#00ff00',
        weight: 2,
        fillOpacity: 0.1,
        fillColor: '#00ff00'
    }).addTo(map);

    return rectangle;
}

// НОВОЕ: Рисование GeoJSON полигона
export function drawGeoJSON(geojson) {
    if (!geojson) return null;

    const layer = L.geoJSON(geojson, {
        style: {
            color: '#00ffff',
            weight: 2,
            fillOpacity: 0.2,
            fillColor: '#00ffff'
        }
    }).addTo(map);

    return layer;
}
