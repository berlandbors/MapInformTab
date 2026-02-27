export function initMap(scanLocationFn) {
    const initialZoom = isMobile ? 11 : 12;
    const m = L.map('map', { tap: true }).setView([55.7558, 37.6173], initialZoom);

    // Определяем базовые слои карт
    const baseLayers = {
        "OSM Standard": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }),
        "OSM HOT (Детальный)": L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors, Tiles style by HOT',
            maxZoom: 20
        }),
        "OpenTopoMap": L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors, © OpenTopoMap',
            maxZoom: 17
        })
    };

    // Устанавливаем слой по умолчанию (OSM HOT - наиболее детальный)
    baseLayers["OSM HOT (Детальный)"].addTo(m);

    // Добавляем контроллер переключения слоёв
    L.control.layers(baseLayers).addTo(m);

    setMap(m);

    m.on('click', async function(e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        if (scanLocationFn) await scanLocationFn(lat, lng);
    });

    return m;
}