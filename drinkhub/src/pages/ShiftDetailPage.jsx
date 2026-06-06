import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import appStore from "../services/AppStore";
import CrudService from "../services/CrudService";
import { formatCurrency } from "../utils/helpers";

export default function ShiftDetailPage() {
  const navigate = useNavigate();
  const { shiftId } = useParams();
  const decodedShiftId = decodeURIComponent(shiftId || "");

  const [shift, setShift] = useState(null);
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [cashInRegister, setCashInRegister] = useState("0");
  const [showCloseModal, setShowCloseModal] = useState(false);

  useEffect(() => {
    const unsubscribe = appStore.subscribe((state) => {
      const foundShift = state.shifts.find((s) => s.id === decodedShiftId);
      setShift(foundShift || null);
      setOrders(Array.isArray(state.orders) ? state.orders : []);
      if (foundShift) {
        setCashInRegister((prev) => {
          if (showCloseModal) return prev;
          return String(foundShift.totalPaid || foundShift.cashInRegister || 0);
        });
      }
      setIsLoading(state.loading);
      setError(state.error || "");
    });

    const initialShifts = appStore.get("shifts") || [];
    const foundShift = initialShifts.find((s) => s.id === decodedShiftId);
    setShift(foundShift || null);
    const initialOrders = appStore.get("orders") || [];
    setOrders(initialOrders);
    if (foundShift) {
      setCashInRegister(
        String(foundShift.totalPaid || foundShift.cashInRegister || 0),
      );
    }
    setIsLoading(appStore.getState().loading);

    return unsubscribe;
  }, [decodedShiftId, showCloseModal]);

  const handleCloseShift = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError("");

    try {
      // Calculate total revenue from orders in this shift
      const shiftOrders = orders.filter((o) => {
        const orderDate = new Date(o.createdAt);
        const shiftDate = new Date(shift.startTime);
        return (
          orderDate.toDateString() === shiftDate.toDateString() &&
          (!shift.endTime || orderDate <= new Date(shift.endTime))
        );
      });

      const totalRevenue = shiftOrders.reduce(
        (sum, o) => sum + Number(o.grandTotal || 0),
        0,
      );

      const totalPaid = Number(cashInRegister) || 0;

      const updatedShift = {
        ...shift,
        status: "closed",
        endTime: new Date().toISOString(),
        totalRevenue,
        totalPaid,
        cashInRegister: totalPaid,
        closedAt: new Date().toISOString(),
      };

      await CrudService.update("shifts", updatedShift);

      setShowCloseModal(false);
    } catch (err) {
      setError(err.message || "Đóng ca thất bại");
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
    const shiftDate = new Date(shift.startTime);
    return (
      orderDate.toDateString() === shiftDate.toDateString() &&
      (!shift.endTime || orderDate <= new Date(shift.endTime))
    );
  });

  const totalRevenue = shiftOrders.reduce(
    (sum, o) => sum + Number(o.grandTotal || 0),
    0,
  );

  const variance = Number(cashInRegister) - totalRevenue;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <div className="flex-1 overflow-y-auto pt-[60px] sm:pt-16 pb-20 px-3 sm:px-4 md:px-6 max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="text-3xl text-gray-600 hover:text-gray-900"
            >
              &larr;
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Chi tiết ca - {shift.staffName}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {new Date(shift.startTime).toLocaleString("vi-VN")}
              </p>
            </div>
          </div>

          {shift.status === "open" && (
            <button
              onClick={() => setShowCloseModal(true)}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-2xl font-bold transition-all"
            >
              Đóng ca
            </button>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700">
            {error}
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {/* Opening Cash */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Tiền mở ca</p>
            <p className="text-2xl font-bold text-emerald-600">
              {formatCurrency(shift.openingCash)}
            </p>
          </div>

          {/* Total Revenue */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Doanh thu</p>
            <p className="text-2xl font-bold text-blue-600">
              {formatCurrency(totalRevenue)}
            </p>
          </div>

          {/* Total Paid */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Tiền nhập vào kết</p>
            <p className="text-2xl font-bold text-purple-600">
              {formatCurrency(Number(cashInRegister) || 0)}
            </p>
          </div>

          {/* Variance */}
          <div
            className={`rounded-2xl p-4 border shadow-sm ${
              variance === 0
                ? "bg-green-50 border-green-200"
                : "bg-amber-50 border-amber-200"
            }`}
          >
            <p className="text-xs text-gray-500 mb-1">Chênh lệch</p>
            <p
              className={`text-2xl font-bold ${
                variance === 0
                  ? "text-green-600"
                  : variance > 0
                    ? "text-amber-600"
                    : "text-red-600"
              }`}
            >
              {formatCurrency(variance)}
            </p>
          </div>
        </div>

        {/* Orders Section */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-200 mb-8">
          <h2 className="text-lg font-bold mb-4">
            Danh sách đơn hàng ({shiftOrders.length})
          </h2>

          {shiftOrders.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              Chưa có đơn hàng trong ca này
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {shiftOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div>
                    <p className="font-semibold text-gray-800">{order.id}</p>
                    <p className="text-xs text-gray-500">
                      {order.customerName || "Khách lẻ"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-800">
                      {formatCurrency(order.grandTotal)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(order.createdAt).toLocaleTimeString("vi-VN")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status Section */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">Trạng thái ca</p>
            {shift.status === "open" ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Đang mở
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">
                Đã đóng - {new Date(shift.closedAt).toLocaleTimeString("vi-VN")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Close Shift Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl w-full max-w-md mx-4">
            <div className="p-6 border-b">
              <h3 className="text-2xl font-bold">Đóng ca</h3>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm text-gray-600 mb-2">
                  Tiền trong kết
                </label>
                <input
                  type="number"
                  value={cashInRegister}
                  onChange={(e) => setCashInRegister(e.target.value)}
                  placeholder="0"
                  className="w-full border rounded-2xl px-4 py-3 focus:outline-none focus:border-blue-500 text-lg font-bold"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Doanh thu dự kiến: {formatCurrency(totalRevenue)}
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <p className="text-sm font-medium text-blue-900">
                  Chênh lệch:{" "}
                  {formatCurrency(Number(cashInRegister) - totalRevenue)}
                </p>
              </div>
            </div>
            <div className="flex border-t">
              <button
                onClick={() => setShowCloseModal(false)}
                disabled={isSubmitting}
                className="flex-1 py-4 font-medium text-gray-600 border-r hover:bg-gray-50 disabled:opacity-50 rounded-bl-3xl"
              >
                Hủy
              </button>
              <button
                onClick={handleCloseShift}
                disabled={isSubmitting}
                className="flex-1 py-4 bg-red-600 text-white font-medium hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-br-3xl"
              >
                {isSubmitting ? "Đang xử lý..." : "Xác nhận đóng ca"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
