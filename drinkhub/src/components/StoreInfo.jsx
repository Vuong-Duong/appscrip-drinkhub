import { useEffect, useState } from "react";
import appStore from "../services/AppStore";

export default function StoreInfo() {
  const [storeInfo, setStoreInfo] = useState(() => appStore.get("settings") || {});

  useEffect(() => {
    const unsubscribe = appStore.subscribe((state) => {
      setStoreInfo(state.settings || {});
    });
    return unsubscribe;
  }, []);

  const storeName = storeInfo?.STORE_NAME || "DrinkHub - Quán Nước";
  const address = storeInfo?.ADDRESS || "";
  const storeId = storeInfo?.STORE_ID || "";

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">{storeName}</h2>

          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            {address || "Chưa có địa chỉ"}
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
