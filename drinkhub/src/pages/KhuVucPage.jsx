import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { tableApi } from "../api/Api";

export default function TablePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("ban");
  const [tables, setTables] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    tableApi
      .getTables()
      .then((data) => {
        if (isMounted) {
          setTables(Array.isArray(data) ? data : []);
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

  const available = tables.filter((t) => t.status === "available").length;
  const occupied = tables.filter((t) => t.status === "occupied").length;

  const getTableStyle = (status) => {
    if (status === "occupied") {
      return "bg-emerald-100 border-emerald-500 shadow-md";
    }
    if (status === "reserved") return "bg-amber-100 border-amber-500";
    return "bg-white border-gray-300 hover:border-blue-400 hover:shadow-lg";
  };

  const getTableLabel = (table) => {
    const match = String(table.name || table.id).match(/\d+/);
    return match ? match[0] : table.name || table.id;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <div className="flex-1 pt-16 pb-20 px-4 md:px-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 rounded-xl bg-white border border-gray-200 shadow-sm hover:bg-gray-100"
          >
            Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Quan ly khu vuc</h1>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div className="inline-flex bg-white rounded-2xl p-1 shadow">
            <button
              onClick={() => setActiveTab("hoadon")}
              className={`px-10 py-3 rounded-xl font-medium transition-all ${
                activeTab === "hoadon"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Hóa đơn
            </button>
            <button
              onClick={() => setActiveTab("ban")}
              className={`px-10 py-3 rounded-xl font-medium transition-all ${
                activeTab === "ban"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Bàn
            </button>
          </div>

          <div className="text-sm text-gray-500 flex items-center gap-2">
            Bàn có hóa đơn
            <span className="inline-block w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 mb-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-gray-600 text-sm">Toàn bộ nhà hàng</p>
            <p className="text-lg font-semibold text-gray-800">
              Trống {available} Bàn - Bàn Trống: {available} Bàn
            </p>
            {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">
              Tổng số bàn:{" "}
              <span className="font-bold text-xl">{tables.length}</span>
            </p>
            <p className="text-emerald-600 font-medium">
              Đang phục vụ: {occupied} bàn
            </p>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4">
          {isLoading && (
            <div className="col-span-5 text-center py-16 text-gray-500">
              Đang tải danh sách bàn...
            </div>
          )}

          {!isLoading && tables.length === 0 && (
            <div className="col-span-5 text-center py-16 text-gray-500">
              Chưa có dữ liệu bàn
            </div>
          )}

          {tables.map((table) => (
            <div
              key={table.id}
              onClick={() => navigate(`/order/${encodeURIComponent(table.id)}`)}
              className={`aspect-[1.08] rounded-3xl border-2 flex flex-col items-center justify-center cursor-pointer transition-all active:scale-[0.97] ${getTableStyle(table.status)}`}
            >
              <div className="text-5xl font-bold text-gray-700 mb-2">
                {getTableLabel(table)}
              </div>

              {table.status === "occupied" && (
                <div className="flex items-center gap-1.5 text-emerald-600 font-medium">
                  <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span>Đang phục vụ</span>
                </div>
              )}

              {table.status === "reserved" && (
                <div className="text-amber-600 text-sm font-medium">
                  Đặt trước
                </div>
              )}

              {table.status === "available" && (
                <div className="text-gray-400 text-sm">Trống</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t py-4 px-6 flex items-center justify-between text-sm z-40 shadow">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-100 rounded-2xl flex items-center justify-center text-xl">
            #
          </div>
          <div>
            <p className="font-medium">Khu vực</p>
            <p className="text-xs text-gray-500">Danh sách bàn từ sheet</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-100 rounded-2xl flex items-center justify-center text-xl">
            POS
          </div>
          <div>
            <p className="font-medium">Nhà Hàng</p>
            <p className="font-mono text-blue-600">{tables.length} bàn</p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
