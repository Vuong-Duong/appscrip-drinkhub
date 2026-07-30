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
    <div className="mt-8">
      <div className="grid grid-cols-4 gap-4">
        {visibleFeatures.map((item) => (
          <button
            key={item.num}
            onClick={() => navigate(item.route)}
            className="bg-white border border-gray-200 hover:border-blue-300 hover:shadow-md rounded-2xl px-6 py-4 transition-all cursor-pointer group text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 flex items-center justify-center text-4xl bg-gray-100 group-hover:bg-blue-50 rounded-2xl transition">
                {item.icon}
              </div>

              <div className="flex-1">
                <p className="text-sm text-gray-400 font-medium">Tính năng</p>

                <p className="font-semibold text-gray-800 text-base leading-snug mt-1">
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
