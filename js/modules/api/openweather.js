// js/modules/api/openweather.js - OpenWeatherMap API integration

import { openWeatherMapLimiter } from '../utils/rateLimit.js';
import { weatherCache } from '../utils/cache.js';
import { handleApiError } from '../utils/errorHandler.js';

const BASE_URL = 'https://api.openweathermap.org';

function getApiKey() {
    return (typeof window !== 'undefined' && window.OPENWEATHER_API_KEY) || '';
}

/** Returns a URL string with the API key replaced by '***' for safe logging. */
function sanitizeUrl(url, apiKey) {
    return apiKey ? url.replace(apiKey, '***') : url;
}

/**
 * Fetches current weather conditions from OpenWeatherMap.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<object|null>}
 */
export async function getCurrentWeather(lat, lng) {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.warn('⚠️ OPENWEATHER_API_KEY не настроен');
        return null;
    }

    const cacheKey = `weather-${lat.toFixed(4)}-${lng.toFixed(4)}`;
    const cached = weatherCache.get(cacheKey);
    if (cached) {
        console.log(`✅ Кэш погоды: попадание для ${cacheKey}`);
        return cached;
    }

    await openWeatherMapLimiter.acquire();
    try {
        const url = `${BASE_URL}/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric&lang=ru`;
        console.log(`🌤️ GET ${sanitizeUrl(url, apiKey)}`);
        const startTime = performance.now();
        const response = await fetch(url);
        const elapsed = Math.round(performance.now() - startTime);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        console.log(`✅ getCurrentWeather (${elapsed}мс)`);
        const data = await response.json();
        const result = {
            temp: data.main.temp,
            feelsLike: data.main.feels_like,
            tempMin: data.main.temp_min,
            tempMax: data.main.temp_max,
            pressure: data.main.pressure,
            humidity: data.main.humidity,
            seaLevel: data.main.sea_level,
            groundLevel: data.main.grnd_level,
            visibility: data.visibility,
            windSpeed: data.wind.speed,
            windDeg: data.wind.deg,
            windGust: data.wind.gust,
            cloudCover: data.clouds.all,
            rain1h: data.rain?.['1h'] || 0,
            rain3h: data.rain?.['3h'] || 0,
            snow1h: data.snow?.['1h'] || 0,
            snow3h: data.snow?.['3h'] || 0,
            weatherCode: data.weather[0].id,
            weatherMain: data.weather[0].main,
            weatherDescription: data.weather[0].description,
            weatherIcon: data.weather[0].icon,
            sunrise: data.sys.sunrise,
            sunset: data.sys.sunset,
            timezone: data.timezone,
            cityName: data.name
        };
        weatherCache.set(cacheKey, result);
        console.log(`💾 Погода сохранена в кэш: ${cacheKey}`);
        return result;
    } catch (error) {
        return handleApiError(error, 'getCurrentWeather');
    }
}

/**
 * Fetches One Call API data (hourly, daily, alerts) from OpenWeatherMap.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<object|null>}
 */
export async function getOneCallData(lat, lng) {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    const cacheKey = `onecall-${lat.toFixed(4)}-${lng.toFixed(4)}`;
    const cached = weatherCache.get(cacheKey);
    if (cached) {
        console.log(`✅ Кэш onecall: попадание для ${cacheKey}`);
        return cached;
    }

    await openWeatherMapLimiter.acquire();
    try {
        const url = `${BASE_URL}/data/3.0/onecall?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric&lang=ru`;
        console.log(`🌤️ GET ${sanitizeUrl(url, apiKey)}`);
        const startTime = performance.now();
        const response = await fetch(url);
        const elapsed = Math.round(performance.now() - startTime);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        console.log(`✅ getOneCallData (${elapsed}мс)`);
        const data = await response.json();
        const result = {
            current: _parseCurrentWeather(data.current),
            minutely: (data.minutely || []).map(m => ({
                dt: m.dt,
                time: new Date(m.dt * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                precipitation: m.precipitation || 0
            })),
            hourly: (data.hourly || []).slice(0, 48).map(h => ({
                dt: h.dt,
                time: new Date(h.dt * 1000).toLocaleString('ru-RU'),
                temp: h.temp,
                feelsLike: h.feels_like,
                pressure: h.pressure,
                humidity: h.humidity,
                dewPoint: h.dew_point,
                clouds: h.clouds,
                visibility: h.visibility,
                windSpeed: h.wind_speed,
                windDeg: h.wind_deg,
                windGust: h.wind_gust,
                pop: h.pop,
                rain: h.rain?.['1h'] || 0,
                snow: h.snow?.['1h'] || 0,
                weather: h.weather[0]
            })),
            daily: (data.daily || []).slice(0, 8).map(d => ({
                dt: d.dt,
                date: new Date(d.dt * 1000).toLocaleDateString('ru-RU'),
                sunrise: d.sunrise, sunset: d.sunset,
                moonrise: d.moonrise, moonset: d.moonset,
                moonPhase: d.moon_phase,
                temp: d.temp, feelsLike: d.feels_like,
                pressure: d.pressure, humidity: d.humidity,
                dewPoint: d.dew_point, windSpeed: d.wind_speed,
                windDeg: d.wind_deg, windGust: d.wind_gust,
                clouds: d.clouds, pop: d.pop,
                rain: d.rain || 0, snow: d.snow || 0,
                weather: d.weather[0]
            })),
            alerts: (data.alerts || []).map(a => ({
                senderName: a.sender_name, event: a.event,
                start: a.start, end: a.end,
                startFormatted: new Date(a.start * 1000).toLocaleString('ru-RU'),
                endFormatted: new Date(a.end * 1000).toLocaleString('ru-RU'),
                description: a.description, tags: a.tags || []
            }))
        };
        weatherCache.set(cacheKey, result);
        console.log(`💾 OneCall сохранён в кэш: ${cacheKey}`);
        return result;
    } catch (error) {
        return handleApiError(error, 'getOneCallData');
    }
}

/**
 * Fetches a 5-day/3-hour forecast from OpenWeatherMap.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<object|null>}
 */
export async function get5DayForecast(lat, lng) {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    const cacheKey = `forecast-${lat.toFixed(4)}-${lng.toFixed(4)}`;
    const cached = weatherCache.get(cacheKey);
    if (cached) {
        console.log(`✅ Кэш прогноза: попадание для ${cacheKey}`);
        return cached;
    }

    await openWeatherMapLimiter.acquire();
    try {
        const url = `${BASE_URL}/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric&lang=ru`;
        console.log(`🌤️ GET ${sanitizeUrl(url, apiKey)}`);
        const startTime = performance.now();
        const response = await fetch(url);
        const elapsed = Math.round(performance.now() - startTime);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        console.log(`✅ get5DayForecast (${elapsed}мс)`);
        const data = await response.json();
        const result = {
            list: data.list.map(item => ({
                dt: item.dt,
                time: new Date(item.dt * 1000).toLocaleString('ru-RU'),
                temp: item.main.temp, feelsLike: item.main.feels_like,
                tempMin: item.main.temp_min, tempMax: item.main.temp_max,
                pressure: item.main.pressure, humidity: item.main.humidity,
                clouds: item.clouds.all, windSpeed: item.wind.speed,
                windDeg: item.wind.deg, windGust: item.wind.gust,
                visibility: item.visibility, pop: item.pop,
                rain: item.rain?.['3h'] || 0, snow: item.snow?.['3h'] || 0,
                weather: item.weather[0]
            })),
            city: {
                name: data.city.name, country: data.city.country,
                population: data.city.population, timezone: data.city.timezone,
                sunrise: data.city.sunrise, sunset: data.city.sunset
            }
        };
        weatherCache.set(cacheKey, result);
        console.log(`💾 Прогноз сохранён в кэш: ${cacheKey}`);
        return result;
    } catch (error) {
        return handleApiError(error, 'get5DayForecast');
    }
}

/**
 * Fetches air pollution data from OpenWeatherMap.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<object|null>}
 */
export async function getAirPollution(lat, lng) {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    const cacheKey = `airpollution-${lat.toFixed(4)}-${lng.toFixed(4)}`;
    const cached = weatherCache.get(cacheKey);
    if (cached) {
        console.log(`✅ Кэш загрязнения воздуха: попадание для ${cacheKey}`);
        return cached;
    }

    await openWeatherMapLimiter.acquire();
    try {
        const url = `${BASE_URL}/data/2.5/air_pollution?lat=${lat}&lon=${lng}&appid=${apiKey}`;
        console.log(`🌤️ GET ${sanitizeUrl(url, apiKey)}`);
        const startTime = performance.now();
        const response = await fetch(url);
        const elapsed = Math.round(performance.now() - startTime);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        console.log(`✅ getAirPollution (${elapsed}мс)`);
        const data = await response.json();
        const item = data.list[0];
        const aqiLabels = { 1: 'Отличное', 2: 'Хорошее', 3: 'Умеренное', 4: 'Плохое', 5: 'Очень плохое' };
        const result = {
            aqi: item.main.aqi,
            aqiText: aqiLabels[item.main.aqi] || 'Нет данных',
            co: item.components.co?.toFixed(1),
            no: item.components.no?.toFixed(1),
            no2: item.components.no2?.toFixed(1),
            o3: item.components.o3?.toFixed(1),
            so2: item.components.so2?.toFixed(1),
            pm2_5: item.components.pm2_5?.toFixed(1),
            pm10: item.components.pm10?.toFixed(1),
            nh3: item.components.nh3?.toFixed(1)
        };
        weatherCache.set(cacheKey, result);
        console.log(`💾 Загрязнение воздуха сохранено в кэш: ${cacheKey}`);
        return result;
    } catch (error) {
        return handleApiError(error, 'getAirPollution');
    }
}

function _parseCurrentWeather(current) {
    return {
        dt: current.dt, sunrise: current.sunrise, sunset: current.sunset,
        temp: current.temp, feelsLike: current.feels_like,
        pressure: current.pressure, humidity: current.humidity,
        dewPoint: current.dew_point, clouds: current.clouds,
        uvi: current.uvi, visibility: current.visibility,
        windSpeed: current.wind_speed, windDeg: current.wind_deg,
        windGust: current.wind_gust, weather: current.weather[0],
        rain: current.rain?.['1h'] || 0, snow: current.snow?.['1h'] || 0
    };
}

// Legacy functions used in original scanLocation
export async function getWeatherAlerts(lat, lng) {
    const apiKey = getApiKey();
    if (!apiKey) return { weatherAlerts: [] };
    await openWeatherMapLimiter.acquire();
    try {
        const url = `${BASE_URL}/data/3.0/onecall?lat=${lat}&lon=${lng}&exclude=minutely,hourly,daily&appid=${apiKey}`;
        console.log(`🌤️ GET ${sanitizeUrl(url, apiKey)}`);
        const response = await fetch(url);
        const data = await response.json();
        const alerts = (data.alerts || []).map(alert => ({
            sender: alert.sender_name || 'Метеослужба',
            event: alert.event,
            start: new Date(alert.start * 1000).toLocaleString('ru-RU'),
            end: new Date(alert.end * 1000).toLocaleString('ru-RU'),
            description: alert.description,
            severity: _getSeverityFromTags(alert.tags)
        }));
        return { weatherAlerts: alerts };
    } catch (error) {
        handleApiError(error, 'getWeatherAlerts');
        return { weatherAlerts: [] };
    }
}

export async function getAirQuality(lat, lng) {
    const apiKey = getApiKey();
    if (!apiKey) return { aqi: null, aqiText: 'Нет данных' };
    await openWeatherMapLimiter.acquire();
    try {
        const url = `${BASE_URL}/data/2.5/air_pollution?lat=${lat}&lon=${lng}&appid=${apiKey}`;
        console.log(`🌤️ GET ${sanitizeUrl(url, apiKey)}`);
        const response = await fetch(url);
        const data = await response.json();
        const aqi = data.list[0].main.aqi;
        const components = data.list[0].components;
        const aqiLabels = { 1: 'Отличное', 2: 'Хорошее', 3: 'Умеренное', 4: 'Плохое', 5: 'Очень плохое' };
        return {
            aqi, aqiText: aqiLabels[aqi] || 'Нет данных',
            pm25: components.pm2_5?.toFixed(1) || 'Н/Д',
            pm10: components.pm10?.toFixed(1) || 'Н/Д',
            co: components.co?.toFixed(1) || 'Н/Д',
            no2: components.no2?.toFixed(1) || 'Н/Д',
            o3: components.o3?.toFixed(1) || 'Н/Д',
            so2: components.so2?.toFixed(1) || 'Н/Д'
        };
    } catch (error) {
        handleApiError(error, 'getAirQuality');
        return { aqi: null, aqiText: 'Нет данных' };
    }
}

export async function getMinutelyForecast(lat, lng) {
    const apiKey = getApiKey();
    if (!apiKey) return { minutelyForecast: [] };
    await openWeatherMapLimiter.acquire();
    try {
        const url = `${BASE_URL}/data/3.0/onecall?lat=${lat}&lon=${lng}&exclude=current,hourly,daily,alerts&appid=${apiKey}`;
        console.log(`🌤️ GET ${sanitizeUrl(url, apiKey)}`);
        const response = await fetch(url);
        const data = await response.json();
        const minutely = (data.minutely || []).map(m => ({
            time: new Date(m.dt * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            precipitation: m.precipitation || 0
        }));
        return { minutelyForecast: minutely };
    } catch (error) {
        handleApiError(error, 'getMinutelyForecast');
        return { minutelyForecast: [] };
    }
}

function _getSeverityFromTags(tags) {
    if (!tags || tags.length === 0) return 'moderate';
    const criticalTags = ['Extreme', 'Extreme temperature value'];
    const highTags = ['Severe'];
    if (tags.some(tag => criticalTags.includes(tag))) return 'critical';
    if (tags.some(tag => highTags.includes(tag))) return 'high';
    return 'moderate';
}
