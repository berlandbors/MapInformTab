// js/modules/analysis/pressure.js - Pressure analysis

import { previousPressure, setPreviousPressure } from '../../state.js';

const HPA_TO_MMHG = 0.750062;

export function analyzePressure(pressure) {
    if (typeof pressure !== 'number') {
        return {
            level: 'unknown', levelName: 'Нет данных', trend: 'Нет данных',
            trendIcon: '—', mmHg: 'Н/Д', color: '#888888',
            healthEffects: [], weatherForecast: 'Нет данных'
        };
    }

    let level, levelName, color;
    if (pressure < 980) { level = 'very_low'; levelName = 'Очень низкое'; color = '#ff4444'; }
    else if (pressure < 1000) { level = 'low'; levelName = 'Низкое'; color = '#ff6600'; }
    else if (pressure < 1020) { level = 'normal'; levelName = 'Нормальное'; color = '#00ff00'; }
    else if (pressure < 1040) { level = 'high'; levelName = 'Повышенное'; color = '#ffaa00'; }
    else { level = 'very_high'; levelName = 'Очень высокое'; color = '#ff4444'; }

    let trend, trendIcon;
    const prev = previousPressure;
    if (prev === null || Math.abs(pressure - prev) < 1) {
        trend = 'Стабильно'; trendIcon = '→';
    } else if (pressure > prev) {
        trend = 'Растет'; trendIcon = '↑';
    } else {
        trend = 'Падает'; trendIcon = '↓';
    }
    setPreviousPressure(pressure);

    const mmHg = Math.round(pressure * HPA_TO_MMHG);

    return {
        level, levelName, trend, trendIcon, mmHg, color,
        healthEffects: getPressureHealthEffects(level),
        weatherForecast: getPressureWeatherForecast(level, trend)
    };
}

function getPressureHealthEffects(level) {
    const effects = {
        very_low: ['Головная боль и мигрень', 'Суставные боли у метеозависимых', 'Снижение артериального давления', 'Усталость и сонливость'],
        low: ['Возможна головная боль', 'Снижение концентрации', 'Ухудшение самочувствия у гипотоников'],
        normal: ['Комфортные условия', 'Нет негативного воздействия'],
        high: ['Повышение артериального давления', 'Риск для гипертоников', 'Возможна головная боль'],
        very_high: ['Значительное повышение АД', 'Высокий риск для сердечно-сосудистых', 'Сильная головная боль', 'Ухудшение при заболеваниях дыхательных путей']
    };
    return effects[level] || [];
}

function getPressureWeatherForecast(level, trend) {
    if (level === 'very_low' || (level === 'low' && trend === 'Падает')) {
        return '⛈️ Ожидается ухудшение погоды, возможны осадки и штормовой ветер';
    } else if (level === 'low' && trend === 'Растет') {
        return '🌤️ Погода начинает улучшаться';
    } else if (level === 'low') {
        return '🌧️ Возможны осадки, облачная погода';
    } else if (level === 'normal' && trend === 'Растет') {
        return '☀️ Погода улучшается, ожидается прояснение';
    } else if (level === 'normal' && trend === 'Падает') {
        return '🌥️ Возможно ухудшение погоды';
    } else if (level === 'normal') {
        return '⛅ Умеренная погода, без резких изменений';
    } else if ((level === 'high' || level === 'very_high') && trend === 'Падает') {
        return '🌥️ Ожидается смена погоды, возможны осадки';
    } else if (level === 'high' || level === 'very_high') {
        return '☀️ Ясная, солнечная погода';
    }
    return 'Нет прогноза';
}
