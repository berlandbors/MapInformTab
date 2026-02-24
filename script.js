let map;
let markers = [];
let markerCount = 0;
let searchTimeout = null;
let currentMarkerData = null;

// Слои карты
let layerGroups = {};
let connectionLines = [];
let layerStates = { earthquakes: true, fireRisk: true, roadPrecip: true };

// Предыдущее значение давления для определения тенденции
let previousPressure = null;

// Определение мобильного устройства
const isMobile = window.matchMedia("(max-width: 768px)").matches;

// Вспомогательная функция задержки
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Текущие координаты последнего сканирования
let lastScannedCoords = null;

function getDeviceType() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isPortrait = height > width;

    if (width <= 768 && isPortrait) {
        return 'smartphone-portrait';
    } else if (width <= 768 && !isPortrait) {
        return 'smartphone-landscape';
    } else if (width <= 1024) {
        return 'tablet';
    } else {
        return 'desktop';
    }
}

let deviceType = getDeviceType();
let activeMobileTab = 'map';

// Инициализация карты
function initMap() {
    const initialZoom = isMobile ? 11 : 12;
    map = L.map('map', { tap: true }).setView([55.7558, 37.6173], initialZoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    initLayers();

    map.on('click', async function(e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        await scanLocation(lat, lng);
    });
}

// Оценка качества полученных данных
function calculateDataQuality(fullData) {
  const checks = [
    { field: 'road', weight: 15, label: 'улица' },
    { field: 'city', weight: 20, label: 'город' },
    { field: 'country', weight: 15, label: 'страна' },
    { field: 'timezone', weight: 10, label: 'часовой пояс' },
    { field: 'temp', weight: 10, label: 'температура' },
    { field: 'roadName', weight: 10, label: 'название дороги' },
    { field: 'objectName', weight: 5, label: 'объект' },
    { field: 'roadType', weight: 5, label: 'тип дороги' },
    { field: 'localTime', weight: 10, label: 'местное время' }
  ];

  let score = 0;
  const missingFields = [];

  checks.forEach(check => {
    const value = fullData[check.field];
    const isValid = value &&
                    value !== 'Н/Д' &&
                    value !== 'Нет данных' &&
                    value !== 'Ошибка загрузки' &&
                    value !== 'Недоступно';

    if (isValid) {
      score += check.weight;
    } else {
      missingFields.push(check.label);
    }
  });

  return {
    score: score,
    grade: score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor',
    missingFields: missingFields,
    stars: Math.round(score / 20) // 0-5 звезд
  };
}

// Получить метку качества на русском
function getQualityLabel(grade) {
    const labels = {
        'excellent': 'Отлично',
        'good': 'Хорошо',
        'fair': 'Удовлетворительно',
        'poor': 'Низкое'
    };
    return labels[grade] || 'Неизвестно';
}

// Получить цветовой класс для индикатора
function getQualityColorClass(grade) {
    const classes = {
        'excellent': 'quality-excellent',
        'good': 'quality-good',
        'fair': 'quality-fair',
        'poor': 'quality-poor'
    };
    return classes[grade] || '';
}

// Пересканирование текущей локации
async function rescanCurrentLocation() {
    if (!lastScannedCoords) {
        showError('Нет данных для пересканирования');
        return;
    }

    console.log('🔄 Ручное пересканирование с улучшенными параметрами...');
    await scanLocation(lastScannedCoords.lat, lastScannedCoords.lng, true);
}

// Главная функция сканирования локации
async function scanLocation(lat, lng, isRescan = false) {
    markerCount++;
    lastScannedCoords = { lat, lng };
    showLoading();

    try {
        const [weatherData, locationData, roadData, pedestrianData, seismicData, timezoneData] = await Promise.all([
            getWeatherData(lat, lng),
            getLocationData(lat, lng),
            getRoadData(lat, lng),
            getPedestrianData(lat, lng),
            getSeismicData(lat, lng),
            getTimezoneData(lat, lng)
        ]);

        const astronomyData = getAstronomyData(lat, lng, weatherData.timezone);
        const alertsData = getWeatherAlerts(weatherData.weatherCode, weatherData.precipProbability);

        const fullData = {
            ...weatherData,
            ...locationData,
            ...roadData,
            ...pedestrianData,
            ...seismicData,
            ...astronomyData,
            ...alertsData,
            ...timezoneData,
            id: markerCount,
            scanTime: new Date().toLocaleString('ru-RU')
        };

        // Оценка качества данных
        const quality = calculateDataQuality(fullData);
        fullData.quality = quality;

        // Расчёт пожарной опасности и дорожных условий
        fullData.fireRisk = calculateFireRisk(fullData);
        fullData.precipAnalysis = getRoadPrecipAnalysis(fullData);

        // Анализ давления
        fullData.pressureAnalysis = analyzePressure(fullData.pressure);
        console.log(`📊 Анализ давления: ${fullData.pressure} гПа (${fullData.pressureAnalysis.levelName}, ${fullData.pressureAnalysis.trend})`);

        // Анализ состояния поверхности (асинхронно через Open-Meteo API)
        fullData.surfaceCondition = await analyzeSurfaceConditionAdvanced(lat, lng, weatherData);

        // Сбор опасностей
        fullData.hazards = collectHazards(fullData);
        if (fullData.hazards.length > 0) {
            console.log(`⚠️ Обнаружено опасностей: ${fullData.hazards.length}`);
            fullData.hazards.forEach(h => {
                const dot = h.severity === 'critical' ? '🔴' : h.severity === 'high' ? '🟠' : '🟡';
                console.log(`  ${dot} ${h.title} (${h.severity})`);
            });
        }

        console.log(`📊 Качество данных: ${quality.score}/100 (${getQualityLabel(quality.grade)})`);
        console.log(`🚶 Пешеходные зоны: ${fullData.hasPedestrianArea ? 'найдены' : 'не найдены'}`);
        if (fullData.hasPedestrianArea) {
            console.log(`  Тип: ${fullData.pedestrianType}`);
            console.log(`  Покрытие: ${fullData.pedestrianSurface}`);
            console.log(`  Освещение: ${fullData.isLit ? 'Да' : 'Нет'}`);
        }

        // Автоматическое пересканирование при низком качестве (только первый раз)
        if (quality.score < 50 && !isRescan) {
            console.log('⚠️ Низкое качество данных, автоматическое пересканирование...');
            markerCount--;
            showLoading();
            await sleep(1500);
            return scanLocation(lat, lng, true);
        }

        createMarker(lat, lng, fullData);
        displayFullInfo(fullData);
        updateLayersForLocation(lat, lng, fullData);

        // Автоматически переключить на таб "Информация" в мобильном режиме
        if (typeof deviceType !== 'undefined' && deviceType === 'smartphone-portrait') {
            switchMobileTab('info');
        }

    } catch (error) {
        console.error('Ошибка сканирования:', error);
        showError('Ошибка загрузки данных. Попробуйте другую точку.');
    }
}

// Создание маркера с popup
function createMarker(lat, lng, data) {
    const icon = L.divIcon({
        className: 'custom-marker',
        html: '',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -15]
    });

    /*const marker = L.marker([lat, lng], {
        icon: icon,
        riseOnHover: true
    }).addTo(map);*/
    
// ВРЕМЕННОЕ РЕШЕНИЕ ДЛЯ ТЕСТА
const marker = L.marker([lat, lng]).addTo(map); // ← Стандартный синий маркер Leaflet

    
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

    setTimeout(() => {
        marker.openPopup();
    }, 100);

    markers.push({ marker, data });
}

// Создание содержимого popup
function createPopupContent(data) {
    const weatherIcon = getWeatherIcon(data.weatherCode);
    const tempStatus = data.temp > 20 ? 'status-good' : data.temp > 0 ? 'status-warning' : 'status-bad';
    const trafficStatus = getTrafficStatus(data.traffic);
    const markerIndex = markers.length;

    return `
        <div class="popup-title">
            >>> ТОЧКА #${data.id} <<<
        </div>

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
                    <span class="status-indicator ${tempStatus}"></span>${data.temp}°C
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
                <span class="popup-value">${data.windSpeed} м/с</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Давление:</span>
                <span class="popup-value">${data.pressure} гПа</span>
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
            <div class="popup-row">
                <span class="popup-label">Трафик:</span>
                <span class="popup-value">
                    <span class="status-indicator ${trafficStatus}"></span>${data.traffic}
                </span>
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

        ${data.surfaceCondition ? createBriefSurfaceInfo(data.surfaceCondition) : ''}

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

// Открытие модального окна с данными
function openModal(data) {
    const overlay = document.getElementById('modalOverlay');
    const title = document.getElementById('modalTitle');
    const subtitle = document.getElementById('modalSubtitle');
    const body = document.getElementById('modalBody');

    title.textContent = `>>> ТОЧКА #${data.id} <<<`;
    subtitle.textContent = `Сканирование: ${data.scanTime}`;

    const weatherIcon = getWeatherIcon(data.weatherCode);
    const tempStatus = data.temp > 20 ? 'status-good' : data.temp > 0 ? 'status-warning' : 'status-bad';
    const trafficStatus = getTrafficStatus(data.traffic);

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
            ${data.houseNumber ? `
            <div class="modal-row">
                <span class="modal-label">Номер дома:</span>
                <span class="modal-value">${escapeHtml(data.houseNumber)}</span>
            </div>
            ` : ''}
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
        </div>

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
            <div class="modal-row">
                <span class="modal-label">Скорость ветра:</span>
                <span class="modal-value">${data.windSpeed} м/с</span>
            </div>
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
            <div class="modal-row">
                <span class="modal-label">Количество осадков:</span>
                <span class="modal-value">${data.precipitation} мм</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Код погоды:</span>
                <span class="modal-value">${data.weatherCode}</span>
            </div>
        </div>

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
            <div class="modal-row">
                <span class="modal-label">Состояние трафика:</span>
                <span class="modal-value">
                    <span class="status-indicator ${trafficStatus}"></span>${data.traffic}
                </span>
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
                    <span class="modal-label">${a.icon} ${a.type}:</span>
                    <span class="modal-value alert-${a.level}">${a.description}</span>
                </div>`).join('') :
                `<div class="modal-row">
                    <span class="modal-label">Предупреждения:</span>
                    <span class="modal-value">Нет активных</span>
                </div>`
            }
        </div>

        ${data.surfaceCondition ? `
        <div class="modal-section">
            <div class="modal-section-title">🌆 АНАЛИЗ ПОВЕРХНОСТИ ДОРОГИ</div>
            <div class="modal-row">
                <span class="modal-label">Тип/состояние:</span>
                <span class="modal-value">${data.surfaceCondition.icon} ${escapeHtml(data.surfaceCondition.name)}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Описание:</span>
                <span class="modal-value">${escapeHtml(data.surfaceCondition.description)}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Покрытие:</span>
                <span class="modal-value">${data.surfaceCondition.coverage}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Тормозной путь:</span>
                <span class="modal-value">+${data.surfaceCondition.brakeIncrease}%</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Снижение скорости:</span>
                <span class="modal-value">-${data.surfaceCondition.speedReduction}%</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">🚶 Для пешеходов:</span>
                <span class="modal-value">${escapeHtml(data.surfaceCondition.forPedestrians)}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">🚗 Для водителей:</span>
                <span class="modal-value">${escapeHtml(data.surfaceCondition.forDrivers)}</span>
            </div>
            ${data.surfaceCondition.recommendations && data.surfaceCondition.recommendations.length > 0 ?
                data.surfaceCondition.recommendations.map(r => `
                <div class="modal-row">
                    <span class="modal-label">💡</span>
                    <span class="modal-value">${escapeHtml(r)}</span>
                </div>`).join('') : ''}
        </div>` : ''}

        ${data.fireRisk ? `
        <div class="modal-section">
            <div class="modal-section-title">🔥 ПОЖАРНАЯ ОПАСНОСТЬ</div>
            <div class="modal-row">
                <span class="modal-label">Уровень:</span>
                <span class="modal-value" style="color: ${data.fireRisk.color}">${data.fireRisk.description}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Индекс:</span>
                <span class="modal-value">${data.fireRisk.score}/100</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">💡 Рекомендация:</span>
                <span class="modal-value">${data.fireRisk.recommendation}</span>
            </div>
        </div>` : ''}

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
        </div>` : `
        <div class="modal-section">
            <div class="modal-section-title">🌍 СЕЙСМИЧЕСКАЯ АКТИВНОСТЬ (500 км)</div>
            <div class="modal-row">
                <span class="modal-label">Данные:</span>
                <span class="modal-value">Нет сейсмических событий</span>
            </div>
        </div>`}

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

// Закрытие модального окна
function closeModal(event) {
    if (!event || event.target === document.getElementById('modalOverlay')) {
        document.getElementById('modalOverlay').classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Открытие модального окна по индексу маркера
function openModalById(index) {
    if (markers[index]) {
        openModal(markers[index].data);
    }
}

// Получение данных о погоде через Open-Meteo API
async function getWeatherData(lat, lng) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,visibility,uv_index,precipitation,cloud_cover&daily=precipitation_probability_max,precipitation_hours&timezone=auto&wind_speed_unit=ms&forecast_days=1`;
        const response = await fetch(url);
        const data = await response.json();
        const current = data.current;

        return {
            temp: Math.round(current.temperature_2m),
            feelsLike: Math.round(current.apparent_temperature),
            humidity: current.relative_humidity_2m,
            windSpeed: Math.round(current.wind_speed_10m * 10) / 10,
            windDir: current.wind_direction_10m,
            pressure: Math.round(current.surface_pressure),
            visibility: Math.round((current.visibility || 10000) / 1000 * 10) / 10,
            uvIndex: current.uv_index || 0,
            precipitation: current.precipitation || 0,
            cloudCover: current.cloud_cover || 0,
            weatherCode: current.weather_code,
            condition: getWeatherCondition(current.weather_code),
            elevation: Math.round(data.elevation || 0),
            timezone: data.timezone || 'UTC',
            utcOffsetSeconds: data.utc_offset_seconds || 0,
            precipProbability: data.daily?.precipitation_probability_max?.[0] ?? 0,
            precipHours: data.daily?.precipitation_hours?.[0] ?? 0,
            precipType: getPrecipitationType(current.weather_code),
            latitude: Math.round(lat * 10000) / 10000,
            longitude: Math.round(lng * 10000) / 10000
        };
    } catch (error) {
        console.error('Ошибка получения погоды:', error);
        return {
            temp: 'Н/Д', feelsLike: 'Н/Д', humidity: 'Н/Д',
            windSpeed: 'Н/Д', windDir: 0, pressure: 'Н/Д',
            visibility: 'Н/Д', uvIndex: 'Н/Д', precipitation: 'Н/Д',
            cloudCover: 'Н/Д', weatherCode: 0, condition: 'Недоступно',
            elevation: 'Н/Д',
            timezone: 'Н/Д', utcOffsetSeconds: 0,
            precipProbability: 0, precipHours: 0, precipType: 'Нет',
            latitude: Math.round(lat * 10000) / 10000,
            longitude: Math.round(lng * 10000) / 10000
        };
    }
}

// Получение геолокационных данных через Nominatim API с retry
async function getLocationData(lat, lng, attempt = 1) {
    const maxAttempts = 3;

    try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18`;

        const response = await fetch(url, {
            headers: {
                'Accept-Language': 'ru',
                'User-Agent': 'MapInformTab/2.0'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const addr = data.address || {};

        const locationData = {
            road: addr.road || addr.pedestrian || addr.path || addr.footway || 'Нет данных',
            houseNumber: addr.house_number || null,
            city: addr.city || addr.town || addr.village || addr.hamlet || addr.county || 'Нет данных',
            district: addr.suburb || addr.neighbourhood || addr.district || addr.city_district || 'Нет данных',
            state: addr.state || addr.region || 'Нет данных',
            country: addr.country || 'Нет данных',
            postcode: addr.postcode || null,
            displayName: data.display_name || 'Нет данных',
            objectType: data.type || addr.amenity || addr.building || addr.shop || addr.tourism || addr.leisure || null,
            objectName: addr.name || data.name || null
        };

        // Проверка качества данных
        const hasMinimumData = locationData.city !== 'Нет данных' &&
                               locationData.country !== 'Нет данных';

        if (!hasMinimumData && attempt < maxAttempts) {
            console.log(`⚠️ Геолокация попытка ${attempt}: недостаточно данных, повтор...`);
            await sleep(1000 * attempt);
            return getLocationData(lat, lng, attempt + 1);
        }

        return locationData;

    } catch (error) {
        console.error(`Ошибка геолокации (попытка ${attempt}):`, error);

        if (attempt < maxAttempts) {
            console.log(`🔄 Повторный запрос геолокации через ${attempt} сек...`);
            await sleep(1000 * attempt);
            return getLocationData(lat, lng, attempt + 1);
        }

        return {
            road: 'Ошибка загрузки',
            houseNumber: null,
            city: 'Ошибка загрузки',
            district: 'Ошибка загрузки',
            state: 'Ошибка загрузки',
            country: 'Ошибка загрузки',
            postcode: null,
            displayName: 'Ошибка загрузки',
            objectType: null,
            objectName: null
        };
    }
}

// Получение данных о дорогах через Overpass API с каскадным поиском
async function getRoadData(lat, lng, attempt = 1) {
    const radiuses = [100, 250, 500, 1000];
    const radius = radiuses[Math.min(attempt - 1, radiuses.length - 1)];

    try {
        const query = `[out:json][timeout:10];
            way(around:${radius},${lat},${lng})[highway];
            out body 5;`; // Получаем до 5 дорог для выбора лучшей по важности

        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.elements && data.elements.length > 0) {
            // Выбираем лучшую дорогу (с названием и важным типом)
            const bestRoad = data.elements
                .filter(r => r.tags && r.tags.highway)
                .sort((a, b) => {
                    const scoreA = (a.tags.name ? 10 : 0) + getRoadImportance(a.tags.highway);
                    const scoreB = (b.tags.name ? 10 : 0) + getRoadImportance(b.tags.highway);
                    return scoreB - scoreA;
                })[0];

            const tags = bestRoad.tags || {};
            const traffic = estimateTraffic(tags.highway);

            console.log(`✅ Дорога найдена в радиусе ${radius}м: ${tags.name || tags.highway}`);

            return {
                roadName: tags.name || tags['name:ru'] || null,
                roadType: getRoadTypeName(tags.highway),
                maxSpeed: tags.maxspeed ? parseInt(tags.maxspeed) : null,
                roadSurface: getSurfaceName(tags.surface),
                lanes: tags.lanes || null,
                traffic: traffic
            };
        }

        // Если не нашли дороги и есть еще попытки - увеличиваем радиус
        if (attempt < radiuses.length) {
            console.log(`🔍 Дороги не найдены в радиусе ${radius}м, расширяем поиск...`);
            await sleep(500);
            return getRoadData(lat, lng, attempt + 1);
        }

        console.log(`❌ Дороги не найдены в радиусе ${radiuses[radiuses.length - 1]}м`);
        return {
            roadName: null,
            roadType: 'Нет дорог поблизости',
            maxSpeed: null,
            roadSurface: 'Н/Д',
            lanes: null,
            traffic: 'Нет данных'
        };

    } catch (error) {
        console.error('Ошибка получения данных о дорогах:', error);

        if (attempt < radiuses.length) {
            console.log(`🔄 Повторный запрос дорог через 1 сек...`);
            await sleep(1000);
            return getRoadData(lat, lng, attempt + 1);
        }

        return {
            roadName: null,
            roadType: 'Ошибка загрузки',
            maxSpeed: null,
            roadSurface: 'Ошибка',
            lanes: null,
            traffic: 'Нет данных'
        };
    }
}

// Определить важность типа дороги (для выбора лучшей)
function getRoadImportance(highway) {
    const importance = {
        'motorway': 10,
        'trunk': 9,
        'primary': 8,
        'secondary': 7,
        'tertiary': 6,
        'residential': 5,
        'unclassified': 4,
        'service': 3,
        'track': 2,
        'path': 1
    };
    return importance[highway] || 0;
}

// Получение данных о пешеходных поверхностях через Overpass API
async function getPedestrianData(lat, lng, attempt = 1) {
    const radiuses = [100, 250, 500];
    const radius = radiuses[Math.min(attempt - 1, radiuses.length - 1)];

    try {
        const query = `[out:json][timeout:10];
            (
                way(around:${radius},${lat},${lng})[highway~"^(footway|pedestrian|path|cycleway|steps|living_street)$"];
                way(around:${radius},${lat},${lng})[leisure~"^(park|playground)$"];
                way(around:${radius},${lat},${lng})[amenity~"^(plaza|square)$"];
            );
            out body 10;`;

        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.elements && data.elements.length > 0) {
            // Выбираем ближайшую пешеходную поверхность
            const pedestrianSurfaces = data.elements
                .filter(e => e.tags)
                .map(e => ({
                    type: e.tags.highway || e.tags.leisure || e.tags.amenity,
                    name: e.tags.name || e.tags['name:ru'] || null,
                    surface: e.tags.surface || null,
                    width: e.tags.width || null,
                    lit: e.tags.lit || null,
                    tags: e.tags
                }));

            const bestSurface = pedestrianSurfaces[0];

            console.log(`✅ Пешеходная поверхность найдена в радиусе ${radius}м: ${bestSurface.type}`);

            return {
                hasPedestrianArea: true,
                pedestrianType: getPedestrianTypeName(bestSurface.type),
                pedestrianName: bestSurface.name,
                pedestrianSurface: getSurfaceName(bestSurface.surface),
                pedestrianWidth: bestSurface.width,
                isLit: bestSurface.lit === 'yes',
                allSurfaces: pedestrianSurfaces
            };
        }

        // Если не нашли и есть еще попытки
        if (attempt < radiuses.length) {
            console.log(`🔍 Пешеходные зоны не найдены в радиусе ${radius}м, расширяем поиск...`);
            await sleep(500);
            return getPedestrianData(lat, lng, attempt + 1);
        }

        console.log(`❌ Пешеходные зоны не найдены в радиусе ${radiuses[radiuses.length - 1]}м`);
        return {
            hasPedestrianArea: false,
            pedestrianType: 'Нет данных',
            pedestrianName: null,
            pedestrianSurface: 'Н/Д',
            pedestrianWidth: null,
            isLit: false,
            allSurfaces: []
        };

    } catch (error) {
        console.error('Ошибка получения данных о пешеходных зонах:', error);

        if (attempt < radiuses.length) {
            console.log(`🔄 Повторный запрос пешеходных зон через 1 сек...`);
            await sleep(1000);
            return getPedestrianData(lat, lng, attempt + 1);
        }

        return {
            hasPedestrianArea: false,
            pedestrianType: 'Ошибка загрузки',
            pedestrianName: null,
            pedestrianSurface: 'Ошибка',
            pedestrianWidth: null,
            isLit: false,
            allSurfaces: []
        };
    }
}

// Получение названия типа пешеходной зоны
function getPedestrianTypeName(type) {
    const types = {
        footway: 'Пешеходная дорожка',
        pedestrian: 'Пешеходная зона',
        path: 'Тропинка',
        cycleway: 'Велодорожка',
        steps: 'Лестница',
        living_street: 'Жилая зона',
        park: 'Парк',
        playground: 'Детская площадка',
        plaza: 'Площадь',
        square: 'Площадь'
    };
    return types[type] || type || 'Неизвестно';
}

// Получение иконки погоды по коду
function getWeatherIcon(code) {
    if (code === 0) return '☀️';
    if (code <= 3) return '☁️';
    if (code <= 49) return '🌫️';
    if (code <= 69) return '🌧️';
    if (code <= 79) return '🌨️';
    if (code <= 99) return '⛈️';
    return '🌡️';
}

// Получение описания погодных условий по коду
function getWeatherCondition(code) {
    const conditions = {
        0: 'Ясно',
        1: 'Преимущественно ясно', 2: 'Переменная облачность', 3: 'Пасмурно',
        45: 'Туман', 48: 'Туман с инеем',
        51: 'Морось лёгкая', 53: 'Морось умеренная', 55: 'Морось сильная',
        61: 'Дождь слабый', 63: 'Дождь умеренный', 65: 'Дождь сильный',
        71: 'Снег слабый', 73: 'Снег умеренный', 75: 'Снег сильный',
        77: 'Снежные зёрна',
        80: 'Ливень слабый', 81: 'Ливень умеренный', 82: 'Ливень сильный',
        85: 'Снегопад слабый', 86: 'Снегопад сильный',
        95: 'Гроза', 96: 'Гроза с градом', 99: 'Гроза с сильным градом'
    };
    return conditions[code] || 'Нет данных';
}

// Получение направления ветра по градусам
function getWindDirection(degrees) {
    const dirs = ['С', 'ССВ', 'СВ', 'ВСВ', 'В', 'ВЮВ', 'ЮВ', 'ЮЮВ', 'Ю', 'ЮЮЗ', 'ЮЗ', 'ЗЮЗ', 'З', 'ЗСЗ', 'СЗ', 'ССЗ'];
    const index = Math.round(degrees / 22.5) % 16;
    return dirs[index];
}

// Получение статуса трафика
function getTrafficStatus(traffic) {
    if (!traffic || traffic === 'Нет данных') return 'status-info';
    if (traffic.includes('Свободно') || traffic.includes('Низкий')) return 'status-good';
    if (traffic.includes('Умеренный') || traffic.includes('Средний')) return 'status-warning';
    if (traffic.includes('Высокий') || traffic.includes('Пробки')) return 'status-bad';
    return 'status-info';
}

// Оценка интенсивности трафика по типу дороги
function estimateTraffic(highway) {
    const highTraffic = ['motorway', 'trunk', 'primary'];
    const medTraffic = ['secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link'];
    const lowTraffic = ['residential', 'living_street', 'service', 'unclassified'];

    if (highTraffic.includes(highway)) {
        const r = Math.random();
        if (r < 0.3) return 'Высокий — Пробки';
        if (r < 0.7) return 'Умеренный';
        return 'Свободно';
    }
    if (medTraffic.includes(highway)) {
        const r = Math.random();
        if (r < 0.2) return 'Высокий';
        if (r < 0.6) return 'Умеренный';
        return 'Свободно';
    }
    if (lowTraffic.includes(highway)) {
        return Math.random() < 0.8 ? 'Свободно' : 'Низкий';
    }
    return 'Нет данных';
}

// Получение названия типа дороги
function getRoadTypeName(highway) {
    const types = {
        motorway: 'Автомагистраль',
        trunk: 'Скоростная трасса',
        primary: 'Первичная дорога',
        secondary: 'Вторичная дорога',
        tertiary: 'Третичная дорога',
        unclassified: 'Неклассифицированная',
        residential: 'Жилая улица',
        living_street: 'Жилая зона',
        service: 'Служебная дорога',
        pedestrian: 'Пешеходная зона',
        cycleway: 'Велодорожка',
        footway: 'Пешеходная дорожка',
        path: 'Тропинка',
        track: 'Грунтовая дорога',
        motorway_link: 'Съезд с магистрали',
        trunk_link: 'Съезд со скоростной',
        primary_link: 'Съезд с первичной',
        secondary_link: 'Съезд со вторичной'
    };
    return types[highway] || highway || 'Неизвестно';
}

// Получение названия покрытия дороги
function getSurfaceName(surface) {
    const surfaces = {
        asphalt: 'Асфальт',
        concrete: 'Бетон',
        paved: 'Мощёное',
        unpaved: 'Немощёное',
        gravel: 'Гравий',
        dirt: 'Грунт',
        grass: 'Трава',
        cobblestone: 'Брусчатка',
        paving_stones: 'Плитка'
    };
    return surfaces[surface] || surface || 'Н/Д';
}

// Получение локализованного названия типа объекта
function getObjectTypeName(type) {
    const types = {
        house: 'Дом',
        residential: 'Жилое здание',
        apartments: 'Многоквартирный дом',
        commercial: 'Коммерческое здание',
        industrial: 'Промышленное здание',
        retail: 'Торговое здание',
        office: 'Офисное здание',
        school: 'Школа',
        university: 'Университет',
        hospital: 'Больница',
        church: 'Церковь',
        mosque: 'Мечеть',
        temple: 'Храм',
        synagogue: 'Синагога',
        restaurant: 'Ресторан',
        cafe: 'Кафе',
        bar: 'Бар',
        pub: 'Паб',
        fast_food: 'Фастфуд',
        pharmacy: 'Аптека',
        bank: 'Банк',
        atm: 'Банкомат',
        parking: 'Парковка',
        fuel: 'АЗС',
        police: 'Полиция',
        fire_station: 'Пожарная станция',
        post_office: 'Почта',
        library: 'Библиотека',
        cinema: 'Кинотеатр',
        theatre: 'Театр',
        museum: 'Музей',
        place_of_worship: 'Место поклонения',
        supermarket: 'Супермаркет',
        convenience: 'Продуктовый',
        clothes: 'Магазин одежды',
        hairdresser: 'Парикмахерская',
        bakery: 'Булочная',
        butcher: 'Мясная лавка',
        shop: 'Магазин',
        hotel: 'Отель',
        motel: 'Мотель',
        hostel: 'Хостел',
        attraction: 'Достопримечательность',
        viewpoint: 'Смотровая площадка',
        park: 'Парк',
        playground: 'Детская площадка',
        sports_centre: 'Спортивный центр',
        stadium: 'Стадион',
        swimming_pool: 'Бассейн',
        bus_stop: 'Автобусная остановка',
        railway: 'Железная дорога',
        station: 'Станция',
        airport: 'Аэропорт',
        bicycle_parking: 'Велопарковка',
        water: 'Водоём',
        forest: 'Лес',
        meadow: 'Луг',
        farmland: 'Сельскохозяйственные угодья',
        pedestrian: 'Пешеходная зона',
        footway: 'Пешеходная дорожка',
        administrative: 'Административная граница',
        boundary: 'Граница',
        yes: 'Объект'
    };
    return types[type] || escapeHtml(type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' '));
}

// Поиск населённых пунктов
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function searchLocation(query) {
    if (!query || query.length < 2) {
        clearSearchResults();
        return;
    }
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`;
        const response = await fetch(url, { headers: { 'Accept-Language': 'ru', 'User-Agent': 'MapInformTab/1.0' } });
        const results = await response.json();
        displaySearchResults(results);
    } catch (error) {
        console.error('Ошибка поиска:', error);
        clearSearchResults();
    }
}

function displaySearchResults(results) {
    const container = document.getElementById('searchResults');
    if (!results || results.length === 0) {
        container.innerHTML = '<div class="search-result-item">Ничего не найдено</div>';
        container.style.display = 'block';
        return;
    }
    container.innerHTML = results.map(r => {
        const safe = escapeHtml(r.display_name);
        return `<div class="search-result-item" onclick="selectSearchResult(${parseFloat(r.lat)}, ${parseFloat(r.lon)}, this)"
            data-name="${safe}">
            ${safe}
        </div>`;
    }).join('');
    container.style.display = 'block';
}

function clearSearchResults() {
    const container = document.getElementById('searchResults');
    if (container) {
        container.innerHTML = '';
        container.style.display = 'none';
    }
}

async function selectSearchResult(lat, lng, el) {
    const escapedName = el.getAttribute('data-name');
    clearSearchResults();
    // Decode HTML entities for display in the input field
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = escapedName;
    document.getElementById('searchInput').value = tempDiv.textContent;
    map.setView([lat, lng], 14);
    await scanLocation(lat, lng);
}

// Инициализация поиска
function initSearch() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    searchInput.addEventListener('input', function() {
        const query = this.value.trim();
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => searchLocation(query), 500);
    });

    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            clearSearchResults();
            this.value = '';
        }
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.search-container')) {
            clearSearchResults();
        }
    });
}

// Сейсмические данные через USGS API
async function getSeismicData(lat, lng) {
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

// Получение данных о часовом поясе через TimeAPI с retry
async function getTimezoneData(lat, lng, attempt = 1) {
    const maxAttempts = 3;

    try {
        const response = await fetch(
            `https://timeapi.io/api/TimeZone/coordinate?latitude=${lat}&longitude=${lng}`
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        const timezoneName = data.timeZone || 'UTC';
        const now = new Date();

        // Надёжный метод: используем formatToParts
        function getTimePartsForTZ(date, tz) {
            try {
                const fmt = new Intl.DateTimeFormat('en-GB', {
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                    hour12: false, timeZone: tz
                });
                const parts = fmt.formatToParts(date);
                const h = Number(parts.find(p => p.type === 'hour').value);
                const m = Number(parts.find(p => p.type === 'minute').value);
                return { h, m };
            } catch (e) {
                return null;
            }
        }

        // ✅ ПРАВИЛЬНО - сравниваем с UTC!
        const utcParts = getTimePartsForTZ(now, 'UTC');
        const tzParts = getTimePartsForTZ(now, timezoneName);
        
        if (!tzParts || !utcParts) {
            throw new Error('Failed to get timezone parts');
        }

        let offsetMinutes = (tzParts.h * 60 + tzParts.m) - (utcParts.h * 60 + utcParts.m);
        
        // Нормализация (учитываем переход через полночь)
        if (offsetMinutes > 12 * 60) offsetMinutes -= 24 * 60;
        if (offsetMinutes < -12 * 60) offsetMinutes += 24 * 60;

        const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
        const offsetMins = Math.abs(offsetMinutes) % 60;
        const sign = offsetMinutes >= 0 ? '+' : '-';
        const utcOffset = `${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;

        // Определяем DST: сравниваем текущий offset с январским и июльским
        const janDate = new Date(now.getFullYear(), 0, 15);
        const janUTCParts = getTimePartsForTZ(janDate, 'UTC');
        const janTZParts = getTimePartsForTZ(janDate, timezoneName);
        let janOffset = offsetMinutes;
        if (janUTCParts && janTZParts) {
            janOffset = (janTZParts.h * 60 + janTZParts.m) - (janUTCParts.h * 60 + janUTCParts.m);
            if (janOffset > 12 * 60) janOffset -= 24 * 60;
            if (janOffset < -12 * 60) janOffset += 24 * 60;
        }

        const julDate = new Date(now.getFullYear(), 6, 15);
        const julUTCParts = getTimePartsForTZ(julDate, 'UTC');
        const julTZParts = getTimePartsForTZ(julDate, timezoneName);
        let julOffset = offsetMinutes;
        if (julUTCParts && julTZParts) {
            julOffset = (julTZParts.h * 60 + julTZParts.m) - (julUTCParts.h * 60 + julUTCParts.m);
            if (julOffset > 12 * 60) julOffset -= 24 * 60;
            if (julOffset < -12 * 60) julOffset += 24 * 60;
        }

        // Стандартный offset - это меньший из двух (зима или лето)
        const standardOffset = Math.min(janOffset, julOffset);
        // DST активен, если текущий offset больше стандартного
        const isDST = offsetMinutes > standardOffset;

        // Определяем зимнее и летнее смещения
        const winterOffset = Math.min(janOffset, julOffset);
        const summerOffset = Math.max(janOffset, julOffset);
        // Считаем, что DST используется, если разница между зимним и летним смещением >= 30 минут
        const usesDST = Math.abs(summerOffset - winterOffset) >= 30;

        // Функция форматирования смещения
        const formatOffsetString = (minutes) => {
            const hours = Math.floor(Math.abs(minutes) / 60);
            const mins = Math.abs(minutes) % 60;
            const sign = minutes >= 0 ? '+' : '-';
            return `${sign}${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
        };

        const winterOffsetStr = formatOffsetString(winterOffset);
        const summerOffsetStr = formatOffsetString(summerOffset);

        const dstStart = data.dstStart ?? data.dstInterval?.dstStart ?? data.dstInterval?.dstNextStart ?? null;

        return {
            timezone: timezoneName,
            utcOffset,
            isDST,
            usesDST,
            winterOffset: winterOffsetStr,
            summerOffset: summerOffsetStr,
            currentSeason: usesDST ? (isDST ? 'summer' : 'winter') : null,
            dstStart
        };
    } catch (error) {
        console.error(`Ошибка получения данных о часовом поясе (попытка ${attempt}):`, error);

        if (attempt < maxAttempts) {
            console.log(`🔄 Повторный запрос часового пояса через ${attempt} сек...`);
            await sleep(1000 * attempt);
            return getTimezoneData(lat, lng, attempt + 1);
        }

        return {
            timezone: 'Н/Д',
            utcOffset: 'Н/Д',
            isDST: false,
            usesDST: false,
            winterOffset: null,
            summerOffset: null,
            currentSeason: 'winter',
            dstStart: null
        };
    }
}

function getCurrentTimeForTimezone(timezone) {
    if (!timezone || timezone === 'Н/Д') {
        return new Date().toLocaleString('ru-RU', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
    try {
        return new Date().toLocaleString('ru-RU', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (e) {
        return 'Н/Д';
    }
}

function updateVisibleTimeDisplay() {
    const lastMarkerData = markers.length > 0 ? markers[markers.length - 1].data : null;

    if (lastMarkerData && lastMarkerData.timezone) {
        const currentTime = getCurrentTimeForTimezone(lastMarkerData.timezone);
        document.querySelectorAll('.info-row').forEach(row => {
            const label = row.querySelector('.info-label');
            if (label && label.textContent.includes('Местное:')) {
                const valueSpan = row.querySelector('.info-value');
                if (valueSpan) {
                    valueSpan.textContent = currentTime;
                }
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
                    if (valueSpan) {
                        valueSpan.textContent = getCurrentTimeForTimezone(popupTimezone);
                    }
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
                    if (valueSpan) {
                        valueSpan.textContent = getCurrentTimeForTimezone(modalTimezone);
                    }
                }
            });
        }
    }
}

function updateAllMarkerTimes() {
    if (markers.length === 0) return;

    markers.forEach(item => {
        const tz = item.data.timezone;
        if (tz && tz !== 'Н/Д') {
            item.data.localTime = getCurrentTimeForTimezone(tz);
        }
    });

    const infoContent = document.getElementById('infoContent');
    if (infoContent) {
        updateVisibleTimeDisplay();
    }
}

// Астрономические данные через SunCalc.js
function getAstronomyData(lat, lng, timezone) {
    try {
        const now = new Date();
        const sunTimes = SunCalc.getTimes(now, lat, lng);
        const moonTimes = SunCalc.getMoonTimes(now, lat, lng);
        const moonIllum = SunCalc.getMoonIllumination(now);

        const sunrise = sunTimes.sunrise;
        const sunset = sunTimes.sunset;
        const validSun = sunrise instanceof Date && !isNaN(sunrise) && sunset instanceof Date && !isNaN(sunset);
        const dayLengthMin = validSun ? (sunset - sunrise) / 60000 : 0;

        const tzOptions = timezone && timezone !== 'Н/Д'
            ? { timeZone: timezone, hour: '2-digit', minute: '2-digit' }
            : { hour: '2-digit', minute: '2-digit' };

        const fmtTime = d => (d instanceof Date && !isNaN(d))
            ? d.toLocaleTimeString('ru-RU', tzOptions)
            : 'Н/Д';

        return {
            sunriseTime: validSun ? fmtTime(sunrise) : 'Н/Д',
            sunsetTime: validSun ? fmtTime(sunset) : 'Н/Д',
            dayLength: validSun ? `${Math.floor(dayLengthMin / 60)}ч ${Math.round(dayLengthMin % 60)}м` : 'Н/Д',
            dayPhase: getDayPhase(now, sunTimes),
            moonriseTime: fmtTime(moonTimes.rise),
            moonsetTime: fmtTime(moonTimes.set),
            moonPhase: getMoonPhaseName(moonIllum.phase),
            moonIllumination: Math.round(moonIllum.fraction * 100)
        };
    } catch (error) {
        console.error('Ошибка астрономических данных:', error);
        return {
            sunriseTime: 'Н/Д', sunsetTime: 'Н/Д', dayLength: 'Н/Д',
            dayPhase: 'Н/Д', moonriseTime: 'Н/Д', moonsetTime: 'Н/Д',
            moonPhase: 'Н/Д', moonIllumination: 0
        };
    }
}

// Предупреждения на основе кода погоды
function getWeatherAlerts(weatherCode, precipProbability) {
    const alerts = [];
    if (weatherCode >= 95) {
        alerts.push({ type: 'Гроза', level: 'danger', icon: '⛈️', description: 'Опасная гроза с возможным градом' });
    } else if (weatherCode >= 80) {
        alerts.push({ type: 'Ливень', level: 'warning', icon: '🌧️', description: 'Сильные ливневые осадки' });
    } else if (weatherCode >= 75) {
        alerts.push({ type: 'Снегопад', level: 'warning', icon: '🌨️', description: 'Интенсивный снегопад' });
    } else if (weatherCode >= 65) {
        alerts.push({ type: 'Сильный дождь', level: 'warning', icon: '🌧️', description: 'Интенсивные осадки' });
    } else if (weatherCode === 45 || weatherCode === 48) {
        alerts.push({ type: 'Густой туман', level: 'info', icon: '🌫️', description: 'Ограниченная видимость' });
    }
    if (typeof precipProbability === 'number' && precipProbability >= 80 && alerts.length === 0) {
        alerts.push({ type: 'Высокая вероятность осадков', level: 'info', icon: '💧', description: `Вероятность осадков: ${precipProbability}%` });
    }
    return { weatherAlerts: alerts };
}

// Тип осадков по коду погоды
function getPrecipitationType(weatherCode) {
    if (weatherCode >= 71 && weatherCode <= 77) return 'Снег';
    if (weatherCode >= 85 && weatherCode <= 86) return 'Снег';
    if (weatherCode >= 51 && weatherCode <= 55) return 'Морось';
    if (weatherCode >= 61 && weatherCode <= 67) return 'Дождь';
    if (weatherCode >= 80 && weatherCode <= 82) return 'Ливень';
    if (weatherCode >= 95) return 'Гроза';
    return 'Нет';
}

// Фаза дня
function getDayPhase(now, sunTimes) {
    const t = now.getTime();
    const dawn = sunTimes.dawn instanceof Date ? sunTimes.dawn.getTime() : null;
    const sunrise = sunTimes.sunrise instanceof Date ? sunTimes.sunrise.getTime() : null;
    const solarNoon = sunTimes.solarNoon instanceof Date ? sunTimes.solarNoon.getTime() : null;
    const sunset = sunTimes.sunset instanceof Date ? sunTimes.sunset.getTime() : null;
    const dusk = sunTimes.dusk instanceof Date ? sunTimes.dusk.getTime() : null;

    if (!sunrise || !sunset) return 'Н/Д';
    if (dawn && t < dawn) return '🌃 Ночь';
    if (t < sunrise) return '🌅 Рассвет';
    if (solarNoon && t < solarNoon) return '☀️ Утро';
    if (t < sunset) return '🌞 День';
    if (dusk && t < dusk) return '🌆 Сумерки';
    return '🌃 Ночь';
}

// Название фазы луны
function getMoonPhaseName(phase) {
    if (phase < 0.025 || phase >= 0.975) return '🌑 Новолуние';
    if (phase < 0.25) return '🌒 Растущий серп';
    if (phase < 0.275) return '🌓 Первая четверть';
    if (phase < 0.5) return '🌔 Растущая луна';
    if (phase < 0.525) return '🌕 Полнолуние';
    if (phase < 0.75) return '🌖 Убывающая луна';
    if (phase < 0.775) return '🌗 Последняя четверть';
    return '🌘 Убывающий серп';
}

// Расчёт пожарной опасности на основе метеоданных
function calculateFireRisk(weatherData) {
    const temp = typeof weatherData.temp === 'number' ? weatherData.temp : 20;
    const humidity = typeof weatherData.humidity === 'number' ? weatherData.humidity : 50;
    const windSpeed = typeof weatherData.windSpeed === 'number' ? weatherData.windSpeed : 3;
    const precipitation = typeof weatherData.precipitation === 'number' ? weatherData.precipitation : 0;
    const precipProbability = typeof weatherData.precipProbability === 'number' ? weatherData.precipProbability : 0;

    let riskScore = 0;

    // Вклад температуры (0–30 баллов)
    if (temp >= 35) riskScore += 30;
    else if (temp >= 25) riskScore += 20;
    else if (temp >= 15) riskScore += 10;

    // Вклад влажности (0–30 баллов, обратная зависимость)
    if (humidity <= 20) riskScore += 30;
    else if (humidity <= 40) riskScore += 20;
    else if (humidity <= 60) riskScore += 10;

    // Вклад скорости ветра (0–20 баллов)
    if (windSpeed >= 10) riskScore += 20;
    else if (windSpeed >= 5) riskScore += 10;
    else riskScore += 5;

    // Снижение из-за осадков
    if (precipitation > 5) riskScore -= 20;
    else if (precipitation > 1) riskScore -= 10;
    if (precipProbability > 70) riskScore -= 10;

    riskScore = Math.max(0, Math.min(100, riskScore));

    let level, color, description, recommendation;
    if (riskScore >= 70) {
        level = 'extreme'; color = '#ff4444';
        description = 'Чрезвычайно высокая';
        recommendation = 'Категорически запрещено разводить огонь';
    } else if (riskScore >= 50) {
        level = 'high'; color = '#ff6600';
        description = 'Высокая';
        recommendation = 'Запрещено разводить костры в лесу';
    } else if (riskScore >= 30) {
        level = 'medium'; color = '#ffaa00';
        description = 'Умеренная';
        recommendation = 'Соблюдайте осторожность с огнём';
    } else {
        level = 'low'; color = '#00aa00';
        description = 'Низкая';
        recommendation = 'Пожарная обстановка спокойная';
    }

    return { score: riskScore, level, color, description, recommendation };
}

// Анализ условий для водителей при осадках
function getRoadPrecipAnalysis(data) {
    const temp = typeof data.temp === 'number' ? data.temp : 20;
    const precipitation = typeof data.precipitation === 'number' ? data.precipitation : 0;
    const weatherCode = data.weatherCode || 0;
    const visibility = typeof data.visibility === 'number' ? data.visibility : 10;
    const windSpeed = typeof data.windSpeed === 'number' ? data.windSpeed : 0;
    const precipProbability = typeof data.precipProbability === 'number' ? data.precipProbability : 0;

    // Состояние дорожного покрытия
    let surfaceCondition, surfaceColor, speedReduction;
    if (temp < 0 && precipitation > 0) {
        surfaceCondition = '🧊 Гололедица'; surfaceColor = '#00aaff'; speedReduction = 50;
    } else if (temp < 2 && precipProbability > 50) {
        surfaceCondition = '⚠️ Риск гололедицы'; surfaceColor = '#ffaa00'; speedReduction = 30;
    } else if (precipitation > 5 || (weatherCode >= 80 && weatherCode <= 82)) {
        surfaceCondition = '💧 Сильное намокание'; surfaceColor = '#ff6600'; speedReduction = 30;
    } else if (precipitation > 0.5 || (weatherCode >= 61 && weatherCode <= 67)) {
        surfaceCondition = '🌧️ Мокрое покрытие'; surfaceColor = '#ffaa00'; speedReduction = 20;
    } else {
        surfaceCondition = '✅ Сухое покрытие'; surfaceColor = '#00ff00'; speedReduction = 0;
    }

    // Предупреждение о видимости
    let visibilityWarning = null;
    if (visibility < 0.5 || weatherCode === 45 || weatherCode === 48) {
        visibilityWarning = '🌫️ Очень плохая видимость — включите противотуманные фары';
    } else if (visibility < 2) {
        visibilityWarning = '🌫️ Плохая видимость — снизьте скорость';
    } else if (precipitation > 2 || weatherCode >= 63) {
        visibilityWarning = '🌧️ Ограниченная видимость из-за осадков';
    }

    // Предупреждение о ветре
    let windWarning = null;
    if (windSpeed > 20) {
        windWarning = '💨 Сильный ветер — возможен снос транспортных средств';
    } else if (windSpeed > 12) {
        windWarning = '💨 Порывистый ветер — опасность для высокого транспорта';
    }

    // Рекомендации для водителей
    const recommendations = [];
    if (speedReduction > 0) {
        const maxSpeed = data.maxSpeed;
        if (maxSpeed) {
            const safeSpeed = Math.round(maxSpeed * (1 - speedReduction / 100));
            recommendations.push(`Рекомендуемая скорость: ≤ ${safeSpeed} км/ч`);
        } else {
            recommendations.push(`Снизьте скорость на ${speedReduction}%`);
        }
    }
    if (precipitation > 0) {
        recommendations.push('Увеличьте дистанцию до впереди идущего автомобиля');
    }
    if (temp < 3 && temp > -5) {
        recommendations.push('Возможны скользкие участки на мостах');
    }

    return { surfaceCondition, surfaceColor, speedReduction, visibilityWarning, windWarning, recommendations };
}

// Название уровня серьёзности опасности
function getSeverityName(severity) {
    const names = { critical: 'КРИТИЧЕСКИЙ', high: 'ВЫСОКИЙ', moderate: 'СРЕДНИЙ', low: 'НИЗКИЙ' };
    return names[severity] || severity.toUpperCase();
}

function getSeverityIcon(severity) {
    const icons = { critical: '🚨', high: '⚠️', moderate: '⚡', low: '✅' };
    return icons[severity] || '⚠️';
}

// Коэффициент перевода гПа → мм рт. ст.
const HPA_TO_MMHG = 0.750062;

// Детальный анализ атмосферного давления
function analyzePressure(pressure) {
    if (typeof pressure !== 'number') {
        return {
            level: 'unknown', levelName: 'Нет данных', trend: 'Нет данных',
            trendIcon: '—', mmHg: 'Н/Д', color: '#888888',
            healthEffects: [], weatherForecast: 'Нет данных'
        };
    }

    let level, levelName, color;
    if (pressure < 980) {
        level = 'very_low'; levelName = 'Очень низкое'; color = '#ff4444';
    } else if (pressure < 1000) {
        level = 'low'; levelName = 'Низкое'; color = '#ff6600';
    } else if (pressure < 1020) {
        level = 'normal'; levelName = 'Нормальное'; color = '#00ff00';
    } else if (pressure < 1040) {
        level = 'high'; levelName = 'Повышенное'; color = '#ffaa00';
    } else {
        level = 'very_high'; levelName = 'Очень высокое'; color = '#ff4444';
    }

    let trend, trendIcon;
    if (previousPressure === null || Math.abs(pressure - previousPressure) < 1) {
        trend = 'Стабильно'; trendIcon = '→';
    } else if (pressure > previousPressure) {
        trend = 'Растет'; trendIcon = '↑';
    } else {
        trend = 'Падает'; trendIcon = '↓';
    }
    previousPressure = pressure;

    const mmHg = Math.round(pressure * HPA_TO_MMHG);

    return {
        level, levelName, trend, trendIcon, mmHg, color,
        healthEffects: getPressureHealthEffects(level),
        weatherForecast: getPressureWeatherForecast(level, trend)
    };
}

// Влияние давления на здоровье
function getPressureHealthEffects(level) {
    const effects = {
        very_low: [
            'Головная боль и мигрень',
            'Суставные боли у метеозависимых',
            'Снижение артериального давления',
            'Усталость и сонливость'
        ],
        low: [
            'Возможна головная боль',
            'Снижение концентрации',
            'Ухудшение самочувствия у гипотоников'
        ],
        normal: [
            'Комфортные условия',
            'Нет негативного воздействия'
        ],
        high: [
            'Повышение артериального давления',
            'Риск для гипертоников',
            'Возможна головная боль'
        ],
        very_high: [
            'Значительное повышение АД',
            'Высокий риск для сердечно-сосудистых',
            'Сильная головная боль',
            'Ухудшение при заболеваниях дыхательных путей'
        ]
    };
    return effects[level] || [];
}

// Прогноз погоды на основе давления
function getPressureWeatherForecast(level, trend) {
    if (level === 'very_low' || (level === 'low' && trend === 'Падает')) {
        return '⛈️ Ожидается ухудшение погоды, возможны осадки и штормовой ветер';
    } else if (level === 'low' && trend === 'Растет') {
        return '🌤️ Погода начинает улучшаться';
    } else if (level === 'low') {
        return '🌧️ Возможны осадки, облачная погода';
    } else if (level === 'normal' && trend === 'Растет') {
        return '☀️ Погода улучшается, ожидается прояснение';
    } else if (level === 'normal' && trend === 'Падает') {
        return '🌥️ Возможно ухудшение погоды';
    } else if (level === 'normal') {
        return '⛅ Умеренная погода, без резких изменений';
    } else if ((level === 'high' || level === 'very_high') && trend === 'Падает') {
        return '🌥️ Ожидается смена погоды, возможны осадки';
    } else if (level === 'high' || level === 'very_high') {
        return '☀️ Ясная, солнечная погода';
    }
    return 'Нет прогноза';
}

// Сбор всех обнаруженных опасностей
function collectHazards(fullData) {
    const hazards = [];

    // 1. Сейсмическая активность
    if (fullData.seismicEvents && fullData.seismicEvents.length > 0) {
        const maxMag = Math.max(...fullData.seismicEvents.map(e => parseFloat(e.magnitude) || 0));
        const severity = maxMag >= 6 ? 'critical' : maxMag >= 4 ? 'high' : 'moderate';
        hazards.push({
            id: 'earthquakes', icon: '🌍',
            title: 'Сейсмическая активность', severity,
            value: `M${maxMag.toFixed(1)}`,
            description: `${fullData.seismicEvents.length} событий в радиусе 500 км`,
            layerName: 'earthquakes'
        });
    }

    // 2. Пожарная опасность
    if (fullData.fireRisk && (fullData.fireRisk.level === 'extreme' || fullData.fireRisk.level === 'high')) {
        hazards.push({
            id: 'fireRisk', icon: '🔥',
            title: 'Пожарная опасность',
            severity: fullData.fireRisk.level === 'extreme' ? 'critical' : 'high',
            value: fullData.fireRisk.description,
            description: fullData.fireRisk.recommendation,
            layerName: 'fireRisk'
        });
    }

    // 3. Опасные осадки на дорогах
    if (fullData.precipAnalysis && fullData.precipAnalysis.speedReduction >= 30) {
        hazards.push({
            id: 'roadPrecip', icon: '🌧️',
            title: 'Опасные осадки на дорогах',
            severity: fullData.precipAnalysis.speedReduction >= 50 ? 'critical' : 'high',
            value: fullData.precipAnalysis.surfaceCondition,
            description: `Снижение скорости на ${fullData.precipAnalysis.speedReduction}%`,
            layerName: 'roadPrecip'
        });
    } else if (fullData.precipAnalysis && fullData.precipAnalysis.speedReduction > 0) {
        hazards.push({
            id: 'roadPrecip', icon: '🌧️',
            title: 'Осадки на дорогах', severity: 'moderate',
            value: fullData.precipAnalysis.surfaceCondition,
            description: `Снижение скорости на ${fullData.precipAnalysis.speedReduction}%`,
            layerName: 'roadPrecip'
        });
    }

    // 4. Экстремальные температуры
    const temp = typeof fullData.temp === 'number' ? fullData.temp : null;
    if (temp !== null) {
        if (temp >= 40) {
            hazards.push({
                id: 'temp_high', icon: '🌡️', title: 'Экстремальная жара', severity: 'critical',
                value: `${temp}°C`, description: 'Опасность теплового удара, ограничьте пребывание на улице', layerName: null
            });
        } else if (temp >= 35) {
            hazards.push({
                id: 'temp_high', icon: '🌡️', title: 'Сильная жара', severity: 'high',
                value: `${temp}°C`, description: 'Высокий риск теплового стресса', layerName: null
            });
        } else if (temp <= -30) {
            hazards.push({
                id: 'temp_low', icon: '🥶', title: 'Экстремальный мороз', severity: 'critical',
                value: `${temp}°C`, description: 'Опасность обморожения, ограничьте пребывание на улице', layerName: null
            });
        } else if (temp <= -20) {
            hazards.push({
                id: 'temp_low', icon: '🥶', title: 'Сильный мороз', severity: 'high',
                value: `${temp}°C`, description: 'Риск обморожения при длительном пребывании на улице', layerName: null
            });
        }
    }

    // 5. Сильный ветер
    const windSpeed = typeof fullData.windSpeed === 'number' ? fullData.windSpeed : null;
    if (windSpeed !== null) {
        if (windSpeed > 25) {
            hazards.push({
                id: 'wind', icon: '💨', title: 'Ураганный ветер', severity: 'critical',
                value: `${windSpeed} м/с`, description: 'Опасен для жизни, возможны разрушения', layerName: null
            });
        } else if (windSpeed > 15) {
            hazards.push({
                id: 'wind', icon: '💨', title: 'Сильный ветер', severity: 'high',
                value: `${windSpeed} м/с`,
                description: (fullData.precipAnalysis && fullData.precipAnalysis.windWarning) || 'Опасность для высокого транспорта',
                layerName: null
            });
        }
    }

    // 6. Ограниченная видимость
    const visibility = typeof fullData.visibility === 'number' ? fullData.visibility : null;
    const weatherCode = fullData.weatherCode || 0;
    if (visibility !== null && (visibility < 0.5 || weatherCode === 45 || weatherCode === 48)) {
        hazards.push({
            id: 'visibility', icon: '🌫️', title: 'Ограниченная видимость', severity: 'high',
            value: visibility < 1 ? `${Math.round(visibility * 1000)} м` : `${visibility} км`,
            description: 'Опасность при вождении, включите противотуманные фары', layerName: null
        });
    } else if (visibility !== null && visibility < 2) {
        hazards.push({
            id: 'visibility', icon: '🌫️', title: 'Плохая видимость', severity: 'moderate',
            value: `${visibility} км`, description: 'Снизьте скорость, будьте внимательны', layerName: null
        });
    }

    // 7. Аномальное атмосферное давление
    if (fullData.pressureAnalysis && (fullData.pressureAnalysis.level === 'very_low' || fullData.pressureAnalysis.level === 'very_high')) {
        hazards.push({
            id: 'pressure', icon: '🌡️', title: 'Аномальное давление', severity: 'moderate',
            value: `${fullData.pressure} гПа`,
            description: `${fullData.pressureAnalysis.levelName} — ${fullData.pressureAnalysis.healthEffects[0] || ''}`,
            layerName: null
        });
    }

    const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
    hazards.sort((a, b) => (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99));
    return hazards;
}

// Фокус карты на слое
function focusOnLayer(layerName) {
    if (deviceType === 'smartphone-portrait') {
        switchMobileTab('map');
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
            // Layer may not have bounds (e.g., single point marker) — not an error
            console.debug('focusOnLayer: no bounds for layer', layerName, e.message);
        }
    }
}

// Анализ состояния поверхности через Open-Meteo API (данные за 24 часа)
async function analyzeSurfaceCondition(lat, lng, weatherData) {
    console.log('🛣️ Анализ состояния поверхности...');
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation,rain,snowfall,temperature_2m,weathercode&past_hours=24&forecast_hours=1`;
        const response = await fetch(url);
        const data = await response.json();
        const hourly = data.hourly;

        if (!hourly) {
            return getFallbackSurfaceCondition(weatherData);
        }

        const precipitation = hourly.precipitation || [];
        const rain = hourly.rain || [];
        const snowfall = hourly.snowfall || [];
        const temps = hourly.temperature_2m || [];
        const codes = hourly.weathercode || [];

        // past_hours=24 + forecast_hours=1 → array has 25 items; skip the last (forecast) hour
        const hours24 = Math.min(precipitation.length - 1, 24);
        let accRain = 0, accSnow = 0;
        for (let i = 0; i < hours24; i++) {
            accRain += rain[i] || 0;
            accSnow += snowfall[i] || 0;
        }

        const currentTemp = hours24 > 0 && temps[hours24 - 1] !== undefined
            ? temps[hours24 - 1]
            : (typeof weatherData.temp === 'number' ? weatherData.temp : 10);

        let continuousRainHours = 0;
        for (let i = hours24 - 1; i >= 0; i--) {
            if ((precipitation[i] || 0) > 0.1) {
                continuousRainHours++;
            } else {
                break;
            }
        }

        let hadThaw = false, hadFreeze = false;
        for (let i = 0; i < hours24; i++) {
            const t = temps[i] !== undefined ? temps[i] : currentTemp;
            if (t > 2) hadThaw = true;
            if (t < -2) hadFreeze = true;
        }

        const currentCode = codes[hours24 - 1] !== undefined ? codes[hours24 - 1] : (weatherData.weatherCode || 0);

        const condition = determineSurfaceCondition({
            accRain, accSnow, currentTemp, continuousRainHours,
            hadThaw: hadThaw && hadFreeze,
            weatherCode: currentCode,
            precipitation: typeof weatherData.precipitation === 'number' ? weatherData.precipitation : 0
        });

        console.log(`  ${condition.icon} ${condition.name.toUpperCase()} (${condition.severity.toUpperCase()})`);

        return {
            ...condition,
            accRainMm: Math.round(accRain * 10) / 10,
            accSnowCm: Math.round(accSnow * 10) / 10,
            continuousRainHours,
            currentTemp: Math.round(currentTemp * 10) / 10
        };
    } catch (error) {
        console.error('Ошибка анализа поверхности:', error);
        return getFallbackSurfaceCondition(weatherData);
    }
}

// Определение 12 типов состояния поверхности
function determineSurfaceCondition({ accRain, accSnow, currentTemp, continuousRainHours, hadThaw, weatherCode, precipitation }) {
    const isSnowing = (weatherCode >= 71 && weatherCode <= 79) || (weatherCode >= 85 && weatherCode <= 86);
    const isRaining = (weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82);

    // 1. Гололедица
    if (currentTemp < -2 && accSnow > 0 && hadThaw) {
        return {
            name: 'Гололедица', icon: '🧊❄️', severity: 'critical',
            brakeIncrease: 400, speedReduction: 70,
            description: 'Слой льда >5 мм, движение крайне опасно',
            coverage: '100%', depth: `${Math.round(accSnow * 10)}мм льда`,
            forPedestrians: '🚷 КРАЙНЕ ОПАСНО — высокий риск падений и травм. Используйте нескользящую обувь, ледоходы, держитесь за поручни. Пожилым людям лучше остаться дома',
            forDrivers: 'Движение фактически невозможно — двигайтесь только при крайней необходимости',
            recommendations: ['Избегайте выхода на улицу без необходимости', 'Водителям: оставьте автомобиль при отсутствии шипованной резины']
        };
    }

    // 2. Гололед
    if (currentTemp >= -5 && currentTemp <= 2 && isRaining && accRain > 0) {
        return {
            name: 'Гололед', icon: '🧊', severity: 'critical',
            brakeIncrease: 350, speedReduction: 60,
            description: 'Тонкий лёд на поверхности, тормозной путь +300-400%',
            coverage: '80-100%', depth: '1-3 мм',
            forPedestrians: '⚠️ ОЧЕНЬ ОПАСНО — скользкая поверхность, риск падений. Передвигайтесь медленно, мелкими шагами. Избегайте крутых спусков и лестниц',
            forDrivers: 'Движение крайне опасно — снизьте скорость до минимума',
            recommendations: ['Используйте шипованную резину', 'Увеличьте дистанцию до 10 секунд', 'Избегайте резкого торможения']
        };
    }

    // 3. Обледенелый снег
    if (accSnow > 5 && hadThaw && currentTemp < -2) {
        return {
            name: 'Обледенелый снег', icon: '🧊🌨️', severity: 'critical',
            brakeIncrease: 300, speedReduction: 60,
            description: 'Наст после оттепели — твёрдая скользкая корка',
            coverage: '100%', depth: `${Math.round(accSnow)}см`,
            forPedestrians: '⚠️ ОЧЕНЬ ОПАСНО — высокий риск падений на насте. Используйте нескользящую обувь или ледоходы',
            forDrivers: 'Движение опасно — высокий риск заноса',
            recommendations: ['Используйте шипованную резину', 'Снизьте скорость на 60%', 'Избегайте резких манёвров']
        };
    }

    // 4. Глубокий снег
    if (accSnow > 15) {
        return {
            name: 'Глубокий снег', icon: '❄️❄️', severity: 'high',
            brakeIncrease: 200, speedReduction: 50,
            description: 'Снежный покров >15 см, движение существенно затруднено',
            coverage: '100%', depth: `${Math.round(accSnow)}см`,
            forPedestrians: '🥾 СЛОЖНО — глубокий снег затрудняет передвижение. Надевайте высокие непромокаемые ботинки',
            forDrivers: 'Движение крайне затруднено — необходим полный привод',
            recommendations: ['Используйте зимние шины', 'Снизьте скорость на 50%', 'Избегайте заснеженных второстепенных дорог']
        };
    }

    // 5. Снежный покров
    if (accSnow > 5) {
        return {
            name: 'Снежный покров', icon: '🌨️', severity: 'high',
            brakeIncrease: 150, speedReduction: 40,
            description: 'Снег 5-15 см, дороги в снегу',
            coverage: '90-100%', depth: `${Math.round(accSnow)}см`,
            forPedestrians: '❄️ НЕУДОБНО — снежный покров, возможно скольжение. Надевайте тёплую непромокаемую обувь',
            forDrivers: 'Движение затруднено — снизьте скорость',
            recommendations: ['Используйте зимние шины', 'Снизьте скорость на 40%', 'Будьте осторожны на перекрёстках']
        };
    }

    // 6. Снежная каша
    if (accSnow > 2 && currentTemp >= -2 && currentTemp <= 2) {
        return {
            name: 'Снежная каша', icon: '🌨️💧', severity: 'high',
            brakeIncrease: 120, speedReduction: 35,
            description: 'Мокрый снег, слякоть — плохое сцепление',
            coverage: '70-90%', depth: `${Math.round(accSnow)}см`,
            forPedestrians: '💦 НЕПРИЯТНО — слякоть вызывает намокание обуви и одежды. Используйте непромокаемую обувь',
            forDrivers: 'Опасность аквапланирования и заноса',
            recommendations: ['Снизьте скорость на 35%', 'Избегайте резкого торможения', 'Увеличьте дистанцию']
        };
    }

    // 7. Лёгкий снег
    if (accSnow > 2 || isSnowing) {
        return {
            name: 'Лёгкий снег', icon: '❄️', severity: 'moderate',
            brakeIncrease: 80, speedReduction: 25,
            description: 'Снег 2-5 см, виден асфальт',
            coverage: '50-80%', depth: `${Math.round(accSnow)}см`,
            forPedestrians: '⚠️ ОСТОРОЖНО — возможны скользкие участки, особенно в тени',
            forDrivers: 'Движение возможно с осторожностью',
            recommendations: ['Используйте зимние шины', 'Снизьте скорость на 25%']
        };
    }

    // 8. Затопление
    if (accRain > 50 && continuousRainHours >= 1) {
        return {
            name: 'Затопление', icon: '🌊', severity: 'critical',
            brakeIncrease: 250, speedReduction: 80,
            description: 'Стоячая вода >10 см, риск затопления автомобилей',
            coverage: '100%', depth: '>10 см',
            forPedestrians: '🚷 ОПАСНО — не входите в зоны затопления. Риск падения в канализационные люки, поражения электрическим током. Обходите затопленные участки',
            forDrivers: 'Движение невозможно — риск гидроудара двигателя',
            recommendations: ['Не заезжайте в затопленные участки', 'Объезжайте подтопленные зоны', 'Следите за уровнем воды']
        };
    }

    // 9. Очень мокро
    if (accRain > 15 && continuousRainHours >= 2) {
        return {
            name: 'Очень мокро', icon: '🌧️', severity: 'high',
            brakeIncrease: 100, speedReduction: 30,
            description: 'Глубокие лужи, риск аквапланирования',
            coverage: '100%', depth: `${Math.round(accRain)}мм осадков`,
            forPedestrians: '🌧️ ПРОМОКАНИЕ — глубокие лужи. Используйте непромокаемую обувь, обходите скопления воды',
            forDrivers: 'Опасность аквапланирования — снизьте скорость',
            recommendations: ['Снизьте скорость на 30%', 'Объезжайте крупные лужи', 'Проверьте состояние шин']
        };
    }

    // 10. Мокро
    if (accRain > 5 || continuousRainHours >= 1) {
        return {
            name: 'Мокро', icon: '💦', severity: 'moderate',
            brakeIncrease: 50, speedReduction: 20,
            description: 'Мокрое покрытие, увеличенный тормозной путь',
            coverage: '80-100%', depth: `${Math.round(accRain)}мм осадков`,
            forPedestrians: '💦 УМЕРЕННО — возможно намокание обуви. Рекомендуется непромокаемая обувь',
            forDrivers: 'Тормозной путь увеличен на 50%',
            recommendations: ['Снизьте скорость на 20%', 'Увеличьте дистанцию']
        };
    }

    // 11. Влажно
    if (accRain > 0.5 || precipitation > 0) {
        return {
            name: 'Влажно', icon: '💧', severity: 'low',
            brakeIncrease: 20, speedReduction: 10,
            description: 'Лёгкая влага на дороге',
            coverage: '30-60%', depth: `${Math.round(accRain * 10) / 10}мм осадков`,
            forPedestrians: '✅ НОРМАЛЬНЫЕ УСЛОВИЯ — лёгкая влага не создаёт серьёзных препятствий',
            forDrivers: 'Незначительное увеличение тормозного пути',
            recommendations: ['Соблюдайте дистанцию']
        };
    }

    // 12. Сухо
    return {
        name: 'Сухо', icon: '✅', severity: 'low',
        brakeIncrease: 0, speedReduction: 0,
        description: 'Идеальные условия для движения',
        coverage: '0%', depth: '0 мм',
        forPedestrians: '✅ ИДЕАЛЬНЫЕ УСЛОВИЯ — сухая поверхность, хорошее сцепление, риски минимальны',
        forDrivers: 'Нормальный тормозной путь',
        recommendations: ['Соблюдайте правила дорожного движения']
    };
}

// Запасной анализ поверхности при недоступности API
function getFallbackSurfaceCondition(weatherData) {
    const temp = typeof weatherData.temp === 'number' ? weatherData.temp : 10;
    const precipitation = typeof weatherData.precipitation === 'number' ? weatherData.precipitation : 0;
    const weatherCode = weatherData.weatherCode || 0;

    const result = determineSurfaceCondition({
        accRain: precipitation * 3,
        accSnow: (weatherCode >= 71 && weatherCode <= 86) ? precipitation * 3 : 0,
        currentTemp: temp,
        continuousRainHours: precipitation > 0 ? 1 : 0,
        hadThaw: false,
        weatherCode,
        precipitation
    });

    return {
        ...result,
        accRainMm: Math.round(precipitation * 3 * 10) / 10,
        accSnowCm: (weatherCode >= 71 && weatherCode <= 86) ? Math.round(precipitation * 3 * 10) / 10 : 0,
        continuousRainHours: precipitation > 0 ? 1 : 0,
        currentTemp: temp
    };
}

// ============================================================
// РАСШИРЕННЫЙ АНАЛИЗ СОСТОЯНИЯ ПОВЕРХНОСТИ ДОРОГИ
// ============================================================

// Основная функция расширенного анализа состояния поверхности
async function analyzeSurfaceConditionAdvanced(lat, lng, currentWeather) {
    console.log('🛣️ Расширенный анализ поверхности...');
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
            `&hourly=precipitation,rain,snowfall,temperature_2m,surface_temperature,` +
            `dewpoint_2m,relativehumidity_2m,windspeed_10m,cloudcover,shortwave_radiation,weathercode` +
            `&past_hours=24&forecast_hours=6&timezone=auto`;
        const response = await fetch(url);
        const data = await response.json();
        const hourly = data.hourly;

        if (!hourly) {
            return getFallbackSurfaceCondition(currentWeather);
        }

        const precipAnalysis = analyzePrecipitationPeriods(hourly);
        const dryingAnalysis = analyzeDryingConditions(hourly, currentWeather);
        const surfaceType = determineSurfaceType(currentWeather.roadType || '');
        const coverage = calculateSurfaceCoverage(precipAnalysis, dryingAnalysis);

        const conditionData = {
            precipAnalysis,
            dryingAnalysis,
            surfaceType,
            coverage,
            currentWeather,
            hourly
        };

        const condition = determineAdvancedSurfaceCondition(conditionData);
        const drivingImpact = calculateDetailedDrivingImpact(condition, surfaceType);
        const forecast = forecastSurfaceChange(hourly, condition);

        // Backward-compatible fields
        const result = {
            ...condition,
            accRainMm: Math.round(precipAnalysis.total24h * 10) / 10,
            accSnowCm: Math.round((precipAnalysis.snowTotal24h || 0) * 10) / 10,
            continuousRainHours: precipAnalysis.continuousRainHours,
            currentTemp: Math.round((dryingAnalysis.surfaceTemp ?? currentWeather.temp ?? 0) * 10) / 10,
            // Extended fields
            precipAnalysisDetailed: precipAnalysis,
            dryingAnalysis,
            surfaceType,
            coverage,
            drivingImpact,
            forecast
        };

        console.log(`  ${result.icon} ${result.name} (${result.severity.toUpperCase()})`);
        console.log(`  📊 Осадки за 6ч: ${precipAnalysis.total6h} мм, испарилось: ${dryingAnalysis.evaporatedMm} мм`);
        console.log(`  ☀️ Скорость испарения: ${dryingAnalysis.evaporationRate} мм/ч (${getEvaporationLevel(dryingAnalysis.evaporationRate)})`);
        if (dryingAnalysis.dryingHours > 0) {
            console.log(`  ⏱️ Высохнет через ~${dryingAnalysis.dryingHours} ч`);
        }
        console.log(`  🚗 Тормозной путь: 60→${60 + Math.round(60 * drivingImpact.brakingModifier / 100)}м (+${Math.round(60 * drivingImpact.brakingModifier / 100)}м)`);
        console.log(`  ${forecast.trendIcon} Тренд: ${forecast.trend}`);

        return result;
    } catch (error) {
        console.error('Ошибка расширенного анализа поверхности:', error);
        return getFallbackSurfaceCondition(currentWeather);
    }
}

// Анализ осадков за различные периоды
function analyzePrecipitationPeriods(hourlyData) {
    const precip = hourlyData.precipitation || [];
    const snow = hourlyData.snowfall || [];
    const rain = hourlyData.rain || [];
    const total = precip.length;
    // past_hours=24, forecast_hours=6 → indices 0..29; current hour index = 23
    const nowIdx = Math.min(23, total - 7);

    function sumPeriod(arr, hoursBack) {
        let s = 0;
        for (let i = Math.max(0, nowIdx - hoursBack + 1); i <= nowIdx; i++) {
            s += arr[i] || 0;
        }
        return Math.round(s * 10) / 10;
    }

    const total1h = sumPeriod(precip, 1);
    const total3h = sumPeriod(precip, 3);
    const total6h = sumPeriod(precip, 6);
    const total12h = sumPeriod(precip, 12);
    const total24h = sumPeriod(precip, 24);
    const snowTotal24h = sumPeriod(snow, 24);
    const rainTotal24h = sumPeriod(rain, 24);

    // Время с последних осадков
    let hoursSinceRain = 0;
    for (let i = nowIdx; i >= 0; i--) {
        if ((precip[i] || 0) > 0.1) break;
        hoursSinceRain++;
    }

    // Продолжительность последнего эпизода
    let continuousRainHours = 0;
    for (let i = nowIdx; i >= 0; i--) {
        if ((precip[i] || 0) > 0.1) continuousRainHours++;
        else break;
    }

    // Интенсивность текущего часа
    const currentIntensity = precip[nowIdx] || 0;

    return {
        total1h, total3h, total6h, total12h, total24h,
        snowTotal24h, rainTotal24h,
        hoursSinceRain,
        continuousRainHours,
        currentIntensity,
        isRaining: currentIntensity > 0.1
    };
}

// Анализ условий высыхания
function analyzeDryingConditions(hourlyData, currentWeather) {
    const nowIdx = Math.min(23, (hourlyData.temperature_2m || []).length - 7);

    const airTemp = (hourlyData.temperature_2m || [])[nowIdx] ??
        (typeof currentWeather.temp === 'number' ? currentWeather.temp : 15);
    const surfaceTemp = (hourlyData.surface_temperature || [])[nowIdx] ?? airTemp;
    const dewpoint = (hourlyData.dewpoint_2m || [])[nowIdx] ?? (airTemp - 10);
    const humidity = (hourlyData.relativehumidity_2m || [])[nowIdx] ??
        (typeof currentWeather.humidity === 'number' ? currentWeather.humidity : 60);
    const windSpeed = (hourlyData.windspeed_10m || [])[nowIdx] ??
        (typeof currentWeather.windSpeed === 'number' ? currentWeather.windSpeed * 3.6 : 10);
    const cloudCover = (hourlyData.cloudcover || [])[nowIdx] ??
        (typeof currentWeather.cloudCover === 'number' ? currentWeather.cloudCover : 50);
    const radiation = (hourlyData.shortwave_radiation || [])[nowIdx] ?? 0;

    const tempDiff = surfaceTemp - dewpoint;
    const isAboveDewpoint = tempDiff > 0;

    const evaporationRate = calculateEvaporationRate(tempDiff, windSpeed, humidity, radiation);

    // Оставшаяся вода (мм) — из анализа осадков vs испарения
    const precipAnalysis = analyzePrecipitationPeriods(hourlyData);
    const elapsed6h = precipAnalysis.continuousRainHours > 0 ? 0 : precipAnalysis.hoursSinceRain;
    const evaporatedMm = Math.round(Math.min(precipAnalysis.total6h, evaporationRate * elapsed6h) * 10) / 10;
    const residualWater = Math.max(0, Math.round((precipAnalysis.total6h - evaporatedMm) * 10) / 10);

    const dryingHours = estimateDryingTime(residualWater, evaporationRate);

    let dryingTime = null;
    if (dryingHours > 0 && dryingHours < 48) {
        const t = new Date(Date.now() + dryingHours * 3600 * 1000);
        dryingTime = t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }

    return {
        airTemp: Math.round(airTemp * 10) / 10,
        surfaceTemp: Math.round(surfaceTemp * 10) / 10,
        dewpoint: Math.round(dewpoint * 10) / 10,
        tempDiff: Math.round(tempDiff * 10) / 10,
        humidity: Math.round(humidity),
        windSpeed: Math.round(windSpeed),
        cloudCover: Math.round(cloudCover),
        radiation: Math.round(radiation),
        isAboveDewpoint,
        evaporationRate: Math.round(evaporationRate * 10) / 10,
        evaporatedMm,
        residualWater,
        dryingHours: Math.round(dryingHours * 10) / 10,
        dryingTime
    };
}

// Расчёт скорости испарения (мм/час)
// Эмпирическая формула: сумма вкладов разности температур, ветра, влажности и радиации
function calculateEvaporationRate(tempDiff, windSpeed, humidity, radiation) {
    // 0.05: эмпирический коэффициент влияния разности температур на испарение
    let rate = Math.max(0, tempDiff * 0.05);
    // 100: нормировочный делитель для скорости ветра (км/ч → мм/ч)
    rate += (windSpeed / 100);
    // Снижение от высокой влажности
    const humidityFactor = Math.max(0.1, (100 - humidity) / 100);
    rate *= humidityFactor;
    // 0.001: масштабный коэффициент для солнечной радиации (Вт/м² → мм/ч)
    rate += radiation * 0.001;
    // Физически реалистичные границы: 0.05–5 мм/ч
    return Math.max(0.05, Math.min(5, rate));
}

// Оценка времени высыхания в часах
function estimateDryingTime(waterDepth, evaporationRate) {
    if (waterDepth <= 0 || evaporationRate <= 0) return 0;
    return Math.round((waterDepth / evaporationRate) * 10) / 10;
}

// Определение типа покрытия по типу дороги
function determineSurfaceType(roadTypeRaw) {
    const rt = (roadTypeRaw || '').toLowerCase();
    if (rt.includes('магистраль') || rt.includes('motorway') || rt.includes('trunk')) {
        return { type: 'premium_asphalt', drainage: 'excellent', texture: 'medium', label: 'Асфальтобетон премиум' };
    }
    if (rt.includes('первичн') || rt.includes('primary') || rt.includes('secondary') || rt.includes('вторичн')) {
        return { type: 'standard_asphalt', drainage: 'good', texture: 'medium', label: 'Асфальтобетон стандартный' };
    }
    if (rt.includes('жилая') || rt.includes('residential') || rt.includes('tertiary') || rt.includes('третичн')) {
        return { type: 'basic_asphalt', drainage: 'satisfactory', texture: 'smooth', label: 'Асфальтобетон базовый' };
    }
    if (rt.includes('грунт') || rt.includes('track') || rt.includes('gravel') || rt.includes('гравий')) {
        return { type: 'gravel', drainage: 'poor', texture: 'rough', label: 'Гравий' };
    }
    return { type: 'standard_asphalt', drainage: 'good', texture: 'medium', label: 'Асфальтобетон стандартный' };
}

// Расчёт остаточной воды и категории покрытия
function calculateSurfaceCoverage(precipAnalysis, dryingAnalysis) {
    const residual = dryingAnalysis.residualWater;
    let description, mainCoverage;
    if (residual <= 0) {
        mainCoverage = 'dry'; description = 'Сухое покрытие';
    } else if (residual < 0.5) {
        mainCoverage = 'damp'; description = 'Влажное покрытие';
    } else if (residual < 3) {
        mainCoverage = 'wet'; description = 'Мокрое покрытие';
    } else if (residual < 10) {
        mainCoverage = 'very_wet'; description = 'Очень мокрое покрытие';
    } else {
        mainCoverage = 'flooded'; description = 'Затопление';
    }
    return {
        mainCoverage,
        description,
        depthMm: residual,
        evaporatedMm: dryingAnalysis.evaporatedMm,
        precipTotal: precipAnalysis.total6h
    };
}

// Определение состояния поверхности на основе расширенных данных
function determineAdvancedSurfaceCondition(data) {
    const { precipAnalysis, dryingAnalysis, hourly } = data;
    const nowIdx = Math.min(23, (hourly.temperature_2m || []).length - 7);
    const codes = hourly.weathercode || [];
    const currentCode = codes[nowIdx] || 0;

    const temp = dryingAnalysis.airTemp;
    const accRain = precipAnalysis.total24h;
    const accSnow = precipAnalysis.snowTotal24h;
    const continuousRainHours = precipAnalysis.continuousRainHours;
    const precipitation = precipAnalysis.currentIntensity;

    // Определяем hadThaw/hadFreeze из почасовых данных
    const temps = hourly.temperature_2m || [];
    let hadThaw = false, hadFreeze = false;
    for (let i = 0; i <= nowIdx; i++) {
        const t = temps[i] !== undefined ? temps[i] : temp;
        if (t > 2) hadThaw = true;
        if (t < -2) hadFreeze = true;
    }
    const hadThawFreeze = hadThaw && hadFreeze;

    const isSnowing = (currentCode >= 71 && currentCode <= 79) || (currentCode >= 85 && currentCode <= 86);
    const isRaining = (currentCode >= 51 && currentCode <= 67) || (currentCode >= 80 && currentCode <= 82);

    // Приоритет 1: Гололедица
    if (temp < -2 && accSnow > 0 && hadThawFreeze) {
        return {
            name: 'Гололедица', icon: '🧊❄️', severity: 'critical',
            brakeIncrease: 400, speedReduction: 70,
            description: 'Слой льда >5 мм, движение крайне опасно',
            coverage: '100%', depth: `${Math.round(accSnow * 10)}мм льда`,
            forPedestrians: '🚷 КРАЙНЕ ОПАСНО — высокий риск падений и травм. Используйте нескользящую обувь, ледоходы, держитесь за поручни. Пожилым людям лучше остаться дома',
            forDrivers: 'Движение фактически невозможно — двигайтесь только при крайней необходимости',
            recommendations: ['Избегайте выхода на улицу без необходимости', 'Водителям: оставьте автомобиль при отсутствии шипованной резины']
        };
    }
    // Приоритет 2: Гололед
    if (temp >= -5 && temp <= 2 && isRaining && accRain > 0) {
        return {
            name: 'Гололед', icon: '🧊', severity: 'critical',
            brakeIncrease: 350, speedReduction: 60,
            description: 'Тонкий лёд на поверхности, тормозной путь +300-400%',
            coverage: '80-100%', depth: '1-3 мм',
            forPedestrians: '⚠️ ОЧЕНЬ ОПАСНО — скользкая поверхность, риск падений. Передвигайтесь медленно, мелкими шагами. Избегайте крутых спусков и лестниц',
            forDrivers: 'Движение крайне опасно — снизьте скорость до минимума',
            recommendations: ['Используйте шипованную резину', 'Увеличьте дистанцию до 10 секунд', 'Избегайте резкого торможения']
        };
    }
    // Приоритет 3: Обледенелый снег
    if (accSnow > 5 && hadThawFreeze && temp < -2) {
        return {
            name: 'Обледенелый снег', icon: '🧊🌨️', severity: 'critical',
            brakeIncrease: 300, speedReduction: 60,
            description: 'Наст после оттепели — твёрдая скользкая корка',
            coverage: '100%', depth: `${Math.round(accSnow)}см`,
            forPedestrians: '⚠️ ОЧЕНЬ ОПАСНО — высокий риск падений на насте. Используйте нескользящую обувь или ледоходы',
            forDrivers: 'Движение опасно — высокий риск заноса',
            recommendations: ['Используйте шипованную резину', 'Снизьте скорость на 60%', 'Избегайте резких манёвров']
        };
    }
    // Приоритет 4: Глубокий снег
    if (accSnow > 15) {
        return {
            name: 'Глубокий снег', icon: '❄️❄️', severity: 'high',
            brakeIncrease: 200, speedReduction: 50,
            description: 'Снежный покров >15 см, движение существенно затруднено',
            coverage: '100%', depth: `${Math.round(accSnow)}см`,
            forPedestrians: '🥾 СЛОЖНО — глубокий снег затрудняет передвижение. Надевайте высокие непромокаемые ботинки',
            forDrivers: 'Движение крайне затруднено — необходим полный привод',
            recommendations: ['Используйте зимние шины', 'Снизьте скорость на 50%', 'Избегайте заснеженных второстепенных дорог']
        };
    }
    // Приоритет 5: Снежный покров
    if (accSnow > 5) {
        return {
            name: 'Снежный покров', icon: '🌨️', severity: 'high',
            brakeIncrease: 150, speedReduction: 40,
            description: 'Снег 5-15 см, дороги в снегу',
            coverage: '90-100%', depth: `${Math.round(accSnow)}см`,
            forPedestrians: '❄️ НЕУДОБНО — снежный покров, возможно скольжение. Надевайте тёплую непромокаемую обувь',
            forDrivers: 'Движение затруднено — снизьте скорость',
            recommendations: ['Используйте зимние шины', 'Снизьте скорость на 40%', 'Будьте осторожны на перекрёстках']
        };
    }
    // Приоритет 6: Лёгкий снег
    if (accSnow > 2 || isSnowing) {
        return {
            name: 'Лёгкий снег', icon: '❄️', severity: 'moderate',
            brakeIncrease: 80, speedReduction: 25,
            description: 'Снег 2-5 см, виден асфальт',
            coverage: '50-80%', depth: `${Math.round(accSnow)}см`,
            forPedestrians: '⚠️ ОСТОРОЖНО — возможны скользкие участки, особенно в тени',
            forDrivers: 'Движение возможно с осторожностью',
            recommendations: ['Используйте зимние шины', 'Снизьте скорость на 25%']
        };
    }
    // Приоритет 7: Снежная каша
    if (accSnow > 2 && temp >= -2 && temp <= 2) {
        return {
            name: 'Снежная каша', icon: '🌨️💧', severity: 'high',
            brakeIncrease: 120, speedReduction: 35,
            description: 'Мокрый снег, слякоть — плохое сцепление',
            coverage: '70-90%', depth: `${Math.round(accSnow)}см`,
            forPedestrians: '💦 НЕПРИЯТНО — слякоть вызывает намокание обуви и одежды. Используйте непромокаемую обувь',
            forDrivers: 'Опасность аквапланирования и заноса',
            recommendations: ['Снизьте скорость на 35%', 'Избегайте резкого торможения', 'Увеличьте дистанцию']
        };
    }
    // Приоритет 8: Затопление
    if (accRain > 50 && continuousRainHours >= 1) {
        return {
            name: 'Затопление', icon: '🌊', severity: 'critical',
            brakeIncrease: 250, speedReduction: 80,
            description: 'Стоячая вода >10 см, риск затопления автомобилей',
            coverage: '100%', depth: '>10 см',
            forPedestrians: '🚷 ОПАСНО — не входите в зоны затопления. Риск падения в канализационные люки, поражения электрическим током. Обходите затопленные участки',
            forDrivers: 'Движение невозможно — риск гидроудара двигателя',
            recommendations: ['Не заезжайте в затопленные участки', 'Объезжайте подтопленные зоны', 'Следите за уровнем воды']
        };
    }
    // Приоритет 9: Очень мокро
    if (accRain > 15 && continuousRainHours >= 2) {
        return {
            name: 'Очень мокро', icon: '🌧️', severity: 'high',
            brakeIncrease: 100, speedReduction: 30,
            description: 'Глубокие лужи, риск аквапланирования',
            coverage: '100%', depth: `${Math.round(accRain)}мм осадков`,
            forPedestrians: '🌧️ ПРОМОКАНИЕ — глубокие лужи. Используйте непромокаемую обувь, обходите скопления воды',
            forDrivers: 'Опасность аквапланирования — снизьте скорость',
            recommendations: ['Снизьте скорость на 30%', 'Объезжайте крупные лужи', 'Проверьте состояние шин']
        };
    }
    // Приоритет 10: Мокро
    if (accRain > 5 || continuousRainHours >= 1) {
        return {
            name: 'Мокро', icon: '💦', severity: 'moderate',
            brakeIncrease: 50, speedReduction: 20,
            description: 'Мокрое покрытие, увеличенный тормозной путь',
            coverage: '80-100%', depth: `${Math.round(accRain)}мм осадков`,
            forPedestrians: '💦 УМЕРЕННО — возможно намокание обуви. Рекомендуется непромокаемая обувь',
            forDrivers: 'Тормозной путь увеличен на 50%',
            recommendations: ['Снизьте скорость на 20%', 'Увеличьте дистанцию']
        };
    }
    // Приоритет 11: Влажно
    if (accRain > 0.5 || precipitation > 0) {
        return {
            name: 'Влажно', icon: '💧', severity: 'low',
            brakeIncrease: 20, speedReduction: 10,
            description: 'Лёгкая влага на дороге',
            coverage: '30-60%', depth: `${Math.round(accRain * 10) / 10}мм осадков`,
            forPedestrians: '✅ НОРМАЛЬНЫЕ УСЛОВИЯ — лёгкая влага не создаёт серьёзных препятствий',
            forDrivers: 'Незначительное увеличение тормозного пути',
            recommendations: ['Соблюдайте дистанцию']
        };
    }
    // Приоритет 12: Сухо
    return {
        name: 'Сухо', icon: '✅', severity: 'low',
        brakeIncrease: 0, speedReduction: 0,
        description: 'Идеальные условия для движения',
        coverage: '0%', depth: '0 мм',
        forPedestrians: '✅ ИДЕАЛЬНЫЕ УСЛОВИЯ — сухая поверхность, хорошее сцепление, риски минимальны',
        forDrivers: 'Нормальный тормозной путь',
        recommendations: ['Соблюдайте правила дорожного движения']
    };
}

// Прогноз изменения состояния поверхности на 6 часов
function forecastSurfaceChange(hourlyData, currentCondition) {
    const nowIdx = Math.min(23, (hourlyData.temperature_2m || []).length - 7);
    const precip = hourlyData.precipitation || [];

    let futureRain = 0;
    for (let i = nowIdx + 1; i <= Math.min(nowIdx + 6, precip.length - 1); i++) {
        futureRain += precip[i] || 0;
    }

    const futureTemp = (hourlyData.temperature_2m || [])[Math.min(nowIdx + 3, hourlyData.temperature_2m.length - 1)] ?? 10;

    let trend, trendIcon, expectedHours;

    const severityOrder = { low: 0, moderate: 1, high: 2, critical: 3 };
    const currentSeverity = severityOrder[currentCondition.severity] ?? 0;

    if (futureRain > 5 || futureTemp < -2) {
        trend = 'Ухудшение'; trendIcon = '📈';
        expectedHours = 2;
    } else if (futureRain < 0.5 && currentSeverity > 0) {
        trend = 'Улучшение'; trendIcon = '📉';
        expectedHours = 3;
    } else {
        trend = 'Стабильно'; trendIcon = '→';
        expectedHours = 6;
    }

    const futureCondition = futureRain < 0.5 && currentSeverity <= 1 ? '✅ Сухо' :
        futureRain > 5 ? '🌧️ Ухудшение осадков' : currentCondition.name;

    return { trend, trendIcon, expectedHours, futureCondition, futureRainMm: Math.round(futureRain * 10) / 10 };
}

// Детальный расчёт влияния на движение
function calculateDetailedDrivingImpact(condition, surfaceType) {
    const type = condition.name;
    const brakingModifier = getBrakingModifier(type);
    const speedReductionKmh = getSpeedReduction(type);
    const gripLevel = getGripLevel(type);
    const responseLevel = getResponseLevel(type);
    const motorcycleRisk = getMotorcycleRisk(type);
    const bicycleRisk = getBicycleRisk(type);

    const normalBraking = 60; // метры при 90 км/ч
    const newBraking = Math.round(normalBraking * (1 + brakingModifier / 100));
    const normalSpeed = 90;
    const safeSpeed = Math.max(10, normalSpeed - speedReductionKmh);

    return {
        normalBrakingM: normalBraking,
        newBrakingM: newBraking,
        brakingModifier,
        normalSpeed,
        safeSpeed,
        speedReductionKmh,
        gripLevel,
        responseLevel,
        motorcycleRisk,
        bicycleRisk
    };
}

// Коэффициент увеличения тормозного пути (%)
function getBrakingModifier(type) {
    const map = {
        'Сухо': 0, 'Влажно': 20, 'Мокро': 50, 'Очень мокро': 100,
        'Затопление': 250, 'Лёгкий снег': 80, 'Снежная каша': 120,
        'Снежный покров': 150, 'Глубокий снег': 200,
        'Гололед': 350, 'Обледенелый снег': 300, 'Гололедица': 400
    };
    return map[type] ?? 0;
}

// Рекомендуемое снижение скорости (км/ч)
function getSpeedReduction(type) {
    const map = {
        'Сухо': 0, 'Влажно': 10, 'Мокро': 20, 'Очень мокро': 30,
        'Затопление': 80, 'Лёгкий снег': 25, 'Снежная каша': 35,
        'Снежный покров': 40, 'Глубокий снег': 50,
        'Гололед': 60, 'Обледенелый снег': 60, 'Гололедица': 70
    };
    return map[type] ?? 0;
}

// Уровень сцепления
function getGripLevel(type) {
    const map = {
        'Сухо': 'Отличное', 'Влажно': 'Хорошее', 'Мокро': 'Снижено',
        'Очень мокро': 'Плохое', 'Затопление': 'Критическое',
        'Лёгкий снег': 'Снижено', 'Снежная каша': 'Плохое',
        'Снежный покров': 'Плохое', 'Глубокий снег': 'Плохое',
        'Гололед': 'Критическое', 'Обледенелый снег': 'Критическое', 'Гололедица': 'Критическое'
    };
    return map[type] ?? 'Нормальное';
}

// Реакция колёс
function getResponseLevel(type) {
    const map = {
        'Сухо': 'Отличная', 'Влажно': 'Хорошая', 'Мокро': 'Хорошая',
        'Очень мокро': 'Замедленная', 'Затопление': 'Непредсказуемая',
        'Лёгкий снег': 'Замедленная', 'Снежная каша': 'Плохая',
        'Снежный покров': 'Плохая', 'Глубокий снег': 'Плохая',
        'Гололед': 'Непредсказуемая', 'Обледенелый снег': 'Непредсказуемая', 'Гололедица': 'Непредсказуемая'
    };
    return map[type] ?? 'Хорошая';
}

// Риск для мотоциклов
function getMotorcycleRisk(type) {
    const map = {
        'Сухо': '✅ Безопасно', 'Влажно': '⚠️ Осторожно',
        'Мокро': '⚠️ Опасно', 'Очень мокро': '🚫 Очень опасно',
        'Затопление': '🚫 Невозможно', 'Лёгкий снег': '🚫 Очень опасно',
        'Снежная каша': '🚫 Очень опасно', 'Снежный покров': '🚫 Невозможно',
        'Глубокий снег': '🚫 Невозможно', 'Гололед': '🚫 Невозможно',
        'Обледенелый снег': '🚫 Невозможно', 'Гололедица': '🚫 Невозможно'
    };
    return map[type] ?? '⚠️ Осторожно';
}

// Риск для велосипедов
function getBicycleRisk(type) {
    const map = {
        'Сухо': '✅ Безопасно', 'Влажно': '⚠️ Осторожно',
        'Мокро': '⚠️ Опасно', 'Очень мокро': '🚫 Опасно',
        'Затопление': '🚫 Невозможно', 'Лёгкий снег': '🚫 Опасно',
        'Снежная каша': '🚫 Очень опасно', 'Снежный покров': '🚫 Невозможно',
        'Глубокий снег': '🚫 Невозможно', 'Гололед': '🚫 Невозможно',
        'Обледенелый снег': '🚫 Невозможно', 'Гололедица': '🚫 Невозможно'
    };
    return map[type] ?? '⚠️ Осторожно';
}

// Текстовое описание часов
function getHoursText(hours) {
    if (hours === 0) return 'Только что';
    if (hours === 1) return '1 час назад';
    if (hours < 5) return `${hours} часа назад`;
    return `${hours} часов назад`;
}

// Уровень испарения
function getEvaporationLevel(rate) {
    if (rate >= 2) return 'очень быстрая';
    if (rate >= 1) return 'быстрая';
    if (rate >= 0.5) return 'средняя';
    return 'медленная';
}

// Название типа покрытия
function getSurfaceTypeName(type) {
    const map = {
        premium_asphalt: 'Асфальтобетон премиум',
        standard_asphalt: 'Асфальтобетон стандартный',
        basic_asphalt: 'Асфальтобетон',
        gravel: 'Гравий'
    };
    return map[type] || 'Асфальтобетон';
}

// Название уровня дренажа
function getDrainageName(drainage) {
    const map = { excellent: 'Отличный', good: 'Хороший', satisfactory: 'Удовлетворительный', poor: 'Плохой' };
    return map[drainage] || 'Хороший';
}

// Название текстуры
function getTextureName(texture) {
    const map = { smooth: 'Гладкая', medium: 'Средняя', rough: 'Шероховатая', very_rough: 'Очень шероховатая' };
    return map[texture] || 'Средняя';
}

// Описание покрытия водой
function getCoverageDescription(coverage) {
    const map = { dry: 'Сухое', damp: 'Слегка влажное', wet: 'Мокрое', very_wet: 'Очень мокрое', flooded: 'Затоплено' };
    return map[coverage] || 'Нормальное';
}

// Цвет уровня опасности
function getSeverityColor(severity) {
    const map = { low: '#00aa00', moderate: '#ffaa00', high: '#ff6600', critical: '#ff4444' };
    return map[severity] || '#888888';
}

// Краткая информация о поверхности для popup маркера
function createBriefSurfaceInfo(surfaceData) {
    if (!surfaceData) return '';
    const warningText = surfaceData.brakeIncrease > 0
        ? `Тормозной путь +${Math.round(60 * surfaceData.brakeIncrease / 100)}м`
        : 'Нормальные условия';
    const color = getSeverityColor(surfaceData.severity);
    return `
        <div class="surface-brief">
            <div class="surface-brief-header">
                <span class="surface-icon-brief">${surfaceData.icon}</span>
                <span class="surface-title-brief" style="color:${color}">${escapeHtml(surfaceData.name)}</span>
            </div>
            <div class="surface-warning-brief">${escapeHtml(warningText)}</div>
        </div>
    `;
}

// Полная детальная информация о поверхности для модального окна
function createDetailedSurfaceInfo(surfaceData) {
    if (!surfaceData) return '<p>Данные недоступны</p>';

    const pa = surfaceData.precipAnalysisDetailed || {};
    const da = surfaceData.dryingAnalysis || {};
    const st = surfaceData.surfaceType || {};
    const cov = surfaceData.coverage || {};
    const di = surfaceData.drivingImpact || {};
    const fc = surfaceData.forecast || {};
    const color = getSeverityColor(surfaceData.severity);

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
                <div class="precip-periods">
                    <div class="period-item"><span>Последний час</span><span>${pa.total1h ?? 0} мм</span></div>
                    <div class="period-item"><span>Последние 3 ч</span><span>${pa.total3h ?? 0} мм</span></div>
                    <div class="period-item"><span>Последние 6 ч</span><span>${pa.total6h ?? 0} мм</span></div>
                    <div class="period-item"><span>За сутки</span><span>${pa.total24h ?? 0} мм</span></div>
                </div>
                <div class="precip-current">
                    <div class="period-item"><span>Интенсивность</span><span>${(pa.currentIntensity || 0) > 0.1 ? (pa.currentIntensity || 0) + ' мм/ч' : 'Нет'}</span></div>
                    <div class="period-item"><span>Последний дождь</span><span>${getHoursText(pa.hoursSinceRain ?? 0)}</span></div>
                    <div class="period-item"><span>Продолжался</span><span>${pa.continuousRainHours ?? 0} ч</span></div>
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">🌡️ ТЕМПЕРАТУРНЫЙ АНАЛИЗ</div>
                <div class="temp-grid">
                    <div class="temp-item"><span>Температура воздуха</span><span>${da.airTemp ?? 'Н/Д'}°C</span></div>
                    <div class="temp-item"><span>Температура поверхности</span><span>${da.surfaceTemp ?? 'Н/Д'}°C</span></div>
                    <div class="temp-item"><span>Точка росы</span><span>${da.dewpoint ?? 'Н/Д'}°C</span></div>
                    <div class="temp-item"><span>Разница (воздух-роса)</span><span>${da.tempDiff !== undefined ? (da.tempDiff >= 0 ? '+' : '') + da.tempDiff : 'Н/Д'}°C</span></div>
                </div>
                <div class="temp-status">
                    ${da.isAboveDewpoint
                        ? '✅ Поверхность выше точки росы — активное высыхание'
                        : '⚠️ Риск конденсации влаги на поверхности'}
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">☀️ УСЛОВИЯ ВЫСЫХАНИЯ</div>
                <div class="drying-grid">
                    <div class="drying-item"><span>Солнечная радиация</span><span>${da.radiation ?? 0} Вт/м²</span></div>
                    <div class="drying-item"><span>Облачность</span><span>${da.cloudCover ?? 0}%</span></div>
                    <div class="drying-item"><span>Скорость ветра</span><span>${da.windSpeed ?? 0} км/ч</span></div>
                    <div class="drying-item"><span>Относительная влажность</span><span>${da.humidity ?? 0}%</span></div>
                </div>
                <div class="evaporation-rate">
                    Скорость испарения: <strong>${da.evaporationRate ?? 0} мм/ч</strong>
                    (${getEvaporationLevel(da.evaporationRate ?? 0)})
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
                <div class="impact-grid-detailed">
                    <div class="impact-box">
                        <div class="impact-box-icon">🛑</div>
                        <div class="impact-box-label">Тормозной путь</div>
                        <div class="impact-box-value">${di.normalBrakingM ?? 60}→${di.newBrakingM ?? 60} м</div>
                        <div class="impact-box-delta">${(di.newBrakingM || 60) > 60 ? '+' : ''}${(di.newBrakingM || 60) - 60} м</div>
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
            </div>

            <div class="danger-badge-large" style="background:${color}">
                Уровень опасности: ${getSeverityName(surfaceData.severity)}
            </div>
        </div>
    `;
}

// Показать модальное окно с детальной информацией о поверхности
function showDetailedSurfaceModal() {
    if (!currentMarkerData || !currentMarkerData.surfaceCondition) return;
    const modal = document.getElementById('surfaceDetailModal');
    const content = document.getElementById('surfaceDetailContent');
    if (!modal || !content) return;
    content.innerHTML = createDetailedSurfaceInfo(currentMarkerData.surfaceCondition);
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

// Закрыть модальное окно детальной информации о поверхности
function closeSurfaceDetailModal() {
    const modal = document.getElementById('surfaceDetailModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
}

// Открытие модального окна с детальной информацией о давлении
function openPressureDetailModal(pressureData, fullData) {
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

// Закрытие модального окна давления
function closePressureDetailModal() {
    const modal = document.getElementById('pressureDetailModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Создание детального HTML-контента о давлении
function createDetailedPressureInfo(pressureAnalysis, fullData) {
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

// Инициализация слоёв карты
function initLayers() {
    layerGroups.earthquakes = L.layerGroup().addTo(map);
    layerGroups.fireRisk = L.layerGroup().addTo(map);
    layerGroups.roadPrecip = L.layerGroup().addTo(map);
}

// Очистка всех слоёв
function clearLayers() {
    Object.values(layerGroups).forEach(lg => { if (lg) lg.clearLayers(); });
    connectionLines.forEach(line => map.removeLayer(line));
    connectionLines = [];
    ['earthquakes', 'fireRisk', 'roadPrecip'].forEach(name => {
        const el = document.getElementById(`count-${name}`);
        if (el) el.textContent = name === 'earthquakes' ? '0' : '—';
    });
}

// Отображение слоя землетрясений с маркерами и линиями связи
function showEarthquakeLayer(mainLat, mainLng, seismicEvents) {
    if (!layerGroups.earthquakes) return;
    layerGroups.earthquakes.clearLayers();

    seismicEvents.forEach(event => {
        if (event.lat == null || event.lng == null) return;

        const mag = parseFloat(event.magnitude) || 0;
        const color = mag >= 6 ? '#ff4444' : mag >= 4 ? '#ff6600' : '#ffaa00';
        const radius = Math.max(8, mag * 5);

        const circle = L.circleMarker([event.lat, event.lng], {
            radius,
            fillColor: color,
            color: color,
            weight: 2,
            opacity: 0.9,
            fillOpacity: 0.5
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

        // Линия связи от главной точки до эпицентра
        const line = L.polyline([[mainLat, mainLng], [event.lat, event.lng]], {
            color: color, weight: 1, opacity: 0.4, dashArray: '5, 5'
        });
        connectionLines.push(line);
        map.addLayer(line);
    });

    const countEl = document.getElementById('count-earthquakes');
    if (countEl) countEl.textContent = seismicEvents.length;
}

// Отображение слоя пожарной опасности
function showFireRiskLayer(lat, lng, fireRisk) {
    if (!layerGroups.fireRisk) return;
    layerGroups.fireRisk.clearLayers();

    const circle = L.circle([lat, lng], {
        radius: 50,
        fillColor: fireRisk.color,
        color: fireRisk.color,
        weight: 2,
        opacity: 0.7,
        fillOpacity: 0.12
    });

    circle.bindPopup(`
        <div class="popup-title">🔥 ПОЖАРНАЯ ОПАСНОСТЬ</div>
        <div class="popup-section">
            <div class="popup-row">
                <span class="popup-label">Уровень:</span>
                <span class="popup-value" style="color: ${fireRisk.color}">${fireRisk.description}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Индекс:</span>
                <span class="popup-value">${fireRisk.score}/100</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">💡 Рекомендация:</span>
                <span class="popup-value">${fireRisk.recommendation}</span>
            </div>
        </div>
    `);

    layerGroups.fireRisk.addLayer(circle);

    const countEl = document.getElementById('count-fireRisk');
    if (countEl) {
        countEl.textContent = fireRisk.level === 'extreme' ? '⚠️' :
                              fireRisk.level === 'high' ? '🔴' :
                              fireRisk.level === 'medium' ? '🟡' : '🟢';
    }
}

// Отображение слоя осадков на дорогах
function showRoadPrecipLayer(lat, lng, precipAnalysis) {
    if (!layerGroups.roadPrecip) return;
    layerGroups.roadPrecip.clearLayers();

    const marker = L.circleMarker([lat, lng], {
        radius: 1000,
        fillColor: precipAnalysis.surfaceColor,
        color: precipAnalysis.surfaceColor,
        weight: 3,
        opacity: 0.9,
        fillOpacity: 0.25
    });

    const warningsHtml = [precipAnalysis.visibilityWarning, precipAnalysis.windWarning]
        .filter(Boolean)
        .map(w => `<div class="popup-row"><span class="popup-value alert-warning">${w}</span></div>`)
        .join('');

    const recsHtml = precipAnalysis.recommendations
        .map(r => `<div class="popup-row"><span class="popup-label">💡</span><span class="popup-value">${r}</span></div>`)
        .join('');

    marker.bindPopup(`
        <div class="popup-title">🌧️ ДОРОЖНЫЕ УСЛОВИЯ</div>
        <div class="popup-section">
            <div class="popup-row">
                <span class="popup-label">Покрытие:</span>
                <span class="popup-value" style="color: ${precipAnalysis.surfaceColor}">${precipAnalysis.surfaceCondition}</span>
            </div>
            ${warningsHtml}
        </div>
        ${recsHtml ? `<div class="popup-section"><div class="popup-section-title">💡 РЕКОМЕНДАЦИИ ВОДИТЕЛЯМ</div>${recsHtml}</div>` : ''}
    `);

    layerGroups.roadPrecip.addLayer(marker);

    const countEl = document.getElementById('count-roadPrecip');
    if (countEl) countEl.textContent = precipAnalysis.speedReduction > 0 ? '⚠️' : '✅';
}

// Переключение видимости слоя
function toggleLayer(layerName) {
    layerStates[layerName] = !layerStates[layerName];
    const lg = layerGroups[layerName];
    if (!lg) return;
    if (layerStates[layerName]) {
        if (!map.hasLayer(lg)) map.addLayer(lg);
        // Восстановить линии связи при включении землетрясений
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

// Обновление всех слоёв для нового местоположения
function updateLayersForLocation(lat, lng, fullData) {
    connectionLines.forEach(line => map.removeLayer(line));
    connectionLines = [];

    showEarthquakeLayer(lat, lng, fullData.seismicEvents || []);
    showFireRiskLayer(lat, lng, fullData.fireRisk || calculateFireRisk(fullData));
    showRoadPrecipLayer(lat, lng, fullData.precipAnalysis || getRoadPrecipAnalysis(fullData));

    // Применить текущие состояния видимости слоёв
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

// Отображение полных данных в боковой панели
function displayFullInfo(data) {
    currentMarkerData = data;
    const content = document.getElementById('infoContent');
    const markerIndex = markers.length - 1;
    const tempStatus = data.temp > 20 ? 'status-good' : data.temp > 0 ? 'status-warning' : 'status-bad';
    const trafficStatus = getTrafficStatus(data.traffic);
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
                <span class="info-value">${data.windSpeed} м/с ${getWindDirection(data.windDir)}</span>
            </div>
            <div class="info-row" style="cursor:pointer" onclick="openPressureDetailModal(${JSON.stringify(data.pressureAnalysis).replace(/"/g, '&quot;')}, ${JSON.stringify({pressure: data.pressure}).replace(/"/g, '&quot;')})">
                <span class="info-label">Давление:</span>
                <span class="info-value">${data.pressure} гПа (${data.pressureAnalysis.trendIcon} ${data.pressureAnalysis.trend})</span>
            </div>
            ${data.precipitation > 0 ? `
            <div class="info-row">
                <span class="info-label">Осадки:</span>
                <span class="info-value">${data.precipitation} мм (${data.precipType})</span>
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
                <span class="info-label">Трафик:</span>
                <span class="info-value">
                    <span class="status-indicator ${trafficStatus}"></span>${data.traffic}
                </span>
            </div>
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
                    <div class="impact-item"><span>📏 Покрытие</span><span>${data.surfaceCondition.coverage}</span></div>
                </div>
            </div>
            <button class="surface-detail-btn" onclick="showDetailedSurfaceModal()">
                📊 ПОЛНАЯ ИНФОРМАЦИЯ О ПОВЕРХНОСТИ →
            </button>
        </div>` : ''}

        ${data.fireRisk && data.fireRisk.level !== 'low' ? `
        <div class="info-section">
            <div class="section-title">🔥 ПОЖАРНАЯ ОПАСНОСТЬ</div>
            <div class="info-row">
                <span class="info-label">Уровень:</span>
                <span class="info-value" style="color: ${data.fireRisk.color}">${data.fireRisk.description}</span>
            </div>
            <div class="info-row">
                <span class="info-label">💡 Рекомендация:</span>
                <span class="info-value">${data.fireRisk.recommendation}</span>
            </div>
        </div>` : ''}

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

// Показать индикатор загрузки
function showLoading() {
    const content = document.getElementById('infoContent');
    content.innerHTML = `
        <div class="loading">
            ⟳ СКАНИРОВАНИЕ...<br><br>
            Загрузка данных
        </div>
        <div class="loading-bar">
            <div class="loading-bar-fill"></div>
        </div>
    `;
}

// Показать сообщение об ошибке
function showError(message) {
    const content = document.getElementById('infoContent');
    content.innerHTML = `
        <div class="error">
            ✖ ОШИБКА<br><br>
            ${message}
        </div>
    `;
}

// Получение текущей геопозиции
function getCurrentLocation() {
    if (!navigator.geolocation) {
        showError('Геолокация не поддерживается браузером.');
        return;
    }
    showLoading();
    navigator.geolocation.getCurrentPosition(
        async function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            map.setView([lat, lng], 15);
            await scanLocation(lat, lng);
        },
        function(error) {
            showError('Не удалось получить геолокацию: ' + error.message);
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// Очистка всех маркеров
function clearMarkers() {
    markers.forEach(function(item) {
        map.removeLayer(item.marker);
    });
    markers = [];
    markerCount = 0;

    clearLayers();

    const content = document.getElementById('infoContent');
    content.innerHTML = `
        <div class="no-selection">
            ▼ КЛИКНИТЕ НА КАРТУ ▼<br><br>
            [ ОЖИДАНИЕ КООРДИНАТ... ]<br><br>
            Система готова к сканированию<br>
            любой точки на карте
        </div>
    `;
    updateTimestamp();
}

// Обновление временного штампа
function updateTimestamp() {
    const ts = document.getElementById('timestamp');
    if (ts) {
        const now = new Date();
        ts.textContent = now.toLocaleString('ru-RU');
    }
}

// Обработчики клавиатуры
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModal();
    }
});

// Инициализация приложения
initMap();
initSearch();
updateTimestamp();
setInterval(updateTimestamp, 1000);

// Запуск автоматического обновления времени каждую секунду
setInterval(updateAllMarkerTimes, 1000);

// Инициализация мобильного режима
function initMobileMode() {
    deviceType = getDeviceType();

    if (deviceType === 'smartphone-portrait') {
        showMobileInterface();
        checkAndShowNotification();

        const savedTab = localStorage.getItem('mobile_active_tab');
        if (savedTab) {
            activeMobileTab = savedTab;
            switchMobileTab(savedTab);
        }
    } else {
        hideMobileInterface();
    }
}

function showMobileInterface() {
    const switcher = document.getElementById('mobileTabSwitcher');
    if (switcher) {
        switcher.style.display = 'flex';
    }
}

function hideMobileInterface() {
    const switcher = document.getElementById('mobileTabSwitcher');
    const notification = document.getElementById('mobileNotification');

    if (switcher) {
        switcher.style.display = 'none';
    }
    if (notification) {
        notification.style.display = 'none';
    }

    const mapEl = document.getElementById('map');
    const infoPanel = document.getElementById('info-panel');

    if (mapEl) {
        mapEl.classList.remove('hidden');
    }
    if (infoPanel) {
        infoPanel.classList.remove('active');
    }
}

function checkAndShowNotification() {
    const dismissed = localStorage.getItem('mobile_notification_dismissed');

    if (!dismissed) {
        const notification = document.getElementById('mobileNotification');
        if (notification) {
            notification.style.display = 'flex';
        }
    }
}

function switchMobileTab(tab) {
    activeMobileTab = tab;
    localStorage.setItem('mobile_active_tab', tab);

    const mapEl = document.getElementById('map');
    const infoPanel = document.getElementById('info-panel');
    const tabMap = document.getElementById('tabMap');
    const tabInfo = document.getElementById('tabInfo');

    if (tab === 'map') {
        mapEl.classList.remove('hidden');
        infoPanel.classList.remove('active');
        tabMap.classList.add('active');
        tabInfo.classList.remove('active');
    } else {
        mapEl.classList.add('hidden');
        infoPanel.classList.add('active');
        tabMap.classList.remove('active');
        tabInfo.classList.add('active');
    }

    if (tab === 'map' && map) {
        setTimeout(() => {
            map.invalidateSize();
        }, 300);
    }
}

function setupMobileEventListeners() {
    const tabMap = document.getElementById('tabMap');
    const tabInfo = document.getElementById('tabInfo');

    if (tabMap) {
        tabMap.addEventListener('click', () => switchMobileTab('map'));
    }
    if (tabInfo) {
        tabInfo.addEventListener('click', () => switchMobileTab('info'));
    }

    const closeBtn = document.getElementById('closeNotification');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            const dontShow = document.getElementById('dontShowAgain');
            if (dontShow && dontShow.checked) {
                localStorage.setItem('mobile_notification_dismissed', 'true');
            }

            const notification = document.getElementById('mobileNotification');
            if (notification) {
                notification.style.display = 'none';
            }
        });
    }

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const newDeviceType = getDeviceType();
            if (newDeviceType !== deviceType) {
                deviceType = newDeviceType;
                initMobileMode();
            }
        }, 200);
    });

    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            initMobileMode();
        }, 200);
    });
}

setupMobileEventListeners();
initMobileMode();
