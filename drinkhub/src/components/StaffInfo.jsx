import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import appStore from "../services/AppStore";
import { getTimeElapsed } from "../utils/helpers";

export default function StaffInfo() {
  const navigate = useNavigate();
  const [openShift, setOpenShift] = useState(() => {
    const initialShifts = appStore.get("shifts") || [];
    return initialShifts.find((s) => s.status === "open") || null;
  });
  const [elapsedTime, setElapsedTime] = useState("");

  // Subscribe để lắng nghe cập nhật shifts
  useEffect(() => {
    const unsubscribe = appStore.subscribe((state) => {
      const shifts = Array.isArray(state.shifts) ? state.shifts : [];
      const updated = shifts.find((s) => s.status === "open");
      setOpenShift(updated || null);
    });

    return unsubscribe;
  }, []);

  // Cập nhật thời gian đã mở ca
  useEffect(() => {
    if (!openShift?.startTime) return;

    const shiftStart = new Date(openShift.startTime);

    const updateElapsed = () => {
      setElapsedTime(getTimeElapsed(shiftStart));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [openShift]);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Quản lý ca - click để vào trang chi tiết */}
      <button
        onClick={() => navigate("/shift")}
        className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-gray-200 p-3 sm:p-6 flex-1 text-left hover:shadow-md hover:border-blue-200 transition-all active:scale-[0.98] cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <div className="flex items-center justify-between mb-3 sm:mb-5">
          <h3 className="text-sm sm:text-lg font-semibold">Quản lý ca</h3>

          {openShift ? (
            <div className="inline-flex items-center gap-1 sm:gap-1.5 bg-green-100 text-green-700 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span className="hidden sm:inline">Đang mở</span>
              <span className="sm:hidden">Mở</span>
            </div>
          ) : (
            <div className="inline-flex items-center bg-gray-100 text-gray-500 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium">
              Chưa mở ca
            </div>
          )}
        </div>

        {openShift ? (
          <div className="grid grid-cols-2 gap-x-2 sm:gap-x-6 gap-y-3 sm:gap-y-5">
            <div>
              <p className="text-[10px] sm:text-xs text-gray-400">Mã ca</p>
              <p className="font-mono text-xs sm:text-sm text-gray-700 truncate">
                {openShift.id || "--"}
              </p>
            </div>

            <div>
              <p className="text-[10px] sm:text-xs text-gray-400">Nhân viên</p>
              <p className="text-xs sm:text-sm text-gray-700 truncate">
                {openShift.staffName || "--"}
              </p>
            </div>

            <div>
              <p className="text-[10px] sm:text-xs text-gray-400">Giờ mở</p>
              <p className="text-xs sm:text-sm font-medium text-gray-700 line-clamp-1">
                {new Date(openShift.startTime).toLocaleString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "2-digit",
                })}
              </p>
            </div>

            <div>
              <p className="text-[10px] sm:text-xs text-gray-400">Thời gian</p>
              <p className="font-semibold text-green-600 text-sm sm:text-lg">
                {elapsedTime}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-3 sm:py-4">
            <p className="text-gray-400 text-xs sm:text-sm">
              Chưa mở ca. Bấm để mở.
            </p>
          </div>
        )}
      </button>
    </div>
  );
}
