/**
 * BootstrapService - Application Initialization
 * Handles startup flow: first install vs returning user
 */

import StorageService from "./StorageService.js";
import AppStore from "./AppStore.js";
import ApiService from "./ApiService.js";
import { request } from "../api/Api.js";

let _initialized = false;
let _refreshInProgress = false; // 🔥 MOBILE FIX: Prevent concurrent refreshes

class BootstrapService {
  /**
   * Initialize app on startup
   * Returns immediately if cache exists, loads data in background if stale
   * @returns {Promise<void>}
   */
  static async init() {
    // Prevent multiple initializations
    if (_initialized) {
      return;
    }
    _initialized = true;

    try {
      StorageService.init();

      const meta = StorageService.getMeta();
      const hasCache = meta && meta.version !== undefined;

      if (!hasCache) {
        // FIRST INSTALL: Fetch all data
        await this._firstInstall();
      } else {
        // RETURNING USER: Load from cache immediately
        this._loadFromCache();

        // Check if loaded cache is empty (e.g. due to previous mapping bugs/empty sheet)
        const state = AppStore.getState();
        const isEmpty = (state.products || []).length === 0 || (state.tables || []).length === 0;

        if (isEmpty) {
          await this._firstInstall();
        } else {
          // Ensure loading is false so UI renders right away
          AppStore.setLoading(false);

          // Always schedule a background refresh on startup to sync latest sheet data
          this._backgroundRefresh();
        }
      }
    } catch (e) {
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
    } catch (e) {
      throw e;
    }
  }

  /**
   * Load data from cache into AppStore
   */
  static _loadFromCache() {
    try {
      // AppStore already loaded from storage in its constructor (_initFromStorage)
    } catch (e) {
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
        const freshData = await request("GET_ALL_DATA_FOR_CACHE");

        if (freshData) {
          this._safeRefresh(freshData);
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

    // Đồng bộ đơn hàng từ server, nhưng merge thông minh với local changes
    if (freshData.orders && Array.isArray(freshData.orders)) {
      const currentOrders = AppStore.get("orders") || [];
      
      // 1. Giữ lại các đơn nháp cục bộ chưa gửi (ord_local_)
      const pendingLocalOrders = currentOrders.filter((o) =>
        String(o.id || "").startsWith("ord_local_"),
      );
      
      const serverOrderIds = new Set(freshData.orders.map((o) => o.id));
      const filteredPending = pendingLocalOrders.filter(
        (o) => !serverOrderIds.has(o.id),
      );
      
      // 2. Merge orders: ưu tiên local nếu được modified gần đây (< 10s) - tăng thời gian bảo vệ
      const localOrderMap = new Map(
        currentOrders
          .filter((o) => !String(o.id || "").startsWith("ord_local_"))
          .map((o) => [o.id, o])
      );
      
      const now = Date.now();
      const RECENT_THRESHOLD = 10000; // 10 seconds - tăng từ 30s để nhanh hơn
      
      const mergedOrders = freshData.orders.map((serverOrder) => {
        const localOrder = localOrderMap.get(serverOrder.id);
        if (!localOrder) return serverOrder;
        
        // Nếu local order vừa được modify (< 10s), giữ local version
        if (localOrder._locallyModified) {
          const modTime = new Date(localOrder._locallyModified).getTime();
          if (now - modTime < RECENT_THRESHOLD) {
            return localOrder; // Giữ local vì vừa thêm món
          }
        }
        
        // Fallback: so sánh updatedAt
        const localTime = new Date(localOrder.updatedAt || 0).getTime();
        const serverTime = new Date(serverOrder.updatedAt || 0).getTime();
        
        if (localTime > serverTime) {
          return localOrder;
        }
        
        return serverOrder;
      });
      
      AppStore.set("orders", [...filteredPending, ...mergedOrders], true);
    }

    // Cập nhật danh sách bàn từ server (Firestore là nguồn chuẩn duy nhất)
    // Chỉ bảo lưu trạng thái bận nếu máy đang có đơn nháp cục bộ chưa sync (ord_local_)
    if (freshData.tables && Array.isArray(freshData.tables)) {
      const currentTables = AppStore.get("tables") || [];
      const localTempMap = new Map();
      
      // Track tables with recent local modifications (< 5 seconds)
      const recentlyModifiedTables = new Set();
      const now = Date.now();
      const RECENT_THRESHOLD = 15000; // 🔥 MOBILE FIX: 15s (tăng từ 5s cho Android chậm)
      
      currentTables.forEach((t) => {
        // Preserve local temp orders
        if (
          t.status === "occupied" &&
          t.currentOrderId &&
          String(t.currentOrderId).startsWith("ord_local_")
        ) {
          localTempMap.set(String(t.id), t.currentOrderId);
        }
        
        // Track recently modified tables (e.g., just paid)
        if (t._locallyModified) {
          const modTime = new Date(t._locallyModified).getTime();
          if (now - modTime < RECENT_THRESHOLD) {
            recentlyModifiedTables.add(String(t.id));
          }
        }
      });

      const mergedTables = freshData.tables.map((t) => {
        const tableId = String(t.id);
        
        // Don't overwrite recently modified tables (optimistic updates)
        if (recentlyModifiedTables.has(tableId)) {
          const localTable = currentTables.find((lt) => String(lt.id) === tableId);
          if (localTable) {
            return localTable; // Keep local version
          }
        }
        
        // Preserve local temp orders
        const tempOrderId = localTempMap.get(tableId);
        if (tempOrderId) {
          return { ...t, status: "occupied", currentOrderId: tempOrderId };
        }
        
        return {
          ...t,
          status: String(t.status || "").trim().toLowerCase(),
        };
      });

      AppStore.set("tables", mergedTables, true);
    }
  }

  /**
   * Force full refresh (for refresh button)
   * Also uses safe refresh to protect order data
   */
  static async forceRefresh() {
    // 🔥 MOBILE FIX: Skip if already refreshing (Android fires multiple events)
    if (_refreshInProgress) {
      return;
    }
    _refreshInProgress = true;
    
    try {
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
      _refreshInProgress = false;
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

