// js/modules/ui/map.js - Leaflet map management

import { map, markers, isMobile, setMap, setMarkerCount } from '../../state.js';
import { showLoading, showError } from './loading.js';
import { clearLayers } from './layers.js';
import { getCurrentTimeForTimezone } from '../api/worldtime.js';
import { createPopupContent } from './popup.js';
import { displayFullInfo } from './modal.js';

// Use isMobile directly from state
const isMobileState = isMobile;

export function initMap(scanLocationFn) {
    const initialZoom = isMobileState ? 11 : 12;
    const m = L.map('map', { tap: true }).setView([55.7558, 37.6173], initialZoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(m);

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
        minWidth: isMobileState ? 280 : 350,
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
            m.removeLayer(item.marker);
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
    showLoading();
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
    const lastMarkerData = markers.length > 0 ? markers[markers.length - 1].data : null;

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
        const tz = item.data.timezone;
        if (tz && tz !== 'Н/Д') {
            item.data.localTime = getCurrentTimeForTimezone(tz);
        }
    });
    const infoContent = document.getElementById('infoContent');
    if (infoContent) updateVisibleTimeDisplay();
}
