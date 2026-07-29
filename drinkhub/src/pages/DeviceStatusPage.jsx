import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";

// ── Helpers ──────────────────────────────────────────────────────────────────

const hasApi = (key) => key in navigator;

const guessDeviceType = (device) => {
  const name = (
    device.productName ||
    device.name ||
    device.product ||
    ""
  ).toLowerCase();
  if (/print|receipt|pos|epson|star|bixolon|citizen/i.test(name))
    return { label: "Máy in bill", icon: "🖨️", color: "blue" };
  if (/cash|drawer|apd|ms-cash|okipos/i.test(name))
    return { label: "Két tiền", icon: "💰", color: "emerald" };
  if (/scan|barcode|zebra|honeywell/i.test(name))
    return { label: "Máy quét mã vạch", icon: "🔍", color: "violet" };
  if (/card|reader|pax|verifone|ingenico/i.test(name))
    return { label: "Máy quẹt thẻ", icon: "💳", color: "amber" };
  if (/display|customer|pole/i.test(name))
    return { label: "Màn hình khách hàng", icon: "🖥️", color: "indigo" };
  return { label: "Thiết bị ngoại vi", icon: "📟", color: "gray" };
};

const colorMap = {
  blue: {
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    icon: "bg-blue-100 text-blue-600",
    ring: "ring-blue-200",
  },
  emerald: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: "bg-emerald-100 text-emerald-600",
    ring: "ring-emerald-200",
  },
  violet: {
    badge: "bg-violet-50 text-violet-700 border-violet-200",
    icon: "bg-violet-100 text-violet-600",
    ring: "ring-violet-200",
  },
  amber: {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    icon: "bg-amber-100 text-amber-600",
    ring: "ring-amber-200",
  },
  indigo: {
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
    icon: "bg-indigo-100 text-indigo-600",
    ring: "ring-indigo-200",
  },
  gray: {
    badge: "bg-gray-50 text-gray-700 border-gray-200",
    icon: "bg-gray-100 text-gray-600",
    ring: "ring-gray-200",
  },
};

// ── Scan functions ────────────────────────────────────────────────────────────

const scanUsb = async () => {
  if (!hasApi("usb")) return [];
  try {
    const devices = await navigator.usb.getDevices();
    return devices.map((d) => ({
      id: `usb-${d.vendorId}-${d.productId}`,
      name: d.productName || `USB Device (${d.vendorId}:${d.productId})`,
      type: "USB",
      ...guessDeviceType(d),
      meta: [
        d.manufacturerName && `Hãng: ${d.manufacturerName}`,
        d.serialNumber && `S/N: ${d.serialNumber}`,
        `VID: 0x${d.vendorId.toString(16).toUpperCase().padStart(4, "0")}`,
        `PID: 0x${d.productId.toString(16).toUpperCase().padStart(4, "0")}`,
      ].filter(Boolean),
    }));
  } catch {
    return [];
  }
};

const scanBluetooth = async () => {
  if (!hasApi("bluetooth")) return [];
  try {
    // getDevices() is available in Chrome 85+ with permission
    const devices = await navigator.bluetooth.getDevices?.() ?? [];
    return devices.map((d) => ({
      id: `bt-${d.id}`,
      name: d.name || "Thiết bị Bluetooth không tên",
      type: "Bluetooth",
      ...guessDeviceType(d),
      meta: [`ID: ${d.id}`],
    }));
  } catch {
    return [];
  }
};

const scanSerial = async () => {
  if (!hasApi("serial")) return [];
  try {
    const ports = await navigator.serial.getPorts();
    return ports.map((p, i) => {
      const info = p.getInfo?.() || {};
      const name =
        info.usbVendorId
          ? `Serial Port (VID: 0x${info.usbVendorId.toString(16).toUpperCase()})`
          : `Serial Port ${i + 1}`;
      return {
        id: `serial-${i}`,
        name,
        type: "Serial / RS-232",
        ...guessDeviceType({ productName: name }),
        meta: [
          info.usbVendorId &&
            `VID: 0x${info.usbVendorId.toString(16).toUpperCase().padStart(4, "0")}`,
          info.usbProductId &&
            `PID: 0x${info.usbProductId.toString(16).toUpperCase().padStart(4, "0")}`,
        ].filter(Boolean),
      };
    });
  } catch {
    return [];
  }
};

// ── API support matrix ────────────────────────────────────────────────────────

const API_SUPPORT = [
  {
    key: "usb",
    label: "WebUSB",
    desc: "Phát hiện máy in, két tiền, máy quét qua cổng USB",
    icon: "🔌",
  },
  {
    key: "bluetooth",
    label: "Web Bluetooth",
    desc: "Phát hiện thiết bị Bluetooth đã từng ghép đôi",
    icon: "📶",
  },
  {
    key: "serial",
    label: "Web Serial",
    desc: "Phát hiện thiết bị Serial / RS-232 (máy in nhiệt, két)",
    icon: "🔗",
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function DeviceStatusPage() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scannedAt, setScannedAt] = useState(null);
  const [apiSupport, setApiSupport] = useState({});

  // Check API support on mount
  useEffect(() => {
    setApiSupport({
      usb: hasApi("usb"),
      bluetooth: hasApi("bluetooth"),
      serial: hasApi("serial"),
    });
    runScan();
  }, []);

  const runScan = async () => {
    setScanning(true);
    const [usb, bt, serial] = await Promise.all([
      scanUsb(),
      scanBluetooth(),
      scanSerial(),
    ]);
    setDevices([...usb, ...bt, ...serial]);
    setScannedAt(new Date());
    setScanning(false);
  };

  const formatTime = (d) =>
    d
      ? d.toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : "";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <div className="flex-1 pt-[60px] sm:pt-[68px] p-4 sm:p-6 max-w-5xl mx-auto w-full">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="text-2xl text-gray-500 hover:text-gray-800"
            >
              ←
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                📟 Quản lý thiết bị
              </h1>
              {scannedAt && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Quét lúc {formatTime(scannedAt)}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-2xl transition text-sm"
          >
            {scanning ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Đang quét...
              </>
            ) : (
              <>🔄 Quét lại</>
            )}
          </button>
        </div>

        {/* API support strip */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {API_SUPPORT.map((api) => {
            const supported = apiSupport[api.key];
            return (
              <div
                key={api.key}
                className={`rounded-2xl border p-4 flex items-start gap-3 ${
                  supported
                    ? "bg-white border-gray-100"
                    : "bg-gray-50 border-dashed border-gray-200"
                }`}
              >
                <span className="text-2xl">{api.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-800">
                      {api.label}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        supported
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-red-50 text-red-600 border-red-200"
                      }`}
                    >
                      {supported ? "Hỗ trợ" : "Không hỗ trợ"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 leading-snug">
                    {api.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Device list */}
        {scanning && devices.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            Đang quét thiết bị kết nối...
          </div>
        ) : devices.length === 0 ? (
          <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-12 text-center">
            <p className="text-4xl mb-3">🔌</p>
            <p className="text-gray-500 font-medium">
              Không tìm thấy thiết bị nào đang kết nối
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Cắm thiết bị vào máy rồi nhấn{" "}
              <strong className="text-blue-600">Quét lại</strong>.
              <br />
              Nếu trình duyệt chưa cấp quyền, hãy bấm cho phép khi được hỏi.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-3 font-medium">
              Tìm thấy{" "}
              <span className="text-blue-600 font-bold">{devices.length}</span>{" "}
              thiết bị đang kết nối
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {devices.map((device) => {
                const c = colorMap[device.color] || colorMap.gray;
                return (
                  <div
                    key={device.id}
                    className={`bg-white rounded-3xl border border-gray-100 p-5 flex items-start gap-4 shadow-sm ring-1 ${c.ring}`}
                  >
                    <div
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${c.icon}`}
                    >
                      {device.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-gray-900 text-sm leading-snug">
                          {device.name}
                        </span>
                        {/* connected dot */}
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                          Đã kết nối
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.badge}`}
                        >
                          {device.label}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-gray-50 text-gray-500 border-gray-200">
                          {device.type}
                        </span>
                      </div>
                      {device.meta?.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {device.meta.map((m, i) => (
                            <li
                              key={i}
                              className="text-[11px] text-gray-400 font-mono"
                            >
                              {m}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Note */}
        <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-700">
          <strong>Lưu ý:</strong> Chỉ các thiết bị đã được{" "}
          <em>cấp quyền truy cập trước đó</em> mới hiển thị ở đây (USB, Serial,
          Bluetooth). Nếu thiết bị không xuất hiện, hãy cắm lại rồi nhấn{" "}
          <strong>Quét lại</strong> và cho phép quyền khi trình duyệt hỏi.
        </div>
      </div>
    </div>
  );
}
