import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import appStore from "../services/AppStore";
import { formatCurrency, getDirectImageUrl } from "../utils/helpers";

// --- Pre-connect to VietQR at module load (before React even mounts) ---
try {
  if (typeof document !== "undefined") {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = "https://img.vietqr.io";
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);

    const dnsPrefetch = document.createElement("link");
    dnsPrefetch.rel = "dns-prefetch";
    dnsPrefetch.href = "https://img.vietqr.io";
    document.head.appendChild(dnsPrefetch);
  }
} catch (e) {
  // Silently ignore - CSP may block this in some environments
}

const DEFAULT_SLIDES = [
  {
    name: "Trà Đào Hồng Đài",
    category: "Trà trái cây",
    price: 35000,
    description: "Trà đào thơm ngát kết hợp cùng miếng đào giòn ngọt và thạch đào thanh mát.",
  },
  {
    name: "Cà Phê Muối DrinkHub",
    category: "Cà phê",
    price: 29000,
    description: "Hương vị cà phê phin đậm đà hòa quyện cùng lớp kem muối béo ngậy mặn nhẹ.",
  },
  {
    name: "Matcha Latte Đá Xay",
    category: "Đá xay",
    price: 45000,
    description: "Trà xanh Uji Nhật Bản nguyên chất xay mịn với sữa tươi và đá, phủ kem whipping.",
  },
];

export default function CustomerDisplayPage() {
  const [displayState, setDisplayState] = useState({
    status: "welcome", // welcome, ordering, checkout, success
    tableName: "",
    items: [],
    subtotal: 0,
    discount: 0,
    total: 0,
    paymentMethod: "cash",
    qrUrl: "",
    bankInfo: null,
    settings: null,
    orderId: "",
  });

  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  const [slides, setSlides] = useState(DEFAULT_SLIDES);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const preloadedQrRef = useRef({ url: "", loaded: false });
  const preloadImgRef = useRef(null);

  // --- Helper: build VietQR URL ---
  const buildQrUrl = useCallback((settings, total, orderId) => {
    const bankId = settings?.BANK_ID || "MB";
    const accountNo = settings?.BANK_ACCOUNT || "1234567890";
    const accountName = settings?.BANK_OWNER || "QUYNH ANH";
    const addInfo = `DH ${orderId || ""}`.trim();
    return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${total}&addInfo=${encodeURIComponent(addInfo)}&accountName=${encodeURIComponent(accountName)}`;
  }, []);

  // --- Preload QR image when ORDERING + transfer is selected ---
  useEffect(() => {
    if (
      displayState.status === "ordering" &&
      displayState.paymentMethod === "transfer" &&
      displayState.total > 0
    ) {
      const url = buildQrUrl(
        displayState.settings,
        displayState.total,
        displayState.orderId
      );

      // Only preload if URL changed
      if (url !== preloadedQrRef.current.url) {
        preloadedQrRef.current = { url, loaded: false };
        const img = new Image();
        img.onload = () => {
          preloadedQrRef.current.loaded = true;
        };
        img.src = url;
        preloadImgRef.current = img; // keep reference to prevent GC
      }
    }
  }, [displayState.status, displayState.paymentMethod, displayState.total, displayState.settings, displayState.orderId, buildQrUrl]);

  // Time & Date Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
      setDate(
        now.toLocaleDateString("vi-VN", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Slide Show Rotation
  useEffect(() => {
    if (displayState.status !== "welcome") return;

    const timer = setInterval(() => {
      setActiveSlideIdx((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [displayState.status, slides.length]);

  // Load Slides from Products Cache
  useEffect(() => {
    const products = appStore.get("products") || [];
    if (products.length > 0) {
      // Pick products that have images, or just pick top 5
      const availableSlides = products
        .slice(0, 8)
        .map((p) => ({
          name: p.name,
          category: p.category || "Đồ uống",
          price: p.price,
          image: p.image ? getDirectImageUrl(p.image) : null,
          description: p.description || `Thưởng thức ${p.name} thơm ngon mát lạnh tại DrinkHub.`,
        }));
      setSlides(availableSlides.length > 0 ? availableSlides : DEFAULT_SLIDES);
    }
  }, []);

  // Sync Event Listeners
  useEffect(() => {
    const handleMessage = (event) => {
      const { type, payload } = event.data || event;
      processMessage(type, payload);
    };

    const processMessage = (type, payload) => {
      if (type === "RESET") {
        setDisplayState({
          status: "welcome",
          tableName: "",
          items: [],
          subtotal: 0,
          discount: 0,
          total: 0,
          paymentMethod: "cash",
          qrUrl: "",
          bankInfo: null,
          settings: null,
          orderId: "",
        });
      } else if (type === "ORDERING") {
        setDisplayState({
          status: "ordering",
          tableName: payload.tableName,
          items: payload.items || [],
          subtotal: payload.subtotal || 0,
          discount: payload.discount || 0,
          total: payload.total || 0,
          paymentMethod: payload.paymentMethod || "cash",
          qrUrl: "",
          bankInfo: null,
          settings: payload.settings || null,
          orderId: payload.orderId || "",
        });
      } else if (type === "CHECKOUT") {
        let qrUrl = "";
        let bankInfo = null;

        if (payload.paymentMethod === "transfer") {
          const bankId = payload.settings?.BANK_ID || "MB";
          const accountNo = payload.settings?.BANK_ACCOUNT || "1234567890";
          const accountName = payload.settings?.BANK_OWNER || "QUYNH ANH";
          const orderId = payload.orderId || "";
          const addInfo = `DH ${orderId}`.trim();

          qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${payload.total}&addInfo=${encodeURIComponent(addInfo)}&accountName=${encodeURIComponent(accountName)}`;

          // Use preloaded QR if it matches (instant display!)
          if (preloadedQrRef.current.url === qrUrl && preloadedQrRef.current.loaded) {
            // QR already cached in browser — will render instantly
          }
          
          bankInfo = {
            bankId,
            accountNo,
            accountName,
            description: addInfo,
          };
        }

        setDisplayState({
          status: "checkout",
          tableName: payload.tableName,
          items: payload.items || [],
          subtotal: payload.subtotal || 0,
          discount: payload.discount || 0,
          total: payload.total || 0,
          paymentMethod: payload.paymentMethod || "cash",
          qrUrl,
          bankInfo,
        });
      } else if (type === "SUCCESS") {
        setDisplayState((prev) => ({ ...prev, status: "success" }));
      }
    };

    // 1. BroadcastChannel Listener
    const channel = new BroadcastChannel("drinkhub_customer_display");
    channel.addEventListener("message", handleMessage);

    // 2. LocalStorage Fallback Listener
    const handleStorageChange = (e) => {
      if (e.key === "drinkhub_customer_display_state" && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          processMessage(data.type, data.payload);
        } catch (err) {
          console.error("Failed to parse storage event data", err);
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);

    // 3. Load initial state from localStorage if recent (less than 3 minutes)
    try {
      const saved = localStorage.getItem("drinkhub_customer_display_state");
      if (saved) {
        const data = JSON.parse(saved);
        if (Date.now() - data.timestamp < 3 * 60 * 1000) {
          processMessage(data.type, data.payload);
        }
      }
    } catch (err) {
      console.error("Failed to load initial customer state", err);
    }

    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // Auto transition from success back to welcome after 4 seconds
  useEffect(() => {
    if (displayState.status === "success") {
      const timer = setTimeout(() => {
        setDisplayState({
          status: "welcome",
          tableName: "",
          items: [],
          subtotal: 0,
          discount: 0,
          total: 0,
          paymentMethod: "cash",
          qrUrl: "",
          bankInfo: null,
          settings: null,
          orderId: "",
        });
        // Clear storage
        try {
          localStorage.removeItem("drinkhub_customer_display_state");
        } catch (e) {}
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [displayState.status]);

  // --- RENDER 1: WELCOME SCREEN ---
  if (displayState.status === "welcome") {
    const activeSlide = slides[activeSlideIdx] || DEFAULT_SLIDES[0];

    return (
      <div className="min-h-screen bg-slate-950 text-white font-sans overflow-hidden flex flex-col justify-between p-8 relative">
        {/* Decorative background gradients */}
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-blue-900/20 blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-emerald-900/20 blur-[120px] pointer-events-none"></div>

        {/* Header: Shop Logo and Clock */}
        <div className="flex justify-between items-center relative z-10 border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-emerald-500 flex items-center justify-center font-black text-2xl tracking-wider text-white shadow-lg shadow-blue-500/20">
              DH
            </div>
            <div>
              <h1 className="text-2xl font-black bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                DrinkHub
              </h1>
              <p className="text-xs text-slate-400 font-medium tracking-wide">
                QUÁN NƯỚC QUỲNH ANH
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tracking-tight text-blue-400 tabular-nums">
              {time}
            </p>
            <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">
              {date}
            </p>
          </div>
        </div>

        {/* Main Content: Slideshow Area */}
        <div className="flex-1 my-8 flex flex-col lg:flex-row items-center justify-center gap-12 relative z-10">
          {/* Slide Image / Graphic */}
          <div className="w-full lg:w-[45%] aspect-square max-w-[420px] rounded-3xl bg-slate-900/60 border border-white/10 p-6 flex items-center justify-center shadow-2xl relative overflow-hidden backdrop-blur-md">
            {activeSlide.image ? (
              <img
                src={activeSlide.image}
                alt={activeSlide.name}
                className="w-full h-full object-cover rounded-2xl transition-all duration-700 transform hover:scale-105"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-8">
                <span className="text-7xl mb-4 filter drop-shadow-[0_10px_10px_rgba(59,130,246,0.3)]">
                  🍹
                </span>
                <span className="text-xs uppercase font-extrabold tracking-widest text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 px-3 py-1 rounded-full">
                  {activeSlide.category}
                </span>
              </div>
            )}
            {/* Pulsing glow under image */}
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/5 to-emerald-500/5 mix-blend-overlay pointer-events-none"></div>
          </div>

          {/* Slide Text */}
          <div className="w-full lg:w-[50%] text-center lg:text-left flex flex-col justify-center">
            <span className="text-emerald-400 font-bold tracking-widest uppercase text-sm mb-2 block">
              Món ngon nổi bật
            </span>
            <h2 className="text-4xl lg:text-5xl font-black tracking-tight leading-tight mb-4 text-white drop-shadow-sm transition-all duration-500">
              {activeSlide.name}
            </h2>
            <p className="text-slate-300 text-lg leading-relaxed mb-6 font-medium max-w-xl transition-all duration-500">
              {activeSlide.description}
            </p>
            <div>
              <span className="inline-block bg-white/10 border border-white/20 backdrop-blur-md rounded-2xl px-6 py-3 text-2xl font-black text-emerald-400 shadow-xl">
                {formatCurrency(activeSlide.price)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer: Bottom Message */}
        <div className="text-center relative z-10 border-t border-white/15 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-lg font-bold text-slate-300">
            👋 Kính chào quý khách! Vui lòng chọn món tại quầy order.
          </p>
          <div className="flex gap-2">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveSlideIdx(idx)}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  idx === activeSlideIdx
                    ? "bg-emerald-400 w-8"
                    : "bg-slate-700 hover:bg-slate-500"
                }`}
              ></button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER 2: ORDERING STATE ---
  if (displayState.status === "ordering") {
    return (
      <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col p-6 relative">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-blue-900/20 blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-emerald-900/20 blur-[120px] pointer-events-none"></div>

        {/* Top Info */}
        <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📝</span>
            <div>
              <h2 className="text-xl font-extrabold text-slate-200">
                Thông tin gọi món
              </h2>
              <p className="text-sm font-bold text-blue-400 uppercase">
                {displayState.tableName || "Hóa đơn"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-sm font-semibold px-4 py-1.5 rounded-full bg-blue-950 border border-blue-800 text-blue-300">
              Đang chọn món...
            </span>
          </div>
        </div>

        {/* Main Grid split */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10 overflow-hidden">
          {/* Left: Cart Items List */}
          <div className="lg:col-span-2 bg-slate-900/40 border border-white/10 rounded-3xl p-6 flex flex-col overflow-hidden backdrop-blur-md">
            <h3 className="text-lg font-bold text-slate-300 mb-4 flex items-center gap-2">
              <span>📋</span> Danh sách sản phẩm
            </h3>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
              {displayState.items.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 font-medium">
                  Chưa có sản phẩm nào được chọn
                </div>
              ) : (
                displayState.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center bg-slate-900/80 border border-white/5 p-4 rounded-2xl hover:border-white/10 transition-all"
                  >
                    <div className="flex-1">
                      <p className="font-bold text-lg text-white">
                        {item.name}
                      </p>
                      <p className="text-sm text-slate-400 mt-0.5">
                        {formatCurrency(item.price)}
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="px-3.5 py-1 rounded-xl bg-blue-950/60 border border-blue-900/60 text-blue-400 font-extrabold text-base">
                        x{item.quantity}
                      </span>
                      <span className="font-extrabold text-lg text-slate-200 text-right min-w-[100px]">
                        {formatCurrency(item.total)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Totals Card */}
          <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 flex flex-col justify-between backdrop-blur-md shadow-2xl relative overflow-hidden">
            <div>
              <h3 className="text-lg font-bold text-slate-300 mb-6 border-b border-white/5 pb-3">
                Thông tin thanh toán
              </h3>

              {/* Subtotal & Discount info */}
              <div className="space-y-4">
                <div className="flex justify-between text-slate-400 font-medium">
                  <span>Tạm tính</span>
                  <span className="text-white font-bold">
                    {formatCurrency(displayState.subtotal)}
                  </span>
                </div>
                {displayState.discount > 0 && (
                  <div className="flex justify-between text-red-400 font-medium">
                    <span>Giảm giá</span>
                    <span className="font-bold">
                      -{formatCurrency(displayState.discount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-slate-400 font-medium">
                  <span>Phương thức</span>
                  <span className="text-blue-400 font-bold">
                    {displayState.paymentMethod === "cash"
                      ? "Tiền mặt"
                      : "Chuyển khoản"}
                  </span>
                </div>
              </div>
            </div>

            {/* Total Section */}
            <div className="mt-8 border-t border-white/10 pt-6">
              <p className="text-slate-400 font-bold mb-2">TỔNG TIỀN CẦN THANH TOÁN</p>
              <p className="text-5xl font-black tracking-tight text-emerald-400 drop-shadow-[0_2px_10px_rgba(52,211,153,0.2)]">
                {formatCurrency(displayState.total)}
              </p>
              
              <div className="mt-6 p-4 rounded-2xl bg-slate-950 border border-white/5 flex items-center gap-3">
                <span className="text-2xl animate-pulse">☕</span>
                <p className="text-xs text-slate-400 font-medium leading-relaxed">
                  Nhân viên đang chuẩn bị hóa đơn. Quý khách vui lòng kiểm tra kỹ danh sách món đã gọi.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER 3: CHECKOUT SCREEN (QR CODE / CASH) ---
  if (displayState.status === "checkout") {
    const isTransfer = displayState.paymentMethod === "transfer";

    return (
      <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col p-6 relative">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-blue-900/20 blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-emerald-900/20 blur-[120px] pointer-events-none"></div>

        {/* Top bar */}
        <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-8 relative z-10">
          <div className="flex items-center gap-3">
            <span className="text-3xl">💳</span>
            <div>
              <h2 className="text-xl font-extrabold text-slate-200">
                Thực hiện thanh toán
              </h2>
              <p className="text-sm font-bold text-blue-400 uppercase">
                {displayState.tableName || "Hóa đơn"}
              </p>
            </div>
          </div>
          <div>
            <span className="text-sm font-bold px-4 py-1.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-300 animate-pulse">
              Đang thanh toán...
            </span>
          </div>
        </div>

        {/* Main Grid */}
        <div className="flex-1 flex flex-col lg:flex-row gap-8 items-center justify-center relative z-10">
          {isTransfer ? (
            <>
              {/* QR Code Column */}
              <div className="w-full lg:w-[45%] max-w-[440px] bg-white text-slate-950 p-6 rounded-3xl shadow-2xl flex flex-col items-center relative overflow-hidden border-4 border-emerald-500/20">
                {/* Scanner decorative box lines */}
                <div className="absolute top-4 left-4 w-6 h-6 border-t-4 border-l-4 border-emerald-500 rounded-tl-lg"></div>
                <div className="absolute top-4 right-4 w-6 h-6 border-t-4 border-r-4 border-emerald-500 rounded-tr-lg"></div>
                <div className="absolute bottom-4 left-4 w-6 h-6 border-b-4 border-l-4 border-emerald-500 rounded-bl-lg"></div>
                <div className="absolute bottom-4 right-4 w-6 h-6 border-b-4 border-r-4 border-emerald-500 rounded-br-lg"></div>

                <p className="text-center font-black text-lg tracking-wide text-slate-700 uppercase mb-4">
                  Quét mã QR qua ứng dụng Bank/Momo
                </p>

                <div className="relative aspect-square w-full bg-white flex items-center justify-center p-2 rounded-2xl border border-slate-100">
                  {displayState.qrUrl ? (
                    <img
                      src={displayState.qrUrl}
                      alt="VietQR Payment Code"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                      <div className="w-10 h-10 border-4 border-slate-300 border-t-blue-500 rounded-full animate-spin"></div>
                      <p className="text-xs">Đang khởi tạo mã QR...</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 text-center">
                  <span className="inline-block text-xs font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full animate-pulse">
                    ⚡ Tự động điền số tiền & nội dung
                  </span>
                </div>
              </div>

              {/* Payment Details Column */}
              <div className="w-full lg:w-[45%] max-w-[480px] bg-slate-900/60 border border-white/10 rounded-3xl p-6 flex flex-col justify-between backdrop-blur-md shadow-2xl">
                <div>
                  <h3 className="text-lg font-bold text-slate-300 mb-6 border-b border-white/5 pb-3">
                    Thông tin tài khoản nhận tiền
                  </h3>

                  {displayState.bankInfo && (
                    <div className="space-y-4 text-base font-medium">
                      <div className="flex justify-between border-b border-white/5 pb-2.5">
                        <span className="text-slate-400">Ngân hàng:</span>
                        <span className="text-white font-bold uppercase">{displayState.bankInfo.bankId}</span>
                      </div>
                      <div className="flex justify-between border-b border-white/5 pb-2.5">
                        <span className="text-slate-400">Số tài khoản:</span>
                        <span className="text-white font-bold tracking-wider tabular-nums">{displayState.bankInfo.accountNo}</span>
                      </div>
                      <div className="flex justify-between border-b border-white/5 pb-2.5">
                        <span className="text-slate-400">Chủ tài khoản:</span>
                        <span className="text-white font-bold uppercase">{displayState.bankInfo.accountName}</span>
                      </div>
                      <div className="flex justify-between border-b border-white/5 pb-2.5">
                        <span className="text-slate-400">Nội dung CK:</span>
                        <span className="text-yellow-400 font-bold uppercase tracking-wider">{displayState.bankInfo.description}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-8 border-t border-white/10 pt-6">
                  <p className="text-slate-400 font-bold mb-1.5">SỐ TIỀN CẦN THANH TOÁN</p>
                  <p className="text-5xl font-black text-emerald-400 drop-shadow-[0_2px_10px_rgba(52,211,153,0.2)] mb-6">
                    {formatCurrency(displayState.total)}
                  </p>

                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-950/30 border border-emerald-900/50">
                    <span className="text-2xl animate-pulse text-emerald-400">🕒</span>
                    <p className="text-xs text-slate-300 font-semibold leading-relaxed">
                      Vui lòng quét mã QR chuyển khoản chính xác số tiền trên. Hệ thống đang chờ xác nhận từ thiết bị bán hàng.
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            // Cash Checkout
            <div className="w-full max-w-2xl bg-slate-900/60 border border-white/10 rounded-3xl p-10 text-center backdrop-blur-md shadow-2xl flex flex-col items-center">
              <div className="w-24 h-24 rounded-full bg-blue-950 border-2 border-blue-500/30 flex items-center justify-center text-5xl mb-6 shadow-lg shadow-blue-500/10">
                💵
              </div>
              <h3 className="text-2xl font-black mb-4">Thanh toán bằng tiền mặt</h3>
              <p className="text-slate-400 text-lg mb-8 max-w-md font-medium">
                Vui lòng gửi số tiền mặt tương ứng dưới đây cho nhân viên thu ngân tại quầy order.
              </p>

              <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">
                TỔNG SỐ TIỀN HÓA ĐƠN
              </p>
              <p className="text-6xl font-black text-emerald-400 drop-shadow-[0_2px_10px_rgba(52,211,153,0.3)] mb-8">
                {formatCurrency(displayState.total)}
              </p>

              <div className="p-4 bg-slate-950 border border-white/5 rounded-2xl flex items-center gap-3 w-full max-w-md text-left">
                <span className="text-2xl text-blue-400">ℹ️</span>
                <p className="text-xs text-slate-400 font-medium">
                  Nhân viên sẽ nhận tiền mặt và hoàn lại tiền thừa cho quý khách nếu có. Cảm ơn quý khách!
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- RENDER 4: SUCCESS SCREEN ---
  if (displayState.status === "success") {
    return (
      <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col items-center justify-center p-6 relative">
        <div className="absolute inset-0 bg-gradient-to-tr from-emerald-950/40 via-slate-950 to-slate-950 pointer-events-none"></div>

        {/* Animated Ripple Circles */}
        <div className="relative w-40 h-40 flex items-center justify-center mb-8">
          <div className="absolute inset-0 rounded-full bg-emerald-500/10 animate-ping"></div>
          <div className="absolute w-32 h-32 rounded-full bg-emerald-500/20 animate-pulse"></div>
          <div className="w-24 h-24 rounded-full bg-emerald-500 border-4 border-white flex items-center justify-center text-white text-5xl shadow-2xl relative z-10">
            ✓
          </div>
        </div>

        <h2 className="text-4xl lg:text-5xl font-black tracking-tight mb-4 text-emerald-400 drop-shadow-[0_4px_15px_rgba(52,211,153,0.4)]">
          Thanh toán thành công!
        </h2>
        <p className="text-slate-300 text-xl font-bold mb-2">
          DrinkHub xin chân thành cảm ơn quý khách.
        </p>
        <p className="text-slate-400 text-base font-semibold">
          Chúc quý khách thưởng thức đồ uống ngon miệng và hẹn gặp lại!
        </p>

        <div className="absolute bottom-12 flex items-center gap-2 text-slate-500 text-sm font-semibold">
          <div className="w-5 h-5 border-2 border-slate-600 border-t-emerald-400 rounded-full animate-spin"></div>
          <span>Đang tải lại trang chào mừng...</span>
        </div>
      </div>
    );
  }

  return null;
}
