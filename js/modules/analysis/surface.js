// js/modules/analysis/surface.js - Advanced surface condition analysis

/**
 * Analyze surface conditions for road, sidewalk, and soil
 * @param {object} weatherData - Current weather data from Open-Meteo (flat structure)
 * @param {object} roadData - Road data from Overpass
 * @param {object} historicalData - Historical precipitation data
 * @returns {object} Surface analysis for all three surfaces
 */
export function analyzeSurfaceWithProbability(weatherData, roadData, historicalData) {
    const envFactors = {
        temp: weatherData.temp,
        dewPoint: weatherData.dewPoint,
        humidity: weatherData.humidity,
        precipitation: weatherData.precipitation,
        rain: weatherData.rain || 0,
        snowfall: weatherData.snowfall || 0,
        windSpeed: weatherData.windSpeed,
        windGusts: weatherData.windGusts,
        isDay: weatherData.isDay,
        cloudCover: weatherData.cloudCover
    };

    const histPrecip = historicalData?.last24h || 0;
    const histWetness = historicalData?.soilSaturation || 'normal';

    const roadAnalysis = analyzeRoadCondition(envFactors, roadData, histPrecip);
    const sidewalkAnalysis = analyzeSidewalkCondition(envFactors, roadData, histPrecip);
    const soilAnalysis = analyzeSoilCondition(envFactors, histWetness, histPrecip);

    return {
        road: roadAnalysis,
        sidewalk: sidewalkAnalysis,
        soil: soilAnalysis
    };
}

function analyzeRoadCondition(env, roadData, histPrecip) {
    const factors = [];
    let condition = 'dry';
    let probability = 0;
    let confidence = 'high';
    let dryingTime = 'Н/Д';

    const surface = roadData?.roadSurfaceRaw || 'asphalt';
    const drainage = getDrainageQuality(surface);

    if (env.temp < -2) {
        if (env.precipitation > 0 || histPrecip > 1) {
            condition = 'black_ice';
            probability = 85;
            factors.push('Температура ниже нуля + осадки = высокий риск гололёда');
        } else if (env.humidity > 85 && env.temp - env.dewPoint < 2) {
            condition = 'black_ice';
            probability = 70;
            factors.push('Высокая влажность при отрицательной температуре');
        } else if (env.snowfall > 0) {
            condition = 'snowy';
            probability = 90;
            factors.push('Активный снегопад');
        } else {
            condition = 'dry';
            probability = 60;
            factors.push('Сухая холодная поверхность');
        }
    } else if (env.temp >= -2 && env.temp < 2) {
        if (env.precipitation > 0.5 || env.rain > 0.5) {
            condition = 'slushy';
            probability = 80;
            factors.push('Слякоть при температуре около 0°C');
        } else if (env.snowfall > 0) {
            condition = 'slushy';
            probability = 75;
            factors.push('Мокрый снег');
        } else {
            condition = 'wet';
            probability = 60;
            factors.push('Влажная поверхность при околонулевой температуре');
        }
    } else {
        if (env.rain > 2) {
            condition = 'very_wet';
            probability = 95;
            factors.push(`Сильный дождь: ${env.rain} мм/ч`);
        } else if (env.rain > 0.5) {
            condition = 'wet';
            probability = 90;
            factors.push(`Дождь: ${env.rain} мм/ч`);
        } else if (env.rain > 0.1 || env.precipitation > 0.1) {
            condition = 'damp';
            probability = 70;
            factors.push('Небольшой дождь');
        } else if (histPrecip > 5 && env.temp < 15) {
            condition = 'damp';
            probability = 60;
            factors.push(`Недавние осадки (${histPrecip.toFixed(1)} мм за 24ч)`);
            dryingTime = estimateDryingTime(histPrecip, env.temp, env.humidity, drainage);
        } else if (env.humidity > 90 && env.temp - env.dewPoint < 2) {
            condition = 'damp';
            probability = 50;
            factors.push('Высокая влажность, близкая к точке росы');
        } else {
            condition = env.isDay ? 'dry' : 'mostly_dry';
            probability = env.isDay ? 85 : 70;
            factors.push('Сухие условия');
        }
    }

    if (env.windGusts > 15) {
        probability = Math.max(probability - 10, 0);
        factors.push(`Сильные порывы ветра (${env.windGusts} м/с) ускоряют высыхание`);
    } else if (env.windSpeed > 8) {
        probability = Math.max(probability - 5, 0);
        factors.push('Умеренный ветер способствует высыханию');
    }

    if (drainage === 'good' && condition !== 'dry' && condition !== 'black_ice' && condition !== 'snowy') {
        probability = Math.max(probability - 10, 0);
        factors.push('Хороший дренаж асфальта');
    } else if (drainage === 'poor') {
        probability = Math.min(probability + 10, 100);
        factors.push('Плохой дренаж - медленное высыхание');
    }

    if (!env.isDay && condition !== 'dry') {
        probability = Math.min(probability + 5, 100);
        factors.push('Ночь - медленное высыхание');
    }

    if (env.precipitation > 0 || env.rain > 0 || env.snowfall > 0) {
        confidence = 'high';
    } else if (histPrecip > 0) {
        confidence = 'medium';
    } else {
        confidence = 'low';
    }

    return {
        condition,
        probability: Math.round(probability),
        confidence,
        factors,
        dryingTime
    };
}

function analyzeSidewalkCondition(env, roadData, histPrecip) {
    const factors = [];
    let condition = 'dry';
    let probability = 0;
    let dryingTime = 'Н/Д';

    const drainage = 'poor';

    if (env.temp < -2) {
        if (env.precipitation > 0 || histPrecip > 0.5) {
            condition = 'icy';
            probability = 90;
            factors.push('Обледенелая поверхность');
        } else if (env.snowfall > 0) {
            condition = 'snowy';
            probability = 95;
            factors.push('Снег на тротуаре');
        } else {
            condition = 'dry';
            probability = 70;
        }
    } else if (env.temp >= -2 && env.temp < 2) {
        if (env.precipitation > 0.3) {
            condition = 'slushy';
            probability = 85;
            factors.push('Слякоть на тротуаре');
        } else {
            condition = 'wet';
            probability = 70;
        }
    } else {
        if (env.rain > 1) {
            condition = 'very_wet';
            probability = 95;
            factors.push('Сильный дождь');
        } else if (env.rain > 0.2 || env.precipitation > 0.2) {
            condition = 'wet';
            probability = 90;
            factors.push('Дождь');
        } else if (histPrecip > 3) {
            condition = 'damp';
            probability = 75;
            factors.push(`Недавний дождь (${histPrecip.toFixed(1)} мм)`);
            dryingTime = estimateDryingTime(histPrecip, env.temp, env.humidity, drainage);
        } else if (env.humidity > 85) {
            condition = 'damp';
            probability = 60;
            factors.push('Высокая влажность');
        } else {
            condition = 'dry';
            probability = 80;
        }
    }

    if (dryingTime !== 'Н/Д') {
        factors.push('Тротуары сохнут медленнее дорог');
    }

    return {
        condition,
        probability: Math.round(probability),
        confidence: 'medium',
        factors,
        dryingTime
    };
}

function analyzeSoilCondition(env, histWetness, histPrecip) {
    const factors = [];
    let condition = 'normal';
    let probability = 0;
    let soilType = 'mixed';
    let dryingTime = 'Н/Д';

    if (histWetness === 'high') {
        soilType = 'clay';
    } else if (histWetness === 'low') {
        soilType = 'sandy';
    }

    if (env.temp < 0) {
        condition = 'frozen';
        probability = 90;
        factors.push('Промерзшая почва');
    } else if (env.rain > 2 || histPrecip > 10) {
        condition = 'muddy';
        probability = 85;
        factors.push('Сильное увлажнение');
    } else if (env.rain > 0.5 || histPrecip > 5) {
        condition = 'wet';
        probability = 75;
        factors.push('Влажная почва');
        dryingTime = estimateSoilDryingTime(histPrecip, env.temp, soilType);
    } else if (histPrecip > 2) {
        condition = 'damp';
        probability = 60;
        factors.push('Умеренно влажная');
    } else {
        condition = 'dry';
        probability = 70;
        factors.push('Сухая почва');
    }

    return {
        condition,
        probability: Math.round(probability),
        confidence: 'medium',
        factors,
        soilType,
        dryingTime
    };
}

function getDrainageQuality(surface) {
    const drainageMap = {
        'asphalt': 'good',
        'concrete': 'medium',
        'paving_stones': 'medium',
        'cobblestone': 'poor',
        'compacted': 'poor',
        'gravel': 'good',
        'unpaved': 'poor',
        'dirt': 'poor'
    };
    return drainageMap[surface] || 'medium';
}

function estimateDryingTime(precip, temp, humidity, drainage) {
    let baseTime = precip * 15;

    if (temp > 25) baseTime *= 0.6;
    else if (temp > 20) baseTime *= 0.8;
    else if (temp > 15) baseTime *= 1.0;
    else if (temp > 10) baseTime *= 1.3;
    else baseTime *= 1.6;

    if (humidity > 80) baseTime *= 1.4;
    else if (humidity > 60) baseTime *= 1.2;

    if (drainage === 'good') baseTime *= 0.7;
    else if (drainage === 'poor') baseTime *= 1.5;

    if (baseTime < 60) return `~${Math.round(baseTime)} мин`;
    if (baseTime < 180) return `~${Math.round(baseTime / 60)} ч`;
    return `>${Math.round(baseTime / 60)} ч`;
}

function estimateSoilDryingTime(precip, temp, soilType) {
    let hours = precip * 2;

    if (temp > 20) hours *= 0.7;
    else if (temp > 15) hours *= 0.9;
    else if (temp < 10) hours *= 1.5;

    if (soilType === 'clay') hours *= 1.8;
    else if (soilType === 'sandy') hours *= 0.5;

    if (hours < 24) return `~${Math.round(hours)} ч`;
    return `~${Math.round(hours / 24)} дн`;
}

/**
 * Build detailed surface condition for UI display
 * @param {object} weatherData - Current weather data
 * @param {object} roadData - Road data from Overpass
 * @param {object} surfaceAnalysis - Result of analyzeSurfaceWithProbability
 * @returns {object} Surface condition for UI
 */
export function buildSurfaceCondition(weatherData, roadData, surfaceAnalysis) {
    const roadCond = surfaceAnalysis?.road?.condition || 'dry';

    const conditionMap = {
        'dry': { icon: '☀️', name: 'Сухая дорога', severity: 'low' },
        'mostly_dry': { icon: '🌤️', name: 'Преимущественно сухо', severity: 'low' },
        'damp': { icon: '💧', name: 'Влажная дорога', severity: 'moderate' },
        'wet': { icon: '💦', name: 'Мокрая дорога', severity: 'moderate' },
        'very_wet': { icon: '🌊', name: 'Очень мокрая дорога', severity: 'high' },
        'puddles': { icon: '🌊', name: 'Лужи на дороге', severity: 'high' },
        'icy': { icon: '❄️', name: 'Гололёд', severity: 'critical' },
        'black_ice': { icon: '🧊', name: 'Чёрный лёд', severity: 'critical' },
        'snowy': { icon: '🌨️', name: 'Снег', severity: 'high' },
        'slushy': { icon: '🌨️', name: 'Слякоть', severity: 'high' },
        'muddy': { icon: '🟤', name: 'Грязь', severity: 'moderate' }
    };

    const info = conditionMap[roadCond] || conditionMap['dry'];
    const brakeIncrease = calculateBrakeIncrease(roadCond);
    const speedReduction = calculateSpeedReduction(roadCond);
    const description = generateDescription(roadCond, weatherData, surfaceAnalysis);
    const recommendations = generateRecommendations(roadCond, weatherData, surfaceAnalysis);
    const forPedestrians = generatePedestrianAdvice(surfaceAnalysis?.sidewalk);

    return {
        icon: info.icon,
        name: info.name,
        description,
        severity: info.severity,
        condition: roadCond,
        brakeIncrease,
        speedReduction,
        braking: {
            normalDistance: 20,
            wetDistance: Math.round(20 * (1 + brakeIncrease / 100))
        },
        recommendations,
        forPedestrians
    };
}

function calculateBrakeIncrease(condition) {
    const map = {
        'dry': 0, 'mostly_dry': 5, 'damp': 15, 'wet': 30,
        'very_wet': 50, 'puddles': 70, 'icy': 200, 'black_ice': 300,
        'snowy': 150, 'slushy': 100, 'muddy': 80
    };
    return map[condition] || 0;
}

function calculateSpeedReduction(condition) {
    const map = {
        'dry': 0, 'mostly_dry': 0, 'damp': 10, 'wet': 20,
        'very_wet': 30, 'puddles': 40, 'icy': 60, 'black_ice': 70,
        'snowy': 50, 'slushy': 40, 'muddy': 30
    };
    return map[condition] || 0;
}

function generateDescription(condition, weatherData, analysis) {
    const descriptions = {
        'dry': 'Дорожное покрытие сухое, хорошие условия для движения.',
        'mostly_dry': 'Покрытие преимущественно сухое, возможны влажные участки.',
        'damp': 'Дорога влажная после дождя, требуется осторожность.',
        'wet': 'Мокрое покрытие значительно увеличивает тормозной путь.',
        'very_wet': 'Очень мокрая дорога, высокий риск аквапланирования.',
        'puddles': 'На дороге лужи, возможен эффект аквапланирования.',
        'icy': 'Гололёд - крайне опасные условия!',
        'black_ice': 'Чёрный лёд (невидимый) - критически опасно!',
        'snowy': 'Снежное покрытие затрудняет движение.',
        'slushy': 'Слякоть снижает сцепление с дорогой.',
        'muddy': 'Грязное покрытие ухудшает управляемость.'
    };

    let desc = descriptions[condition] || descriptions['dry'];

    if (weatherData?.rain > 1) desc += ` Идёт сильный дождь (${weatherData.rain} мм/ч).`;
    if (weatherData?.windGusts > 15) desc += ` Сильные порывы ветра (${weatherData.windGusts} м/с).`;

    return desc;
}

function generateRecommendations(condition, weatherData, analysis) {
    const recs = [];

    if (['icy', 'black_ice'].includes(condition)) {
        recs.push('⚠️ Избегайте резких манёвров');
        recs.push('⚠️ Увеличьте дистанцию до 10-15 автомобилей');
        recs.push('⚠️ Тормозите плавно, без резких нажатий');
        recs.push('⚠️ Рассмотрите использование такси/общественного транспорта');
    } else if (['snowy', 'slushy'].includes(condition)) {
        recs.push('❄️ Снизьте скорость на 40-50%');
        recs.push('❄️ Увеличьте дистанцию до 5-7 автомобилей');
        recs.push('❄️ Используйте зимние шины');
    } else if (['wet', 'very_wet', 'puddles'].includes(condition)) {
        recs.push('💦 Снизьте скорость на 20-30%');
        recs.push('💦 Увеличьте дистанцию до 3-4 автомобилей');
        recs.push('💦 Избегайте луж на высокой скорости');
        recs.push('💦 Включите фары');
    } else if (condition === 'damp') {
        recs.push('💧 Будьте внимательны на поворотах');
        recs.push('💧 Соблюдайте дистанцию');
    }

    if (weatherData?.windGusts > 15) {
        recs.push(`🌬️ Сильный ветер (${weatherData.windGusts} м/с) - крепче держите руль`);
    }

    return recs;
}

function generatePedestrianAdvice(sidewalkAnalysis) {
    const condition = sidewalkAnalysis?.condition || 'dry';

    const advice = {
        'dry': 'Тротуары сухие, комфортные условия для ходьбы.',
        'damp': 'Тротуары влажные, будьте осторожны.',
        'wet': 'Мокрые тротуары - риск поскользнуться.',
        'very_wet': 'Очень мокрые тротуары и лужи.',
        'icy': '⚠️ ГОЛОЛЁД НА ТРОТУАРАХ! Высокий риск падения.',
        'snowy': 'Снег на тротуарах, передвигайтесь осторожно.',
        'slushy': 'Слякоть на тротуарах, возможны грязные брызги.'
    };

    return advice[condition] || advice['dry'];
}
