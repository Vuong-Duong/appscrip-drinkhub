import { useNavigate } from "react-router-dom";

const features = [
  { num: "1", title: "Gop y, ho tro", route: "/feature/1" },
  { num: "2", title: "Quan ly ket noi", route: "/feature/2" },
  { num: "3", title: "Quan ly giao hang", route: "/feature/3" },
  { num: "4", title: "Quan ly dat coc", route: "/feature/4" },
  { num: "5", title: "Cang tin", route: "/feature/5" },
  { num: "6", title: "Phuong thuc thanh toan", route: "/feature/6" },
  { num: "7", title: "Quan ly may in", route: "/feature/7" },
  { num: "8", title: "Quan ly khu vuc", route: "/khu-vuc" },
  { num: "9", title: "Quan ly nguon don", route: "/feature/9" },
  { num: "10", title: "Bao het mon", route: "/feature/10" },
  { num: "11", title: "Cau hinh man hinh 2", route: "/feature/11" },
  { num: "12", title: "Nhat ky Order", route: "/order-history" },
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
              <div className="w-16 h-16 flex items-center justify-center text-2xl font-bold bg-gray-100 group-hover:bg-blue-50 rounded-2xl transition">
                {item.num.padStart(2, "0")}
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
