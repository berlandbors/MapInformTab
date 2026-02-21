let map;
let markers = [];
let markerCount = 0;
let searchTimeout = null;

// Определение мобильного устройства
const isMobile = window.matchMedia("(max-width: 768px)").matches;

// Инициализация карты
function initMap() {
    const initialZoom = isMobile ? 11 : 12;
    map = L.map('map', { tap: true }).setView([55.7558, 37.6173], initialZoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    map.on('click', async function(e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        await scanLocation(lat, lng);
    });
}

// Главная функция сканирования локации
async function scanLocation(lat, lng) {
    markerCount++;
    showLoading();

    try {
        const [weatherData, locationData, roadData, seismicData, astronomyData] = await Promise.all([
            getWeatherData(lat, lng),
            getLocationData(lat, lng),
            getRoadData(lat, lng),
            getSeismicData(lat, lng),
            getAstronomyData(lat, lng)
        ]);

        const alertsData = getWeatherAlerts(weatherData.weatherCode, weatherData.precipProbability);

        const fullData = {
            ...weatherData,
            ...locationData,
            ...roadData,
            ...seismicData,
            ...astronomyData,
            ...alertsData,
            id: markerCount,
            scanTime: new Date().toLocaleString('ru-RU')
        };

        createMarker(lat, lng, fullData);
        displayFullInfo(fullData);

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

    const marker = L.marker([lat, lng], {
        icon: icon,
        riseOnHover: true
    }).addTo(map);

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
            <div class="popup-row">
                <span class="popup-label">Улица:</span>
                <span class="popup-value">${data.road}</span>
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

        <button class="popup-details-btn" onclick="openModalById(${markerIndex})">
            [ 📋 ПОЛНАЯ ИНФОРМАЦИЯ ]
        </button>

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
            <div class="modal-row">
                <span class="modal-label">Улица/адрес:</span>
                <span class="modal-value">${data.road}</span>
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
        </div>

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
            <div class="modal-row">
                <span class="modal-label">Атм. давление:</span>
                <span class="modal-value">${data.pressure} гПа</span>
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
                <span class="modal-label">Количество осадков:</span>
                <span class="modal-value">${data.precipitation} мм</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Облачность:</span>
                <span class="modal-value">${data.cloudCover}%</span>
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

        <div class="modal-section">
            <div class="modal-section-title">🌦️ ОСАДКИ И ПРЕДУПРЕЖДЕНИЯ</div>
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
            <div class="modal-section-title">🕐 ВРЕМЯ И АСТРОНОМИЯ</div>
            <div class="modal-row">
                <span class="modal-label">Часовой пояс:</span>
                <span class="modal-value">${data.timezone || 'Н/Д'}</span>
            </div>
            <div class="modal-row">
                <span class="modal-label">Смещение UTC:</span>
                <span class="modal-value">UTC${data.utcOffsetSeconds >= 0 ? '+' : ''}${Math.round((data.utcOffsetSeconds || 0) / 3600)}</span>
            </div>
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
    `;

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

// Получение геолокационных данных через Nominatim API
async function getLocationData(lat, lng) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
        const response = await fetch(url, {
            headers: { 'Accept-Language': 'ru' }
        });
        const data = await response.json();
        const addr = data.address || {};

        return {
            road: addr.road || addr.pedestrian || addr.path || addr.footway || 'Нет данных',
            city: addr.city || addr.town || addr.village || addr.hamlet || addr.county || 'Нет данных',
            district: addr.suburb || addr.neighbourhood || addr.district || addr.city_district || 'Нет данных',
            state: addr.state || addr.region || 'Нет данных',
            country: addr.country || 'Нет данных',
            postcode: addr.postcode || null,
            displayName: data.display_name || 'Нет данных'
        };
    } catch (error) {
        console.error('Ошибка получения геолокации:', error);
        return {
            road: 'Ошибка загрузки',
            city: 'Ошибка загрузки',
            district: 'Ошибка загрузки',
            state: 'Ошибка загрузки',
            country: 'Ошибка загрузки',
            postcode: null,
            displayName: 'Ошибка загрузки'
        };
    }
}

// Получение данных о дорогах через Overpass API
async function getRoadData(lat, lng) {
    try {
        const radius = 50;
        const query = `[out:json][timeout:10];
            way(around:${radius},${lat},${lng})[highway];
            out body 1;`;
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.elements && data.elements.length > 0) {
            const road = data.elements[0];
            const tags = road.tags || {};
            const traffic = estimateTraffic(tags.highway);

            return {
                roadName: tags.name || tags['name:ru'] || null,
                roadType: getRoadTypeName(tags.highway),
                maxSpeed: tags.maxspeed ? parseInt(tags.maxspeed) : null,
                roadSurface: getSurfaceName(tags.surface),
                lanes: tags.lanes || null,
                traffic: traffic
            };
        }

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

// Получение иконки погоды по коду
function getWeatherIcon(code) {
    if (code === 0) return '☀️';
    if (code <= 3) return '��️';
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
    const name = el.getAttribute('data-name');
    clearSearchResults();
    document.getElementById('searchInput').value = name;
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
            magnitude: f.properties.mag !== null ? f.properties.mag.toFixed(1) : '?',
            depth: f.geometry.coordinates[2] !== null ? Math.round(f.geometry.coordinates[2]) : '?',
            place: f.properties.place || 'Нет данных',
            time: new Date(f.properties.time).toLocaleString('ru-RU')
        }));
        return { seismicEvents: events };
    } catch (error) {
        console.error('Ошибка получения сейсмических данных:', error);
        return { seismicEvents: [] };
    }
}

// Астрономические данные через SunCalc.js
function getAstronomyData(lat, lng) {
    try {
        const now = new Date();
        const sunTimes = SunCalc.getTimes(now, lat, lng);
        const moonTimes = SunCalc.getMoonTimes(now, lat, lng);
        const moonIllum = SunCalc.getMoonIllumination(now);

        const sunrise = sunTimes.sunrise;
        const sunset = sunTimes.sunset;
        const validSun = sunrise instanceof Date && !isNaN(sunrise) && sunset instanceof Date && !isNaN(sunset);
        const dayLengthMin = validSun ? (sunset - sunrise) / 60000 : 0;

        return Promise.resolve({
            sunriseTime: validSun ? sunrise.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'Н/Д',
            sunsetTime: validSun ? sunset.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'Н/Д',
            dayLength: validSun ? `${Math.floor(dayLengthMin / 60)}ч ${Math.round(dayLengthMin % 60)}м` : 'Н/Д',
            dayPhase: getDayPhase(now, sunTimes),
            moonriseTime: moonTimes.rise instanceof Date ? moonTimes.rise.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'Н/Д',
            moonsetTime: moonTimes.set instanceof Date ? moonTimes.set.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'Н/Д',
            moonPhase: getMoonPhaseName(moonIllum.phase),
            moonIllumination: Math.round(moonIllum.fraction * 100)
        });
    } catch (error) {
        console.error('Ошибка астрономических данных:', error);
        return Promise.resolve({
            sunriseTime: 'Н/Д', sunsetTime: 'Н/Д', dayLength: 'Н/Д',
            dayPhase: 'Н/Д', moonriseTime: 'Н/Д', moonsetTime: 'Н/Д',
            moonPhase: 'Н/Д', moonIllumination: 0
        });
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
    if (precipProbability >= 80 && alerts.length === 0) {
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

// Отображение полных данных в боковой панели
function displayFullInfo(data) {
    const content = document.getElementById('infoContent');
    const markerIndex = markers.length - 1;
    const tempStatus = data.temp > 20 ? 'status-good' : data.temp > 0 ? 'status-warning' : 'status-bad';
    const trafficStatus = getTrafficStatus(data.traffic);
    const weatherIcon = getWeatherIcon(data.weatherCode);

    content.innerHTML = `
        <div class="info-section">
            <div class="section-title">📍 ТОЧКА #${data.id}</div>
            <div class="info-row">
                <span class="info-label">Адрес:</span>
                <span class="info-value">${data.road}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Город:</span>
                <span class="info-value">${data.city}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Район:</span>
                <span class="info-value">${data.district}</span>
            </div>
            <div class="gps-coords">
                LAT: ${data.latitude}° | LNG: ${data.longitude}°
            </div>
        </div>

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
            <div class="info-row">
                <span class="info-label">Давление:</span>
                <span class="info-value">${data.pressure} гПа</span>
            </div>
        </div>

        <div class="info-section">
            <div class="section-title">🚗 ДОРОГИ</div>
            <div class="info-row">
                <span class="info-label">Дорога:</span>
                <span class="info-value">${data.roadName || 'Н/Д'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Тип:</span>
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

        <div class="info-section">
            <div class="section-title">🌦️ ОСАДКИ И ПРЕДУПРЕЖДЕНИЯ</div>
            <div class="info-row">
                <span class="info-label">Осадки:</span>
                <span class="info-value">${data.precipitation} мм (${data.precipType})</span>
            </div>
            <div class="info-row">
                <span class="info-label">Вероятность осадков:</span>
                <span class="info-value">${data.precipProbability ?? 0}%</span>
            </div>
            <div class="info-row">
                <span class="info-label">Часов осадков:</span>
                <span class="info-value">${data.precipHours ?? 0} ч</span>
            </div>
            ${data.weatherAlerts && data.weatherAlerts.length > 0 ?
                data.weatherAlerts.map(a => `
                <div class="info-row">
                    <span class="info-label">${a.icon} ${a.type}:</span>
                    <span class="info-value alert-${a.level}">${a.description}</span>
                </div>`).join('') :
                `<div class="info-row">
                    <span class="info-label">Предупреждения:</span>
                    <span class="info-value">Нет активных</span>
                </div>`
            }
        </div>

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
            <div class="section-title">🕐 ВРЕМЯ И АСТРОНОМИЯ</div>
            <div class="info-row">
                <span class="info-label">Часовой пояс:</span>
                <span class="info-value">${data.timezone || 'Н/Д'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">🌅 Восход солнца:</span>
                <span class="info-value">${data.sunriseTime || 'Н/Д'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">🌇 Закат солнца:</span>
                <span class="info-value">${data.sunsetTime || 'Н/Д'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Световой день:</span>
                <span class="info-value">${data.dayLength || 'Н/Д'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Фаза дня:</span>
                <span class="info-value">${data.dayPhase || 'Н/Д'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">🌙 Восход луны:</span>
                <span class="info-value">${data.moonriseTime || 'Н/Д'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">🌙 Закат луны:</span>
                <span class="info-value">${data.moonsetTime || 'Н/Д'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Фаза луны:</span>
                <span class="info-value">${data.moonPhase || 'Н/Д'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Освещённость луны:</span>
                <span class="info-value">${data.moonIllumination ?? 0}%</span>
            </div>
        </div>

        <button class="view-details-btn" onclick="openModalById(${markerIndex})">
            [ 📋 ПОЛНАЯ ИНФОРМАЦИЯ ]
        </button>
    `;

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
