import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { discountApi } from "../api/Api";
import { getStoredAuthUser } from "../utils/auth";
import { formatCurrency } from "../utils/helpers";

const emptyDiscount = {
  code: "",
  type: "fixed",
  value: 0,
  minOrderValue: 0,
  maxDiscount: 0,
  status: "ACTIVE",
  expiresAt: "",
};

export default function DiscountManagementPage() {
  const navigate = useNavigate();
  const user = getStoredAuthUser();
  const [discounts, setDiscounts] = useState([]);
  const [form, setForm] = useState(emptyDiscount);
  const [editingId, setEditingId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    discountApi
      .getDiscounts()
      .then((data) => {
        setDiscounts(Array.isArray(data) ? data : []);
        setError("");
      })
      .catch((err) => setError(err.details || err.code || err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const openCreateModal = () => {
    setEditingId("");
    setForm(emptyDiscount);
    setIsModalOpen(true);
  };

  const openEditModal = (discount) => {
    setEditingId(discount.id);
    setForm({
      code: discount.code || "",
      type: discount.type || "fixed",
      value: discount.value || 0,
      minOrderValue: discount.minOrderValue || 0,
      maxDiscount: discount.maxDiscount || 0,
      status: discount.status || "ACTIVE",
      expiresAt: discount.expiresAt || "",
    });
    setIsModalOpen(true);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const payload = { ...form, userRole: user?.role };

    try {
      if (editingId) {
        const updated = await discountApi.updateDiscount(editingId, payload);
        setDiscounts((current) =>
          current.map((item) => (item.id === editingId ? updated : item)),
        );
      } else {
        const created = await discountApi.createDiscount(payload);
        setDiscounts((current) => [created, ...current]);
      }
      setIsModalOpen(false);
      setError("");
    } catch (err) {
      setError(err.details || err.code || err.message);
    }
  };

  const handleDelete = async (discountId) => {
    if (!window.confirm("Xoa ma giam gia nay?")) return;

    try {
      await discountApi.deleteDiscount(discountId, user?.role);
      setDiscounts((current) => current.filter((item) => item.id !== discountId));
    } catch (err) {
      setError(err.details || err.code || err.message);
    }
  };

  const formatDiscountValue = (discount) =>
    discount.type === "percent"
      ? `${discount.value}%`
      : formatCurrency(discount.value);

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
                Quan ly Chuong trinh
              </h1>
              <p className="text-sm text-gray-500">
                CRUD ma giam gia theo sheet Khuyen mai
              </p>
            </div>
          </div>
          <button
            onClick={openCreateModal}
            className="px-5 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
          >
            Them ma giam gia
          </button>
        </div>

        {error && <div className="mb-4 text-red-600">{error}</div>}

        {isLoading ? (
          <div className="text-center py-16 text-gray-500">Dang tai...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {discounts
              .filter((item) => item.status !== "DELETED")
              .map((discount) => (
                <div
                  key={discount.id}
                  className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-gray-400">Code</p>
                      <h3 className="font-mono text-2xl font-bold text-blue-700">
                        {discount.code}
                      </h3>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100">
                      {discount.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm mt-5">
                    <div>
                      <p className="text-gray-400">Loai</p>
                      <p className="font-semibold">{discount.type}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Gia tri</p>
                      <p className="font-semibold">{formatDiscountValue(discount)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Don toi thieu</p>
                      <p className="font-semibold">
                        {formatCurrency(discount.minOrderValue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Giam toi da</p>
                      <p className="font-semibold">
                        {formatCurrency(discount.maxDiscount)}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-gray-400">Het han</p>
                      <p className="font-semibold">{discount.expiresAt || "--"}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={() => openEditModal(discount)}
                      className="flex-1 py-2 rounded-xl bg-blue-50 text-blue-700 font-medium"
                    >
                      Sua
                    </button>
                    <button
                      onClick={() => handleDelete(discount.id)}
                      className="flex-1 py-2 rounded-xl bg-red-50 text-red-700 font-medium"
                    >
                      Xoa
                    </button>
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
              {editingId ? "Sua ma giam gia" : "Them ma giam gia"}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-600">Code giam gia</span>
                <input required className="w-full border rounded-xl px-4 py-3" placeholder="Nhap code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-600">Loai giam gia</span>
                <select className="w-full border rounded-xl px-4 py-3" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="fixed">fixed</option>
                  <option value="percent">percent</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-600">Gia tri giam</span>
                <input type="number" className="w-full border rounded-xl px-4 py-3" placeholder="Nhap gia tri" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-600">Gia tri don hang toi thieu</span>
                <input type="number" className="w-full border rounded-xl px-4 py-3" placeholder="Nhap gia toi thieu" value={form.minOrderValue} onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-600">Muc giam toi da</span>
                <input type="number" className="w-full border rounded-xl px-4 py-3" placeholder="Nhap muc giam toi da" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-600">Trang thai</span>
                <select className="w-full border rounded-xl px-4 py-3" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </label>
              <label className="space-y-1 col-span-2">
                <span className="text-sm font-medium text-gray-600">Ngay het han</span>
                <input type="date" className="w-full border rounded-xl px-4 py-3" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
              </label>
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
