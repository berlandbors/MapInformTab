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

    // ОБНОВЛЁННЫЙ URL с дополнительными параметрами
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18&polygon_geojson=1&extratags=1&namedetails=1`;
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
            // СУЩЕСТВУЮЩИЕ ПОЛЯ
            road: addr.road || addr.pedestrian || addr.path || addr.footway || 'Нет данных',
            houseNumber: addr.house_number || null,
            city: addr.city || addr.town || addr.village || addr.hamlet || addr.county || 'Нет данных',
            district: addr.suburb || addr.neighbourhood || addr.district || addr.city_district || 'Нет данных',
            state: addr.state || addr.region || 'Нет данных',
            country: addr.country || 'Нет данных',
            postcode: addr.postcode || null,
            displayName: data.display_name || 'Нет данных',
            objectType: data.type || addr.amenity || addr.building || addr.shop || addr.tourism || addr.leisure || null,
            objectName: addr.name || data.name || null,

            // НОВЫЕ ПОЛЯ: OSM метаданные
            osmType: data.osm_type || null,           // 'node', 'way', 'relation'
            osmId: data.osm_id || null,               // Уникальный ID в OSM
            placeId: data.place_id || null,           // Nominatim place ID

            // НОВЫЕ ПОЛЯ: Классификация
            class: data.class || null,                // 'highway', 'building', 'natural', 'amenity'
            category: data.type || null,              // 'residential', 'commercial', 'park', etc.
            importance: data.importance || 0,         // Важность места (0-1)
            placeRank: data.place_rank || null,       // Ранг важности (0-30)

            // НОВЫЕ ПОЛЯ: Географические границы
            boundingBox: data.boundingbox ? {
                south: parseFloat(data.boundingbox[0]),
                north: parseFloat(data.boundingbox[1]),
                west: parseFloat(data.boundingbox[2]),
                east: parseFloat(data.boundingbox[3])
            } : null,

            // НОВЫЕ ПОЛЯ: GeoJSON полигон (если есть)
            geojson: data.geojson || null,

            // НОВЫЕ ПОЛЯ: Дополнительные теги OSM
            extraTags: data.extratags || {},

            // НОВЫЕ ПОЛЯ: Названия на разных языках
            nameDetails: data.namedetails || {},

            // ВЫЧИСЛЯЕМЫЕ ПОЛЯ
            areaSize: calculateAreaSize(data.boundingbox),
            osmUrl: data.osm_id && data.osm_type ? `https://www.openstreetmap.org/${data.osm_type}/${data.osm_id}` : null,
            isBuilding: data.class === 'building',
            isNatural: data.class === 'natural',
            isHighway: data.class === 'highway',
            isAmenity: data.class === 'amenity'
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
            objectType: null, objectName: null,
            osmType: null, osmId: null, placeId: null,
            class: null, category: null, importance: 0,
            boundingBox: null, geojson: null, extraTags: {},
            nameDetails: {}, areaSize: null, osmUrl: null,
            isBuilding: false, isNatural: false, isHighway: false, isAmenity: false
        };
    }
}

/**
 * Вычисляет приблизительный размер области в квадратных метрах
 * @param {Array} bbox - Bounding box [south, north, west, east]
 * @returns {number|null} Площадь в м²
 */
function calculateAreaSize(bbox) {
    if (!bbox || bbox.length !== 4) return null;

    const [south, north, west, east] = bbox.map(parseFloat);

    // Приблизительный расчёт в метрах (для малых областей)
    const latDiff = (north - south) * 111320; // 1° широты ≈ 111.32 км
    const lngDiff = (east - west) * 111320 * Math.cos((north + south) / 2 * Math.PI / 180);

    const area = Math.abs(latDiff * lngDiff);
    return Math.round(area);
}

/**
 * Получает детальную информацию об OSM объекте по его ID
 * @param {string} osmType - Тип объекта ('node', 'way', 'relation')
 * @param {number} osmId - ID объекта в OSM
 * @returns {Promise<object>} Детальная информация
 */
export async function getOSMDetails(osmType, osmId) {
    const url = `https://nominatim.openstreetmap.org/lookup?osm_ids=${osmType[0].toUpperCase()}${osmId}&format=json&addressdetails=1&extratags=1`;

    try {
        const response = await fetch(url, {
            headers: {
                'Accept-Language': 'ru',
                'User-Agent': 'MapInformTab/2.0'
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        return data[0] || null;
    } catch (error) {
        console.error('Ошибка получения OSM деталей:', error);
        return null;
    }
}

/**
 * Форматирует важность места в читаемый вид
 * @param {number} importance - Значение от 0 до 1
 * @returns {object} Объект с уровнем и описанием
 */
export function formatImportance(importance) {
    if (importance >= 0.8) return { level: 'very_high', label: 'Очень важное место', icon: '⭐⭐⭐' };
    if (importance >= 0.6) return { level: 'high', label: 'Важное место', icon: '⭐⭐' };
    if (importance >= 0.4) return { level: 'medium', label: 'Среднее значение', icon: '⭐' };
    if (importance >= 0.2) return { level: 'low', label: 'Локальное значение', icon: '◾' };
    return { level: 'very_low', label: 'Малозначимое', icon: '◽' };
}
