/* =========================
 * INDEX.gs - Backend structure and runtime notes
 * Updated to match current code.
 * ========================= */

/**
 * BACKEND GAS STRUCTURE
 *
 * Core.js:
 * - Config, sheet schema, utilities, cache, sheet helpers, lock helpers.
 *
 * Account.js:
 * - Account CRUD, role permission checks, login, last-login update.
 *
 * Auth.js:
 * - Session token auth, device fingerprint binding, role authorization,
 *   sliding CacheService session refresh, logout.
 *
 * Product.js:
 * - Product listing, stock validation, stock reduction, inventory journal.
 *
 * Table.js:
 * - Table occupy/release/listing logic.
 *
 * Order.js:
 * - Order creation, order details, immutable snapshot, order close/freeze.
 *
 * Payment.js:
 * - Multi-provider payment processing, duplicate detection, MoMo signature
 *   verification, Android/bank notification parsing.
 *
 * Store_Info.js:
 * - Store info read/update helpers.
 *
 * Sync.js:
 * - Delta polling and checksum helper.
 *
 * System.js:
 * - Logs, queue, maintenance jobs.
 *
 * Validation.js:
 * - Payload and data consistency validation.
 *
 * Api.js:
 * - doGet: không có ?action => HtmlService phục vụ file HTML "index"
 * - doGet: ?action=...&key=... => API GET (hoặc health/status không cần key)
 * - doPost: JSON body { key, action, payload }
 * - gasApiBridge(jsonBody): frontend GAS gọi qua google.script.run (không fetch /exec)
 *
 * Deploy Web App (frontend):
 * 1. npm run build trong drinkhub => dist/index.html
 * 2. Trong GAS: File > New > HTML, đặt tên chính xác "index", dán nội dung dist/index.html
 * 3. Deploy > Web app: Execute as Me, Who has access: Anyone
 * 4. Cập nhật drinkhub/.env VITE_GAS_API_URL = URL Web App (/exec hoặc /dev)
 */

/**
 * CURRENT API ACTIONS
 *
 * CREATE_ORDER
 * -> validateOrderPayload(payload)
 * -> createOrder(payload)
 * PAYMENT
 * -> validatePaymentPayload(payload.data or direct payload)
 * -> processIncomingPayment(provider, data)
 *
 * PAYMENT_ANDROID
 * -> processPaymentFromNotification({ provider, title, message, timestamp })
 *
 * GET_DELTA
 * -> getDeltaSince(version)
 *
 * GET_TABLES
 * -> getAllTables()
 *
 * GET_PRODUCTS
 * -> getProducts()
 *
 * LOGIN
 * -> authenticate(username, password, requiredRole, fingerprint)
 * -> returns { id, username, role, token, expiresAt }
 *
 * VERIFY_AUTH
 * -> verifyAuthToken(token, requiredRole, fingerprint)
 * -> requires device fingerprint and refreshes session TTL
 *
 * LOGOUT
 * -> logout(token)
 *
 * GET_STORE_INFO
 * -> getAllStoreInfo()
 *
 * UPDATE_STORE_INFO
 * -> requireRole_(userRole, ["admin"])
 * -> updateStoreInfo(key, value)
 *
 * GET_ACCOUNTS / GET_ACCOUNT / CREATE_ACCOUNT / UPDATE_ACCOUNT / DELETE_ACCOUNT
 * -> Account.js CRUD functions
 */

/**
 * ORDER FLOW
 *
 * 1. Frontend calls CREATE_ORDER
 *    -> validateOrderPayload(payload)
 *    -> createOrder(payload)
 *       -> validateStockBeforeOrder_(items)
 *       -> appendRowsBatch_(ORDER)
 *       -> appendRowsBatch_(ORDER_DETAIL)
 *       -> appendRowsBatch_(ORDER_SNAPSHOT)
 *       -> reduceProductStock_(items)
 *       -> occupyTable(tableId, orderId)
 *       -> logAction_("CREATE_ORDER", ...)
 *
 * 2. Payment is processed by PAYMENT or PAYMENT_ANDROID
 *    -> processIncomingPayment(provider, payload)
 *       -> withPaymentLock_()
 *       -> validate provider against VALID_PAYMENT_PROVIDERS
 *       -> verifyMoMoSignature_() when MoMo signature is present
 *       -> isDuplicatePayment_()
 *       -> detectOrderFromPayment_()
 *       -> verify amount against ORDER.GRAND_TOTAL
 *       -> freezeOrderSnapshot(orderId, paymentInfo)
 *          -> updateOrderStatus(orderId, "CLOSED", "PAID")
 *          -> releaseTable(tableId, orderId)
 *          -> logAction_("FREEZE_ORDER", ...)
 *       -> savePaymentHistory()
 *          -> writes 9 columns matching SHEET_SCHEMA.PAYMENT
 *       -> putPaymentCache_()
 *       -> logPayment_()
 *
 * 3. Frontend polls GET_DELTA
 *    -> getDeltaSince(version)
 */

/**
 * AUTH FLOW
 *
 * 1. Frontend calls LOGIN with username, password, fingerprint.
 * 2. authenticate() validates login result and required role.
 * 3. createAuthSession_() stores session in CacheService:
 *    - user
 *    - device fingerprint
 *    - createdAt
 *    - expiresAt
 * 4. Frontend calls VERIFY_AUTH with token and the same fingerprint.
 * 5. verifyAuthToken():
 *    - rejects missing token
 *    - rejects missing/wrong fingerprint
 *    - rejects deleted/changed account role
 *    - refreshes CacheService TTL as sliding session
 *
 * Important:
 * - Raw role strings like "admin" are not accepted as authentication.
 * - CacheService can evict early; frontend should handle AUTH_SESSION_EXPIRED.
 */

/**
 * CRITICAL FIXES / CURRENT BEHAVIOR
 *
 * ✓ PAYMENT history writes exactly 9 schema columns.
 * ✓ PAYMENT duplicate check uses fingerprint and transactionId cache + sheet fallback.
 * ✓ PAYMENT supports multiple providers:
 *   momo, zalopay, vcb, mb, tcb, bidv, vpbank, acb, tpbank, agribank, bank, cash.
 * ✓ PAYMENT_ANDROID parses notifications and auto-detects provider when omitted.
 * ✓ AUTH no longer accepts raw role strings as auth.
 * ✓ AUTH requires token + device fingerprint.
 * ✓ AUTH verify refreshes sliding session TTL.
 * ✓ AUTH authenticate validates login result before reading user.role.
 * ✓ requireAuth() no longer creates fake users.
 * ✓ ORDER stores ORDER, ORDER_DETAIL, ORDER_SNAPSHOT.
 * ✓ ORDER freeze closes order, marks paid, releases table.
 * ✓ TABLE occupy/release is wired into order lifecycle.
 * ✓ ACCOUNT CRUD is registered through Api.js.
 * ✓ STORE_INFO read/update is registered through Api.js.
 */

/**
 * KNOWN ISSUES / TODO BEFORE DEPLOY
 *
 * 1. APP_CONFIG still needs production values:
 *    - API_KEY
 *    - MOMO_SECRET_KEY
 *    - MOMO_PARTNER_CODE
 *
 * 2. Auth sessions use CacheService:
 *    - acceptable for POS, but volatile
 *    - frontend should re-login or recover when AUTH_SESSION_EXPIRED occurs
 *
 * 3. logout-all/sessionVersion is not implemented because it requires account schema changes.
 */

/**
 * SETUP (Setup.js)
 * - ensureSpreadsheetSetup_(): tự chạy trước đọc/ghi sheet (tạo tab thiếu + hàng 1 tiếng Việt)
 * - setupSpreadsheet(): chạy thủ công hoặc menu DrinkHub trên Google Sheet (onOpen)
 * - Không ghi đè hàng 1 nếu đã có tiêu đề/dữ liệu
 *
 * REQUIRED SHEETS / COLUMNS
 *
 * SHEET_SCHEMA (chỉ số cột) — tiêu đề tiếng Việt do Setup.js tạo:
 * - "Tài khoản"
 * - "Hàng hoá"
 * - "Kho hàng"
 * - "Đơn hàng"
 * - "Chi tiết đơn hàng"
 * - "Snapshot Đơn Hàng"
 * - "Bàn"
 * - "Thanh toán"
 * - "Log"
 * - "Thông tin quán"
 *
 * Extra configured sheets:
 * - APP_CONFIG.QUEUE_SHEET: "Queue"
 * - APP_CONFIG.INVENTORY_JOURNAL_SHEET: "Kho Lịch Sử"
 *
 * Payment sheet must have exactly schema-managed columns A:I (xem Setup.js)
 */

/**
 * TESTING CHECKLIST
 *
 * [ ] LOGIN returns token and expiresAt with valid fingerprint.
 * [ ] VERIFY_AUTH succeeds with same fingerprint.
 * [ ] VERIFY_AUTH fails with missing/wrong fingerprint.
 * [ ] checkAuth("admin") returns false.
 * [ ] CREATE_ORDER creates order, details, snapshot, reduces stock, occupies table.
 * [ ] PAYMENT closes order, writes 9 payment columns, releases table.
 * [ ] PAYMENT duplicate transaction is rejected/marked duplicate.
 * [ ] PAYMENT_ANDROID parses provider/order/amount/transaction from notification.
 * [ ] GET_DELTA returns newer deltas.
 * [ ] Account CRUD rejects non-admin role.
 * [ ] Store info update rejects non-admin role.
 * [ ] runAllVerificationTests() has no FAIL entries.
 */

/**
 * FLOW DIAGRAM
 *
 * Frontend
 *   |
 *   | LOGIN(username, password, fingerprint)
 *   v
 * Auth.authenticate()
 *   -> Account.login()
 *   -> createAuthSession_()
 *   -> token + expiresAt
 *
 * Frontend
 *   |
 *   | CREATE_ORDER
 *   v
 * createOrder()
 *   -> validate stock
 *   -> write ORDER / ORDER_DETAIL / ORDER_SNAPSHOT
 *   -> reduce stock
 *   -> occupy table
 *
 * Payment source
 *   |
 *   | PAYMENT or PAYMENT_ANDROID
 *   v
 * processIncomingPayment()
 *   -> duplicate check
 *   -> amount check
 *   -> freezeOrderSnapshot()
 *   -> savePaymentHistory()
 *   -> log payment
 *
 * Frontend
 *   |
 *   | GET_DELTA
 *   v
 * getDeltaSince()
 */
