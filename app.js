// ==============================================================
// APP LÂM v8.6.28 - Upgraded Web & Desktop Hybrid Application Logic
// ==============================================================

const APP_FRONTEND_VERSION = "8.6.29";

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

const CSV_URL_THONG_KE =
  "https://docs.google.com/spreadsheets/d/1gC1_mygyFOTmDHgtKPzMulTq3HoxVA91suHSEM0cr7k/export?format=csv&gid=1227181736";
const CSV_URL_THONG_KE_FALLBACK =
  "https://docs.google.com/spreadsheets/d/1gC1_mygyFOTmDHgtKPzMulTq3HoxVA91suHSEM0cr7k/gviz/tq?tqx=out:csv&gid=1227181736";

const CSV_URL_THONG_BAO =
  "https://docs.google.com/spreadsheets/d/1gC1_mygyFOTmDHgtKPzMulTq3HoxVA91suHSEM0cr7k/export?format=csv&gid=0";
const CSV_URL_THONG_BAO_FALLBACK =
  "https://docs.google.com/spreadsheets/d/1gC1_mygyFOTmDHgtKPzMulTq3HoxVA91suHSEM0cr7k/gviz/tq?tqx=out:csv&gid=0";

const FB_TOKEN =
  "EAAXG9iM6xxUBSs07QihLBBE9G0EO51KvuwL8OZCivrZCJZCRsZBaJQYj8DRGCXo7Gre8HKFxRB0YZCitwq0eQVoyZBkR1lo6Mq37COclCnbvJCESPtn8cdecYnghPaFCWRFo7QK0wBJcYnZBY6vzAIQPbKxEZC8BCw2XjBNXnJWVADZCt45x56gDHrOv85lqMkgZDZD";

const LIST_MKT_FB = [
  { ten: "LÂM", id: "act_1219584325802699" },
  { ten: "TH.LÂM", id: "act_2795566000842055" },
  { ten: "PHÚC", id: "act_565886575873090" },
  { ten: "TÂM", id: "act_611714185179363" },
  { ten: "SAN", id: "act_1333165132087237" },
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
    top5SpHeader: "TOP 5 MÃ TỔNG CÔNG TY",
    emptyMktList: "Chưa có đơn và chưa có CP",
    emptyMktDetail: (m) => `${m} chưa có CP Ads và chưa có đơn.`,
    emptySpList: "Chưa ghi nhận mẫu nào",
    calMonthYearFmt: (m, y) => `Tháng ${m} / ${y}`,
    weekdays: ["T2", "T3", "T4", "T5", "T6", "T7", "CN"],
    settingsTitle: "⚙ CÀI ĐẶT HỆ THỐNG",
    lblVoice: "1. Âm thanh (Chị Google):",
    lblPopup: "2. Popup Góc Màn Hình:",
    lblFireworks: "3. Hiệu ứng Pháo Hoa:",
    lblFontSize: "4. Cỡ chữ (Font Size):",
    lblUiScale: "5. Kích thước giao diện:",
    lblTheme: "6. Giao diện (Dark Mode):",
    lblLang: "7. Ngôn ngữ (Language):",
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
    weekdays: ["一", "二", "三", "四", "五", "六", "日"],
    settingsTitle: "⚙ 系统设置",
    lblVoice: "1. 语音播报 (Google 语音):",
    lblPopup: "2. 屏幕右下角弹窗:",
    lblFireworks: "3. 烟花庆祝特效:",
    lblFontSize: "4. 字体大小 (Font Size):",
    lblUiScale: "5. 界面缩放 (UI Scale):",
    lblTheme: "6. 界面主题 (深色模式):",
    lblLang: "7. 语言选择 (Language):",
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
    top5SpHeader: "TOP 5 PRODUCTS",
    emptyMktList: "No orders or ad spend recorded",
    emptyMktDetail: (m) => `${m} has no ad spend or orders yet.`,
    emptySpList: "No product models recorded",
    calMonthYearFmt: (m, y) => `Month ${m} / ${y}`,
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    settingsTitle: "⚙ SYSTEM SETTINGS",
    lblVoice: "1. Voice Alert (Google TTS):",
    lblPopup: "2. Corner Popup Alert:",
    lblFireworks: "3. Fireworks Celebration:",
    lblFontSize: "4. Font Size:",
    lblUiScale: "5. Interface Scale:",
    lblTheme: "6. Appearance (Dark Mode):",
    lblLang: "7. Language:",
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

function trigger_confetti_burst() {
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
  const originX = window.innerWidth - 160;
  const originY = window.innerHeight - 90;

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
  setText("lblSettingUpdate", dict.lblUpdate);
  setText("btnSaveUpdateUrl", dict.btnSaveUpdateUrl);
  setText("btnCheckUpdateNow", dict.btnCheckUpdateNow);
  const entryUpdateUrl = document.getElementById("entryUpdateUrl");
  if (entryUpdateUrl) entryUpdateUrl.placeholder = dict.updateUrlPlaceholder;
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

    // Đồng bộ thông tin tự động cập nhật từ Server C#
    try {
      const headerVerEl = document.getElementById("headerVersionBadge");
      if (headerVerEl) headerVerEl.textContent = `v${APP_FRONTEND_VERSION}`;

      const upRes = await fetch("/api/update-status", { cache: "no-store" });
      if (upRes.ok) {
        const upData = await upRes.json();
        const urlInput = document.getElementById("entryUpdateUrl");
        const statusEl = document.getElementById("updateStatusText");
        if (urlInput && upData.baseUrl) urlInput.value = upData.baseUrl;
        if (statusEl && upData.status) {
          statusEl.textContent = upData.status.replace(/8\.6\.18/g, APP_FRONTEND_VERSION);
        }
        if (headerVerEl) {
          const rawVer = String(upData.version || "").replace(/^v/i, "");
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
      const timer = setTimeout(() => controller.abort(), 10000);
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
  const [rowsThongKe, rowsThongBao] = await Promise.all([
    fetch_csv_with_fallback(
      CSV_URL_THONG_KE,
      CSV_URL_THONG_KE_FALLBACK,
      "thong_ke"
    ),
    fetch_csv_with_fallback(
      CSV_URL_THONG_BAO,
      CSV_URL_THONG_BAO_FALLBACK,
      "thong_bao"
    ),
  ]);
  if (rowsThongKe) {
    data_hien_tai = rowsThongKe;
  }
  if (rowsThongBao) {
    data_tong_don_upyo = rowsThongBao;
  }
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

  await Promise.all(
    LIST_MKT_FB.map(async (mkt) => {
      const mkt_ten = mkt.ten;
      let url =
        `https://graph.facebook.com/v19.0/${mkt.id}/insights` +
        `?level=campaign&fields=campaign_name,spend` +
        `&time_range=${encodeURIComponent(time_range)}&limit=100&access_token=${FB_TOKEN}`;

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
            local_chi_tiet[mkt_ten][ten_mau] =
              (local_chi_tiet[mkt_ten][ten_mau] || 0.0) + spend;
            local_tong[mkt_ten] += spend;
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

function dem_don_chi_tiet_theo_ngay(start_str, end_str) {
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

  const patternsArr = Array.from(date_patterns);

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
        const trang_thai = String(r[13] || "").trim().toUpperCase();
        if (
          trang_thai.includes("ĐÃ LÊN ĐƠN") ||
          trang_thai.includes("CHỐT CHƯA CÓ HÀNG") ||
          trang_thai.includes("ĐƠN TEST")
        ) {
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
// Loại trừ khung giờ nghỉ: 23:00 - 08:00, 12:00 - 12:30, 18:00 - 18:30
function calc_working_call_seconds(dtStart, dtEnd) {
  if (!dtStart || !dtEnd) return null;
  const tStart = dtStart.getTime();
  const tEnd = dtEnd.getTime();
  if (isNaN(tStart) || isNaN(tEnd) || tEnd < tStart) return null;

  // Giới hạn tối đa 7 ngày để tránh vòng lặp dài với dữ liệu lỗi
  if (tEnd - tStart > 7 * 86400 * 1000) return null;

  const dayCursor = new Date(dtStart.getFullYear(), dtStart.getMonth(), dtStart.getDate(), 0, 0, 0, 0);
  const lastDay = new Date(dtEnd.getFullYear(), dtEnd.getMonth(), dtEnd.getDate(), 0, 0, 0, 0);

  // Các khung giờ làm việc trong ngày (đã loại trừ 23h-8h, 12h-12h30, 18h-18h30):
  // Ca sáng: 08:00 - 12:00 | Ca chiều: 12:30 - 18:00 | Ca tối: 18:30 - 23:00
  const shifts = [
    [8, 0, 12, 0],
    [12, 30, 18, 0],
    [18, 30, 23, 0],
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
  toast.textContent = msg;
  toast.style.opacity = "1";
  toast.style.transform = "translateX(-50%) translateY(0)";
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(-12px)";
  }, 4500);
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
  card.className = "cozy-card company-summary-card";
  card.style.setProperty("--card-index", "0");

  const topRow = document.createElement("div");
  topRow.className = "card-top-row";
  topRow.innerHTML = `
    <div class="card-title-group">
      <span class="card-name">${dict.companySummaryTitle}</span>
      <span class="card-sub-label">${date_label}</span>
    </div>
    <div class="card-count-group">
      <span class="card-count-val js-total-orders" style="color: var(--color-highlight)">0</span>
      <span class="card-count-unit">${dict.totalOrdersUnit}</span>
    </div>
  `;

  card.appendChild(topRow);
  card.appendChild(
    create_metrics_grid_dom(tong_cp, tong_dt, tong_don, dict.noRevenueYet)
  );
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
      <span class="card-click-hint">${dict.viewDetailHint}</span>
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

  card.addEventListener("click", () => onClick(name_str));
  attach_right_click_copy(card, spend);
  return card;
}

function create_sp_detail_card(idx, ma_str, count, spend, doanh_so, maxCount) {
  const dict = t();
  const card = document.createElement("div");
  card.className = "cozy-card";
  card.style.setProperty("--card-index", String(idx));

  const topRow = document.createElement("div");
  topRow.className = "card-top-row";
  topRow.innerHTML = `
    <div class="card-title-group">
      <span class="card-name">👟 ${ma_str}</span>
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

  attach_right_click_copy(card, spend);
  return card;
}

function create_top_sp_card(rank, name_str, count, spend, doanh_so, maxCount) {
  const dict = t();
  const { cls, pillCls, icon, color, barColor } = get_rank_style(rank);

  const card = document.createElement("div");
  card.className = `cozy-card ${cls}`;
  card.style.setProperty("--card-index", String(rank));

  const topRow = document.createElement("div");
  topRow.className = "card-top-row";
  topRow.innerHTML = `
    <div class="card-title-group">
      <span class="rank-pill ${pillCls}">${icon ? icon + " " : ""}#${rank}</span>
      <span class="card-name">${name_str}</span>
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
      if (b.don !== a.don) return b.don - a.don;
      return b.doanh_so - a.doanh_so;
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

    const chi_tiet_fb = fb_chi_tiet_map[ten_mkt] || {};
    const don_cua_mkt = stats_mkt_sp_don[ten_mkt] || {};
    const dt_cua_mkt = stats_mkt_sp_dt[ten_mkt] || {};

    const tat_ca_ma = Array.from(
      new Set([...Object.keys(chi_tiet_fb), ...Object.keys(don_cua_mkt)])
    ).sort();

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

  const top_5_sp = Object.entries(stats_sp_don).slice(0, 5);
  if (top_5_sp.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state-msg";
    empty.textContent = dict.emptySpList;
    listSp.appendChild(empty);
  } else {
    const maxSpCount = Math.max(...top_5_sp.map(([, c]) => c), 1);
    top_5_sp.forEach(([sp_name, sp_count], idx) => {
      const sp_ds = stats_sp_dt[sp_name] || 0.0;
      const sp_cp = global_sp_spend[sp_name] || 0.0;
      const card = create_top_sp_card(
        idx + 1,
        sp_name,
        sp_count,
        sp_cp,
        sp_ds,
        maxSpCount
      );
      listSp.appendChild(card);
    });
  }
}

// ==============================================================
// TẢI VÀ CẬP NHẬT DỮ LIỆU THEO NGÀY
// ==============================================================
async function tai_va_cap_nhat_theo_ngay() {
  const btnRefresh = document.getElementById("btnRefresh");
  const refreshIcon = document.getElementById("refreshIcon");
  const loadingOverlay = document.getElementById("loadingOverlay");

  hide_all_popups();

  if (btnRefresh) btnRefresh.disabled = true;
  if (refreshIcon) refreshIcon.classList.add("spinning");
  if (loadingOverlay) loadingOverlay.classList.remove("hidden");

  if (current_start_date > current_end_date) {
    const tmp = current_start_date;
    current_start_date = current_end_date;
    current_end_date = tmp;
    update_date_buttons_text();
  }

  try {
    const [_, fbResult] = await Promise.all([
      tai_du_lieu_google_sheets(),
      quet_chi_phi_facebook_helper(current_start_date, current_end_date),
    ]);
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
      lastSyncEl.textContent = `${t().lastSyncPrefix}${last_sync_time_str}`;
    }
  } catch (e) {
    console.error("Lỗi khi tải dữ liệu:", e);
  } finally {
    if (loadingOverlay) loadingOverlay.classList.add("hidden");
    if (btnRefresh) btnRefresh.disabled = false;
    if (refreshIcon) refreshIcon.classList.remove("spinning");
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
function render_calendar_grid(year, month) {
  const label = document.getElementById("calMonthYearLabel");
  const grid = document.getElementById("calGrid");
  if (!label || !grid) return;

  label.textContent = t().calMonthYearFmt(month, year);
  grid.innerHTML = "";

  const firstDayJs = new Date(year, month - 1, 1).getDay();
  const mondayBasedOffset = (firstDayJs + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();

  const targetVal =
    current_cal_target === "start" ? current_start_date : current_end_date;

  for (let i = 0; i < mondayBasedOffset; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-day-empty";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const d_str = `${year}-${String(month).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "cal-day-btn" + (d_str === targetVal ? " selected" : "");
    btn.textContent = String(day);
    btn.addEventListener("click", () => {
      if (current_cal_target === "start") {
        current_start_date = d_str;
      } else if (current_cal_target === "end") {
        current_end_date = d_str;
      }
      try {
        sessionStorage.setItem("applam_start_date", current_start_date);
        sessionStorage.setItem("applam_end_date", current_end_date);
      } catch (e) {}
      update_date_buttons_text();
      hide_all_popups();
      tai_va_cap_nhat_theo_ngay();
    });
    grid.appendChild(btn);
  }
}

function toggle_calendar_popup(targetType, anchorBtn) {
  const calPopup = document.getElementById("calendarPopup");
  const settingsPopup = document.getElementById("settingsPopup");
  if (!calPopup || !anchorBtn) return;

  document.getElementById("allCodesPopup")?.classList.add("hidden");
  document.getElementById("closingRatePopup")?.classList.add("hidden");
  settingsPopup.classList.add("hidden");

  if (
    !calPopup.classList.contains("hidden") &&
    current_cal_target === targetType
  ) {
    calPopup.classList.add("hidden");
    current_cal_target = null;
    return;
  }

  current_cal_target = targetType;
  const curStr =
    targetType === "start" ? current_start_date : current_end_date;
  const dt = parse_ymd_date(curStr);
  current_cal_year = dt.getFullYear();
  current_cal_month = dt.getMonth() + 1;

  render_calendar_grid(current_cal_year, current_cal_month);

  calPopup.classList.remove("hidden");
  const rect = anchorBtn.getBoundingClientRect();
  const popupWidth = 288;
  let left = rect.left - 50;
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
  const popupWidth = 300;
  let left = rect.right - popupWidth;
  if (left < 12) left = 12;

  settingsPopup.style.left = `${left}px`;
  settingsPopup.style.top = `${rect.bottom + 7}px`;
}

function hide_all_popups() {
  const calPopup = document.getElementById("calendarPopup");
  const settingsPopup = document.getElementById("settingsPopup");
  const ctxMenu = document.getElementById("contextMenu");
  if (calPopup) calPopup.classList.add("hidden");
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

  apply_scale_ui();
}

// ==============================================================
// LUỒNG QUÉT ĐƠN MỚI MỖI 3 GIÂY (quet_don)
// ==============================================================
async function quet_don_dinh_ky() {
  try {
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

              // Nạp lại stylesheet mới mà KHÔNG cần reload trang
              const cssLink = document.querySelector('link[rel="stylesheet"]');
              if (cssLink) {
                const baseHref = cssLink.href.split("?")[0];
                cssLink.href = `${baseHref}?t=${Date.now()}`;
              }

              show_update_toast_notification(`✨ Đã tự động cập nhật ngầm lên bản v${cleanVer || APP_FRONTEND_VERSION}!`);
            }
            if (ev.toast && bat_popup_thong_bao) {
              hien_thi_popup_goc_man_hinh(
                t().newOrderPopupTitle,
                ev.toast,
                false,
                false
              );
            } else if (!ev.reload) {
              trigger_confetti_burst();
            }
            if (ev.voice && bat_thong_bao_gtts) {
              doc_am_thanh(ev.voice);
            }
          }
        }
        return;
      }
    }

    const du_lieu_moi = await fetch_csv_with_fallback(
      CSV_URL_THONG_BAO,
      CSV_URL_THONG_BAO_FALLBACK,
      "thong_bao"
    );

    if (!du_lieu_moi) return;
    const tong_so_dong = du_lieu_moi.length;

    if (!scanner_initialized) {
      dong_cuoi_cung = tong_so_dong;
      scanner_initialized = true;
      return;
    }

    if (dong_cuoi_cung === 0 || tong_so_dong < dong_cuoi_cung) {
      dong_cuoi_cung = tong_so_dong;
    } else if (tong_so_dong > dong_cuoi_cung) {
      const danh_sach_doc = [];
      const danh_sach_toast = [];

      for (let idx = dong_cuoi_cung; idx < tong_so_dong; idx++) {
        const dong_moi = du_lieu_moi[idx];
        const mkt = dong_moi.length > 6 ? String(dong_moi[6] || "").trim() : "";
        const sp =
          dong_moi.length > 7 && String(dong_moi[7] || "").trim()
            ? String(dong_moi[7]).trim()
            : "Sản phẩm";

        if (
          ["mkt", "marketer", "tên mkt", "sale"].includes(mkt.toLowerCase())
        ) {
          continue;
        }

        if (mkt) {
          danh_sach_doc.push(`${mkt} ơi, có đơn rồi`);
          danh_sach_toast.push(`MKT ${mkt}\n${sp}`);
        } else {
          danh_sach_doc.push("Có đơn mới rồi");
          danh_sach_toast.push("Vừa có đơn hàng mới!");
        }
      }

      dong_cuoi_cung = tong_so_dong;

      if (danh_sach_toast.length > 0 && bat_popup_thong_bao) {
        let msg_toast = danh_sach_toast.join("\n");
        if (msg_toast.length > 150) {
          msg_toast = msg_toast.slice(0, 147) + "...";
        }
        hien_thi_popup_goc_man_hinh(t().newOrderPopupTitle, msg_toast);
      }

      if (danh_sach_doc.length > 0 && bat_thong_bao_gtts) {
        const loi_doc_tong = danh_sach_doc.join(". ");
        doc_am_thanh(loi_doc_tong, false);
      }
    }
  } catch (e) {}
}

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
    current_cal_month += 1;
    if (current_cal_month > 12) {
      current_cal_month = 1;
      current_cal_year += 1;
    }
    render_calendar_grid(current_cal_year, current_cal_month);
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

  // Cài đặt Tự động cập nhật từ GitHub (Kèm hiệu ứng Gaussian Blur giống nút Tải Lại)
  async function thuc_hien_kiem_tra_cap_nhat_thu_cong() {
    const statusEl = document.getElementById("updateStatusText");
    const headerVerEl = document.getElementById("headerVersionBadge");
    const headerIconEl = document.getElementById("headerUpdateIcon");
    const btnHeaderUpdate = document.getElementById("btnHeaderUpdate");
    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingMainEl = document.getElementById("loadingMainText");
    const loadingSubEl = document.getElementById("loadingSubText");

    if (btnHeaderUpdate) btnHeaderUpdate.disabled = true;
    if (headerIconEl) headerIconEl.classList.add("spinning");
    if (loadingMainEl) loadingMainEl.textContent = "⏳ Đang kiểm tra & cập nhật phiên bản...";
    if (loadingSubEl) loadingSubEl.textContent = "Đang đồng bộ bản mới nhất và dữ liệu hệ thống";
    if (loadingOverlay) loadingOverlay.classList.remove("hidden");
    if (statusEl) statusEl.textContent = "⏳ Đang kiểm tra bản cập nhật...";

    try {
      const checkPromise = fetch("/api/check-update", { method: "POST" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      const [data] = await Promise.all([
        checkPromise,
        tai_du_lieu_google_sheets().catch(() => {}),
        quet_chi_phi_facebook_helper(current_start_date, current_end_date)
          .then((fbResult) => {
            cached_fb_chi_tiet = fbResult.local_chi_tiet;
            cached_fb_tong = fbResult.local_tong;
            ve_noi_dung_dashboard(
              current_start_date,
              current_end_date,
              cached_fb_chi_tiet,
              cached_fb_tong
            );
          })
          .catch(() => {}),
      ]);

      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      last_sync_time_str = `${hh}:${mm}:${ss}`;
      const lastSyncEl = document.getElementById("lastSyncText");
      if (lastSyncEl) {
        lastSyncEl.textContent = `${t().lastSyncPrefix}${last_sync_time_str}`;
      }

      if (data) {
        if (statusEl && data.status) {
          statusEl.textContent = data.status.replace(/8\.6\.18/g, APP_FRONTEND_VERSION);
        }
        if (headerVerEl) {
          const rawVer = String(data.version || "").replace(/^v/i, "");
          const displayVer = (rawVer && compare_semver(rawVer, APP_FRONTEND_VERSION) > 0) ? rawVer : APP_FRONTEND_VERSION;
          headerVerEl.textContent = `v${displayVer}`;
        }
        if (data.updated) {
          setTimeout(() => window.location.reload(), 400);
          return;
        }
      }
    } catch (e) {
    } finally {
      if (loadingMainEl) loadingMainEl.textContent = t().loadingMain;
      if (loadingSubEl) loadingSubEl.textContent = t().loadingSub;
      if (loadingOverlay) loadingOverlay.classList.add("hidden");
      if (btnHeaderUpdate) btnHeaderUpdate.disabled = false;
      if (headerIconEl) headerIconEl.classList.remove("spinning");
    }
  }

  document.getElementById("btnSaveUpdateUrl")?.addEventListener("click", async () => {
    const urlInput = document.getElementById("entryUpdateUrl");
    const statusEl = document.getElementById("updateStatusText");
    const headerVerEl = document.getElementById("headerVersionBadge");
    if (!urlInput) return;
    let rawUrl = urlInput.value.trim();
    if (!rawUrl) {
      rawUrl = "https://raw.githubusercontent.com/nguyen27004-cyber/app-lam/main";
      urlInput.value = rawUrl;
    }
    if (statusEl) statusEl.textContent = "⏳ Đang lưu và kiểm tra cập nhật...";
    try {
      const res = await fetch("/api/update-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: rawUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.baseUrl) urlInput.value = data.baseUrl;
        if (statusEl && data.status) statusEl.textContent = data.status;
        if (headerVerEl && data.version) {
          const v = String(data.version).startsWith("v") ? data.version : `v${data.version}`;
          headerVerEl.textContent = v;
        }
        if (data.updated) {
          setTimeout(() => window.location.reload(), 600);
        }
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = "Chỉ hỗ trợ khi chạy trên ứng dụng .exe";
    }
  });

  document.getElementById("btnCheckUpdateNow")?.addEventListener("click", thuc_hien_kiem_tra_cap_nhat_thu_cong);
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
    ?.addEventListener("click", (e) => e.stopPropagation());
  document
    .getElementById("settingsPopup")
    ?.addEventListener("click", (e) => e.stopPropagation());

  window.addEventListener("click", () => {
    hide_all_popups();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide_all_popups();
  });

  await tai_va_cap_nhat_theo_ngay();

  await quet_don_dinh_ky();
  setInterval(quet_don_dinh_ky, 3000);
});
