import { useEffect, useState } from "react";
import { storeApi } from "../api/Api";

export default function StoreInfo() {
  const [storeInfo, setStoreInfo] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    storeApi
      .getStoreInfo()
      .then((data) => {
        if (isMounted) {
          setStoreInfo(data);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.details || err.code || err.message);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const storeName = storeInfo?.STORE_NAME || "Đang tải thông tin quán";
  const address = storeInfo?.ADDRESS || "";
  const storeId = storeInfo?.STORE_ID || "";

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">{storeName}</h2>

          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            {error || address || "Chưa có địa chỉ"}
          </p>
        </div>

        <div className="text-right shrink-0 ml-6">
          <p className="text-[11px] uppercase tracking-wide text-gray-400">
            POS ID
          </p>

          <p className="font-mono text-2xl font-bold text-blue-600 mt-1">
            {storeId || "--"}
          </p>
        </div>
      </div>
    </div>
  );
}
