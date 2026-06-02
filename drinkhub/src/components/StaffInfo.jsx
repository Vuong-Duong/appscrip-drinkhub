import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import appStore from "../services/AppStore";
import { getTimeElapsed } from "../utils/helpers";

export default function StaffInfo() {
  const navigate = useNavigate();
  const [openShift, setOpenShift] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [elapsedTime, setElapsedTime] = useState("");

  // Fetch ca đang mở từ AppStore
  useEffect(() => {
    const unsubscribe = appStore.subscribe((state) => {
      const shifts = Array.isArray(state.shifts) ? state.shifts : [];
      const current = shifts.find((s) => s.status === "open");
      setOpenShift(current || null);
      setIsLoading(false);
    });

    const initialShifts = appStore.get("shifts") || [];
    const current = initialShifts.find((s) => s.status === "open");
    setOpenShift(current || null);
    setIsLoading(false);

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
        className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6 flex-1 text-left hover:shadow-md hover:border-blue-200 transition-all active:scale-[0.98] cursor-pointer"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold">Quản lý ca</h3>

          {isLoading ? (
            <div className="inline-flex items-center bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-medium">
              Đang tải...
            </div>
          ) : openShift ? (
            <div className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-medium">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Đang mở
            </div>
          ) : (
            <div className="inline-flex items-center bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-medium">
              Chưa mở ca
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="text-sm text-gray-400 text-center py-4">
            Đang tải thông tin ca...
          </div>
        ) : openShift ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <p className="text-xs text-gray-400">Mã ca</p>
              <p className="font-mono text-sm text-gray-700 truncate">
                {openShift.id || "--"}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400">Nhân viên</p>
              <p className="text-sm text-gray-700 truncate">
                {openShift.staffName || "--"}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400">Giờ mở ca</p>
              <p className="text-sm font-medium text-gray-700">
                {new Date(openShift.startTime).toLocaleString("vi-VN")}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400">Thời gian đã mở</p>
              <p className="font-semibold text-green-600 text-lg">
                {elapsedTime}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-gray-400 text-sm">
              Chưa có ca nào đang mở. Bấm vào đây để mở ca mới.
            </p>
          </div>
        )}
      </button>

    </div>
  );
}
