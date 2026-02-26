// js/modules/ui/status-panel.js - API status panel UI

import { getOWMStatus } from '../api/openweathermap.js';

const CONTAINER_ID = 'apiStatusContainer';

/**
 * Updates the API status panel in the DOM.
 */
export function updateAPIStatus() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    const status = getOWMStatus();
    const remainingColor = status.oneCallRemaining > 100 ? 'status-good' : 'status-warning';

    container.innerHTML = `
        <div class="api-status-panel">
            <div class="status-item">
                <span class="status-label">One Call API:</span>
                <span class="status-value ${status.oneCallEnabled ? 'status-active' : 'status-disabled'}">
                    ${status.oneCallEnabled ? 'Включён' : 'Отключён'}
                </span>
            </div>
            ${status.oneCallEnabled ? `
            <div class="status-item">
                <span class="status-label">Осталось запросов:</span>
                <span class="status-value ${remainingColor}">
                    ${status.oneCallRemaining} / ${status.oneCallLimit}
                </span>
            </div>
            ` : ''}
            <div class="status-item">
                <span class="status-label">Кэш:</span>
                <span class="status-value ${status.cacheEnabled ? 'status-active' : 'status-disabled'}">
                    ${status.cacheEnabled ? 'Включён' : 'Отключён'}
                </span>
            </div>
        </div>
    `;
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
