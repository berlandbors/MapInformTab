// js/modules/analysis/surface.js - Surface analysis

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Formats minutes into human-readable drying time string (Russian). */
function _formatDryingTime(minutes) {
    if (minutes < 60) return `${Math.round(minutes)} мин`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours >= 24) return `${Math.floor(hours / 24)}д ${hours % 24}ч`;
    return mins > 0 ? `${hours}ч ${mins}мин` : `${hours}ч`;
}

/** Safely converts a value to number, returning fallback if NaN/non-numeric. */
function _num(v, fallback = 0) {
    const n = parseFloat(v);
    return isFinite(n) ? n : fallback;
}

// ─── Advanced physics-based drying model ────────────────────────────────────

/**
 * Calculates drying time using a physics-based evaporation model (simplified Penman).
 * @param {object} weatherData - Weather data with temperature, humidity, windSpeed, cloudCover, precipitation6h
 * @param {string} surfaceType - 'asphalt' | 'concrete' | 'sidewalk' | 'soil'
 * @param {object} [roadData={}] - Road data with optional drainage property
 * @returns {object} Drying analysis result
 */
export function calculateAdvancedDryingTime(weatherData, surfaceType, roadData = {}) {
    const temperature = _num(weatherData.temperature ?? weatherData.temp, 15);
    const humidity = _num(weatherData.humidity, 60);
    const windSpeed = _num(weatherData.windSpeed, 3);
    const cloudCover = _num(weatherData.cloudCover, 50);
    const precipitation6h = _num(weatherData.precipitation6h ?? (weatherData.precipitation || 0) * 6, 0);

    // 1. Vapour pressure deficit (VPD, kPa) — Magnus formula
    // satVP = 0.6108 * exp(17.27*T / (T+237.3))  [Buck, 1981; result in kPa]
    const satVP = 0.6108 * Math.exp((17.27 * temperature) / (temperature + 237.3));
    const actualVP = satVP * (humidity / 100);
    const vpd = Math.max(0, satVP - actualVP);

    // 2. Solar radiation estimate based on cloud cover (W/m²)
    const maxSolarRadiation = 800;
    const solarRadiation = maxSolarRadiation * (1 - cloudCover / 100);

    // 3. Evaporation rate — simplified Penman formula (mm/h), clamped to ≥ 0
    const evaporationRate = Math.max(0,
        ((0.408 * solarRadiation * vpd) / (temperature + 237.3)) +
        ((0.1 * windSpeed * vpd) / (temperature + 273))
    );

    // 4. Drainage rate (mm/h) by road drainage quality
    const drainageRates = { excellent: 5, good: 2, moderate: 0.5, poor: 0.1 };
    const drainage = roadData.drainage || 'good';
    const drainageRate = drainageRates[drainage] || 2;

    // 5. Porosity fraction by surface type
    const porosity = { asphalt: 0.08, concrete: 0.12, sidewalk: 0.15, soil: 0.40 }[surfaceType] || 0.10;

    // 6. Residual water after 1 h of evaporation + drainage
    const hoursElapsed = 1;
    const residualWater = Math.max(0,
        precipitation6h - (evaporationRate * hoursElapsed) - (drainageRate * hoursElapsed)
    );

    // 7. Capillary water retained in pores (mm)
    const capillaryWater = porosity * 10;

    // 8. Total drying time
    const totalWater = residualWater + capillaryWater;
    const combinedRate = Math.max(evaporationRate + drainageRate, 0.1);
    const dryingHours = totalWater / combinedRate;

    return {
        residualWater: +residualWater.toFixed(1),
        evaporationRate: +evaporationRate.toFixed(2),
        drainageRate: +drainageRate.toFixed(2),
        dryingHours: +dryingHours.toFixed(1),
        dryingTime: _formatDryingTime(dryingHours * 60),
        vpd: +vpd.toFixed(2),
        solarRadiation: Math.round(solarRadiation),
        precipitation6h: +precipitation6h.toFixed(1),
        drainage
    };
}

// ─── Braking distance calculator ────────────────────────────────────────────

/**
 * Calculates reaction, braking and total stopping distances.
 * @param {number} speed - Speed in km/h
 * @param {string} roadCondition - 'dry' | 'wet' | 'very_wet' | 'ice' | 'snow' | 'black_ice_risk'
 * @returns {object} Distance breakdown and friction coefficient
 */
export function calculateBrakingDistance(speed, roadCondition) {
    const speedMs = speed / 3.6;
    const reactionTime = 1.5; // seconds (typical driver reaction)
    const g = 9.81;

    const frictionCoefficients = {
        dry: 0.80, wet: 0.52, very_wet: 0.35,
        ice: 0.15, snow: 0.25, black_ice_risk: 0.20
    };
    const mu = frictionCoefficients[roadCondition] || 0.70;

    const reactionDistance = speedMs * reactionTime;
    const brakingDistance = (speedMs * speedMs) / (2 * mu * g);
    const totalDistance = reactionDistance + brakingDistance;

    return {
        reactionDistance: Math.round(reactionDistance),
        brakingDistance: Math.round(brakingDistance),
        totalDistance: Math.round(totalDistance),
        frictionCoefficient: mu
    };
}

// ─── Aquaplaning risk ────────────────────────────────────────────────────────

/**
 * Estimates aquaplaning risk using the critical-speed formula (NASA hydroplaning research).
 * @param {number} speed - Current speed (km/h)
 * @param {number} waterDepth - Estimated water depth on road (mm)
 * @param {number} [tirePressure=2.2] - Tyre pressure (bar)
 * @returns {object} Risk assessment
 */
export function calculateAquaplaningRisk(speed, waterDepth, tirePressure = 2.2) {
    // NASA formula (Horne & Dreher, 1963): V_crit_mph = 9 * √(p_psi)
    // Unit conversion: 1 bar = 14.504 psi; 1 mph = 1.60934 km/h
    // Combined coefficient: 9 * √14.504 * 1.60934 ≈ 54.9
    const criticalSpeed = 54.9 * Math.sqrt(tirePressure);

    const risk = speed > criticalSpeed && waterDepth > 3 ? 'high'
               : speed > criticalSpeed * 0.8 && waterDepth > 2 ? 'moderate'
               : 'low';

    return {
        criticalSpeed: Math.round(criticalSpeed),
        currentSpeed: speed,
        waterDepth,
        risk
    };
}

// ─── Surface condition forecast ──────────────────────────────────────────────

/**
 * Forecasts road surface conditions for the next 6 hours using hourly data.
 * @param {Array} hourlyForecast - Hourly forecast array (from OWM OneCall .hourly)
 * @param {string} currentCondition - Current surface condition key (e.g. 'wet')
 * @returns {Array|null} Array of per-hour forecast objects or null if no data
 */
export function forecastSurfaceConditions(hourlyForecast, currentCondition) {
    if (!hourlyForecast || hourlyForecast.length === 0) return null;

    const forecast = [];
    for (let i = 0; i < Math.min(6, hourlyForecast.length); i++) {
        const hour = hourlyForecast[i];
        const time = new Date(hour.dt * 1000);
        const rain = hour.rain || 0;
        const snow = hour.snow || 0;
        const temp = hour.temp;

        let condition = 'Сухая';
        if (rain > 0.5 || snow > 0.5) condition = snow > 0.5 ? 'Снег 🌨️' : 'Дождь 🌧️';
        else if (temp < 0) condition = 'Гололёд ❄️';
        else if (i === 0 && (currentCondition === 'wet' || currentCondition === 'very_wet')) condition = 'Влажная';

        forecast.push({
            hour: time.getHours(),
            condition,
            rain: +rain.toFixed(1),
            snow: +snow.toFixed(1),
            temp: Math.round(temp)
        });
    }

    return forecast;
}

// ─── Surface condition builder ───────────────────────────────────────────────

/**
 * Returns precipitation type label and intensity classification.
 * @param {number} weatherCode - WMO weather code
 * @param {number} intensity - mm/h
 * @returns {object} {typeLabel, intensityClass}
 */
function _getPrecipInfo(weatherCode, intensity) {
    let typeLabel = 'Нет';
    if (weatherCode >= 71 && weatherCode <= 77) typeLabel = 'Снег 🌨️';
    else if (weatherCode >= 85 && weatherCode <= 86) typeLabel = 'Снег 🌨️';
    else if (weatherCode >= 51 && weatherCode <= 55) typeLabel = 'Морось 🌦️';
    else if (weatherCode >= 95) typeLabel = 'Гроза ⛈️';
    else if (weatherCode >= 80 && weatherCode <= 82) typeLabel = 'Ливень 🌧️';
    else if (weatherCode >= 61 && weatherCode <= 67) typeLabel = 'Дождь 🌧️';

    const intensityClass = intensity > 10 ? 'сильная'
                         : intensity > 2.5 ? 'умеренная'
                         : intensity > 0.1 ? 'слабая'
                         : null;

    return { typeLabel, intensityClass };
}

/**
 * Estimates surface temperature from air temperature, solar radiation and wind.
 * @param {number} airTemp - Air temperature (°C)
 * @param {number} solarRadiation - Solar radiation (W/m²)
 * @param {number} windSpeed - Wind speed (m/s)
 * @param {number} cloudCover - Cloud cover (%)
 * @returns {number} Estimated surface temperature (°C)
 */
function _estimateSurfaceTemp(airTemp, solarRadiation, windSpeed, cloudCover) {
    return +(airTemp + (0.1 * solarRadiation / 100) - (0.05 * windSpeed) - (cloudCover * 0.05)).toFixed(1);
}

/**
 * Determines surface condition name/icon/severity from conditionEn key.
 * @param {string} conditionEn
 * @returns {object}
 */
function _getSurfaceDisplay(conditionEn) {
    const map = {
        dry:            { icon: '☀️',  name: 'Сухое',          description: 'Поверхность сухая, условия нормальные.', severity: 'low',      brakeIncrease: 0,  speedReduction: 0 },
        slightly_damp:  { icon: '🌤️', name: 'Слегка влажное', description: 'Поверхность слегка влажная.', severity: 'low',             brakeIncrease: 5,  speedReduction: 5 },
        damp:           { icon: '💧',  name: 'Влажное',        description: 'Поверхность влажная — снижена видимость тормозного пути.', severity: 'moderate', brakeIncrease: 15, speedReduction: 10 },
        wet:            { icon: '💦',  name: 'Мокрое',         description: 'Покрытие мокрое — значительно увеличен тормозной путь.', severity: 'moderate', brakeIncrease: 35, speedReduction: 20 },
        very_wet:       { icon: '🌧️', name: 'Очень мокрое',   description: 'Интенсивные осадки — высокий риск аквапланирования.', severity: 'high',     brakeIncrease: 60, speedReduction: 30 },
        puddles:        { icon: '🌊',  name: 'Лужи',           description: 'Образовались лужи — риск аквапланирования.', severity: 'high',     brakeIncrease: 60, speedReduction: 30 },
        ice:            { icon: '❄️',  name: 'Обледенелое',    description: 'Поверхность обледенела — крайне опасно!', severity: 'critical', brakeIncrease: 300, speedReduction: 50 },
        black_ice_risk: { icon: '🧊',  name: 'Риск гололёда',  description: 'Высокий риск образования чёрного льда.', severity: 'critical', brakeIncrease: 200, speedReduction: 40 },
        muddy:          { icon: '🟤',  name: 'Грязь',          description: 'Размытый грунт — затруднённое движение.', severity: 'moderate', brakeIncrease: 50, speedReduction: 25 },
        dew:            { icon: '🌫️', name: 'Роса',           description: 'Ночная роса — поверхность влажная.', severity: 'low',      brakeIncrease: 10, speedReduction: 5 },
        drying:         { icon: '🌤️', name: 'Высыхание',      description: 'Поверхность высыхает после осадков.', severity: 'low',      brakeIncrease: 5,  speedReduction: 5 }
    };
    return map[conditionEn] || { icon: '❓', name: 'Неизвестно', description: '', severity: 'low', brakeIncrease: 0, speedReduction: 0 };
}

/**
 * Builds the complete surfaceCondition object consumed by createDetailedSurfaceInfo().
 * @param {object} weatherData - Merged weather data
 * @param {object} roadData - Road data from Overpass
 * @param {object|null} owmOnecall - OpenWeatherMap OneCall data (may be null)
 * @returns {object} surfaceCondition
 */
export function buildSurfaceCondition(weatherData, roadData, owmOnecall, realData = {}) {
    const temp = _num(weatherData.temp, 15);
    const humidity = _num(weatherData.humidity, 60);
    const windSpeed = _num(weatherData.windSpeed, 3);
    const cloudCover = _num(weatherData.cloudCover, 50);
    const precipitation = _num(weatherData.precipitation, 0);
    const weatherCode = _num(weatherData.weatherCode, 0);

    // Precipitation periods — prefer real historical data when available
    const rain1h = realData.precipitation?.last1h ?? _num(weatherData.rain1h, precipitation);
    const rain3h = realData.precipitation?.last3h ?? _num(weatherData.rain3h, precipitation * 3);
    const snow1h = _num(weatherData.snow1h, weatherCode >= 71 && weatherCode <= 86 ? precipitation : 0);
    const total1h = +(rain1h + snow1h).toFixed(1);
    const total3h = +(rain3h + _num(weatherData.snow3h, snow1h * 3)).toFixed(1);
    const total6h  = realData.precipitation?.last6h  != null ? +realData.precipitation.last6h.toFixed(1)  : +(total3h * 2).toFixed(1);
    const total24h = realData.precipitation?.last24h != null ? +realData.precipitation.last24h.toFixed(1) : +(total6h * 4).toFixed(1);

    // Surface type and drainage from road data
    const rawSurface = roadData.roadSurfaceRaw || 'asphalt';
    const surfaceTypeKey = ['soil', 'grass', 'dirt', 'ground'].includes(rawSurface) ? 'soil'
                         : ['paving_stones', 'cobblestone', 'sett'].includes(rawSurface) ? 'sidewalk'
                         : rawSurface === 'concrete' ? 'concrete'
                         : 'asphalt';
    // Use real drainage if available; otherwise default 'good'
    const drainageKey = realData.drainage ?? 'good';

    // Determine conditionEn from surface analysis (pass realData for accuracy)
    const surfAnalysis = analyzeSurfaceWithProbability(weatherData, roadData, {}, realData);
    const conditionEn = surfAnalysis.road.conditionEn;

    // Dewpoint
    const dewpoint = owmOnecall?.current?.dewPoint != null
        ? Math.round(owmOnecall.current.dewPoint)
        : Math.round(temp - ((100 - humidity) / 5));

    // Solar radiation and surface temperature
    const solarRadiation = Math.round(800 * (1 - cloudCover / 100));
    const surfaceTemp = _estimateSurfaceTemp(temp, solarRadiation, windSpeed, cloudCover);
    const tempDiff = +(surfaceTemp - dewpoint).toFixed(1);
    const isAboveDewpoint = surfaceTemp > dewpoint;

    // Precipitation analysis
    const { typeLabel: precipType, intensityClass: precipIntensityClass } = _getPrecipInfo(weatherCode, total1h);
    const hoursSinceRain = total1h > 0 ? 0 : (total3h > 0 ? 2 : (total6h > 0 ? 5 : 12));

    // Advanced drying
    const advDrying = calculateAdvancedDryingTime(
        { ...weatherData, precipitation6h: total6h },
        surfaceTypeKey,
        { drainage: drainageKey }
    );

    // Braking distances at standard speeds
    const brakingAt60 = calculateBrakingDistance(60, conditionEn);
    const brakingAt90 = calculateBrakingDistance(90, conditionEn);
    const brakingAt120 = calculateBrakingDistance(120, conditionEn);
    const dryAt90 = calculateBrakingDistance(90, 'dry');

    // Aquaplaning risk at 90 km/h with estimated water depth.
    // Coefficients: 0.3 mm depth per 1mm/h last-hour rain (fresh runoff),
    // 0.1 mm per 1mm/h 3-hour accumulation (drainage partially removes it); cap at 10mm.
    const waterDepth = Math.min(total1h * 0.3 + total3h * 0.1, 10);
    const aquaplaning = calculateAquaplaningRisk(90, waterDepth);

    // Surface display properties
    const display = _getSurfaceDisplay(conditionEn);

    // Driving impact (safe speed)
    const safeSpeed = Math.round(90 * (1 - display.speedReduction / 100));
    const newBrakingM = brakingAt90.totalDistance;
    const normalBrakingM = dryAt90.totalDistance;

    const gripMap = {
        dry: 'Отличное', slightly_damp: 'Хорошее', damp: 'Удовлетворительное',
        wet: 'Сниженное', very_wet: 'Плохое', puddles: 'Плохое',
        ice: 'Минимальное', black_ice_risk: 'Минимальное', muddy: 'Плохое', dew: 'Хорошее', drying: 'Хорошее'
    };

    // Surface forecast
    const hourlyForecast = owmOnecall?.hourly || [];
    const surfaceForecast = forecastSurfaceConditions(hourlyForecast, conditionEn);
    const futureRain = hourlyForecast.slice(0, 6).reduce((s, h) => s + (h.rain || 0), 0);
    const futureHasRain = futureRain > 0;
    const trendIcon = futureHasRain ? '⬆️' : (total1h > 0 ? '⬇️' : '→');
    const trend = futureHasRain ? 'Ухудшение' : (total1h > 0 ? 'Улучшение' : 'Стабильно');

    // Minutely precipitation bar
    const minutelyData = owmOnecall?.minutely || [];

    // Recommendations
    const recommendations = [];
    if (display.speedReduction > 0) recommendations.push(`Снизьте скорость до ${safeSpeed} км/ч`);
    if (display.brakeIncrease > 0) recommendations.push(`Увеличьте дистанцию до ${Math.round(newBrakingM * 1.2)} м`);
    if (conditionEn === 'ice' || conditionEn === 'black_ice_risk') recommendations.push('Используйте зимние шины, избегайте резкого торможения');
    if (aquaplaning.risk === 'high') recommendations.push(`Немедленно снизьте скорость ниже ${aquaplaning.criticalSpeed} км/ч — риск аквапланирования!`);
    else if (aquaplaning.risk === 'moderate') recommendations.push(`Держите скорость ниже ${aquaplaning.criticalSpeed} км/ч во избежание аквапланирования`);
    if (conditionEn === 'wet' || conditionEn === 'very_wet') recommendations.push('Тормозите плавно, избегайте резких манёвров');

    const pedestrianMessages = {
        dry: 'Нормальные условия для пешеходов.',
        damp: 'Поверхность влажная — возможна скользкость.',
        wet: 'Мокрые тротуары — соблюдайте осторожность.',
        very_wet: 'Скользко и мокро — используйте нескользящую обувь.',
        ice: '❄️ Гололёд — крайняя осторожность, держитесь за поручни.',
        black_ice_risk: '⚠️ Риск гололёда — двигайтесь медленно.',
        muddy: 'Грязные тропинки — используйте непромокаемую обувь.'
    };

    return {
        // Display
        icon: display.icon,
        name: display.name,
        description: display.description,
        severity: display.severity,
        brakeIncrease: display.brakeIncrease,
        speedReduction: display.speedReduction,

        // Precipitation analysis
        precipAnalysisDetailed: {
            total1h, total3h, total6h, total24h,
            currentIntensity: total1h,
            hoursSinceRain,
            continuousRainHours: total1h > 0 ? 1 : 0,
            precipType,
            precipIntensityClass,
            minutelyData
        },

        // Temperature / drying analysis
        dryingAnalysis: {
            airTemp: temp,
            surfaceTemp,
            surfaceTempCalc: `воздух ${temp}°C ${surfaceTemp < temp ? '-' : '+'}${Math.abs(+(temp - surfaceTemp).toFixed(1))}°C (радиация +${Math.round(solarRadiation / 100 * 0.1 * 10) / 10}°C, ветер -${+(0.05 * windSpeed).toFixed(2)}°C, облачность -${+(cloudCover * 0.05).toFixed(2)}°C)`,
            dewpoint,
            tempDiff,
            isAboveDewpoint,
            condensationRisk: !isAboveDewpoint,
            iceRisk: surfaceTemp < 0 && !isAboveDewpoint,
            radiation: solarRadiation,
            cloudCover,
            windSpeed,
            humidity,
            evaporationRate: advDrying.evaporationRate,
            drainageRate: advDrying.drainageRate,
            residualWater: advDrying.residualWater,
            vpd: advDrying.vpd,
            dryingHours: advDrying.dryingHours,
            dryingTime: advDrying.dryingTime,
            precipitation6h: advDrying.precipitation6h
        },

        // Surface type
        surfaceType: {
            type: surfaceTypeKey,
            drainage: drainageKey,
            texture: 'medium'
        },

        // Coverage
        coverage: {
            mainCoverage: conditionEn === 'dry' || conditionEn === 'drying' ? 'dry' : 'wet',
            depthMm: advDrying.residualWater,
            evaporatedMm: Math.max(0, +(total6h - advDrying.residualWater).toFixed(1)),
            description: display.name
        },

        // Braking distances at 60/90/120 km/h
        brakingDistances: {
            at60kmh: { ...brakingAt60, dryDistance: calculateBrakingDistance(60, 'dry').totalDistance },
            at90kmh: { ...brakingAt90, dryDistance: dryAt90.totalDistance },
            at120kmh: { ...brakingAt120, dryDistance: calculateBrakingDistance(120, 'dry').totalDistance },
            frictionCoefficient: brakingAt90.frictionCoefficient,
            dryFriction: 0.80
        },

        // Aquaplaning risk
        aquaplaning: { ...aquaplaning, waterDepth: +waterDepth.toFixed(1) },

        // Driving impact (existing fields)
        drivingImpact: {
            normalBrakingM,
            newBrakingM,
            normalSpeed: 90,
            safeSpeed,
            speedReductionKmh: 90 - safeSpeed,
            gripLevel: gripMap[conditionEn] || 'Нормальное',
            responseLevel: display.speedReduction > 20 ? 'Замедленная' : display.speedReduction > 5 ? 'Умеренная' : 'Хорошая',
            motorcycleRisk: display.severity === 'critical' ? '🔴 ОПАСНО — избегать движения' : display.severity === 'high' ? '🟠 Высокий риск' : '🟡 Повышенная осторожность',
            bicycleRisk: display.severity === 'critical' ? '🔴 ОПАСНО — избегать движения' : display.severity === 'high' ? '🟠 Высокий риск' : '🟡 Повышенная осторожность'
        },

        // Surface forecast
        surfaceForecast,
        forecast: {
            trendIcon,
            trend,
            futureRainMm: +futureRain.toFixed(1),
            futureCondition: futureHasRain ? 'Ожидаются осадки' : (total1h > 0 ? display.name : 'Без осадков')
        },

        // Recommendations
        recommendations: recommendations.length > 0 ? recommendations : ['Соблюдайте скоростной режим'],
        forPedestrians: pedestrianMessages[conditionEn] || 'Нормальные условия.',

        // frictionCoef for use in displayFullInfo
        frictionCoef: brakingAt90.frictionCoefficient.toFixed(2)
    };
}

export function calculateDryingTime(factors, surfaceType) {
    // baseTime values are in minutes: asphalt dries fastest, soil slowest
    let baseTime = { asphalt: 120, concrete: 150, sidewalk: 180, soil: 240 }[surfaceType] || 120;
    const tempCoef = factors.temperature > 25 ? 0.6 : factors.temperature > 15 ? 0.8 : factors.temperature > 5 ? 1.0 : factors.temperature > 0 ? 1.3 : 2.0;
    const windCoef = factors.windSpeed > 15 ? 0.6 : factors.windSpeed > 10 ? 0.7 : factors.windSpeed > 5 ? 0.85 : 1.0;
    const humidityCoef = factors.humidity > 85 ? 1.5 : factors.humidity > 70 ? 1.3 : factors.humidity > 50 ? 1.1 : 1.0;
    const sunCoef = factors.sunExposure > 80 ? 0.5 : factors.sunExposure > 60 ? 0.7 : factors.sunExposure > 40 ? 0.85 : factors.sunExposure > 20 ? 1.0 : 1.3;
    const drainageCoef = { excellent: 0.6, good: 0.8, moderate: 1.0, poor: 1.5, very_poor: 2.0 }[factors.drainage] || 1.0;
    const slopeCoef = factors.slope > 10 ? 0.7 : factors.slope > 5 ? 0.85 : factors.slope > 2 ? 1.0 : 1.3;
    const historicalWetnessCoef = factors.historicalWetness === 'high' ? 1.5 : factors.historicalWetness === 'low' ? 0.7 : 1.0;
    const totalTime = baseTime * tempCoef * windCoef * humidityCoef * sunCoef * drainageCoef * slopeCoef * historicalWetnessCoef;
    const hours = Math.floor(totalTime / 60);
    const minutes = Math.round(totalTime % 60);
    if (totalTime < 60) return `${minutes}мин`;
    if (hours >= 24) return `${Math.round(hours / 24)}д ${hours % 24}ч`;
    return minutes > 0 ? `${hours}ч ${minutes}мин` : `${hours}ч`;
}

export function updateBayesian(priorP, likelihood, evidence) {
    return priorP * (1 - evidence) + likelihood * evidence;
}

export function getConfidenceFromScore(score) {
    if (score >= 75) return 'Высокая';
    if (score >= 50) return 'Средняя';
    return 'Низкая';
}

export function analyzeSurfaceWithProbability(weatherData, roadData, locationData, realData = {}) {
    const hour = new Date().getHours();
    const timeOfDay = hour >= 6 && hour < 12 ? 'morning'
                    : hour >= 12 && hour < 18 ? 'day'
                    : hour >= 18 && hour < 22 ? 'evening'
                    : 'night';

    const sunExposure = realData.shading != null
        ? realData.shading.sunExposure
        : weatherData.cloudCover != null ? Math.max(0, 100 - weatherData.cloudCover) : 50;

    const baseSurfaceType = roadData.roadSurfaceRaw || 'asphalt';
    const surfaceTypeNorm = ['soil', 'grass', 'dirt', 'ground'].includes(baseSurfaceType) ? 'soil'
                          : ['paving_stones', 'cobblestone', 'sett'].includes(baseSurfaceType) ? 'sidewalk'
                          : baseSurfaceType === 'concrete' ? 'concrete'
                          : 'asphalt';

    // Use real precipitation data if available; otherwise extrapolate from current reading
    const precip = realData.precipitation?.last1h ?? weatherData.precipitation ?? 0;
    const precip3h  = realData.precipitation?.last3h  ?? precip * 3;
    const precip6h  = realData.precipitation?.last6h  ?? precip * 6;
    const precip24h = realData.precipitation?.last24h ?? precip * 24;

    // Use real slope if available; otherwise fall back to default 5°
    const slope = realData.slope ?? 5;

    // Use real drainage if available; otherwise default 'good'
    const drainage = realData.drainage ?? 'good';

    // Use real shading if available
    const isShaded = realData.shading != null ? realData.shading.isShaded : sunExposure < 20;
    const hasRoof  = realData.hasRoof ?? false;

    // Historical wetness for drying time
    const historicalWetness = realData.historicalWetness?.soilSaturation ?? 'normal';

    const factors = {
        precipitation1h: precip, precipitation3h: precip3h,
        precipitation6h: precip6h, precipitation24h: precip24h,
        temperature: weatherData.temp || 15,
        humidity: weatherData.humidity || 60,
        windSpeed: weatherData.windSpeed || 5,
        cloudCover: weatherData.cloudCover || 50,
        timeOfDay, sunExposure,
        surfaceType: surfaceTypeNorm,
        drainage, slope,
        isShaded, hasRoof,
        historicalWetness
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

    const roadFactors = { surfaceType: surfaceTypeNorm, drainage, slope };
    const sidewalkFactors = { surfaceType: 'sidewalk', drainage: drainage === 'poor' || drainage === 'very_poor' ? drainage : 'moderate', slope: Math.min(slope, 3), isShaded: true };
    const soilFactors = { surfaceType: 'soil', drainage: factors.precipitation24h > 15 ? 'poor' : 'moderate', slope: Math.min(slope, 5) };

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
