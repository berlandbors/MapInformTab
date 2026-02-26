// js/modules/analysis/quality.js - Data quality scoring

export function calculateDataQuality(fullData) {
    const checks = [
        { field: 'road', weight: 15, label: 'улица' },
        { field: 'city', weight: 20, label: 'город' },
        { field: 'country', weight: 15, label: 'страна' },
        { field: 'timezone', weight: 10, label: 'часовой пояс' },
        { field: 'temp', weight: 10, label: 'температура' },
        { field: 'roadName', weight: 10, label: 'название дороги' },
        { field: 'objectName', weight: 5, label: 'объект' },
        { field: 'roadType', weight: 5, label: 'тип дороги' },
        { field: 'localTime', weight: 10, label: 'местное время' }
    ];

    let score = 0;
    const missingFields = [];

    checks.forEach(check => {
        const value = fullData[check.field];
        const isValid = value &&
                        value !== 'Н/Д' &&
                        value !== 'Нет данных' &&
                        value !== 'Ошибка загрузки' &&
                        value !== 'Недоступно';

        if (isValid) {
            score += check.weight;
        } else {
            missingFields.push(check.label);
        }
    });

    return {
        score: score,
        grade: score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor',
        missingFields: missingFields,
        stars: Math.round(score / 20)
    };
}

export function getQualityLabel(grade) {
    const labels = {
        'excellent': 'Отлично', 'good': 'Хорошо',
        'fair': 'Удовлетворительно', 'poor': 'Низкое'
    };
    return labels[grade] || 'Неизвестно';
}

export function getQualityColorClass(grade) {
    const classes = {
        'excellent': 'quality-excellent', 'good': 'quality-good',
        'fair': 'quality-fair', 'poor': 'quality-poor'
    };
    return classes[grade] || '';
}
