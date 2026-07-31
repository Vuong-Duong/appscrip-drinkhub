/**
 * Utility for printing cup decal stickers (Tem nhiệt dán ly 50x30mm)
 */

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

export function printCupStickers(orderData, tableData, storeInfo) {
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
          width: 50mm;
          height: 35mm;
          padding: 2mm 3mm;
          box-sizing: border-box;
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          page-break-after: always;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          border: 1px dashed #ccc;
          margin-bottom: 5px;
        ">
          <!-- Top Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #000; padding-bottom: 2px;">
            <span style="font-size: 10px; font-weight: bold; text-transform: uppercase;">${storeName}</span>
            <span style="font-size: 10px; font-weight: bold; background: #000; color: #fff; padding: 1px 4px; border-radius: 2px;">
              ${tableName} • Ly: ${cupIndex}/${totalCups}
            </span>
          </div>

          <!-- Item Main Title -->
          <div style="margin-top: 3px;">
            <div style="font-size: 13px; font-weight: 900; line-height: 1.2; text-transform: uppercase;">
              ${cup.name} ${cup.size ? `(${cup.size})` : ""}
            </div>

            <!-- Toppings -->
            ${toppingText ? `
              <div style="font-size: 9px; font-weight: bold; margin-top: 2px; color: #222;">
                🧋 ${toppingText}
              </div>
            ` : ""}

            <!-- Notes -->
            ${notesText ? `
              <div style="font-size: 9px; font-style: italic; margin-top: 1px; color: #333;">
                📝 ${notesText}
              </div>
            ` : ""}
          </div>

          <!-- Bottom Barcode & Timestamp -->
          <div style="margin-top: auto; border-top: 0.5px solid #ddd; padding-top: 1px; text-align: center;">
            ${generateSimpleBarcodeHTML(cupBarcode)}
            <div style="display: flex; justify-content: space-between; font-size: 7px; font-weight: bold; color: #555; margin-top: 1px;">
              <span>Đơn: #${orderId.slice(-6)}</span>
              <span>${formattedTime} ${formattedDate}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  const printWindow = window.open("", "_blank", "width=450,height=600");
  if (!printWindow) {
    alert("Vui lòng cho phép mở popup trình duyệt để in tem dán ly!");
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>In Tem Dán Ly - ${storeName}</title>
      <style>
        @page {
          size: 50mm 35mm;
          margin: 0;
        }
        body {
          margin: 0;
          padding: 0;
          background: #eee;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        @media print {
          body {
            background: #fff;
          }
          .no-print {
            display: none !important;
          }
          .decal-sticker {
            border: none !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
        }
        .decal-sticker {
          box-shadow: 0 2px 5px rgba(0,0,0,0.15);
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="padding: 10px; background: #333; color: #fff; width: 100%; text-align: center; box-sizing: border-box;">
        <button onclick="window.print()" style="padding: 8px 16px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
          🖨️ In ${totalCups} Tem Dán Ly
        </button>
        <button onclick="window.close()" style="padding: 8px 16px; background: #4b5563; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; margin-left: 8px;">
          Đóng
        </button>
      </div>

      <div style="padding: 10px;">
        ${stickersHTML}
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
}
