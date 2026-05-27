import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import { orderApi, paymentApi, productApi, tableApi } from "../api/Api";
import { formatCurrency } from "../utils/helpers";
import { getStoredAuthUser } from "../utils/auth";

const normalizeCategoryId = (value) =>
  String(value || "khac")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

export default function OrderPage() {
  const navigate = useNavigate();
  const { tableId } = useParams();
  const decodedTableId = decodeURIComponent(tableId || "");

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

  useEffect(() => {
    let isMounted = true;

    Promise.all([productApi.getProducts(), tableApi.getTables()])
      .then(([productData, tableData]) => {
        if (!isMounted) return;
        const nextProducts = Array.isArray(productData) ? productData : [];
        setProducts(nextProducts);
        setTables(Array.isArray(tableData) ? tableData : []);
        setActiveCategory((current) => {
          if (current) return current;
          return normalizeCategoryId(nextProducts[0]?.category);
        });
        setError("");
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.details || err.code || err.message);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedTable = tables.find((table) => table.id === decodedTableId);

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
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === productId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const subtotal = cart.reduce(
    (sum, item) => sum + Number(item.price || 0) * item.quantity,
    0,
  );
  const safeDiscount = Math.max(0, Math.min(Number(discount) || 0, subtotal));
  const total = subtotal - safeDiscount;

  const handleCheckout = async () => {
    if (cart.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setError("");

    try {
      const authUser = getStoredAuthUser();

      // Prepare order data for bill summary
      const orderData = {
        tableId: decodedTableId,
        tableName: selectedTable?.name || `Bàn ${decodedTableId}`,
        customerName: customer.name || "Khách lẻ",
        customerPhone: customer.phone || "",
        items: cart.map((item) => ({
          productId: item.id,
          productName: item.name,
          quantity: item.quantity,
          unitPrice: Number(item.price || 0),
          subtotal: Number(item.price || 0) * item.quantity,
        })),
        subtotal,
        discount: safeDiscount,
        grandTotal: total,
        createdBy: authUser?.username || "staff",
        paymentMethod: paymentMethod,
      };

      // Navigate to bill summary with order data
      navigate("/bill-summary", { state: { orderData } });
    } catch (err) {
      setError(err.details || err.code || err.message);
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
                Trạng thái: {selectedTable?.status || "không rõ"}
              </p>
              <p className="font-semibold">
                {selectedTable?.name || `Bàn ${decodedTableId}`}
              </p>
            </div>
          </div>
          <button className="bg-gray-100 px-5 py-2 rounded-xl text-sm">
            {decodedTableId}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border-b border-red-200 px-6 py-3 text-sm text-red-700">
            {error}
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
                      src={item.image}
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
                    Giỏ hàng ({cart.length})
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

            <div className="flex-1 p-5 overflow-auto">
              {cart.length === 0 ? (
                <p className="text-center text-gray-400 mt-20">
                  Chưa có món nào trong giỏ hàng
                </p>
              ) : (
                cart.map((item) => (
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
                ))
              )}
            </div>

            <div className="p-5 border-t bg-gray-50">
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

              <button
                onClick={handleCheckout}
                disabled={cart.length === 0 || isSubmitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white py-4 rounded-2xl font-bold text-lg transition"
              >
                {isSubmitting
                  ? "Đang xử lý..."
                  : `Thanh toán ${paymentMethod === "cash" ? "tiền mặt" : "chuyển khoản"}`}
              </button>
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
