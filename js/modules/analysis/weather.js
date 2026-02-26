// js/modules/analysis/weather.js - Weather ML corrections

export function assessConfidence({ stdDev, hasMETAR, parameter, value }) {
    let score = 50;
    let level = 'medium';
    let margin = null;
    let source = 'model';

    if (hasMETAR) { score += 40; source = 'measured'; }

    if (stdDev !== undefined && stdDev !== null) {
        if (parameter === 'temp') {
            if (stdDev < 1) score += 10;
            else if (stdDev > 3) score -= 20;
            margin = `±${Math.ceil(stdDev * 2)}°C`;
        } else if (parameter === 'precipitation') {
            if (stdDev < 0.5) score += 10;
            else if (stdDev > 2) score -= 20;
            margin = `±${Math.ceil(stdDev * 2 * 100)}%`;
        } else if (parameter === 'windSpeed') {
            if (stdDev < 1) score += 10;
            else if (stdDev > 3) score -= 20;
            margin = `±${Math.ceil(stdDev * 2)} м/с`;
        }
    }

    if (parameter === 'precipitation' && value === 0) score -= 10;
    if (parameter === 'visibility' && !hasMETAR) score -= 20;

    score = Math.max(0, Math.min(100, score));

    if (score >= 80) level = 'high';
    else if (score >= 60) level = 'medium';
    else if (score >= 40) level = 'low';
    else level = 'very_low';

    return {
        score, level, margin, source,
        icon: getConfidenceIcon(level),
        label: getConfidenceLabel(level)
    };
}

export function getConfidenceIcon(level) {
    return { 'high': '🟢', 'medium': '🟡', 'low': '🟠', 'very_low': '🔴' }[level] || '⚪';
}

export function getConfidenceLabel(level) {
    return { 'high': 'Высокая', 'medium': 'Средняя', 'low': 'Низкая', 'very_low': 'Очень низкая' }[level] || 'Неизвестно';
}

export function calculateConfidenceLevels(weatherData, accuracy, metar) {
    return {
        temp: assessConfidence({ stdDev: accuracy?.tempStdDev, hasMETAR: !!metar?.temp, parameter: 'temp', value: weatherData.temp }),
        precipitation: assessConfidence({ stdDev: accuracy?.precipStdDev, hasMETAR: false, parameter: 'precipitation', value: weatherData.precipitation }),
        windSpeed: assessConfidence({ stdDev: accuracy?.windStdDev, hasMETAR: !!metar?.windSpeed, parameter: 'windSpeed', value: weatherData.windSpeed }),
        pressure: assessConfidence({ stdDev: 0.5, hasMETAR: !!metar?.pressure, parameter: 'pressure', value: weatherData.pressure }),
        visibility: assessConfidence({ stdDev: 2, hasMETAR: !!metar?.visibility, parameter: 'visibility', value: weatherData.visibility })
    };
}

function getTerrainWindFactor(locationData) {
    const location = ((locationData.city || '') + ' ' + (locationData.district || '')).toLowerCase();
    if (location.includes('лес')) return 0.6;
    if (location.includes('горы') || location.includes('mountain')) return 1.3;
    if (location.includes('поле') || location.includes('степь')) return 1.1;
    return 1.0;
}

function bayesianPrecipitationCorrection(precip, probability, cloudCover) {
    if (precip === 0 && probability > 70 && cloudCover > 80) {
        const corrected = 0.5;
        console.log(`  🌧️ Байесовская коррекция осадков: 0 → ${corrected} мм/ч`);
        return corrected;
    }
    if (precip > 0 && probability < 30) {
        const corrected = precip * 0.5;
        console.log(`  🌧️ Байесовская коррекция осадков: ${precip} → ${corrected} мм/ч (низкая вероятность)`);
        return corrected;
    }
    return precip;
}

function kalmanFilter(measurement, history) {
    if (history.length === 0) return measurement;
    const lastEstimate = history[history.length - 1].temp;
    const processNoise = 0.5;
    const measurementNoise = 1.5;
    const kalmanGain = processNoise / (processNoise + measurementNoise);
    const estimate = lastEstimate + kalmanGain * (measurement - lastEstimate);
    return Math.round(estimate * 10) / 10;
}

export function saveWeatherHistory(weatherData) {
    if (!window.weatherHistory) window.weatherHistory = [];
    window.weatherHistory.push({ temp: weatherData.temp, time: Date.now() });
    if (window.weatherHistory.length > 10) window.weatherHistory.shift();
}

export function applyMLCorrections(weatherData, locationData, timeData) {
    console.log('🤖 Применение ML-коррекций...');
    const corrected = { ...weatherData };

    if (weatherData.elevation) {
        const altitudeCorrection = -0.0065 * weatherData.elevation;
        corrected.temp += altitudeCorrection;
        corrected.tempCorrectionAltitude = Math.round(altitudeCorrection * 10) / 10;
        console.log(`  📐 Высотная поправка: ${corrected.tempCorrectionAltitude}°C`);
    }

    if (locationData && locationData.city && locationData.city !== 'Нет данных') {
        const isNight = timeData?.dayPhase?.includes('Ночь');
        if (isNight) {
            const urbanCorrection = 1.5;
            corrected.temp += urbanCorrection;
            corrected.tempCorrectionUrban = urbanCorrection;
            console.log(`  🏙️ Городская поправка (ночь): +${urbanCorrection}°C`);
        }
    }

    if (weatherData.cloudCover > 80 && weatherData.precipitation === 0) {
        corrected.precipitationWarning = 'Возможны слабые осадки (не обнаружены моделью)';
        console.log(`  ⚠️ Предупреждение: облачность ${weatherData.cloudCover}%, но осадков 0`);
    }

    const terrainFactor = getTerrainWindFactor(locationData || {});
    corrected.windSpeed = Math.round(corrected.windSpeed * terrainFactor * 10) / 10;
    corrected.windCorrectionTerrain = Math.round((terrainFactor - 1) * 100);
    if (terrainFactor !== 1) {
        console.log(`  🌬️ Поправка ветра (местность): ${corrected.windCorrectionTerrain > 0 ? '+' : ''}${corrected.windCorrectionTerrain}%`);
    }

    corrected.precipitation = bayesianPrecipitationCorrection(
        weatherData.precipitation, weatherData.precipProbability, weatherData.cloudCover
    );

    if (window.weatherHistory && window.weatherHistory.length > 0) {
        corrected.temp = kalmanFilter(corrected.temp, window.weatherHistory);
        console.log(`  📊 Калман-фильтр применён`);
    }

    return corrected;
}
