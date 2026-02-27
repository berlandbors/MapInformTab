// js/modules/ui/status-panel.js - API status panel UI

const CONTAINER_ID = 'apiStatusContainer';

/**
 * Updates the API status panel in the DOM.
 */
export function updateAPIStatus() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;
    container.innerHTML = '';
}

/**
 * Starts the API status panel auto-update interval.
 * @returns {number} The interval ID (can be passed to clearInterval to stop).
 */
export function startStatusPanel() {
    updateAPIStatus();
    return setInterval(updateAPIStatus, 10000);
}

// Auto-start when module is loaded
startStatusPanel();
