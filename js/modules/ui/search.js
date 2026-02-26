// js/modules/ui/search.js - Location search

import { escapeHtml } from '../utils/helpers.js';
import { searchTimeout, setSearchTimeout } from '../../state.js';
import { map } from '../../state.js';

async function searchLocation(query, scanLocationFn) {
    if (!query || query.length < 2) {
        clearSearchResults();
        return;
    }
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`;
        const response = await fetch(url, { headers: { 'Accept-Language': 'ru', 'User-Agent': 'MapInformTab/1.0' } });
        const results = await response.json();
        displaySearchResults(results, scanLocationFn);
    } catch (error) {
        console.error('Ошибка поиска:', error);
        clearSearchResults();
    }
}

function displaySearchResults(results, scanLocationFn) {
    const container = document.getElementById('searchResults');
    if (!container) return;
    if (!results || results.length === 0) {
        container.innerHTML = '<div class="search-result-item">Ничего не найдено</div>';
        container.style.display = 'block';
        return;
    }
    container.innerHTML = results.map(r => {
        const safe = escapeHtml(r.display_name);
        return `<div class="search-result-item" data-lat="${parseFloat(r.lat)}" data-lng="${parseFloat(r.lon)}" data-name="${safe}">
            ${safe}
        </div>`;
    }).join('');
    container.style.display = 'block';

    // Attach click handlers (safer than inline onclick with user data)
    container.querySelectorAll('.search-result-item[data-lat]').forEach(el => {
        el.addEventListener('click', () => {
            const lat = parseFloat(el.dataset.lat);
            const lng = parseFloat(el.dataset.lng);
            selectSearchResult(lat, lng, el, scanLocationFn);
        });
    });
}

export function clearSearchResults() {
    const container = document.getElementById('searchResults');
    if (container) {
        container.innerHTML = '';
        container.style.display = 'none';
    }
}

async function selectSearchResult(lat, lng, el, scanLocationFn) {
    const escapedName = el.getAttribute('data-name');
    clearSearchResults();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = escapedName;
    const input = document.getElementById('searchInput');
    if (input) input.value = tempDiv.textContent;
    if (map) map.setView([lat, lng], 14);
    if (scanLocationFn) await scanLocationFn(lat, lng);
}

export function initSearch(scanLocationFn) {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    searchInput.addEventListener('input', function() {
        const query = this.value.trim();
        clearTimeout(searchTimeout);
        setSearchTimeout(setTimeout(() => searchLocation(query, scanLocationFn), 500));
    });

    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            clearSearchResults();
            this.value = '';
        }
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.search-container')) {
            clearSearchResults();
        }
    });
}
