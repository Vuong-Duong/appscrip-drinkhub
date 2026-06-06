import Header from "../components/Header";
import Footer from "../components/Footer";
import StoreInfo from "../components/StoreInfo";
import StaffInfo from "../components/StaffInfo";
import FeatureGridMain from "../components/FeatureGridMain";
import { useNavigate } from "react-router-dom";
import { getStoredAuthUser } from "../utils/auth";

export default function HomePage() {
  const navigate = useNavigate();
  const user = getStoredAuthUser();

  const handleAdminNavigate = (route) => {
    if (user?.role !== "admin") {
      alert("Chi tai khoan Admin moi co quyen truy cap tinh nang nay!");
      return;
    }
    navigate(route);
  };

  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      <Header />

      {/* Scroll Area */}
      <main className="flex-1 overflow-y-auto pt-[60px] sm:pt-[68px] pb-16 sm:pb-[90px]">
        <div className="w-full max-w-[1280px] mx-auto px-3 sm:px-5 py-2 sm:py-4">
          {/* Hero Banner */}
          <div className="relative h-[140px] sm:h-[210px] rounded-2xl sm:rounded-3xl overflow-hidden shadow-lg">
            <img
              src="https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80"
              alt="Cafe background"
              className="absolute inset-0 w-full h-full object-cover"
            />

            <div className="absolute inset-0 bg-gradient-to-r from-blue-950/90 via-blue-900/70 to-transparent" />

            <div className="relative z-10 h-full flex items-center px-4 sm:px-10">
              <div>
                <h1 className="text-2xl sm:text-4xl font-bold text-white leading-tight">
                  GIẢI PHÁP
                  <br />
                  QUẢN LÝ
                </h1>

                <p className="text-blue-100 text-base sm:text-2xl mt-2 sm:mt-3 font-medium">
                  Thấu hiểu & Đột phá!
                </p>
              </div>
            </div>
          </div>

          {/* Info Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5 mt-3 sm:mt-5">
            {/* Left */}
            <div className="flex flex-col gap-3 sm:gap-5">
              {/* Store */}
              <StoreInfo />

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-2 sm:gap-4 flex-1">
                {/* Sales Program */}
                <button
                  onClick={() => handleAdminNavigate("/admin/discount")}
                  className="bg-white border border-gray-200 rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-sm hover:shadow-md active:scale-95 transition-all text-left flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-4"
                >
                  <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-orange-100 flex items-center justify-center text-xl sm:text-2xl flex-shrink-0">
                    🛍️
                  </div>

                  <div className="text-center sm:text-left">
                    <p className="text-sm sm:text-lg font-semibold text-gray-800">
                      Chương trình
                    </p>

                    <p className="text-xs sm:text-sm text-gray-500">bán hàng</p>
                  </div>
                </button>

                {/* Menu */}
                <button
                  onClick={() => handleAdminNavigate("/admin/menu")}
                  className="bg-white border border-gray-200 rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-sm hover:shadow-md active:scale-95 transition-all text-left flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-4"
                >
                  <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-emerald-100 flex items-center justify-center text-xl sm:text-2xl flex-shrink-0">
                    🍽️
                  </div>

                  <div className="text-center sm:text-left">
                    <p className="text-sm sm:text-lg font-semibold text-gray-800">
                      Thực đơn
                    </p>

                    <p className="text-xs sm:text-sm text-gray-500">
                      quản lý món
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Right */}
            <div className="flex flex-col gap-3 sm:gap-5">
              {/* Staff */}
              <div className="flex-1">
                <StaffInfo />
              </div>

              {/* Report */}
              <button
                onClick={() => navigate("/dashboard")}
                className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm flex-1 text-left hover:opacity-95 transition cursor-pointer"
              >
                <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                  <span className="text-2xl sm:text-3xl">📈</span>

                  <h3 className="text-sm sm:text-lg font-semibold">Báo cáo</h3>
                </div>

                <p className="text-blue-100 text-xs sm:text-sm leading-relaxed">
                  Doanh thu, Khuyến mãi, Mặt hàng bán chạy...
                </p>
              </button>
            </div>
          </div>

          {/* Feature Grid */}
          <div className="mt-3 sm:mt-5">
            <FeatureGridMain />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
