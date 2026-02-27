// js/modules/ui/loading.js - Loading indicator and status messages

export function showLoading() {
    const content = document.getElementById('infoContent');
    if (content) {
        content.innerHTML = `
            <div class="loading-container">
                <div class="console-spinner">
                    <div class="spinner-ring"></div>
                    <div class="spinner-dot"></div>
                </div>
                <div class="loading-text">
                    &gt;&gt;&gt; ЗАГРУЗКА ДАННЫХ &lt;&lt;&lt;<br><br>
                    <span class="loading-progress">ПРОГРЕСС: </span>
                    <span class="loading-bar">
                        <span class="loading-bar-fill"></span>
                    </span>
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
