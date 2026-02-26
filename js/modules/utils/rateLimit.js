// js/modules/utils/rateLimit.js - Rate limiting utilities

/**
 * Sliding-window rate limiter that queues requests when the limit is reached.
 */
export class RateLimiter {
    /**
     * @param {number} maxRequests - Maximum requests allowed within the window
     * @param {number} windowMs - Time window in milliseconds
     */
    constructor(maxRequests, windowMs) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.timestamps = [];
    }

    /**
     * Acquires a rate-limit token, waiting if necessary.
     * @returns {Promise<void>}
     */
    acquire() {
        return new Promise(resolve => this._process(resolve));
    }

    _process(resolve) {
        const now = Date.now();
        this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);

        if (this.timestamps.length < this.maxRequests) {
            this.timestamps.push(now);
            resolve();
        } else {
            const oldest = this.timestamps[0];
            // Add a small buffer (10ms) to account for timing precision
            const waitMs = this.windowMs - (now - oldest) + 10;
            console.warn(`⚠️ Лимит запросов достигнут, ожидание ${waitMs}мс...`);
            setTimeout(() => this._process(resolve), waitMs);
        }
    }
}

/** Rate limiter for OpenWeatherMap free tier: 60 requests/minute. */
export const openWeatherMapLimiter = new RateLimiter(60, 60000);
