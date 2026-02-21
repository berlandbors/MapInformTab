let map;
let markers = [];
let markerCount = 0;

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
        const [weatherData, locationData, roadData] = await Promise.all([
            getWeatherData(lat, lng),
            getLocationData(lat, lng),
            getRoadData(lat, lng)
        ]);

        const fullData = {
            ...weatherData,
            ...locationData,
            ...roadData,
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
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,visibility,uv_index,precipitation,cloud_cover&wind_speed_unit=ms`;
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
updateTimestamp();
setInterval(updateTimestamp, 1000);
