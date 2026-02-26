// config.example.js - Шаблон конфигурации (не содержит реальные ключи)
// Скопируйте этот файл в config.js и вставьте ваш ключ
// cp config.example.js config.js

export const OPENWEATHER_API_KEY = "YOUR_API_KEY_HERE";

// TomTom Traffic Flow API — https://developer.tomtom.com (2500 req/day free)
export const TOMTOM_API_KEY = '';

// HERE Traffic Incidents API — https://developer.here.com (250k req/month free)
export const HERE_API_KEY = '';

// Для обратной совместимости со старым script.js
if (typeof window !== 'undefined') {
    window.OPENWEATHER_API_KEY = "YOUR_API_KEY_HERE";
    window.TOMTOM_API_KEY = '';
    window.HERE_API_KEY = '';
}
