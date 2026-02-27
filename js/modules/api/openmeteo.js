// js/modules/api/openmeteo.js - Open-Meteo API integration

import { getWeatherCondition, getPrecipitationType } from '../utils/formatters.js';
import { retryWithBackoff } from '../utils/retry.js';

/**
 * Fetches current weather data from Open-Meteo for a single point.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<object>} Weather data object
 */
export async function getWeatherData(lat, lng) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&current=temperature_2m,apparent_temperature,dew_point_2m,relative_humidity_2m,` +
        `wind_speed_10m,wind_direction_10m,wind_gusts_10m,` +
        `precipitation,rain,snowfall,showers,snow_depth,` +
        `cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,` +
        `surface_pressure,pressure_msl,visibility,uv_index,` +
        `shortwave_radiation,direct_radiation,diffuse_radiation,` +
        `weather_code,is_day,cape` +
        `&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,rain,` +
        `wind_speed_10m,wind_gusts_10m,cloud_cover,visibility,uv_index,dew_point_2m,is_day` +
        `&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,` +
        `precipitation_sum,rain_sum,snowfall_sum,precipitation_hours,precipitation_probability_max,` +
        `wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,` +
        `sunrise,sunset,sunshine_duration,daylight_duration,uv_index_max,uv_index_clear_sky_max` +
        `&timezone=auto&wind_speed_unit=ms&forecast_days=7&past_days=1`;
    try {
        const data = await retryWithBackoff(async () => {
            const startTime = performance.now();
            const response = await fetch(url);
            const elapsed = Math.round(performance.now() - startTime);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            console.log(`✅ getWeatherData Open-Meteo (${elapsed}мс) [${lat.toFixed(3)},${lng.toFixed(3)}]`);
            return response.json();
        });
        const current = data.current;

        return {
            // Existing flat fields (backward compatible)
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
            // past_days=1 means daily[0]=yesterday, daily[1]=today
            precipProbability: data.daily?.precipitation_probability_max?.[1] ?? 0,
            precipHours: data.daily?.precipitation_hours?.[1] ?? 0,
            precipType: getPrecipitationType(current.weather_code),
            latitude: Math.round(lat * 10000) / 10000,
            longitude: Math.round(lng * 10000) / 10000,

            // Extended current fields
            dewPoint: Math.round(current.dew_point_2m * 10) / 10,
            windGusts: Math.round(current.wind_gusts_10m * 10) / 10,
            rain: current.rain || 0,
            snowfall: current.snowfall || 0,
            showers: current.showers || 0,
            snowDepth: current.snow_depth || 0,
            cloudCoverLow: current.cloud_cover_low || 0,
            cloudCoverMid: current.cloud_cover_mid || 0,
            cloudCoverHigh: current.cloud_cover_high || 0,
            pressureMsl: Math.round(current.pressure_msl),
            solarRadiation: Math.round(current.shortwave_radiation || 0),
            directRadiation: Math.round(current.direct_radiation || 0),
            diffuseRadiation: Math.round(current.diffuse_radiation || 0),
            isDay: current.is_day === 1,
            cape: Math.round(current.cape || 0),

            // Hourly forecast (48+ hours)
            hourly: {
                time: data.hourly?.time || [],
                temperature: data.hourly?.temperature_2m || [],
                apparentTemperature: data.hourly?.apparent_temperature || [],
                precipitation: data.hourly?.precipitation || [],
                precipitationProbability: data.hourly?.precipitation_probability || [],
                rain: data.hourly?.rain || [],
                windSpeed: data.hourly?.wind_speed_10m || [],
                windGusts: data.hourly?.wind_gusts_10m || [],
                cloudCover: data.hourly?.cloud_cover || [],
                visibility: data.hourly?.visibility || [],
                uvIndex: data.hourly?.uv_index || [],
                dewPoint: data.hourly?.dew_point_2m || [],
                isDay: data.hourly?.is_day || []
            },

            // Daily forecast (7 days)
            daily: {
                time: data.daily?.time || [],
                temperatureMax: data.daily?.temperature_2m_max || [],
                temperatureMin: data.daily?.temperature_2m_min || [],
                apparentTemperatureMax: data.daily?.apparent_temperature_max || [],
                apparentTemperatureMin: data.daily?.apparent_temperature_min || [],
                precipitationSum: data.daily?.precipitation_sum || [],
                rainSum: data.daily?.rain_sum || [],
                snowfallSum: data.daily?.snowfall_sum || [],
                precipitationHours: data.daily?.precipitation_hours || [],
                precipitationProbabilityMax: data.daily?.precipitation_probability_max || [],
                windSpeedMax: data.daily?.wind_speed_10m_max || [],
                windGustsMax: data.daily?.wind_gusts_10m_max || [],
                windDirectionDominant: data.daily?.wind_direction_10m_dominant || [],
                sunrise: data.daily?.sunrise || [],
                sunset: data.daily?.sunset || [],
                sunshineDuration: data.daily?.sunshine_duration || [],
                daylightDuration: data.daily?.daylight_duration || [],
                uvIndexMax: data.daily?.uv_index_max || [],
                uvIndexClearSkyMax: data.daily?.uv_index_clear_sky_max || []
            }
        };
    } catch (error) {
        console.error('Ошибка получения погоды:', error);
        return {
            temp: 'Н/Д', feelsLike: 'Н/Д', humidity: 'Н/Д',
            windSpeed: 'Н/Д', windDir: 0, pressure: 'Н/Д',
            visibility: 'Н/Д', uvIndex: 'Н/Д', precipitation: 'Н/Д',
            cloudCover: 'Н/Д', weatherCode: 0, condition: 'Недоступно',
            elevation: 'Н/Д', timezone: 'Н/Д', utcOffsetSeconds: 0,
            precipProbability: 0, precipHours: 0, precipType: 'Нет',
            latitude: Math.round(lat * 10000) / 10000,
            longitude: Math.round(lng * 10000) / 10000,
            dewPoint: 'Н/Д', windGusts: 'Н/Д', rain: 0, snowfall: 0,
            showers: 0, snowDepth: 0, cloudCoverLow: 0, cloudCoverMid: 0,
            cloudCoverHigh: 0, pressureMsl: 'Н/Д', solarRadiation: 0,
            directRadiation: 0, diffuseRadiation: 0, isDay: true, cape: 0,
            hourly: { time: [], temperature: [], apparentTemperature: [], precipitation: [],
                precipitationProbability: [], rain: [], windSpeed: [], windGusts: [],
                cloudCover: [], visibility: [], uvIndex: [], dewPoint: [], isDay: [] },
            daily: { time: [], temperatureMax: [], temperatureMin: [], apparentTemperatureMax: [],
                apparentTemperatureMin: [], precipitationSum: [], rainSum: [], snowfallSum: [],
                precipitationHours: [], precipitationProbabilityMax: [], windSpeedMax: [],
                windGustsMax: [], windDirectionDominant: [], sunrise: [], sunset: [],
                sunshineDuration: [], daylightDuration: [], uvIndexMax: [], uvIndexClearSkyMax: [] }
        };
    }
}

export async function getWeatherDataSingle(lat, lng) {
    return getWeatherData(lat, lng);
}

export function calculateStandardDeviation(results, mean) {
    const n = results.length;
    const variance = { temp: 0, precipitation: 0, windSpeed: 0 };

    results.forEach(r => {
        variance.temp += Math.pow(r.temp - mean.temp, 2);
        variance.precipitation += Math.pow(r.precipitation - mean.precipitation, 2);
        variance.windSpeed += Math.pow(r.windSpeed - mean.windSpeed, 2);
    });

    return {
        temp: Math.round(Math.sqrt(variance.temp / n) * 10) / 10,
        precipitation: Math.round(Math.sqrt(variance.precipitation / n) * 100) / 100,
        windSpeed: Math.round(Math.sqrt(variance.windSpeed / n) * 10) / 10
    };
}

export async function getWeatherDataMultiPoint(lat, lng) {
    console.log('🌐 Многоточечный анализ погоды...');

    const offset = 0.025;
    const points = [
        { lat, lng, weight: 0.5 },
        { lat: lat + offset, lng, weight: 0.125 },
        { lat: lat - offset, lng, weight: 0.125 },
        { lat, lng: lng + offset, weight: 0.125 },
        { lat, lng: lng - offset, weight: 0.125 }
    ];

    try {
        const results = await Promise.all(
            points.map(p => getWeatherDataSingle(p.lat, p.lng))
        );

        const weighted = {
            temp: 0, feelsLike: 0, humidity: 0, windSpeed: 0,
            pressure: 0, precipitation: 0, cloudCover: 0, visibility: 0
        };

        results.forEach((data, i) => {
            const w = points[i].weight;
            weighted.temp += data.temp * w;
            weighted.feelsLike += data.feelsLike * w;
            weighted.humidity += data.humidity * w;
            weighted.windSpeed += data.windSpeed * w;
            weighted.pressure += data.pressure * w;
            weighted.precipitation += data.precipitation * w;
            weighted.cloudCover += data.cloudCover * w;
            weighted.visibility += data.visibility * w;
        });

        const stdDev = calculateStandardDeviation(results, weighted);

        return {
            ...results[0],
            temp: Math.round(weighted.temp),
            feelsLike: Math.round(weighted.feelsLike),
            humidity: Math.round(weighted.humidity),
            windSpeed: Math.round(weighted.windSpeed * 10) / 10,
            pressure: Math.round(weighted.pressure),
            precipitation: Math.round(weighted.precipitation * 10) / 10,
            cloudCover: Math.round(weighted.cloudCover),
            visibility: Math.round(weighted.visibility * 10) / 10,
            accuracy: {
                tempStdDev: stdDev.temp,
                precipStdDev: stdDev.precipitation,
                windStdDev: stdDev.windSpeed,
                dataPoints: results.length,
                method: 'multi-point-weighted'
            }
        };
    } catch (error) {
        console.error('Ошибка многоточечного анализа:', error);
        return getWeatherDataSingle(lat, lng);
    }
}
