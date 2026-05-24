import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { productApi } from "../api/Api";
import { getStoredAuthUser } from "../utils/auth";
import { formatCurrency } from "../utils/helpers";

const emptyForm = {
  name: "",
  category: "",
  price: 0,
  cost: 0,
  stock: 0,
  status: "ACTIVE",
  image: "",
};

export default function MenuManagementPage() {
  const navigate = useNavigate();
  const user = getStoredAuthUser();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    productApi
      .getProducts()
      .then((data) => {
        setProducts(Array.isArray(data) ? data : []);
        setError("");
      })
      .catch((err) => setError(err.details || err.code || err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const categories = useMemo(
    () =>
      Array.from(new Set(products.map((item) => item.category).filter(Boolean))),
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
    setIsModalOpen(true);
  };

  const openEditModal = (product) => {
    setEditingId(product.id);
    setForm({
      name: product.name || "",
      category: product.category || "",
      price: product.price || 0,
      cost: product.cost || 0,
      stock: product.stock || 0,
      status: product.status || "ACTIVE",
      image: product.image || "",
    });
    setIsModalOpen(true);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const payload = { ...form, userRole: user?.role };

    try {
      if (editingId) {
        const updated = await productApi.updateProduct(editingId, payload);
        setProducts((current) =>
          current.map((item) => (item.id === editingId ? updated : item)),
        );
      } else {
        const created = await productApi.createProduct(payload);
        setProducts((current) => [created, ...current]);
      }
      setIsModalOpen(false);
      setError("");
    } catch (err) {
      setError(err.details || err.code || err.message);
    }
  };

  const handleDelete = async (productId) => {
    if (!window.confirm("Xoa san pham nay?")) return;

    try {
      await productApi.deleteProduct(productId, user?.role);
      setProducts((current) => current.filter((item) => item.id !== productId));
    } catch (err) {
      setError(err.details || err.code || err.message);
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
              className="px-4 py-2 rounded-xl bg-white border border-gray-200 shadow-sm hover:bg-gray-100"
            >
              Back
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Quan ly Thuc don
              </h1>
              <p className="text-sm text-gray-500">
                CRUD san pham theo sheet Hang hoa
              </p>
            </div>
          </div>
          <button
            onClick={openCreateModal}
            className="px-5 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
          >
            Them san pham
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6 flex flex-wrap gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tim ten san pham..."
            className="border rounded-xl px-4 py-3 min-w-72"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="border rounded-xl px-4 py-3"
          >
            <option value="">Tat ca danh muc</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="mb-4 text-red-600">{error}</div>}

        {isLoading ? (
          <div className="text-center py-16 text-gray-500">Dang tai...</div>
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
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-400">
                      No image
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-gray-900">{product.name}</h3>
                      <p className="text-sm text-gray-500">{product.category}</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100">
                      {product.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm mt-4">
                    <div>
                      <p className="text-gray-400">Gia ban</p>
                      <p className="font-semibold">{formatCurrency(product.price)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Gia von</p>
                      <p className="font-semibold">{formatCurrency(product.cost)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Ton kho</p>
                      <p className="font-semibold">{product.stock}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => openEditModal(product)}
                      className="flex-1 py-2 rounded-xl bg-blue-50 text-blue-700 font-medium"
                    >
                      Sua
                    </button>
                    <button
                      onClick={() => handleDelete(product.id)}
                      className="flex-1 py-2 rounded-xl bg-red-50 text-red-700 font-medium"
                    >
                      Xoa
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
              {editingId ? "Sua san pham" : "Them san pham"}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <input required className="border rounded-xl px-4 py-3" placeholder="Ten" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className="border rounded-xl px-4 py-3" placeholder="Danh muc" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <input type="number" className="border rounded-xl px-4 py-3" placeholder="Gia ban" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              <input type="number" className="border rounded-xl px-4 py-3" placeholder="Gia von" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
              <input type="number" className="border rounded-xl px-4 py-3" placeholder="Ton kho" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
              <select className="border rounded-xl px-4 py-3" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
              <input className="border rounded-xl px-4 py-3 col-span-2" placeholder="URL hinh anh" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-3 rounded-xl bg-gray-100">Huy</button>
              <button type="submit" className="px-5 py-3 rounded-xl bg-blue-600 text-white font-semibold">Luu</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
