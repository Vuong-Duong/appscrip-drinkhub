import React from "react";

/**
 * ConfirmDeleteModal Component
 * Reusable Confirmation Dialog for deletion operations across the application
 */
export default function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Xác nhận xóa",
  message = "Bạn có chắc chắn muốn xóa mục này không? Hành động này không thể hoàn tác.",
  isLoading = false,
  error = "",
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-gray-100 transform transition-all">
        {/* Header */}
        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-2xl font-bold shrink-0">
            ⚠️
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">{title}</h3>
            <p className="text-xs text-red-500 font-semibold">Hành động này không thể hoàn tác</p>
          </div>
        </div>

        {/* Message */}
        <p className="text-gray-600 text-sm leading-relaxed mb-5">
          {message}
        </p>

        {/* Error notification if any */}
        {error && (
          <div className="mb-5 bg-red-50 border border-red-200 text-red-700 p-3 rounded-2xl text-xs font-medium flex items-center gap-2">
            <span>❌</span>
            <span>{error}</span>
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-5 py-2.5 rounded-2xl font-semibold text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 transition cursor-pointer disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="px-5 py-2.5 rounded-2xl font-bold text-sm bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-200 transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Đang xóa...</span>
              </>
            ) : (
              <span>Xóa</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
