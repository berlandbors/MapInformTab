// js/modules/utils/formatters.js - Data formatting functions

export function getWeatherIcon(code) {
    if (code === 0) return '☀️';
    if (code <= 3) return '☁️';
    if (code <= 49) return '🌫️';
    if (code <= 69) return '🌧️';
    if (code <= 79) return '🌨️';
    if (code <= 99) return '⛈️';
    return '🌡️';
}

export function getWeatherCondition(code) {
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

export function getWindDirection(degrees) {
    const dirs = ['С', 'ССВ', 'СВ', 'ВСВ', 'В', 'ВЮВ', 'ЮВ', 'ЮЮВ', 'Ю', 'ЮЮЗ', 'ЮЗ', 'ЗЮЗ', 'З', 'ЗСЗ', 'СЗ', 'ССЗ'];
    const index = Math.round(degrees / 22.5) % 16;
    return dirs[index];
}

export function getRoadTypeName(highway) {
    if (highway === undefined || highway === null || highway === '') {
        return 'Неизвестно';
    }
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

export function getSurfaceName(surface) {
    if (surface === undefined || surface === null || surface === '') {
        return 'Не определено';
    }
    const surfaces = {
        asphalt: 'Асфальт',
        concrete: 'Бетон',
        paved: 'Мощёное',
        unpaved: 'Немощёное',
        gravel: 'Гравий',
        dirt: 'Грунт',
        grass: 'Трава',
        cobblestone: 'Брусчатка',
        paving_stones: 'Плитка',
        compacted: 'Укатанное',
        fine_gravel: 'Мелкий гравий',
        ground: 'Земля',
        mud: 'Грязь',
        sand: 'Песок',
        wood: 'Деревянное',
        metal: 'Металл',
        sett: 'Булыжник'
    };
    return surfaces[surface] || surface || 'Не определено';
}

export function getObjectTypeName(type) {
    if (!type) return 'Объект';
    const types = {
        house: 'Дом', residential: 'Жилое здание', apartments: 'Многоквартирный дом',
        commercial: 'Коммерческое здание', industrial: 'Промышленное здание',
        retail: 'Торговое здание', office: 'Офисное здание', school: 'Школа',
        university: 'Университет', hospital: 'Больница', church: 'Церковь',
        mosque: 'Мечеть', temple: 'Храм', synagogue: 'Синагога',
        restaurant: 'Ресторан', cafe: 'Кафе', bar: 'Бар', pub: 'Паб',
        fast_food: 'Фастфуд', pharmacy: 'Аптека', bank: 'Банк', atm: 'Банкомат',
        parking: 'Парковка', fuel: 'АЗС', police: 'Полиция',
        fire_station: 'Пожарная станция', post_office: 'Почта', library: 'Библиотека',
        cinema: 'Кинотеатр', theatre: 'Театр', museum: 'Музей',
        place_of_worship: 'Место поклонения', supermarket: 'Супермаркет',
        convenience: 'Продуктовый', clothes: 'Магазин одежды',
        hairdresser: 'Парикмахерская', bakery: 'Булочная', butcher: 'Мясная лавка',
        shop: 'Магазин', hotel: 'Отель', motel: 'Мотель', hostel: 'Хостел',
        attraction: 'Достопримечательность', viewpoint: 'Смотровая площадка',
        park: 'Парк', playground: 'Детская площадка', sports_centre: 'Спортивный центр',
        stadium: 'Стадион', swimming_pool: 'Бассейн', bus_stop: 'Автобусная остановка',
        railway: 'Железная дорога', station: 'Станция', airport: 'Аэропорт',
        bicycle_parking: 'Велопарковка', water: 'Водоём', forest: 'Лес',
        meadow: 'Луг', farmland: 'Сельскохозяйственные угодья',
        pedestrian: 'Пешеходная зона', footway: 'Пешеходная дорожка',
        administrative: 'Административная граница', boundary: 'Граница', yes: 'Объект'
    };
    const t = String(type);
    return types[t] || t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ');
}

export function getPrecipitationType(weatherCode) {
    if (weatherCode >= 71 && weatherCode <= 77) return 'Снег';
    if (weatherCode >= 85 && weatherCode <= 86) return 'Снег';
    if (weatherCode >= 51 && weatherCode <= 55) return 'Морось';
    if (weatherCode >= 61 && weatherCode <= 67) return 'Дождь';
    if (weatherCode >= 80 && weatherCode <= 82) return 'Ливень';
    if (weatherCode >= 95) return 'Гроза';
    return 'Нет';
}

export function getSeverityName(severity) {
    const names = { critical: 'КРИТИЧЕСКИЙ', high: 'ВЫСОКИЙ', moderate: 'СРЕДНИЙ', low: 'НИЗКИЙ' };
    return names[severity] || (severity ? severity.toUpperCase() : '');
}

export function getSeverityIcon(severity) {
    const icons = { critical: '🚨', high: '⚠️', moderate: '⚡', low: '✅' };
    return icons[severity] || '⚠️';
}

export function getQualityLabel(grade) {
    const labels = {
        'excellent': 'Отлично', 'good': 'Хорошо',
        'fair': 'Удовлетворительно', 'poor': 'Низкое'
    };
    return labels[grade] || 'Неизвестно';
}

export function getQualityColorClass(grade) {
    const classes = {
        'excellent': 'quality-excellent', 'good': 'quality-good',
        'fair': 'quality-fair', 'poor': 'quality-poor'
    };
    return classes[grade] || '';
}

export function getLocalWeatherAlerts(weatherCode, precipProbability) {
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
