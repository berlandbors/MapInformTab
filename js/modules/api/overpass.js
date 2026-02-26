// js/modules/api/overpass.js - Overpass API for road data

import { sleep } from '../utils/helpers.js';
import { getRoadTypeName, getSurfaceName } from '../utils/formatters.js';
import { retryWithBackoff } from '../utils/retry.js';
import { SimpleCache } from '../utils/cache.js';

const shadingCache  = new SimpleCache(60 * 60 * 1000); // 1 hour
const coverageCache = new SimpleCache(60 * 60 * 1000); // 1 hour

function getRoadImportance(highway) {
    const importance = {
        'motorway': 10, 'trunk': 9, 'primary': 8, 'secondary': 7,
        'tertiary': 6, 'residential': 5, 'unclassified': 4,
        'service': 3, 'track': 2, 'path': 1
    };
    return importance[highway] || 0;
}

function getPedestrianTypeName(type) {
    const types = {
        footway: 'Пешеходная дорожка', pedestrian: 'Пешеходная зона',
        path: 'Тропинка', cycleway: 'Велодорожка', steps: 'Лестница',
        living_street: 'Жилая зона', park: 'Парк',
        playground: 'Детская площадка', plaza: 'Площадь', square: 'Площадь'
    };
    return types[type] || type || 'Неизвестно';
}

export async function getRoadData(lat, lng, attempt = 1) {
    const radiuses = [100, 250, 500, 1000];
    const radius = radiuses[Math.min(attempt - 1, radiuses.length - 1)];

    try {
        const query = `[out:json][timeout:10];
            (way(around:${radius},${lat},${lng})[highway];
             way(around:${radius},${lat},${lng})[footway];
             way(around:${radius},${lat},${lng})[path];);
            out body 10;`;

        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        console.log(`🚗 GET Overpass дороги r=${radius}м`);
        const data = await retryWithBackoff(async () => {
            const startTime = performance.now();
            const response = await fetch(url);
            const elapsed = Math.round(performance.now() - startTime);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            console.log(`✅ getRoadData (${elapsed}мс)`);
            return response.json();
        }, 2, 500);

        if (data.elements && data.elements.length > 0) {
            const bestRoad = data.elements
                .filter(r => r.tags && (r.tags.highway || r.tags.footway || r.tags.path))
                .sort((a, b) => {
                    const scoreA = (a.tags.name ? 10 : 0) + getRoadImportance(a.tags.highway);
                    const scoreB = (b.tags.name ? 10 : 0) + getRoadImportance(b.tags.highway);
                    return scoreB - scoreA;
                })[0];

            const tags = bestRoad.tags || {};
            console.log(`✅ Дорога найдена в радиусе ${radius}м: ${tags.name || tags.highway}`);

            return {
                roadName: tags.name || tags['name:ru'] || null,
                roadType: getRoadTypeName(tags.highway),
                maxSpeed: tags.maxspeed ? parseInt(tags.maxspeed) : null,
                roadSurface: getSurfaceName(tags.surface),
                roadSurfaceRaw: tags.surface || null,
                lanes: tags.lanes || null
            };
        }

        if (attempt < radiuses.length) {
            console.log(`🔍 Дороги не найдены в радиусе ${radius}м, расширяем поиск...`);
            await sleep(500);
            return getRoadData(lat, lng, attempt + 1);
        }

        console.log(`❌ Дороги не найдены в радиусе ${radiuses[radiuses.length - 1]}м`);
        return { roadName: null, roadType: 'Нет дорог поблизости', maxSpeed: null, roadSurface: 'Н/Д', lanes: null };

    } catch (error) {
        console.error('Ошибка получения данных о дорогах:', error);

        if (attempt < radiuses.length) {
            console.log(`🔄 Повторный запрос дорог через 1 сек...`);
            await sleep(1000);
            return getRoadData(lat, lng, attempt + 1);
        }

        return { roadName: null, roadType: 'Ошибка загрузки', maxSpeed: null, roadSurface: 'Ошибка', lanes: null };
    }
}

export async function getPedestrianData(lat, lng, attempt = 1) {
    const radiuses = [100, 250, 500];
    const radius = radiuses[Math.min(attempt - 1, radiuses.length - 1)];

    try {
        const query = `[out:json][timeout:10];
            (
                way(around:${radius},${lat},${lng})[highway~"^(footway|pedestrian|path|cycleway|steps|living_street)$"];
                way(around:${radius},${lat},${lng})[leisure~"^(park|playground)$"];
                way(around:${radius},${lat},${lng})[amenity~"^(plaza|square)$"];
            );
            out body 10;`;

        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        console.log(`🚶 GET Overpass пешеходные r=${radius}м`);
        const data = await retryWithBackoff(async () => {
            const startTime = performance.now();
            const response = await fetch(url);
            const elapsed = Math.round(performance.now() - startTime);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            console.log(`✅ getPedestrianData (${elapsed}мс)`);
            return response.json();
        }, 2, 500);

        if (data.elements && data.elements.length > 0) {
            const pedestrianSurfaces = data.elements
                .filter(e => e.tags)
                .map(e => ({
                    type: e.tags.highway || e.tags.leisure || e.tags.amenity,
                    name: e.tags.name || e.tags['name:ru'] || null,
                    surface: e.tags.surface || null,
                    width: e.tags.width || null,
                    lit: e.tags.lit || null,
                    tags: e.tags
                }));

            const bestSurface = pedestrianSurfaces[0];
            console.log(`✅ Пешеходная поверхность найдена в радиусе ${radius}м: ${bestSurface.type}`);

            return {
                hasPedestrianArea: true,
                pedestrianType: getPedestrianTypeName(bestSurface.type),
                pedestrianName: bestSurface.name,
                pedestrianSurface: getSurfaceName(bestSurface.surface),
                pedestrianWidth: bestSurface.width,
                isLit: bestSurface.lit === 'yes',
                allSurfaces: pedestrianSurfaces
            };
        }

        if (attempt < radiuses.length) {
            console.log(`🔍 Пешеходные зоны не найдены в радиусе ${radius}м, расширяем поиск...`);
            await sleep(500);
            return getPedestrianData(lat, lng, attempt + 1);
        }

        return {
            hasPedestrianArea: false, pedestrianType: 'Нет данных',
            pedestrianName: null, pedestrianSurface: 'Н/Д',
            pedestrianWidth: null, isLit: false, allSurfaces: []
        };

    } catch (error) {
        console.error('Ошибка получения данных о пешеходных зонах:', error);

        if (attempt < radiuses.length) {
            console.log(`🔄 Повторный запрос пешеходных зон через 1 сек...`);
            await sleep(1000);
            return getPedestrianData(lat, lng, attempt + 1);
        }

        return {
            hasPedestrianArea: false, pedestrianType: 'Ошибка загрузки',
            pedestrianName: null, pedestrianSurface: 'Ошибка',
            pedestrianWidth: null, isLit: false, allSurfaces: []
        };
    }
}

/**
 * Fetches nearby buildings and trees for shading analysis (radius 30 m).
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{buildings: Array<{height:number}>, trees: number}|null>}
 */
export async function getShadingData(lat, lng) {
    const key = `shading-${lat.toFixed(3)}-${lng.toFixed(3)}`;
    const cached = shadingCache.get(key);
    if (cached) return cached;

    try {
        const query = `[out:json][timeout:5];
(
  way["building"](around:30,${lat},${lng});
  node["natural"="tree"](around:30,${lat},${lng});
  way["natural"="tree_row"](around:30,${lat},${lng});
);
out body;`;
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        console.log('🌳 GET Overpass затенённость r=30м');
        const startTime = performance.now();
        const response = await fetch(url);
        const elapsed = Math.round(performance.now() - startTime);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        console.log(`✅ getShadingData (${elapsed}мс)`);

        const buildings = (data.elements || [])
            .filter(el => el.tags && el.tags.building)
            .map(el => {
                const h = el.tags.height ? parseFloat(el.tags.height) : null;
                const levels = el.tags['building:levels'] ? parseInt(el.tags['building:levels']) * 3 : null;
                return { height: h || levels || 6 }; // default ~2 storeys
            });

        const trees = (data.elements || [])
            .filter(el => el.tags && (el.tags.natural === 'tree' || el.tags.natural === 'tree_row'))
            .length;

        const result = { buildings, trees };
        shadingCache.set(key, result);
        return result;
    } catch (err) {
        console.warn('⚠️ Shading data (Overpass) недоступен:', err.message);
        return null;
    }
}

/**
 * Checks whether the location has weather protection (tunnel, covered way, shelter, roof).
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<boolean>}
 */
export async function getCoverageData(lat, lng) {
    const key = `coverage-${lat.toFixed(3)}-${lng.toFixed(3)}`;
    const cached = coverageCache.get(key);
    if (cached !== null) return cached;

    try {
        const query = `[out:json][timeout:5];
(
  way["covered"="yes"](around:50,${lat},${lng});
  way["tunnel"="yes"](around:50,${lat},${lng});
  way["indoor"="yes"](around:50,${lat},${lng});
  node["amenity"="shelter"](around:50,${lat},${lng});
  way["building"="roof"](around:50,${lat},${lng});
);
out body 5;`;
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        console.log('🏠 GET Overpass защищённость r=50м');
        const startTime = performance.now();
        const response = await fetch(url);
        const elapsed = Math.round(performance.now() - startTime);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        console.log(`✅ getCoverageData (${elapsed}мс)`);

        const hasRoof = (data.elements || []).length > 0;
        coverageCache.set(key, hasRoof);
        return hasRoof;
    } catch (err) {
        console.warn('⚠️ Coverage data (Overpass) недоступен:', err.message);
        return false;
    }
}
