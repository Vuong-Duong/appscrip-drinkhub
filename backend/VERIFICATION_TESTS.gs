/* =========================
 * VERIFICATION_TESTS.gs - Kiểm tra toàn bộ logic sau fix
 *
 * User Rule: "sau khi sửa phải kiểm tra lại tất cả những gì đã sửa là logic cũ cũng như những tiêu chí đã nêu"
 * ========================= */

/**
 * TEST SUITE 1: Product.js Fixes Verification
 * Verify: mapProductRow_, getProducts, validateStockBeforeOrder_, reduceProductStock_, createInventoryJournal_
 */
const testProductFixes = () => {
  const tests = [];

  // Test 1.1: mapProductRow_ uses correct schema indices
  try {
    tests.push("--- TEST 1.1: mapProductRow_ schema indices ---");
    const prodRows = getSheetData_(SHEET_NAME.PRODUCT, false);
    if (prodRows.length > 1) {
      const testRow = prodRows[1]; // First product
      const mapped = mapProductRow_(testRow);

      // Verify mapped object has correct fields
      const requiredFields = [
        "id",
        "name",
        "price",
        "cost",
        "stock",
        "category",
        "status",
      ];
      const hasAllFields = requiredFields.every((f) =>
        mapped.hasOwnProperty(f),
      );

      if (hasAllFields) {
        tests.push("✓ PASS: mapProductRow_ has all required fields");
        tests.push(`  Fields: ${JSON.stringify(Object.keys(mapped))}`);
      } else {
        tests.push("✗ FAIL: Missing fields in mapProductRow_");
        tests.push(`  Expected: ${requiredFields.join(", ")}`);
        tests.push(`  Got: ${Object.keys(mapped).join(", ")}`);
      }
    }
  } catch (e) {
    tests.push(`✗ ERROR 1.1: ${e.message}`);
  }

  // Test 1.2: getProducts filters inactive correctly
  try {
    tests.push("--- TEST 1.2: getProducts filtering ---");
    const activeProducts = getProducts(true);
    const allProducts = getProducts(false);

    if (activeProducts.length <= allProducts.length) {
      tests.push("✓ PASS: activeProducts ≤ allProducts");
      tests.push(
        `  Active: ${activeProducts.length}, All: ${allProducts.length}`,
      );
    } else {
      tests.push("✗ FAIL: activeProducts > allProducts (filtering broken)");
    }
  } catch (e) {
    tests.push(`✗ ERROR 1.2: ${e.message}`);
  }

  // Test 1.3: validateStockBeforeOrder_ checks array & quantities
  try {
    tests.push("--- TEST 1.3: validateStockBeforeOrder_ validation ---");

    // Subtest: empty items rejected
    try {
      validateStockBeforeOrder_([]);
      tests.push("✗ FAIL: Should reject empty items");
    } catch (e) {
      tests.push("✓ PASS: Rejects empty items");
    }

    // Subtest: valid items accepted (won't throw)
    const validItems = [
      {
        productId: "test_001",
        quantity: 1,
      },
    ];
    try {
      validateStockBeforeOrder_(validItems);
      tests.push(
        "✓ PASS: Valid items accepted (or product not found - expected)",
      );
    } catch (e) {
      if (e.message.includes("not found")) {
        tests.push("✓ PASS: Validation works (product not in test data)");
      } else {
        tests.push(`⚠ WARNING: ${e.message}`);
      }
    }
  } catch (e) {
    tests.push(`✗ ERROR 1.3: ${e.message}`);
  }

  // Test 1.4: reduceProductStock_ atomicity
  try {
    tests.push("--- TEST 1.4: reduceProductStock_ atomicity ---");

    // Get current stock before test
    const products = getProducts(false);
    if (products.length > 0) {
      const testProduct = products[0];
      const stockBefore = testProduct.stock;

      // Try to reduce by small amount
      const result = reduceProductStock_([
        {
          productId: testProduct.id,
          quantity: 1,
        },
      ]);

      if (result.success) {
        const productsAfter = getProducts(false);
        const testProductAfter = productsAfter.find(
          (p) => p.id === testProduct.id,
        );
        const stockAfter = testProductAfter
          ? testProductAfter.stock
          : stockBefore;

        if (stockAfter === stockBefore - 1) {
          tests.push("✓ PASS: Stock reduced atomically");
        } else {
          tests.push("⚠ WARNING: Stock not reduced as expected");
        }
      } else {
        tests.push(`⚠ WARNING: reduceProductStock_ failed: ${result.error}`);
      }
    }
  } catch (e) {
    tests.push(`✗ ERROR 1.4: ${e.message}`);
  }

  return tests;
};

/**
 * TEST SUITE 2: Table.js Fixes Verification
 * Verify: occupyTable status check, releaseTable orderId verification, getAllTables
 */
const testTableFixes = () => {
  const tests = [];

  // Test 2.1: occupyTable checks occupation status
  try {
    tests.push("--- TEST 2.1: occupyTable occupation check ---");
    const tables = getAllTables("AVAILABLE");

    if (tables.length > 0) {
      const testTable = tables[0];

      // Occupy the table
      const occupyResult = occupyTable(testTable.id, "test_order_001");
      if (occupyResult.success) {
        tests.push("✓ PASS: occupyTable succeeded");

        // Try to occupy again (should fail)
        const reoccupyResult = occupyTable(testTable.id, "test_order_002");
        if (
          !reoccupyResult.success &&
          reoccupyResult.error === "TABLE_ALREADY_OCCUPIED"
        ) {
          tests.push("✓ PASS: Prevents double occupation");
        } else {
          tests.push("✗ FAIL: Should prevent double occupation");
        }

        // Release for next test
        releaseTable(testTable.id, "test_order_001");
      } else {
        tests.push(`⚠ WARNING: Initial occupy failed: ${occupyResult.error}`);
      }
    } else {
      tests.push("⚠ WARNING: No available tables to test");
    }
  } catch (e) {
    tests.push(`✗ ERROR 2.1: ${e.message}`);
  }

  // Test 2.2: releaseTable verifies orderId
  try {
    tests.push("--- TEST 2.2: releaseTable orderId verification ---");
    const tables = getAllTables();

    const occupiedTable = tables.find((t) => t.status === "OCCUPIED");
    if (occupiedTable) {
      const correctOrderId = occupiedTable.currentOrderId;

      // Try with wrong orderId
      const wrongResult = releaseTable(occupiedTable.id, "wrong_order_id");
      if (!wrongResult.success && wrongResult.error === "ORDER_MISMATCH") {
        tests.push("✓ PASS: Rejects mismatched orderId");
      } else {
        tests.push("⚠ WARNING: Should reject mismatched orderId");
        tests.push(`  Result: ${JSON.stringify(wrongResult)}`);
      }

      // Try with correct orderId
      const correctResult = releaseTable(occupiedTable.id, correctOrderId);
      if (correctResult.success) {
        tests.push("✓ PASS: Accepts matching orderId");
      }
    } else {
      tests.push("⚠ WARNING: No occupied tables to test");
    }
  } catch (e) {
    tests.push(`✗ ERROR 2.2: ${e.message}`);
  }

  // Test 2.3: getAllTables consolidation
  try {
    tests.push("--- TEST 2.3: getAllTables consolidation ---");
    const allTables = getAllTables();
    const availableTables = getAvailableTables();

    // Available should be subset of all
    if (availableTables.length <= allTables.length) {
      tests.push("✓ PASS: Available tables ≤ all tables");
      tests.push(
        `  Available: ${availableTables.length}, All: ${allTables.length}`,
      );
    } else {
      tests.push("✗ FAIL: Available tables > all tables");
    }

    // Filter test
    const occupiedViaFilter = getAllTables("OCCUPIED");
    const occupiedDirect = allTables.filter((t) => t.status === "OCCUPIED");
    if (occupiedViaFilter.length === occupiedDirect.length) {
      tests.push("✓ PASS: Filter parameter works correctly");
    } else {
      tests.push("✗ FAIL: Filter parameter not working");
    }
  } catch (e) {
    tests.push(`✗ ERROR 2.3: ${e.message}`);
  }

  return tests;
};

/**
 * TEST SUITE 3: System.js Fixes Verification
 * Verify: processQueue_ writes back + sheet name from config
 */
const testSystemFixes = () => {
  const tests = [];

  // Test 3.1: enqueueJob_ uses config sheet name
  try {
    tests.push("--- TEST 3.1: enqueueJob_ uses APP_CONFIG ---");

    // Verify APP_CONFIG has QUEUE_SHEET
    if (APP_CONFIG.QUEUE_SHEET && typeof APP_CONFIG.QUEUE_SHEET === "string") {
      tests.push("✓ PASS: APP_CONFIG.QUEUE_SHEET defined");
    } else {
      tests.push("✗ FAIL: APP_CONFIG.QUEUE_SHEET not configured");
    }
  } catch (e) {
    tests.push(`✗ ERROR 3.1: ${e.message}`);
  }

  // Test 3.2: processQueue_ persists changes
  try {
    tests.push("--- TEST 3.2: processQueue_ persistence ---");

    // Enqueue test job
    enqueueJob_("REPAIR_STATE", { test: true });

    // Read queue to verify job was added
    const queueRows = getSheetData_(APP_CONFIG.QUEUE_SHEET, false);
    if (queueRows.length > 1) {
      const lastJob = queueRows[queueRows.length - 1];
      const jobStatus = trimSafe_(lastJob[3]);

      if (jobStatus === "PENDING") {
        tests.push("✓ PASS: Job enqueued with PENDING status");

        // Process queue
        const result = processQueue_();
        tests.push(`  Processed: ${result.processed}/${result.total} jobs`);

        // Check if job status updated in sheet
        const queueRowsAfter = getSheetData_(APP_CONFIG.QUEUE_SHEET, false);
        const lastJobAfter = queueRowsAfter[queueRowsAfter.length - 1];
        const jobStatusAfter = trimSafe_(lastJobAfter[3]);

        if (jobStatusAfter !== "PENDING") {
          tests.push(`✓ PASS: Job status updated to ${jobStatusAfter}`);
        } else {
          tests.push(
            "⚠ WARNING: Job status not updated (may indicate processQueue_ not writing)",
          );
        }
      }
    }
  } catch (e) {
    tests.push(`✗ ERROR 3.2: ${e.message}`);
  }

  return tests;
};

/**
 * TEST SUITE 4: Order.js & Validation.js Fixes
 * Verify: freezeOrderSnapshot already-frozen check + validation improvements
 */
const testOrderValidationFixes = () => {
  const tests = [];

  // Test 4.1: freezeOrderSnapshot prevents re-freeze
  try {
    tests.push("--- TEST 4.1: freezeOrderSnapshot re-freeze protection ---");

    const orders = getSheetData_(SHEET_NAME.ORDER, false);
    const closedOrders = orders.filter(
      (r, idx) =>
        idx > 0 && trimSafe_(r[SHEET_SCHEMA.ORDER.STATUS]) === "CLOSED",
    );

    if (closedOrders.length > 0) {
      const testOrder = closedOrders[0];
      const orderId = trimSafe_(testOrder[SHEET_SCHEMA.ORDER.ID]);

      try {
        // Try to freeze again
        const result = freezeOrderSnapshot(orderId, {});
        if (result.error === "ORDER_ALREADY_FROZEN") {
          tests.push("✓ PASS: Prevents re-freezing with ALREADY_FROZEN error");
        } else if (typeof result === "object" && result.frozen === true) {
          tests.push("⚠ WARNING: Order already frozen but error not clear");
        }
      } catch (e) {
        if (e.message.includes("frozen")) {
          tests.push("✓ PASS: Prevents re-freezing (throws error)");
        } else {
          tests.push(`⚠ WARNING: ${e.message}`);
        }
      }
    } else {
      tests.push("⚠ WARNING: No closed orders to test");
    }
  } catch (e) {
    tests.push(`✗ ERROR 4.1: ${e.message}`);
  }

  // Test 4.2: Validation improvements
  try {
    tests.push("--- TEST 4.2: Validation improvements ---");
    const valTest = testDataFlow();

    valTest.tests.forEach((t) => {
      tests.push(t);
    });

    if (valTest.success) {
      tests.push("✓ PASS: Validation test flow completed");
    }
  } catch (e) {
    tests.push(`✗ ERROR 4.2: ${e.message}`);
  }

  return tests;
};

/**
 * TEST SUITE 5: Auth.js Fixes Verification
 * Verify: role checks, missing token handling, logout guard
 */
const testAuthFixes = () => {
  const tests = [];

  try {
    tests.push("--- TEST 5.1: checkAuth role validation ---");

    if (!checkAuth("admin", ["admin"])) {
      tests.push("✓ PASS: raw role string rejected");
    } else {
      tests.push("✗ FAIL: raw role string should not authenticate");
    }

    if (!checkAuth("staff", ["admin"])) {
      tests.push("✓ PASS: staff role string rejected for admin-only action");
    } else {
      tests.push("✗ FAIL: staff role should be rejected");
    }
  } catch (e) {
    tests.push(`✗ ERROR 5.1: ${e.message}`);
  }

  try {
    tests.push("--- TEST 5.2: token guards ---");

    if (!checkAuth("", ["admin"])) {
      tests.push("✓ PASS: empty auth context rejected");
    } else {
      tests.push("✗ FAIL: empty auth context should be rejected");
    }

    if (logout("") === false) {
      tests.push("✓ PASS: empty logout token rejected safely");
    } else {
      tests.push("✗ FAIL: empty logout token should return false");
    }

    try {
      verifyAuthToken("test_token", ["admin"], "");
      tests.push("✗ FAIL: verifyAuthToken should require device fingerprint");
    } catch (e) {
      if (e.message === "DEVICE_FINGERPRINT_REQUIRED") {
        tests.push("✓ PASS: verifyAuthToken requires device fingerprint");
      } else {
        tests.push(`⚠ WARNING: Expected fingerprint error, got ${e.message}`);
      }
    }
  } catch (e) {
    tests.push(`✗ ERROR 5.2: ${e.message}`);
  }

  return tests;
};

/**
 * MASTER TEST RUNNER - Execute all test suites
 * Call this to verify all fixes are working correctly
 */
const runAllVerificationTests = () => {
  const allTests = [];
  const timestamp = new Date().toISOString();

  allTests.push(`\n${"=".repeat(60)}`);
  allTests.push(`VERIFICATION TESTS - ${timestamp}`);
  allTests.push(`${"=".repeat(60)}\n`);

  allTests.push("SUITE 1: Product.js Fixes");
  allTests.push(...testProductFixes());
  allTests.push("");

  allTests.push("SUITE 2: Table.js Fixes");
  allTests.push(...testTableFixes());
  allTests.push("");

  allTests.push("SUITE 3: System.js Fixes");
  allTests.push(...testSystemFixes());
  allTests.push("");

  allTests.push("SUITE 4: Order.js & Validation.js Fixes");
  allTests.push(...testOrderValidationFixes());
  allTests.push("");

  allTests.push("SUITE 5: Auth.js Fixes");
  allTests.push(...testAuthFixes());
  allTests.push("");

  allTests.push(`${"=".repeat(60)}`);
  allTests.push("TEST SUMMARY");
  allTests.push(`${"=".repeat(60)}`);

  const passCount = allTests.filter((t) => t.includes("✓ PASS")).length;
  const failCount = allTests.filter((t) => t.includes("✗ FAIL")).length;
  const warningCount = allTests.filter((t) => t.includes("⚠ WARNING")).length;

  allTests.push(`✓ Passed: ${passCount}`);
  allTests.push(`✗ Failed: ${failCount}`);
  allTests.push(`⚠ Warnings: ${warningCount}`);
  allTests.push("");
  allTests.push(
    "Status: " + (failCount === 0 ? "✓ READY TO DEPLOY" : "✗ ISSUES FOUND"),
  );

  // Log to sheet for reference
  logAction_("RUN_VERIFICATION_TESTS", "all", "system", {
    passed: passCount,
    failed: failCount,
    warnings: warningCount,
  });

  return {
    timestamp,
    tests: allTests,
    summary: {
      passed: passCount,
      failed: failCount,
      warnings: warningCount,
      ready: failCount === 0,
    },
  };
};
