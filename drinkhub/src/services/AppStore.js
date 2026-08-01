/**
 * AppStore - Memory State Management
 * Central state container with localStorage sync
 * UI components bind to AppStore state
 */

import StorageService from "./StorageService.js";

class AppStore {
  constructor() {
    this.state = {
      // Data
      products: [],
      orders: [],
      tables: [],
      discounts: [],
      settings: {},
      users: [],
      categories: [],
      shifts: [],
      orderDetails: [],
      payments: [],

      // UI state
      loading: false,
      error: null,
      lastSync: null,
      syncPending: [],

      // Auth
      currentUser: null,
      isAuthenticated: false,
    };

    this.listeners = [];
    this._initFromStorage();
  }

  /**
   * Initialize state from localStorage
   */
  _initFromStorage() {
    try {
      // Load all entities from storage
      const entities = [
        "products",
        "orders",
        "tables",
        "discounts",
        "settings",
        "users",
        "categories",
        "shifts",
        "orderDetails",
        "payments",
      ];

      entities.forEach((entity) => {
        let data = StorageService.get(entity);
        if (data) {
          if (entity === "tables" && Array.isArray(data)) {
            data = data.map((t) => ({
              ...t,
              id: String(t.id),
              status: String(t.status || "").trim().toLowerCase(),
            }));
          }
          this.state[entity] = data;
        }
      });

      const meta = StorageService.getMeta();
      if (meta) {
        this.state.lastSync = meta.lastDownload;
      }

      console.log("[AppStore] Initialized from localStorage");
    } catch (e) {
      console.error("[AppStore] Init error:", e);
    }
  }

  /**
   * Subscribe to state changes
   * @param {Function} listener - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.push(listener);

    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Get current state
   */
  getState() {
    return this.state;
  }

  /**
   * Get specific entity data
   * @param {string} entity - Entity name
   */
  get(entity) {
    return this.state[entity];
  }

  /**
   * Set entire entity data (bulk update)
   * @param {string} entity - Entity name
   * @param {Array|Object} data - Data to set
   * @param {boolean} persist - Also save to localStorage
   */
  set(entity, data, persist = true) {
    let finalData = data;
    if (Array.isArray(data)) {
      finalData = data.filter((item) => item && item.status !== "DELETED");
    }
    if (entity === "tables" && Array.isArray(finalData)) {
      finalData = finalData.map((t) => ({
        ...t,
        id: String(t.id),
        status: String(t.status || "").trim().toLowerCase(),
      }));
    }
    const newEntityData = Array.isArray(finalData) ? [...finalData] : finalData;
    this.state = {
      ...this.state,
      [entity]: newEntityData,
    };
    if (persist) {
      StorageService.set(entity, finalData);
    }
    if (entity === "orders" || entity === "tables") {
      this.recalculateTableStatuses(false);
    }
    this._notify();
  }

  update(entity, item, persist = true) {
    const arr = this.state[entity] || [];
    if (!Array.isArray(arr)) {
      console.warn(`[AppStore] ${entity} is not array, skipping update`);
      return;
    }

    let finalItem = item;
    if (entity === "tables" && item) {
      finalItem = {
        ...item,
        id: String(item.id),
        status: item.status ? String(item.status).trim().toLowerCase() : undefined,
      };
    }

    const idx = arr.findIndex((x) => String(x.id) === String(finalItem.id));
    let newArr;
    if (idx >= 0) {
      if (finalItem.status === "DELETED") {
        newArr = arr.filter((x) => String(x.id) !== String(finalItem.id));
        if (persist) {
          StorageService.remove(entity, finalItem.id);
        }
      } else {
        newArr = [...arr];
        newArr[idx] = { ...newArr[idx], ...finalItem };
        if (persist) {
          StorageService.update(entity, finalItem);
        }
      }
    } else {
      if (finalItem.status !== "DELETED") {
        newArr = [...arr, finalItem];
        if (persist) {
          StorageService.update(entity, finalItem);
        }
      } else {
        newArr = [...arr];
      }
    }

    this.state = {
      ...this.state,
      [entity]: newArr,
    };
    if (entity === "orders") {
      this.recalculateTableStatuses(false);
    }
    this._notify();
  }

  add(entity, item, persist = true) {
    const arr = this.state[entity] || [];
    if (!Array.isArray(arr)) {
      console.warn(`[AppStore] ${entity} is not array, skipping add`);
      return;
    }

    if (item && item.status !== "DELETED") {
      const idx = arr.findIndex((x) => String(x.id) === String(item.id));
      let newArr;
      if (idx >= 0) {
        newArr = [...arr];
        newArr[idx] = { ...newArr[idx], ...item };
      } else {
        newArr = [...arr, item];
      }
      this.state = {
        ...this.state,
        [entity]: newArr,
      };
      if (persist) {
        StorageService.update(entity, item);
      }
    }
    if (entity === "orders") {
      this.recalculateTableStatuses(false);
    }
    this._notify();
  }

  remove(entity, id, persist = true) {
    const arr = this.state[entity] || [];
    if (!Array.isArray(arr)) return;

    const newArr = arr.filter((x) => String(x.id) !== String(id));
    this.state = {
      ...this.state,
      [entity]: newArr,
    };
    if (persist) {
      StorageService.remove(entity, id);
    }
    if (entity === "orders") {
      this.recalculateTableStatuses(false);
    }
    this._notify();
  }

  /**
   * Tự động tính toán lại trạng thái bàn (occupied/available) dựa trên danh sách Order đang OPEN
   */
  recalculateTableStatuses(triggerNotify = true) {
    const tables = this.state.tables;
    if (!Array.isArray(tables) || tables.length === 0) return;

    const openOrders = (this.state.orders || []).filter(
      (o) => o && String(o.status || "").trim().toUpperCase() === "OPEN"
    );

    const openTableMap = new Map();
    openOrders.forEach((order) => {
      if (order.tableId) {
        openTableMap.set(String(order.tableId).trim().toLowerCase(), order.id);
      }
      if (order.tableName) {
        openTableMap.set(String(order.tableName).trim().toLowerCase(), order.id);
      }
      const digits = String(order.tableName || order.tableId || "").replace(/\D+/g, "");
      if (digits) {
        openTableMap.set(`digits_${digits}`, order.id);
      }
    });

    const newTables = tables.map((t) => {
      const tId = String(t.id || "").trim().toLowerCase();
      const tName = String(t.name || "").trim().toLowerCase();
      const tDigits = tName.replace(/\D+/g, "") || tId.replace(/\D+/g, "");

      const openOrderId =
        openTableMap.get(tId) ||
        openTableMap.get(tName) ||
        (tDigits ? openTableMap.get(`digits_${tDigits}`) : null);

      if (openOrderId) {
        return {
          ...t,
          status: "occupied",
          currentOrderId: openOrderId,
        };
      } else {
        return {
          ...t,
          status: t.status === "reserved" ? "reserved" : "available",
          currentOrderId: null,
        };
      }
    });

    this.state = {
      ...this.state,
      tables: newTables,
    };
    StorageService.set("tables", newTables);
    if (triggerNotify) {
      this._notify();
    }
  }

  loadAll(allData) {
    Object.keys(allData).forEach((entity) => {
      let data = allData[entity];
      if (Array.isArray(data)) {
        data = data.filter((item) => item && item.status !== "DELETED");
      }
      if (entity === "tables" && Array.isArray(data)) {
        data = data.map((t) => ({
          ...t,
          id: String(t.id),
          status: String(t.status || "").trim().toLowerCase(),
        }));
      }
      this.state[entity] = data;
    });
    StorageService.setAll(allData);
    this.state.lastSync = Date.now();
    this.recalculateTableStatuses(false);
    this._notify();
  }

  /**
   * Set UI loading state
   */
  setLoading(loading) {
    this.state.loading = loading;
    this._notify();
  }

  /**
   * Set UI error state
   */
  setError(error) {
    this.state.error = error;
    this._notify();
  }

  /**
   * Add sync to pending queue
   * @param {Object} syncItem - {entity, action, data}
   */
  addPending(syncItem) {
    if (!this.state.syncPending) {
      this.state.syncPending = [];
    }
    this.state.syncPending.push({
      ...syncItem,
      timestamp: Date.now(),
      id: Math.random().toString(36).substr(2, 9),
    });
    this._notify();
  }

  /**
   * Remove sync from pending queue
   */
  removePending(syncId) {
    if (this.state.syncPending) {
      this.state.syncPending = this.state.syncPending.filter(
        (x) => x.id !== syncId,
      );
      this._notify();
    }
  }

  /**
   * Clear all sync pending
   */
  clearPending() {
    this.state.syncPending = [];
    this._notify();
  }

  /**
   * Set user
   */
  setUser(user) {
    this.state.currentUser = user;
    this.state.isAuthenticated = !!user;
    this._notify();
  }

  /**
   * Notify all listeners of state change
   */
  _notify() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (e) {
        console.error("[AppStore] Listener error:", e);
      }
    });
  }

  /**
   * Debug: log current state
   */
  debug() {
    console.log("[AppStore]", JSON.stringify(this.state, null, 2));
  }
}

// Global singleton instance
const appStore = new AppStore();

export default appStore;
