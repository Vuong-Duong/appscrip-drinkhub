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

// Tải html2canvas một lần duy nhất qua CDN
function ensureHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onload = () => resolve(window.html2canvas);
    script.onerror = () => reject(new Error('Không tải được html2canvas. Kiểm tra kết nối mạng.'));
    document.head.appendChild(script);
  });
}

// Gọi hàm này 1 lần khi app khởi động để tải sẵn thư viện html2canvas
export function preloadPrintDependencies() {
  ensureHtml2Canvas().catch(() => {});
}

// Render HTML hóa đơn trong iframe ẩn, chụp thành ảnh PNG base64
async function renderReceiptToPngBase64(htmlContent) {
  const html2canvas = await ensureHtml2Canvas();

  // Tạo iframe ẩn để render HTML
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '-9999px';
  iframe.style.width = '302px'; // 80mm ~ 302px at 96dpi
  iframe.style.height = '1px';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    // Chờ render xong (giảm xuống 150ms để tránh mất user gesture)
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Tự động điều chỉnh chiều cao
    const scrollHeight = iframe.contentWindow.document.body.scrollHeight;
    iframe.style.height = scrollHeight + 'px';

    const canvas = await html2canvas(iframe.contentWindow.document.body, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: 302,
      windowWidth: 302,
    });

    return canvas.toDataURL('image/png');
  } finally {
    // Dọn dẹp iframe sau khi chụp xong
    try {
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    } catch (_) {}
  }
}

// Gửi ảnh PNG base64 đến app RawBT qua URI scheme
function sendBase64ImageToRawBT(base64DataUrl) {
  // base64DataUrl có dạng: data:image/png;base64,xxxx
  const uri = 'rawbt:' + base64DataUrl;
  const link = document.createElement('a');
  link.href = uri;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    try {
      if (link && link.parentNode) link.parentNode.removeChild(link);
    } catch (_) {}
  }, 3000);
}

// Main print receipt handler — in qua RawBT (không dùng hộp thoại in hệ thống)
export const printReceipt = async (order, table, restaurant, type = "payment_receipt") => {
  try {
    const receiptContent = generateReceiptHTML(order, table, restaurant, type);
    const base64 = await renderReceiptToPngBase64(receiptContent);
    sendBase64ImageToRawBT(base64);
  } catch (err) {
    console.error('Lỗi khi in hóa đơn qua RawBT:', err);
    alert('Lỗi in: ' + (err.message || 'Không xác định. Kiểm tra đã cài RawBT và cấu hình máy in chưa.'));
  }
};

// Helper render Topping và Note cho receipt
const getItemDetailsHTML = (item, isSlip = false) => {
  let html = "";
  if (Array.isArray(item.toppings) && item.toppings.length > 0) {
    const toppingsText = item.toppings
      .map(
        (t) =>
          `+ ${t.name || t.productName} (x${t.quantity || 1})${!isSlip && Number(t.price || 0) > 0 ? ` (+${Number(t.price).toLocaleString()}d)` : ""}`,
      )
      .join("<br/>");
    html += `<div style="font-size:10px;color:#444;padding-left:6px;margin-top:1px;">${toppingsText}</div>`;
  }

  const notesList = Array.isArray(item.notes) ? item.notes : [];
  const customNoteStr = (item.customNote || "").trim();
  const allNotes = [...notesList];
  if (customNoteStr) allNotes.push(customNoteStr);

  if (allNotes.length > 0) {
    html += `<div style="font-size:10px;font-style:italic;color:#555;padding-left:6px;margin-top:1px;">* ${allNotes.join(", ")}</div>`;
  }

  return html;
};

// Generates HTML for single receipt body
function generateSingleReceiptBodyHTML(order, table, restaurant, singleType) {
  const storeName = restaurant?.name || "Longka Cafe";
  const storeAddress = restaurant?.address || "";
  const storePhone = restaurant?.phone || "";

  const createdBy = order.createdBy || "Staff";
  const formattedTime = formatTimeVN(order.createdAt);
  const formattedDateText = formatDateVNText(order.createdAt);
  const formattedDate = formatDateVN(order.createdAt);

  const tableNumOnly = (table?.number || "").replace(/bàn/gi, "").trim() || "N/A";
  const totalQty = (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);

  const seq = order.id ? parseInt(order.id.replace(/\D/g, "").slice(-2)) || 11 : 11;

  if (singleType === "order_slip") {
    // === PHIẾU ĐẶT ĐỒ (Bếp / Pha chế) ===
    const itemsRows = (order.items || []).map(item => `
      <tr>
        <td style="border:1px solid #000;text-align:left;padding:4px 5px;">
          <div style="font-weight:bold;">${item.name || item.productName}</div>
          ${getItemDetailsHTML(item, true)}
        </td>
        <td style="border:1px solid #000;text-align:center;padding:4px 3px;font-weight:bold;vertical-align:top;">${item.quantity}</td>
        <td style="border:1px solid #000;text-align:center;padding:4px 3px;vertical-align:top;">MON</td>
      </tr>
    `).join("");

    return `
      <div class="receipt-title">PHIEU DAT DO</div>
      <div class="receipt-subtitle">BAN ${tableNumOnly} - HD.${order.id || "N/A"}</div>

      <table style="width:100%;margin:8px 0 6px;border-collapse:collapse;">
        <tr>
          <td style="padding:2px 0;font-weight:bold;">Gio : ${formattedTime}</td>
          <td style="text-align:right;padding:2px 0;font-weight:bold;">${formattedDateText}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:2px 0;font-weight:bold;">NV: ${createdBy}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:2px 0;font-weight:bold;">STT: ${seq} (SL: ${totalQty})</td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;margin:6px 0 10px;">
        <thead>
          <tr>
            <th style="border:1px solid #000;text-align:center;padding:4px 5px;width:60%;">Ten mon</th>
            <th style="border:1px solid #000;text-align:center;padding:4px 3px;width:20%;">SL</th>
            <th style="border:1px solid #000;text-align:center;padding:4px 3px;width:20%;">DVT</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
    `;
  } else {
    // === HÓA ĐƠN THANH TOÁN ===
    const shortId = order.id ? order.id.slice(-5).toUpperCase() : "N/A";

    const itemsRows = (order.items || []).map((item, idx) => `
      <tr>
        <td style="padding:4px 0;text-align:center;vertical-align:top;">${idx + 1}</td>
        <td style="padding:4px 0;text-align:left;">
          <div style="font-weight:bold;">${item.name || item.productName}</div>
          ${getItemDetailsHTML(item, false)}
        </td>
        <td style="padding:4px 0;text-align:center;font-weight:bold;vertical-align:top;">${item.quantity}</td>
        <td style="padding:4px 0;text-align:right;vertical-align:top;">${Number(item.total || item.subtotal || 0).toLocaleString()}</td>
      </tr>
    `).join("");

    const payMethodText = order.paymentMethod === "cash" ? "Tien mat" : "Chuyen khoan";
    const subtotalVal = order.subtotal || 0;
    const discountVal = order.discount || 0;
    const totalVal = order.total !== undefined ? order.total : (order.grandTotal || 0);

    return `
      <div class="receipt-title">HOA DON THANH TOAN</div>
      <div class="receipt-subtitle">So HD: ${order.id || "N/A"}</div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;font-weight:bold;">
        <tr>
          <td style="padding:2px 0;">Ma: #${shortId}</td>
          <td style="text-align:right;padding:2px 0;">TN: ${createdBy}</td>
        </tr>
        <tr>
          <td style="padding:2px 0;">Ban: ${tableNumOnly}</td>
          <td style="text-align:right;padding:2px 0;">Ngay: ${formattedDate}</td>
        </tr>
        <tr>
          <td style="padding:2px 0;">Gio vao: ${formattedTime}</td>
          <td style="text-align:right;padding:2px 0;">Gio ra: ${formatTimeVN(new Date())}</td>
        </tr>
      </table>

      <div style="border-top:1px solid #000;border-bottom:1px solid #000;margin:6px 0;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px solid #000;">
              <th style="padding:4px 0;text-align:center;width:8%;">STT</th>
              <th style="padding:4px 0;text-align:left;width:52%;">Ten mon</th>
              <th style="padding:4px 0;text-align:center;width:8%;">SL</th>
              <th style="padding:4px 0;text-align:right;width:32%;">T.Tien</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
      </div>

      <table style="width:100%;border-collapse:collapse;margin:6px 0 10px;font-weight:bold;">
        <tr>
          <td style="padding:3px 0;">Thanh tien:</td>
          <td style="padding:3px 0;text-align:right;">${subtotalVal.toLocaleString()} d</td>
        </tr>
        ${discountVal > 0 ? `
        <tr>
          <td style="padding:3px 0;">Giam gia:</td>
          <td style="padding:3px 0;text-align:right;">-${discountVal.toLocaleString()} d</td>
        </tr>
        ` : ""}
        <tr style="border-top:1px solid #000;">
          <td style="padding:5px 0;font-size:14px;">TONG TIEN:</td>
          <td style="padding:5px 0;text-align:right;font-size:14px;">${totalVal.toLocaleString()} d</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:3px 0;font-size:11px;">+ ${payMethodText}: ${totalVal.toLocaleString()} d</td>
        </tr>
      </table>

      ${(storeName || storeAddress || storePhone) ? `
      <div style="text-align:center;margin-top:12px;font-size:11px;border-top:1px dashed #000;padding-top:6px;">
        <div style="font-weight:bold;">${storeName}</div>
        ${storeAddress ? `<div>${storeAddress}</div>` : ""}
        ${storePhone && storePhone !== "Số điện thoại" ? `<div>SDT: ${storePhone}</div>` : ""}
      </div>
      ` : ""}
    `;
  }
}

// Generates complete HTML document for 80mm thermal printer
function generateReceiptHTML(order, table, restaurant, type) {
  let types = [];
  if (Array.isArray(type)) {
    types = type;
  } else if (type === "both" || type === "all") {
    types = ["order_slip", "payment_receipt"];
  } else {
    types = [type];
  }

  const bodies = types.map((t) =>
    generateSingleReceiptBodyHTML(order, table, restaurant, t)
  );

  // Dùng page-break-after để phân trang giữa phiếu
  const bodyHTML = bodies.join(
    '<div style="page-break-after:always;"></div>'
  );

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>In phieu</title>
  <style>
    /* ===== 80mm Thermal Printer Styles ===== */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      line-height: 1.35;
      color: #000;
      background: #fff;
      width: 80mm;
    }

    .receipt-title {
      font-size: 14px;
      font-weight: bold;
      text-align: center;
      margin-bottom: 3px;
      letter-spacing: 0.5px;
    }

    .receipt-subtitle {
      text-align: center;
      font-size: 12px;
      font-weight: bold;
      margin-bottom: 6px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }
  </style>
</head>
<body>
  ${bodyHTML}
  <div style="text-align:center;font-size:10px;margin-top:10px;border-top:1px dashed #aaa;padding-top:4px;">
    Cam on quy khach!
  </div>
</body>
</html>`;
}
