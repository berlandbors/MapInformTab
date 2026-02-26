// config.example.js - Шаблон конфигурации (не содержит реальные ключи)
// Скопируйте этот файл в config.js и вставьте ваш ключ
// cp config.example.js config.js

export const OPENWEATHER_API_KEY = "YOUR_API_KEY_HERE";

// Для обратной совместимости со старым script.js
if (typeof window !== 'undefined') {
    window.OPENWEATHER_API_KEY = "YOUR_API_KEY_HERE";
}
