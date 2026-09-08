import React, { useEffect } from "react";

/**
 * AccessDeniedModal Component
 * Friendly popup shown when a staff member tries to access an admin-only page.
 *
 * Props:
 *  - isOpen {boolean}
 *  - onClose {() => void}  called when user clicks OK or presses Escape
 *  - featureName {string}  optional label for the restricted feature
 */
export default function AccessDeniedModal({ isOpen, onClose, featureName = "" }) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl border border-gray-100"
        style={{ animation: "modalPop 0.25s cubic-bezier(0.34,1.56,0.64,1) both" }}
      >
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-lg"
            style={{
              background: "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)",
            }}
          >
            🔒
          </div>
        </div>

        {/* Title */}
        <h3 className="text-xl font-extrabold text-gray-900 text-center mb-2">
          Không có quyền truy cập
        </h3>

        {/* Subtitle */}
        <p className="text-sm text-gray-500 text-center leading-relaxed mb-6">
          {featureName ? (
            <>
              Tính năng{" "}
              <span className="font-semibold text-red-600">
                &ldquo;{featureName}&rdquo;
              </span>{" "}
              chỉ dành cho tài khoản{" "}
              <span className="font-semibold text-gray-800">Admin</span>.
            </>
          ) : (
            <>
              Tính năng này chỉ dành cho tài khoản{" "}
              <span className="font-semibold text-gray-800">Admin</span>. Vui
              lòng liên hệ quản lý để được cấp quyền.
            </>
          )}
        </p>

        {/* Badge */}
        <div className="flex justify-center mb-6">
          <span className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-full px-4 py-1.5">
            <span>⛔</span>
            <span>Nhân viên – không đủ quyền</span>
          </span>
        </div>

        {/* OK Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-2xl font-bold text-white text-sm transition-all active:scale-95"
          style={{
            background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
            boxShadow: "0 4px 14px rgba(239,68,68,0.35)",
          }}
        >
          Đã hiểu
        </button>
      </div>

      <style>{`
        @keyframes modalPop {
          from { opacity: 0; transform: scale(0.85) translateY(20px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
