/**
 * CrudService - Optimistic CRUD Operations
 * Pattern: Update UI first (instantly), sync backend async
 */

import AppStore from "./AppStore.js";
import ApiService from "./ApiService.js";

class CrudService {
  /**
   * CREATE: Add new item
   * Flow: Update UI instantly → Sync to backend async
   *
   * @param {string} entity - Entity name (products, orders, etc)
   * @param {Object} item - Item data (must include id)
   * @returns {Promise<Object>} Backend result
   */
  static async create(entity, item) {
    try {
      // 1. Validate
      if (!item.id) {
        throw new Error("Item must have an id");
      }

      console.log(`[CrudService] Creating ${entity}:`, item.id);

      // 2. Update UI instantly
      AppStore.add(entity, item, true);

      // 3. Track pending sync
      const syncId = AppStore.state.syncPending?.length || 0;
      AppStore.addPending({
        entity,
        action: "create",
        data: item,
      });

      // 4. Sync to backend async (don't await)
      this._syncAsync(entity, "create", item, syncId);

      return { success: true, local: true, id: item.id };
    } catch (e) {
      console.error(`[CrudService] Create error for ${entity}:`, e);
      AppStore.setError(`Failed to create: ${e.message}`);
      throw e;
    }
  }

  /**
   * UPDATE: Modify existing item
   * Flow: Update UI instantly → Sync to backend async
   *
   * @param {string} entity - Entity name
   * @param {Object} item - Item data (must include id)
   * @returns {Promise<Object>} Backend result
   */
  static async update(entity, item) {
    try {
      if (!item.id) {
        throw new Error("Item must have an id");
      }

      console.log(`[CrudService] Updating ${entity}:`, item.id);

      // 1. Update UI instantly
      AppStore.update(entity, item, true);

      // 2. Track pending sync
      AppStore.addPending({
        entity,
        action: "update",
        data: item,
      });

      // 3. Sync to backend async
      this._syncAsync(entity, "update", item);

      return { success: true, local: true, id: item.id };
    } catch (e) {
      console.error(`[CrudService] Update error for ${entity}:`, e);
      AppStore.setError(`Failed to update: ${e.message}`);
      throw e;
    }
  }

  /**
   * DELETE: Remove item
   * Flow: Update UI instantly → Sync to backend async
   *
   * @param {string} entity - Entity name
   * @param {string|number} id - Item id
   * @returns {Promise<Object>} Backend result
   */
  static async delete(entity, id) {
    try {
      console.log(`[CrudService] Deleting ${entity}:`, id);

      // 1. Update UI instantly
      AppStore.remove(entity, id, true);

      // 2. Track pending sync
      AppStore.addPending({
        entity,
        action: "delete",
        data: { id },
      });

      // 3. Sync to backend async
      this._syncAsync(entity, "delete", { id });

      return { success: true, local: true, id };
    } catch (e) {
      console.error(`[CrudService] Delete error for ${entity}:`, e);
      AppStore.setError(`Failed to delete: ${e.message}`);
      throw e;
    }
  }

  /**
   * Sync operation to backend (non-blocking, fire-and-forget)
   */
  static _syncAsync(entity, action, data, syncIndex) {
    setTimeout(async () => {
      try {
        console.log(`[CrudService] Syncing ${action} to backend...`);
        const result = await ApiService.executeCRUD(entity, action, data);

        // Find and remove from pending
        const pending = AppStore.get("syncPending") || [];
        const pendingItem = pending.find(
          (p) =>
            p.entity === entity && p.action === action && p.data.id === data.id,
        );
        if (pendingItem) {
          AppStore.removePending(pendingItem.id);
        }

        console.log(`[CrudService] Sync success for ${action}`, result);
      } catch (e) {
        console.error(`[CrudService] Sync error:`, e);
        // Item already updated in UI, sync will retry on next app open
      }
    }, 0);
  }

  /**
   * Undo local change (revert from backend)
   * Use if sync failed and user wants to keep server state
   *
   * @param {string} entity - Entity name
   * @param {string|number} id - Item id
   * @returns {Promise<void>}
   */
  static async undo(entity, id) {
    try {
      console.log(`[CrudService] Undoing ${entity}:`, id);

      // Remove pending sync
      const pending = AppStore.get("syncPending") || [];
      const pendingItem = pending.find(
        (p) => p.data.id === id && p.entity === entity,
      );
      if (pendingItem) {
        AppStore.removePending(pendingItem.id);
      }

      // Reload from server
      const freshData = await ApiService.refreshAll();
      if (freshData) {
        AppStore.loadAll(freshData);
      }
    } catch (e) {
      console.error(`[CrudService] Undo error:`, e);
      throw e;
    }
  }

  /**
   * Get pending syncs for an entity
   */
  static getPending(entity) {
    const pending = AppStore.get("syncPending") || [];
    return pending.filter((p) => p.entity === entity);
  }

  /**
   * Retry all pending syncs
   */
  static async retryAllPending() {
    try {
      console.log("[CrudService] Retrying all pending syncs...");
      await ApiService.retrySyncPending();
    } catch (e) {
      console.error("[CrudService] Retry error:", e);
      throw e;
    }
  }
}

export default CrudService;
