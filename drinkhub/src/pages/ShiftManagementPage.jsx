import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { shiftApi } from "../api/Api";
import { formatCurrency } from "../utils/helpers";

export default function ShiftManagementPage() {
  const navigate = useNavigate();
  const [shifts, setShifts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("open");
  const [showNewShiftModal, setShowNewShiftModal] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [openingCash, setOpeningCash] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    shiftApi
      .getShifts()
      .then((data) => {
        if (isMounted) {
          setShifts(Array.isArray(data) ? data : []);
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

  const handleCreateShift = async () => {
    if (!staffName.trim()) {
      alert("Vui lòng nhập tên nhân viên");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const newShift = await shiftApi.createShift({
        staffName: staffName.trim(),
        openingCash: Number(openingCash) || 0,
      });

      setShifts([newShift, ...shifts]);
      setStaffName("");
      setOpeningCash("");
      setShowNewShiftModal(false);
    } catch (err) {
      setError(err.details || err.code || err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openShifts = shifts.filter((s) => s.status === "open");
  const closedShifts = shifts.filter((s) => s.status === "closed");
  const displayShifts = activeTab === "open" ? openShifts : closedShifts;

  const getStatusBadge = (status) => {
    if (status === "open") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          Đang mở
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">
        Đã đóng
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <div className="flex-1 pt-16 pb-20 px-4 md:px-6 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="text-3xl text-gray-600 hover:text-gray-900"
            >
              &larr;
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Quản lý ca</h1>
          </div>

          <button
            onClick={() => setShowNewShiftModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold transition-all"
          >
            + Mở ca mới
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700">
            {error}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setActiveTab("open")}
            className={`px-6 py-3 rounded-2xl font-bold transition-all ${
              activeTab === "open"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            Đang mở ({openShifts.length})
          </button>
          <button
            onClick={() => setActiveTab("closed")}
            className={`px-6 py-3 rounded-2xl font-bold transition-all ${
              activeTab === "closed"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            Đã đóng ({closedShifts.length})
          </button>
        </div>

        {/* Shifts List */}
        {isLoading ? (
          <div className="text-center py-16 text-gray-500">
            Đang tải danh sách ca...
          </div>
        ) : displayShifts.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            Chưa có ca {activeTab === "open" ? "đang mở" : "đã đóng"}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {displayShifts.map((shift) => (
              <button
                key={shift.id}
                onClick={() => navigate(`/shift/${shift.id}`)}
                className="bg-white rounded-3xl p-6 shadow-sm hover:shadow-md border border-gray-200 transition-all text-left active:scale-95"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <p className="text-sm text-gray-500">Nhân viên</p>
                    <p className="text-lg font-bold text-gray-900">
                      {shift.staffName}
                    </p>
                  </div>
                  {getStatusBadge(shift.status)}
                </div>

                <div className="space-y-3 mb-4 pb-4 border-b">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Mở ca lúc</span>
                    <span className="font-medium">
                      {new Date(shift.startTime).toLocaleTimeString("vi-VN")}
                    </span>
                  </div>

                  {shift.endTime && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Đóng ca lúc</span>
                      <span className="font-medium">
                        {new Date(shift.endTime).toLocaleTimeString("vi-VN")}
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Tiền mở ca</p>
                    <p className="text-base font-bold text-emerald-600">
                      {formatCurrency(shift.openingCash)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Doanh thu</p>
                    <p className="text-base font-bold text-blue-600">
                      {formatCurrency(shift.totalRevenue)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* New Shift Modal */}
      {showNewShiftModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl w-full max-w-md mx-4">
            <div className="p-6 border-b">
              <h3 className="text-2xl font-bold">Mở ca mới</h3>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm text-gray-600 mb-2">
                  Tên nhân viên
                </label>
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="Nhập tên nhân viên"
                  className="w-full border rounded-2xl px-4 py-3 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-2">
                  Tiền mở ca
                </label>
                <input
                  type="number"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  placeholder="0"
                  className="w-full border rounded-2xl px-4 py-3 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex border-t">
              <button
                onClick={() => setShowNewShiftModal(false)}
                disabled={isSubmitting}
                className="flex-1 py-4 font-medium text-gray-600 border-r hover:bg-gray-50 disabled:opacity-50 rounded-bl-3xl"
              >
                Hủy
              </button>
              <button
                onClick={handleCreateShift}
                disabled={isSubmitting}
                className="flex-1 py-4 bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-br-3xl"
              >
                {isSubmitting ? "Đang tạo..." : "Tạo ca"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
