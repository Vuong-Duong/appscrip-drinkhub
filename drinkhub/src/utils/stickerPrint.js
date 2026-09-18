/**
 * Utility for printing cup decal stickers via RawBT
 */

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

// Render HTML trong iframe ẩn, chụp thành ảnh PNG base64
async function renderReceiptToPngBase64(htmlContent) {
  const html2canvas = await ensureHtml2Canvas();

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
    try {
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    } catch (_) {}
  }
}

// Gửi ảnh PNG base64 đến app RawBT
function sendBase64ImageToRawBT(base64DataUrl) {
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

function generateSimpleBarcodeHTML(codeStr) {
  const cleanCode = String(codeStr || "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  
  return `
    <div style="text-align: center; margin-top: 4px;">
      <svg width="180" height="32" viewBox="0 0 180 32" style="max-width: 100%;">
        <rect x="0" y="0" width="180" height="32" fill="#ffffff"/>
        <g fill="#000000">
          <rect x="10" y="2" width="2" height="20"/>
          <rect x="14" y="2" width="1" height="20"/>
          <rect x="17" y="2" width="3" height="20"/>
          <rect x="22" y="2" width="1" height="20"/>
          <rect x="25" y="2" width="2" height="20"/>
          <rect x="29" y="2" width="4" height="20"/>
          <rect x="35" y="2" width="1" height="20"/>
          <rect x="38" y="2" width="2" height="20"/>
          <rect x="42" y="2" width="3" height="20"/>
          <rect x="47" y="2" width="1" height="20"/>
          <rect x="50" y="2" width="2" height="20"/>
          <rect x="54" y="2" width="1" height="20"/>
          <rect x="57" y="2" width="3" height="20"/>
          <rect x="62" y="2" width="2" height="20"/>
          <rect x="66" y="2" width="1" height="20"/>
          <rect x="69" y="2" width="4" height="20"/>
          <rect x="75" y="2" width="2" height="20"/>
          <rect x="79" y="2" width="1" height="20"/>
          <rect x="82" y="2" width="3" height="20"/>
          <rect x="87" y="2" width="2" height="20"/>
          <rect x="91" y="2" width="1" height="20"/>
          <rect x="94" y="2" width="3" height="20"/>
          <rect x="99" y="2" width="1" height="20"/>
          <rect x="102" y="2" width="4" height="20"/>
          <rect x="108" y="2" width="2" height="20"/>
          <rect x="112" y="2" width="1" height="20"/>
          <rect x="115" y="2" width="3" height="20"/>
          <rect x="120" y="2" width="1" height="20"/>
          <rect x="123" y="2" width="2" height="20"/>
          <rect x="127" y="2" width="4" height="20"/>
          <rect x="133" y="2" width="1" height="20"/>
          <rect x="136" y="2" width="3" height="20"/>
          <rect x="141" y="2" width="2" height="20"/>
          <rect x="145" y="2" width="1" height="20"/>
          <rect x="148" y="2" width="3" height="20"/>
          <rect x="153" y="2" width="2" height="20"/>
          <rect x="157" y="2" width="1" height="20"/>
          <rect x="160" y="2" width="4" height="20"/>
          <rect x="166" y="2" width="2" height="20"/>
        </g>
      </svg>
      <div style="font-family: monospace; font-size: 10px; font-weight: bold; margin-top: -4px; letter-spacing: 1px;">
        *${cleanCode}*
      </div>
    </div>
  `;
}

export const printCupStickers = async (orderData, tableData, storeInfo) => {
  const storeName = storeInfo?.name || "LongKa";
  const tableName = tableData?.number || orderData?.tableName || orderData?.tableId || "Mang đi";
  const orderId = String(orderData?.id || orderData?.existingOrderId || `ORD${Date.now().toString().slice(-6)}`);
  const formattedTime = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const formattedDate = new Date().toLocaleDateString("vi-VN");

  // Expand items by quantity (1 quantity = 1 cup sticker)
  const cupList = [];
  const items = Array.isArray(orderData?.items) ? orderData.items : [];

  items.forEach((item) => {
    const qty = Math.max(1, parseInt(item.quantity || 1, 10));
    for (let q = 1; q <= qty; q++) {
      cupList.push({
        name: item.productName || item.name || "Nước uống",
        size: item.size || "",
        toppings: Array.isArray(item.toppings) ? item.toppings : [],
        notes: Array.isArray(item.notes) ? item.notes : [],
        customNote: item.customNote || "",
      });
    }
  });

  if (cupList.length === 0) {
    alert("Không có món nào để in tem dán ly!");
    return;
  }

  const totalCups = cupList.length;

  const stickersHTML = cupList
    .map((cup, idx) => {
      const cupIndex = idx + 1;
      const cupBarcode = `${orderId.replace(/[^a-zA-Z0-9]/g, "")}-${cupIndex}`;

      const toppingText = cup.toppings.length > 0
        ? cup.toppings.map((t) => `+ ${t.name || t.productName} (x${t.quantity || 1})`).join(", ")
        : "";

      const notesArr = [...(cup.notes || [])];
      if (cup.customNote) notesArr.push(`"${cup.customNote}"`);
      const notesText = notesArr.join(", ");

      return `
        <div class="decal-sticker" style="
          width: 80mm;
          min-height: 50mm;
          padding: 4mm 6mm;
          box-sizing: border-box;
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          page-break-after: always;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          border-bottom: 1px dashed #ccc;
          margin-bottom: 0px;
        ">
          <!-- Top Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 4px;">
            <span style="font-size: 14px; font-weight: bold; text-transform: uppercase;">${storeName}</span>
            <span style="font-size: 14px; font-weight: bold; background: #000; color: #fff; padding: 2px 6px; border-radius: 4px;">
              ${tableName} • Ly: ${cupIndex}/${totalCups}
            </span>
          </div>

          <!-- Item Main Title -->
          <div style="margin-top: 6px; flex-grow: 1;">
            <div style="font-size: 18px; font-weight: 900; line-height: 1.2; text-transform: uppercase;">
              ${cup.name} ${cup.size ? `(${cup.size})` : ""}
            </div>

            <!-- Toppings -->
            ${toppingText ? `
              <div style="font-size: 12px; font-weight: bold; margin-top: 4px; color: #222;">
                🧋 ${toppingText}
              </div>
            ` : ""}

            <!-- Notes -->
            ${notesText ? `
              <div style="font-size: 12px; font-style: italic; margin-top: 2px; color: #333;">
                📝 ${notesText}
              </div>
            ` : ""}
          </div>

          <!-- Bottom Barcode & Timestamp -->
          <div style="margin-top: 8px; border-top: 1px solid #ddd; padding-top: 4px; text-align: center;">
            ${generateSimpleBarcodeHTML(cupBarcode)}
            <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: bold; color: #555; margin-top: 2px;">
              <span>Đơn: #${orderId.slice(-6)}</span>
              <span>${formattedTime} ${formattedDate}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  const fullHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>In Tem Dán Ly - ${storeName}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          margin: 0;
          padding: 0;
          background: #fff;
          width: 80mm;
          display: flex;
          flex-direction: column;
        }
      </style>
    </head>
    <body>
      ${stickersHTML}
    </body>
    </html>
  `;

  try {
    const base64 = await renderReceiptToPngBase64(fullHTML);
    sendBase64ImageToRawBT(base64);
  } catch (err) {
    console.error('Lỗi khi in tem qua RawBT:', err);
    alert('Lỗi in tem: ' + (err.message || 'Không xác định. Kiểm tra đã cài RawBT chưa.'));
  }
}
