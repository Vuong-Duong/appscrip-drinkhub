import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import { orderApi } from "../api/Api";
import { formatCurrency, getDirectImageUrl } from "../utils/helpers";
import { getStoredAuthUser } from "../utils/auth";
import { printReceipt } from "../utils/receipt";
import appStore from "../services/AppStore";

const normalizeCategoryId = (value) =>
  String(value || "khac")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

export default function OrderPage() {
  const navigate = useNavigate();
  const { tableId } = useParams();
  const decodedTableId = decodeURIComponent(tableId || "");

  const [storeState, setStoreState] = useState(appStore.getState());
  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState([]);
  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");

  const storeInfo = storeState.settings || {};

  // Subscribe to AppStore changes
  useEffect(() => {
    const unsubscribe = appStore.subscribe((state) => {
      setStoreState({ ...state });
      const nextProducts = Array.isArray(state.products) ? state.products : [];
      setProducts(nextProducts);
      setTables(Array.isArray(state.tables) ? state.tables : []);
      setIsLoading(state.loading);
    });

    // Load initial data
    const initialProducts = appStore.get("products") || [];
    const initialTables = appStore.get("tables") || [];
    setProducts(initialProducts);
    setTables(initialTables);
    setIsLoading(appStore.getState().loading);

    if (initialProducts.length > 0) {
      setActiveCategory(normalizeCategoryId(initialProducts[0]?.category));
    }

    return unsubscribe;
  }, []);

  const selectedTable = tables.find((table) => table.id === decodedTableId);
  const isOccupied = selectedTable?.status === "occupied";

  const existingOrder = useMemo(() => {
    if (!selectedTable?.currentOrderId) return null;
    const allOrders = storeState.orders || [];
    const order = allOrders.find((o) => o.id === selectedTable.currentOrderId);
    if (!order) return null;

    // Join order details
    const allDetails = storeState.orderDetails || [];
    const items = allDetails.filter((d) => d.orderId === order.id);
    return {
      ...order,
      items,
    };
  }, [selectedTable, storeState.orders, storeState.orderDetails]);

  const hasExistingOrder = Boolean(existingOrder);

  const categories = useMemo(() => {
    const categoryMap = new Map();
    products.forEach((product) => {
      const label = product.category || "Khác";
      const id = normalizeCategoryId(label);
      if (!categoryMap.has(id)) {
        categoryMap.set(id, { id, label });
      }
    });
    return Array.from(categoryMap.values());
  }, [products]);

  const currentItems = products.filter((product) => {
    const sameCategory =
      normalizeCategoryId(product.category) === activeCategory;
    const matchesSearch = String(product.name || "")
      .toLowerCase()
      .includes(search.trim().toLowerCase());
    return sameCategory && matchesSearch;
  });

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      const currentQty = existing ? existing.quantity : 0;
      if (currentQty + 1 > product.stock) {
        setError(`Món "${product.name}" không đủ tồn kho (Tồn: ${product.stock})`);
        return prev;
      }
      setError("");
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId, delta) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    setCart((prev) => {
      const existing = prev.find((item) => item.id === productId);
      if (!existing) return prev;
      const newQty = existing.quantity + delta;
      if (newQty > product.stock) {
        setError(`Món "${product.name}" không đủ tồn kho (Tồn: ${product.stock})`);
        return prev;
      }
      setError("");
      return prev
        .map((item) =>
          item.id === productId
            ? { ...item, quantity: Math.max(0, newQty) }
            : item,
        )
        .filter((item) => item.quantity > 0);
    });
  };

  // Subtotal for NEW items in cart
  const cartSubtotal = cart.reduce(
    (sum, item) => sum + Number(item.price || 0) * item.quantity,
    0,
  );

  // Subtotal for EXISTING items (if any)
  const existingSubtotal = hasExistingOrder
    ? (existingOrder.items || []).reduce(
        (sum, item) => sum + Number(item.subtotal || 0),
        0,
      )
    : 0;

  // Combined subtotal
  const subtotal = existingSubtotal + cartSubtotal;
  const safeDiscount = Math.max(0, Math.min(Number(discount) || 0, subtotal));
  const total = subtotal - safeDiscount;

  // === CHECKOUT: navigate to BillSummary (PAY_NOW flow) ===
  const handleCheckout = () => {
    if (!hasExistingOrder && cart.length === 0) return;

    const authUser = getStoredAuthUser();

    // Build combined items list for BillSummary
    const existingItems = hasExistingOrder
      ? (existingOrder.items || []).map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice || 0),
          subtotal: Number(item.subtotal || 0),
        }))
      : [];

    const newItems = cart.map((item) => ({
      productId: item.id,
      productName: item.name,
      quantity: item.quantity,
      unitPrice: Number(item.price || 0),
      subtotal: Number(item.price || 0) * item.quantity,
    }));

    const allItems = [...existingItems, ...newItems];

    const orderData = {
      tableId: decodedTableId,
      tableName: selectedTable?.name || `Bàn ${decodedTableId}`,
      customerName: customer.name || "Khách lẻ",
      customerPhone: customer.phone || "",
      items: allItems,
      subtotal,
      discount: safeDiscount,
      grandTotal: total,
      createdBy: authUser?.username || "staff",
      paymentMethod: paymentMethod,
      existingOrderId: hasExistingOrder ? existingOrder.id : null,
      newCartItems: newItems,
    };

    navigate("/bill-summary", { state: { orderData } });
  };

  // === Print receipt for the current items in the cart ===
  const printCurrentCartReceipt = (orderId, isNewOrder = false) => {
    try {
      const receiptData = {
        id: isNewOrder ? orderId : `${orderId} (Gọi thêm)`,
        items: cart.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: Number(item.price || 0),
          total: Number(item.price || 0) * item.quantity,
        })),
        subtotal: cartSubtotal,
        discount: isNewOrder ? safeDiscount : 0,
        tax: 0,
        total: isNewOrder ? cartSubtotal - safeDiscount : cartSubtotal,
      };

      const tableData = {
        number: selectedTable?.name || `Bàn ${decodedTableId}`,
        guestCount: "1",
      };

      const restaurantData = storeInfo || {
        name: "Quán Nước Quỳnh Anh",
        address: "Địa chỉ nhà hàng",
        phone: "Số điện thoại",
      };

      printReceipt(receiptData, tableData, restaurantData, "order_slip");
    } catch (printErr) {
      console.error("Failed to print receipt:", printErr);
    }
  };

  // === PAY_LATER: create order + keep table occupied ===
  const handlePayLater = async () => {
    if (cart.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setError("");

    try {
      const authUser = getStoredAuthUser();
      const tempOrderId = `ord_local_${Date.now()}`;

      // Create new order payload
      const orderPayload = {
        tableId: decodedTableId,
        customerName: customer.name || "Khách lẻ",
        items: cart.map((item) => ({
          productId: item.id,
          productName: item.name,
          quantity: item.quantity,
          unitPrice: Number(item.price || 0),
          subtotal: Number(item.price || 0) * item.quantity,
        })),
        subtotal: cartSubtotal,
        discount: safeDiscount,
        grandTotal: cartSubtotal - safeDiscount,
        createdBy: authUser?.username || "staff",
        paymentMethod: paymentMethod,
      };

      // 1. Instantly update AppStore for SPA-like responsiveness
      const tempOrder = {
        id: tempOrderId,
        tableId: decodedTableId,
        customerName: orderPayload.customerName,
        status: "OPEN",
        subtotal: orderPayload.subtotal,
        discount: orderPayload.discount,
        grandTotal: orderPayload.grandTotal,
        paymentStatus: "PENDING",
        createdBy: orderPayload.createdBy,
        createdAt: new Date().toISOString(),
      };
      
      const tempDetails = orderPayload.items.map((item) => ({
        id: `detail_local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        orderId: tempOrderId,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      }));

      // Update orders, details, and mark table occupied
      const currentOrders = appStore.get("orders") || [];
      appStore.set("orders", [...currentOrders, tempOrder]);

      const currentDetails = appStore.get("orderDetails") || [];
      appStore.set("orderDetails", [...currentDetails, ...tempDetails]);

      const currentTables = appStore.get("tables") || [];
      appStore.set("tables", currentTables.map(t => 
        t.id === decodedTableId ? { ...t, status: "occupied", currentOrderId: tempOrderId } : t
      ));

      // Trigger local stock reduction
      const updatedProducts = products.map(p => {
        const cartItem = cart.find(c => c.id === p.id);
        return cartItem ? { ...p, stock: Math.max(0, p.stock - cartItem.quantity) } : p;
      });
      appStore.set("products", updatedProducts);

      // Print slip immediately
      printCurrentCartReceipt(tempOrderId, true);

      // 2. Trigger background sync to server
      orderApi.createOrder(orderPayload)
        .then((serverOrder) => {
          // Replace temp order and details with server order
          const latestOrders = appStore.get("orders") || [];
          const filtered = latestOrders.filter(o => o.id !== tempOrderId);
          appStore.set("orders", [...filtered, serverOrder]);

          const latestDetails = appStore.get("orderDetails") || [];
          const detailsFiltered = latestDetails.filter(d => d.orderId !== tempOrderId);
          const serverDetails = serverOrder.items || [];
          appStore.set("orderDetails", [...detailsFiltered, ...serverDetails]);

          // Update table with server order ID
          const latestTables = appStore.get("tables") || [];
          appStore.set("tables", latestTables.map(t => 
            t.id === decodedTableId ? { ...t, currentOrderId: serverOrder.id } : t
          ));
        })
        .catch(err => {
          console.error("Failed to sync pay later order:", err);
          appStore.setError("Lỗi đồng bộ đơn hàng lên máy chủ");
        });

      // Navigate back to KhuVucPage immediately
      navigate("/khu-vuc", { replace: true });
    } catch (err) {
      setError(err.message || "Tạo đơn hàng thất bại");
    } finally {
      setIsSubmitting(false);
    }
  };

  // === ADD ITEMS (for occupied table, without navigating away) ===
  const handleAddItems = async () => {
    if (cart.length === 0 || isSubmitting || !hasExistingOrder) return;

    setIsSubmitting(true);
    setError("");

    try {
      const orderId = existingOrder.id;
      const newItems = cart.map((item) => ({
        productId: item.id,
        productName: item.name,
        quantity: item.quantity,
        unitPrice: Number(item.price || 0),
        subtotal: Number(item.price || 0) * item.quantity,
      }));

      // 1. Instantly update AppStore
      const tempDetails = newItems.map((item) => ({
        id: `detail_local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        orderId: orderId,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      }));

      const currentDetails = appStore.get("orderDetails") || [];
      appStore.set("orderDetails", [...currentDetails, ...tempDetails]);

      const currentOrders = appStore.get("orders") || [];
      appStore.set("orders", currentOrders.map(o => 
        o.id === orderId ? {
          ...o,
          subtotal: o.subtotal + cartSubtotal,
          discount: safeDiscount,
          grandTotal: (o.subtotal + cartSubtotal) - safeDiscount
        } : o
      ));

      // Local stock reduction
      const updatedProducts = products.map(p => {
        const cartItem = cart.find(c => c.id === p.id);
        return cartItem ? { ...p, stock: Math.max(0, p.stock - cartItem.quantity) } : p;
      });
      appStore.set("products", updatedProducts);

      // Print slip immediately
      printCurrentCartReceipt(orderId, false);

      // 2. Trigger background sync
      orderApi.addItems(orderId, newItems, safeDiscount)
        .then((result) => {
          // result is { orderId, subtotal, discount, grandTotal, addedItems }
          const latestOrders = appStore.get("orders") || [];
          appStore.set("orders", latestOrders.map(o => 
            o.id === orderId ? { ...o, subtotal: result.subtotal, discount: result.discount, grandTotal: result.grandTotal } : o
          ));

          const latestDetails = appStore.get("orderDetails") || [];
          const detailsFiltered = latestDetails.filter(d => !tempDetails.some(t => t.productId === d.productId && t.orderId === d.orderId));
          appStore.set("orderDetails", [...detailsFiltered, ...result.addedItems]);
        })
        .catch(err => {
          console.error("Failed to sync added items:", err);
          appStore.setError("Lỗi đồng bộ gọi thêm món lên máy chủ");
        });

      setCart([]);
      setError("");
    } catch (err) {
      setError(err.message || "Gọi thêm món thất bại");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <div className="flex-1 pt-16 flex flex-col overflow-hidden">
        <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="text-2xl">
              &larr;
            </button>
            <div>
              <p className="text-sm text-gray-500">
                Trạng thái: {selectedTable?.status === "occupied" ? "Đang phục vụ" : (selectedTable?.status || "không rõ")}
              </p>
              <p className="font-semibold">
                {selectedTable?.name || `Bàn ${decodedTableId}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasExistingOrder && (
              <span className="bg-emerald-100 text-emerald-700 text-xs font-medium px-3 py-1 rounded-full">
                Đơn #{existingOrder.id}
              </span>
            )}
            <button className="bg-gray-100 px-5 py-2 rounded-xl text-sm">
              {decodedTableId}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-b border-red-200 px-6 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading && (
          <div className="bg-blue-50 border-b border-blue-200 px-6 py-3 text-sm text-blue-700">
            Đang tải đơn hàng hiện tại...
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          <div className="w-72 bg-white border-r p-4 overflow-auto">
            <div className="relative mb-6">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm kiếm..."
                className="w-full pl-11 py-3 bg-gray-100 rounded-2xl"
              />
              <span className="absolute left-4 top-4 text-gray-400">?</span>
            </div>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full text-left px-5 py-4 rounded-2xl mb-2 transition ${
                  activeCategory === cat.id
                    ? "bg-blue-600 text-white"
                    : "hover:bg-gray-100"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex-1 p-6 overflow-auto">
            <h2 className="text-2xl font-bold mb-6">
              {categories.find((c) => c.id === activeCategory)?.label ||
                "Thực đơn"}
            </h2>

            {isLoading && (
              <div className="text-center py-20 text-gray-500">
                Đang tải thực đơn...
              </div>
            )}

            {!isLoading && currentItems.length === 0 && (
              <div className="text-center py-20 text-gray-500">
                Chưa có món trong danh mục này
              </div>
            )}

            <div className="grid grid-cols-4 gap-5">
              {currentItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className="bg-gradient-to-br from-gray-900 to-black text-white rounded-3xl overflow-hidden cursor-pointer active:scale-95 hover:shadow-xl transition-all text-left"
                >
                  {item.image && (
                    <img
                      src={getDirectImageUrl(item.image)}
                      alt={item.name}
                      className="h-28 w-full object-cover"
                    />
                  )}
                  <div className="h-32 flex items-end p-5">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xl font-bold mt-2">
                        {formatCurrency(item.price)}
                      </p>
                      <p className="text-xs text-gray-300 mt-1">
                        Tồn: {item.stock}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="w-96 bg-white border-l flex flex-col">
            <div className="p-5 border-b">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">#</span>
                  <span className="font-semibold">
                    {hasExistingOrder ? "Đơn hiện tại" : "Giỏ hàng"} ({cart.length})
                  </span>
                </div>
                <button
                  onClick={() => setCart([])}
                  className="text-red-500 text-sm font-medium"
                >
                  Xóa
                </button>
              </div>
            </div>

            <div className="p-5 border-b">
              <button
                onClick={() => setShowCustomerModal(true)}
                className="w-full flex items-center gap-4 bg-blue-50 hover:bg-blue-100 p-4 rounded-2xl transition-all"
              >
                <div className="w-11 h-11 bg-blue-600 rounded-2xl flex items-center justify-center text-xl text-white">
                  KH
                </div>
                <div className="text-left">
                  <p className="font-medium text-lg">Khách hàng</p>
                  <p className="text-sm text-gray-500">
                    {customer.name || "Khách lẻ"}{" "}
                    {customer.phone ? `- ${customer.phone}` : ""}
                  </p>
                </div>
              </button>
            </div>

            <div className="p-5 border-b">
              <p className="text-sm text-gray-600 mb-2">Giảm giá</p>
              <input
                type="number"
                min="0"
                max={subtotal}
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                placeholder="Nhập số tiền giảm"
                className="w-full border rounded-2xl px-4 py-3 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Existing order items (read-only) */}
            {hasExistingOrder && existingOrder.items?.length > 0 && (
              <div className="p-5 border-b bg-gray-50">
                <p className="text-sm font-semibold text-gray-600 mb-3">
                  📋 Đã order trước đó
                </p>
                {existingOrder.items.map((item, idx) => (
                  <div
                    key={`existing-${idx}`}
                    className="flex justify-between py-2 text-sm text-gray-600"
                  >
                    <div>
                      <p>{item.productName}</p>
                      <p className="text-xs text-gray-400">
                        x{item.quantity}
                      </p>
                    </div>
                    <p>{formatCurrency(Number(item.subtotal || 0))}</p>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t mt-2 text-sm font-medium">
                  <span>Tạm tính (cũ)</span>
                  <span>{formatCurrency(existingSubtotal)}</span>
                </div>
              </div>
            )}

            {/* New cart items */}
            <div className="flex-1 p-5 overflow-auto">
              {cart.length === 0 ? (
                <p className="text-center text-gray-400 mt-10">
                  {hasExistingOrder
                    ? "Chọn thêm món từ menu bên trái"
                    : "Chưa có món nào trong giỏ hàng"}
                </p>
              ) : (
                <>
                  {hasExistingOrder && (
                    <p className="text-sm font-semibold text-blue-600 mb-3">
                      ➕ Món mới thêm
                    </p>
                  )}
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between py-4 border-b gap-4"
                    >
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => updateQuantity(item.id, -1)}
                            className="w-8 h-8 rounded-full bg-gray-100"
                          >
                            -
                          </button>
                          <span className="font-medium">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, 1)}
                            className="w-8 h-8 rounded-full bg-gray-100"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <p className="font-medium">
                        {formatCurrency(Number(item.price || 0) * item.quantity)}
                      </p>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="p-5 border-t bg-gray-50">
              {hasExistingOrder && cartSubtotal > 0 && (
                <div className="flex justify-between mb-1 text-sm">
                  <span className="text-gray-500">Món mới thêm</span>
                  <span>{formatCurrency(cartSubtotal)}</span>
                </div>
              )}
              <div className="flex justify-between mb-1">
                <span className="text-gray-600">Tạm tính</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {safeDiscount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Giảm giá</span>
                  <span>-{formatCurrency(safeDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold border-t pt-4 mt-3 mb-4">
                <span>Tổng cộng</span>
                <span>{formatCurrency(total)}</span>
              </div>

              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setPaymentMethod("cash")}
                  className={`flex-1 py-3 rounded-2xl font-medium border-2 transition ${
                    paymentMethod === "cash"
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  Tiền mặt
                </button>
                <button
                  onClick={() => setPaymentMethod("transfer")}
                  className={`flex-1 py-3 rounded-2xl font-medium border-2 transition ${
                    paymentMethod === "transfer"
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  Chuyển khoản
                </button>
              </div>

              {/* Nút Thanh toán */}
              <button
                onClick={handleCheckout}
                disabled={(cart.length === 0 && !hasExistingOrder) || isSubmitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white py-4 rounded-2xl font-bold text-lg transition mb-3"
              >
                {isSubmitting
                  ? "Đang xử lý..."
                  : `Thanh toán ${paymentMethod === "cash" ? "tiền mặt" : "chuyển khoản"}`}
              </button>

              {/* Nút Thanh toán sau (chỉ khi có món trong cart) */}
              {cart.length > 0 && (
                <button
                  onClick={hasExistingOrder ? handleAddItems : handlePayLater}
                  disabled={isSubmitting}
                  className="w-full border-2 border-blue-600 text-blue-600 hover:bg-blue-50 disabled:opacity-50 py-4 rounded-2xl font-bold text-lg transition"
                >
                  {isSubmitting
                    ? "Đang xử lý..."
                    : hasExistingOrder
                      ? "➕ Gọi thêm món"
                      : "⏳ Thanh toán sau"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showCustomerModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl w-full max-w-md mx-4">
            <div className="p-6 border-b">
              <h3 className="text-2xl font-bold">Thông tin khách hàng</h3>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Tên khách hàng
                </label>
                <input
                  type="text"
                  value={customer.name}
                  onChange={(e) =>
                    setCustomer({ ...customer, name: e.target.value })
                  }
                  className="w-full border rounded-2xl px-4 py-4"
                  placeholder="Nhập tên khách hàng"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Số điện thoại
                </label>
                <input
                  type="tel"
                  value={customer.phone}
                  onChange={(e) =>
                    setCustomer({ ...customer, phone: e.target.value })
                  }
                  className="w-full border rounded-2xl px-4 py-4"
                  placeholder="Nhập số điện thoại"
                />
              </div>
            </div>
            <div className="flex border-t">
              <button
                onClick={() => setShowCustomerModal(false)}
                className="flex-1 py-5 font-medium text-gray-600 border-r hover:bg-gray-50 rounded-bl-3xl"
              >
                Đóng
              </button>
              <button
                onClick={() => setShowCustomerModal(false)}
                className="flex-1 py-5 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-br-3xl"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
