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
    if (entity === "tables" && Array.isArray(data)) {
      finalData = data.map((t) => ({
        ...t,
        id: String(t.id),
        status: String(t.status || "").trim().toLowerCase(),
      }));
    }
    this.state[entity] = finalData;
    if (persist) {
      StorageService.set(entity, finalData);
    }
    this._notify();
  }

  /**
   * Update single item in entity
   * @param {string} entity - Entity name
   * @param {Object} item - Item to update (must have id)
   * @param {boolean} persist - Also save to localStorage
   */
  update(entity, item, persist = true) {
    const arr = this.state[entity];
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
    if (idx >= 0) {
      arr[idx] = { ...arr[idx], ...finalItem };
    } else {
      arr.push(finalItem);
    }

    if (persist) {
      StorageService.update(entity, finalItem);
    }
    this._notify();
  }

  /**
   * Add item to entity
   * @param {string} entity - Entity name
   * @param {Object} item - Item to add
   * @param {boolean} persist - Also save to localStorage
   */
  add(entity, item, persist = true) {
    const arr = this.state[entity];
    if (!Array.isArray(arr)) {
      console.warn(`[AppStore] ${entity} is not array, skipping add`);
      return;
    }

    arr.push(item);

    if (persist) {
      StorageService.update(entity, item);
    }
    this._notify();
  }

  /**
   * Remove item from entity
   * @param {string} entity - Entity name
   * @param {string|number} id - Item id
   * @param {boolean} persist - Also remove from localStorage
   */
  remove(entity, id, persist = true) {
    const arr = this.state[entity];
    if (!Array.isArray(arr)) return;

    const idx = arr.findIndex((x) => x.id === id);
    if (idx >= 0) {
      arr.splice(idx, 1);
      if (persist) {
        StorageService.remove(entity, id);
      }
      this._notify();
    }
  }

  /**
   * Batch load all data from first install
   * @param {Object} allData - All entities {products: [], ...}
   */
  loadAll(allData) {
    Object.keys(allData).forEach((entity) => {
      let data = allData[entity];
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
