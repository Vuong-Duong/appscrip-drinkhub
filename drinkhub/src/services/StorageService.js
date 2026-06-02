/**
 * StorageService - Persistent Local Cache Management
 * Abstraction layer for localStorage with cache versioning
 */

const CACHE_PREFIX = "app_";
const VERSION_KEY = "APP_CACHE_VERSION";
const LAST_DOWNLOAD_KEY = "APP_LAST_DOWNLOAD";
const DATA_KEY = "APP_DATA";

const APP_CACHE_VERSION = 1;

class StorageService {
  /**
   * Initialize storage, handle version mismatch
   */
  static init() {
    const stored = this._getCache();

    if (!stored || stored.version !== APP_CACHE_VERSION) {
      console.log(
        "[StorageService] Cache version mismatch, clearing old cache",
      );
      this.clear();
      this._setMeta({
        version: APP_CACHE_VERSION,
        lastDownload: null,
      });
    }
  }

  /**
   * Get all cached data for an entity
   * @param {string} entity - Entity name (products, orders, tables, etc)
   * @returns {Array|Object} Cached data or null
   */
  static get(entity) {
    try {
      const data = this._getCache();
      if (!data || !data.data) return null;
      return data.data[entity] || null;
    } catch (e) {
      console.error("[StorageService] Error getting data:", e);
      return null;
    }
  }

  /**
   * Set entire entity dataset
   * @param {string} entity - Entity name
   * @param {Array|Object} data - Entity data
   */
  static set(entity, data) {
    try {
      const cache = this._getCache() || { data: {} };
      cache.data[entity] = data;
      cache.lastDownload = Date.now();
      this._saveCache(cache);
    } catch (e) {
      console.error("[StorageService] Error setting data:", e);
    }
  }

  /**
   * Update single item in entity
   * @param {string} entity - Entity name
   * @param {Object} item - Item to merge (must have id)
   */
  static update(entity, item) {
    try {
      const cache = this._getCache() || { data: {} };
      if (!cache.data[entity]) {
        cache.data[entity] = [];
      }

      const arr = cache.data[entity];
      if (!Array.isArray(arr)) {
        console.warn(
          `[StorageService] Entity ${entity} is not array, skipping update`,
        );
        return;
      }

      const idx = arr.findIndex((x) => x.id === item.id);
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], ...item };
      } else {
        arr.push(item);
      }

      cache.lastDownload = Date.now();
      this._saveCache(cache);
    } catch (e) {
      console.error("[StorageService] Error updating item:", e);
    }
  }

  /**
   * Remove item from entity by id
   * @param {string} entity - Entity name
   * @param {string|number} id - Item id
   */
  static remove(entity, id) {
    try {
      const cache = this._getCache() || { data: {} };
      if (!cache.data[entity]) return;

      const arr = cache.data[entity];
      if (Array.isArray(arr)) {
        cache.data[entity] = arr.filter((x) => x.id !== id);
        cache.lastDownload = Date.now();
        this._saveCache(cache);
      }
    } catch (e) {
      console.error("[StorageService] Error removing item:", e);
    }
  }

  /**
   * Set entire dataset (first install)
   * @param {Object} allData - All entities data {products: [], orders: [], ...}
   */
  static setAll(allData) {
    try {
      const cache = {
        version: APP_CACHE_VERSION,
        lastDownload: Date.now(),
        data: allData,
      };
      this._saveCache(cache);
      console.log("[StorageService] Full cache set");
    } catch (e) {
      console.error("[StorageService] Error setting all data:", e);
    }
  }

  /**
   * Get cache metadata
   * @returns {Object} {version, lastDownload}
   */
  static getMeta() {
    const cache = this._getCache();
    return cache
      ? {
          version: cache.version,
          lastDownload: cache.lastDownload,
        }
      : null;
  }

  /**
   * Clear all cached data
   */
  static clear() {
    try {
      localStorage.removeItem(CACHE_PREFIX + DATA_KEY);
      console.log("[StorageService] Cache cleared");
    } catch (e) {
      console.error("[StorageService] Error clearing cache:", e);
    }
  }

  /**
   * Check if cache is stale (> 24h)
   * @returns {boolean}
   */
  static isStale() {
    const meta = this.getMeta();
    if (!meta || !meta.lastDownload) return true;
    const hoursSince = (Date.now() - meta.lastDownload) / (1000 * 60 * 60);
    return hoursSince > 24;
  }

  /**
   * Get cache age in minutes
   * @returns {number|null}
   */
  static getAge() {
    const meta = this.getMeta();
    if (!meta || !meta.lastDownload) return null;
    return Math.floor((Date.now() - meta.lastDownload) / (1000 * 60));
  }

  // ============ PRIVATE METHODS ============

  static _getCache() {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + DATA_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error("[StorageService] Parse error:", e);
      return null;
    }
  }

  static _saveCache(cache) {
    try {
      localStorage.setItem(CACHE_PREFIX + DATA_KEY, JSON.stringify(cache));
    } catch (e) {
      console.error("[StorageService] Save error:", e);
      if (e.name === "QuotaExceededError") {
        console.error("[StorageService] localStorage quota exceeded!");
      }
    }
  }

  static _setMeta(meta) {
    try {
      const cache = this._getCache() || { data: {} };
      cache.version = meta.version;
      cache.lastDownload = meta.lastDownload;
      this._saveCache(cache);
    } catch (e) {
      console.error("[StorageService] Error setting metadata:", e);
    }
  }
}

export default StorageService;
