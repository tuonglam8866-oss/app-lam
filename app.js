// ==============================================================
// APP LÂM v8.6.62 - Upgraded Web & Desktop Hybrid Application Logic
// ==============================================================

const APP_FRONTEND_VERSION = "8.6.111";
let last_notified_update_version = (function () {
  try {
    return (
      localStorage.getItem("app_lam_last_notified_version") ||
      APP_FRONTEND_VERSION
    );
  } catch (e) {
    return APP_FRONTEND_VERSION;
  }
})();

function compare_semver(v1, v2) {
  const p1 = String(v1 || "0").replace(/^[^\d]*/, "").split(".").map((x) => parseInt(x, 10) || 0);
  const p2 = String(v2 || "0").replace(/^[^\d]*/, "").split(".").map((x) => parseInt(x, 10) || 0);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 !== n2) return n1 - n2;
  }
  return 0;
}

// ==============================================================
// BẢO MẬT KHÓA & TOKEN TRUY CẬP (SECURE CREDENTIALS ENCRYPTION)
// ==============================================================
function decode_protected_token(encodedB64, keyStr = "UPYO_SECURE_2026") {
  try {
    const raw = atob(encodedB64);
    let res = "";
    for (let i = 0; i < raw.length; i++) {
      res += String.fromCharCode(raw.charCodeAt(i) ^ keyStr.charCodeAt(i % keyStr.length));
    }
    return res;
  } catch (e) {
    return "";
  }
}

const APPS_SCRIPT_BASE_URL =
  "https://script.google.com/macros/s/AKfycbzF7CL11KBrt5dnB4qOv5z4mn9nCbCwWTUZySbMbBsuWaUqBoZUspP_k5_uqT0uvw-U/exec";
const APPS_SCRIPT_SECRET_KEY = decode_protected_token("AAAAAAAfBA4KYHVtBA==");

const CSV_URL_THONG_KE = `${APPS_SCRIPT_BASE_URL}?key=${APPS_SCRIPT_SECRET_KEY}&gid=1227181736`;
const CSV_URL_THONG_KE_FALLBACK = `${APPS_SCRIPT_BASE_URL}?key=${APPS_SCRIPT_SECRET_KEY}&gid=1227181736`;

const CSV_URL_THONG_BAO = `${APPS_SCRIPT_BASE_URL}?key=${APPS_SCRIPT_SECRET_KEY}&gid=0`;
const CSV_URL_THONG_BAO_FALLBACK = `${APPS_SCRIPT_BASE_URL}?key=${APPS_SCRIPT_SECRET_KEY}&gid=0`;

const FB_TOKEN_PROTECTED =
  "EBEYFxhqLA5jKj0KcGNBBmIBMCcTEQcGbBV1Gn0FA30jJS4DZxwfADwkNwVxemh1ByMDDT4ZFBo/agENdXNqWWIXKypnGw4FLQAHb2tqcV8hJyh/OgITLCwIBzRgAV5ZYx0ofGgQCiA5ESs9RHpxcwYALSFnMCEmNgsrOFpgU3AWBwsJMGQUCGUlBxVRaVxsFwlvOSUSDBIFMA4nd2pxDhcTLn0HOQcNDTwPCGRxdmwWJG16J2ZzJBEaNxBECAdaJB0yKAUXHwc=";

function get_fb_token() {
  return decode_protected_token(FB_TOKEN_PROTECTED);
}

function bo_dau_tieng_viet(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0111]/g, "d")
    .replace(/[\u0110]/g, "D");
}

function la_don_hop_le_de_dem(trang_thai_raw) {
  if (!trang_thai_raw) return false;
  const s = String(trang_thai_raw).trim().toUpperCase();
  const noDau = bo_dau_tieng_viet(s).toUpperCase();
  return (
    s.includes("\u0110\u00c3 L\u00caN \u0110\u01a0N") ||
    noDau.includes("DA LEN DON") ||
    s.includes("CH\u1ed0T CH\u01afA C\u00d3 H\u00c0NG") ||
    noDau.includes("CHOT CHUA CO HANG") ||
    s.includes("\u0110\u01a0N TEST") ||
    noDau.includes("DON TEST") ||
    s.includes("GIAO TH\u00c0NH C\u00d4NG") ||
    noDau.includes("GIAO THANH CONG")
  );
}

const LIST_MKT_FB = [
  { ten: "L\u00c2M", id: "act_1219584325802699" },
  { ten: "TH.L\u00c2M", id: "act_2795566000842055" },
  { ten: "PH\u00daC", id: "act_565886575873090" },
  { ten: "T\u00c2M", id: "act_611714185179363" },
  { ten: "SAN", id: "act_1333165132087237" },
  { ten: "D\u0168NG", id: "act_1333165132087237" },
];

const TU_DIEN_PHAT_AM = {
  victora: "vích to ra",
  victoria: "vích to ri a",
  upyo: "ắp dô",
  combo: "com bo",
  piany: "pi a ni",
  set: "sét",
  vip: "víp",
  pro: "pờ rô",
};

// ==============================================================
// XÁC THỰC BẢO MẬT MẬT KHẨU (PASSWORD SECURITY - LEVEL 1 SHA-256)
// ==============================================================
const APP_AUTH_HASH = "22c8b8f3d892f237262d828b900536d5aad8ca6aaf7b5eddf729444802138fd8";
const AUTH_STORAGE_KEY = "app_lam_auth_hash";

async function compute_sha256(str) {
  try {
    if (window.crypto && window.crypto.subtle) {
      const msgUint8 = new TextEncoder().encode(str);
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch (e) {}
  return sha256_fallback(str);
}

function sha256_fallback(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = "length";
  let i, j;
  let result = "";
  const words = [];
  const asciiBitLength = ascii[lengthProperty] * 8;
  const hash = [];
  const k = [];
  let primeCounter = 0;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += "\x80";
  while ((ascii[lengthProperty] % 64) - 56) ascii += "\x00";
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;
  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15],
        w2 = w[i - 2];
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const temp1 =
        hash[7] +
        (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) +
        ch +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] + s0 + w[i - 7] + s1) | 0);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 =
        (rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) +
        maj;
      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  for (i = 0; i < 8; i++) {
    for (let b = 3; b >= 0; b--) {
      const byte = (hash[i] >> (b * 8)) & 255;
      result += (byte < 16 ? "0" : "") + byte.toString(16);
    }
  }
  return result;
}

function is_app_authenticated() {
  try {
    const token =
      localStorage.getItem(AUTH_STORAGE_KEY) ||
      sessionStorage.getItem(AUTH_STORAGE_KEY);
    return token === APP_AUTH_HASH;
  } catch (e) {
    return false;
  }
}

function set_app_authenticated(remember) {
  try {
    if (remember) {
      localStorage.setItem(AUTH_STORAGE_KEY, APP_AUTH_HASH);
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
    } else {
      sessionStorage.setItem(AUTH_STORAGE_KEY, APP_AUTH_HASH);
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch (e) {}
}

function lock_app() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem("app_lam_auth_token");
    sessionStorage.removeItem("app_lam_auth_token");
  } catch (e) {}
  show_auth_lock_screen();
}

function show_auth_lock_screen() {
  const lockScreen = document.getElementById("authLockScreen");
  const pwdInput = document.getElementById("authPasswordInput");
  const errMsg = document.getElementById("authErrorMessage");
  const appContainer = document.getElementById("appContainer");
  const eyeOpen = document.getElementById("eyeIconOpen");
  const eyeClosed = document.getElementById("eyeIconClosed");
  if (appContainer) appContainer.classList.add("hidden");
  if (errMsg) errMsg.classList.add("hidden");
  if (pwdInput) {
    pwdInput.value = "";
    pwdInput.type = "password";
  }
  if (eyeOpen) eyeOpen.classList.remove("hidden");
  if (eyeClosed) eyeClosed.classList.add("hidden");
  if (lockScreen) {
    lockScreen.classList.remove("hidden");
    setTimeout(() => {
      if (pwdInput) pwdInput.focus();
    }, 120);
  }
}

function unlock_app() {
  const lockScreen = document.getElementById("authLockScreen");
  const appContainer = document.getElementById("appContainer");
  if (lockScreen) lockScreen.classList.add("hidden");
  if (appContainer) appContainer.classList.remove("hidden");
}

const KNOWN_CODES_DEFAULT = [
  "ELITE",
  "GEM",
  "SOLE",
  "MUSE",
  "PENNY",
  "GLOSS",
  "ROYAL",
  "ELIOS",
  "COMO",
  "VERGE",
  "NOBLE",
  "COVE",
  "CARLTON",
  "VESPER",
  "ROGER",
  "PIANY",
  "MONTIA",
  "FRANK",
  "DORIAN",
  "HOMER",
];

const TU_KHOA_LOAI_BO = new Set([
  "GIÀY",
  "GIAY",
  "LS",
  "CD",
  "CĐ",
  "DTL",
  "BẢN SAO",
  "BAN SAO",
  "VIDEO",
  "PREMIUM",
  "UPYO",
  "CAMP",
  "TEST",
  "MKT",
  "SALE",
  "MỚI",
  "MOI",
  "TÂM",
  "TAM",
  "LÂM",
  "LAM",
  "PHÚC",
  "PHUC",
  "SAN",
  "D\u0168NG",
  "DUNG",
  "TH.LÂM",
  "TH.LAM",
  "THANH LÂM",
  "LIFESTYLE",
  "SHOES",
]);

// ==============================================================
// TỪ ĐIỂN ĐA NGÔN NGỮ (VI / ZH / EN)
// ==============================================================
const I18N = {
  vi: {
    mainTitle: "SỐ ĐƠN & DOANH SỐ",
    liveBadge: "TRỰC CHIẾN 3S",
    initializing: "Đang khởi tạo...",
    lastSyncPrefix: "Cập nhật: ",
    spPlaceholder: "Mã SP...",
    btnAddSp: "+ Thêm",
    today: "Hôm nay",
    yesterday: "Hôm qua",
    lastMonth: "Tháng trước",
    thisMonth: "Tháng này",
    fromLabel: "Từ:",
    toLabel: "Đến:",
    btnRefresh: "Tải Lại",
    btnHeaderUpdate: "Cập nhật",
    btnLogout: "Đăng xuất",
    btnSettings: "Cài đặt",
    companySummaryTitle: "🏢 TỔNG CÔNG TY",
    totalOrdersUnit: "tổng đơn",
    singleDateFmt: (d) => `Ngày ${d}`,
    rangeDateFmt: (s, e) => `Từ ${s} đến ${e}`,
    noRevenueYet: "Chưa có DS",
    metricDS: "DS",
    metricCP: "CP",
    metricCPO: "CP/ĐƠN",
    metricCPDS: "CP/DS",
    ordersUnit: "đơn",
    noOrdersYet: "Chưa nổ đơn",
    viewDetailHint: "Xem chi tiết →",
    mktReportHeader: "BÁO CÁO MKT (Chuột phải Copy CP)",
    mktDetailHeader: (m) => `CHI TIẾT: ${m} (Chuột phải Copy CP)`,
    btnBack: "← Quay lại",
    top5SpHeader: "TOP 10 MÃ TỔNG CÔNG TY",
    emptyMktList: "Chưa có đơn và chưa có CP",
    emptyMktDetail: (m) => `${m} chưa có CP Ads và chưa có đơn.`,
    emptySpList: "Chưa ghi nhận mẫu nào",
    calMonthYearFmt: (m, y) => `Tháng ${m} / ${y}`,
    weekdays: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"],
    settingsTitle: "⚙ CÀI ĐẶT HỆ THỐNG",
    lblVoice: "1. Âm thanh (Chị Google):",
    lblPopup: "2. Popup Góc Màn Hình:",
    lblFireworks: "3. Hiệu ứng Pháo Hoa:",
    lblFontSize: "4. Cỡ chữ:",
    lblUiScale: "5. Kích thước UI:",
    lblTheme: "6. Giao diện (Dark Mode):",
    lblLang: "7. Ngôn ngữ (Language):",
    lblAutoStart: "8. Khởi động cùng Windows:",
    lblUpdate: "8. Tự động cập nhật (GitHub):",
    btnSaveUpdateUrl: "💾 Lưu & Cập nhật",
    btnCheckUpdateNow: "🔄 Kiểm tra ngay",
    updateUrlPlaceholder: "Dán link GitHub repo (vd: https://github.com/ten/app-lam)...",
    stateOn: "ĐANG BẬT",
    stateOff: "ĐANG TẮT",
    btnTestVoice: "🔊 Nghe thử",
    btnTestPopup: "🎉 Xem thử Popup",
    themeLight: "☀️ Sáng (Kem Cozy)",
    themeDark: "🌙 Tối (Nâu Be Cozy)",
    scannerStatus: "Trực chiến: Đang quét đơn (3s/lần)",
    knownCodesFmt: (n) => `Đang nhận diện: ${n} mã SP`,
    ctxCopyCp: "📋 Copy CP",
    toastCopiedCp: "Đã copy CP",
    toastSavedCode: (c) => `Đã lưu mã: ${c}`,
    toastExistingCode: (c) => `Mã ${c} đã có sẵn!`,
    testPopupTitle: "TEST NỔ ĐƠN",
    newOrderPopupTitle: "UPYO NỔ ĐƠN MỚI!",
    allCodesBtn: "📋 Tất cả mã",
    allCodesTitle: "📋 TẤT CẢ MÃ ĐANG NHẬN DIỆN",
    colCode: "Mã SP",
    colOrders: "Đơn",
    allCodesTotal: "TỔNG",
    crBadgeTitle: "TỈ LỆ CHỐT ĐƠN LANDING PAGE TỔNG CÔNG TY",
    crDescText: "Đã lọc đơn trùng, đơn Capture Form",
    crSubHint: "Xem chi tiết →",
    actBadgeTitle: "THỜI GIAN GỌI SỐ TRUNG BÌNH",
    actDescText: "(đã loại trừ khung giờ nghỉ)",
    crLblClosed: "ĐƠN ĐÃ CHỐT",
    crLblTotal: "ĐẾM ĐƠN",
    crLblUnclosed: "CHƯA CHỐT",
    crLblRate: "TỈ LỆ CHỐT",
    closingRatePopupTitle: "🎯 CHI TIẾT TỈ LỆ CHỐT MKT",
    colMkt: "MKT",
    loadingMain: "⏳ Đang tải dữ liệu...",
    loadingSub: "Đang đồng bộ Google Sheets & Facebook Ads",
  },
  zh: {
    mainTitle: "订单数与销售额",
    liveBadge: "3秒实时监控",
    initializing: "正在初始化...",
    lastSyncPrefix: "更新时间: ",
    spPlaceholder: "产品代码...",
    btnAddSp: "+ 添加",
    today: "今天",
    yesterday: "昨天",
    lastMonth: "上个月",
    thisMonth: "本月",
    fromLabel: "从:",
    toLabel: "至:",
    btnRefresh: "刷新",
    btnHeaderUpdate: "更新",
    btnLogout: "退出登录",
    btnSettings: "设置",
    companySummaryTitle: "🏢 公司总计",
    totalOrdersUnit: "总订单",
    singleDateFmt: (d) => `日期 ${d}`,
    rangeDateFmt: (s, e) => `${s} 至 ${e}`,
    noRevenueYet: "暂无销售额",
    metricDS: "销售额",
    metricCP: "广告费",
    metricCPO: "单均费",
    metricCPDS: "费销比",
    ordersUnit: "单",
    noOrdersYet: "暂无出单",
    viewDetailHint: "查看详情 →",
    mktReportHeader: "营销人员报表 (右键复制广告费)",
    mktDetailHeader: (m) => `详情: ${m} (右键复制广告费)`,
    btnBack: "← 返回",
    top5SpHeader: "前 5 热销款式",
    emptyMktList: "暂无订单与广告花费",
    emptyMktDetail: (m) => `${m} 暂无广告花费与订单。`,
    emptySpList: "暂无款式记录",
    calMonthYearFmt: (m, y) => `${y}年 ${m}月`,
    weekdays: ["日", "一", "二", "三", "四", "五", "六"],
    settingsTitle: "⚙ 系统设置",
    lblVoice: "1. 语音播报 (Google 语音):",
    lblPopup: "2. 屏幕右下角弹窗:",
    lblFireworks: "3. 烟花庆祝特效:",
    lblFontSize: "4. 字体大小:",
    lblUiScale: "5. 界面缩放:",
    lblTheme: "6. 界面主题 (深色模式):",
    lblLang: "7. 语言选择 (Language):",
    lblAutoStart: "8. 开机自动启动:",
    lblUpdate: "8. 自动更新 (GitHub):",
    btnSaveUpdateUrl: "💾 保存并更新",
    btnCheckUpdateNow: "🔄 立即检查",
    updateUrlPlaceholder: "粘贴 GitHub 仓库链接 (如: https://github.com/user/app-lam)...",
    stateOn: "已开启",
    stateOff: "已关闭",
    btnTestVoice: "🔊 试听语音",
    btnTestPopup: "🎉 预览弹窗",
    themeLight: "☀️ 浅色 (温暖米色)",
    themeDark: "🌙 深色 (摩卡棕米)",
    scannerStatus: "实时监控: 每3秒扫描新订单",
    knownCodesFmt: (n) => `当前识别: ${n} 个产品代码`,
    ctxCopyCp: "📋 复制广告费",
    toastCopiedCp: "已复制广告费",
    toastSavedCode: (c) => `已保存代码: ${c}`,
    toastExistingCode: (c) => `代码 ${c} 已存在!`,
    testPopupTitle: "测试爆单通知",
    newOrderPopupTitle: "UPYO 新订单来啦!",
    allCodesBtn: "📋 全部代码",
    allCodesTitle: "📋 已识别的全部产品代码",
    colCode: "产品代码",
    colOrders: "订单",
    allCodesTotal: "合计",
    crBadgeTitle: "公司总落地页成交率",
    crDescText: "已过滤重复单与 Capture Form",
    crSubHint: "查看详情 →",
    actBadgeTitle: "平均拨号响应时间",
    actDescText: "(已扣除休息时段)",
    crLblClosed: "已成交",
    crLblTotal: "总单数",
    crLblUnclosed: "未成交",
    crLblRate: "成交率",
    closingRatePopupTitle: "🎯 各营销人员成交率明细",
    colMkt: "营销",
    loadingMain: "⏳ 正在加载数据...",
    loadingSub: "正在同步 Google Sheets 与 Facebook 广告",
  },
  en: {
    mainTitle: "ORDERS & REVENUE",
    liveBadge: "LIVE 3S SCAN",
    initializing: "Initializing...",
    lastSyncPrefix: "Updated: ",
    spPlaceholder: "Product Code...",
    btnAddSp: "+ Add",
    today: "Today",
    yesterday: "Yesterday",
    lastMonth: "Last Month",
    thisMonth: "This Month",
    fromLabel: "From:",
    toLabel: "To:",
    btnRefresh: "Refresh",
    btnHeaderUpdate: "Update",
    btnLogout: "Sign Out",
    btnSettings: "Settings",
    companySummaryTitle: "🏢 COMPANY TOTAL",
    totalOrdersUnit: "total orders",
    singleDateFmt: (d) => `Date ${d}`,
    rangeDateFmt: (s, e) => `${s} to ${e}`,
    noRevenueYet: "No revenue",
    metricDS: "REV",
    metricCP: "SPEND",
    metricCPO: "CPA",
    metricCPDS: "SPEND/REV",
    ordersUnit: "orders",
    noOrdersYet: "No orders",
    viewDetailHint: "View details →",
    mktReportHeader: "MARKETER REPORT (Right-click to Copy Spend)",
    mktDetailHeader: (m) => `DETAIL: ${m} (Right-click to Copy Spend)`,
    btnBack: "← Back",
    top5SpHeader: "TOP 10 PRODUCTS",
    emptyMktList: "No orders or ad spend recorded",
    emptyMktDetail: (m) => `${m} has no ad spend or orders yet.`,
    emptySpList: "No product models recorded",
    calMonthYearFmt: (m, y) => `Month ${m} / ${y}`,
    weekdays: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
    settingsTitle: "⚙ SYSTEM SETTINGS",
    lblVoice: "1. Voice Alert (Google TTS):",
    lblPopup: "2. Corner Popup Alert:",
    lblFireworks: "3. Fireworks Celebration:",
    lblFontSize: "4. Font Size:",
    lblUiScale: "5. UI Scale:",
    lblTheme: "6. Appearance (Dark Mode):",
    lblLang: "7. Language:",
    lblAutoStart: "8. Start with Windows:",
    lblUpdate: "8. Auto-Update (GitHub):",
    btnSaveUpdateUrl: "💾 Save & Update",
    btnCheckUpdateNow: "🔄 Check Now",
    updateUrlPlaceholder: "Paste GitHub repo URL (e.g. https://github.com/user/app-lam)...",
    stateOn: "ENABLED",
    stateOff: "DISABLED",
    btnTestVoice: "🔊 Test Voice",
    btnTestPopup: "🎉 Test Popup",
    themeLight: "☀️ Light (Cozy Cream)",
    themeDark: "🌙 Dark (Cozy Mocha)",
    scannerStatus: "Live: Scanning orders (every 3s)",
    knownCodesFmt: (n) => `Recognizing: ${n} product codes`,
    ctxCopyCp: "📋 Copy Spend",
    toastCopiedCp: "Copied Spend",
    toastSavedCode: (c) => `Saved code: ${c}`,
    toastExistingCode: (c) => `Code ${c} already exists!`,
    testPopupTitle: "TEST NEW ORDER",
    newOrderPopupTitle: "UPYO NEW ORDER!",
    allCodesBtn: "📋 All Codes",
    allCodesTitle: "📋 ALL RECOGNIZED CODES",
    colCode: "Code",
    colOrders: "Orders",
    allCodesTotal: "TOTAL",
    crBadgeTitle: "COMPANY LANDING PAGE CLOSING RATE",
    crDescText: "Filtered duplicates & Capture Form",
    crSubHint: "View details →",
    actBadgeTitle: "AVERAGE CALL RESPONSE TIME",
    actDescText: "(excluding break hours)",
    crLblClosed: "CLOSED",
    crLblTotal: "TOTAL LEADS",
    crLblUnclosed: "UNCLOSED",
    crLblRate: "CLOSING RATE",
    closingRatePopupTitle: "🎯 CLOSING RATE BY MARKETER",
    colMkt: "MKT",
    loadingMain: "⏳ Loading data...",
    loadingSub: "Syncing Google Sheets & Facebook Ads",
  },
};

const STORAGE_KEY_EXTRA_CODES = "applam_extra_sp_codes_v8618";
const STORAGE_KEY_VOICE = "applam_bat_thong_bao_gtts_v8618";
const STORAGE_KEY_POPUP = "applam_bat_popup_thong_bao_v8618";
const STORAGE_KEY_FIREWORKS = "applam_bat_phao_hoa_v8618";
const STORAGE_KEY_FONT_SCALE = "applam_font_scale_v8618";
const STORAGE_KEY_UI_SCALE = "applam_ui_scale_v8618";
const STORAGE_KEY_THEME = "applam_theme_v8618";
const STORAGE_KEY_LANG = "applam_lang_v8618";
const STORAGE_KEY_AUTOSTART = "applam_autostart_v8696";
let bat_khoi_dong_cung_win = true;

let KNOWN_CODES = [...KNOWN_CODES_DEFAULT];
let bat_thong_bao_gtts = true;
let bat_popup_thong_bao = true;
let bat_phao_hoa = true;
let font_scale = 100;
let ui_scale = 100;
let current_theme = "light"; // 'light' | 'dark'
let current_lang = "vi"; // 'vi' | 'zh' | 'en'
let last_sync_time_str = "";

let data_hien_tai = [];
let data_tong_don_upyo = [];
let cached_fb_chi_tiet = {};
let cached_fb_tong = {};
let current_start_date = "";
let current_end_date = "";
let current_mkt_detail = null;

// Calendar state
let current_cal_target = null;
let current_cal_year = new Date().getFullYear();
let current_cal_month = new Date().getMonth() + 1;

// Context menu & mouse tracking
let last_mouse_x = window.innerWidth / 2;
let last_mouse_y = window.innerHeight / 2;
let context_menu_spend_value = 0;
let cursor_toast_timer = null;

// Background scanner state
let dong_cuoi_cung = 0;
let scanner_initialized = false;
let tts_queue = Promise.resolve();
let native_exe_mode = false;

function t() {
  return I18N[current_lang] || I18N.vi;
}

// ==============================================================
// HIỆU ỨNG PHÁO HOA & PHÁO GIẤY RỰC RỠ KHI NỔ ĐƠN / TEST POPUP
// ==============================================================
const confettiParticles = [];
let confettiAnimId = null;

function spawn_firework_explosion(cx, cy, colors, count = 42) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.25;
    const speed = 3.5 + Math.random() * 9.5;
    const isCircleSpark = i % 2 === 0;
    confettiParticles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.2,
      size: isCircleSpark ? 4 + Math.random() * 4 : 6 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 14,
      alpha: 1,
      gravity: isCircleSpark ? 0.18 : 0.28,
      decay: isCircleSpark ? 0.014 : 0.011,
      shape: isCircleSpark ? "spark" : "rect",
    });
  }
}

function start_confetti_loop(canvas, ctx) {
  if (confettiAnimId) return;
  function renderConfetti() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = confettiParticles.length - 1; i >= 0; i--) {
      const p = confettiParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity ?? 0.3;
      p.vx *= 0.985;
      p.rotation += p.vRot;
      p.alpha -= p.decay ?? 0.012;

      if (p.alpha <= 0 || p.y > canvas.height + 40) {
        confettiParticles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      if (p.shape === "spark") {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fill();
      } else {
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
      }
      ctx.restore();
    }

    if (confettiParticles.length > 0) {
      confettiAnimId = requestAnimationFrame(renderConfetti);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      confettiAnimId = null;
    }
  }
  confettiAnimId = requestAnimationFrame(renderConfetti);
}

function play_fireworks_sound_web() {
  if (!bat_phao_hoa || native_exe_mode) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // 1. Tiếng rít pháo hoa bay lên
    const osc = ctx.createOscillator();
    const gainW = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(1950, now + 0.34);
    gainW.gain.setValueAtTime(0.01, now);
    gainW.gain.linearRampToValueAtTime(0.18, now + 0.16);
    gainW.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gainW).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);

    // 2. Tiếng nổ pháo hoa + lách tách
    [0.35, 0.62].forEach((offset, idx) => {
      const bTime = now + offset;
      const boomOsc = ctx.createOscillator();
      const boomGain = ctx.createGain();
      boomOsc.type = "triangle";
      boomOsc.frequency.setValueAtTime(135, bTime);
      boomOsc.frequency.exponentialRampToValueAtTime(36, bTime + 0.38);
      boomGain.gain.setValueAtTime(idx === 0 ? 0.45 : 0.35, bTime);
      boomGain.gain.exponentialRampToValueAtTime(0.001, bTime + 0.42);
      boomOsc.connect(boomGain).connect(ctx.destination);
      boomOsc.start(bTime);
      boomOsc.stop(bTime + 0.44);

      const bufSize = ctx.sampleRate * 0.9;
      const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        const env = Math.exp(-i / (ctx.sampleRate * 0.24));
        const crackle = Math.random() > 0.92 ? (Math.random() * 2 - 1) * 1.4 : (Math.random() * 2 - 1) * 0.35;
        data[i] = crackle * env;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1800;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.32, bTime);
      nGain.gain.exponentialRampToValueAtTime(0.01, bTime + 0.88);
      noise.connect(filter).connect(nGain).connect(ctx.destination);
      noise.start(bTime);
    });
  } catch (e) {}
}

function trigger_confetti_burst(customX, customY) {
  if (!bat_phao_hoa) return;
  play_fireworks_sound_web();
  const canvas = document.getElementById("confettiCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = [
    "#F59E0B",
    "#16A34A",
    "#B45309",
    "#FBBF24",
    "#DC2626",
    "#D97706",
    "#10B981",
    "#F97316",
  ];
  const originX = customX !== undefined ? customX : (window.innerWidth - 160);
  const originY = customY !== undefined ? customY : (window.innerHeight - 90);

  // 1. Pháo giấy bắn vọt cao từ góc popup thông báo
  for (let i = 0; i < 65; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.45;
    const speed = 7 + Math.random() * 13;
    confettiParticles.push({
      x: originX + (Math.random() - 0.5) * 90,
      y: originY,
      vx: Math.cos(angle) * speed - 2.5,
      vy: Math.sin(angle) * speed - 4,
      size: 6 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 14,
      alpha: 1,
      gravity: 0.28,
      decay: 0.011,
      shape: "rect",
    });
  }

  // 2. Các chùm pháo hoa nổ trên không trung (giống hệt lúc chúc mừng nổ đơn)
  spawn_firework_explosion(
    Math.max(180, window.innerWidth - 240),
    Math.max(140, window.innerHeight - 280),
    colors,
    44
  );

  setTimeout(() => {
    spawn_firework_explosion(
      Math.max(140, window.innerWidth * 0.68),
      Math.max(120, window.innerHeight * 0.35),
      colors,
      46
    );
    start_confetti_loop(canvas, ctx);
  }, 220);

  setTimeout(() => {
    spawn_firework_explosion(
      Math.max(120, window.innerWidth * 0.42),
      Math.max(110, window.innerHeight * 0.3),
      colors,
      44
    );
    start_confetti_loop(canvas, ctx);
  }, 460);

  start_confetti_loop(canvas, ctx);
}

// ==============================================================
// HIỆU ỨNG ĐẾM SỐ MƯỢT (COUNT-UP ANIMATION)
// ==============================================================
function animate_number(el, targetVal, formatter, duration = 560) {
  if (!el) return;
  const target = Number(targetVal) || 0;
  if (target === 0) {
    el.textContent = formatter(0);
    return;
  }
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOutQuart = 1 - Math.pow(1 - progress, 4);
    const current = target * easeOutQuart;
    el.textContent = formatter(progress >= 1 ? target : current);
    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }
  requestAnimationFrame(tick);
}

// ==============================================================
// QUẢN LÝ CẤU HÌNH, GIAO DIỆN, NGÔN NGỮ & MÃ SẢN PHẨM
// ==============================================================
function doc_cau_hinh_tu_storage() {
  try {
    const savedVoice = localStorage.getItem(STORAGE_KEY_VOICE);
    if (savedVoice !== null) bat_thong_bao_gtts = savedVoice === "true";

    const savedPopup = localStorage.getItem(STORAGE_KEY_POPUP);
    if (savedPopup !== null) bat_popup_thong_bao = savedPopup === "true";

    const savedFireworks = localStorage.getItem(STORAGE_KEY_FIREWORKS);
    if (savedFireworks !== null) bat_phao_hoa = savedFireworks === "true";

    const savedFontScale = parseInt(localStorage.getItem(STORAGE_KEY_FONT_SCALE) || "100", 10);
    if (!Number.isNaN(savedFontScale) && savedFontScale >= 80 && savedFontScale <= 140) {
      font_scale = savedFontScale;
    }

    const savedUiScale = parseInt(localStorage.getItem(STORAGE_KEY_UI_SCALE) || "100", 10);
    if (!Number.isNaN(savedUiScale) && savedUiScale >= 80 && savedUiScale <= 135) {
      ui_scale = savedUiScale;
    }

    const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
    if (savedTheme === "dark" || savedTheme === "light") {
      current_theme = savedTheme;
    }

    const savedAutoStart = localStorage.getItem(STORAGE_KEY_AUTOSTART);
    if (savedAutoStart !== null) bat_khoi_dong_cung_win = savedAutoStart === "true";

    const savedLang = localStorage.getItem(STORAGE_KEY_LANG);
    if (savedLang && I18N[savedLang]) {
      current_lang = savedLang;
    }

    const rawExtra = localStorage.getItem(STORAGE_KEY_EXTRA_CODES);
    let extraSp = [];
    if (rawExtra) {
      extraSp = JSON.parse(rawExtra)
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean);
    }
    KNOWN_CODES = Array.from(new Set([...KNOWN_CODES_DEFAULT, ...extraSp]));
  } catch (e) {
    KNOWN_CODES = [...KNOWN_CODES_DEFAULT];
  }
  apply_theme_ui();
apply_scale_ui();
  cap_nhat_so_luong_ma_sp_ui();
}

function apply_scale_ui() {
  const fontValEl = document.getElementById("fontScaleVal");
  const uiValEl = document.getElementById("uiScaleVal");
  if (fontValEl) fontValEl.textContent = `${font_scale}%`;
  if (uiValEl) uiValEl.textContent = `${ui_scale}%`;

  let styleEl = document.getElementById("dynamicScaleStyle");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "dynamicScaleStyle";
    document.head.appendChild(styleEl);
  }

  const f = font_scale / 100;
  const u = ui_scale / 100;
  const tf = f * u;

  if (font_scale === 100 && ui_scale === 100) {
    styleEl.textContent = "";
    return;
  }

  styleEl.textContent = `
    .app-container {
      padding: ${Math.round(22 * u)}px ${Math.round(48 * u)}px !important;
    }
    .main-title-card {
      height: ${Math.round(58 * u)}px !important;
      min-width: ${Math.round(390 * u)}px !important;
      padding: 0 ${Math.round(20 * u)}px !important;
    }
    .app-logo-badge {
      width: ${Math.round(38 * u)}px !important;
      height: ${Math.round(38 * u)}px !important;
      font-size: ${(21 * tf).toFixed(1)}px !important;
    }
    .main-title-card h1 { font-size: ${(20 * tf).toFixed(1)}px !important; }
    .live-badge-pill { font-size: ${(10 * tf).toFixed(1)}px !important; }
    .last-sync-text { font-size: ${(11 * tf).toFixed(1)}px !important; }
    .entry-sp {
      width: ${Math.round(122 * u)}px !important;
      height: ${Math.round(37 * u)}px !important;
      font-size: ${(13 * tf).toFixed(1)}px !important;
    }
    .date-control-frame .rounded-btn,
    .btn-back {
      height: ${Math.round(37 * u)}px !important;
      padding: 0 ${Math.round(14 * u)}px !important;
      font-size: ${(13 * tf).toFixed(1)}px !important;
    }
    .date-label { font-size: ${(13 * tf).toFixed(1)}px !important; }
    .badge-holder { margin-bottom: ${Math.round(18 * u)}px !important; }
    .dashboard-columns { gap: ${Math.round(28 * u)}px !important; }
    .cards-list { gap: ${Math.round(10 * u)}px !important; }
    .section-header-card {
      height: ${Math.round(42 * u)}px !important;
      padding: 0 ${Math.round(18 * u)}px !important;
      font-size: ${(15 * tf).toFixed(1)}px !important;
    }
    .cozy-card {
      min-height: ${Math.round(98 * u)}px !important;
      padding: ${Math.round(11 * u)}px ${Math.round(20 * u)}px ${Math.round(10 * u)}px ${Math.round(20 * u)}px !important;
      border-radius: ${Math.round(16 * u)}px !important;
    }
    .card-name { font-size: ${(15.5 * tf).toFixed(1)}px !important; }
    .rank-pill, .card-sub-label, .cpds-pill { font-size: ${(13.5 * tf).toFixed(1)}px !important; }
    .card-click-hint, .metric-label { font-size: ${(11 * tf).toFixed(1)}px !important; }
    .card-count-val { font-size: ${(20 * tf).toFixed(1)}px !important; }
    .card-count-unit { font-size: ${(12.5 * tf).toFixed(1)}px !important; }
    .metric-value { font-size: ${(15 * tf).toFixed(1)}px !important; }
    .empty-state-msg, .ac-title { font-size: ${(15 * tf).toFixed(1)}px !important; }
    .ac-table { font-size: ${(13 * tf).toFixed(1)}px !important; }
    .ac-table th { font-size: ${(12 * tf).toFixed(1)}px !important; }
  `;
}

function apply_theme_ui() {
  if (current_theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  const btnTheme = document.getElementById("btnToggleTheme");
  if (btnTheme) {
    btnTheme.textContent =
      current_theme === "dark" ? t().themeDark : t().themeLight;
    btnTheme.classList.toggle("btn-choco", current_theme === "dark");
    btnTheme.classList.toggle("btn-default", current_theme !== "dark");
  }
}

function apply_language_ui(rerenderDashboard = false) {
  const dict = t();
  document.documentElement.lang = current_lang;

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText("mainTitleText", dict.mainTitle);
  setText("liveBadgeText", dict.liveBadge);
  if (last_sync_time_str) {
    setText("lastSyncText", `${dict.lastSyncPrefix}${last_sync_time_str}`);
  } else {
    setText("lastSyncText", dict.initializing);
  }

  const entrySp = document.getElementById("entrySp");
  if (entrySp) entrySp.placeholder = dict.spPlaceholder;

  setText("btnThemSpText", dict.btnAddSp);
  setText("btnAllCodesText", dict.allCodesBtn);
  setText("crBadgeTitle", dict.crBadgeTitle);
  setText("crDescText", dict.crDescText);
  setText("crSubHint", dict.crSubHint);
  setText("actBadgeTitle", dict.actBadgeTitle);
  setText("actDescText", dict.actDescText);
  setText("crLblClosed", dict.crLblClosed);
  setText("crLblTotal", dict.crLblTotal);
  setText("crLblUnclosed", dict.crLblUnclosed);
  setText("crLblRate", dict.crLblRate);
  render_all_codes_table();
  render_closing_rate_popup_table();
  setText("btnToday", dict.today);
  setText("btnYesterday", dict.yesterday);
  setText("btnLastMonth", dict.lastMonth);
  setText("btnThisMonth", dict.thisMonth);
  setText("lblFromDate", dict.fromLabel);
  setText("lblToDate", dict.toLabel);
  setText("btnRefreshText", dict.btnRefresh);
  setText("btnHeaderUpdateText", dict.btnHeaderUpdate);
  setText("btnLogoutText", dict.btnLogout);
  setText("btnSettingsText", dict.btnSettings);
  setText("btnBackMktText", dict.btnBack);
  setText("headerSpText", dict.top5SpHeader);

  setText("settingsTitleText", dict.settingsTitle);
  setText("lblSettingVoice", dict.lblVoice);
  setText("lblSettingPopup", dict.lblPopup);
  setText("lblSettingFireworks", dict.lblFireworks);
  setText("lblSettingFontSize", dict.lblFontSize);
  setText("lblSettingUiScale", dict.lblUiScale);
  setText("lblSettingTheme", dict.lblTheme);
  setText("lblSettingLang", dict.lblLang);
  setText("lblSettingAutoStart", dict.lblAutoStart);

  setText("btnTestVoice", dict.btnTestVoice);
  setText("btnTestPopup", dict.btnTestPopup);
  setText("scannerStatusText", dict.scannerStatus);
  setText("contextMenuCopyText", dict.ctxCopyCp);
  setText("loadingMainText", dict.loadingMain);
  setText("loadingSubText", dict.loadingSub);

  // Cập nhật các thứ trong tuần trên lịch
  const weekdaysRow = document.getElementById("calWeekdaysRow");
  if (weekdaysRow && Array.isArray(dict.weekdays)) {
    weekdaysRow.innerHTML = dict.weekdays
      .map((w) => `<span>${w}</span>`)
      .join("");
  }

  // Cập nhật trạng thái nút ngôn ngữ
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle(
      "active-lang",
      btn.getAttribute("data-lang") === current_lang
    );
  });

  cap_nhat_giao_dien_toggle_init();
  apply_theme_ui();
  cap_nhat_so_luong_ma_sp_ui();

  const calPopup = document.getElementById("calendarPopup");
  if (calPopup && !calPopup.classList.contains("hidden")) {
    render_calendar_grid(current_cal_year, current_cal_month);
  }

  if (rerenderDashboard && current_start_date && current_end_date) {
    ve_noi_dung_dashboard(
      current_start_date,
      current_end_date,
      cached_fb_chi_tiet,
      cached_fb_tong
    );
  }
}

async function dong_bo_cau_hinh_tu_server_neu_co() {
  if (!window.location.protocol.startsWith("http")) return;
  try {
    const res = await fetch("/api/codes", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.nativeExe) {
      native_exe_mode = true;
    }
    if (Array.isArray(data.codes)) {
      const merged = Array.from(
        new Set([
          ...KNOWN_CODES,
          ...data.codes.map((c) => String(c).trim().toUpperCase()).filter(Boolean),
        ])
      );
      KNOWN_CODES = merged;
      const extraOnly = merged.filter((c) => !KNOWN_CODES_DEFAULT.includes(c));
      localStorage.setItem(STORAGE_KEY_EXTRA_CODES, JSON.stringify(extraOnly));
      cap_nhat_so_luong_ma_sp_ui();
    }
    if (typeof data.voice === "boolean") {
      bat_thong_bao_gtts = data.voice;
      localStorage.setItem(STORAGE_KEY_VOICE, String(bat_thong_bao_gtts));
    }
    if (typeof data.popup === "boolean") {
      bat_popup_thong_bao = data.popup;
      localStorage.setItem(STORAGE_KEY_POPUP, String(bat_popup_thong_bao));
    }
    if (typeof data.fireworks === "boolean") {
      bat_phao_hoa = data.fireworks;
      localStorage.setItem(STORAGE_KEY_FIREWORKS, String(bat_phao_hoa));
    }

    if (typeof data.autostart === "boolean") {
      bat_khoi_dong_cung_win = data.autostart;
      localStorage.setItem(STORAGE_KEY_AUTOSTART, String(bat_khoi_dong_cung_win));
      cap_nhat_giao_dien_toggle_init();
    }

    // Đồng bộ thông tin tự động cập nhật từ Server C#
    try {
      const headerVerEl = document.getElementById("headerVersionBadge");
      if (headerVerEl) headerVerEl.textContent = `v${APP_FRONTEND_VERSION}`;

      const upRes = await fetch("/api/update-status", { cache: "no-store" });
      if (upRes.ok) {
        const upData = await upRes.json();
        if (headerVerEl) {
          const rawVer = String(upData.version || "").replace(/^v/i, "").replace(/^(\d+\.\d+\.\d+)\.\d+$/, "$1");
          const displayVer = (rawVer && compare_semver(rawVer, APP_FRONTEND_VERSION) > 0) ? rawVer : APP_FRONTEND_VERSION;
          headerVerEl.textContent = `v${displayVer}`;
        }
      }
    } catch (e) {}
  } catch (e) {}
}

function dong_bo_settings_len_server() {
  if (!window.location.protocol.startsWith("http")) return;
  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voice: bat_thong_bao_gtts,
      popup: bat_popup_thong_bao,
      fireworks: bat_phao_hoa,
      autostart: bat_khoi_dong_cung_win,
    }),
  }).catch(() => {});
}

function luu_sp_moi(sp_name) {
  const clean = String(sp_name || "").trim().toUpperCase();
  if (!clean || KNOWN_CODES.includes(clean)) return false;

  try {
    const rawExtra = localStorage.getItem(STORAGE_KEY_EXTRA_CODES);
    const extraSp = rawExtra ? JSON.parse(rawExtra) : [];
    if (!extraSp.includes(clean)) {
      extraSp.push(clean);
      localStorage.setItem(STORAGE_KEY_EXTRA_CODES, JSON.stringify(extraSp));
    }
    doc_cau_hinh_tu_storage();

    if (window.location.protocol.startsWith("http")) {
      fetch("/api/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean }),
      }).catch(() => {});
    }
    return true;
  } catch (e) {
    return false;
  }
}

function cap_nhat_so_luong_ma_sp_ui() {
  const el = document.getElementById("knownCodesCount");
  if (el) {
    el.textContent = t().knownCodesFmt(KNOWN_CODES.length);
  }
}

// ==============================================================
// CÁC HÀM XỬ LÝ TEXT, GIÁ TIỀN, MÃ MẪU & ĐỊNH DẠNG
// ==============================================================
function parse_gia_tien(raw_val) {
  if (!raw_val) return 0;
  const s = String(raw_val)
    .toLowerCase()
    .replace(/đ/g, "")
    .replace(/vnd/g, "")
    .replace(/\./g, "")
    .replace(/,/g, "")
    .trim();
  const digits = s.match(/\d+/g);
  if (digits && digits.length > 0) {
    const parsed = parseInt(digits.join(""), 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function format_tien_vnd(val) {
  const intVal = Math.trunc(Number(val) || 0);
  if (intVal <= 0) return "0 đ";
  return intVal.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " đ";
}

function escape_html(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function chuan_hoa_tieng_anh(text) {
  let text_lower = String(text || "").toLowerCase();
  for (const [tu_goc, phat_am] of Object.entries(TU_DIEN_PHAT_AM)) {
    text_lower = text_lower.split(tu_goc).join(phat_am);
  }
  return text_lower;
}

function trich_xuat_ten_mau_thong_minh(raw_text) {
  const text_up = String(raw_text || "").trim().toUpperCase();
  if (!text_up) return "CHƯA XÁC ĐỊNH";

  for (const code of KNOWN_CODES) {
    if (text_up.includes(code)) return code;
  }

  const parts = text_up.split(/[-_\s/]+/);
  const tu_tiem_nang = [];
  for (let p of parts) {
    p = p.trim();
    if (!p || /^\d+$/.test(p) || TU_KHOA_LOAI_BO.has(p)) continue;
    if (/^\d{1,2}\/\d{1,2}/.test(p)) continue;
    tu_tiem_nang.push(p);
  }
  if (tu_tiem_nang.length > 0) return tu_tiem_nang[0];

  const words = text_up.split(/\s+/).filter(Boolean);
  return words.length > 0 ? words[0] : text_up.slice(0, 12);
}

// ==============================================================
// ÂM THANH (CHỊ GOOGLE TTS)
// ==============================================================
function doc_am_thanh(text, force_play = false) {
  if (!bat_thong_bao_gtts && !force_play) return;
  const text_doc = chuan_hoa_tieng_anh(text);

  tts_queue = tts_queue
    .then(() => phat_am_thanh_tuan_tu(text_doc, force_play))
    .catch(() => {});
}

async function phat_am_thanh_tuan_tu(text_doc, force_play = false) {
  if (window.location.protocol.startsWith("http")) {
    try {
      const apiRes = await fetch(
        `/api/tts?q=${encodeURIComponent(text_doc)}&force=${force_play ? "1" : "0"}&t=${Date.now()}`
      );
      if (apiRes.ok) {
        const contentType = apiRes.headers.get("content-type") || "";
        if (contentType.includes("json")) {
          // C# backend đã tự động giảm âm lượng các tab/app khác, phát giọng Chị Google và tăng âm lượng trở lại
          return;
        }
        if (contentType.includes("audio") || apiRes.status === 200) {
          const blob = await apiRes.blob();
          if (blob && blob.size > 200) {
            const blobUrl = URL.createObjectURL(blob);
            try {
              await play_audio_url(blobUrl);
            } finally {
              URL.revokeObjectURL(blobUrl);
            }
            return;
          }
        }
      }
    } catch (e) {
      console.warn("TTS API fetch failed:", e);
    }
  }

  // Fallback 1: Trực tiếp Google TTS
  const gttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(
    text_doc
  )}`;
  try {
    await play_audio_url(gttsUrl);
    return;
  } catch (e) {
    // Fallback 2: Trình đọc giọng nói có sẵn trên Windows (Web Speech API)
    await play_web_speech_vi(text_doc);
  }
}

function play_audio_url(url) {
  return new Promise((resolve, reject) => {
    try {
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.volume = 1.0;
      let finished = false;
      const end = (isErr = false, err = null) => {
        if (finished) return;
        finished = true;
        if (isErr) reject(err || new Error("Play error"));
        else resolve();
      };

      audio.onended = () => end(false);
      audio.onerror = (err) => end(true, err);
      audio.src = url;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => end(true, err));
      }
    } catch (err) {
      reject(err);
    }
  });
}

function play_web_speech_vi(text_doc) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) {
      resolve();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text_doc);
      utter.lang = "vi-VN";
      utter.rate = 1.0;
      utter.volume = 1.0;

      const speak = () => {
        const voices = window.speechSynthesis.getVoices();
        const viVoice = voices.find((v) =>
          v.lang && (v.lang.toLowerCase().includes("vi") || v.lang.toLowerCase().includes("vie"))
        );
        if (viVoice) utter.voice = viVoice;
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        window.speechSynthesis.speak(utter);
      };

      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        speak();
      } else {
        window.speechSynthesis.onvoiceschanged = () => {
          speak();
        };
        setTimeout(() => {
          try { window.speechSynthesis.speak(utter); } catch (e) {}
          resolve();
        }, 600);
      }
    } catch (e) {
      resolve();
    }
  });
}

// ==============================================================
// PARSE CSV & TẢI DỮ LIỆU GOOGLE SHEETS (Hỗ trợ ô chứa ký tự xuống dòng \n bên trong dấu ngoặc kép)
// ==============================================================
function parse_csv_lines(csvText) {
  const text = String(csvText || "");
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && i + 1 < text.length && text[i + 1] === "\n") {
          i++;
        }
        cur += " ";
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cur);
        cur = "";
      } else if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && i + 1 < text.length && text[i + 1] === "\n") {
          i++;
        }
        row.push(cur);
        if (row.some((field) => field.trim().length > 0)) {
          rows.push(row);
        }
        row = [];
        cur = "";
      } else {
        cur += ch;
      }
    }
  }

  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    if (row.some((field) => field.trim().length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

async function fetch_csv_with_fallback(primaryUrl, fallbackUrl, apiType) {
  const ts = Date.now();
  const urlsToTry = [];
  if (window.location.protocol.startsWith("http")) {
    urlsToTry.push(`/api/csv?type=${apiType}&t=${ts}`);
  }
  urlsToTry.push(`${primaryUrl}&t=${ts}`, `${fallbackUrl}&t=${ts}`);

  for (const url of urlsToTry) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      const res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const text = await res.text();
        if (text && !text.trim().startsWith("<!DOCTYPE html")) {
          return parse_csv_lines(text);
        }
      }
    } catch (e) {}
  }
  return null;
}

async function tai_du_lieu_google_sheets() {
  doc_cau_hinh_tu_storage();

  // Tải ngầm bảng thông báo/tỉ lệ chốt song song, hoàn toàn không chặn màn hình tải
  fetch_csv_with_fallback(
    CSV_URL_THONG_BAO,
    CSV_URL_THONG_BAO_FALLBACK,
    "thong_bao"
  ).then((rowsThongBao) => {
    if (rowsThongBao && rowsThongBao.length > 0) {
      data_tong_don_upyo = rowsThongBao;
      try {
        render_closing_rate_card(tinh_ty_le_chot_theo_ngay(current_start_date, current_end_date));
      } catch (e) {}
    }
  }).catch(() => {});

  // Giao diện chính chỉ cần chờ bảng thống kê (Doanh số, Đơn, MKT - cực nhẹ, tải dưới 0.5s)
  const rowsThongKe = await fetch_csv_with_fallback(
    CSV_URL_THONG_KE,
    CSV_URL_THONG_KE_FALLBACK,
    "thong_ke"
  );
  if (rowsThongKe && rowsThongKe.length > 0) {
    data_hien_tai = rowsThongKe;
    return true;
  }
  return false;
}

// ==============================================================
// QUÉT CHI PHÍ FACEBOOK ADS (CÓ PHÂN TRANG & GIỚI HẠN 100 CHIẾN DỊCH)
// ==============================================================
async function quet_chi_phi_facebook_helper(start_str, end_str) {
  const local_chi_tiet = {};
  const local_tong = {};
  for (const m of LIST_MKT_FB) {
    local_chi_tiet[m.ten] = {};
    local_tong[m.ten] = 0.0;
  }

  const time_range = JSON.stringify({ since: start_str, until: end_str });

    const uniqueAccounts = [];
  const seenActs = new Set();
  for (const m of LIST_MKT_FB) {
    if (!seenActs.has(m.id)) {
      seenActs.add(m.id);
      uniqueAccounts.push(m.id);
    }
  }

  await Promise.all(
    uniqueAccounts.map(async (actId) => {
      let url =
        "https://graph.facebook.com/v19.0/" +
        actId +
        "/insights?level=campaign&fields=campaign_name,spend&time_range=" +
        encodeURIComponent(time_range) +
        "&limit=100&access_token=" +
        get_fb_token();

      while (url) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10000);
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timer);

          const res = await response.json();
          if (!res || res.error) {
            break;
          }

          const data = Array.isArray(res.data) ? res.data : [];
          for (const item of data) {
            const camp_name = String(item.campaign_name || "").trim();
            const spend = parseFloat(item.spend || 0.0);
            if (!spend || spend <= 0) continue;

            const ten_mau = trich_xuat_ten_mau_thong_minh(camp_name);
            const campUpper = camp_name.toUpperCase();
            const campNoDau = bo_dau_tieng_viet(camp_name).toUpperCase();

            let targetMkt = null;
            if (actId === "act_1333165132087237") {
              if (campNoDau.includes("DUNG")) {
                targetMkt = "D\u0168NG";
              } else if (campUpper.includes("LS")) {
                targetMkt = "SAN";
              }
            } else {
              const found = LIST_MKT_FB.find((m) => m.id === actId);
              if (found) targetMkt = found.ten;
            }

            if (targetMkt && local_chi_tiet[targetMkt]) {
              local_chi_tiet[targetMkt][ten_mau] =
                (local_chi_tiet[targetMkt][ten_mau] || 0.0) + spend;
              local_tong[targetMkt] += spend;
            }
          }

          if (res.paging && res.paging.next) {
            url = res.paging.next;
          } else {
            url = null;
          }
        } catch (e) {
          break;
        }
      }
    })
  );

  return { local_chi_tiet, local_tong };
}

// ==============================================================
// ĐẾM ĐƠN CHI TIẾT THEO NGÀY
// ==============================================================
function parse_ymd_date(str) {
  const parts = String(str || "").split("-").map(Number);
  if (parts.length === 3 && !parts.some(Number.isNaN)) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function format_ymd_date(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function tao_cac_dang_ngay_khop(start_str, end_str) {
  let start_date = parse_ymd_date(start_str);
  let end_date = parse_ymd_date(end_str);
  if (start_date > end_date) {
    const tmp = start_date;
    start_date = end_date;
    end_date = tmp;
  }

  const date_patterns = new Set();
  const curr = new Date(start_date.getTime());
  while (curr <= end_date) {
    const y = curr.getFullYear();
    const m = curr.getMonth() + 1;
    const d = curr.getDate();
    const dd = String(d).padStart(2, "0");
    const mm = String(m).padStart(2, "0");

    date_patterns.add(`${dd}/${mm}/${y}`);
    date_patterns.add(`${mm}/${dd}/${y}`);
    date_patterns.add(`${y}-${mm}-${dd}`);
    date_patterns.add(`${d}/${m}/${y}`);

    curr.setDate(curr.getDate() + 1);
  }

  return Array.from(date_patterns);
}

function dem_don_chi_tiet_theo_ngay(start_str, end_str) {
  const patternsArr = tao_cac_dang_ngay_khop(start_str, end_str);

  const stats_mkt_don = {};
  const stats_mkt_dt = {};
  const stats_sp_don = {};
  const stats_sp_dt = {};
  const stats_mkt_sp_don = {};
  const stats_mkt_sp_dt = {};

  for (const r of data_hien_tai) {
    if (r.length > 13) {
      const tg = String(r[0] || "").trim();
      const is_matched_date = patternsArr.some((p) => tg.includes(p));

      if (is_matched_date) {
        if (la_don_hop_le_de_dem(r[13])) {
          const mkt = String(r[12] || "").trim().toUpperCase();
          let mkt_norm = "KHÁC";
          if (mkt && !["MKT", "MARKETER", "TÊN MKT", "SALE", "KHÁC", "KHAC"].includes(mkt)) {
            if (mkt.includes("THANH") || mkt.includes("TH.LÂM")) {
              mkt_norm = "TH.LÂM";
            } else if (mkt.includes("LÂM")) {
              mkt_norm = "LÂM";
            } else if (mkt.includes("PHÚC")) {
              mkt_norm = "PHÚC";
            } else if (mkt.includes("TÂM")) {
              mkt_norm = "TÂM";
            } else if (mkt.includes("SAN")) {
              mkt_norm = "SAN";
            } else if (mkt.includes("D\u0168NG") || mkt.includes("DUNG")) {
              mkt_norm = "D\u0168NG";
            } else {
              mkt_norm = mkt;
            }
          }

          // Không tính những đơn chưa điền tên MKT (đang hiện KHÁC) hoặc chưa điền tên SP
          if (mkt_norm === "KHÁC") {
            continue;
          }

          const raw_sp_text = r.length > 5 ? String(r[5] || "").trim() : "";
          let ten_mau = "";
          if (
            raw_sp_text &&
            !["DÒNG SP", "TÊN SP", "SẢN PHẨM", "MÃ SP", "MÃ"].includes(
              raw_sp_text.toUpperCase()
            )
          ) {
            ten_mau = trich_xuat_ten_mau_thong_minh(raw_sp_text);
          }

          if (!ten_mau) {
            continue;
          }

          const gia_ban = r.length > 8 ? parse_gia_tien(r[8]) : 0;

          stats_mkt_don[mkt_norm] = (stats_mkt_don[mkt_norm] || 0) + 1;
          stats_mkt_dt[mkt_norm] = (stats_mkt_dt[mkt_norm] || 0.0) + gia_ban;

          stats_sp_don[ten_mau] = (stats_sp_don[ten_mau] || 0) + 1;
          stats_sp_dt[ten_mau] = (stats_sp_dt[ten_mau] || 0.0) + gia_ban;

          if (!stats_mkt_sp_don[mkt_norm]) {
            stats_mkt_sp_don[mkt_norm] = {};
            stats_mkt_sp_dt[mkt_norm] = {};
          }
          stats_mkt_sp_don[mkt_norm][ten_mau] =
            (stats_mkt_sp_don[mkt_norm][ten_mau] || 0) + 1;
          stats_mkt_sp_dt[mkt_norm][ten_mau] =
            (stats_mkt_sp_dt[mkt_norm][ten_mau] || 0.0) + gia_ban;
        }
      }
    }
  }

  const sorted_mkt_entries = Object.entries(stats_mkt_don).sort(
    (a, b) => b[1] - a[1]
  );
  const sorted_sp_entries = Object.entries(stats_sp_don).sort(
    (a, b) => b[1] - a[1]
  );

  return {
    sorted_mkt: Object.fromEntries(sorted_mkt_entries),
    stats_mkt_dt,
    sorted_sp: Object.fromEntries(sorted_sp_entries),
    stats_sp_dt,
    stats_mkt_sp_don,
    stats_mkt_sp_dt,
  };
}

// Chuyển 1 dòng dữ liệu từ bảng Google Sheets (Cột A -> P) thành object chuẩn
function map_sheet_row_a_to_p(r, rowNum, mktOverride) {
  let sdt = String(r[3] || "").trim();
  if (sdt.length === 9 && !sdt.startsWith("0")) {
    sdt = "0" + sdt;
  }
  const tgRaw = String(r[0] || "").trim();
  const ngayOnly = tgRaw ? tgRaw.split(/\s+/)[0] : "";
  const giaBan = r.length > 8 ? parse_gia_tien(r[8]) : 0;
  const giaBanRaw = r.length > 8 ? String(r[8] || "").trim() : "";
  const phiShip = r.length > 9 ? parse_gia_tien(r[9]) : 0;
  const phiShipRaw = r.length > 9 ? String(r[9] || "").trim() : "";
  const mktRaw = r.length > 12 ? String(r[12] || "").trim() : "";
  const mktVal = mktOverride !== undefined && mktOverride !== null ? mktOverride : (mktRaw ? mktRaw.toUpperCase() : "");
  const trangThai = r.length > 13 ? String(r[13] || "").trim() : "";
  const soLuongStr = r.length > 14 ? String(r[14] || "").trim() : "";
  const soLuongNum = parseInt(soLuongStr, 10) || (soLuongStr ? 1 : 0);
  const ghiChu = r.length > 15 ? String(r[15] || "").trim() : "";

  return {
    row_num: rowNum,
    thoi_gian: tgRaw,
    ngay_only: ngayOnly,
    ma_van_don: String(r[1] || "").trim(),
    ho_ten: String(r[2] || "").trim(),
    sdt: sdt,
    dia_chi: String(r[4] || "").trim(),
    dong_sp: r.length > 5 ? String(r[5] || "").trim() : "",
    mau_sac: r.length > 6 ? String(r[6] || "").trim() : "",
    size: r.length > 7 ? String(r[7] || "").trim() : "",
    gia_ban: giaBan,
    gia_ban_str: giaBan > 0 ? format_tien_vnd(giaBan) : giaBanRaw,
    phi_ship: phiShip,
    phi_ship_str: phiShip > 0 ? format_tien_vnd(phiShip) : phiShipRaw,
    nen_tang: r.length > 10 ? String(r[10] || "").trim() : "",
    sale: r.length > 11 ? String(r[11] || "").trim() : "",
    mkt: mktVal,
    mkt_raw: mktRaw,
    trang_thai: trangThai,
    so_luong: soLuongStr,
    so_luong_num: soLuongNum,
    ghi_chu: ghiChu,
  };
}

// Lấy TOÀN BỘ đơn hàng thực có trong bảng từ cột A đến cột P (Loại bỏ các dòng mẫu trống ở cuối Sheet chỉ có sẵn ngày)
function lay_tat_ca_don_hang_tu_bang_a_den_p(onlySelectedDateRange = false) {
  if (!Array.isArray(data_hien_tai) || data_hien_tai.length === 0) return [];
  const patternsArr = onlySelectedDateRange
    ? tao_cac_dang_ngay_khop(current_start_date || "", current_end_date || "")
    : null;

  const ket_qua = [];
  for (let i = 0; i < data_hien_tai.length; i++) {
    const r = data_hien_tai[i];
    if (!Array.isArray(r) || r.length === 0) continue;

    // Bỏ qua dòng tiêu đề (Header row)
    const c0 = bo_dau_tieng_viet(String(r[0] || "").trim()).toUpperCase();
    const c2 = bo_dau_tieng_viet(String(r[2] || "").trim()).toUpperCase();
    if (c0 === "THOI GIAN" || c0 === "STT" || c2 === "HO TEN") continue;

    // QUAN TRỌNG: Bỏ qua các dòng chưa có thông tin khách hàng (họ tên, SĐT, địa chỉ đều trống)
    const hoTen = r.length > 2 ? String(r[2] || "").trim() : "";
    const sdtRaw = r.length > 3 ? String(r[3] || "").trim() : "";
    const diaChi = r.length > 4 ? String(r[4] || "").trim() : "";

    if (!hoTen && !sdtRaw && !diaChi) {
      continue;
    }

    if (patternsArr) {
      const tg = String(r[0] || "").trim();
      if (!patternsArr.some((p) => tg.includes(p))) continue;
    }

    ket_qua.push(map_sheet_row_a_to_p(r, i + 1, null));
  }
  return ket_qua;
}

// Lấy danh sách các đơn hàng thực tế đã được đếm (khớp ngày, MKT, SP và trạng thái hợp lệ)
function lay_danh_sach_don_chi_tiet(ten_mkt, ten_sp) {
  if (!Array.isArray(data_hien_tai) || data_hien_tai.length === 0) return [];
  const start_str = current_start_date || "";
  const end_str = current_end_date || "";
  const patternsArr = tao_cac_dang_ngay_khop(start_str, end_str);

  const ket_qua = [];
  for (let i = 0; i < data_hien_tai.length; i++) {
    const r = data_hien_tai[i];
    if (r.length <= 13) continue;

    const tg = String(r[0] || "").trim();
    const is_matched_date = patternsArr.some((p) => tg.includes(p));
    if (!is_matched_date) continue;

    if (!la_don_hop_le_de_dem(r[13])) continue;

    const mkt = String(r[12] || "").trim().toUpperCase();
    let mkt_norm = "KHÁC";
    if (mkt && !["MKT", "MARKETER", "TÊN MKT", "SALE", "KHÁC", "KHAC"].includes(mkt)) {
      if (mkt.includes("THANH") || mkt.includes("TH.LÂM")) {
        mkt_norm = "TH.LÂM";
      } else if (mkt.includes("LÂM")) {
        mkt_norm = "LÂM";
      } else if (mkt.includes("PHÚC")) {
        mkt_norm = "PHÚC";
      } else if (mkt.includes("TÂM")) {
        mkt_norm = "TÂM";
      } else if (mkt.includes("SAN")) {
        mkt_norm = "SAN";
      } else if (mkt.includes("D\u0168NG") || mkt.includes("DUNG")) {
        mkt_norm = "D\u0168NG";
      } else {
        mkt_norm = mkt;
      }
    }

    if (mkt_norm === "KHÁC") continue;
    if (ten_mkt) {
      const matchMkt = (mkt_norm === ten_mkt) ||
                       (bo_dau_tieng_viet(mkt_norm).toUpperCase() === bo_dau_tieng_viet(ten_mkt).toUpperCase());
      if (!matchMkt) continue;
    }

    const raw_sp_text = r.length > 5 ? String(r[5] || "").trim() : "";
    let ten_mau = "";
    if (
      raw_sp_text &&
      !["DÒNG SP", "TÊN SP", "SẢN PHẨM", "MÃ SP", "MÃ"].includes(
        raw_sp_text.toUpperCase()
      )
    ) {
      ten_mau = trich_xuat_ten_mau_thong_minh(raw_sp_text);
    }
    if (ten_sp) {
      if (!ten_mau || ten_mau !== ten_sp) continue;
    } else {
      if (!ten_mau) ten_mau = raw_sp_text || "Ch\u01b0a r\u00f5";
    }

    ket_qua.push(map_sheet_row_a_to_p(r, i + 1, mkt_norm));
  }

  return ket_qua;
}

function parse_datetime_vn(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  // Format 1: YYYY-MM-DD HH:mm(:ss) or YYYY/MM/DD HH:mm(:ss)
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (m) {
    return new Date(
      parseInt(m[1], 10),
      parseInt(m[2], 10) - 1,
      parseInt(m[3], 10),
      parseInt(m[4], 10),
      parseInt(m[5], 10),
      m[6] ? parseInt(m[6], 10) : 0
    );
  }
  // Format 2: DD/MM/YYYY HH:mm(:ss) or DD-MM-YYYY HH:mm(:ss)
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (m) {
    return new Date(
      parseInt(m[3], 10),
      parseInt(m[2], 10) - 1,
      parseInt(m[1], 10),
      parseInt(m[4], 10),
      parseInt(m[5], 10),
      m[6] ? parseInt(m[6], 10) : 0
    );
  }
  return null;
}

// Tính số giây làm việc giữa thời điểm đơn về (dtStart) và thời điểm gọi (dtEnd)
// Loại trừ khung giờ nghỉ: 23:00 - 08:00, 12:00 - 12:30, 18:00 - 19:00
function calc_working_call_seconds(dtStart, dtEnd) {
  if (!dtStart || !dtEnd) return null;
  const tStart = dtStart.getTime();
  const tEnd = dtEnd.getTime();
  if (isNaN(tStart) || isNaN(tEnd) || tEnd < tStart) return null;

  // Giới hạn tối đa 7 ngày để tránh vòng lặp dài với dữ liệu lỗi
  if (tEnd - tStart > 7 * 86400 * 1000) return null;

  const dayCursor = new Date(dtStart.getFullYear(), dtStart.getMonth(), dtStart.getDate(), 0, 0, 0, 0);
  const lastDay = new Date(dtEnd.getFullYear(), dtEnd.getMonth(), dtEnd.getDate(), 0, 0, 0, 0);

  // Các khung giờ làm việc trong ngày (đã loại trừ 23h-8h, 12h-12h30, 18h-19h):
  // Ca sáng: 08:00 - 12:00 | Ca chiều: 12:30 - 18:00 | Ca tối: 19:00 - 23:00
  const shifts = [
    [8, 0, 12, 0],
    [12, 30, 18, 0],
    [19, 0, 23, 0],
  ];

  let totalSec = 0;
  while (dayCursor <= lastDay) {
    const y = dayCursor.getFullYear();
    const mo = dayCursor.getMonth();
    const d = dayCursor.getDate();

    for (const [sh, sm, eh, em] of shifts) {
      const wStart = new Date(y, mo, d, sh, sm, 0, 0).getTime();
      const wEnd = new Date(y, mo, d, eh, em, 0, 0).getTime();
      const overlapStart = Math.max(tStart, wStart);
      const overlapEnd = Math.min(tEnd, wEnd);
      if (overlapEnd > overlapStart) {
        totalSec += (overlapEnd - overlapStart) / 1000;
      }
    }

    dayCursor.setDate(dayCursor.getDate() + 1);
  }

  return totalSec;
}

function tinh_ty_le_chot_theo_ngay(start_str, end_str) {
  let start_date = parse_ymd_date(start_str);
  let end_date = parse_ymd_date(end_str);
  if (start_date > end_date) {
    const tmp = start_date;
    start_date = end_date;
    end_date = tmp;
  }

  const date_patterns = new Set();
  const curr = new Date(start_date.getTime());
  while (curr <= end_date) {
    const y = curr.getFullYear();
    const m = curr.getMonth() + 1;
    const d = curr.getDate();
    const dd = String(d).padStart(2, "0");
    const mm = String(m).padStart(2, "0");

    date_patterns.add(`${dd}/${mm}/${y}`);
    date_patterns.add(`${mm}/${dd}/${y}`);
    date_patterns.add(`${y}-${mm}-${dd}`);
    date_patterns.add(`${d}/${m}/${y}`);
    date_patterns.add(`${d}/${mm}/${y}`);
    date_patterns.add(`${dd}/${m}/${y}`);

    curr.setDate(curr.getDate() + 1);
  }

  const patternsArr = Array.from(date_patterns);

  let colTg = 0;
  let colMkt = 6;
  let colTgGoi = 23; // Cột X: Thời gian gọi
  let colDaChot = 24;
  let colDemDon = 25;

  if (data_tong_don_upyo.length > 0) {
    const headerRow = data_tong_don_upyo[0];
    for (let i = 0; i < headerRow.length; i++) {
      const h = String(headerRow[i] || "").trim().toLowerCase();
      if (h === "thời gian gọi" || h === "thoi gian goi") colTgGoi = i;
      else if (h === "đơn đã chốt" || h === "don da chot") colDaChot = i;
      else if (h === "đếm đơn" || h === "dem don") colDemDon = i;
      else if (h === "mkt" || h === "marketer") colMkt = i;
    }
  }

  let tong_dem = 0;
  let tong_chot = 0;
  let tong_tg_goi_sec = 0;
  let so_don_da_goi = 0;
  const by_mkt = {};

  for (const r of data_tong_don_upyo) {
    if (r.length > Math.max(colDaChot, colDemDon)) {
      const tg = String(r[colTg] || "").trim();
      const is_matched_date = patternsArr.some((p) => tg.includes(p));
      if (is_matched_date) {
        const dem = parseInt(String(r[colDemDon] || "0").trim(), 10) || 0;
        const chot = parseInt(String(r[colDaChot] || "0").trim(), 10) || 0;
        if (dem <= 0 && chot <= 0) continue;

        const mkt = String(r[colMkt] || "").trim().toUpperCase();
        let mkt_norm = "KHÁC";
        if (mkt && !["MKT", "MARKETER", "TÊN MKT", "SALE", "KHÁC", "KHAC"].includes(mkt)) {
          if (mkt.includes("THANH") || mkt.includes("TH.LÂM") || mkt.includes("TH.LAM")) {
            mkt_norm = "TH.LÂM";
          } else if (mkt.includes("LÂM") || mkt.includes("LAM")) {
            mkt_norm = "LÂM";
          } else if (mkt.includes("PHÚC") || mkt.includes("PHUC")) {
            mkt_norm = "PHÚC";
          } else if (mkt.includes("TÂM") || mkt.includes("TAM")) {
            mkt_norm = "TÂM";
          } else if (mkt.includes("SAN")) {
            mkt_norm = "SAN";
          } else if (mkt.includes("D\u0168NG") || mkt.includes("DUNG")) {
            mkt_norm = "D\u0168NG";
          } else {
            mkt_norm = mkt;
          }
        }

        tong_dem += dem;
        tong_chot += chot;

        if (!by_mkt[mkt_norm]) {
          by_mkt[mkt_norm] = { dem: 0, chot: 0 };
        }
        by_mkt[mkt_norm].dem += dem;
        by_mkt[mkt_norm].chot += chot;

        if (r.length > colTgGoi) {
          const tgGoiRaw = String(r[colTgGoi] || "").trim();
          if (tgGoiRaw) {
            const dtOrder = parse_datetime_vn(tg);
            const dtCall = parse_datetime_vn(tgGoiRaw);
            const callSec = calc_working_call_seconds(dtOrder, dtCall);
            if (callSec !== null && callSec >= 0) {
              tong_tg_goi_sec += callSec;
              so_don_da_goi += 1;
            }
          }
        }
      }
    }
  }

  const tong_chua_chot = Math.max(0, tong_dem - tong_chot);
  const ty_le_chot = tong_dem > 0 ? (tong_chot / tong_dem) * 100 : 0;
  const avg_call_sec = so_don_da_goi > 0 ? tong_tg_goi_sec / so_don_da_goi : 0;

  return {
    tong_dem,
    tong_chot,
    tong_chua_chot,
    ty_le_chot,
    avg_call_sec,
    so_don_da_goi,
    by_mkt,
  };
}

function show_update_toast_notification(msg) {
  let toast = document.getElementById("updateNotificationToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "updateNotificationToast";
    toast.style.position = "fixed";
    toast.style.top = "18px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.backgroundColor = "rgba(61, 35, 20, 0.94)";
    toast.style.color = "#FAF5ED";
    toast.style.padding = "10px 22px";
    toast.style.borderRadius = "24px";
    toast.style.boxShadow = "0 8px 24px rgba(61, 35, 20, 0.25)";
    toast.style.fontSize = "13.5px";
    toast.style.fontWeight = "bold";
    toast.style.zIndex = "99999";
    toast.style.transition = "all 0.35s ease";
    toast.style.pointerEvents = "none";
    document.body.appendChild(toast);
  }
  toast.textContent = String(msg || "").replace(/\s*\(v?\d+\.\d+\.\d+\)/gi, "").trim();
  toast.style.opacity = "1";
  toast.style.transform = "translateX(-50%) translateY(0)";
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(-12px)";
  }, 4500);
}

function trigger_celebration_fireworks() {
  play_fireworks_sound_web();

  try {
    fetch("/api/fireworks", { method: "POST" }).catch(() => {});
  } catch (e) {}

  const canvas = document.getElementById("confettiCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = [
    "#F59E0B", "#10B981", "#D97706", "#3B82F6",
    "#EC4899", "#8B5CF6", "#F97316", "#EF4444", "#FBBF24"
  ];

  // Đợt 1: Hai chùm pháo hoa 2 bên bắn lên
  spawn_firework_explosion(window.innerWidth * 0.22, window.innerHeight * 0.42, colors, 55);
  spawn_firework_explosion(window.innerWidth * 0.78, window.innerHeight * 0.42, colors, 55);
  start_confetti_loop(canvas, ctx);

  // Đợt 2: Pháo nổ rực rỡ ngay tâm cao
  setTimeout(() => {
    spawn_firework_explosion(window.innerWidth * 0.5, window.innerHeight * 0.28, colors, 65);
    start_confetti_loop(canvas, ctx);
  }, 240);

  // Đợt 3: Hai bên trên cao
  setTimeout(() => {
    spawn_firework_explosion(window.innerWidth * 0.35, window.innerHeight * 0.32, colors, 50);
    spawn_firework_explosion(window.innerWidth * 0.65, window.innerHeight * 0.32, colors, 50);
    start_confetti_loop(canvas, ctx);
  }, 500);

  // Đợt 4: Chùm pháo hoa bung tỏa cuối cùng
  setTimeout(() => {
    spawn_firework_explosion(window.innerWidth * 0.5, window.innerHeight * 0.38, colors, 60);
    start_confetti_loop(canvas, ctx);
  }, 780);
}

function hien_thi_bang_chuc_mung_cap_nhat(version) {
  const modal = document.getElementById("updateCelebrationModal");
  const verText = document.getElementById("ucVersionText");
  const cleanVer = String(version || "").replace(/^v/i, "");
  if (verText && cleanVer) {
    verText.textContent = `Phiên bản v${cleanVer}`;
  }

  const headerVerEl = document.getElementById("headerVersionBadge");
  if (headerVerEl && cleanVer) {
    headerVerEl.textContent = `v${cleanVer}`;
  }
  if (cleanVer) {
    document.title = `APP LÂM v${cleanVer}`;
  }

  if (modal) {
    modal.classList.remove("hidden");
  }

  // Chạy ngầm xong hiện bảng thành công, không pháo hoa

  const dismissBtn = document.getElementById("btnDismissCelebration");
  const dong_modal = () => {
    if (modal) modal.classList.add("hidden");
    setTimeout(() => {
      window.location.reload();
    }, 250);
  };

  if (dismissBtn) {
    dismissBtn.onclick = dong_modal;
  }
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) dong_modal();
    };
  }
}

// ==============================================================
// HIỂN THỊ TOAST COPY & POPUP GÓC MÀN HÌNH
// ==============================================================
async function show_toast_copy(text_to_copy, message, x, y) {
  if (text_to_copy !== null && text_to_copy !== undefined && text_to_copy !== "") {
    try {
      await navigator.clipboard.writeText(String(text_to_copy));
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = String(text_to_copy);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  const toast = document.getElementById("cursorToast");
  if (!toast) return;
  toast.textContent = `✓ ${message}`;
  toast.classList.remove("hidden");

  const posX = Math.min((x ?? last_mouse_x) + 15, window.innerWidth - 220);
  const posY = Math.min((y ?? last_mouse_y) + 15, window.innerHeight - 60);
  toast.style.left = `${Math.max(10, posX)}px`;
  toast.style.top = `${Math.max(10, posY)}px`;

  if (cursor_toast_timer) clearTimeout(cursor_toast_timer);
  cursor_toast_timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 1300);
}

function hien_thi_popup_goc_man_hinh(
  title,
  message,
  force = false,
  notifyNative = true,
  voiceText = ""
) {
  if (!bat_popup_thong_bao && !force) return;

  if (notifyNative && window.location.protocol.startsWith("http")) {
    fetch("/api/popup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, message, force, voice: voiceText }),
    })
      .then(() => {
        trigger_confetti_burst();
      })
      .catch(() => {});
  } else {
    trigger_confetti_burst();
  }

  // Khi đang chạy app exe native, chỉ dùng 1 popup duy nhất hiển thị luôn trên màn hình (cả trong lẫn ngoài app)
  if (native_exe_mode) return;

  const container = document.getElementById("cornerPopupContainer");
  if (!container) return;

  const card = document.createElement("div");
  card.className = "corner-toast-card";

  const header = document.createElement("div");
  header.className = "corner-toast-header";

  const titleEl = document.createElement("div");
  titleEl.className = "corner-toast-title";
  titleEl.innerHTML = `<span>🎉</span><span>${title}</span>`;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "corner-toast-close";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => {
    card.remove();
  });

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "corner-toast-body";
  body.textContent = message;

  const timerBar = document.createElement("div");
  timerBar.className = "corner-toast-timer-bar";

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(timerBar);
  container.appendChild(card);

  setTimeout(() => {
    if (card.parentNode) card.remove();
  }, 8000);
}

// ==============================================================
// RENDER CARDS (COMPANY SUMMARY, MKT, SP, TOP SP)
// ==============================================================
function get_rank_style(rank) {
  if (rank === 1) {
    return {
      cls: "rank-1",
      pillCls: "rank-pill-1",
      icon: "👑",
      color: "var(--r1-text)",
      barColor: "#D97706",
    };
  }
  if (rank === 2) {
    return {
      cls: "rank-2",
      pillCls: "rank-pill-2",
      icon: "🥈",
      color: "var(--r2-text)",
      barColor: "#8C654B",
    };
  }
  if (rank === 3) {
    return {
      cls: "rank-3",
      pillCls: "rank-pill-3",
      icon: "🥉",
      color: "var(--r3-text)",
      barColor: "#C9643B",
    };
  }
  return {
    cls: "rank-n",
    pillCls: "rank-pill-n",
    icon: "",
    color: "var(--rn-text)",
    barColor: "#A68B77",
  };
}

let last_dash_data = null;

function render_all_codes_table() {
  const head = document.getElementById("allCodesHead");
  const body = document.getElementById("allCodesBody");
  const foot = document.getElementById("allCodesFoot");
  const titleEl = document.getElementById("allCodesTitleText");
  if (!head || !body || !foot) return;

  const dict = t();
  const d = last_dash_data || { don: {}, dt: {}, cp: {} };

  const names = new Set(KNOWN_CODES);
  Object.keys(d.don).forEach((k) => names.add(k));
  Object.keys(d.cp).forEach((k) => names.add(k));

  const rows = Array.from(names).map((code) => ({
    code,
    don: d.don[code] || 0,
    cp: d.cp[code] || 0,
    ds: d.dt[code] || 0,
  }));
  rows.sort(
    (a, b) => b.don - a.don || b.cp - a.cp || a.code.localeCompare(b.code)
  );

  if (titleEl) titleEl.textContent = `${dict.allCodesTitle} (${rows.length})`;

  head.innerHTML =
    `<tr><th class="ac-left">${dict.colCode}</th><th>${dict.colOrders}</th>` +
    `<th>${dict.metricCP}</th><th>${dict.metricDS}</th>` +
    `<th>${dict.metricCPO}</th><th>${dict.metricCPDS}</th></tr>`;

  const make_row = (label, don, cp, ds, extraCls) => {
    const { cpo_val, pct_str, pct_cls } = calc_metrics_display(
      cp,
      ds,
      don,
      dict.noRevenueYet
    );
    const tr = document.createElement("tr");
    if (extraCls) tr.className = extraCls;
    const cells = [
      [label, "ac-left ac-code"],
      [String(don), "ac-num"],
      [cp > 0 ? format_tien_vnd(cp) : "-", "ac-num"],
      [ds > 0 ? format_tien_vnd(ds) : "-", "ac-num"],
      [cpo_val > 0 ? format_tien_vnd(cpo_val) : "-", "ac-num"],
    ];
    cells.forEach(([txt, cls]) => {
      const td = document.createElement("td");
      td.className = cls;
      td.textContent = txt;
      tr.appendChild(td);
    });
    const tdPct = document.createElement("td");
    tdPct.className = "ac-num";
    const pill = document.createElement("span");
    pill.className = `cpds-pill ${pct_cls}`;
    pill.textContent = pct_str;
    tdPct.appendChild(pill);
    tr.appendChild(tdPct);
    return tr;
  };

  body.innerHTML = "";
  rows.forEach((r) => {
    const idle = r.don === 0 && r.cp === 0 && r.ds === 0;
    body.appendChild(make_row(r.code, r.don, r.cp, r.ds, idle ? "ac-idle" : ""));
  });

  const tot = rows.reduce(
    (s, r) => ({ don: s.don + r.don, cp: s.cp + r.cp, ds: s.ds + r.ds }),
    { don: 0, cp: 0, ds: 0 }
  );
  foot.innerHTML = "";
  foot.appendChild(make_row(dict.allCodesTotal, tot.don, tot.cp, tot.ds, "ac-total"));
}

function toggle_all_codes_popup(anchorBtn) {
  const pop = document.getElementById("allCodesPopup");
  if (!pop || !anchorBtn) return;
  document.getElementById("calendarPopup")?.classList.add("hidden");
  document.getElementById("settingsPopup")?.classList.add("hidden");
  document.getElementById("closingRatePopup")?.classList.add("hidden");

  if (!pop.classList.contains("hidden")) {
    pop.classList.add("hidden");
    return;
  }

  render_all_codes_table();
  pop.classList.remove("hidden");

  const rect = anchorBtn.getBoundingClientRect();
  const w = Math.min(620, window.innerWidth - 24);
  let left = rect.left;
  if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12;
  if (left < 12) left = 12;
  pop.style.width = `${w}px`;
  pop.style.left = `${left}px`;
  pop.style.top = `${rect.bottom + 7}px`;
  pop.style.maxHeight = `${Math.max(240, window.innerHeight - rect.bottom - 24)}px`;
}

let last_closing_rate_data = null;

function get_closing_rate_pill_cls(pct, totalDem) {
  if (!totalDem || totalDem <= 0) return "val-muted";
  if (pct >= 60) return "val-green";
  if (pct >= 45) return "val-highlight";
  return "val-red";
}

function format_call_duration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  const remSec = s % 60;
  if (mins < 60) {
    return remSec > 0 ? `${mins}p ${String(remSec).padStart(2, "0")}s` : `${mins}p`;
  }
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${String(remMins).padStart(2, "0")}p`;
}

function get_call_time_pill_cls(avgSec, calledCount) {
  if (!calledCount || calledCount <= 0) return "val-muted";
  if (avgSec <= 10 * 60) return "val-green";
  if (avgSec <= 25 * 60) return "val-highlight";
  return "val-red";
}

function render_closing_rate_card(crData) {
  last_closing_rate_data = crData || {
    tong_dem: 0,
    tong_chot: 0,
    tong_chua_chot: 0,
    ty_le_chot: 0,
    avg_call_sec: 0,
    so_don_da_goi: 0,
    by_mkt: {},
  };

  const closedEl = document.getElementById("crValClosed");
  const totalEl = document.getElementById("crValTotal");
  const unclosedEl = document.getElementById("crValUnclosed");
  const rateEl = document.getElementById("crValRate");
  const callTimeEl = document.getElementById("actValTime");

  if (closedEl) {
    animate_number(closedEl, last_closing_rate_data.tong_chot, (v) => String(Math.round(v)), 420);
  }
  if (totalEl) {
    animate_number(totalEl, last_closing_rate_data.tong_dem, (v) => String(Math.round(v)), 420);
  }
  if (unclosedEl) {
    animate_number(unclosedEl, last_closing_rate_data.tong_chua_chot, (v) => String(Math.round(v)), 420);
  }
  if (rateEl) {
    const pct = last_closing_rate_data.ty_le_chot || 0;
    const dem = last_closing_rate_data.tong_dem || 0;
    rateEl.textContent = dem > 0 ? `${pct.toFixed(1)}%` : "0%";
    const pillCls = get_closing_rate_pill_cls(pct, dem);
    rateEl.className = `cpds-pill ${pillCls} cr-rate-pill`;
  }
  if (callTimeEl) {
    const calledCount = last_closing_rate_data.so_don_da_goi || 0;
    const avgSec = last_closing_rate_data.avg_call_sec || 0;
    callTimeEl.textContent = calledCount > 0 ? format_call_duration(avgSec) : "--";
    const callPillCls = get_call_time_pill_cls(avgSec, calledCount);
    callTimeEl.className = `cpds-pill ${callPillCls} cr-rate-pill`;
  }

  render_closing_rate_popup_table();
}

function render_closing_rate_popup_table() {
  const head = document.getElementById("closingRateHead");
  const body = document.getElementById("closingRateBody");
  const foot = document.getElementById("closingRateFoot");
  const titleEl = document.getElementById("closingRatePopupTitle");
  if (!head || !body || !foot) return;

  const dict = t();
  if (titleEl) titleEl.textContent = dict.closingRatePopupTitle;

  const cr = last_closing_rate_data || {
    tong_dem: 0,
    tong_chot: 0,
    tong_chua_chot: 0,
    ty_le_chot: 0,
    by_mkt: {},
  };

  head.innerHTML =
    `<tr><th class="ac-left">${dict.colMkt}</th>` +
    `<th>${dict.crLblRate}</th></tr>`;

  const make_cr_row = (label, chot, dem, extraCls, rankIdx = 0) => {
    const pct = dem > 0 ? (chot / dem) * 100 : 0;
    const pctStr = dem > 0 ? `${pct.toFixed(1)}%` : "0%";
    const pillCls = get_closing_rate_pill_cls(pct, dem);

    const tr = document.createElement("tr");
    if (extraCls) tr.className = extraCls;

    const tdLabel = document.createElement("td");
    tdLabel.className = "ac-left ac-code";
    if (rankIdx > 0) {
      const wrap = document.createElement("div");
      wrap.className = "cr-mkt-cell-wrap";
      const rankBadge = document.createElement("span");
      rankBadge.className = `cr-mini-rank ${rankIdx <= 3 ? `rank-${rankIdx}` : ""}`;
      rankBadge.textContent = `#${rankIdx}`;
      const nameSpan = document.createElement("span");
      nameSpan.textContent = label;
      wrap.appendChild(rankBadge);
      wrap.appendChild(nameSpan);
      tdLabel.appendChild(wrap);
    } else {
      tdLabel.textContent = label;
    }
    tr.appendChild(tdLabel);

    const tdRate = document.createElement("td");
    tdRate.className = "ac-num";
    const pill = document.createElement("span");
    pill.className = `cpds-pill ${pillCls}`;
    pill.textContent = pctStr;
    tdRate.appendChild(pill);
    tr.appendChild(tdRate);
    return tr;
  };

  const mktSet = new Set(LIST_MKT_FB.map((m) => m.ten));
  Object.keys(cr.by_mkt || {}).forEach((k) => mktSet.add(k));

  const rows = Array.from(mktSet)
    .filter((m) => m !== "KHÁC" || (cr.by_mkt[m]?.dem || 0) > 0)
    .map((m) => ({
      mkt: m,
      chot: cr.by_mkt[m]?.chot || 0,
      dem: cr.by_mkt[m]?.dem || 0,
    }));

  rows.sort((a, b) => {
    const pctB = b.dem > 0 ? b.chot / b.dem : 0;
    const pctA = a.dem > 0 ? a.chot / a.dem : 0;
    if (Math.abs(pctB - pctA) > 0.0001) return pctB - pctA;
    return b.chot - a.chot || b.dem - a.dem || a.mkt.localeCompare(b.mkt);
  });

  body.innerHTML = "";
  rows.forEach((r, idx) => {
    const idle = r.dem === 0 && r.chot === 0;
    body.appendChild(make_cr_row(r.mkt, r.chot, r.dem, idle ? "ac-idle" : "", idx + 1));
  });

  foot.innerHTML = "";
  foot.appendChild(
    make_cr_row(dict.allCodesTotal, cr.tong_chot, cr.tong_dem, "ac-total", 0)
  );
}

function toggle_closing_rate_popup(anchorEl) {
  const pop = document.getElementById("closingRatePopup");
  if (!pop || !anchorEl) return;
  document.getElementById("calendarPopup")?.classList.add("hidden");
  document.getElementById("settingsPopup")?.classList.add("hidden");
  document.getElementById("allCodesPopup")?.classList.add("hidden");

  if (!pop.classList.contains("hidden")) {
    pop.classList.add("hidden");
    return;
  }

  render_closing_rate_popup_table();
  pop.classList.remove("hidden");

  const rect = anchorEl.getBoundingClientRect();
  const w = Math.min(265, window.innerWidth - 24);
  let left = rect.right - w;
  if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12;
  if (left < 12) left = 12;
  pop.style.width = `${w}px`;
  pop.style.left = `${left}px`;
  pop.style.top = `${rect.bottom + 7}px`;
  pop.style.maxHeight = `${Math.max(220, window.innerHeight - rect.bottom - 24)}px`;
}
function calc_metrics_display(spend, doanh_so, count, zeroDsLabel) {
  const cpo_val = spend > 0 && count > 0 ? spend / count : 0;

  let pct_str = "0%";
  let pct_cls = "val-muted";

  if (spend > 0 && doanh_so > 0) {
    const pct_ds = (spend / doanh_so) * 100;
    pct_str = `${pct_ds.toFixed(1)}%`;
    pct_cls =
      pct_ds < 15 ? "val-green" : pct_ds > 25 ? "val-red" : "val-highlight";
  } else if (spend > 0 && doanh_so === 0) {
    pct_str = zeroDsLabel;
    pct_cls = "val-red";
  }

  return { cpo_val, pct_str, pct_cls };
}

function create_metrics_grid_dom(spend, doanh_so, count, zeroDsLabel) {
  const dict = t();
  const { cpo_val, pct_str, pct_cls } = calc_metrics_display(
    spend,
    doanh_so,
    count,
    zeroDsLabel
  );

  const grid = document.createElement("div");
  grid.className = "card-metrics-grid";

  grid.innerHTML = `
    <div class="metric-label">${dict.metricDS}</div>
    <div class="metric-label">${dict.metricCP}</div>
    <div class="metric-label">${dict.metricCPO}</div>
    <div class="metric-label">${dict.metricCPDS}</div>
    <div class="card-metrics-divider"></div>
    <div class="metric-value js-ds">0 đ</div>
    <div class="metric-value val-highlight js-cp">0 đ</div>
    <div class="metric-value js-cpo">-</div>
    <div class="metric-value"><span class="cpds-pill ${pct_cls}">${pct_str}</span></div>
  `;

  const dsEl = grid.querySelector(".js-ds");
  const cpEl = grid.querySelector(".js-cp");
  const cpoEl = grid.querySelector(".js-cpo");

  animate_number(dsEl, doanh_so, format_tien_vnd, 520);
  animate_number(cpEl, spend, format_tien_vnd, 520);
  if (cpo_val > 0) {
    animate_number(cpoEl, cpo_val, format_tien_vnd, 520);
  } else {
    cpoEl.textContent = "-";
  }

  return grid;
}

function attach_right_click_copy(cardEl, spend) {
  cardEl.addEventListener("contextmenu", (e) => {
    if (spend > 0) {
      e.preventDefault();
      e.stopPropagation();
      open_context_menu(e.clientX, e.clientY, Math.trunc(spend));
    }
  });
}

function render_company_summary_card(date_label, tong_don, tong_dt, tong_cp) {
  const holder = document.getElementById("badgeHolder");
  if (!holder) return;
  holder.innerHTML = "";
  const dict = t();

  const card = document.createElement("div");
  card.className = "cozy-card clickable-card company-summary-card";
  card.style.setProperty("--card-index", "0");
  card.title = `Bấm để xem chi tiết tất cả ${tong_don} đơn hàng của mọi người`;

  const topRow = document.createElement("div");
  topRow.className = "card-top-row";
  topRow.innerHTML = `
    <div class="card-title-group">
      <span class="card-name">${dict.companySummaryTitle}</span>
      <span class="card-sub-label">${date_label}</span>
      <span class="card-view-orders-hint clickable-hint js-btn-view-company-orders" title="Bấm để xem chi tiết tất cả ${tong_don} đơn hàng của mọi người">📋 Xem ${tong_don} đơn →</span>
    </div>
    <div class="card-count-group js-company-count-group" style="cursor: pointer;" title="Bấm để xem chi tiết tất cả ${tong_don} đơn hàng">
      <span class="card-count-val js-total-orders" style="color: var(--color-highlight)">0</span>
      <span class="card-count-unit">${dict.totalOrdersUnit}</span>
    </div>
  `;

  card.appendChild(topRow);
  card.appendChild(
    create_metrics_grid_dom(tong_cp, tong_dt, tong_don, dict.noRevenueYet)
  );

  const openCompanyOrders = (e) => {
    if (e) e.stopPropagation();
    hien_thi_bang_don_hang_chi_tiet(null, null);
  };

  const btnViewCompanyOrders = topRow.querySelector(".js-btn-view-company-orders");
  if (btnViewCompanyOrders) {
    btnViewCompanyOrders.addEventListener("click", openCompanyOrders);
  }
  const companyCountGroup = topRow.querySelector(".js-company-count-group");
  if (companyCountGroup) {
    companyCountGroup.addEventListener("click", openCompanyOrders);
  }
  card.addEventListener("click", () => hien_thi_bang_don_hang_chi_tiet(null, null));

  attach_right_click_copy(card, tong_cp);

  holder.appendChild(card);

  const countEl = topRow.querySelector(".js-total-orders");
  animate_number(countEl, tong_don, (v) => String(Math.round(v)), 520);
}

function create_mkt_table_card(
  rank,
  name_str,
  count,
  spend,
  doanh_so,
  maxCount,
  onClick
) {
  const dict = t();
  const { cls, pillCls, icon, color, barColor } = get_rank_style(rank);

  const card = document.createElement("div");
  card.className = `cozy-card clickable-card ${cls}`;
  card.style.setProperty("--card-index", String(rank));

  const topRow = document.createElement("div");
  topRow.className = "card-top-row";
  topRow.innerHTML = `
    <div class="card-title-group">
      <span class="rank-pill ${pillCls}">${icon ? icon + " " : ""}#${rank}</span>
      <span class="card-name">${name_str}</span>
      <span class="card-view-orders-hint clickable-hint js-btn-view-mkt-orders" title="B\u1ea5m \u0111\u1ec3 xem chi ti\u1ebft t\u1ea5t c\u1ea3 ${count} \u0111\u01a1n c\u1ee7a ${name_str}">\ud83d\udccb Xem ${count} \u0111\u01a1n \u2192</span>
    </div>
    <div class="card-count-group js-count-group" title="B\u1ea5m \u0111\u1ec3 xem chi ti\u1ebft t\u1ea5t c\u1ea3 ${count} \u0111\u01a1n c\u1ee7a ${name_str}" style="cursor: pointer;">
      <span class="card-count-val js-count" style="color: ${color}">0</span>
      <span class="card-count-unit">${dict.ordersUnit}</span>
    </div>
  `;

  card.appendChild(topRow);
  card.appendChild(
    create_metrics_grid_dom(spend, doanh_so, count, dict.noOrdersYet)
  );

  const sharePct =
    maxCount > 0 ? Math.min(100, Math.round((count / maxCount) * 100)) : 0;
  const barTrack = document.createElement("div");
  barTrack.className = "card-share-bar-track";
  barTrack.innerHTML = `<div class="card-share-bar-fill" style="width: 0%; background: ${barColor}"></div>`;
  card.appendChild(barTrack);

  requestAnimationFrame(() => {
    const fill = barTrack.querySelector(".card-share-bar-fill");
    if (fill) fill.style.width = `${sharePct}%`;
  });

  const countEl = topRow.querySelector(".js-count");
  animate_number(countEl, count, (v) => String(Math.round(v)), 520);

  const btnViewOrders = topRow.querySelector(".js-btn-view-mkt-orders");
  if (btnViewOrders) {
    btnViewOrders.addEventListener("click", (e) => {
      e.stopPropagation();
      hien_thi_bang_don_hang_chi_tiet(name_str, null);
    });
  }

  const countGroup = topRow.querySelector(".js-count-group");
  if (countGroup) {
    countGroup.addEventListener("click", (e) => {
      e.stopPropagation();
      hien_thi_bang_don_hang_chi_tiet(name_str, null);
    });
  }

  card.addEventListener("click", () => onClick(name_str));
  attach_right_click_copy(card, spend);
  return card;
}

// ==============================================================
// MODAL CHI TIẾT & LỌC ĐƠN HÀNG TỔNG HỢP KIỂU EXCEL (v8.6.106)
// ==============================================================
let current_od_raw_list = [];
let current_od_filtered_list = [];
let current_od_mode = "card"; // "all_table" | "card"
let current_od_mkt = null;
let current_od_sp = null;
let od_sort_newest_first = true;
let od_render_limit = 500;

let od_excel_filters = {}; // { [colKey]: Set<string> }
let od_excel_sort = { col: null, dir: null }; // { col, dir: "asc" | "desc" }
let od_xl_active_col = null;
let od_xl_pending_values = []; // [{ val, label, count, checked }]

const OD_XL_COL_META = {
  ngay_only: { title: "Thời gian", isDate: true },
  ma_van_don: { title: "Mã vận đơn" },
  ho_ten: { title: "Họ tên" },
  sdt: { title: "Số điện thoại" },
  dia_chi: { title: "Địa chỉ" },
  dong_sp: { title: "Dòng SP" },
  mau_sac: { title: "Màu sắc" },
  size: { title: "Size", isNum: true },
  gia_ban: { title: "Giá bán", isMoney: true },
  phi_ship: { title: "Phí Ship", isMoney: true },
  nen_tang: { title: "Nền tảng" },
  sale: { title: "Sale" },
  mkt: { title: "MKT" },
  trang_thai: { title: "Trạng thái đơn" },
  so_luong: { title: "Số lượng", isNum: true },
  ghi_chu: { title: "Ghi chú" },
};

function get_status_pill_cls(statusRaw) {
  const s = bo_dau_tieng_viet(String(statusRaw || "").trim()).toUpperCase();
  if (!s) return "pill-status-default";
  if (s.includes("DA LEN DON") || s.includes("THANH CONG")) return "pill-status-ok";
  if (s.includes("GIAO THANG")) return "pill-status-direct";
  if (s.includes("DOI HANG")) return "pill-status-exchange";
  if (s.includes("TEST")) return "pill-status-test";
  if (s.includes("HUY") || s.includes("HOAN") || s.includes("TRUNG")) return "pill-status-cancel";
  return "pill-status-default";
}

function get_od_col_filter_value(order, colKey) {
  if (!order) return "__EMPTY__";
  if (colKey === "gia_ban") {
    return order.gia_ban > 0 ? format_tien_vnd(order.gia_ban) : "0 đ";
  }
  if (colKey === "phi_ship") {
    return order.phi_ship > 0 ? format_tien_vnd(order.phi_ship) : "0 đ";
  }
  const raw = String(order[colKey] || "").trim();
  return raw ? raw : "__EMPTY__";
}

function get_od_col_sort_value(order, colKey) {
  if (!order) return "";
  if (colKey === "gia_ban") return order.gia_ban || 0;
  if (colKey === "phi_ship") return order.phi_ship || 0;
  if (colKey === "so_luong") return order.so_luong_num || 0;
  if (colKey === "size") {
    const n = parseFloat(order.size);
    return Number.isNaN(n) ? -1 : n;
  }
  if (colKey === "ngay_only") {
    const parts = String(order.ngay_only || "").split(/[\/\-]/);
    if (parts.length === 3) {
      return Number(parts[2]) * 10000 + Number(parts[1]) * 100 + Number(parts[0]);
    }
    return 0;
  }
  return String(order[colKey] || "").trim();
}

function set_od_modal_layout_mode(isAllTableMode) {
  const cardEl = document.getElementById("orderDetailCard");
  const sortBtn = document.getElementById("btnOdSortToggle");
  const countBadge = document.getElementById("odCountBadge");
  const qtyBadge = document.getElementById("odQtyBadge");
  const metaRow = cardEl ? cardEl.querySelector(".od-meta-row") : null;
  const shipDivider = document.getElementById("odShipDivider");
  const shipText = document.getElementById("odShipText");
  const extraCols = document.querySelectorAll(".col-extra-ap");
  const thFilterBtns = document.querySelectorAll(".od-th-filter-btn");

  if (cardEl) cardEl.classList.toggle("od-wide-mode", isAllTableMode);
  if (sortBtn) sortBtn.classList.toggle("hidden", !isAllTableMode);
  if (countBadge) countBadge.classList.toggle("hidden", isAllTableMode);
  if (qtyBadge) qtyBadge.classList.add("hidden");
  if (metaRow) metaRow.classList.toggle("hidden", isAllTableMode);
  if (shipDivider) shipDivider.classList.toggle("hidden", !isAllTableMode);
  if (shipText) shipText.classList.toggle("hidden", !isAllTableMode);
  extraCols.forEach((th) => th.classList.toggle("hidden", !isAllTableMode));
  thFilterBtns.forEach((btn) => btn.classList.toggle("hidden", !isAllTableMode));
}

function update_od_sort_button_ui() {
  const btnSort = document.getElementById("btnOdSortToggle");
  if (btnSort) {
    btnSort.textContent = od_sort_newest_first ? "⇅ Mới nhất đầu" : "⇅ Thứ tự gốc";
  }
}

function update_od_xl_header_indicators() {
  const btns = document.querySelectorAll(".od-th-filter-btn");
  btns.forEach((btn) => {
    const col = btn.getAttribute("data-col");
    const isFiltered = Boolean(od_excel_filters[col]);
    const isSorted = od_excel_sort.col === col && Boolean(od_excel_sort.dir);
    btn.classList.toggle("is-filtered", isFiltered);
    btn.classList.toggle("is-sorted", isSorted);
  });

  const activeCount = Object.keys(od_excel_filters).length + (od_excel_sort.col ? 1 : 0);
  const btnResetFilters = document.getElementById("btnResetOdColFilters");
  if (btnResetFilters) {
    if (current_od_mode === "all_table" && activeCount > 0) {
      btnResetFilters.textContent = `↺ Xóa lọc (${activeCount})`;
      btnResetFilters.classList.remove("hidden");
    } else {
      btnResetFilters.classList.add("hidden");
    }
  }
}

function close_od_excel_filter() {
  const pop = document.getElementById("odExcelFilterPopover");
  if (pop) pop.classList.add("hidden");
  od_xl_active_col = null;
}

function render_od_xl_list() {
  const listEl = document.getElementById("odXlList");
  const searchEl = document.getElementById("odXlSearchInput");
  const countInfoEl = document.getElementById("odXlCountInfo");
  if (!listEl) return;

  const q = (searchEl ? searchEl.value : "").trim().toLowerCase();
  const qNoDau = q ? bo_dau_tieng_viet(q).toLowerCase() : "";

  const matched = q
    ? od_xl_pending_values.filter((item) => {
        const lbl = item.label.toLowerCase();
        if (lbl.includes(q)) return true;
        return bo_dau_tieng_viet(lbl).toLowerCase().includes(qNoDau);
      })
    : od_xl_pending_values;

  const MAX_RENDER = 300;
  const toShow = matched.slice(0, MAX_RENDER);
  const checkedTotal = od_xl_pending_values.filter((x) => x.checked).length;

  if (countInfoEl) {
    countInfoEl.textContent = `${checkedTotal}/${od_xl_pending_values.length}`;
  }

  if (toShow.length === 0) {
    listEl.innerHTML = `<div class="od-xl-more-hint">Không tìm thấy giá trị phù hợp</div>`;
    return;
  }

  const html = toShow
    .map((item) => {
      const isEmpty = item.val === "__EMPTY__";
      const valCls = isEmpty ? "od-xl-val-text od-xl-val-empty" : "od-xl-val-text";
      return `<label class="od-xl-item" title="${escape_html(item.label)}">
        <input type="checkbox" class="od-xl-chk" data-val="${escape_html(item.val)}" ${item.checked ? "checked" : ""} />
        <span class="${valCls}">${escape_html(item.label)}</span>
      </label>`;
    })
    .join("");

  const extraHint =
    matched.length > MAX_RENDER
      ? `<div class="od-xl-more-hint">Đang hiện ${MAX_RENDER}/${matched.length} giá trị. Gõ tìm kiếm để lọc thêm...</div>`
      : "";

  listEl.innerHTML = html + extraHint;
}

function open_od_excel_filter(colKey, anchorEl) {
  const pop = document.getElementById("odExcelFilterPopover");
  if (!pop) return;

  if (od_xl_active_col === colKey && !pop.classList.contains("hidden")) {
    close_od_excel_filter();
    return;
  }

  od_xl_active_col = colKey;
  const meta = OD_XL_COL_META[colKey] || { title: colKey };

  const titleEl = document.getElementById("odXlTitle");
  const searchEl = document.getElementById("odXlSearchInput");
  const btnAsc = document.getElementById("btnOdXlSortAsc");
  const btnDesc = document.getElementById("btnOdXlSortDesc");

  if (titleEl) titleEl.textContent = `Lọc: ${meta.title}`;
  if (searchEl) searchEl.value = "";
  if (btnAsc) {
    btnAsc.textContent = (meta.isMoney || meta.isNum) ? "↑ Nhỏ → Lớn" : (meta.isDate ? "↑ Cũ → Mới" : "↑ A → Z");
    btnAsc.classList.toggle("active", od_excel_sort.col === colKey && od_excel_sort.dir === "asc");
  }
  if (btnDesc) {
    btnDesc.textContent = (meta.isMoney || meta.isNum) ? "↓ Lớn → Nhỏ" : (meta.isDate ? "↓ Mới → Cũ" : "↓ Z → A");
    btnDesc.classList.toggle("active", od_excel_sort.col === colKey && od_excel_sort.dir === "desc");
  }

  // Lọc theo các cột KHÁC (cascading giống Excel)
  const otherKeys = Object.keys(od_excel_filters).filter((k) => k !== colKey);
  const counts = new Map();

  for (const o of current_od_raw_list) {
    let ok = true;
    for (const k of otherKeys) {
      const allowedSet = od_excel_filters[k];
      if (allowedSet && !allowedSet.has(get_od_col_filter_value(o, k))) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    const v = get_od_col_filter_value(o, colKey);
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  const entries = Array.from(counts.entries());
  entries.sort((a, b) => {
    if (a[0] === "__EMPTY__") return 1;
    if (b[0] === "__EMPTY__") return -1;
    if (meta.isMoney) return parse_gia_tien(a[0]) - parse_gia_tien(b[0]);
    if (meta.isNum) {
      const na = parseFloat(a[0]);
      const nb = parseFloat(b[0]);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    }
    if (meta.isDate) {
      const pa = a[0].split(/[\/\-]/);
      const pb = b[0].split(/[\/\-]/);
      if (pa.length === 3 && pb.length === 3) {
        const va = Number(pa[2]) * 10000 + Number(pa[1]) * 100 + Number(pa[0]);
        const vb = Number(pb[2]) * 10000 + Number(pb[1]) * 100 + Number(pb[0]);
        return vb - va; // Mới nhất lên đầu
      }
    }
    return a[0].localeCompare(b[0], "vi");
  });

  const existingSet = od_excel_filters[colKey];
  od_xl_pending_values = entries.map(([val, cnt]) => ({
    val,
    label: val === "__EMPTY__" ? "(Trống)" : val,
    count: cnt,
    checked: existingSet ? existingSet.has(val) : true,
  }));

  render_od_xl_list();

  pop.classList.remove("hidden");
  const rect = anchorEl.getBoundingClientRect();
  const popW = pop.offsetWidth || 280;
  const popH = pop.offsetHeight || 360;
  let left = rect.right - popW;
  if (left < 12) left = rect.left;
  if (left + popW > window.innerWidth - 12) left = window.innerWidth - popW - 12;
  let top = rect.bottom + 6;
  if (top + popH > window.innerHeight - 12) {
    top = Math.max(12, rect.top - popH - 6);
  }
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;

  setTimeout(() => {
    if (searchEl) searchEl.focus();
  }, 40);
}

function hien_thi_bang_loc_don_tong_hop() {
  const modal = document.getElementById("orderDetailModal");
  if (!modal) return;

  hide_all_popups();
  close_od_excel_filter();

  current_od_mode = "all_table";
  current_od_mkt = null;
  current_od_sp = null;
  od_sort_newest_first = true;
  od_render_limit = 500;
  od_excel_filters = {};
  od_excel_sort = { col: null, dir: null };

  set_od_modal_layout_mode(true);

  const orders = lay_tat_ca_don_hang_tu_bang_a_den_p(false);
  current_od_raw_list = orders;

  const mktBadge = document.getElementById("odMktBadge");
  const spBadge = document.getElementById("odSpBadge");
  const titleText = document.getElementById("odTitleText");
  const dateRangeText = document.getElementById("odDateRangeText");
  const searchInput = document.getElementById("odSearchInput");
  const clearBtn = document.getElementById("btnClearOdSearch");

  if (mktBadge) {
    mktBadge.textContent = "LỌC ĐƠN TỔNG HỢP";
    mktBadge.classList.remove("hidden");
  }
  if (spBadge) {
    spBadge.textContent = "TẤT CẢ ĐƠN TRONG BẢNG";
    spBadge.classList.remove("hidden");
  }
  if (titleText) {
    titleText.textContent = "BẢNG LỌC ĐƠN HÀNG TỔNG HỢP";
  }
  if (dateRangeText) {
    dateRangeText.textContent = `Tổng cộng ${orders.length} đơn hàng trong bảng`;
  }

  if (searchInput) {
    searchInput.value = "";
    searchInput.placeholder = "🔍 Tìm tên, SĐT, mã vận đơn, địa chỉ, ghi chú...";
  }
  if (clearBtn) clearBtn.classList.add("hidden");

  update_od_sort_button_ui();
  update_od_xl_header_indicators();
  apply_od_filters_and_render(true);

  modal.classList.remove("hidden");
  setTimeout(() => {
    if (searchInput) searchInput.focus();
  }, 80);
}

function hien_thi_bang_don_hang_chi_tiet(ten_mkt, ten_sp) {
  const modal = document.getElementById("orderDetailModal");
  if (!modal) return;

  hide_all_popups();
  close_od_excel_filter();

  current_od_mode = "card";
  current_od_mkt = ten_mkt;
  current_od_sp = ten_sp;
  od_sort_newest_first = false;
  od_render_limit = 500;
  od_excel_filters = {};
  od_excel_sort = { col: null, dir: null };

  set_od_modal_layout_mode(false);

  const orders = lay_danh_sach_don_chi_tiet(ten_mkt, ten_sp);
  current_od_raw_list = orders;

  const mktBadge = document.getElementById("odMktBadge");
  const spBadge = document.getElementById("odSpBadge");
  const titleText = document.getElementById("odTitleText");
  const dateRangeText = document.getElementById("odDateRangeText");
  const searchInput = document.getElementById("odSearchInput");
  const clearBtn = document.getElementById("btnClearOdSearch");

  if (mktBadge) {
    if (ten_mkt) {
      mktBadge.textContent = `MKT: ${ten_mkt}`;
      mktBadge.classList.remove("hidden");
    } else {
      mktBadge.textContent = `TỔNG CÔNG TY`;
      mktBadge.classList.remove("hidden");
    }
  }

  if (spBadge) {
    if (ten_sp) {
      spBadge.textContent = `SẢN PHẨM: ${ten_sp}`;
      spBadge.classList.remove("hidden");
    } else if (ten_mkt) {
      spBadge.textContent = `TẤT CẢ MÃ SP`;
      spBadge.classList.remove("hidden");
    } else {
      spBadge.textContent = `TẤT CẢ MỌI NGƯỜI`;
      spBadge.classList.remove("hidden");
    }
  }

  if (titleText) {
    if (ten_mkt && ten_sp) {
      titleText.textContent = `CHI TIẾT ĐƠN HÀNG: ${ten_mkt} - ${ten_sp}`;
    } else if (ten_mkt) {
      titleText.textContent = `CHI TIẾT ĐƠN HÀNG MKT: ${ten_mkt} (TẤT CẢ MÃ SP)`;
    } else if (ten_sp) {
      titleText.textContent = `CHI TIẾT ĐƠN HÀNG: ${ten_sp}`;
    } else {
      titleText.textContent = `CHI TIẾT ĐƠN HÀNG TỔNG CÔNG TY (TẤT CẢ MỌI NGƯỜI)`;
    }
  }

  if (dateRangeText) {
    const s = current_start_date || "";
    const e = current_end_date || "";
    dateRangeText.textContent = s === e ? `Ngày ${s}` : `Từ ${s} đến ${e}`;
  }

  if (searchInput) {
    searchInput.value = "";
    searchInput.placeholder = "🔍 Tìm tên, SĐT, mã vận đơn, địa chỉ...";
  }
  if (clearBtn) clearBtn.classList.add("hidden");

  update_od_xl_header_indicators();
  apply_od_filters_and_render(true);

  modal.classList.remove("hidden");
  setTimeout(() => {
    if (searchInput) searchInput.focus();
  }, 80);
}

function dong_bang_don_hang_chi_tiet() {
  close_od_excel_filter();
  const modal = document.getElementById("orderDetailModal");
  if (modal) modal.classList.add("hidden");
}

function apply_od_filters_and_render(resetLimit = false) {
  if (resetLimit) od_render_limit = 500;

  const searchInput = document.getElementById("odSearchInput");
  const qRaw = (searchInput ? searchInput.value : "").trim().toLowerCase();
  const qNoDau = qRaw ? bo_dau_tieng_viet(qRaw).toLowerCase() : "";

  update_od_xl_header_indicators();

  let baseList = (current_od_mode === "all_table" && od_sort_newest_first)
    ? current_od_raw_list.slice().reverse()
    : current_od_raw_list.slice();

  const activeFilterKeys = current_od_mode === "all_table" ? Object.keys(od_excel_filters) : [];

  const filtered = baseList.filter((o) => {
    for (const colKey of activeFilterKeys) {
      const allowedSet = od_excel_filters[colKey];
      if (allowedSet && !allowedSet.has(get_od_col_filter_value(o, colKey))) {
        return false;
      }
    }

    if (qRaw) {
      const haystackRaw = [
        o.thoi_gian,
        o.ma_van_don,
        o.ho_ten,
        o.sdt,
        o.dia_chi,
        o.dong_sp,
        o.mau_sac,
        o.size,
        o.gia_ban_str,
        o.phi_ship_str,
        o.nen_tang,
        o.sale,
        o.mkt,
        o.trang_thai,
        o.so_luong,
        o.ghi_chu,
      ]
        .join(" | ")
        .toLowerCase();
      if (haystackRaw.includes(qRaw)) return true;
      const haystackNoDau = bo_dau_tieng_viet(haystackRaw).toLowerCase();
      return haystackNoDau.includes(qNoDau);
    }

    return true;
  });

  if (current_od_mode === "all_table" && od_excel_sort.col && od_excel_sort.dir) {
    const sCol = od_excel_sort.col;
    const mul = od_excel_sort.dir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      const va = get_od_col_sort_value(a, sCol);
      const vb = get_od_col_sort_value(b, sCol);
      if (typeof va === "number" && typeof vb === "number") {
        return (va - vb) * mul;
      }
      return String(va).localeCompare(String(vb), "vi") * mul;
    });
  }

  current_od_filtered_list = filtered;
  render_order_detail_table(filtered);
}

function render_order_detail_table(ordersToRender) {
  const tbody = document.getElementById("odTableBody");
  const emptyState = document.getElementById("odEmptyState");
  const footerSummary = document.getElementById("odFooterSummary");
  const countBadge = document.getElementById("odCountBadge");
  const qtyBadge = document.getElementById("odQtyBadge");
  const revenueText = document.getElementById("odRevenueText");
  const shipText = document.getElementById("odShipText");
  const loadMoreWrap = document.getElementById("odLoadMoreWrap");
  const btnLoadMore = document.getElementById("btnOdLoadMore");
  const btnLoadAll = document.getElementById("btnOdLoadAll");
  if (!tbody) return;

  const isAllTableMode = current_od_mode === "all_table";
  const totalMatched = Array.isArray(ordersToRender) ? ordersToRender.length : 0;
  let tong_ds = 0;
  let tong_ship = 0;
  let tong_sl = 0;

  if (totalMatched > 0) {
    for (const o of ordersToRender) {
      tong_ds += o.gia_ban || 0;
      tong_ship += o.phi_ship || 0;
      tong_sl += o.so_luong_num || 0;
    }
  }

  if (countBadge) {
    countBadge.textContent = isAllTableMode
      ? `${totalMatched} đơn hàng`
      : `${totalMatched} đơn đã đếm`;
  }
  if (qtyBadge) {
    qtyBadge.textContent = `Tổng SL: ${tong_sl}`;
  }
  if (revenueText) {
    revenueText.textContent = `Tổng DS: ${format_tien_vnd(tong_ds)}`;
  }
  if (shipText) {
    shipText.textContent = `Tổng Ship: ${format_tien_vnd(tong_ship)}`;
  }

  if (totalMatched === 0) {
    tbody.innerHTML = "";
    if (emptyState) emptyState.classList.remove("hidden");
    if (loadMoreWrap) loadMoreWrap.classList.add("hidden");
    if (footerSummary) footerSummary.textContent = isAllTableMode ? "" : "Không có đơn hàng nào khớp";
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");

  const sliceCount = Math.min(totalMatched, od_render_limit);
  if (footerSummary) {
    if (isAllTableMode) {
      footerSummary.textContent = "";
    } else {
      footerSummary.textContent = `Hiển thị ${totalMatched} / ${current_od_raw_list.length} đơn hàng • Tổng doanh số: ${format_tien_vnd(tong_ds)}`;
    }
  }

  if (loadMoreWrap) {
    if (sliceCount < totalMatched) {
      const remaining = totalMatched - sliceCount;
      loadMoreWrap.classList.remove("hidden");
      if (btnLoadMore) {
        btnLoadMore.textContent = `➕ Hiển thị thêm ${Math.min(500, remaining)} đơn`;
      }
      if (btnLoadAll) {
        btnLoadAll.textContent = `⚡ Hiển thị tất cả (${totalMatched} đơn)`;
      }
    } else {
      loadMoreWrap.classList.add("hidden");
    }
  }

  const rowsHtml = new Array(sliceCount);
  for (let idx = 0; idx < sliceCount; idx++) {
    const order = ordersToRender[idx];
    let platformCls = "pill-other";
    const ntUpper = (order.nen_tang || "").toUpperCase();
    if (ntUpper.includes("LAND")) platformCls = "pill-landing";
    else if (ntUpper.includes("PAN")) platformCls = "pill-pancake";

    const extraColsHtml = isAllTableMode
      ? `
        <td class="col-trangthai">${order.trang_thai ? `<span class="pill-status ${get_status_pill_cls(order.trang_thai)}">${escape_html(order.trang_thai)}</span>` : "—"}</td>
        <td class="col-ghichu" title="${escape_html(order.ghi_chu)}">${escape_html(order.ghi_chu || "—")}</td>`
      : "";

    rowsHtml[idx] = `
      <tr>
        <td class="col-stt">${idx + 1}</td>
        <td class="col-time">${escape_html(order.thoi_gian || "—")}</td>
        <td class="col-mvd">${escape_html(order.ma_van_don || "—")}</td>
        <td class="col-hoten">${escape_html(order.ho_ten || "—")}</td>
        <td class="col-sdt">${escape_html(order.sdt || "—")}</td>
        <td class="col-diachi" title="${escape_html(order.dia_chi)}">${escape_html(order.dia_chi || "—")}</td>
        <td class="col-dongsp">${escape_html(order.dong_sp || "—")}</td>
        <td class="col-mausac">${escape_html(order.mau_sac || "—")}</td>
        <td class="col-size">${escape_html(order.size || "—")}</td>
        <td class="col-giaban">${format_tien_vnd(order.gia_ban)}</td>
        <td class="col-phiship">${format_tien_vnd(order.phi_ship)}</td>
        <td class="col-nentang"><span class="pill-platform ${platformCls}">${escape_html(order.nen_tang || "Khác")}</span></td>
        <td class="col-sale">${escape_html(order.sale || "—")}</td>
        <td class="col-mkt"><span class="pill-mkt">${escape_html(order.mkt || "—")}</span></td>${extraColsHtml}
      </tr>`;
  }
  tbody.innerHTML = rowsHtml.join("");
}

function create_sp_detail_card(idx, ma_str, count, spend, doanh_so, maxCount) {
  const dict = t();
  const card = document.createElement("div");
  card.className = "cozy-card";
  card.style.setProperty("--card-index", String(idx));
  card.style.cursor = "pointer";
  card.title = `Nhấn để xem ${count} đơn hàng chi tiết của ${ma_str}`;

  const topRow = document.createElement("div");
  topRow.className = "card-top-row";
  topRow.innerHTML = `
    <div class="card-title-group">
      <span class="card-name">👟 ${ma_str}</span>
      <span class="card-view-orders-hint">Xem ${count} đơn →</span>
    </div>
    <div class="card-count-group">
      <span class="card-count-val js-count" style="color: var(--color-highlight)">0</span>
      <span class="card-count-unit">${dict.ordersUnit}</span>
    </div>
  `;

  card.appendChild(topRow);
  card.appendChild(
    create_metrics_grid_dom(spend, doanh_so, count, dict.noOrdersYet)
  );

  const sharePct =
    maxCount > 0 ? Math.min(100, Math.round((count / maxCount) * 100)) : 0;
  const barTrack = document.createElement("div");
  barTrack.className = "card-share-bar-track";
  barTrack.innerHTML = `<div class="card-share-bar-fill" style="width: 0%; background: var(--color-highlight)"></div>`;
  card.appendChild(barTrack);

  requestAnimationFrame(() => {
    const fill = barTrack.querySelector(".card-share-bar-fill");
    if (fill) fill.style.width = `${sharePct}%`;
  });

  const countEl = topRow.querySelector(".js-count");
  animate_number(countEl, count, (v) => String(Math.round(v)), 520);

  // Click vào card để hiện bảng thông tin đơn hàng chi tiết
  card.addEventListener("click", () => {
    hien_thi_bang_don_hang_chi_tiet(current_mkt_detail, ma_str);
  });

  attach_right_click_copy(card, spend);
  return card;
}

function create_top_sp_card(rank, name_str, count, spend, doanh_so, maxCount) {
  const dict = t();
  const { cls, pillCls, icon, color, barColor } = get_rank_style(rank);

  const card = document.createElement("div");
  card.className = `cozy-card ${cls}`;
  card.style.setProperty("--card-index", String(rank));
  card.style.cursor = "pointer";
  card.title = `Nhấn để xem ${count} đơn hàng chi tiết của ${name_str}`;

  const topRow = document.createElement("div");
  topRow.className = "card-top-row";
  topRow.innerHTML = `
    <div class="card-title-group">
      <span class="rank-pill ${pillCls}">${icon ? icon + " " : ""}#${rank}</span>
      <span class="card-name">${name_str}</span>
      <span class="card-view-orders-hint">Xem ${count} đơn →</span>
    </div>
    <div class="card-count-group">
      <span class="card-count-val js-count" style="color: ${color}">0</span>
      <span class="card-count-unit">${dict.ordersUnit}</span>
    </div>
  `;

  card.appendChild(topRow);
  card.appendChild(
    create_metrics_grid_dom(spend, doanh_so, count, dict.noOrdersYet)
  );

  const sharePct =
    maxCount > 0 ? Math.min(100, Math.round((count / maxCount) * 100)) : 0;
  const barTrack = document.createElement("div");
  barTrack.className = "card-share-bar-track";
  barTrack.innerHTML = `<div class="card-share-bar-fill" style="width: 0%; background: ${barColor}"></div>`;
  card.appendChild(barTrack);

  requestAnimationFrame(() => {
    const fill = barTrack.querySelector(".card-share-bar-fill");
    if (fill) fill.style.width = `${sharePct}%`;
  });

  const countEl = topRow.querySelector(".js-count");
  animate_number(countEl, count, (v) => String(Math.round(v)), 520);

  // Click vào top SP để hiện bảng thông tin đơn hàng chi tiết toàn công ty
  card.addEventListener("click", () => {
    hien_thi_bang_don_hang_chi_tiet(null, name_str);
  });

  attach_right_click_copy(card, spend);
  return card;
}

// ==============================================================
// RENDER NỘI DUNG DASHBOARD
// ==============================================================
function ve_noi_dung_dashboard(start_str, end_str, fb_chi_tiet_map, fb_tong_map) {
  const dict = t();
  const {
    sorted_mkt: stats_mkt_don,
    stats_mkt_dt,
    sorted_sp: stats_sp_don,
    stats_sp_dt,
    stats_mkt_sp_don,
    stats_mkt_sp_dt,
  } = dem_don_chi_tiet_theo_ngay(start_str, end_str);

  // 1. Tổng công ty
  const tong_don = Object.values(stats_mkt_don).reduce((a, b) => a + b, 0);
  const tong_dt = Object.values(stats_mkt_dt).reduce((a, b) => a + b, 0);
  const tong_chi_phi_all = Object.values(fb_tong_map).reduce((a, b) => a + b, 0);
  const display_date_str =
    start_str === end_str
      ? dict.singleDateFmt(start_str)
      : dict.rangeDateFmt(start_str, end_str);

  render_company_summary_card(
    display_date_str,
    tong_don,
    tong_dt,
    tong_chi_phi_all
  );

  // 1b. Bảng Tỷ lệ chốt (trên nút Cập nhật & Cài đặt)
  render_closing_rate_card(tinh_ty_le_chot_theo_ngay(start_str, end_str));

  // 2. Cột MKT (Danh sách hoặc Chi tiết)
  const containerMkt = document.getElementById("containerMkt");
  const headerMktText = document.getElementById("headerMktText");
  const headerMktIcon = document.getElementById("headerMktIcon");
  const btnBackMkt = document.getElementById("btnBackMkt");

  function ve_danh_sach_top_mkt() {
    current_mkt_detail = null;
    btnBackMkt.classList.add("hidden");
    if (headerMktIcon) headerMktIcon.textContent = "🏆";
    headerMktText.textContent = dict.mktReportHeader;
    containerMkt.innerHTML = "";

    const tat_ca_mkt = new Set([
      ...Object.keys(stats_mkt_don),
      ...Object.keys(fb_tong_map),
    ]);

    const mkt_hien_thi = [];
    for (const m of tat_ca_mkt) {
      if (m === "KHÁC" && (stats_mkt_don[m] || 0) === 0) continue;
      const don = stats_mkt_don[m] || 0;
      const tien = fb_tong_map[m] || 0.0;
      const doanh_so = stats_mkt_dt[m] || 0.0;
      if (don > 0 || tien > 0 || doanh_so > 0) {
        mkt_hien_thi.push({ mkt: m, don, tien, doanh_so });
      }
    }

    mkt_hien_thi.sort((a, b) => {
      // 1. Ai Lợi nhuận (Doanh số - Chi phí) cao hơn thì xếp cao hơn
      const loiNhuanA = a.doanh_so - a.tien;
      const loiNhuanB = b.doanh_so - b.tien;
      if (Math.abs(loiNhuanB - loiNhuanA) > 0.001) {
        return loiNhuanB - loiNhuanA;
      }

      // 2. Nếu bằng Lợi nhuận: Ai Doanh số cao hơn thì xếp cao hơn
      if (b.doanh_so !== a.doanh_so) {
        return b.doanh_so - a.doanh_so;
      }

      // 3. Nếu bằng Doanh số: Ai Chi phí thấp hơn thì xếp cao hơn
      if (a.tien !== b.tien) {
        return a.tien - b.tien;
      }

      // 4. Nếu bằng nhau: Ai nhiều đơn hơn thì xếp cao hơn
      if (b.don !== a.don) {
        return b.don - a.don;
      }

      // 5. Nếu bằng nhau toàn bộ: xếp theo thứ tự bảng chữ cái
      return a.mkt.localeCompare(b.mkt);
    });

    if (mkt_hien_thi.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state-msg";
      empty.textContent = dict.emptyMktList;
      containerMkt.appendChild(empty);
    } else {
      const maxCount = Math.max(...mkt_hien_thi.map((x) => x.don), 1);
      mkt_hien_thi.forEach((item, idx) => {
        const card = create_mkt_table_card(
          idx + 1,
          item.mkt,
          item.don,
          item.tien,
          item.doanh_so,
          maxCount,
          xem_chi_tiet_mkt_inline
        );
        containerMkt.appendChild(card);
      });
    }
  }

  function xem_chi_tiet_mkt_inline(ten_mkt) {
    current_mkt_detail = ten_mkt;
    btnBackMkt.classList.remove("hidden");
    btnBackMkt.onclick = ve_danh_sach_top_mkt;
    if (headerMktIcon) headerMktIcon.textContent = "📊";
    headerMktText.textContent = dict.mktDetailHeader(ten_mkt);
    containerMkt.innerHTML = "";

    const tong_don_mkt = stats_mkt_don[ten_mkt] || 0;
    const banner = document.createElement("div");
    banner.className = "mkt-view-all-banner";
    banner.innerHTML = `
      <button class="btn-mkt-view-all-orders" type="button" title="Xem danh s\u00e1ch t\u1ea5t c\u1ea3 \u0111\u01a1n c\u1ee7a ${ten_mkt}">
        \ud83d\udccb Xem chi ti\u1ebft t\u1ea5t c\u1ea3 ${tong_don_mkt} \u0111\u01a1n c\u1ee7a ${ten_mkt} (T\u1ea5t c\u1ea3 m\u00e3 SP) \u2192
      </button>
    `;
    banner.querySelector("button").addEventListener("click", () => {
      hien_thi_bang_don_hang_chi_tiet(ten_mkt, null);
    });
    containerMkt.appendChild(banner);

    const chi_tiet_fb = fb_chi_tiet_map[ten_mkt] || {};
    const don_cua_mkt = stats_mkt_sp_don[ten_mkt] || {};
    const dt_cua_mkt = stats_mkt_sp_dt[ten_mkt] || {};

    const tat_ca_ma = Array.from(
      new Set([...Object.keys(chi_tiet_fb), ...Object.keys(don_cua_mkt)])
    ).sort((maA, maB) => {
      const dsA = dt_cua_mkt[maA] || 0.0;
      const dsB = dt_cua_mkt[maB] || 0.0;
      const cpA = chi_tiet_fb[maA] || 0.0;
      const cpB = chi_tiet_fb[maB] || 0.0;
      const lnA = dsA - cpA;
      const lnB = dsB - cpB;
      if (Math.abs(lnB - lnA) > 0.001) return lnB - lnA;

      if (dsB !== dsA) return dsB - dsA;
      if (cpA !== cpB) return cpA - cpB;

      const donA = don_cua_mkt[maA] || 0;
      const donB = don_cua_mkt[maB] || 0;
      if (donB !== donA) return donB - donA;

      return maA.localeCompare(maB);
    });

    if (tat_ca_ma.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state-msg";
      empty.textContent = dict.emptyMktDetail(ten_mkt);
      containerMkt.appendChild(empty);
    } else {
      const maxCount = Math.max(
        ...tat_ca_ma.map((m) => don_cua_mkt[m] || 0),
        1
      );
      tat_ca_ma.forEach((ma, idx) => {
        const tien = chi_tiet_fb[ma] || 0.0;
        const don = don_cua_mkt[ma] || 0;
        const doanh_so_ma = dt_cua_mkt[ma] || 0.0;
        const card = create_sp_detail_card(
          idx + 1,
          ma,
          don,
          tien,
          doanh_so_ma,
          maxCount
        );
        containerMkt.appendChild(card);
      });
    }
  }

  if (current_mkt_detail) {
    xem_chi_tiet_mkt_inline(current_mkt_detail);
  } else {
    ve_danh_sach_top_mkt();
  }

  // 3. Cột TOP 5 MẪU MÃ
  const listSp = document.getElementById("listSp");
  listSp.innerHTML = "";

  const global_sp_spend = {};
  for (const sp_dict of Object.values(fb_chi_tiet_map)) {
    for (const [sp_name, sp_cp] of Object.entries(sp_dict)) {
      global_sp_spend[sp_name] = (global_sp_spend[sp_name] || 0.0) + sp_cp;
    }
  }

  last_dash_data = { don: stats_sp_don, dt: stats_sp_dt, cp: global_sp_spend };
  render_all_codes_table();

  const tat_ca_sp = new Set([
    ...Object.keys(stats_sp_don),
    ...Object.keys(global_sp_spend),
  ]);

  const sp_hien_thi = [];
  for (const sp of tat_ca_sp) {
    const don = stats_sp_don[sp] || 0;
    const tien = global_sp_spend[sp] || 0.0;
    const doanh_so = stats_sp_dt[sp] || 0.0;
    if (don > 0 || tien > 0 || doanh_so > 0) {
      sp_hien_thi.push({ sp, don, tien, doanh_so });
    }
  }

  sp_hien_thi.sort((a, b) => {
    // 1. Ai Lợi nhuận (Doanh số - Chi phí) cao hơn thì xếp cao hơn
    const loiNhuanA = a.doanh_so - a.tien;
    const loiNhuanB = b.doanh_so - b.tien;
    if (Math.abs(loiNhuanB - loiNhuanA) > 0.001) {
      return loiNhuanB - loiNhuanA;
    }

    // 2. Nếu bằng Lợi nhuận: Ai Doanh số cao hơn thì xếp cao hơn
    if (b.doanh_so !== a.doanh_so) {
      return b.doanh_so - a.doanh_so;
    }

    // 3. Nếu bằng Doanh số: Ai Chi phí thấp hơn thì xếp cao hơn
    if (a.tien !== b.tien) {
      return a.tien - b.tien;
    }

    // 4. Nếu bằng nhau: Ai nhiều đơn hơn thì xếp cao hơn
    if (b.don !== a.don) {
      return b.don - a.don;
    }

    // 5. Nếu bằng nhau toàn bộ: xếp theo thứ tự bảng chữ cái
    return a.sp.localeCompare(b.sp);
  });

  const top_10_sp = sp_hien_thi.slice(0, 10);
  if (top_10_sp.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state-msg";
    empty.textContent = dict.emptySpList;
    listSp.appendChild(empty);
  } else {
    const maxSpCount = Math.max(...top_10_sp.map((x) => x.don), 1);
    top_10_sp.forEach((item, idx) => {
      const card = create_top_sp_card(
        idx + 1,
        item.sp,
        item.don,
        item.tien,
        item.doanh_so,
        maxSpCount
      );
      listSp.appendChild(card);
    });
  }
}

// ==============================================================
// TẢI VÀ CẬP NHẬT DỮ LIỆU THEO NGÀY
// ==============================================================
let initial_load_success = false;
let auto_retry_count = 0;
let auto_retry_timer = null;

async function tai_va_cap_nhat_theo_ngay(isAutoRetry = false) {
  const btnRefresh = document.getElementById("btnRefresh");
  const refreshIcon = document.getElementById("refreshIcon");
  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingMainText = document.getElementById("loadingMainText");
  const loadingSubText = document.getElementById("loadingSubText");

  hide_all_popups();

  // LUÔN LUÔN HIỂN THỊ MÀN HÌNH BLUR MỜ XOAY XOAY KHI ĐANG TẢI HOẶC CHỜ WI-FI
  if (loadingOverlay) loadingOverlay.classList.remove("hidden");
  if (btnRefresh) btnRefresh.disabled = true;
  if (refreshIcon) refreshIcon.classList.add("spinning");

  if (current_start_date > current_end_date) {
    const tmp = current_start_date;
    current_start_date = current_end_date;
    current_end_date = tmp;
    update_date_buttons_text();
  }

  let gsSuccess = false;
  try {
    if (loadingMainText) loadingMainText.textContent = "⏳ Đang tải dữ liệu...";
    if (loadingSubText) loadingSubText.textContent = "Đang đồng bộ Google Sheets & Facebook Ads...";

    const [gsResult, fbResult] = await Promise.all([
      tai_du_lieu_google_sheets(),
      quet_chi_phi_facebook_helper(current_start_date, current_end_date),
    ]);
    gsSuccess = Boolean(gsResult && data_hien_tai && data_hien_tai.length > 0);
    cached_fb_chi_tiet = fbResult.local_chi_tiet;
    cached_fb_tong = fbResult.local_tong;

    ve_noi_dung_dashboard(
      current_start_date,
      current_end_date,
      cached_fb_chi_tiet,
      cached_fb_tong
    );

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    last_sync_time_str = `${hh}:${mm}:${ss}`;

    const lastSyncEl = document.getElementById("lastSyncText");
    if (lastSyncEl) {
      if (gsSuccess) {
        lastSyncEl.textContent = `${t().lastSyncPrefix}${last_sync_time_str}`;
      } else {
        lastSyncEl.textContent = "Đang chờ kết nối Wi-Fi...";
      }
    }
  } catch (e) {
    console.error("Lỗi khi tải dữ liệu:", e);
  } finally {
    // CHỈ ẨN MÀN HÌNH BLUR XOAY XOAY KHI VÀ CHỈ KHI ĐÃ TẢI DỮ LIỆU THÀNH CÔNG!
    if (gsSuccess) {
      initial_load_success = true;
      auto_retry_count = 0;
      if (auto_retry_timer) {
        clearInterval(auto_retry_timer);
        auto_retry_timer = null;
      }
      if (loadingOverlay) loadingOverlay.classList.add("hidden");
      if (btnRefresh) btnRefresh.disabled = false;
      if (refreshIcon) refreshIcon.classList.remove("spinning");
    }
  }

  // NẾU CHƯA CÓ MẠNG (Máy tính vừa bật, Wi-Fi chưa kịp kết nối):
  // TIẾP TỤC GIỮ NGUYÊN MÀN HÌNH BLUR XOAY XOAY VÀ ĐẾM NGƯỢC THỬ LẠI!
  if (!gsSuccess) {
    if (auto_retry_count < 10) {
      auto_retry_count++;
      let remainingSeconds = Math.min(3 * auto_retry_count, 10);

      if (loadingMainText) loadingMainText.textContent = "⏳ Đang chờ kết nối Wi-Fi...";
      if (loadingSubText) loadingSubText.textContent = `Máy tính vừa bật, đang chờ mạng (tự thử lại sau ${remainingSeconds}s)...`;

      if (auto_retry_timer) clearInterval(auto_retry_timer);
      auto_retry_timer = setInterval(() => {
        remainingSeconds--;
        if (remainingSeconds > 0) {
          if (loadingSubText) loadingSubText.textContent = `Máy tính vừa bật, đang chờ mạng (tự thử lại sau ${remainingSeconds}s)...`;
        } else {
          clearInterval(auto_retry_timer);
          auto_retry_timer = null;
          if (loadingMainText) loadingMainText.textContent = "⏳ Đang kết nối lại...";
          if (loadingSubText) loadingSubText.textContent = "Đang tải dữ liệu từ Google Sheets & Ads...";
          tai_va_cap_nhat_theo_ngay(true);
        }
      }, 1000);
    } else {
      // Sau 10 lần thử (~1 phút) nếu thật sự không có mạng thì mới ẩn blur để người dùng thao tác
      if (loadingOverlay) loadingOverlay.classList.add("hidden");
      if (btnRefresh) btnRefresh.disabled = false;
      if (refreshIcon) refreshIcon.classList.remove("spinning");
      const lastSyncEl = document.getElementById("lastSyncText");
      if (lastSyncEl) lastSyncEl.textContent = "Chưa có Internet (Bấm Tải lại khi có mạng)";
    }
  }
}

function update_date_buttons_text() {
  const startText = document.getElementById("startDateText");
  const endText = document.getElementById("endDateText");
  if (startText) startText.textContent = current_start_date;
  if (endText) endText.textContent = current_end_date;

  const now = new Date();
  const todayStr = format_ymd_date(now);
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const yestStr = format_ymd_date(yest);
  const tmStartStr = format_ymd_date(
    new Date(now.getFullYear(), now.getMonth(), 1)
  );
  const tmEndStr = format_ymd_date(
    new Date(now.getFullYear(), now.getMonth() + 1, 0)
  );
  const lmStartStr = format_ymd_date(
    new Date(now.getFullYear(), now.getMonth() - 1, 1)
  );
  const lmEndStr = format_ymd_date(
    new Date(now.getFullYear(), now.getMonth(), 0)
  );

  let activePreset = "";
  if (current_start_date === todayStr && current_end_date === todayStr) {
    activePreset = "today";
  } else if (current_start_date === yestStr && current_end_date === yestStr) {
    activePreset = "yesterday";
  } else if (
    current_start_date === lmStartStr &&
    current_end_date === lmEndStr
  ) {
    activePreset = "last_month";
  } else if (
    current_start_date === tmStartStr &&
    current_end_date === tmEndStr
  ) {
    activePreset = "this_month";
  }

  document.querySelectorAll(".quick-preset-btn").forEach((btn) => {
    btn.classList.toggle(
      "active-preset",
      btn.getAttribute("data-preset") === activePreset
    );
  });
}

function set_and_refresh(st, en) {
  current_start_date = st;
  current_end_date = en;
  try {
    sessionStorage.setItem("applam_start_date", st);
    sessionStorage.setItem("applam_end_date", en);
  } catch (e) {}
  update_date_buttons_text();
  hide_all_popups();
  tai_va_cap_nhat_theo_ngay();
}

// ==============================================================
// LỊCH POPUP (CALENDAR PICKER) & CÀI ĐẶT POPUP
// ==============================================================
let cal_pick_step = 0; // 0: sẵn sàng chọn ngày đầu, 1: đã chọn ngày đầu & đang chọn ngày cuối
let cal_temp_start = null;
let cal_hover_date = null;

function format_cal_month_text(m) {
  return current_lang === "en" ? `Month ${m}` : current_lang === "zh" ? `${m}月` : `Tháng ${m}`;
}

function close_cal_custom_dropdowns() {
  document.getElementById("calMonthMenu")?.classList.add("hidden");
  document.getElementById("calYearMenu")?.classList.add("hidden");
  document.getElementById("calMonthBtn")?.classList.remove("open");
  document.getElementById("calYearBtn")?.classList.remove("open");
}

function sync_cal_dropdowns(year, month) {
  const mBtnText = document.getElementById("calMonthBtnText");
  const yBtnText = document.getElementById("calYearBtnText");
  const mMenu = document.getElementById("calMonthMenu");
  const yMenu = document.getElementById("calYearMenu");

  if (mBtnText) mBtnText.textContent = format_cal_month_text(month);
  if (yBtnText) yBtnText.textContent = String(year);

  if (mMenu) {
    mMenu.innerHTML = "";
    for (let m = 1; m <= 12; m++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-dd-opt" + (m === month ? " active" : "");
      btn.textContent = format_cal_month_text(m);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        current_cal_month = m;
        close_cal_custom_dropdowns();
        render_calendar_grid(current_cal_year, current_cal_month);
      });
      mMenu.appendChild(btn);
    }
  }

  if (yMenu) {
    yMenu.innerHTML = "";
    const curY = new Date().getFullYear();
    const minY = Math.min(2023, year - 2);
    const maxY = Math.max(curY + 2, year + 2);
    for (let y = minY; y <= maxY; y++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-dd-opt" + (y === year ? " active" : "");
      btn.textContent = String(y);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        current_cal_year = y;
        close_cal_custom_dropdowns();
        render_calendar_grid(current_cal_year, current_cal_month);
      });
      yMenu.appendChild(btn);
    }
  }
}

function update_cal_range_highlight() {
  const grid = document.getElementById("calGrid");
  if (!grid) return;

  let rStart = current_start_date;
  let rEnd = current_end_date;

  if (cal_pick_step === 1 && cal_temp_start) {
    const h = cal_hover_date || cal_temp_start;
    rStart = cal_temp_start <= h ? cal_temp_start : h;
    rEnd = cal_temp_start <= h ? h : cal_temp_start;
  }

  const isSingleDay = rStart === rEnd;
  const cells = grid.querySelectorAll(".cal-cell[data-date]");
  cells.forEach((cell) => {
    const d = cell.getAttribute("data-date");
    const isStart = d === rStart;
    const isEnd = d === rEnd;
    const inBetween = d > rStart && d < rEnd;
    const inBand = !isSingleDay && d >= rStart && d <= rEnd;

    cell.classList.toggle("is-start", isStart);
    cell.classList.toggle("is-end", isEnd);
    cell.classList.toggle("is-single", isStart && isEnd);
    cell.classList.toggle("in-range", inBetween);
    cell.classList.toggle("in-band", inBand);

    const btn = cell.querySelector(".cal-day-btn");
    if (btn) {
      btn.classList.toggle("selected", isStart || isEnd);
    }
  });

  const hintEl = document.getElementById("calRangeHint");
  if (hintEl) {
    if (cal_pick_step === 1 && cal_temp_start) {
      hintEl.innerHTML = `<span class="cal-hint-dot"></span><span>${rStart} → ${rEnd}</span><span class="cal-hint-sub">Chọn ngày cuối</span>`;
      hintEl.classList.add("picking");
    } else {
      const rangeStr = current_start_date === current_end_date ? current_start_date : `${current_start_date} → ${current_end_date}`;
      hintEl.innerHTML = `<span class="cal-hint-dot ready"></span><span>${rangeStr}</span>`;
      hintEl.classList.remove("picking");
    }
  }
}

function render_calendar_grid(year, month) {
  const label = document.getElementById("calMonthYearLabel");
  const grid = document.getElementById("calGrid");
  if (!grid) return;

  if (label) {
    label.textContent = t().calMonthYearFmt(month, year);
  }
  sync_cal_dropdowns(year, month);

  grid.innerHTML = "";

  const todayStr = format_ymd_date(new Date());

  // Chủ nhật (CN) là cột đầu tiên (index 0 .. Thứ Bảy index 6), giống chuẩn lịch Facebook Ads
  const sundayBasedOffset = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let i = 0; i < sundayBasedOffset; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-cell cal-day-empty";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const d_str = `${year}-${String(month).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    const colIdx = (sundayBasedOffset + day - 1) % 7;

    const cell = document.createElement("div");
    cell.className = "cal-cell";
    cell.setAttribute("data-date", d_str);
    if (colIdx === 0 || day === 1) cell.classList.add("row-start");
    if (colIdx === 6 || day === daysInMonth) cell.classList.add("row-end");
    if (colIdx === 0 || colIdx === 6) cell.classList.add("is-weekend");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cal-day-btn";
    if (d_str === todayStr) btn.classList.add("is-today");
    btn.textContent = String(day);

    cell.addEventListener("mouseenter", () => {
      if (cal_pick_step === 1 && cal_hover_date !== d_str) {
        cal_hover_date = d_str;
        update_cal_range_highlight();
      }
    });

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      close_cal_custom_dropdowns();
      if (cal_pick_step === 0) {
        // Click lần 1: Chọn mốc ngày bắt đầu
        cal_pick_step = 1;
        cal_temp_start = d_str;
        cal_hover_date = d_str;
        update_cal_range_highlight();
      } else {
        // Click lần 2: Chốt khoảng ngày và tải dữ liệu
        const st = d_str < cal_temp_start ? d_str : cal_temp_start;
        const en = d_str < cal_temp_start ? cal_temp_start : d_str;
        cal_pick_step = 0;
        cal_temp_start = null;
        cal_hover_date = null;
        set_and_refresh(st, en);
      }
    });

    cell.appendChild(btn);
    grid.appendChild(cell);
  }

  update_cal_range_highlight();
}

function toggle_calendar_popup(targetType, anchorBtn) {
  const calPopup = document.getElementById("calendarPopup");
  const settingsPopup = document.getElementById("settingsPopup");
  if (!calPopup || !anchorBtn) return;

  document.getElementById("allCodesPopup")?.classList.add("hidden");
  document.getElementById("closingRatePopup")?.classList.add("hidden");
  settingsPopup?.classList.add("hidden");
  close_cal_custom_dropdowns();

  if (!calPopup.classList.contains("hidden")) {
    calPopup.classList.add("hidden");
    anchorBtn.classList.remove("is-open");
    current_cal_target = null;
    cal_pick_step = 0;
    cal_temp_start = null;
    cal_hover_date = null;
    return;
  }

  current_cal_target = "range";
  cal_pick_step = 0;
  cal_temp_start = null;
  cal_hover_date = null;

  const dt = parse_ymd_date(current_end_date || current_start_date);
  current_cal_year = dt.getFullYear();
  current_cal_month = dt.getMonth() + 1;

  render_calendar_grid(current_cal_year, current_cal_month);

  calPopup.classList.remove("hidden");
  anchorBtn.classList.add("is-open");
  const rect = anchorBtn.getBoundingClientRect();
  const popupWidth = 316;
  let left = rect.left;
  if (left + popupWidth > window.innerWidth - 12) {
    left = window.innerWidth - popupWidth - 12;
  }
  if (left < 12) left = 12;

  calPopup.style.left = `${left}px`;
  calPopup.style.top = `${rect.bottom + 7}px`;
}

function toggle_settings_popup(anchorBtn) {
  const calPopup = document.getElementById("calendarPopup");
  const settingsPopup = document.getElementById("settingsPopup");
  if (!settingsPopup || !anchorBtn) return;

  document.getElementById("allCodesPopup")?.classList.add("hidden");
  document.getElementById("closingRatePopup")?.classList.add("hidden");
  calPopup.classList.add("hidden");

  if (!settingsPopup.classList.contains("hidden")) {
    settingsPopup.classList.add("hidden");
    return;
  }

  settingsPopup.classList.remove("hidden");
  const rect = anchorBtn.getBoundingClientRect();
  const popupWidth = settingsPopup.offsetWidth || 356;
  const popupHeight = settingsPopup.offsetHeight || 440;

  // Căn mép phải của Popup thẳng hàng với mép phải của nút Cài đặt
  let left = rect.right - popupWidth;

  // Đảm bảo TUYỆT ĐỐI không dính sát viền mép phải hoặc mép trái màn hình (cách tối thiểu 20px)
  const maxLeft = window.innerWidth - popupWidth - 20;
  if (left > maxLeft) left = maxLeft;
  if (left < 20) left = 20;

  // Căn chiều cao: mặc định nằm dưới nút Cài đặt 7px, nhưng nếu chạm đáy màn hình thì kéo lên cách đáy tối thiểu 20px
  let top = rect.bottom + 7;
  const maxTop = window.innerHeight - popupHeight - 20;
  if (top > maxTop) {
    top = Math.max(20, maxTop);
  }

  settingsPopup.style.left = `${Math.round(left)}px`;
  settingsPopup.style.top = `${Math.round(top)}px`;
}

function hide_all_popups() {
  const calPopup = document.getElementById("calendarPopup");
  const settingsPopup = document.getElementById("settingsPopup");
  const ctxMenu = document.getElementById("contextMenu");
  if (calPopup) calPopup.classList.add("hidden");
  document.getElementById("btnStartDate")?.classList.remove("is-open");
  if (typeof close_cal_custom_dropdowns === "function") close_cal_custom_dropdowns();
  if (settingsPopup) settingsPopup.classList.add("hidden");
  if (ctxMenu) ctxMenu.classList.add("hidden");
  document.getElementById("allCodesPopup")?.classList.add("hidden");
  document.getElementById("closingRatePopup")?.classList.add("hidden");
  current_cal_target = null;
}

function open_context_menu(x, y, spendVal) {
  const ctxMenu = document.getElementById("contextMenu");
  const preview = document.getElementById("contextMenuSpendPreview");
  if (!ctxMenu) return;
  context_menu_spend_value = spendVal;
  if (preview) {
    preview.textContent = format_tien_vnd(spendVal);
  }
  ctxMenu.classList.remove("hidden");
  const left = Math.min(x, window.innerWidth - 175);
  const top = Math.min(y, window.innerHeight - 55);
  ctxMenu.style.left = `${left}px`;
  ctxMenu.style.top = `${top}px`;
}

function cap_nhat_giao_dien_toggle_init() {
  const dict = t();
  const btnVoice = document.getElementById("btnToggleVoice");
  const btnPopup = document.getElementById("btnTogglePopup");
  const btnFireworks = document.getElementById("btnToggleFireworks");

  if (btnVoice) {
    btnVoice.textContent = bat_thong_bao_gtts ? dict.stateOn : dict.stateOff;
    btnVoice.classList.toggle("btn-green", bat_thong_bao_gtts);
    btnVoice.classList.toggle("btn-red", !bat_thong_bao_gtts);
  }

  if (btnPopup) {
    btnPopup.textContent = bat_popup_thong_bao ? dict.stateOn : dict.stateOff;
    btnPopup.classList.toggle("btn-green", bat_popup_thong_bao);
    btnPopup.classList.toggle("btn-red", !bat_popup_thong_bao);
  }

  if (btnFireworks) {
    btnFireworks.textContent = bat_phao_hoa ? dict.stateOn : dict.stateOff;
    btnFireworks.classList.toggle("btn-green", bat_phao_hoa);
    btnFireworks.classList.toggle("btn-red", !bat_phao_hoa);
  }

  const btnAutoStart = document.getElementById("btnToggleAutoStart");
  if (btnAutoStart) {
    btnAutoStart.textContent = bat_khoi_dong_cung_win ? dict.stateOn : dict.stateOff;
    btnAutoStart.classList.toggle("btn-green", bat_khoi_dong_cung_win);
    btnAutoStart.classList.toggle("btn-red", !bat_khoi_dong_cung_win);
  }

  apply_scale_ui();
}

// ==============================================================
// LUỒNG QUÉT ĐƠN MỚI MỖI 3 GIÂY (quet_don) - Universal Signature Engine v8.6.62
// ==============================================================
let known_signatures_web = new Set();
let announced_phone_keys_web = new Set();

function chuan_hoa_sdt_vn(sdt) {
  if (!sdt) return "";
  let clean = String(sdt).replace(/[\s.-]/g, "").trim();
  if (clean.startsWith("+84")) clean = "0" + clean.slice(3);
  else if (clean.startsWith("84") && clean.length > 9) clean = "0" + clean.slice(2);
  else if (!clean.startsWith("0") && clean.length === 9) clean = "0" + clean;
  return clean;
}

function chuan_hoa_mkt_ten(mkt) {
  if (!mkt) return "";
  const clean = String(mkt).trim();
  const upper = clean.toUpperCase();
  if (["MKT", "MARKETER", "TÊN MKT", "SALE", "TÊN", "NAME"].includes(upper)) return "";
  return clean;
}

function chuan_hoa_sp_ten(sp) {
  if (!sp) return "Sản phẩm";
  const clean = String(sp).trim();
  const upper = clean.toUpperCase();
  if (["DÒNG SP", "DONG SP", "SẢN PHẨM", "SAN PHAM", "MÃ SP"].includes(upper)) return "Sản phẩm";
  return clean;
}

function extract_orders_web_tb(rows) {
  const list = [];
  if (!Array.isArray(rows) || rows.length < 2) return list;

  let colTg = 0, colTen = 1, colSdt = 2, colMkt = 6, colSp = 7, colSaleNote = 20;
  const h = rows[0];
  if (Array.isArray(h)) {
    for (let c = 0; c < h.length; c++) {
      const name = String(h[c] || "").trim().toLowerCase();
      if (name === "thời gian" || name === "thoi gian" || name === "ngày") colTg = c;
      else if (name === "họ tên" || name === "ho ten" || name === "tên khách") colTen = c;
      else if (name === "số điện thoại" || name === "so dien thoai" || name === "sđt" || name === "sdt") colSdt = c;
      else if (name === "mkt" || name === "marketer" || name === "tên mkt") colMkt = c;
      else if (name === "dòng sp" || name === "dong sp" || name === "sản phẩm" || name === "san pham") colSp = c;
      else if (name.includes("ghi chú sale") || name.includes("trạng thái")) colSaleNote = c;
    }
  }

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length === 0) continue;

    const tg = String(r[colTg] || "").trim();
    const ten = String(r[colTen] || "").trim();
    const sdt = String(r[colSdt] || "").trim();
    const mkt = String(r[colMkt] || "").trim();
    const sp = String(r[colSp] || "").trim();
    const note = String(r[colSaleNote] || "").trim().toLowerCase();

    if (!sdt && !ten) continue;
    if (note.includes("huỷ") || note.includes("huy") || note.includes("trùng") || note.includes("trung")) continue;

    const mktClean = chuan_hoa_mkt_ten(mkt);
    const spClean = chuan_hoa_sp_ten(sp);
    const sdtClean = chuan_hoa_sdt_vn(sdt);

    const sig = `TB|${tg}|${sdtClean}|${spClean.toUpperCase()}|${mktClean.toUpperCase()}`;
    const phoneKey = sdtClean && sdtClean.length >= 8 ? `${sdtClean}_${spClean.toUpperCase()}` : "";

    const voice = mktClean ? `${mktClean} ơi, có đơn rồi` : "Có đơn mới rồi";
    const toast = mktClean ? `MKT ${mktClean}\n${spClean}` : `Vừa có đơn mới!\n${spClean}`;

    list.push({ sig, phoneKey, mkt: mktClean, sp: spClean, voice, toast });
  }
  return list;
}

function extract_orders_web_tk(rows) {
  const list = [];
  if (!Array.isArray(rows) || rows.length < 2) return list;

  let colTg = 0, colMvd = 1, colTen = 2, colSdt = 3, colSp = 5, colMkt = 12, colTt = 13;
  const h = rows[0];
  if (Array.isArray(h)) {
    for (let c = 0; c < h.length; c++) {
      const name = String(h[c] || "").trim().toLowerCase();
      if (name === "thời gian" || name === "thoi gian" || name === "ngày") colTg = c;
      else if (name === "mã vận đơn" || name === "ma van don" || name === "mã đơn") colMvd = c;
      else if (name === "họ tên" || name === "ho ten" || name === "tên khách") colTen = c;
      else if (name === "số điện thoại" || name === "so dien thoai" || name === "sđt" || name === "sdt") colSdt = c;
      else if (name === "dòng sp" || name === "dong sp" || name === "sản phẩm" || name === "san pham") colSp = c;
      else if (name === "mkt" || name === "marketer" || name === "tên mkt") colMkt = c;
      else if (name.includes("trạng thái")) colTt = c;
    }
  }

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length === 0) continue;

    const tg = String(r[colTg] || "").trim();
    const mvd = String(r[colMvd] || "").trim();
    const ten = String(r[colTen] || "").trim();
    const sdt = String(r[colSdt] || "").trim();
    const sp = String(r[colSp] || "").trim();
    const mkt = String(r[colMkt] || "").trim();
    const tt = String(r[colTt] || "").trim().toLowerCase();

    if (!sdt && !ten && !mvd) continue;
    if (tt.includes("huỷ") || tt.includes("huy") || tt.includes("trùng") || tt.includes("trung") || tt.includes("test")) continue;

    const mktClean = chuan_hoa_mkt_ten(mkt);
    const spClean = chuan_hoa_sp_ten(sp);
    const sdtClean = chuan_hoa_sdt_vn(sdt);

    const sig = (mvd && mvd.length > 4 && !mvd.toLowerCase().includes("test"))
      ? `TK_MVD|${mvd.toUpperCase()}`
      : `TK_INFO|${tg}|${sdtClean}|${spClean.toUpperCase()}|${mktClean.toUpperCase()}|${ten.toLowerCase()}`;

    const phoneKey = sdtClean && sdtClean.length >= 8 ? `${sdtClean}_${spClean.toUpperCase()}` : "";

    const voice = mktClean ? `${mktClean} ơi, có đơn rồi` : "Có đơn mới rồi";
    const toast = mktClean ? `MKT ${mktClean}\n${spClean}` : `Vừa có đơn mới!\n${spClean}`;

    list.push({ sig, phoneKey, mkt: mktClean, sp: spClean, voice, toast });
  }
  return list;
}

async function quet_don_dinh_ky() {
  try {
    // 1. Chế độ Native EXE: Nhận sự kiện đơn từ C# server
    if (native_exe_mode) {
      const res = await fetch(`/api/events?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.events) && data.events.length > 0) {
          for (const ev of data.events) {
            if (ev.reload) {
              window.location.reload();
              return;
            }
            if (ev.silentUpdate || ev.newVersionReady) {
              const cleanVer = String(ev.version || "").replace(/^v/i, "");
              const headerVerEl = document.getElementById("headerVersionBadge");
              if (headerVerEl && cleanVer) {
                headerVerEl.textContent = `v${cleanVer}`;
              }
              if (cleanVer) {
                document.title = `APP LÂM v${cleanVer}`;
              }

              const cssLink = document.querySelector('link[rel="stylesheet"]');
              if (cssLink) {
                const baseHref = cssLink.href.split("?")[0];
                cssLink.href = `${baseHref}?t=${Date.now()}`;
              }

              if (cleanVer && cleanVer !== last_notified_update_version && compare_semver(cleanVer, last_notified_update_version) > 0) {
                last_notified_update_version = cleanVer;
                hien_thi_bang_chuc_mung_cap_nhat(cleanVer);
              }
            }
            if (ev.toast || ev.newOrder) {
              trigger_confetti_burst();
            }
            if (ev.voice && !ev.voiceHandled && bat_thong_bao_gtts) {
              doc_am_thanh(ev.voice);
            }
          }
        }
        return;
      }
    }

    // 2. Chế độ chạy trên trình duyệt web: Lấy đơn từ DÒNG ĐẦU TIÊN (Dòng 1) của Bảng Thông Báo
    const rowsTb = await fetch_csv_with_fallback(CSV_URL_THONG_BAO, CSV_URL_THONG_BAO_FALLBACK, "thong_bao").catch(() => []);
    if (!Array.isArray(rowsTb) || rowsTb.length < 2) return;

    let colTg = 0, colTen = 1, colSdt = 2, colMkt = 6, colSp = 7;
    const h = rowsTb[0];
    if (Array.isArray(h)) {
      for (let c = 0; c < h.length; c++) {
        const name = String(h[c] || "").trim().toLowerCase();
        if (name === "thời gian" || name === "thoi gian" || name === "ngày") colTg = c;
        else if (name === "họ tên" || name === "ho ten" || name === "tên khách") colTen = c;
        else if (name === "số điện thoại" || name === "so dien thoai" || name === "sđt" || name === "sdt") colSdt = c;
        else if (name === "mkt" || name === "marketer" || name === "tên mkt") colMkt = c;
        else if (name === "dòng sp" || name === "dong sp" || name === "sản phẩm" || name === "san pham") colSp = c;
      }
    }

    const dongDau = rowsTb[1];
    const tgDau = String(dongDau[colTg] || "").trim();
    const sdtDau = String(dongDau[colSdt] || "").trim();
    const mktDau = String(dongDau[colMkt] || "").trim();
    const spDau = String(dongDau[colSp] || "").trim();

    const curRow1Key = `${tgDau}_${sdtDau}_${spDau}_${mktDau}`;

    if (!scanner_initialized) {
      last_row1_key_web = curRow1Key;
      scanner_initialized = true;
      return;
    }

    if (curRow1Key && curRow1Key !== last_row1_key_web) {
      const danh_sach_doc = [];
      const danh_sach_toast = [];

      for (let i = 1; i < Math.Min(15, rowsTb.length); i++) {
        const r = rowsTb[i];
        const tg = String(r[colTg] || "").trim();
        const sdt = String(r[colSdt] || "").trim();
        const mkt = String(r[colMkt] || "").trim();
        const sp = String(r[colSp] || "").trim();

        const key_i = `${tg}_${sdt}_${sp}_${mkt}`;
        if (key_i === last_row1_key_web) break;

        const mktClean = chuan_hoa_mkt_ten(mkt);
        const spClean = chuan_hoa_sp_ten(sp);
        if (!mktClean && (spClean === "Sản phẩm" || spClean === "Sn phcm" || !spClean)) continue;

        if (mktClean) {
          danh_sach_doc.push(`${mktClean} ơi, có đơn rồi`);
          danh_sach_toast.push(`MKT ${mktClean}\n${spClean}`);
        } else {
          danh_sach_doc.push("Có đơn mới rồi");
          danh_sach_toast.push(`Vừa có đơn mới!\n${spClean}`);
        }
      }

      last_row1_key_web = curRow1Key;

      if (danh_sach_toast.length > 0 && bat_popup_thong_bao) {
        let msg_toast = danh_sach_toast.join("\n");
        if (msg_toast.length > 150) {
          msg_toast = msg_toast.slice(0, 147) + "...";
        }
        hien_thi_popup_goc_man_hinh(t().newOrderPopupTitle, msg_toast);
      } else {
        trigger_confetti_burst();
      }

      if (danh_sach_doc.length > 0 && bat_thong_bao_gtts) {
        const loi_doc_tong = danh_sach_doc.join(". ");
        doc_am_thanh(loi_doc_tong, false);
      }
    }
  } catch (e) {}
}

let last_row1_key_web = null;
// ==============================================================
// KHỞI TẠO SỰ KIỆN GIAO DIỆN
// ==============================================================
window.addEventListener("DOMContentLoaded", async () => {
  doc_cau_hinh_tu_storage();
  await dong_bo_cau_hinh_tu_server_neu_co();
  apply_language_ui(false);

  const today = new Date();
  const todayStr = format_ymd_date(today);
  const savedStart = sessionStorage.getItem("applam_start_date");
  const savedEnd = sessionStorage.getItem("applam_end_date");
  if (savedStart && savedEnd) {
    current_start_date = savedStart;
    current_end_date = savedEnd;
  } else {
    current_start_date = todayStr;
    current_end_date = todayStr;
  }
  update_date_buttons_text();

  window.addEventListener("mousemove", (e) => {
    last_mouse_x = e.clientX;
    last_mouse_y = e.clientY;
  });

  const entrySp = document.getElementById("entrySp");
  const btnThemSp = document.getElementById("btnThemSp");

  function xu_ly_them_sp() {
    if (!entrySp) return;
    const val = entrySp.value.trim().toUpperCase();
    if (val && val !== "MÃ SP...") {
      if (luu_sp_moi(val)) {
        entrySp.value = "";
        show_toast_copy(val, t().toastSavedCode(val));
        tai_va_cap_nhat_theo_ngay();
      } else {
        show_toast_copy(val, t().toastExistingCode(val));
      }
    }
    entrySp.blur();
  }

  if (entrySp) {
    entrySp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        xu_ly_them_sp();
      }
    });
  }
  if (btnThemSp) {
    btnThemSp.addEventListener("click", xu_ly_them_sp);
  }

  document.getElementById("btnToday")?.addEventListener("click", () => {
    const now = new Date();
    const s = format_ymd_date(now);
    set_and_refresh(s, s);
  });

  document.getElementById("btnYesterday")?.addEventListener("click", () => {
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const s = format_ymd_date(yest);
    set_and_refresh(s, s);
  });

  document.getElementById("btnLastMonth")?.addEventListener("click", () => {
    const now = new Date();
    const lm_start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lm_end = new Date(now.getFullYear(), now.getMonth(), 0);
    set_and_refresh(format_ymd_date(lm_start), format_ymd_date(lm_end));
  });

  document.getElementById("btnThisMonth")?.addEventListener("click", () => {
    const now = new Date();
    const tm_start = new Date(now.getFullYear(), now.getMonth(), 1);
    const tm_end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    set_and_refresh(format_ymd_date(tm_start), format_ymd_date(tm_end));
  });

  const btnStartDate = document.getElementById("btnStartDate");
  const btnEndDate = document.getElementById("btnEndDate");

  btnStartDate?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle_calendar_popup("start", btnStartDate);
  });

  btnEndDate?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle_calendar_popup("end", btnEndDate);
  });

  document.getElementById("calPrevBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    current_cal_month -= 1;
    if (current_cal_month < 1) {
      current_cal_month = 12;
      current_cal_year -= 1;
    }
    render_calendar_grid(current_cal_year, current_cal_month);
  });

  document.getElementById("calNextBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    close_cal_custom_dropdowns();
    current_cal_month += 1;
    if (current_cal_month > 12) {
      current_cal_month = 1;
      current_cal_year += 1;
    }
    render_calendar_grid(current_cal_year, current_cal_month);
  });

  document.getElementById("calMonthBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const mMenu = document.getElementById("calMonthMenu");
    const yMenu = document.getElementById("calYearMenu");
    const mBtn = document.getElementById("calMonthBtn");
    const yBtn = document.getElementById("calYearBtn");
    yMenu?.classList.add("hidden");
    yBtn?.classList.remove("open");
    if (mMenu) {
      const willOpen = mMenu.classList.contains("hidden");
      mMenu.classList.toggle("hidden", !willOpen);
      mBtn?.classList.toggle("open", willOpen);
    }
  });

  document.getElementById("calYearBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const mMenu = document.getElementById("calMonthMenu");
    const yMenu = document.getElementById("calYearMenu");
    const mBtn = document.getElementById("calMonthBtn");
    const yBtn = document.getElementById("calYearBtn");
    mMenu?.classList.add("hidden");
    mBtn?.classList.remove("open");
    if (yMenu) {
      const willOpen = yMenu.classList.contains("hidden");
      yMenu.classList.toggle("hidden", !willOpen);
      yBtn?.classList.toggle("open", willOpen);
    }
  });

  document
    .getElementById("btnRefresh")
    ?.addEventListener("click", tai_va_cap_nhat_theo_ngay);

  const btnSettings = document.getElementById("btnSettings");
  btnSettings?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle_settings_popup(btnSettings);
  });

  const btnAllCodes = document.getElementById("btnAllCodes");
  btnAllCodes?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle_all_codes_popup(btnAllCodes);
  });
  document.getElementById("btnCloseAllCodes")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("allCodesPopup")?.classList.add("hidden");
  });
  document
    .getElementById("allCodesPopup")
    ?.addEventListener("click", (e) => e.stopPropagation());

  const closingRateCard = document.getElementById("closingRateCard");
  closingRateCard?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle_closing_rate_popup(closingRateCard);
  });
  closingRateCard?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      toggle_closing_rate_popup(closingRateCard);
    }
  });
  document.getElementById("btnCloseClosingRate")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("closingRatePopup")?.classList.add("hidden");
  });
  document
    .getElementById("closingRatePopup")
    ?.addEventListener("click", (e) => e.stopPropagation());

  document.getElementById("btnToggleAutoStart")?.addEventListener("click", () => {
    bat_khoi_dong_cung_win = !bat_khoi_dong_cung_win;
    localStorage.setItem(STORAGE_KEY_AUTOSTART, String(bat_khoi_dong_cung_win));
    cap_nhat_giao_dien_toggle_init();
    dong_bo_settings_len_server();
  });

  document.getElementById("btnToggleVoice")?.addEventListener("click", () => {
    bat_thong_bao_gtts = !bat_thong_bao_gtts;
    localStorage.setItem(STORAGE_KEY_VOICE, String(bat_thong_bao_gtts));
    cap_nhat_giao_dien_toggle_init();
    dong_bo_settings_len_server();
  });

  document.getElementById("btnTestVoice")?.addEventListener("click", () => {
    doc_am_thanh(
      "App Lâm đang trực chiến. Chúc team chốt đơn mỏi tay!",
      true
    );
  });

  document.getElementById("btnTogglePopup")?.addEventListener("click", () => {
    bat_popup_thong_bao = !bat_popup_thong_bao;
    localStorage.setItem(STORAGE_KEY_POPUP, String(bat_popup_thong_bao));
    cap_nhat_giao_dien_toggle_init();
    dong_bo_settings_len_server();
  });

  document.getElementById("btnTestPopup")?.addEventListener("click", () => {
    hien_thi_popup_goc_man_hinh(
      t().testPopupTitle,
      "MKT LÂM\nMONTIA",
      true,
      true,
      "Lâm ơi, có đơn rồi. Mẫu Mon ti a"
    );
    if (!native_exe_mode) {
      doc_am_thanh("Lâm ơi, có đơn rồi. Mẫu Mon ti a", true);
    }
  });

  document.getElementById("btnToggleFireworks")?.addEventListener("click", () => {
    bat_phao_hoa = !bat_phao_hoa;
    localStorage.setItem(STORAGE_KEY_FIREWORKS, String(bat_phao_hoa));
    cap_nhat_giao_dien_toggle_init();
    dong_bo_settings_len_server();
  });

  // Cỡ chữ (Font Size: 80% -> 140%)
  document.getElementById("btnFontDec")?.addEventListener("click", () => {
    font_scale = Math.max(80, font_scale - 5);
    localStorage.setItem(STORAGE_KEY_FONT_SCALE, String(font_scale));
  apply_scale_ui();
  });
  document.getElementById("btnFontInc")?.addEventListener("click", () => {
    font_scale = Math.min(140, font_scale + 5);
    localStorage.setItem(STORAGE_KEY_FONT_SCALE, String(font_scale));
  apply_scale_ui();
  });
  document.getElementById("fontScaleVal")?.addEventListener("click", () => {
    font_scale = 100;
    localStorage.setItem(STORAGE_KEY_FONT_SCALE, "100");
  apply_scale_ui();
  });

  // Kích thước giao diện (UI Scale: 80% -> 130%)
  document.getElementById("btnUiDec")?.addEventListener("click", () => {
    ui_scale = Math.max(80, ui_scale - 5);
    localStorage.setItem(STORAGE_KEY_UI_SCALE, String(ui_scale));
  apply_scale_ui();
  });
  document.getElementById("btnUiInc")?.addEventListener("click", () => {
    ui_scale = Math.min(130, ui_scale + 5);
    localStorage.setItem(STORAGE_KEY_UI_SCALE, String(ui_scale));
  apply_scale_ui();
  });
  document.getElementById("uiScaleVal")?.addEventListener("click", () => {
    ui_scale = 100;
    localStorage.setItem(STORAGE_KEY_UI_SCALE, "100");
  apply_scale_ui();
  });

  // Nút bật/tắt Dark Mode (Tone nâu be cozy)
  document.getElementById("btnToggleTheme")?.addEventListener("click", () => {
    current_theme = current_theme === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY_THEME, current_theme);
    apply_theme_ui();
  });

  // Các nút chuyển đổi ngôn ngữ (Tiếng Việt / Tiếng Trung / Tiếng Anh)
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = btn.getAttribute("data-lang");
      if (lang && I18N[lang] && lang !== current_lang) {
        current_lang = lang;
        localStorage.setItem(STORAGE_KEY_LANG, current_lang);
        apply_language_ui(true);
      }
    });
  });

  // Kiểm tra & cập nhật chạy ngầm 100%, tuyệt đối không làm mờ (blur) màn hình
  async function thuc_hien_kiem_tra_cap_nhat_thu_cong() {
    const statusEl = document.getElementById("updateStatusText");
    const headerVerEl = document.getElementById("headerVersionBadge");
    const headerIconEl = document.getElementById("headerUpdateIcon");
    const btnHeaderUpdate = document.getElementById("btnHeaderUpdate");

    if (btnHeaderUpdate) btnHeaderUpdate.disabled = true;
    if (headerIconEl) headerIconEl.classList.add("spinning");
    if (statusEl) statusEl.textContent = "⏳ Đang kiểm tra bản cập nhật ngầm...";

    try {
      const res = await fetch("/api/check-update", { method: "POST" }).catch(() => null);
      const data = (res && res.ok) ? await res.json().catch(() => null) : null;

      if (data) {
        if (statusEl && data.status) {
          statusEl.textContent = data.status.replace(/8\.6\.18/g, APP_FRONTEND_VERSION);
        }
        if (headerVerEl) {
          const rawVer = String(data.version || "").replace(/^v/i, "").replace(/^(\d+\.\d+\.\d+)\.\d+$/, "$1");
          const displayVer = (rawVer && compare_semver(rawVer, APP_FRONTEND_VERSION) > 0) ? rawVer : APP_FRONTEND_VERSION;
          headerVerEl.textContent = `v${displayVer}`;
        }
        if (data.updated) {
          hien_thi_bang_chuc_mung_cap_nhat(String(data.version || APP_FRONTEND_VERSION).replace(/^v/i, "").replace(/^(\d+\.\d+\.\d+)\.\d+$/, "$1"));
          return;
        } else {
          show_update_toast_notification("Bạn đang dùng phiên bản mới nhất");
        }
      } else {
        show_update_toast_notification("Bạn đang dùng phiên bản mới nhất");
      }
    } catch (e) {
    } finally {
      if (btnHeaderUpdate) btnHeaderUpdate.disabled = false;
      if (headerIconEl) headerIconEl.classList.remove("spinning");
    }
  }

  
  document.getElementById("btnHeaderUpdate")?.addEventListener("click", thuc_hien_kiem_tra_cap_nhat_thu_cong);

  document
    .getElementById("contextMenuCopyBtn")
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      const val = context_menu_spend_value;
      hide_all_popups();
      show_toast_copy(val, t().toastCopiedCp, e.clientX, e.clientY);
    });

  document
    .getElementById("calendarPopup")
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      close_cal_custom_dropdowns();
    });
  document
    .getElementById("settingsPopup")
    ?.addEventListener("click", (e) => e.stopPropagation());

  // Nút khóa ứng dụng & Đăng xuất cạnh Số đơn & Doanh số (Header) + Cài đặt
  const thuc_hien_dang_xuat = () => {
    hide_all_popups();
    lock_app();
  };
  document.getElementById("btnLogoutHeader")?.addEventListener("click", thuc_hien_dang_xuat);
  document.getElementById("btnLockApp")?.addEventListener("click", thuc_hien_dang_xuat);

  // Xử lý đăng nhập mật khẩu bảo mật
  const authForm = document.getElementById("authLoginForm");
  const pwdInput = document.getElementById("authPasswordInput");
  const errMsg = document.getElementById("authErrorMessage");
  const rememberChk = document.getElementById("authRememberCheckbox");
  const lockCard = document.querySelector(".auth-lock-card");

  async function xu_ly_xac_thuc_mat_khau() {
    if (!pwdInput) return;
    const val = pwdInput.value.trim();
    const hash = await compute_sha256(val);
    if (hash === APP_AUTH_HASH) {
      if (errMsg) errMsg.classList.add("hidden");
      set_app_authenticated(rememberChk ? rememberChk.checked : true);
      unlock_app();
      tai_va_cap_nhat_theo_ngay();
    } else {
      if (errMsg) errMsg.classList.remove("hidden");
      if (lockCard) {
        lockCard.classList.remove("shake");
        void lockCard.offsetWidth;
        lockCard.classList.add("shake");
      }
      pwdInput.focus();
      pwdInput.select();
    }
  }

  authForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    xu_ly_xac_thuc_mat_khau();
  });

  document.getElementById("btnToggleAuthPassword")?.addEventListener("click", () => {
    if (!pwdInput) return;
    const isPass = pwdInput.type === "password";
    pwdInput.type = isPass ? "text" : "password";
    const eyeOpen = document.getElementById("eyeIconOpen");
    const eyeClosed = document.getElementById("eyeIconClosed");
    if (eyeOpen && eyeClosed) {
      eyeOpen.classList.toggle("hidden", isPass);
      eyeClosed.classList.toggle("hidden", !isPass);
    }
  });

  // Modal Chi Tiết & Lọc Đơn Hàng Tổng Hợp Kiểu Excel (v8.6.106)
  document.getElementById("btnFilterAllOrders")?.addEventListener("click", (e) => {
    e.stopPropagation();
    hien_thi_bang_loc_don_tong_hop();
  });

  document.getElementById("btnOdSortToggle")?.addEventListener("click", (e) => {
    e.stopPropagation();
    od_excel_sort = { col: null, dir: null };
    od_sort_newest_first = !od_sort_newest_first;
    update_od_sort_button_ui();
    apply_od_filters_and_render(true);
  });

  document.getElementById("btnResetOdColFilters")?.addEventListener("click", (e) => {
    e.stopPropagation();
    od_excel_filters = {};
    od_excel_sort = { col: null, dir: null };
    close_od_excel_filter();
    apply_od_filters_and_render(true);
  });

  document.querySelectorAll(".od-th-filter-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const col = btn.getAttribute("data-col");
      if (col) open_od_excel_filter(col, btn);
    });
  });

  document.getElementById("odExcelFilterPopover")?.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  document.getElementById("btnOdXlClose")?.addEventListener("click", () => {
    close_od_excel_filter();
  });

  document.getElementById("btnOdXlCancel")?.addEventListener("click", () => {
    close_od_excel_filter();
  });

  document.getElementById("odXlSearchInput")?.addEventListener("input", () => {
    render_od_xl_list();
  });

  document.getElementById("odXlList")?.addEventListener("change", (e) => {
    const chk = e.target;
    if (!chk || !chk.classList.contains("od-xl-chk")) return;
    const val = chk.getAttribute("data-val");
    const item = od_xl_pending_values.find((x) => x.val === val);
    if (item) item.checked = chk.checked;
    const countInfoEl = document.getElementById("odXlCountInfo");
    if (countInfoEl) {
      const checkedTotal = od_xl_pending_values.filter((x) => x.checked).length;
      countInfoEl.textContent = `${checkedTotal}/${od_xl_pending_values.length}`;
    }
  });

  document.getElementById("btnOdXlSelectAll")?.addEventListener("click", () => {
    const q = (document.getElementById("odXlSearchInput")?.value || "").trim().toLowerCase();
    const qNoDau = q ? bo_dau_tieng_viet(q).toLowerCase() : "";
    for (const item of od_xl_pending_values) {
      if (!q) {
        item.checked = true;
      } else {
        const lbl = item.label.toLowerCase();
        if (lbl.includes(q) || bo_dau_tieng_viet(lbl).toLowerCase().includes(qNoDau)) {
          item.checked = true;
        }
      }
    }
    render_od_xl_list();
  });

  document.getElementById("btnOdXlClearAll")?.addEventListener("click", () => {
    const q = (document.getElementById("odXlSearchInput")?.value || "").trim().toLowerCase();
    const qNoDau = q ? bo_dau_tieng_viet(q).toLowerCase() : "";
    for (const item of od_xl_pending_values) {
      if (!q) {
        item.checked = false;
      } else {
        const lbl = item.label.toLowerCase();
        if (lbl.includes(q) || bo_dau_tieng_viet(lbl).toLowerCase().includes(qNoDau)) {
          item.checked = false;
        }
      }
    }
    render_od_xl_list();
  });

  document.getElementById("btnOdXlSortAsc")?.addEventListener("click", () => {
    if (!od_xl_active_col) return;
    od_excel_sort = { col: od_xl_active_col, dir: "asc" };
    close_od_excel_filter();
    apply_od_filters_and_render(true);
  });

  document.getElementById("btnOdXlSortDesc")?.addEventListener("click", () => {
    if (!od_xl_active_col) return;
    od_excel_sort = { col: od_xl_active_col, dir: "desc" };
    close_od_excel_filter();
    apply_od_filters_and_render(true);
  });

  document.getElementById("btnOdXlResetCol")?.addEventListener("click", () => {
    if (!od_xl_active_col) return;
    delete od_excel_filters[od_xl_active_col];
    if (od_excel_sort.col === od_xl_active_col) {
      od_excel_sort = { col: null, dir: null };
    }
    close_od_excel_filter();
    apply_od_filters_and_render(true);
  });

  document.getElementById("btnOdXlApply")?.addEventListener("click", () => {
    if (!od_xl_active_col) return;
    const checkedItems = od_xl_pending_values.filter((x) => x.checked);
    if (checkedItems.length === od_xl_pending_values.length) {
      delete od_excel_filters[od_xl_active_col];
    } else {
      od_excel_filters[od_xl_active_col] = new Set(checkedItems.map((x) => x.val));
    }
    close_od_excel_filter();
    apply_od_filters_and_render(true);
  });

  document.getElementById("btnOdLoadMore")?.addEventListener("click", (e) => {
    e.stopPropagation();
    od_render_limit += 500;
    render_order_detail_table(current_od_filtered_list);
  });

  document.getElementById("btnOdLoadAll")?.addEventListener("click", (e) => {
    e.stopPropagation();
    od_render_limit = 999999;
    render_order_detail_table(current_od_filtered_list);
  });

  const odSearchInput = document.getElementById("odSearchInput");
  const odClearBtn = document.getElementById("btnClearOdSearch");

  odSearchInput?.addEventListener("input", () => {
    const q = odSearchInput.value.trim();
    if (odClearBtn) odClearBtn.classList.toggle("hidden", !q);
    apply_od_filters_and_render(true);
  });

  odClearBtn?.addEventListener("click", () => {
    if (odSearchInput) {
      odSearchInput.value = "";
      odClearBtn.classList.add("hidden");
      apply_od_filters_and_render(true);
      odSearchInput.focus();
    }
  });

  document.getElementById("btnCloseOrderDetail")?.addEventListener("click", (e) => {
    e.stopPropagation();
    dong_bang_don_hang_chi_tiet();
  });
  document.getElementById("btnDismissOrderDetail")?.addEventListener("click", (e) => {
    e.stopPropagation();
    dong_bang_don_hang_chi_tiet();
  });

  document.getElementById("orderDetailModal")?.addEventListener("click", (e) => {
    if (e.target.id === "orderDetailModal") {
      dong_bang_don_hang_chi_tiet();
    }
  });

  document.querySelector(".order-detail-card")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!e.target.closest("#odExcelFilterPopover") && !e.target.closest(".od-th-filter-btn")) {
      close_od_excel_filter();
    }
  });

  // TỰ ĐỘNG CẬP NHẬT TỨC THÌ KHI MÁY TÍNH BẮT ĐƯỢC SÓNG WI-FI / INTERNET
  window.addEventListener("online", () => {
    console.log("Phát hiện Windows vừa kết nối Internet thành công!");
    if (auto_retry_timer) {
      clearInterval(auto_retry_timer);
      auto_retry_timer = null;
    }
    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingMainText = document.getElementById("loadingMainText");
    const loadingSubText = document.getElementById("loadingSubText");
    if (loadingOverlay) loadingOverlay.classList.remove("hidden");
    if (loadingMainText) loadingMainText.textContent = "⏳ Đã có mạng Wi-Fi!";
    if (loadingSubText) loadingSubText.textContent = "Đang đồng bộ tức thì Google Sheets & Ads...";
    tai_va_cap_nhat_theo_ngay(true);
  });

  window.addEventListener("click", () => {
    hide_all_popups();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const xlPop = document.getElementById("odExcelFilterPopover");
      if (xlPop && !xlPop.classList.contains("hidden")) {
        close_od_excel_filter();
        return;
      }
      hide_all_popups();
      dong_bang_don_hang_chi_tiet();
    }
  });

  // Kiểm tra trạng thái đăng nhập khi mở app
  if (!is_app_authenticated()) {
    show_auth_lock_screen();
  } else {
    unlock_app();
    await tai_va_cap_nhat_theo_ngay();
  }

  await quet_don_dinh_ky();
  setInterval(quet_don_dinh_ky, 3000);
});
