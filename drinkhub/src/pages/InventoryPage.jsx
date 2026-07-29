import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { inventoryApi } from "../api/Api";

export default function InventoryPage() {
  const navigate = useNavigate();

  // Active Tab: "import" | "history"
  const [activeTab, setActiveTab] = useState("import");

  // Ingredients Data
  const [ingredients, setIngredients] = useState([]);
  const [loadingIngredients, setLoadingIngredients] = useState(true);
  const [search, setSearch] = useState("");

  // Import Inputs: { [ingredientId]: "10" }
  const [importInputs, setImportInputs] = useState({});
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);

  // New Ingredient Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newIngredient, setNewIngredient] = useState({
    name: "",
    unit: "kg",
    quantity: "0",
    note: "",
  });
  const [addError, setAddError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Stocktake Modal
  const [stocktakeTarget, setStocktakeTarget] = useState(null); // ingredient object
  const [actualQuantityInput, setActualQuantityInput] = useState("");
  const [stocktakeNote, setStocktakeNote] = useState("");
  const [stocktakeError, setStocktakeError] = useState("");
  const [isSubmittingStocktake, setIsSubmittingStocktake] = useState(false);

  // History Data & Filters
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [timeFilter, setTimeFilter] = useState("today");
  const [ingredientFilter, setIngredientFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Toast
  const [toast, setToast] = useState({ isOpen: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ isOpen: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, isOpen: false }));
    }, 3000);
  };

  // Load Ingredients
  const fetchIngredients = async () => {
    try {
      setLoadingIngredients(true);
      const data = await inventoryApi.getIngredients();
      setIngredients(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast(err.message || "Không thể tải danh sách nguyên liệu", "error");
    } finally {
      setLoadingIngredients(false);
    }
  };

  // Load History
  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const filters = {
        range: timeFilter,
        ingredientId: ingredientFilter === "all" ? "" : ingredientFilter,
        customStart: timeFilter === "custom" ? customStart : null,
        customEnd: timeFilter === "custom" ? customEnd : null,
      };
      const data = await inventoryApi.getInventoryHistory(filters);
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast(err.message || "Không thể tải lịch sử kho", "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchIngredients();
  }, []);

  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
    }
  }, [activeTab, timeFilter, ingredientFilter, customStart, customEnd]);

  // Filtered ingredients
  const filteredIngredients = useMemo(() => {
    return ingredients.filter(
      (item) =>
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.unit.toLowerCase().includes(search.toLowerCase()),
    );
  }, [ingredients, search]);

  // Handle Input Change for Import
  const handleImportInputChange = (id, val) => {
    setImportInputs((prev) => ({
      ...prev,
      [id]: val,
    }));
  };

  // Submit Batch Import
  const handleConfirmImport = async () => {
    const itemsToImport = [];

    Object.keys(importInputs).forEach((id) => {
      const valStr = importInputs[id];
      if (valStr && valStr.trim() !== "") {
        const qty = parseFloat(valStr);
        if (!isNaN(qty) && qty > 0) {
          itemsToImport.push({
            ingredientId: id,
            quantity: qty,
          });
        }
      }
    });

    if (itemsToImport.length === 0) {
      showToast("Vui lòng nhập số lượng > 0 cho ít nhất 1 nguyên liệu!", "error");
      return;
    }

    try {
      setIsSubmittingImport(true);
      await inventoryApi.addInventory(itemsToImport);
      showToast(`Đã nhập thêm cho ${itemsToImport.length} nguyên liệu thành công!`);
      setImportInputs({});
      await fetchIngredients();
    } catch (err) {
      showToast(err.message || "Nhập hàng thất bại", "error");
    } finally {
      setIsSubmittingImport(false);
    }
  };

  // Create Ingredient
  const handleCreateIngredient = async (e) => {
    e.preventDefault();
    const name = newIngredient.name.trim();
    const unit = newIngredient.unit.trim();
    const qty = parseFloat(newIngredient.quantity) || 0;

    if (!name) {
      setAddError("Tên nguyên liệu không được để trống");
      return;
    }
    if (!unit) {
      setAddError("Đơn vị tính không được để trống");
      return;
    }

    try {
      setIsCreating(true);
      setAddError("");
      await inventoryApi.createIngredient({
        name,
        unit,
        quantity: qty,
        note: newIngredient.note.trim(),
      });
      showToast(`Đã thêm nguyên liệu "${name}"!`);
      setShowAddModal(false);
      setNewIngredient({ name: "", unit: "kg", quantity: "0", note: "" });
      await fetchIngredients();
    } catch (err) {
      setAddError(err.message || "Tạo nguyên liệu thất bại");
    } finally {
      setIsCreating(false);
    }
  };

  // Open Stocktake Modal
  const openStocktakeModal = (ing) => {
    setStocktakeTarget(ing);
    setActualQuantityInput(String(ing.quantity || 0));
    setStocktakeNote("");
    setStocktakeError("");
  };

  // Submit Stocktake
  const handleConfirmStocktake = async () => {
    if (!stocktakeTarget) return;
    const actualQty = parseFloat(actualQuantityInput);

    if (isNaN(actualQty) || actualQty < 0) {
      setStocktakeError("Số lượng thực tế không được nhỏ hơn 0");
      return;
    }

    try {
      setIsSubmittingStocktake(true);
      setStocktakeError("");
      await inventoryApi.stocktakeInventory({
        ingredientId: stocktakeTarget.id,
        actualQuantity: actualQty,
      });
      showToast(`Đã cập nhật tồn thực tế cho "${stocktakeTarget.name}" thành ${actualQty} ${stocktakeTarget.unit}`);
      setStocktakeTarget(null);
      await fetchIngredients();
    } catch (err) {
      setStocktakeError(err.message || "Kiểm kê thất bại");
    } finally {
      setIsSubmittingStocktake(false);
    }
  };

  // Format Helper
  const formatDate = (isoStr) => {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const hours = String(d.getHours()).padStart(2, "0");
      const mins = String(d.getMinutes()).padStart(2, "0");
      return `${day}/${month} ${hours}:${mins}`;
    } catch {
      return isoStr;
    }
  };

  const renderBadgeType = (type) => {
    switch (type) {
      case "IMPORT":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700">
            ➕ Nhập thêm
          </span>
        );
      case "STOCKTAKE":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-700">
            📋 Kiểm kê
          </span>
        );
      case "ADJUSTMENT":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-700">
            ⚙️ Điều chỉnh
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-700">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="flex-1 overflow-y-auto pt-[60px] sm:pt-20 px-3 sm:px-6 max-w-6xl mx-auto pb-12 w-full">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="text-3xl text-gray-600 hover:text-gray-900 transition"
            >
              &larr;
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                📦 Quản lý kho nguyên liệu
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Theo dõi tồn kho nguyên liệu, nhập hàng và kiểm kê thực tế
              </p>
            </div>
          </div>

          {/* 2 Tabs */}
          <div className="flex bg-gray-200 p-1 rounded-2xl w-full sm:w-auto">
            <button
              onClick={() => setActiveTab("import")}
              className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                activeTab === "import"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              📦 Nhập hàng & Tồn kho
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                activeTab === "history"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              📜 Lịch sử thay đổi
            </button>
          </div>
        </div>

        {/* TAB 1: NHẬP HÀNG */}
        {activeTab === "import" && (
          <div className="space-y-6">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <div className="relative w-full sm:w-80">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm nguyên liệu theo tên, đơn vị..."
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-100 border border-transparent focus:border-blue-500 focus:bg-white rounded-xl outline-none text-sm font-medium transition"
                />
                <span className="absolute left-3.5 top-3 text-gray-400">🔍</span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold text-sm transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  ＋ Thêm nguyên liệu mới
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={isSubmittingImport}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition shadow-sm active:scale-95 disabled:bg-gray-300 flex items-center gap-2 cursor-pointer"
                >
                  {isSubmittingImport ? "Đang xử lý..." : "✓ Xác nhận nhập hàng"}
                </button>
              </div>
            </div>

            {/* Ingredients Table */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              {loadingIngredients ? (
                <div className="p-12 text-center text-gray-500">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                  Đang tải danh sách nguyên liệu...
                </div>
              ) : filteredIngredients.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <p className="text-lg font-bold">Chưa có nguyên liệu nào</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Bấm "Thêm nguyên liệu mới" để khởi tạo danh mục nguyên liệu.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <th className="py-4 px-6">Tên nguyên liệu</th>
                        <th className="py-4 px-6">Đơn vị</th>
                        <th className="py-4 px-6">Tồn hiện tại</th>
                        <th className="py-4 px-6 text-center">Số lượng nhập thêm</th>
                        <th className="py-4 px-6 text-right">Kiểm kê thực tế</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm font-medium text-gray-800">
                      {filteredIngredients.map((item) => (
                        <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                          <td className="py-4 px-6 font-bold text-gray-900">
                            {item.name}
                            {item.note && (
                              <p className="text-xs font-normal text-gray-400 mt-0.5">
                                {item.note}
                              </p>
                            )}
                          </td>
                          <td className="py-4 px-6 text-gray-600 font-semibold">
                            {item.unit}
                          </td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center px-3 py-1 rounded-xl text-base font-bold bg-slate-100 text-slate-800">
                              {item.quantity} <span className="text-xs font-medium text-gray-500 ml-1">{item.unit}</span>
                            </span>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <div className="inline-flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={importInputs[item.id] || ""}
                                onChange={(e) =>
                                  handleImportInputChange(item.id, e.target.value)
                                }
                                placeholder="0"
                                className="w-28 px-3 py-2 border-2 border-gray-200 focus:border-blue-500 rounded-xl outline-none text-center font-bold text-base bg-gray-50 focus:bg-white transition"
                              />
                            </div>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <button
                              onClick={() => openStocktakeModal(item)}
                              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                            >
                              📋 Kiểm kê / Chỉnh tồn
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: LỊCH SỬ THAY ĐỔI */}
        {activeTab === "history" && (
          <div className="space-y-6">
            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Time Filter */}
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">
                    Thời gian
                  </label>
                  <select
                    value={timeFilter}
                    onChange={(e) => setTimeFilter(e.target.value)}
                    className="px-3 py-2 bg-gray-100 border border-transparent focus:border-blue-500 rounded-xl font-bold text-sm outline-none"
                  >
                    <option value="today">Hôm nay</option>
                    <option value="yesterday">Hôm qua</option>
                    <option value="7days">Tuần này (7 ngày)</option>
                    <option value="30days">Tháng này (30 ngày)</option>
                    <option value="thisMonth">Tháng hiện tại</option>
                    <option value="lastMonth">Tháng trước</option>
                    <option value="all">Tất cả thời gian</option>
                    <option value="custom">Tùy chỉnh ngày</option>
                  </select>
                </div>

                {/* Ingredient Filter */}
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">
                    Nguyên liệu
                  </label>
                  <select
                    value={ingredientFilter}
                    onChange={(e) => setIngredientFilter(e.target.value)}
                    className="px-3 py-2 bg-gray-100 border border-transparent focus:border-blue-500 rounded-xl font-bold text-sm outline-none"
                  >
                    <option value="all">Tất cả nguyên liệu</option>
                    {ingredients.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name} ({ing.unit})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Custom Date Inputs if Range = Custom */}
              {timeFilter === "custom" && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="px-3 py-2 border rounded-xl text-sm font-semibold outline-none"
                  />
                  <span className="text-gray-400">&rarr;</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="px-3 py-2 border rounded-xl text-sm font-semibold outline-none"
                  />
                </div>
              )}
            </div>

            {/* History Table */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              {loadingHistory ? (
                <div className="p-12 text-center text-gray-500">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                  Đang tải lịch sử kho...
                </div>
              ) : history.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <p className="text-lg font-bold">Không có lịch sử biến động nào</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Thử chọn khoảng thời gian khác hoặc nguyên liệu khác.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <th className="py-4 px-6">Thời gian</th>
                        <th className="py-4 px-6">Nguyên liệu</th>
                        <th className="py-4 px-6">Loại thay đổi</th>
                        <th className="py-4 px-6 text-right">Số lượng biến động</th>
                        <th className="py-4 px-6 text-right">Tồn trước → Tồn sau</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm font-medium text-gray-800">
                      {history.map((record) => (
                        <tr key={record.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-4 px-6 text-gray-500 font-semibold text-xs whitespace-nowrap">
                            {formatDate(record.createdAt)}
                          </td>
                          <td className="py-4 px-6 font-bold text-gray-900">
                            {record.ingredientName}
                          </td>
                          <td className="py-4 px-6">
                            {renderBadgeType(record.type)}
                          </td>
                          <td className="py-4 px-6 text-right font-bold">
                            <span
                              className={
                                record.quantity >= 0
                                  ? "text-emerald-600"
                                  : "text-amber-600"
                              }
                            >
                              {record.quantity >= 0 ? `+${record.quantity}` : record.quantity}{" "}
                              <span className="text-xs font-normal text-gray-500">
                                {record.unit}
                              </span>
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right font-bold text-gray-700 whitespace-nowrap">
                            <span className="text-gray-400 font-normal">
                              {record.beforeQuantity}
                            </span>{" "}
                            &rarr;{" "}
                            <span className="text-blue-600">
                              {record.afterQuantity}
                            </span>{" "}
                            <span className="text-xs font-normal text-gray-400">
                              {record.unit}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <Footer />

      {/* MODAL THÊM NGUYÊN LIỆU MỚI */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">
                ＋ Thêm nguyên liệu mới
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateIngredient} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">
                  Tên nguyên liệu <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newIngredient.name}
                  onChange={(e) =>
                    setNewIngredient((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Ví dụ: Trà đen, Đường, Sữa đặc..."
                  className="w-full px-4 py-3 border border-gray-200 focus:border-blue-500 rounded-xl outline-none font-semibold text-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase mb-1">
                    Đơn vị tính <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newIngredient.unit}
                    onChange={(e) =>
                      setNewIngredient((prev) => ({ ...prev, unit: e.target.value }))
                    }
                    className="w-full px-4 py-3 border border-gray-200 focus:border-blue-500 rounded-xl outline-none font-semibold text-base bg-white"
                  >
                    <option value="kg">kg</option>
                    <option value="gam">gam</option>
                    <option value="lon">lon</option>
                    <option value="hộp">hộp</option>
                    <option value="túi">túi</option>
                    <option value="chai">chai</option>
                    <option value="lít">lít</option>
                    <option value="ml">ml</option>
                    <option value="gói">gói</option>
                    <option value="thùng">thùng</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase mb-1">
                    Tồn ban đầu
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newIngredient.quantity}
                    onChange={(e) =>
                      setNewIngredient((prev) => ({
                        ...prev,
                        quantity: e.target.value,
                      }))
                    }
                    placeholder="0"
                    className="w-full px-4 py-3 border border-gray-200 focus:border-blue-500 rounded-xl outline-none font-bold text-base"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">
                  Ghi chú
                </label>
                <input
                  type="text"
                  value={newIngredient.note}
                  onChange={(e) =>
                    setNewIngredient((prev) => ({ ...prev, note: e.target.value }))
                  }
                  placeholder="Loại 1, bảo quản ngăn mát..."
                  className="w-full px-4 py-3 border border-gray-200 focus:border-blue-500 rounded-xl outline-none font-medium text-sm"
                />
              </div>

              {addError && (
                <p className="text-sm font-semibold text-red-600">{addError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-md disabled:bg-gray-300 cursor-pointer"
                >
                  {isCreating ? "Đang tạo..." : "Lưu nguyên liệu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KIỂM KÊ THỰC TẾ */}
      {stocktakeTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                📋 Kiểm kê thực tế
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Nguyên liệu: <strong className="text-gray-800">{stocktakeTarget.name}</strong>
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-blue-800">Tồn kho hệ thống:</span>
                <span className="text-lg font-bold text-blue-900">
                  {stocktakeTarget.quantity} {stocktakeTarget.unit}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">
                  Số lượng kiểm kê thực tế <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    autoFocus
                    value={actualQuantityInput}
                    onChange={(e) => setActualQuantityInput(e.target.value)}
                    placeholder="Nhập số lượng thực tế..."
                    className="w-full px-4 py-3 border-2 border-blue-500 rounded-xl outline-none font-bold text-xl text-blue-900 bg-white"
                  />
                  <span className="font-bold text-gray-600 text-lg">{stocktakeTarget.unit}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Hệ thống sẽ cập nhật số lượng tồn thành con số này và ghi lịch sử chênh lệch.
                </p>
              </div>

              {stocktakeError && (
                <p className="text-sm font-semibold text-red-600">{stocktakeError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStocktakeTarget(null)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleConfirmStocktake}
                  disabled={isSubmittingStocktake}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition shadow-md disabled:bg-gray-300 cursor-pointer"
                >
                  {isSubmittingStocktake ? "Đang lưu..." : "Xác nhận kiểm kê"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
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
