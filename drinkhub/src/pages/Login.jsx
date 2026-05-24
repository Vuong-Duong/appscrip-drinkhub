import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Package, User } from "lucide-react";
import { authApi } from "../api/Api";
import {
  clearStoredAuthSession,
  getStoredAuthToken,
  setStoredAuthSession,
} from "../utils/auth";

const getLoginErrorMessage = (err) => {
  const code = err?.code || err?.message || "";

  if (code === "INVALID_CREDENTIALS") {
    return "Sai tên đăng nhập hoặc mật khẩu!";
  }

  if (code === "PERMISSION_DENIED") {
    return "Tài khoản không có quyền truy cập!";
  }

  if (code === "REQUEST_TIMEOUT") {
    return "Kết nối quá lâu, vui lòng thử lại.";
  }

  if (code === "NETWORK_ERROR") {
    return err?.details || "Không kết nối được đến máy chủ.";
  }

  if (code === "GAS_BRIDGE_ERROR" || code === "GAS_NOT_READY") {
    return err?.details || "Lỗi kết nối Apps Script (google.script.run).";
  }

  if (code === "GAS_HTML_RESPONSE" || code === "UNSUPPORTED_HOST") {
    return err?.details || code;
  }

  return err?.details || code || "Đăng nhập thất bại!";
};

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const token = getStoredAuthToken();
    if (!token) return undefined;

    authApi
      .verify(token)
      .then((user) => {
        if (isMounted) {
          setStoredAuthSession(user);
          navigate("/", { replace: true });
        }
      })
      .catch(() => {
        clearStoredAuthSession();
      });

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleLogin = async (event) => {
    event.preventDefault();

    const safeUsername = username.trim();
    const safePassword = password.trim();

    if (!safeUsername || !safePassword) {
      setError("Vui lòng nhập đầy đủ thông tin!");
      triggerShake();
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const user = await authApi.login(safeUsername, safePassword);
      setStoredAuthSession(user);
      navigate("/", { replace: true });
    } catch (err) {
      console.error("[Login] failed:", err);
      setError(getLoginErrorMessage(err));
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100">
      <div
        className={`login-card w-full max-w-md rounded-3xl border border-slate-200 shadow-2xl p-8 bg-white transition-all ${
          shake ? "animate-shake" : ""
        }`}
      >
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg">
            <Package className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800">DrinkHub POS</h1>
          <p className="text-gray-500 mt-2">Đăng nhập để tiếp tục</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 flex items-center gap-3 text-red-600">
            <span className="font-bold">!</span>
            <span className="font-medium">{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-2">
              Tên đăng nhập
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <User size={22} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="input-field w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-slate-300 focus:border-indigo-500 focus:outline-none text-gray-700 font-medium"
                placeholder="Nhập tên đăng nhập..."
                autoComplete="username"
                disabled={isLoading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-2">
              Mật khẩu
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <Lock size={22} />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="input-field w-full pl-12 pr-12 py-4 rounded-2xl border-2 border-slate-300 focus:border-indigo-500 focus:outline-none text-gray-700 font-medium"
                placeholder="Nhập mật khẩu..."
                autoComplete="current-password"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                disabled={isLoading}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-bold text-lg flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-[0.985] transition-all disabled:opacity-70"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Đang đăng nhập...
              </>
            ) : (
              "Đăng nhập"
            )}
          </button>
        </form>
      </div>

      <style>{`
        .input-field {
          transition: all 0.3s ease;
        }
        .input-field:focus {
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.18);
        }
        @keyframes shake {
          0%, 100% {
            transform: translateX(0);
          }
          20%, 60% {
            transform: translateX(-8px);
          }
          40%, 80% {
            transform: translateX(8px);
          }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}
