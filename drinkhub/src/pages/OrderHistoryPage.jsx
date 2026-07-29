import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { formatCurrency, formatDate } from "../utils/helpers";
import { printReceipt } from "../utils/receipt";
import appStore from "../services/AppStore";
import { orderApi } from "../api/Api";
import { getStoredAuthUser } from "../utils/auth";

const formatDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN");
};

export default function OrderHistoryPage() {
  const navigate = useNavigate();
  const currentUser = getStoredAuthUser();
  const isAdmin = currentUser?.role === "admin";

  const [filter, setFilter] = useState({
    staff: "",
    table: "",
    item: "",
    orderCode: "",
    paymentMethod: "",
  });
  const [storeState, setStoreState] = useState(appStore.getState());
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const storeInfo = storeState.settings || {};

  // Subscribe to AppStore changes
  useEffect(() => {
    const unsubscribe = appStore.subscribe((state) => {
      setStoreState({ ...state });
    });
    return unsubscribe;
  }, []);

  const orders = useMemo(() => {
    const allOrders = storeState.orders || [];
    const allDetails = storeState.orderDetails || [];

    return allOrders
      .map((order) => {
        const items = allDetails.filter((d) => d.orderId === order.id);
        const orderItems = order.items && order.items.length > 0 ? order.items : items;
        return {
          ...order,
          items: orderItems,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [storeState.orders, storeState.orderDetails]);

  const isLoading = storeState.loading;

  const handleReprint = (order, type) => {
    const receiptData = {
      id: order.id,
      items: (order.items || []).map((item) => ({
        name: item.productName,
        quantity: item.quantity,
        price: item.unitPrice,
        total: item.subtotal,
      })),
      subtotal: order.subtotal,
      discount: order.discount,
      tax: 0,
      total: order.grandTotal,
      createdBy: order.createdBy,
      createdAt: order.createdAt,
      paymentMethod: order.paymentMethod || "cash",
    };

    const tableData = {
      number: order.tableId ? `Bàn ${order.tableId}` : "N/A",
      guestCount: "1",
    };

    const restaurantData = storeInfo || {
      name: "Quán Nước Quỳnh Anh",
      address: "Địa chỉ nhà hàng",
      phone: "Số điện thoại",
    };

    printReceipt(receiptData, tableData, restaurantData, type);
  };

  const handleDeleteOrder = async (orderId) => {
    if (!isAdmin) {
      alert("Chỉ tài khoản Admin/Owner mới có quyền xóa đơn hàng!");
      return;
    }

    if (!window.confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN đơn hàng ${orderId}?\n\nLưu ý: Thao tác này không thể hoàn tác và báo cáo doanh thu sẽ được cập nhật tự động.`)) {
      return;
    }

    try {
      setDeletingId(orderId);
      setError("");
      await orderApi.deleteOrder(orderId);
    } catch (err) {
      setError(err.message || "Xóa đơn hàng thất bại!");
    } finally {
      setDeletingId(null);
    }
  };

  const staffOptions = useMemo(
    () =>
      Array.from(
        new Set(orders.map((order) => order.createdBy).filter(Boolean)),
      ),
    [orders],
  );

  const tableOptions = useMemo(
    () =>
      Array.from(new Set(orders.map((order) => order.tableId).filter(Boolean))),
    [orders],
  );

  const filteredOrders = orders.filter((order) => {
    const itemKeyword = filter.item.trim().toLowerCase();
    const orderKeyword = filter.orderCode.trim().toLowerCase();
    const hasItem =
      !itemKeyword ||
      order.items?.some((item) =>
        String(item.productName || "")
          .toLowerCase()
          .includes(itemKeyword),
      );
    const matchesPayment =
      !filter.paymentMethod ||
      (filter.paymentMethod === "transfer"
        ? order.paymentMethod === "transfer"
        : order.paymentMethod !== "transfer");

    return (
      (!filter.staff || order.createdBy === filter.staff) &&
      (!filter.table || String(order.tableId) === String(filter.table)) &&
      (!orderKeyword ||
        String(order.id).toLowerCase().includes(orderKeyword)) &&
      hasItem &&
      matchesPayment
    );
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <div className="flex-1 overflow-y-auto pt-[60px] sm:pt-16 p-3 sm:p-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="text-3xl text-gray-600 hover:text-gray-900"
          >
            &larr;
          </button>
          <h1 className="text-2xl font-bold">Nhật ký Order</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
          <div className="flex flex-wrap gap-4">
            <div>
              <p className="text-sm text-gray-500 mb-1">Hôm nay</p>
              <div className="bg-gray-100 text-gray-700 px-5 py-2.5 rounded-xl font-medium">
                {formatDate(new Date())}
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-1">Nhân viên</p>
              <select
                className="border rounded-xl px-4 py-2.5 w-40 focus:outline-none focus:border-blue-500"
                value={filter.staff}
                onChange={(e) =>
                  setFilter({ ...filter, staff: e.target.value })
                }
              >
                <option value="">Tất cả</option>
                {staffOptions.map((staff) => (
                  <option key={staff} value={staff}>
                    {staff}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-1">Bàn</p>
              <select
                className="border rounded-xl px-4 py-2.5 w-32 focus:outline-none focus:border-blue-500"
                value={filter.table}
                onChange={(e) =>
                  setFilter({ ...filter, table: e.target.value })
                }
              >
                <option value="">Tất cả</option>
                {tableOptions.map((table) => (
                  <option key={table} value={table}>
                    {table}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-1">Món</p>
              <input
                type="text"
                value={filter.item}
                placeholder="Tìm món..."
                className="border rounded-xl px-4 py-2.5 w-52 focus:outline-none focus:border-blue-500"
                onChange={(e) => setFilter({ ...filter, item: e.target.value })}
              />
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-1">Mã đơn hàng</p>
              <input
                type="text"
                value={filter.orderCode}
                placeholder="Nhập mã..."
                className="border rounded-xl px-4 py-2.5 w-52 focus:outline-none focus:border-blue-500"
                onChange={(e) =>
                  setFilter({ ...filter, orderCode: e.target.value })
                }
              />
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-1">Thanh toán</p>
              <div className="flex gap-2">
                {[
                  { value: "cash", label: "💵 Tiền mặt" },
                  { value: "transfer", label: "📱 Chuyển khoản" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() =>
                      setFilter({
                        ...filter,
                        paymentMethod:
                          filter.paymentMethod === opt.value ? "" : opt.value,
                      })
                    }
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition ${
                      filter.paymentMethod === opt.value
                        ? opt.value === "transfer"
                          ? "border-violet-500 bg-violet-50 text-violet-700"
                          : "border-slate-500 bg-slate-50 text-slate-700"
                        : "border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 mt-4 font-bold">{error}</p>}
        </div>

        <div className="space-y-4">
          {isLoading && (
            <div className="text-center py-20 text-gray-400">
              Đang tải nhật ký order...
            </div>
          )}

          {!isLoading &&
            filteredOrders.map((order) => (
              <div
                key={order.id}
                className="bg-white rounded-3xl shadow-sm p-6 hover:shadow transition border border-gray-100"
              >
                <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-4 pb-4 border-b">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-lg text-blue-600">
                        {order.id}
                      </span>
                      <span className="bg-gray-100 text-gray-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                        {order.tableId ? `Bàn ${order.tableId}` : "Mang về"}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          order.status === "CLOSED"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {order.status === "CLOSED"
                          ? "Hoàn tất"
                          : "Đang phục vụ"}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          order.paymentStatus === "PAID"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {order.paymentStatus === "PAID"
                          ? "Đã thanh toán"
                          : "Chưa thanh toán"}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          order.paymentMethod === "transfer"
                            ? "bg-violet-100 text-violet-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {order.paymentMethod === "transfer"
                          ? "Chuyển khoản"
                          : "Tiền mặt"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-2 font-medium">
                      Thu ngân:{" "}
                      <span className="text-gray-800 font-semibold">
                        {order.createdBy || "--"}
                      </span>{" "}
                      &bull; Giờ:{" "}
                      <span className="text-gray-800 font-semibold">
                        {formatDateTime(order.createdAt)}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2.5 items-center">
                    <button
                      onClick={() => handleReprint(order, "order_slip")}
                      className="bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer"
                    >
                      🖨️ In Phiếu Đặt Đồ
                    </button>
                    <button
                      onClick={() => handleReprint(order, "payment_receipt")}
                      className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-semibold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer"
                    >
                      🖨️ In Hóa Đơn
                    </button>

                    {/* Nút XÓA ORDER CHỈ HÌNH THÀNH KHI DÙNG VỚI TÀI KHOẢN ADMIN */}
                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteOrder(order.id)}
                        disabled={deletingId === order.id}
                        className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer disabled:opacity-50"
                      >
                        {deletingId === order.id ? "Đang xóa..." : "🗑️ Xóa Order"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Items Detail Table */}
                <div className="mt-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Chi tiết đơn hàng
                  </p>
                  <div className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-100">
                    <table className="w-full text-sm text-left border-collapse">
                      <thead className="bg-gray-100/70 text-gray-600 font-bold border-b text-xs">
                        <tr>
                          <th className="px-4 py-2.5">Tên món</th>
                          <th className="px-4 py-2.5 text-center w-16">SL</th>
                          <th className="px-4 py-2.5 text-right w-24">
                            Đơn giá
                          </th>
                          <th className="px-4 py-2.5 text-right w-28">
                            Thành tiền
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-gray-600">
                        {order.items?.map((item, idx) => (
                          <tr
                            key={item.id || idx}
                            className="hover:bg-gray-100/30 transition"
                          >
                            <td className="px-4 py-3 font-medium text-gray-800">
                              {item.productName}
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-gray-900">
                              {item.quantity}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {formatCurrency(item.unitPrice)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-gray-900">
                              {formatCurrency(item.subtotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Billing Summary block */}
                <div className="mt-4 flex flex-col items-end gap-1.5 text-sm">
                  <div className="flex justify-between w-64 text-gray-500">
                    <span>Tạm tính:</span>
                    <span className="font-semibold text-gray-700">
                      {formatCurrency(order.subtotal)}
                    </span>
                  </div>
                  {order.discount > 0 && (
                    <div className="flex justify-between w-64 text-red-600 font-medium">
                      <span>Giảm giá:</span>
                      <span>-{formatCurrency(order.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between w-64 font-bold text-base text-gray-900 border-t pt-2 mt-1">
                    <span>Tổng cộng:</span>
                    <span className="text-emerald-600">
                      {formatCurrency(order.grandTotal)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
        </div>

        {!isLoading && filteredOrders.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            Không tìm thấy đơn hàng nào
          </div>
        )}
      </div>
    </div>
  );
}
