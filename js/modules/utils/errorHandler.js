// js/modules/utils/errorHandler.js - Centralized error handling utilities

/**
 * Custom application error with code, details, and timestamp.
 */
export class AppError extends Error {
    /**
     * @param {string} message - Human-readable error message
     * @param {string} [code] - Machine-readable error code
     * @param {*} [details] - Additional error details
     */
    constructor(message, code, details) {
        super(message);
        this.name = 'AppError';
        this.code = code || 'UNKNOWN_ERROR';
        this.details = details || null;
        this.timestamp = new Date().toISOString();
    }
}

/**
 * Logs an API error and returns null (non-fatal handler).
 * @param {Error} error - The error that occurred
 * @param {string} context - Human-readable context for the error
 * @returns {null}
 */
export function handleApiError(error, context) {
    console.error(`❌ [${context}] ${error.message}`, error);
    return null;
}

/**
 * Logs a critical error and shows a user-facing alert.
 * @param {Error} error - The error that occurred
 * @param {string} [userMessage] - Message shown to the user
 */
export function handleCriticalError(error, userMessage) {
    console.error('🔴 Критическая ошибка:', error);
    alert(userMessage || 'Произошла критическая ошибка. Пожалуйста, обновите страницу.');
}
