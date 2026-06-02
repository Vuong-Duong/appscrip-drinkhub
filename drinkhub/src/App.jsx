import React, { useEffect, useState } from "react";
import {
  HashRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import HomePage from "./pages/HomePage";
import KhuVucPage from "./pages/KhuVucPage";
import OrderPageInKhuVuc from "./pages/OrderPageInKhuVuc";
import BillSummaryPage from "./pages/BillSummaryPage";
import OrderHistoryPage from "./pages/OrderHistoryPage";
import DashboardPage from "./pages/DashboardPage";
import ShiftManagementPage from "./pages/ShiftManagementPage";
import ShiftDetailPage from "./pages/ShiftDetailPage";
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
import BootstrapService from "./services/BootstrapService";
import appStore from "./services/AppStore";

function ProtectedRoute() {
  const [status, setStatus] = useState(() =>
    getStoredAuthToken() ? "checking" : "unauthenticated"
  );
  const [storeState, setStoreState] = useState(appStore.getState());
  const bootstrapDone = React.useRef(false);

  // Subscribe to AppStore changes
  useEffect(() => {
    const unsubscribe = appStore.subscribe((newState) => {
      setStoreState({ ...newState });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let isMounted = true;
    const token = getStoredAuthToken();

    if (!token) {
      setStatus("unauthenticated");
      return;
    }

    authApi
      .verify(token)
      .then(async (user) => {
        if (!isMounted) return;
        setStoredAuthSession(user);
        appStore.setUser(user);
        setStatus("authenticated");
        
        // Initialize cache-first bootstrap (only once)
        if (!bootstrapDone.current) {
          bootstrapDone.current = true;
          try {
            await BootstrapService.init();
          } catch (e) {
            console.error("Failed to bootstrap data", e);
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          clearStoredAuthSession();
          appStore.setUser(null);
          setStatus("unauthenticated");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []); // Only run once on mount

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-600">
        Đang kiểm tra phiên đăng nhập...
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  // Show a loading screen during first install if data isn't loaded yet
  const hasData = storeState.products && storeState.products.length > 0;
  if (storeState.loading && !hasData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-slate-600">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="font-semibold text-lg">Đang tải dữ liệu lần đầu...</p>
        <p className="text-sm text-gray-400">Ứng dụng đang thiết lập cơ sở dữ liệu ngoại tuyến.</p>
      </div>
    );
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
          <Route path="/bill-summary" element={<BillSummaryPage />} />
          <Route path="/order-history" element={<OrderHistoryPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/shift" element={<ShiftManagementPage />} />
          <Route path="/shift/:shiftId" element={<ShiftDetailPage />} />
          <Route path="/feature/:featureId" element={<FeaturePage />} />
          <Route element={<AdminRoute />}>
            <Route path="/admin/menu" element={<MenuManagementPage />} />
            <Route
              path="/admin/discount"
              element={<DiscountManagementPage />}
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
