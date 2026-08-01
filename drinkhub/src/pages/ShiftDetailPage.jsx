import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import appStore from "../services/AppStore";
import { shiftApi } from "../api/Api";
import { formatCurrency } from "../utils/helpers";
import { getStoredAuthUser } from "../utils/auth";
import { printReceipt } from "../utils/receipt";

export default function ShiftDetailPage() {
  const navigate = useNavigate();
  const { shiftId } = useParams();
  const decodedShiftId = decodeURIComponent(shiftId || "");
  const currentUser = getStoredAuthUser();
  const isAdmin = currentUser?.role === "admin";

  const [storeState, setStoreState] = useState(appStore.getState());
  const [shift, setShift] = useState(null);
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Order Detail Modal
  const [selectedOrder, setSelectedOrder] = useState(null);

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
      setStoreState({ ...state });
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

  const ensureArray = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      try {
        return ensureArray(JSON.parse(val));
      } catch (e) {
        return [];
      }
    }
    if (typeof val === "object") {
      const vals = Object.values(val);
      if (vals.length > 0 && (vals[0]?.productName || vals[0]?.name || vals[0]?.productId || vals[0]?.id)) {
        return vals;
      }
    }
    return [];
  };

  const tableNameMap = useMemo(() => {
    const map = {};
    const tablesList = storeState.tables || [];
    tablesList.forEach((t) => {
      if (t.id) {
        map[String(t.id)] = t.name || `Bàn ${t.id}`;
      }
    });
    return map;
  }, [storeState.tables]);

  const shiftOrders = useMemo(() => {
    if (!shift || !shift.startTime) return [];
    const startTime = new Date(shift.startTime).getTime();
    const endTime = shift.endTime ? new Date(shift.endTime).getTime() : Date.now() + 86400000;
    const allDetails = storeState.orderDetails || [];

    return orders
      .filter((o) => {
        const orderTime = new Date(o.createdAt || o.paidAt || 0).getTime();
        return orderTime >= startTime && orderTime <= endTime;
      })
      .map((o) => {
        const parsedItems = ensureArray(o.items);
        const detailItems = allDetails.filter((d) => String(d.orderId) === String(o.id));
        const items = parsedItems.length > 0 ? parsedItems : detailItems;
        const resolvedTableName =
          o.tableName ||
          tableNameMap[String(o.tableId || "")] ||
          (o.tableId ? (String(o.tableId).startsWith("Bàn") ? o.tableId : `Bàn ${o.tableId}`) : "Khách mang đi");

        return {
          ...o,
          tableName: resolvedTableName,
          items,
        };
      })
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [shift, orders, storeState?.orderDetails, tableNameMap]);

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
      navigate("/ca-lam-viec", { replace: true });
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
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {shiftOrders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-blue-50/60 rounded-2xl border border-gray-100 hover:border-blue-200 transition-all text-left group active:scale-[0.99] cursor-pointer"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900 text-base group-hover:text-blue-600">
                        #{order.id}
                      </p>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          order.paymentStatus === "PAID" || order.status === "CLOSED"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {order.paymentStatus === "PAID" || order.status === "CLOSED"
                          ? "Đã thanh toán"
                          : "Chưa thanh toán"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {order.customerName || "Khách lẻ"} • {order.paymentMethod === "transfer" ? "💳 Chuyển khoản" : "💵 Tiền mặt"}
                      {order.items?.length ? ` • ${order.items.length} món` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-blue-600 text-base">
                      {formatCurrency(order.grandTotal)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center justify-end gap-1">
                      <span>{new Date(order.createdAt).toLocaleTimeString("vi-VN")}</span>
                      <span className="text-blue-500 font-semibold group-hover:underline">Chi tiết &rarr;</span>
                    </p>
                  </div>
                </button>
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

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold">Chi tiết đơn #{selectedOrder.id}</h3>
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                      selectedOrder.paymentStatus === "PAID" || selectedOrder.status === "CLOSED"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    }`}
                  >
                    {selectedOrder.paymentStatus === "PAID" || selectedOrder.status === "CLOSED"
                      ? "Đã thanh toán"
                      : "Chờ thanh toán"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Bàn: <span className="font-bold text-slate-200">{selectedOrder.tableName || selectedOrder.tableId || "Khách mang đi"}</span> • {new Date(selectedOrder.createdAt).toLocaleString("vi-VN")}
                </p>
              </div>

              <button
                onClick={() => setSelectedOrder(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-lg flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {/* Customer & Staff Info */}
              <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3.5 rounded-2xl border border-gray-100 text-xs">
                <div>
                  <span className="text-gray-400 font-medium">Khách hàng:</span>
                  <p className="font-bold text-gray-800 text-sm">{selectedOrder.customerName || "Khách lẻ"}</p>
                </div>
                <div>
                  <span className="text-gray-400 font-medium">Hình thức thanh toán:</span>
                  <p className="font-bold text-gray-800 text-sm">
                    {selectedOrder.paymentMethod === "transfer" ? "💳 Chuyển khoản" : "💵 Tiền mặt"}
                  </p>
                </div>
              </div>

              {/* Items List */}
              <div>
                <h4 className="font-bold text-sm text-gray-800 mb-3">Danh sách món ăn & nước uống</h4>
                {(!selectedOrder.items || selectedOrder.items.length === 0) ? (
                  <p className="text-center text-gray-400 py-6 text-sm">Không có thông tin món ăn</p>
                ) : (
                  <div className="space-y-2.5">
                    {selectedOrder.items.map((item, idx) => {
                      const hasToppings = Array.isArray(item.toppings) && item.toppings.length > 0;
                      const hasNotes = (Array.isArray(item.notes) && item.notes.length > 0) || Boolean(item.customNote);

                      return (
                        <div
                          key={idx}
                          className="bg-gray-50 p-3.5 rounded-2xl border border-gray-100 space-y-1.5"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900 text-sm">
                                {item.productName || item.name || item.title || "Món không tên"}
                              </p>
                              <p className="text-xs text-gray-500">
                                {item.quantity} x {formatCurrency(item.unitPrice || item.price || 0)}
                              </p>
                            </div>
                            <p className="font-bold text-blue-600 text-sm shrink-0 ml-3">
                              {formatCurrency(item.subtotal || item.total || 0)}
                            </p>
                          </div>

                          {/* Toppings */}
                          {hasToppings && (
                            <div className="pl-3 text-xs text-blue-700 space-y-0.5 border-l-2 border-blue-300">
                              {item.toppings.map((top, tIdx) => (
                                <div key={tIdx} className="flex justify-between">
                                  <span>+ {top.name || top.productName} (x{top.quantity || 1})</span>
                                  {Number(top.price || 0) > 0 && (
                                    <span className="font-medium">+{formatCurrency(Number(top.price) * (top.quantity || 1))}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Notes */}
                          {hasNotes && (
                            <div className="pl-3 text-xs text-amber-700 italic border-l-2 border-amber-300">
                              📝 {item.notes?.join(", ")} {item.customNote && `("${item.customNote}")`}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Order Summary */}
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2 text-sm font-medium">
                <div className="flex justify-between text-gray-600">
                  <span>Tạm tính</span>
                  <span>{formatCurrency(selectedOrder.subtotal || selectedOrder.grandTotal)}</span>
                </div>
                {Number(selectedOrder.discount || 0) > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Giảm giá</span>
                    <span>-{formatCurrency(selectedOrder.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t font-bold text-base text-gray-900">
                  <span>Tổng tiền thanh toán</span>
                  <span className="text-blue-600">{formatCurrency(selectedOrder.grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-gray-50 border-t flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  try {
                    const receiptData = {
                      id: selectedOrder.id,
                      items: (selectedOrder.items || []).map((item) => ({
                        name: item.productName || item.name,
                        quantity: item.quantity,
                        price: item.unitPrice || item.price,
                        total: item.subtotal || item.total,
                        toppings: item.toppings || [],
                        notes: item.notes || [],
                        customNote: item.customNote || "",
                      })),
                      subtotal: selectedOrder.subtotal || selectedOrder.grandTotal,
                      discount: selectedOrder.discount || 0,
                      tax: 0,
                      total: selectedOrder.grandTotal,
                    };
                    const tableData = {
                      number: selectedOrder.tableName || selectedOrder.tableId || "N/A",
                      guestCount: "1",
                    };
                    const restaurantData = appStore.get("settings") || {
                      name: "Quán Nước Quỳnh Anh",
                      address: "Địa chỉ nhà hàng",
                      phone: "Số điện thoại",
                    };
                    printReceipt(receiptData, tableData, restaurantData, ["order_slip", "payment_receipt"]);
                  } catch (err) {
                    console.error("Print receipt error:", err);
                  }
                }}
                className="px-4 py-2.5 bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold rounded-2xl text-xs sm:text-sm transition flex items-center gap-1.5"
              >
                🖨️ In lại phiếu & hóa đơn
              </button>

              <button
                onClick={() => setSelectedOrder(null)}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl text-xs sm:text-sm transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
