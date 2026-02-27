// js/modules/analysis/surface.js - Surface analysis (disabled)
// This module has been disabled to simplify the application

/**
 * Placeholder function for surface analysis
 * @returns {object} Empty analysis result
 */
export function analyzeSurfaceWithProbability() {
    return {
        road: { condition: 'Н/Д', probability: 0, confidence: 'low', factors: [] },
        sidewalk: { condition: 'Н/Д', probability: 0, confidence: 'low', factors: [] },
        soil: { condition: 'Н/Д', probability: 0, confidence: 'low', factors: [] }
    };
}

/**
 * Placeholder function for surface condition
 * @returns {object} Empty condition result
 */
export function buildSurfaceCondition() {
    return {
        condition: { icon: '❓', name: 'Н/Д', description: '', severity: 'low' },
        braking: { normalDistance: 0, wetDistance: 0 },
        recommendations: [],
        forPedestrians: ''
    };
}
