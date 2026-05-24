import { useNavigate } from "react-router-dom";
import { authApi } from "../api/Api";
import {
  clearStoredAuthSession,
  getStoredAuthToken,
  getStoredAuthUser,
} from "../utils/auth";

export default function Header() {
  const navigate = useNavigate();
  const user = getStoredAuthUser();

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
    <header className="fixed top-0 left-0 right-0 z-50 bg-zinc-800 border-b border-zinc-700">
      <div className="max-w-pos mx-auto px-6 h-[68px] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-2xl-white">POS</div>

          <div className="flex flex-col">
            <span className="text-white text-lg font-bold tracking-wide leading-none">
              DrinkHub POS
            </span>

            <div className="flex items-center gap-2 mt-1">
              <span className="text-zinc-300 text-xs">
                {user?.username || "Nhân viên"}{" "}
                {user?.role ? `(${user.role})` : ""}
              </span>

              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />

              <span className="text-green-300 text-[11px] font-medium">
                Online
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="text-orange-400 hover:text-orange-200 active:scale-95 transition-all text-sm font-medium flex items-center gap-2"
        >
          <span>Đăng xuất</span>
        </button>
      </div>
    </header>
  );
}
