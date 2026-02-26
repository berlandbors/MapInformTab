// js/modules/api/openmeteo.js - Open-Meteo API integration

import { getWeatherCondition, getPrecipitationType } from '../utils/formatters.js';

export async function getWeatherData(lat, lng) {
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
