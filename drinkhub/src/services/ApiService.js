/**
 * ApiService - Backend API Wrapper
 * Handles all google.script.run calls with error handling
 * UI should NOT call google.script.run directly
 */

import appStore from "./AppStore.js";
import { request } from "../api/Api.js";

class ApiService {
  /**
   * Fetch all data from backend (first install)
   * @returns {Promise<Object>} All entities data
   */
  static async fetchAllData() {
    try {
      appStore.setLoading(true);
      appStore.setError(null);

      console.log("[ApiService] Fetching all data...");
      const result = await request("GET_ALL_DATA_FOR_CACHE");
      console.log("[ApiService] getAllData success");
      appStore.setLoading(false);
      return result;
    } catch (error) {
      console.error("[ApiService] fetchAllData failed:", error);
      appStore.setLoading(false);
      appStore.setError(error.message || "Failed to fetch data");
      throw error;
    }
  }

  /**
   * Batch sync CRUD operations (async, non-blocking)
   * @param {Object} syncData - {creates: [], updates: [], deletes: []}
   * @returns {Promise<Object>} Sync result
   */
  static async syncCRUD(syncData) {
    try {
      console.log("[ApiService] Syncing CRUD operations...", syncData);
      const result = await request("BATCH_CRUD_WITH_SYNC", syncData);
      console.log("[ApiService] batchCRUD success");
      return result;
    } catch (error) {
      console.error("[ApiService] batchCRUD failed:", error);
      appStore.setError(error.message || "Sync failed");
      throw error;
    }
  }

  /**
   * Manual refresh all data
   * @returns {Promise<Object>} Fresh data from backend
   */
  static async refreshAll() {
    try {
      appStore.setLoading(true);
      appStore.setError(null);
      console.log("[ApiService] Manual refresh started");
      const result = await request("GET_ALL_DATA_FOR_CACHE");
      console.log("[ApiService] refreshAll success");
      appStore.setLoading(false);
      return result;
    } catch (error) {
      console.error("[ApiService] refreshAll failed:", error);
      appStore.setLoading(false);
      appStore.setError(error.message || "Refresh failed");
      throw error;
    }
  }

  /**
   * Execute single CRUD operation
   * @param {string} entity - Entity name
   * @param {string} action - 'create', 'update', 'delete'
   * @param {Object} data - Operation data
   * @returns {Promise<Object>} Backend result
   */
  static async executeCRUD(entity, action, data) {
    try {
      const syncData = {
        creates: [],
        updates: [],
        deletes: [],
      };

      if (action === "create") {
        syncData.creates.push({ entity, data });
      } else if (action === "update") {
        syncData.updates.push({ entity, data });
      } else if (action === "delete") {
        syncData.deletes.push({ entity, id: data.id });
      }

      return await this.syncCRUD(syncData);
    } catch (e) {
      console.error("[ApiService] executeCRUD error:", e);
      throw e;
    }
  }

  /**
   * Retry failed syncs
   * @returns {Promise<void>}
   */
  static async retrySyncPending() {
    const pending = appStore.get("syncPending") || [];
    if (pending.length === 0) return;

    console.log(`[ApiService] Retrying ${pending.length} pending syncs...`);

    for (const item of pending) {
      try {
        await this.executeCRUD(item.entity, item.action, item.data);
        appStore.removePending(item.id);
      } catch (e) {
        console.error(`[ApiService] Retry failed for ${item.id}:`, e);
      }
    }
  }
}

export default ApiService;
