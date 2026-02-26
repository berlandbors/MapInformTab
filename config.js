// config.js - API ключи (не коммитится в Git)
export const OPENWEATHER_API_KEY = "452c27213f9904c2140f7b65897bfbef";

// TomTom Traffic Flow API — https://developer.tomtom.com (2500 req/day free)
export const TOMTOM_API_KEY = '';

// HERE Traffic Incidents API — https://developer.here.com (250k req/month free)
export const HERE_API_KEY = '';

// Глобальное определение для обратной совместимости со старым script.js
if (typeof window !== 'undefined') {
    window.OPENWEATHER_API_KEY = "452c27213f9904c2140f7b65897bfbef";
    window.TOMTOM_API_KEY = 'Eo66owtn8ghQlYLmAVMYNrKpOv7B0PB6';
    window.HERE_API_KEY = '';
}
