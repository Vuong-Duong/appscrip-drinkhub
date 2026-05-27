import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { reportApi } from "../api/Api";
import { formatCurrency } from "../utils/helpers";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterRange, setFilterRange] = useState("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustomFilter, setShowCustomFilter] = useState(false);

  const fetchReport = async (filters = {}) => {
    setIsLoading(true);
    setError("");
    try {
      const data = await reportApi.getReport(filters);
      setReport(data);
    } catch (err) {
      setError(err.details || err.code || err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport({ range: filterRange });
  }, [filterRange]);

  const handleApplyCustomFilter = () => {
    if (!customStart || !customEnd) {
      alert("Vui lòng chọn cả ngày bắt đầu và ngày kết thúc");
      return;
    }
    if (new Date(customStart) > new Date(customEnd)) {
      alert("Ngày bắt đầu không được lớn hơn ngày kết thúc");
      return;
    }
    fetchReport({
      range: "custom",
      customStart,
      customEnd,
    });
    setShowCustomFilter(false);
  };

  const filterOptions = [
    { value: "today", label: "Hôm nay" },
    { value: "yesterday", label: "Hôm qua" },
    { value: "7days", label: "7 ngày trước" },
    { value: "30days", label: "30 ngày trước" },
    { value: "thisMonth", label: "Tháng này" },
    { value: "lastMonth", label: "Tháng trước" },
    { value: "custom", label: "Tùy chỉnh" },
  ];

  const handleFilterChange = (value) => {
    if (value === "custom") {
      setShowCustomFilter(true);
    } else {
      setFilterRange(value);
      setShowCustomFilter(false);
    }
  };

  if (isLoading && !report) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Đang tải báo cáo...
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <div className="flex-1 pt-16 pb-20 px-4 md:px-6 max-w-7xl mx-auto w-full">
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
              <h1 className="text-3xl font-bold text-gray-900">Báo cáo</h1>
              <p className="text-sm text-gray-500 mt-1">
                {report?.period?.range === "custom"
                  ? `Từ ${new Date(report?.period?.startDate).toLocaleDateString("vi-VN")} đến ${new Date(report?.period?.endDate).toLocaleDateString("vi-VN")}`
                  : filterOptions.find((opt) => opt.value === filterRange)?.label}
              </p>
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="mb-8 flex gap-4 items-center flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">
              Khoảng thời gian:
            </label>
            <select
              value={showCustomFilter ? "custom" : filterRange}
              onChange={(e) => handleFilterChange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:border-blue-500 font-medium text-gray-700"
            >
              {filterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {showCustomFilter && (
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:border-blue-500 text-sm"
              />
              <span className="text-gray-600">-</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:border-blue-500 text-sm"
              />
              <button
                onClick={handleApplyCustomFilter}
                className="px-4 py-2 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 font-medium transition-all"
              >
                Áp dụng
              </button>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700">
            {error}
          </div>
        )}

        {/* Main Report Section */}
        {report && (
          <div className="space-y-8">
            {/* Total Revenue */}
            <div className="bg-linear-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-3xl p-8 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-blue-600 font-medium mb-2">
                    TỔNG DOANH THU
                  </p>
                  <h2 className="text-5xl font-bold text-blue-900">
                    {formatCurrency(report.totalRevenue)}
                  </h2>
                  <p className="text-sm text-blue-700 mt-3">
                    {report.orderCount} đơn hàng
                  </p>
                </div>
                <div className="text-6xl opacity-20">💰</div>
              </div>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Payment Methods */}
              <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  PHƯƠNG THỨC THANH TOÁN
                </h3>
                {report.paymentMethods.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    Không có dữ liệu
                  </p>
                ) : (
                  <div className="space-y-4">
                    {report.paymentMethods.map((method, idx) => (
                      <div key={idx} className="flex items-center gap-4">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-700 capitalize">
                            {method.method}
                          </p>
                          <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                            <div
                              className="bg-linear-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all"
                              style={{
                                width: `${method.percentage}%`,
                              }}
                            ></div>
                          </div>
                        </div>
                        <div className="text-right min-w-fit">
                          <p className="text-sm font-bold text-gray-800">
                            {formatCurrency(method.amount)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {method.percentage}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Products */}
              <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  MẶT HÀNG BÁN CHẠY NHẤT
                </h3>
                {report.topProducts.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    Không có dữ liệu
                  </p>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {report.topProducts.map((product, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 bg-linear-to-r from-amber-50 to-transparent rounded-2xl border border-amber-100"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-200 text-amber-800 text-xs font-bold">
                              {idx + 1}
                            </span>
                            <p className="text-sm font-medium text-gray-800">
                              {product.productName}
                            </p>
                          </div>
                          <p className="text-xs text-gray-500 ml-8">
                            Doanh thu: {formatCurrency(product.revenue)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-amber-700">
                            {product.quantity}
                          </p>
                          <p className="text-xs text-gray-500">cái</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Top Categories */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                NHÓM HÀNG BÁN CHẠY NHẤT
              </h3>
              {report.topCategories.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  Không có dữ liệu
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {report.topCategories.map((category, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-linear-to-br from-purple-50 to-pink-50 border border-purple-100 rounded-2xl"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-xs text-purple-600 font-medium mb-1">
                            NHÓM HÀNG
                          </p>
                          <h4 className="text-base font-bold text-gray-900">
                            {category.categoryName}
                          </h4>
                        </div>
                        <span className="text-2xl">📦</span>
                      </div>
                      <div className="border-t border-purple-100 pt-3 grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-xs text-gray-600">Số lượng</p>
                          <p className="text-lg font-bold text-purple-700">
                            {category.quantity}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Doanh thu</p>
                          <p className="text-sm font-bold text-purple-700">
                            {formatCurrency(category.revenue)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
