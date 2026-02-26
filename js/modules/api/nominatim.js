// js/modules/api/nominatim.js - Nominatim geolocation API

import { sleep } from '../utils/helpers.js';

export async function getLocationData(lat, lng, attempt = 1) {
    const maxAttempts = 3;

    try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18`;

        const response = await fetch(url, {
            headers: {
                'Accept-Language': 'ru',
                'User-Agent': 'MapInformTab/2.0'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
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

        const hasMinimumData = locationData.city !== 'Нет данных' &&
                               locationData.country !== 'Нет данных';

        if (!hasMinimumData && attempt < maxAttempts) {
            console.log(`⚠️ Геолокация попытка ${attempt}: недостаточно данных, повтор...`);
            await sleep(1000 * attempt);
            return getLocationData(lat, lng, attempt + 1);
        }

        return locationData;

    } catch (error) {
        console.error(`Ошибка геолокации (попытка ${attempt}):`, error);

        if (attempt < maxAttempts) {
            console.log(`🔄 Повторный запрос геолокации через ${attempt} сек...`);
            await sleep(1000 * attempt);
            return getLocationData(lat, lng, attempt + 1);
        }

        return {
            road: 'Ошибка загрузки', houseNumber: null,
            city: 'Ошибка загрузки', district: 'Ошибка загрузки',
            state: 'Ошибка загрузки', country: 'Ошибка загрузки',
            postcode: null, displayName: 'Ошибка загрузки',
            objectType: null, objectName: null
        };
    }
}
