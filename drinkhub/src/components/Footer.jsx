import { useNavigate } from "react-router-dom";
import { MapPin, Store } from "lucide-react";

export default function Footer() {
  const navigate = useNavigate();

  const handleAreaNavigation = () => {
    navigate("/khu-vuc");
  };

  const handleStoreNavigation = () => {
    navigate("/");
  };

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 h-16 sm:h-20">
      <div className="flex h-full p-1.5 sm:p-2 gap-1.5 sm:gap-2">
        {/* Left Button - Khu vực */}
        <button
          onClick={handleAreaNavigation}
          className="flex-1 bg-white border border-gray-200 rounded-lg sm:rounded-xl flex flex-col items-center justify-center gap-0.5 sm:gap-1 active:scale-95 transition-transform"
        >
          <MapPin
            size={18}
            className="sm:size-[22px] text-emerald-600"
            strokeWidth={1.8}
          />
          <span className="font-medium text-gray-800 text-[10px] sm:text-xs">
            Khu vực
          </span>
        </button>

        {/* Right Button - Nhà hàng */}
        <button
          onClick={handleStoreNavigation}
          className="flex-1 bg-white border border-gray-200 rounded-lg sm:rounded-xl flex flex-col items-center justify-center gap-0.5 sm:gap-1 active:scale-95 transition-transform"
        >
          <Store
            size={18}
            className="sm:size-[22px] text-rose-600"
            strokeWidth={1.8}
          />
          <span className="font-medium text-gray-800 text-[10px] sm:text-xs">
            Nhà hàng
          </span>
        </button>
      </div>
    </footer>
  );
}
