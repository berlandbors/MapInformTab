// js/modules/utils/astronomy.js - Astronomical calculations

export function getDayPhase(now, sunTimes) {
    const t = now.getTime();
    const dawn = sunTimes.dawn instanceof Date ? sunTimes.dawn.getTime() : null;
    const sunrise = sunTimes.sunrise instanceof Date ? sunTimes.sunrise.getTime() : null;
    const solarNoon = sunTimes.solarNoon instanceof Date ? sunTimes.solarNoon.getTime() : null;
    const sunset = sunTimes.sunset instanceof Date ? sunTimes.sunset.getTime() : null;
    const dusk = sunTimes.dusk instanceof Date ? sunTimes.dusk.getTime() : null;

    if (!sunrise || !sunset) return 'Н/Д';
    if (dawn && t < dawn) return '🌃 Ночь';
    if (t < sunrise) return '🌅 Рассвет';
    if (solarNoon && t < solarNoon) return '☀️ Утро';
    if (t < sunset) return '🌞 День';
    if (dusk && t < dusk) return '🌆 Сумерки';
    return '🌃 Ночь';
}

export function getMoonPhaseName(phase) {
    if (phase < 0.025 || phase >= 0.975) return '🌑 Новолуние';
    if (phase < 0.25) return '🌒 Растущий серп';
    if (phase < 0.275) return '🌓 Первая четверть';
    if (phase < 0.5) return '🌔 Растущая луна';
    if (phase < 0.525) return '🌕 Полнолуние';
    if (phase < 0.75) return '🌖 Убывающая луна';
    if (phase < 0.775) return '🌗 Последняя четверть';
    return '🌘 Убывающий серп';
}

export function getAstronomyData(lat, lng, timezone) {
    try {
        const now = new Date();
        const sunTimes = SunCalc.getTimes(now, lat, lng);
        const moonTimes = SunCalc.getMoonTimes(now, lat, lng);
        const moonIllum = SunCalc.getMoonIllumination(now);

        const sunrise = sunTimes.sunrise;
        const sunset = sunTimes.sunset;
        const validSun = sunrise instanceof Date && !isNaN(sunrise) && sunset instanceof Date && !isNaN(sunset);
        const dayLengthMin = validSun ? (sunset - sunrise) / 60000 : 0;

        const tzOptions = timezone && timezone !== 'Н/Д'
            ? { timeZone: timezone, hour: '2-digit', minute: '2-digit' }
            : { hour: '2-digit', minute: '2-digit' };

        const fmtTime = d => (d instanceof Date && !isNaN(d))
            ? d.toLocaleTimeString('ru-RU', tzOptions)
            : 'Н/Д';

        return {
            sunriseTime: validSun ? fmtTime(sunrise) : 'Н/Д',
            sunsetTime: validSun ? fmtTime(sunset) : 'Н/Д',
            dayLength: validSun ? `${Math.floor(dayLengthMin / 60)}ч ${Math.round(dayLengthMin % 60)}м` : 'Н/Д',
            dayPhase: getDayPhase(now, sunTimes),
            moonriseTime: fmtTime(moonTimes.rise),
            moonsetTime: fmtTime(moonTimes.set),
            moonPhase: getMoonPhaseName(moonIllum.phase),
            moonIllumination: Math.round(moonIllum.fraction * 100)
        };
    } catch (error) {
        console.error('Ошибка астрономических данных:', error);
        return {
            sunriseTime: 'Н/Д', sunsetTime: 'Н/Д', dayLength: 'Н/Д',
            dayPhase: 'Н/Д', moonriseTime: 'Н/Д', moonsetTime: 'Н/Д',
            moonPhase: 'Н/Д', moonIllumination: 0
        };
    }
}
