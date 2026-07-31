import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { shiftApi } from "../api/Api";
import { formatCurrency } from "../utils/helpers";
import { getStoredAuthUser } from "../utils/auth";

export default function ShiftReconciliationPage() {
  const navigate = useNavigate();
  const currentUser = getStoredAuthUser();

  const [reconciliations, setReconciliations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [range, setRange] = useState("today");
  const [staffFilter, setStaffFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Selected Detail Modal for Admin
  const [selectedShift, setSelectedShift] = useState(null);

  const fetchReconciliations = async () => {
    try {
      setLoading(true);
      setError("");
      const filters = {
        range,
        staffName: staffFilter,
        reconciliationStatus: statusFilter,
        customStart: range === "custom" ? customStart : null,
        customEnd: range === "custom" ? customEnd : null,
      };
      const data = await shiftApi.getReconciliation(filters);
      const sortedData = (Array.isArray(data) ? data : []).sort((a, b) => {
        const timeA = new Date(a.shiftEndTime || a.shiftStartTime || a.createdAt || 0).getTime();
        const timeB = new Date(b.shiftEndTime || b.shiftStartTime || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      setReconciliations(sortedData);
    } catch (err) {
      setError(err.message || "Không thể tải dữ liệu đối chiếu tiền mặt ca");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReconciliations();
  }, [range, staffFilter, statusFilter, customStart, customEnd]);

  // Unique staff list for filter
  const staffList = useMemo(() => {
    const set = new Set();
    reconciliations.forEach((r) => {
      if (r.staffName) set.add(r.staffName);
    });
    return Array.from(set);
  }, [reconciliations]);

  // Summary Metrics
  const summary = useMemo(() => {
    let matchedCount = 0;
    let shortageCount = 0;
    let shortageTotal = 0;
    let excessCount = 0;
    let excessTotal = 0;

    reconciliations.forEach((r) => {
      if (r.reconciliationStatus === "KHOP") {
        matchedCount++;
      } else if (r.reconciliationStatus === "THIEU") {
        shortageCount++;
        shortageTotal += Math.abs(r.difference);
      } else if (r.reconciliationStatus === "DU") {
        excessCount++;
        excessTotal += Math.abs(r.difference);
      }
    });

    return {
      totalShifts: reconciliations.length,
      matchedCount,
      shortageCount,
      shortageTotal,
      excessCount,
      excessTotal,
    };
  }, [reconciliations]);

  const formatDate = (isoStr) => {
    if (!isoStr) return "--";
    try {
      const d = new Date(isoStr);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const hours = String(d.getHours()).padStart(2, "0");
      const mins = String(d.getMinutes()).padStart(2, "0");
      return `${day}/${month} ${hours}:${mins}`;
    } catch {
      return isoStr;
    }
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case "KHOP":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold">
            🟢 Khớp 100%
          </span>
        );
      case "THIEU":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">
            🔴 Thiếu két
          </span>
        );
      case "DU":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">
            🟠 Dư két
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-bold">
            ⚪ Ca đang mở
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="flex-1 overflow-y-auto pt-[60px] sm:pt-20 px-3 sm:px-6 max-w-7xl mx-auto pb-12 w-full">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate("/")}
            className="text-3xl text-gray-600 hover:text-gray-900 transition"
          >
            &larr;
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              🔍 Đối chiếu tiền mặt theo ca (Chủ/Admin)
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              So sánh Tiền thực tế nhân viên đếm với Tiền hệ thống tính từ Order CASH + Rút/Nạp két
            </p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase">Tổng số ca đối chiếu</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.totalShifts}</p>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl shadow-sm">
            <p className="text-xs font-semibold text-emerald-700 uppercase">Ca khớp 100%</p>
            <p className="text-2xl font-bold text-emerald-800 mt-1">{summary.matchedCount} ca</p>
          </div>

          <div className="bg-red-50 border border-red-200 p-4 rounded-2xl shadow-sm">
            <p className="text-xs font-semibold text-red-700 uppercase">Ca thiếu tiền</p>
            <p className="text-2xl font-bold text-red-800 mt-1">
              {summary.shortageCount} ca{" "}
              {summary.shortageTotal > 0 && (
                <span className="text-sm font-semibold text-red-600 block">
                  (-{formatCurrency(summary.shortageTotal)})
                </span>
              )}
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl shadow-sm">
            <p className="text-xs font-semibold text-amber-700 uppercase">Ca dư tiền</p>
            <p className="text-2xl font-bold text-amber-800 mt-1">
              {summary.excessCount} ca{" "}
              {summary.excessTotal > 0 && (
                <span className="text-sm font-semibold text-amber-600 block">
                  (+{formatCurrency(summary.excessTotal)})
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Range */}
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Thời gian</label>
              <select
                value={range}
                onChange={(e) => setRange(e.target.value)}
                className="px-3 py-2 bg-gray-100 border border-transparent focus:border-blue-500 rounded-xl font-bold text-sm outline-none"
              >
                <option value="today">Hôm nay</option>
                <option value="yesterday">Hôm qua</option>
                <option value="7days">Tuần này (7 ngày)</option>
                <option value="30days">Tháng này (30 ngày)</option>
                <option value="thisMonth">Tháng hiện tại</option>
                <option value="lastMonth">Tháng trước</option>
                <option value="all">Tất cả thời gian</option>
                <option value="custom">Tùy chỉnh ngày</option>
              </select>
            </div>

            {/* Staff */}
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Nhân viên</label>
              <select
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="px-3 py-2 bg-gray-100 border border-transparent focus:border-blue-500 rounded-xl font-bold text-sm outline-none"
              >
                <option value="">Tất cả nhân viên</option>
                {staffList.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            {/* Reconciliation Status */}
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Trạng thái đối chiếu</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-gray-100 border border-transparent focus:border-blue-500 rounded-xl font-bold text-sm outline-none"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="KHOP">🟢 Khớp</option>
                <option value="THIEU">🔴 Thiếu</option>
                <option value="DU">🟠 Dư</option>
              </select>
            </div>
          </div>

          {/* Custom Date Inputs */}
          {range === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-2 border rounded-xl text-sm font-semibold outline-none"
              />
              <span className="text-gray-400">&rarr;</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-2 border rounded-xl text-sm font-semibold outline-none"
              />
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 font-medium">
            {error}
          </div>
        )}

        {/* Detailed Reconciliation Table */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              Đang tính toán đối chiếu két tiền từ các đơn hàng...
            </div>
          ) : reconciliations.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <p className="text-lg font-bold">Không tìm thấy ca làm việc nào</p>
              <p className="text-sm text-gray-400 mt-1">
                Thử thay đổi bộ lọc thời gian hoặc nhân viên.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-4 px-4">Ca & Nhân viên</th>
                    <th className="py-4 px-4">Thời gian ca</th>
                    <th className="py-4 px-4 text-right">Thực tế đầu ca</th>
                    <th className="py-4 px-4 text-right">Order CASH</th>
                    <th className="py-4 px-4 text-right">Admin Rút/Nạp</th>
                    <th className="py-4 px-4 text-right bg-blue-50/50">Hệ thống dự kiến</th>
                    <th className="py-4 px-4 text-right">Thực tế cuối ca</th>
                    <th className="py-4 px-4 text-right">Chênh lệch</th>
                    <th className="py-4 px-4 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm font-medium text-gray-800">
                  {reconciliations.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedShift(item)}
                      className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                    >
                      <td className="py-4 px-4 font-bold text-gray-900">
                        {item.staffName}
                        <p className="text-xs font-mono font-normal text-gray-400 mt-0.5">
                          {item.id}
                        </p>
                      </td>
                      <td className="py-4 px-4 text-xs text-gray-500">
                        <p>{formatDate(item.startTime)}</p>
                        <p className="text-gray-400">&rarr; {formatDate(item.endTime)}</p>
                      </td>
                      <td className="py-4 px-4 text-right font-semibold text-emerald-700">
                        {formatCurrency(item.actualOpeningCash)}
                      </td>
                      <td className="py-4 px-4 text-right font-semibold text-blue-600">
                        +{formatCurrency(item.totalCashOrders)}
                      </td>
                      <td className="py-4 px-4 text-right font-semibold">
                        <span
                          className={
                            item.cashAdjustments >= 0 ? "text-emerald-600" : "text-amber-600"
                          }
                        >
                          {item.cashAdjustments >= 0 ? `+${formatCurrency(item.cashAdjustments)}` : formatCurrency(item.cashAdjustments)}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right font-bold text-blue-900 bg-blue-50/30">
                        {formatCurrency(item.expectedCash)}
                      </td>
                      <td className="py-4 px-4 text-right font-bold text-gray-900">
                        {item.status === "open"
                          ? "Đang mở"
                          : formatCurrency(item.actualClosingCash)}
                      </td>
                      <td className="py-4 px-4 text-right font-bold">
                        {item.status === "open" ? (
                          <span className="text-gray-400">--</span>
                        ) : (
                          <span
                            className={
                              item.difference === 0
                                ? "text-emerald-600"
                                : item.difference < 0
                                ? "text-red-600"
                                : "text-amber-600"
                            }
                          >
                            {item.difference > 0 ? `+${formatCurrency(item.difference)}` : formatCurrency(item.difference)}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {renderStatusBadge(item.reconciliationStatus)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <Footer />

      {/* DETAIL MODAL FOR SHIFT RECONCILIATION */}
      {selectedShift && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  Chi tiết đối chiếu: {selectedShift.staffName}
                </h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">
                  {selectedShift.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedShift(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm font-medium">
              {/* Formula Breakdown */}
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">1. Thực tế đầu ca (Nhân viên đếm):</span>
                  <span className="font-bold text-emerald-700">
                    {formatCurrency(selectedShift.actualOpeningCash)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">2. Tổng Order Tiền mặt (Hệ thống):</span>
                  <span className="font-bold text-blue-600">
                    +{formatCurrency(selectedShift.totalCashOrders)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">3. Admin Rút/Nạp két tiền mặt:</span>
                  <span className="font-bold text-amber-600">
                    {selectedShift.cashAdjustments >= 0 ? `+${formatCurrency(selectedShift.cashAdjustments)}` : formatCurrency(selectedShift.cashAdjustments)}
                  </span>
                </div>
                <hr className="my-2 border-gray-200" />
                <div className="flex justify-between text-base">
                  <span className="font-bold text-blue-900">Hệ thống dự kiến (1 + 2 + 3):</span>
                  <span className="font-bold text-blue-900">
                    {formatCurrency(selectedShift.expectedCash)}
                  </span>
                </div>
                <div className="flex justify-between text-base">
                  <span className="font-bold text-gray-900">Thực tế cuối ca (Nhân viên đếm):</span>
                  <span className="font-bold text-gray-900">
                    {selectedShift.status === "open" ? "Đang mở" : formatCurrency(selectedShift.actualClosingCash)}
                  </span>
                </div>
                <div className="flex justify-between text-base pt-1">
                  <span className="font-bold text-gray-900">Kết quả Chênh lệch:</span>
                  <span
                    className={`font-bold text-lg ${
                      selectedShift.difference === 0
                        ? "text-emerald-600"
                        : selectedShift.difference < 0
                        ? "text-red-600"
                        : "text-amber-600"
                    }`}
                  >
                    {selectedShift.difference > 0 ? `+${formatCurrency(selectedShift.difference)}` : formatCurrency(selectedShift.difference)}
                  </span>
                </div>
              </div>

              {/* Adjustments list if any */}
              {Array.isArray(selectedShift.adjustmentsList) && selectedShift.adjustmentsList.length > 0 && (
                <div>
                  <h4 className="font-bold text-gray-800 mb-2">Lịch sử Admin Rút/Nạp két trong ca:</h4>
                  <div className="space-y-2 max-h-36 overflow-y-auto">
                    {selectedShift.adjustmentsList.map((adj) => (
                      <div
                        key={adj.id}
                        className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-bold text-gray-800">{adj.reason}</p>
                          <p className="text-gray-400">{formatDate(adj.createdAt)}</p>
                        </div>
                        <span className={`font-bold ${adj.amount >= 0 ? "text-emerald-600" : "text-amber-600"}`}>
                          {adj.amount >= 0 ? `+${formatCurrency(adj.amount)}` : formatCurrency(adj.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 text-right">
              <button
                onClick={() => setSelectedShift(null)}
                className="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-bold text-sm transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
