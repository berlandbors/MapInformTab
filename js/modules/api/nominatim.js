// js/modules/api/nominatim.js - Nominatim geolocation API

import { retryWithBackoff } from '../utils/retry.js';
import { geocodingCache } from '../utils/cache.js';

/**
 * Reverse-geocodes coordinates using the Nominatim API.
 * Results are cached for 15 minutes. Retries up to 3 times with exponential backoff.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<object>} Location data object
 */
export async function getLocationData(lat, lng) {
    const cacheKey = `geocode-${lat.toFixed(4)}-${lng.toFixed(4)}`;

    const cached = geocodingCache.get(cacheKey);
    if (cached) {
        console.log(`✅ Кэш геолокации: попадание для ${cacheKey}`);
        return cached;
    }

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18`;
    console.log(`📍 GET ${url}`);

    try {
        const data = await retryWithBackoff(async () => {
            const response = await fetch(url, {
                headers: {
                    'Accept-Language': 'ru',
                    'User-Agent': 'MapInformTab/2.0'
                }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const json = await response.json();
            const addr = json.address || {};
            const hasMinimumData =
                (addr.city || addr.town || addr.village || addr.hamlet || addr.county) &&
                addr.country;

            if (!hasMinimumData) throw new Error('Недостаточно данных геолокации');

            return json;
        }, 3, 1000);

        const addr = data.address || {};
        const locationData = {
            road: addr.road || addr.pedestrian || addr.path || addr.footway || 'Нет данных',
            houseNumber: addr.house_number || null,
            city: addr.city || addr.town || addr.village || addr.hamlet || addr.county || 'Нет данных',
            district: addr.suburb || addr.neighbourhood || addr.district || addr.city_district || 'Нет данных',
            state: addr.state || addr.region || 'Нет данных',
            country: addr.country || 'Нет данных',
            postcode: addr.postcode || null,
            displayName: data.display_name || 'Нет данных',
            objectType: data.type || addr.amenity || addr.building || addr.shop || addr.tourism || addr.leisure || null,
            objectName: addr.name || data.name || null
        };

        geocodingCache.set(cacheKey, locationData);
        console.log(`💾 Геолокация сохранена в кэш: ${cacheKey}`);
        return locationData;

    } catch (error) {
        console.error('Ошибка геолокации:', error);
        return {
            road: 'Ошибка загрузки', houseNumber: null,
            city: 'Ошибка загрузки', district: 'Ошибка загрузки',
            state: 'Ошибка загрузки', country: 'Ошибка загрузки',
            postcode: null, displayName: 'Ошибка загрузки',
            objectType: null, objectName: null
        };
    }
}
