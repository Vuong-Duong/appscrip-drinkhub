import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import { orderApi } from "../api/Api";
import { formatCurrency, getDirectImageUrl } from "../utils/helpers";
import { getStoredAuthUser } from "../utils/auth";
import { printReceipt } from "../utils/receipt";
import appStore from "../services/AppStore";
import CrudService from "../services/CrudService";
import CustomerDisplayService from "../services/CustomerDisplayService";
import {
  calculateItemUnitPrice,
  calculateItemSubtotal,
  areItemsEqual,
} from "../utils/orderHelpers";

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
  const [appliedDiscountCode, setAppliedDiscountCode] = useState("");
  const [tempDiscountCode, setTempDiscountCode] = useState("");
  const [discountError, setDiscountError] = useState("");
  const [showOutOfStockModal, setShowOutOfStockModal] = useState(false);
  const [outOfStockSearch, setOutOfStockSearch] = useState("");
  const [confirmOutOfStock, setConfirmOutOfStock] = useState({
    isOpen: false,
    product: null,
  });
  const [confirmDeleteItem, setConfirmDeleteItem] = useState({
    isOpen: false,
    item: null,
  });
  const [toast, setToast] = useState({
    isOpen: false,
    message: "",
    type: "success",
  });
  const [isConfirmedForDisplay, setIsConfirmedForDisplay] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");

  const [toppingModal, setToppingModal] = useState({ isOpen: false, itemIndex: -1 });
  const [noteModal, setNoteModal] = useState({ isOpen: false, itemIndex: -1, customText: "" });

  const PRESET_NOTES = [
    "Ít đá",
    "Không đá",
    "Nhiều đá",
    "Ít đường",
    "Không đường",
    "50% đường",
    "70% đường",
    "Mang đi",
    "Nóng",
    "Uống tại chỗ",
  ];

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

  // Reset customer display when leaving order page
  useEffect(() => {
    return () => {
      CustomerDisplayService.sendReset();
    };
  }, []);

  // Redirect to shift page if no open shift exists
  useEffect(() => {
    const shifts = Array.isArray(storeState.shifts) ? storeState.shifts : [];
    const hasOpenShift = shifts.some((s) => s.status === "open");
    if (!hasOpenShift && !storeState.loading) {
      navigate("/shift", { replace: true });
    }
  }, [storeState.shifts, storeState.loading, navigate]);

  const selectedTable = tables.find(
    (table) => String(table.id) === String(decodedTableId),
  );
  const isOccupied = selectedTable?.status === "occupied";

  const existingOrder = useMemo(() => {
    if (!selectedTable?.currentOrderId) return null;
    const allOrders = storeState.orders || [];
    const order = allOrders.find((o) => o.id === selectedTable.currentOrderId);
    if (!order) return null;

    // Join order details, preferring embedded order.items
    const allDetails = storeState.orderDetails || [];
    const detailItems = allDetails.filter((d) => d.orderId === order.id);
    const items =
      Array.isArray(order.items) && order.items.length > 0
        ? order.items
        : detailItems;
    return {
      ...order,
      items,
    };
  }, [selectedTable, storeState.orders, storeState.orderDetails]);

  const hasExistingOrder = Boolean(existingOrder);

  const toppingProducts = useMemo(() => {
    return products.filter(
      (p) =>
        String(p.category || "").trim().toLowerCase() === "topping" &&
        p.status !== "DELETED",
    );
  }, [products]);

  const categories = useMemo(() => {
    const categoryMap = new Map();
    products.forEach((product) => {
      const label = (product.category || "Khác").trim();
      if (label.toLowerCase() === "topping") return; // Ẩn danh mục Topping khỏi danh mục chính
      const id = normalizeCategoryId(label);
      if (!categoryMap.has(id)) {
        categoryMap.set(id, { id, label });
      }
    });
    return Array.from(categoryMap.values());
  }, [products]);

  const currentItems = products.filter((product) => {
    const cat = String(product.category || "").trim();
    if (cat.toLowerCase() === "topping") return false; // Ẩn sản phẩm Topping khỏi danh sách món chính
    const sameCategory = normalizeCategoryId(cat) === activeCategory;
    const matchesSearch = String(product.name || "")
      .toLowerCase()
      .includes(search.trim().toLowerCase());
    return sameCategory && matchesSearch;
  });

  const addToCart = (product) => {
    const newItemCandidate = {
      cartItemId: `citem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      id: product.id,
      productId: product.id,
      name: product.name,
      price: Number(product.price || 0),
      unitPrice: Number(product.price || 0),
      quantity: 1,
      size: "",
      sugar: "",
      ice: "",
      toppings: [],
      notes: [],
      customNote: "",
      stock: product.stock,
    };

    setCart((prev) => {
      const totalSameProductQty = prev
        .filter((item) => String(item.id || item.productId) === String(product.id))
        .reduce((sum, i) => sum + i.quantity, 0);

      if (totalSameProductQty + 1 > product.stock) {
        setError(`Món "${product.name}" không đủ tồn kho (Tồn: ${product.stock})`);
        return prev;
      }
      setError("");

      const existingIndex = prev.findIndex((item) => areItemsEqual(item, newItemCandidate));
      if (existingIndex !== -1) {
        return prev.map((item, idx) =>
          idx === existingIndex
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [...prev, newItemCandidate];
    });
  };

  const updateQuantityByIndex = (itemIndex, delta) => {
    setCart((prev) => {
      const item = prev[itemIndex];
      if (!item) return prev;

      const product = products.find((p) => String(p.id) === String(item.id || item.productId));
      const newQty = item.quantity + delta;

      if (delta > 0 && product) {
        const totalSameProductQty = prev
          .filter((i) => String(i.id || i.productId) === String(product.id))
          .reduce((sum, i) => sum + i.quantity, 0);

        if (totalSameProductQty + delta > product.stock) {
          setError(`Món "${product.name}" không đủ tồn kho (Tồn: ${product.stock})`);
          return prev;
        }
      }
      setError("");

      if (newQty <= 0) {
        return prev.filter((_, idx) => idx !== itemIndex);
      }

      return prev.map((i, idx) => (idx === itemIndex ? { ...i, quantity: newQty } : i));
    });
  };

  // Subtotal for NEW items in cart (bao gồm giá Toppings)
  const cartSubtotal = cart.reduce(
    (sum, item) => sum + calculateItemSubtotal(item),
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
      (c) =>
        String(c.code || "")
          .trim()
          .toUpperCase() === String(code).trim().toUpperCase(),
    );
    if (!coupon || coupon.status !== "ACTIVE") return 0;

    if (coupon.expiresAt) {
      const isExpired =
        new Date(coupon.expiresAt) < new Date(new Date().setHours(0, 0, 0, 0));
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
      (c) =>
        String(c.code || "")
          .trim()
          .toUpperCase() === String(code).trim().toUpperCase(),
    );
    if (!coupon) return "Mã giảm giá không tồn tại";
    if (coupon.status !== "ACTIVE") return "Mã giảm giá không còn hoạt động";

    if (coupon.expiresAt) {
      const isExpired =
        new Date(coupon.expiresAt) < new Date(new Date().setHours(0, 0, 0, 0));
      if (isExpired) return "Mã giảm giá đã hết hạn sử dụng";
    }

    const minVal = Number(coupon.minOrderValue) || 0;
    if (currentSubtotal < minVal) {
      return `Đơn hàng tối thiểu chưa đạt (Yêu cầu: ${formatCurrency(minVal)})`;
    }

    return "";
  };

  const activeDiscounts = useMemo(() => {
    return (storeState.discounts || []).filter((c) => c.status === "ACTIVE");
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

  const mapCartItemToOrderItem = (item) => {
    const itemUnitPrice = calculateItemUnitPrice(item);
    const itemSubtotal = calculateItemSubtotal(item);
    return {
      productId: item.id || item.productId,
      productName: item.name || item.productName,
      name: item.name || item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice || item.price,
      price: item.unitPrice || item.price,
      subtotal: itemSubtotal,
      total: itemSubtotal,
      size: item.size || "",
      sugar: item.sugar || "",
      ice: item.ice || "",
      toppings: item.toppings || [],
      notes: item.notes || [],
      customNote: item.customNote || "",
    };
  };

  // --- Confirm order and send to Customer Display ---
  const handleConfirmOrder = () => {
    if (!selectedTable) return;
    if (cart.length === 0 && !hasExistingOrder) return;

    const existingItems = hasExistingOrder
      ? (existingOrder?.items || []).map((item) => ({
          name: item.productName || item.name,
          quantity: item.quantity,
          price: Number(item.unitPrice || 0),
          total: Number(item.subtotal || 0),
          toppings: item.toppings || [],
          notes: item.notes || [],
          customNote: item.customNote || "",
        }))
      : [];

    const newItems = cart.map(mapCartItemToOrderItem);
    const allItems = [...existingItems, ...newItems];
    const orderId = existingOrder ? existingOrder.id : `temp_${Date.now()}`;

    CustomerDisplayService.sendOrdering({
      tableName: selectedTable.name || `Bàn ${decodedTableId}`,
      items: allItems,
      subtotal,
      discount: safeDiscount,
      total,
      paymentMethod,
      orderId,
      settings: storeInfo,
    });

    setIsConfirmedForDisplay(true);
  };

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
          toppings: item.toppings || [],
          notes: item.notes || [],
          customNote: item.customNote || "",
        }))
      : [];

    const newItems = cart.map(mapCartItemToOrderItem);
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
        items: cart.map(mapCartItemToOrderItem),
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
        items: cart.map(mapCartItemToOrderItem),
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
        paymentMethod:
          orderPayload.paymentMethod === "transfer" ? "transfer" : "cash",
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
          // Safely update: remap temp IDs to server IDs without wiping data
          const serverOrderId = serverOrder.id;

          // Update order: change temp ID to server ID, keep all other data
          const latestOrders = appStore.get("orders") || [];
          appStore.set(
            "orders",
            latestOrders.map((o) =>
              o.id === tempOrderId
                ? { ...o, ...serverOrder, id: serverOrderId }
                : o,
            ),
          );

          // Update orderDetails: remap orderId from temp to server ID (keep local items intact)
          const latestDetails = appStore.get("orderDetails") || [];
          appStore.set(
            "orderDetails",
            latestDetails.map((d) =>
              d.orderId === tempOrderId ? { ...d, orderId: serverOrderId } : d,
            ),
          );

          // Update table with server order ID
          const latestTables = appStore.get("tables") || [];
          appStore.set(
            "tables",
            latestTables.map((t) =>
              String(t.id) === String(decodedTableId)
                ? { ...t, currentOrderId: serverOrderId }
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
      const newItems = cart.map(mapCartItemToOrderItem);

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
      const targetOrder = currentOrders.find((o) => o.id === orderId);
      const existingOrderItems = Array.isArray(targetOrder?.items)
        ? targetOrder.items
        : [];
      const updatedOrderItems = [...existingOrderItems, ...newItems];

      appStore.set(
        "orders",
        currentOrders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                items: updatedOrderItems,
                subtotal: (Number(o.subtotal) || 0) + cartSubtotal,
                discount: safeDiscount,
                grandTotal: (Number(o.subtotal) || 0) + cartSubtotal - safeDiscount,
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
          // result is the full updated order from server
          const latestOrders = appStore.get("orders") || [];
          const updatedOrders = latestOrders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  ...(result || {}),
                }
              : o,
          );
          appStore.set("orders", updatedOrders);

          if (result && Array.isArray(result.items)) {
            const latestDetails = appStore.get("orderDetails") || [];
            const otherDetails = latestDetails.filter(
              (d) => d.orderId !== orderId,
            );
            const serverDetails = result.items.map((item, idx) => ({
              id: item.id || `detail_${orderId}_${idx}`,
              orderId: orderId,
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.subtotal,
            }));
            appStore.set("orderDetails", [...otherDetails, ...serverDetails]);
          }
        })
        .catch((err) => {
          console.error("Failed to sync added items:", err);
          appStore.setError("Lỗi đồng bộ gọi thêm món lên máy chủ");
        });

      setCart([]);
      setError("");
      navigate("/khu-vuc", { replace: true });
    } catch (err) {
      setError(err.message || "Gọi thêm món thất bại");
    } finally {
      setIsSubmitting(false);
    }
  };

  // === DELETE EXISTING ITEM (with confirmation) ===
  const handleDeleteExistingItem = (item) => {
    if (!hasExistingOrder || !item) return;
    const orderId = existingOrder.id;

    // Remove item from orderDetails in AppStore
    const currentDetails = appStore.get("orderDetails") || [];
    const updatedDetails = currentDetails.filter(
      (d) => !(d.orderId === orderId && d.productId === item.productId),
    );
    appStore.set("orderDetails", updatedDetails);

    // Recalculate order totals
    const remainingItems = updatedDetails.filter((d) => d.orderId === orderId);
    const newSubtotal = remainingItems.reduce(
      (sum, d) => sum + Number(d.subtotal || 0),
      0,
    );
    const currentOrders = appStore.get("orders") || [];

    if (remainingItems.length === 0) {
      // No items left -> remove order, free table
      appStore.set(
        "orders",
        currentOrders.filter((o) => o.id !== orderId),
      );
      const currentTables = appStore.get("tables") || [];
      appStore.set(
        "tables",
        currentTables.map((t) =>
          String(t.id) === String(decodedTableId)
            ? { ...t, status: "available", currentOrderId: "" }
            : t,
        ),
      );
    } else {
      // Recalc order
      appStore.set(
        "orders",
        currentOrders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                subtotal: newSubtotal,
                grandTotal: newSubtotal - (o.discount || 0),
              }
            : o,
        ),
      );
    }

    // Restore stock
    const updatedProducts = products.map((p) => {
      if (p.id === item.productId) {
        return { ...p, stock: p.stock + item.quantity };
      }
      return p;
    });
    appStore.set("products", updatedProducts);

    showToast(`Đã xóa "${item.productName}" khỏi đơn hàng`);
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
                    {appliedDiscountCode
                      ? `${appliedDiscountCode} (-${formatCurrency(discount)})`
                      : discount > 0
                        ? formatCurrency(discount)
                        : "0 đ"}
                  </p>
                </div>
              </button>
            </div>

            {/* Existing order items */}
            {hasExistingOrder && existingOrder.items?.length > 0 && (
              <div className="p-5 border-b bg-gray-50">
                <p className="text-sm font-semibold text-gray-600 mb-3">
                  📋 Đã order trước đó
                </p>
                {existingOrder.items.map((item, idx) => {
                  const hasToppings = Array.isArray(item.toppings) && item.toppings.length > 0;
                  const hasNotes = (Array.isArray(item.notes) && item.notes.length > 0) || Boolean(item.customNote);

                  return (
                    <div
                      key={`existing-${idx}`}
                      className="py-2 border-b border-gray-100 text-sm text-gray-600 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800">{item.productName || item.name}</p>
                          <p className="text-xs text-gray-400">x{item.quantity}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <p className="font-semibold">{formatCurrency(Number(item.subtotal || 0))}</p>
                          <button
                            onClick={() =>
                              setConfirmDeleteItem({ isOpen: true, item })
                            }
                            className="w-6 h-6 rounded-full bg-red-100 text-red-500 hover:bg-red-200 flex items-center justify-center text-xs font-bold transition"
                            title="Xóa món"
                          >
                            ×
                          </button>
                        </div>
                      </div>

                      {hasToppings && (
                        <div className="pl-3 text-xs text-blue-700 space-y-0.5">
                          {item.toppings.map((t, i) => (
                            <div key={i}>+ {t.name || t.productName} (x{t.quantity || 1})</div>
                          ))}
                        </div>
                      )}

                      {hasNotes && (
                        <div className="pl-3 text-xs text-amber-700 italic">
                          📝 {item.notes?.join(", ")} {item.customNote && `("${item.customNote}")`}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                  {cart.map((item, idx) => {
                    const itemUnitPrice = calculateItemUnitPrice(item);
                    const itemSubtotal = calculateItemSubtotal(item);
                    const hasToppings = Array.isArray(item.toppings) && item.toppings.length > 0;
                    const hasNotes = (Array.isArray(item.notes) && item.notes.length > 0) || Boolean(item.customNote);

                    return (
                      <div
                        key={item.cartItemId || `cart-item-${idx}`}
                        className="py-3 border-b border-gray-100 flex flex-col gap-2"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-800 text-sm">{item.name}</p>
                            <p className="text-xs text-gray-500">
                              Đơn giá: {formatCurrency(itemUnitPrice)}
                            </p>
                          </div>
                          <p className="font-bold text-sm text-blue-600 shrink-0">
                            {formatCurrency(itemSubtotal)}
                          </p>
                        </div>

                        {/* Danh sách Topping đã chọn */}
                        {hasToppings && (
                          <div className="bg-blue-50/70 rounded-xl p-2 text-xs space-y-1">
                            <p className="font-semibold text-blue-800 text-[11px]">Topping:</p>
                            {item.toppings.map((top) => (
                              <div key={top.id} className="flex justify-between items-center text-blue-700">
                                <span>+ {top.name} (x{top.quantity || 1})</span>
                                <span className="font-medium">+{formatCurrency(Number(top.price || 0) * (top.quantity || 1))}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Ghi chú đã chọn */}
                        {hasNotes && (
                          <div className="bg-amber-50/70 rounded-xl p-2 text-xs text-amber-800 italic">
                            {item.notes?.length > 0 && <span>📝 {item.notes.join(", ")}</span>}
                            {item.notes?.length > 0 && item.customNote && <span> | </span>}
                            {item.customNote && <span>Ghi chú: "{item.customNote}"</span>}
                          </div>
                        )}

                        {/* Nút bấm điều khiển & Thêm Topping/Note */}
                        <div className="flex items-center justify-between pt-1">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setToppingModal({ isOpen: true, itemIndex: idx })}
                              className="px-2.5 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg text-xs font-semibold transition"
                            >
                              + Topping
                            </button>
                            <button
                              onClick={() =>
                                setNoteModal({
                                  isOpen: true,
                                  itemIndex: idx,
                                  customText: item.customNote || "",
                                })
                              }
                              className="px-2.5 py-1 bg-amber-100 text-amber-800 hover:bg-amber-200 rounded-lg text-xs font-semibold transition"
                            >
                              📝 Ghi chú
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateQuantityByIndex(idx, -1)}
                              className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 font-bold text-gray-700 flex items-center justify-center"
                            >
                              -
                            </button>
                            <span className="font-bold text-sm min-w-[1rem] text-center">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantityByIndex(idx, 1)}
                              className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 font-bold text-gray-700 flex items-center justify-center"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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

              <div className="mb-4 flex gap-2">
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

              {paymentMethod === "transfer" && (
                <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
                  Thanh toán bằng VietQR: khách sẽ quét mã để chuyển khoản, sau
                  đó nhân viên xác nhận đã thanh toán trên POS.
                </div>
              )}

              {/* Nút Xác nhận đơn - gửi cho khách xem */}
              {!isConfirmedForDisplay && (
                <button
                  onClick={handleConfirmOrder}
                  disabled={
                    (cart.length === 0 && !hasExistingOrder) || isSubmitting
                  }
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-4 rounded-2xl font-bold text-lg transition mb-3"
                >
                  ✅ Xác nhận đơn cho khách xem
                </button>
              )}

              {/* Nút Thanh toán - chỉ hiện sau khi xác nhận */}
              {isConfirmedForDisplay && (
                <button
                  onClick={handleCheckout}
                  disabled={
                    (cart.length === 0 && !hasExistingOrder) || isSubmitting
                  }
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white py-4 rounded-2xl font-bold text-lg transition mb-3"
                >
                  {isSubmitting
                    ? "Đang xử lý..."
                    : paymentMethod === "cash"
                      ? "💳 Thanh toán tiền mặt"
                      : "💳 Đã thanh toán"}
                </button>
              )}

              {/* Nút Gọi thêm món (chỉ khi có món trong cart) */}
              {cart.length > 0 && (
                <button
                  onClick={hasExistingOrder ? handleAddItems : handlePayLater}
                  disabled={isSubmitting}
                  className="w-full border-2 border-blue-600 text-blue-600 hover:bg-blue-50 disabled:opacity-50 py-4 rounded-2xl font-bold text-lg transition"
                >
                  {isSubmitting ? "Đang xử lý..." : "➕ Gọi thêm món"}
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
                        alert(
                          `Áp dụng mã thành công! Giảm ${formatCurrency(amt)}`,
                        );
                      }
                    }}
                    className="px-5 py-3 bg-blue-600 text-white font-semibold rounded-2xl hover:bg-blue-700 transition"
                  >
                    Áp dụng
                  </button>
                </div>
                {discountError && (
                  <p className="text-xs text-red-500 font-semibold mt-2">
                    {discountError}
                  </p>
                )}
                {!discountError &&
                  tempDiscountCode &&
                  (() => {
                    const err = getCodeValidationError(
                      tempDiscountCode.trim(),
                      subtotal,
                    );
                    if (!err && tempDiscountCode.trim()) {
                      const amt = calculateDiscount(
                        tempDiscountCode.trim(),
                        subtotal,
                      );
                      return (
                        <p className="text-xs text-emerald-600 font-semibold mt-2">
                          Mã hợp lệ! Số tiền giảm: {formatCurrency(amt)}
                        </p>
                      );
                    }
                    return null;
                  })()}
              </div>

              {/* List of active discounts */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-gray-500 mb-3">
                  Mã giảm giá khả dụng
                </p>
                {activeDiscounts.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">
                    Không có mã giảm giá nào đang hoạt động
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {activeDiscounts.map((coupon) => {
                      const isSelectable =
                        subtotal >= (Number(coupon.minOrderValue) || 0);
                      const isExpired =
                        coupon.expiresAt &&
                        new Date(coupon.expiresAt) <
                          new Date(new Date().setHours(0, 0, 0, 0));

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
                            tempDiscountCode.trim().toUpperCase() ===
                            String(coupon.code).trim().toUpperCase()
                              ? "border-blue-600 bg-blue-50/50"
                              : "border-gray-100 hover:border-gray-300"
                          } ${!isSelectable || isExpired ? "opacity-60" : ""}`}
                        >
                          <div className="flex justify-between w-full items-baseline">
                            <span className="font-mono font-bold text-blue-700">
                              {coupon.code}
                            </span>
                            <span className="text-xs text-gray-500">
                              {coupon.type === "percent"
                                ? `Giảm ${coupon.value}%`
                                : `Giảm ${formatCurrency(coupon.value)}`}
                            </span>
                          </div>
                          <div className="flex justify-between w-full mt-1 items-center">
                            <span className="text-[10px] text-gray-400">
                              Đơn tối thiểu:{" "}
                              {formatCurrency(coupon.minOrderValue)}
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
                .filter(
                  (p) =>
                    p.status !== "DELETED" &&
                    String(p.name || "")
                      .toLowerCase()
                      .includes(outOfStockSearch.toLowerCase()),
                )
                .map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl border border-gray-100"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-bold text-gray-800 truncate text-base">
                        {product.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {product.category} &bull; Tồn:{" "}
                        <span
                          className={
                            product.stock === 0
                              ? "text-red-500 font-bold"
                              : "text-gray-700 font-semibold"
                          }
                        >
                          {product.stock}
                        </span>
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
                            const newStockStr = prompt(
                              `Nhập số lượng tồn kho mới cho "${product.name}":`,
                              "100",
                            );
                            if (newStockStr !== null) {
                              const qty = parseInt(newStockStr, 10);
                              if (!isNaN(qty) && qty >= 0) {
                                try {
                                  await CrudService.update("products", {
                                    ...product,
                                    stock: qty,
                                  });
                                  showToast(
                                    `Đã cập nhật lại tồn kho món "${product.name}" thành ${qty}!`,
                                  );
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
              <h3 className="text-xl font-bold text-gray-900 mt-3">
                Xác nhận báo hết
              </h3>
              <p className="text-gray-500 text-sm mt-2">
                Bạn có chắc chắn muốn báo hết món{" "}
                <strong className="text-gray-800 font-semibold">
                  "{confirmOutOfStock.product?.name}"
                </strong>{" "}
                khẩn cấp không?
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() =>
                  setConfirmOutOfStock({ isOpen: false, product: null })
                }
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-2xl transition-all cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={async () => {
                  const product = confirmOutOfStock.product;
                  setConfirmOutOfStock({ isOpen: false, product: null });
                  try {
                    await CrudService.update("products", {
                      ...product,
                      stock: 0,
                    });
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

      {confirmDeleteItem.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm mx-4 p-6 shadow-2xl">
            <div className="text-center">
              <span className="text-4xl">⚠️</span>
              <h3 className="text-xl font-bold text-gray-900 mt-3">
                Xác nhận xóa món
              </h3>
              <p className="text-gray-500 text-sm mt-2">
                Món{" "}
                <strong className="text-gray-800 font-semibold">
                  "{confirmDeleteItem.item?.productName}"
                </strong>{" "}
                đã được gửi ra bar/bếp.
              </p>
              <p className="text-red-500 text-xs font-semibold mt-2">
                Bạn có chắc chắn muốn xóa khỏi đơn hàng không?
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() =>
                  setConfirmDeleteItem({ isOpen: false, item: null })
                }
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-2xl transition-all cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  const item = confirmDeleteItem.item;
                  setConfirmDeleteItem({ isOpen: false, item: null });
                  handleDeleteExistingItem(item);
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer"
              >
                Xóa món
              </button>
            </div>
          </div>
        </div>
      )}

      {toast.isOpen && (
        <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 z-[200]">
          <div
            className={`px-6 py-3.5 rounded-2xl shadow-xl flex items-center gap-2 font-semibold text-sm sm:text-base text-white ${
              toast.type === "error" ? "bg-red-600" : "bg-emerald-600"
            }`}
          >
            <span>{toast.type === "error" ? "❌" : "✅"}</span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Popup Thêm Topping */}
      {toppingModal.isOpen && toppingModal.itemIndex >= 0 && cart[toppingModal.itemIndex] && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-4 border-b">
              <div>
                <h3 className="font-bold text-lg text-gray-800">
                  Thêm Topping cho: {cart[toppingModal.itemIndex]?.name}
                </h3>
                <p className="text-xs text-gray-500">Chọn các topping đi kèm món ăn</p>
              </div>
              <button
                onClick={() => setToppingModal({ isOpen: false, itemIndex: -1 })}
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-bold hover:bg-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {toppingProducts.length === 0 ? (
                <p className="text-center text-gray-400 py-8">Chưa có sản phẩm thuộc danh mục Topping</p>
              ) : (
                toppingProducts.map((topProduct) => {
                  const currentItemToppings = cart[toppingModal.itemIndex]?.toppings || [];
                  const existingTop = currentItemToppings.find((t) => String(t.id) === String(topProduct.id));
                  const topQty = existingTop ? existingTop.quantity : 0;

                  const handleUpdateToppingQty = (delta) => {
                    const newQty = topQty + delta;
                    setCart((prev) => {
                      const targetItem = prev[toppingModal.itemIndex];
                      if (!targetItem) return prev;
                      let updatedToppings = [...(targetItem.toppings || [])];
                      if (newQty <= 0) {
                        updatedToppings = updatedToppings.filter((t) => String(t.id) !== String(topProduct.id));
                      } else if (existingTop) {
                        updatedToppings = updatedToppings.map((t) =>
                          String(t.id) === String(topProduct.id) ? { ...t, quantity: newQty } : t
                        );
                      } else {
                        updatedToppings.push({
                          id: topProduct.id,
                          name: topProduct.name,
                          price: Number(topProduct.price || 0),
                          quantity: 1,
                        });
                      }
                      return prev.map((item, idx) =>
                        idx === toppingModal.itemIndex ? { ...item, toppings: updatedToppings } : item
                      );
                    });
                  };

                  return (
                    <div
                      key={topProduct.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-blue-50/50 transition"
                    >
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{topProduct.name}</p>
                        <p className="text-xs text-blue-600 font-bold">+{formatCurrency(topProduct.price)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {topQty > 0 && (
                          <button
                            onClick={() => handleUpdateToppingQty(-1)}
                            className="w-7 h-7 rounded-full bg-white border border-gray-300 font-bold text-gray-700 hover:bg-gray-100"
                          >
                            -
                          </button>
                        )}
                        {topQty > 0 && <span className="font-bold text-sm min-w-[1.25rem] text-center">{topQty}</span>}
                        <button
                          onClick={() => handleUpdateToppingQty(1)}
                          className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-sm"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-4 border-t flex justify-end">
              <button
                onClick={() => setToppingModal({ isOpen: false, itemIndex: -1 })}
                className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-2xl hover:bg-blue-700 transition"
              >
                Hoàn tất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup Ghi Chú (Note) */}
      {noteModal.isOpen && noteModal.itemIndex >= 0 && cart[noteModal.itemIndex] && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-4 border-b">
              <div>
                <h3 className="font-bold text-lg text-gray-800">
                  Ghi chú cho: {cart[noteModal.itemIndex]?.name}
                </h3>
                <p className="text-xs text-gray-500">Chọn ghi chú nhanh hoặc nhập ghi chú tùy chỉnh</p>
              </div>
              <button
                onClick={() => setNoteModal({ isOpen: false, itemIndex: -1, customText: "" })}
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-bold hover:bg-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Ghi chú có sẵn:</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_NOTES.map((preset) => {
                    const currentNotes = cart[noteModal.itemIndex]?.notes || [];
                    const isSelected = currentNotes.includes(preset);

                    const toggleNote = () => {
                      setCart((prev) => {
                        const item = prev[noteModal.itemIndex];
                        if (!item) return prev;
                        const nextNotes = isSelected
                          ? (item.notes || []).filter((n) => n !== preset)
                          : [...(item.notes || []), preset];
                        return prev.map((i, idx) =>
                          idx === noteModal.itemIndex ? { ...i, notes: nextNotes } : i
                        );
                      });
                    };

                    return (
                      <button
                        key={preset}
                        onClick={toggleNote}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                          isSelected
                            ? "bg-amber-500 text-white shadow-sm"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Ghi chú riêng:</p>
                <input
                  type="text"
                  value={noteModal.customText}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNoteModal((prev) => ({ ...prev, customText: val }));
                    setCart((prev) =>
                      prev.map((i, idx) =>
                        idx === noteModal.itemIndex ? { ...i, customNote: val } : i
                      )
                    );
                  }}
                  placeholder="Ví dụ: Ít sữa, không lấy ống hút..."
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:border-amber-500 outline-none"
                />
              </div>
            </div>

            <div className="pt-4 border-t flex justify-end">
              <button
                onClick={() => setNoteModal({ isOpen: false, itemIndex: -1, customText: "" })}
                className="px-6 py-2.5 bg-amber-500 text-white font-semibold rounded-2xl hover:bg-amber-600 transition"
              >
                Lưu ghi chú
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
