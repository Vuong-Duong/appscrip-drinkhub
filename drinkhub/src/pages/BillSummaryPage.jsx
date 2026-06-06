import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { orderApi, paymentApi } from "../api/Api";
import { formatCurrency } from "../utils/helpers";
import { printReceipt } from "../utils/receipt";
import appStore from "../services/AppStore";

export default function BillSummaryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const orderData = location.state?.orderData;

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [storeInfo, setStoreInfo] = useState(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);

  // Redirect if no order data
  useEffect(() => {
    if (!orderData) {
      navigate(-1);
    }
  }, [orderData, navigate]);

  // Read store info from AppStore
  useEffect(() => {
    if (!orderData) return;
    const info = appStore.get("settings") || {};
    setStoreInfo(info);
  }, [orderData]);

  const handlePrintReceipt = () => {
    const receiptId =
      createdOrder?.id || orderData?.existingOrderId || `ord_${Date.now()}`;
    setIsPrinting(true);

    try {
      const receiptData = {
        id: receiptId,
        items: orderData.items.map((item) => ({
          name: item.productName || item.name,
          quantity: item.quantity,
          price: item.unitPrice || item.price,
          total: item.subtotal,
        })),
        subtotal: orderData.subtotal,
        discount: orderData.discount,
        tax: 0,
        total: orderData.grandTotal,
      };

      const tableData = {
        number: orderData.tableName || "N/A",
        guestCount: "1",
      };

      const restaurantData = storeInfo || {
        name: "Quán Nước Quỳnh Anh",
        address: "Địa chỉ nhà hàng",
        phone: "Số điện thoại",
      };

      printReceipt(receiptData, tableData, restaurantData, "payment_receipt");

      console.log("Hóa đơn được gửi đến máy in:", receiptId);
    } catch (err) {
      setError("Lỗi khi in hóa đơn: " + (err.message || err));
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePayment = async () => {
    if (isProcessing) return;

    setIsProcessing(true);
    setError("");

    const orderId = orderData.existingOrderId || `ord_${Date.now()}`;
    const amount = orderData.grandTotal;

    try {
      // 1. Instantly update AppStore for SPA-like responsiveness
      const currentOrders = appStore.get("orders") || [];
      const existingOrderObj = currentOrders.find((o) => o.id === orderId);

      const closedOrder = {
        id: orderId,
        tableId: orderData.tableId,
        customerName: orderData.customerName,
        status: "CLOSED",
        subtotal: orderData.subtotal,
        discount: orderData.discount,
        grandTotal: orderData.grandTotal,
        paymentStatus: "PAID",
        createdBy: orderData.createdBy,
        createdAt: existingOrderObj?.createdAt || new Date().toISOString(),
      };

      if (existingOrderObj) {
        appStore.set(
          "orders",
          currentOrders.map((o) => (o.id === orderId ? closedOrder : o)),
        );
      } else {
        appStore.set("orders", [...currentOrders, closedOrder]);
      }

      // Release table in AppStore
      const currentTables = appStore.get("tables") || [];
      appStore.set(
        "tables",
        currentTables.map((t) =>
          String(t.id) === String(orderData.tableId)
            ? { ...t, status: "available", currentOrderId: "" }
            : t,
        ),
      );

      // Auto print payment receipt immediately
      try {
        const receiptData = {
          id: orderId,
          items: orderData.items.map((item) => ({
            name: item.productName || item.name,
            quantity: item.quantity,
            price: item.unitPrice || item.price,
            total: item.subtotal,
          })),
          subtotal: orderData.subtotal,
          discount: orderData.discount,
          tax: 0,
          total: orderData.grandTotal,
        };

        const tableData = {
          number: orderData.tableName || "N/A",
          guestCount: "1",
        };

        const restaurantData = storeInfo || {
          name: "Quán Nước Quỳnh Anh",
          address: "Địa chỉ nhà hàng",
          phone: "Số điện thoại",
        };

        printReceipt(receiptData, tableData, restaurantData, "payment_receipt");
      } catch (printErr) {
        console.error("Auto print failed:", printErr);
      }

      // 2. Trigger async background server requests
      const syncProcess = async () => {
        try {
          let finalOrderId = orderId;

          if (!orderData.existingOrderId) {
            // New order
            const serverOrder = await orderApi.createOrder(orderData);
            finalOrderId = serverOrder.id;
          } else if (
            orderData.newCartItems &&
            orderData.newCartItems.length > 0
          ) {
            // Existing order + new items
            await orderApi.addItems(
              orderData.existingOrderId,
              orderData.newCartItems,
              orderData.discount,
            );
          }

          // Process payment
          await paymentApi.processPayment({
            provider: orderData.paymentMethod,
            orderId: finalOrderId,
            amount: amount,
            transactionId: `${orderData.paymentMethod}_${finalOrderId}_${Date.now()}`,
          });

          console.log(
            `Background payment sync succeeded for order: ${finalOrderId}`,
          );
        } catch (err) {
          console.error("Failed to sync payment in background:", err);
          appStore.setError("Lỗi đồng bộ thanh toán lên máy chủ");
        }
      };

      // Run sync in background (fire-and-forget)
      syncProcess();

      // 3. Redirect to KhuVucPage immediately
      navigate("/khu-vuc", { replace: true });
    } catch (err) {
      setError(err.message || "Lỗi khi thanh toán");
      setIsProcessing(false);
    }
  };

  const subtotal = orderData.subtotal;
  const discount = orderData.discount;
  const total = orderData.grandTotal;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <div className="flex-1 overflow-y-auto pt-[60px] sm:pt-16 pb-20 px-3 sm:px-4 md:px-6 max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="text-3xl text-gray-600 hover:text-gray-900"
          >
            &larr;
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            Tổng kết thanh toán
          </h1>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Order Details */}
          <div className="md:col-span-2 bg-white rounded-3xl p-6 shadow-sm">
            {/* Table & Customer Info */}
            <div className="mb-6 pb-6 border-b">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Bàn</p>
                  <p className="text-lg font-bold">{orderData.tableName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Khách hàng</p>
                  <p className="text-lg font-bold">{orderData.customerName}</p>
                </div>
                {orderData.customerPhone && (
                  <div className="col-span-2">
                    <p className="text-sm text-gray-500">Số điện thoại</p>
                    <p className="text-lg font-bold">
                      {orderData.customerPhone}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Items List */}
            <div className="mb-6">
              <h3 className="text-lg font-bold mb-4">Danh sách sản phẩm</h3>
              <div className="space-y-3">
                {orderData.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-start bg-gray-50 p-3 rounded-xl"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-sm text-gray-500">
                        {item.quantity} x {formatCurrency(item.unitPrice)}
                      </p>
                    </div>
                    <p className="font-bold text-right min-w-fit ml-4">
                      {formatCurrency(item.subtotal)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between text-gray-600">
                <span>Tạm tính</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Giảm giá</span>
                  <span>-{formatCurrency(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold border-t pt-3 text-gray-900">
                <span>Tổng cộng</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          {/* Right Sidebar - Payment Methods & Actions */}
          <div className="bg-white rounded-3xl p-6 shadow-sm flex flex-col h-fit sticky top-20">
            {/* Payment Method */}
            <div className="mb-6 pb-6 border-b">
              <p className="text-sm text-gray-500 mb-2">
                Phương thức thanh toán
              </p>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-lg font-bold">
                  💳
                </div>
                <p className="font-bold">
                  {orderData.paymentMethod === "cash"
                    ? "Tiền mặt"
                    : "Chuyển khoản"}
                </p>
              </div>
            </div>

            {/* Amount */}
            <div className="mb-8 text-center">
              <p className="text-sm text-gray-500 mb-2">
                Số tiền cần thanh toán
              </p>
              <p className="text-4xl font-bold text-emerald-600">
                {formatCurrency(total)}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 flex flex-col">
              <button
                onClick={handlePayment}
                disabled={isProcessing}
                className="w-full py-4 rounded-2xl font-bold text-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-md"
              >
                {isProcessing ? "Đang xử lý..." : "💰 Thanh toán & Hoàn tất"}
              </button>

              {createdOrder && (
                <button
                  onClick={handlePrintReceipt}
                  disabled={isPrinting || isProcessing}
                  className="w-full py-4 rounded-2xl font-bold text-lg border-2 border-blue-600 text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isPrinting ? "Đang in..." : "🖨️ In Hóa Đơn"}
                </button>
              )}

              {/* Cancel Button */}
              <button
                onClick={() => navigate(-1)}
                disabled={isProcessing}
                className="w-full py-3 rounded-2xl font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                ← Quay lại
              </button>
            </div>

            {/* Order Status */}
            {createdOrder && (
              <div className="mt-6 pt-6 border-t bg-green-50 rounded-xl p-3 text-center">
                <p className="text-sm text-green-700 font-medium">
                  ✓ Đơn hàng #{createdOrder.id} đã tạo
                </p>
              </div>
            )}

            {/* Cash Register Note */}
            {orderData.paymentMethod === "cash" && (
              <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
                <p className="text-xs text-amber-700 font-medium">
                  💼 Ghi nhận tiền mặt vào két khi thanh toán
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
