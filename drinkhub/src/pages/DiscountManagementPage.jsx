import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import appStore from "../services/AppStore";
import CrudService from "../services/CrudService";
import { getStoredAuthUser } from "../utils/auth";
import { formatCurrency } from "../utils/helpers";

const emptyDiscount = {
  code: "",
  type: "fixed",
  value: "",
  minOrderValue: "",
  maxDiscount: "",
  status: "ACTIVE",
  expiresAt: "",
};

export default function DiscountManagementPage() {
  const navigate = useNavigate();
  const user = getStoredAuthUser();
  const [storeState, setStoreState] = useState(appStore.getState());
  const [form, setForm] = useState(emptyDiscount);
  const [editingId, setEditingId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = appStore.subscribe((state) => {
      setStoreState({ ...state });
    });
    return unsubscribe;
  }, []);

  const discounts = storeState.discounts || [];
  const isLoading = storeState.loading;

  const openCreateModal = () => {
    setEditingId("");
    setForm(emptyDiscount);
    setError("");
    setIsModalOpen(true);
  };

  const openEditModal = (discount) => {
    setEditingId(discount.id);
    setForm({
      code: discount.code || "",
      type: discount.type || "fixed",
      value:
        discount.value !== undefined && discount.value !== null
          ? discount.value
          : "",
      minOrderValue:
        discount.minOrderValue !== undefined && discount.minOrderValue !== null
          ? discount.minOrderValue
          : "",
      maxDiscount:
        discount.maxDiscount !== undefined && discount.maxDiscount !== null
          ? discount.maxDiscount
          : "",
      status: discount.status || "ACTIVE",
      expiresAt: discount.expiresAt || "",
    });
    setError("");
    setIsModalOpen(true);
  };

  const handleSave = async (event) => {
    event.preventDefault();

    const trimmedCode = (form.code || "").trim();
    const valueStr = String(
      form.value !== undefined && form.value !== null ? form.value : "",
    ).trim();
    const minOrderValueStr = String(
      form.minOrderValue !== undefined && form.minOrderValue !== null
        ? form.minOrderValue
        : "",
    ).trim();
    const maxDiscountStr = String(
      form.maxDiscount !== undefined && form.maxDiscount !== null
        ? form.maxDiscount
        : "",
    ).trim();

    if (!trimmedCode) {
      setError("Vui lòng nhập mã giảm giá");
      return;
    }
    if (valueStr === "" || isNaN(Number(valueStr)) || Number(valueStr) < 0) {
      setError("Vui lòng nhập giá trị giảm hợp lệ (số không âm)");
      return;
    }
    if (
      minOrderValueStr === "" ||
      isNaN(Number(minOrderValueStr)) ||
      Number(minOrderValueStr) < 0
    ) {
      setError("Vui lòng nhập giá trị đơn hàng tối thiểu hợp lệ (số không âm)");
      return;
    }
    if (
      maxDiscountStr === "" ||
      isNaN(Number(maxDiscountStr)) ||
      Number(maxDiscountStr) < 0
    ) {
      setError("Vui lòng nhập mức giảm tối đa hợp lệ (số không âm)");
      return;
    }

    const payload = {
      code: trimmedCode,
      type: form.type,
      value: parseInt(valueStr, 10) || 0,
      minOrderValue: parseInt(minOrderValueStr, 10) || 0,
      maxDiscount: parseInt(maxDiscountStr, 10) || 0,
      status: form.status,
      expiresAt: (form.expiresAt || "").trim(),
    };

    try {
      if (editingId) {
        const updated = { ...payload, id: editingId };
        await CrudService.update("discounts", updated);
      } else {
        const created = { ...payload, id: `discount-${Date.now()}` };
        await CrudService.create("discounts", created);
      }
      setIsModalOpen(false);
      setError("");
    } catch (err) {
      setError(err.message || "Không lưu được mã giảm giá");
    }
  };

  const handleDelete = async (discountId) => {
    if (!window.confirm("Xoá mã giảm giá này?")) return;

    try {
      await CrudService.delete("discounts", discountId);
    } catch (err) {
      setError(err.message || "Xoá mã giảm giá thất bại");
    }
  };

  const formatDiscountValue = (discount) =>
    discount.type === "percent"
      ? `${discount.value}%`
      : formatCurrency(discount.value);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="flex-1 overflow-y-auto pt-[60px] sm:pt-20 px-3 sm:px-6 max-w-7xl mx-auto pb-10 w-full">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-6">
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => navigate("/")}
              className="text-2xl sm:text-3xl text-gray-600 hover:text-gray-900"
            >
              &larr;
            </button>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900">
                Quản lý Chương trình
              </h1>
              <p className="text-xs sm:text-sm text-gray-500">
                Quản lý mã giảm giá
              </p>
            </div>
          </div>
          <button
            onClick={openCreateModal}
            className="px-3 sm:px-5 py-2 sm:py-3 rounded-lg sm:rounded-xl bg-blue-600 text-white font-semibold text-sm sm:text-base hover:bg-blue-700 whitespace-nowrap"
          >
            Thêm mã giảm giá
          </button>
        </div>

        {error && <div className="mb-4 text-red-600">{error}</div>}

        {isLoading ? (
          <div className="text-center py-16 text-gray-500">Đang tải...</div>
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
                      <p className="text-gray-400">Loại</p>
                      <p className="font-semibold">{discount.type}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Giá trị</p>
                      <p className="font-semibold">
                        {formatDiscountValue(discount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Đơn tối thiểu</p>
                      <p className="font-semibold">
                        {formatCurrency(discount.minOrderValue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Giảm tối đa</p>
                      <p className="font-semibold">
                        {formatCurrency(discount.maxDiscount)}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-gray-400">Hết hạn</p>
                      <p className="font-semibold">
                        {discount.expiresAt || "--"}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={() => openEditModal(discount)}
                      className="flex-1 py-2 rounded-xl bg-blue-50 text-blue-700 font-medium"
                    >
                      Sửa
                    </button>
                    <button
                      onClick={() => handleDelete(discount.id)}
                      className="flex-1 py-2 rounded-xl bg-red-50 text-red-700 font-medium"
                    >
                      Xoá
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
              {editingId ? "Sửa mã giảm giá" : "Thêm mã giảm giá"}
            </h2>
            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl font-medium border border-red-100">
                {error}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-600">
                  Mã giảm giá
                </span>
                <input
                  required
                  className="w-full border rounded-xl px-4 py-3"
                  placeholder="Nhập mã"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-600">
                  Loại giảm giá
                </span>
                <select
                  className="w-full border rounded-xl px-4 py-3"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="fixed">fixed</option>
                  <option value="percent">percent</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-600">
                  Giá trị giảm
                </span>
                <input
                  type="number"
                  className="w-full border rounded-xl px-4 py-3"
                  placeholder="Nhập giá trị"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-600">
                  Giá trị đơn hàng tối thiểu
                </span>
                <input
                  type="number"
                  className="w-full border rounded-xl px-4 py-3"
                  placeholder="Nhập giá tối thiểu"
                  value={form.minOrderValue}
                  onChange={(e) =>
                    setForm({ ...form, minOrderValue: e.target.value })
                  }
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-600">
                  Mức giảm tối đa
                </span>
                <input
                  type="number"
                  className="w-full border rounded-xl px-4 py-3"
                  placeholder="Nhập mức giảm tối đa"
                  value={form.maxDiscount}
                  onChange={(e) =>
                    setForm({ ...form, maxDiscount: e.target.value })
                  }
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
              <label className="space-y-1 col-span-2">
                <span className="text-sm font-medium text-gray-600">
                  Ngày hết hạn
                </span>
                <input
                  type="date"
                  className="w-full border rounded-xl px-4 py-3"
                  value={form.expiresAt}
                  onChange={(e) =>
                    setForm({ ...form, expiresAt: e.target.value })
                  }
                />
              </label>
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
