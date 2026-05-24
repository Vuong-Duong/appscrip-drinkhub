import { useEffect, useState } from "react";
import {
  HashRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import HomePage from "./pages/HomePage";
import KhuVucPage from "./pages/KhuVucPage";
import OrderPageInKhuVuc from "./pages/OrderPageInKhuVuc";
import OrderHistoryPage from "./pages/OrderHistoryPage";
import Login from "./pages/Login";
import FeaturePage from "./pages/FeaturePage";
import MenuManagementPage from "./pages/MenuManagementPage";
import DiscountManagementPage from "./pages/DiscountManagementPage";
import { authApi } from "./api/Api";
import {
  clearStoredAuthSession,
  getStoredAuthUser,
  getStoredAuthToken,
  setStoredAuthSession,
} from "./utils/auth";

function ProtectedRoute() {
  const location = useLocation();
  const [status, setStatus] = useState(() =>
    getStoredAuthToken() ? "checking" : "unauthenticated",
  );

  useEffect(() => {
    let isMounted = true;
    const token = getStoredAuthToken();

    if (!token) {
      return undefined;
    }

    authApi
      .verify(token)
      .then((user) => {
        if (isMounted) {
          setStoredAuthSession(user);
          setStatus("authenticated");
        }
      })
      .catch(() => {
        if (isMounted) {
          clearStoredAuthSession();
          setStatus("unauthenticated");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [location.pathname]);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-600">
        Đang kiểm tra phiên đăng nhập...
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

function AdminRoute() {
  const user = getStoredAuthUser();
  if (user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/khu-vuc" element={<KhuVucPage />} />
          <Route path="/order/:tableId" element={<OrderPageInKhuVuc />} />
          <Route path="/order-history" element={<OrderHistoryPage />} />
          <Route path="/feature/:featureId" element={<FeaturePage />} />
          <Route element={<AdminRoute />}>
            <Route path="/admin/menu" element={<MenuManagementPage />} />
            <Route path="/admin/discount" element={<DiscountManagementPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
