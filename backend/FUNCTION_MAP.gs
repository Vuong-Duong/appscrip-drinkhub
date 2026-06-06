/* =========================
 * FUNCTION_MAP.gs - Backend function checklist
 * Updated to match current code.
 * ========================= */

/**
 * CORE.JS
 * ✓ APP_CONFIG
 * ✓ SHEET_NAME
 * ✓ SHEET_SCHEMA
 * ✓ trimSafe_(value)
 * ✓ toIsoString_(value)
 * ✓ toNumberSafe_(value, fallback)
 * ✓ generateId_(prefix)
 * ✓ deepClone_(obj)
 * ✓ parseJsonSafe_(value, fallback)
 * ✓ getSpreadsheet_()
 * ✓ getSheet_(sheetName)
 * ✓ getSheetData_(sheetName, useCache)
 * ✓ appendRowsBatch_(sheetName, rows)
 * ✓ invalidateSheetCache_(sheetName)
 * ✓ withPaymentLock_(lockId, callback)
 * ✓ withTransaction_(transactionId, callback)
 * ✓ withStockLock_(productId, callback)
 * ✓ findRowById_(sheetName, id, idColumnIndex)
 * ✓ batchWriteRows_(sheetName, startRow, numRows, rows)
 * ✓ getStoreInfo_(useCache)
 * ✓ writeLog_(action, target, account, details)
 * ✓ logAction_(action, target, account, details)
 */

/**
 * AUTH.JS
 * ✓ normalizeAuthRole_(role)
 * ✓ normalizeAuthFingerprint_(fingerprint)
 * ✓ normalizeRequiredRoles_(requiredRole)
 * ✓ sanitizeAuthUser_(user)
 * ✓ isValidAuthUser_(user)
 * ✓ isRoleAllowed_(role, requiredRole)
 * ✓ refreshAuthSession_(token, session)
 * ✓ createAuthSession_(user, fingerprint)
 * ✓ authenticate(username, password, requiredRole, fingerprint)
 * ✓ verifyAuthToken(authToken, requiredRole, fingerprint)
 * ✓ checkAuth(authContext, requiredRole)
 * ✓ requireAuth(authContext, requiredRole)
 * ✓ getCurrentUser(authToken, fingerprint)
 * ✓ logout(authToken)
 *
 * Current auth rules:
 * - Auth must use a real session token plus device fingerprint.
 * - Raw role strings like "admin" are not accepted as authentication.
 * - verifyAuthToken refreshes CacheService TTL as a sliding session.
 *
 * Calls:
 * ✓ login() -> Account.js
 * ✓ getAccount() -> Account.js
 * ✓ trimSafe_(), toIsoString_(), generateId_(), parseJsonSafe_() -> Core.js
 * ✓ calculateChecksum_() -> Sync.js
 * ⚠ CacheService is volatile; frontend should handle AUTH_SESSION_EXPIRED by re-login.
 */

/**
 * ACCOUNT.JS
 * ✓ ROLE
 * ✓ ADMIN_ONLY_ROLES
 * ✓ STAFF_ALLOWED_ROLES
 * ✓ checkPermission(userRole, allowedRoles)
 * ✓ getAllAccounts(userRole)
 * ✓ getAccount(accountId)
 * ✓ createAccount(userRole, username, password, role)
 * ✓ updateAccount(userRole, accountId, data)
 * ✓ deleteAccount(userRole, accountId)
 * ✓ updateLastLogin(accountId)
 * ✓ login(username, password)
 *
 * Calls:
 * ✓ getSheetData_(), findRowById_(), appendRowsBatch_(), batchWriteRows_() -> Core.js
 * ✓ ensureSpreadsheetSetup_(), setupSpreadsheet(), onOpen() -> Setup.js
 * ✓ invalidateSheetCache_(), trimSafe_(), toIsoString_(), generateId_() -> Core.js
 * ✓ withPaymentLock_(), logAction_() -> Core.js
 */

/**
 * API.JS
 * ✓ ok_(data)
 * ✓ fail_(error, details)
 * ✓ requireFields_(payload, fields)
 * ✓ requireRole_(role, allowed)
 * ✓ validate_(validator, payload, errorCode)
 * ✓ withTiming_(actionName, handler)
 * ✓ simpleHandler_(fn)
 * ✓ isBusinessError_(err)
 * ✓ withTryCatch_(handler)
 * ✓ handleCreateOrder_(payload)
 * ✓ handlePayment_(payload)
 * ✓ handlePaymentAndroid_(payload)
 * ✓ handleGetDelta_(payload)
 * ✓ handleGetTables_()
 * ✓ handleGetProducts_()
 * ✓ handleLogin_(payload)
 * ✓ handleVerifyAuth_(payload)
 * ✓ handleLogout_(payload)
 * ✓ handleGetStoreInfo_()
 * ✓ handleUpdateStoreInfo_(payload)
 * ✓ handleGetAccounts_(payload)
 * ✓ handleGetAccount_(payload)
 * ✓ handleCreateAccount_(payload)
 * ✓ handleUpdateAccount_(payload)
 * ✓ handleDeleteAccount_(payload)
 * ✓ ACTION_HANDLERS
 * ✓ doPost(e)
 * ✓ jsonResponse_(data)
 * ✓ handleError(err)
 *
 * Registered actions:
 * CREATE_ORDER, PAYMENT, PAYMENT_ANDROID,
 * GET_DELTA, GET_TABLES, GET_PRODUCTS,
 * LOGIN, VERIFY_AUTH, LOGOUT,
 * GET_STORE_INFO, UPDATE_STORE_INFO,
 * GET_ACCOUNTS, GET_ACCOUNT, CREATE_ACCOUNT, UPDATE_ACCOUNT, DELETE_ACCOUNT
 */

/**
 * ORDER.JS
 * ✓ createOrder(payload)
 * ✓ freezeOrderSnapshot(orderId, paymentInfo)
 * ✓ updateOrderStatus(orderId, status, paymentStatus)
 *
 * Calls:
 * ✓ validateStockBeforeOrder_(), reduceProductStock_() -> Product.js
 * ✓ occupyTable(), releaseTable() -> Table.js
 * ✓ generateId_(), appendRowsBatch_(), toIsoString_(), parseJsonSafe_() -> Core.js
 * ✓ getSheet_(), findRowById_(), batchWriteRows_(), invalidateSheetCache_() -> Core.js
 * ✓ logAction_() -> Core.js
 */

/**
 * PAYMENT.JS
 * ✓ PAYMENT_PROVIDERS
 * ✓ VALID_PAYMENT_PROVIDERS
 * ✓ normalizePaymentPayload_(provider, rawPayload)
 * ✓ createPaymentFingerprint_(payment)
 * ✓ putPaymentCache_(fingerprint, transactionId)
 * ✓ isDuplicatePayment_(fingerprint, transactionId)
 * ✓ detectOrderFromPayment_(normalized)
 * ✓ processIncomingPayment(provider, rawPayload)
 * ✓ savePaymentHistory(paymentResult, orderId)
 * ✓ processMoMoWebhook(payload)
 * ✓ verifyMoMoSignature_(webhookData, momoSignature)
 * ✓ NOTIFICATION_PATTERNS
 * ✓ detectNotificationProvider_(title, message)
 * ✓ parseNotificationData_(notificationPayload)
 * ✓ processPaymentFromNotification(notificationPayload)
 *
 * Calls:
 * ✓ trimSafe_(), toNumberSafe_(), generateId_(), toIsoString_() -> Core.js
 * ✓ getSheetData_(), appendRowsBatch_(), findRowById_(), withPaymentLock_() -> Core.js
 * ✓ calculateChecksum_() -> Sync.js
 * ✓ freezeOrderSnapshot() -> Order.js
 * ✓ logPayment_(), logSystemError_() -> System.js
 */

/**
 * PRODUCT.JS
 * ✓ getProducts(activeOnly)
 * ✓ mapProductRow_(row)
 * ✓ createProductSnapshot_(product, qty)
 * ✓ validateStockBeforeOrder_(items)
 * ✓ reduceProductStock_(items)
 * ✓ createInventoryJournal_(payload)
 * ✓ adjustInventory_(payload)
 *
 * Calls:
 * ✓ getSheetData_(), trimSafe_(), toNumberSafe_(), toIsoString_() -> Core.js
 * ✓ withTransaction_(), withStockLock_(), batchWriteRows_(), appendRowsBatch_() -> Core.js
 * ✓ generateId_(), findRowById_() -> Core.js
 */

/**
 * TABLE.JS
 * ✓ releaseTable(tableId, orderId)
 * ✓ occupyTable(tableId, orderId)
 * ✓ getAllTables(filterStatus)
 * ✓ getAvailableTables()
 *
 * Calls:
 * ✓ findRowById_(), batchWriteRows_(), invalidateSheetCache_() -> Core.js
 * ✓ trimSafe_(), getSheetData_(), logAction_() -> Core.js
 */

/**
 * STORE_INFO.JS
 * ✓ getStoreInfo(useCache)
 * ✓ getAllStoreInfo()
 * ✓ updateStoreInfo(key, value)
 *
 * Calls:
 * ✓ getStoreInfo_(), getSheetData_(), batchWriteRows_() -> Core.js
 * ✓ trimSafe_(), invalidateSheetCache_(), logAction_() -> Core.js
 */

/**
 * SYNC.JS
 * ✓ nextSyncVersion()
 * ✓ buildDelta(entity, action, payload)
 * ✓ pushDelta(entity, action, payload)
 * ✓ getDeltaSince(clientVersion)
 * ✓ calculateChecksum_(obj)
 *
 * Calls:
 * ✓ toIsoString_(), generateId_(), appendRowsBatch_(), invalidateSheetCache_() -> Core.js
 * ✓ getSheetData_(), parseJsonSafe_() -> Core.js
 */

/**
 * SYSTEM.JS
 * ✓ now_()
 * ✓ logAction_(action, target, account, details)
 * ✓ logPayment_(orderId, paymentInfo, account)
 * ✓ logSystemError_(errorInfo)
 * ✓ logAudit_(action, target, account, details)
 * ✓ enqueueJob_(type, payload)
 * ✓ processQueue_()
 * ✓ archiveClosedOrders_()
 * ✓ repairOrderState_()
 * ✓ gmailPaymentFallbackJob() -> calls checkGmailForPaymentFallback_()
 * ✓ warmupCache_()
 * ✓ hourlyMaintenance_()
 *
 * Calls:
 * ✓ writeLog_(), appendRowsBatch_(), getSheetData_(), batchWriteRows_() -> Core.js
 * ✓ trimSafe_(), parseJsonSafe_(), toIsoString_(), invalidateSheetCache_() -> Core.js
 */

/**
 * VALIDATION.JS
 * ✓ validateOrderPayload(payload)
 * ✓ validatePaymentPayload(payload)
 * ✓ validateDataConsistency()
 * ✓ testDataFlow()
 * ✓ validateNotificationPayload(payload)
 *
 * Calls:
 * ✓ toNumberSafe_(), getSheetData_(), trimSafe_() -> Core.js
 */

/**
 * VERIFICATION_TESTS.GS
 * ✓ testProductFixes()
 * ✓ testTableFixes()
 * ✓ testSystemFixes()
 * ✓ testOrderValidationFixes()
 * ✓ testAuthFixes()
 * ✓ runAllVerificationTests()
 */

/**
 * KNOWN MISSING REFERENCES
 *
 *
 * No missing references currently tracked.
 *
 * GAS Project Merge Order:
 * 1. Core.gs
 * 2. Setup.gs
 * 3. Sync.gs
 * 4. Account.gs
 * 5. Auth.gs
 * 6. Product.gs
 * 7. Table.gs
 * 8. Order.gs
 * 9. Payment.gs
 * 10. Store_Info.gs
 * 11. System.gs
 * 12. Validation.gs
 * 13. Backend.gs
 * 14. Api.gs
 * 15. VERIFICATION_TESTS.gs
 * 16. INDEX.gs
 * 17. FUNCTION_MAP.gs
 */
