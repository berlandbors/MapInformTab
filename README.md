# MapInformTab

Интерактивная карта с полным мониторингом местности: погода, геолокация, сейсмика, качество воздуха и метеопредупреждения.

## Возможности

- 📍 Геолокация и адресная информация через Nominatim/OpenStreetMap
- 🌤️ Погода в реальном времени через Open-Meteo (без API-ключа) + **OpenWeatherMap (с ключом)**
- 🌫️ **Качество воздуха (AQI)** — PM2.5, PM10, CO, NO₂, O₃, SO₂ через OpenWeatherMap
- 🚨 **Метеорологические предупреждения** через OpenWeatherMap One Call API 3.0
- ⚡ **Минутный прогноз осадков** (следующий час) через OpenWeatherMap
- 📅 **Почасовой прогноз** (48 часов) и **дневной прогноз** (8 дней) через OpenWeatherMap
- 🌍 Сейсмическая активность через USGS Earthquake API
- 📊 Анализ атмосферного давления с тенденциями
- 🕐 Часовые пояса и астрономические данные (восход/закат/луна)
- 🚗 Дорожные данные через Overpass/OSM
- ✈️ METAR данные с ближайших аэропортов
- 🧠 Индуктивный анализ поверхности и трафика на основе реальных данных

## Архитектура

Приложение использует модульную ES6 архитектуру:

```
js/
├── main.js                   # Точка входа, инициализация
├── state.js                  # Общее состояние приложения
└── modules/
    ├── api/
    │   ├── openweather.js    # OpenWeatherMap API (4 эндпоинта)
    │   ├── openmeteo.js      # Open-Meteo API
    │   ├── nominatim.js      # Геокодинг (OSM)
    │   ├── overpass.js       # Дорожные данные (OSM)
    │   ├── usgs.js           # Сейсмика
    │   ├── metar.js          # Авиационная погода
    │   └── worldtime.js      # Часовые пояса
    ├── analysis/
    │   ├── surface.js        # Индуктивный анализ поверхности
    │   ├── traffic.js        # Вероятностная оценка трафика
    │   ├── weather.js        # ML-коррекции погоды
    │   ├── pressure.js       # Анализ давления
    │   ├── hazards.js        # Сбор опасностей
    │   └── quality.js        # Оценка качества данных
    ├── ui/
    │   ├── map.js            # Leaflet карта
    │   ├── popup.js          # Popup маркеров
    │   ├── modal.js          # Модальные окна
    │   ├── loading.js        # Индикатор загрузки
    │   ├── search.js         # Поиск локаций
    │   ├── layers.js         # Слои карты
    │   └── share.js          # Шаринг локаций
    └── utils/
        ├── helpers.js        # Общие утилиты
        ├── astronomy.js      # Астрономические расчёты
        ├── formatters.js     # Форматирование данных
        └── validators.js     # Валидация
```

## Настройка OpenWeatherMap API

Функции качества воздуха, метеопредупреждений, минутного/почасового/дневного прогнозов требуют API-ключ OpenWeatherMap.

### Шаги:

1. Зарегистрируйтесь на [openweathermap.org](https://openweathermap.org) и получите бесплатный API-ключ
2. Скопируйте шаблон конфигурации:
   ```bash
   cp config.example.js config.js
   ```
3. Откройте `config.js` и замените `YOUR_API_KEY_HERE` на ваш ключ:
   ```javascript
   window.OPENWEATHER_API_KEY = "ваш_ключ_здесь";
   ```

> **Примечание:** Файл `config.js` добавлен в `.gitignore` и не будет загружен в репозиторий. Никогда не коммитьте реальные API-ключи.

> **Без API-ключа:** Приложение работает с данными Open-Meteo. С API-ключом добавляются более точные данные OpenWeatherMap.

## Источники данных

| Данные | Источник | API-ключ |
|--------|----------|----------|
| Погода (базовая) | [Open-Meteo](https://open-meteo.com) | Не нужен |
| Погода (улучшенная) | [OpenWeatherMap Current](https://openweathermap.org/current) | **Нужен** |
| Прогноз 48ч + 8 дней | [OpenWeatherMap One Call 3.0](https://openweathermap.org/api/one-call-3) | **Нужен** |
| Минутный прогноз | [OpenWeatherMap One Call 3.0](https://openweathermap.org/api/one-call-3) | **Нужен** |
| Качество воздуха | [OpenWeatherMap Air Pollution](https://openweathermap.org/api/air-pollution) | **Нужен** |
| Метеопредупреждения | [OpenWeatherMap One Call 3.0](https://openweathermap.org/api/one-call-3) | **Нужен** |
| Геолокация | [Nominatim / OSM](https://nominatim.openstreetmap.org) | Не нужен |
| Дороги | [Overpass API / OSM](https://overpass-api.de) | Не нужен |
| Сейсмика | [USGS Earthquake API](https://earthquake.usgs.gov) | Не нужен |
| Часовые пояса | [WorldTimeAPI](https://worldtimeapi.org) | Не нужен |
| METAR | [aviationweather.gov](https://aviationweather.gov) | Не нужен |

## Запуск

Откройте `index.html` в браузере или запустите через любой HTTP-сервер:

```bash
python -m http.server 8000
```

Затем перейдите на [http://localhost:8000](http://localhost:8000).

> **Важно:** Приложение использует ES6 модули (`type="module"`), поэтому требует HTTP-сервер. Открытие `index.html` напрямую через `file://` не поддерживается браузерами.
