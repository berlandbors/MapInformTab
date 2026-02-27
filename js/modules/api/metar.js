// js/modules/api/metar.js - METAR aviation weather data

import { getDistance } from '../utils/helpers.js';

function parseCloudCover(cover) {
    const mapping = { 'CLR': 0, 'SKC': 0, 'FEW': 20, 'SCT': 50, 'BKN': 75, 'OVC': 100 };
    return cover ? mapping[cover] ?? null : null;
}

function decodeWeatherString(wxString) {
    if (!wxString) return null;

    const intensityMap = {
        '-': 'слабый ',
        '+': 'сильный ',
        'VC': 'в окрестностях '
    };

    const descriptors = {
        'MI': 'неплотный ',
        'PR': 'частичный ',
        'BC': 'клочковатый ',
        'DR': 'низовая метель ',
        'BL': 'метель ',
        'SH': 'ливневый ',
        'TS': 'грозовой ',
        'FZ': 'замерзающий '
    };

    const weatherCodes = {
        'RA': 'дождь',
        'DZ': 'морось',
        'SN': 'снег',
        'SG': 'снежные зёрна',
        'IC': 'ледяные кристаллы',
        'PL': 'ледяная крупа',
        'GR': 'град',
        'GS': 'малый град',
        'UP': 'неизвестные осадки',
        'BR': 'дымка',
        'FG': 'туман',
        'FU': 'дым',
        'VA': 'вулканический пепел',
        'DU': 'пыль',
        'SA': 'песок',
        'HZ': 'мгла',
        'PY': 'водяная пыль',
        'PO': 'пыльные вихри',
        'SQ': 'шквал',
        'FC': 'воронка облака/торнадо',
        'SS': 'песчаная буря',
        'DS': 'пыльная буря'
    };

    let decoded = wxString;

    for (const [code, translation] of Object.entries(intensityMap)) {
        decoded = decoded.replaceAll(code, translation);
    }

    for (const [code, translation] of Object.entries(descriptors)) {
        decoded = decoded.replaceAll(code, translation);
    }

    for (const [code, translation] of Object.entries(weatherCodes)) {
        decoded = decoded.replaceAll(code, translation);
    }

    return decoded !== wxString ? decoded : null;
}

function parseMETAR(metar) {
    return {
        temp: metar.temp ?? null,
        dewpoint: metar.dewp ?? null,
        pressure: metar.altim ? Math.round(metar.altim * 33.8639) : null,
        windSpeed: metar.wspd ? Math.round(metar.wspd * 0.514444) : null,
        windDir: metar.wdir ?? null,
        visibility: metar.visib ? metar.visib * 1.60934 : null,
        weatherCode: metar.wxString ?? null,
        cloudCover: parseCloudCover(metar.cover) ?? null,
        obsTime: metar.obsTime,
        stationId: metar.icaoId,
        distance: Math.round(metar.distance),
        source: 'METAR',
        reliability: 0.95,
        windGust: metar.wgst ? Math.round(metar.wgst * 0.514444) : null,
        flightCategory: metar.fltcat ?? null,
        vertVisibility: metar.vertVis ?? null,
        cloudLayers: metar.clouds?.map(c => ({
            cover: c.cover,
            base_ft: c.base_ft_agl,
            base_m: c.base_ft_agl ? Math.round(c.base_ft_agl * 0.3048) : null
        })) ?? [],
        rawText: metar.rawOb ?? null,
        elevation: metar.elev ? Math.round(metar.elev) : null,
        weatherDecoded: decodeWeatherString(metar.wxString)
    };
}

export function getFlightCategoryInfo(category) {
    const categories = {
        'VFR': { label: 'VFR (Отличная)', color: '#00ff00', icon: '🟢', description: 'Визуальные полёты' },
        'MVFR': { label: 'MVFR (Умеренная)', color: '#0088ff', icon: '🔵', description: 'Маргинальные условия' },
        'IFR': { label: 'IFR (Плохая)', color: '#ff8800', icon: '🟠', description: 'Приборные полёты' },
        'LIFR': { label: 'LIFR (Очень плохая)', color: '#ff0000', icon: '🔴', description: 'Низкая видимость' }
    };
    return categories[category] || null;
}

export async function getMETARData(lat, lng) {
    console.log('✈️ Запрос данных METAR...');
    try {
        const airportUrl = `https://aviationweather.gov/api/data/metar?bbox=${lng - 1},${lat - 1},${lng + 1},${lat + 1}&format=json`;
        const response = await fetch(airportUrl);
        if (!response.ok) throw new Error(`METAR API error: ${response.status}`);

        const airports = await response.json();
        if (!airports || airports.length === 0) {
            console.log('  ⚠️ Нет аэропортов в радиусе 100 км');
            return null;
        }

        const nearest = airports.reduce((closest, airport) => {
            const dist = getDistance(lat, lng, airport.lat, airport.lon);
            return (!closest || dist < closest.distance) ? { ...airport, distance: dist } : closest;
        }, null);

        if (nearest.distance > 100) {
            console.log(`  ⚠️ Ближайший аэропорт слишком далеко: ${nearest.distance} км`);
            return null;
        }

        console.log(`  ✅ METAR от ${nearest.icaoId} (${Math.round(nearest.distance)} км)`);
        return parseMETAR(nearest);
    } catch (error) {
        console.error('Ошибка получения METAR:', error);
        return null;
    }
}

export function mergeWeatherData(openMeteo, metar) {
    if (!metar) return openMeteo;
    console.log(`  🔀 Слияние данных: Open-Meteo + METAR (${metar.stationId})`);
    return {
        ...openMeteo,
        temp: metar.temp ?? openMeteo.temp,
        pressure: metar.pressure ?? openMeteo.pressure,
        windSpeed: metar.windSpeed ?? openMeteo.windSpeed,
        windDir: metar.windDir ?? openMeteo.windDir,
        visibility: metar.visibility ?? openMeteo.visibility,
        cloudCover: metar.cloudCover ?? openMeteo.cloudCover,
        metarStation: metar.stationId,
        metarDistance: metar.distance,
        metarTime: metar.obsTime,
        dataSource: 'hybrid',
        windGust: metar.windGust,
        flightCategory: metar.flightCategory,
        vertVisibility: metar.vertVisibility,
        cloudLayers: metar.cloudLayers,
        metarRaw: metar.rawText,
        metarElevation: metar.elevation,
        weatherDecoded: metar.weatherDecoded
    };
}
