import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";
import appStore from "../services/AppStore";
import CrudService from "../services/CrudService";
import { discountApi } from "../api/Api";
import { getStoredAuthUser } from "../utils/auth";
import { formatCurrency } from "../utils/helpers";

const emptyDiscount = {
  code: "",
  type: "fixed",
  value: "",
  minOrderValue: "",
  maxDiscount: "",
  usageLimit: "",
  usedCount: 0,
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

  // Confirmation Delete Modal & Toast State
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    const unsubscribe = appStore.subscribe((state) => {
      setStoreState({ ...state });
    });
    return unsubscribe;
  }, []);

  const discounts = useMemo(() => {
    const raw = (storeState.discounts || []).filter((d) => d.status !== "DELETED");
    return [...raw].sort((a, b) => {
      const timeA = new Date(a.createdAt || a.updatedAt || 0).getTime();
      const timeB = new Date(b.createdAt || b.updatedAt || 0).getTime();
      if (timeA && timeB && timeA !== timeB) return timeB - timeA;
      return String(b.id || "").localeCompare(String(a.id || ""));
    });
  }, [storeState.discounts]);
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
      usageLimit:
        discount.usageLimit !== undefined && discount.usageLimit !== null
          ? discount.usageLimit
          : "",
      usedCount: discount.usedCount || 0,
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
    const usageLimitStr = String(
      form.usageLimit !== undefined && form.usageLimit !== null
        ? form.usageLimit
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
    if (form.type === "percent" && Number(valueStr) > 100) {
      setError("Giảm giá theo phần trăm không được vượt quá 100%");
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

    const expiresAtStr = (form.expiresAt || "").trim();
    if (!expiresAtStr) {
      setError("Vui lòng chọn ngày hết hạn (không được để trống)");
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(expiresAtStr);

    if (isNaN(selectedDate.getTime()) || selectedDate < today) {
      setError("Ngày hết hạn không được là ngày trong quá khứ");
      return;
    }

    const payload = {
      code: trimmedCode,
      type: form.type,
      value: parseInt(valueStr, 10) || 0,
      minOrderValue: parseInt(minOrderValueStr, 10) || 0,
      maxDiscount: parseInt(maxDiscountStr, 10) || 0,
      usageLimit: usageLimitStr !== "" ? (parseInt(usageLimitStr, 10) || 0) : null,
      usedCount: Number(form.usedCount || 0),
      status: form.status,
      expiresAt: (form.expiresAt || "").trim(),
    };

    try {
      const nowIso = new Date().toISOString();
      if (editingId) {
        const updated = { ...payload, id: editingId, updatedAt: nowIso };
        await CrudService.update("discounts", updated);
      } else {
        const created = { ...payload, id: `discount-${Date.now()}`, createdAt: nowIso, updatedAt: nowIso };
        await CrudService.create("discounts", created);
      }
      setIsModalOpen(false);
      setError("");
    } catch (err) {
      setError(err.message || "Không lưu được mã giảm giá");
    }
  };

  const promptDeleteDiscount = (discountId) => {
    setDeleteTargetId(discountId);
    setDeleteError("");
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDeleteDiscount = async () => {
    if (!deleteTargetId || isDeleting) return;
    try {
      setIsDeleting(true);
      setDeleteError("");

      await discountApi.deleteDiscount(deleteTargetId, user?.role);

      setToastMessage("Xóa thành công.");
      setIsDeleteModalOpen(false);
      setDeleteTargetId(null);
      setTimeout(() => setToastMessage(""), 3000);
    } catch (err) {
      console.error("Delete discount error:", err);
      setDeleteError(err.message || "Không thể xóa dữ liệu.");
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDiscountValue = (discount) =>
    discount.type === "percent"
      ? `${discount.value}%`
      : formatCurrency(discount.value);

  const formatExpiryDate = (val) => {
    if (!val) return "Không thời hạn";
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

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
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900">
                Quản lý Chương trình
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                Quản lý mã giảm giá
              </p>
            </div>
          </div>
          <button
            onClick={openCreateModal}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 sm:px-5 py-2.5 rounded-xl shadow-md transition"
          >
            + Thêm mã mới
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 font-medium">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-20 text-gray-500">
            Đang tải mã giảm giá...
          </div>
        ) : discounts.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            Chưa có mã giảm giá nào
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {discounts.map((discount) => (
              <div
                key={discount.id}
                className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Code</p>
                      <h3 className="font-mono text-2xl font-bold text-blue-700">
                        {discount.code}
                      </h3>
                    </div>
                    {(() => {
                      const isUsedUp = discount.usageLimit !== undefined && discount.usageLimit !== null && discount.usageLimit !== "" && Number(discount.usedCount || 0) >= Number(discount.usageLimit);
                      return (
                        <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                          isUsedUp
                            ? "bg-amber-100 text-amber-800"
                            : discount.status === "ACTIVE"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-700"
                        }`}>
                          {isUsedUp ? "HẾT LƯỢT" : discount.status}
                        </span>
                      );
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm mt-5">
                    <div>
                      <p className="text-gray-400">Loại</p>
                      <p className="font-semibold">
                        {discount.type === "percent" ? "Phần trăm (%)" : "Số tiền (đ)"}
                      </p>
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
                    <div>
                      <p className="text-gray-400">Số lượng phát hành</p>
                      <p className="font-semibold text-blue-700">
                        {discount.usageLimit !== undefined && discount.usageLimit !== null && discount.usageLimit !== ""
                          ? `${discount.usedCount || 0} / ${discount.usageLimit} lượt`
                          : "Không giới hạn"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Hết hạn</p>
                      <p className="font-semibold text-gray-800">
                        {formatExpiryDate(discount.expiresAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={() => openEditModal(discount)}
                      className="flex-1 py-2 rounded-xl bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 transition cursor-pointer"
                    >
                      Sửa
                    </button>
                    <button
                      onClick={() => promptDeleteDiscount(discount.id)}
                      className="flex-1 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-semibold cursor-pointer transition"
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
                  <option value="fixed">Giảm theo số tiền</option>
                  <option value="percent">Giảm theo phần trăm</option>
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
                  Số lượng phát hành (Lượt dùng)
                </span>
                <input
                  type="number"
                  min="1"
                  className="w-full border rounded-xl px-4 py-3"
                  placeholder="Để trống nếu không giới hạn"
                  value={form.usageLimit}
                  onChange={(e) =>
                    setForm({ ...form, usageLimit: e.target.value })
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
                <span className="text-sm font-medium text-gray-600 flex items-center gap-1">
                  <span>Ngày hết hạn</span>
                  <span className="text-red-500 font-bold">*</span>
                </span>
                <input
                  type="date"
                  required
                  min={new Date().toISOString().split("T")[0]}
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
                className="px-5 py-3 rounded-xl bg-gray-100 cursor-pointer"
              >
                Huỷ
              </button>
              <button
                type="submit"
                className="px-5 py-3 rounded-xl bg-blue-600 text-white font-semibold cursor-pointer"
              >
                Lưu
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmation Delete Modal */}
      <ConfirmDeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!isDeleting) {
            setIsDeleteModalOpen(false);
            setDeleteTargetId(null);
            setDeleteError("");
          }
        }}
        onConfirm={handleConfirmDeleteDiscount}
        title="Xác nhận xóa"
        message="Bạn có chắc chắn muốn xóa mục này không? Hành động này không thể hoàn tác."
        isLoading={isDeleting}
        error={deleteError}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 z-50 animate-bounce text-sm font-bold border border-slate-700">
          <span>✅</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
