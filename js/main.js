// js/main.js - Application entry point

// API modules
import { getWeatherDataMultiPoint } from './modules/api/openmeteo.js';
import { getHistoricalPrecipitation, getHistoricalWetness } from './modules/api/openmeteo-historical.js';
import { getAirQuality } from './modules/api/openmeteo-airquality.js';
import { formatHourlyForecast, formatDailyForecast } from './modules/api/openmeteo-forecast.js';
import { getElevationAndSlope } from './modules/api/elevation.js';
import { getLocationData } from './modules/api/nominatim.js';
import { getRoadData, getPedestrianData, getShadingData, getCoverageData } from './modules/api/overpass.js';
import { getSeismicData } from './modules/api/usgs.js';
import { getMETARData, mergeWeatherData } from './modules/api/metar.js';
import { getTimezoneData } from './modules/api/worldtime.js';

// Analysis modules
import { analyzeSurfaceWithProbability, buildSurfaceCondition } from './modules/analysis/surface.js';
import { estimateTrafficWithInduction } from './modules/analysis/traffic.js';
import { calculateDrainage } from './modules/analysis/drainage.js';
import { calculateShading } from './modules/analysis/shading.js';
import { applyMLCorrections, calculateConfidenceLevels, saveWeatherHistory } from './modules/analysis/weather.js';
import { analyzePressure } from './modules/analysis/pressure.js';
import { collectHazards } from './modules/analysis/hazards.js';
import { calculateDataQuality } from './modules/analysis/quality.js';

// UI modules
import { initMap, createMarker, clearMarkers, getCurrentLocation, updateTimestamp, updateAllMarkerTimes } from './modules/ui/map.js';
import { showLoading, showError, showToast } from './modules/ui/loading.js';
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
    showLoading();

    if (deviceType === 'smartphone-portrait') {
        showToast('📍 Загрузка данных...', 2000);
    }

    try {
        // 1. Multi-point weather data (Open-Meteo as base)
        let weatherData = await getWeatherDataMultiPoint(lat, lng);

        // Format hourly and daily forecasts from weather data
        const hourlyForecast = formatHourlyForecast(weatherData.hourly);
        const dailyForecast = formatDailyForecast(weatherData.daily);

        // 2. METAR data
        const metarData = await getMETARData(lat, lng);
        weatherData = mergeWeatherData(weatherData, metarData);

        // 3. Other data sources in parallel
        const [locationData, roadData, pedestrianData, seismicData, timezoneData] = await Promise.all([
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
            })
        ]);

        // 5. ML corrections
        weatherData = applyMLCorrections(weatherData, locationData, timezoneData);

        // 6. Confidence levels
        const confidence = calculateConfidenceLevels(weatherData, weatherData.accuracy, metarData);

        // 7. Save history
        saveWeatherHistory(weatherData);

        // 8. Real-data enrichment (parallel, with graceful degradation)
        const [historicalPrecip, historicalWetness, elevationData, shadingRaw, hasRoof, airQualityData] = await Promise.all([
            getHistoricalPrecipitation(lat, lng).catch(() => null),
            getHistoricalWetness(lat, lng).catch(() => null),
            getElevationAndSlope(lat, lng).catch(() => null),
            getShadingData(lat, lng).catch(() => null),
            getCoverageData(lat, lng).catch(() => false),
            getAirQuality(lat, lng).catch(() => null)
        ]);

        // Compute dynamic drainage using real data
        const shadingResult = calculateShading(shadingRaw, weatherData.cloudCover);
        const realDrainage = calculateDrainage({
            surfaceType: roadData.roadSurfaceRaw || 'asphalt',
            slope: elevationData?.slope ?? 5,
            precip24h: historicalPrecip?.last24h ?? (weatherData.precipitation || 0) * 24,
            terrainType: roadData.roadType || ''
        });

        // Compile real data object for analysis functions
        const realData = {
            precipitation: historicalPrecip,
            slope: elevationData?.slope ?? null,
            drainage: realDrainage,
            shading: shadingResult,
            hasRoof,
            historicalWetness,
            elevationM: elevationData?.elevation ?? null
        };

        // 9. Surface analysis
        const surfaceAnalysis = analyzeSurfaceWithProbability(
            weatherData,
            roadData,
            {
                last24h: historicalPrecip?.last24h || 0,
                soilSaturation: historicalWetness?.soilSaturation || 'normal'
            }
        );

        // Добавить histData в surfaceAnalysis для передачи в buildSurfaceCondition
        surfaceAnalysis.histData = {
            last1h: historicalPrecip?.last1h || 0,
            last3h: historicalPrecip?.last3h || 0,
            last6h: historicalPrecip?.last6h || 0,
            last24h: historicalPrecip?.last24h || 0,
            hourlyData: historicalPrecip?.hourlyData || null
        };

        const surfaceCondition = buildSurfaceCondition(weatherData, roadData, surfaceAnalysis);

        // 10. Traffic analysis
        const trafficAnalysis = estimateTrafficWithInduction(roadData, weatherData, locationData, new Date(), null);

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
            confidence,
            metarData,
            surfaceAnalysis,
            surfaceCondition,
            trafficAnalysis,
            realData,
            hourlyForecast,
            dailyForecast,
            airQualityData,
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
            await sleep(1500);
            return scanLocation(lat, lng, true);
        }

        createMarker(lat, lng, fullData);

        if (deviceType === 'smartphone-portrait') {
            showToast('✅ Данные загружены!', 1500);
        }

        displayFullInfo(fullData);
        updateLayersForLocation(lat, lng, fullData);

        const shareBtn = document.getElementById('shareBtn');
        if (shareBtn) shareBtn.disabled = false;

        if (deviceType === 'smartphone-portrait') {
            switchMobileTab('info');
        }

    } catch (error) {
        console.error('Ошибка сканирования:', error);
        showError(`Ошибка загрузки данных: ${error.message || 'Попробуйте другую точку.'}`);

        if (deviceType === 'smartphone-portrait') {
            showToast('❌ Ошибка загрузки', 2000);
        }
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
