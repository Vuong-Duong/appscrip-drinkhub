import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import appStore from "../services/AppStore";
import BootstrapService from "../services/BootstrapService";
import CustomerDisplayService from "../services/CustomerDisplayService";
import { tableApi } from "../api/Api";
import { getStoredAuthUser } from "../utils/auth";

const getNormalizedStatus = (status) =>
  String(status || "").trim().toLowerCase();

export default function TablePage() {
  const navigate = useNavigate();
  const [storeState, setStoreState] = useState(appStore.getState());
  const [activeTab, setActiveTab] = useState("ban");
  const [tables, setTables] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [addError, setAddError] = useState("");

  const shifts = Array.isArray(storeState.shifts) ? storeState.shifts : [];
  const hasOpenShift = shifts.some((s) => s.status === "open");

  // Reset customer display to welcome state when entering table dashboard
  useEffect(() => {
    CustomerDisplayService.sendReset();
  }, []);

  useEffect(() => {
    const unsubscribe = appStore.subscribe((state) => {
      setStoreState({ ...state });
      const newTables = Array.isArray(state.tables) ? state.tables : [];
      setTables(newTables);
      // Only show loading if there's NO data yet and global loading is true
      setIsLoading(state.loading && newTables.length === 0);
      setError(state.error || "");
    });

    const initialTables = appStore.get("tables") || [];
    setTables(initialTables);
    // If we have cached data, don't show loading
    setIsLoading(initialTables.length === 0 && appStore.getState().loading);

    return unsubscribe;
  }, []);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      setError("");
      await BootstrapService.forceRefresh();
    } catch (err) {
      setError(err.message || "Tải lại thất bại");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreateTable = async () => {
    const name = newTableName.trim();
    if (!name) { setAddError("Vui lòng nhập tên bàn"); return; }
    setIsCreating(true);
    setAddError("");
    try {
      const newTable = await tableApi.createTable(name);
      // Optimistic update AppStore
      const current = appStore.get("tables") || [];
      appStore.set("tables", [...current, { ...newTable, status: "available" }]);
      setNewTableName("");
      setShowAddModal(false);
    } catch (err) {
      setAddError(err.message || "Tạo bàn thất bại");
    } finally {
      setIsCreating(false);
    }
  };

  const available = tables.filter(
    (t) => getNormalizedStatus(t.status) === "available"
  ).length;
  const occupied = tables.filter(
    (t) => getNormalizedStatus(t.status) === "occupied"
  ).length;

  const getTableStyle = (status) => {
    const norm = getNormalizedStatus(status);
    if (norm === "occupied") {
      return "bg-emerald-100 border-emerald-500 shadow-md";
    }
    if (norm === "reserved") return "bg-amber-100 border-amber-500";
    return "bg-white border-gray-300 hover:border-blue-400 hover:shadow-lg";
  };

  const getTableLabel = (table) => {
    const match = String(table.name || table.id).match(/\d+/);
    return match ? match[0] : table.name || table.id;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <div className="flex-1 overflow-y-auto pt-[60px] sm:pt-16 pb-20 px-3 sm:px-4 md:px-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate("/")}
            className="text-3xl text-gray-600 hover:text-gray-900"
          >
            &larr;
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Khu vực</h1>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div className="inline-flex bg-white rounded-2xl p-1 shadow">
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

          <div className="flex items-center gap-3">
            <button
              onClick={() => { setNewTableName(""); setAddError(""); setShowAddModal(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl px-5 py-3 shadow-sm active:scale-95 transition-all text-sm font-semibold flex items-center gap-2"
            >
              ＋ Thêm bàn
            </button>
            <button
              onClick={handleRefresh}
              className="bg-white border border-gray-200 hover:border-blue-500 hover:text-blue-600 rounded-2xl px-5 py-3 shadow-sm active:scale-95 transition-all text-sm font-medium flex items-center gap-2"
              disabled={isRefreshing}
            >
              {isRefreshing ? "🔄 Đang tải..." : "🔄 Tải lại dữ liệu"}
            </button>

            <div className="text-sm text-gray-500 flex items-center gap-2">
              Bàn có hóa đơn
              <span className="inline-block w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
            </div>
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

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {isLoading && (
            <div className="col-span-full text-center py-16 text-gray-500">
              Đang tải danh sách bàn...
            </div>
          )}

          {!isLoading && tables.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-500">
              Chưa có dữ liệu bàn
            </div>
          )}

          {tables.map((table) => {
            const normStatus = getNormalizedStatus(table.status);
            return (
              <div
                key={table.id}
                onClick={() =>
                  navigate(`/order/${encodeURIComponent(table.id)}`)
                }
                className={`aspect-[1.08] rounded-3xl border-2 flex flex-col items-center justify-center cursor-pointer transition-all active:scale-[0.97] ${getTableStyle(
                  table.status,
                )}`}
              >
                <div className="text-2xl sm:text-4xl lg:text-5xl font-bold text-gray-700 mb-2">
                  {getTableLabel(table)}
                </div>

                {normStatus === "occupied" && (
                  <div className="flex items-center gap-1.5 text-emerald-600 font-medium">
                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span>Đang phục vụ</span>
                  </div>
                )}

                {normStatus === "reserved" && (
                  <div className="text-amber-600 text-sm font-medium">
                    Đặt trước
                  </div>
                )}

                {normStatus === "available" && (
                  <div className="text-gray-400 text-sm">Trống</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Footer />

      {/* Modal tạo bàn mới */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl w-full max-w-sm mx-4 shadow-xl">
            <div className="p-6 border-b">
              <h3 className="text-xl font-bold">Thêm bàn mới</h3>
            </div>
            <div className="p-6">
              <label className="block text-sm text-gray-600 mb-2">Tên bàn</label>
              <input
                type="text"
                value={newTableName}
                onChange={(e) => { setNewTableName(e.target.value); setAddError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleCreateTable()}
                placeholder="VD: Bàn 5, Bàn VIP 1..."
                className="w-full border-2 border-gray-200 focus:border-blue-500 rounded-2xl px-4 py-3 outline-none text-base font-semibold"
                autoFocus
              />
              {addError && (
                <p className="text-sm text-red-600 mt-2">{addError}</p>
              )}
            </div>
            <div className="flex border-t">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-4 font-medium text-gray-600 border-r hover:bg-gray-50 rounded-bl-3xl"
                disabled={isCreating}
              >
                Hủy
              </button>
              <button
                onClick={handleCreateTable}
                disabled={isCreating || !newTableName.trim()}
                className="flex-1 py-4 bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:bg-gray-300 rounded-br-3xl transition"
              >
                {isCreating ? "Đang tạo..." : "Tạo bàn"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Chặn Bán Hàng Khi Chưa Mở Ca */}
      {!hasOpenShift && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl border border-gray-100">
            <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-5 shadow-inner">
              ⏰
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              Chưa mở ca làm việc!
            </h3>
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
              Nhân viên bắt buộc phải nhập số tiền thực tế két đầu ca trước khi chọn bàn và bán hàng.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => navigate("/shift")}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-2xl font-bold transition text-base shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
              >
                <span>⚡ Đến trang Mở ca ngay</span>
              </button>
              <button
                onClick={() => navigate("/")}
                className="w-full py-3 text-gray-500 hover:text-gray-800 font-medium transition text-sm"
              >
                &larr; Quay lại trang chủ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
