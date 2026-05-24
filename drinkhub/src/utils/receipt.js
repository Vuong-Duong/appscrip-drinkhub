// Hàm để in hóa đơn
export const printReceipt = (order, table, restaurant) => {
  const receiptContent = generateReceiptHTML(order, table, restaurant);

  const printWindow = window.open("", "", "height=400,width=600");
  printWindow.document.write(receiptContent);
  printWindow.document.close();

  setTimeout(() => {
    printWindow.print();
  }, 250);
};

// Tạo HTML cho receipt
function generateReceiptHTML(order, table, restaurant) {
  const items = order.items
    .map(
      (item) =>
        `
    <tr>
      <td style="text-align: left; padding: 4px 0;">${item.name}</td>
      <td style="text-align: center; padding: 4px 0;">${item.quantity}</td>
      <td style="text-align: right; padding: 4px 0;">${item.price.toLocaleString()}đ</td>
      <td style="text-align: right; padding: 4px 0;">${item.total.toLocaleString()}đ</td>
    </tr>
  `,
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Hóa Đơn ${order.id}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      margin: 0;
      padding: 20px;
      color: #333;
    }
    .receipt {
      max-width: 400px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      margin-bottom: 10px;
      border-bottom: 2px dashed #ccc;
      padding-bottom: 10px;
    }
    .restaurant-name {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .info {
      text-align: left;
      margin-bottom: 10px;
      border-bottom: 2px dashed #ccc;
      padding-bottom: 10px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
    }
    table {
      width: 100%;
      margin-bottom: 10px;
      border-bottom: 2px dashed #ccc;
      padding-bottom: 10px;
    }
    td {
      padding: 4px 0;
    }
    .summary {
      margin-bottom: 10px;
      border-bottom: 2px dashed #ccc;
      padding-bottom: 10px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
    }
    .total {
      font-weight: bold;
      font-size: 14px;
      display: flex;
      justify-content: space-between;
    }
    .footer {
      text-align: center;
      margin-top: 10px;
      font-size: 10px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="restaurant-name">${restaurant.name}</div>
      <div>${restaurant.address}</div>
      <div>${restaurant.phone}</div>
    </div>

    <div class="info">
      <div class="info-row">
        <span>Mã HĐ: ${order.id}</span>
        <span>Bàn: ${table.number}</span>
      </div>
      <div class="info-row">
        <span>Thời gian: ${new Date().toLocaleString("vi-VN")}</span>
      </div>
      <div class="info-row">
        <span>Khách: ${table.guestCount}</span>
      </div>
    </div>

    <table>
      <thead style="border-bottom: 1px solid #ccc; margin-bottom: 5px;">
        <tr>
          <th style="text-align: left;">Sản phẩm</th>
          <th style="text-align: center;">SL</th>
          <th style="text-align: right;">Giá</th>
          <th style="text-align: right;">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        ${items}
      </tbody>
    </table>

    <div class="summary">
      <div class="summary-row">
        <span>Tạm tính:</span>
        <span>${order.subtotal.toLocaleString()}đ</span>
      </div>
      ${
        order.discount > 0
          ? `
      <div class="summary-row">
        <span>Giảm giá:</span>
        <span>-${order.discount.toLocaleString()}đ</span>
      </div>
      `
          : ""
      }
      ${
        order.tax > 0
          ? `
      <div class="summary-row">
        <span>Thuế:</span>
        <span>${order.tax.toLocaleString()}đ</span>
      </div>
      `
          : ""
      }
      <div class="total">
        <span>Tổng cộng:</span>
        <span>${order.total.toLocaleString()}đ</span>
      </div>
    </div>

    <div class="footer">
      <div>Cảm ơn bạn đã ghé thăm!</div>
      <div>Vui lòng giữ hóa đơn này</div>
    </div>
  </div>
</body>
</html>
  `;

  return html;
}
