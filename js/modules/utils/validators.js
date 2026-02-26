// js/modules/utils/validators.js

export function isValidCoordinates(lat, lng) {
    return typeof lat === 'number' && typeof lng === 'number' &&
           lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function isValidApiKey(key) {
    return typeof key === 'string' && key.length > 0 && key !== 'YOUR_API_KEY_HERE';
}
