/**
 * BootstrapService - Application Initialization
 * Handles startup flow: first install vs returning user
 */

import StorageService from "./StorageService.js";
import AppStore from "./AppStore.js";
import ApiService from "./ApiService.js";
import { request } from "../api/Api.js";

let _initialized = false;

class BootstrapService {
  /**
   * Initialize app on startup
   * Returns immediately if cache exists, loads data in background if stale
   * @returns {Promise<void>}
   */
  static async init() {
    // Prevent multiple initializations
    if (_initialized) {
      console.log("[Bootstrap] Already initialized, skipping");
      return;
    }
    _initialized = true;

    try {
      console.log("[Bootstrap] Starting initialization...");
      StorageService.init();

      const meta = StorageService.getMeta();
      const hasCache = meta && meta.version !== undefined;

      if (!hasCache) {
        // FIRST INSTALL: Fetch all data
        console.log("[Bootstrap] First install - fetching data...");
        await this._firstInstall();
      } else {
        // RETURNING USER: Load from cache immediately
        console.log("[Bootstrap] Returning user - loading from cache");
        this._loadFromCache();

        // Check if loaded cache is empty (e.g. due to previous mapping bugs/empty sheet)
        const state = AppStore.getState();
        const isEmpty = (state.products || []).length === 0 || (state.tables || []).length === 0;

        if (isEmpty) {
          console.log("[Bootstrap] Cache is empty, forcing fetch from sheet...");
          await this._firstInstall();
        } else {
          // Ensure loading is false so UI renders right away
          AppStore.setLoading(false);

          // Always schedule a background refresh on startup to sync latest sheet data
          console.log("[Bootstrap] Scheduling startup background refresh");
          this._backgroundRefresh();
        }
      }

      console.log("[Bootstrap] Initialization complete");
    } catch (e) {
      console.error("[Bootstrap] Init error:", e);
      AppStore.setError("Initialization failed: " + e.message);
      throw e;
    }
  }

  /**
   * First install: fetch all data and save to cache
   */
  static async _firstInstall() {
    try {
      const allData = await ApiService.fetchAllData();

      if (!allData) {
        throw new Error("No data returned from backend");
      }

      // Load into AppStore (which also saves to StorageService)
      AppStore.loadAll(allData);

      console.log("[Bootstrap] First install complete, data cached");
    } catch (e) {
      console.error("[Bootstrap] First install failed:", e);
      throw e;
    }
  }

  /**
   * Load data from cache into AppStore
   */
  static _loadFromCache() {
    try {
      const cacheAge = StorageService.getAge();
      console.log(`[Bootstrap] Loading from cache (age: ${cacheAge}min)`);

      // AppStore already loaded from storage in its constructor (_initFromStorage)
      // Just confirm it's ready
      const state = AppStore.getState();
      console.log("[Bootstrap] Cache loaded into AppStore", {
        products: (state.products || []).length,
        tables: (state.tables || []).length,
        orders: (state.orders || []).length,
      });
    } catch (e) {
      console.error("[Bootstrap] Load from cache error:", e);
      throw e;
    }
  }

  /**
   * Background refresh if cache is stale (> 24h)
   * Non-blocking, UI still renders from cache
   * NEVER touches orders, orderDetails, tables to protect local order state
   */
  static _backgroundRefresh() {
    setTimeout(async () => {
      try {
        console.log("[Bootstrap] Background refresh starting...");
        const freshData = await request("GET_ALL_DATA_FOR_CACHE");

        if (freshData) {
          this._safeRefresh(freshData);
          console.log("[Bootstrap] Background refresh complete (safe)");
        }
      } catch (e) {
        console.error("[Bootstrap] Background refresh error:", e);
      }
    }, 500);
  }

  /**
   * Safe refresh: only update reference data (products, discounts, settings, etc.)
   * NEVER overwrites orders, orderDetails, or tables — those are managed by the order flow.
   */
  static _safeRefresh(freshData) {
    // Only update these safe entities — order-related data is off-limits
    const safeEntities = ["products", "discounts", "settings", "users", "categories", "shifts", "payments"];

    safeEntities.forEach((entity) => {
      if (freshData[entity] !== undefined) {
        AppStore.set(entity, freshData[entity], true);
      }
    });

    // Update tables from server BUT preserve local occupied status
    if (freshData.tables) {
      const currentTables = AppStore.get("tables") || [];
      const localOccupiedMap = new Map();
      currentTables.forEach((t) => {
        if (t.status === "occupied" && t.currentOrderId) {
          localOccupiedMap.set(String(t.id), t.currentOrderId);
        }
      });

      const mergedTables = freshData.tables.map((t) => {
        const localOrderId = localOccupiedMap.get(String(t.id));
        if (localOrderId) {
          return { ...t, status: "occupied", currentOrderId: localOrderId };
        }
        return t;
      });

      AppStore.set("tables", mergedTables, true);
    }
  }

  /**
   * Force full refresh (for refresh button)
   * Also uses safe refresh to protect order data
   */
  static async forceRefresh() {
    try {
      console.log("[Bootstrap] Force refresh requested");
      AppStore.setLoading(true);

      const freshData = await ApiService.refreshAll();
      if (freshData) {
        this._safeRefresh(freshData);
      }
    } catch (e) {
      console.error("[Bootstrap] Force refresh error:", e);
      throw e;
    } finally {
      AppStore.setLoading(false);
    }
  }

  /**
   * Reset app (clear cache, reload)
   */
  static async reset() {
    try {
      console.log("[Bootstrap] Reset requested");
      _initialized = false; // Allow re-init after reset
      StorageService.clear();
      AppStore.clearPending();
      await this.init();
    } catch (e) {
      console.error("[Bootstrap] Reset error:", e);
      throw e;
    }
  }
}

export default BootstrapService;

