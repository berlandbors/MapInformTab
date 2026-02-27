// js/modules/ui/search.js - Location search

import { escapeHtml } from '../utils/helpers.js';
import { searchTimeout, setSearchTimeout } from '../../state.js';
import { map } from '../../state.js';
import { formatImportance } from '../api/nominatim.js';

async function searchLocation(query, scanLocationFn) {
    if (!query || query.length < 2) {
        clearSearchResults();
        return;
    }
    try {
        // ОБНОВЛЁННЫЙ URL с дополнительными параметрами
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=10&dedupe=1&extratags=1`;
        const response = await fetch(url, {
            headers: {
                'Accept-Language': 'ru',
                'User-Agent': 'MapInformTab/2.0'
            }
        });
        const results = await response.json();

        // НОВОЕ: Сортировка по важности
        const sortedResults = results.sort((a, b) => (b.importance || 0) - (a.importance || 0));

        displaySearchResults(sortedResults, scanLocationFn);
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

    // НОВОЕ: Улучшенное отображение с иконками и важностью
    container.innerHTML = results.map(r => {
        const safe = escapeHtml(r.display_name);
        const importance = formatImportance(r.importance || 0);
        const typeIcon = getTypeIcon(r.type, r.class);

        return `<div class="search-result-item" data-lat="${parseFloat(r.lat)}" data-lng="${parseFloat(r.lon)}" data-name="${safe}" data-importance="${r.importance || 0}">
            <span class="search-result-icon">${typeIcon}</span>
            <div class="search-result-content">
                <div class="search-result-name">${safe}</div>
                <div class="search-result-meta">
                    <span class="search-result-type">${getTypeLabel(r.type, r.class)}</span>
                    <span class="search-result-importance">${importance.icon} ${importance.label}</span>
                </div>
            </div>
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

// НОВАЯ ФУНКЦИЯ: Иконки для типов объектов
function getTypeIcon(type, className) {
    const icons = {
        'city': '🏙️',
        'town': '🏘️',
        'village': '🏡',
        'building': '🏢',
        'residential': '🏠',
        'commercial': '🏪',
        'park': '🌳',
        'natural': '🌲',
        'water': '💧',
        'lake': '🌊',
        'river': '〰️',
        'road': '🛣️',
        'highway': '🛣️',
        'railway': '🚂',
        'airport': '✈️',
        'station': '🚉',
        'restaurant': '🍽️',
        'cafe': '☕',
        'school': '🏫',
        'hospital': '🏥',
        'pharmacy': '💊',
        'bank': '🏦',
        'shop': '🛒',
        'mall': '🏬',
        'hotel': '🏨',
        'museum': '🏛️',
        'theatre': '🎭',
        'cinema': '🎬',
        'stadium': '🏟️',
        'beach': '🏖️'
    };

    return icons[type] || icons[className] || '📍';
}

// НОВАЯ ФУНКЦИЯ: Читаемые названия типов
function getTypeLabel(type, className) {
    const labels = {
        'city': 'Город',
        'town': 'Город',
        'village': 'Деревня',
        'building': 'Здание',
        'residential': 'Жилой район',
        'commercial': 'Коммерческая зона',
        'park': 'Парк',
        'natural': 'Природная зона',
        'water': 'Водоём',
        'lake': 'Озеро',
        'river': 'Река',
        'road': 'Дорога',
        'highway': 'Шоссе',
        'railway': 'Железная дорога',
        'airport': 'Аэропорт',
        'station': 'Станция',
        'restaurant': 'Ресторан',
        'cafe': 'Кафе',
        'school': 'Школа',
        'hospital': 'Больница',
        'pharmacy': 'Аптека',
        'bank': 'Банк',
        'shop': 'Магазин',
        'mall': 'Торговый центр',
        'hotel': 'Отель',
        'museum': 'Музей'
    };

    return labels[type] || labels[className] || 'Место';
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
