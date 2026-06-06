import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import { orderApi } from "../api/Api";
import { formatCurrency, getDirectImageUrl } from "../utils/helpers";
import { getStoredAuthUser } from "../utils/auth";
import { printReceipt } from "../utils/receipt";
import appStore from "../services/AppStore";
import CrudService from "../services/CrudService";

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
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [appliedDiscountCode, setAppliedDiscountCode] = useState("");
  const [tempDiscountCode, setTempDiscountCode] = useState("");
  const [discountError, setDiscountError] = useState("");
  const [showOutOfStockModal, setShowOutOfStockModal] = useState(false);
  const [outOfStockSearch, setOutOfStockSearch] = useState("");
  const [confirmOutOfStock, setConfirmOutOfStock] = useState({ isOpen: false, product: null });
  const [toast, setToast] = useState({ isOpen: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ isOpen: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, isOpen: false }));
    }, 2500);
  };

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

  const selectedTable = tables.find(
    (table) => String(table.id) === String(decodedTableId),
  );
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
        setError(
          `Món "${product.name}" không đủ tồn kho (Tồn: ${product.stock})`,
        );
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
        setError(
          `Món "${product.name}" không đủ tồn kho (Tồn: ${product.stock})`,
        );
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

  const calculateDiscount = (code, currentSubtotal) => {
    if (!code) return 0;
    const allDiscounts = storeState.discounts || [];
    const coupon = allDiscounts.find(
      (c) => String(c.code || "").trim().toUpperCase() === String(code).trim().toUpperCase()
    );
    if (!coupon || coupon.status !== "ACTIVE") return 0;

    if (coupon.expiresAt) {
      const isExpired = new Date(coupon.expiresAt) < new Date(new Date().setHours(0,0,0,0));
      if (isExpired) return 0;
    }

    if (currentSubtotal < (Number(coupon.minOrderValue) || 0)) return 0;

    let val = 0;
    if (coupon.type === "percent") {
      val = (currentSubtotal * (Number(coupon.value) || 0)) / 100;
      const maxD = Number(coupon.maxDiscount) || 0;
      if (maxD > 0) {
        val = Math.min(val, maxD);
      }
    } else {
      val = Number(coupon.value) || 0;
    }

    return Math.min(val, currentSubtotal);
  };

  const getCodeValidationError = (code, currentSubtotal) => {
    if (!code) return "";
    const allDiscounts = storeState.discounts || [];
    const coupon = allDiscounts.find(
      (c) => String(c.code || "").trim().toUpperCase() === String(code).trim().toUpperCase()
    );
    if (!coupon) return "Mã giảm giá không tồn tại";
    if (coupon.status !== "ACTIVE") return "Mã giảm giá không còn hoạt động";

    if (coupon.expiresAt) {
      const isExpired = new Date(coupon.expiresAt) < new Date(new Date().setHours(0,0,0,0));
      if (isExpired) return "Mã giảm giá đã hết hạn sử dụng";
    }

    const minVal = Number(coupon.minOrderValue) || 0;
    if (currentSubtotal < minVal) {
      return `Đơn hàng tối thiểu chưa đạt (Yêu cầu: ${formatCurrency(minVal)})`;
    }

    return "";
  };

  const activeDiscounts = useMemo(() => {
    return (storeState.discounts || []).filter(c => c.status === "ACTIVE");
  }, [storeState.discounts]);

  useEffect(() => {
    if (existingOrder) {
      setDiscount(existingOrder.discount || 0);
    } else {
      setDiscount(0);
    }
  }, [existingOrder]);

  useEffect(() => {
    if (appliedDiscountCode) {
      const amt = calculateDiscount(appliedDiscountCode, subtotal);
      setDiscount(amt);
    } else if (!existingOrder) {
      setDiscount(0);
    }
  }, [subtotal, appliedDiscountCode, existingOrder]);

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
      appStore.set(
        "tables",
        currentTables.map((t) =>
          String(t.id) === String(decodedTableId)
            ? { ...t, status: "occupied", currentOrderId: tempOrderId }
            : t,
        ),
      );

      // Trigger local stock reduction
      const updatedProducts = products.map((p) => {
        const cartItem = cart.find((c) => c.id === p.id);
        return cartItem
          ? { ...p, stock: Math.max(0, p.stock - cartItem.quantity) }
          : p;
      });
      appStore.set("products", updatedProducts);

      // Print slip immediately
      printCurrentCartReceipt(tempOrderId, true);

      // 2. Trigger background sync to server
      orderApi
        .createOrder(orderPayload)
        .then((serverOrder) => {
          // Replace temp order and details with server order
          const latestOrders = appStore.get("orders") || [];
          const filtered = latestOrders.filter((o) => o.id !== tempOrderId);
          appStore.set("orders", [...filtered, serverOrder]);

          const latestDetails = appStore.get("orderDetails") || [];
          const detailsFiltered = latestDetails.filter(
            (d) => d.orderId !== tempOrderId,
          );
          const serverDetails = serverOrder.items || [];
          appStore.set("orderDetails", [...detailsFiltered, ...serverDetails]);

          // Update table with server order ID
          const latestTables = appStore.get("tables") || [];
          appStore.set(
            "tables",
            latestTables.map((t) =>
              String(t.id) === String(decodedTableId)
                ? { ...t, currentOrderId: serverOrder.id }
                : t,
            ),
          );
        })
        .catch((err) => {
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
      appStore.set(
        "orders",
        currentOrders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                subtotal: o.subtotal + cartSubtotal,
                discount: safeDiscount,
                grandTotal: o.subtotal + cartSubtotal - safeDiscount,
              }
            : o,
        ),
      );

      // Local stock reduction
      const updatedProducts = products.map((p) => {
        const cartItem = cart.find((c) => c.id === p.id);
        return cartItem
          ? { ...p, stock: Math.max(0, p.stock - cartItem.quantity) }
          : p;
      });
      appStore.set("products", updatedProducts);

      // Print slip immediately
      printCurrentCartReceipt(orderId, false);

      // 2. Trigger background sync
      orderApi
        .addItems(orderId, newItems, safeDiscount)
        .then((result) => {
          // result is { orderId, subtotal, discount, grandTotal, addedItems }
          const latestOrders = appStore.get("orders") || [];
          appStore.set(
            "orders",
            latestOrders.map((o) =>
              o.id === orderId
                ? {
                    ...o,
                    subtotal: result.subtotal,
                    discount: result.discount,
                    grandTotal: result.grandTotal,
                  }
                : o,
            ),
          );

          const latestDetails = appStore.get("orderDetails") || [];
          const tempDetailIds = new Set(tempDetails.map((t) => t.id));
          const detailsFiltered = latestDetails.filter(
            (d) => !tempDetailIds.has(d.id),
          );
          const serverItems = (result.addedItems || []).map((item) => ({
            ...item,
            orderId: orderId,
          }));
          appStore.set("orderDetails", [
            ...detailsFiltered,
            ...serverItems,
          ]);
        })
        .catch((err) => {
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

      <div className="flex-1 overflow-y-auto pt-[60px] sm:pt-[68px] flex flex-col">
        <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="text-2xl">
              &larr;
            </button>
            <div>
              <p className="text-sm text-gray-500">
                Trạng thái:{" "}
                {selectedTable?.status === "occupied"
                  ? "Đang phục vụ"
                  : selectedTable?.status || "không rõ"}
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

        <div className="flex flex-1 p-6 gap-6 justify-between items-start pb-32">
          <div className="w-72 bg-white rounded-3xl p-4 shrink-0 shadow-sm border border-gray-100">
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

            <button
              onClick={() => {
                setOutOfStockSearch("");
                setShowOutOfStockModal(true);
              }}
              className="w-full text-left px-5 py-4 rounded-2xl mb-2 transition bg-red-50 text-red-600 border border-red-200 font-semibold mt-4 flex items-center justify-between hover:bg-red-100"
            >
              <span>🚨 Báo hết món khẩn cấp</span>
              <span>&rarr;</span>
            </button>
          </div>

          <div className="flex-1">
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

            <div className="grid grid-cols-3 gap-5">
              {currentItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className="bg-white border border-gray-100 rounded-3xl overflow-hidden cursor-pointer active:scale-95 hover:shadow-md hover:border-blue-200 transition-all text-left flex flex-col h-full shadow-sm"
                >
                  {/* Image container */}
                  <div className="relative h-36 w-full bg-gray-50 overflow-hidden shrink-0">
                    {item.image ? (
                      <img
                        src={getDirectImageUrl(item.image)}
                        alt={item.name}
                        className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-500">
                        <span className="text-3xl font-bold uppercase">
                          {String(item.name || "").substring(0, 2)}
                        </span>
                      </div>
                    )}

                    {/* Stock badge */}
                    <div className="absolute top-2.5 right-2.5">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.stock > 5
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : item.stock > 0
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        Tồn: {item.stock}
                      </span>
                    </div>
                  </div>

                  {/* Info container */}
                  <div className="p-4 flex flex-col justify-between flex-1">
                    <p className="font-bold text-gray-800 text-base line-clamp-2 min-h-[3rem]">
                      {item.name}
                    </p>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-lg font-bold text-blue-600">
                        {formatCurrency(item.price)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="w-96 bg-white rounded-3xl flex flex-col shrink-0 shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">#</span>
                  <span className="font-semibold">
                    {hasExistingOrder ? "Đơn hiện tại" : "Giỏ hàng"} (
                    {cart.length})
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

            <div className="p-5 border-b flex gap-3">
              <button
                onClick={() => setShowCustomerModal(true)}
                className="flex-1 flex items-center gap-3 bg-blue-50 hover:bg-blue-100 p-3 rounded-2xl transition-all text-left min-w-0"
              >
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-lg text-white font-bold shrink-0">
                  KH
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-800 leading-tight truncate">
                    Khách hàng
                  </p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {customer.name || "Khách lẻ"}
                  </p>
                </div>
              </button>

              <button
                onClick={() => {
                  setTempDiscountCode(appliedDiscountCode);
                  setDiscountError("");
                  setShowDiscountModal(true);
                }}
                className="flex-1 flex items-center gap-3 bg-red-50 hover:bg-red-100 p-3 rounded-2xl transition-all text-left min-w-0"
              >
                <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center text-lg text-white font-bold shrink-0">
                  %
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-800 leading-tight truncate">
                    Giảm giá
                  </p>
                  <p className="text-xs text-red-600 font-bold truncate mt-0.5">
                    {appliedDiscountCode ? `${appliedDiscountCode} (-${formatCurrency(discount)})` : discount > 0 ? formatCurrency(discount) : "0 đ"}
                  </p>
                </div>
              </button>
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
                      <p className="text-xs text-gray-400">x{item.quantity}</p>
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
                        {formatCurrency(
                          Number(item.price || 0) * item.quantity,
                        )}
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
                disabled={
                  (cart.length === 0 && !hasExistingOrder) || isSubmitting
                }
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

      {showDiscountModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl w-full max-w-md mx-4 flex flex-col max-h-[85vh]">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-2xl font-bold">Áp dụng mã giảm giá</h3>
              <button
                onClick={() => setShowDiscountModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  Nhập mã giảm giá
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tempDiscountCode}
                    onChange={(e) => {
                      setTempDiscountCode(e.target.value);
                      setDiscountError("");
                    }}
                    className="flex-1 border rounded-2xl px-4 py-3 text-base font-bold uppercase focus:outline-none focus:border-blue-500"
                    placeholder="MÃ GIẢM GIÁ"
                  />
                  <button
                    onClick={() => {
                      const trimmedCode = tempDiscountCode.trim();
                      if (!trimmedCode) {
                        setDiscountError("Vui lòng nhập mã");
                        return;
                      }
                      const err = getCodeValidationError(trimmedCode, subtotal);
                      if (err) {
                        setDiscountError(err);
                      } else {
                        setDiscountError("");
                        const amt = calculateDiscount(trimmedCode, subtotal);
                        alert(`Áp dụng mã thành công! Giảm ${formatCurrency(amt)}`);
                      }
                    }}
                    className="px-5 py-3 bg-blue-600 text-white font-semibold rounded-2xl hover:bg-blue-700 transition"
                  >
                    Áp dụng
                  </button>
                </div>
                {discountError && (
                  <p className="text-xs text-red-500 font-semibold mt-2">{discountError}</p>
                )}
                {!discountError && tempDiscountCode && (
                  (() => {
                    const err = getCodeValidationError(tempDiscountCode.trim(), subtotal);
                    if (!err && tempDiscountCode.trim()) {
                      const amt = calculateDiscount(tempDiscountCode.trim(), subtotal);
                      return (
                        <p className="text-xs text-emerald-600 font-semibold mt-2">
                          Mã hợp lệ! Số tiền giảm: {formatCurrency(amt)}
                        </p>
                      );
                    }
                    return null;
                  })()
                )}
              </div>

              {/* List of active discounts */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-gray-500 mb-3">Mã giảm giá khả dụng</p>
                {activeDiscounts.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Không có mã giảm giá nào đang hoạt động</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {activeDiscounts.map((coupon) => {
                      const isSelectable = subtotal >= (Number(coupon.minOrderValue) || 0);
                      const isExpired = coupon.expiresAt && new Date(coupon.expiresAt) < new Date(new Date().setHours(0,0,0,0));
                      
                      return (
                        <button
                          key={coupon.id}
                          type="button"
                          onClick={() => {
                            if (isExpired) {
                              setDiscountError("Mã giảm giá đã hết hạn");
                              return;
                            }
                            setTempDiscountCode(coupon.code);
                            setDiscountError("");
                          }}
                          className={`w-full text-left p-3 rounded-2xl border transition-all flex flex-col justify-between ${
                            tempDiscountCode.trim().toUpperCase() === String(coupon.code).trim().toUpperCase()
                              ? "border-blue-600 bg-blue-50/50"
                              : "border-gray-100 hover:border-gray-300"
                          } ${(!isSelectable || isExpired) ? "opacity-60" : ""}`}
                        >
                          <div className="flex justify-between w-full items-baseline">
                            <span className="font-mono font-bold text-blue-700">{coupon.code}</span>
                            <span className="text-xs text-gray-500">
                              {coupon.type === "percent" ? `Giảm ${coupon.value}%` : `Giảm ${formatCurrency(coupon.value)}`}
                            </span>
                          </div>
                          <div className="flex justify-between w-full mt-1 items-center">
                            <span className="text-[10px] text-gray-400">
                              Đơn tối thiểu: {formatCurrency(coupon.minOrderValue)}
                            </span>
                            {coupon.expiresAt && (
                              <span className="text-[10px] text-gray-400">
                                HSD: {coupon.expiresAt}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="flex border-t">
              <button
                onClick={() => {
                  setAppliedDiscountCode("");
                  setTempDiscountCode("");
                  setDiscount(0);
                  setDiscountError("");
                  setShowDiscountModal(false);
                }}
                className="flex-1 py-5 font-semibold text-red-500 border-r hover:bg-red-50 transition rounded-bl-3xl text-center"
              >
                Hủy mã
              </button>
              <button
                onClick={() => {
                  const trimmedCode = tempDiscountCode.trim();
                  if (trimmedCode) {
                    const err = getCodeValidationError(trimmedCode, subtotal);
                    if (err) {
                      setDiscountError(err);
                      return;
                    }
                    setAppliedDiscountCode(trimmedCode.toUpperCase());
                  } else {
                    setAppliedDiscountCode("");
                    setDiscount(0);
                  }
                  setShowDiscountModal(false);
                }}
                className="flex-1 py-5 bg-blue-600 text-white font-semibold hover:bg-blue-700 transition rounded-br-3xl text-center"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}

      {showOutOfStockModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh] shadow-2xl">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-2xl font-bold text-red-600 flex items-center gap-2">
                <span>🚨</span> Báo hết món khẩn cấp
              </h3>
              <button
                onClick={() => setShowOutOfStockModal(false)}
                className="text-gray-400 hover:text-gray-600 text-3xl font-light"
              >
                &times;
              </button>
            </div>
            
            <div className="p-4 border-b">
              <input
                type="text"
                value={outOfStockSearch}
                onChange={(e) => setOutOfStockSearch(e.target.value)}
                placeholder="Tìm món cần báo hết..."
                className="w-full pl-4 pr-4 py-3 bg-gray-100 rounded-2xl border-0 focus:outline-none focus:ring-2 focus:ring-red-500 text-base"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {products
                .filter((p) => p.status !== "DELETED" && String(p.name || "").toLowerCase().includes(outOfStockSearch.toLowerCase()))
                .map((product) => (
                  <div key={product.id} className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-bold text-gray-800 truncate text-base">{product.name}</p>
                      <p className="text-xs text-gray-500">
                        {product.category} &bull; Tồn: <span className={product.stock === 0 ? "text-red-500 font-bold" : "text-gray-700 font-semibold"}>{product.stock}</span>
                      </p>
                    </div>
                    <div>
                      {product.stock > 0 ? (
                        <button
                          onClick={() => {
                            setConfirmOutOfStock({ isOpen: true, product });
                          }}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-sm active:scale-95 cursor-pointer"
                        >
                          Báo Hết
                        </button>
                      ) : (
                        <button
                          onClick={async () => {
                            const newStockStr = prompt(`Nhập số lượng tồn kho mới cho "${product.name}":`, "100");
                            if (newStockStr !== null) {
                              const qty = parseInt(newStockStr, 10);
                              if (!isNaN(qty) && qty >= 0) {
                                try {
                                  await CrudService.update("products", { ...product, stock: qty });
                                  showToast(`Đã cập nhật lại tồn kho món "${product.name}" thành ${qty}!`);
                                } catch (err) {
                                  showToast(`Lỗi: ${err.message}`, "error");
                                }
                              } else {
                                showToast("Số lượng không hợp lệ!", "error");
                              }
                            }
                          }}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm active:scale-95 cursor-pointer"
                        >
                          Mở lại món
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-end rounded-b-3xl">
              <button
                onClick={() => setShowOutOfStockModal(false)}
                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmOutOfStock.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm mx-4 p-6 shadow-2xl">
            <div className="text-center">
              <span className="text-4xl">🚨</span>
              <h3 className="text-xl font-bold text-gray-900 mt-3">Xác nhận báo hết</h3>
              <p className="text-gray-500 text-sm mt-2">
                Bạn có chắc chắn muốn báo hết món <strong className="text-gray-800 font-semibold">"{confirmOutOfStock.product?.name}"</strong> khẩn cấp không?
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setConfirmOutOfStock({ isOpen: false, product: null })}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-2xl transition-all cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={async () => {
                  const product = confirmOutOfStock.product;
                  setConfirmOutOfStock({ isOpen: false, product: null });
                  try {
                    await CrudService.update("products", { ...product, stock: 0 });
                    showToast(`Đã báo hết món "${product.name}" thành công!`);
                  } catch (err) {
                    showToast(`Lỗi: ${err.message}`, "error");
                  }
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer"
              >
                Đồng ý
              </button>
            </div>
          </div>
        </div>
      )}

      {toast.isOpen && (
        <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 z-[200]">
          <div className={`px-6 py-3.5 rounded-2xl shadow-xl flex items-center gap-2 font-semibold text-sm sm:text-base text-white ${
            toast.type === "error" ? "bg-red-600" : "bg-emerald-600"
          }`}>
            <span>{toast.type === "error" ? "❌" : "✅"}</span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
