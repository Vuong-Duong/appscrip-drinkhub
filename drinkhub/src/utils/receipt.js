// Helpers for date and time formatting
const formatDateVN = (dateVal) => {
  const d = dateVal ? new Date(dateVal) : new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatDateVNText = (dateVal) => {
  const d = dateVal ? new Date(dateVal) : new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1);
  const year = d.getFullYear();
  return `${day} thg ${month}, ${year}`;
};

const formatTimeVN = (dateVal) => {
  const d = dateVal ? new Date(dateVal) : new Date();
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
};

// Main print receipt handler
export const printReceipt = (order, table, restaurant, type = "payment_receipt") => {
  const receiptContent = generateReceiptHTML(order, table, restaurant, type);

  const printWindow = window.open("", "_blank", "height=800,width=600");
  printWindow.document.write(receiptContent);
  printWindow.document.close();

  // Trigger print dialog after DOM rendering
  setTimeout(() => {
    printWindow.print();
  }, 500);
};

// Generates HTML for receipt matching the images
function generateReceiptHTML(order, table, restaurant, type) {
  const storeName = restaurant?.name || "Longka Cafe";
  const storeAddress = restaurant?.address || "Địa chỉ cửa hàng";
  const storePhone = restaurant?.phone || "Số điện thoại";
  
  const createdBy = order.createdBy || "Staff";
  const formattedTime = formatTimeVN(order.createdAt);
  const formattedDateText = formatDateVNText(order.createdAt);
  const formattedDate = formatDateVN(order.createdAt);
  
  const tableNumOnly = (table?.number || "").replace(/bàn/gi, "").trim() || "N/A";
  const totalQty = (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
  
  // Calculate sequence number (from order timestamp or ID numeric parts)
  const seq = order.id ? parseInt(order.id.replace(/\D/g, "").slice(-2)) || 11 : 11;

  let bodyHTML = "";

  if (type === "order_slip") {
    // === PHIẾU ĐẶT ĐỒ (Image 1) ===
    const itemsRows = (order.items || []).map(item => `
      <tr>
        <td style="border: 1px solid #000; text-align: left; padding: 6px 8px;">${item.name || item.productName}</td>
        <td style="border: 1px solid #000; text-align: center; padding: 6px 4px; font-weight: bold;">${item.quantity}</td>
        <td style="border: 1px solid #000; text-align: center; padding: 6px 4px;">MON</td>
      </tr>
    `).join("");

    bodyHTML = `
      <div class="receipt-title">PHIẾU ĐẶT ĐỒ</div>
      <div class="receipt-subtitle">${tableNumOnly} - BÀN - HĐ.${order.id || "N/A"}</div>
      
      <table class="info-table" style="width: 100%; margin-top: 15px; margin-bottom: 10px; border-collapse: collapse;">
        <tr>
          <td style="text-align: left; padding: 3px 0; font-weight: bold;">Giờ : ${formattedTime}</td>
          <td style="text-align: right; padding: 3px 0; font-weight: bold;">Ngày: ${formattedDateText}</td>
        </tr>
        <tr>
          <td colspan="2" style="text-align: left; padding: 3px 0; font-weight: bold;">Nhân viên: ${createdBy}</td>
        </tr>
        <tr>
          <td colspan="2" style="text-align: left; padding: 3px 0; font-weight: bold;">Số thứ tự: ${seq} (SL : ${totalQty})</td>
        </tr>
      </table>

      <table class="items-table-slip" style="width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 15px;">
        <thead>
          <tr>
            <th style="border: 1px solid #000; text-align: center; padding: 6px 8px; background-color: #f2f2f2; width: 60%;">Tên món</th>
            <th style="border: 1px solid #000; text-align: center; padding: 6px 4px; background-color: #f2f2f2; width: 20%;">SL</th>
            <th style="border: 1px solid #000; text-align: center; padding: 6px 4px; background-color: #f2f2f2; width: 20%;">ĐVT</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
    `;
  } else {
    // === HÓA ĐƠN THANH TOÁN (Image 2) ===
    const shortId = order.id ? order.id.slice(-5).toUpperCase() : "N/A";
    
    const itemsRows = (order.items || []).map((item, idx) => `
      <tr>
        <td style="padding: 6px 0; text-align: center;">${idx + 1}</td>
        <td style="padding: 6px 0; text-align: left;">${item.name || item.productName}</td>
        <td style="padding: 6px 0; text-align: center; font-weight: bold;">${item.quantity}</td>
        <td style="padding: 6px 0; text-align: right;">${Number(item.price || item.unitPrice || 0).toLocaleString()}</td>
        <td style="padding: 6px 0; text-align: right; font-weight: bold;">${Number(item.total || item.subtotal || 0).toLocaleString()}</td>
      </tr>
    `).join("");

    const payMethodText = order.paymentMethod === "cash" ? "Thanh toán tiền mặt" : "Thanh toán chuyển khoản";
    const subtotalVal = order.subtotal || 0;
    const discountVal = order.discount || 0;
    const totalVal = order.total !== undefined ? order.total : (order.grandTotal || 0);

    bodyHTML = `
      <div class="receipt-title">HÓA ĐƠN THANH TOÁN</div>
      <div class="receipt-subtitle" style="font-size: 14px; font-weight: bold; margin-bottom: 15px;">SỐ HĐ: ${order.id || "N/A"}</div>
      
      <table class="info-table-payment" style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-weight: bold;">
        <tr>
          <td style="width: 55%; padding: 2px 0;">Mã HĐ: #${shortId}</td>
          <td style="width: 45%; padding: 2px 0; text-align: left;">TN: ${createdBy}</td>
        </tr>
        <tr>
          <td style="padding: 2px 0;">Bàn: ${tableNumOnly} - Bàn</td>
          <td style="padding: 2px 0; text-align: left;">Ngày: ${formattedDate}</td>
        </tr>
        <tr>
          <td style="padding: 2px 0;">Giờ vào: : ${formattedTime}</td>
          <td style="padding: 2px 0; text-align: left;">Giờ ra: ${formatTimeVN(new Date())}</td>
        </tr>
      </table>

      <table class="items-table-payment" style="width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 10px; border-top: 1px solid #000; border-bottom: 1px solid #000;">
        <thead>
          <tr style="border-bottom: 1px solid #000;">
            <th style="padding: 6px 0; text-align: center; width: 10%;">STT</th>
            <th style="padding: 6px 0; text-align: left; width: 45%;">Tên món</th>
            <th style="padding: 6px 0; text-align: center; width: 10%;">SL</th>
            <th style="padding: 6px 0; text-align: right; width: 15%;">Đơn giá</th>
            <th style="padding: 6px 0; text-align: right; width: 20%;">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <table class="summary-table" style="width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 15px; font-weight: bold;">
        <tr>
          <td style="padding: 4px 0;">Thành tiền:</td>
          <td style="padding: 4px 0; text-align: right;">${subtotalVal.toLocaleString()} đ</td>
        </tr>
        ${discountVal > 0 ? `
        <tr>
          <td style="padding: 4px 0; color: #ff0000;">Giảm giá:</td>
          <td style="padding: 4px 0; text-align: right; color: #ff0000;">-${discountVal.toLocaleString()} đ</td>
        </tr>
        ` : ""}
        <tr style="border-top: 1px solid #000; font-size: 15px;">
          <td style="padding: 8px 0; font-size: 16px;">Tổng tiền:</td>
          <td style="padding: 8px 0; text-align: right; font-size: 16px;">${totalVal.toLocaleString()} đ</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; font-size: 13px;">+${payMethodText}</td>
          <td style="padding: 4px 0; text-align: right; font-size: 13px;">${totalVal.toLocaleString()} đ</td>
        </tr>
      </table>

      <div class="store-footer-details" style="text-align: center; margin-top: 20px; font-weight: bold; font-size: 13px;">
        <div>${storeName}</div>
        <div style="font-size: 12px; margin-top: 3px; font-weight: normal;">Địa chỉ: ${storeAddress}</div>
        ${storePhone && storePhone !== "Số điện thoại" ? `<div style="font-size: 12px; font-weight: normal;">SĐT: ${storePhone}</div>` : ""}
      </div>
    `;
  }

  // Combine into complete, beautifully styled HTML document
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>In Hóa Đơn</title>
  <style>
    /* Styling for screen preview */
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      line-height: 1.4;
      margin: 0;
      padding: 0;
      background-color: #f3f4f6;
      color: #000;
    }
    
    .screen-header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background-color: #1e293b;
      color: #fff;
      padding: 12px 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    
    .screen-header-title {
      font-weight: 700;
      font-size: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .screen-actions {
      display: flex;
      gap: 12px;
    }
    
    .action-btn {
      padding: 8px 16px;
      border-radius: 6px;
      border: none;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s ease-in-out;
    }
    
    .btn-pdf {
      background-color: #ef4444;
      color: white;
    }
    
    .btn-pdf:hover {
      background-color: #dc2626;
    }
    
    .btn-close {
      background-color: #64748b;
      color: white;
    }
    
    .btn-close:hover {
      background-color: #475569;
    }
    
    .paper-container {
      max-width: 400px;
      margin: 30px auto;
      background-color: #fff;
      padding: 24px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      border-radius: 4px;
      border: 1px solid #e5e7eb;
    }
    
    .receipt {
      width: 100%;
    }
    
    .receipt-title {
      font-size: 19px;
      font-weight: bold;
      text-align: center;
      margin-bottom: 5px;
      letter-spacing: 0.5px;
    }
    
    .receipt-subtitle {
      text-align: center;
      font-size: 15px;
      font-weight: bold;
      margin-bottom: 10px;
    }
    
    .footer-brand {
      text-align: center;
      font-size: 11px;
      margin-top: 25px;
      border-top: 1px dashed #ccc;
      padding-top: 8px;
    }

    /* Print styles */
    @media print {
      body {
        background-color: #fff !important;
        color: #000 !important;
      }
      .screen-header-bar {
        display: none !important;
      }
      .paper-container {
        box-shadow: none !important;
        border: none !important;
        margin: 0 !important;
        padding: 0 !important;
        max-width: 100% !important;
      }
      @page {
        margin: 0;
      }
    }
  </style>
</head>
<body>

  <!-- Screen preview header bar (hidden when printing) -->
  <div class="screen-header-bar">
    <div class="screen-header-title">
      📄 Xem trước Hóa đơn (Print/PDF Preview)
    </div>
    <div class="screen-actions">
      <button class="action-btn btn-pdf" onclick="window.print()">
        🖨️ In hóa đơn / Lưu PDF
      </button>
      <button class="action-btn btn-close" onclick="window.close()">
        Đóng
      </button>
    </div>
  </div>

  <!-- Thermal receipt mockup -->
  <div class="paper-container">
    <div class="receipt">
      ${bodyHTML}
      <div class="footer-brand">
        Powered by IPOS.vn
      </div>
    </div>
  </div>

</body>
</html>
  `;
}
