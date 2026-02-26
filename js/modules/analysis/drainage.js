// js/modules/analysis/drainage.js - Dynamic drainage quality calculation

/**
 * Calculates drainage quality based on surface type, slope, precipitation history and terrain.
 * @param {object} params
 * @param {string} params.surfaceType - 'asphalt'|'concrete'|'sidewalk'|'soil'|'grass'|'gravel'|'paving_stones'
 * @param {number} [params.slope=5]   - Terrain slope in degrees
 * @param {number} [params.precip24h=0] - Precipitation over last 24h in mm
 * @param {string} [params.terrainType=''] - OSM highway type (e.g. 'highway', 'natural')
 * @returns {'excellent'|'good'|'moderate'|'poor'|'very_poor'}
 */
export function calculateDrainage({ surfaceType = 'asphalt', slope = 5, precip24h = 0, terrainType = '' }) {
    // Base drainage by surface type
    const surfaceBase = {
        asphalt:        'good',
        concrete:       'good',
        sidewalk:       'moderate',
        paving_stones:  'moderate',
        cobblestone:    'moderate',
        gravel:         'moderate',
        soil:           'poor',
        grass:          'poor',
        dirt:           'poor',
        ground:         'poor'
    };
    const drainageLevels = ['very_poor', 'poor', 'moderate', 'good', 'excellent'];

    let level = drainageLevels.indexOf(surfaceBase[surfaceType] || 'good');

    // Slope bonus
    if (slope > 10) level = Math.min(level + 2, 4);       // very steep → excellent
    else if (slope > 5) level = Math.min(level + 1, 4);   // moderate slope → +1
    else if (slope < 2) level = Math.max(level - 1, 0);   // flat → accumulation

    // Heavy recent rain degrades drainage by saturating surface/soil
    if (precip24h > 30) level = Math.max(level - 1, 0);

    // Terrain type adjustment
    if (terrainType.toLowerCase().includes('natural') || terrainType.toLowerCase().includes('park')) {
        level = Math.max(level - 1, 0);
    }

    return drainageLevels[level];
}
