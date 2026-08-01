import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { orderApi, paymentApi } from "../api/Api";
import { formatCurrency } from "../utils/helpers";
import { printReceipt } from "../utils/receipt";
import appStore from "../services/AppStore";
import CustomerDisplayService from "../services/CustomerDisplayService";

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

  // Update customer display to checkout state
  useEffect(() => {
    if (!orderData) return;

    const orderId = orderData.existingOrderId || `ord_${Date.now()}`;

    CustomerDisplayService.sendCheckout({
      tableName: orderData.tableName,
      items: orderData.items.map((i) => ({
        name: i.productName || i.name,
        quantity: i.quantity,
        price: i.unitPrice || i.price,
        total: i.subtotal,
      })),
      subtotal: orderData.subtotal,
      discount: orderData.discount,
      total: orderData.grandTotal,
      paymentMethod: orderData.paymentMethod,
      orderId,
      settings: storeInfo,
    });
  }, [orderData, storeInfo]);

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
          toppings: item.toppings || [],
          notes: item.notes || [],
          customNote: item.customNote || "",
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

      printReceipt(receiptData, tableData, restaurantData, ["order_slip", "payment_receipt"]);

      console.log("Phiếu đặt đồ & Hóa đơn được gửi đến máy in:", receiptId);
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
      const currentOrders = appStore.get("orders") || [];
      const existingOrderObj = currentOrders.find((o) => o.id === orderId);

      const closedOrder = {
        id: orderId,
        tableId: orderData.tableId,
        tableName: orderData.tableName || existingOrderObj?.tableName,
        customerName: orderData.customerName,
        status: "CLOSED",
        items: orderData.items || existingOrderObj?.items || [],
        subtotal: orderData.subtotal,
        discount: orderData.discount,
        grandTotal: orderData.grandTotal,
        paymentStatus: "PAID",
        paymentMethod:
          orderData.paymentMethod === "transfer" ? "transfer" : "cash",
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

      const currentTables = appStore.get("tables") || [];
      appStore.set(
        "tables",
        currentTables.map((t) =>
          String(t.id) === String(orderData.tableId)
            ? { ...t, status: "available", currentOrderId: "" }
            : t,
        ),
      );

      try {
        const receiptData = {
          id: orderId,
          items: orderData.items.map((item) => ({
            name: item.productName || item.name,
            quantity: item.quantity,
            price: item.unitPrice || item.price,
            total: item.subtotal,
            toppings: item.toppings || [],
            notes: item.notes || [],
            customNote: item.customNote || "",
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

        printReceipt(receiptData, tableData, restaurantData, ["order_slip", "payment_receipt"]);
      } catch (printErr) {
        console.error("Auto print failed:", printErr);
      }

      // Chuyển hướng & cập nhật màn hình phụ ngay lập tức
      CustomerDisplayService.sendCheckout({
        tableName: orderData.tableName,
        items: orderData.items.map((i) => ({
          name: i.productName || i.name,
          quantity: i.quantity,
          price: i.unitPrice || i.price,
          total: i.subtotal,
        })),
        subtotal: orderData.subtotal,
        discount: orderData.discount,
        total: orderData.grandTotal,
        paymentMethod:
          orderData.paymentMethod === "transfer" ? "transfer" : "cash",
        orderId: orderId,
        settings: storeInfo,
      });
      CustomerDisplayService.sendSuccess();

      navigate("/khu-vuc", { replace: true });

      // Đồng bộ ngầm lên server (Background Sync)
      (async () => {
        try {
          let finalOrderId = orderId;
          let finalAmount = amount;
          const isLocalTempId = String(orderId).startsWith("ord_local_") || String(orderId).startsWith("ord_17");

          if (!orderData.existingOrderId || isLocalTempId) {
            const serverOrder = await orderApi.createOrder({
              ...orderData,
              id: orderId,
              status: "CLOSED",
              paymentStatus: "PAID",
            });
            if (serverOrder && serverOrder.id && String(serverOrder.id) !== String(orderId)) {
              appStore.remove("orders", orderId, true);
            }
            finalOrderId = serverOrder?.id || orderId;
            finalAmount = Number(serverOrder?.grandTotal) || amount;
          } else if (orderData.newCartItems && orderData.newCartItems.length > 0) {
            const result = await orderApi.addItems(
              orderData.existingOrderId,
              orderData.newCartItems,
              orderData.discount,
            );
            orderData.newCartItems = [];
            finalAmount = Number(result?.grandTotal) || amount;
          }

          await paymentApi.processPayment({
            provider: "manual",
            orderId: finalOrderId,
            amount: finalAmount,
            transactionId: `manual_${finalOrderId}_${Date.now()}`,
          });
        } catch (syncErr) {
          console.error("Background payment sync failed:", syncErr);
          const errMsg = syncErr?.code === "REQUEST_TIMEOUT"
            ? "Mạng phản hồi chậm: Đơn hàng đã ghi nhận cục bộ và sẽ tự động đồng bộ khi kết nối ổn định"
            : "Lỗi đồng bộ thanh toán lên máy chủ";
          appStore.setError(errMsg);
        }
      })();
    } catch (err) {
      console.error("Failed to confirm payment:", err);
      setError(err.message || "Lỗi khi xác nhận thanh toán");
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
                {orderData.items.map((item, idx) => {
                  const hasToppings = Array.isArray(item.toppings) && item.toppings.length > 0;
                  const hasNotes = (Array.isArray(item.notes) && item.notes.length > 0) || Boolean(item.customNote);

                  return (
                    <div
                      key={idx}
                      className="bg-gray-50 p-3.5 rounded-2xl space-y-1.5 border border-gray-100"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800">{item.productName || item.name}</p>
                          <p className="text-sm text-gray-500">
                            {item.quantity} x {formatCurrency(item.unitPrice)}
                          </p>
                        </div>
                        <p className="font-bold text-right min-w-fit ml-4 text-blue-600">
                          {formatCurrency(item.subtotal)}
                        </p>
                      </div>

                      {hasToppings && (
                        <div className="pl-3 text-xs text-blue-700 space-y-0.5 border-l-2 border-blue-300">
                          {item.toppings.map((top, tIdx) => (
                            <div key={tIdx} className="flex justify-between">
                              <span>+ {top.name || top.productName} (x{top.quantity || 1})</span>
                              {Number(top.price || 0) > 0 && (
                                <span className="font-medium">+{formatCurrency(Number(top.price) * (top.quantity || 1))}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {hasNotes && (
                        <div className="pl-3 text-xs text-amber-700 italic border-l-2 border-amber-300">
                          📝 {item.notes?.join(", ")} {item.customNote && `("${item.customNote}")`}
                        </div>
                      )}
                    </div>
                  );
                })}
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
          <div className="bg-white rounded-3xl p-6 shadow-sm flex flex-col h-fit lg:sticky lg:top-20">
            {/* Payment Method */}
            <div className="mb-6 pb-6 border-b">
              <p className="text-sm text-gray-500 mb-2">Cách thanh toán</p>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-lg font-bold">
                  {orderData.paymentMethod === "transfer" ? "📱" : "💵"}
                </div>
                <p className="font-bold">
                  {orderData.paymentMethod === "transfer"
                    ? "Chuyển khoản qua VietQR"
                    : "Tiền mặt"}
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
                {isProcessing ? "Đang xử lý..." : "✅ Đã thanh toán"}
              </button>

              {/* Nút In tem dán ly (khi tính năng xuất mã vạch BẬT) */}
              {localStorage.getItem("barcodeEnabled") !== "false" && (
                <button
                  onClick={() => {
                    import("../utils/stickerPrint").then((m) => {
                      m.printCupStickers(
                        { id: orderData.existingOrderId || `ORD${Date.now().toString().slice(-6)}`, items: orderData.items, tableName: orderData.tableName },
                        { number: orderData.tableName },
                        storeInfo
                      );
                    });
                  }}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm bg-slate-800 text-white hover:bg-slate-900 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  🏷️ In tem dán ly
                </button>
              )}

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

            <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
              <p className="text-xs text-amber-700 font-medium">
                💼 Nhân viên xác nhận sau khi khách đã chuyển khoản thành công
              </p>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
