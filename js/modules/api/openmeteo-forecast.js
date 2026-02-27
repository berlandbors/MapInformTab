// js/modules/api/openmeteo-forecast.js - Hourly and Daily forecast formatters

/**
 * Get detailed hourly forecast for next 48 hours (starting from current hour)
 * @param {object} hourlyData - Hourly data from getWeatherData
 * @returns {Array} Formatted hourly forecast
 */
export function formatHourlyForecast(hourlyData) {
    if (!hourlyData || !hourlyData.time || hourlyData.time.length === 0) return [];

    const now = new Date();
    let startIdx = 0;
    for (let i = 0; i < hourlyData.time.length; i++) {
        if (new Date(hourlyData.time[i]) >= now) {
            startIdx = i;
            break;
        }
    }

    const forecast = [];
    const endIdx = Math.min(startIdx + 48, hourlyData.time.length);

    for (let i = startIdx; i < endIdx; i++) {
        forecast.push({
            time: new Date(hourlyData.time[i]),
            hour: new Date(hourlyData.time[i]).getHours(),
            temp: Math.round(hourlyData.temperature[i]),
            feelsLike: Math.round(hourlyData.apparentTemperature[i]),
            precipitation: hourlyData.precipitation[i] || 0,
            precipProb: hourlyData.precipitationProbability[i] || 0,
            rain: hourlyData.rain[i] || 0,
            windSpeed: Math.round(hourlyData.windSpeed[i] * 10) / 10,
            windGusts: Math.round(hourlyData.windGusts[i] * 10) / 10,
            cloudCover: hourlyData.cloudCover[i] || 0,
            visibility: Math.round((hourlyData.visibility[i] || 10000) / 1000 * 10) / 10,
            uvIndex: hourlyData.uvIndex[i] || 0,
            dewPoint: Math.round(hourlyData.dewPoint[i] * 10) / 10,
            isDay: hourlyData.isDay[i] === 1
        });
    }

    return forecast;
}

/**
 * Get detailed daily forecast for next 7 days
 * @param {object} dailyData - Daily data from getWeatherData
 * @returns {Array} Formatted daily forecast
 */
export function formatDailyForecast(dailyData) {
    if (!dailyData || !dailyData.time || dailyData.time.length === 0) return [];

    // past_days=1 means daily[0]=yesterday; skip past days using local date
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let startIdx = 0;
    for (let i = 0; i < dailyData.time.length; i++) {
        if (dailyData.time[i] >= today) {
            startIdx = i;
            break;
        }
    }

    const forecast = [];
    const length = Math.min(startIdx + 7, dailyData.time.length);

    for (let i = startIdx; i < length; i++) {
        const date = new Date(dailyData.time[i]);
        forecast.push({
            date: date,
            dayOfWeek: date.toLocaleDateString('ru-RU', { weekday: 'short' }),
            tempMax: Math.round(dailyData.temperatureMax[i]),
            tempMin: Math.round(dailyData.temperatureMin[i]),
            feelsLikeMax: Math.round(dailyData.apparentTemperatureMax[i]),
            feelsLikeMin: Math.round(dailyData.apparentTemperatureMin[i]),
            precipSum: dailyData.precipitationSum[i] || 0,
            rainSum: dailyData.rainSum[i] || 0,
            snowfallSum: dailyData.snowfallSum[i] || 0,
            precipHours: dailyData.precipitationHours[i] || 0,
            precipProb: dailyData.precipitationProbabilityMax[i] || 0,
            windSpeedMax: Math.round(dailyData.windSpeedMax[i] * 10) / 10,
            windGustsMax: Math.round(dailyData.windGustsMax[i] * 10) / 10,
            windDir: dailyData.windDirectionDominant[i] || 0,
            sunrise: new Date(dailyData.sunrise[i]),
            sunset: new Date(dailyData.sunset[i]),
            sunshineDuration: Math.round(dailyData.sunshineDuration[i] / 3600 * 10) / 10,
            daylightDuration: Math.round(dailyData.daylightDuration[i] / 3600 * 10) / 10,
            uvIndexMax: dailyData.uvIndexMax[i] || 0
        });
    }

    return forecast;
}
