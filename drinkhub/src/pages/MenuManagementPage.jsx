import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import ImageInputField from "../components/ImageInputField";
import appStore from "../services/AppStore";
import CrudService from "../services/CrudService";
import { getStoredAuthUser } from "../utils/auth";
import { formatCurrency, getDirectImageUrl } from "../utils/helpers";

const emptyForm = {
  name: "",
  category: "",
  price: "",
  cost: "",
  stock: "",
  status: "ACTIVE",
  image: "",
};

export default function MenuManagementPage() {
  const navigate = useNavigate();
  const user = getStoredAuthUser();
  const [storeState, setStoreState] = useState(appStore.getState());
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = appStore.subscribe((state) => {
      setStoreState({ ...state });
    });
    return unsubscribe;
  }, []);

  const products = storeState.products || [];
  const isLoading = storeState.loading;
  const pendingSyncs = storeState.syncPending || [];

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          products.map((item) => (item.category || "").trim()).filter(Boolean),
        ),
      ),
    [products],
  );

  const filteredProducts = products.filter((item) => {
    const matchesSearch = String(item.name || "")
      .toLowerCase()
      .includes(search.trim().toLowerCase());
    const matchesCategory = !category || item.category === category;
    return item.status !== "DELETED" && matchesSearch && matchesCategory;
  });

  const openCreateModal = () => {
    setEditingId("");
    setForm(emptyForm);
    setError("");
    setIsModalOpen(true);
  };

  const openEditModal = (product) => {
    setEditingId(product.id);
    setForm({
      name: product.name || "",
      category: product.category || "",
      price:
        product.price !== undefined && product.price !== null
          ? product.price
          : "",
      cost:
        product.cost !== undefined && product.cost !== null ? product.cost : "",
      stock:
        product.stock !== undefined && product.stock !== null
          ? product.stock
          : "",
      status: product.status || "ACTIVE",
      image: product.image || "",
    });
    setError("");
    setIsModalOpen(true);
  };

  const handleSave = async (event) => {
    event.preventDefault();

    const trimmedName = (form.name || "").trim();
    const trimmedCategory = (form.category || "").trim();
    const priceStr = String(
      form.price !== undefined && form.price !== null ? form.price : "",
    ).trim();
    const costStr = String(
      form.cost !== undefined && form.cost !== null ? form.cost : "",
    ).trim();
    const stockStr = String(
      form.stock !== undefined && form.stock !== null ? form.stock : "",
    ).trim();

    // Validations
    if (!trimmedName) {
      setError("Vui lòng nhập tên sản phẩm");
      return;
    }
    if (!trimmedCategory) {
      setError("Vui lòng chọn hoặc nhập danh mục");
      return;
    }
    if (priceStr === "" || isNaN(Number(priceStr)) || Number(priceStr) < 0) {
      setError("Vui lòng nhập giá bán hợp lệ (số không âm)");
      return;
    }
    if (costStr === "" || isNaN(Number(costStr)) || Number(costStr) < 0) {
      setError("Vui lòng nhập giá vốn hợp lệ (số không âm)");
      return;
    }
    if (stockStr === "" || isNaN(Number(stockStr)) || Number(stockStr) < 0) {
      setError("Vui lòng nhập số lượng tồn kho hợp lệ (số không âm)");
      return;
    }

    const payload = {
      name: trimmedName,
      category: trimmedCategory,
      price: parseInt(priceStr, 10) || 0,
      cost: parseInt(costStr, 10) || 0,
      stock: parseInt(stockStr, 10) || 0,
      status: form.status,
      image: (form.image || "").trim(),
    };

    try {
      if (editingId) {
        const updated = { ...payload, id: editingId };
        await CrudService.update("products", updated);
      } else {
        const created = { ...payload, id: `prod-${Date.now()}` };
        await CrudService.create("products", created);
      }
      setIsModalOpen(false);
      setError("");
    } catch (err) {
      setError(err.message || "Không lưu được sản phẩm");
    }
  };

  const handleDelete = async (productId) => {
    if (!window.confirm("Xoá sản phẩm này?")) return;

    try {
      await CrudService.delete("products", productId);
    } catch (err) {
      setError(err.message || "Xoá sản phẩm thất bại");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="pt-20 px-6 max-w-7xl mx-auto pb-10">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="text-3xl text-gray-600 hover:text-gray-900"
            >
              &larr;
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Quản lý Thực đơn
              </h1>
              <p className="text-sm text-gray-500">
                Quản lý sản phẩm theo danh mục Hàng hoá
              </p>
            </div>
          </div>
          <button
            onClick={openCreateModal}
            className="px-5 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
          >
            Thêm sản phẩm
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6 flex flex-wrap gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm tên sản phẩm..."
            className="border rounded-xl px-4 py-3 min-w-72"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="border rounded-xl px-4 py-3"
          >
            <option value="">Tất cả danh mục</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="mb-4 text-red-600">{error}</div>}

        {isLoading ? (
          <div className="text-center py-16 text-gray-500">Đang tải...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm"
              >
                <div className="h-36 bg-gray-100">
                  {product.image ? (
                    <img
                      src={getDirectImageUrl(product.image)}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-400">
                      Chưa có ảnh
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-gray-900">
                        {product.name}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {product.category}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100">
                      {product.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm mt-4">
                    <div>
                      <p className="text-gray-400">Giá bán</p>
                      <p className="font-semibold">
                        {formatCurrency(product.price)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Giá vốn</p>
                      <p className="font-semibold">
                        {formatCurrency(product.cost)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Tồn kho</p>
                      <p className="font-semibold">{product.stock}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => openEditModal(product)}
                      className="flex-1 py-2 rounded-xl bg-blue-50 text-blue-700 font-medium"
                    >
                      Sửa
                    </button>
                    <button
                      onClick={() => handleDelete(product.id)}
                      className="flex-1 py-2 rounded-xl bg-red-50 text-red-700 font-medium"
                    >
                      Xoá
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="bg-white rounded-2xl w-full max-w-2xl p-6 space-y-4"
          >
            <h2 className="text-xl font-bold">
              {editingId ? "Sửa sản phẩm" : "Thêm sản phẩm"}
            </h2>
            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl font-medium border border-red-100">
                {error}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-600">
                  Tên sản phẩm
                </span>
                <input
                  required
                  className="w-full border rounded-xl px-4 py-3"
                  placeholder="Nhập tên sản phẩm"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-600">
                  Danh mục
                </span>
                <input
                  required
                  list="modal-categories"
                  className="w-full border rounded-xl px-4 py-3"
                  placeholder="Chọn hoặc nhập danh mục"
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                />
                <datalist id="modal-categories">
                  {categories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-600">
                  Giá bán
                </span>
                <input
                  type="number"
                  className="w-full border rounded-xl px-4 py-3"
                  placeholder="Nhập giá bán"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-600">
                  Giá vốn
                </span>
                <input
                  type="number"
                  className="w-full border rounded-xl px-4 py-3"
                  placeholder="Nhập giá vốn"
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-600">
                  Số lượng tồn kho
                </span>
                <input
                  type="number"
                  className="w-full border rounded-xl px-4 py-3"
                  placeholder="Nhập số lượng"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-600">
                  Trạng thái
                </span>
                <select
                  className="w-full border rounded-xl px-4 py-3"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </label>
              <div className="col-span-2">
                <ImageInputField
                  value={form.image}
                  onChange={(url) => setForm({ ...form, image: url })}
                  label="Hình ảnh sản phẩm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setError("");
                }}
                className="px-5 py-3 rounded-xl bg-gray-100"
              >
                Huỷ
              </button>
              <button
                type="submit"
                className="px-5 py-3 rounded-xl bg-blue-600 text-white font-semibold"
              >
                Lưu
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
