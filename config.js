// config.js - API ключи (не коммитится в Git)
export const OPENWEATHER_API_KEY = "452c27213f9904c2140f7b65897bfbef";

// Глобальное определение для обратной совместимости со старым script.js
if (typeof window !== 'undefined') {
    window.OPENWEATHER_API_KEY = "452c27213f9904c2140f7b65897bfbef";
}
