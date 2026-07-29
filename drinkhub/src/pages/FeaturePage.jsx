import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import appStore from "../services/AppStore";
import CrudService from "../services/CrudService";
import { storeApi } from "../api/Api";
import { formatCurrency } from "../utils/helpers";
import { getStoredAuthUser } from "../utils/auth";

export default function FeaturePage() {
  const navigate = useNavigate();
  const { featureId } = useParams();

  const [storeState, setStoreState] = useState(appStore.getState());
  const [search, setSearch] = useState("");
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    product: null,
  });
  const [toast, setToast] = useState({
    isOpen: false,
    message: "",
    type: "success",
  });
  const [paymentConfig, setPaymentConfig] = useState({
    accountNo: "",
    accountName: "",
    bankId: "",
    bankName: "",
    bankCode: "",
  });
  const [bankOptions, setBankOptions] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [bankError, setBankError] = useState("");

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

  useEffect(() => {
    const settings = storeState.settings || {};
    setPaymentConfig((prev) => ({
      ...prev,
      accountNo: settings.BANK_ACCOUNT || prev.accountNo || "",
      accountName: settings.BANK_OWNER || prev.accountName || "",
      bankId: settings.BANK_ID || prev.bankId || "",
      bankName: settings.BANK_NAME || prev.bankName || "",
      bankCode: settings.BANK_CODE || prev.bankCode || "",
    }));
  }, [storeState.settings]);

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      try {
        const info = await storeApi.getStoreInfo();
        if (!isMounted) return;
        setPaymentConfig((prev) => ({
          ...prev,
          accountNo: info.BANK_ACCOUNT || prev.accountNo || "",
          accountName: info.BANK_OWNER || prev.accountName || "",
          bankId: info.BANK_ID || prev.bankId || "",
          bankName: info.BANK_NAME || prev.bankName || "",
          bankCode: info.BANK_CODE || prev.bankCode || "",
        }));
      } catch (err) {
        console.error("Failed to load store info", err);
      }
    };

    const loadBanks = async () => {
      setLoadingBanks(true);
      setBankError("");
      try {
        const res = await fetch("https://api.vietqr.io/v2/banks");
        const json = await res.json();
        const banks = Array.isArray(json?.data) ? json.data : [];
        if (isMounted) {
          setBankOptions(banks);
        }
      } catch (err) {
        console.error("Failed to load VietQR banks", err);
        if (isMounted) {
          setBankError("Không thể tải danh sách ngân hàng từ VietQR.");
        }
      } finally {
        if (isMounted) {
          setLoadingBanks(false);
        }
      }
    };

    loadSettings();
    loadBanks();

    return () => {
      isMounted = false;
    };
  }, []);

  const products = storeState.products || [];

  const filteredProducts = useMemo(() => {
    return products.filter(
      (p) =>
        p.status !== "DELETED" &&
        String(p.name || "")
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  }, [products, search]);

  const handleSavePaymentConfig = async (event) => {
    event.preventDefault();

    if (!paymentConfig.accountNo.trim()) {
      showToast("Vui lòng nhập số tài khoản nhận tiền", "error");
      return;
    }

    if (!paymentConfig.accountName.trim()) {
      showToast("Vui lòng nhập tên người nhận", "error");
      return;
    }

    if (!paymentConfig.bankId) {
      showToast("Vui lòng chọn ngân hàng", "error");
      return;
    }

    setIsSavingPayment(true);
    const user = getStoredAuthUser();
    const nextSettings = {
      ...(appStore.get("settings") || {}),
      BANK_ACCOUNT: paymentConfig.accountNo.trim(),
      BANK_OWNER: paymentConfig.accountName.trim(),
      BANK_ID: paymentConfig.bankId,
      BANK_NAME: paymentConfig.bankName,
      BANK_CODE: paymentConfig.bankCode,
    };

    appStore.set("settings", nextSettings);

    try {
      await Promise.all([
        storeApi.updateStoreInfo(
          user?.role || "staff",
          "BANK_ACCOUNT",
          paymentConfig.accountNo.trim(),
        ),
        storeApi.updateStoreInfo(
          user?.role || "staff",
          "BANK_OWNER",
          paymentConfig.accountName.trim(),
        ),
        storeApi.updateStoreInfo(
          user?.role || "staff",
          "BANK_ID",
          paymentConfig.bankId,
        ),
        storeApi.updateStoreInfo(
          user?.role || "staff",
          "BANK_NAME",
          paymentConfig.bankName,
        ),
        storeApi.updateStoreInfo(
          user?.role || "staff",
          "BANK_CODE",
          paymentConfig.bankCode,
        ),
      ]);
      showToast("Đã lưu thông tin tài khoản nhận tiền");
    } catch (err) {
      showToast(`Lỗi khi lưu cấu hình: ${err.message || err}`, "error");
    } finally {
      setIsSavingPayment(false);
    }
  };

  if (featureId === "6") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />

        <main className="flex-1 overflow-y-auto pt-[60px] sm:pt-20 px-3 sm:px-6 max-w-4xl mx-auto pb-10 w-full">
          <div className="flex items-center gap-4 mb-8">
            <button
              onClick={() => navigate("/")}
              className="text-3xl text-gray-600 hover:text-gray-900"
            >
              &larr;
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                💳 Cấu hình tài khoản nhận tiền
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Thiết lập số tài khoản và tên người nhận cho VietQR
              </p>
            </div>
          </div>

          <form onSubmit={handleSavePaymentConfig} className="space-y-5">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Số tài khoản người nhận
                </label>
                <input
                  type="text"
                  value={paymentConfig.accountNo}
                  onChange={(e) =>
                    setPaymentConfig((prev) => ({
                      ...prev,
                      accountNo: e.target.value,
                    }))
                  }
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ví dụ: 1234567890"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Tên người nhận
                </label>
                <input
                  type="text"
                  value={paymentConfig.accountName}
                  onChange={(e) =>
                    setPaymentConfig((prev) => ({
                      ...prev,
                      accountName: e.target.value,
                    }))
                  }
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ví dụ: QUYNH ANH"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Chọn ngân hàng
                </label>
                <select
                  value={paymentConfig.bankId}
                  onChange={(e) => {
                    const selectedBank = bankOptions.find(
                      (bank) => bank.bin === e.target.value,
                    );
                    setPaymentConfig((prev) => ({
                      ...prev,
                      bankId: selectedBank?.bin || "",
                      bankName: selectedBank?.name || "",
                      bankCode: selectedBank?.code || "",
                    }));
                  }}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  disabled={loadingBanks}
                >
                  <option value="">
                    {loadingBanks
                      ? "Đang tải danh sách ngân hàng..."
                      : "Chọn ngân hàng"}
                  </option>
                  {bankOptions.map((bank) => (
                    <option key={bank.bin} value={bank.bin}>
                      {bank.name} ({bank.code})
                    </option>
                  ))}
                </select>
                {bankError && (
                  <p className="text-sm text-red-500 mt-2">{bankError}</p>
                )}
              </div>

              <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-700">
                <p className="font-semibold">
                  Thông tin sẽ được dùng cho VietQR
                </p>
                <p className="mt-1">
                  Bank ID sẽ dùng mã BIN của ngân hàng đã chọn:{" "}
                  <strong>{paymentConfig.bankId || "Chưa chọn"}</strong>
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSavingPayment}
              className="w-full py-3 rounded-2xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:bg-gray-300 transition"
            >
              {isSavingPayment ? "Đang lưu..." : "Lưu cấu hình nhận tiền"}
            </button>
          </form>
        </main>

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
      </div>
    );
  }

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
                <h3 className="text-xl font-bold text-gray-900 mt-3">
                  Xác nhận báo hết
                </h3>
                <p className="text-gray-500 text-sm mt-2">
                  Bạn có chắc chắn muốn báo hết món{" "}
                  <strong className="text-gray-800 font-semibold">
                    "{confirmModal.product?.name}"
                  </strong>{" "}
                  khẩn cấp không?
                </p>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() =>
                    setConfirmModal({ isOpen: false, product: null })
                  }
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-2xl transition-all cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  onClick={async () => {
                    const product = confirmModal.product;
                    setConfirmModal({ isOpen: false, product: null });
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
