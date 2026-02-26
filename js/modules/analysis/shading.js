// js/modules/analysis/shading.js - Shading analysis from buildings and trees

/**
 * Calculates shading and sun exposure based on nearby buildings and trees.
 * @param {object} shadingData - Result from overpass.getShadingData()
 * @param {number} [cloudCover=50] - Cloud cover percentage (0–100)
 * @returns {{ isShaded: boolean, sunExposure: number, buildings: number, maxBuildingHeight: number, treeCover: string }}
 */
export function calculateShading(shadingData, cloudCover = 50) {
    if (!shadingData) {
        const sunExposure = Math.max(0, 100 - cloudCover);
        return { isShaded: sunExposure < 20, sunExposure, buildings: 0, maxBuildingHeight: 0, treeCover: 'none' };
    }

    const { buildings = [], trees = 0 } = shadingData;

    const buildingCount = buildings.length;
    const maxBuildingHeight = buildings.length > 0
        ? Math.max(...buildings.map(b => b.height || 0))
        : 0;

    // Determine tree cover density
    let treeCover = 'none';
    if (trees > 10)      treeCover = 'dense';
    else if (trees > 3)  treeCover = 'moderate';
    else if (trees > 0)  treeCover = 'sparse';

    // Shading coefficients (0 = fully shaded, 1 = fully exposed)
    let shadingCoef = 1.0;

    // Buildings taller than ~2 storeys (>6 m) cast meaningful shade
    if (maxBuildingHeight > 20)  shadingCoef -= 0.5;
    else if (maxBuildingHeight > 10) shadingCoef -= 0.3;
    else if (maxBuildingHeight > 6)  shadingCoef -= 0.15;

    if (treeCover === 'dense')    shadingCoef -= 0.3;
    else if (treeCover === 'moderate') shadingCoef -= 0.15;
    else if (treeCover === 'sparse')   shadingCoef -= 0.05;

    shadingCoef = Math.max(0, Math.min(1, shadingCoef));

    // Sun exposure = cloud-adjusted × shading coefficient
    const rawSun = Math.max(0, 100 - cloudCover);
    const sunExposure = Math.round(rawSun * shadingCoef);
    const isShaded = sunExposure < 20 || shadingCoef < 0.5;

    return { isShaded, sunExposure, buildings: buildingCount, maxBuildingHeight, treeCover };
}
