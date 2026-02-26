// js/modules/ui/popup.js - Marker popup content

import { escapeHtml } from '../utils/helpers.js';
import { getWeatherIcon, getWeatherCondition, getWindDirection, getRoadTypeName, 
         getSurfaceName, getObjectTypeName, getSeverityName, getSeverityIcon } from '../utils/formatters.js';
import { getCurrentTimeForTimezone } from '../api/worldtime.js';

export function createPopupContent(data) {
    const weatherIcon = getWeatherIcon(data.weatherCode);
    const tempStatus = data.temp > 20 ? 'status-good' : data.temp > 0 ? 'status-warning' : 'status-bad';
    const markerIndex = markers.length;

    return `
        <div class="popup-title">
            >>> ТОЧКА #${data.id} <<<
        </div>

        ${data.weatherAlerts && data.weatherAlerts.length > 0 ? `
        <div class="popup-section popup-alerts">
            <div class="popup-section-title">🚨 ВАЖНЫЕ ПРЕДУПРЕЖДЕНИЯ</div>
            ${data.weatherAlerts.slice(0, 2).map(alert => `
            <div class="popup-alert severity-${alert.severity}">
                <div class="alert-title">${alert.event}</div>
                <div class="alert-time">До ${alert.end}</div>
            </div>
            `).join('')}
        </div>
        ` : ''}

        <div class="popup-section">
            <div class="popup-section-title">📍 МЕСТОПОЛОЖЕНИЕ</div>
            ${data.objectName ? `
            <div class="popup-row">
                <span class="popup-label">Объект:</span>
                <span class="popup-value">${escapeHtml(data.objectName)}</span>
            </div>
            ` : ''}
            ${data.objectType ? `
            <div class="popup-row">
                <span class="popup-label">Тип объекта:</span>
                <span class="popup-value">${getObjectTypeName(data.objectType)}</span>
            </div>
            ` : ''}
            <div class="popup-row">
                <span class="popup-label">Улица:</span>
                <span class="popup-value">${data.road}${data.houseNumber ? ', ' + escapeHtml(data.houseNumber) : ''}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Город:</span>
                <span class="popup-value">${data.city}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Район:</span>
                <span class="popup-value">${data.district}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Страна:</span>
                <span class="popup-value">${data.country}</span>
            </div>
        </div>

        <div class="popup-section">
            <div class="popup-section-title">${weatherIcon} ПОГОДА</div>
            <div class="popup-row">
                <span class="popup-label">Температура:</span>
                <span class="popup-value">
                    <span class="status-indicator ${tempStatus}"></span>${data.temp}°C (ощущается ${data.feelsLike}°C)
                </span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Условия:</span>
                <span class="popup-value">${data.condition}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Влажность:</span>
                <span class="popup-value">${data.humidity}%</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Ветер:</span>
                <span class="popup-value">${data.windSpeed} м/с ${getWindDirection(data.windDir)}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Давление:</span>
                <span class="popup-value">${data.pressure} гПа (${data.pressureAnalysis?.levelName || 'Н/Д'} ${data.pressureAnalysis?.trendIcon || ''})</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">🌧️ Осадки:</span>
                <span class="popup-value">${data.precipitation} мм (${data.precipType})</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Вероятность:</span>
                <span class="popup-value">${data.precipProbability ?? 0}%</span>
            </div>
            ${data.weatherAlerts && data.weatherAlerts.length > 0 ? `
            <div class="popup-row">
                <span class="popup-label">⚠️ Предупреждение:</span>
                <span class="popup-value alert-${data.weatherAlerts[0].level}">${data.weatherAlerts[0].type}</span>
            </div>` : ''}
        </div>

        ${data.surfaceAnalysis ? `
        <div class="popup-section">
            <div class="popup-section-title">🌧️ СОСТОЯНИЕ ПОВЕРХНОСТИ</div>
            <div class="popup-row">
                <span class="popup-label">Дорога:</span>
                <span class="popup-value">${data.surfaceAnalysis.road.condition} <span class="probability">(${data.surfaceAnalysis.road.probability}%)</span></span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Высыхание:</span>
                <span class="popup-value">~${data.surfaceAnalysis.road.dryingTime}</span>
            </div>
        </div>
        ` : ''}

        ${data.trafficAnalysis ? `
        <div class="popup-section">
            <div class="popup-section-title">🚦 ТРАФИК</div>
            <div class="popup-row">
                <span class="popup-label">Загруженность:</span>
                <span class="popup-value" style="color: ${data.trafficAnalysis.color}">${data.trafficAnalysis.trafficLevel} <span class="probability">(${data.trafficAnalysis.probability}%)</span></span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Скорость:</span>
                <span class="popup-value">${data.trafficAnalysis.actualSpeed} км/ч (лимит ${data.trafficAnalysis.maxSpeed})</span>
            </div>
        </div>
        ` : ''}

        ${data.aqi ? `
        <div class="popup-section">
            <div class="popup-section-title">🌫️ КАЧЕСТВО ВОЗДУХА</div>
            <div class="popup-row">
                <span class="popup-label">Индекс AQI:</span>
                <span class="popup-value aqi-${data.aqi}">${data.aqiText} (${data.aqi}/5)</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">PM2.5:</span>
                <span class="popup-value">${data.pm25} мкг/м³</span>
            </div>
        </div>
        ` : ''}

        <div class="popup-section">
            <div class="popup-section-title">🚗 ДОРОГИ</div>
            <div class="popup-row">
                <span class="popup-label">Дорога:</span>
                <span class="popup-value">${data.roadName || 'Н/Д'}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Тип:</span>
                <span class="popup-value">${data.roadType}</span>
            </div>
            ${data.maxSpeed ? `
            <div class="popup-row">
                <span class="popup-label">Макс. скорость:</span>
                <span class="popup-value">${data.maxSpeed} км/ч</span>
            </div>
            ` : ''}
        </div>

        <div class="popup-section">
            <div class="popup-section-title">��️ GPS</div>
            <div class="popup-row">
                <span class="popup-label">Координаты:</span>
                <span class="popup-value">${data.latitude}°, ${data.longitude}°</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Высота:</span>
                <span class="popup-value">${data.elevation} м</span>
            </div>
        </div>

        <div class="popup-section">
            <div class="popup-section-title">🕐 ВРЕМЯ</div>
            <div class="popup-row">
                <span class="popup-label">Местное время:</span>
                <span class="popup-value">${data.timezone ? getCurrentTimeForTimezone(data.timezone) : data.localTime || 'Н/Д'}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Часовой пояс:</span>
                <span class="popup-value">${data.timezone || 'Н/Д'}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">UTC смещение:</span>
                <span class="popup-value">${data.utcOffset || 'Н/Д'}</span>
            </div>
            ${data.usesDST ? `
            <div class="popup-row">
                <span class="popup-label">Тип времени:</span>
                <span class="popup-value">
                    ${data.currentSeason === 'summer' ? '☀️ Летнее (DST)' : '❄️ Зимнее (стандартное)'}
                </span>
            </div>
            ` : ''}
        </div>

        <button class="popup-details-btn" onclick="openModalById(${markerIndex})">
            [ 📋 ПОЛНАЯ ИНФОРМАЦИЯ ]
        </button>

        ${data.quality ? `
        <div class="popup-section quality-section">
            <div class="popup-section-title">📊 КАЧЕСТВО ДАННЫХ</div>
            <div class="quality-indicator ${getQualityColorClass(data.quality.grade)}">
                <div class="quality-stars">${'⭐'.repeat(data.quality.stars)}${'☆'.repeat(5 - data.quality.stars)}</div>
                <div class="quality-label">${getQualityLabel(data.quality.grade)} (${data.quality.score}/100)</div>
                ${data.quality.missingFields.length > 0 ? `
                <div class="quality-missing">
                    <small>Отсутствуют: ${data.quality.missingFields.slice(0, 3).join(', ')}</small>
                </div>
                ` : ''}
            </div>
            ${data.quality.score < 80 ? `
            <button class="rescan-button-small" onclick="rescanCurrentLocation()">
                🔄 Пересканировать
            </button>
            ` : ''}
        </div>
        ` : ''}

        <div style="text-align: center; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0, 255, 0, 0.3); font-size: 10px; color: #00aa00;">
            ${data.scanTime}
        </div>
    `;
}
