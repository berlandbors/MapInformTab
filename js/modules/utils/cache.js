// js/modules/utils/cache.js - In-memory cache with TTL support

/**
 * Simple in-memory cache with time-to-live (TTL) expiration.
 */
export class SimpleCache {
    /**
     * @param {number} [ttlMs=300000] - Time-to-live in milliseconds (default: 5 minutes)
     */
    constructor(ttlMs = 5 * 60 * 1000) {
        this.ttlMs = ttlMs;
        this.store = new Map();
        this.hits = 0;
        this.misses = 0;
    }

    /**
     * Retrieves a cached value by key.
     * @param {string} key - Cache key
     * @returns {*} Cached value, or null if not found / expired
     */
    get(key) {
        const entry = this.store.get(key);
        if (!entry) {
            this.misses++;
            return null;
        }
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.store.delete(key);
            this.misses++;
            return null;
        }
        this.hits++;
        return entry.value;
    }

    /**
     * Stores a value in the cache.
     * @param {string} key - Cache key
     * @param {*} value - Value to store
     */
    set(key, value) {
        this.store.set(key, { value, timestamp: Date.now() });
    }

    /**
     * Returns cache statistics.
     * @returns {{ hits: number, misses: number, size: number }}
     */
    stats() {
        return { hits: this.hits, misses: this.misses, size: this.store.size };
    }
}

/** Cache for OpenWeatherMap responses (TTL: 5 minutes). */
export const weatherCache = new SimpleCache(5 * 60 * 1000);

/** Cache for Nominatim geocoding responses (TTL: 15 minutes). */
export const geocodingCache = new SimpleCache(15 * 60 * 1000);
