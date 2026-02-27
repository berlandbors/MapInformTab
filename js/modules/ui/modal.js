// js/modules/ui/modal.js - Modal window management

import { escapeHtml } from '../utils/helpers.js';
import { getWeatherIcon, getWeatherCondition, getWindDirection, getRoadTypeName,
         getSurfaceName, getSeverityName, getSeverityIcon, getQualityLabel, getQualityColorClass,
         getObjectTypeName } from '../utils/formatters.js';
import { getConfidenceIcon, getConfidenceLabel } from '../analysis/weather.js';
import { getCurrentTimeForTimezone } from '../api/worldtime.js';
import { getAQICategory } from '../api/openmeteo-airquality.js';
import { markers, currentMarkerData, setCurrentMarkerData, isMobile } from '../../state.js';
import { focusOnLayer } from './layers.js';
import { updateTimestamp } from './map.js';


// Local helper functions for surface/pressure display
function getHoursText(hours) {
    if (hours === 0) return 'Только что';
    if (hours === 1) return '1 час назад';
    if (hours < 5) return `${hours} часа назад`;
    return `${hours} часов назад`;
}

function getMoonPhaseEmoji(phase) {
    if (phase === 0 || phase === 1) return '🌑 Новолуние';
    if (phase < 0.25) return '🌒 Растущий серп';
    if (phase === 0.25) return '🌓 Первая четверть';
    if (phase < 0.5) return '🌔 Растущая луна';
    if (phase === 0.5) return '🌕 Полнолуние';
    if (phase < 0.75) return '🌖 Убывающая луна';
    if (phase === 0.75) return '🌗 Последняя четверть';
    return '🌘 Убывающий серп';
}

function getEvaporationLevel(rate) {
    if (rate >= 2) return 'очень быстрая';
    if (rate >= 1) return 'быстрая';
    if (rate >= 0.5) return 'средняя';
    return 'медленная';
}

function getSurfaceTypeName(type) {
    const map = { premium_asphalt: 'Асфальтобетон премиум', standard_asphalt: 'Асфальтобетон стандартный', basic_asphalt: 'Асфальтобетон', gravel: 'Гравий' };
    return map[type] || 'Асфальтобетон';
}

function getDrainageName(drainage) {
    const map = { excellent: 'Отличный', good: 'Хороший', satisfactory: 'Удовлетворительный', moderate: 'Умеренный', poor: 'Плохой' };
    return map[drainage] || 'Хороший';
}

function getTextureName(texture) {
    const map = { smooth: 'Гладкая', medium: 'Средняя', rough: 'Шероховатая', very_rough: 'Очень шероховатая' };
    return map[texture] || 'Средняя';
}

function getCoverageDescription(coverage) {
    const map = { dry: 'Сухое', damp: 'Слегка влажное', wet: 'Мокрое', very_wet: 'Очень мокрое', flooded: 'Затоплено' };
    return map[coverage] || 'Нормальное';
}

function getSeverityColor(severity) {
    const map = { low: '#00aa00', moderate: '#ffaa00', high: '#ff6600', critical: '#ff4444' };
    return map[severity] || '#888888';
}

function getWalkabilityLabel(level) {
    return { 'excellent': '✅ Отлично', 'good': '🟢 Хорошо', 'fair': '🟡 Приемлемо', 'poor': '🟠 Плохо', 'very_poor': '🔴 Очень плохо' }[level] || 'Неизвестно';
}

function getTrafficabilityLabel(level) {
    return { 'excellent': '✅ Проходимо', 'good': '🟢 Проходимо', 'fair': '🟡 Затруднено', 'poor': '🟠 Сильно затруднено', 'impassable': '🔴 Непроходимо' }[level] || 'Неизвестно';
}

// Определить текущее состояние поверхности на основе condition
function getSurfaceConditionDisplay(condition) {
    const conditionMap = {
        // Сухие состояния
        'dry': { icon: '☀️', text: 'СУХО', color: '#00aa00', severity: 'low' },
        'mostly_dry': { icon: '🌤️', text: 'ПРЕИМУЩЕСТВЕННО СУХО', color: '#44cc00', severity: 'low' },

        // Влажные состояния
        'damp': { icon: '💧', text: 'ВЛАЖНО', color: '#88aa00', severity: 'moderate' },
        'wet': { icon: '💦', text: 'МОКРО', color: '#ffaa00', severity: 'moderate' },
        'very_wet': { icon: '🌧️', text: 'ОЧЕНЬ МОКРО', color: '#ff8800', severity: 'high' },

        // Опасные состояния
        'puddled': { icon: '🌊', text: 'ЛУЖИ', color: '#ff6600', severity: 'high' },
        'flooded': { icon: '⚠️', text: 'ЗАТОПЛЕНИЕ', color: '#ff4444', severity: 'critical' },
        'icy': { icon: '❄️', text: 'ГОЛОЛЁД', color: '#00ccff', severity: 'critical' },
        'black_ice': { icon: '🧊', text: 'ЧЁРНЫЙ ЛЁД', color: '#0088ff', severity: 'critical' },
        'snowy': { icon: '🌨️', text: 'СНЕГ', color: '#aaddff', severity: 'high' },
        'slushy': { icon: '🌨️', text: 'СЛЯКОТЬ', color: '#8899aa', severity: 'high' },
        'muddy': { icon: '🟤', text: 'ГРЯЗЬ', color: '#aa6600', severity: 'moderate' }
    };

    return conditionMap[condition] || { icon: '❓', text: condition?.toUpperCase() || 'НЕИЗВЕСТНО', color: '#888888', severity: 'low' };
}

function renderSurfaceCondition(condition) {
    const cond = getSurfaceConditionDisplay(condition);
    return `<span style="color: ${cond.color}; font-weight: bold; font-size: 1.1em; margin-left: 10px;">${cond.icon} ${cond.text}</span>`;
}

export function openModal(data) {
    const overlay = document.getElementById('modalOverlay');
    const title = document.getElementById('modalTitle');
    const subtitle = document.getElementById('modalSubtitle');
    const body = document.getElementById('modalBody');

    title.textContent = `>>> ТОЧКА #${data.id} <<<`;
    subtitle.textContent = `Сканирование: ${data.scanTime}`;

    const weatherIcon = getWeatherIcon(data.weatherCode);
    const tempStatus = data.temp > 20 ? 'status-good' : data.temp > 0 ? 'status-warning' : 'status-bad';

    body.innerHTML = `
        <div class="modal-section">
            <div class="modal-section-title">📍 МЕСТОПОЛОЖЕНИЕ</div>
            ${data.objectName ? `
            <div class="modal-row">
                <span class="modal-label">Название объекта:</span>
                <span class="modal-value">${escapeHtml(data.objectName)}</span>
            </div>
            ` : ''}
            ${data.objectType ? `
            <div class="modal-row">
                <span class="modal-label">Тип объекта:</span>
                <span class="modal-value">${getObjectTypeName(data.objectType)}</span>
            </div>
            ` : ''}
            <div class="modal-row">
                <span class="modal-label">Улица/адрес:</span>
                <span class="modal-value">${data.road}${data.houseNumber ? ', д. ' + escapeHtml(data.houseNumber) : ''}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Город:</span>
                <span class="modal-value">${data.city}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Район:</span>
                <span class="modal-value">${data.district}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Регион:</span>
                <span class="modal-value">${data.state}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Страна:</span>
                <span class="modal-value">${data.country}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Почтовый индекс:</span>
                <span class="modal-value">${data.postcode || 'Н/Д'}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Полный адрес:</span>
                <span class="modal-value">${data.displayName}</span>
            </div>
            ${data.class ? `
            <div class="modal-row">
                <span class="modal-label">🏷️ Класс объекта:</span>
                <span class="modal-value">${getClassLabel(data.class)}</span>
            </div>` : ''}
            ${data.category ? `
            <div class="modal-row">
                <span class="modal-label">📂 Категория:</span>
                <span class="modal-value">${getCategoryLabel(data.category)}</span>
            </div>` : ''}
            ${data.importance > 0 ? `
            <div class="modal-row">
                <span class="modal-label">⭐ Важность места:</span>
                <span class="modal-value">
                    <span class="importance-badge ${getImportanceLevel(data.importance)}">
                        ${getImportanceIcon(data.importance)} ${getImportanceText(data.importance)}
                    </span>
                </span>
            </div>` : ''}
            ${data.areaSize ? `
            <div class="modal-row">
                <span class="modal-label">📐 Площадь объекта:</span>
                <span class="modal-value">${formatArea(data.areaSize)}</span>
            </div>` : ''}
            ${data.osmUrl ? `
            <div class="modal-row">
                <span class="modal-label">🗺️ OpenStreetMap:</span>
                <span class="modal-value">
                    <a href="${data.osmUrl}" target="_blank" rel="noopener noreferrer" class="osm-link">
                        Открыть в OSM ↗
                    </a>
                </span>
            </div>` : ''}
            ${Object.keys(data.extraTags || {}).length > 0 ? `
            <div class="modal-row">
                <details class="extra-tags-details">
                    <summary class="modal-label">🏷️ Дополнительные теги OSM</summary>
                    <div class="extra-tags-content">
                        ${Object.entries(data.extraTags).map(([key, value]) => `
                            <div class="tag-item">
                                <span class="tag-key">${escapeHtml(key)}:</span>
                                <span class="tag-value">${escapeHtml(value)}</span>
                            </div>
                        `).join('')}
                    </div>
                </details>
            </div>` : ''}
        </div>

        ${data.weatherAlerts && data.weatherAlerts.length > 0 ? `
        <div class="modal-section hazards-section">
            <div class="modal-section-title">🚨 МЕТЕОРОЛОГИЧЕСКИЕ ПРЕДУПРЕЖДЕНИЯ <span class="hazards-count">${data.weatherAlerts.length}</span></div>
            ${data.weatherAlerts.map(alert => `
            <div class="hazard-item severity-${alert.severity || 'moderate'}">
                <div class="hazard-header">
                    <span class="hazard-icon">${alert.severity === 'critical' ? '🔴' : '🟠'}</span>
                    <span class="hazard-title">${escapeHtml(alert.event || '')}</span>
                </div>
                <div class="hazard-details">
                    <div class="hazard-row">
                        <span class="hazard-label">Источник:</span>
                        <span class="hazard-value">${escapeHtml(alert.senderName || alert.sender || '')}</span>
                    </div>
                    <div class="hazard-row">
                        <span class="hazard-label">Период:</span>
                        <span class="hazard-value">С ${alert.startFormatted || alert.start} до ${alert.endFormatted || alert.end}</span>
                    </div>
                    <div class="hazard-description">${escapeHtml(alert.description || '')}</div>
                    ${alert.tags && alert.tags.length > 0 ? `<div class="hazard-tags">${alert.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
                </div>
            </div>
            `).join('')}
        </div>
        ` : ''}

        ${data.hazards && data.hazards.length > 0 ? `
        <div class="modal-section hazards-section">
            <div class="modal-section-title">⚠️ ОПАСНОСТИ <span class="hazards-count">${data.hazards.length}</span></div>
            ${data.hazards.map(h => `
            <div class="hazard-item severity-${h.severity}">
                <div class="hazard-header">
                    <span class="hazard-icon">${h.icon}</span>
                    <span class="hazard-title">${escapeHtml(h.title)}</span>
                    <span class="hazard-badge">${getSeverityName(h.severity)}</span>
                </div>
                <div class="hazard-details">
                    <div class="hazard-value${h.severity === 'critical' ? ' hazard-critical' : ''}">${escapeHtml(h.value)}</div>
                    <div>${escapeHtml(h.description)}</div>
                </div>
                ${h.layerName ? `<button class="hazard-action-btn" data-layer="${escapeHtml(h.layerName)}">▶ Показать на карте</button>` : ''}
            </div>`).join('')}
        </div>` : ''}

        <div class="modal-section">
            <div class="modal-section-title">${weatherIcon} МЕТЕОДАННЫЕ</div>
            <div class="modal-row">
                <span class="modal-label">Температура:</span>
                <span class="modal-value">
                    <span class="status-indicator ${tempStatus}"></span>${data.temp}°C
                </span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Ощущается как:</span>
                <span class="modal-value">${data.feelsLike}°C</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Погодные условия:</span>
                <span class="modal-value">${data.condition}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Влажность:</span>
                <span class="modal-value">${data.humidity}%</span>
            </div>
            ${data.dewPoint != null && data.dewPoint !== 'Н/Д' ? `
            <div class="modal-row">
                <span class="modal-label">Точка росы:</span>
                <span class="modal-value">${data.dewPoint}°C</span>
            </div>
            ` : ''}
            <div class="modal-row">
                <span class="modal-label">Скорость ветра:</span>
                <span class="modal-value">${data.windSpeed} м/с</span>
            </div>
            ${data.windGusts != null && data.windGusts !== 'Н/Д' ? `
            <div class="modal-row">
                <span class="modal-label">Порывы ветра:</span>
                <span class="modal-value">${data.windGusts} м/с</span>
            </div>
            ` : ''}
            <div class="modal-row">
                <span class="modal-label">Направление ветра:</span>
                <span class="modal-value">${getWindDirection(data.windDir)} (${data.windDir}°)</span>
            </div>
            <div class="modal-row" style="cursor:pointer" onclick="openPressureDetailModal(${JSON.stringify(data.pressureAnalysis).replace(/"/g, '&quot;')}, ${JSON.stringify({pressure: data.pressure}).replace(/"/g, '&quot;')})">
                <span class="modal-label">Атм. давление:</span>
                <span class="modal-value">${data.pressure} гПа${data.pressureAnalysis ? ` / ${data.pressureAnalysis.mmHg} мм рт.ст. — <span style="color: ${data.pressureAnalysis.color}">${data.pressureAnalysis.levelName}</span>` : ''}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Видимость:</span>
                <span class="modal-value">${data.visibility} км</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">УФ-индекс:</span>
                <span class="modal-value">${data.uvIndex}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Облачность:</span>
                <span class="modal-value">${data.cloudCover}%</span>
            </div>
            ${data.cloudCoverLow || data.cloudCoverMid || data.cloudCoverHigh ? `
            <div class="modal-row">
                <span class="modal-label">Облака по слоям:</span>
                <span class="modal-value">Н: ${data.cloudCoverLow}% / С: ${data.cloudCoverMid}% / В: ${data.cloudCoverHigh}%</span>
            </div>
            ` : ''}
            <div class="modal-row">
                <span class="modal-label">Количество осадков:</span>
                <span class="modal-value">${data.precipitation} мм</span>
            </div>
            ${data.rain > 0 ? `
            <div class="modal-row">
                <span class="modal-label">Дождь:</span>
                <span class="modal-value">${data.rain} мм</span>
            </div>
            ` : ''}
            ${data.snowfall > 0 ? `
            <div class="modal-row">
                <span class="modal-label">Снег:</span>
                <span class="modal-value">${data.snowfall} мм</span>
            </div>
            ` : ''}
            ${data.showers > 0 ? `
            <div class="modal-row">
                <span class="modal-label">Ливни:</span>
                <span class="modal-value">${data.showers} мм</span>
            </div>
            ` : ''}
            ${data.snowDepth > 0 ? `
            <div class="modal-row">
                <span class="modal-label">Высота снежного покрова:</span>
                <span class="modal-value">${data.snowDepth} м</span>
            </div>
            ` : ''}
            ${data.solarRadiation > 0 ? `
            <div class="modal-row">
                <span class="modal-label">Солнечная радиация:</span>
                <span class="modal-value">${data.solarRadiation} Вт/м²</span>
            </div>
            ` : ''}
            ${data.cape > 0 ? `
            <div class="modal-row">
                <span class="modal-label">CAPE (риск гроз):</span>
                <span class="modal-value">${data.cape} Дж/кг${data.cape > 1000 ? ' ⚡ Высокий риск!' : data.cape > 500 ? ' ⚡ Умеренный риск' : ''}</span>
            </div>
            ` : ''}
            <div class="modal-row">
                <span class="modal-label">Код погоды:</span>
                <span class="modal-value">${data.weatherCode}</span>
            </div>
        </div>

        ${data.airQualityData ? `
        <div class="modal-section">
            <div class="modal-section-title">🌫️ КАЧЕСТВО ВОЗДУХА</div>
            <div class="modal-row">
                <span class="modal-label">Индекс AQI:</span>
                ${(() => { const aqiCat = getAQICategory(data.airQualityData.current.aqi); return `<span class="modal-value" style="color: ${aqiCat.color}">${data.airQualityData.current.aqi} — ${aqiCat.level} ${aqiCat.icon}</span>`; })()}
            </div>
            <div class="modal-row">
                <span class="modal-label">PM2.5 (мелкая пыль):</span>
                <span class="modal-value">${data.airQualityData.current.pm25} мкг/м³</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">PM10 (крупная пыль):</span>
                <span class="modal-value">${data.airQualityData.current.pm10} мкг/м³</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">CO (угарный газ):</span>
                <span class="modal-value">${data.airQualityData.current.carbonMonoxide} мкг/м³</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">NO₂ (диоксид азота):</span>
                <span class="modal-value">${data.airQualityData.current.nitrogenDioxide} мкг/м³</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">O₃ (озон):</span>
                <span class="modal-value">${data.airQualityData.current.ozone} мкг/м³</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">SO₂ (диоксид серы):</span>
                <span class="modal-value">${data.airQualityData.current.sulphurDioxide} мкг/м³</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">NH₃ (аммиак):</span>
                <span class="modal-value">${data.airQualityData.current.ammonia} мкг/м³</span>
            </div>
            ${(data.airQualityData.current.alderPollen + data.airQualityData.current.birchPollen + data.airQualityData.current.grassPollen) > 0 ? `
            <div class="modal-row">
                <span class="modal-label">Пыльца (ольха/берёза/трава):</span>
                <span class="modal-value">${data.airQualityData.current.alderPollen} / ${data.airQualityData.current.birchPollen} / ${data.airQualityData.current.grassPollen} зёрен/м³</span>
            </div>
            ` : ''}
        </div>
        ` : ''}

        ${data.minutelyForecast && data.minutelyForecast.length > 0 ? `
        <div class="modal-section">
            <div class="modal-section-title">⚡ ПРОГНОЗ ОСАДКОВ (60 МИНУТ)</div>
            <div class="minutely-forecast">
                ${data.minutelyForecast.some(m => m.precipitation > 0)
                    ? `<div class="forecast-summary">🌧️ Ожидаются осадки</div>
                       <div class="forecast-chart">
                           ${data.minutelyForecast.filter((m, i) => i % 5 === 0).map(m => `
                           <div class="forecast-bar" style="height: ${Math.min(m.precipitation * 10, 50)}px;" title="${m.time}: ${m.precipitation} мм/ч"></div>
                           `).join('')}
                       </div>`
                    : '<div class="forecast-summary">☀️ Осадков не ожидается в ближайший час</div>'}
            </div>
        </div>
        ` : ''}

        ${data.hourlyForecast && data.hourlyForecast.length > 0 ? `
        <div class="modal-section">
            <div class="modal-section-title">📈 ПОЧАСОВОЙ ПРОГНОЗ (48 ЧАСОВ)</div>
            <div class="hourly-forecast-grid">
                ${data.hourlyForecast.slice(0, 12).map(h => `
                <div class="forecast-hour-card">
                    <div class="forecast-time-label">${h.time.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'})}</div>
                    <div class="forecast-icon-lg">${h.rain > 0 ? '🌧️' : h.precipitation > 0 ? '🌨️' : h.isDay ? (h.cloudCover > 70 ? '☁️' : h.cloudCover > 30 ? '⛅' : '☀️') : '🌙'}</div>
                    <div class="forecast-temp-lg">${h.temp}°C</div>
                    <div class="forecast-precip-pct">💧 ${h.precipProb}%</div>
                </div>
                `).join('')}
            </div>
        </div>
        ` : ''}

        ${data.dailyForecast && data.dailyForecast.length > 0 ? `
        <div class="modal-section">
            <div class="modal-section-title">📅 ПРОГНОЗ НА 7 ДНЕЙ</div>
            <div class="daily-forecast-list">
                ${data.dailyForecast.map(d => `
                <div class="forecast-day-row">
                    <div class="forecast-date-label">${d.dayOfWeek}, ${d.date.toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'})}</div>
                    <div class="forecast-icon-lg">${d.precipSum > 0 ? (d.snowfallSum > 0 ? '🌨️' : '🌧️') : '☀️'}</div>
                    <div class="forecast-temps-row">
                        <span class="temp-max-val">↑${d.tempMax}°</span>
                        <span class="temp-min-val">↓${d.tempMin}°</span>
                    </div>
                    <div class="forecast-precip-pct">💧 ${d.precipProb}%</div>
                    ${d.windGustsMax > 10 ? `<div class="forecast-desc-sm">💨 порывы до ${d.windGustsMax} м/с</div>` : ''}
                </div>
                `).join('')}
            </div>
        </div>
        ` : ''}

        <div class="modal-section">
            <div class="modal-section-title">🚗 ДОРОЖНАЯ ОБСТАНОВКА</div>
            <div class="modal-row">
                <span class="modal-label">Название дороги:</span>
                <span class="modal-value">${data.roadName || 'Н/Д'}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Тип дороги:</span>
                <span class="modal-value">${data.roadType}</span>
            </div>
            ${data.maxSpeed ? `
            <div class="modal-row">
                <span class="modal-label">Максимальная скорость:</span>
                <span class="modal-value">${data.maxSpeed} км/ч</span>
            </div>
            ` : ''}
            <div class="modal-row">
                <span class="modal-label">Поверхность:</span>
                <span class="modal-value">${data.roadSurface || 'Н/Д'}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Количество полос:</span>
                <span class="modal-value">${data.lanes || 'Н/Д'}</span>
            </div>
        </div>

        ${data.surfaceAnalysis ? `
        <div class="modal-section">
            <div class="modal-section-title">🌧️ ДЕТАЛЬНЫЙ АНАЛИЗ ПОВЕРХНОСТИ</div>

            ${data.realData ? `
            <div class="data-panel">
                <div class="data-panel-title">📡 Реальные данные об осадках
                    ${data.realData.precipitation ? '<span class="source-badge source-active">✓ Open-Meteo Historical</span>' : '<span class="source-badge source-fallback">≈ приблизительные данные</span>'}
                </div>
                ${data.realData.precipitation ? `
                <div class="data-row"><span class="data-label">Осадки за 1ч:</span><span class="data-value">${data.realData.precipitation.last1h} мм</span></div>
                <div class="data-row"><span class="data-label">Осадки за 3ч:</span><span class="data-value">${data.realData.precipitation.last3h} мм</span></div>
                <div class="data-row"><span class="data-label">Осадки за 24ч:</span><span class="data-value">${data.realData.precipitation.last24h} мм</span></div>
                ` : ''}
                ${(() => { const hasSlope = data.realData.slope != null; return `<div class="data-row"><span class="data-label">Уклон поверхности:</span><span class="data-value">${hasSlope ? data.realData.slope + '° <span class="source-badge source-active">Elevation API</span>' : '5° (по умолчанию)'}</span></div>`; })()}
                <div class="data-row"><span class="data-label">Дренаж:</span><span class="data-value">${escapeHtml(data.realData.drainage || 'good')} <span class="source-badge source-active">расчётный</span></span></div>
                ${data.realData.shading ? `
                <div class="data-row"><span class="data-label">Затенённость:</span><span class="data-value">${data.realData.shading.isShaded ? '🌑 Затенено' : '☀️ Открыто'} (солнце ${data.realData.shading.sunExposure}%)</span></div>
                ${data.realData.shading.buildings > 0 ? `<div class="data-row"><span class="data-label">Здания рядом:</span><span class="data-value">${data.realData.shading.buildings} шт., до ${data.realData.shading.maxBuildingHeight} м</span></div>` : ''}
                ${data.realData.shading.treeCover !== 'none' ? `<div class="data-row"><span class="data-label">Деревья:</span><span class="data-value">${{'sparse':'Редкие','moderate':'Умеренные','dense':'Густые','none':'Нет'}[data.realData.shading.treeCover]}</span></div>` : ''}
                ` : ''}
                ${data.realData.hasRoof ? '<div class="data-row"><span class="data-label">Защита:</span><span class="data-value">🏠 Под навесом / в тоннеле</span></div>' : ''}
                ${data.realData.historicalWetness ? `
                <div class="data-panel-title" style="margin-top:8px">💧 Историческая влажность за 7 дней
                    <span class="source-badge source-active">✓ Archive API</span>
                </div>
                <div class="data-row"><span class="data-label">Всего осадков:</span><span class="data-value">${data.realData.historicalWetness.last7days} мм</span></div>
                <div class="data-row"><span class="data-label">Средняя t°C:</span><span class="data-value">${data.realData.historicalWetness.avgTemp}°C</span></div>
                <div class="data-row"><span class="data-label">Насыщенность почвы:</span><span class="data-value">${{'high':'Насыщенная 🟠','normal':'Нормальная 🟢','low':'Сухая 🟡'}[data.realData.historicalWetness.soilSaturation] || 'Н/Д'}</span></div>
                ` : ''}
            </div>
            ` : ''}

            <!-- ДОРОГА -->
            <div class="surface-block">
                <div class="surface-block-header">
                    🛣️ Дорога
                    ${renderSurfaceCondition(data.surfaceAnalysis.road.condition)}
                </div>
                <div class="modal-row">
                    <span class="modal-label">Вероятность:</span>
                    <span class="modal-value">${data.surfaceAnalysis.road.probability}%</span>
                </div>
                <div class="modal-row">
                    <span class="modal-label">Уверенность:</span>
                    <span class="modal-value confidence-${data.surfaceAnalysis.road.confidence}">
                        ${data.surfaceAnalysis.road.confidence === 'high' ? '🟢 Высокая' :
                          data.surfaceAnalysis.road.confidence === 'medium' ? '🟡 Средняя' : '🔴 Низкая'}
                    </span>
                </div>
                ${data.surfaceAnalysis.road.dryingTime && data.surfaceAnalysis.road.dryingTime !== 'Н/Д' ? `
                <div class="modal-row">
                    <span class="modal-label">⏱️ Время до высыхания:</span>
                    <span class="modal-value">${data.surfaceAnalysis.road.dryingTime}</span>
                </div>
                ` : ''}
                ${data.surfaceAnalysis.road.factors && data.surfaceAnalysis.road.factors.length > 0 ? `
                <div class="modal-row">
                    <span class="modal-label">Факторы:</span>
                    <ul class="factor-list">${data.surfaceAnalysis.road.factors.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
                </div>
                ` : ''}
            </div>

            <!-- ТРОТУАР -->
            <div class="surface-block">
                <div class="surface-block-header">
                    🚶 Тротуар
                    ${renderSurfaceCondition(data.surfaceAnalysis.sidewalk.condition)}
                </div>
                <div class="modal-row">
                    <span class="modal-label">Вероятность:</span>
                    <span class="modal-value">${data.surfaceAnalysis.sidewalk.probability}%</span>
                </div>
                ${data.surfaceAnalysis.sidewalk.dryingTime && data.surfaceAnalysis.sidewalk.dryingTime !== 'Н/Д' ? `
                <div class="modal-row">
                    <span class="modal-label">⏱️ Время до высыхания:</span>
                    <span class="modal-value">${data.surfaceAnalysis.sidewalk.dryingTime}</span>
                </div>
                ` : ''}
                ${data.surfaceAnalysis.sidewalk.factors && data.surfaceAnalysis.sidewalk.factors.length > 0 ? `
                <div class="modal-row">
                    <span class="modal-label">Факторы:</span>
                    <ul class="factor-list">${data.surfaceAnalysis.sidewalk.factors.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
                </div>
                ` : ''}
            </div>

            <!-- ПОЧВА -->
            <div class="surface-block">
                <div class="surface-block-header">
                    🌱 Почва
                    ${renderSurfaceCondition(data.surfaceAnalysis.soil.condition)}
                </div>
                <div class="modal-row">
                    <span class="modal-label">Тип почвы:</span>
                    <span class="modal-value">${
                        data.surfaceAnalysis.soil.soilType === 'clay' ? '🟤 Глинистая' :
                        data.surfaceAnalysis.soil.soilType === 'sandy' ? '🟡 Песчаная' :
                        '🟢 Смешанная'
                    }</span>
                </div>
                <div class="modal-row">
                    <span class="modal-label">Вероятность:</span>
                    <span class="modal-value">${data.surfaceAnalysis.soil.probability}%</span>
                </div>
                ${data.surfaceAnalysis.soil.dryingTime && data.surfaceAnalysis.soil.dryingTime !== 'Н/Д' ? `
                <div class="modal-row">
                    <span class="modal-label">⏱️ Время высыхания:</span>
                    <span class="modal-value">${data.surfaceAnalysis.soil.dryingTime}</span>
                </div>
                ` : ''}
                ${data.surfaceAnalysis.soil.factors && data.surfaceAnalysis.soil.factors.length > 0 ? `
                <div class="modal-row">
                    <span class="modal-label">Факторы:</span>
                    <ul class="factor-list">${data.surfaceAnalysis.soil.factors.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
                </div>
                ` : ''}
            </div>
        </div>
        ` : ''}

        ${data.trafficAnalysis ? `
        <div class="modal-section">
            <div class="modal-section-title">🚦 ДЕТАЛЬНЫЙ АНАЛИЗ ТРАФИКА</div>

            ${data.trafficAnalysis.realFlow ? `
            <div class="traffic-realtime-block">
                <div class="data-panel-title">🔴 <span class="real-time">REAL-TIME</span> Трафик
                    <span class="source-badge source-active">✓ TomTom Traffic API</span>
                </div>
                <div class="data-row"><span class="data-label">Скорость потока:</span><span class="data-value">${data.trafficAnalysis.realFlow.currentSpeed} км/ч</span></div>
                <div class="data-row"><span class="data-label">Макс. скорость:</span><span class="data-value">${data.trafficAnalysis.realFlow.freeFlowSpeed} км/ч</span></div>
                <div class="data-row"><span class="data-label">Замедление:</span><span class="data-value">${data.trafficAnalysis.realFlow.delayPercent > 0 ? '-' + data.trafficAnalysis.realFlow.delayPercent + '%' : 'Нет'}</span></div>
                ${data.trafficAnalysis.realFlow.roadClosure ? '<div class="data-row"><span class="data-label">Статус:</span><span class="data-value" style="color:#ff4400">⛔ Дорога перекрыта</span></div>' : ''}
                ${data.trafficAnalysis.realFlow.confidence ? `<div class="data-row"><span class="data-label">Уверенность:</span><span class="data-value">${Math.round(data.trafficAnalysis.realFlow.confidence * 100)}%</span></div>` : ''}
            </div>
            ` : ''}

            ${data.trafficAnalysis.incidents && data.trafficAnalysis.incidents.length > 0 ? `
            <div class="data-panel">
                <div class="data-panel-title">⚠️ Инциденты поблизости
                    <span class="source-badge source-active">✓ HERE Traffic</span>
                </div>
                ${data.trafficAnalysis.incidents.map(inc => `
                <div class="incident-item">
                    <span class="incident-type">${escapeHtml(inc.type)}</span>
                    ${inc.description ? `<span class="incident-desc">${escapeHtml(inc.description)}</span>` : ''}
                    ${inc.distance > 0 ? `<span class="incident-dist">${inc.distance} м</span>` : ''}
                </div>`).join('')}
            </div>
            ` : ''}

            <div class="modal-row">
                <span class="modal-label">Уровень загруженности:</span>
                <span class="modal-value" style="color: ${data.trafficAnalysis.color}; font-weight: bold;">${data.trafficAnalysis.trafficLevel} (${data.trafficAnalysis.probability}%)</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Максимальная скорость:</span>
                <span class="modal-value">${data.trafficAnalysis.maxSpeed} км/ч</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Фактическая скорость:</span>
                <span class="modal-value">${data.trafficAnalysis.actualSpeed} км/ч${data.trafficAnalysis.speedReduction > 0 ? ` (-${data.trafficAnalysis.speedReduction}%)` : ''}${!data.trafficAnalysis.realFlow ? ' <span class="source-badge source-fallback">≈ приблизительно</span>' : ' <span class="source-badge source-active">real-time</span>'}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Риск заторов:</span>
                <span class="modal-value">${data.trafficAnalysis.congestionRisk}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Часы пик:</span>
                <span class="modal-value">${data.trafficAnalysis.peakHours.join(', ')}${data.trafficAnalysis.isPeakHour ? ' <span class="real-time">● сейчас</span>' : ''}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Анализ:</span>
                <ul class="factor-list">${data.trafficAnalysis.reasoning.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
            </div>
            <div class="modal-row">
                <span class="modal-label">Рекомендация:</span>
                <div class="recommendation-box">${escapeHtml(data.trafficAnalysis.recommendation)}</div>
            </div>
        </div>
        ` : ''}

        ${data.hasPedestrianArea ? `
        <div class="modal-section">
            <div class="modal-section-title">🚶 ПЕШЕХОДНЫЕ ЗОНЫ</div>
            <div class="modal-row">
                <span class="modal-label">Тип зоны:</span>
                <span class="modal-value">${data.pedestrianType}</span>
            </div>
            ${data.pedestrianName ? `
            <div class="modal-row">
                <span class="modal-label">Название:</span>
                <span class="modal-value">${escapeHtml(data.pedestrianName)}</span>
            </div>
            ` : ''}
            <div class="modal-row">
                <span class="modal-label">Покрытие поверхности:</span>
                <span class="modal-value">${data.pedestrianSurface}</span>
            </div>
            ${data.pedestrianWidth ? `
            <div class="modal-row">
                <span class="modal-label">Ширина:</span>
                <span class="modal-value">${data.pedestrianWidth} м</span>
            </div>
            ` : ''}
            <div class="modal-row">
                <span class="modal-label">Освещение:</span>
                <span class="modal-value">${data.isLit ? '💡 Присутствует' : '🌑 Отсутствует'}</span>
            </div>
            ${data.allSurfaces && data.allSurfaces.length > 1 ? `
            <div class="modal-row">
                <span class="modal-label">Найдено поверхностей:</span>
                <span class="modal-value">${data.allSurfaces.length}</span>
            </div>
            ` : ''}
        </div>
        ` : ''}

        <div class="modal-section">
            <div class="modal-section-title">🌧️ ОСАДКИ И ПРЕДУПРЕЖДЕНИЯ</div>
            <div class="modal-row">
                <span class="modal-label">Осадки за час:</span>
                <span class="modal-value">${data.precipitation} мм</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Тип осадков:</span>
                <span class="modal-value">${data.precipType || 'Нет'}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Вероятность осадков:</span>
                <span class="modal-value">${data.precipProbability ?? 0}%</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Часов осадков (сут.):</span>
                <span class="modal-value">${data.precipHours ?? 0} ч</span>
            </div>
            ${data.weatherAlerts && data.weatherAlerts.length > 0 ?
                data.weatherAlerts.map(a => `
                <div class="modal-row">
                    <span class="modal-label">${a.icon ? a.icon + ' ' : ''}${a.event || a.type || 'Предупреждение'}:</span>
                    <span class="modal-value alert-${a.severity || a.level || 'moderate'}">${a.description}</span>
                </div>`).join('') :
                `<div class="modal-row">
                    <span class="modal-label">Предупреждения:</span>
                    <span class="modal-value">Нет активных</span>
                </div>`
            }
        </div>

        ${data.seismicEvents && data.seismicEvents.length > 0 ? `
        <div class="modal-section">
            <div class="modal-section-title">🌍 СЕЙСМИЧЕСКАЯ АКТИВНОСТЬ (500 км)</div>
            <table style="width:100%; border-collapse: collapse; font-size: 11px;">
                <tr style="color: #00aa00; border-bottom: 1px solid #004400;">
                    <th style="text-align:left; padding: 4px;">Магнитуда</th>
                    <th style="text-align:left; padding: 4px;">Место</th>
                    <th style="text-align:left; padding: 4px;">Глубина</th>
                    <th style="text-align:left; padding: 4px;">Время</th>
                </tr>
                ${data.seismicEvents.map(e => `
                <tr style="border-bottom: 1px dotted #002200;">
                    <td style="padding: 4px;"><span class="magnitude-indicator">M${e.magnitude}</span></td>
                    <td style="padding: 4px; color: #00ff00;">${e.place}</td>
                    <td style="padding: 4px; color: #00ff00;">${e.depth} км</td>
                    <td style="padding: 4px; color: #00ff00;">${e.time}</td>
                </tr>`).join('')}
            </table>
        </div>` : ''}

        <div class="modal-section">
            <div class="modal-section-title">🕐 ВРЕМЯ И ЧАСОВОЙ ПОЯС</div>
            <div class="modal-row">
                <span class="modal-label">Местное время:</span>
                <span class="modal-value">${data.timezone ? getCurrentTimeForTimezone(data.timezone) : data.localTime || 'Н/Д'}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Часовой пояс:</span>
                <span class="modal-value">${data.timezone || 'Н/Д'}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Текущее смещение UTC:</span>
                <span class="modal-value">${data.utcOffset || 'Н/Д'}</span>
            </div>
            ${data.usesDST ? `
            <div class="modal-row">
                <span class="modal-label">Тип времени:</span>
                <span class="modal-value">
                    ${data.currentSeason === 'summer' 
                        ? '☀️ Летнее время (DST)' 
                        : '❄️ Зимнее время (стандартное)'}
                </span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Зимнее время:</span>
                <span class="modal-value">UTC${data.winterOffset}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Летнее время:</span>
                <span class="modal-value">UTC${data.summerOffset}</span>
            </div>
            ` : `
            <div class="modal-row">
                <span class="modal-label">Переход на летнее время:</span>
                <span class="modal-value">Не используется</span>
            </div>
            `}
            ${data.dstStart ? `
            <div class="modal-row">
                <span class="modal-label">Следующий перевод:</span>
                <span class="modal-value">${new Date(data.dstStart).toLocaleString('ru-RU')}</span>
            </div>
            ` : ''}
        </div>

        <div class="modal-section">
            <div class="modal-section-title">🌦️ АСТРОНОМИЯ</div>
            <div class="modal-row">
                <span class="modal-label">🌅 Восход солнца:</span>
                <span class="modal-value">${data.sunriseTime || 'Н/Д'}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">🌇 Закат солнца:</span>
                <span class="modal-value">${data.sunsetTime || 'Н/Д'}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Продолжительность дня:</span>
                <span class="modal-value">${data.dayLength || 'Н/Д'}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Фаза дня:</span>
                <span class="modal-value">${data.dayPhase || 'Н/Д'}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">🌙 Восход луны:</span>
                <span class="modal-value">${data.moonriseTime || 'Н/Д'}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">🌙 Закат луны:</span>
                <span class="modal-value">${data.moonsetTime || 'Н/Д'}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Фаза луны:</span>
                <span class="modal-value">${data.moonPhase || 'Н/Д'}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Освещённость луны:</span>
                <span class="modal-value">${data.moonIllumination ?? 0}%</span>
            </div>
        </div>

        <div class="modal-section">
            <div class="modal-section-title">🛰️ GPS ДАННЫЕ</div>
            <div class="modal-row">
                <span class="modal-label">Широта:</span>
                <span class="modal-value">${data.latitude}°</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Долгота:</span>
                <span class="modal-value">${data.longitude}°</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Высота над уровнем моря:</span>
                <span class="modal-value">${data.elevation} м</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Время сканирования:</span>
                <span class="modal-value">${data.scanTime}</span>
            </div>
        </div>

        ${data.quality ? `
        <div class="modal-section">
            <div class="modal-section-title">📊 КАЧЕСТВО ДАННЫХ</div>
            <div class="quality-indicator-large ${getQualityColorClass(data.quality.grade)}">
                <div class="quality-stars-large">${'⭐'.repeat(data.quality.stars)}${'☆'.repeat(5 - data.quality.stars)}</div>
                <div class="quality-score">${data.quality.score} / 100 баллов</div>
                <div class="quality-grade">${getQualityLabel(data.quality.grade)}</div>
                ${data.quality.missingFields.length > 0 ? `
                <div class="quality-issues">
                    <div class="quality-issues-title">Отсутствующие данные:</div>
                    <ul>
                        ${data.quality.missingFields.map(f => `<li>${f}</li>`).join('')}
                    </ul>
                </div>
                ` : `
                <div class="quality-success">✅ Все основные данные получены</div>
                `}
                ${data.quality.score < 80 ? `
                <button class="rescan-button" onclick="rescanCurrentLocation(); closeModal();">
                    🔄 Пересканировать с улучшенными параметрами
                </button>
                ` : ''}
            </div>
        </div>
        ` : ''}
    `;

    // Event delegation for hazard-action buttons in modal
    body.querySelectorAll('.hazard-action-btn[data-layer]').forEach(btn => {
        btn.addEventListener('click', () => { focusOnLayer(btn.dataset.layer); closeModal(); });
    });

    overlay.classList.add('active');
    if (isMobile) {
        document.body.style.overflow = 'hidden';
    }
}

export function closeModal(event) {
    if (!event || event.target === document.getElementById('modalOverlay')) {
        document.getElementById('modalOverlay').classList.remove('active');
        document.body.style.overflow = '';
    }
}

export function openModalById(index) {
    if (markers[index]) {
        openModal(markers[index].data);
    }
}

export function createBriefSurfaceInfo(surfaceData) {
    if (!surfaceData) return '';
    const warningText = surfaceData.brakeIncrease > 0
        ? `Тормозной путь +${Math.round(60 * surfaceData.brakeIncrease / 100)}м`
        : 'Нормальные условия';
    const color = getSeverityColor(surfaceData.severity);
    const confidence = surfaceData.confidence || {};
    return `
        <div class="surface-brief">
            <div class="surface-brief-header">
                <span class="surface-icon-brief">${surfaceData.icon}</span>
                <span class="surface-title-brief" style="color:${color}">${escapeHtml(surfaceData.name)}</span>
                ${confidence.overall ? `<span class="confidence-badge ${confidence.overall.level}">${confidence.overall.icon} ${confidence.overall.label}</span>` : ''}
            </div>
            <div class="surface-warning-brief">${escapeHtml(warningText)}</div>
        </div>
    `;
}

export function createDetailedSurfaceInfo(surfaceData) {
    if (!surfaceData) return '<p>Данные недоступны</p>';

    const pa = surfaceData.precipAnalysisDetailed || {};
    const da = surfaceData.dryingAnalysis || {};
    const st = surfaceData.surfaceType || {};
    const cov = surfaceData.coverage || {};
    const di = surfaceData.drivingImpact || {};
    const fc = surfaceData.forecast || {};
    const bd = surfaceData.brakingDistances || {};
    const aq = surfaceData.aquaplaning || {};
    const color = getSeverityColor(surfaceData.severity);

    // Minutely precipitation bar (max 60 minutes, up to 10 bars)
    const minutelyData = pa.minutelyData || [];
    const minutelyBar = minutelyData.length > 0 ? (() => {
        const step = Math.max(1, Math.floor(minutelyData.length / 10));
        const samples = minutelyData.filter((_, i) => i % step === 0 && Math.floor(i / step) < 10);
        const maxP = Math.max(...samples.map(m => m.precipitation || 0), 0.01);
        const bars = ['▁','▂','▃','▄','▅','▆','▇','█'];
        return samples.map(m => {
            const idx = Math.min(bars.length - 1, Math.round(((m.precipitation || 0) / maxP) * (bars.length - 1)));
            return bars[idx];
        }).join('');
    })() : null;

    // Braking distance rows helper
    function brakingRow(label, data, dryDist) {
        if (!data) return '';
        const delta = data.totalDistance - dryDist;
        const deltaStr = delta > 0 ? `+${delta} м` : delta < 0 ? `${delta} м` : '±0 м';
        return `<div class="period-item">
            <span>${label}</span>
            <span>🟢${dryDist} м → <strong>${data.totalDistance} м</strong> (${deltaStr})</span>
        </div>`;
    }

    return `
        <div class="surface-detailed">
            <div class="surface-header-detailed" style="border-left:4px solid ${color};padding-left:10px">
                <span class="surface-icon-large">${surfaceData.icon}</span>
                <div style="flex:1">
                    <div class="surface-state-name" style="color:${color}">${escapeHtml(surfaceData.name)}</div>
                    <div class="surface-state-desc">${escapeHtml(surfaceData.description)}</div>
                </div>
                <div class="danger-badge-large" style="background:${color}">${getSeverityName(surfaceData.severity)}</div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">📊 АНАЛИЗ ОСАДКОВ</div>
                ${pa.precipType && pa.precipType !== 'Нет' ? `
                <div class="precip-type-row">
                    <span>Тип осадков: <strong>${escapeHtml(pa.precipType)}</strong></span>
                    ${pa.precipIntensityClass ? `<span class="precip-intensity-badge">${escapeHtml(pa.precipIntensityClass)}</span>` : ''}
                </div>` : ''}
                <div class="precip-periods">
                    <div class="period-item"><span>Последний час</span><span>${pa.total1h ?? 0} мм</span></div>
                    <div class="period-item"><span>Последние 3 ч</span><span>${pa.total3h ?? 0} мм</span></div>
                    <div class="period-item"><span>Последние 6 ч</span><span>${pa.total6h ?? 0} мм</span></div>
                    <div class="period-item"><span>За сутки</span><span>${pa.total24h ?? 0} мм</span></div>
                </div>
                <div class="precip-current">
                    <div class="period-item"><span>Интенсивность</span><span>${(pa.currentIntensity || 0) > 0.1 ? (pa.currentIntensity || 0) + ' мм/ч' + (pa.precipIntensityClass ? ' (' + pa.precipIntensityClass + ')' : '') : 'Нет'}</span></div>
                    <div class="period-item"><span>Последний дождь</span><span>${pa.lastRainText || getHoursText(pa.hoursSinceRain ?? 0)}</span></div>
                    <div class="period-item"><span>Продолжался</span><span>${pa.continuousRainHours ?? 0} ч</span></div>
                </div>
                ${minutelyBar ? `
                <div class="minutely-bar">
                    <div class="minutely-bar-label">Минутный прогноз (60 мин):</div>
                    <div class="minutely-bar-chart">${minutelyBar}</div>
                </div>` : ''}
            </div>

            <div class="detail-section">
                <div class="detail-section-title">🌡️ ТЕМПЕРАТУРНЫЙ АНАЛИЗ</div>
                <div class="temp-grid">
                    <div class="temp-item"><span>Температура воздуха</span><span>${da.airTemp ?? 'Н/Д'}°C</span></div>
                    <div class="temp-item">
                        <span>Температура поверхности</span>
                        <span>${da.surfaceTemp ?? 'Н/Д'}°C${da.surfaceTempCalc ? ` <span class="temp-calc-hint" title="${escapeHtml(da.surfaceTempCalc)}">ℹ️</span>` : ''}</span>
                    </div>
                    <div class="temp-item"><span>Точка росы</span><span>${da.dewpoint ?? 'Н/Д'}°C</span></div>
                    <div class="temp-item"><span>Разница (поверхность - роса)</span><span>${da.tempDiff !== undefined ? (da.tempDiff >= 0 ? '+' : '') + da.tempDiff : 'Н/Д'}°C</span></div>
                </div>
                <div class="temp-status">
                    ${da.iceRisk
                        ? '🔴 РИСК ОБЛЕДЕНЕНИЯ: поверхность ниже 0°C и ниже точки росы!'
                        : da.isAboveDewpoint
                            ? '✅ Поверхность выше точки росы — активное высыхание'
                            : '⚠️ Поверхность близка к точке росы — риск конденсации'}
                </div>
                ${da.surfaceTempCalc ? `<div class="temp-calc-detail">└─ Расчёт: ${escapeHtml(da.surfaceTempCalc)}</div>` : ''}
            </div>

            <div class="detail-section">
                <div class="detail-section-title">☀️ УСЛОВИЯ ВЫСЫХАНИЯ</div>
                ${da.precipitation6h > 0 ? `
                <div class="drying-water-balance">
                    <div class="period-item"><span>Осадки (6ч)</span><span>${da.precipitation6h} мм</span></div>
                    <div class="period-item"><span>└─ Испарение (1ч)</span><span>−${da.evaporationRate ?? 0} мм</span></div>
                    <div class="period-item"><span>└─ Дренаж (1ч)</span><span>−${da.drainageRate ?? 0} мм</span></div>
                    <div class="period-item"><span>Остаточная вода</span><span><strong>${da.residualWater ?? 0} мм</strong></span></div>
                </div>` : ''}
                <div class="drying-grid">
                    <div class="drying-item"><span>Солнечная радиация</span><span>${da.radiation ?? 0} Вт/м²</span></div>
                    <div class="drying-item"><span>Облачность</span><span>${da.cloudCover ?? 0}%</span></div>
                    <div class="drying-item"><span>Скорость ветра</span><span>${da.windSpeed ?? 0} м/с</span></div>
                    <div class="drying-item"><span>Влажность</span><span>${da.humidity ?? 0}%</span></div>
                </div>
                <div class="evaporation-rate">
                    Скорость испарения: <strong>${da.evaporationRate ?? 0} мм/ч</strong>
                    (${getEvaporationLevel(da.evaporationRate ?? 0)})
                    ${da.vpd !== undefined ? `· VPD: ${da.vpd} кПа` : ''}
                </div>
                ${(da.dryingHours || 0) > 0 ? `
                <div class="drying-forecast">
                    <div>⏱️ Дорога высохнет через ~${da.dryingHours} ч</div>
                    ${da.dryingTime ? `<div>🕐 Ожидаемое время: ${escapeHtml(da.dryingTime)}</div>` : ''}
                </div>` : `<div class="drying-forecast">✅ Поверхность сухая или близка к высыханию</div>`}
            </div>

            <div class="detail-section">
                <div class="detail-section-title">🛣️ ХАРАКТЕРИСТИКИ ПОКРЫТИЯ</div>
                <div class="surface-type-grid">
                    <div class="period-item"><span>Тип покрытия</span><span>${escapeHtml(getSurfaceTypeName(st.type || ''))}</span></div>
                    <div class="period-item"><span>Дренаж</span><span>${getDrainageName(st.drainage || 'good')}</span></div>
                    <div class="period-item"><span>Текстура</span><span>${getTextureName(st.texture || 'medium')}</span></div>
                </div>
                <div class="coverage-details">
                    <div class="period-item"><span>Основная часть</span><span>${getCoverageDescription(cov.mainCoverage || 'dry')}</span></div>
                    <div class="period-item"><span>Остаточная влага</span><span>${cov.depthMm ?? 0} мм</span></div>
                    <div class="period-item"><span>Испарилось</span><span>${cov.evaporatedMm ?? 0} мм</span></div>
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">🚗 ВЛИЯНИЕ НА ДВИЖЕНИЕ</div>
                ${bd.frictionCoefficient !== undefined ? `
                <div class="friction-info">
                    <span>Коэффициент сцепления: <strong>${bd.frictionCoefficient}</strong></span>
                    ${bd.dryFriction ? `<span class="friction-dry">(сухое: ${bd.dryFriction} · снижение: −${Math.round((1 - bd.frictionCoefficient / bd.dryFriction) * 100)}%)</span>` : ''}
                </div>` : ''}
                <div class="impact-grid-detailed">
                    <div class="impact-box">
                        <div class="impact-box-icon">🛑</div>
                        <div class="impact-box-label">Тормозной путь</div>
                        <div class="impact-box-value">${di.normalBrakingM ?? 60}→${di.newBrakingM ?? 60} м</div>
                        <div class="impact-box-delta">${(() => { const d = (di.newBrakingM || 60) - (di.normalBrakingM || 60); return d > 0 ? '+' + d : d < 0 ? String(d) : '±0'; })() } м</div>
                    </div>
                    <div class="impact-box">
                        <div class="impact-box-icon">🚗</div>
                        <div class="impact-box-label">Скорость</div>
                        <div class="impact-box-value">${di.normalSpeed ?? 90}→${di.safeSpeed ?? 90} км/ч</div>
                        <div class="impact-box-delta">${(di.speedReductionKmh || 0) > 0 ? '-' : ''}${di.speedReductionKmh ?? 0} км/ч</div>
                    </div>
                    <div class="impact-box">
                        <div class="impact-box-icon">🎯</div>
                        <div class="impact-box-label">Сцепление</div>
                        <div class="impact-box-value">${escapeHtml(di.gripLevel ?? 'Нормальное')}</div>
                    </div>
                    <div class="impact-box">
                        <div class="impact-box-icon">⚡</div>
                        <div class="impact-box-label">Реакция колёс</div>
                        <div class="impact-box-value">${escapeHtml(di.responseLevel ?? 'Хорошая')}</div>
                    </div>
                </div>
                ${bd.at60kmh || bd.at90kmh || bd.at120kmh ? `
                <div class="braking-table">
                    <div class="braking-table-title">Тормозной путь по скоростям:</div>
                    ${brakingRow('60 км/ч', bd.at60kmh, bd.at60kmh?.dryDistance ?? 0)}
                    ${brakingRow('90 км/ч', bd.at90kmh, bd.at90kmh?.dryDistance ?? 0)}
                    ${brakingRow('120 км/ч', bd.at120kmh, bd.at120kmh?.dryDistance ?? 0)}
                </div>` : ''}
                ${aq.risk ? `
                <div class="aquaplaning-risk ${aq.risk}">
                    <div class="aquaplaning-title">💦 РИСК АКВАПЛАНИРОВАНИЯ</div>
                    <div class="period-item"><span>Критическая скорость</span><span>${aq.criticalSpeed} км/ч</span></div>
                    <div class="period-item"><span>Глубина воды</span><span>~${aq.waterDepth} мм</span></div>
                    <div class="aquaplaning-level ${aq.risk}">
                        ${aq.risk === 'high' ? '🔴 ВЫСОКИЙ — немедленно снизьте скорость!'
                          : aq.risk === 'moderate' ? '🟡 УМЕРЕННЫЙ — соблюдайте осторожность'
                          : '🟢 Низкий'}
                    </div>
                </div>` : ''}
            </div>

            <div class="detail-section">
                <div class="detail-section-title">👥 РЕКОМЕНДАЦИИ</div>
                <div class="recommendations-detailed">
                    <div class="rec-category">
                        <span>🚗 Водителям:</span>
                        <ul>${(surfaceData.recommendations || []).map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
                    </div>
                    <div class="rec-category"><span>🏍️ Мотоциклы:</span> <span>${escapeHtml(di.motorcycleRisk ?? '⚠️ Осторожно')}</span></div>
                    <div class="rec-category"><span>🚴 Велосипеды:</span> <span>${escapeHtml(di.bicycleRisk ?? '⚠️ Осторожно')}</span></div>
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">🚶 ДЛЯ ПЕШЕХОДОВ</div>
                <div class="pedestrian-warning-box" style="border-left:4px solid ${color}">
                    <div class="warning-icon">${getSeverityIcon(surfaceData.severity)}</div>
                    <div class="warning-text">${escapeHtml(surfaceData.forPedestrians || 'Нормальные условия')}</div>
                </div>
                ${currentMarkerData && currentMarkerData.hasPedestrianArea ? `
                <div class="pedestrian-info-box">
                    <div class="pedestrian-info-title">📍 Ближайшая пешеходная зона:</div>
                    <div class="pedestrian-info-item">
                        <span class="info-icon">🚶</span>
                        <span>${escapeHtml(currentMarkerData.pedestrianType)}${currentMarkerData.pedestrianName ? ' "' + escapeHtml(currentMarkerData.pedestrianName) + '"' : ''}</span>
                    </div>
                    <div class="pedestrian-info-item">
                        <span class="info-icon">🛤️</span>
                        <span>Покрытие: ${escapeHtml(currentMarkerData.pedestrianSurface)}</span>
                    </div>
                    ${currentMarkerData.isLit ? `
                    <div class="pedestrian-info-item">
                        <span class="info-icon">💡</span>
                        <span>Освещение присутствует</span>
                    </div>
                    ` : `
                    <div class="pedestrian-info-item">
                        <span class="info-icon">🌑</span>
                        <span>Освещение отсутствует — используйте фонарик</span>
                    </div>
                    `}
                </div>
                ` : ''}
            </div>

            ${surfaceData.surfaceForecast && surfaceData.surfaceForecast.length > 0 ? `
            <div class="detail-section">
                <div class="detail-section-title">📈 ПРОГНОЗ СОСТОЯНИЯ (6 ЧАСОВ)</div>
                <div class="trend-info">
                    <span class="trend-indicator">${fc.trendIcon ?? '→'}</span>
                    <span>Тренд: ${escapeHtml(fc.trend ?? 'Стабильно')}</span>
                    ${fc.futureRainMm > 0 ? `<span>· Ожидается ${fc.futureRainMm} мм</span>` : ''}
                </div>
                <div class="surface-forecast-table">
                    ${surfaceData.surfaceForecast.map((f, i) => `
                    <div class="forecast-hour-row">
                        <span class="forecast-hour">${i === 0 ? 'Сейчас' : '+' + i + 'ч'} (${String(f.hour).padStart(2, '0')}:00)</span>
                        <span class="forecast-condition">${escapeHtml(f.condition)}</span>
                        ${f.rain > 0 ? `<span class="forecast-rain">${f.rain} мм</span>` : '<span></span>'}
                        <span class="forecast-temp">${f.temp}°C</span>
                    </div>`).join('')}
                </div>
            </div>
            ` : `
            <div class="detail-section">
                <div class="detail-section-title">📈 ДИНАМИКА СОСТОЯНИЯ</div>
                <div class="trend-info">
                    <span class="trend-indicator">${fc.trendIcon ?? '→'}</span>
                    <span>Тренд: ${escapeHtml(fc.trend ?? 'Стабильно')}</span>
                </div>
                <div class="period-item">
                    <span>Ожидаемые осадки (6ч)</span>
                    <span>${fc.futureRainMm ?? 0} мм</span>
                </div>
                <div class="period-item">
                    <span>Прогноз</span>
                    <span>${escapeHtml(fc.futureCondition ?? surfaceData.name)}</span>
                </div>
            </div>`}

            ${surfaceData.multiPointData ? `
            <div class="detail-section">
                <div class="detail-section-title">📊 МНОГОТОЧЕЧНЫЙ АНАЛИЗ</div>
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">Точек данных:</span>
                        <span class="info-value">${surfaceData.multiPointData.dataPoints}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Радиус:</span>
                        <span class="info-value">${surfaceData.multiPointData.radius}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Однородность:</span>
                        <span class="info-value">${surfaceData.multiPointData.uniformity.icon} ${surfaceData.multiPointData.uniformity.label}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Разброс:</span>
                        <span class="info-value">±${surfaceData.multiPointData.uniformity.waterStdDev} мм</span>
                    </div>
                </div>
            </div>
            ` : ''}

            ${surfaceData.soilData ? `
            <div class="detail-section">
                <div class="detail-section-title">🌱 СОСТОЯНИЕ ПОЧВЫ</div>
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">Влажность:</span>
                        <span class="info-value">${surfaceData.soilData.moistureLevel.icon} ${surfaceData.soilData.soilMoisture}% (${surfaceData.soilData.moistureLevel.name})</span>
                    </div>
                    ${surfaceData.soilData.soilTemp !== null ? `
                    <div class="info-item">
                        <span class="info-label">Температура почвы:</span>
                        <span class="info-value">${surfaceData.soilData.soilTemp}°C</span>
                    </div>
                    ` : ''}
                    <div class="info-item">
                        <span class="info-label">Проходимость пешком:</span>
                        <span class="info-value">${surfaceData.soilData.walkability.icon} ${surfaceData.soilData.walkability.label}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Проезд авто:</span>
                        <span class="info-value">${surfaceData.soilData.driveability.icon} ${surfaceData.soilData.driveability.label}</span>
                    </div>
                </div>
                ${surfaceData.soilData.warnings.length > 0 ? `
                <div class="warnings-box">
                    ${surfaceData.soilData.warnings.map(w => `<div class="warning-item">${w}</div>`).join('')}
                </div>
                ` : ''}
            </div>
            ` : ''}

            ${surfaceData.correctedValues?.mlCorrections?.length > 0 ? `
            <div class="detail-section">
                <div class="detail-section-title">🤖 ML-КОРРЕКЦИИ ПОВЕРХНОСТИ</div>
                <div class="corrections-list">
                    ${surfaceData.correctedValues.mlCorrections.map(c => `
                        <div class="correction-item">
                            <span class="correction-icon">${c.icon}</span>
                            <span class="correction-label">${c.label}:</span>
                            <span class="correction-value">${c.value}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            ${surfaceData.confidence ? `
            <div class="detail-section">
                <div class="detail-section-title">🎯 ТОЧНОСТЬ ДАННЫХ О ПОВЕРХНОСТИ</div>
                <div class="confidence-overall">
                    <span class="confidence-badge-large ${surfaceData.confidence.overall.level}">
                        ${surfaceData.confidence.overall.icon} ${surfaceData.confidence.overall.label} (${surfaceData.confidence.overall.score}%)
                    </span>
                </div>
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">Остаточная вода:</span>
                        <span class="info-value">${surfaceData.confidence.residualWater?.icon || ''} ${surfaceData.confidence.residualWater?.margin || ''}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Время высыхания:</span>
                        <span class="info-value">${surfaceData.confidence.dryingTime?.icon || ''} ${surfaceData.confidence.dryingTime?.margin || ''}</span>
                    </div>
                </div>
            </div>
            ` : ''}

            <div class="danger-badge-large" style="background:${color}">
                Уровень опасности: ${getSeverityName(surfaceData.severity)}
            </div>
        </div>
    `;
}

export function showDetailedSurfaceModal() {
    if (!currentMarkerData || !currentMarkerData.surfaceCondition) return;
    const modal = document.getElementById('surfaceDetailModal');
    const content = document.getElementById('surfaceDetailContent');
    if (!modal || !content) return;
    content.innerHTML = createDetailedSurfaceInfo(currentMarkerData.surfaceCondition);
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

export function closeSurfaceDetailModal() {
    const modal = document.getElementById('surfaceDetailModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
}

export function openPressureDetailModal(pressureData, fullData) {
    const modal = document.getElementById('pressureDetailModal');
    const content = document.getElementById('pressureDetailContent');

    if (!modal || !content) {
        console.error('Модальное окно давления не найдено');
        return;
    }

    content.innerHTML = createDetailedPressureInfo(pressureData, fullData);
    modal.classList.add('active');

    if (isMobile) {
        document.body.style.overflow = 'hidden';
    }
}

export function closePressureDetailModal() {
    const modal = document.getElementById('pressureDetailModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

export function createDetailedPressureInfo(pressureAnalysis, fullData) {
    if (!pressureAnalysis || !fullData) {
        return '<p>Данные о давлении недоступны</p>';
    }

    const pa = pressureAnalysis;
    const color = pa.color || '#888888';
    const pressure = fullData.pressure;

    return `
        <div class="pressure-detailed">
            <div class="pressure-header-detailed" style="border-left:4px solid ${color};padding-left:10px">
                <span class="pressure-icon-large">🌡️</span>
                <div style="flex:1">
                    <div class="pressure-value-large">${pressure} гПа</div>
                    <div class="pressure-mmhg">${pa.mmHg} мм рт. ст.</div>
                    <div class="pressure-level" style="color:${color}">${escapeHtml(pa.levelName)}</div>
                </div>
                <div class="pressure-trend-badge" style="background:${color}">
                    ${pa.trendIcon} ${escapeHtml(pa.trend)}
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">📏 ШКАЛА АТМОСФЕРНОГО ДАВЛЕНИЯ</div>
                <div class="pressure-scale">
                    <div class="scale-item ${pa.level === 'very_low' ? 'scale-active' : ''}">
                        <div class="scale-bar" style="background:#ff4444"></div>
                        <div class="scale-label">&lt;980 гПа</div>
                        <div class="scale-name">Очень низкое</div>
                    </div>
                    <div class="scale-item ${pa.level === 'low' ? 'scale-active' : ''}">
                        <div class="scale-bar" style="background:#ff6600"></div>
                        <div class="scale-label">980-1000 гПа</div>
                        <div class="scale-name">Низкое</div>
                    </div>
                    <div class="scale-item ${pa.level === 'normal' ? 'scale-active' : ''}">
                        <div class="scale-bar" style="background:#00ff00"></div>
                        <div class="scale-label">1000-1020 гПа</div>
                        <div class="scale-name">Нормальное</div>
                    </div>
                    <div class="scale-item ${pa.level === 'high' ? 'scale-active' : ''}">
                        <div class="scale-bar" style="background:#ffaa00"></div>
                        <div class="scale-label">1020-1040 гПа</div>
                        <div class="scale-name">Повышенное</div>
                    </div>
                    <div class="scale-item ${pa.level === 'very_high' ? 'scale-active' : ''}">
                        <div class="scale-bar" style="background:#ff4444"></div>
                        <div class="scale-label">&gt;1040 гПа</div>
                        <div class="scale-name">Очень высокое</div>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">🌦️ ПРОГНОЗ ПОГОДЫ</div>
                <div class="weather-forecast-box">
                    ${escapeHtml(pa.weatherForecast)}
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">🏥 ВЛИЯНИЕ НА ЗДОРОВЬЕ</div>
                <div class="health-effects-list">
                    ${pa.healthEffects && pa.healthEffects.length > 0
                        ? pa.healthEffects.map(effect => `
                            <div class="health-effect-item">
                                <span class="effect-icon">•</span>
                                <span class="effect-text">${escapeHtml(effect)}</span>
                            </div>
                        `).join('')
                        : '<div class="health-effect-item">Нет особого влияния</div>'
                    }
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">ℹ️ ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ</div>
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">Единицы измерения:</span>
                        <span class="info-value">гПа (гектопаскали)</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">1 гПа =</span>
                        <span class="info-value">0.75 мм рт. ст.</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Среднее давление:</span>
                        <span class="info-value">1013 гПа (760 мм рт. ст.)</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Ваше давление:</span>
                        <span class="info-value" style="color:${color}">${escapeHtml(pa.levelName)}</span>
                    </div>
                </div>
            </div>

            ${pa.healthEffects && pa.healthEffects.length > 0 ? `
            <div class="detail-section">
                <div class="detail-section-title">💡 РЕКОМЕНДАЦИИ</div>
                <div class="recommendations-box">
                    ${pa.level === 'very_low' || pa.level === 'low'
                        ? `
                        <div class="recommendation-item">☕ Пейте больше жидкости и кофе для повышения тонуса</div>
                        <div class="recommendation-item">🚶 Избегайте резких движений и физических нагрузок</div>
                        <div class="recommendation-item">😴 Обеспечьте полноценный сон</div>
                        `
                        : pa.level === 'very_high' || pa.level === 'high'
                        ? `
                        <div class="recommendation-item">💊 Гипертоникам: принимайте назначенные препараты</div>
                        <div class="recommendation-item">🧘 Избегайте стрессов и физических перегрузок</div>
                        <div class="recommendation-item">🚭 Ограничьте кофеин и алкоголь</div>
                        `
                        : `<div class="recommendation-item">✅ Давление в норме — противопоказаний нет</div>`
                    }
                </div>
            </div>
            ` : ''}
        </div>
    `;
}

export function displayFullInfo(data) {
    setCurrentMarkerData(data);
    const content = document.getElementById('infoContent');
    const markerIndex = markers.length - 1;
    const tempStatus = data.temp > 20 ? 'status-good' : data.temp > 0 ? 'status-warning' : 'status-bad';
    const weatherIcon = getWeatherIcon(data.weatherCode);

    content.innerHTML = `
        <div class="info-section">
            <div class="section-title">📍 МЕСТОПОЛОЖЕНИЕ</div>
            ${data.objectName ? `
            <div class="info-row">
                <span class="info-label">Объект:</span>
                <span class="info-value">${escapeHtml(data.objectName)}</span>
            </div>
            ` : ''}
            <div class="info-row">
                <span class="info-label">Адрес:</span>
                <span class="info-value">${data.road}${data.houseNumber ? ', ' + escapeHtml(data.houseNumber) : ''}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Город:</span>
                <span class="info-value">${data.city}</span>
            </div>
            <div class="gps-coords">
                LAT: ${data.latitude}° | LNG: ${data.longitude}°
            </div>
        </div>

        ${data.hazards && data.hazards.filter(h => h.severity === 'critical' || h.severity === 'high').length > 0 ? `
        <div class="info-section hazards-section">
            <div class="section-title">⚠️ ОПАСНОСТИ <span class="hazards-count">${data.hazards.filter(h => h.severity === 'critical' || h.severity === 'high').length}</span></div>
            ${data.hazards.filter(h => h.severity === 'critical' || h.severity === 'high').map(h => `
            <div class="hazard-item severity-${h.severity}">
                <div class="hazard-header">
                    <span class="hazard-icon">${h.icon}</span>
                    <span class="hazard-title">${escapeHtml(h.title)}</span>
                    <span class="hazard-badge">${getSeverityName(h.severity)}</span>
                </div>
                <div class="hazard-details">
                    <div class="hazard-value${h.severity === 'critical' ? ' hazard-critical' : ''}">${escapeHtml(h.value)}</div>
                </div>
                ${h.layerName ? `<button class="hazard-action-btn" data-layer="${escapeHtml(h.layerName)}">▶ Показать на карте</button>` : ''}
            </div>`).join('')}
        </div>` : ''}

        <div class="info-section">
            <div class="section-title">${weatherIcon} ПОГОДА</div>
            <div class="info-row">
                <span class="info-label">Температура:</span>
                <span class="info-value">
                    <span class="status-indicator ${tempStatus}"></span>${data.temp}°C
                    ${data.confidence?.temp ? `<span class="confidence-badge ${data.confidence.temp.level}">${data.confidence.temp.icon} ${data.confidence.temp.label}${data.confidence.temp.margin ? ` (${data.confidence.temp.margin})` : ''}</span>` : ''}
                </span>
            </div>
            <div class="info-row">
                <span class="info-label">Ощущается:</span>
                <span class="info-value">${data.feelsLike}°C</span>
            </div>
            <div class="info-row">
                <span class="info-label">Условия:</span>
                <span class="info-value">${data.condition}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Влажность:</span>
                <span class="info-value">${data.humidity}%</span>
            </div>
            <div class="info-row">
                <span class="info-label">Ветер:</span>
                <span class="info-value">${data.windSpeed} м/с ${getWindDirection(data.windDir)}${data.confidence?.windSpeed ? ` <span class="confidence-badge ${data.confidence.windSpeed.level}">${data.confidence.windSpeed.icon} ${data.confidence.windSpeed.label}${data.confidence.windSpeed.margin ? ` (${data.confidence.windSpeed.margin})` : ''}</span>` : ''}</span>
            </div>
            <div class="info-row" style="cursor:pointer" onclick="openPressureDetailModal(${JSON.stringify(data.pressureAnalysis).replace(/"/g, '&quot;')}, ${JSON.stringify({pressure: data.pressure}).replace(/"/g, '&quot;')})">
                <span class="info-label">Давление:</span>
                <span class="info-value">${data.pressure} гПа (${data.pressureAnalysis.trendIcon} ${data.pressureAnalysis.trend})${data.confidence?.pressure ? ` <span class="confidence-badge ${data.confidence.pressure.level}">${data.confidence.pressure.icon} ${data.confidence.pressure.label}</span>` : ''}</span>
            </div>
            ${data.precipitation > 0 ? `
            <div class="info-row">
                <span class="info-label">Осадки:</span>
                <span class="info-value">${data.precipitation} мм (${data.precipType})${data.confidence?.precipitation ? ` <span class="confidence-badge ${data.confidence.precipitation.level}">${data.confidence.precipitation.icon} ${data.confidence.precipitation.label}${data.confidence.precipitation.margin ? ` (${data.confidence.precipitation.margin})` : ''}</span>` : ''}</span>
            </div>` : ''}
            ${data.precipitationWarning ? `
            <div class="info-row">
                <span class="info-label">⚠️ Осадки:</span>
                <span class="info-value">${data.precipitationWarning}</span>
            </div>` : ''}
            ${data.metarStation ? `
            <div class="info-row metar-badge">
                <span class="info-label">✈️ Данные с аэропорта:</span>
                <span class="info-value">${data.metarStation} (${data.metarDistance} км)</span>
            </div>` : ''}

            ${data.flightCategory ? `
            <div class="info-row">
                <span class="info-label">🛫 Категория полётов:</span>
                <span class="info-value">
                    <span class="flight-category ${data.flightCategory.toLowerCase()}">${getFlightCategoryLabel(data.flightCategory)}</span>
                </span>
            </div>` : ''}

            ${data.windGust ? `
            <div class="info-row">
                <span class="info-label">💨 Порывы ветра:</span>
                <span class="info-value">${data.windGust} м/с</span>
            </div>` : ''}

            ${data.weatherDecoded ? `
            <div class="info-row">
                <span class="info-label">🌦️ Погодные явления:</span>
                <span class="info-value">${data.weatherDecoded}</span>
            </div>` : ''}

            ${data.vertVisibility ? `
            <div class="info-row">
                <span class="info-label">⬆️ Вертикальная видимость:</span>
                <span class="info-value">${data.vertVisibility} м</span>
            </div>` : ''}

            ${data.cloudLayers && data.cloudLayers.length > 0 ? `
            <div class="info-row">
                <span class="info-label">☁️ Слои облачности:</span>
                <div class="cloud-layers">
                    ${data.cloudLayers.map(layer => `
                        <div class="cloud-layer">
                            ${getCloudCoverLabel(layer.cover)} на высоте ${layer.base_m} м (${layer.base_ft} ft)
                        </div>
                    `).join('')}
                </div>
            </div>` : ''}

            ${data.metarElevation ? `
            <div class="info-row">
                <span class="info-label">📍 Высота станции:</span>
                <span class="info-value">${data.metarElevation} м</span>
            </div>` : ''}

            ${data.metarRaw ? `
            <div class="info-row">
                <details class="metar-raw-details">
                    <summary class="info-label">📄 Сырой METAR</summary>
                    <code class="metar-raw-code">${data.metarRaw}</code>
                </details>
            </div>` : ''}
        </div>

        <div class="info-section">
            <div class="section-title">🚗 ДОРОГИ</div>
            <div class="info-row">
                <span class="info-label">Дорога:</span>
                <span class="info-value">${data.roadName || 'Н/Д'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Тип покрытия:</span>
                <span class="info-value">${data.roadType}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Покрытие:</span>
                <span class="info-value">${data.surfaceCondition?.surfaceTypeAdv?.label || data.surfaceCondition?.surfaceType?.label || 'Асфальт'}</span>
            </div>
            ${data.surfaceCondition?.surfaceTypeAdv ? `
            <div class="info-row">
                <span class="info-label">Материал:</span>
                <span class="info-value">${escapeHtml(data.surfaceCondition.surfaceTypeAdv.material)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Дренаж:</span>
                <span class="info-value">${getDrainageName(data.surfaceCondition.surfaceTypeAdv.drainage)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Пористость:</span>
                <span class="info-value">${Math.round(data.surfaceCondition.surfaceTypeAdv.porosity * 100)}%</span>
            </div>
            <div class="info-row">
                <span class="info-label">Текстура:</span>
                <span class="info-value">${getTextureName(data.surfaceCondition.surfaceTypeAdv.texture)}</span>
            </div>
            ` : ''}
            ${data.maxSpeed ? `
            <div class="info-row">
                <span class="info-label">Макс. скорость:</span>
                <span class="info-value">${data.maxSpeed} км/ч</span>
            </div>
            ` : ''}
        </div>

        ${data.hasPedestrianArea ? `
        <div class="info-section">
            <div class="section-title">🚶 ПЕШЕХОДНЫЕ ЗОНЫ</div>
            <div class="info-row">
                <span class="info-label">Тип:</span>
                <span class="info-value">${data.pedestrianType}</span>
            </div>
            ${data.pedestrianName ? `
            <div class="info-row">
                <span class="info-label">Название:</span>
                <span class="info-value">${escapeHtml(data.pedestrianName)}</span>
            </div>
            ` : ''}
            <div class="info-row">
                <span class="info-label">Покрытие:</span>
                <span class="info-value">${data.pedestrianSurface}</span>
            </div>
            ${data.pedestrianWidth ? `
            <div class="info-row">
                <span class="info-label">Ширина:</span>
                <span class="info-value">${data.pedestrianWidth} м</span>
            </div>
            ` : ''}
            <div class="info-row">
                <span class="info-label">Освещение:</span>
                <span class="info-value">${data.isLit ? '💡 Есть' : '🌑 Нет'}</span>
            </div>
        </div>
        ` : ''}

        ${data.precipAnalysis && data.precipAnalysis.speedReduction !== 0 ? `
        <div class="info-section">
            <div class="section-title">🌧️ ДОРОЖНЫЕ УСЛОВИЯ</div>
            <div class="info-row">
                <span class="info-label">Состояние покрытия:</span>
                <span class="info-value">${data.precipAnalysis.surfaceCondition}</span>
            </div>
            ${data.precipAnalysis.visibilityWarning ? `
            <div class="info-row">
                <span class="info-label">Видимость:</span>
                <span class="info-value alert-warning">${data.precipAnalysis.visibilityWarning}</span>
            </div>` : ''}
            ${data.precipAnalysis.windWarning ? `
            <div class="info-row">
                <span class="info-label">Ветер:</span>
                <span class="info-value alert-warning">${data.precipAnalysis.windWarning}</span>
            </div>` : ''}
            ${data.precipAnalysis.recommendations.slice(0, 3).map(r => `
            <div class="info-row">
                <span class="info-label">💡</span>
                <span class="info-value">${r}</span>
            </div>`).join('')}
        </div>` : ''}

        ${data.surfaceCondition ? `
        <div class="info-section surface-section">
            <div class="section-title">🌆 СОСТОЯНИЕ ПОВЕРХНОСТИ ДОРОГИ</div>
            <div class="surface-analysis">
                <div class="surface-header">
                    <span class="surface-icon">${data.surfaceCondition.icon}</span>
                    <span class="surface-title">${escapeHtml(data.surfaceCondition.name)}</span>
                    ${data.surfaceCondition.severity === 'critical' || data.surfaceCondition.severity === 'high' ? `<span class="surface-danger">${getSeverityName(data.surfaceCondition.severity)}</span>` : ''}
                </div>
                <div class="surface-description">${escapeHtml(data.surfaceCondition.description)}</div>
                <div class="impact-grid">
                    <div class="impact-item"><span>🚦 Тормоза</span><span>+${data.surfaceCondition.brakeIncrease}%</span></div>
                    <div class="impact-item"><span>🚗 Скорость</span><span>-${data.surfaceCondition.speedReduction}%</span></div>
                    <div class="impact-item"><span>📏 Покрытие</span><span>${data.surfaceCondition.coverage?.description || data.surfaceCondition.coverage}</span></div>
                </div>
            </div>
            <button class="surface-detail-btn" onclick="showDetailedSurfaceModal()">
                📊 ПОЛНАЯ ИНФОРМАЦИЯ О ПОВЕРХНОСТИ →
            </button>
        </div>` : ''}

        ${data.surfaceCondition?.microclimate ? `
        <div class="info-section">
            <div class="info-section-title">🌍 МИКРОКЛИМАТ</div>
            <div class="info-row">
                <span class="info-label">Местность:</span>
                <span class="info-value">${escapeHtml(data.surfaceCondition.microclimate.locationLabel)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Поправка температуры:</span>
                <span class="info-value">${data.surfaceCondition.microclimate.urbanHeatIsland >= 0 ? '+' : ''}${data.surfaceCondition.microclimate.urbanHeatIsland}°C</span>
            </div>
        </div>
        ` : ''}

        ${data.surfaceCondition?.seasonalRisks?.length > 0 ? `
        <div class="info-section">
            <div class="info-section-title">🍂 СЕЗОННЫЕ РИСКИ</div>
            ${data.surfaceCondition.seasonalRisks.map(r => `
            <div class="info-row alert-${escapeHtml(r.severity)}">
                <span class="info-label">${r.icon}</span>
                <span class="info-value">${escapeHtml(r.text)}</span>
            </div>`).join('')}
        </div>
        ` : ''}

        ${data.surfaceCondition?.frictionCoef ? `
        <div class="info-section">
            <div class="info-section-title">🚗 ТОРМОЗНОЙ ПУТЬ</div>
            <div class="info-row">
                <span class="info-label">Коэффициент трения (μ):</span>
                <span class="info-value">${data.surfaceCondition.frictionCoef}</span>
            </div>
            <div class="info-row">
                <span class="info-label">60 км/ч:</span>
                <span class="info-value">${data.surfaceCondition.brakingDistances?.at60kmh?.totalDistance ?? '—'} м</span>
            </div>
            <div class="info-row">
                <span class="info-label">90 км/ч:</span>
                <span class="info-value">${data.surfaceCondition.brakingDistances?.at90kmh?.totalDistance ?? '—'} м</span>
            </div>
            <div class="info-row">
                <span class="info-label">120 км/ч:</span>
                <span class="info-value">${data.surfaceCondition.brakingDistances?.at120kmh?.totalDistance ?? '—'} м</span>
            </div>
        </div>
        ` : ''}

        ${data.surfaceCondition?.multiPointAnalysis ? `
        <div class="info-section">
            <div class="info-section-title">📊 МНОГОТОЧЕЧНЫЙ АНАЛИЗ</div>
            <div class="info-row">
                <span class="info-label">Точек данных:</span>
                <span class="info-value">${data.surfaceCondition.multiPointAnalysis.points}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Радиус:</span>
                <span class="info-value">${data.surfaceCondition.multiPointAnalysis.radius}</span>
            </div>
            ${data.surfaceCondition.variability ? `
            <div class="info-row">
                <span class="info-label">Однородность:</span>
                <span class="info-value ${data.surfaceCondition.variability.level === 'uniform' ? 'status-good' : 'status-warning'}">
                    ${escapeHtml(data.surfaceCondition.variability.description)}
                </span>
            </div>
            <div class="info-row">
                <span class="info-label">Разброс:</span>
                <span class="info-value">±${data.surfaceCondition.variability.stdDev} мм</span>
            </div>
            ` : ''}
        </div>
        ` : ''}

        ${data.surfaceCondition?.soilAnalysis ? `
        <div class="info-section">
            <div class="info-section-title">${data.surfaceCondition.soilAnalysis.icon} СОСТОЯНИЕ ПОЧВЫ</div>
            <div class="info-row">
                <span class="info-label">Влажность:</span>
                <span class="info-value">${data.surfaceCondition.soilAnalysis.moisture}% (${escapeHtml(data.surfaceCondition.soilAnalysis.moistureLabel)})</span>
            </div>
            <div class="info-row">
                <span class="info-label">Температура почвы:</span>
                <span class="info-value">${data.surfaceCondition.soilAnalysis.temperature}°C</span>
            </div>
            ${data.surfaceCondition.soilAnalysis.frozen ? `
            <div class="info-row alert-high">
                <span class="info-label">❄️ Промерзание:</span>
                <span class="info-value">~${data.surfaceCondition.soilAnalysis.frostDepth} см</span>
            </div>
            ` : ''}
            <div class="info-row">
                <span class="info-label">Проходимость пешком:</span>
                <span class="info-value">${getWalkabilityLabel(data.surfaceCondition.soilAnalysis.walkability)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Проезд авто:</span>
                <span class="info-value">${getTrafficabilityLabel(data.surfaceCondition.soilAnalysis.vehicleTrafficability)}</span>
            </div>
            ${data.surfaceCondition.soilAnalysis.warnings?.length > 0 ? `
            <div class="info-row">
                <span class="info-label">⚠️ Предупреждения:</span>
            </div>
            ${data.surfaceCondition.soilAnalysis.warnings.map(w => `
                <div class="info-row alert-${escapeHtml(w.severity)}">
                    <span class="info-value">${escapeHtml(w.text)}</span>
                </div>
            `).join('')}
            ` : ''}
        </div>
        ` : ''}

        ${data.surfaceCondition?.confidence ? `
        <div class="info-section">
            <div class="info-section-title">🎯 ТОЧНОСТЬ ДАННЫХ О ПОВЕРХНОСТИ</div>
            <div class="info-row">
                <span class="info-label">Общая уверенность:</span>
                <span class="info-value">
                    ${data.surfaceCondition.confidence.overall.icon} ${escapeHtml(data.surfaceCondition.confidence.overall.label)} (${data.surfaceCondition.confidence.overall.score}%)
                </span>
            </div>
            <div class="info-row">
                <span class="info-label">Остаточная вода:</span>
                <span class="info-value">
                    ${getConfidenceIcon(data.surfaceCondition.confidence.residualWater.level)} ${escapeHtml(data.surfaceCondition.confidence.residualWater.margin)}
                </span>
            </div>
            <div class="info-row">
                <span class="info-label">Время высыхания:</span>
                <span class="info-value">
                    ${getConfidenceIcon(data.surfaceCondition.confidence.dryingTime.level)} ${escapeHtml(data.surfaceCondition.confidence.dryingTime.margin)}
                </span>
            </div>
        </div>
        ` : ''}

        ${data.surfaceCondition?.evaporationCorrectionTerrain || data.surfaceCondition?.evaporationCorrectionNight ? `
        <div class="info-section">
            <div class="info-section-title">🤖 ML-КОРРЕКЦИИ ПОВЕРХНОСТИ</div>
            ${data.surfaceCondition.evaporationCorrectionTerrain ? `
            <div class="info-row">
                <span class="info-label">🌍 Местность:</span>
                <span class="info-value">${data.surfaceCondition.evaporationCorrectionTerrain > 0 ? '+' : ''}${data.surfaceCondition.evaporationCorrectionTerrain}% испарения</span>
            </div>
            ` : ''}
            ${data.surfaceCondition.evaporationCorrectionNight ? `
            <div class="info-row">
                <span class="info-label">🌙 Ночь:</span>
                <span class="info-value">${data.surfaceCondition.evaporationCorrectionNight}% испарения</span>
            </div>
            ` : ''}
            ${data.surfaceCondition.waterAbsorbed ? `
            <div class="info-row">
                <span class="info-label">💧 Впитывание:</span>
                <span class="info-value">-${data.surfaceCondition.waterAbsorbed} мм</span>
            </div>
            ` : ''}
            ${data.surfaceCondition.evaporationCorrectionHeat ? `
            <div class="info-row">
                <span class="info-label">🔥 Жара:</span>
                <span class="info-value">+${data.surfaceCondition.evaporationCorrectionHeat}% испарения</span>
            </div>
            ` : ''}
        </div>
        ` : ''}

        ${data.seismicEvents && data.seismicEvents.length > 0 ? `
        <div class="info-section">
            <div class="section-title">🌍 СЕЙСМИКА (500 км)</div>
            ${data.seismicEvents.slice(0, 3).map(e => `
            <div class="seismic-event">
                <div class="info-row">
                    <span class="info-label">Магнитуда:</span>
                    <span class="info-value"><span class="magnitude-indicator">M${e.magnitude}</span></span>
                </div>
                <div class="info-row">
                    <span class="info-label">Место:</span>
                    <span class="info-value">${e.place}</span>
                </div>
            </div>`).join('')}
        </div>` : ''}

        <div class="info-section">
            <div class="section-title">🕐 ВРЕМЯ</div>
            <div class="info-row">
                <span class="info-label">Местное:</span>
                <span class="info-value">${data.timezone ? getCurrentTimeForTimezone(data.timezone) : data.localTime || 'Н/Д'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">🌅 Восход:</span>
                <span class="info-value">${data.sunriseTime || 'Н/Д'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">🌇 Закат:</span>
                <span class="info-value">${data.sunsetTime || 'Н/Д'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Фаза дня:</span>
                <span class="info-value">${data.dayPhase || 'Н/Д'}</span>
            </div>
        </div>

        ${data.quality ? `
        <div class="info-section">
            <div class="section-title">📊 КАЧЕСТВО ДАННЫХ</div>
            <div class="quality-indicator ${getQualityColorClass(data.quality.grade)}">
                <div class="quality-stars">${'⭐'.repeat(data.quality.stars)}${'☆'.repeat(5 - data.quality.stars)}</div>
                <div class="quality-label">${getQualityLabel(data.quality.grade)} (${data.quality.score}/100)</div>
                ${data.quality.score < 80 ? `
                <button class="rescan-button-small" onclick="rescanCurrentLocation()">
                    🔄 Пересканировать
                </button>` : ''}
            </div>
        </div>` : ''}

        <div class="info-section">
            <button class="control-btn" onclick="openModalById(${markerIndex})" style="width: 100%; margin-top: 10px;">
                [ 📋 ОТКРЫТЬ ПОЛНУЮ ИНФОРМАЦИЮ ]
            </button>
        </div>
    `;

    // Event delegation for hazard-action buttons (avoids inline onclick with dynamic data)
    content.querySelectorAll('.hazard-action-btn[data-layer]').forEach(btn => {
        btn.addEventListener('click', () => focusOnLayer(btn.dataset.layer));
    });

    updateTimestamp();
}

function getFlightCategoryLabel(category) {
    const labels = {
        'VFR': '🟢 VFR (Отличная)',
        'MVFR': '🔵 MVFR (Умеренная)',
        'IFR': '🟠 IFR (Плохая)',
        'LIFR': '🔴 LIFR (Очень плохая)'
    };
    return labels[category] || category;
}

function getCloudCoverLabel(cover) {
    const labels = {
        'CLR': 'Ясно',
        'SKC': 'Ясно',
        'FEW': 'Немного облаков',
        'SCT': 'Рассеянные облака',
        'BKN': 'Облачно с прояснениями',
        'OVC': 'Сплошная облачность'
    };
    return labels[cover] || cover;
}

// Хелперы для классификации OSM
function getClassLabel(className) {
    const labels = {
        'highway': 'Дорога',
        'building': 'Здание',
        'natural': 'Природный объект',
        'amenity': 'Общественное место',
        'leisure': 'Место отдыха',
        'shop': 'Магазин',
        'tourism': 'Туристический объект',
        'waterway': 'Водный путь',
        'railway': 'Железная дорога',
        'aeroway': 'Авиационный объект'
    };
    return labels[className] || className;
}

function getCategoryLabel(category) {
    const labels = {
        'residential': 'Жилая зона',
        'commercial': 'Коммерческая зона',
        'industrial': 'Промышленная зона',
        'park': 'Парк',
        'forest': 'Лес',
        'water': 'Водоём',
        'restaurant': 'Ресторан',
        'cafe': 'Кафе',
        'school': 'Школа',
        'hospital': 'Больница'
    };
    return labels[category] || category;
}

function getImportanceLevel(importance) {
    if (importance >= 0.8) return 'very-high';
    if (importance >= 0.6) return 'high';
    if (importance >= 0.4) return 'medium';
    if (importance >= 0.2) return 'low';
    return 'very-low';
}

function getImportanceIcon(importance) {
    if (importance >= 0.8) return '⭐⭐⭐';
    if (importance >= 0.6) return '⭐⭐';
    if (importance >= 0.4) return '⭐';
    return '◾';
}

function getImportanceText(importance) {
    if (importance >= 0.8) return 'Очень важное место';
    if (importance >= 0.6) return 'Важное место';
    if (importance >= 0.4) return 'Среднее значение';
    if (importance >= 0.2) return 'Локальное значение';
    return 'Малозначимое';
}

function formatArea(area) {
    if (area < 1) return `${Math.round(area * 10000)} см²`;
    if (area < 10000) return `${Math.round(area)} м²`;
    if (area < 1000000) return `${(area / 10000).toFixed(2)} га`;
    return `${(area / 1000000).toFixed(2)} км²`;
}
