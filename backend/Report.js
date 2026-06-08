/* =========================
 * Report.js - Report generation and analytics
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

    // 1. GET ALL PAYMENTS IN DATE RANGE
    const allPayments = getSheetData_(SHEET_NAME.PAYMENT, true) || [];
    const filteredPayments = allPayments.filter((row) =>
      isDateInRange_(
        row[SHEET_SCHEMA.PAYMENT.PAID_AT],
        dateRange.start,
        dateRange.end,
      ),
    );

    // 2. TOTAL REVENUE FROM PAYMENTS
    const totalRevenue = filteredPayments.reduce((sum, row) => {
      return sum + toNumberSafe_(row[SHEET_SCHEMA.PAYMENT.AMOUNT], 0);
    }, 0);

    // 3. PAYMENT METHODS
    const paymentMethods = {};
    filteredPayments.forEach((row) => {
      const provider = trimSafe_(row[SHEET_SCHEMA.PAYMENT.PROVIDER]) || "cash";
      const amount = toNumberSafe_(row[SHEET_SCHEMA.PAYMENT.AMOUNT], 0);
      paymentMethods[provider] = (paymentMethods[provider] || 0) + amount;
    });

    const paymentMethodsArray = Object.entries(paymentMethods).map(([key, value]) => ({
      method: key,
      amount: value,
      percentage: totalRevenue > 0 ? ((value / totalRevenue) * 100).toFixed(1) : "0.0",
    }));

    // 4. MAP TO COMPLETED ORDERS IN RANGE
    const paidOrderIds = new Set(
      filteredPayments.map((row) => trimSafe_(row[SHEET_SCHEMA.PAYMENT.ORDER_ID])).filter(Boolean)
    );

    const allOrders = getSheetData_(SHEET_NAME.ORDER, true) || [];
    const filteredOrders = allOrders.filter((row) =>
      paidOrderIds.has(trimSafe_(row[SHEET_SCHEMA.ORDER.ID]))
    );

    // 5. TOP PRODUCTS FROM PAID ORDERS
    const allOrderDetails = getSheetData_(SHEET_NAME.ORDER_DETAIL, true) || [];
    const orderDetailsInRange = allOrderDetails.filter((row) =>
      paidOrderIds.has(trimSafe_(row[SHEET_SCHEMA.ORDER_DETAIL.ORDER_ID])),
    );

    const topProducts = {};
    orderDetailsInRange.forEach((row) => {
      const productName =
        trimSafe_(row[SHEET_SCHEMA.ORDER_DETAIL.PRODUCT_NAME]) || "Unknown";
      const quantity = toNumberSafe_(row[SHEET_SCHEMA.ORDER_DETAIL.QUANTITY], 0);
      const subtotal = toNumberSafe_(row[SHEET_SCHEMA.ORDER_DETAIL.SUBTOTAL], 0);
      
      if (!topProducts[productName]) {
        topProducts[productName] = { quantity: 0, revenue: 0 };
      }
      topProducts[productName].quantity += quantity;
      topProducts[productName].revenue += subtotal;
    });

    const topProductsArray = Object.entries(topProducts)
      .map(([name, data]) => ({
        productName: name,
        quantity: data.quantity,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10); // Top 10

    // 6. TOP CATEGORIES FROM PAID ORDERS
    const allProducts = getSheetData_(SHEET_NAME.PRODUCT, true) || [];
    const productCategoryMap = {};
    allProducts.forEach((row) => {
      const productId = trimSafe_(row[SHEET_SCHEMA.PRODUCT.ID]);
      const category = trimSafe_(row[SHEET_SCHEMA.PRODUCT.CATEGORY]) || "Other";
      productCategoryMap[productId] = category;
    });

    const topCategories = {};
    orderDetailsInRange.forEach((row) => {
      const productId = trimSafe_(row[SHEET_SCHEMA.ORDER_DETAIL.PRODUCT_ID]);
      const category = productCategoryMap[productId] || "Other";
      const quantity = toNumberSafe_(row[SHEET_SCHEMA.ORDER_DETAIL.QUANTITY], 0);
      const subtotal = toNumberSafe_(row[SHEET_SCHEMA.ORDER_DETAIL.SUBTOTAL], 0);

      if (!topCategories[category]) {
        topCategories[category] = { quantity: 0, revenue: 0 };
      }
      topCategories[category].quantity += quantity;
      topCategories[category].revenue += subtotal;
    });

    const topCategoriesArray = Object.entries(topCategories)
      .map(([name, data]) => ({
        categoryName: name,
        quantity: data.quantity,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10); // Top 10

    // 7. REVENUE BY DATE (Vietnam GMT+7 daily aggregation)
    const revenueByDate = {};
    filteredPayments.forEach((row) => {
      const paidAtStr = row[SHEET_SCHEMA.PAYMENT.PAID_AT];
      if (!paidAtStr) return;
      const dateObj = new Date(paidAtStr);
      if (Number.isNaN(dateObj.getTime())) return;
      // Shift to GMT+7 to aggregate by Vietnam calendar day
      const vnDate = new Date(dateObj.getTime() + 7 * 60 * 60 * 1000);
      const dateKey = vnDate.toISOString().split("T")[0]; // YYYY-MM-DD
      
      const amount = toNumberSafe_(row[SHEET_SCHEMA.PAYMENT.AMOUNT], 0);
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
      orderCount: filteredOrders.length,
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
