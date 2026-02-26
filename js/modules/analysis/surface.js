// js/modules/analysis/surface.js - Surface analysis

export function calculateDryingTime(factors, surfaceType) {
    // baseTime values are in minutes: asphalt dries fastest, soil slowest
    let baseTime = { asphalt: 120, concrete: 150, sidewalk: 180, soil: 240 }[surfaceType] || 120;
    const tempCoef = factors.temperature > 25 ? 0.6 : factors.temperature > 15 ? 0.8 : factors.temperature > 5 ? 1.0 : factors.temperature > 0 ? 1.3 : 2.0;
    const windCoef = factors.windSpeed > 15 ? 0.6 : factors.windSpeed > 10 ? 0.7 : factors.windSpeed > 5 ? 0.85 : 1.0;
    const humidityCoef = factors.humidity > 85 ? 1.5 : factors.humidity > 70 ? 1.3 : factors.humidity > 50 ? 1.1 : 1.0;
    const sunCoef = factors.sunExposure > 80 ? 0.5 : factors.sunExposure > 60 ? 0.7 : factors.sunExposure > 40 ? 0.85 : factors.sunExposure > 20 ? 1.0 : 1.3;
    const drainageCoef = { excellent: 0.6, good: 0.8, moderate: 1.0, poor: 1.5, very_poor: 2.0 }[factors.drainage] || 1.0;
    const slopeCoef = factors.slope > 10 ? 0.7 : factors.slope > 5 ? 0.85 : factors.slope > 2 ? 1.0 : 1.3;
    const totalTime = baseTime * tempCoef * windCoef * humidityCoef * sunCoef * drainageCoef * slopeCoef;
    const hours = Math.floor(totalTime / 60);
    const minutes = Math.round(totalTime % 60);
    if (totalTime < 60) return `${minutes}мин`;
    if (hours >= 24) return `${Math.round(hours / 24)}д ${hours % 24}ч`;
    return `${hours}ч ${minutes}мин`;
}

export function updateBayesian(priorP, likelihood, evidence) {
    return priorP * (1 - evidence) + likelihood * evidence;
}

export function getConfidenceFromScore(score) {
    if (score >= 75) return 'Высокая';
    if (score >= 50) return 'Средняя';
    return 'Низкая';
}

export function analyzeSurfaceWithProbability(weatherData, roadData, locationData) {
    const hour = new Date().getHours();
    const timeOfDay = hour >= 6 && hour < 12 ? 'morning'
                    : hour >= 12 && hour < 18 ? 'day'
                    : hour >= 18 && hour < 22 ? 'evening'
                    : 'night';

    const sunExposure = weatherData.cloudCover != null ? Math.max(0, 100 - weatherData.cloudCover) : 50;

    const baseSurfaceType = roadData.roadSurfaceRaw || 'asphalt';
    const surfaceTypeNorm = ['soil', 'grass', 'dirt', 'ground'].includes(baseSurfaceType) ? 'soil'
                          : ['paving_stones', 'cobblestone', 'sett'].includes(baseSurfaceType) ? 'sidewalk'
                          : baseSurfaceType === 'concrete' ? 'concrete'
                          : 'asphalt';

    const precip = weatherData.precipitation || 0;
    const precip3h = precip * 3;
    const precip6h = precip * 6;
    const precip24h = precip * 24;

    const factors = {
        precipitation1h: precip, precipitation3h: precip3h,
        precipitation6h: precip6h, precipitation24h: precip24h,
        temperature: weatherData.temp || 15,
        humidity: weatherData.humidity || 60,
        windSpeed: weatherData.windSpeed || 5,
        cloudCover: weatherData.cloudCover || 50,
        timeOfDay, sunExposure,
        surfaceType: surfaceTypeNorm,
        drainage: 'good', slope: 5,
        isShaded: sunExposure < 20, hasRoof: false
    };

    const rules = [
        { name: 'recent_rain_warm', condition: (f) => f.precipitation1h > 1 && f.temperature > 5, result: { state: 'wet', weight: 0.8, reason: 'Недавний дождь' } },
        { name: 'rain_high_humidity', condition: (f) => f.precipitation3h > 5 && f.humidity > 80, result: { state: 'very_wet', weight: 0.9, reason: 'Сильный дождь + высокая влажность' } },
        { name: 'freezing_wet', condition: (f) => f.temperature < 0 && f.precipitation6h > 0, result: { state: 'ice', weight: 0.85, reason: 'Замерзание воды' } },
        { name: 'near_freezing', condition: (f) => f.temperature >= -2 && f.temperature <= 2 && f.precipitation1h > 0, result: { state: 'black_ice_risk', weight: 0.7, reason: 'Риск гололёда' } },
        { name: 'wind_sun_drying', condition: (f) => f.windSpeed > 10 && f.sunExposure > 70 && f.cloudCover < 30, result: { state: 'drying', weight: -0.5, reason: 'Ветер и солнце ускоряют высыхание' } },
        { name: 'shaded_poor_drainage', condition: (f) => f.isShaded && f.drainage === 'poor', result: { state: 'wet', weight: 0.6, reason: 'Плохой дренаж в тени' } },
        { name: 'flat_rain_puddles', condition: (f) => f.slope < 2 && f.precipitation3h > 3, result: { state: 'puddles', weight: 0.75, reason: 'Ровная поверхность собирает воду' } },
        { name: 'soil_heavy_rain', condition: (f) => f.surfaceType === 'soil' && f.precipitation24h > 10, result: { state: 'muddy', weight: 0.9, reason: 'Размытая почва' } },
        { name: 'night_dew', condition: (f) => f.timeOfDay === 'night' && f.temperature < 10 && f.humidity > 80, result: { state: 'dew', weight: 0.6, reason: 'Ночная роса' } },
        { name: 'covered', condition: (f) => f.hasRoof, result: { state: 'dry', weight: 0.95, reason: 'Защищено от осадков' } }
    ];

    function analyzeOneSurface(surfType, factorsOverride) {
        const f = { ...factors, ...factorsOverride };
        const triggered = rules.filter(r => r.condition(f));

        let wetScore = 0;
        const reasonList = [];

        triggered.forEach(r => {
            const w = r.result.weight;
            wetScore += w;
            if (w > 0) reasonList.push(`✓ ${r.result.reason}`);
            else reasonList.push(`✗ ${r.result.reason.replace('ускоряют', 'ускоряет')}`);
        });

        if (wetScore <= 0 && precip < 0.1) reasonList.push('✓ Сухая погода');

        const stateScore = Math.max(0, Math.min(1, wetScore));
        const prob = Math.round(stateScore * 100);

        let condition, conditionEn;
        if (stateScore >= 0.85) { condition = 'Очень мокрое'; conditionEn = 'very_wet'; }
        else if (stateScore >= 0.65) { condition = 'Мокрое'; conditionEn = 'wet'; }
        else if (stateScore >= 0.45) { condition = 'Влажное'; conditionEn = 'damp'; }
        else if (stateScore >= 0.25) { condition = 'Слегка влажное'; conditionEn = 'slightly_damp'; }
        else { condition = 'Сухое'; conditionEn = 'dry'; }

        if (f.temperature < 0 && f.precipitation6h > 0) { condition = 'Обледенелое'; conditionEn = 'ice'; }
        if (f.temperature >= -2 && f.temperature <= 2 && f.precipitation1h > 0) { condition = 'Риск гололёда'; conditionEn = 'black_ice_risk'; }

        return {
            condition, conditionEn,
            probability: Math.max(0, Math.min(100, prob)),
            confidence: getConfidenceFromScore(triggered.length * 20),
            dryingTime: calculateDryingTime(f, surfType),
            factors: reasonList
        };
    }

    const roadFactors = { surfaceType: surfaceTypeNorm, drainage: 'good', slope: 5 };
    const sidewalkFactors = { surfaceType: 'sidewalk', drainage: 'moderate', slope: 1, isShaded: true };
    const soilFactors = { surfaceType: 'soil', drainage: factors.precipitation24h > 15 ? 'poor' : 'moderate', slope: 3 };

    const roadResult = analyzeOneSurface('asphalt', roadFactors);
    const sidewalkResult = analyzeOneSurface('sidewalk', sidewalkFactors);
    const soilResult = analyzeOneSurface('soil', soilFactors);

    const soilType = factors.precipitation24h > 20 ? 'Насыщенное водой'
                   : factors.precipitation24h > 10 ? 'Влажная'
                   : factors.temperature < 0 ? 'Мёрзлая'
                   : 'Нормальная';

    const drainageRate = factors.precipitation24h > 20 ? 'Медленный'
                       : factors.precipitation24h > 5 ? 'Умеренный'
                       : 'Хороший';

    return {
        road: roadResult,
        sidewalk: sidewalkResult,
        soil: { ...soilResult, soilType, drainageRate }
    };
}
