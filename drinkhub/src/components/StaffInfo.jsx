import { useEffect, useState } from "react";
import { getTimeElapsed } from "../utils/helpers";

export default function StaffInfo() {
  const [shiftStartTime] = useState(() => new Date());
  const [elapsedTime, setElapsedTime] = useState("");

  useEffect(() => {
    const updateElapsed = () => {
      setElapsedTime(getTimeElapsed(shiftStartTime));
    };

    updateElapsed();

    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [shiftStartTime]);

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6 h-full">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold">Quản lý ca</h3>

        <div className="inline-flex items-center bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-medium">
          Đang mở
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        <div>
          <p className="text-xs text-gray-400">Mã ca</p>

          <p className="font-mono text-sm text-gray-700 truncate">--</p>
        </div>

        <div>
          <p className="text-xs text-gray-400">Tài khoản</p>

          <p className="text-sm text-gray-700 truncate">Chưa đăng nhập</p>
        </div>

        <div>
          <p className="text-xs text-gray-400">Giờ mở ca</p>

          <p className="text-sm font-medium text-gray-700">
            {shiftStartTime.toLocaleString("vi-VN")}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-400">Thời gian đã mở</p>

          <p className="font-semibold text-green-600 text-lg">{elapsedTime}</p>
        </div>
      </div>
    </div>
  );
}
