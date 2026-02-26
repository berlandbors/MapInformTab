// js/modules/api/owm-config.js - OpenWeatherMap configuration and rate limiting

/**
 * OpenWeatherMap API configuration.
 */
export const OWM_CONFIG = {
    baseUrl: 'https://api.openweathermap.org',
    endpoints: {
        currentWeather: '/data/2.5/weather',
        forecast5day:   '/data/2.5/forecast',
        airPollution:   '/data/2.5/air_pollution',
        oneCall:        '/data/3.0/onecall',
        geocoding:      '/geo/1.0/direct',
        reverseGeocode: '/geo/1.0/reverse'
    },
    features: {
        useOneCallAPI:    true,
        oneCallDailyLimit: 900,
        useFallback:      true,
        cacheEnabled:     true,
        cacheDuration:    10 * 60 * 1000   // 10 minutes in ms
    },
    defaults: {
        units: 'metric',
        lang:  'ru'
    }
};

// ---------------------------------------------------------------------------
// One Call API rate limiter (tracks daily usage across page sessions)
// ---------------------------------------------------------------------------

const LIMITER_LS_KEY = 'owm_onecall_limiter';

function _loadState() {
    try {
        const raw = localStorage.getItem(LIMITER_LS_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
}

function _saveState(state) {
    try {
        localStorage.setItem(LIMITER_LS_KEY, JSON.stringify(state));
    } catch (e) { /* ignore */ }
}

function _todayDate() {
    return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function _freshState() {
    return { date: _todayDate(), count: 0 };
}

function _getState() {
    const state = _loadState();
    if (!state || state.date !== _todayDate()) {
        const fresh = _freshState();
        _saveState(fresh);
        return fresh;
    }
    return state;
}

/**
 * One Call API daily rate-limiter.
 */
export const oneCallLimiter = {
    /**
     * Returns true if a One Call API request can be made within the daily limit.
     * @returns {boolean}
     */
    canMakeRequest() {
        const state = _getState();
        return state.count < OWM_CONFIG.features.oneCallDailyLimit;
    },

    /**
     * Records a One Call API request against the daily counter.
     */
    recordRequest() {
        const state = _getState();
        state.count += 1;
        _saveState(state);
    },

    /**
     * Returns the number of remaining One Call API calls today.
     * @returns {number}
     */
    getRemainingCalls() {
        const state = _getState();
        return Math.max(0, OWM_CONFIG.features.oneCallDailyLimit - state.count);
    },

    /**
     * Returns the total number of One Call API calls made today.
     * @returns {number}
     */
    getUsedCalls() {
        return _getState().count;
    }
};
