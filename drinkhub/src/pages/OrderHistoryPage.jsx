import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { orderApi } from "../api/Api";
import { formatCurrency, formatDate } from "../utils/helpers";

const formatDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN");
};

const formatItemTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function OrderHistoryPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState({
    staff: "",
    table: "",
    item: "",
    orderCode: "",
  });
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    orderApi
      .getOrders({ limit: 200 })
      .then((data) => {
        if (isMounted) {
          setOrders(Array.isArray(data) ? data : []);
          setError("");
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.details || err.code || err.message);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const staffOptions = useMemo(
    () => Array.from(new Set(orders.map((order) => order.createdBy).filter(Boolean))),
    [orders],
  );

  const tableOptions = useMemo(
    () => Array.from(new Set(orders.map((order) => order.tableId).filter(Boolean))),
    [orders],
  );

  const filteredOrders = orders.filter((order) => {
    const itemKeyword = filter.item.trim().toLowerCase();
    const orderKeyword = filter.orderCode.trim().toLowerCase();
    const hasItem =
      !itemKeyword ||
      order.items?.some((item) =>
        String(item.productName || "").toLowerCase().includes(itemKeyword),
      );

    return (
      (!filter.staff || order.createdBy === filter.staff) &&
      (!filter.table || order.tableId === filter.table) &&
      (!orderKeyword || String(order.id).toLowerCase().includes(orderKeyword)) &&
      hasItem
    );
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="pt-16 p-6 max-w-7xl mx-auto">
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
          </div>
          {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
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
                className="bg-white rounded-2xl shadow-sm p-6 hover:shadow transition"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-mono font-bold text-lg text-blue-600">
                      {order.id} - {order.tableId || "Mang về"} - Bàn
                    </p>
                    <p className="text-sm text-gray-600">
                      TN: {order.createdBy || "--"} - {formatDateTime(order.createdAt)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {order.status} / {order.paymentStatus} -{" "}
                      {formatCurrency(order.grandTotal)}
                    </p>
                  </div>
                  <button className="text-blue-600 hover:text-blue-700 font-medium text-sm">
                    In lại phiếu yêu cầu
                  </button>
                </div>

                <div className="space-y-3 pl-4 border-l-2 border-gray-200">
                  {order.items?.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <span className="text-gray-400">({item.quantity})</span>
                      <span className="font-medium">{item.productName}</span>
                      <span className="text-gray-500 text-sm">
                        - {formatItemTime(order.createdAt)}
                      </span>
                    </div>
                  ))}
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
