/* =========================
 * Report.js - Report generation dynamically from valid Orders (Firestore)
 * ========================= */

const getDateRangeFromPredefined_ = (range) => {
  const now = new Date();
  const gmt7Now = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  
  const year = gmt7Now.getUTCFullYear();
  const month = gmt7Now.getUTCMonth();
  const date = gmt7Now.getUTCDate();
  
  const startOfToday = new Date(Date.UTC(year, month, date) - 7 * 60 * 60 * 1000);
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);

  switch (range) {
    case "today":
      return { start: startOfToday, end: endOfToday };
    case "yesterday": {
      const yesterdayStart = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayEnd = new Date(startOfToday.getTime() - 1);
      return { start: yesterdayStart, end: yesterdayEnd };
    }
    case "7days":
      return {
        start: new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000),
        end: endOfToday,
      };
    case "30days":
      return {
        start: new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000),
        end: endOfToday,
      };
    case "thisMonth": {
      const firstDay = new Date(Date.UTC(year, month, 1) - 7 * 60 * 60 * 1000);
      return { start: firstDay, end: endOfToday };
    }
    case "lastMonth": {
      const firstDayOfThisMonth = new Date(Date.UTC(year, month, 1) - 7 * 60 * 60 * 1000);
      const lastMonthEnd = new Date(firstDayOfThisMonth.getTime() - 1);
      const gmt7LastMonthEnd = new Date(lastMonthEnd.getTime() + 7 * 60 * 60 * 1000);
      const lmYear = gmt7LastMonthEnd.getUTCFullYear();
      const lmMonth = gmt7LastMonthEnd.getUTCMonth();
      const lastMonthStart = new Date(Date.UTC(lmYear, lmMonth, 1) - 7 * 60 * 60 * 1000);
      return { start: lastMonthStart, end: lastMonthEnd };
    }
    default:
      return { start: null, end: null };
  }
};

const isDateInRange_ = (dateStr, startDate, endDate) => {
  if (!dateStr) return false;
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return false;
    if (!startDate || !endDate) return true;
    return date.getTime() >= startDate.getTime() && date.getTime() <= endDate.getTime();
  } catch (e) {
    return false;
  }
};

/**
 * BÁO CÁO BÁN HÀNG DỰA TRÊN DỮ LIỆU ORDER THỰC TẾ ĐANG TỒN TẠI
 * Không tính bù trừ, không dựa vào bảng tổng hợp cũ.
 * Xóa Order -> Báo cáo tự động giảm tương ứng!
 */
const getReportData = (filters = {}) => {
  try {
    const range = filters.range || "today";
    const customStart = filters.customStart || null;
    const customEnd = filters.customEnd || null;

    let dateRange;
    if (range === "custom" && customStart && customEnd) {
      const startParts = customStart.split("-").map(Number);
      const endParts = customEnd.split("-").map(Number);
      const start = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]) - 7 * 60 * 60 * 1000);
      const end = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]) - 7 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1);
      dateRange = { start, end };
    } else {
      dateRange = getDateRangeFromPredefined_(range);
    }

    // 1. QUERY ALL ORDERS DIRECTLY FROM FIRESTORE
    const rawOrders = firestoreQuery_("orders") || [];

    // 2. FILTER VALID COMPLETED / PAID ORDERS IN DATE RANGE
    const validFilteredOrders = rawOrders.filter((order) => {
      if (!order || !order.id) return false;
      const status = trimSafe_(order.status);
      const pStatus = trimSafe_(order.paymentStatus);

      // Must be CLOSED or PAID
      const isPaid = status === "CLOSED" || pStatus === "PAID";
      if (!isPaid) return false;

      // Must be in date range
      return isDateInRange_(order.createdAt, dateRange.start, dateRange.end);
    });

    // 3. DYNAMICALLY COMPUTE TOTAL REVENUE FROM VALID EXISTING ORDERS
    const totalRevenue = validFilteredOrders.reduce((sum, ord) => {
      return sum + toNumberSafe_(ord.grandTotal, 0);
    }, 0);

    // 4. DYNAMICALLY COMPUTE PAYMENT METHODS BREAKDOWN
    const paymentMethodsMap = {};
    validFilteredOrders.forEach((ord) => {
      const pMethod = trimSafe_(ord.paymentMethod).toLowerCase() === "transfer" ? "transfer" : "cash";
      const amount = toNumberSafe_(ord.grandTotal, 0);
      paymentMethodsMap[pMethod] = (paymentMethodsMap[pMethod] || 0) + amount;
    });

    const paymentMethodsArray = Object.entries(paymentMethodsMap).map(([key, value]) => ({
      method: key,
      amount: value,
      percentage: totalRevenue > 0 ? ((value / totalRevenue) * 100).toFixed(1) : "0.0",
    }));

    // 5. TOP PRODUCTS FROM VALID EXISTING ORDERS
    const topProducts = {};
    validFilteredOrders.forEach((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item) => {
        const productName = trimSafe_(item.productName) || "Unknown";
        const quantity = toNumberSafe_(item.quantity, 0);
        const subtotal = toNumberSafe_(item.subtotal || item.unitPrice * item.quantity, 0);

        if (!topProducts[productName]) {
          topProducts[productName] = { quantity: 0, revenue: 0 };
        }
        topProducts[productName].quantity += quantity;
        topProducts[productName].revenue += subtotal;
      });
    });

    const topProductsArray = Object.entries(topProducts)
      .map(([name, data]) => ({
        productName: name,
        quantity: data.quantity,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // 6. TOP CATEGORIES & COST OF GOODS SOLD FROM VALID EXISTING ORDERS
    const allProducts = getProducts(false) || [];
    const productCategoryMap = {};
    const productCostMap = {};
    allProducts.forEach((prod) => {
      const cat = trimSafe_(prod.category) || "Khác";
      const cost = toNumberSafe_(prod.cost || prod.costPrice, 0);
      if (prod.id) {
        productCategoryMap[trimSafe_(prod.id)] = cat;
        productCostMap[trimSafe_(prod.id)] = cost;
      }
      if (prod.name) {
        const nameKey = trimSafe_(prod.name).toLowerCase();
        productCategoryMap[nameKey] = cat;
        productCostMap[nameKey] = cost;
      }
    });

    let totalCost = 0;
    const topCategories = {};
    validFilteredOrders.forEach((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item) => {
        const productId = trimSafe_(item.productId);
        const productNameKey = trimSafe_(item.productName || item.name).toLowerCase();
        const category = productCategoryMap[productId] || productCategoryMap[productNameKey] || "Khác";
        const quantity = toNumberSafe_(item.quantity, 0);
        const subtotal = toNumberSafe_(item.subtotal || item.unitPrice * item.quantity, 0);
        const unitCost = productCostMap[productId] ?? productCostMap[productNameKey] ?? 0;

        totalCost += unitCost * quantity;

        if (!topCategories[category]) {
          topCategories[category] = { quantity: 0, revenue: 0 };
        }
        topCategories[category].quantity += quantity;
        topCategories[category].revenue += subtotal;
      });
    });

    const topCategoriesArray = Object.entries(topCategories)
      .map(([name, data]) => ({
        categoryName: name,
        quantity: data.quantity,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    const netProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : "0.0";

    // 7. REVENUE BY DATE (GMT+7 daily aggregation)
    const revenueByDate = {};
    validFilteredOrders.forEach((ord) => {
      const createdStr = ord.createdAt;
      if (!createdStr) return;
      const dateObj = new Date(createdStr);
      if (Number.isNaN(dateObj.getTime())) return;
      const vnDate = new Date(dateObj.getTime() + 7 * 60 * 60 * 1000);
      const dateKey = vnDate.toISOString().split("T")[0];
      
      const amount = toNumberSafe_(ord.grandTotal, 0);
      revenueByDate[dateKey] = (revenueByDate[dateKey] || 0) + amount;
    });

    const revenueByDateArray = Object.entries(revenueByDate).map(([date, amount]) => ({
      date,
      amount,
    })).sort((a, b) => a.date.localeCompare(b.date));

    return {
      period: {
        range: range === "custom" ? "custom" : range,
        startDate: dateRange.start ? toIsoString_(dateRange.start) : null,
        endDate: dateRange.end ? toIsoString_(dateRange.end) : null,
      },
      totalRevenue,
      totalCost,
      netProfit,
      profitMargin,
      orderCount: validFilteredOrders.length,
      paymentMethods: paymentMethodsArray,
      topProducts: topProductsArray,
      topCategories: topCategoriesArray,
      revenueByDate: revenueByDateArray,
    };
  } catch (err) {
    logAction_("ERROR", "getReportData", "system", { error: err.message });
    throw err;
  }
};
