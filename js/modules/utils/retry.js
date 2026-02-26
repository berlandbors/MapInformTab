// js/modules/utils/retry.js - Exponential backoff retry utility

/**
 * Retries an async function with exponential backoff on failure.
 * @param {Function} fn - Async function to retry
 * @param {number} [maxRetries=3] - Maximum number of retry attempts
 * @param {number} [baseDelay=1000] - Base delay in milliseconds (doubles each retry)
 * @returns {Promise<*>} Result of the function on success
 * @throws {Error} Last error if all retries are exhausted
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt - 1);
                console.log(`🔄 Попытка ${attempt}/${maxRetries} не удалась: ${error.message}. Повтор через ${delay}мс...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    console.error(`❌ Все ${maxRetries} попытки исчерпаны. Последняя ошибка: ${lastError?.message}`);
    throw lastError;
}
