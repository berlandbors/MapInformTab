// js/modules/analysis/traffic.js - Traffic estimation

function getConfidenceFromScore(score) {
    if (score >= 75) return 'Высокая';
    if (score >= 50) return 'Средняя';
    return 'Низкая';
}

export function estimateTrafficWithInduction(roadData, weatherData, locationData, dateObj, realTrafficData = null) {
    const date = dateObj || new Date();
    const hour = date.getHours();
    const dow = date.getDay();
    const isWeekday = dow >= 1 && dow <= 5;
    const isPeakHour = isWeekday && ((hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20));

    const maxSpeedVal = roadData.maxSpeed || 60;
    const lanesVal = parseInt(roadData.lanes) || 2;

    let roadTypeKey = 'primary';
    const rt = roadData.roadType || '';
    if (rt.includes('автомагистраль') || rt.includes('motorway')) roadTypeKey = 'motorway';
    else if (rt.includes('trunk') || rt.includes('трасса')) roadTypeKey = 'trunk';
    else if (rt.includes('primary') || rt.includes('главная') || rt.includes('первич')) roadTypeKey = 'primary';
    else if (rt.includes('secondary') || rt.includes('вторич')) roadTypeKey = 'secondary';
    else if (rt.includes('residential') || rt.includes('жилая')) roadTypeKey = 'residential';

    const isCity = !!(locationData && locationData.city && locationData.city !== 'Н/Д');
    const isCityCenter = isCity && !!(locationData.district && (
        locationData.district.toLowerCase().includes('центр') ||
        locationData.district.toLowerCase().includes('center')
    ));

    const isRaining = (weatherData.precipitation || 0) > 0.5;
    const isSnowing = isRaining && (weatherData.temp || 15) < 1;
    const isFoggy = (weatherData.visibility || 10) < 1;
    const isIcy = (weatherData.temp || 15) < 0 && isRaining;

    const factors = {
        roadType: roadTypeKey, maxSpeed: maxSpeedVal, lanes: lanesVal,
        hour, dayOfWeek: dow, isWeekday, isPeakHour, isCity, isCityCenter,
        nearbyPOIs: { schools: false, offices: isCityCenter, malls: false, stations: false },
        isRaining, isSnowing, isFoggy, isIcy,
        visibility: weatherData.visibility || 10
    };

    const trafficRules = [
        { condition: (f) => f.roadType === 'motorway' && f.isPeakHour && f.isWeekday, impact: +50, reason: '🚗 Автомагистраль в час пик' },
        { condition: (f) => f.isCityCenter && f.isWeekday && f.hour >= 8 && f.hour <= 20, impact: +30, reason: '🏙️ Центр города в рабочее время' },
        { condition: (f) => f.nearbyPOIs.schools && f.hour >= 7 && f.hour <= 9, impact: +20, reason: '🎓 Школы рядом (утренняя доставка)' },
        { condition: (f) => f.nearbyPOIs.offices && f.isPeakHour, impact: +25, reason: '💼 Офисный район' },
        { condition: (f) => f.nearbyPOIs.malls && !f.isWeekday && f.hour >= 11 && f.hour <= 20, impact: +15, reason: '🛍️ Торговый центр (выходные)' },
        { condition: (f) => f.isRaining, impact: +20, speedReduction: 20, reason: '🌧️ Дождь (скорость -20%)' },
        { condition: (f) => f.isSnowing, impact: +35, speedReduction: 35, reason: '❄️ Снегопад (скорость -35%)' },
        { condition: (f) => f.isFoggy, impact: +25, speedReduction: 30, reason: '🌫️ Туман (видимость снижена)' },
        { condition: (f) => f.isIcy, impact: +40, speedReduction: 50, reason: '🧊 Гололёд (скорость -50%)' },
        { condition: (f) => f.isWeekday && (f.hour >= 22 || f.hour <= 6), impact: -30, reason: '🌙 Ночное время (низкая активность)' },
        { condition: (f) => f.lanes >= 4, impact: -15, reason: '🛣️ Широкая дорога (4+ полос)' },
        { condition: (f) => f.lanes <= 2 && f.roadType !== 'residential', impact: +20, reason: '🚧 Узкая дорога (2 полосы)' }
    ];

    let trafficScore = 20;
    let totalSpeedReduction = 0;
    const reasoning = [];

    trafficRules.forEach(rule => {
        if (rule.condition(factors)) {
            trafficScore += rule.impact;
            if (rule.speedReduction) totalSpeedReduction += rule.speedReduction;
            reasoning.push(`✓ ${rule.reason}`);
        }
    });

    trafficScore = Math.max(0, Math.min(100, trafficScore));
    if (isPeakHour) reasoning.push(`✓ Час пик (${hour}:00)`);

    let trafficLevel, trafficLevelEn, color, congestionRisk;
    if (trafficScore >= 75) {
        trafficLevel = 'Высокий'; trafficLevelEn = 'heavy'; color = '#ff4400'; congestionRisk = 'Критический';
    } else if (trafficScore >= 55) {
        trafficLevel = 'Умеренный'; trafficLevelEn = 'moderate'; color = '#ffaa00'; congestionRisk = 'Высокий';
    } else if (trafficScore >= 35) {
        trafficLevel = 'Средний'; trafficLevelEn = 'medium'; color = '#ffff00'; congestionRisk = 'Средний';
    } else {
        trafficLevel = 'Низкий'; trafficLevelEn = 'light'; color = '#00ff00'; congestionRisk = 'Низкий';
    }

    const speedReductionPct = Math.min(60, totalSpeedReduction);

    // If real-time traffic data is available, use its current speed; otherwise estimate
    let actualSpeed;
    let realFlow = null;
    if (realTrafficData?.flow) {
        const flow = realTrafficData.flow;
        actualSpeed = flow.roadClosure ? 0 : (flow.currentSpeed || Math.round(maxSpeedVal * (1 - speedReductionPct / 100)));
        const realDelay = flow.freeFlowSpeed > 0
            ? Math.round((1 - flow.currentSpeed / flow.freeFlowSpeed) * 100)
            : 0;
        realFlow = {
            currentSpeed:  flow.currentSpeed,
            freeFlowSpeed: flow.freeFlowSpeed,
            delayPercent:  Math.max(0, realDelay),
            confidence:    flow.confidence,
            roadClosure:   flow.roadClosure
        };
    } else {
        actualSpeed = Math.round(maxSpeedVal * (1 - speedReductionPct / 100));
    }

    const probability = Math.min(95, 40 + reasoning.length * 8);

    const peakHours = isWeekday ? ['08:00-10:00', '17:00-20:00'] : ['12:00-20:00'];

    let recommendation = `Уровень трафика: ${trafficLevel}.`;
    if (speedReductionPct > 0) recommendation += ` Рекомендуется двигаться со скоростью не выше ${actualSpeed} км/ч.`;
    if (isRaining) recommendation += ' Соблюдайте дистанцию на мокрой дороге.';
    if (isIcy) recommendation += ' Осторожно: возможен гололёд!';
    if (realFlow?.roadClosure) recommendation = '⛔ Дорога перекрыта! ' + recommendation;

    return {
        trafficLevel, trafficLevelEn, probability,
        confidence: getConfidenceFromScore(probability),
        trafficScore, color, maxSpeed: maxSpeedVal, actualSpeed,
        speedReduction: speedReductionPct, congestionRisk, peakHours,
        reasoning, recommendation,
        // Real-time traffic data (null if API key not set / unavailable)
        realFlow,
        incidents: realTrafficData?.incidents || null,
        isPeakHour
    };
}
