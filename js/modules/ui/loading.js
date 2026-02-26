// js/modules/ui/loading.js - Loading indicator and status messages

export class LoadingIndicator {
    constructor() {
        this.overlay = null;
        this.progressFill = null;
        this.progressText = null;
        this.etaEl = null;
        this.steps = [
            { id: 'weather',    label: '🌡️ Погодные данные' },
            { id: 'location',   label: '📍 Геолокация' },
            { id: 'roads',      label: '🚗 Дорожные данные' },
            { id: 'surface',    label: '🌧️ Анализ поверхности' },
            { id: 'traffic',    label: '🚦 Оценка трафика' },
            { id: 'airquality', label: '🌫️ Качество воздуха' },
            { id: 'alerts',     label: '🚨 Метеоалерты' }
        ];
        this.completedCount = 0;
    }

    _createOverlay() {
        const div = document.createElement('div');
        div.className = 'li-overlay';
        div.innerHTML = `
            <div class="li-container">
                <div class="li-title">🔄 ЗАГРУЗКА ДАННЫХ...</div>
                <div class="li-progress">
                    <div class="li-bar"><div class="li-fill"></div></div>
                    <div class="li-pct">0%</div>
                </div>
                <div class="li-steps">
                    ${this.steps.map(s => `
                    <div class="li-step" data-step="${s.id}">
                        <span class="li-step-icon">⏳</span>
                        <span class="li-step-label">${s.label}</span>
                    </div>`).join('')}
                </div>
                <div class="li-eta">Примерное время: <span class="li-eta-val">~5 сек</span></div>
            </div>
        `;
        return div;
    }

    show() {
        this.overlay = this._createOverlay();
        document.body.appendChild(this.overlay);
        requestAnimationFrame(() => this.overlay.classList.add('li-visible'));
        this.progressFill = this.overlay.querySelector('.li-fill');
        this.progressText = this.overlay.querySelector('.li-pct');
        this.etaEl = this.overlay.querySelector('.li-eta-val');
    }

    updateProgress(stepId, status) {
        if (!this.overlay) return;
        const stepEl = this.overlay.querySelector(`.li-step[data-step="${stepId}"]`);
        if (stepEl) {
            const iconEl = stepEl.querySelector('.li-step-icon');
            iconEl.textContent = status === 'success' ? '✓' : '✗';
            stepEl.classList.add(status === 'success' ? 'li-step-done' : 'li-step-error');
        }
        this.completedCount++;
        const pct = Math.round((this.completedCount / this.steps.length) * 100);
        if (this.progressFill) this.progressFill.style.width = pct + '%';
        if (this.progressText) this.progressText.textContent = pct + '%';
        const remaining = this.steps.length - this.completedCount;
        if (this.etaEl) this.etaEl.textContent = remaining > 0 ? `~${remaining} сек` : 'Готово';
    }

    hide() {
        if (!this.overlay) return;
        this.overlay.classList.remove('li-visible');
        setTimeout(() => {
            if (this.overlay && this.overlay.parentNode) {
                this.overlay.parentNode.removeChild(this.overlay);
            }
            this.overlay = null;
        }, 400);
    }
}

export function showLoading() {
    const content = document.getElementById('infoContent');
    if (content) {
        content.innerHTML = `
            <div class="loading">
                ⟳ СКАНИРОВАНИЕ...<br><br>
                Загрузка данных
            </div>
            <div class="loading-bar">
                <div class="loading-bar-fill"></div>
            </div>
        `;
    }
}

export function showError(message) {
    const content = document.getElementById('infoContent');
    if (content) {
        content.innerHTML = `
            <div class="error">
                ✖ ОШИБКА<br><br>
                ${message}
            </div>
        `;
    }
}
