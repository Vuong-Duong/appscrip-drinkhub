import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { reportApi } from "../api/Api";
import { formatCurrency } from "../utils/helpers";
import BootstrapService from "../services/BootstrapService";
import appStore from "../services/AppStore";

/* =========================
 * SVG Pie Chart Component
 * ========================= */

const PIE_COLORS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#84cc16", // lime-500
];

function PieChart({ data, size = 180 }) {
  if (!data || data.length === 0) return null;

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 8;

  let cumulativeAngle = -90; // Start from top

  const slices = data.map((d, idx) => {
    const percentage = d.value / total;
    const angle = percentage * 360;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle = endAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);

    const largeArcFlag = angle > 180 ? 1 : 0;

    // Single item = full circle
    if (data.length === 1) {
      return (
        <circle
          key={idx}
          cx={cx}
          cy={cy}
          r={radius}
          fill={PIE_COLORS[idx % PIE_COLORS.length]}
          opacity={0.85}
        />
      );
    }

    const pathData = [
      `M ${cx} ${cy}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      "Z",
    ].join(" ");

    return (
      <path
        key={idx}
        d={pathData}
        fill={PIE_COLORS[idx % PIE_COLORS.length]}
        opacity={0.85}
        stroke="white"
        strokeWidth="2"
      />
    );
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto"
    >
      {slices}
      {/* Center circle for donut effect */}
      <circle cx={cx} cy={cy} r={radius * 0.5} fill="white" />
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        className="fill-gray-500 text-[10px] font-medium"
      >
        Tổng
      </text>
      <text
        x={cx}
        y={cy + 10}
        textAnchor="middle"
        className="fill-gray-800 text-xs font-bold"
      >
        {data.length} mục
      </text>
    </svg>
  );
}

function PieLegend({ data }) {
  if (!data || data.length === 0) return null;

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="space-y-2 mt-4">
      {data.map((d, idx) => {
        const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : 0;
        return (
          <div key={idx} className="flex items-center gap-3 text-sm">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
            ></span>
            <span className="flex-1 text-gray-700 truncate">{d.label}</span>
            <span className="font-semibold text-gray-800 min-w-fit">
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* =========================
 * Local Calculation Helper (GMT+7 timezone safe)
 * ========================= */
const calculateReportLocally = (range, customStart = "", customEnd = "") => {
  const state = appStore.getState();
  const allPayments = state.payments || [];
  const allOrders = state.orders || [];
  const allOrderDetails = state.orderDetails || [];
  const allProducts = state.products || [];

  const now = new Date();
  const gmt7Now = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  
  const year = gmt7Now.getUTCFullYear();
  const month = gmt7Now.getUTCMonth();
  const date = gmt7Now.getUTCDate();
  
  const startOfToday = new Date(Date.UTC(year, month, date) - 7 * 60 * 60 * 1000);
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);

  let startDate, endDate;
  if (range === "custom" && customStart && customEnd) {
    const startParts = customStart.split("-").map(Number);
    const endParts = customEnd.split("-").map(Number);
    startDate = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]) - 7 * 60 * 60 * 1000);
    endDate = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]) - 7 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1);
  } else {
    switch (range) {
      case "today":
        startDate = startOfToday;
        endDate = endOfToday;
        break;
      case "yesterday":
        startDate = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
        endDate = new Date(startOfToday.getTime() - 1);
        break;
      case "7days":
        startDate = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
        endDate = endOfToday;
        break;
      case "30days":
        startDate = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
        endDate = endOfToday;
        break;
      case "thisMonth":
        startDate = new Date(Date.UTC(year, month, 1) - 7 * 60 * 60 * 1000);
        endDate = endOfToday;
        break;
      case "lastMonth": {
        const firstDayOfThisMonth = new Date(Date.UTC(year, month, 1) - 7 * 60 * 60 * 1000);
        endDate = new Date(firstDayOfThisMonth.getTime() - 1);
        const gmt7LastMonthEnd = new Date(endDate.getTime() + 7 * 60 * 60 * 1000);
        const lmYear = gmt7LastMonthEnd.getUTCFullYear();
        const lmMonth = gmt7LastMonthEnd.getUTCMonth();
        startDate = new Date(Date.UTC(lmYear, lmMonth, 1) - 7 * 60 * 60 * 1000);
        break;
      }
      default:
        startDate = null;
        endDate = null;
    }
  }

  const isDateInRange = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return false;
    if (!startDate || !endDate) return true;
    return d.getTime() >= startDate.getTime() && d.getTime() <= endDate.getTime();
  };

  const filteredPayments = allPayments.filter((p) => isDateInRange(p.paidAt));
  const totalRevenue = filteredPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const paymentMethods = {};
  filteredPayments.forEach((p) => {
    const provider = (p.provider || "cash").trim().toLowerCase();
    const amount = Number(p.amount) || 0;
    paymentMethods[provider] = (paymentMethods[provider] || 0) + amount;
  });

  const paymentMethodsArray = Object.entries(paymentMethods).map(([key, value]) => ({
    method: key,
    amount: value,
    percentage: totalRevenue > 0 ? ((value / totalRevenue) * 100).toFixed(1) : "0.0",
  }));

  const paidOrderIds = new Set(filteredPayments.map((p) => p.orderId).filter(Boolean));
  const filteredOrders = allOrders.filter((o) => paidOrderIds.has(o.id));

  const orderDetailsInRange = allOrderDetails.filter((d) => paidOrderIds.has(d.orderId));
  const topProducts = {};
  orderDetailsInRange.forEach((d) => {
    const name = d.productName || "Unknown";
    const qty = Number(d.quantity) || 0;
    const sub = Number(d.subtotal) || 0;
    if (!topProducts[name]) topProducts[name] = { quantity: 0, revenue: 0 };
    topProducts[name].quantity += qty;
    topProducts[name].revenue += sub;
  });

  const topProductsArray = Object.entries(topProducts)
    .map(([name, data]) => ({
      productName: name,
      quantity: data.quantity,
      revenue: data.revenue,
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  const productCategoryMap = {};
  allProducts.forEach((p) => {
    productCategoryMap[p.id] = p.category || "Other";
  });

  const topCategories = {};
  orderDetailsInRange.forEach((d) => {
    const category = productCategoryMap[d.productId] || "Other";
    const qty = Number(d.quantity) || 0;
    const sub = Number(d.subtotal) || 0;
    if (!topCategories[category]) topCategories[category] = { quantity: 0, revenue: 0 };
    topCategories[category].quantity += qty;
    topCategories[category].revenue += sub;
  });

  const topCategoriesArray = Object.entries(topCategories)
    .map(([name, data]) => ({
      categoryName: name,
      quantity: data.quantity,
      revenue: data.revenue,
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  const revenueByDate = {};
  filteredPayments.forEach((p) => {
    if (!p.paidAt) return;
    const d = new Date(p.paidAt);
    if (Number.isNaN(d.getTime())) return;
    const vnDate = new Date(d.getTime() + 7 * 60 * 60 * 1000);
    const dateKey = vnDate.toISOString().split("T")[0];
    const amount = Number(p.amount) || 0;
    revenueByDate[dateKey] = (revenueByDate[dateKey] || 0) + amount;
  });

  const revenueByDateArray = Object.entries(revenueByDate).map(([date, amount]) => ({
    date,
    amount,
  })).sort((a, b) => a.date.localeCompare(b.date));

  return {
    period: {
      range,
      startDate: startDate ? startDate.toISOString() : null,
      endDate: endDate ? endDate.toISOString() : null,
    },
    totalRevenue,
    orderCount: filteredOrders.length,
    paymentMethods: paymentMethodsArray,
    topProducts: topProductsArray,
    topCategories: topCategoriesArray,
    revenueByDate: revenueByDateArray,
  };
};

/* =========================
 * Dashboard Page
 * ========================= */

export default function DashboardPage() {
  const navigate = useNavigate();
  const [filterRange, setFilterRange] = useState("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustomFilter, setShowCustomFilter] = useState(false);

  // Load local report calculations reactively
  const [report, setReport] = useState(() => calculateReportLocally("today"));
  const [storeState, setStoreState] = useState(() => appStore.getState());

  useEffect(() => {
    // Refresh latest data from backend in background when visiting dashboard
    const refreshData = async () => {
      try {
        await BootstrapService.forceRefresh();
      } catch (err) {
        console.error("Failed to refresh data for dashboard:", err);
      }
    };
    refreshData();
  }, []);

  useEffect(() => {
    const handleStateChange = (state) => {
      setStoreState({ ...state });
      const data = calculateReportLocally(filterRange, customStart, customEnd);
      setReport(data);
    };

    // Subscribe to store updates
    const unsubscribe = appStore.subscribe(handleStateChange);
    
    // Initial calculation
    handleStateChange(appStore.getState());

    return unsubscribe;
  }, [filterRange, customStart, customEnd]);

  const handleApplyCustomFilter = () => {
    if (!customStart || !customEnd) {
      alert("Vui lòng chọn cả ngày bắt đầu và ngày kết thúc");
      return;
    }
    if (new Date(customStart) > new Date(customEnd)) {
      alert("Ngày bắt đầu không được lớn hơn ngày kết thúc");
      return;
    }
    setFilterRange("custom");
    const data = calculateReportLocally("custom", customStart, customEnd);
    setReport(data);
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
      const data = calculateReportLocally(value);
      setReport(data);
    }
  };

  const isLoading = storeState.loading;
  const error = storeState.error || "";

  // Prepare pie chart data
  const paymentPieData =
    report?.paymentMethods?.map((m) => ({
      label: m.method,
      value: m.amount || 0,
    })) || [];

  const categoryPieData =
    report?.topCategories?.map((c) => ({
      label: c.categoryName,
      value: c.revenue || 0,
    })) || [];

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

      <div className="flex-1 overflow-y-auto pt-[60px] sm:pt-16 pb-20 px-3 sm:px-4 md:px-6 max-w-7xl mx-auto w-full">
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
                  : filterOptions.find((opt) => opt.value === filterRange)
                      ?.label}
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
            {/* Revenue By Date */}
            {report.revenueByDate && report.revenueByDate.length > 0 && (
              <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-6">
                  DOANH THU THEO NGÀY
                </h3>
                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                  {report.revenueByDate.map((item, idx) => {
                    const maxAmount = Math.max(...report.revenueByDate.map((d) => d.amount), 1);
                    const pct = (item.amount / maxAmount) * 100;
                    return (
                      <div key={idx} className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                        <div className="w-24 text-sm font-semibold text-gray-600">
                          {new Date(item.date).toLocaleDateString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </div>
                        <div className="flex-1 min-w-[150px] bg-gray-100 rounded-full h-3 relative overflow-hidden">
                          <div
                            className="bg-blue-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          ></div>
                        </div>
                        <div className="text-right min-w-[120px] text-sm font-bold text-gray-800">
                          {formatCurrency(item.amount)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Payment Methods with Pie Chart */}
              <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  PHƯƠNG THỨC THANH TOÁN
                </h3>
                {report.paymentMethods.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    Không có dữ liệu
                  </p>
                ) : (
                  <div>
                    {/* Pie Chart */}
                    <div className="mb-6">
                      <PieChart data={paymentPieData} size={180} />
                      <PieLegend data={paymentPieData} />
                    </div>

                    {/* Detail bars */}
                    <div className="space-y-4 border-t pt-4">
                      {report.paymentMethods.map((method, idx) => (
                        <div key={idx} className="flex items-center gap-4">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-700 capitalize">
                              {method.method}
                            </p>
                            <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                              <div
                                className="h-2 rounded-full transition-all"
                                style={{
                                  width: `${method.percentage}%`,
                                  backgroundColor:
                                    PIE_COLORS[idx % PIE_COLORS.length],
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

            {/* Top Categories with Pie Chart */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                NHÓM HÀNG BÁN CHẠY NHẤT
              </h3>
              {report.topCategories.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  Không có dữ liệu
                </p>
              ) : (
                <div>
                  {/* Pie Chart for Categories */}
                  <div className="flex flex-col lg:flex-row items-center gap-8 mb-6">
                    <PieChart data={categoryPieData} size={200} />
                    <div className="flex-1 w-full">
                      <PieLegend data={categoryPieData} />
                    </div>
                  </div>

                  {/* Detail Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 border-t pt-6">
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
                          <span
                            className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor:
                                PIE_COLORS[idx % PIE_COLORS.length],
                            }}
                          ></span>
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
