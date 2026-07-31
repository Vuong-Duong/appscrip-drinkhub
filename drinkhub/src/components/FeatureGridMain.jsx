import { useNavigate } from "react-router-dom";
import { getStoredAuthUser } from "../utils/auth";

const features = [
  { num: "1", title: "Quản lý ca", icon: "⏰", route: "/shift" },
  { num: "2", title: "Báo cáo", icon: "📊", route: "/dashboard" },
  {
    num: "5",
    title: "Phương thức thanh toán",
    icon: "💳",
    route: "/feature/6",
  },
  { num: "7", title: "Quản lý khu vực", icon: "🗺️", route: "/khu-vuc" },
  { num: "8", title: "Báo hết món", icon: "🚫", route: "/feature/10" },
  { num: "10", title: "Nhật ký Order", icon: "📋", route: "/order-history" },
  { num: "11", title: "Xuất mã vạch", icon: "🏷️", route: "/feature/14" },
  { num: "12", title: "Quản lý thiết bị", icon: "📟", route: "/device-status" },
  // { num: "13", title: "Kho nguyên liệu", icon: "📦", route: "/inventory" },
  { num: "14", title: "Đối chiếu két tiền", icon: "🔍", route: "/shift-reconciliation" },
];

export default function FeatureGridMain() {
  const navigate = useNavigate();
  const user = getStoredAuthUser();
  const isAdmin = user?.role === "admin";

  const visibleFeatures = features.filter((item) => {
    const adminOnlyItems = ["2", "5", "11", "12", "13", "14"];
    return isAdmin || !adminOnlyItems.includes(item.num);
  });

  return (
    <div className="mt-4 sm:mt-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
        {visibleFeatures.map((item) => (
          <button
            key={item.num}
            onClick={() => navigate(item.route)}
            className="bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md rounded-2xl p-3 sm:p-5 transition-all cursor-pointer group text-left active:scale-95 shadow-xs"
          >
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-14 sm:h-14 shrink-0 flex items-center justify-center text-2xl sm:text-3xl bg-blue-50/70 group-hover:bg-blue-100 rounded-2xl transition">
                {item.icon}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[10px] sm:text-xs text-gray-400 font-semibold uppercase tracking-wider hidden sm:block">
                  Tính năng
                </p>

                <p className="font-bold text-gray-800 text-xs sm:text-base leading-tight mt-0.5 group-hover:text-blue-600 line-clamp-2">
                  {item.title}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
