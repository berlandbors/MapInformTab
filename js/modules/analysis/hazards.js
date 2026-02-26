// js/modules/analysis/hazards.js - Hazard collection

export function collectHazards(fullData) {
    const hazards = [];

    if (fullData.seismicEvents && fullData.seismicEvents.length > 0) {
        const maxMag = Math.max(...fullData.seismicEvents.map(e => parseFloat(e.magnitude) || 0));
        const severity = maxMag >= 6 ? 'critical' : maxMag >= 4 ? 'high' : 'moderate';
        hazards.push({
            id: 'earthquakes', icon: '🌍',
            title: 'Сейсмическая активность', severity,
            value: `M${maxMag.toFixed(1)}`,
            description: `${fullData.seismicEvents.length} событий в радиусе 500 км`,
            layerName: 'earthquakes'
        });
    }

    const temp = typeof fullData.temp === 'number' ? fullData.temp : null;
    if (temp !== null) {
        if (temp >= 40) {
            hazards.push({
                id: 'temp_high', icon: '🌡️', title: 'Экстремальная жара', severity: 'critical',
                value: `${temp}°C`, description: 'Опасность теплового удара, ограничьте пребывание на улице', layerName: null
            });
        } else if (temp >= 35) {
            hazards.push({
                id: 'temp_high', icon: '🌡️', title: 'Сильная жара', severity: 'high',
                value: `${temp}°C`, description: 'Высокий риск теплового стресса', layerName: null
            });
        } else if (temp <= -30) {
            hazards.push({
                id: 'temp_low', icon: '🥶', title: 'Экстремальный мороз', severity: 'critical',
                value: `${temp}°C`, description: 'Опасность обморожения, ограничьте пребывание на улице', layerName: null
            });
        } else if (temp <= -20) {
            hazards.push({
                id: 'temp_low', icon: '🥶', title: 'Сильный мороз', severity: 'high',
                value: `${temp}°C`, description: 'Риск обморожения при длительном пребывании на улице', layerName: null
            });
        }
    }

    const windSpeed = typeof fullData.windSpeed === 'number' ? fullData.windSpeed : null;
    if (windSpeed !== null) {
        if (windSpeed > 25) {
            hazards.push({
                id: 'wind', icon: '💨', title: 'Ураганный ветер', severity: 'critical',
                value: `${windSpeed} м/с`, description: 'Опасен для жизни, возможны разрушения', layerName: null
            });
        } else if (windSpeed > 15) {
            hazards.push({
                id: 'wind', icon: '💨', title: 'Сильный ветер', severity: 'high',
                value: `${windSpeed} м/с`, description: 'Опасность для высокого транспорта', layerName: null
            });
        }
    }

    const visibility = typeof fullData.visibility === 'number' ? fullData.visibility : null;
    const weatherCode = fullData.weatherCode || 0;
    if (visibility !== null && (visibility < 0.5 || weatherCode === 45 || weatherCode === 48)) {
        hazards.push({
            id: 'visibility', icon: '🌫️', title: 'Ограниченная видимость', severity: 'high',
            value: visibility < 1 ? `${Math.round(visibility * 1000)} м` : `${visibility} км`,
            description: 'Опасность при вождении, включите противотуманные фары', layerName: null
        });
    } else if (visibility !== null && visibility < 2) {
        hazards.push({
            id: 'visibility', icon: '🌫️', title: 'Плохая видимость', severity: 'moderate',
            value: `${visibility} км`, description: 'Снизьте скорость, будьте внимательны', layerName: null
        });
    }

    if (fullData.pressureAnalysis && (fullData.pressureAnalysis.level === 'very_low' || fullData.pressureAnalysis.level === 'very_high')) {
        hazards.push({
            id: 'pressure', icon: '🌡️', title: 'Аномальное давление', severity: 'moderate',
            value: `${fullData.pressure} гПа`,
            description: `${fullData.pressureAnalysis.levelName} — ${fullData.pressureAnalysis.healthEffects[0] || ''}`,
            layerName: null
        });
    }

    const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
    hazards.sort((a, b) => (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99));
    return hazards;
}
