/* =========================
 * Setup.js - Tự tạo sheet & tiêu đề cột tiếng Việt
 * ========================= */

/** Định nghĩa sheet + hàng tiêu đề (khớp SHEET_SCHEMA trong Core.js) */
const SHEET_SETUP_DEFINITIONS_ = [
  {
    name: SHEET_NAME.ACCOUNT,
    headers: [
      "Mã tài khoản",
      "Tên đăng nhập",
      "Mật khẩu",
      "Vai trò",
      "Ngày tạo",
      "Đăng nhập cuối",
    ],
  },
  {
    name: SHEET_NAME.PRODUCT,
    headers: [
      "Mã sản phẩm",
      "Tên sản phẩm",
      "Danh mục",
      "Giá bán",
      "Giá vốn",
      "Tồn kho",
      "Trạng thái",
      "Hình ảnh",
    ],
  },
  {
    name: SHEET_NAME.INVENTORY,
    headers: [
      "Mã phiếu",
      "Mã sản phẩm",
      "Nhà cung cấp",
      "Số lượng",
      "Người thực hiện",
      "Thời gian",
    ],
  },
  {
    name: SHEET_NAME.ORDER,
    headers: [
      "Mã đơn",
      "Mã bàn",
      "Tên khách",
      "Trạng thái",
      "Tạm tính",
      "Giảm giá",
      "Tổng cộng",
      "Trạng thái thanh toán",
      "Người tạo",
      "Ngày tạo",
    ],
  },
  {
    name: SHEET_NAME.ORDER_DETAIL,
    headers: [
      "Mã dòng",
      "Mã đơn",
      "Mã sản phẩm",
      "Tên sản phẩm",
      "Số lượng",
      "Đơn giá",
      "Thành tiền",
    ],
  },
  {
    name: SHEET_NAME.ORDER_SNAPSHOT,
    headers: [
      "Mã đơn",
      "Dữ liệu snapshot",
      "Phiên bản",
      "Thời gian đóng",
    ],
  },
  {
    name: SHEET_NAME.TABLE,
    headers: ["Mã bàn", "Tên bàn", "Trạng thái", "Đơn hiện tại"],
  },
  {
    name: SHEET_NAME.PAYMENT,
    headers: [
      "Mã thanh toán",
      "Mã đơn",
      "Phương thức",
      "Số tiền",
      "Trạng thái",
      "Mã giao dịch",
      "Thời gian thanh toán",
      "Người ghi nhận",
      "Fingerprint",
    ],
  },
  {
    name: SHEET_NAME.LOG,
    headers: [
      "Mã log",
      "Hành động",
      "Đối tượng",
      "Tài khoản",
      "Chi tiết",
      "Thời gian",
    ],
  },
  {
    name: SHEET_NAME.STORE_INFO,
    headers: ["Khóa", "Giá trị"],
  },
  {
    name: SHEET_NAME.SHIFT,
    headers: [
      "Mã ca",
      "Tên nhân viên",
      "Thời gian bắt đầu",
      "Thời gian kết thúc",
      "Tiền mặt mở ca",
      "Tổng doanh thu",
      "Tổng thanh toán",
      "Tiền mặt trong két",
      "Trạng thái",
      "Ngày tạo",
      "Ngày đóng",
    ],
  },
  {
    name: SHEET_NAME.COUPON,
    headers: [
      "Mã",
      "Code",
      "Loại giảm giá",
      "Giá trị giảm",
      "Đơn tối thiểu",
      "Giảm tối đa",
      "Trạng thái",
      "Ngày hết hạn",
    ],
  },
  {
    name: APP_CONFIG.QUEUE_SHEET,
    headers: [
      "Mã job",
      "Loại",
      "Dữ liệu",
      "Trạng thái",
      "Lỗi",
      "Thời gian",
    ],
  },
  {
    name: APP_CONFIG.INVENTORY_JOURNAL_SHEET,
    headers: [
      "Mã phiếu",
      "Mã sản phẩm",
      "Loại",
      "Số lượng",
      "Tồn trước",
      "Tồn sau",
      "Mã đơn",
      "Thời gian",
    ],
  },
];

let _spreadsheetSetupDone = false;

const formatSheetHeaderRow_ = (sheet, colCount) => {
  const headerRange = sheet.getRange(1, 1, 1, colCount);
  headerRange
    .setFontWeight("bold")
    .setBackground("#e8f0fe")
    .setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
};

const isHeaderRowEmpty_ = (sheet, colCount) => {
  const lastCol = Math.max(sheet.getLastColumn(), colCount, 1);
  const row1 = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  return row1.every((cell) => trimSafe_(cell) === "");
};

const applySheetHeaders_ = (sheet, headers, sheetJustCreated) => {
  const colCount = headers.length;

  if (sheetJustCreated || sheet.getLastRow() === 0 || isHeaderRowEmpty_(sheet, colCount)) {
    if (sheet.getMaxColumns() < colCount) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), colCount - sheet.getMaxColumns());
    }
    sheet.getRange(1, 1, 1, colCount).setValues([headers]);
    formatSheetHeaderRow_(sheet, colCount);
    return { headersApplied: true };
  }

  return { headersApplied: false, skipped: "Đã có tiêu đề hoặc dữ liệu ở hàng 1" };
};

/** Đảm bảo các khóa STORE_NAME, ADDRESS, STORE_ID tồn tại trong sheet Thông tin quán */
const ensureStoreInfoKeys_ = (sheet) => {
  const rows = sheet.getDataRange().getValues();
  const existingKeys = new Set();

  for (let i = 1; i < rows.length; i++) {
    const key = trimSafe_(rows[i][0]);
    if (key) {
      existingKeys.add(key);
    }
  }

  const requiredKeys = [
    { key: "STORE_NAME", defaultValue: "DrinkHub Shop" },
    { key: "ADDRESS", defaultValue: "Chưa có địa chỉ" },
    { key: "STORE_ID", defaultValue: "POS_001" },
  ];

  requiredKeys.forEach((item) => {
    if (!existingKeys.has(item.key)) {
      if (item.key === "STORE_NAME" && existingKeys.has("Tên")) {
        // Tự động đổi "Tên" thành "STORE_NAME" để giữ lại dữ liệu cũ của user
        for (let i = 1; i < rows.length; i++) {
          if (trimSafe_(rows[i][0]) === "Tên") {
            sheet.getRange(i + 1, 1).setValue("STORE_NAME");
            existingKeys.delete("Tên");
            existingKeys.add("STORE_NAME");
            break;
          }
        }
      } else {
        sheet.appendRow([item.key, item.defaultValue]);
      }
    }
  });
};

/**
 * Tạo sheet thiếu + ghi tiêu đề tiếng Việt (hàng 1).
 * Gọi tự động trước mọi thao tác đọc/ghi sheet; chạy một lần mỗi execution.
 */
const ensureSpreadsheetSetup_ = () => {
  if (_spreadsheetSetupDone) return { alreadyDone: true };
  _spreadsheetSetupDone = true;

  const ss = getSpreadsheet_();
  const report = {
    created: [],
    headersSet: [],
    skipped: [],
  };

  SHEET_SETUP_DEFINITIONS_.forEach((def) => {
    let sheet = ss.getSheetByName(def.name);
    const sheetJustCreated = !sheet;

    if (!sheet) {
      sheet = ss.insertSheet(def.name);
      report.created.push(def.name);
    }

    const result = applySheetHeaders_(sheet, def.headers, sheetJustCreated);
    if (result.headersApplied) {
      report.headersSet.push(def.name);
      invalidateSheetCache_(def.name);
    } else if (result.skipped) {
      report.skipped.push({ name: def.name, reason: result.skipped });
    }

    // Đảm bảo cấu trúc key-value của store info
    if (def.name === SHEET_NAME.STORE_INFO) {
      ensureStoreInfoKeys_(sheet);
      invalidateSheetCache_(SHEET_NAME.STORE_INFO);
    }
  });

  return report;
};

/**
 * Chạy thủ công: Apps Script → chọn hàm setupSpreadsheet → Run
 * Hoặc menu DrinkHub trên Google Sheet (onOpen).
 */
function setupSpreadsheet() {
  _spreadsheetSetupDone = false;
  const report = ensureSpreadsheetSetup_();
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("DrinkHub")
    .addItem("Khởi tạo sheet & cột (Tiếng Việt)", "setupSpreadsheet")
    .addToUi();
}
