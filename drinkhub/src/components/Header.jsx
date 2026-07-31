import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api/Api";
import {
  clearStoredAuthSession,
  getStoredAuthToken,
  getStoredAuthUser,
} from "../utils/auth";
import BarcodeScannerModal from "./BarcodeScannerModal";

export default function Header() {
  const navigate = useNavigate();
  const user = getStoredAuthUser();
  const [showScanner, setShowScanner] = useState(false);
  const isBarcodeEnabled = localStorage.getItem("barcodeEnabled") !== "false";

  const handleLogout = async () => {
    const token = getStoredAuthToken();

    try {
      if (token) {
        await authApi.logout(token);
      }
    } finally {
      clearStoredAuthSession();
      navigate("/login", { replace: true });
    }
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-zinc-800 border-b border-zinc-700">
        <div className="w-full px-3 sm:px-6 h-[60px] sm:h-[68px] flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-lg sm:text-2xl text-white font-bold">POS</div>

            <div className="flex flex-col">
              <span className="text-white text-xs sm:text-lg font-bold tracking-wide leading-none">
                DrinkHub
              </span>

              <div className="flex items-center gap-1 sm:gap-2 mt-0.5">
                <span className="text-zinc-300 text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none">
                  {user?.username || "Nhân viên"}{" "}
                  {user?.role ? `(${user.role})` : ""}
                </span>

                <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-green-400 flex-shrink-0" />

                <span className="text-green-300 text-[9px] sm:text-[11px] font-medium hidden sm:inline">
                  Online
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isBarcodeEnabled && (
              <button
                onClick={() => setShowScanner(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition active:scale-95 shadow-sm cursor-pointer"
                title="Quét mã vạch tra cứu ly"
              >
                <span>🔍</span> Quét mã ly
              </button>
            )}

            <button
              onClick={handleLogout}
              className="text-orange-400 hover:text-orange-200 active:scale-95 transition-all text-[10px] sm:text-sm font-medium whitespace-nowrap"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
      />
    </>
  );
}
