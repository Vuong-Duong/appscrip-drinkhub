/**
 * ProductManagementPage.jsx - Real-world integration example
 * Shows how to use StorageService, AppStore, CrudService in actual page
 */

import { useEffect, useState } from "react";
import AppStore from "../services/AppStore.js";
import CrudService from "../services/CrudService.js";
import BootstrapService from "../services/BootstrapService.js";
import "./ProductManagementPage.css";

function ProductManagementPage() {
  const [state, setState] = useState(AppStore.getState());
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    category: "",
    description: "",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);

  // ============ EFFECTS ============

  // Subscribe to AppStore changes
  useEffect(() => {
    const unsubscribe = AppStore.subscribe(setState);
    return unsubscribe;
  }, []);

  // ============ HANDLERS ============

  const handleAddProduct = async () => {
    try {
      if (!formData.name || !formData.price) {
        alert("Name and price are required");
        return;
      }

      const newProduct = {
        id: `prod-${Date.now()}`,
        name: formData.name,
        price: parseInt(formData.price),
        category: formData.category || "Uncategorized",
        description: formData.description || "",
        createdAt: new Date().toISOString(),
      };

      // Optimistic update - UI changes instantly
      await CrudService.create("products", newProduct);

      // Reset form
      setFormData({ name: "", price: "", category: "", description: "" });
      setShowForm(false);

      console.log("Product created:", newProduct.id);
    } catch (error) {
      console.error("Error creating product:", error);
      alert("Failed to create product: " + error.message);
    }
  };

  const handleUpdateProduct = async (product) => {
    try {
      if (!formData.name || !formData.price) {
        alert("Name and price are required");
        return;
      }

      const updated = {
        ...product,
        name: formData.name,
        price: parseInt(formData.price),
        category: formData.category,
        description: formData.description,
        updatedAt: new Date().toISOString(),
      };

      // Optimistic update - UI changes instantly
      await CrudService.update("products", updated);

      setEditingId(null);
      setFormData({ name: "", price: "", category: "", description: "" });

      console.log("Product updated:", product.id);
    } catch (error) {
      console.error("Error updating product:", error);
      alert("Failed to update product: " + error.message);
    }
  };

  const handleDeleteProduct = async (productId) => {
    try {
      if (!confirm("Are you sure?")) return;

      // Optimistic update - UI changes instantly
      await CrudService.delete("products", productId);
      alert("Xoá sản phẩm thành công!");

      console.log("Product deleted:", productId);
    } catch (error) {
      console.error("Error deleting product:", error);
      alert("Failed to delete product: " + error.message);
    }
  };

  const handleEditClick = (product) => {
    setEditingId(product.id);
    setFormData({
      name: product.name,
      price: product.price,
      category: product.category,
      description: product.description || "",
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({ name: "", price: "", category: "", description: "" });
    setShowForm(false);
  };

  const handleRefresh = async () => {
    try {
      await BootstrapService.forceRefresh();
      alert("Data refreshed from server");
    } catch (error) {
      console.error("Error refreshing:", error);
      alert("Failed to refresh: " + error.message);
    }
  };

  // ============ COMPUTED VALUES ============

  const products = state.products || [];
  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const syncPending = state.syncPending || [];
  const totalPending = syncPending.length;
  const pendingProducts = syncPending.filter((s) => s.entity === "products");

  const isLoading = state.loading;
  const error = state.error;
  const cacheAge = state.lastSync
    ? Math.floor((Date.now() - state.lastSync) / (1000 * 60))
    : null;

  // ============ RENDER ============

  return (
    <div className="product-management-page">
      {/* HEADER */}
      <div className="page-header">
        <h1>📦 Product Management</h1>
        <div className="header-stats">
          <span className="stat">
            Total: <strong>{products.length}</strong>
          </span>
          {cacheAge !== null && (
            <span className="stat">
              Cache: <strong>{cacheAge}m</strong>
            </span>
          )}
          {totalPending > 0 && (
            <span className="stat syncing">
              Syncing: <strong>{totalPending}</strong> ⏳
            </span>
          )}
          {isLoading && <span className="stat loading">Loading... ⌛</span>}
          {error && <span className="stat error">Error: {error}</span>}
        </div>
      </div>

      {/* ACTIONS */}
      <div className="page-actions">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="action-buttons">
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn btn-primary"
          >
            ➕ {showForm ? "Cancel" : "Add Product"}
          </button>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="btn btn-secondary"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* ADD/EDIT FORM */}
      {showForm && (
        <div className="form-card">
          <h2>{editingId ? "✏️ Edit Product" : "➕ New Product"}</h2>
          <div className="form-group">
            <label>Product Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g., Coffee, Tea"
              className="input"
            />
          </div>

          <div className="form-group">
            <label>Price (₫) *</label>
            <input
              type="number"
              value={formData.price}
              onChange={(e) =>
                setFormData({ ...formData, price: e.target.value })
              }
              placeholder="e.g., 25000"
              className="input"
            />
          </div>

          <div className="form-group">
            <label>Category</label>
            <select
              value={formData.category}
              onChange={(e) =>
                setFormData({ ...formData, category: e.target.value })
              }
              className="input"
            >
              <option value="">Select Category</option>
              <option value="Drinks">Drinks</option>
              <option value="Food">Food</option>
              <option value="Dessert">Dessert</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Optional description"
              className="input textarea"
            />
          </div>

          <div className="form-actions">
            <button
              onClick={() =>
                editingId
                  ? handleUpdateProduct(
                      products.find((p) => p.id === editingId),
                    )
                  : handleAddProduct()
              }
              className="btn btn-success"
            >
              {editingId ? "Save Changes" : "Create Product"}
            </button>
            <button onClick={handleCancel} className="btn btn-cancel">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* PENDING SYNCS INFO */}
      {pendingProducts.length > 0 && (
        <div className="pending-info">
          <h3>⏳ Syncing Changes</h3>
          <p>
            These changes are syncing to the server. Your edits are already
            saved locally.
          </p>
          <ul className="pending-list">
            {pendingProducts.map((sync) => (
              <li key={sync.id}>
                <span className="action-badge">{sync.action}</span>
                <span className="product-name">
                  {products.find((p) => p.id === sync.data.id)?.name ||
                    sync.data.id}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* PRODUCTS LIST */}
      <div className="products-container">
        <h2>Products ({filteredProducts.length})</h2>

        {filteredProducts.length === 0 ? (
          <div className="empty-state">
            <p>📭 No products found</p>
            {searchTerm && (
              <p className="text-muted">Try adjusting your search</p>
            )}
          </div>
        ) : (
          <div className="products-table">
            <div className="table-header">
              <div className="col-id">ID</div>
              <div className="col-name">Name</div>
              <div className="col-price">Price</div>
              <div className="col-category">Category</div>
              <div className="col-status">Status</div>
              <div className="col-actions">Actions</div>
            </div>

            {filteredProducts.map((product) => {
              const productSyncing = syncPending.find(
                (s) => s.entity === "products" && s.data.id === product.id,
              );

              return (
                <div
                  key={product.id}
                  className={`table-row ${productSyncing ? "syncing" : ""}`}
                >
                  <div className="col-id">
                    <code>{product.id}</code>
                  </div>
                  <div className="col-name">{product.name}</div>
                  <div className="col-price">
                    {product.price?.toLocaleString()} ₫
                  </div>
                  <div className="col-category">
                    <span className="category-badge">
                      {product.category || "—"}
                    </span>
                  </div>
                  <div className="col-status">
                    {productSyncing ? (
                      <span className="status-badge syncing">
                        ⏳ Syncing {productSyncing.action}
                      </span>
                    ) : (
                      <span className="status-badge synced">✓ Synced</span>
                    )}
                  </div>
                  <div className="col-actions">
                    <button
                      onClick={() => handleEditClick(product)}
                      disabled={productSyncing}
                      className="action-btn edit-btn"
                      title="Edit product"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(product.id)}
                      disabled={productSyncing}
                      className="action-btn delete-btn"
                      title="Delete product"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductManagementPage;
