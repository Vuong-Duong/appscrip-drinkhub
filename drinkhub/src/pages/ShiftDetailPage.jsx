import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import appStore from "../services/AppStore";
import { shiftApi } from "../api/Api";
import { formatCurrency } from "../utils/helpers";
import { getStoredAuthUser } from "../utils/auth";

export default function ShiftDetailPage() {
  const navigate = useNavigate();
  const { shiftId } = useParams();
  const decodedShiftId = decodeURIComponent(shiftId || "");
  const currentUser = getStoredAuthUser();
  const isAdmin = currentUser?.role === "admin";

  const [shift, setShift] = useState(null);
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Close shift inputs
  const [actualClosingCashInput, setActualClosingCashInput] = useState("");
  const [showCloseModal, setShowCloseModal] = useState(false);

  // Cash Adjustment Modal (ADMIN ONLY)
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjAmountInput, setAdjAmountInput] = useState("");
  const [adjType, setAdjType] = useState("withdraw"); // "withdraw" (-), "deposit" (+)
  const [adjReason, setAdjReason] = useState("");
  const [adjError, setAdjError] = useState("");

  useEffect(() => {
    const unsubscribe = appStore.subscribe((state) => {
      const foundShift = state.shifts.find((s) => s.id === decodedShiftId);
      setShift(foundShift || null);
      setOrders(Array.isArray(state.orders) ? state.orders : []);
      if (foundShift && !showCloseModal) {
        setActualClosingCashInput(String(foundShift.actualClosingCash || foundShift.cashAmount || 0));
      }
      setIsLoading(state.loading);
      setError(state.error || "");
    });

    const initialShifts = appStore.get("shifts") || [];
    const foundShift = initialShifts.find((s) => s.id === decodedShiftId);
    setShift(foundShift || null);
    setOrders(appStore.get("orders") || []);
    if (foundShift) {
      setActualClosingCashInput(String(foundShift.actualClosingCash || foundShift.cashAmount || 0));
    }
    setIsLoading(appStore.getState().loading);

    return unsubscribe;
  }, [decodedShiftId, showCloseModal]);

  // Handle Close Shift (Staff enters actual closing cash)
  const handleCloseShift = async () => {
    if (isSubmitting) return;
    const closingCashVal = parseFloat(actualClosingCashInput);

    if (isNaN(closingCashVal) || closingCashVal < 0) {
      setError("Vui lòng nhập tiền thực tế cuối ca hợp lệ (số không âm)");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await shiftApi.closeShift(shift.id, {
        actualClosingCash: closingCashVal,
        endTime: new Date().toISOString(),
      });

      setShowCloseModal(false);
    } catch (err) {
      setError(err.message || "Đóng ca thất bại");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Add Cash Adjustment (Admin Rút/Nạp két)
  const handleAddAdjustment = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      setAdjError("Chỉ Admin mới có quyền thực hiện rút/nạp két tiền");
      return;
    }
    const rawVal = parseFloat(adjAmountInput);
    if (isNaN(rawVal) || rawVal <= 0) {
      setAdjError("Vui lòng nhập số tiền điều chỉnh hợp lệ (> 0)");
      return;
    }
    if (!adjReason.trim()) {
      setAdjError("Vui lòng nhập lý do rút/nạp tiền");
      return;
    }

    const finalAmount = adjType === "withdraw" ? -Math.abs(rawVal) : Math.abs(rawVal);

    try {
      setIsSubmitting(true);
      setAdjError("");
      await shiftApi.addCashAdjustment({
        shiftId: shift.id,
        amount: finalAmount,
        reason: adjReason.trim(),
        createdBy: currentUser?.username || "Admin",
      });
      setShowAdjModal(false);
      setAdjAmountInput("");
      setAdjReason("");
    } catch (err) {
      setAdjError(err.message || "Ghi nhận rút/nạp két thất bại");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Đang tải chi tiết ca...
        </div>
        <Footer />
      </div>
    );
  }

  if (!shift) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
          <p className="text-xl font-bold">Ca không tồn tại</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 text-blue-600 hover:underline"
          >
            Quay lại
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  const shiftOrders = orders.filter((o) => {
    const orderDate = new Date(o.createdAt);
    const shiftStart = new Date(shift.startTime);
    const shiftEnd = shift.endTime ? new Date(shift.endTime) : new Date();
    return orderDate >= shiftStart && orderDate <= shiftEnd;
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <div className="flex-1 overflow-y-auto pt-[60px] sm:pt-16 pb-20 px-3 sm:px-4 md:px-6 max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="text-3xl text-gray-600 hover:text-gray-900"
            >
              &larr;
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Ca làm việc - {shift.staffName}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Bắt đầu: {new Date(shift.startTime).toLocaleString("vi-VN")}
                {shift.endTime && ` • Kết thúc: ${new Date(shift.endTime).toLocaleString("vi-VN")}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {shift.status === "open" && (
              <>
                {/* Nút Rút/Nạp két CHỈ ADMIN MỚI NHÌN THẤY VÀ DÙNG ĐƯỢC */}
                {isAdmin && (
                  <button
                    onClick={() => setShowAdjModal(true)}
                    className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-4 py-2.5 rounded-2xl font-bold text-sm transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    💸 Rút / Nạp két (Admin)
                  </button>
                )}

                <button
                  onClick={() => setShowCloseModal(true)}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-2xl font-bold text-sm transition-all shadow-sm cursor-pointer"
                >
                  Đóng ca
                </button>
              </>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 font-medium">
            {error}
          </div>
        )}

        {/* Staff View Info Cards (Thực tế duy nhất) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500 font-semibold uppercase mb-1">
              Tiền thực tế đầu ca (Nhân viên đếm)
            </p>
            <p className="text-2xl font-bold text-emerald-600">
              {formatCurrency(shift.actualOpeningCash ?? shift.openingCash)}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500 font-semibold uppercase mb-1">
              Tiền thực tế cuối ca {shift.status === "open" ? "(Chưa đóng ca)" : "(Nhân viên đếm)"}
            </p>
            <p className="text-2xl font-bold text-blue-600">
              {shift.status === "open"
                ? "Đang bán hàng..."
                : formatCurrency(shift.actualClosingCash ?? shift.cashAmount)}
            </p>
          </div>
        </div>

        {/* Orders in Shift list (Basic overview) */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-200 mb-8">
          <h2 className="text-lg font-bold mb-4">
            Đơn hàng ghi nhận trong ca ({shiftOrders.length})
          </h2>

          {shiftOrders.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              Chưa có đơn hàng nào trong khoảng thời gian ca này
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {shiftOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex justify-between items-center p-3.5 bg-gray-50 rounded-xl border border-gray-100"
                >
                  <div>
                    <p className="font-bold text-gray-800">{order.id}</p>
                    <p className="text-xs text-gray-500">
                      {order.customerName || "Khách lẻ"} • {order.paymentMethod === "transfer" ? "💳 Chuyển khoản" : "💵 Tiền mặt"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">
                      {formatCurrency(order.grandTotal)}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(order.createdAt).toLocaleTimeString("vi-VN")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status Section */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-600">Trạng thái ca</p>
          {shift.status === "open" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Đang mở
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-bold">
              Đã kết thúc
            </span>
          )}
        </div>
      </div>

      {/* Close Shift Modal - NO EXPECTED CASH VISIBLE TO STAFF */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">🔒 Kết thúc ca làm việc</h3>
              <p className="text-xs text-gray-500 mt-1">
                Vui lòng đếm lại toàn bộ tiền mặt thực tế đang có trong két trước khi đóng ca.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">
                  💵 Tiền thực tế trong két cuối ca <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  autoFocus
                  value={actualClosingCashInput}
                  onChange={(e) => setActualClosingCashInput(e.target.value)}
                  placeholder="Nhập số tiền đếm được..."
                  className="w-full border-2 border-blue-500 rounded-2xl px-4 py-3 focus:outline-none text-xl font-bold text-blue-900 bg-white"
                />
              </div>

              {error && (
                <p className="text-sm font-semibold text-red-600">{error}</p>
              )}
            </div>

            <div className="flex border-t border-gray-100">
              <button
                onClick={() => setShowCloseModal(false)}
                disabled={isSubmitting}
                className="flex-1 py-4 font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={handleCloseShift}
                disabled={isSubmitting}
                className="flex-1 py-4 bg-red-600 text-white font-bold hover:bg-red-700 disabled:bg-gray-300 transition"
              >
                {isSubmitting ? "Đang xử lý..." : "Xác nhận đóng ca"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash Adjustment Modal - CHỈ ADMIN MỚI MỞ VÀ SỬ DỤNG ĐƯỢC */}
      {showAdjModal && isAdmin && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">👑 Admin Rút / Nạp két tiền mặt</h3>
              <p className="text-xs text-gray-500 mt-1">
                Ghi nhận chi tiêu lẻ từ két hoặc nạp thêm tiền lẻ vào két (Chỉ Admin).
              </p>
            </div>

            <form onSubmit={handleAddAdjustment} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">
                  Loại thao tác
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjType("withdraw")}
                    className={`py-2.5 rounded-xl font-bold text-sm transition ${
                      adjType === "withdraw"
                        ? "bg-red-600 text-white shadow-sm"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    ➖ Rút / Chi tiền két
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjType("deposit")}
                    className={`py-2.5 rounded-xl font-bold text-sm transition ${
                      adjType === "deposit"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    ➕ Nạp thêm tiền két
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">
                  Số tiền (VNĐ) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={adjAmountInput}
                  onChange={(e) => setAdjAmountInput(e.target.value)}
                  placeholder="Ví dụ: 150000"
                  className="w-full border border-gray-200 focus:border-blue-500 rounded-xl px-4 py-3 font-bold text-lg outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">
                  Lý do <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="Ví dụ: Mua đá lạnh, Giấy in bill, Rút bớt tiền mặt..."
                  className="w-full border border-gray-200 focus:border-blue-500 rounded-xl px-4 py-3 font-semibold text-sm outline-none"
                />
              </div>

              {adjError && (
                <p className="text-sm font-semibold text-red-600">{adjError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjModal(false)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition shadow-md disabled:bg-gray-300"
                >
                  {isSubmitting ? "Đang ghi..." : "Xác nhận Rút/Nạp"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
