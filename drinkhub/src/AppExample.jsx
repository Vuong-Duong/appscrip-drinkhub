/**
 * App.jsx - Application Entry Point
 * Demonstrates proper usage of StorageService, AppStore, CrudService, BootstrapService
 *
 * Architecture:
 * 1. BootstrapService initializes on mount
 * 2. AppStore holds all state
 * 3. UI subscribes to AppStore changes
 * 4. CrudService handles all data mutations
 */

import { useEffect, useState } from "react";
import BootstrapService from "./services/BootstrapService";
import AppStore from "./services/AppStore";
import CrudService from "./services/CrudService";
import ApiService from "./services/ApiService";
import "./App.css";

function App() {
  const [state, setState] = useState(AppStore.getState());
  const [debugOpen, setDebugOpen] = useState(false);

  /**
   * Subscribe to AppStore changes
   * UI re-renders whenever state changes
   */
  useEffect(() => {
    const unsubscribe = AppStore.subscribe((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, []);

  /**
   * Initialize app on first mount
   */
  useEffect(() => {
    const init = async () => {
      try {
        await BootstrapService.init();
      } catch (e) {
        console.error("[App] Bootstrap error:", e);
      }
    };

    init();
  }, []);

  // ============ UI HANDLERS ============

  const handleCreateProduct = async () => {
    try {
      const newProduct = {
        id: `prod-${Date.now()}`,
        name: "New Product",
        price: 50000,
        category: "Drinks",
        createdAt: new Date().toISOString(),
      };

      // Uses CrudService for optimistic update
      await CrudService.create("products", newProduct);
      console.log("[App] Product created (local update sent, syncing...)");
    } catch (e) {
      console.error("[App] Create error:", e);
    }
  };

  const handleUpdateProduct = async (productId) => {
    try {
      const product = state.products.find((p) => p.id === productId);
      if (!product) return;

      const updated = {
        ...product,
        price: product.price + 5000,
        updatedAt: new Date().toISOString(),
      };

      // Uses CrudService for optimistic update
      await CrudService.update("products", updated);
      console.log("[App] Product updated (local update sent, syncing...)");
    } catch (e) {
      console.error("[App] Update error:", e);
    }
  };

  const handleDeleteProduct = async (productId) => {
    try {
      // Uses CrudService for optimistic update
      await CrudService.delete("products", productId);
      console.log("[App] Product deleted (local delete sent, syncing...)");
    } catch (e) {
      console.error("[App] Delete error:", e);
    }
  };

  const handleRefresh = async () => {
    try {
      await BootstrapService.forceRefresh();
      console.log("[App] Data refreshed from backend");
    } catch (e) {
      console.error("[App] Refresh error:", e);
    }
  };

  const handleRetrySyncPending = async () => {
    try {
      await CrudService.retryAllPending();
      console.log("[App] Retried all pending syncs");
    } catch (e) {
      console.error("[App] Retry error:", e);
    }
  };

  const handleReset = async () => {
    try {
      await BootstrapService.reset();
      console.log("[App] App reset, data reloaded");
    } catch (e) {
      console.error("[App] Reset error:", e);
    }
  };

  // ============ RENDER ============

  const meta = AppStore.getMeta?.() || {};
  const pending = state.syncPending || [];
  const cacheAge = Math.floor(
    (Date.now() - (meta.lastDownload || 0)) / (1000 * 60),
  );

  return (
    <div className="app">
      {/* STATUS BAR */}
      <div className="status-bar">
        <div className="status-item">
          <span className="label">Cache Age:</span>
          {meta.lastDownload ? `${cacheAge} minutes ago` : "Never"}
        </div>
        <div className="status-item">
          <span className="label">Cache Version:</span>
          {meta.version || "N/A"}
        </div>
        <div className="status-item">
          <span className="label">Loading:</span>
          {state.loading ? "⏳" : "✓"}
        </div>
        <div className="status-item">
          <span className="label">Pending Syncs:</span>
          {pending.length}
        </div>
        {state.error && <div className="status-error">⚠️ {state.error}</div>}
      </div>

      {/* ACTION BUTTONS */}
      <div className="actions">
        <button onClick={handleCreateProduct} className="btn btn-primary">
          ➕ Create Product
        </button>
        <button
          onClick={handleRefresh}
          className="btn btn-secondary"
          disabled={state.loading}
        >
          🔄 Manual Refresh
        </button>
        <button
          onClick={handleRetrySyncPending}
          className="btn btn-secondary"
          disabled={pending.length === 0}
        >
          🔁 Retry Pending ({pending.length})
        </button>
        <button onClick={handleReset} className="btn btn-danger">
          ⚠️ Reset App
        </button>
        <button
          onClick={() => setDebugOpen(!debugOpen)}
          className="btn btn-debug"
        >
          🐛 Debug
        </button>
      </div>

      {/* PRODUCTS LIST */}
      <div className="products-section">
        <h2>Products ({state.products?.length || 0})</h2>
        <div className="products-grid">
          {state.products?.map((product) => {
            const pendingSync = pending.find(
              (p) => p.entity === "products" && p.data.id === product.id,
            );
            return (
              <div
                key={product.id}
                className={`product-card ${pendingSync ? "syncing" : ""}`}
              >
                <div className="product-header">
                  <h3>{product.name}</h3>
                  {pendingSync && (
                    <span className="sync-badge">⏳ Syncing...</span>
                  )}
                </div>
                <p className="product-price">
                  {product.price?.toLocaleString()} đ
                </p>
                <p className="product-category">{product.category}</p>
                <div className="product-actions">
                  <button
                    onClick={() => handleUpdateProduct(product.id)}
                    className="btn-small btn-edit"
                    disabled={pendingSync}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => handleDeleteProduct(product.id)}
                    className="btn-small btn-delete"
                    disabled={pendingSync}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* PENDING SYNCS */}
      {pending.length > 0 && (
        <div className="pending-syncs">
          <h3>⏳ Pending Syncs ({pending.length})</h3>
          <div className="sync-list">
            {pending.map((item) => (
              <div key={item.id} className="sync-item">
                <span>{item.entity}</span>
                <span className="action-badge">
                  {item.action.toUpperCase()}
                </span>
                <span className="id">{item.data.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DEBUG PANEL */}
      {debugOpen && (
        <div className="debug-panel">
          <h3>📊 Debug Info</h3>
          <div className="debug-content">
            <details>
              <summary>Full State</summary>
              <pre>{JSON.stringify(state, null, 2)}</pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
