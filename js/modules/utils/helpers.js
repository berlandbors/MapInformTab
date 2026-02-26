// js/modules/utils/helpers.js - Utility helper functions

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function getDeviceType() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isPortrait = height > width;

    if (width <= 768 && isPortrait) {
        return 'smartphone-portrait';
    } else if (width <= 768 && !isPortrait) {
        return 'smartphone-landscape';
    } else if (width <= 1024) {
        return 'tablet';
    } else {
        return 'desktop';
    }
}
