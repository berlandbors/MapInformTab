// js/modules/ui/share.js - Location sharing functionality

import { lastScannedCoords, currentMarkerData, map } from '../../state.js';

export function encodeLocationData(lat, lng, data) {
    const locationData = {
        lat: lat.toFixed(6),
        lng: lng.toFixed(6),
        timestamp: new Date().toISOString(),
        data: data ? {
            address: data.address || '',
            city: data.city || '',
            country: data.country || '',
            temp: data.temp || '',
            weather: data.weather || '',
            timezone: data.timezone || ''
        } : null
    };
    return btoa(encodeURIComponent(JSON.stringify(locationData)));
}

export function decodeLocationData(encodedData) {
    try {
        const decoded = decodeURIComponent(atob(encodedData));
        return JSON.parse(decoded);
    } catch (e) {
        console.error('Ошибка декодирования данных:', e);
        return null;
    }
}

export function shareLocation() {
    if (!lastScannedCoords) {
        alert('❌ Сначала выберите точку на карте!');
        return;
    }

    const { lat, lng } = lastScannedCoords;
    const encodedData = encodeLocationData(lat, lng, currentMarkerData);
    const shareUrl = `${window.location.origin}${window.location.pathname}?share=${encodedData}`;

    document.getElementById('shareCoords').innerHTML = `
        <strong>📍 КООРДИНАТЫ:</strong><br>
        Широта: ${lat.toFixed(6)}° | Долгота: ${lng.toFixed(6)}
    `;

    document.getElementById('shareLinkInput').value = shareUrl;
    generateQRCode(shareUrl);
    document.getElementById('shareModal').classList.add('active');
}

export function closeShareModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('shareModal').classList.remove('active');
}

export function copyShareLink() {
    const input = document.getElementById('shareLinkInput');
    const btn = document.querySelector('.share-copy-btn');
    const btnText = document.getElementById('copyBtnText');

    input.select();
    input.setSelectionRange(0, 99999);

    navigator.clipboard.writeText(input.value).then(() => {
        if (btnText) btnText.textContent = '✅ СКОПИРОВАНО!';
        if (btn) btn.classList.add('copied');
        setTimeout(() => {
            if (btnText) btnText.textContent = '📋 КОПИРОВАТЬ';
            if (btn) btn.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Ошибка копирования:', err);
        alert('❌ Не удалось скопировать ссылку');
    });
}

export function generateQRCode(url) {
    const qrContainer = document.getElementById('shareQR');
    if (!qrContainer) return;

    qrContainer.innerHTML = '<div class="share-qr-placeholder">🔲 QR-код будет здесь<br><small>Подключите библиотеку QRCode.js для отображения</small></div>';

    if (typeof QRCode !== 'undefined') {
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: url, width: 200, height: 200,
            colorDark: '#00ff00', colorLight: '#000000',
            correctLevel: QRCode.CorrectLevel.H
        });
    }
}

export function handleSharedLocation(scanLocationFn) {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedData = urlParams.get('share');
    if (!sharedData) return;

    const locationData = decodeLocationData(sharedData);
    if (!locationData) {
        alert('❌ Неверная ссылка для шаринга');
        return;
    }

    const lat = parseFloat(locationData.lat);
    const lng = parseFloat(locationData.lng);

    if (map) map.setView([lat, lng], 15);

    setTimeout(() => {
        if (scanLocationFn) scanLocationFn(lat, lng);
    }, 500);

    showNotification(`
        📍 Загружена shared-локация<br>
        <small>${locationData.data?.city || 'Неизвестный город'}</small><br>
        <small>Поделились: ${new Date(locationData.timestamp).toLocaleString('ru-RU')}</small>
    `);
}

export function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'share-notification';
    notification.innerHTML = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 100);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}
