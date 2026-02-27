// js/modules/ui/loading.js - Loading indicator and status messages

let loadingSteps = {
    total: 8,
    current: 0,
    steps: [
        'Получение погодных данных',
        'Загрузка METAR',
        'Получение данных о местоположении',
        'Анализ дорожной обстановки',
        'Загрузка исторических данных',
        'Анализ поверхности',
        'Расчёт трафика',
        'Финализация'
    ]
};

export function showLoading() {
    loadingSteps.current = 0;
    const content = document.getElementById('infoContent');
    if (!content) return;

    content.innerHTML = `
        <div class="loading-container">
            <div class="loading-text">[ ИНИЦИАЛИЗАЦИЯ СКАНИРОВАНИЯ ]</div>
            <div class="loading-bar-container">
                <div class="loading-bar" id="loadingBar">
                    <div class="loading-bar-fill" id="loadingBarFill" style="width: 0%"></div>
                </div>
                <div class="loading-percentage" id="loadingPercentage">0%</div>
            </div>
            <div class="loading-step" id="loadingStep">Подготовка...</div>
            <div class="loading-spinner" id="loadingSpinner">⠋</div>
        </div>
    `;

    // Анимация спиннера
    let spinnerIndex = 0;
    const spinnerChars = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

    window.spinnerInterval = setInterval(() => {
        spinnerIndex = (spinnerIndex + 1) % spinnerChars.length;
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) spinner.textContent = spinnerChars[spinnerIndex];
    }, 80);
}

export function updateLoadingProgress(step) {
    loadingSteps.current = Math.min(step, loadingSteps.total);
    const percentage = Math.round((loadingSteps.current / loadingSteps.total) * 100);

    const barFill = document.getElementById('loadingBarFill');
    const percentageEl = document.getElementById('loadingPercentage');
    const stepEl = document.getElementById('loadingStep');

    if (barFill) barFill.style.width = `${percentage}%`;
    if (percentageEl) percentageEl.textContent = `${percentage}%`;
    if (stepEl && loadingSteps.steps[step - 1]) {
        stepEl.textContent = `▶ ${loadingSteps.steps[step - 1]}...`;
    }
}

export function hideLoading() {
    if (window.spinnerInterval) {
        clearInterval(window.spinnerInterval);
        window.spinnerInterval = null;
    }
}

export function showToast(message, duration = 2000) {
    // Удалить старый тост если есть
    const oldToast = document.querySelector('.toast-notification');
    if (oldToast) oldToast.remove();

    // Создать новый
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Показать с анимацией
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Скрыть и удалить
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

export function showError(message) {
    const content = document.getElementById('infoContent');
    if (content) {
        const div = document.createElement('div');
        div.className = 'error';
        // Use textContent to safely set the message without XSS risk
        const header = document.createTextNode('✖ ОШИБКА');
        const br1 = document.createElement('br');
        const br2 = document.createElement('br');
        const text = document.createTextNode(message || 'Неизвестная ошибка');
        div.appendChild(header);
        div.appendChild(br1);
        div.appendChild(br2);
        div.appendChild(text);
        content.innerHTML = '';
        content.appendChild(div);
    }
}
