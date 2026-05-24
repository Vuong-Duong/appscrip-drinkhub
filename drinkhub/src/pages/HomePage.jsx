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
      <main className="flex-1 overflow-y-auto pt-[68px] pb-[90px]">
        <div className="max-w-[1280px] mx-auto px-5 py-4">
          {/* Hero Banner */}
          <div className="relative h-[210px] rounded-3xl overflow-hidden shadow-lg">
            <img
              src="/images/cafe-bg.jpg"
              alt="Cafe background"
              className="absolute inset-0 w-full h-full object-cover"
            />

            <div className="absolute inset-0 bg-gradient-to-r from-blue-950/90 via-blue-900/70 to-transparent" />

            <div className="relative z-10 h-full flex items-center px-10">
              <div>
                <h1 className="text-4xl font-bold text-white leading-tight">
                  GIẢI PHÁP QUẢN LÝ
                  <br />
                  NHÀ HÀNG / CAFÉ / TRÀ SỮA
                </h1>

                <p className="text-blue-100 text-2xl mt-3 font-medium">
                  Thấu hiểu & Đột phá!
                </p>
              </div>
            </div>
          </div>

          {/* Info Section */}
          <div className="grid grid-cols-12 gap-5 mt-5">
            {/* Left */}
            <div className="col-span-6 flex flex-col gap-5">
              {/* Store */}
              <StoreInfo />

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-4 flex-1">
                {/* Sales Program */}
                <button
                  onClick={() => handleAdminNavigate("/admin/discount")}
                  className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm hover:shadow-md active:scale-95 transition-all text-left flex items-center"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center text-2xl">
                      🛍️
                    </div>

                    <div>
                      <p className="text-lg font-semibold text-gray-800">
                        Chương trình
                      </p>

                      <p className="text-sm text-gray-500">bán hàng</p>
                    </div>
                  </div>
                </button>

                {/* Menu */}
                <button
                  onClick={() => handleAdminNavigate("/admin/menu")}
                  className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm hover:shadow-md active:scale-95 transition-all text-left flex items-center"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center text-2xl">
                      🍽️
                    </div>

                    <div>
                      <p className="text-lg font-semibold text-gray-800">
                        Thực đơn
                      </p>

                      <p className="text-sm text-gray-500">quản lý món</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Right */}
            <div className="col-span-6 flex flex-col gap-5">
              {/* Staff */}
              <div className="flex-1">
                <StaffInfo />
              </div>

              {/* Report */}
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-3xl p-6 shadow-sm flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">📈</span>

                  <h3 className="text-lg font-semibold">Báo cáo</h3>
                </div>

                <p className="text-blue-100 text-sm leading-relaxed">
                  Tổng doanh thu, Chương trình khuyến mãi, Nguồn đơn, Mặt hàng
                  bán chạy nhất...
                </p>
              </div>
            </div>
          </div>

          {/* Feature Grid */}
          <div className="mt-5">
            <FeatureGridMain />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
