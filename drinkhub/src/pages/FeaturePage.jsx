import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import appStore from "../services/AppStore";
import CrudService from "../services/CrudService";
import { formatCurrency } from "../utils/helpers";

export default function FeaturePage() {
  const navigate = useNavigate();
  const { featureId } = useParams();

  const [storeState, setStoreState] = useState(appStore.getState());
  const [search, setSearch] = useState("");
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, product: null });
  const [toast, setToast] = useState({ isOpen: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ isOpen: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, isOpen: false }));
    }, 2500);
  };

  useEffect(() => {
    const unsubscribe = appStore.subscribe((state) => {
      setStoreState({ ...state });
    });
    return unsubscribe;
  }, []);

  const products = storeState.products || [];

  const filteredProducts = useMemo(() => {
    return products.filter(
      (p) =>
        p.status !== "DELETED" &&
        String(p.name || "").toLowerCase().includes(search.toLowerCase())
    );
  }, [products, search]);

  if (featureId === "10") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />

        <main className="flex-1 overflow-y-auto pt-[60px] sm:pt-20 px-3 sm:px-6 max-w-5xl mx-auto pb-10 w-full">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/")}
                className="text-3xl text-gray-600 hover:text-gray-900"
              >
                &larr;
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  🚨 Báo hết món khẩn cấp
                </h1>
                <p className="text-sm text-gray-500">
                  Chuyển trạng thái món ăn sang hết hàng tức thì
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6 shadow-sm">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm món ăn để báo hết..."
              className="w-full px-4 py-3 bg-gray-100 rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-red-500 text-base"
            />
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            {filteredProducts.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                Không tìm thấy món ăn nào
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-4 hover:bg-gray-50/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1 pr-4">
                      <p className="font-bold text-gray-800 text-base sm:text-lg">
                        {product.name}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                        Danh mục: {product.category} &bull; Tồn kho:{" "}
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

                    <div className="flex-shrink-0">
                      {product.stock > 0 ? (
                        <button
                          onClick={() => {
                            setConfirmModal({ isOpen: true, product });
                          }}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl text-sm font-bold transition-all shadow-sm cursor-pointer"
                        >
                          Báo Hết
                        </button>
                      ) : (
                        <button
                          onClick={async () => {
                            const newStockStr = prompt(
                              `Nhập số lượng tồn kho mới cho "${product.name}":`,
                              "100"
                            );
                            if (newStockStr !== null) {
                              const qty = parseInt(newStockStr, 10);
                              if (!isNaN(qty) && qty >= 0) {
                                try {
                                  await CrudService.update("products", {
                                    ...product,
                                    stock: qty,
                                  });
                                  showToast(`Đã cập nhật lại tồn kho món "${product.name}" thành ${qty}!`);
                                } catch (err) {
                                  showToast(`Lỗi: ${err.message}`, "error");
                                }
                              } else {
                                showToast("Số lượng không hợp lệ!", "error");
                              }
                            }
                          }}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-sm font-bold transition-all shadow-sm cursor-pointer"
                        >
                          Mở lại món
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {confirmModal.isOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] animate-fade-in">
            <div className="bg-white rounded-3xl w-full max-w-sm mx-4 p-6 shadow-2xl">
              <div className="text-center">
                <span className="text-4xl">🚨</span>
                <h3 className="text-xl font-bold text-gray-900 mt-3">Xác nhận báo hết</h3>
                <p className="text-gray-500 text-sm mt-2">
                  Bạn có chắc chắn muốn báo hết món <strong className="text-gray-800 font-semibold">"{confirmModal.product?.name}"</strong> khẩn cấp không?
                </p>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setConfirmModal({ isOpen: false, product: null })}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-2xl transition-all cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  onClick={async () => {
                    const product = confirmModal.product;
                    setConfirmModal({ isOpen: false, product: null });
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

  // Placeholder for other features
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="flex-1 overflow-y-auto pt-[60px] sm:pt-20 px-3 sm:px-6 max-w-5xl mx-auto pb-10">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate("/")}
            className="text-3xl text-gray-600 hover:text-gray-900"
          >
            &larr;
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            Tính năng {featureId}
          </h1>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-800">Đang phát triển</p>
          <p className="text-gray-500 mt-3">
            Tính năng này sẽ được cập nhật trong các phiên bản tiếp theo.
          </p>
        </div>
      </main>
    </div>
  );
}
