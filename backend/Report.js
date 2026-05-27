/* =========================
 * Report.js - Report generation and analytics
 * ========================= */

const getDateRangeFromPredefined_ = (range) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);

  switch (range) {
    case "today":
      return { start: startOfToday, end: endOfToday };
    case "yesterday": {
      const yesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
      return { start: yesterday, end: new Date(startOfToday.getTime() - 1) };
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
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: firstDay, end: endOfToday };
    }
    case "lastMonth": {
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      const lastMonthStart = new Date(
        lastMonthEnd.getFullYear(),
        lastMonthEnd.getMonth(),
        1,
      );
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
    if (!startDate || !endDate) return true;
    return date >= startDate && date <= endDate;
  } catch {
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
      dateRange = {
        start: new Date(customStart),
        end: new Date(customEnd),
      };
    } else {
      dateRange = getDateRangeFromPredefined_(range);
    }

    // 1. GET ALL ORDERS IN DATE RANGE
    const allOrders = getSheetData_(SHEET_NAME.ORDER, true) || [];
    const filteredOrders = allOrders.filter(
      (row) =>
        isDateInRange_(
          row[SHEET_SCHEMA.ORDER.CREATED_AT],
          dateRange.start,
          dateRange.end,
        ) && row[SHEET_SCHEMA.ORDER.PAYMENT_STATUS] === "PAID",
    );

    // 2. TOTAL REVENUE
    const totalRevenue = filteredOrders.reduce((sum, row) => {
      return sum + toNumberSafe_(row[SHEET_SCHEMA.ORDER.GRAND_TOTAL], 0);
    }, 0);

    // 3. PAYMENT METHODS
    const allPayments = getSheetData_(SHEET_NAME.PAYMENT, true) || [];
    const filteredPayments = allPayments.filter((row) =>
      isDateInRange_(
        row[SHEET_SCHEMA.PAYMENT.PAID_AT],
        dateRange.start,
        dateRange.end,
      ),
    );

    const paymentMethods = {};
    filteredPayments.forEach((row) => {
      const provider = trimSafe_(row[SHEET_SCHEMA.PAYMENT.PROVIDER]) || "cash";
      const amount = toNumberSafe_(row[SHEET_SCHEMA.PAYMENT.AMOUNT], 0);
      paymentMethods[provider] = (paymentMethods[provider] || 0) + amount;
    });

    const paymentMethodsArray = Object.entries(paymentMethods).map(([key, value]) => ({
      method: key,
      amount: value,
      percentage: totalRevenue > 0 ? ((value / totalRevenue) * 100).toFixed(1) : 0,
    }));

    // 4. TOP PRODUCTS
    const allOrderDetails = getSheetData_(SHEET_NAME.ORDER_DETAIL, true) || [];
    const filteredOrderIds = new Set(
      filteredOrders.map((row) => row[SHEET_SCHEMA.ORDER.ID]),
    );

    const orderDetailsInRange = allOrderDetails.filter((row) =>
      filteredOrderIds.has(row[SHEET_SCHEMA.ORDER_DETAIL.ORDER_ID]),
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

    // 5. TOP CATEGORIES
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
    };
  } catch (err) {
    logError_("getReportData", err);
    throw err;
  }
};
