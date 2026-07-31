import { useState, useEffect } from "react";
import appStore from "../services/AppStore";
import { formatCurrency } from "../utils/helpers";

export default function BarcodeScannerModal({ isOpen, onClose }) {
  const [scannedCode, setScannedCode] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setScannedCode("");
      setSearchResult(null);
      setErrorMsg("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSearchCup = (codeToSearch) => {
    const rawInput = (codeToSearch || scannedCode).trim();
    if (!rawInput) {
      setErrorMsg("Vui lòng nhập hoặc quét mã vạch trên ly nước");
      setSearchResult(null);
      return;
    }

    setErrorMsg("");
    const cleanCode = rawInput.toUpperCase().replace(/[^A-Z0-9-]/g, "");

    // Split code: ORD10293-1 => orderIdPart: ORD10293, cupIndex: 1
    const parts = cleanCode.split("-");
    const cupIndexStr = parts.length > 1 ? parts[parts.length - 1] : "1";
    const cupIndex = parseInt(cupIndexStr, 10) || 1;
    const orderIdPart = parts.length > 1 ? parts.slice(0, -1).join("-") : cleanCode;

    const allOrders = appStore.get("orders") || [];

    // Find order matching ID
    const foundOrder = allOrders.find((o) => {
      const oIdClean = String(o.id).toUpperCase().replace(/[^A-Z0-9-]/g, "");
      return oIdClean.includes(orderIdPart) || orderIdPart.includes(oIdClean);
    });

    if (!foundOrder) {
      setErrorMsg(`Không tìm thấy đơn hàng khớp với mã ly: "${rawInput}"`);
      setSearchResult(null);
      return;
    }

    // Expand items into cup list
    const cupList = [];
    const items = Array.isArray(foundOrder.items) ? foundOrder.items : [];

    items.forEach((item) => {
      const qty = Math.max(1, parseInt(item.quantity || 1, 10));
      for (let q = 1; q <= qty; q++) {
        cupList.push({
          name: item.productName || item.name || "Nước uống",
          size: item.size || "",
          toppings: Array.isArray(item.toppings) ? item.toppings : [],
          notes: Array.isArray(item.notes) ? item.notes : [],
          customNote: item.customNote || "",
        });
      }
    });

    const targetCup = cupList[cupIndex - 1] || cupList[0];

    setSearchResult({
      order: foundOrder,
      cupIndex,
      totalCups: cupList.length || 1,
      cup: targetCup,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[150] p-4 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-blue-600 text-white flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2">
              <span>🏷️</span> Quét mã vạch tra cứu ly
            </h3>
            <p className="text-xs text-blue-100 mt-0.5">
              Dùng súng quét mã vạch hoặc nhập mã trên tem ly
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-blue-700 hover:bg-blue-800 text-white font-bold text-lg flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        {/* Input Barcode Section */}
        <div className="p-5 bg-gray-50 border-b border-gray-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearchCup();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              autoFocus
              value={scannedCode}
              onChange={(e) => setScannedCode(e.target.value)}
              placeholder="Nhập hoặc quét mã vạch (VD: ORD10293-1)..."
              className="flex-1 bg-white border border-gray-300 focus:border-blue-500 rounded-2xl px-4 py-3 text-base font-semibold outline-none shadow-sm"
            />
            <button
              type="submit"
              className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-md transition"
            >
              Tra cứu
            </button>
          </form>

          {errorMsg && (
            <p className="text-xs font-semibold text-red-600 mt-2 bg-red-50 p-2 rounded-xl border border-red-100">
              ❌ {errorMsg}
            </p>
          )}
        </div>

        {/* Search Result - CHI TIẾT LY NƯỚC */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {!searchResult ? (
            <div className="text-center py-10 text-gray-400 space-y-2">
              <div className="text-4xl">🏷️</div>
              <p className="text-sm font-medium">
                Vui lòng đặt súng quét mã vạch vào tem trên ly hoặc nhập mã số
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h4 className="text-lg font-bold text-gray-900 uppercase tracking-wide">
                  📋 CHI TIẾT LY NƯỚC (Ly {searchResult.cupIndex}/{searchResult.totalCups})
                </h4>
                <span className="text-xs font-bold px-3 py-1 bg-blue-100 text-blue-700 rounded-full">
                  #{searchResult.order.id}
                </span>
              </div>

              {/* 1. Tên món */}
              <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-100">
                <span className="text-xs font-bold text-blue-800 uppercase tracking-wider block mb-1">
                  🥤 Tên món & Size:
                </span>
                <p className="text-xl font-extrabold text-blue-950">
                  {searchResult.cup?.name} {searchResult.cup?.size ? `(Size ${searchResult.cup.size})` : ""}
                </p>
              </div>

              {/* 2. Topping */}
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">
                  🧋 Topping đi kèm:
                </span>
                {!searchResult.cup?.toppings || searchResult.cup.toppings.length === 0 ? (
                  <p className="text-sm font-medium text-gray-400 italic">Không có topping</p>
                ) : (
                  <div className="space-y-1">
                    {searchResult.cup.toppings.map((t, idx) => (
                      <p key={idx} className="text-sm font-bold text-gray-800">
                        + {t.name || t.productName} (x{t.quantity || 1})
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Ghi chú đặc biệt */}
              <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wider block mb-1">
                  📝 Ghi chú đặc biệt (Pha chế):
                </span>
                {(!searchResult.cup?.notes?.length && !searchResult.cup?.customNote) ? (
                  <p className="text-sm font-medium text-amber-600/70 italic">Không có ghi chú đặc biệt</p>
                ) : (
                  <div className="text-sm font-bold text-amber-900 space-y-1">
                    {searchResult.cup.notes?.length > 0 && (
                      <p>• {searchResult.cup.notes.join(", ")}</p>
                    )}
                    {searchResult.cup.customNote && (
                      <p className="italic">• Ghi chú riêng: "{searchResult.cup.customNote}"</p>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Vị trí trả đồ */}
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block mb-1">
                  📍 Vị trí trả đồ (Bàn / Khách):
                </span>
                <p className="text-lg font-bold text-emerald-950">
                  {searchResult.order.tableName || searchResult.order.tableId || "Khách mang đi"}
                  {searchResult.order.customerName ? ` (${searchResult.order.customerName})` : ""}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-gray-50 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-2xl transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
