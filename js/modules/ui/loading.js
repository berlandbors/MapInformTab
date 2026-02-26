// js/modules/ui/loading.js - Loading indicator and status messages

export function showLoading() {
    const content = document.getElementById('infoContent');
    if (content) {
        content.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <div class="loading-text">
                    ⟳ ЗАГРУЗКА ДАННЫХ...<br><br>
                    Сканирование точки на карте
                </div>
                <div class="loading-bar">
                    <div class="loading-bar-fill"></div>
                </div>
            </div>
        `;
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
