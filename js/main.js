// js/main.js - Application entry point

// API modules
import { getCurrentWeather as owmCurrentWeather, getOneCallData, get5DayForecast, getAirPollution, getWeatherAlerts, getAirQuality, getMinutelyForecast } from './modules/api/openweather.js';
import { getWeatherDataMultiPoint } from './modules/api/openmeteo.js';
import { getLocationData } from './modules/api/nominatim.js';
import { getRoadData, getPedestrianData } from './modules/api/overpass.js';
import { getSeismicData } from './modules/api/usgs.js';
import { getMETARData, mergeWeatherData } from './modules/api/metar.js';
import { getTimezoneData } from './modules/api/worldtime.js';

// Analysis modules
import { analyzeSurfaceWithProbability, buildSurfaceCondition } from './modules/analysis/surface.js';
import { estimateTrafficWithInduction } from './modules/analysis/traffic.js';
import { applyMLCorrections, calculateConfidenceLevels, saveWeatherHistory } from './modules/analysis/weather.js';
import { analyzePressure } from './modules/analysis/pressure.js';
import { collectHazards } from './modules/analysis/hazards.js';
import { calculateDataQuality } from './modules/analysis/quality.js';

// UI modules
import { initMap, createMarker, clearMarkers, getCurrentLocation, updateTimestamp, updateAllMarkerTimes } from './modules/ui/map.js';
import { LoadingIndicator, showError } from './modules/ui/loading.js';
import { displayFullInfo, openModal, closeModal, openModalById, showDetailedSurfaceModal, closeSurfaceDetailModal, openPressureDetailModal, closePressureDetailModal } from './modules/ui/modal.js';
import { initSearch } from './modules/ui/search.js';
import { initLayers, updateLayersForLocation, toggleLayer, focusOnLayer } from './modules/ui/layers.js';
import { shareLocation, closeShareModal, copyShareLink, handleSharedLocation, showNotification } from './modules/ui/share.js';

// Utility modules
import { getAstronomyData } from './modules/utils/astronomy.js';
import { getLocalWeatherAlerts } from './modules/utils/formatters.js';
import { sleep, getDeviceType } from './modules/utils/helpers.js';

// State imports
import {
    map, markers, markerCount, lastScannedCoords, currentMarkerData,
    isMobile, deviceType, activeMobileTab,
    setMap, setLastScannedCoords, setCurrentMarkerData, setDeviceType,
    setActiveMobileTab, incrementMarkerCount, decrementMarkerCount
} from './state.js';

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 MapInformTab загружается...');

    initMap(scanLocation);
    initSearch(scanLocation);
    initLayers();

    const isCollapsed = localStorage.getItem('layersPanelCollapsed') === 'true';
    if (isCollapsed) {
        document.getElementById('layersPanel')?.classList.add('collapsed');
    }

    console.log('✅ Приложение готово!');

    handleSharedLocation(scanLocation);
    initMobileMode();
    updateTimestamp();
    setInterval(updateTimestamp, 1000);
    setInterval(updateAllMarkerTimes, 1000);

    setupMobileEventListeners();
    setupNotificationStyles();

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
            closeShareModal();
        }
    });
});

// Main scan function
async function scanLocation(lat, lng, isRescan = false) {
    incrementMarkerCount();
    setLastScannedCoords({ lat, lng });

    const loader = new LoadingIndicator();
    loader.show();

    try {
        // 1. Multi-point weather data (Open-Meteo as base)
        console.group('🌐 Open-Meteo многоточечный анализ');
        const omStart = performance.now();
        let weatherData = await getWeatherDataMultiPoint(lat, lng);
        console.log(`📊 Open-Meteo завершён за ${Math.round(performance.now() - omStart)}мс`);
        console.groupEnd();

        // 2. OpenWeatherMap data
        console.group('🌤️ OpenWeatherMap API запросы');
        const owmStart = performance.now();
        const [owmCurrent, owmOnecall, owmForecast, owmAirPollution] = await Promise.all([
            owmCurrentWeather(lat, lng).catch(err => {
                console.error('❌ owmCurrentWeather не удалось:', err.message);
                return null;
            }),
            getOneCallData(lat, lng).catch(err => {
                console.error('❌ getOneCallData не удалось:', err.message);
                return null;
            }),
            get5DayForecast(lat, lng).catch(err => {
                console.error('❌ get5DayForecast не удалось:', err.message);
                return null;
            }),
            getAirPollution(lat, lng).catch(err => {
                console.error('❌ getAirPollution не удалось:', err.message);
                return null;
            })
        ]);
        const owmElapsed = Math.round(performance.now() - owmStart);
        console.log(`📊 OpenWeatherMap результаты (${owmElapsed}мс):`, {
            current: !!owmCurrent,
            onecall: !!owmOnecall,
            forecast: !!owmForecast,
            airPollution: !!owmAirPollution
        });
        console.groupEnd();

        if (!owmCurrent) {
            console.warn('⚠️ OpenWeatherMap недоступен, используются только данные Open-Meteo');
        }

        if (owmCurrent) {
            weatherData = {
                ...weatherData,
                temp: Math.round(owmCurrent.temp),
                feelsLike: Math.round(owmCurrent.feelsLike),
                humidity: owmCurrent.humidity,
                windSpeed: owmCurrent.windSpeed,
                pressure: owmCurrent.pressure,
                cloudCover: owmCurrent.cloudCover,
                rain1h: owmCurrent.rain1h,
                rain3h: owmCurrent.rain3h,
                snow1h: owmCurrent.snow1h,
                snow3h: owmCurrent.snow3h,
                sunrise: owmCurrent.sunrise,
                sunset: owmCurrent.sunset,
                weatherDescription: owmCurrent.weatherDescription,
                owmWeatherCode: owmCurrent.weatherCode
            };
        }

        // 3. METAR data
        const metarData = await getMETARData(lat, lng);
        weatherData = mergeWeatherData(weatherData, metarData);

        // 4. Other data sources in parallel
        console.group('📡 Параллельные API запросы');
        const parallelStart = performance.now();
        const [locationData, roadData, pedestrianData, seismicData, timezoneData, weatherAlertsData, minutelyData] = await Promise.all([
            getLocationData(lat, lng).catch(err => {
                console.error('❌ getLocationData не удалось:', err.message);
                return { road: 'Н/Д', city: 'Н/Д', country: 'Н/Д', district: 'Н/Д', state: 'Н/Д', displayName: 'Н/Д', postcode: null, houseNumber: null, objectType: null, objectName: null };
            }),
            getRoadData(lat, lng).catch(err => {
                console.error('❌ getRoadData не удалось:', err.message);
                return { roadName: null, roadType: 'Н/Д', maxSpeed: null, roadSurface: 'Н/Д', lanes: null };
            }),
            getPedestrianData(lat, lng).catch(err => {
                console.error('❌ getPedestrianData не удалось:', err.message);
                return { hasPedestrianArea: false, pedestrianType: 'Н/Д', pedestrianName: null, pedestrianSurface: 'Н/Д', pedestrianWidth: null, isLit: false, allSurfaces: [] };
            }),
            getSeismicData(lat, lng).catch(err => {
                console.error('❌ getSeismicData не удалось:', err.message);
                return { seismicEvents: [] };
            }),
            getTimezoneData(lat, lng).catch(err => {
                console.error('❌ getTimezoneData не удалось:', err.message);
                return { timezone: 'Н/Д', utcOffset: 'Н/Д', isDST: false, usesDST: false, winterOffset: null, summerOffset: null, currentSeason: 'winter', dstStart: null };
            }),
            getWeatherAlerts(lat, lng).catch(err => {
                console.error('❌ getWeatherAlerts не удалось:', err.message);
                return { weatherAlerts: [] };
            }),
            getMinutelyForecast(lat, lng).catch(err => {
                console.error('❌ getMinutelyForecast не удалось:', err.message);
                return { minutelyForecast: [] };
            })
        ]);
        console.log(`📊 Параллельные запросы завершены за ${Math.round(performance.now() - parallelStart)}мс`);
        console.groupEnd();

        const airQualityData = owmAirPollution ? {
            aqi: owmAirPollution.aqi,
            aqiText: owmAirPollution.aqiText,
            pm25: owmAirPollution.pm2_5,
            pm10: owmAirPollution.pm10,
            co: owmAirPollution.co,
            no2: owmAirPollution.no2,
            o3: owmAirPollution.o3,
            so2: owmAirPollution.so2
        } : null;

        loader.updateProgress('weather', 'success');
        loader.updateProgress('location', 'success');
        loader.updateProgress('roads', 'success');

        // 5. ML corrections
        weatherData = applyMLCorrections(weatherData, locationData, timezoneData);

        // 6. Confidence levels
        const confidence = calculateConfidenceLevels(weatherData, weatherData.accuracy, metarData);

        // 7. Save history
        saveWeatherHistory(weatherData);

        // 8. Surface analysis
        const surfaceAnalysis = analyzeSurfaceWithProbability(weatherData, roadData, locationData);
        const surfaceCondition = buildSurfaceCondition(weatherData, roadData, owmOnecall);
        loader.updateProgress('surface', 'success');

        // 9. Traffic analysis
        const trafficAnalysis = estimateTrafficWithInduction(roadData, weatherData, locationData, new Date());
        loader.updateProgress('traffic', 'success');

        loader.updateProgress('airquality', airQualityData ? 'success' : 'error');
        loader.updateProgress('alerts', weatherAlertsData ? 'success' : 'error');

        const astronomyData = getAstronomyData(lat, lng, weatherData.timezone);
        const alertsData = getLocalWeatherAlerts(weatherData.weatherCode, weatherData.precipProbability);

        const currentMarkerCount = markerCount;

        const fullData = {
            ...weatherData,
            ...locationData,
            ...roadData,
            ...pedestrianData,
            ...seismicData,
            ...astronomyData,
            ...alertsData,
            ...timezoneData,
            ...(airQualityData || {}),
            ...(weatherAlertsData || {}),
            ...minutelyData,
            owmCurrent,
            owmOnecall,
            owmForecast,
            minutelyForecast: owmOnecall?.minutely || [],
            hourlyForecast: owmOnecall?.hourly || [],
            dailyForecast: owmOnecall?.daily || [],
            weatherAlerts: [...(owmOnecall?.alerts || []), ...(weatherAlertsData?.weatherAlerts || [])],
            confidence,
            metarData,
            surfaceAnalysis,
            surfaceCondition,
            trafficAnalysis,
            id: currentMarkerCount,
            scanTime: new Date().toLocaleString('ru-RU')
        };

        // Quality assessment
        fullData.quality = calculateDataQuality(fullData);

        // Pressure analysis
        fullData.pressureAnalysis = analyzePressure(fullData.pressure);

        // Hazards
        fullData.hazards = collectHazards(fullData);
        if (fullData.hazards.length > 0) {
            console.log(`⚠️ Обнаружено опасностей: ${fullData.hazards.length}`);
        }

        // Auto-rescan on low quality
        if (fullData.quality.score < 50 && !isRescan) {
            console.log('⚠️ Низкое качество данных, автоматическое пересканирование...');
            decrementMarkerCount();
            loader.hide();
            await sleep(1500);
            return scanLocation(lat, lng, true);
        }

        createMarker(lat, lng, fullData);
        loader.hide();
        displayFullInfo(fullData);
        updateLayersForLocation(lat, lng, fullData);

        const shareBtn = document.getElementById('shareBtn');
        if (shareBtn) shareBtn.disabled = false;

        if (deviceType === 'smartphone-portrait') {
            switchMobileTab('info');
        }

    } catch (error) {
        console.error('Ошибка сканирования:', error);
        loader.hide();
        showError(`Ошибка загрузки данных: ${error.message || 'Попробуйте другую точку.'}`);
    }
}

// Mobile mode
function initMobileMode() {
    setDeviceType(getDeviceType());

    if (deviceType === 'smartphone-portrait') {
        showMobileInterface();
        checkAndShowNotification();

        const savedTab = localStorage.getItem('mobile_active_tab');
        if (savedTab) {
            setActiveMobileTab(savedTab);
            switchMobileTab(savedTab);
        }
    } else {
        hideMobileInterface();
    }
}

function showMobileInterface() {
    const switcher = document.getElementById('mobileTabSwitcher');
    if (switcher) switcher.style.display = 'flex';
}

function hideMobileInterface() {
    const switcher = document.getElementById('mobileTabSwitcher');
    const notification = document.getElementById('mobileNotification');
    if (switcher) switcher.style.display = 'none';
    if (notification) notification.style.display = 'none';
    const mapEl = document.getElementById('map');
    const infoPanel = document.getElementById('info-panel');
    if (mapEl) mapEl.classList.remove('hidden');
    if (infoPanel) infoPanel.classList.remove('active');
}

function checkAndShowNotification() {
    const dismissed = localStorage.getItem('mobile_notification_dismissed');
    if (!dismissed) {
        const notification = document.getElementById('mobileNotification');
        if (notification) notification.style.display = 'flex';
    }
}

function switchMobileTab(tab) {
    setActiveMobileTab(tab);
    localStorage.setItem('mobile_active_tab', tab);

    const mapEl = document.getElementById('map');
    const infoPanel = document.getElementById('info-panel');
    const tabMap = document.getElementById('tabMap');
    const tabInfo = document.getElementById('tabInfo');

    if (tab === 'map') {
        mapEl?.classList.remove('hidden');
        infoPanel?.classList.remove('active');
        tabMap?.classList.add('active');
        tabInfo?.classList.remove('active');
    } else {
        mapEl?.classList.add('hidden');
        infoPanel?.classList.add('active');
        tabMap?.classList.remove('active');
        tabInfo?.classList.add('active');
    }

    if (tab === 'map' && map) {
        setTimeout(() => { map.invalidateSize(); }, 300);
    }
}

function setupMobileEventListeners() {
    const tabMap = document.getElementById('tabMap');
    const tabInfo = document.getElementById('tabInfo');

    if (tabMap) tabMap.addEventListener('click', () => switchMobileTab('map'));
    if (tabInfo) tabInfo.addEventListener('click', () => switchMobileTab('info'));

    const closeBtn = document.getElementById('closeNotification');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            const dontShow = document.getElementById('dontShowAgain');
            if (dontShow && dontShow.checked) {
                localStorage.setItem('mobile_notification_dismissed', 'true');
            }
            const notification = document.getElementById('mobileNotification');
            if (notification) notification.style.display = 'none';
        });
    }

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const newDeviceType = getDeviceType();
            if (newDeviceType !== deviceType) {
                setDeviceType(newDeviceType);
                initMobileMode();
            }
        }, 200);
    });

    window.addEventListener('orientationchange', () => {
        setTimeout(() => { initMobileMode(); }, 200);
    });
}

function setupNotificationStyles() {
    const notificationStyles = document.createElement('style');
    notificationStyles.textContent = `
.share-notification {
    position: fixed; top: 80px; right: 20px; z-index: 10000;
    background: linear-gradient(135deg, #001a00 0%, #003300 100%);
    border: 2px solid #00ff00; border-radius: 8px; padding: 20px;
    color: #00ff00; font-family: 'Courier New', monospace; font-size: 14px;
    box-shadow: 0 0 30px rgba(0, 255, 0, 0.5);
    transform: translateX(400px); opacity: 0;
    transition: all 0.3s ease; max-width: 300px; text-align: center;
}
.share-notification.show { transform: translateX(0); opacity: 1; }
@media (max-width: 768px) {
    .share-notification { right: 10px; left: 10px; max-width: none; top: 70px; }
}`;
    document.head.appendChild(notificationStyles);
}

// Expose functions to window for HTML onclick handlers
window.scanLocation = scanLocation;
window.clearMarkers = () => clearMarkers();
window.getCurrentLocation = () => getCurrentLocation(scanLocation);
window.openModalById = (index) => openModalById(index);
window.closeModal = closeModal;
window.openModal = openModal;
window.showDetailedSurfaceModal = showDetailedSurfaceModal;
window.closeSurfaceDetailModal = closeSurfaceDetailModal;
window.openPressureDetailModal = openPressureDetailModal;
window.closePressureDetailModal = closePressureDetailModal;
window.switchMobileTab = switchMobileTab;
window.shareLocation = shareLocation;
window.closeShareModal = closeShareModal;
window.copyShareLink = copyShareLink;
window.focusOnLayer = focusOnLayer;
window.toggleLayer = toggleLayer;
window.toggleLayersPanel = function() {
    const panel = document.getElementById('layersPanel');
    if (panel) {
        panel.classList.toggle('collapsed');
        localStorage.setItem('layersPanelCollapsed', panel.classList.contains('collapsed'));
    }
};
window.rescanCurrentLocation = function() {
    if (lastScannedCoords) {
        scanLocation(lastScannedCoords.lat, lastScannedCoords.lng, true);
    }
};
