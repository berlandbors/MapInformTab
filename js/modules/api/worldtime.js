// js/modules/api/worldtime.js - Timezone data via TimeAPI

import { sleep } from '../utils/helpers.js';

export async function getTimezoneData(lat, lng, attempt = 1) {
    const maxAttempts = 3;

    try {
        const response = await fetch(
            `https://timeapi.io/api/TimeZone/coordinate?latitude=${lat}&longitude=${lng}`
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const timezoneName = data.timeZone || 'UTC';
        const now = new Date();

        function getTimePartsForTZ(date, tz) {
            try {
                const fmt = new Intl.DateTimeFormat('en-GB', {
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                    hour12: false, timeZone: tz
                });
                const parts = fmt.formatToParts(date);
                const h = Number(parts.find(p => p.type === 'hour').value);
                const m = Number(parts.find(p => p.type === 'minute').value);
                return { h, m };
            } catch (e) {
                return null;
            }
        }

        const utcParts = getTimePartsForTZ(now, 'UTC');
        const tzParts = getTimePartsForTZ(now, timezoneName);

        if (!tzParts || !utcParts) throw new Error('Failed to get timezone parts');

        let offsetMinutes = (tzParts.h * 60 + tzParts.m) - (utcParts.h * 60 + utcParts.m);
        if (offsetMinutes > 12 * 60) offsetMinutes -= 24 * 60;
        if (offsetMinutes < -12 * 60) offsetMinutes += 24 * 60;

        const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
        const offsetMins = Math.abs(offsetMinutes) % 60;
        const sign = offsetMinutes >= 0 ? '+' : '-';
        const utcOffset = `${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;

        const janDate = new Date(now.getFullYear(), 0, 15);
        const janUTCParts = getTimePartsForTZ(janDate, 'UTC');
        const janTZParts = getTimePartsForTZ(janDate, timezoneName);
        let janOffset = offsetMinutes;
        if (janUTCParts && janTZParts) {
            janOffset = (janTZParts.h * 60 + janTZParts.m) - (janUTCParts.h * 60 + janUTCParts.m);
            if (janOffset > 12 * 60) janOffset -= 24 * 60;
            if (janOffset < -12 * 60) janOffset += 24 * 60;
        }

        const julDate = new Date(now.getFullYear(), 6, 15);
        const julUTCParts = getTimePartsForTZ(julDate, 'UTC');
        const julTZParts = getTimePartsForTZ(julDate, timezoneName);
        let julOffset = offsetMinutes;
        if (julUTCParts && julTZParts) {
            julOffset = (julTZParts.h * 60 + julTZParts.m) - (julUTCParts.h * 60 + julUTCParts.m);
            if (julOffset > 12 * 60) julOffset -= 24 * 60;
            if (julOffset < -12 * 60) julOffset += 24 * 60;
        }

        const standardOffset = Math.min(janOffset, julOffset);
        const isDST = offsetMinutes > standardOffset;
        const winterOffset = Math.min(janOffset, julOffset);
        const summerOffset = Math.max(janOffset, julOffset);
        const usesDST = Math.abs(summerOffset - winterOffset) >= 30;

        const formatOffsetString = (minutes) => {
            const hours = Math.floor(Math.abs(minutes) / 60);
            const mins = Math.abs(minutes) % 60;
            const s = minutes >= 0 ? '+' : '-';
            return `${s}${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
        };

        const dstStart = data.dstStart ?? data.dstInterval?.dstStart ?? data.dstInterval?.dstNextStart ?? null;

        return {
            timezone: timezoneName, utcOffset, isDST, usesDST,
            winterOffset: formatOffsetString(winterOffset),
            summerOffset: formatOffsetString(summerOffset),
            currentSeason: usesDST ? (isDST ? 'summer' : 'winter') : null,
            dstStart
        };
    } catch (error) {
        console.error(`Ошибка получения данных о часовом поясе (попытка ${attempt}):`, error);

        if (attempt < maxAttempts) {
            console.log(`🔄 Повторный запрос часового пояса через ${attempt} сек...`);
            await sleep(1000 * attempt);
            return getTimezoneData(lat, lng, attempt + 1);
        }

        return {
            timezone: 'Н/Д', utcOffset: 'Н/Д', isDST: false, usesDST: false,
            winterOffset: null, summerOffset: null, currentSeason: 'winter', dstStart: null
        };
    }
}

export function getCurrentTimeForTimezone(timezone) {
    if (!timezone || timezone === 'Н/Д') {
        return new Date().toLocaleString('ru-RU', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }
    try {
        return new Date().toLocaleString('ru-RU', {
            timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    } catch (e) {
        return 'Н/Д';
    }
}
