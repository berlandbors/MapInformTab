// js/modules/api/overpass.js - Overpass API for road data

import { sleep } from '../utils/helpers.js';
import { getRoadTypeName, getSurfaceName } from '../utils/formatters.js';

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
        const response = await fetch(url);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

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
        const response = await fetch(url);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

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
