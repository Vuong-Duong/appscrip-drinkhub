import { useNavigate } from "react-router-dom";

const features = [
  { num: "1", title: "Quan ly ca", icon: "⏰", route: "/shift" },
  { num: "2", title: "Bao cao", icon: "📊", route: "/dashboard" },
  { num: "3", title: "Quan ly ket noi", icon: "🔗", route: "/feature/2" },
  { num: "4", title: "Quan ly dat coc", icon: "💰", route: "/feature/4" },
  { num: "5", title: "Phuong thuc thanh toan", icon: "💳", route: "/feature/6" },
  { num: "6", title: "Quan ly may in", icon: "🖨️", route: "/feature/7" },
  { num: "7", title: "Quan ly khu vuc", icon: "🗺️", route: "/khu-vuc" },
  { num: "8", title: "Bao het mon", icon: "🚫", route: "/feature/10" },
  { num: "9", title: "Cau hinh man hinh 2", icon: "🖥️", route: "/feature/11" },
  { num: "10", title: "Nhat ky Order", icon: "📋", route: "/order-history" },
  { num: "11", title: "Xuat ma vach", icon: "🏷️", route: "/feature/14" },
  { num: "12", title: "Quan ly thiet bi", icon: "📟", route: "/feature/16" },
];

export default function FeatureGridMain() {
  const navigate = useNavigate();

  return (
    <div className="mt-8">
      <div className="grid grid-cols-4 gap-4">
        {features.map((item) => (
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
                <p className="text-sm text-gray-400 font-medium">
                  Tinh nang
                </p>

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
