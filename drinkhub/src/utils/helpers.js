// Format currency
export const formatCurrency = (value) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

// Format time
export const formatTime = (date) => {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
};

// Format date
export const formatDate = (date) => {
  return new Intl.DateTimeFormat("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

// Calculate time elapsed
export const getTimeElapsed = (startTime) => {
  const now = new Date();
  const elapsed = Math.floor((now - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  if (minutes === 0) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

// Debounce
export const debounce = (func, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
};

// Throttle
export const throttle = (func, limit) => {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

// Local storage
export const storage = {
  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error("Storage error:", e);
    }
  },
  get: (key, defaultValue = null) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.error("Storage error:", e);
      return defaultValue;
    }
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error("Storage error:", e);
    }
  },
};

// Simulate API call
export const simulateApiCall = (delay = 500) => {
  return new Promise((resolve) => setTimeout(resolve, delay));
};

// Generate ID
export const generateId = (prefix = "id") => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Deep clone
export const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

// Print receipt (đã có sẵn)
export const printReceipt = (order, table, restaurant) => {
  const receiptContent = generateReceiptHTML(order, table, restaurant);
  const printWindow = window.open("", "", "height=600,width=400");
  printWindow.document.write(receiptContent);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.print();
  }, 250);
};

function generateReceiptHTML(order, table, restaurant) {
  const items = order.items
    .map(
      (item) =>
        ` ${item.name} x${item.quantity} ${formatCurrency(item.price)} ${formatCurrency(item.total)}`,
    )
    .join("<br>");

  return `
    <div style="font-family: monospace; padding: 20px; max-width: 300px;">
      <h2 style="text-align:center">${restaurant.name}</h2>
      <p style="text-align:center">${restaurant.address}</p>
      <p style="text-align:center">${restaurant.phone}</p>
      <hr>
      <p>Mã HĐ: ${order.id} | Bàn: ${table.number}</p>
      <p>Thời gian: ${new Date().toLocaleString("vi-VN")}</p>
      <p>Khách: ${table.guestCount}</p>
      <hr>
      ${items}
      <hr>
      <p>Tạm tính: ${formatCurrency(order.subtotal)}</p>
      ${order.discount > 0 ? `<p>Giảm giá: -${formatCurrency(order.discount)}</p>` : ""}
      ${order.tax > 0 ? `<p>Thuế: ${formatCurrency(order.tax)}</p>` : ""}
      <h3>Tổng cộng: ${formatCurrency(order.total)}</h3>
      <p style="text-align:center">Cảm ơn & Hẹn gặp lại!</p>
    </div>
  `;
}
