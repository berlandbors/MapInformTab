# MapInformTab

Интерактивная карта с полным мониторингом местности: погода, геолокация, сейсмика, качество воздуха и метеопредупреждения.

## Возможности

- 📍 Геолокация и адресная информация через Nominatim/OpenStreetMap
- 🌤️ Погода в реальном времени через Open-Meteo (без API-ключа)
- 🌫️ **Качество воздуха (AQI)** — PM2.5, PM10, CO, NO₂, O₃, SO₂ через OpenWeatherMap
- 🚨 **Метеорологические предупреждения** через OpenWeatherMap One Call API 3.0
- ⚡ **Минутный прогноз осадков** (следующий час) через OpenWeatherMap
- 🌍 Сейсмическая активность через USGS Earthquake API
- 📊 Анализ атмосферного давления с тенденциями
- 🕐 Часовые пояса и астрономические данные (восход/закат/луна)
- 🚗 Дорожные данные через Overpass/OSM
- ✈️ METAR данные с ближайших аэропортов

## Настройка OpenWeatherMap API

Функции качества воздуха, метеопредупреждений и минутного прогноза осадков требуют API-ключ OpenWeatherMap.

### Шаги:

1. Зарегистрируйтесь на [openweathermap.org](https://openweathermap.org) и получите бесплатный API-ключ
2. Скопируйте шаблон конфигурации:
   ```bash
   cp config.example.js config.js
   ```
3. Откройте `config.js` и замените `YOUR_API_KEY_HERE` на ваш ключ:
   ```javascript
   const OPENWEATHER_API_KEY = "ваш_ключ_здесь";
   ```

> **Примечание:** Файл `config.js` добавлен в `.gitignore` и не будет загружен в репозиторий. Никогда не коммитьте реальные API-ключи.

> **Без API-ключа:** Приложение работает в полном режиме без `config.js` — функции AQI, метеопредупреждений и минутного прогноза будут просто отсутствовать.

## Источники данных

| Данные | Источник | API-ключ |
|--------|----------|----------|
| Погода | [Open-Meteo](https://open-meteo.com) | Не нужен |
| Геолокация | [Nominatim / OSM](https://nominatim.openstreetmap.org) | Не нужен |
| Дороги | [Overpass API / OSM](https://overpass-api.de) | Не нужен |
| Сейсмика | [USGS Earthquake API](https://earthquake.usgs.gov) | Не нужен |
| Часовые пояса | [WorldTimeAPI](https://worldtimeapi.org) | Не нужен |
| METAR | [aviationweather.gov](https://aviationweather.gov) | Не нужен |
| Качество воздуха | [OpenWeatherMap](https://openweathermap.org) | **Нужен** |
| Метеопредупреждения | [OpenWeatherMap One Call 3.0](https://openweathermap.org/api/one-call-3) | **Нужен** |
| Минутный прогноз | [OpenWeatherMap One Call 3.0](https://openweathermap.org/api/one-call-3) | **Нужен** |

## Удалённые ненадёжные данные

В ходе разработки были удалены следующие функции из-за ненадёжности оценок:

- **Трафик** (`estimateTraffic`) — случайная симуляция на основе типа дороги, не отражала реальность
- **Пожарная опасность** (`calculateFireRisk`) — упрощённая эвристика без актуальных данных о пожарах
- **Анализ осадков на дорогах** (`getRoadPrecipAnalysis`) — дублировала данные погоды без добавленной ценности

Эти данные заменены на реальные API-данные от OpenWeatherMap.

## Запуск

Откройте `index.html` в браузере или запустите через любой HTTP-сервер:

```bash
python -m http.server 8000
```

Затем перейдите на [http://localhost:8000](http://localhost:8000).
