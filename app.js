// ==============================================================
// APP LÂM v8.6.62 - Upgraded Web & Desktop Hybrid Application Logic
// ==============================================================

const APP_FRONTEND_VERSION = "8.6.398";
const APP_DATA_MIN_DATE = "2026-11-01"; // Không lấy dữ liệu trước tháng 11/2026

function clamp_min_data_date(ymdStr) {
  const s = String(ymdStr || "").trim();
  if (!s) return APP_DATA_MIN_DATE;
  return s < APP_DATA_MIN_DATE ? APP_DATA_MIN_DATE : s;
}
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
// BẢO MẬT KHÓA ĐỘNG & URL APPS SCRIPT (v8.6.237 - KHÔNG LƯU KHÓA TRÊN GITHUB)
// ==============================================================
const APPS_SCRIPT_BASE_URL =
  "https://script.google.com/macros/s/AKfycbxCZ-Dv4-ywGIyfoB7Vm5RHmKWlpi4T3S5pdkeyl5iN656CbTj7LHtr1EjXTIYUJGLr/exec";
const API_KEY_STORAGE_KEY = "app_lam_api_key";
let _runtime_api_key = "";

function is_valid_api_key(v) {
  return /^[0-9a-f]{64}$/.test(String(v || "").trim().toLowerCase());
}

function get_apps_script_api_key() {
  if (is_valid_api_key(_runtime_api_key)) return _runtime_api_key;
  try {
    const ls = (localStorage.getItem(API_KEY_STORAGE_KEY) || "").trim().toLowerCase();
    if (is_valid_api_key(ls)) {
      _runtime_api_key = ls;
      return ls;
    }
    const ss = (sessionStorage.getItem(API_KEY_STORAGE_KEY) || "").trim().toLowerCase();
    if (is_valid_api_key(ss)) {
      _runtime_api_key = ss;
      return ss;
    }
  } catch (e) {}
  return "";
}

function build_apps_script_url(extraQuery) {
  const key = get_apps_script_api_key();
  if (!key) return "";
  return `${APPS_SCRIPT_BASE_URL}?key=${encodeURIComponent(key)}&${extraQuery}`;
}

// v8.6.233: Token Facebook được lưu kín trong Google Apps Script (applam.gs), không lưu trong app.js/GitHub.

// IndexedDB helper bất đồng bộ để lưu dữ liệu lớn (Sheet & Pancake) không làm đơ UI thread
const IDB_CACHE_NAME = "applam_fast_cache_v1";
const IDB_CACHE_STORE = "kv";
let _idbOpenPromise = null;

function open_fast_cache_db() {
  if (_idbOpenPromise) return _idbOpenPromise;
  _idbOpenPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      const req = indexedDB.open(IDB_CACHE_NAME, 1);
      req.onupgradeneeded = (e) => {
        try {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(IDB_CACHE_STORE)) {
            db.createObjectStore(IDB_CACHE_STORE);
          }
        } catch (err) {}
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
  return _idbOpenPromise;
}

async function idb_cache_get(key) {
  try {
    const db = await open_fast_cache_db();
    if (!db) return null;
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_CACHE_STORE, "readonly");
        const req = tx.objectStore(IDB_CACHE_STORE).get(key);
        req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  } catch (e) {
    return null;
  }
}

async function idb_cache_set(key, val) {
  try {
    const db = await open_fast_cache_db();
    if (!db) return false;
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_CACHE_STORE, "readwrite");
        tx.objectStore(IDB_CACHE_STORE).put(val, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  } catch (e) {
    return false;
  }
}

let _pancakeConvCacheHydrated = false;

// v8.6.237: Token Pancake được lưu kín trong Apps Script (applam.gs) và tải qua ?mode=cfg sau khi đăng nhập.
let PANCAKE_PAGES = [];
let _pancakeCfgLoaded = false;
let _pancakeCfgPromise = null;

async function ensure_pancake_pages_cfg() {
  if (_pancakeCfgLoaded && PANCAKE_PAGES.length > 0) return PANCAKE_PAGES;
  if (_pancakeCfgPromise) return _pancakeCfgPromise;
  const cfgUrl = build_apps_script_url("mode=cfg");
  if (!cfgUrl) return [];
  _pancakeCfgPromise = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20000);
        const res = await fetch(`${cfgUrl}&t=${Date.now()}`, { cache: "no-store", signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const txt = await res.text();
        if (!txt || txt.trim() === "Unauthorized") return [];
        const data = JSON.parse(txt);
        if (data && Array.isArray(data.pancakePages) && data.pancakePages.length > 0) {
          PANCAKE_PAGES = data.pancakePages
            .filter((p) => p && p.pageId && p.token)
            .map((p) => ({
              pageId: String(p.pageId).trim(),
              mkt: String(p.mkt || "").trim(),
              mktSheet: String(p.mktSheet || p.mkt || "").trim(),
              token: String(p.token).trim(),
            }));
          _pancakeCfgLoaded = PANCAKE_PAGES.length > 0;
          return PANCAKE_PAGES;
        }
      } catch (e) {
        if (attempt === 0) await new Promise((r) => setTimeout(r, 700));
      }
    }
    return PANCAKE_PAGES;
  })().finally(() => {
    _pancakeCfgPromise = null;
  });
  return _pancakeCfgPromise;
}
const PANCAKE_SHOP_PHONES = new Set(["0974566895", "0915519166"]);
let data_pancake_orders = [];
let pancake_last_fetch_ms = 0;
let pancake_fetch_promise = null;
const pancake_conv_msg_cache = new Map();

function parse_pancake_utc_to_vn(isoStr) {
  const s = String(isoStr || "").trim();
  if (!s) return { ymd: "", dmy: "", timeMs: 0 };
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  const dt = new Date(hasTz ? s : s + "Z");
  if (Number.isNaN(dt.getTime())) return { ymd: "", dmy: "", timeMs: 0 };
  const vnMs = dt.getTime() + 7 * 3600 * 1000;
  const vn = new Date(vnMs);
  const yyyy = vn.getUTCFullYear();
  const mm = String(vn.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(vn.getUTCDate()).padStart(2, "0");
  return {
    ymd: `${yyyy}-${mm}-${dd}`,
    dmy: `${dd}/${mm}/${yyyy}`,
    timeMs: vnMs,
  };
}

const PANCAKE_CONV_CACHE_IDB_KEY = "pancake_conv_map_v4";

function get_pancake_phone_info(conv, msgs = null, msgJson = null) {
  const valid = [];
  const fallback = [];
  const orderLinked = [];
  const seen = new Set();
  const seenOrderLinked = new Set();
  const pushCandidate = (raw, isOrderLinked = false) => {
    const norm = chuan_hoa_sdt_so_sanh(raw);
    if (!norm || PANCAKE_SHOP_PHONES.has(norm)) return;
    const isStd = /^0[35789]\d{8}$/.test(norm);
    const isFb = !isStd && (/^0\d{7,10}$/.test(norm) || /^1[89]00\d{4,6}$/.test(norm));
    if (!isStd && !isFb) return;
    if (isOrderLinked && !seenOrderLinked.has(norm)) {
      seenOrderLinked.add(norm);
      orderLinked.push(norm);
    }
    if (seen.has(norm)) return;
    seen.add(norm);
    if (isStd) valid.push(norm);
    else fallback.push(norm);
  };

  const rawList = Array.isArray(conv && conv.recent_phone_numbers) ? conv.recent_phone_numbers : [];
  for (const item of rawList) {
    pushCandidate(item && (item.phone_number || item.captured || item), Boolean(item && item.order_id));
  }
  const custLists = [
    ...(Array.isArray(conv && conv.customers) ? conv.customers : []),
    ...(Array.isArray(msgJson && msgJson.customers) ? msgJson.customers : []),
  ];
  for (const c of custLists) {
    if (c && c.phone_number) pushCandidate(c.phone_number, false);
    const cPhones = Array.isArray(c && c.recent_phone_numbers) ? c.recent_phone_numbers : [];
    for (const cp of cPhones) {
      pushCandidate(cp && (cp.phone_number || cp.captured || cp), Boolean(cp && cp.order_id));
    }
  }

  // Nếu sidebar Pancake chưa bắt được SĐT chuẩn 10 số -> quét thêm SĐT chuẩn trong nội dung chat
  if (valid.length === 0 && Array.isArray(msgs)) {
    for (const msg of msgs) {
      const txt = String((msg && (msg.original_message || msg.message)) || "");
      if (!txt) continue;
      const matches = txt.match(/(?:\+?84|0)[35789](?:[\s.-]?\d){8}\b/g);
      if (matches) {
        for (const m of matches) pushCandidate(m, false);
      }
    }
  }

  const phones = valid.length > 0 ? valid : fallback;
  return {
    phones,
    orderLinkedPhones: orderLinked,
    hasInvalidPhone: valid.length === 0 && fallback.length > 0,
  };
}

function get_pancake_valid_phones(conv, allowFallback = false) {
  const info = get_pancake_phone_info(conv, null);
  return allowFallback ? info.phones : info.phones.filter((p) => /^0[35789]\d{8}$/.test(p));
}

function get_pancake_conv_tags_norm(conv) {
  const tags = Array.isArray(conv && conv.tags) ? conv.tags : [];
  const out = [];
  for (const t of tags) {
    if (!t) continue;
    const raw = typeof t === "string" ? t : (t.text || t.name || t.title || t.label || "");
    const clean = bo_dau_tieng_viet(String(raw || "").trim()).toUpperCase();
    if (clean) out.push(clean);
  }
  return out;
}

async function fetch_json_with_timeout(url, timeoutMs = 10000, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let waitMs = 0;
    try {
      const res = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (res.ok) {
        return await res.json();
      }
      if (res.status === 429 || res.status >= 500) {
        const ra = parseFloat(res.headers.get("Retry-After") || "0");
        waitMs = (!Number.isNaN(ra) && ra > 0)
          ? Math.min(5000, Math.round(ra * 1000))
          : (550 * (attempt + 1) + attempt * 300);
      } else {
        return null;
      }
    } catch (e) {
      waitMs = 500 * (attempt + 1);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < maxRetries && waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  return null;
}

function parse_gia_tin_nhan_pancake(raw) {
  let s = String(raw || "").trim();
  if (!s) return 0;
  // Loại bỏ URL, email và chuỗi >= 7 chữ số (ID bài viết FB, comment_id, SĐT, mã vận đơn)
  s = s.replace(/https?:\/\/\S+/gi, " ").replace(/\b\d{7,}\b/g, " ");
  let best = 0;
  const reK = /(\d+(?:[.,]\d+)?)\s*k\b/gi;
  let mK;
  while ((mK = reK.exec(s)) !== null) {
    const num = parseFloat(mK[1].replace(",", "."));
    if (!Number.isNaN(num)) {
      const v = Math.round(num * 1000);
      if (v >= 100000 && v <= 10000000 && v > best) best = v;
    }
  }
  const reVnd = /\b(\d{1,3}(?:[.,]\d{3})+)\b/g;
  let mV;
  while ((mV = reVnd.exec(s)) !== null) {
    const v = parseInt(mV[1].replace(/[.,]/g, ""), 10);
    if (!Number.isNaN(v) && v >= 100000 && v <= 10000000 && v > best) best = v;
  }
  return best;
}

function is_pancake_bot_admin(name) {
  const u = String(name || "").trim().toUpperCase();
  return !u || ["POS", "BOTCAKE", "PANCAKE", "ADMIN", "PAGE", "SYSTEM", "AUTO"].includes(u) || u.startsWith("UPYO");
}

function parse_pancake_receipt_attachment(msg, convPhones) {
  const atts = Array.isArray(msg && msg.attachments) ? msg.attachments : [];
  const phoneSet = new Set(Array.isArray(convPhones) ? convPhones : []);
  for (const att of atts) {
    const pl = att && att.type === "template" && att.payload;
    if (!pl || pl.template_type !== "receipt") continue;

    const hoTen = String(pl.recipient_name || "").trim();
    const addr = pl.address || {};
    const addrParts = [];
    for (const rawPart of [addr.street_1, addr.city, addr.country, addr.state, addr.street_2]) {
      const p = String(rawPart || "").trim();
      if (!p || p === "-") continue;
      const pNorm = chuan_hoa_sdt_so_sanh(p);
      if (pNorm && (phoneSet.has(pNorm) || PANCAKE_SHOP_PHONES.has(pNorm) || /^0[35789]\d{8}$/.test(pNorm))) continue;
      if (!addrParts.includes(p)) addrParts.push(p);
    }

    const elements = Array.isArray(pl.elements) ? pl.elements : [];
    const spList = [];
    const mauList = [];
    const sizeList = [];
    let totalQty = 0;
    let elemPriceSum = 0;

    for (const el of elements) {
      if (!el) continue;
      const qty = Math.max(1, parseInt(el.quantity, 10) || 1);
      totalQty += qty;
      const unitOrLinePrice = Number(el.price) || 0;
      if (unitOrLinePrice > 0) elemPriceSum += unitOrLinePrice;

      const rawTitle = String(el.title || "").trim();
      if (rawTitle) {
        const spNorm = chuan_hoa_sp_so_sanh(rawTitle);
        const spFinal = spNorm || rawTitle.toUpperCase();
        if (spFinal && !spList.includes(spFinal)) spList.push(spFinal);
      }

      const sub = String(el.subtitle || "").trim();
      if (sub) {
        const mMau = sub.match(/Màu\s*:\s*([^,\n|]+)/i);
        if (mMau) {
          const mau = mMau[1].trim().replace(/^-+\s*/, "");
          if (mau && !mauList.includes(mau)) mauList.push(mau);
        }
        const mSize = sub.match(/Size\s*:\s*([^,\n|]+)/i);
        if (mSize) {
          const sz = mSize[1].trim().replace(/^-+\s*/, "");
          if (sz && !sizeList.includes(sz)) sizeList.push(sz);
        }
      }
    }

    const summaryCost = Number(pl.summary && pl.summary.total_cost) || 0;
    const giaBan = summaryCost > 0 ? summaryCost : elemPriceSum;
    return {
      hoTen,
      diaChi: addrParts.join(", "),
      dongSp: spList.join(", "),
      mauSac: mauList.join(", "),
      size: sizeList.join(", "),
      soLuong: totalQty || 1,
      giaBan,
    };
  }
  return null;
}

function extract_confirmed_pancake_orders(conv, msgs, pageCfg, msgJson = null) {
  if (!Array.isArray(msgs) || msgs.length === 0) return [];
  const phoneInfo = get_pancake_phone_info(conv, msgs, msgJson);
  const phones = phoneInfo.phones;
  if (phones.length === 0) return [];

  const cutoffMs = Date.now() + 7 * 3600 * 1000 - 14 * 86400 * 1000;
  let hasCustMsg = false;
  let custWentOffice = false;
  const pkeMap = new Map();
  let expressHit = null;
  let receiptHit = null;
  let latestActInfo = null;
  let bestPrice = 0;
  let bestSale = "";
  let bestSaleMs = -1;
  let chatDongSp = "";
  let chatSize = "";
  const sortedKnownSp = typeof KNOWN_CODES !== "undefined" ? [...KNOWN_CODES].sort((a, b) => b.length - a.length) : [];

  for (const msg of msgs) {
    const isPage = Boolean(msg && msg.from && String(msg.from.id || "") === pageCfg.pageId);
    const txt = String((msg && (msg.original_message || msg.message)) || "").trim();
    const hasAtt = Array.isArray(msg && msg.attachments) && msg.attachments.length > 0;
    const tInfo = parse_pancake_utc_to_vn(msg && msg.inserted_at);
    if (tInfo.timeMs && tInfo.timeMs < cutoffMs) continue;
    if (tInfo.ymd && (!latestActInfo || (tInfo.timeMs || 0) >= (latestActInfo.timeMs || 0))) {
      latestActInfo = tInfo;
    }

    if (!chatSize && txt) {
      const mSz = txt.match(/\bsize\s*[:=]?\s*(3[5-9]|4[0-6])\b/i);
      if (mSz) chatSize = mSz[1];
    }

    if (!isPage) {
      if ((txt && !/^\s*(?:<div>\s*<\/div>)?\s*$/i.test(txt)) || hasAtt) hasCustMsg = true;
      if (/qua đi thử|tự qua|ghé shop|đến tận nơi/i.test(txt)) custWentOffice = true;
      continue;
    }

    const adminName = String((msg && msg.from && msg.from.admin_name) || "").trim();
    if (!is_pancake_bot_admin(adminName) && (tInfo.timeMs || 0) >= bestSaleMs) {
      bestSale = adminName;
      bestSaleMs = tInfo.timeMs || 0;
    }

    const receipt = parse_pancake_receipt_attachment(msg, phones);
    if (receipt && (!receiptHit || (tInfo.timeMs || 0) >= (receiptHit.timeMs || 0))) {
      receiptHit = { ...receipt, ...tInfo };
    }

    if (!chatDongSp && txt && sortedKnownSp.length > 0) {
      const txtUp = txt.replace(/https?:\/\/\S+/gi, " ").toUpperCase();
      const txtTokens = new Set(txtUp.split(/[^A-Z0-9À-Ỹ]+/i).filter(Boolean));
      for (const code of sortedKnownSp) {
        if (!code || code.length < 2) continue;
        if (/^[A-Z0-9À-Ỹ]+$/i.test(code) ? txtTokens.has(code) : txtUp.includes(code)) {
          chatDongSp = code;
          break;
        }
      }
    }

    const priceVal = parse_gia_tin_nhan_pancake(txt);
    if (priceVal > bestPrice) bestPrice = priceVal;

    const mPke = txt.match(/Đơn\s*hàng\s+(PKE\d{6,})\s+đã\s+được\s+tạo/i);
    if (mPke) {
      const code = mPke[1].toUpperCase();
      if (!pkeMap.has(code)) {
        pkeMap.set(code, { code, ...tInfo });
      }
      continue;
    }

    const isQuestionOrReturn = /\?|được không|không ạ|nếu không thì|hoàn lại tiền|gửi về địa chỉ|xin lại mvđ|hủy đơn/i.test(txt);
    if (
      !isQuestionOrReturn &&
      /em lên đơn cho mình|em đã lên đơn|đã lên đơn cho mình|em book ship|ship lấy hàng rồi|đã đặt ship|gửi hỏa tốc|cảm ơn.*đã đặt hàng|em xác nhận lại cho mình/i.test(txt)
    ) {
      expressHit = { ...tInfo, snippet: txt };
    }
  }

  if (!bestSale) {
    const fallbackAdmin = String((conv && conv.last_sent_by && conv.last_sent_by.admin_name) || "").trim();
    if (!is_pancake_bot_admin(fallbackAdmin)) bestSale = fallbackAdmin;
  }

  if (custWentOffice || !hasCustMsg) return [];
  const custName = String((conv.page_customer && conv.page_customer.name) || (conv.from && conv.from.name) || "").trim();
  const detailFields = {
    hoTen: (receiptHit && receiptHit.hoTen) || custName,
    diaChi: (receiptHit && receiptHit.diaChi) || "",
    dongSp: (receiptHit && receiptHit.dongSp) || chatDongSp || "",
    mauSac: (receiptHit && receiptHit.mauSac) || "",
    size: (receiptHit && receiptHit.size) || chatSize || "",
    soLuong: (receiptHit && receiptHit.soLuong) || 1,
    sale: bestSale || "",
    giaBan: (receiptHit && receiptHit.giaBan > 0) ? receiptHit.giaBan : bestPrice,
    hasReceipt: Boolean(receiptHit),
    hasInvalidPhone: Boolean(phoneInfo.hasInvalidPhone),
    orderLinkedPhones: phoneInfo.orderLinkedPhones || [],
  };
  const results = [];
  const convTags = get_pancake_conv_tags_norm(conv);
  const isCancelledTag = convTags.some((tg) => tg.includes("HUY") || tg.includes("BOOM") || tg.includes("KHONG MUA"));
  const allCustomers = [
    ...(Array.isArray(conv && conv.customers) ? conv.customers : []),
    ...(Array.isArray(msgJson && msgJson.customers) ? msgJson.customers : []),
  ];
  const hasPriorCompletedOrder = allCustomers.some((c) =>
    c && (Number(c.succeed_order_count || 0) > 0 || Number(c.purchased_amount || 0) > 0 || Boolean(c.last_order_at))
  );
  const hasPendingFirstOrder = allCustomers.some((c) => {
    if (!c) return false;
    const ordCnt = Number(c.order_count || 0);
    const succCnt = Number(c.succeed_order_count || 0);
    const hasLinkedOrd = Array.isArray(c.recent_phone_numbers) && c.recent_phone_numbers.some((p) => p && p.order_id);
    // Chỉ coi là đơn Mới/Nháp POS khi khách chưa từng có đơn hoàn thành trước đó (tránh báo giả khách cũ chat CSKH/đổi size)
    if (succCnt > 0 || Number(c.purchased_amount || 0) > 0 || c.last_order_at) return false;
    return ordCnt > 0 || hasLinkedOrd;
  });
  const hasRecentOrdersArr = Array.isArray(msgJson && msgJson.recent_orders) && msgJson.recent_orders.length > 0;
  const hasPurchaseSignal =
    !isCancelledTag &&
    !hasPriorCompletedOrder &&
    (
      convTags.some((tg) => tg.includes("MUA HANG") || tg.includes("HOA TOC")) ||
      Number((conv && conv.order_count) || 0) > 0 ||
      Boolean(conv && conv.has_order) ||
      hasPendingFirstOrder ||
      hasRecentOrdersArr
    );
  const fallbackTimeInfo = latestActInfo || parse_pancake_utc_to_vn(conv && conv.updated_at);

  if (pkeMap.size > 0) {
    pkeMap.forEach((info) => {
      results.push({
        convId: conv.id,
        pageId: pageCfg.pageId,
        mkt: pageCfg.mkt,
        mktSheet: pageCfg.mktSheet,
        custName,
        phones,
        pkeCode: info.code,
        ymd: info.ymd,
        dmy: info.dmy,
        timeMs: info.timeMs,
        ...detailFields,
      });
    });
  } else if (receiptHit) {
    results.push({
      convId: conv.id,
      pageId: pageCfg.pageId,
      mkt: pageCfg.mkt,
      mktSheet: pageCfg.mktSheet,
      custName,
      phones,
      pkeCode: "",
      ymd: receiptHit.ymd,
      dmy: receiptHit.dmy,
      timeMs: receiptHit.timeMs,
      ...detailFields,
    });
  } else if (expressHit) {
    results.push({
      convId: conv.id,
      pageId: pageCfg.pageId,
      mkt: pageCfg.mkt,
      mktSheet: pageCfg.mktSheet,
      custName,
      phones,
      pkeCode: "",
      ymd: expressHit.ymd,
      dmy: expressHit.dmy,
      timeMs: expressHit.timeMs,
      ...detailFields,
    });
  } else if (hasPurchaseSignal && fallbackTimeInfo && fallbackTimeInfo.ymd && (!fallbackTimeInfo.timeMs || fallbackTimeInfo.timeMs >= cutoffMs)) {
    results.push({
      convId: conv.id,
      pageId: pageCfg.pageId,
      mkt: pageCfg.mkt,
      mktSheet: pageCfg.mktSheet,
      custName,
      phones,
      pkeCode: "",
      isDraftTagOrder: true,
      ymd: fallbackTimeInfo.ymd,
      dmy: fallbackTimeInfo.dmy,
      timeMs: fallbackTimeInfo.timeMs,
      ...detailFields,
    });
  }

  return results;
}

const PANCAKE_CACHE_TTL_MS = 600000; // Cache Pancake 10 phút và chỉ tải khi bấm Lỗi vào đơn / Đơn trùng MKT

async function tai_du_lieu_pancake(force = false) {
  const now = Date.now();
  if (!force && data_pancake_orders.length > 0 && now - pancake_last_fetch_ms < PANCAKE_CACHE_TTL_MS) {
    return data_pancake_orders;
  }
  if (pancake_fetch_promise) return pancake_fetch_promise;

  pancake_fetch_promise = (async () => {
    if (!_pancakeConvCacheHydrated) {
      _pancakeConvCacheHydrated = true;
      const savedConvs = await idb_cache_get(PANCAKE_CONV_CACHE_IDB_KEY);
      if (Array.isArray(savedConvs)) {
        for (const pair of savedConvs) {
          if (Array.isArray(pair) && pair.length === 2 && !pancake_conv_msg_cache.has(pair[0])) {
            pancake_conv_msg_cache.set(pair[0], pair[1]);
          }
        }
      }
    }

    let hasNewConvCached = false;
    const allOrders = [];
    const cutoffMs = Math.max(now + 7 * 3600 * 1000 - 14 * 86400 * 1000, Date.UTC(2026, 10, 1));

    await ensure_pancake_pages_cfg();
    if (!PANCAKE_PAGES || PANCAKE_PAGES.length === 0) {
      return data_pancake_orders;
    }

    for (const pageCfg of PANCAKE_PAGES) {
      const token = String(pageCfg.token || "").trim();
      if (!token) continue;

      const convs = [];
      let lastId = "";
      for (let pg = 0; pg < 8; pg++) {
        if (pg > 0) await new Promise((r) => setTimeout(r, 120));
        let url =
          `https://pages.fm/api/public_api/v2/pages/${pageCfg.pageId}/conversations` +
          `?page_access_token=${encodeURIComponent(token)}&page_size=60`;
        if (lastId) url += `&last_conversation_id=${encodeURIComponent(lastId)}`;

        const json = await fetch_json_with_timeout(url, 12000, 4);
        const batch = json && Array.isArray(json.conversations) ? json.conversations : [];
        if (batch.length === 0) break;

        convs.push(...batch);
        lastId = batch[batch.length - 1].id || "";
        const oldestInfo = parse_pancake_utc_to_vn(batch[batch.length - 1].updated_at);
        if (!lastId || (oldestInfo.timeMs && oldestInfo.timeMs < cutoffMs)) break;
      }

      const phoneConvs = convs.filter((c) =>
        get_pancake_valid_phones(c, true).length > 0 ||
        get_pancake_conv_tags_norm(c).some((tg) => tg.includes("MUA HANG") || tg.includes("HOA TOC")) ||
        Number((c && c.order_count) || 0) > 0 ||
        Boolean(c && c.has_order)
      );
      const BATCH_SIZE = 3;
      for (let i = 0; i < phoneConvs.length; i += BATCH_SIZE) {
        if (i > 0) await new Promise((r) => setTimeout(r, 150));
        const chunk = phoneConvs.slice(i, i + BATCH_SIZE);
        const chunkOrders = await Promise.all(
          chunk.map(async (conv) => {
            const cacheKey = `${conv.id}|${conv.updated_at || ""}`;
            if (pancake_conv_msg_cache.has(cacheKey)) {
              return pancake_conv_msg_cache.get(cacheKey);
            }
            const msgUrl =
              `https://pages.fm/api/public_api/v1/pages/${pageCfg.pageId}/conversations/${encodeURIComponent(conv.id)}/messages` +
              `?page_access_token=${encodeURIComponent(token)}&current_count=0`;
            const msgJson = await fetch_json_with_timeout(msgUrl, 10000, 4);
            const msgs = msgJson && (Array.isArray(msgJson.messages) ? msgJson.messages : msgJson.data);
            if (!Array.isArray(msgs)) {
              return [];
            }
            const extracted = extract_confirmed_pancake_orders(conv, msgs, pageCfg, msgJson);
            pancake_conv_msg_cache.set(cacheKey, extracted);
            hasNewConvCached = true;
            return extracted;
          })
        );
        chunkOrders.forEach((arr) => {
          if (Array.isArray(arr) && arr.length > 0) allOrders.push(...arr);
        });
      }
    }

    if (hasNewConvCached) {
      const entries = Array.from(pancake_conv_msg_cache.entries());
      const trimmed = entries.length > 800 ? entries.slice(entries.length - 800) : entries;
      idb_cache_set(PANCAKE_CONV_CACHE_IDB_KEY, trimmed).catch(() => {});
    }

    data_pancake_orders = allOrders;
    pancake_last_fetch_ms = Date.now();
    try {
      const odModal = document.getElementById("orderDetailModal");
      if (odModal && !odModal.classList.contains("hidden") && current_od_mode === "all_table") {
        apply_od_filters_and_render(false);
      }
    } catch (e) {}
    return data_pancake_orders;
  })();

  try {
    return await pancake_fetch_promise;
  } finally {
    pancake_fetch_promise = null;
  }
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
    s.includes("CH\u01afA L\u00caN \u0110\u01a0N") ||
    noDau.includes("CHUA LEN DON") ||
    s.includes("CH\u1ed0T CH\u01afA C\u00d3 H\u00c0NG") ||
    noDau.includes("CHOT CHUA CO HANG") ||
    s.includes("\u0110\u01a0N TEST") ||
    noDau.includes("DON TEST") ||
    s.includes("GIAO TH\u00c0NH C\u00d4NG") ||
    noDau.includes("GIAO THANH CONG") ||
    s.includes("XU\u1ea4T EXCEL") ||
    noDau.includes("XUAT EXCEL") ||
    s.includes("L\u00caN APPLAM") ||
    noDau.includes("LEN APPLAM") ||
    noDau.includes("LEN APP LAM") ||
    s.includes("L\u00caN APP VTP") ||
    noDau.includes("LEN APP VTP") ||
    noDau.includes("LEN APPVTP") ||
    noDau.includes("DANG GIAO HANG") ||
    noDau.includes("DANG VAN CHUYEN") ||
    noDau.includes("DA LAY HANG") ||
    noDau.includes("DANG LAY HANG") ||
    noDau.includes("DA TIEP NHAN") ||
    noDau.includes("CHO PHAT LAI") ||
    noDau.includes("CHO XU LY") ||
    noDau.includes("PHAT TIEP") ||
    noDau.includes("GIAO 1 PHAN")
  );
}

const LIST_MKT_FB = [
  { ten: "L\u00c2M", id: "act_1219584325802699" },
  { ten: "TH.L\u00c2M", id: "act_2795566000842055" },
  { ten: "PH\u00daC", id: "act_565886575873090" },
  { ten: "T\u00c2M", id: "act_611714185179363" },
  { ten: "SAN", id: "act_1333165132087237" },
  { ten: "D\u0168NG", id: "act_1333165132087237" },
  { ten: "D\u0168NG", id: "act_1761088481624922" },
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
const APP_AUTH_HASH = "715b8746dd3362d5c66f39b50ec234b6a2f6cb2d79d27927409873aa4d757784";
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

async function sync_auth_session_file(hashVal, apiKeyVal, persistFlag = true) {
  try {
    if (!window.location.protocol.startsWith("http")) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    await fetch("/api/auth-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hash: hashVal || "",
        apiKey: apiKeyVal || "",
        persist: Boolean(persistFlag),
      }),
      signal: ctrl.signal,
    }).catch(() => {});
    clearTimeout(timer);
  } catch (e) {}
}

function is_app_authenticated() {
  try {
    const lsToken = localStorage.getItem(AUTH_STORAGE_KEY);
    if (lsToken && lsToken !== APP_AUTH_HASH) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    const ssToken = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (ssToken && ssToken !== APP_AUTH_HASH) {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
    }
    const hasHash = lsToken === APP_AUTH_HASH || ssToken === APP_AUTH_HASH;
    if (!hasHash) return false;
    return is_valid_api_key(get_apps_script_api_key());
  } catch (e) {
    return false;
  }
}

async function check_persisted_auth_session() {
  if (is_app_authenticated()) {
    try {
      const k = get_apps_script_api_key();
      if (localStorage.getItem(AUTH_STORAGE_KEY) === APP_AUTH_HASH) {
        await sync_auth_session_file(APP_AUTH_HASH, k, true);
      } else {
        await sync_auth_session_file("", k, false);
      }
    } catch (e) {}
    return true;
  }
  try {
    if (!window.location.protocol.startsWith("http")) return false;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch("/api/auth-session", { cache: "no-store", signal: ctrl.signal }).catch(() => null);
    clearTimeout(t);
    if (!res || !res.ok) return false;
    const data = await res.json().catch(() => null);
    const savedHash = String((data && data.hash) || "").trim().toLowerCase();
    const savedApiKey = String((data && data.apiKey) || "").trim().toLowerCase();
    if (savedHash === APP_AUTH_HASH && is_valid_api_key(savedApiKey)) {
      _runtime_api_key = savedApiKey;
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, APP_AUTH_HASH);
        localStorage.setItem(API_KEY_STORAGE_KEY, savedApiKey);
      } catch (e) {}
      return true;
    }
    if (savedHash && savedHash !== APP_AUTH_HASH) {
      // Mật khẩu đã thay đổi ở bản mới -> xóa phiên cũ để yêu cầu đăng nhập lại
      await sync_auth_session_file("", "", false);
    }
  } catch (e) {}
  return false;
}

async function set_app_authenticated(remember, apiKeyVal) {
  const cleanKey = String(apiKeyVal || "").trim().toLowerCase();
  _runtime_api_key = is_valid_api_key(cleanKey) ? cleanKey : "";
  try {
    if (remember) {
      localStorage.setItem(AUTH_STORAGE_KEY, APP_AUTH_HASH);
      if (_runtime_api_key) localStorage.setItem(API_KEY_STORAGE_KEY, _runtime_api_key);
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
      sessionStorage.removeItem(API_KEY_STORAGE_KEY);
      await sync_auth_session_file(APP_AUTH_HASH, _runtime_api_key, true);
    } else {
      sessionStorage.setItem(AUTH_STORAGE_KEY, APP_AUTH_HASH);
      if (_runtime_api_key) sessionStorage.setItem(API_KEY_STORAGE_KEY, _runtime_api_key);
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      await sync_auth_session_file("", _runtime_api_key, false);
    }
  } catch (e) {}
}

function lock_app() {
  _runtime_api_key = "";
  PANCAKE_PAGES = [];
  _pancakeCfgLoaded = false;
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    sessionStorage.removeItem(API_KEY_STORAGE_KEY);
    localStorage.removeItem("app_lam_auth_token");
    sessionStorage.removeItem("app_lam_auth_token");
    sync_auth_session_file("", "", false);
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
  document.documentElement.classList.remove("app-pre-unlocked");
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

let _openingRevealDone = false;
let _openingRevealFailsafe = null;

function trigger_opening_reveal() {
  if (_openingRevealDone) return;
  _openingRevealDone = true;
  if (_openingRevealFailsafe) {
    clearTimeout(_openingRevealFailsafe);
    _openingRevealFailsafe = null;
  }
  document.body.classList.remove("app-awaiting-reveal");
  document.body.classList.remove("app-opening-ready");
  void document.body.offsetWidth;
  document.body.classList.add("app-opening-ready");
  requestAnimationFrame(() => requestAnimationFrame(() => notify_native_ui_ready()));
}

let _nativeUiReadySent = false;
function notify_native_ui_ready() {
  if (_nativeUiReadySent) return;
  _nativeUiReadySent = true;
  try {
    if (window.location.protocol.startsWith("http")) {
      fetch("/api/ui-ready", { method: "POST", keepalive: true }).catch(() => {});
    }
  } catch (e) {}
}

function unlock_app(deferReveal) {
  const lockScreen = document.getElementById("authLockScreen");
  const appContainer = document.getElementById("appContainer");
  if (lockScreen) lockScreen.classList.add("hidden");
  if (appContainer) appContainer.classList.remove("hidden");
  if (native_exe_mode) {
    fetch("/api/session-unlocked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: get_apps_script_api_key() }),
    }).catch(() => {});
  }

  if (deferReveal && !_openingRevealDone) {
    document.body.classList.add("app-awaiting-reveal");
    if (_openingRevealFailsafe) clearTimeout(_openingRevealFailsafe);
    // Nếu máy mới chưa có cache, sau 420ms vẫn hiện skeleton đủ khung (kèm khung Tổng Công Ty) để tránh đợi lâu
    _openingRevealFailsafe = setTimeout(() => {
      trigger_opening_reveal();
    }, 420);
  } else {
    trigger_opening_reveal();
  }
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
    liveBadge: "Đang Online",
    initializing: "Đang khởi tạo...",
    lastSyncPrefix: "Cập nhật: ",
    spPlaceholder: "Mã SP...",
    btnAddSp: "+ Thêm",
    today: "Hôm nay",
    yesterday: "Hôm qua",
    lastMonth: "Tháng trước",
    thisMonth: "Tháng này",
    last3Days: "3 ngày qua",
    last7Days: "7 ngày qua",
    last14Days: "14 ngày qua",
    fromLabel: "Từ:",
    toLabel: "Đến:",
    btnRefresh: "Tải Lại",
    btnHeaderUpdate: "Cập nhật",
    btnLogout: "Đăng xuất",
    btnSettings: "Cài đặt",
    companySummaryTitle: "TỔNG CÔNG TY",
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
    mktReportHeader: "BÁO CÁO MKT",
    mktDetailHeader: (m) => `CHI TIẾT: ${m}`,
    btnBack: "← Quay lại",
    top5SpHeader: "TOP 10 MÃ TỔNG CÔNG TY",
    emptyMktList: "Chưa có đơn và chưa có CP",
    emptyMktDetail: (m) => `${m} chưa có CP Ads và chưa có đơn.`,
    emptySpList: "Chưa ghi nhận mẫu nào",
    calMonthYearFmt: (m, y) => `Tháng ${m} / ${y}`,
    weekdays: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"],
    settingsTitle: "⚙ CÀI ĐẶT HỆ THỐNG",
    lblVoice: "1. Âm thanh (Chuông nhẹ & Giọng đọc):",
    lblPopup: "2. Popup Góc Màn Hình:",
    lblFontSize: "3. Cỡ chữ:",
    lblUiScale: "4. Kích thước UI:",
    lblTheme: "5. Giao diện (Dark Mode):",
    lblLang: "6. Ngôn ngữ (Language):",
    lblAutoStart: "7. Khởi động cùng Windows:",
    lblUpdate: "8. Tự động cập nhật (GitHub):",
    btnSaveUpdateUrl: "💾 Lưu & Cập nhật",
    btnCheckUpdateNow: "🔄 Kiểm tra ngay",
    updateUrlPlaceholder: "Dán link GitHub repo (vd: https://github.com/ten/app-lam)...",
    stateOn: "ĐANG BẬT",
    stateOff: "ĐANG TẮT",
    btnTestVoice: "🔔 Nghe thử",
    btnTestPopup: "💬 Xem thử Popup",
    themeLight: "☀️ Sáng (Kem Cozy)",
    themeDark: "🌙 Tối (Nâu Be Cozy)",
    scannerStatus: "Đang Online: Quét đơn (5s/lần)",
    knownCodesFmt: (n) => `Đang nhận diện: ${n} mã SP`,
    ctxCopyCp: "📋 Copy CP",
    toastCopiedCp: "Đã copy CP",
    toastSavedCode: (c) => `Đã lưu mã: ${c}`,
    toastExistingCode: (c) => `Mã ${c} đã có sẵn!`,
    testPopupTitle: "TEST NỔ ĐƠN",
    newOrderPopupTitle: "UPYO NỔ ĐƠN MỚI!",
    allCodesBtn: "Tất cả mã",
    allCodesTitle: "📋 TẤT CẢ MÃ ĐANG NHẬN DIỆN",
    colCode: "Mã SP",
    colOrders: "Đơn",
    allCodesTotal: "TỔNG",
    crBadgeTitle: "TỈ LỆ CHỐT LANDING",
    crDescText: "Lọc trùng & Capture Form",
    crSubHint: "Chi tiết →",
    actBadgeTitle: "THỜI GIAN GỌI TB",
    actDescText: "Trừ giờ nghỉ",
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
    last3Days: "最近3天",
    last7Days: "最近7天",
    last14Days: "最近14天",
    fromLabel: "从:",
    toLabel: "至:",
    btnRefresh: "刷新",
    btnHeaderUpdate: "更新",
    btnLogout: "退出登录",
    btnSettings: "设置",
    companySummaryTitle: "公司总计",
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
    mktReportHeader: "营销人员报表",
    mktDetailHeader: (m) => `详情: ${m}`,
    btnBack: "← 返回",
    top5SpHeader: "前 5 热销款式",
    emptyMktList: "暂无订单与广告花费",
    emptyMktDetail: (m) => `${m} 暂无广告花费与订单。`,
    emptySpList: "暂无款式记录",
    calMonthYearFmt: (m, y) => `${y}年 ${m}月`,
    weekdays: ["日", "一", "二", "三", "四", "五", "六"],
    settingsTitle: "⚙ 系统设置",
    lblVoice: "1. 提示音与语音 (轻柔铃声):",
    lblPopup: "2. 屏幕右下角弹窗:",
    lblFontSize: "3. 字体大小:",
    lblUiScale: "4. 界面缩放:",
    lblTheme: "5. 界面主题 (深色模式):",
    lblLang: "6. 语言选择 (Language):",
    lblAutoStart: "7. 开机自动启动:",
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
    scannerStatus: "实时监控: 每5秒扫描新订单",
    knownCodesFmt: (n) => `当前识别: ${n} 个产品代码`,
    ctxCopyCp: "📋 复制广告费",
    toastCopiedCp: "已复制广告费",
    toastSavedCode: (c) => `已保存代码: ${c}`,
    toastExistingCode: (c) => `代码 ${c} 已存在!`,
    testPopupTitle: "测试爆单通知",
    newOrderPopupTitle: "UPYO 新订单来啦!",
    allCodesBtn: "全部代码",
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
    last3Days: "Last 3 Days",
    last7Days: "Last 7 Days",
    last14Days: "Last 14 Days",
    fromLabel: "From:",
    toLabel: "To:",
    btnRefresh: "Refresh",
    btnHeaderUpdate: "Update",
    btnLogout: "Sign Out",
    btnSettings: "Settings",
    companySummaryTitle: "COMPANY TOTAL",
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
    mktReportHeader: "MARKETER REPORT",
    mktDetailHeader: (m) => `DETAIL: ${m}`,
    btnBack: "← Back",
    top5SpHeader: "TOP 10 PRODUCTS",
    emptyMktList: "No orders or ad spend recorded",
    emptyMktDetail: (m) => `${m} has no ad spend or orders yet.`,
    emptySpList: "No product models recorded",
    calMonthYearFmt: (m, y) => `Month ${m} / ${y}`,
    weekdays: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
    settingsTitle: "⚙ SYSTEM SETTINGS",
    lblVoice: "1. Sound (Soft Chime & Voice):",
    lblPopup: "2. Corner Popup Alert:",
    lblFontSize: "3. Font Size:",
    lblUiScale: "4. UI Scale:",
    lblTheme: "5. Appearance (Dark Mode):",
    lblLang: "6. Language:",
    lblAutoStart: "7. Start with Windows:",
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
    scannerStatus: "Online: Scanning orders (5s)",
    knownCodesFmt: (n) => `Recognizing: ${n} product codes`,
    ctxCopyCp: "📋 Copy Spend",
    toastCopiedCp: "Copied Spend",
    toastSavedCode: (c) => `Saved code: ${c}`,
    toastExistingCode: (c) => `Code ${c} already exists!`,
    testPopupTitle: "TEST NEW ORDER",
    newOrderPopupTitle: "UPYO NEW ORDER!",
    allCodesBtn: "All Codes",
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
const STORAGE_KEY_SHEET_CODES = "applam_sheet_sp_codes_v86135";
const STORAGE_KEY_VOICE = "applam_bat_thong_bao_gtts_v8618";
const STORAGE_KEY_POPUP = "applam_bat_popup_thong_bao_v8618";
const STORAGE_KEY_FONT_SCALE = "applam_font_scale_v8618";
const STORAGE_KEY_UI_SCALE = "applam_ui_scale_v8618";
const STORAGE_KEY_THEME = "applam_theme_v8618";
const STORAGE_KEY_LANG = "applam_lang_v8618";
const STORAGE_KEY_AUTOSTART = "applam_autostart_v8696";
let bat_khoi_dong_cung_win = true;

let KNOWN_CODES = [...KNOWN_CODES_DEFAULT];
let bat_thong_bao_gtts = true;
let bat_popup_thong_bao = true;
let font_scale = 100;
let ui_scale = 100;
let current_theme = "light"; // 'light' | 'dark'
let current_lang = "vi"; // 'vi' | 'zh' | 'en'
let last_sync_time_str = "";

let data_hien_tai = [];
let data_tong_don_upyo = [];
let cached_fb_chi_tiet = {};
let cached_fb_tong = {};
let cached_fb_camps = {};
let current_start_date = "";
let current_end_date = "";
let current_mkt_detail = null;
let current_mc_mkt = null;
let current_mc_sp = "";
let mc_date_start = "";
let mc_date_end = "";
let mc_custom_camps_map = null;
let mc_is_loading_fb = false;

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
// HIỆU ỨNG ĐẾM SỐ MƯỢT (COUNT-UP ANIMATION)
// ==============================================================
function animate_number(el, targetVal, formatter, duration = 560) {
  if (!el) return;
  const target = Number(targetVal) || 0;
  if (target === 0 || window._silentDashboardRerender) {
    el.textContent = formatter(target);
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
    const rawSheet = localStorage.getItem(STORAGE_KEY_SHEET_CODES);
    let sheetSp = [];
    if (rawSheet) {
      sheetSp = JSON.parse(rawSheet)
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean);
    }
    KNOWN_CODES = Array.from(new Set([...KNOWN_CODES_DEFAULT, ...sheetSp, ...extraSp]));
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
    .date-control-frame .od-export-ship-btn,
    .date-control-frame .od-sync-vtp-btn {
      height: ${Math.round(37 * u)}px !important;
      padding: 0 ${Math.round(14 * u)}px !important;
      font-size: ${(13 * tf).toFixed(1)}px !important;
      border-radius: ${Math.round(10 * u)}px !important;
    }
    .btn-back,
    .col-mkt.is-mkt-detail .section-header-card,
    .btn-mkt-view-camp-pill,
    .btn-mkt-view-all-pill {
      height: ${Math.round(36 * u)}px !important;
      padding: 0 ${Math.round(13 * u)}px !important;
      font-size: ${(13 * tf).toFixed(1)}px !important;
      border-radius: ${Math.round(10 * u)}px !important;
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

  setText("btnAllCodesText", dict.allCodesBtn);
  setText("crBadgeTitle", dict.crBadgeTitle);
  setText("crDescText", dict.crDescText);
  setText("crSubHint", dict.crSubHint);
  setText("actBadgeTitle", dict.actBadgeTitle);
  setText("actDescText", dict.actDescText);
  setText("actSubHint", dict.crSubHint);
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
  setText("btnLast3Days", dict.last3Days);
  setText("btnLast7Days", dict.last7Days);
  setText("btnLast14Days", dict.last14Days);
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

    if (typeof data.autostart === "boolean") {
      bat_khoi_dong_cung_win = data.autostart;
      localStorage.setItem(STORAGE_KEY_AUTOSTART, String(bat_khoi_dong_cung_win));
    }
    cap_nhat_giao_dien_toggle_init();

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

  const sortedCodes = [...KNOWN_CODES].sort((a, b) => b.length - a.length);
  for (const code of sortedCodes) {
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
  const seenRemote = new Set();
  for (const rawU of [primaryUrl, fallbackUrl]) {
    const cleanU = String(rawU || "").trim();
    if (!cleanU || seenRemote.has(cleanU)) continue;
    seenRemote.add(cleanU);
    urlsToTry.push(`${cleanU}&t=${ts}`);
  }

  for (const url of urlsToTry) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      const res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const text = await res.text();
        const trimmed = text.trim();
        if (trimmed && !trimmed.startsWith("<!DOCTYPE html") && trimmed !== "Unauthorized") {
          return parse_csv_lines(text);
        }
      }
    } catch (e) {}
  }
  return null;
}

async function dong_bo_ma_sp_tu_nguon_tag() {
  try {
    const rows = await fetch_csv_with_fallback(
      build_apps_script_url("gid=1400554532"),
      "",
      "nguon_tag"
    );
    if (!rows || rows.length === 0) return false;

    const headerSet = new Set(["DÒNG SP", "DONG SP", "MÃ SP", "MA SP", "SẢN PHẨM", "SAN PHAM", "SP"]);
    const sheetCodes = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;
      const val = String(r[0] || "").trim().toUpperCase();
      if (!val || (i === 0 && headerSet.has(val)) || headerSet.has(val)) continue;
      sheetCodes.push(val);
    }

    if (sheetCodes.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY_SHEET_CODES, JSON.stringify(sheetCodes));
      } catch (e) {}
      doc_cau_hinh_tu_storage();
    }
    return true;
  } catch (e) {
    return false;
  }
}

let thong_bao_fetch_promise = null;
let thong_bao_fetch_range_key = "";
let thong_bao_last_fetch_ms = 0;
let thong_bao_loaded_start = "";
let thong_bao_loaded_end = "";
let thong_ke_loaded_start = "";
let thong_ke_loaded_end = "";
let thong_ke_last_fetch_ms = 0;
let thong_ke_fetch_promise = null;
let thong_ke_fetch_range_key = "";
let thong_ke_is_full = false;

function dich_ngay_ymd(ymdStr, deltaDays) {
  const dt = parse_ymd_date(ymdStr);
  dt.setDate(dt.getDate() + deltaDays);
  return format_ymd_date(dt);
}

function lui_ngay_ymd(ymdStr, days) {
  return dich_ngay_ymd(ymdStr, -days);
}

function tai_du_lieu_thong_bao_ngam(
  force = false,
  customStart = "",
  customEnd = "",
  bypassServerCache = false
) {
  const todayStr = format_ymd_date(new Date());
  const effStart = customStart || current_start_date || todayStr;
  const effEnd = customEnd || current_end_date || effStart;
  const targetEnd = clamp_min_data_date(effEnd);
  const targetStart = clamp_min_data_date(lui_ngay_ymd(effStart, 15));
  const tbRangeKey = `${targetStart}|${targetEnd}`;

  const rangeCovered = Boolean(
    thong_bao_loaded_start &&
    thong_bao_loaded_end &&
    thong_bao_loaded_start <= targetStart &&
    thong_bao_loaded_end >= targetEnd
  );

  // Tránh bắn 2 request gid=0 trùng nhau khi đang tải cùng khoảng ngày
  if (
    thong_bao_fetch_promise &&
    !bypassServerCache &&
    thong_bao_fetch_range_key === tbRangeKey
  ) {
    return thong_bao_fetch_promise;
  }
  if (
    !force &&
    !bypassServerCache &&
    rangeCovered &&
    Array.isArray(data_tong_don_upyo) &&
    data_tong_don_upyo.length > 0 &&
    Date.now() - thong_bao_last_fetch_ms < 120000
  ) {
    return Promise.resolve(data_tong_don_upyo);
  }

  const directUrl = build_apps_script_url(
    `gid=0&start=${encodeURIComponent(targetStart)}&end=${encodeURIComponent(targetEnd)}${bypassServerCache ? "&nocache=1" : ""}`
  );
  if (!directUrl) return Promise.resolve(data_tong_don_upyo);

  thong_bao_fetch_range_key = tbRangeKey;
  thong_bao_fetch_promise = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      const res = await fetch(`${directUrl}&t=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return data_tong_don_upyo;
      const text = await res.text();
      const trimmed = text.trim();
      if (!trimmed || trimmed.startsWith("<!DOCTYPE html") || trimmed === "Unauthorized") {
        return data_tong_don_upyo;
      }

      const rowsThongBao = parse_csv_lines(text);
      if (rowsThongBao && rowsThongBao.length > 0) {
        data_tong_don_upyo = rowsThongBao;
        thong_bao_last_fetch_ms = Date.now();
        thong_bao_loaded_start = targetStart;
        thong_bao_loaded_end = targetEnd;
        rebuild_td_first_landing_index();
        rebuild_cust_first_mkt_index();
        try {
          const coversMainRange = Boolean(
            (!current_start_date || thong_bao_loaded_start <= current_start_date) &&
            (!current_end_date || thong_bao_loaded_end >= current_end_date)
          );
          if (coversMainRange) {
            render_closing_rate_card(tinh_ty_le_chot_theo_ngay(current_start_date, current_end_date));
            if (Array.isArray(data_hien_tai) && data_hien_tai.length > 0 && cached_fb_chi_tiet && cached_fb_tong) {
              run_silent_dashboard_rerender();
            }
          }
          const odModal = document.getElementById("orderDetailModal");
          if (odModal && !odModal.classList.contains("hidden") && current_od_mode === "all_table") {
            apply_od_filters_and_render(false);
          }
          const mcModal = document.getElementById("mktCampModal");
          if (mcModal && !mcModal.classList.contains("hidden") && current_mc_mkt) {
            render_mc_table_rows();
          }
        } catch (e) {}
      }
      return data_tong_don_upyo;
    } catch (e) {
      return data_tong_don_upyo;
    } finally {
      thong_bao_fetch_promise = null;
      thong_bao_fetch_range_key = "";
    }
  })();

  return thong_bao_fetch_promise;
}

let background_sync_timer = null;

function kich_hoat_tai_nen_sau_bang_chinh(delayMs = 150, bypassServerCache = false) {
  if (bypassServerCache) {
    // Khi người dùng chủ động bấm Tải Lại: đánh dấu hết hạn cache Pancake để lần sau bấm Lỗi vào đơn sẽ tải mới, không tự bắn ngầm mỗi lần tải bảng chính
    pancake_last_fetch_ms = 0;
  }
  if (background_sync_timer) clearTimeout(background_sync_timer);
  background_sync_timer = setTimeout(() => {
    background_sync_timer = null;
    dong_bo_ma_sp_tu_nguon_tag().catch(() => {});
    tai_du_lieu_thong_bao_ngam(true, "", "", bypassServerCache).catch(() => {});
  }, delayMs);
}

const CACHE_KEY_THONG_KE = "applam_cache_thong_ke_v1";

function luu_cache_thong_ke(rows) {
  try {
    if (!Array.isArray(rows) || rows.length === 0) return;
    idb_cache_set("thong_ke_rows", { t: Date.now(), rows }).catch(() => {});
    try {
      localStorage.removeItem(CACHE_KEY_THONG_KE);
    } catch (e2) {}
  } catch (e) {}
}

function doc_cache_thong_ke() {
  try {
    const raw = localStorage.getItem(CACHE_KEY_THONG_KE);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && Array.isArray(obj.rows) && obj.rows.length > 0) return obj.rows;
  } catch (e) {}
  return null;
}

async function doc_cache_thong_ke_async() {
  try {
    const idbObj = await idb_cache_get("thong_ke_rows");
    if (idbObj && Array.isArray(idbObj.rows) && idbObj.rows.length > 0) {
      return idbObj.rows;
    }
  } catch (e) {}
  return doc_cache_thong_ke();
}

const CACHE_KEY_FB_LAST = "applam_cache_fb_last_v3";

function luu_cache_fb_last(start_str, end_str, fbRes) {
  try {
    if (!fbRes || !fbRes.local_chi_tiet || !fbRes.local_tong) return;
    localStorage.setItem(
      CACHE_KEY_FB_LAST,
      JSON.stringify({
        k: `${start_str}|${end_str}`,
        t: Date.now(),
        local_chi_tiet: fbRes.local_chi_tiet,
        local_tong: fbRes.local_tong,
        local_camps: fbRes.local_camps || {},
      })
    );
  } catch (e) {}
}

function doc_cache_fb_last(start_str, end_str) {
  try {
    const raw = localStorage.getItem(CACHE_KEY_FB_LAST);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && obj.k === `${start_str}|${end_str}` && obj.local_chi_tiet && obj.local_tong) {
      return {
        local_chi_tiet: obj.local_chi_tiet,
        local_tong: obj.local_tong,
        local_camps: obj.local_camps || {},
      };
    }
  } catch (e) {}
  return null;
}

let _dashboard_tk_snapshot = null;
let _full_tk_cache = null;
const FULL_TK_CACHE_TTL_MS = 60000; // Cache bản full (all=1) 60 giây cho modal Lọc đơn để tránh lệch với TỔNG ĐƠN UPYO

async function tai_du_lieu_google_sheets(
  force = false,
  customStart = "",
  customEnd = "",
  allMode = false,
  bypassServerCache = false
) {
  doc_cau_hinh_tu_storage();

  let hasCachedCodes = false;
  try {
    hasCachedCodes = Boolean(localStorage.getItem(STORAGE_KEY_SHEET_CODES));
  } catch (e) {}

  if (force || bypassServerCache) {
    _full_tk_cache = null;
    if (!allMode) {
      thong_ke_is_full = false;
      _dashboard_tk_snapshot = null;
    }
  }
  if (allMode && !force && !bypassServerCache && _full_tk_cache && Array.isArray(_full_tk_cache.rows) && _full_tk_cache.rows.length > 0 && Date.now() - _full_tk_cache.timeMs < FULL_TK_CACHE_TTL_MS) {
    if (!thong_ke_is_full && Array.isArray(data_hien_tai) && data_hien_tai.length > 1) {
      _dashboard_tk_snapshot = {
        rows: data_hien_tai,
        start: thong_ke_loaded_start,
        end: thong_ke_loaded_end,
        timeMs: thong_ke_last_fetch_ms,
      };
    }
    data_hien_tai = _full_tk_cache.rows;
    thong_ke_loaded_start = APP_DATA_MIN_DATE;
    thong_ke_loaded_end = "2099-12-31";
    thong_ke_last_fetch_ms = _full_tk_cache.timeMs;
    thong_ke_is_full = true;
    rebuild_cust_first_mkt_index();
    return true;
  }
  if (
    !force &&
    !bypassServerCache &&
    thong_ke_is_full &&
    Array.isArray(data_hien_tai) &&
    data_hien_tai.length > 0 &&
    Date.now() - thong_ke_last_fetch_ms < FULL_TK_CACHE_TTL_MS
  ) {
    return true;
  }

  const todayStr = format_ymd_date(new Date());
  const effStart = customStart || current_start_date || todayStr;
  const effEnd = customEnd || current_end_date || effStart;
  const targetStart = allMode ? APP_DATA_MIN_DATE : clamp_min_data_date(dich_ngay_ymd(effStart, -35));
  const plus3 = dich_ngay_ymd(effEnd, 3);
  const targetEnd = allMode
    ? "2099-12-31"
    : clamp_min_data_date(effEnd <= todayStr && plus3 > todayStr ? todayStr : plus3);
  const rangeKey = allMode ? "ALL" : `${targetStart}|${targetEnd}`;

  const rangeCovered = Boolean(
    !allMode &&
    thong_ke_loaded_start &&
    thong_ke_loaded_end &&
    thong_ke_loaded_start <= targetStart &&
    thong_ke_loaded_end >= targetEnd
  );

  if (!force && rangeCovered && Array.isArray(data_hien_tai) && data_hien_tai.length > 0) {
    return true;
  }
  if (thong_ke_fetch_promise && !force && thong_ke_fetch_range_key === rangeKey) {
    return thong_ke_fetch_promise;
  }

  const queryStr =
    (allMode
      ? "gid=1227181736&all=1"
      : `gid=1227181736&start=${encodeURIComponent(targetStart)}&end=${encodeURIComponent(targetEnd)}`) +
    (bypassServerCache ? "&nocache=1" : "");
  const directUrl = build_apps_script_url(queryStr);
  if (!directUrl) return false;

  thong_ke_fetch_range_key = rangeKey;
  thong_ke_fetch_promise = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      const res = await fetch(`${directUrl}&t=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return false;
      const text = await res.text();
      const trimmed = text.trim();
      if (!trimmed || trimmed.startsWith("<!DOCTYPE html") || trimmed === "Unauthorized") {
        return false;
      }

      const rowsThongKe = parse_csv_lines(text);
      if (rowsThongKe && rowsThongKe.length > 0) {
        if (allMode) {
          if (!thong_ke_is_full && Array.isArray(data_hien_tai) && data_hien_tai.length > 1) {
            _dashboard_tk_snapshot = {
              rows: data_hien_tai,
              start: thong_ke_loaded_start,
              end: thong_ke_loaded_end,
              timeMs: thong_ke_last_fetch_ms,
            };
          }
          _full_tk_cache = { rows: rowsThongKe, timeMs: Date.now() };
        } else if (!customStart) {
          _dashboard_tk_snapshot = {
            rows: rowsThongKe,
            start: targetStart,
            end: targetEnd,
            timeMs: Date.now(),
          };
        }
        data_hien_tai = rowsThongKe;
        thong_ke_loaded_start = targetStart;
        thong_ke_loaded_end = targetEnd;
        thong_ke_last_fetch_ms = Date.now();
        thong_ke_is_full = Boolean(allMode);
        rebuild_cust_first_mkt_index();
        try {
          const odModal = document.getElementById("orderDetailModal");
          if (odModal && !odModal.classList.contains("hidden") && current_od_mode === "all_table" && !allMode) {
            current_od_raw_list = lay_tat_ca_don_hang_tu_bang_a_den_p(false);
            apply_od_filters_and_render(false);
          }
        } catch (eOdSync) {}
        // Chỉ lưu cache khởi động khi tải cho Dashboard chính (không để Modal hay all=1 ghi đè)
        if (!customStart && !allMode) {
          luu_cache_thong_ke(rowsThongKe);
        }
        if (!hasCachedCodes) {
          await dong_bo_ma_sp_tu_nguon_tag().catch(() => {});
        }
        if (!customStart && !allMode) {
          kich_hoat_tai_nen_sau_bang_chinh(150, bypassServerCache);
        }
        return true;
      }
      return false;
    } catch (e) {
      return false;
    } finally {
      thong_ke_fetch_promise = null;
      thong_ke_fetch_range_key = "";
    }
  })();

  return thong_ke_fetch_promise;
}

// ==============================================================
// QUÉT CHI PHÍ FACEBOOK ADS (CÓ PHÂN TRANG & GIỚI HẠN 100 CHIẾN DỊCH)
// ==============================================================
async function quet_chi_phi_facebook_helper(start_str, end_str, force = false) {
  const local_chi_tiet = {};
  const local_tong = {};
  const local_camps = {};
  for (const m of LIST_MKT_FB) {
    local_chi_tiet[m.ten] = {};
    local_tong[m.ten] = 0.0;
    local_camps[m.ten] = [];
  }

  const rawFbSpends = [];
  const fbErrors = [];

  if (!end_str || end_str < APP_DATA_MIN_DATE) {
    return { local_chi_tiet, local_tong, local_camps, local_fb_errors: fbErrors };
  }
  const effFbStart = clamp_min_data_date(start_str);
  const time_range = JSON.stringify({ since: effFbStart, until: end_str });

  const uniqueAccounts = [];
  const seenActs = new Set();
  for (const m of LIST_MKT_FB) {
    if (!seenActs.has(m.id)) {
      seenActs.add(m.id);
      uniqueAccounts.push(m.id);
    }
  }

  const pushFbItems = (actId, dataArr) => {
    const data = Array.isArray(dataArr) ? dataArr : [];
    for (const item of data) {
      const camp_id = String(item.campaign_id || "").trim();
      const camp_name = String(item.campaign_name || "").trim();
      const spend = parseFloat(item.spend || 0.0) || 0.0;
      if (!spend || spend <= 0) continue;

      const impressions = parseFloat(item.impressions || 0.0) || 0.0;
      const hasLinkClicks = item.inline_link_clicks !== undefined && item.inline_link_clicks !== null;
      const link_clicks = hasLinkClicks
        ? parseFloat(item.inline_link_clicks || 0.0) || 0.0
        : parseFloat(item.clicks || 0.0) || 0.0;
      const cpm = parseFloat(item.cpm || 0.0) || (impressions > 0 ? (spend / impressions) * 1000 : 0.0);
      const hasLinkCtr = item.inline_link_click_ctr !== undefined && item.inline_link_click_ctr !== null;
      const ctr = hasLinkCtr
        ? parseFloat(item.inline_link_click_ctr || 0.0) || 0.0
        : parseFloat(item.ctr || 0.0) || (impressions > 0 ? (link_clicks / impressions) * 100 : 0.0);
      const hasLinkCpc = item.cost_per_inline_link_click !== undefined && item.cost_per_inline_link_click !== null;
      const cpc = hasLinkCpc
        ? parseFloat(item.cost_per_inline_link_click || 0.0) || 0.0
        : parseFloat(item.cpc || 0.0) || (link_clicks > 0 ? spend / link_clicks : 0.0);
      const daily_budget = parseFloat(item.daily_budget || 0.0) || 0.0;
      const lifetime_budget = parseFloat(item.lifetime_budget || 0.0) || 0.0;
      const budget_type = String(item.budget_type || "").trim();
      const effective_status = String(item.effective_status || "").trim();

      rawFbSpends.push({
        actId,
        camp_id,
        camp_name,
        spend,
        impressions,
        link_clicks,
        cpm,
        ctr,
        cpc,
        daily_budget,
        lifetime_budget,
        budget_type,
        effective_status,
      });
    }
  };

  // 1. Ưu tiên gọi gộp 1 request duy nhất (?fb_acts=...) để giảm từ 6 luồng Apps Script xuống 1 luồng
  let batchSucceeded = false;
  const batchUrl = build_apps_script_url(
    `fb_acts=${encodeURIComponent(uniqueAccounts.join(","))}&time_range=${encodeURIComponent(time_range)}${force ? "&nocache=1" : ""}`
  );
  if (batchUrl) {
    let batchRes = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 35000);
      try {
        const response = await fetch(batchUrl, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) throw new Error("HTTP " + response.status);
        batchRes = await response.json();
        break;
      } catch (e) {
        clearTimeout(timer);
        batchRes = null;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 700));
      }
    }
    if (batchRes && batchRes.accounts && typeof batchRes.accounts === "object") {
      batchSucceeded = true;
      for (const actId of uniqueAccounts) {
        const accRes = batchRes.accounts[actId];
        if (!accRes) continue;
        if (accRes.fb_error || accRes.error) {
          const errObj = accRes.fb_error || accRes.error;
          const errMsg = (errObj && errObj.message) ? String(errObj.message) : String(errObj);
          if (errMsg) fbErrors.push(errMsg);
          continue;
        }
        pushFbItems(actId, accRes.data);
      }
    }
  }

  // 2. Tự động dự phòng cách gọi lẻ từng tài khoản nếu Apps Script chưa bấm triển khai bản mới
  if (!batchSucceeded) {
    await Promise.all(
      uniqueAccounts.map(async (actId) => {
        const baseInsightsUrl = build_apps_script_url(
          `fb_act=${encodeURIComponent(actId)}&time_range=${encodeURIComponent(time_range)}${force ? "&nocache=1" : ""}`
        );
        if (!baseInsightsUrl) return;

        let url = baseInsightsUrl;
        while (url) {
          let res = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 25000);
            try {
              const response = await fetch(url, { signal: controller.signal });
              clearTimeout(timer);
              if (!response.ok) throw new Error("HTTP " + response.status);
              res = await response.json();
              break;
            } catch (e) {
              clearTimeout(timer);
              res = null;
              if (attempt === 0) await new Promise((r) => setTimeout(r, 700));
            }
          }
          if (!res) break;
          if (res.fb_error || res.error) {
            const errObj = res.fb_error || res.error;
            const errMsg = (errObj && errObj.message) ? String(errObj.message) : String(errObj);
            if (errMsg) fbErrors.push(errMsg);
            break;
          }
          pushFbItems(actId, res.data);
          url = (res.paging && res.paging.next) ? res.paging.next : null;
        }
      })
    );
  }

  for (const item of rawFbSpends) {
    const {
      actId,
      camp_id,
      camp_name,
      spend,
      impressions,
      link_clicks,
      cpm,
      ctr,
      cpc,
      daily_budget,
      lifetime_budget,
      budget_type,
      effective_status,
    } = item;
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

      const listCamps = local_camps[targetMkt];
      const existing = camp_id ? listCamps.find((c) => c.campaign_id === camp_id) : null;
      if (existing) {
        existing.spend += spend;
        existing.impressions += impressions;
        existing.link_clicks += link_clicks;
        existing.cpm = existing.impressions > 0 ? (existing.spend / existing.impressions) * 1000 : existing.cpm;
        existing.ctr = existing.impressions > 0 ? (existing.link_clicks / existing.impressions) * 100 : existing.ctr;
        existing.cpc = existing.link_clicks > 0 ? existing.spend / existing.link_clicks : existing.cpc;
        if (!existing.daily_budget && daily_budget > 0) existing.daily_budget = daily_budget;
        if (!existing.lifetime_budget && lifetime_budget > 0) existing.lifetime_budget = lifetime_budget;
        if (!existing.budget_type && budget_type) existing.budget_type = budget_type;
        if (!existing.effective_status && effective_status) existing.effective_status = effective_status;
      } else {
        listCamps.push({
          campaign_id: camp_id,
          campaign_name: camp_name,
          sp: ten_mau,
          spend,
          impressions,
          link_clicks,
          cpm,
          ctr,
          cpc,
          daily_budget,
          lifetime_budget,
          budget_type,
          effective_status,
        });
      }
    }
  }

  return { local_chi_tiet, local_tong, local_camps, local_fb_errors: fbErrors };
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
    date_patterns.add(format_ymd_date(curr));
    curr.setDate(curr.getDate() + 1);
  }

  return date_patterns;
}

const DATE_TOKEN_EXTRACT_RE = /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})|(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/;

function tach_ngay_ymd_tu_chuoi(tg) {
  const m = DATE_TOKEN_EXTRACT_RE.exec(String(tg || "").trim());
  if (!m) return "";
  if (m[1]) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return `${m[6]}-${m[5].padStart(2, "0")}-${m[4].padStart(2, "0")}`;
}

function khop_ngay_chinh_xac(tg, patternsArr) {
  const ymd = tach_ngay_ymd_tu_chuoi(tg);
  if (!ymd || !patternsArr) return false;
  return Array.isArray(patternsArr) ? patternsArr.includes(ymd) : Boolean(patternsArr.has && patternsArr.has(ymd));
}

let td_first_landing_by_sdt = new Map();
let td_first_landing_indexed_ref = null;
let cust_first_mkt_by_sdt = new Map();
let cust_first_mkt_by_addr = new Map();
let cust_first_mkt_indexed_td_ref = null;
let cust_first_mkt_indexed_th_ref = null;

function chuan_hoa_mkt_dashboard(raw) {
  const mkt = String(raw || "").trim().toUpperCase();
  if (!mkt || ["MKT", "MARKETER", "TÊN MKT", "SALE", "KHÁC", "KHAC", "—", "-"].includes(mkt)) {
    return "KHÁC";
  }
  const mktNoDau = bo_dau_tieng_viet(mkt);
  if (mktNoDau.includes("THANH") || mktNoDau.includes("TH.LAM") || mktNoDau.includes("TH LAM")) {
    return "TH.LÂM";
  }
  if (mktNoDau.includes("LAM")) return "LÂM";
  if (mktNoDau.includes("PHUC")) return "PHÚC";
  if (mktNoDau.includes("TAM")) return "TÂM";
  if (mktNoDau.includes("SAN")) return "SAN";
  if (mktNoDau.includes("DUNG")) return "D\u0168NG";
  return mkt;
}

function is_zalo_or_outside_platform(nenTangRaw) {
  const s = bo_dau_tieng_viet(String(nenTangRaw || "").trim()).toUpperCase();
  return Boolean(s && (s.includes("ZALO") || s.includes("KHACH NGOAI") || s === "NGOAI"));
}

function rebuild_td_first_landing_index() {
  td_first_landing_by_sdt = new Map();
  td_first_landing_indexed_ref = data_tong_don_upyo;
  if (!Array.isArray(data_tong_don_upyo) || data_tong_don_upyo.length === 0) return;

  let colTg = 0;
  let colSdt = 2;
  let colMkt = 6;
  const headerRow = data_tong_don_upyo[0];
  if (Array.isArray(headerRow)) {
    for (let i = 0; i < headerRow.length; i++) {
      const h = bo_dau_tieng_viet(String(headerRow[i] || "").replace(/\s+/g, " ").trim()).toLowerCase();
      if (h === "so dien thoai" || h === "sdt") colSdt = i;
      else if (h === "mkt" || h === "marketer") colMkt = i;
    }
  }

  for (let i = 0; i < data_tong_don_upyo.length; i++) {
    const r = data_tong_don_upyo[i];
    if (!Array.isArray(r) || r.length <= Math.max(colSdt, colMkt)) continue;
    const tgRaw = String(r[colTg] || "").trim();
    const c0 = bo_dau_tieng_viet(tgRaw).toUpperCase();
    if (i === 0 && (c0.includes("THOI GIAN") || c0 === "STT")) continue;

    const sdtNorm = chuan_hoa_sdt_so_sanh(r[colSdt]);
    if (!sdtNorm) continue;

    const mktRaw = String(r[colMkt] || "").trim();
    const mktDash = chuan_hoa_mkt_dashboard(mktRaw);
    if (mktDash === "KHÁC") continue;

    const mktSheet = mktDash === "TH.LÂM" ? "THANH LÂM" : mktDash;
    let ymd = "";
    let timeMs = 0;
    const dt = parse_datetime_vn(tgRaw);
    if (dt) {
      timeMs = dt.getTime();
      ymd = format_ymd_date(dt);
    } else {
      const token = tgRaw.split(/\s+/)[0] || "";
      ymd = parse_order_ymd({ ngay_only: token });
      if (ymd) timeMs = parse_ymd_date(ymd).getTime();
    }

    if (!td_first_landing_by_sdt.has(sdtNorm)) td_first_landing_by_sdt.set(sdtNorm, []);
    td_first_landing_by_sdt.get(sdtNorm).push({ timeMs, ymd, mktDashboard: mktDash, mktSheet });
  }

  td_first_landing_by_sdt.forEach((arr) => {
    arr.sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));
  });
}

function tim_mkt_landing_dau_tien_theo_sdt(sdtRaw, orderYmd) {
  if (td_first_landing_indexed_ref !== data_tong_don_upyo) {
    rebuild_td_first_landing_index();
  }
  const sdtNorm = chuan_hoa_sdt_so_sanh(sdtRaw);
  if (!sdtNorm) return null;
  const list = td_first_landing_by_sdt.get(sdtNorm);
  if (!list || list.length === 0) return null;

  for (const rec of list) {
    if (!orderYmd || !rec.ymd || rec.ymd <= orderYmd) {
      return rec;
    }
  }
  return null;
}

function rebuild_cust_first_mkt_index() {
  cust_first_mkt_by_sdt = new Map();
  cust_first_mkt_by_addr = new Map();
  cust_first_mkt_indexed_td_ref = data_tong_don_upyo;
  cust_first_mkt_indexed_th_ref = data_hien_tai;

  const addEntry = (sdtNorm, addrKey, entry) => {
    if (sdtNorm) {
      if (!cust_first_mkt_by_sdt.has(sdtNorm)) cust_first_mkt_by_sdt.set(sdtNorm, []);
      cust_first_mkt_by_sdt.get(sdtNorm).push(entry);
    }
    if (addrKey) {
      if (!cust_first_mkt_by_addr.has(addrKey)) cust_first_mkt_by_addr.set(addrKey, []);
      cust_first_mkt_by_addr.get(addrKey).push(entry);
    }
  };

  if (Array.isArray(data_tong_don_upyo) && data_tong_don_upyo.length > 0) {
    let colTg = 0;
    let colSdt = 2;
    let colDiaChi = 5;
    let colMkt = 6;
    const headerRow = data_tong_don_upyo[0];
    if (Array.isArray(headerRow)) {
      for (let i = 0; i < headerRow.length; i++) {
        const h = bo_dau_tieng_viet(String(headerRow[i] || "").trim()).toLowerCase();
        if (h === "so dien thoai" || h === "sdt") colSdt = i;
        else if (h === "dia chi") colDiaChi = i;
        else if (h === "mkt" || h === "marketer") colMkt = i;
      }
    }

    for (let i = 0; i < data_tong_don_upyo.length; i++) {
      const r = data_tong_don_upyo[i];
      if (!Array.isArray(r) || r.length <= colMkt) continue;
      const tgRaw = String(r[colTg] || "").trim();
      const c0 = bo_dau_tieng_viet(tgRaw).toUpperCase();
      if (i === 0 && (c0.includes("THOI GIAN") || c0 === "STT")) continue;

      const sdtNorm = r.length > colSdt ? chuan_hoa_sdt_so_sanh(r[colSdt]) : "";
      const addrKey = r.length > colDiaChi ? chuan_hoa_ten_hoac_dia_chi_trung(r[colDiaChi], 3, 10) : "";
      if (!sdtNorm && !addrKey) continue;

      const mktDash = chuan_hoa_mkt_dashboard(r[colMkt]);
      if (mktDash === "KHÁC") continue;

      const mktSheet = mktDash === "TH.LÂM" ? "THANH LÂM" : mktDash;
      let ymd = "";
      let timeMs = 0;
      const dt = parse_datetime_vn(tgRaw);
      if (dt) {
        timeMs = dt.getTime();
        ymd = format_ymd_date(dt);
      } else {
        const token = tgRaw.split(/\s+/)[0] || "";
        ymd = parse_order_ymd({ ngay_only: token });
        if (ymd) timeMs = parse_ymd_date(ymd).getTime();
      }

      addEntry(sdtNorm, addrKey, { ymd, sourceRank: 0, timeMs, rowNum: -1, mktDashboard: mktDash, mktSheet });
    }
  }

  if (Array.isArray(data_hien_tai) && data_hien_tai.length > 0) {
    let lastCustSdt = "";
    let lastCustAddr = "";
    let lastCustDate = "";
    for (let i = 0; i < data_hien_tai.length; i++) {
      const r = data_hien_tai[i];
      if (!Array.isArray(r) || r.length === 0) continue;
      const tg = String(r[0] || "").trim();
      const c0 = bo_dau_tieng_viet(tg).toUpperCase();
      const c2 = bo_dau_tieng_viet(String(r[2] || "").trim()).toUpperCase();
      if (c0 === "THOI GIAN" || c0 === "STT" || c2 === "HO TEN") continue;

      const dateToken = tg ? tg.split(/\s+/)[0] : "";
      const sdtCell = r.length > 3 ? String(r[3] || "").trim() : "";
      const addrCell = r.length > 4 ? String(r[4] || "").trim() : "";
      const hoTenCell = r.length > 2 ? String(r[2] || "").trim() : "";
      if (sdtCell || addrCell || hoTenCell) {
        lastCustSdt = sdtCell;
        lastCustAddr = addrCell;
        lastCustDate = dateToken;
      }

      if (r.length <= 12) continue;
      const ttNoDau = r.length > 13 ? bo_dau_tieng_viet(String(r[13] || "").trim()).toUpperCase() : "";
      if (ttNoDau.includes("HUY") || ttNoDau.includes("TRUNG") || ttNoDau.includes("TEST")) continue;

      const mktDash = chuan_hoa_mkt_dashboard(r[12]);
      if (mktDash === "KHÁC") continue;

      const sameDateCtx = !dateToken || !lastCustDate || dateToken === lastCustDate;
      const sdtNorm = chuan_hoa_sdt_so_sanh(sdtCell || (sameDateCtx ? lastCustSdt : ""));
      const addrKey = chuan_hoa_ten_hoac_dia_chi_trung(addrCell || (sameDateCtx ? lastCustAddr : ""), 3, 10);
      if (!sdtNorm && !addrKey) continue;

      const ymd = parse_order_ymd({ ngay_only: dateToken });
      const timeMs = ymd ? parse_ymd_date(ymd).getTime() : 0;
      const mktSheet = mktDash === "TH.LÂM" ? "THANH LÂM" : mktDash;

      addEntry(sdtNorm, addrKey, { ymd, sourceRank: 1, timeMs, rowNum: i + 1, mktDashboard: mktDash, mktSheet });
    }
  }

  const cmpEntry = (a, b) => {
    const ya = a.ymd || "9999-99-99";
    const yb = b.ymd || "9999-99-99";
    if (ya !== yb) return ya.localeCompare(yb);
    if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
    if ((a.timeMs || 0) !== (b.timeMs || 0)) return (a.timeMs || 0) - (b.timeMs || 0);
    return (a.rowNum || 0) - (b.rowNum || 0);
  };
  cust_first_mkt_by_sdt.forEach((arr) => arr.sort(cmpEntry));
  cust_first_mkt_by_addr.forEach((arr) => arr.sort(cmpEntry));
}

function tim_mkt_dau_tien_cua_khach(sdtRaw, addrRaw, orderYmd, excludeRowNum) {
  if (
    cust_first_mkt_indexed_td_ref !== data_tong_don_upyo ||
    cust_first_mkt_indexed_th_ref !== data_hien_tai
  ) {
    rebuild_cust_first_mkt_index();
  }
  const sdtNorm = chuan_hoa_sdt_so_sanh(sdtRaw);
  const addrKey = chuan_hoa_ten_hoac_dia_chi_trung(addrRaw, 3, 10);
  if (!sdtNorm && !addrKey) return null;

  const candidates = [];
  if (sdtNorm && cust_first_mkt_by_sdt.has(sdtNorm)) {
    candidates.push(...cust_first_mkt_by_sdt.get(sdtNorm));
  }
  if (addrKey && cust_first_mkt_by_addr.has(addrKey)) {
    candidates.push(...cust_first_mkt_by_addr.get(addrKey));
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const ya = a.ymd || "9999-99-99";
    const yb = b.ymd || "9999-99-99";
    if (ya !== yb) return ya.localeCompare(yb);
    if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
    if ((a.timeMs || 0) !== (b.timeMs || 0)) return (a.timeMs || 0) - (b.timeMs || 0);
    return (a.rowNum || 0) - (b.rowNum || 0);
  });

  for (const rec of candidates) {
    if (rec.sourceRank === 1 && excludeRowNum && rec.rowNum === excludeRowNum) continue;
    if (!orderYmd || !rec.ymd || rec.ymd <= orderYmd) {
      return rec;
    }
  }
  return null;
}

function resolve_row_mkt_for_dashboard(r, fallbackSdt, fallbackAddr, rowNum) {
  let mkt_norm = chuan_hoa_mkt_dashboard(r[12]);
  if (mkt_norm === "KHÁC") {
    const sdt = String(r[3] || "").trim() || fallbackSdt || "";
    const addr = String(r[4] || "").trim() || fallbackAddr || "";
    const tgToken = String(r[0] || "").trim().split(/\s+/)[0] || "";
    const orderYmd = parse_order_ymd({ ngay_only: tgToken });
    const firstMkt = tim_mkt_dau_tien_cua_khach(sdt, addr, orderYmd, rowNum);
    if (firstMkt) {
      mkt_norm = firstMkt.mktDashboard;
    }
  }
  return mkt_norm;
}

function dem_don_chi_tiet_theo_ngay(start_str, end_str) {
  const patternsArr = tao_cac_dang_ngay_khop(start_str, end_str);

  const stats_mkt_don = {};
  const stats_mkt_dt = {};
  const stats_sp_don = {};
  const stats_sp_dt = {};
  const stats_mkt_sp_don = {};
  const stats_mkt_sp_dt = {};

  let lastCustSdt = "";
  let lastCustAddr = "";
  let lastCustDate = "";

  for (let i = 0; i < data_hien_tai.length; i++) {
    const r = data_hien_tai[i];
    if (r.length > 13) {
      const tg = String(r[0] || "").trim();
      const dateOnly = tg ? tg.split(/\s+/)[0] : "";
      const sdtCell = String(r[3] || "").trim();
      const addrCell = String(r[4] || "").trim();
      if (sdtCell || addrCell || String(r[2] || "").trim()) {
        lastCustSdt = sdtCell;
        lastCustAddr = addrCell;
        lastCustDate = dateOnly;
      }

      const is_matched_date = khop_ngay_chinh_xac(tg, patternsArr);

      if (is_matched_date) {
        if (la_don_hop_le_de_dem(r[13])) {
          const sameDateCtx = !dateOnly || !lastCustDate || dateOnly === lastCustDate;
          const fallbackSdt = !sdtCell && sameDateCtx ? lastCustSdt : "";
          const fallbackAddr = !addrCell && sameDateCtx ? lastCustAddr : "";
          const mkt_norm = resolve_row_mkt_for_dashboard(r, fallbackSdt, fallbackAddr, i + 1);

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
  let lastCustomerCtx = null;
  let groupCounter = 0;
  for (let i = 0; i < data_hien_tai.length; i++) {
    const r = data_hien_tai[i];
    if (!Array.isArray(r) || r.length === 0) continue;

    // Bỏ qua dòng tiêu đề (Header row)
    const c0 = bo_dau_tieng_viet(String(r[0] || "").trim()).toUpperCase();
    const c2 = bo_dau_tieng_viet(String(r[2] || "").trim()).toUpperCase();
    if (c0 === "THOI GIAN" || c0 === "STT" || c2 === "HO TEN") continue;

    const maVanDon = r.length > 1 ? String(r[1] || "").trim() : "";
    const hoTen = r.length > 2 ? String(r[2] || "").trim() : "";
    const sdtRaw = r.length > 3 ? String(r[3] || "").trim() : "";
    const diaChi = r.length > 4 ? String(r[4] || "").trim() : "";
    const dongSp = r.length > 5 ? String(r[5] || "").trim() : "";
    const giaBanVal = r.length > 8 ? parse_gia_tien(r[8]) : 0;

    // Bỏ qua các dòng không có sản phẩm và không có giá bán (dòng mẫu trống chỉ điền sẵn ngày/nền tảng/trạng thái)
    if (!dongSp && giaBanVal <= 0) {
      continue;
    }

    const hasCustomerInfo = Boolean(maVanDon || hoTen || sdtRaw || diaChi);

    const mapped = map_sheet_row_a_to_p(r, i + 1, null);
    if (hasCustomerInfo) {
      groupCounter += 1;
      mapped.group_id = groupCounter;
      lastCustomerCtx = {
        group_id: groupCounter,
        ngay_only: mapped.ngay_only,
        mkt: mapped.mkt,
        ma_van_don: mapped.ma_van_don,
        ho_ten: mapped.ho_ten,
        sdt: mapped.sdt,
        dia_chi: mapped.dia_chi,
      };
    } else if (lastCustomerCtx) {
      const sameDate = !mapped.ngay_only || !lastCustomerCtx.ngay_only || mapped.ngay_only === lastCustomerCtx.ngay_only;
      if (sameDate) {
        if (!mapped.ngay_only) mapped.ngay_only = lastCustomerCtx.ngay_only;
        mapped.group_id = lastCustomerCtx.group_id;
        mapped.parent_ma_van_don = lastCustomerCtx.ma_van_don;
        mapped.parent_ho_ten = lastCustomerCtx.ho_ten;
        mapped.parent_sdt = lastCustomerCtx.sdt;
        mapped.parent_dia_chi = lastCustomerCtx.dia_chi;
      } else {
        groupCounter += 1;
        mapped.group_id = groupCounter;
      }
    } else {
      groupCounter += 1;
      mapped.group_id = groupCounter;
    }

    if (patternsArr) {
      const tg = String(r[0] || mapped.ngay_only || "").trim();
      if (!khop_ngay_chinh_xac(tg, patternsArr)) continue;
    }

    ket_qua.push(mapped);
  }
  return ket_qua;
}

// Lấy danh sách các đơn hàng thực tế đã được đếm (khớp ngày, MKT, SP và trạng thái hợp lệ)
function lay_danh_sach_don_chi_tiet(ten_mkt, ten_sp, startOverride = "", endOverride = "") {
  if (!Array.isArray(data_hien_tai) || data_hien_tai.length === 0) return [];
  const start_str = startOverride || current_start_date || "";
  const end_str = endOverride || current_end_date || "";
  const patternsArr = tao_cac_dang_ngay_khop(start_str, end_str);

  const ket_qua = [];
  let lastCustSdt = "";
  let lastCustAddr = "";
  let lastCustDate = "";
  for (let i = 0; i < data_hien_tai.length; i++) {
    const r = data_hien_tai[i];
    if (r.length <= 13) continue;

    const tg = String(r[0] || "").trim();
    const dateOnly = tg ? tg.split(/\s+/)[0] : "";
    const sdtCell = String(r[3] || "").trim();
    const addrCell = String(r[4] || "").trim();
    if (sdtCell || addrCell || String(r[2] || "").trim()) {
      lastCustSdt = sdtCell;
      lastCustAddr = addrCell;
      lastCustDate = dateOnly;
    }

    const is_matched_date = khop_ngay_chinh_xac(tg, patternsArr);
    if (!is_matched_date) continue;

    if (!la_don_hop_le_de_dem(r[13])) continue;

    const sameDateCtx = !dateOnly || !lastCustDate || dateOnly === lastCustDate;
    const fallbackSdt = !sdtCell && sameDateCtx ? lastCustSdt : "";
    const fallbackAddr = !addrCell && sameDateCtx ? lastCustAddr : "";
    const mkt_norm = resolve_row_mkt_for_dashboard(r, fallbackSdt, fallbackAddr, i + 1);

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
    if (!ten_mau) continue;
    if (ten_sp && ten_mau !== ten_sp) continue;

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
// Loại trừ khung giờ nghỉ: 22:00 - 09:00, 12:00 - 14:00, 18:00 - 19:30
function calc_working_call_seconds(dtStart, dtEnd) {
  if (!dtStart || !dtEnd) return null;
  const tStart = dtStart.getTime();
  const tEnd = dtEnd.getTime();
  if (isNaN(tStart) || isNaN(tEnd) || tEnd < tStart) return null;

  // Giới hạn tối đa 7 ngày để tránh vòng lặp dài với dữ liệu lỗi
  if (tEnd - tStart > 7 * 86400 * 1000) return null;

  const dayCursor = new Date(dtStart.getFullYear(), dtStart.getMonth(), dtStart.getDate(), 0, 0, 0, 0);
  const lastDay = new Date(dtEnd.getFullYear(), dtEnd.getMonth(), dtEnd.getDate(), 0, 0, 0, 0);

  // Các khung giờ làm việc trong ngày (đã loại trừ 22h-9h, 12h-14h, 18h-19h30):
  // Ca sáng: 09:00 - 12:00 | Ca chiều: 14:00 - 18:00 | Ca tối: 19:30 - 22:00
  const shifts = [
    [9, 0, 12, 0],
    [14, 0, 18, 0],
    [19, 30, 22, 0],
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
  const patternsArr = tao_cac_dang_ngay_khop(start_str, end_str);

  let colTg = 0;
  let colMkt = 6;
  let colSp = 7;
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
      else if (h === "dòng sp" || h === "dong sp" || h === "sản phẩm" || h === "tên sp" || h === "ten sp") colSp = i;
    }
  }

  let tong_dem = 0;
  let tong_chot = 0;
  let tong_tg_goi_sec = 0;
  let so_don_da_goi = 0;
  let tong_tg_goi_hc_sec = 0;
  let so_don_da_goi_hc = 0;
  let tong_tg_goi_toi_sec = 0;
  let so_don_da_goi_toi = 0;
  const by_mkt = {};
  const by_sp = {};
  const by_mkt_sp = {};

  for (const r of data_tong_don_upyo) {
    if (r.length > Math.max(colDaChot, colDemDon)) {
      const tg = String(r[colTg] || "").trim();
      const is_matched_date = khop_ngay_chinh_xac(tg, patternsArr);
      if (is_matched_date) {
        const dem = parseInt(String(r[colDemDon] || "0").trim(), 10) || 0;
        const chot = parseInt(String(r[colDaChot] || "0").trim(), 10) || 0;
        if (dem <= 0 && chot <= 0) continue;

        const mkt_norm = chuan_hoa_mkt_dashboard(r[colMkt]);

        tong_dem += dem;
        tong_chot += chot;

        if (!by_mkt[mkt_norm]) {
          by_mkt[mkt_norm] = { dem: 0, chot: 0 };
        }
        by_mkt[mkt_norm].dem += dem;
        by_mkt[mkt_norm].chot += chot;

        const rawSp = r.length > colSp ? String(r[colSp] || "").trim() : "";
        let sp_norm = "";
        if (rawSp && !["DÒNG SP", "TÊN SP", "SẢN PHẨM", "MÃ SP", "MÃ"].includes(rawSp.toUpperCase())) {
          sp_norm = trich_xuat_ten_mau_thong_minh(rawSp);
        }
        if (sp_norm && sp_norm !== "CHƯA XÁC ĐỊNH") {
          if (!by_sp[sp_norm]) by_sp[sp_norm] = { dem: 0, chot: 0 };
          by_sp[sp_norm].dem += dem;
          by_sp[sp_norm].chot += chot;

          if (!by_mkt_sp[mkt_norm]) by_mkt_sp[mkt_norm] = {};
          if (!by_mkt_sp[mkt_norm][sp_norm]) by_mkt_sp[mkt_norm][sp_norm] = { dem: 0, chot: 0 };
          by_mkt_sp[mkt_norm][sp_norm].dem += dem;
          by_mkt_sp[mkt_norm][sp_norm].chot += chot;
        }

        if (r.length > colTgGoi) {
          const tgGoiRaw = String(r[colTgGoi] || "").trim();
          if (tgGoiRaw) {
            const dtOrder = parse_datetime_vn(tg);
            const dtCall = parse_datetime_vn(tgGoiRaw);
            const callSec = calc_working_call_seconds(dtOrder, dtCall);
            if (callSec !== null && callSec >= 0) {
              const callMins = dtCall.getHours() * 60 + dtCall.getMinutes();
              const isCaHanhChinh =
                (callMins >= 9 * 60 && callMins < 12 * 60) ||
                (callMins >= 14 * 60 && callMins < 17 * 60 + 30);
              const isCaToi =
                (callMins >= 17 * 60 + 30 && callMins < 18 * 60) ||
                (callMins >= 19 * 60 + 30 && callMins < 22 * 60);

              // Bỏ qua các đơn được gọi trong khung giờ nghỉ (22h-9h, 12h-14h, 18h-19h30)
              if (isCaHanhChinh) {
                tong_tg_goi_sec += callSec;
                so_don_da_goi += 1;
                tong_tg_goi_hc_sec += callSec;
                so_don_da_goi_hc += 1;
              } else if (isCaToi) {
                tong_tg_goi_sec += callSec;
                so_don_da_goi += 1;
                tong_tg_goi_toi_sec += callSec;
                so_don_da_goi_toi += 1;
              }
            }
          }
        }
      }
    }
  }

  const tong_chua_chot = Math.max(0, tong_dem - tong_chot);
  const ty_le_chot = tong_dem > 0 ? (tong_chot / tong_dem) * 100 : 0;
  const avg_call_sec = so_don_da_goi > 0 ? tong_tg_goi_sec / so_don_da_goi : 0;
  const avg_call_hc_sec = so_don_da_goi_hc > 0 ? tong_tg_goi_hc_sec / so_don_da_goi_hc : 0;
  const avg_call_toi_sec = so_don_da_goi_toi > 0 ? tong_tg_goi_toi_sec / so_don_da_goi_toi : 0;

  return {
    tong_dem,
    tong_chot,
    tong_chua_chot,
    ty_le_chot,
    avg_call_sec,
    so_don_da_goi,
    avg_call_hc_sec,
    so_don_da_goi_hc,
    avg_call_toi_sec,
    so_don_da_goi_toi,
    by_mkt,
    by_sp,
    by_mkt_sp,
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
    }).catch(() => {});
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
      icon: "",
      color: "var(--r1-text)",
      barColor: "#D97706",
    };
  }
  if (rank === 2) {
    return {
      cls: "rank-2",
      pillCls: "rank-pill-2",
      icon: "",
      color: "var(--r2-text)",
      barColor: "#8C654B",
    };
  }
  if (rank === 3) {
    return {
      cls: "rank-3",
      pillCls: "rank-pill-3",
      icon: "",
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
  document.getElementById("avgCallTimePopup")?.classList.add("hidden");

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
    by_sp: {},
    by_mkt_sp: {},
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
  render_avg_call_time_popup_table();
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
  document.getElementById("avgCallTimePopup")?.classList.add("hidden");

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

function render_avg_call_time_popup_table() {
  const head = document.getElementById("avgCallTimeHead");
  const body = document.getElementById("avgCallTimeBody");
  const foot = document.getElementById("avgCallTimeFoot");
  if (!head || !body || !foot) return;

  const cr = last_closing_rate_data || {};
  head.innerHTML =
    `<tr><th class="ac-left">CA LÀM VIỆC</th>` +
    `<th>GỌI TB</th></tr>`;

  const make_shift_row = (icon, title, sub, count, avgSec, extraCls) => {
    const tr = document.createElement("tr");
    if (extraCls) tr.className = extraCls;

    const tdLabel = document.createElement("td");
    tdLabel.className = "ac-left ac-code";
    if (sub) {
      const rowWrap = document.createElement("div");
      rowWrap.className = "act-shift-row";
      const iconBox = document.createElement("span");
      iconBox.className = "act-shift-icon";
      iconBox.setAttribute("aria-hidden", "true");
      iconBox.textContent = icon;
      const wrap = document.createElement("div");
      wrap.className = "act-shift-wrap";
      const nameSpan = document.createElement("span");
      nameSpan.className = "act-shift-name";
      nameSpan.textContent = title;
      const subSpan = document.createElement("span");
      subSpan.className = "act-shift-sub";
      subSpan.textContent = sub;
      wrap.appendChild(nameSpan);
      wrap.appendChild(subSpan);
      rowWrap.appendChild(iconBox);
      rowWrap.appendChild(wrap);
      tdLabel.appendChild(rowWrap);
    } else {
      tdLabel.textContent = title;
    }
    tr.appendChild(tdLabel);

    const tdTime = document.createElement("td");
    tdTime.className = "ac-num";
    const pill = document.createElement("span");
    const pillCls = get_call_time_pill_cls(avgSec, count);
    pill.className = `cpds-pill ${pillCls}`;
    pill.textContent = count > 0 ? format_call_duration(avgSec) : "--";
    tdTime.appendChild(pill);
    tr.appendChild(tdTime);
    return tr;
  };

  body.innerHTML = "";
  body.appendChild(
    make_shift_row(
      "☀️",
      "Ca hành chính",
      "09:00 - 17:30",
      cr.so_don_da_goi_hc || 0,
      cr.avg_call_hc_sec || 0,
      (cr.so_don_da_goi_hc || 0) === 0 ? "ac-idle" : ""
    )
  );
  body.appendChild(
    make_shift_row(
      "🌙",
      "Ca tối",
      "17:30 - 22:00",
      cr.so_don_da_goi_toi || 0,
      cr.avg_call_toi_sec || 0,
      (cr.so_don_da_goi_toi || 0) === 0 ? "ac-idle" : ""
    )
  );

  foot.innerHTML = "";
  foot.appendChild(
    make_shift_row(
      "",
      "Tổng cộng",
      "",
      cr.so_don_da_goi || 0,
      cr.avg_call_sec || 0,
      "ac-total"
    )
  );
}

function toggle_avg_call_time_popup(anchorEl) {
  const pop = document.getElementById("avgCallTimePopup");
  if (!pop || !anchorEl) return;
  document.getElementById("calendarPopup")?.classList.add("hidden");
  document.getElementById("settingsPopup")?.classList.add("hidden");
  document.getElementById("allCodesPopup")?.classList.add("hidden");
  document.getElementById("closingRatePopup")?.classList.add("hidden");

  if (!pop.classList.contains("hidden")) {
    pop.classList.add("hidden");
    return;
  }

  render_avg_call_time_popup_table();
  pop.classList.remove("hidden");

  const rect = anchorEl.getBoundingClientRect();
  const w = Math.min(262, window.innerWidth - 24);
  let left = rect.right - w;
  if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12;
  if (left < 12) left = 12;
  pop.style.width = `${w}px`;
  pop.style.left = `${left}px`;
  pop.style.top = `${rect.bottom + 7}px`;
  pop.style.maxHeight = `${Math.max(240, window.innerHeight - rect.bottom - 24)}px`;
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
  card.className = "cozy-card clickable-card company-summary-card camp-primary-card";
  card.style.setProperty("--card-index", "0");
  card.title = "Bấm để xem danh sách Camp của toàn công ty";

  const topRow = document.createElement("div");
  topRow.className = "card-top-row";
  topRow.innerHTML = `
    <div class="card-title-group">
      <span class="card-name">${dict.companySummaryTitle}</span>
      <span class="card-sub-label">${date_label}</span>
      ${build_card_camp_pill_html("__ALL__", "")}
      <span class="card-view-orders-hint clickable-hint js-btn-view-company-orders" title="Bấm để xem chi tiết tất cả ${tong_don} đơn hàng của mọi người">Chi tiết đơn →</span>
      <span class="card-export-cp-hint clickable-hint js-btn-export-cp" title="Xuất bản chi phí (Excel &amp; Google Sheets) cho Toàn công ty">Xuất bản CP</span>
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

  const openCompanyOrders = (e) => {
    if (e) e.stopPropagation();
    hien_thi_bang_don_hang_chi_tiet(null, null);
  };

  const btnViewCompanyCamps = topRow.querySelector(".js-btn-view-card-camps");
  if (btnViewCompanyCamps) {
    btnViewCompanyCamps.addEventListener("click", (e) => {
      e.stopPropagation();
      hien_thi_bang_camp_mkt("__ALL__", "");
    });
  }
  const btnViewCompanyOrders = topRow.querySelector(".js-btn-view-company-orders");
  if (btnViewCompanyOrders) {
    btnViewCompanyOrders.addEventListener("click", openCompanyOrders);
  }
  const btnExportCompanyCp = topRow.querySelector(".js-btn-export-cp");
  if (btnExportCompanyCp) {
    btnExportCompanyCp.addEventListener("click", (e) => {
      e.stopPropagation();
      open_export_cp_modal("__ALL__");
    });
  }
  card.addEventListener("click", () => hien_thi_bang_camp_mkt("__ALL__", ""));

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
      ${build_sp_closing_rate_pill_html(null, name_str)}
      ${build_card_camp_pill_html(name_str, "")}
      <span class="card-view-orders-hint clickable-hint js-btn-view-mkt-orders" title="Bấm để xem chi tiết tất cả ${count} đơn của ${name_str}">Chi tiết đơn →</span>
      <span class="card-export-cp-hint clickable-hint js-btn-export-cp" title="Xuất bản chi phí (Excel &amp; Google Sheets) cho ${name_str}">Xuất bản CP</span>
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
  const isSilentBar = Boolean(window._silentDashboardRerender);
  const initWidth = isSilentBar ? sharePct : 0;
  barTrack.innerHTML = `<div class="card-share-bar-fill" style="width: ${initWidth}%; background: ${barColor}"></div>`;
  card.appendChild(barTrack);

  if (!isSilentBar) {
    requestAnimationFrame(() => {
      const fill = barTrack.querySelector(".card-share-bar-fill");
      if (fill) fill.style.width = `${sharePct}%`;
    });
  }

  const countEl = topRow.querySelector(".js-count");
  animate_number(countEl, count, (v) => String(Math.round(v)), 520);

  const btnViewCardCamps = topRow.querySelector(".js-btn-view-card-camps");
  if (btnViewCardCamps) {
    btnViewCardCamps.addEventListener("click", (e) => {
      e.stopPropagation();
      hien_thi_bang_camp_mkt(name_str);
    });
  }

  const btnViewOrders = topRow.querySelector(".js-btn-view-mkt-orders");
  if (btnViewOrders) {
    btnViewOrders.addEventListener("click", (e) => {
      e.stopPropagation();
      hien_thi_bang_don_hang_chi_tiet(name_str, null);
    });
  }

  const btnExportCp = topRow.querySelector(".js-btn-export-cp");
  if (btnExportCp) {
    btnExportCp.addEventListener("click", (e) => {
      e.stopPropagation();
      open_export_cp_modal(name_str);
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
let od_date_start = null; // "YYYY-MM-DD" or null
let od_date_end = null;   // "YYYY-MM-DD" or null
let od_only_missing_tracking = false;
let od_only_landing_mkt_issue = false;
let od_only_dup_mkt = false;

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
  if (
    s.includes("CHUA LEN DON") ||
    s.includes("CHOT CHUA CO HANG") ||
    s.includes("XUAT EXCEL") ||
    s.includes("LEN APPLAM") ||
    s.includes("LEN APP LAM") ||
    s.includes("LEN APP VTP") ||
    s.includes("LEN APPVTP") ||
    s.includes("DANG GIAO HANG") ||
    s.includes("DANG VAN CHUYEN") ||
    s.includes("DA LAY HANG") ||
    s.includes("DANG LAY HANG") ||
    s.includes("DA TIEP NHAN") ||
    s.includes("CHO PHAT LAI") ||
    s.includes("CHO XU LY") ||
    s.includes("PHAT TIEP")
  )
    return "pill-status-direct";
  if (s.includes("GIAO THANG")) return "pill-status-direct";
  if (s.includes("DOI HANG") || s.includes("GIAO 1 PHAN")) return "pill-status-exchange";
  if (s.includes("TEST")) return "pill-status-test";
  if (
    s.includes("HUY") ||
    s.includes("HOAN") ||
    s.includes("DA TRA") ||
    s.includes("TRUNG") ||
    s.includes("CHUA VAO") ||
    s.includes("SAI MKT") ||
    s.includes("CHUA DIEN")
  )
    return "pill-status-cancel";
  return "pill-status-default";
}

function chuan_hoa_sdt_so_sanh(raw) {
  let d = String(raw || "").replace(/\D+/g, "");
  if (!d) return "";
  if (d.startsWith("84") && d.length >= 11) {
    d = "0" + d.slice(2);
  }
  if (d.length === 9 && !d.startsWith("0")) {
    d = "0" + d;
  }
  return d;
}

function chuan_hoa_mkt_so_sanh(raw) {
  const m = bo_dau_tieng_viet(String(raw || "").trim()).toUpperCase();
  if (!m || ["MKT", "MARKETER", "TEN MKT", "SALE", "KHAC", "—", "-"].includes(m)) {
    return "";
  }
  if (m.includes("THANH") || m.includes("TH.LAM") || m.includes("TH LAM")) {
    return "THANH LÂM";
  }
  if (m.includes("LAM")) return "LÂM";
  if (m.includes("PHUC")) return "PHÚC";
  if (m.includes("TAM")) return "TÂM";
  if (m.includes("SAN")) return "SAN";
  if (m.includes("DUNG")) return "DŨNG";
  return String(raw || "").trim().toUpperCase();
}

function chuan_hoa_sp_so_sanh(raw) {
  const clean = String(raw || "").trim().toUpperCase();
  if (!clean || ["DÒNG SP", "TÊN SP", "SẢN PHẨM", "MÃ SP", "MÃ", "CHƯA XÁC ĐỊNH"].includes(clean)) {
    return "";
  }
  const extracted = trich_xuat_ten_mau_thong_minh(clean);
  return extracted && extracted !== "CHƯA XÁC ĐỊNH" ? extracted : clean;
}

function parse_gia_ghi_chu_sale(raw) {
  const s = String(raw || "").trim();
  if (!s) return 0;
  const mk = s.match(/(\d+(?:[.,]\d+)?)\s*k\b/i);
  if (mk) {
    const num = parseFloat(mk[1].replace(",", "."));
    if (!Number.isNaN(num) && num > 0) return Math.round(num * 1000);
  }
  const v = parse_gia_tien(s);
  return v >= 100000 ? v : 0;
}

function build_customer_source_mkt_index() {
  const tdRows = Array.isArray(data_tong_don_upyo) ? data_tong_don_upyo : [];
  const pkOrders = Array.isArray(data_pancake_orders) ? data_pancake_orders : [];

  const sourceMktsBySdt = new Map();
  const sourceMktsByAddr = new Map();
  const unenteredCandidates = [];

  const addSourceMkt = (sdtKey, addrKey, mktNorm) => {
    if (!mktNorm) return;
    if (sdtKey) {
      if (!sourceMktsBySdt.has(sdtKey)) sourceMktsBySdt.set(sdtKey, new Set());
      sourceMktsBySdt.get(sdtKey).add(mktNorm);
    }
    if (addrKey) {
      if (!sourceMktsByAddr.has(addrKey)) sourceMktsByAddr.set(addrKey, new Set());
      sourceMktsByAddr.get(addrKey).add(mktNorm);
    }
  };

  if (tdRows.length > 0) {
    let colTg = 0;
    let colHoTen = 1;
    let colSdt = 2;
    let colMauSac = 3;
    let colDiaChi = 5;
    let colMkt = 6;
    let colDongSp = 7;
    let colSize = 10;
    let colGhiChuSale = 20;
    let colDaChot = 24;

    const headerRow = tdRows[0];
    for (let i = 0; i < headerRow.length; i++) {
      const h = bo_dau_tieng_viet(String(headerRow[i] || "").replace(/\s+/g, " ").trim()).toLowerCase();
      if (h === "ho ten") colHoTen = i;
      else if (h === "so dien thoai" || h === "sdt") colSdt = i;
      else if (h === "mau sac") colMauSac = i;
      else if (h === "dia chi") colDiaChi = i;
      else if (h === "mkt" || h === "marketer") colMkt = i;
      else if (h === "dong sp" || h === "san pham") colDongSp = i;
      else if (h === "size") colSize = i;
      else if (h === "ghi chu sale") colGhiChuSale = i;
      else if (h === "don da chot") colDaChot = i;
    }

    for (let i = 0; i < tdRows.length; i++) {
      const r = tdRows[i];
      if (!Array.isArray(r) || r.length <= Math.min(colSdt, colDiaChi)) continue;
      const tgRaw = String(r[colTg] || "").trim();
      const c0 = bo_dau_tieng_viet(tgRaw).toUpperCase();
      if (i === 0 && (c0.includes("THOI GIAN") || c0 === "STT")) continue;

      const sdtNorm = r.length > colSdt ? chuan_hoa_sdt_so_sanh(r[colSdt]) : "";
      const diaChiRaw = r.length > colDiaChi ? String(r[colDiaChi] || "").trim() : "";
      const addrKey = chuan_hoa_ten_hoac_dia_chi_trung(diaChiRaw, 3, 10);
      const mktRaw = r.length > colMkt ? String(r[colMkt] || "").trim() : "";
      const mktNorm = chuan_hoa_mkt_so_sanh(mktRaw);
      if (!mktNorm) continue;

      addSourceMkt(sdtNorm, addrKey, mktNorm);

      const chot = r.length > colDaChot ? parseInt(String(r[colDaChot] || "0").trim(), 10) || 0 : 0;
      if (chot > 0 && (sdtNorm || addrKey)) {
        const ghiChuSale = r.length > colGhiChuSale ? String(r[colGhiChuSale] || "").trim() : "";
        const giaBan = parse_gia_ghi_chu_sale(ghiChuSale);
        const mauRaw = r.length > colMauSac ? String(r[colMauSac] || "").trim().replace(/^màu\s+/i, "") : "";
        const dt = parse_datetime_vn(tgRaw);
        const dmy = dt
          ? `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`
          : (tgRaw.split(/\s+/)[0] || "");
        unenteredCandidates.push({
          sdtKey: sdtNorm,
          addrKey,
          thoi_gian: dmy,
          ngay_only: dmy,
          ma_van_don: "",
          ho_ten: r.length > colHoTen ? String(r[colHoTen] || "").trim() : "",
          sdt: sdtNorm,
          dia_chi: diaChiRaw,
          dong_sp: r.length > colDongSp ? String(r[colDongSp] || "").trim().toUpperCase() : "",
          mau_sac: mauRaw.toUpperCase(),
          size: r.length > colSize ? String(r[colSize] || "").trim() : "",
          gia_ban: giaBan,
          gia_ban_str: giaBan > 0 ? format_tien_vnd(giaBan) : "",
          nen_tang: "LANDING PAGE",
          sale: "",
          mkt: mktNorm,
          so_luong: "1",
          so_luong_num: 1,
        });
      }
    }
  }

  for (const pk of pkOrders) {
    const mktNorm = chuan_hoa_mkt_so_sanh(pk.mktSheet || pk.mkt);
    if (!mktNorm) continue;
    const addrKey = chuan_hoa_ten_hoac_dia_chi_trung(pk.diaChi, 3, 10);
    const phones = Array.isArray(pk.phones) ? pk.phones : [];
    for (const ph of phones) {
      addSourceMkt(chuan_hoa_sdt_so_sanh(ph), addrKey, mktNorm);
    }
    if (phones.length === 0 && addrKey) {
      addSourceMkt("", addrKey, mktNorm);
    }
    const primaryPhone = phones.length > 0 ? chuan_hoa_sdt_so_sanh(phones[0]) : "";
    if (primaryPhone || addrKey) {
      unenteredCandidates.push({
        sdtKey: primaryPhone,
        addrKey,
        thoi_gian: pk.dmy || pk.ymd,
        ngay_only: pk.dmy || pk.ymd,
        ma_van_don: pk.pkeCode || "",
        ho_ten: pk.hoTen || pk.custName || "",
        sdt: primaryPhone,
        dia_chi: pk.diaChi || "",
        dong_sp: pk.dongSp || "",
        mau_sac: pk.mauSac || "",
        size: pk.size || "",
        gia_ban: pk.giaBan || 0,
        gia_ban_str: pk.giaBan > 0 ? format_tien_vnd(pk.giaBan) : "",
        nen_tang: "PANCAKE",
        sale: pk.sale || "",
        mkt: mktNorm,
        so_luong: String(pk.soLuong || 1),
        so_luong_num: pk.soLuong || 1,
      });
    }
  }

  const getSourceMkts = (sdt, addr) => {
    const out = new Set();
    const sdtKey = chuan_hoa_sdt_so_sanh(sdt);
    const addrKey = chuan_hoa_ten_hoac_dia_chi_trung(addr, 3, 10);
    if (sdtKey && sourceMktsBySdt.has(sdtKey)) {
      sourceMktsBySdt.get(sdtKey).forEach((m) => out.add(m));
    }
    if (addrKey && sourceMktsByAddr.has(addrKey)) {
      sourceMktsByAddr.get(addrKey).forEach((m) => out.add(m));
    }
    return out;
  };

  return {
    sourceMktsBySdt,
    sourceMktsByAddr,
    unenteredCandidates,
    getSourceMkts,
    isMultiSourceMkt: (sdt, addr) => getSourceMkts(sdt, addr).size >= 2,
  };
}

function lay_danh_sach_don_landing_loi_mkt(mode = "missing", cachedSrcIdx = null, cachedDupRowNums = null) {
  const isWrongMktMode = mode === "wrong_mkt";
  const thList = Array.isArray(current_od_raw_list) ? current_od_raw_list : [];
  const tdRows = Array.isArray(data_tong_don_upyo) ? data_tong_don_upyo : [];

  const srcIdx = cachedSrcIdx || build_customer_source_mkt_index();
  const dupMktRowNums = cachedDupRowNums || new Set(lay_danh_sach_don_trung_mkt(srcIdx).map((r) => r.row_num));

  const thBySdt = new Map();
  for (const o of thList) {
    const sdtKey = chuan_hoa_sdt_so_sanh(o.sdt || o.parent_sdt);
    if (!sdtKey) continue;
    if (!thBySdt.has(sdtKey)) thBySdt.set(sdtKey, []);
    thBySdt.get(sdtKey).push(o);
  }

  let colTg = 0;
  let colHoTen = 1;
  let colSdt = 2;
  let colMauSac = 3;
  let colDiaChi = 5;
  let colMkt = 6;
  let colDongSp = 7;
  let colSize = 10;
  let colGhiChuSale = 20;
  let colDaChot = 24;

  if (tdRows.length > 0) {
    const headerRow = tdRows[0];
    for (let i = 0; i < headerRow.length; i++) {
      const h = bo_dau_tieng_viet(String(headerRow[i] || "").replace(/\s+/g, " ").trim()).toLowerCase();
      if (h === "ho ten") colHoTen = i;
      else if (h === "so dien thoai" || h === "sdt") colSdt = i;
      else if (h === "mau sac") colMauSac = i;
      else if (h === "dia chi") colDiaChi = i;
      else if (h === "mkt" || h === "marketer") colMkt = i;
      else if (h === "dong sp" || h === "san pham") colDongSp = i;
      else if (h === "size") colSize = i;
      else if (h === "ghi chu sale") colGhiChuSale = i;
      else if (h === "don da chot") colDaChot = i;
    }
  }

  const results = [];
  const addedThRowNums = new Set();
  const matchedValidThRowNums = new Set();
  const tdRecords = [];
  const tdRecordsBySdt = new Map();
  const tdMktsBySdt = new Map();
  const tdMktsByAddr = new Map();

  const getDiffDays = (ymdA, ymdB) => {
    if (!ymdA || !ymdB) return null;
    return Math.abs(parse_ymd_date(ymdA).getTime() - parse_ymd_date(ymdB).getTime()) / 86400000;
  };
  const getSignedDays = (thYmd, tdYmd) => {
    if (!thYmd || !tdYmd) return null;
    return (parse_ymd_date(thYmd).getTime() - parse_ymd_date(tdYmd).getTime()) / 86400000;
  };
  // Sale có thể chốt và điền vào ĐƠN TỔNG HỢP sau ngày khách đặt Landing nhiều ngày (ví dụ 12/11 -> 16/11)
  const isThMatchedWindow = (thYmd, tdYmd) => {
    const signed = getSignedDays(thYmd, tdYmd);
    return signed === null || (signed >= -2 && signed <= 14);
  };

  for (let i = 0; i < tdRows.length; i++) {
    const r = tdRows[i];
    if (!Array.isArray(r) || r.length <= Math.min(colSdt, colDiaChi)) continue;
    const tgRaw = String(r[colTg] || "").trim();
    const c0 = bo_dau_tieng_viet(tgRaw).toUpperCase();
    if (i === 0 && (c0.includes("THOI GIAN") || c0 === "STT")) continue;

    const sdtNorm = r.length > colSdt ? chuan_hoa_sdt_so_sanh(r[colSdt]) : "";
    const diaChiRaw = r.length > colDiaChi ? String(r[colDiaChi] || "").trim() : "";
    const addrKey = chuan_hoa_ten_hoac_dia_chi_trung(diaChiRaw, 3, 10);
    const mktTdRaw = r.length > colMkt ? String(r[colMkt] || "").trim() : "";
    const mktTdNorm = chuan_hoa_mkt_so_sanh(mktTdRaw);

    if (mktTdNorm) {
      if (sdtNorm) {
        if (!tdMktsBySdt.has(sdtNorm)) tdMktsBySdt.set(sdtNorm, new Set());
        tdMktsBySdt.get(sdtNorm).add(mktTdNorm);
      }
      if (addrKey) {
        if (!tdMktsByAddr.has(addrKey)) tdMktsByAddr.set(addrKey, new Set());
        tdMktsByAddr.get(addrKey).add(mktTdNorm);
      }
    }

    if (!sdtNorm) continue;

    let ymd = "";
    let dmy = "";
    let timeMs = 0;
    const dt = parse_datetime_vn(tgRaw);
    if (dt) {
      timeMs = dt.getTime();
      ymd = format_ymd_date(dt);
      const dd = String(dt.getDate()).padStart(2, "0");
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      dmy = `${dd}/${mm}/${dt.getFullYear()}`;
    } else {
      const token = tgRaw.split(/\s+/)[0] || "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
        ymd = token;
        const p = token.split("-");
        dmy = `${p[2]}/${p[1]}/${p[0]}`;
      } else {
        dmy = token;
        ymd = parse_order_ymd({ ngay_only: token });
      }
      if (ymd) timeMs = parse_ymd_date(ymd).getTime();
    }

    const chot = r.length > colDaChot ? parseInt(String(r[colDaChot] || "0").trim(), 10) || 0 : 0;
    const dongSpRaw = r.length > colDongSp ? String(r[colDongSp] || "").trim().toUpperCase() : "";
    const rec = {
      rowIdx: i,
      r,
      tgRaw,
      ymd,
      dmy,
      timeMs,
      sdtNorm,
      mktRaw: mktTdRaw,
      mktNorm: mktTdNorm,
      dongSp: dongSpRaw,
      spNorm: chuan_hoa_sp_so_sanh(dongSpRaw),
      chot,
    };
    tdRecords.push(rec);
    if (!tdRecordsBySdt.has(sdtNorm)) tdRecordsBySdt.set(sdtNorm, []);
    tdRecordsBySdt.get(sdtNorm).push(rec);
  }

  // Loại bỏ khách đặt >= 2 MKT (ở ĐƠN TỔNG HỢP, TỔNG ĐƠN UPYO hoặc PANCAKE) khỏi Lỗi vào đơn -> đưa vào Đơn trùng MKT
  const laDonBiTrung = (row) => {
    if (!row) return false;
    if (dupMktRowNums && dupMktRowNums.has(row.row_num)) return true;
    const tt = bo_dau_tieng_viet(String(row.trang_thai || "")).toUpperCase();
    if (tt.includes("TRUNG")) return true;

    const sdtVal = row.sdt || row.parent_sdt || "";
    const addrVal = row.dia_chi || row.parent_dia_chi || "";
    if (srcIdx.isMultiSourceMkt(sdtVal, addrVal)) return true;

    if (!isWrongMktMode) return false;
    const sdtNorm = chuan_hoa_sdt_so_sanh(sdtVal);
    const addrKey = chuan_hoa_ten_hoac_dia_chi_trung(addrVal, 3, 10);
    const tdMkts = new Set();
    if (sdtNorm && tdMktsBySdt.has(sdtNorm)) {
      tdMktsBySdt.get(sdtNorm).forEach((m) => tdMkts.add(m));
    }
    if (addrKey && tdMktsByAddr.has(addrKey)) {
      tdMktsByAddr.get(addrKey).forEach((m) => tdMkts.add(m));
    }
    return tdMkts.size !== 1;
  };

  // Nếu có form chưa chốt trước đó <= 7 ngày CÙNG SP -> tính cho người đầu tiên; nếu đổi SP -> tính cho người đặt sau
  const getValidMktsForClosedRec = (rec) => {
    const valid = new Set();
    const allForSdt = tdRecordsBySdt.get(rec.sdtNorm) || [];
    const earlierSameSpUnclosed = allForSdt
      .filter((e) => {
        if (!e.mktNorm || e.rowIdx === rec.rowIdx || e.chot > 0) return false;
        if (!e.spNorm || !rec.spNorm || e.spNorm !== rec.spNorm) return false;
        if (rec.timeMs && e.timeMs) {
          const diffMs = rec.timeMs - e.timeMs;
          return diffMs >= 0 && diffMs <= 7 * 86400 * 1000;
        }
        const diff = getDiffDays(rec.ymd, e.ymd);
        return diff !== null && diff <= 7;
      })
      .sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));

    const preferredMkt = earlierSameSpUnclosed.length > 0 ? earlierSameSpUnclosed[0].mktNorm : rec.mktNorm;
    if (preferredMkt) valid.add(preferredMkt);
    return { valid, preferredMkt };
  };

  let syntheticId = 900000;
  for (const rec of tdRecords) {
    if (rec.chot <= 0) continue;

    const { valid: validMkts, preferredMkt } = getValidMktsForClosedRec(rec);
    const candidates = thBySdt.get(rec.sdtNorm) || [];
    const candidatesInWindow = candidates.filter((o) => isThMatchedWindow(parse_order_ymd(o), rec.ymd));

    if (candidatesInWindow.length === 0) {
      if (!isWrongMktMode && !srcIdx.isMultiSourceMkt(rec.sdtNorm, rec.r && rec.r.length > colDiaChi ? rec.r[colDiaChi] : "")) {
        // Đơn đã chốt bên TỔNG ĐƠN UPYO nhưng chưa điền sang bảng ĐƠN TỔNG HỢP
        const r = rec.r;
        const ghiChuSale = r.length > colGhiChuSale ? String(r[colGhiChuSale] || "").trim() : "";
        const giaBan = parse_gia_ghi_chu_sale(ghiChuSale);
        const mauRaw = r.length > colMauSac ? String(r[colMauSac] || "").trim().replace(/^màu\s+/i, "") : "";
        syntheticId += 1;
        results.push({
          row_num: syntheticId,
          group_id: syntheticId,
          thoi_gian: rec.dmy || rec.tgRaw,
          ngay_only: rec.dmy || rec.ymd,
          ma_van_don: "",
          ho_ten: r.length > colHoTen ? String(r[colHoTen] || "").trim() : "",
          sdt: rec.sdtNorm,
          dia_chi: r.length > colDiaChi ? String(r[colDiaChi] || "").trim() : "",
          dong_sp: rec.dongSp,
          mau_sac: mauRaw.toUpperCase(),
          size: r.length > colSize ? String(r[colSize] || "").trim() : "",
          gia_ban: giaBan,
          gia_ban_str: giaBan > 0 ? format_tien_vnd(giaBan) : "",
          phi_ship: 0,
          phi_ship_str: "",
          nen_tang: "LANDING PAGE",
          sale: "",
          mkt: preferredMkt || rec.mktRaw || "CHƯA RÕ",
          mkt_raw: rec.mktRaw,
          trang_thai: "CHƯA VÀO BẢNG TH",
          so_luong: "1",
          so_luong_num: 1,
          ghi_chu: ghiChuSale ? `Chưa vào bảng TH (${ghiChuSale})` : "Chưa điền vào bảng Đơn Tổng Hợp",
        });
      }
      continue;
    }

    // Nếu trong cửa sổ ngày đã có dòng khớp MKT (bao gồm MKT đặt lần đầu tiên trước đó) thì hợp lệ
    const exactMatched = candidatesInWindow.filter((o) => {
      const mktThNorm = chuan_hoa_mkt_so_sanh(o.mkt);
      return validMkts.size > 0 ? validMkts.has(mktThNorm) : Boolean(mktThNorm);
    });
    if (exactMatched.length > 0) {
      exactMatched.forEach((o) => matchedValidThRowNums.add(o.row_num));
      continue;
    }

    for (const mRow of candidatesInWindow) {
      if (addedThRowNums.has(mRow.row_num) || matchedValidThRowNums.has(mRow.row_num)) continue;
      const mktThNorm = chuan_hoa_mkt_so_sanh(mRow.mkt);
      if (!isWrongMktMode) {
        if (!mktThNorm && !laDonBiTrung(mRow)) {
          addedThRowNums.add(mRow.row_num);
          results.push({
            ...mRow,
            mkt: preferredMkt ? `CHƯA ĐIỀN (Đúng: ${preferredMkt})` : "CHƯA ĐIỀN MKT",
            trang_thai: mRow.trang_thai || "CHƯA ĐIỀN MKT",
            ghi_chu: [mRow.ghi_chu, preferredMkt ? `MKT đúng: ${preferredMkt}` : "Chưa điền MKT"].filter(Boolean).join(" • "),
          });
        }
      } else if (mktThNorm && validMkts.size > 0 && !validMkts.has(mktThNorm) && !laDonBiTrung(mRow)) {
        addedThRowNums.add(mRow.row_num);
        results.push({
          ...mRow,
          mkt: `${mRow.mkt} (Đúng: ${preferredMkt})`,
          trang_thai: mRow.trang_thai ? `${mRow.trang_thai} • SAI MKT` : "SAI MKT",
          ghi_chu: [mRow.ghi_chu, `Sai MKT (Tổng đơn: ${preferredMkt})`].filter(Boolean).join(" • "),
        });
      }
    }
  }

  // Kiểm tra thêm các dòng trong ĐƠN TỔNG HỢP có Nền tảng LANDING PAGE (hoặc ZALO / KHÁCH NGOÀI chưa điền MKT mà từng đặt Landing)
  for (const o of thList) {
    if (addedThRowNums.has(o.row_num) || matchedValidThRowNums.has(o.row_num)) continue;
    const hasCust = Boolean(o.ma_van_don || o.ho_ten || o.sdt || o.dia_chi);
    if (!hasCust) continue;

    const ntUpper = String(o.nen_tang || "").trim().toUpperCase();
    const sdtNorm = chuan_hoa_sdt_so_sanh(o.sdt || o.parent_sdt);
    const oYmd = parse_order_ymd(o);
    const allTdForSdt = sdtNorm ? (tdRecordsBySdt.get(sdtNorm) || []) : [];
    const tdInWindow = allTdForSdt
      .filter((rec) => isThMatchedWindow(oYmd, rec.ymd))
      .sort((a, b) => (getDiffDays(oYmd, a.ymd) ?? 999) - (getDiffDays(oYmd, b.ymd) ?? 999));

    const isZaloOutside = is_zalo_or_outside_platform(o.nen_tang);
    const isLandingRow = ntUpper.includes("LANDING") || (!ntUpper && tdInWindow.length > 0);
    const mktThNorm = chuan_hoa_mkt_so_sanh(o.mkt);

    if (isWrongMktMode) {
      // Nút "Đơn sai MKT": chỉ lọc đơn KHÔNG trùng nhưng đã điền sai MKT
      if (!mktThNorm || laDonBiTrung(o) || !isLandingRow) continue;
      if (tdInWindow.some((rec) => Boolean(rec.mktNorm))) {
        const closestWithMkt = tdInWindow.find((rec) => Boolean(rec.mktNorm)) || null;
        const hintMkt = closestWithMkt ? getValidMktsForClosedRec(closestWithMkt).preferredMkt : "";
        const hasAnyMatchingMkt = tdInWindow.some((rec) => getValidMktsForClosedRec(rec).valid.has(mktThNorm));
        if (!hasAnyMatchingMkt && hintMkt) {
          addedThRowNums.add(o.row_num);
          results.push({
            ...o,
            mkt: `${o.mkt} (Đúng: ${hintMkt})`,
            trang_thai: o.trang_thai ? `${o.trang_thai} • SAI MKT` : "SAI MKT",
            ghi_chu: [o.ghi_chu, `Sai MKT (Tổng đơn: ${hintMkt})`].filter(Boolean).join(" • "),
          });
        }
      }
      continue;
    }

    // Chỉ lọc đơn điền thiếu MKT (loại đơn khách đặt >= 2 MKT)
    if (mktThNorm || laDonBiTrung(o)) continue;

    if (isZaloOutside) {
      const firstLanding = tim_mkt_landing_dau_tien_theo_sdt(sdtNorm, oYmd);
      if (firstLanding) {
        addedThRowNums.add(o.row_num);
        results.push({
          ...o,
          mkt: `CHƯA ĐIỀN (Đúng: ${firstLanding.mktSheet})`,
          trang_thai: o.trang_thai || "CHƯA ĐIỀN MKT",
          ghi_chu: [o.ghi_chu, `Từng đặt Landing • MKT đầu tiên: ${firstLanding.mktSheet}`].filter(Boolean).join(" • "),
        });
      }
      continue;
    }

    if (!isLandingRow) continue;

    const closestWithMkt = tdInWindow.find((rec) => Boolean(rec.mktNorm)) || null;
    const firstLandingHint = tim_mkt_landing_dau_tien_theo_sdt(sdtNorm, oYmd);
    const hintMkt = closestWithMkt
      ? getValidMktsForClosedRec(closestWithMkt).preferredMkt
      : (firstLandingHint ? firstLandingHint.mktSheet : "");

    addedThRowNums.add(o.row_num);
    results.push({
      ...o,
      mkt: hintMkt ? `CHƯA ĐIỀN (Đúng: ${hintMkt})` : "CHƯA ĐIỀN MKT",
      trang_thai: o.trang_thai || "CHƯA ĐIỀN MKT",
      ghi_chu: [o.ghi_chu, hintMkt ? `MKT đúng: ${hintMkt}` : "Chưa điền MKT"].filter(Boolean).join(" • "),
    });
  }

  return results;
}

function lay_danh_sach_don_sai_mkt(cachedSrcIdx = null, cachedDupRowNums = null) {
  return lay_danh_sach_don_landing_loi_mkt("wrong_mkt", cachedSrcIdx, cachedDupRowNums);
}

function lay_danh_sach_don_khong_mkt(cachedSrcIdx = null, cachedDupRowNums = null) {
  const list = Array.isArray(current_od_raw_list) ? current_od_raw_list : [];
  const srcIdx = cachedSrcIdx || build_customer_source_mkt_index();
  const dupMktRowNums = cachedDupRowNums || new Set(lay_danh_sach_don_trung_mkt(srcIdx).map((r) => r.row_num));
  const mktByGroup = new Map();
  for (const o of list) {
    const gid = o.group_id || o.row_num;
    const mNorm = chuan_hoa_mkt_so_sanh(o.mkt);
    if (mNorm && !mktByGroup.has(gid)) mktByGroup.set(gid, mNorm);
  }

  const results = [];
  for (const o of list) {
    const gid = o.group_id || o.row_num;
    if (chuan_hoa_mkt_so_sanh(o.mkt) || mktByGroup.has(gid)) continue;
    if (dupMktRowNums.has(o.row_num)) continue;

    const ttNoDau = bo_dau_tieng_viet(String(o.trang_thai || "")).toUpperCase();
    if (ttNoDau.includes("HUY") || ttNoDau.includes("TRUNG") || ttNoDau.includes("TEST")) continue;

    const sdt = o.sdt || o.parent_sdt || "";
    const addr = o.dia_chi || o.parent_dia_chi || "";
    if (!sdt && !addr) continue;
    if (srcIdx.isMultiSourceMkt(sdt, addr)) continue;

    const firstMkt = tim_mkt_dau_tien_cua_khach(sdt, addr, parse_order_ymd(o), o.row_num);
    if (!firstMkt) continue;

    results.push({
      ...o,
      mkt: `CHƯA ĐIỀN (Tính: ${firstMkt.mktSheet})`,
      ghi_chu: [o.ghi_chu, `Từng đặt trước đó • Tính cho MKT đầu tiên: ${firstMkt.mktSheet}`].filter(Boolean).join(" • "),
    });
  }

  results.sort((a, b) => ((b.group_id || b.row_num || 0) - (a.group_id || a.row_num || 0)) || ((a.row_num || 0) - (b.row_num || 0)));
  return results;
}

function lay_danh_sach_don_pancake_loi_mkt(cachedSrcIdx = null, cachedDupRowNums = null) {
  const thList = Array.isArray(current_od_raw_list) ? current_od_raw_list : [];
  const pkOrders = Array.isArray(data_pancake_orders) ? data_pancake_orders : [];
  if (pkOrders.length === 0) return [];

  const srcIdx = cachedSrcIdx || build_customer_source_mkt_index();
  const dupMktRowNums = cachedDupRowNums || new Set(lay_danh_sach_don_trung_mkt(srcIdx).map((r) => r.row_num));
  const thBySdt = new Map();
  const thByMvd = new Map();
  for (const o of thList) {
    const sdtKey = chuan_hoa_sdt_so_sanh(o.sdt || o.parent_sdt);
    if (sdtKey) {
      if (!thBySdt.has(sdtKey)) thBySdt.set(sdtKey, []);
      thBySdt.get(sdtKey).push(o);
    }
    const mvd = String(o.ma_van_don || o.parent_ma_van_don || "").trim().toUpperCase();
    if (mvd && mvd !== "-" && mvd !== "—") {
      if (!thByMvd.has(mvd)) thByMvd.set(mvd, []);
      thByMvd.get(mvd).push(o);
    }
  }

  const getSignedDays = (thYmd, pkYmd) => {
    if (!thYmd || !pkYmd) return null;
    return (parse_ymd_date(thYmd).getTime() - parse_ymd_date(pkYmd).getTime()) / 86400000;
  };
  const isMatchedWindow = (thYmd, pkYmd, isDraft = false) => {
    const signed = getSignedDays(thYmd, pkYmd);
    if (signed === null) return true;
    const minDays = isDraft ? -30 : -2;
    return signed >= minDays && signed <= 14;
  };

  const results = [];
  const addedThRowNums = new Set();
  const addedSyntheticKeys = new Set();
  let syntheticId = 950000;

  for (const pk of pkOrders) {
    const expectedNorm = chuan_hoa_mkt_so_sanh(pk.mkt);
    const pkPrimaryPh = Array.isArray(pk.phones) && pk.phones.length > 0 ? pk.phones[0] : "";
    if (srcIdx.isMultiSourceMkt(pkPrimaryPh, pk.diaChi)) continue;
    const matchedMap = new Map();

    if (pk.pkeCode && thByMvd.has(pk.pkeCode)) {
      for (const o of thByMvd.get(pk.pkeCode)) matchedMap.set(o.row_num, o);
    }
    if (matchedMap.size === 0) {
      for (const ph of pk.phones) {
        const listForPh = thBySdt.get(ph) || [];
        for (const o of listForPh) {
          if (isMatchedWindow(parse_order_ymd(o), pk.ymd, Boolean(pk.isDraftTagOrder))) {
            matchedMap.set(o.row_num, o);
          }
        }
      }
    }

    const matchedRows = Array.from(matchedMap.values());
    if (matchedRows.length === 0) {
      const dedupKey = pk.pkeCode || `${pk.convId}|${pk.ymd}`;
      if (addedSyntheticKeys.has(dedupKey)) continue;
      addedSyntheticKeys.add(dedupKey);
      syntheticId += 1;
      const qtyVal = pk.soLuong || 1;
      const primarySdt = pk.phones[0] || "";
      const extraOrderPhones = (Array.isArray(pk.orderLinkedPhones) ? pk.orderLinkedPhones : []).filter((p) => p && p !== primarySdt);
      const orderPhoneNote = extraOrderPhones.length > 0 ? ` • SĐT đơn Pancake: ${extraOrderPhones.join(", ")}` : "";
      const badPhoneNote = pk.hasInvalidPhone && primarySdt ? ` • SĐT thiếu/lệch: ${primarySdt}` : "";
      results.push({
        row_num: syntheticId,
        group_id: syntheticId,
        thoi_gian: pk.dmy || pk.ymd,
        ngay_only: pk.dmy || pk.ymd,
        ma_van_don: pk.pkeCode || "",
        ho_ten: pk.hoTen || pk.custName || "",
        sdt: primarySdt,
        dia_chi: pk.diaChi || "",
        dong_sp: pk.dongSp || "",
        mau_sac: pk.mauSac || "",
        size: pk.size || "",
        gia_ban: pk.giaBan || 0,
        gia_ban_str: pk.giaBan > 0 ? format_tien_vnd(pk.giaBan) : "",
        phi_ship: 0,
        phi_ship_str: "",
        nen_tang: "PANCAKE",
        sale: pk.sale || "",
        mkt: pk.mktSheet || pk.mkt,
        trang_thai: pk.isDraftTagOrder ? "CHƯA XÁC NHẬN POS" : "CHƯA VÀO BẢNG TH",
        so_luong: String(qtyVal),
        so_luong_num: qtyVal,
        ghi_chu: (pk.pkeCode
          ? `Pancake Page ${pk.mktSheet} (${pk.pkeCode}) chưa vào bảng TH`
          : pk.hasReceipt
          ? `Đơn POS trên Pancake Page ${pk.mktSheet} nhưng chưa vào bảng TH`
          : pk.isDraftTagOrder
          ? `Đơn Mới / Tag Mua hàng trên Pancake Page ${pk.mktSheet} chưa xác nhận vào bảng TH`
          : `Khách chốt trên Pancake Page ${pk.mktSheet} nhưng chưa vào bảng TH`) + orderPhoneNote + badPhoneNote,
      });
      continue;
    }

    // Không can thiệp các đơn đã đánh dấu LANDING PAGE (đã kiểm tra theo TỔNG ĐƠN UPYO)
    const hasLanding = matchedRows.some((o) => String(o.nen_tang || "").toUpperCase().includes("LANDING"));
    if (hasLanding) continue;

    const hasValidMkt = matchedRows.some((o) => chuan_hoa_mkt_so_sanh(o.mkt) === expectedNorm);
    if (hasValidMkt) continue;

    for (const mRow of matchedRows) {
      if (addedThRowNums.has(mRow.row_num)) continue;
      const ttNoDau = bo_dau_tieng_viet(String(mRow.trang_thai || "")).toUpperCase();
      if (ttNoDau.includes("HUY") || ttNoDau.includes("TRUNG") || ttNoDau.includes("TEST")) continue;

      const mktThNorm = chuan_hoa_mkt_so_sanh(mRow.mkt);
      const isDupCustomer = dupMktRowNums.has(mRow.row_num) || srcIdx.isMultiSourceMkt(mRow.sdt || mRow.parent_sdt, mRow.dia_chi || mRow.parent_dia_chi);
      if (isDupCustomer) continue;
      if (!mktThNorm) {
        addedThRowNums.add(mRow.row_num);
        results.push({
          ...mRow,
          mkt: `CHƯA ĐIỀN (Đúng: ${pk.mktSheet})`,
          trang_thai: mRow.trang_thai || "CHƯA ĐIỀN MKT",
          ghi_chu: [mRow.ghi_chu, `Pancake Page ${pk.mktSheet} • MKT đúng: ${pk.mktSheet}`].filter(Boolean).join(" • "),
        });
      } else if (mktThNorm !== expectedNorm) {
        addedThRowNums.add(mRow.row_num);
        results.push({
          ...mRow,
          mkt: `${mRow.mkt} (Đúng: ${pk.mktSheet})`,
          trang_thai: mRow.trang_thai ? `${mRow.trang_thai} • SAI MKT` : "SAI MKT",
          ghi_chu: [mRow.ghi_chu, `Sai MKT (Pancake Page: ${pk.mktSheet})`].filter(Boolean).join(" • "),
        });
      }
    }
  }

  return results;
}

function lay_danh_sach_don_loi_vao_don() {
  const byRowNum = new Map();
  const srcIdx = build_customer_source_mkt_index();
  const dupMktRowNums = new Set(lay_danh_sach_don_trung_mkt(srcIdx).map((r) => r.row_num));

  // 1. Đơn sai MKT (không trùng)
  for (const row of lay_danh_sach_don_sai_mkt(srcIdx, dupMktRowNums)) {
    byRowNum.set(row.row_num, row);
  }

  // 2. Đơn điền thiếu (Chưa vào bảng TH + thiếu MKT Landing / Zalo / Khách ngoài)
  for (const row of lay_danh_sach_don_landing_loi_mkt("missing", srcIdx, dupMktRowNums)) {
    if (!byRowNum.has(row.row_num)) {
      byRowNum.set(row.row_num, row);
    }
  }

  // 3. Đơn không điền MKT nhưng từng đặt của 1 MKT trước đó (bổ sung gợi ý nếu thiếu hoặc chưa nằm trong list)
  for (const row of lay_danh_sach_don_khong_mkt(srcIdx, dupMktRowNums)) {
    const existing = byRowNum.get(row.row_num);
    if (!existing || existing.mkt === "CHƯA ĐIỀN MKT") {
      byRowNum.set(row.row_num, row);
    }
  }

  // 4. Đối chiếu đơn chốt trên Pancake Page (POS + Hỏa tốc)
  for (const row of lay_danh_sach_don_pancake_loi_mkt(srcIdx, dupMktRowNums)) {
    const existing = byRowNum.get(row.row_num);
    if (!existing || existing.mkt === "CHƯA ĐIỀN MKT") {
      byRowNum.set(row.row_num, row);
    }
  }

  return Array.from(byRowNum.values())
    .filter((row) => !dupMktRowNums.has(row.row_num) && !srcIdx.isMultiSourceMkt(row.sdt || row.parent_sdt, row.dia_chi || row.parent_dia_chi))
    .sort((a, b) => {
      const ya = parse_order_ymd(a) || "";
      const yb = parse_order_ymd(b) || "";
      if (ya !== yb) return yb.localeCompare(ya);
      return ((b.group_id || b.row_num || 0) - (a.group_id || a.row_num || 0)) || ((a.row_num || 0) - (b.row_num || 0));
    });
}

function chuan_hoa_ten_hoac_dia_chi_trung(raw, minWords, minLen) {
  const norm = bo_dau_tieng_viet(String(raw || "").trim())
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!norm || norm.length < minLen) return "";
  const words = norm.split(" ").filter(Boolean);
  if (words.length < minWords) return "";
  return norm;
}

function lay_danh_sach_don_trung_mkt(cachedSrcIdx = null) {
  const list = Array.isArray(current_od_raw_list) ? current_od_raw_list : [];
  const srcIdx = cachedSrcIdx || build_customer_source_mkt_index();
  const custRows = [];
  const rowsByGroupId = new Map();
  const matchedThSdt = new Set();
  const matchedThAddr = new Set();

  for (const o of list) {
    const gid = o.group_id || o.row_num;
    if (!rowsByGroupId.has(gid)) rowsByGroupId.set(gid, []);
    rowsByGroupId.get(gid).push(o);

    const hasCust = Boolean(o.sdt || o.dia_chi);
    if (!hasCust) continue;

    const mktDash = chuan_hoa_mkt_dashboard(o.mkt);
    const sdtRaw = chuan_hoa_sdt_so_sanh(o.sdt);
    const sdtKey = sdtRaw.length >= 9 && !/^0+$/.test(sdtRaw) ? sdtRaw : "";
    const addrKey = chuan_hoa_ten_hoac_dia_chi_trung(o.dia_chi, 3, 10);

    if (sdtKey) matchedThSdt.add(sdtKey);
    if (addrKey) matchedThAddr.add(addrKey);
    if (!sdtKey && !addrKey) continue;
    custRows.push({ o, mktDash, sdtKey, addrKey });
  }

  const results = [];
  const addedRowNums = new Set();
  const n = custRows.length;

  if (n > 0) {
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x) => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const union = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };

    const bySdt = new Map();
    const byAddr = new Map();

    for (let i = 0; i < n; i++) {
      const item = custRows[i];
      if (item.sdtKey) {
        if (bySdt.has(item.sdtKey)) union(bySdt.get(item.sdtKey), i);
        else bySdt.set(item.sdtKey, i);
      }
      if (item.addrKey) {
        if (byAddr.has(item.addrKey)) union(byAddr.get(item.addrKey), i);
        else byAddr.set(item.addrKey, i);
      }
    }

    const comps = new Map();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!comps.has(root)) comps.set(root, []);
      comps.get(root).push(custRows[i]);
    }

    const conflictComps = [];
    comps.forEach((items) => {
      const distinctMkts = new Set();
      const distinctSrcMkts = new Set();
      for (const it of items) {
        if (it.mktDash && it.mktDash !== "KHÁC") {
          distinctMkts.add(it.mktDash);
        }
        srcIdx.getSourceMkts(it.sdtKey, it.addrKey).forEach((m) => distinctSrcMkts.add(m));
      }
      const isThDup = items.length >= 2 && distinctMkts.size >= 2;
      const isSrcDup = distinctSrcMkts.size >= 2;
      if (!isThDup && !isSrcDup) return;

      const sdtCounts = new Map();
      const addrCounts = new Map();
      let maxRowNum = 0;
      for (const it of items) {
        if ((it.o.row_num || 0) > maxRowNum) maxRowNum = it.o.row_num || 0;
        if (it.sdtKey) sdtCounts.set(it.sdtKey, (sdtCounts.get(it.sdtKey) || 0) + 1);
        if (it.addrKey) addrCounts.set(it.addrKey, (addrCounts.get(it.addrKey) || 0) + 1);
      }

      const combinedMkts = new Set([...distinctMkts, ...distinctSrcMkts]);
      let reasonStr = "Khách đặt nhiều MKT";
      if (isThDup) {
        const matchTypes = [];
        if (Array.from(sdtCounts.values()).some((c) => c > 1)) matchTypes.push("SĐT");
        if (Array.from(addrCounts.values()).some((c) => c > 1)) matchTypes.push("Địa chỉ");
        reasonStr = matchTypes.length > 0 ? `Trùng ${matchTypes.join(", ")}` : "Trùng khách";
      }
      const dupMktArr = Array.from(isThDup && !isSrcDup ? distinctMkts : combinedMkts);
      const mktsList = dupMktArr.join(" / ");

      conflictComps.push({ items, maxRowNum, reasonStr, mktsList, dupMktArr });
    });

    conflictComps.sort((a, b) => b.maxRowNum - a.maxRowNum);

    for (const comp of conflictComps) {
      const sortedItems = comp.items.slice().sort((a, b) => (b.o.row_num || 0) - (a.o.row_num || 0));
      for (const it of sortedItems) {
        const gid = it.o.group_id || it.o.row_num;
        const groupRows = rowsByGroupId.get(gid) || [it.o];
        for (const rowObj of groupRows) {
          if (addedRowNums.has(rowObj.row_num)) continue;
          addedRowNums.add(rowObj.row_num);
          const dupTag = `${comp.reasonStr} (${comp.mktsList})`;
          results.push({
            ...rowObj,
            _dup_mkt_list: comp.dupMktArr,
            ghi_chu: [rowObj.ghi_chu, dupTag].filter(Boolean).join(" • "),
          });
        }
      }
    }
  }

  // Bổ sung các khách đặt >= 2 MKT ở TỔNG ĐƠN UPYO / PANCAKE nhưng chưa có dòng nào trong ĐƠN TỔNG HỢP
  let synthDupId = 980000;
  const seenSynthCust = new Set();
  for (const cand of srcIdx.unenteredCandidates) {
    if ((cand.sdtKey && matchedThSdt.has(cand.sdtKey)) || (cand.addrKey && matchedThAddr.has(cand.addrKey))) {
      continue;
    }
    const srcMkts = srcIdx.getSourceMkts(cand.sdtKey, cand.addrKey);
    if (srcMkts.size < 2) continue;
    const dedupKey = `${cand.sdtKey || cand.addrKey}|${cand.mkt}|${cand.dong_sp}`;
    if (seenSynthCust.has(dedupKey)) continue;
    seenSynthCust.add(dedupKey);
    synthDupId += 1;
    const dupMktArr = Array.from(srcMkts);
    const mktsList = dupMktArr.join(" / ");
    results.push({
      row_num: synthDupId,
      group_id: synthDupId,
      thoi_gian: cand.thoi_gian,
      ngay_only: cand.ngay_only,
      ma_van_don: cand.ma_van_don,
      ho_ten: cand.ho_ten,
      sdt: cand.sdt,
      dia_chi: cand.dia_chi,
      dong_sp: cand.dong_sp,
      mau_sac: cand.mau_sac,
      size: cand.size,
      gia_ban: cand.gia_ban,
      gia_ban_str: cand.gia_ban_str,
      phi_ship: 0,
      phi_ship_str: "",
      nen_tang: cand.nen_tang,
      sale: cand.sale,
      mkt: cand.mkt,
      _dup_mkt_list: dupMktArr,
      trang_thai: "CHƯA VÀO BẢNG TH • TRÙNG MKT",
      so_luong: cand.so_luong,
      so_luong_num: cand.so_luong_num,
      ghi_chu: `Khách đặt nhiều MKT (${mktsList}) nhưng chưa vào bảng TH`,
    });
  }

  return results;
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

function add_mkt_token_variants(set, rawToken) {
  const clean = String(rawToken || "").trim();
  if (!clean) return;
  set.add(clean);
  set.add(clean.toUpperCase());
  const canonical = chuan_hoa_mkt_so_sanh(clean);
  if (canonical) set.add(canonical);
}

function get_od_row_mkt_dropdown_tokens(order) {
  if (!order) return ["__EMPTY__"];
  const raw = String(order.mkt || "").trim();
  const out = new Set();
  if (Array.isArray(order._dup_mkt_list)) {
    for (const dm of order._dup_mkt_list) {
      const c = chuan_hoa_mkt_so_sanh(dm) || String(dm || "").trim().toUpperCase();
      if (c) out.add(c);
    }
  }
  if (!raw) {
    out.add("__EMPTY__");
    return Array.from(out);
  }

  const mParen = raw.match(/^(.+?)\s*\(\s*(?:Đúng|Tính)\s*:\s*(.+?)\s*\)$/i);
  if (mParen) {
    const left = mParen[1].trim();
    const right = mParen[2].trim();
    if (/^CHƯA ĐIỀN/i.test(left)) {
      out.add("__EMPTY__");
    } else if (left) {
      out.add(chuan_hoa_mkt_so_sanh(left) || left.toUpperCase());
    }
    if (right) {
      out.add(chuan_hoa_mkt_so_sanh(right) || right.toUpperCase());
    }
    return out.size > 0 ? Array.from(out) : ["__EMPTY__"];
  }

  if (/^CHƯA ĐIỀN/i.test(raw)) {
    out.add("__EMPTY__");
  } else {
    out.add(chuan_hoa_mkt_so_sanh(raw) || raw.toUpperCase());
  }
  return out.size > 0 ? Array.from(out) : ["__EMPTY__"];
}

function get_od_row_mkt_match_tokens(order) {
  if (!order) return ["__EMPTY__"];
  const raw = String(order.mkt || "").trim();
  const out = new Set();
  if (Array.isArray(order._dup_mkt_list)) {
    for (const dm of order._dup_mkt_list) add_mkt_token_variants(out, dm);
  }
  if (!raw) {
    out.add("__EMPTY__");
    return Array.from(out);
  }

  out.add(raw);
  out.add(raw.toUpperCase());
  const mParen = raw.match(/^(.+?)\s*\(\s*(?:Đúng|Tính)\s*:\s*(.+?)\s*\)$/i);
  if (mParen) {
    const left = mParen[1].trim();
    const right = mParen[2].trim();
    if (/^CHƯA ĐIỀN/i.test(left)) {
      out.add("__EMPTY__");
      out.add("CHƯA ĐIỀN MKT");
    } else {
      add_mkt_token_variants(out, left);
    }
    add_mkt_token_variants(out, right);
  } else if (/^CHƯA ĐIỀN/i.test(raw)) {
    out.add("__EMPTY__");
    out.add("CHƯA ĐIỀN MKT");
  } else {
    add_mkt_token_variants(out, raw);
  }
  return Array.from(out);
}

function matches_od_col_filter(order, colKey, allowedSet) {
  if (!allowedSet) return true;
  if (colKey === "mkt") {
    const tokens = get_od_row_mkt_match_tokens(order);
    for (const tok of tokens) {
      if (allowedSet.has(tok)) return true;
    }
    for (const sel of allowedSet) {
      if (sel === "__EMPTY__") continue;
      const selCanon = chuan_hoa_mkt_so_sanh(sel);
      if (selCanon && tokens.includes(selCanon)) return true;
    }
    return false;
  }
  return allowedSet.has(get_od_col_filter_value(order, colKey));
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

function parse_order_ymd(order) {
  return tach_ngay_ymd_tu_chuoi(order?.ngay_only || "");
}

function cap_nhat_nut_khoang_ngay_ui(startEl, sepEl, endEl, st, en, emptyLabel = "Chọn ngày") {
  if (!startEl) return;
  if (st && en && st === en) {
    startEl.textContent = format_date_vn_display(st);
    if (sepEl) sepEl.classList.add("hidden");
    if (endEl) endEl.classList.add("hidden");
  } else if (st && en) {
    startEl.textContent = format_date_vn_display(st);
    if (endEl) {
      endEl.textContent = format_date_vn_display(en);
      endEl.classList.remove("hidden");
    }
    if (sepEl) sepEl.classList.remove("hidden");
  } else {
    startEl.textContent = emptyLabel;
    if (sepEl) sepEl.classList.add("hidden");
    if (endEl) endEl.classList.add("hidden");
  }
}

function update_od_date_btn_ui() {
  const btn = document.getElementById("btnOdDateRange");
  const startEl = document.getElementById("odDateStartText");
  const sepEl = document.getElementById("odDateSep");
  const endEl = document.getElementById("odDateEndText");

  if (btn && startEl) {
    cap_nhat_nut_khoang_ngay_ui(startEl, sepEl, endEl, od_date_start, od_date_end, "Tất cả ngày");
    btn.classList.toggle("active", Boolean(od_date_start && od_date_end));
  }
}

function set_od_modal_layout_mode(isAllTableMode) {
  const cardEl = document.getElementById("orderDetailCard");
  const noTrackingBtn = document.getElementById("btnOdNoTracking");
  const landingMktBtn = document.getElementById("btnOdLandingMktCheck");
  const dupMktBtn = document.getElementById("btnOdDupMktCheck");
  const dateBtn = document.getElementById("btnOdDateRange");
  const countBadge = document.getElementById("odCountBadge");
  const qtyBadge = document.getElementById("odQtyBadge");
  const metaRow = cardEl ? cardEl.querySelector(".od-meta-row") : null;
  const shipDivider = document.getElementById("odShipDivider");
  const shipText = document.getElementById("odShipText");
  const footerBar = document.getElementById("odFooterBar");
  const footerSummary = document.getElementById("odFooterSummary");
  const extraCols = document.querySelectorAll(".col-extra-ap");
  const thFilterBtns = document.querySelectorAll(".od-th-filter-btn");

  if (cardEl) cardEl.classList.toggle("od-wide-mode", isAllTableMode);
  if (noTrackingBtn) noTrackingBtn.classList.toggle("hidden", !isAllTableMode);
  if (landingMktBtn) landingMktBtn.classList.toggle("hidden", !isAllTableMode);
  if (dupMktBtn) dupMktBtn.classList.toggle("hidden", !isAllTableMode);
  if (dateBtn) dateBtn.classList.remove("hidden");
  if (countBadge) countBadge.classList.toggle("hidden", isAllTableMode);
  if (qtyBadge) qtyBadge.classList.add("hidden");
  if (metaRow) metaRow.classList.toggle("hidden", isAllTableMode);
  if (shipDivider) shipDivider.classList.toggle("hidden", !isAllTableMode);
  if (shipText) shipText.classList.toggle("hidden", !isAllTableMode);
  if (footerSummary) footerSummary.classList.toggle("hidden", !isAllTableMode);
  if (footerBar) footerBar.classList.toggle("hidden", !isAllTableMode);
  extraCols.forEach((th) => th.classList.toggle("hidden", !isAllTableMode));
  thFilterBtns.forEach((btn) => btn.classList.toggle("hidden", !isAllTableMode));
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

  const noTrackingBtn = document.getElementById("btnOdNoTracking");
  if (noTrackingBtn) {
    noTrackingBtn.classList.toggle("active", Boolean(od_only_missing_tracking));
    noTrackingBtn.setAttribute("aria-pressed", od_only_missing_tracking ? "true" : "false");
  }

  const landingMktBtn = document.getElementById("btnOdLandingMktCheck");
  if (landingMktBtn) {
    landingMktBtn.classList.toggle("active", Boolean(od_only_landing_mkt_issue));
    landingMktBtn.setAttribute("aria-pressed", od_only_landing_mkt_issue ? "true" : "false");
  }

  const dupMktBtn = document.getElementById("btnOdDupMktCheck");
  if (dupMktBtn) {
    dupMktBtn.classList.toggle("active", Boolean(od_only_dup_mkt));
    dupMktBtn.setAttribute("aria-pressed", od_only_dup_mkt ? "true" : "false");
  }

  const activeCount =
    Object.keys(od_excel_filters).length +
    (od_excel_sort.col ? 1 : 0) +
    (od_date_start && od_date_end ? 1 : 0) +
    (od_only_missing_tracking ? 1 : 0) +
    (od_only_landing_mkt_issue ? 1 : 0) +
    (od_only_dup_mkt ? 1 : 0);
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

  // Lọc theo các cột KHÁC (cascading giống Excel) + khoảng thời gian nếu đang lọc
  const otherKeys = Object.keys(od_excel_filters).filter((k) => k !== colKey);
  const hasDateFilter = Boolean(od_date_start && od_date_end);
  const counts = new Map();
  const filterSource =
    current_od_mode === "all_table" && od_only_landing_mkt_issue
      ? lay_danh_sach_don_loi_vao_don()
      : current_od_mode === "all_table" && od_only_dup_mkt
      ? lay_danh_sach_don_trung_mkt()
      : current_od_raw_list;

  for (const o of filterSource) {
    if (hasDateFilter) {
      const ymd = parse_order_ymd(o);
      if (!ymd || ymd < od_date_start || ymd > od_date_end) continue;
    }
    let ok = true;
    for (const k of otherKeys) {
      const allowedSet = od_excel_filters[k];
      if (allowedSet && !matches_od_col_filter(o, k, allowedSet)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    if (colKey === "mkt") {
      for (const v of get_od_row_mkt_dropdown_tokens(o)) {
        counts.set(v, (counts.get(v) || 0) + 1);
      }
    } else {
      const v = get_od_col_filter_value(o, colKey);
      counts.set(v, (counts.get(v) || 0) + 1);
    }
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
  od_xl_pending_values = entries.map(([val, cnt]) => {
    let isChecked = true;
    if (existingSet) {
      if (existingSet.has(val)) {
        isChecked = true;
      } else if (colKey === "mkt" && val !== "__EMPTY__") {
        isChecked = Array.from(existingSet).some((s) => s !== "__EMPTY__" && chuan_hoa_mkt_so_sanh(s) === val);
      } else {
        isChecked = false;
      }
    }
    return {
      val,
      label: val === "__EMPTY__" ? "(Trống)" : val,
      count: cnt,
      checked: isChecked,
    };
  });

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
  od_date_start = null;
  od_date_end = null;
  od_only_missing_tracking = false;
  od_only_landing_mkt_issue = false;
  od_only_dup_mkt = false;

  set_od_modal_layout_mode(true);
  update_od_date_btn_ui();

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
    searchInput.placeholder = "Tìm kiếm";
  }
  if (clearBtn) clearBtn.classList.add("hidden");

  update_od_xl_header_indicators();
  apply_od_filters_and_render(true);

  modal.classList.remove("hidden");
  const isTkStale = Date.now() - thong_ke_last_fetch_ms >= 45000;
  if (!thong_ke_is_full || isTkStale) {
    if (dateRangeText) {
      dateRangeText.textContent = !thong_ke_is_full
        ? `Đang hiện ${orders.length} đơn gần nhất • ⏳ Đang tải toàn bộ bảng...`
        : `Tổng cộng ${orders.length} đơn • ⏳ Đang đồng bộ đơn mới...`;
    }
    tai_du_lieu_google_sheets(isTkStale, "", "", true).then((ok) => {
      if (!ok || modal.classList.contains("hidden") || current_od_mode !== "all_table") return;
      current_od_raw_list = lay_tat_ca_don_hang_tu_bang_a_den_p(false);
      if (dateRangeText) {
        dateRangeText.textContent = `Tổng cộng ${current_od_raw_list.length} đơn hàng trong bảng`;
      }
      apply_od_filters_and_render(false);
    }).catch(() => {
      if (dateRangeText && !modal.classList.contains("hidden") && current_od_mode === "all_table") {
        dateRangeText.textContent = `Tổng cộng ${current_od_raw_list.length} đơn hàng trong bảng`;
      }
    });
  }
  setTimeout(() => {
    if (searchInput) searchInput.focus();
  }, 80);
}

function cap_nhat_text_ngay_chi_tiet_don(st, en) {
  const dateRangeText = document.getElementById("odDateRangeText");
  if (!dateRangeText) return;
  const s = st || "";
  const e = en || "";
  const sVn = format_date_vn_display(s);
  const eVn = format_date_vn_display(e);
  dateRangeText.textContent = s === e ? `Ngày ${sVn}` : `Từ ${sVn} → ${eVn}`;
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
  od_date_start = current_start_date || null;
  od_date_end = current_end_date || null;
  od_only_missing_tracking = false;
  od_only_landing_mkt_issue = false;
  od_only_dup_mkt = false;

  set_od_modal_layout_mode(false);
  update_od_date_btn_ui();

  const orders = lay_danh_sach_don_chi_tiet(ten_mkt, ten_sp, od_date_start, od_date_end);
  current_od_raw_list = orders;

  const mktBadge = document.getElementById("odMktBadge");
  const spBadge = document.getElementById("odSpBadge");
  const titleText = document.getElementById("odTitleText");
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
    } else {
      spBadge.classList.add("hidden");
    }
  }

  if (titleText) {
    titleText.textContent = "CHI TIẾT ĐƠN HÀNG";
  }

  cap_nhat_text_ngay_chi_tiet_don(od_date_start, od_date_end);

  if (searchInput) {
    searchInput.value = "";
    searchInput.placeholder = "Tìm kiếm";
  }
  if (clearBtn) clearBtn.classList.add("hidden");

  update_od_xl_header_indicators();
  apply_od_filters_and_render(true);

  modal.classList.remove("hidden");
  setTimeout(() => {
    if (searchInput) searchInput.focus();
  }, 80);
}

function khoi_phuc_du_lieu_dashboard_neu_lech_ngay() {
  if (!current_start_date || !current_end_date) return;
  // Nếu vừa đóng Lọc đơn (all=1), khôi phục ngay lát cắt nhẹ của Dashboard từ RAM để không giữ toàn bộ lịch sử trong data_hien_tai
  if (
    thong_ke_is_full &&
    _dashboard_tk_snapshot &&
    Array.isArray(_dashboard_tk_snapshot.rows) &&
    _dashboard_tk_snapshot.rows.length > 1 &&
    _dashboard_tk_snapshot.start &&
    _dashboard_tk_snapshot.end &&
    _dashboard_tk_snapshot.start <= current_start_date &&
    _dashboard_tk_snapshot.end >= current_end_date
  ) {
    data_hien_tai = _dashboard_tk_snapshot.rows;
    thong_ke_loaded_start = _dashboard_tk_snapshot.start;
    thong_ke_loaded_end = _dashboard_tk_snapshot.end;
    thong_ke_last_fetch_ms = _dashboard_tk_snapshot.timeMs || 0;
    thong_ke_is_full = false;
  }
  const needTk =
    !thong_ke_is_full &&
    (!thong_ke_loaded_start ||
      !thong_ke_loaded_end ||
      thong_ke_loaded_start > current_start_date ||
      thong_ke_loaded_end < current_end_date);
  const needTb =
    !thong_bao_loaded_start ||
    !thong_bao_loaded_end ||
    thong_bao_loaded_start > current_start_date ||
    thong_bao_loaded_end < current_end_date;

  if (needTk) {
    tai_du_lieu_google_sheets(false).then((ok) => {
      if (ok) run_silent_dashboard_rerender();
    }).catch(() => {});
  }
  if (needTb) {
    tai_du_lieu_thong_bao_ngam(false).catch(() => {});
  }
}

function dong_bang_don_hang_chi_tiet() {
  close_od_excel_filter();
  if (current_cal_target === "od_filter") {
    const calPopup = document.getElementById("calendarPopup");
    calPopup?.classList.add("hidden");
    calPopup?.classList.remove("is-modal-cal");
    document.getElementById("btnOdDateRange")?.classList.remove("is-open");
    current_cal_target = null;
  }
  const modal = document.getElementById("orderDetailModal");
  if (modal) modal.classList.add("hidden");
  clear_od_sheet_selection();
  khoi_phuc_du_lieu_dashboard_neu_lech_ngay();
}

function dong_bang_camp_mkt() {
  dong_bang_khach_hang_camp();
  if (current_cal_target === "mc_filter") {
    const calPopup = document.getElementById("calendarPopup");
    calPopup?.classList.add("hidden");
    calPopup?.classList.remove("is-modal-cal");
    document.getElementById("btnMcDateRange")?.classList.remove("is-open");
    current_cal_target = null;
  }
  current_mc_mkt = null;
  current_mc_sp = "";
  const modal = document.getElementById("mktCampModal");
  if (modal) modal.classList.add("hidden");
  khoi_phuc_du_lieu_dashboard_neu_lech_ngay();
}

function update_mc_date_btn_ui() {
  const btn = document.getElementById("btnMcDateRange");
  const startEl = document.getElementById("mcDateStartText");
  const sepEl = document.getElementById("mcDateSep");
  const endEl = document.getElementById("mcDateEndText");
  const st = mc_date_start || current_start_date;
  const en = mc_date_end || current_end_date;

  if (btn && startEl) {
    cap_nhat_nut_khoang_ngay_ui(startEl, sepEl, endEl, st, en, "Chọn ngày");
    const isCustom = Boolean(st && en && (st !== current_start_date || en !== current_end_date));
    btn.classList.toggle("active", isCustom);
  }
}

async function tai_camp_mkt_theo_ngay(st, en) {
  mc_date_start = st;
  mc_date_end = en;
  update_mc_date_btn_ui();
  tai_du_lieu_thong_bao_ngam(false, st, en).catch(() => {});
  const needTkForMc = Boolean(
    st && en && (!thong_ke_loaded_start || !thong_ke_loaded_end || thong_ke_loaded_start > st || thong_ke_loaded_end < en)
  );
  if (needTkForMc) {
    tai_du_lieu_google_sheets(false, st, en).then((ok) => {
      const modal = document.getElementById("mktCampModal");
      if (ok && modal && !modal.classList.contains("hidden") && current_mc_mkt && mc_date_start === st && mc_date_end === en) {
        render_mc_table_rows();
      }
    }).catch(() => {});
  }

  if (
    st === current_start_date &&
    en === current_end_date &&
    cached_fb_camps &&
    Object.keys(cached_fb_camps).length > 0
  ) {
    mc_custom_camps_map = null;
    mc_is_loading_fb = false;
    render_mc_table_rows();
    return;
  }

  const cached = doc_cache_fb_last(st, en);
  if (cached && cached.local_camps && Object.keys(cached.local_camps).length > 0) {
    mc_custom_camps_map = cached.local_camps;
    render_mc_table_rows();
  }

  mc_is_loading_fb = true;
  render_mc_table_rows();

  try {
    const fbRes = await quet_chi_phi_facebook_helper(st, en);
    if (mc_date_start === st && mc_date_end === en) {
      if (Array.isArray(fbRes?.local_fb_errors) && fbRes.local_fb_errors.length > 0) {
        show_update_toast_notification(`⚠️ Lỗi Facebook Ads: ${fbRes.local_fb_errors[0]}`);
      }
      mc_custom_camps_map = (fbRes && fbRes.local_camps) || {};
      mc_is_loading_fb = false;
      render_mc_table_rows();
    }
  } catch (e) {
    if (mc_date_start === st && mc_date_end === en) {
      mc_is_loading_fb = false;
      render_mc_table_rows();
    }
  }
}

function format_date_vn_display(ymdStr) {
  const s = String(ymdStr || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s || "--/--/----";
}

function chuan_hoa_id_camp_digits(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  // Nếu là công thức/chuỗi khoa học hoặc số nguyên thuần -> trích xuất phần chữ số
  if (/^\d{8,}$/.test(s)) return s;
  const digits = s.replace(/\D/g, "");
  return digits.length >= 8 ? digits : "";
}

function extract_utm_campaign_from_url(linkRaw) {
  const s = String(linkRaw || "");
  if (!s) return "";
  const m = s.match(/(?:utm_campaign|utm_id)=([0-9]{8,})/i);
  return m ? m[1] : "";
}

let last_mc_orders_by_camp = {};
let last_mc_camps_by_id = {};
let last_mc_revenue_by_camp = {};
let last_mc_outside_reconcile = null;
let current_cc_camp_id = null;
let current_cc_filter = "all"; // "all" | "closed" | "unclosed" | "missing_cid" | "other"

function dong_bang_khach_hang_camp() {
  current_cc_camp_id = null;
  const modal = document.getElementById("campCustomersModal");
  if (modal) modal.classList.add("hidden");
}

function mo_bang_khach_hang_camp(campId) {
  const cid = String(campId || "").trim();
  if (!cid) return;
  const modal = document.getElementById("campCustomersModal");
  if (!modal) return;

  current_cc_camp_id = cid;
  current_cc_filter = "all";
  const searchEl = document.getElementById("ccSearchInput");
  if (searchEl) searchEl.value = "";
  const clearEl = document.getElementById("btnClearCcSearch");
  if (clearEl) clearEl.classList.add("hidden");

  modal.classList.remove("hidden");
  render_camp_customers_modal();
}

function render_camp_customers_modal() {
  if (!current_cc_camp_id) return;
  const isUnmatchedMode = current_cc_camp_id === "__UNMATCHED__";
  const camp = isUnmatchedMode ? null : (last_mc_camps_by_id[current_cc_camp_id] || null);
  const allCustomers = Array.isArray(last_mc_orders_by_camp[current_cc_camp_id])
    ? last_mc_orders_by_camp[current_cc_camp_id]
    : [];

  const totalAll = allCustomers.length;
  const totalClosed = isUnmatchedMode
    ? allCustomers.filter((x) => x.reasonType === "missing_cid").length
    : allCustomers.filter((x) => x.da_chot).length;
  const totalUnclosed = isUnmatchedMode
    ? allCustomers.filter((x) => x.reasonType !== "missing_cid").length
    : (totalAll - totalClosed);

  const ccMktBadge = document.getElementById("ccMktBadge");
  const ccSpBadge = document.getElementById("ccSpBadge");
  const ccTotalBadge = document.getElementById("ccTotalBadge");
  const ccClosedBadge = document.getElementById("ccClosedBadge");
  const ccUnclosedBadge = document.getElementById("ccUnclosedBadge");
  const ccTitleText = document.getElementById("ccTitleText");
  const ccCampIdText = document.getElementById("ccCampIdText");
  const ccDateRangeText = document.getElementById("ccDateRangeText");
  const ccSpendText = document.getElementById("ccSpendText");
  const ccTableBody = document.getElementById("ccTableBody");
  const ccEmptyState = document.getElementById("ccEmptyState");
  const ccFooterSummary = document.getElementById("ccFooterSummary");

  const activeStart = mc_date_start || current_start_date;
  const activeEnd = mc_date_end || current_end_date;

  const ccMktDisplay = (camp && camp._ownerMkt)
    ? camp._ownerMkt
    : (current_mc_mkt === "__ALL__" ? "TỔNG CÔNG TY" : (current_mc_mkt || "MKT"));
  if (ccMktBadge) ccMktBadge.textContent = ccMktDisplay;
  if (ccSpBadge) {
    if (isUnmatchedMode) {
      ccSpBadge.textContent = "NGOÀI CAMP";
      ccSpBadge.classList.remove("hidden");
    } else if (camp && camp.sp) {
      ccSpBadge.textContent = camp.sp;
      ccSpBadge.classList.remove("hidden");
    } else {
      ccSpBadge.classList.add("hidden");
    }
  }
  if (ccTotalBadge) ccTotalBadge.textContent = isUnmatchedMode ? `${totalAll} đơn` : `${totalAll} khách`;
  if (ccClosedBadge) {
    ccClosedBadge.textContent = isUnmatchedMode ? `Thiếu ID: ${totalClosed}` : `Đã chốt: ${totalClosed}`;
    ccClosedBadge.classList.toggle("hidden", totalAll === 0);
  }
  if (ccUnclosedBadge) {
    ccUnclosedBadge.textContent = isUnmatchedMode ? `Pancake / Ngày trước: ${totalUnclosed}` : `Chưa chốt: ${totalUnclosed}`;
    ccUnclosedBadge.classList.toggle("hidden", totalAll === 0);
  }
  if (ccTitleText) {
    ccTitleText.textContent = isUnmatchedMode
      ? "ĐƠN NGOÀI CAMP (KHÔNG GẮN CHIẾN DỊCH)"
      : ((camp && camp.campaign_name) ? camp.campaign_name : `Camp ${current_cc_camp_id}`);
  }
  if (ccCampIdText) ccCampIdText.textContent = isUnmatchedMode ? "Nguồn: Đơn Tổng Hợp chưa gắn ID" : `ID: ${current_cc_camp_id}`;
  if (ccDateRangeText) {
    ccDateRangeText.textContent =
      activeStart === activeEnd
        ? `Ngày: ${format_date_vn_display(activeStart)}`
        : `Từ ${format_date_vn_display(activeStart)} → ${format_date_vn_display(activeEnd)}`;
  }
  if (ccSpendText) {
    if (isUnmatchedMode) {
      const rec = last_mc_outside_reconcile || {};
      const dsOutside = rec.outsideTotalDs || 0;
      const dsUnmatched = rec.unmatchedDs || 0;
      ccSpendText.textContent = `DS ngoài Camp: ${format_tien_vnd(dsUnmatched)} • Tổng cả MKT: ${format_tien_vnd(dsOutside)}`;
    } else {
      const spendVal = camp ? (camp.spend || 0) : 0;
      const campDs = last_mc_revenue_by_camp[current_cc_camp_id] || 0;
      const dsPart = campDs > 0
        ? ` • DS: ${format_tien_vnd(campDs)}${spendVal > 0 ? ` (${((spendVal / campDs) * 100).toFixed(1)}%)` : ""}`
        : "";
      const cpaText = (totalAll > 0 && spendVal > 0) ? ` • ${format_tien_vnd(spendVal / totalAll)}/số` : "";
      ccSpendText.textContent = `CP: ${format_tien_vnd(spendVal)}${dsPart}${cpaText}`;
    }
  }

  const fAllBtn = document.getElementById("ccFilterAll");
  const fClosedBtn = document.getElementById("ccFilterClosed");
  const fUnclosedBtn = document.getElementById("ccFilterUnclosed");
  if (fAllBtn) {
    fAllBtn.textContent = `Tất cả (${totalAll})`;
    fAllBtn.classList.toggle("active", current_cc_filter === "all");
  }
  if (fClosedBtn) {
    fClosedBtn.textContent = isUnmatchedMode ? `Thiếu ID (${totalClosed})` : `Đã chốt (${totalClosed})`;
    fClosedBtn.classList.toggle("active", current_cc_filter === "closed");
  }
  if (fUnclosedBtn) {
    fUnclosedBtn.textContent = isUnmatchedMode ? `Pancake / Khác (${totalUnclosed})` : `Chưa chốt (${totalUnclosed})`;
    fUnclosedBtn.classList.toggle("active", current_cc_filter === "unclosed");
  }

  const searchInput = document.getElementById("ccSearchInput");
  const clearBtn = document.getElementById("btnClearCcSearch");
  const qRaw = (searchInput ? searchInput.value : "").trim().toLowerCase();
  const qNoDau = qRaw ? bo_dau_tieng_viet(qRaw).toLowerCase() : "";
  if (clearBtn) clearBtn.classList.toggle("hidden", !qRaw);

  const list = allCustomers.filter((item) => {
    if (isUnmatchedMode) {
      if (current_cc_filter === "closed" && item.reasonType !== "missing_cid") return false;
      if (current_cc_filter === "unclosed" && item.reasonType === "missing_cid") return false;
    } else {
      if (current_cc_filter === "closed" && !item.da_chot) return false;
      if (current_cc_filter === "unclosed" && item.da_chot) return false;
    }
    if (!qRaw) return true;
    const hay = `${item.ho_ten} ${item.sdt} ${item.dia_chi} ${item.dong_sp} ${item.mau_sac} ${item.size} ${item.ghi_chu_khach || ""} ${item.ghi_chu_sale || ""} ${item.reasonLabel || ""}`.toLowerCase();
    const hayNd = bo_dau_tieng_viet(hay).toLowerCase();
    return hay.includes(qRaw) || hayNd.includes(qNoDau);
  });

  if (ccTableBody) ccTableBody.innerHTML = "";

  if (list.length === 0) {
    if (ccEmptyState) {
      const titleEl = ccEmptyState.querySelector(".od-empty-title");
      const descEl = ccEmptyState.querySelector(".od-empty-desc");
      if (totalAll === 0) {
        if (titleEl) titleEl.textContent = isUnmatchedMode ? "Không có đơn ngoài Camp" : "Chưa có khách hàng đặt từ Camp này";
        if (descEl) descEl.textContent = isUnmatchedMode ? "100% đơn trong khoảng ngày đã khớp vào Camp." : "Chưa ghi nhận đơn hàng nào khớp Campaign ID này trong khoảng ngày đang chọn.";
      } else {
        if (titleEl) titleEl.textContent = "Không tìm thấy khách hàng phù hợp";
        if (descEl) descEl.textContent = "Hãy thử đổi bộ lọc trạng thái hoặc từ khóa tìm kiếm.";
      }
      ccEmptyState.classList.remove("hidden");
    }
    if (ccFooterSummary) {
      ccFooterSummary.textContent = `Hiển thị 0 / ${totalAll} ${isUnmatchedMode ? "đơn" : "khách hàng"}`;
    }
    return;
  }

  if (ccEmptyState) ccEmptyState.classList.add("hidden");

  const frag = document.createDocumentFragment();
  list.forEach((o, idx) => {
    const tr = document.createElement("tr");
    const attrParts = [];
    if (o.mau_sac) attrParts.push(o.mau_sac);
    if (o.size) attrParts.push(`Size ${o.size}`);
    const attrText = attrParts.join(" • ");

    const noteParts = [];
    if (o.ghi_chu_khach) noteParts.push(`Khách: ${o.ghi_chu_khach}`);
    if (o.ghi_chu_sale) noteParts.push(o.ghi_chu_sale);
    if (o.tg_goi) noteParts.push(`Gọi: ${o.tg_goi}`);
    const noteText = noteParts.join(" • ");

    const sdtClean = String(o.sdt || "").trim();
    const sdtCellHtml = sdtClean
      ? `<button type="button" class="cc-sdt-btn" data-copy-sdt="${escape_html(sdtClean)}" title="Bấm để copy SĐT">${escape_html(sdtClean)}</button>`
      : `<span class="mc-metric-val">-</span>`;

    let badgeHtml = `<span class="cc-status-badge ${o.da_chot ? "is-closed" : "is-unclosed"}">${o.da_chot ? "✓ Đã chốt" : "Chưa chốt"}</span>`;
    if (isUnmatchedMode) {
      const rCls = o.reasonType === "missing_cid" ? "is-missing" : (o.reasonType === "form_prev" ? "is-prev" : "is-other");
      badgeHtml = `<span class="cc-reason-badge ${rCls}">${escape_html(o.reasonLabel || "Ngoài Camp")}</span>`;
    }

    tr.innerHTML = `
      <td class="cc-col-stt"><span class="mc-stt-badge">${idx + 1}</span></td>
      <td class="cc-col-time">${escape_html(o.tg || "-")}</td>
      <td class="cc-col-name">${escape_html(o.ho_ten || "(Không tên)")}</td>
      <td class="cc-col-sdt">${sdtCellHtml}</td>
      <td class="cc-col-addr">${escape_html(o.dia_chi || "-")}</td>
      <td class="cc-col-sp">
        ${o.dong_sp ? `<span class="mc-sp-tag">${escape_html(o.dong_sp)}</span>` : ""}
        ${attrText ? `<div class="cc-sp-sub">${escape_html(attrText)}</div>` : (!o.dong_sp ? `<span class="mc-metric-val">-</span>` : "")}
      </td>
      <td class="cc-col-status">
        <div>
          ${badgeHtml}
          ${o.gia_ban > 0 ? `<span class="cc-price-tag">${escape_html(format_tien_vnd(o.gia_ban))}</span>` : ""}
        </div>
        ${noteText ? `<div class="cc-note-text">${escape_html(noteText)}</div>` : ""}
      </td>
    `;
    frag.appendChild(tr);
  });
  ccTableBody.appendChild(frag);

  if (ccFooterSummary) {
    ccFooterSummary.textContent = `Hiển thị ${list.length} / ${totalAll} ${isUnmatchedMode ? "đơn ngoài Camp" : "khách hàng"} (Bấm vào SĐT để copy)`;
  }
}

function chuan_hoa_ten_camp_khop(raw, compactDash = false) {
  const clean = bo_dau_tieng_viet(String(raw || "").trim())
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  return compactDash ? clean.replace(/\s*-\s*/g, "-") : clean;
}

function extract_utm_campaign_name_from_url(linkRaw) {
  const s = String(linkRaw || "");
  if (!s) return "";
  const m = s.match(/(?:utm_campaign|utm_id)=([^&#\s]+)/i);
  if (!m || !m[1]) return "";
  let val = m[1].replace(/\+/g, " ");
  try {
    val = decodeURIComponent(val);
  } catch (e) {}
  val = val.trim();
  // Bỏ qua chuỗi thuần số (đã xử lý ở extract_utm_campaign_from_url) hoặc placeholder chưa thay {{...}}
  if (!val || /^\d+$/.test(val) || /\{\{[^}]+\}\}/.test(val)) return "";
  return val;
}

function tinh_ket_qua_camp_tu_tong_don(ten_mkt, campsList, start_str, end_str, spFilter = "") {
  const countsByCampId = {};
  const closedByCampId = {};
  const ordersByCampId = {};
  const revenueByCampId = {};
  (campsList || []).forEach((c) => {
    if (c && c.campaign_id) {
      countsByCampId[c.campaign_id] = 0;
      closedByCampId[c.campaign_id] = 0;
      ordersByCampId[c.campaign_id] = [];
      revenueByCampId[c.campaign_id] = 0;
    }
  });

  if (!Array.isArray(data_tong_don_upyo) || data_tong_don_upyo.length < 2) {
    return { countsByCampId, closedByCampId, ordersByCampId, revenueByCampId, hasAnyCampColData: false, totalMatchedOrders: 0 };
  }

  const patternsArr = tao_cac_dang_ngay_khop(start_str, end_str);
  const isAllMkt = (ten_mkt === "__ALL__");
  const targetMktNorm = isAllMkt ? "" : chuan_hoa_mkt_so_sanh(ten_mkt);
  const spFilterNorm = String(spFilter || "").trim().toUpperCase();

  let colTg = 0;
  let colTen = 1;
  let colSdt = 2;
  let colMauSac = 3;
  let colGhiChuKhach = 4;
  let colDiaChi = 5;
  let colMkt = 6;
  let colSp = 7;
  let colSize = 10;
  let colLink = 12;
  let colNguon = 13;  // Cột N: Nguồn (Tên Camp)
  let colMaQc = 15;   // Cột P: Mã QC
  let colCampId = 16; // Cột Q: Campaign ID
  let colNoteU = 20;
  let colNoteV = 21;
  let colNoteW = 22;
  let colTgGoi = 23;
  let colDaChot = 24;
  let colDemDon = 25;

  const headerRow = data_tong_don_upyo[0];
  if (Array.isArray(headerRow)) {
    for (let i = 0; i < headerRow.length; i++) {
      const h = bo_dau_tieng_viet(String(headerRow[i] || "").replace(/\s+/g, " ").trim()).toLowerCase();
      if (h === "thoi gian" || h === "ngay") colTg = i;
      else if (h === "ho ten") colTen = i;
      else if (h === "so dien thoai" || h === "sdt") colSdt = i;
      else if (h === "mau sac" || h === "mau") colMauSac = i;
      else if (h === "ghi chu khach") colGhiChuKhach = i;
      else if (h === "dia chi") colDiaChi = i;
      else if (h === "mkt" || h === "marketer") colMkt = i;
      else if (h === "dong sp" || h === "san pham" || h === "ten sp") colSp = i;
      else if (h === "size") colSize = i;
      else if (h === "link landing") colLink = i;
      else if (h === "nguon" || h === "nguon don") colNguon = i;
      else if (h === "ma qc") colMaQc = i;
      else if (h === "campaign id") colCampId = i;
      else if (h === "ghi chu sale") colNoteU = i;
      else if (h === "thoi gian goi") colTgGoi = i;
      else if (h === "don da chot") colDaChot = i;
      else if (h === "dem don") colDemDon = i;
    }
  }

  // Xây dựng bảng tra cứu nhanh các Camp của MKT đang xem (theo ID số và theo Tên Camp ở cột Nguồn)
  const exactMap = new Map();
  const prefix14Map = new Map();
  const prefix11List = [];
  const nameExactMap = new Map();
  const nameCompactMap = new Map();
  const pushNameEntry = (mapObj, key, entry) => {
    if (!key) return;
    if (!mapObj.has(key)) mapObj.set(key, []);
    mapObj.get(key).push(entry);
  };
  for (const c of campsList || []) {
    const cid = chuan_hoa_id_camp_digits(c.campaign_id);
    if (!cid) continue;
    const ownerMktNorm = c._ownerMkt ? chuan_hoa_mkt_so_sanh(c._ownerMkt) : "";
    if (!exactMap.has(cid)) exactMap.set(cid, cid);
    if (cid.length >= 14) {
      const p14 = cid.slice(0, 14);
      if (!prefix14Map.has(p14)) prefix14Map.set(p14, cid);
    }
    if (cid.length >= 11) {
      prefix11List.push({
        p11: cid.slice(0, 11),
        cid,
        ownerMktNorm,
      });
    }
    const nameEntry = {
      cid,
      ownerMktNorm,
      isPaused: is_fb_camp_paused(c) ? 1 : 0,
      spend: Number(c.spend || 0) || 0,
    };
    pushNameEntry(nameExactMap, chuan_hoa_ten_camp_khop(c.campaign_name, false), nameEntry);
    pushNameEntry(nameCompactMap, chuan_hoa_ten_camp_khop(c.campaign_name, true), nameEntry);
  }
  const sortNameEntries = (arr) => arr.sort((a, b) => (a.isPaused - b.isPaused) || (b.spend - a.spend));
  nameExactMap.forEach(sortNameEntries);
  nameCompactMap.forEach(sortNameEntries);

  const resolveMatchedCampFromRow = (r) => {
    const idQ = r.length > colCampId ? chuan_hoa_id_camp_digits(r[colCampId]) : "";
    const idP = r.length > colMaQc ? chuan_hoa_id_camp_digits(r[colMaQc]) : "";
    const urlCamp = r.length > colLink ? extract_utm_campaign_from_url(r[colLink]) : "";
    const rowMktNorm = r.length > colMkt ? chuan_hoa_mkt_so_sanh(r[colMkt]) : "";

    const candidates = [idQ, idP, urlCamp].filter(Boolean);
    let matchedCid = "";
    for (const cand of candidates) {
      if (exactMap.has(cand)) {
        matchedCid = exactMap.get(cand);
        break;
      }
    }
    if (!matchedCid) {
      for (const cand of candidates) {
        if (cand.length >= 14 && prefix14Map.has(cand.slice(0, 14))) {
          matchedCid = prefix14Map.get(cand.slice(0, 14));
          break;
        }
      }
    }
    if (!matchedCid && rowMktNorm && (isAllMkt || rowMktNorm === targetMktNorm)) {
      for (const cand of candidates) {
        if (cand.length >= 11) {
          const c11 = cand.slice(0, 11);
          const hit = prefix11List.find((x) => x.p11 === c11 && (!isAllMkt || !x.ownerMktNorm || x.ownerMktNorm === rowMktNorm));
          if (hit) {
            matchedCid = hit.cid;
            break;
          }
        }
      }
    }

    // 4. Dự phòng khớp theo Tên Camp ở cột N (Nguồn) hoặc utm_campaign=<tên> khi thiếu ID số
    if (!matchedCid && (!rowMktNorm || isAllMkt || rowMktNorm === targetMktNorm)) {
      const nguonRaw = r.length > colNguon ? String(r[colNguon] || "").trim() : "";
      const urlNameRaw = r.length > colLink ? extract_utm_campaign_name_from_url(r[colLink]) : "";
      const nameCandidates = [nguonRaw, urlNameRaw].filter(Boolean);
      for (const rawName of nameCandidates) {
        const kExact = chuan_hoa_ten_camp_khop(rawName, false);
        const kCompact = chuan_hoa_ten_camp_khop(rawName, true);
        const pool = (kExact && nameExactMap.get(kExact)) || (kCompact && nameCompactMap.get(kCompact)) || null;
        if (pool && pool.length > 0) {
          const hit = pool.find((x) => !isAllMkt || !x.ownerMktNorm || !rowMktNorm || x.ownerMktNorm === rowMktNorm);
          if (hit) {
            matchedCid = hit.cid;
            break;
          }
        }
      }
    }

    return { matchedCid, hasIdData: Boolean(idQ || idP || urlCamp || matchedCid) };
  };

  let hasAnyCampColData = false;
  let totalMatchedOrders = 0;
  const r0PhoneHistory = new Map();

  for (let i = 1; i < data_tong_don_upyo.length; i++) {
    const r = data_tong_don_upyo[i];
    if (!Array.isArray(r) || r.length === 0) continue;

    const tg = String(r[colTg] || "").trim();
    const rowResolved = resolveMatchedCampFromRow(r);
    const sdtRawPre = String(r[colSdt] || "").trim();
    const sdtNormPre = chuan_hoa_sdt_so_sanh(sdtRawPre);
    const r0YmdPre = tach_ngay_ymd_tu_chuoi(tg);
    if (sdtNormPre && r0YmdPre) {
      const noteUPre = (r.length > colNoteU ? String(r[colNoteU] || "") : "").toLowerCase();
      const noteVPre = (r.length > colNoteV ? String(r[colNoteV] || "") : "").toLowerCase();
      const isDupPre = noteUPre.includes("capture form") || noteVPre.includes("capture form") || noteUPre.includes("trùng") || noteVPre.includes("trùng");
      const demPre = r.length > colDemDon ? String(r[colDemDon] || "").trim() === "0" : false;
      const cidPre = rowResolved.matchedCid ||
        (r.length > colCampId ? chuan_hoa_id_camp_digits(r[colCampId]) : "") ||
        (r.length > colMaQc ? chuan_hoa_id_camp_digits(r[colMaQc]) : "") ||
        (r.length > colLink ? extract_utm_campaign_from_url(r[colLink]) : "");
      if (!r0PhoneHistory.has(sdtNormPre)) r0PhoneHistory.set(sdtNormPre, []);
      r0PhoneHistory.get(sdtNormPre).push({
        ymd: r0YmdPre,
        ymdMs: parse_ymd_date(r0YmdPre).getTime(),
        cid: cidPre,
        isDupCap: isDupPre,
        isDemZero: demPre,
      });
    }

    if (!tg || !khop_ngay_chinh_xac(tg, patternsArr)) continue;

    const hoTenRaw = String(r[colTen] || "").trim();
    const ten = hoTenRaw.toUpperCase();
    const sdtRaw = String(r[colSdt] || "").trim();
    const sdtDigits = sdtRaw.replace(/\D/g, "");
    if (!ten && !sdtDigits) continue;
    if (ten === "TEST" || sdtDigits === "999999999") continue;

    const noteURaw = r.length > colNoteU ? String(r[colNoteU] || "").trim() : "";
    const noteVRaw = r.length > colNoteV ? String(r[colNoteV] || "").trim() : "";
    const noteWRaw = r.length > colNoteW ? String(r[colNoteW] || "").trim() : "";
    const noteU = noteURaw.toLowerCase();
    const noteV = noteVRaw.toLowerCase();
    if (noteU.includes("capture form") || noteV.includes("capture form")) continue;
    if (noteU.includes("trùng") || noteV.includes("trùng")) continue;

    if (r.length > colDemDon) {
      const demStr = String(r[colDemDon] || "").trim();
      if (demStr === "0") continue;
    }

    if (rowResolved.hasIdData) hasAnyCampColData = true;
    const matchedCid = rowResolved.matchedCid;

    if (matchedCid) {
      countsByCampId[matchedCid] = (countsByCampId[matchedCid] || 0) + 1;
      totalMatchedOrders += 1;
      const chot = r.length > colDaChot ? parseInt(String(r[colDaChot] || "0").trim(), 10) || 0 : 0;
      if (chot > 0) {
        closedByCampId[matchedCid] = (closedByCampId[matchedCid] || 0) + 1;
      }
      if (!ordersByCampId[matchedCid]) ordersByCampId[matchedCid] = [];
      if (revenueByCampId[matchedCid] === undefined) revenueByCampId[matchedCid] = 0;
      const ghiChuSale = [noteURaw, noteVRaw, noteWRaw].filter(Boolean).join(" • ");
      ordersByCampId[matchedCid].push({
        tg,
        order_ymd: tach_ngay_ymd_tu_chuoi(tg),
        ho_ten: hoTenRaw,
        sdt: sdtRaw,
        sdt_norm: chuan_hoa_sdt_so_sanh(sdtRaw),
        mau_sac: r.length > colMauSac ? String(r[colMauSac] || "").trim() : "",
        size: r.length > colSize ? String(r[colSize] || "").trim() : "",
        dong_sp: r.length > colSp ? String(r[colSp] || "").trim() : "",
        dia_chi: r.length > colDiaChi ? String(r[colDiaChi] || "").trim() : "",
        ghi_chu_khach: r.length > colGhiChuKhach ? String(r[colGhiChuKhach] || "").trim() : "",
        ghi_chu_sale: ghiChuSale,
        tg_goi: r.length > colTgGoi ? String(r[colTgGoi] || "").trim() : "",
        da_chot: chot > 0,
        gia_ban: 0,
      });
    }
  }

  // Khớp doanh số đã chốt từ bảng ĐƠN TỔNG HỢP (data_hien_tai: gid=1227181736) theo SĐT + ngày đặt (+0..+3 ngày)
  let outsideReconcile = {
    outsideTotalCount: 0,
    outsideTotalDs: 0,
    matchedInRangeDs: 0,
    unmatchedCount: 0,
    unmatchedDs: 0,
    missingCidCount: 0,
    missingCidDs: 0,
    otherPlatCount: 0,
    otherPlatDs: 0,
    formPrevCount: 0,
    formPrevDs: 0,
    unmatchedRows: [],
  };

  if (Array.isArray(data_hien_tai) && data_hien_tai.length > 0) {
    const tkGroupByKey = new Map();
    const tkGroupsByPhone = new Map();
    const outsideMktRows = [];
    let lastCustSdtRaw = "";
    let lastCustSdtNorm = "";
    let lastCustHoTen = "";
    let lastCustAddr = "";
    let lastCustDate = "";

    for (let i = 0; i < data_hien_tai.length; i++) {
      const r = data_hien_tai[i];
      if (!Array.isArray(r) || r.length === 0) continue;

      const c0 = bo_dau_tieng_viet(String(r[0] || "").trim()).toUpperCase();
      const c2 = bo_dau_tieng_viet(String(r[2] || "").trim()).toUpperCase();
      if (i === 0 && (c0 === "THOI GIAN" || c0 === "STT" || c2 === "HO TEN")) continue;

      const tgStr = String(r[0] || "").trim();
      const ymd = tach_ngay_ymd_tu_chuoi(tgStr);
      const sdtCellRaw = r.length > 3 ? String(r[3] || "").trim() : "";
      const sdtCell = sdtCellRaw ? chuan_hoa_sdt_so_sanh(sdtCellRaw) : "";
      const hoTenCell = r.length > 2 ? String(r[2] || "").trim() : "";
      const addrCell = r.length > 4 ? String(r[4] || "").trim() : "";
      const mvdCell = r.length > 1 ? String(r[1] || "").trim() : "";
      if (sdtCell || hoTenCell || addrCell || mvdCell) {
        lastCustSdtRaw = sdtCellRaw;
        lastCustSdtNorm = sdtCell;
        lastCustHoTen = hoTenCell;
        lastCustAddr = addrCell;
        lastCustDate = ymd;
      }

      if (r.length <= 13 || !la_don_hop_le_de_dem(r[13])) continue;

      const sameDateCtx = !ymd || !lastCustDate || ymd === lastCustDate;
      const effSdt = sdtCell || (sameDateCtx ? lastCustSdtNorm : "");
      const effSdtDisplay = sdtCellRaw || (sameDateCtx ? lastCustSdtRaw : "");
      const fallbackAddr = !addrCell && sameDateCtx ? lastCustAddr : "";
      const fallbackHoTen = !hoTenCell && sameDateCtx ? lastCustHoTen : "";
      const money = r.length > 8 ? parse_gia_tien(r[8]) : 0;

      if (effSdt && ymd && money > 0) {
        const gKey = `${effSdt}|${ymd}`;
        let grp = tkGroupByKey.get(gKey);
        if (!grp) {
          grp = {
            key: gKey,
            ymd,
            ymdMs: parse_ymd_date(ymd).getTime(),
            money: 0,
          };
          tkGroupByKey.set(gKey, grp);
          if (!tkGroupsByPhone.has(effSdt)) tkGroupsByPhone.set(effSdt, []);
          tkGroupsByPhone.get(effSdt).push(grp);
        }
        grp.money += money;
      }

      // Thu thập đúng các đơn của MKT này trong khoảng ngày để đối soát với dashboard bên ngoài
      if (khop_ngay_chinh_xac(tgStr, patternsArr)) {
        const mktRowNorm = resolve_row_mkt_for_dashboard(r, sdtCell ? "" : (sameDateCtx ? lastCustSdtRaw : ""), fallbackAddr, i + 1);
        const rawSpText = r.length > 5 ? String(r[5] || "").trim() : "";
        let tenMau = "";
        if (rawSpText && !["DÒNG SP", "TÊN SP", "SẢN PHẨM", "MÃ SP", "MÃ"].includes(rawSpText.toUpperCase())) {
          tenMau = trich_xuat_ten_mau_thong_minh(rawSpText);
        }
        if (mktRowNorm !== "KHÁC" && (isAllMkt || chuan_hoa_mkt_so_sanh(mktRowNorm) === targetMktNorm) && tenMau && (!spFilterNorm || tenMau.toUpperCase() === spFilterNorm)) {
          outsideMktRows.push({
            gKey: effSdt && ymd ? `${effSdt}|${ymd}` : "",
            tg: tgStr,
            order_ymd: ymd,
            ho_ten: hoTenCell || fallbackHoTen,
            sdt: effSdtDisplay,
            sdt_norm: effSdt,
            dia_chi: addrCell || fallbackAddr,
            dong_sp: tenMau || rawSpText,
            mau_sac: r.length > 6 ? String(r[6] || "").trim() : "",
            size: r.length > 7 ? String(r[7] || "").trim() : "",
            gia_ban: money,
            nen_tang: r.length > 10 ? String(r[10] || "").trim() : "",
            sale: r.length > 11 ? String(r[11] || "").trim() : "",
            trang_thai: String(r[13] || "").trim(),
            ghi_chu_sale: [
              r.length > 11 && String(r[11] || "").trim() ? `Sale: ${String(r[11] || "").trim()}` : "",
              String(r[13] || "").trim(),
              r.length > 15 ? String(r[15] || "").trim() : "",
            ].filter(Boolean).join(" • "),
            ghi_chu_khach: "",
            tg_goi: "",
            da_chot: true,
          });
        }
      }
    }

    const usedTkGroupKeys = new Set();
    const tryConsumeOrderGroup = (cid, o, maxDiffDays) => {
      if (!o || !o.sdt_norm || !o.order_ymd) return false;
      const groups = tkGroupsByPhone.get(o.sdt_norm);
      if (!groups || groups.length === 0) return false;

      const oYmdMs = parse_ymd_date(o.order_ymd).getTime();
      let bestGrp = null;
      let bestDiff = Infinity;
      for (const g of groups) {
        if (usedTkGroupKeys.has(g.key)) continue;
        const diffDays = Math.round((g.ymdMs - oYmdMs) / 86400000);
        if (diffDays >= 0 && diffDays <= maxDiffDays && diffDays < bestDiff) {
          bestDiff = diffDays;
          bestGrp = g;
          if (diffDays === 0) break;
        }
      }
      if (!bestGrp) return false;
      usedTkGroupKeys.add(bestGrp.key);
      o.gia_ban = bestGrp.money;
      revenueByCampId[cid] = (revenueByCampId[cid] || 0) + bestGrp.money;
      return true;
    };

    const campIdsAll = Object.keys(ordersByCampId);
    // Lượt 1: Khớp các đơn đã đánh dấu chốt (ưu tiên cùng ngày, cho phép lệch +1..+3 ngày)
    for (const cid of campIdsAll) {
      for (const o of ordersByCampId[cid]) {
        if (o.da_chot) tryConsumeOrderGroup(cid, o, 3);
      }
    }
    // Lượt 2: Dự phòng cùng ngày nếu Sale đã lên đơn Tổng hợp nhưng chưa tích cột Đã chốt
    for (const cid of campIdsAll) {
      for (const o of ordersByCampId[cid]) {
        if (!o.da_chot && o.gia_ban <= 0) tryConsumeOrderGroup(cid, o, 0);
      }
    }

    // Đối soát toàn bộ đơn của MKT này trong khoảng ngày xem đơn nào chưa gắn vào Camp nào
    const startMs = parse_ymd_date(start_str).getTime();
    for (const row of outsideMktRows) {
      outsideReconcile.outsideTotalCount += 1;
      outsideReconcile.outsideTotalDs += row.gia_ban;
      if (row.gKey && usedTkGroupKeys.has(row.gKey)) {
        outsideReconcile.matchedInRangeDs += row.gia_ban;
        continue;
      }

      const hist = row.sdt_norm ? (r0PhoneHistory.get(row.sdt_norm) || []) : [];
      const prevRec = hist.find((h) => h.ymdMs < startMs && h.cid && !h.isDupCap && !h.isDemZero);
      const hasInRangeForm = hist.some((h) => khop_ngay_chinh_xac(h.ymd, patternsArr));
      const platNoDau = bo_dau_tieng_viet(row.nen_tang).toUpperCase();

      let reasonType = "missing_cid";
      let reasonLabel = hasInRangeForm ? "Thiếu Campaign ID" : "Landing chưa có ID";
      if (platNoDau && !platNoDau.includes("LANDING")) {
        reasonType = "other_platform";
        reasonLabel = row.nen_tang || "Ngoài Landing Page";
      } else if (prevRec && !hasInRangeForm) {
        reasonType = "form_prev";
        reasonLabel = `Form ${format_date_vn_display(prevRec.ymd)}`;
      }

      outsideReconcile.unmatchedCount += 1;
      outsideReconcile.unmatchedDs += row.gia_ban;
      if (reasonType === "missing_cid") {
        outsideReconcile.missingCidCount += 1;
        outsideReconcile.missingCidDs += row.gia_ban;
      } else if (reasonType === "form_prev") {
        outsideReconcile.formPrevCount += 1;
        outsideReconcile.formPrevDs += row.gia_ban;
      } else {
        outsideReconcile.otherPlatCount += 1;
        outsideReconcile.otherPlatDs += row.gia_ban;
      }

      outsideReconcile.unmatchedRows.push({
        ...row,
        reasonType,
        reasonLabel,
      });
    }
  }

  return { countsByCampId, closedByCampId, ordersByCampId, revenueByCampId, outsideReconcile, hasAnyCampColData, totalMatchedOrders };
}

function cap_nhat_reconcile_bar_mc(ten_mkt, spFilterNorm, campsList, outsideReconcile) {
  const reconcileBar = document.getElementById("mcOutsideReconcileBar");
  const reconcileLeft = document.getElementById("mcReconcileLeft");
  const reconcileRight = document.getElementById("mcReconcileRight");
  if (!reconcileBar || !reconcileLeft || !reconcileRight) return;

  const rec = outsideReconcile;
  const hasVisibleCamps = campsList.length > 0;
  const hasOutsideData = Boolean(rec && (rec.unmatchedCount > 0 || rec.outsideTotalDs > 0));
  if (hasOutsideData && (hasVisibleCamps || spFilterNorm)) {
    const fullMktSpend = campsList.reduce((acc, c) => acc + (c.spend || 0), 0);
    const pillsHtml = [];
    if (rec.missingCidCount > 0) {
      pillsHtml.push(`<span class="mc-rec-pill is-warn">Thiếu ID: ${rec.missingCidCount} (${escape_html(format_tien_vnd(rec.missingCidDs))})</span>`);
    }
    if (rec.otherPlatCount > 0) {
      pillsHtml.push(`<span class="mc-rec-pill is-info">Pancake / Khác: ${rec.otherPlatCount} (${escape_html(format_tien_vnd(rec.otherPlatDs))})</span>`);
    }
    if (rec.formPrevCount > 0) {
      pillsHtml.push(`<span class="mc-rec-pill is-prev">Form cũ: ${rec.formPrevCount} (${escape_html(format_tien_vnd(rec.formPrevDs))})</span>`);
    }

    if (rec.unmatchedCount > 0) {
      reconcileLeft.innerHTML =
        `<span>Ngoài Camp: <strong>+${rec.unmatchedCount} đơn (${escape_html(format_tien_vnd(rec.unmatchedDs))})</strong></span>` +
        pillsHtml.join("") +
        `<span class="mc-rec-link">Xem chi tiết →</span>`;
    } else {
      reconcileLeft.innerHTML = `<span>Toàn bộ ${rec.outsideTotalCount} đơn đều đã khớp vào Camp</span>`;
    }

    const pctOut = rec.outsideTotalDs > 0 && fullMktSpend > 0 ? (fullMktSpend / rec.outsideTotalDs) * 100 : 0;
    const pctClsOut = pctOut < 15 ? "val-green" : pctOut > 25 ? "val-red" : "val-highlight";
    const pctOutBadge = (rec.outsideTotalDs > 0 && fullMktSpend > 0)
      ? `<span class="cpds-pill mc-cpds-pill ${pctClsOut}">${pctOut.toFixed(1)}%</span>`
      : "";
    const mktDisplayName = ten_mkt === "__ALL__" ? "TỔNG CÔNG TY" : ten_mkt;
    const scopeText = spFilterNorm ? `${escape_html(mktDisplayName)} (${escape_html(spFilterNorm)})` : escape_html(mktDisplayName);
    reconcileRight.innerHTML =
      `<span>Tổng ${scopeText}: <strong class="mc-rec-total-val">${escape_html(format_tien_vnd(rec.outsideTotalDs))}</strong> (${rec.outsideTotalCount} đơn)</span>` +
      pctOutBadge;

    reconcileBar.classList.remove("hidden");
  } else {
    reconcileBar.classList.add("hidden");
  }
}

function loc_camp_theo_sp(campsList, spFilter = "") {
  const spFilterNorm = String(spFilter || "").trim().toUpperCase();
  const list = Array.isArray(campsList) ? campsList : [];
  if (!spFilterNorm) return list;
  return list.filter((c) => {
    const csp = String((c && c.sp) || "").trim().toUpperCase();
    if (csp === spFilterNorm) return true;
    if (c && c.campaign_name) {
      const extracted = String(trich_xuat_ten_mau_thong_minh(c.campaign_name) || "").trim().toUpperCase();
      if (extracted === spFilterNorm) return true;
    }
    return false;
  });
}

function lay_tat_ca_camp_cong_ty(sourceCampsMap) {
  const result = [];
  if (!sourceCampsMap || typeof sourceCampsMap !== "object") return result;
  for (const mktKey of Object.keys(sourceCampsMap)) {
    if (mktKey === "__ALL__") continue;
    const arr = sourceCampsMap[mktKey];
    if (!Array.isArray(arr)) continue;
    for (const c of arr) {
      if (c) result.push({ ...c, _ownerMkt: mktKey });
    }
  }
  return result;
}

function build_card_camp_pill_html(ten_mkt, spFilter = "") {
  if (!ten_mkt) return "";
  const isAll = (ten_mkt === "__ALL__");
  const rawCamps = isAll
    ? lay_tat_ca_camp_cong_ty(cached_fb_camps)
    : ((cached_fb_camps && cached_fb_camps[ten_mkt]) || []);
  const filtered = loc_camp_theo_sp(rawCamps, spFilter);
  const campCount = filtered.length;
  if (campCount <= 0) return "";
  const mktLabel = isAll ? "toàn công ty" : ten_mkt;
  const scopeLabel = spFilter ? `mã ${spFilter} (${mktLabel})` : mktLabel;
  const title = `Bấm để xem ${campCount} Camp đang chạy của ${scopeLabel}`;
  return `<span class="card-camp-hint clickable-hint js-btn-view-card-camps" title="${escape_html(title)}">${campCount} Camp</span>`;
}

function is_fb_camp_paused(camp) {
  const eff = String((camp && camp.effective_status) || "").trim().toUpperCase();
  return Boolean(eff && eff !== "ACTIVE");
}

function render_mc_table_rows() {
  const ten_mkt = current_mc_mkt;
  if (!ten_mkt) return;

  const activeStart = mc_date_start || current_start_date;
  const activeEnd = mc_date_end || current_end_date;
  const sourceCampsMap = mc_custom_camps_map || cached_fb_camps || {};

  const isAllMkt = (ten_mkt === "__ALL__");
  const spFilterNorm = String(current_mc_sp || "").trim().toUpperCase();
  const rawCampsList = isAllMkt
    ? lay_tat_ca_camp_cong_ty(sourceCampsMap)
    : (Array.isArray(sourceCampsMap && sourceCampsMap[ten_mkt])
      ? [...sourceCampsMap[ten_mkt]]
      : []);
  const campsList = loc_camp_theo_sp(rawCampsList, spFilterNorm);

  const { countsByCampId, closedByCampId, ordersByCampId, revenueByCampId, outsideReconcile, hasAnyCampColData } = tinh_ket_qua_camp_tu_tong_don(
    ten_mkt,
    campsList,
    activeStart,
    activeEnd,
    spFilterNorm
  );
  last_mc_orders_by_camp = ordersByCampId || {};
  last_mc_orders_by_camp["__UNMATCHED__"] = (outsideReconcile && outsideReconcile.unmatchedRows) || [];
  last_mc_revenue_by_camp = revenueByCampId || {};
  last_mc_outside_reconcile = outsideReconcile || null;
  last_mc_camps_by_id = {};
  for (const campItem of campsList) {
    if (campItem && campItem.campaign_id) {
      last_mc_camps_by_id[campItem.campaign_id] = campItem;
    }
  }

  const searchInput = document.getElementById("mcSearchInput");
  const clearBtn = document.getElementById("btnClearMcSearch");
  const qRaw = (searchInput ? searchInput.value : "").trim().toLowerCase();
  const qNoDau = qRaw ? bo_dau_tieng_viet(qRaw).toLowerCase() : "";
  if (clearBtn) clearBtn.classList.toggle("hidden", !qRaw);

  let filtered = campsList.filter((c) => {
    if (!qRaw) return true;
    const nameL = String(c.campaign_name || "").toLowerCase();
    const nameNd = bo_dau_tieng_viet(nameL).toLowerCase();
    const idL = String(c.campaign_id || "").toLowerCase();
    const spL = String(c.sp || "").toLowerCase();
    const ownerL = String(c._ownerMkt || "").toLowerCase();
    const ownerNd = ownerL ? bo_dau_tieng_viet(ownerL).toLowerCase() : "";
    const statusL = is_fb_camp_paused(c) ? "đang tắt" : "đang bật";
    const statusNd = bo_dau_tieng_viet(statusL).toLowerCase();
    return (
      nameL.includes(qRaw) ||
      nameNd.includes(qNoDau) ||
      idL.includes(qRaw) ||
      spL.includes(qRaw) ||
      statusL.includes(qRaw) ||
      statusNd.includes(qNoDau) ||
      (ownerL && (ownerL.includes(qRaw) || ownerNd.includes(qNoDau)))
    );
  });

  // Ưu tiên Camp Đang bật & tiêu nhiều ở trên, Đang tắt & tiêu ít ở dưới
  filtered.sort((a, b) => {
    const pausedA = is_fb_camp_paused(a) ? 1 : 0;
    const pausedB = is_fb_camp_paused(b) ? 1 : 0;
    if (pausedA !== pausedB) return pausedA - pausedB;
    const spendDiff = (b.spend || 0) - (a.spend || 0);
    if (Math.abs(spendDiff) > 0.001) return spendDiff;
    const resDiff = (countsByCampId[b.campaign_id] || 0) - (countsByCampId[a.campaign_id] || 0);
    if (resDiff !== 0) return resDiff;
    return String(a.campaign_name || "").localeCompare(String(b.campaign_name || ""), "vi");
  });

  const mcMktBadge = document.getElementById("mcMktBadge");
  const mcTableBody = document.getElementById("mcTableBody");
  const mcTableFoot = document.getElementById("mcTableFoot");
  const mcEmptyState = document.getElementById("mcEmptyState");
  const mcFooterBar = document.getElementById("mcFooterBar");
  const mcFooterSummary = document.getElementById("mcFooterSummary");

  const totalSpend = filtered.reduce((acc, c) => acc + (c.spend || 0), 0);
  const totalRevenue = filtered.reduce((acc, c) => acc + ((revenueByCampId && revenueByCampId[c.campaign_id]) || 0), 0);
  const totalImpr = filtered.reduce((acc, c) => acc + (c.impressions || 0), 0);
  const totalClicks = filtered.reduce((acc, c) => acc + (c.link_clicks || 0), 0);
  const totalResults = filtered.reduce((acc, c) => acc + (countsByCampId[c.campaign_id] || 0), 0);
  const totalClosed = filtered.reduce((acc, c) => acc + (closedByCampId[c.campaign_id] || 0), 0);

  let totalActiveDailyBudget = 0;
  let activeDailyCount = 0;
  let activeCampCount = 0;
  let pausedCampCount = 0;
  let totalAllDailyBudget = 0;
  let allDailyCount = 0;
  let hasAnyBudgetData = false;
  for (const c of filtered) {
    const dailyB = parseFloat(c.daily_budget || 0) || 0;
    const lifeB = parseFloat(c.lifetime_budget || 0) || 0;
    const isPaused = is_fb_camp_paused(c);
    if (isPaused) pausedCampCount += 1;
    else activeCampCount += 1;
    if (dailyB > 0) {
      hasAnyBudgetData = true;
      allDailyCount += 1;
      totalAllDailyBudget += dailyB;
      if (!isPaused) {
        activeDailyCount += 1;
        totalActiveDailyBudget += dailyB;
      }
    } else if (lifeB > 0) {
      hasAnyBudgetData = true;
    }
  }

  if (mcMktBadge) mcMktBadge.textContent = isAllMkt ? "TỔNG CÔNG TY" : ten_mkt;
  const mcSpFilterBadge = document.getElementById("mcSpFilterBadge");
  const btnMcClearSpFilter = document.getElementById("btnMcClearSpFilter");
  const mcTitleText = document.getElementById("mcTitleText");
  if (mcSpFilterBadge) {
    if (spFilterNorm) {
      mcSpFilterBadge.textContent = spFilterNorm;
      mcSpFilterBadge.classList.remove("hidden");
    } else {
      mcSpFilterBadge.classList.add("hidden");
    }
  }
  if (btnMcClearSpFilter) {
    btnMcClearSpFilter.classList.toggle("hidden", !spFilterNorm);
  }
  if (mcTitleText) {
    mcTitleText.textContent = spFilterNorm
      ? `DANH SÁCH CAMP ĐANG CHẠY — ${spFilterNorm}`
      : "DANH SÁCH CAMP ĐANG CHẠY";
  }

  if (mcTableBody) mcTableBody.innerHTML = "";
  if (mcTableFoot) mcTableFoot.innerHTML = "";

  if (filtered.length === 0) {
    if (mcEmptyState) {
      const titleEl = mcEmptyState.querySelector(".od-empty-title");
      const descEl = mcEmptyState.querySelector(".od-empty-desc");
      if (mc_is_loading_fb) {
        if (titleEl) titleEl.textContent = "Đang tải dữ liệu Camp...";
        if (descEl) descEl.textContent = "Đang đồng bộ số liệu chi phí & kết quả từ Facebook Ads theo khoảng ngày vừa chọn.";
      } else {
        if (titleEl) titleEl.textContent = "Chưa có chiến dịch nào phát sinh chi phí";
        if (descEl) {
          descEl.textContent = spFilterNorm
            ? `Không tìm thấy chiến dịch (Camp) nào cho mã ${spFilterNorm} của MKT này trong khoảng ngày đang chọn.`
            : "Không tìm thấy chiến dịch (Camp) nào của MKT này trong khoảng ngày đang chọn.";
        }
      }
      mcEmptyState.classList.remove("hidden");
    }
    if (mcFooterBar && mcFooterSummary) {
      if (mc_is_loading_fb) {
        mcFooterSummary.textContent = "Đang tải dữ liệu chiến dịch...";
        mcFooterBar.classList.remove("hidden");
      } else {
        mcFooterSummary.textContent = "";
        mcFooterBar.classList.add("hidden");
      }
    }
    cap_nhat_reconcile_bar_mc(ten_mkt, spFilterNorm, campsList, outsideReconcile);
    return;
  }

  if (mcEmptyState) mcEmptyState.classList.add("hidden");

  const frag = document.createDocumentFragment();
  filtered.forEach((c, idx) => {
    const isPaused = is_fb_camp_paused(c);
    const tr = document.createElement("tr");
    tr.className = isPaused ? "mc-row-clickable is-paused" : "mc-row-clickable";
    tr.dataset.campId = c.campaign_id || "";
    tr.title = "Bấm để xem danh sách khách hàng đã đặt từ Camp này";
    const kq = countsByCampId[c.campaign_id] || 0;
    const chot = closedByCampId[c.campaign_id] || 0;
    const spend = c.spend || 0;
    const ds = (revenueByCampId && revenueByCampId[c.campaign_id]) || 0;
    const cpdsHtml = (spend > 0 && ds > 0)
      ? (() => {
          const pct = (spend / ds) * 100;
          const pctCls = pct < 15 ? "val-green" : pct > 25 ? "val-red" : "val-highlight";
          return `<span class="cpds-pill mc-cpds-pill ${pctCls}">${pct.toFixed(1)}%</span>`;
        })()
      : `<span class="mc-metric-val">-</span>`;
    const cpa = kq > 0 ? spend / kq : 0;
    const cpmVal = c.cpm > 0 ? c.cpm : (c.impressions > 0 ? (spend / c.impressions) * 1000 : 0);
    const ctrVal = c.ctr > 0 ? c.ctr : (c.impressions > 0 ? ((c.link_clicks || 0) / c.impressions) * 100 : 0);
    const cpcVal = c.cpc > 0 ? c.cpc : ((c.link_clicks || 0) > 0 ? spend / c.link_clicks : 0);

    const kqSubText = kq > 0
      ? `${format_tien_vnd(cpa)}/số${chot > 0 ? ` • Chốt ${chot}` : ""}`
      : "";
    const campNameSafe = escape_html(c.campaign_name || "(Không tên)");

    const dailyB = parseFloat(c.daily_budget || 0) || 0;
    const lifeB = parseFloat(c.lifetime_budget || 0) || 0;
    let budgetCellHtml = `<span class="mc-metric-val">-</span>`;
    if (dailyB > 0) {
      const subLabel = isPaused
        ? "Đã tắt"
        : (c.budget_type === "ABO_DAILY" ? "Nhóm QC/ngày" : "");
      budgetCellHtml = `
        <div class="mc-budget-wrap">
          <span class="mc-budget-val ${isPaused ? "is-paused" : ""}">${escape_html(format_tien_vnd(dailyB))}</span>
          ${subLabel ? `<div class="mc-budget-sub ${isPaused ? "is-paused" : ""}">${escape_html(subLabel)}</div>` : ""}
        </div>
      `;
    } else if (lifeB > 0) {
      const subLabel = isPaused ? "Trọn đời • Đã tắt" : "Trọn đời";
      budgetCellHtml = `
        <div class="mc-budget-wrap">
          <span class="mc-budget-val ${isPaused ? "is-paused" : ""}">${escape_html(format_tien_vnd(lifeB))}</span>
          <div class="mc-budget-sub ${isPaused ? "is-paused" : ""}">${escape_html(subLabel)}</div>
        </div>
      `;
    }

    const statusBadgeHtml = isPaused
      ? `<span class="mc-status-pill is-paused"><span class="mc-status-dot"></span>Đang tắt</span>`
      : `<span class="mc-status-pill is-active"><span class="mc-status-dot"></span>Đang bật</span>`;

    const subTagsHtml = [
      isAllMkt && c._ownerMkt ? `<span class="mc-mkt-owner-tag">${escape_html(c._ownerMkt)}</span>` : "",
      c.sp ? `<span class="mc-sp-tag">${escape_html(c.sp)}</span>` : "",
    ].filter(Boolean).join("");

    tr.innerHTML = `
      <td class="mc-col-stt"><span class="mc-stt-badge">${idx + 1}</span></td>
      <td class="mc-col-name">
        <div class="mc-camp-name" title="${campNameSafe}">${campNameSafe}</div>
        ${subTagsHtml ? `<div class="mc-camp-sub">${subTagsHtml}</div>` : ""}
      </td>
      <td class="mc-col-status">${statusBadgeHtml}</td>
      <td class="mc-col-result">
        <div class="mc-result-wrap">
          <span class="mc-result-pill ${kq === 0 ? "is-zero" : ""}">${kq}</span>
          ${kqSubText ? `<div class="mc-cpa-sub">${escape_html(kqSubText)}</div>` : ""}
        </div>
      </td>
      <td class="mc-col-budget">${budgetCellHtml}</td>
      <td class="mc-col-spend"><span class="mc-spend-val">${escape_html(format_tien_vnd(spend))}</span></td>
      <td class="mc-col-ds">${ds > 0 ? `<span class="mc-ds-val">${escape_html(format_tien_vnd(ds))}</span>` : `<span class="mc-metric-val">-</span>`}</td>
      <td class="mc-col-cpds">${cpdsHtml}</td>
      <td class="mc-col-cpm"><span class="mc-metric-val">${cpmVal > 0 ? escape_html(format_tien_vnd(cpmVal)) : "-"}</span></td>
      <td class="mc-col-ctr"><span class="mc-ctr-badge">${ctrVal > 0 ? `${ctrVal.toFixed(2)}%` : "0.00%"}</span></td>
      <td class="mc-col-cpc"><span class="mc-metric-val">${cpcVal > 0 ? escape_html(format_tien_vnd(cpcVal)) : "-"}</span></td>
    `;
    frag.appendChild(tr);
  });
  mcTableBody.appendChild(frag);

  if (mcTableFoot) {
    const avgCpm = totalImpr > 0 ? (totalSpend / totalImpr) * 1000 : 0;
    const avgCtr = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0;
    const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const avgCpa = totalResults > 0 ? totalSpend / totalResults : 0;

    let footBudgetHtml = `<span class="mc-metric-val">-</span>`;
    if (totalActiveDailyBudget > 0 && activeDailyCount < allDailyCount) {
      footBudgetHtml = `
        <div class="mc-budget-wrap" title="Tổng tất cả kể cả đã tắt: ${escape_html(format_tien_vnd(totalAllDailyBudget))}">
          <span class="mc-budget-val">${escape_html(format_tien_vnd(totalActiveDailyBudget))}</span>
          <div class="mc-budget-sub">${escape_html(`Đang bật (${activeDailyCount}/${filtered.length})`)}</div>
        </div>
      `;
    } else if (totalActiveDailyBudget > 0) {
      footBudgetHtml = `
        <div class="mc-budget-wrap">
          <span class="mc-budget-val">${escape_html(format_tien_vnd(totalActiveDailyBudget))}</span>
        </div>
      `;
    } else if (totalAllDailyBudget > 0) {
      footBudgetHtml = `
        <div class="mc-budget-wrap">
          <span class="mc-budget-val is-paused">${escape_html(format_tien_vnd(totalAllDailyBudget))}</span>
          <div class="mc-budget-sub is-paused">Đã tắt</div>
        </div>
      `;
    }

    const footCpdsHtml = (totalSpend > 0 && totalRevenue > 0)
      ? (() => {
          const pct = (totalSpend / totalRevenue) * 100;
          const pctCls = pct < 15 ? "val-green" : pct > 25 ? "val-red" : "val-highlight";
          return `<span class="cpds-pill mc-cpds-pill ${pctCls}">${pct.toFixed(1)}%</span>`;
        })()
      : `<span class="mc-metric-val">-</span>`;

    const footStatusHtml = `
      <div class="mc-foot-status-wrap">
        <span class="mc-foot-status-on">${activeCampCount} bật</span>
        ${pausedCampCount > 0 ? `<span class="mc-foot-status-off">${pausedCampCount} tắt</span>` : ""}
      </div>
    `;

    const footTr = document.createElement("tr");
    footTr.className = "mc-foot-row";
    footTr.innerHTML = `
      <td class="mc-col-stt">Σ</td>
      <td class="mc-col-name">TỔNG CỘNG (${filtered.length} Camp)</td>
      <td class="mc-col-status">${footStatusHtml}</td>
      <td class="mc-col-result">
        <div class="mc-result-wrap">
          <span class="mc-result-pill ${totalResults === 0 ? "is-zero" : ""}">${totalResults}</span>
          ${totalResults > 0 ? `<div class="mc-cpa-sub">${escape_html(format_tien_vnd(avgCpa))}/số${totalClosed > 0 ? ` • Chốt ${totalClosed}` : ""}</div>` : ""}
        </div>
      </td>
      <td class="mc-col-budget">${footBudgetHtml}</td>
      <td class="mc-col-spend"><span class="mc-spend-val">${escape_html(format_tien_vnd(totalSpend))}</span></td>
      <td class="mc-col-ds">${totalRevenue > 0 ? `<span class="mc-ds-val">${escape_html(format_tien_vnd(totalRevenue))}</span>` : `<span class="mc-metric-val">-</span>`}</td>
      <td class="mc-col-cpds">${footCpdsHtml}</td>
      <td class="mc-col-cpm"><span class="mc-metric-val">${avgCpm > 0 ? escape_html(format_tien_vnd(avgCpm)) : "-"}</span></td>
      <td class="mc-col-ctr"><span class="mc-ctr-badge">${avgCtr > 0 ? `${avgCtr.toFixed(2)}%` : "0.00%"}</span></td>
      <td class="mc-col-cpc"><span class="mc-metric-val">${avgCpc > 0 ? escape_html(format_tien_vnd(avgCpc)) : "-"}</span></td>
    `;
    mcTableFoot.appendChild(footTr);
  }

  if (mcFooterBar && mcFooterSummary) {
    const statusNotes = [];
    if (Array.isArray(data_tong_don_upyo) && data_tong_don_upyo.length > 1 && !hasAnyCampColData) {
      statusNotes.push("Chưa thấy dữ liệu Campaign ID");
    }
    if (mc_is_loading_fb) {
      statusNotes.push("Đang đồng bộ mới nhất...");
    }
    if (statusNotes.length > 0) {
      mcFooterSummary.textContent = statusNotes.join(" • ");
      mcFooterBar.classList.remove("hidden");
    } else {
      mcFooterSummary.textContent = "";
      mcFooterBar.classList.add("hidden");
    }
  }

  cap_nhat_reconcile_bar_mc(ten_mkt, spFilterNorm, campsList, outsideReconcile);

  if (current_cc_camp_id) {
    render_camp_customers_modal();
  }
}

async function hien_thi_bang_camp_mkt(ten_mkt, spFilter = "") {
  const modal = document.getElementById("mktCampModal");
  if (!modal) return;

  hide_all_popups();
  current_mc_mkt = ten_mkt;
  current_mc_sp = String(spFilter || "").trim();
  mc_date_start = current_start_date;
  mc_date_end = current_end_date;
  mc_custom_camps_map = null;
  mc_is_loading_fb = false;
  update_mc_date_btn_ui();

  const searchInput = document.getElementById("mcSearchInput");
  if (searchInput) searchInput.value = "";

  modal.classList.remove("hidden");
  render_mc_table_rows();

  if (!Array.isArray(data_tong_don_upyo) || data_tong_don_upyo.length < 2) {
    tai_du_lieu_thong_bao_ngam(false).then(() => {
      if (current_mc_mkt === ten_mkt && !modal.classList.contains("hidden")) {
        render_mc_table_rows();
      }
    });
  }
}

function apply_od_filters_and_render(resetLimit = false) {
  if (resetLimit) od_render_limit = 500;

  const searchInput = document.getElementById("odSearchInput");
  const qRaw = (searchInput ? searchInput.value : "").trim().toLowerCase();
  const qNoDau = qRaw ? bo_dau_tieng_viet(qRaw).toLowerCase() : "";

  update_od_xl_header_indicators();

  let baseList;
  if (current_od_mode === "all_table" && od_only_landing_mkt_issue) {
    baseList = lay_danh_sach_don_loi_vao_don();
  } else if (current_od_mode === "all_table" && od_only_dup_mkt) {
    baseList = lay_danh_sach_don_trung_mkt();
  } else {
    baseList = (current_od_mode === "all_table" && od_sort_newest_first)
      ? current_od_raw_list.slice().sort((a, b) => ((b.group_id || b.row_num || 0) - (a.group_id || a.row_num || 0)) || ((a.row_num || 0) - (b.row_num || 0)))
      : current_od_raw_list.slice();
  }

  const activeFilterKeys = current_od_mode === "all_table" ? Object.keys(od_excel_filters) : [];
  const hasDateFilter = current_od_mode === "all_table" && Boolean(od_date_start && od_date_end);
  const onlyMissingTracking = current_od_mode === "all_table" && od_only_missing_tracking;

  const filtered = baseList.filter((o) => {
    if (onlyMissingTracking) {
      const mvd = String(o.ma_van_don || o.parent_ma_van_don || "").trim();
      if (mvd && mvd !== "-" && mvd !== "—") {
        return false;
      }
    }
    if (hasDateFilter) {
      const ymd = parse_order_ymd(o);
      if (!ymd || ymd < od_date_start || ymd > od_date_end) {
        return false;
      }
    }
    for (const colKey of activeFilterKeys) {
      const allowedSet = od_excel_filters[colKey];
      if (allowedSet && !matches_od_col_filter(o, colKey, allowedSet)) {
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
        o.parent_ma_van_don,
        o.parent_ho_ten,
        o.parent_sdt,
        o.parent_dia_chi,
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
    clear_od_sheet_selection();
    tbody.innerHTML = "";
    if (emptyState) emptyState.classList.remove("hidden");
    if (loadMoreWrap) loadMoreWrap.classList.add("hidden");
    if (footerSummary) footerSummary.textContent = "Tổng doanh số: 0 đ • Số đơn: 0";
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");
  clear_od_sheet_selection();

  const sliceCount = Math.min(totalMatched, od_render_limit);
  if (footerSummary) {
    footerSummary.textContent = `Tổng doanh số: ${format_tien_vnd(tong_ds)} • Số đơn: ${totalMatched}`;
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

    const statusColHtml = `<td class="col-trangthai" data-r="${idx}" data-c="12">${order.trang_thai ? `<span class="pill-status ${get_status_pill_cls(order.trang_thai)}">${escape_html(order.trang_thai)}</span>` : "—"}</td>`;
    const extraColsHtml = isAllTableMode
      ? `
        ${statusColHtml}
        <td class="col-ghichu" data-r="${idx}" data-c="13" title="${escape_html(order.ghi_chu)}">${escape_html(order.ghi_chu || "—")}</td>`
      : `
        ${statusColHtml}`;

    rowsHtml[idx] = `
      <tr data-r="${idx}">
        <td class="col-xl-idx" data-r="${idx}" title="Bấm để chọn cả hàng ${idx + 1}">${idx + 1}</td>
        <td class="col-time" data-r="${idx}" data-c="0">${escape_html(order.thoi_gian || "—")}</td>
        <td class="col-mvd" data-r="${idx}" data-c="1">${escape_html(order.ma_van_don || "—")}</td>
        <td class="col-hoten" data-r="${idx}" data-c="2">${escape_html(order.ho_ten || "—")}</td>
        <td class="col-sdt" data-r="${idx}" data-c="3">${escape_html(order.sdt || "—")}</td>
        <td class="col-diachi" data-r="${idx}" data-c="4" title="${escape_html(order.dia_chi)}">${escape_html(order.dia_chi || "—")}</td>
        <td class="col-dongsp" data-r="${idx}" data-c="5">${escape_html(order.dong_sp || "—")}</td>
        <td class="col-mausac" data-r="${idx}" data-c="6">${escape_html(order.mau_sac || "—")}</td>
        <td class="col-size" data-r="${idx}" data-c="7">${escape_html(order.size || "—")}</td>
        <td class="col-giaban" data-r="${idx}" data-c="8">${format_tien_vnd(order.gia_ban)}</td>
        <td class="col-nentang" data-r="${idx}" data-c="9"><span class="pill-platform ${platformCls}">${escape_html(order.nen_tang || "Khác")}</span></td>
        <td class="col-sale" data-r="${idx}" data-c="10">${escape_html(order.sale || "—")}</td>
        <td class="col-mkt" data-r="${idx}" data-c="11"><span class="pill-mkt">${escape_html(order.mkt || "—")}</span></td>${extraColsHtml}
      </tr>`;
  }
  tbody.innerHTML = rowsHtml.join("");
}

// ==============================================================
// CHỌN Ô / HÀNG / CỘT & COPY TSV KIỂU EXCEL / GOOGLE SHEETS (v8.6.296)
// ==============================================================
const odSheetSel = {
  active: false,
  r1: -1,
  c1: -1,
  r2: -1,
  c2: -1,
  mode: "cell", // "cell" | "row" | "col" | "all"
  dragging: false,
  styledCells: [],
  styledHdrs: [],
};

function get_od_sheet_dims() {
  const tbody = document.getElementById("odTableBody");
  const rowCount = tbody ? tbody.rows.length : 0;
  const colCount = current_od_mode === "all_table" ? 14 : 13;
  return { rowCount, colCount };
}

function clear_od_sheet_selection() {
  for (const el of odSheetSel.styledCells) {
    el.classList.remove("od-cell-selected", "od-cell-anchor");
    el.style.removeProperty("--sel-t");
    el.style.removeProperty("--sel-b");
    el.style.removeProperty("--sel-l");
    el.style.removeProperty("--sel-r");
  }
  for (const h of odSheetSel.styledHdrs) {
    h.classList.remove("od-hdr-active");
  }
  odSheetSel.styledCells = [];
  odSheetSel.styledHdrs = [];
  odSheetSel.active = false;
  odSheetSel.dragging = false;
  odSheetSel.r1 = -1;
  odSheetSel.c1 = -1;
  odSheetSel.r2 = -1;
  odSheetSel.c2 = -1;

  const badge = document.getElementById("odSelBadge");
  const copyBtn = document.getElementById("btnOdCopySelection");
  const footerBar = document.getElementById("odFooterBar");
  if (badge) badge.classList.add("hidden");
  if (copyBtn) copyBtn.classList.add("hidden");
  if (footerBar && current_od_mode !== "all_table") {
    footerBar.classList.add("hidden");
  }
}

function render_od_sheet_selection() {
  for (const el of odSheetSel.styledCells) {
    el.classList.remove("od-cell-selected", "od-cell-anchor");
    el.style.removeProperty("--sel-t");
    el.style.removeProperty("--sel-b");
    el.style.removeProperty("--sel-l");
    el.style.removeProperty("--sel-r");
  }
  for (const h of odSheetSel.styledHdrs) {
    h.classList.remove("od-hdr-active");
  }
  odSheetSel.styledCells = [];
  odSheetSel.styledHdrs = [];

  if (!odSheetSel.active) return;
  const tbody = document.getElementById("odTableBody");
  const table = document.getElementById("odTable");
  if (!tbody || !table || tbody.rows.length === 0) {
    clear_od_sheet_selection();
    return;
  }

  const { rowCount, colCount } = get_od_sheet_dims();
  const minR = Math.max(0, Math.min(odSheetSel.r1, odSheetSel.r2));
  const maxR = Math.min(rowCount - 1, Math.max(odSheetSel.r1, odSheetSel.r2));
  const minC = Math.max(0, Math.min(odSheetSel.c1, odSheetSel.c2));
  const maxC = Math.min(colCount - 1, Math.max(odSheetSel.c1, odSheetSel.c2));
  if (minR > maxR || minC > maxC) {
    clear_od_sheet_selection();
    return;
  }

  const newCells = [];
  const newHdrs = [];
  const thList = table.querySelectorAll("thead th[data-col-idx]");
  for (let c = minC; c <= maxC; c++) {
    const th = thList[c];
    if (th) {
      th.classList.add("od-hdr-active");
      newHdrs.push(th);
    }
  }
  if (minR === 0 && maxR === rowCount - 1 && minC === 0 && maxC === colCount - 1) {
    const corner = document.getElementById("odSelectAllCorner");
    if (corner) {
      corner.classList.add("od-hdr-active");
      newHdrs.push(corner);
    }
  }

  for (let r = minR; r <= maxR; r++) {
    const tr = tbody.rows[r];
    if (!tr) continue;
    const idxCell = tr.cells[0];
    if (idxCell) {
      idxCell.classList.add("od-hdr-active");
      newHdrs.push(idxCell);
    }
    for (let c = minC; c <= maxC; c++) {
      const td = tr.cells[c + 1]; // +1 vì cột 0 là số thứ tự hàng (.col-xl-idx)
      if (!td) continue;
      td.classList.add("od-cell-selected");
      if (r === odSheetSel.r1 && c === odSheetSel.c1) {
        td.classList.add("od-cell-anchor");
      }
      if (r === minR) td.style.setProperty("--sel-t", "2px");
      if (r === maxR) td.style.setProperty("--sel-b", "-2px");
      if (c === minC) td.style.setProperty("--sel-l", "2px");
      if (c === maxC) td.style.setProperty("--sel-r", "-2px");
      newCells.push(td);
    }
  }

  odSheetSel.styledCells = newCells;
  odSheetSel.styledHdrs = newHdrs;

  const rSpan = maxR - minR + 1;
  const cSpan = maxC - minC + 1;
  const badge = document.getElementById("odSelBadge");
  const copyBtn = document.getElementById("btnOdCopySelection");
  const footerBar = document.getElementById("odFooterBar");
  if (badge) {
    badge.textContent = `${rSpan} hàng × ${cSpan} cột (${rSpan * cSpan} ô)`;
    badge.classList.remove("hidden");
  }
  if (copyBtn) {
    copyBtn.textContent = "📋 Copy (Ctrl+C)";
    copyBtn.classList.remove("hidden");
  }
  if (footerBar) {
    footerBar.classList.remove("hidden");
  }
}

function get_od_sheet_selection_tsv() {
  if (!odSheetSel.active) return "";
  const tbody = document.getElementById("odTableBody");
  if (!tbody || tbody.rows.length === 0) return "";
  const { rowCount, colCount } = get_od_sheet_dims();
  const minR = Math.max(0, Math.min(odSheetSel.r1, odSheetSel.r2));
  const maxR = Math.min(rowCount - 1, Math.max(odSheetSel.r1, odSheetSel.r2));
  const minC = Math.max(0, Math.min(odSheetSel.c1, odSheetSel.c2));
  const maxC = Math.min(colCount - 1, Math.max(odSheetSel.c1, odSheetSel.c2));
  if (minR > maxR || minC > maxC) return "";

  const lines = [];
  for (let r = minR; r <= maxR; r++) {
    const tr = tbody.rows[r];
    if (!tr) continue;
    const cols = [];
    for (let c = minC; c <= maxC; c++) {
      const td = tr.cells[c + 1];
      let val = td ? String(td.textContent || "").trim() : "";
      if (val === "—") val = "";
      val = val.replace(/[\t\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
      cols.push(val);
    }
    lines.push(cols.join("\t"));
  }
  return lines.join("\n");
}

function show_od_copy_feedback() {
  if (!odSheetSel.active) return;
  const rSpan = Math.abs(odSheetSel.r2 - odSheetSel.r1) + 1;
  const cSpan = Math.abs(odSheetSel.c2 - odSheetSel.c1) + 1;
  const copyBtn = document.getElementById("btnOdCopySelection");
  if (copyBtn) {
    copyBtn.textContent = `✓ Đã copy ${rSpan * cSpan} ô`;
    clearTimeout(copyBtn._resetTimer);
    copyBtn._resetTimer = setTimeout(() => {
      if (odSheetSel.active) copyBtn.textContent = "📋 Copy (Ctrl+C)";
    }, 1500);
  }
}

function focus_od_table_grid() {
  const act = document.activeElement;
  if (act && (act.tagName === "INPUT" || act.tagName === "TEXTAREA" || act.tagName === "SELECT")) {
    try { act.blur(); } catch (e) {}
  }
  const wrapper = document.getElementById("odTableWrapper");
  if (wrapper && wrapper.focus) {
    try { wrapper.focus({ preventScroll: true }); } catch (e2) {}
  }
}

async function copy_od_sheet_selection() {
  const tsv = get_od_sheet_selection_tsv();
  if (!tsv) return false;
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(tsv);
      ok = true;
    }
  } catch (e) {}
  if (!ok) {
    try {
      const ta = document.createElement("textarea");
      ta.value = tsv;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ok = document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (e2) {}
  }
  if (ok) {
    show_od_copy_feedback();
  }
  return ok;
}

let _odSheetInitialized = false;
function init_od_sheet_interactions() {
  if (_odSheetInitialized) return;
  _odSheetInitialized = true;

  const table = document.getElementById("odTable");
  if (!table) return;

  table.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".od-th-filter-btn")) return;

    const { rowCount, colCount } = get_od_sheet_dims();
    if (rowCount === 0) return;

    // 1. Góc trên trái (#) -> chọn toàn bộ bảng
    if (e.target.closest("#odSelectAllCorner")) {
      e.preventDefault();
      focus_od_table_grid();
      odSheetSel.active = true;
      odSheetSel.mode = "all";
      odSheetSel.dragging = false;
      odSheetSel.r1 = 0;
      odSheetSel.c1 = 0;
      odSheetSel.r2 = rowCount - 1;
      odSheetSel.c2 = colCount - 1;
      render_od_sheet_selection();
      return;
    }

    // 2. Tiêu đề cột -> chọn cả cột (hỗ trợ kéo ngang nhiều cột hoặc Shift+Click)
    const th = e.target.closest("thead th[data-col-idx]");
    if (th) {
      e.preventDefault();
      focus_od_table_grid();
      const cIdx = parseInt(th.getAttribute("data-col-idx"), 10);
      if (Number.isNaN(cIdx)) return;
      odSheetSel.active = true;
      odSheetSel.mode = "col";
      odSheetSel.dragging = true;
      if (e.shiftKey && odSheetSel.c1 >= 0) {
        odSheetSel.r1 = 0;
        odSheetSel.r2 = rowCount - 1;
        odSheetSel.c2 = cIdx;
      } else {
        odSheetSel.r1 = 0;
        odSheetSel.r2 = rowCount - 1;
        odSheetSel.c1 = cIdx;
        odSheetSel.c2 = cIdx;
      }
      render_od_sheet_selection();
      return;
    }

    // 3. Ô số thứ tự hàng -> chọn cả hàng (hỗ trợ kéo dọc nhiều hàng hoặc Shift+Click)
    const idxTd = e.target.closest("tbody td.col-xl-idx");
    if (idxTd) {
      e.preventDefault();
      focus_od_table_grid();
      const rIdx = parseInt(idxTd.getAttribute("data-r"), 10);
      if (Number.isNaN(rIdx)) return;
      odSheetSel.active = true;
      odSheetSel.mode = "row";
      odSheetSel.dragging = true;
      if (e.shiftKey && odSheetSel.r1 >= 0) {
        odSheetSel.c1 = 0;
        odSheetSel.c2 = colCount - 1;
        odSheetSel.r2 = rIdx;
      } else {
        odSheetSel.r1 = rIdx;
        odSheetSel.r2 = rIdx;
        odSheetSel.c1 = 0;
        odSheetSel.c2 = colCount - 1;
      }
      render_od_sheet_selection();
      return;
    }

    // 4. Ô dữ liệu -> chọn ô / kéo vùng chữ nhật (hỗ trợ Shift+Click)
    const td = e.target.closest("tbody td[data-r][data-c]");
    if (td) {
      e.preventDefault();
      focus_od_table_grid();
      const rIdx = parseInt(td.getAttribute("data-r"), 10);
      const cIdx = parseInt(td.getAttribute("data-c"), 10);
      if (Number.isNaN(rIdx) || Number.isNaN(cIdx)) return;
      odSheetSel.active = true;
      odSheetSel.mode = "cell";
      odSheetSel.dragging = true;
      if (e.shiftKey && odSheetSel.r1 >= 0 && odSheetSel.c1 >= 0) {
        odSheetSel.r2 = rIdx;
        odSheetSel.c2 = cIdx;
      } else {
        odSheetSel.r1 = rIdx;
        odSheetSel.c1 = cIdx;
        odSheetSel.r2 = rIdx;
        odSheetSel.c2 = cIdx;
      }
      render_od_sheet_selection();
    }
  });

  table.addEventListener("mouseover", (e) => {
    if (!odSheetSel.dragging || !odSheetSel.active) return;
    if (odSheetSel.mode === "col") {
      const th = e.target.closest("thead th[data-col-idx]");
      const td = !th ? e.target.closest("tbody td[data-c]") : null;
      const rawC = th ? th.getAttribute("data-col-idx") : (td ? td.getAttribute("data-c") : null);
      if (rawC !== null) {
        const cIdx = parseInt(rawC, 10);
        if (!Number.isNaN(cIdx) && cIdx !== odSheetSel.c2) {
          odSheetSel.c2 = cIdx;
          render_od_sheet_selection();
        }
      }
      return;
    }
    if (odSheetSel.mode === "row") {
      const rowEl = e.target.closest("tbody tr[data-r]");
      if (rowEl) {
        const rIdx = parseInt(rowEl.getAttribute("data-r"), 10);
        if (!Number.isNaN(rIdx) && rIdx !== odSheetSel.r2) {
          odSheetSel.r2 = rIdx;
          render_od_sheet_selection();
        }
      }
      return;
    }
    const td = e.target.closest("tbody td[data-r][data-c]");
    if (td) {
      const rIdx = parseInt(td.getAttribute("data-r"), 10);
      const cIdx = parseInt(td.getAttribute("data-c"), 10);
      if (!Number.isNaN(rIdx) && !Number.isNaN(cIdx) && (rIdx !== odSheetSel.r2 || cIdx !== odSheetSel.c2)) {
        odSheetSel.r2 = rIdx;
        odSheetSel.c2 = cIdx;
        render_od_sheet_selection();
      }
    }
  });

  window.addEventListener("mouseup", () => {
    odSheetSel.dragging = false;
  });

  document.getElementById("btnOdCopySelection")?.addEventListener("click", (e) => {
    e.stopPropagation();
    copy_od_sheet_selection();
  });

  document.addEventListener("copy", (e) => {
    const modal = document.getElementById("orderDetailModal");
    if (!modal || modal.classList.contains("hidden") || !odSheetSel.active) return;
    const act = document.activeElement;
    if (act && (act.tagName === "INPUT" || act.tagName === "TEXTAREA")) {
      const hasInputSel = typeof act.selectionStart === "number" && act.selectionStart !== act.selectionEnd;
      if (hasInputSel) return;
    }
    const tsv = get_od_sheet_selection_tsv();
    if (!tsv || !e.clipboardData) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", tsv);
    show_od_copy_feedback();
  });

  document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("orderDetailModal");
    if (!modal || modal.classList.contains("hidden")) return;
    const act = document.activeElement;
    const tag = act ? act.tagName : "";
    const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    const isCopyKey = (e.ctrlKey || e.metaKey) && (e.code === "KeyC" || String(e.key || "").toLowerCase() === "c");
    const isSelectAllKey = (e.ctrlKey || e.metaKey) && (e.code === "KeyA" || String(e.key || "").toLowerCase() === "a");

    const { rowCount, colCount } = get_od_sheet_dims();
    if (rowCount === 0) return;

    if (isCopyKey && odSheetSel.active) {
      if (isInput && typeof act.selectionStart === "number" && act.selectionStart !== act.selectionEnd) return;
      e.preventDefault();
      copy_od_sheet_selection();
      return;
    }
    if (isInput) return;

    if (isSelectAllKey) {
      e.preventDefault();
      odSheetSel.active = true;
      odSheetSel.mode = "all";
      odSheetSel.r1 = 0;
      odSheetSel.c1 = 0;
      odSheetSel.r2 = rowCount - 1;
      odSheetSel.c2 = colCount - 1;
      render_od_sheet_selection();
      return;
    }
    if (odSheetSel.active && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      let nr = odSheetSel.r2;
      let nc = odSheetSel.c2;
      if (e.key === "ArrowUp") nr = Math.max(0, nr - 1);
      else if (e.key === "ArrowDown") nr = Math.min(rowCount - 1, nr + 1);
      else if (e.key === "ArrowLeft") nc = Math.max(0, nc - 1);
      else if (e.key === "ArrowRight") nc = Math.min(colCount - 1, nc + 1);
      if (e.shiftKey) {
        odSheetSel.r2 = nr;
        odSheetSel.c2 = nc;
      } else {
        odSheetSel.r1 = nr;
        odSheetSel.c1 = nc;
        odSheetSel.r2 = nr;
        odSheetSel.c2 = nc;
      }
      render_od_sheet_selection();
      const tbody = document.getElementById("odTableBody");
      const targetCell = tbody && tbody.rows[nr] && tbody.rows[nr].cells[nc + 1];
      if (targetCell && targetCell.scrollIntoView) {
        targetCell.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
  });
}

function build_sp_closing_rate_pill_html(ma_str, ten_mkt) {
  const crData = last_closing_rate_data || {};
  let stat = null;
  if (ten_mkt && ma_str) {
    stat = crData.by_mkt_sp && crData.by_mkt_sp[ten_mkt] && crData.by_mkt_sp[ten_mkt][ma_str];
  } else if (ten_mkt && !ma_str) {
    const mktKey = crData.by_mkt && crData.by_mkt[ten_mkt]
      ? ten_mkt
      : chuan_hoa_mkt_dashboard(ten_mkt);
    stat = crData.by_mkt && crData.by_mkt[mktKey];
  } else if (ma_str) {
    stat = crData.by_sp && crData.by_sp[ma_str];
  }
  const dem = (stat && stat.dem) || 0;
  const chot = (stat && stat.chot) || 0;
  const pct = dem > 0 ? (chot / dem) * 100 : 0;
  const pillCls = get_closing_rate_pill_cls(pct, dem);
  const pctFormatted = dem > 0
    ? `${Number.isInteger(Number(pct.toFixed(1))) ? pct.toFixed(0) : pct.toFixed(1)}%`
    : "0%";
  const labelText = dem > 0 ? `Chốt ${pctFormatted} (${chot}/${dem})` : `Chốt 0%`;
  const scopeDesc = ma_str
    ? `mã ${ma_str}${ten_mkt ? ` (${ten_mkt})` : ""}`
    : `${ten_mkt || "MKT"}`;
  const tooltip = dem > 0
    ? `Tỉ lệ chốt Landing ${scopeDesc}: ${pct.toFixed(1)}% (Chốt ${chot}/${dem} số)`
    : `Chưa có số Landing ${scopeDesc} trong khoảng ngày này`;
  return `<span class="sp-cr-pill ${pillCls}" title="${escape_html(tooltip)}">${escape_html(labelText)}</span>`;
}

function create_sp_detail_card(idx, ma_str, count, spend, doanh_so, maxCount) {
  const dict = t();
  const card = document.createElement("div");
  card.className = "cozy-card camp-primary-card";
  card.style.setProperty("--card-index", String(idx));
  card.style.cursor = "pointer";
  card.title = `Nhấn để xem danh sách Camp của ${ma_str}`;

  const topRow = document.createElement("div");
  topRow.className = "card-top-row";
  topRow.innerHTML = `
    <div class="card-title-group">
      <span class="card-name">👟 ${ma_str}</span>
      ${build_sp_closing_rate_pill_html(ma_str, current_mkt_detail)}
      ${build_card_camp_pill_html(current_mkt_detail, ma_str)}
      <span class="card-view-orders-hint clickable-hint js-btn-view-sp-orders" title="Bấm để xem ${count} đơn hàng chi tiết của ${ma_str}">Chi tiết đơn →</span>
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

  // Chỉ nút Chi tiết đơn mới mở chi tiết đơn hàng; bấm các vùng khác (kể cả số đơn) đều mở Camp
  const btnViewSpOrders = topRow.querySelector(".js-btn-view-sp-orders");
  if (btnViewSpOrders) {
    btnViewSpOrders.addEventListener("click", (e) => {
      e.stopPropagation();
      hien_thi_bang_don_hang_chi_tiet(current_mkt_detail, ma_str);
    });
  }

  // Click vào pill Camp hoặc vào card SP để hiện danh sách Camp của riêng mã SP đó
  const btnViewSpCamps = topRow.querySelector(".js-btn-view-card-camps");
  if (btnViewSpCamps) {
    btnViewSpCamps.addEventListener("click", (e) => {
      e.stopPropagation();
      hien_thi_bang_camp_mkt(current_mkt_detail, ma_str);
    });
  }
  card.addEventListener("click", () => {
    hien_thi_bang_camp_mkt(current_mkt_detail, ma_str);
  });

  attach_right_click_copy(card, spend);
  return card;
}

function create_top_sp_card(rank, name_str, count, spend, doanh_so, maxCount) {
  const dict = t();
  const { cls, pillCls, icon, color, barColor } = get_rank_style(rank);

  const card = document.createElement("div");
  card.className = `cozy-card ${cls} camp-primary-card`;
  card.style.setProperty("--card-index", String(rank));
  card.style.cursor = "pointer";
  card.title = `Nhấn để xem danh sách Camp của ${name_str}`;

  const topRow = document.createElement("div");
  topRow.className = "card-top-row";
  topRow.innerHTML = `
    <div class="card-title-group">
      <span class="rank-pill ${pillCls}">${icon ? icon + " " : ""}#${rank}</span>
      <span class="card-name">${name_str}</span>
      ${build_sp_closing_rate_pill_html(name_str, null)}
      ${build_card_camp_pill_html("__ALL__", name_str)}
      <span class="card-view-orders-hint clickable-hint js-btn-view-sp-orders" title="Bấm để xem chi tiết tất cả ${count} đơn của ${name_str}">Chi tiết đơn →</span>
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
  const isSilentBar = Boolean(window._silentDashboardRerender);
  const initWidth = isSilentBar ? sharePct : 0;
  barTrack.innerHTML = `<div class="card-share-bar-fill" style="width: ${initWidth}%; background: ${barColor}"></div>`;
  card.appendChild(barTrack);

  if (!isSilentBar) {
    requestAnimationFrame(() => {
      const fill = barTrack.querySelector(".card-share-bar-fill");
      if (fill) fill.style.width = `${sharePct}%`;
    });
  }

  const countEl = topRow.querySelector(".js-count");
  animate_number(countEl, count, (v) => String(Math.round(v)), 520);

  const btnViewTopSpOrders = topRow.querySelector(".js-btn-view-sp-orders");
  if (btnViewTopSpOrders) {
    btnViewTopSpOrders.addEventListener("click", (e) => {
      e.stopPropagation();
      hien_thi_bang_don_hang_chi_tiet(null, name_str);
    });
  }

  const btnViewCardCamps = topRow.querySelector(".js-btn-view-card-camps");
  if (btnViewCardCamps) {
    btnViewCardCamps.addEventListener("click", (e) => {
      e.stopPropagation();
      hien_thi_bang_camp_mkt("__ALL__", name_str);
    });
  }

  // Click vào thẻ top SP (ngoài vùng Chi tiết đơn / số đơn) để hiện danh sách Camp toàn công ty của mã SP đó
  card.addEventListener("click", () => {
    hien_thi_bang_camp_mkt("__ALL__", name_str);
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
      ? dict.singleDateFmt(format_date_vn_display(start_str))
      : dict.rangeDateFmt(format_date_vn_display(start_str), format_date_vn_display(end_str));

  render_company_summary_card(
    display_date_str,
    tong_don,
    tong_dt,
    tong_chi_phi_all
  );

  // 1b. Bảng Tỷ lệ chốt (trên nút Cập nhật & Cài đặt)
  render_closing_rate_card(tinh_ty_le_chot_theo_ngay(start_str, end_str));

  // 2. Cột MKT (Danh sách hoặc Chi tiết)
  const colMkt = document.getElementById("colMkt");
  const frameMkt = document.getElementById("frameMkt");
  const containerMkt = document.getElementById("containerMkt");
  const btnMktViewCampInline = document.getElementById("btnMktViewCampInline");
  const btnMktViewAllInline = document.getElementById("btnMktViewAllInline");
  const headerMktText = document.getElementById("headerMktText");
  const headerMktIcon = document.getElementById("headerMktIcon");
  const btnBackMkt = document.getElementById("btnBackMkt");

  function ve_danh_sach_top_mkt() {
    current_mkt_detail = null;
    if (colMkt) colMkt.classList.remove("is-mkt-detail");
    if (btnMktViewCampInline) btnMktViewCampInline.classList.add("hidden");
    if (btnMktViewAllInline) btnMktViewAllInline.classList.add("hidden");
    btnBackMkt.classList.add("hidden");
    if (headerMktIcon) headerMktIcon.textContent = "";
    headerMktText.textContent = dict.mktReportHeader;
    containerMkt.innerHTML = "";
    containerMkt.scrollTop = 0;
    if (frameMkt) frameMkt.classList.remove("is-scrolled");

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
      const fragMkt = document.createDocumentFragment();
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
        fragMkt.appendChild(card);
      });
      containerMkt.appendChild(fragMkt);
    }
  }

  function xem_chi_tiet_mkt_inline(ten_mkt) {
    current_mkt_detail = ten_mkt;
    if (colMkt) colMkt.classList.add("is-mkt-detail");
    btnBackMkt.classList.remove("hidden");
    btnBackMkt.onclick = ve_danh_sach_top_mkt;
    if (headerMktIcon) headerMktIcon.textContent = "📊";
    headerMktText.textContent = dict.mktDetailHeader(ten_mkt);
    containerMkt.innerHTML = "";
    containerMkt.scrollTop = 0;
    if (frameMkt) frameMkt.classList.remove("is-scrolled");

    const tong_don_mkt = stats_mkt_don[ten_mkt] || 0;
    const camps_mkt = (cached_fb_camps && cached_fb_camps[ten_mkt]) || [];
    if (btnMktViewCampInline) {
      btnMktViewCampInline.textContent = camps_mkt.length > 0 ? `Xem Camp (${camps_mkt.length})` : "Xem Camp";
      btnMktViewCampInline.title = `Xem danh sách chiến dịch (Camp) đang chạy của ${ten_mkt}`;
      btnMktViewCampInline.classList.remove("hidden");
      btnMktViewCampInline.onclick = () => {
        hien_thi_bang_camp_mkt(ten_mkt);
      };
    }
    if (btnMktViewAllInline) {
      btnMktViewAllInline.textContent = `Xem ${tong_don_mkt} \u0111\u01a1n \u2192`;
      btnMktViewAllInline.title = `Xem danh s\u00e1ch t\u1ea5t c\u1ea3 ${tong_don_mkt} \u0111\u01a1n c\u1ee7a ${ten_mkt} (T\u1ea5t c\u1ea3 m\u00e3 SP)`;
      btnMktViewAllInline.classList.remove("hidden");
      btnMktViewAllInline.onclick = () => {
        hien_thi_bang_don_hang_chi_tiet(ten_mkt, null);
      };
    }

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
      const fragDetail = document.createDocumentFragment();
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
        fragDetail.appendChild(card);
      });
      containerMkt.appendChild(fragDetail);
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
    const fragSp = document.createDocumentFragment();
    top_10_sp.forEach((item, idx) => {
      const card = create_top_sp_card(
        idx + 1,
        item.sp,
        item.don,
        item.tien,
        item.doanh_so,
        maxSpCount
      );
      fragSp.appendChild(card);
    });
    listSp.appendChild(fragSp);
  }
  const frameSp = document.getElementById("frameSp");
  if (frameSp) frameSp.classList.toggle("is-scrolled", listSp.scrollTop > 4);
}

// ==============================================================
// TẢI VÀ CẬP NHẬT DỮ LIỆU THEO NGÀY
// ==============================================================
let initial_load_success = false;
let auto_retry_count = 0;
let auto_retry_timer = null;

const fb_range_cache = new Map();
let _isFirstDashboardSync = true;
let _isDashboardSyncRunning = false;

function run_silent_dashboard_rerender() {
  const appContainerEl = document.getElementById("appContainer");
  if (appContainerEl) appContainerEl.classList.add("is-silent-rerender");
  window._silentDashboardRerender = true;
  try {
    ve_noi_dung_dashboard(
      current_start_date,
      current_end_date,
      cached_fb_chi_tiet,
      cached_fb_tong
    );
  } finally {
    window._silentDashboardRerender = false;
    requestAnimationFrame(() => {
      if (appContainerEl) appContainerEl.classList.remove("is-silent-rerender");
    });
  }
}

let _syncRequestId = 0;

async function tai_va_cap_nhat_theo_ngay(
  isAutoRetry = false,
  skipSheetsIfLoaded = false,
  bypassServerCache = false
) {
  const mySyncId = ++_syncRequestId;
  const isStartupSync = _isFirstDashboardSync;
  _isFirstDashboardSync = false;
  _isDashboardSyncRunning = true;
  const btnRefresh = document.getElementById("btnRefresh");
  const refreshIcon = document.getElementById("refreshIcon");
  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingMainText = document.getElementById("loadingMainText");
  const loadingSubText = document.getElementById("loadingSubText");

  hide_all_popups();

  if (current_start_date > current_end_date) {
    const tmp = current_start_date;
    current_start_date = current_end_date;
    current_end_date = tmp;
    update_date_buttons_text();
  }

  const reqTkStart = clamp_min_data_date(dich_ngay_ymd(current_start_date, -30));
  const reqTkEnd = current_end_date;
  const tkRangeCovered = Boolean(
    thong_ke_loaded_start &&
    thong_ke_loaded_end &&
    thong_ke_loaded_start <= reqTkStart &&
    thong_ke_loaded_end >= reqTkEnd
  );
  const canReuseSheets = Boolean(
    skipSheetsIfLoaded && tkRangeCovered && Array.isArray(data_hien_tai) && data_hien_tai.length > 0
  );
  const fbCacheKey = `${current_start_date}|${current_end_date}`;
  const cachedFbEntry = fb_range_cache.get(fbCacheKey);
  const canReuseFb = Boolean(
    canReuseSheets && cachedFbEntry && Date.now() - cachedFbEntry.timeMs < 60000
  );

  // Chế độ "hiện ngay – làm mới ngầm": đã có dữ liệu trong RAM (hoặc bộ nhớ đệm lần trước) thì vẽ liền, tải mới chạy nền
  let softMode = false;
  if (!canReuseSheets && !isAutoRetry) {
    if (!(Array.isArray(data_hien_tai) && data_hien_tai.length > 0)) {
      const cachedRows = doc_cache_thong_ke() || (await doc_cache_thong_ke_async());
      if (mySyncId !== _syncRequestId) return;
      if (cachedRows) {
        data_hien_tai = cachedRows;
        try {
          rebuild_cust_first_mkt_index();
        } catch (e) {}
      }
    }
    softMode = Boolean((isStartupSync || tkRangeCovered) && Array.isArray(data_hien_tai) && data_hien_tai.length > 0);
  }
  let sheetRefreshOk = true;

  // Nếu đã có dữ liệu Sheet và cache Ads trong 60s -> vẽ lại ngay lập tức không cần overlay xoay
  if (!canReuseFb && !softMode && loadingOverlay) loadingOverlay.classList.remove("hidden");
  if (btnRefresh) btnRefresh.disabled = true;
  if (refreshIcon) refreshIcon.classList.add("spinning");

  let gsSuccess = false;
  try {
    if (!canReuseFb) {
      if (loadingMainText) loadingMainText.textContent = "⏳ Đang tải dữ liệu...";
      if (loadingSubText) {
        loadingSubText.textContent = canReuseSheets
          ? "Đang đồng bộ chi phí Facebook Ads theo khoảng ngày..."
          : "Đang tải ĐƠN TỔNG HỢP & Facebook Ads...";
      }
    }

    if (!canReuseSheets) {
      fb_range_cache.clear();
    }

    const buildFbPromise = () =>
      canReuseFb
        ? Promise.resolve(cachedFbEntry.result)
        : quet_chi_phi_facebook_helper(
            current_start_date,
            current_end_date,
            bypassServerCache
          ).then((res) => {
            if (!res.local_fb_errors || res.local_fb_errors.length === 0) {
              fb_range_cache.set(fbCacheKey, { timeMs: Date.now(), result: res });
              luu_cache_fb_last(current_start_date, current_end_date, res);
            }
            return res;
          });

    let gsResult;
    let fbResult;

    if (softMode) {
      const instantFb =
        (cachedFbEntry && cachedFbEntry.result) ||
        doc_cache_fb_last(current_start_date, current_end_date);
      if (instantFb) {
        cached_fb_chi_tiet = instantFb.local_chi_tiet;
        cached_fb_tong = instantFb.local_tong;
        cached_fb_camps = instantFb.local_camps || {};
      }
      // Chỉ vẽ khung hình đầu tiên kèm animation đếm số khi mới khởi động; bấm Tải Lại hoặc đổi ngày giữ nguyên số đang xem rồi cập nhật êm
      if (isStartupSync) {
        ve_noi_dung_dashboard(current_start_date, current_end_date, cached_fb_chi_tiet, cached_fb_tong);
        trigger_opening_reveal();
      }
      if (loadingOverlay) loadingOverlay.classList.add("hidden");
      const lastSyncSoft = document.getElementById("lastSyncText");
      if (lastSyncSoft) lastSyncSoft.textContent = "⏳ Đang làm mới dữ liệu ngầm...";

      // Nhường main thread & băng thông ~700ms cho animation mở app (đặc biệt lúc Windows mới khởi động) chạy trọn 60fps rồi mới tải mạng ngầm
      if (isStartupSync) {
        await new Promise((r) => setTimeout(r, 700));
        if (mySyncId !== _syncRequestId) return;
      }

      // Đã bỏ lời gọi trùng tai_du_lieu_thong_bao_ngam(true) tại đây vì tai_du_lieu_google_sheets sẽ tự kích hoạt đúng 1 lần
      const sheetsPromise = tai_du_lieu_google_sheets(
        !skipSheetsIfLoaded,
        "",
        "",
        false,
        bypassServerCache
      );
      const fbPromise = buildFbPromise();

      fbResult = await fbPromise;
      if (mySyncId !== _syncRequestId) return;
      cached_fb_chi_tiet = fbResult.local_chi_tiet;
      cached_fb_tong = fbResult.local_tong;
      cached_fb_camps = fbResult.local_camps || {};
      if (Array.isArray(fbResult.local_fb_errors) && fbResult.local_fb_errors.length > 0) {
        show_update_toast_notification(`⚠️ Lỗi Facebook Ads: ${fbResult.local_fb_errors[0]}`);
      }
      run_silent_dashboard_rerender();

      gsResult = await sheetsPromise;
      if (mySyncId !== _syncRequestId) return;
      sheetRefreshOk = Boolean(gsResult);
      gsSuccess = Boolean(data_hien_tai && data_hien_tai.length > 0);
      run_silent_dashboard_rerender();
    } else {
      const fbPromise = buildFbPromise();
      [gsResult, fbResult] = await Promise.all([
        canReuseSheets
          ? Promise.resolve(true)
          : tai_du_lieu_google_sheets(!skipSheetsIfLoaded, "", "", false, bypassServerCache),
        fbPromise,
      ]);
      if (mySyncId !== _syncRequestId) return;
      gsSuccess = Boolean(gsResult && data_hien_tai && data_hien_tai.length > 0);
      cached_fb_chi_tiet = fbResult.local_chi_tiet;
      cached_fb_tong = fbResult.local_tong;
      cached_fb_camps = fbResult.local_camps || {};
      if (Array.isArray(fbResult.local_fb_errors) && fbResult.local_fb_errors.length > 0) {
        show_update_toast_notification(`⚠️ Lỗi Facebook Ads: ${fbResult.local_fb_errors[0]}`);
      }
      ve_noi_dung_dashboard(
        current_start_date,
        current_end_date,
        cached_fb_chi_tiet,
        cached_fb_tong
      );
      trigger_opening_reveal();
    }

    if (!canReuseSheets && sheetRefreshOk) {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      last_sync_time_str = `${hh}:${mm}:${ss}`;
    }

    const lastSyncEl = document.getElementById("lastSyncText");
    if (lastSyncEl) {
      if (gsSuccess && !sheetRefreshOk) {
        lastSyncEl.textContent = "Đang hiện dữ liệu cũ (chưa làm mới được, bấm Tải lại thử lại)";
      } else if (gsSuccess) {
        lastSyncEl.textContent = `${t().lastSyncPrefix}${last_sync_time_str || ""}`;
      } else {
        lastSyncEl.textContent = "Đang chờ kết nối Wi-Fi...";
      }
    }
  } catch (e) {
    console.error("Lỗi khi tải dữ liệu:", e);
  } finally {
    if (mySyncId === _syncRequestId) {
      _isDashboardSyncRunning = false;
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
  }

  if (mySyncId !== _syncRequestId) return;

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

const CAL_PRESET_ORDER = [
  "today",
  "yesterday",
  "this_month",
  "last_month",
  "last_3_days",
  "last_7_days",
  "last_14_days",
];

function get_cal_preset_range(preset, refNow) {
  const now = refNow ? new Date(refNow) : new Date();
  if (preset === "today") {
    const s = format_ymd_date(now);
    return { start: s, end: s };
  }
  if (preset === "yesterday") {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    const s = format_ymd_date(d);
    return { start: s, end: s };
  }
  if (preset === "this_month") {
    return {
      start: format_ymd_date(new Date(now.getFullYear(), now.getMonth(), 1)),
      end: format_ymd_date(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  if (preset === "last_month") {
    return {
      start: format_ymd_date(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      end: format_ymd_date(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  const daysBackMap = { last_3_days: 2, last_7_days: 6, last_14_days: 13 };
  if (preset in daysBackMap) {
    const stDate = new Date(now);
    stDate.setDate(stDate.getDate() - daysBackMap[preset]);
    return { start: format_ymd_date(stDate), end: format_ymd_date(now) };
  }
  return { start: null, end: null };
}

function detect_active_cal_preset(st, en, isOdCal) {
  if (isOdCal && (!st || !en)) return "all_dates";
  const now = new Date();
  for (const preset of CAL_PRESET_ORDER) {
    const r = get_cal_preset_range(preset, now);
    if (r.start && r.end && st === r.start && en === r.end) {
      return preset;
    }
  }
  return "";
}

function update_date_buttons_text() {
  const btn = document.getElementById("btnStartDate");
  const startText = document.getElementById("startDateText");
  const sepText = btn ? btn.querySelector(".date-range-sep") : null;
  const endText = document.getElementById("endDateText");
  cap_nhat_nut_khoang_ngay_ui(startText, sepText, endText, current_start_date, current_end_date, "--/--/----");

  const activePreset = detect_active_cal_preset(current_start_date, current_end_date, false);

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
  // Khi chỉ đổi khoảng ngày xem, không cần tải lại toàn bộ Google Sheets nếu đã có sẵn trong RAM
  tai_va_cap_nhat_theo_ngay(false, true);
  tai_du_lieu_thong_bao_ngam(false).catch(() => {});
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

  const isOdCal = current_cal_target === "od_filter";
  const isMcCal = current_cal_target === "mc_filter";
  const isExpCpCal = current_cal_target === "exp_cp";
  const isExpShipCal = current_cal_target === "exp_ship";
  let rStart = isOdCal
    ? (od_date_start || "")
    : isMcCal
    ? (mc_date_start || current_start_date)
    : isExpCpCal
    ? (exp_cp_date_start || current_start_date)
    : isExpShipCal
    ? (exp_ship_date_start || "")
    : current_start_date;
  let rEnd = isOdCal
    ? (od_date_end || od_date_start || "")
    : isMcCal
    ? (mc_date_end || mc_date_start || current_end_date)
    : isExpCpCal
    ? (exp_cp_date_end || exp_cp_date_start || current_end_date)
    : isExpShipCal
    ? (exp_ship_date_end || exp_ship_date_start || "")
    : current_end_date;

  if (cal_pick_step === 1 && cal_temp_start) {
    const h = cal_hover_date || cal_temp_start;
    rStart = cal_temp_start <= h ? cal_temp_start : h;
    rEnd = cal_temp_start <= h ? h : cal_temp_start;
  }

  const hasRange = Boolean(rStart && rEnd);
  const isSingleDay = hasRange && rStart === rEnd;
  const cells = grid.querySelectorAll(".cal-cell[data-date]");
  cells.forEach((cell) => {
    const d = cell.getAttribute("data-date");
    const isStart = hasRange && d === rStart;
    const isEnd = hasRange && d === rEnd;
    const inBetween = hasRange && d > rStart && d < rEnd;
    const inBand = hasRange && !isSingleDay && d >= rStart && d <= rEnd;

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
      const pickRangeStr = rStart === rEnd
        ? format_date_vn_display(rStart)
        : `${format_date_vn_display(rStart)} → ${format_date_vn_display(rEnd)}`;
      hintEl.innerHTML = `<span class="cal-hint-dot"></span><span>${pickRangeStr}</span><span class="cal-hint-sub">Chọn ngày cuối</span>`;
      hintEl.classList.add("picking");
    } else if (isOdCal && !hasRange) {
      hintEl.innerHTML = `<span class="cal-hint-dot ready"></span><span>Tất cả ngày</span>`;
      hintEl.classList.remove("picking");
    } else {
      const rangeStr = rStart === rEnd
        ? format_date_vn_display(rStart)
        : `${format_date_vn_display(rStart)} → ${format_date_vn_display(rEnd)}`;
      hintEl.innerHTML = `<span class="cal-hint-dot ready"></span><span>${rangeStr}</span>`;
      hintEl.classList.remove("picking");
    }
  }
}

function ap_dung_khoang_ngay_loc_don(st, en) {
  const isCardMode = current_od_mode === "card";
  const effSt = isCardMode ? (st || current_start_date || null) : st;
  const effEn = isCardMode ? (en || current_end_date || null) : en;
  od_date_start = effSt;
  od_date_end = effEn;
  const calPopup = document.getElementById("calendarPopup");
  calPopup?.classList.add("hidden");
  calPopup?.classList.remove("is-modal-cal");
  document.getElementById("btnOdDateRange")?.classList.remove("is-open");
  current_cal_target = null;
  update_od_date_btn_ui();

  if (isCardMode) {
    cap_nhat_text_ngay_chi_tiet_don(effSt, effEn);
    current_od_raw_list = lay_danh_sach_don_chi_tiet(current_od_mkt, current_od_sp, effSt, effEn);
  }
  apply_od_filters_and_render(true);

  if (effSt && effEn) {
    const needTk = !thong_ke_loaded_start || !thong_ke_loaded_end || thong_ke_loaded_start > effSt || thong_ke_loaded_end < effEn;
    if (needTk) {
      tai_du_lieu_google_sheets(false, effSt, effEn).then((ok) => {
        if (!ok) return;
        if (current_od_mode === "all_table") {
          current_od_raw_list = lay_tat_ca_don_hang_tu_bang_a_den_p(false);
          apply_od_filters_and_render(true);
        } else if (current_od_mode === "card") {
          current_od_raw_list = lay_danh_sach_don_chi_tiet(current_od_mkt, current_od_sp, od_date_start, od_date_end);
          apply_od_filters_and_render(true);
        }
      }).catch(() => {});
    }
    tai_du_lieu_thong_bao_ngam(false, effSt, effEn).catch(() => {});
  } else if (!isCardMode && !thong_ke_is_full) {
    tai_du_lieu_google_sheets(false, "", "", true).then((ok) => {
      if (!ok || current_od_mode !== "all_table") return;
      current_od_raw_list = lay_tat_ca_don_hang_tu_bang_a_den_p(false);
      apply_od_filters_and_render(true);
    }).catch(() => {});
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
        // Click lần 2: Chốt khoảng ngày và tải/lọc dữ liệu
        const st = d_str < cal_temp_start ? d_str : cal_temp_start;
        const en = d_str < cal_temp_start ? cal_temp_start : d_str;
        cal_pick_step = 0;
        cal_temp_start = null;
        cal_hover_date = null;
        if (current_cal_target === "od_filter") {
          ap_dung_khoang_ngay_loc_don(st, en);
        } else if (current_cal_target === "mc_filter") {
          const calPopup = document.getElementById("calendarPopup");
          calPopup?.classList.add("hidden");
          calPopup?.classList.remove("is-modal-cal");
          document.getElementById("btnMcDateRange")?.classList.remove("is-open");
          current_cal_target = null;
          tai_camp_mkt_theo_ngay(st, en);
        } else if (current_cal_target === "exp_cp") {
          ap_dung_khoang_ngay_xuat_cp(st, en);
        } else if (current_cal_target === "exp_ship") {
          ap_dung_khoang_ngay_xuat_ship(st, en);
        } else {
          set_and_refresh(st, en);
        }
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
  document.getElementById("avgCallTimePopup")?.classList.add("hidden");
  settingsPopup?.classList.add("hidden");
  close_cal_custom_dropdowns();

  if (!calPopup.classList.contains("hidden") && current_cal_target === targetType) {
    calPopup.classList.add("hidden");
    calPopup.classList.remove("is-modal-cal");
    anchorBtn.classList.remove("is-open");
    current_cal_target = null;
    cal_pick_step = 0;
    cal_temp_start = null;
    cal_hover_date = null;
    return;
  }

  current_cal_target = targetType || "range";
  cal_pick_step = 0;
  cal_temp_start = null;
  cal_hover_date = null;

  const baseDateStr =
    current_cal_target === "od_filter"
      ? (od_date_end || od_date_start || current_end_date || current_start_date)
      : current_cal_target === "mc_filter"
      ? (mc_date_end || mc_date_start || current_end_date || current_start_date)
      : current_cal_target === "exp_cp"
      ? (exp_cp_date_end || exp_cp_date_start || current_end_date || current_start_date)
      : current_cal_target === "exp_ship"
      ? (exp_ship_date_end || exp_ship_date_start || current_end_date || current_start_date)
      : (current_end_date || current_start_date);
  const dt = parse_ymd_date(baseDateStr);
  current_cal_year = dt.getFullYear();
  current_cal_month = dt.getMonth() + 1;

  render_calendar_grid(current_cal_year, current_cal_month);
  sync_cal_preset_sidebar_ui();

  calPopup.classList.toggle(
    "is-modal-cal",
    current_cal_target === "od_filter" ||
      current_cal_target === "mc_filter" ||
      current_cal_target === "exp_cp" ||
      current_cal_target === "exp_ship"
  );
  calPopup.classList.remove("hidden");
  anchorBtn.classList.add("is-open");
  const rect = anchorBtn.getBoundingClientRect();
  const popupWidth = 444;
  let left = rect.left;
  if (left + popupWidth > window.innerWidth - 12) {
    left = window.innerWidth - popupWidth - 12;
  }
  if (left < 12) left = 12;

  calPopup.style.left = `${left}px`;
  calPopup.style.top = `${rect.bottom + 7}px`;
}

function sync_cal_preset_sidebar_ui() {
  const isOdCal = current_cal_target === "od_filter";
  const isAllTableOd = isOdCal && current_od_mode === "all_table";
  const isMcCal = current_cal_target === "mc_filter";
  const isExpCpCal = current_cal_target === "exp_cp";
  const isExpShipCal = current_cal_target === "exp_ship";
  const allBtn = document.getElementById("btnCalAllDates");
  if (allBtn) allBtn.classList.toggle("hidden", !(isAllTableOd || isExpShipCal));

  const st = isOdCal
    ? od_date_start
    : isMcCal
    ? (mc_date_start || current_start_date)
    : isExpCpCal
    ? (exp_cp_date_start || current_start_date)
    : isExpShipCal
    ? exp_ship_date_start
    : current_start_date;
  const en = isOdCal
    ? od_date_end
    : isMcCal
    ? (mc_date_end || current_end_date)
    : isExpCpCal
    ? (exp_cp_date_end || current_end_date)
    : isExpShipCal
    ? exp_ship_date_end
    : current_end_date;
  const activePreset = detect_active_cal_preset(st, en, isAllTableOd || isExpShipCal);

  document.querySelectorAll("#calPresetsSidebar .cal-preset-item").forEach((btn) => {
    btn.classList.toggle("active-preset", btn.getAttribute("data-preset") === activePreset);
  });
}

function apply_cal_preset_choice(preset) {
  const range = get_cal_preset_range(preset);
  const st = range.start;
  const en = range.end;

  if (current_cal_target === "od_filter") {
    ap_dung_khoang_ngay_loc_don(st, en);
  } else if (current_cal_target === "mc_filter" && st && en) {
    const calPopup = document.getElementById("calendarPopup");
    calPopup?.classList.add("hidden");
    calPopup?.classList.remove("is-modal-cal");
    document.getElementById("btnMcDateRange")?.classList.remove("is-open");
    current_cal_target = null;
    tai_camp_mkt_theo_ngay(st, en);
  } else if (current_cal_target === "exp_cp" && st && en) {
    ap_dung_khoang_ngay_xuat_cp(st, en);
  } else if (current_cal_target === "exp_ship") {
    ap_dung_khoang_ngay_xuat_ship(st, en);
  } else if (st && en) {
    set_and_refresh(st, en);
  }
}

function toggle_settings_popup(anchorBtn) {
  const calPopup = document.getElementById("calendarPopup");
  const settingsPopup = document.getElementById("settingsPopup");
  if (!settingsPopup || !anchorBtn) return;

  document.getElementById("allCodesPopup")?.classList.add("hidden");
  document.getElementById("closingRatePopup")?.classList.add("hidden");
  document.getElementById("avgCallTimePopup")?.classList.add("hidden");
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
  if (calPopup) {
    calPopup.classList.add("hidden");
    calPopup.classList.remove("is-modal-cal");
  }
  document.getElementById("btnStartDate")?.classList.remove("is-open");
  document.getElementById("btnOdDateRange")?.classList.remove("is-open");
  document.getElementById("btnMcDateRange")?.classList.remove("is-open");
  if (typeof close_cal_custom_dropdowns === "function") close_cal_custom_dropdowns();
  if (settingsPopup) settingsPopup.classList.add("hidden");
  if (ctxMenu) ctxMenu.classList.add("hidden");
  document.getElementById("allCodesPopup")?.classList.add("hidden");
  document.getElementById("closingRatePopup")?.classList.add("hidden");
  document.getElementById("avgCallTimePopup")?.classList.add("hidden");
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

  const btnAutoStart = document.getElementById("btnToggleAutoStart");
  if (btnAutoStart) {
    btnAutoStart.textContent = bat_khoi_dong_cung_win ? dict.stateOn : dict.stateOff;
    btnAutoStart.classList.toggle("btn-green", bat_khoi_dong_cung_win);
    btnAutoStart.classList.toggle("btn-red", !bat_khoi_dong_cung_win);
  }

  apply_scale_ui();
}

// ==============================================================
// LUỒNG ĐỒNG BỘ SỰ KIỆN NATIVE EXE (quet_don_dinh_ky)
// ==============================================================
async function quet_don_dinh_ky() {
  try {
    // Chế độ Native EXE: Chỉ nhận sự kiện cập nhật phiên bản từ C# server (đã bỏ hoàn toàn quét & thông báo đơn mới)
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
          }
        }
        return;
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

  document.getElementById("btnToday")?.addEventListener("click", (e) => {
    e.stopPropagation();
    apply_cal_preset_choice("today");
  });

  document.getElementById("btnYesterday")?.addEventListener("click", (e) => {
    e.stopPropagation();
    apply_cal_preset_choice("yesterday");
  });

  document.getElementById("btnLastMonth")?.addEventListener("click", (e) => {
    e.stopPropagation();
    apply_cal_preset_choice("last_month");
  });

  document.getElementById("btnThisMonth")?.addEventListener("click", (e) => {
    e.stopPropagation();
    apply_cal_preset_choice("this_month");
  });

  document.getElementById("btnLast3Days")?.addEventListener("click", (e) => {
    e.stopPropagation();
    apply_cal_preset_choice("last_3_days");
  });

  document.getElementById("btnLast7Days")?.addEventListener("click", (e) => {
    e.stopPropagation();
    apply_cal_preset_choice("last_7_days");
  });

  document.getElementById("btnLast14Days")?.addEventListener("click", (e) => {
    e.stopPropagation();
    apply_cal_preset_choice("last_14_days");
  });

  document.getElementById("btnCalAllDates")?.addEventListener("click", (e) => {
    e.stopPropagation();
    apply_cal_preset_choice("all_dates");
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
    ?.addEventListener("click", () => tai_va_cap_nhat_theo_ngay(false, false, true));

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

  const avgCallTimeCard = document.getElementById("avgCallTimeCard");
  avgCallTimeCard?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle_avg_call_time_popup(avgCallTimeCard);
  });
  avgCallTimeCard?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      toggle_avg_call_time_popup(avgCallTimeCard);
    }
  });
  document.getElementById("btnCloseAvgCallTime")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("avgCallTimePopup")?.classList.add("hidden");
  });
  document
    .getElementById("avgCallTimePopup")
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
      "Lâm, đơn mới",
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
      "MKT LÂM\nJULIAN",
      true,
      true,
      "Lâm, đơn mới"
    );
    if (!native_exe_mode) {
      doc_am_thanh("Lâm, đơn mới", true);
    }
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
    if (headerIconEl) {
      headerIconEl.textContent = "↻";
      headerIconEl.classList.add("spinning");
    }
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
      if (headerIconEl) {
        headerIconEl.classList.remove("spinning");
        headerIconEl.textContent = "⬇";
      }
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
      const apiKey = await compute_sha256(val + ":APPLAM_API");
      await set_app_authenticated(rememberChk ? rememberChk.checked : true, apiKey);
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
  init_od_sheet_interactions();
  document.getElementById("btnFilterAllOrders")?.addEventListener("click", (e) => {
    e.stopPropagation();
    hien_thi_bang_loc_don_tong_hop();
  });

  const ensureTongDonUpyoLoaded = async () => {
    const todayStr = format_ymd_date(new Date());
    const tbSt = clamp_min_data_date(od_date_start || lui_ngay_ymd(todayStr, 75));
    const tbEn = clamp_min_data_date(od_date_end || todayStr);
    await tai_du_lieu_thong_bao_ngam(false, tbSt, tbEn).catch(() => {});
  };

  const resetQuickFilterBtnLabels = () => {
    const b1 = document.getElementById("btnOdLandingMktCheck");
    const b2 = document.getElementById("btnOdDupMktCheck");
    if (b1) b1.textContent = "Lỗi vào đơn";
    if (b2) b2.textContent = "Đơn trùng MKT";
  };

  const handleQuickCheckWithBgRefresh = async (modeKey) => {
    const isLandingErr = modeKey === "landing_missing";
    const isActive = isLandingErr ? od_only_landing_mkt_issue : od_only_dup_mkt;
    if (!isActive) {
      resetQuickFilterBtnLabels();
      apply_od_filters_and_render(true);
      return;
    }

    clearOtherQuickFilters(modeKey);
    // Hiển thị ngay kết quả từ dữ liệu hiện có trong RAM, đồng thời cập nhật ngầm nếu thiếu hoặc cũ
    apply_od_filters_and_render(true);

    const todayStr = format_ymd_date(new Date());
    const tbReqStart = clamp_min_data_date(od_date_start ? lui_ngay_ymd(od_date_start, 15) : lui_ngay_ymd(todayStr, 90));
    const tbReqEnd = clamp_min_data_date(od_date_end || todayStr);
    const tbRangeCovered = Boolean(
      thong_bao_loaded_start &&
      thong_bao_loaded_end &&
      thong_bao_loaded_start <= tbReqStart &&
      thong_bao_loaded_end >= tbReqEnd
    );
    const needThongBao =
      Boolean(thong_bao_fetch_promise) ||
      !Array.isArray(data_tong_don_upyo) ||
      data_tong_don_upyo.length === 0 ||
      !tbRangeCovered ||
      Date.now() - thong_bao_last_fetch_ms >= 120000;
    const isThongKeStale = Date.now() - thong_ke_last_fetch_ms >= 45000;
    const needThongKe =
      Boolean(thong_ke_fetch_promise) ||
      !thong_ke_is_full ||
      !Array.isArray(data_hien_tai) ||
      data_hien_tai.length === 0 ||
      isThongKeStale;
    const needPancake =
      Boolean(pancake_fetch_promise) ||
      !Array.isArray(data_pancake_orders) ||
      data_pancake_orders.length === 0 ||
      Date.now() - pancake_last_fetch_ms >= PANCAKE_CACHE_TTL_MS;

    if (!needThongBao && !needThongKe && !needPancake) {
      resetQuickFilterBtnLabels();
      return;
    }

    const activeBtn = document.getElementById(isLandingErr ? "btnOdLandingMktCheck" : "btnOdDupMktCheck");
    const defaultLabel = isLandingErr ? "Lỗi vào đơn" : "Đơn trùng MKT";
    const hasNoDataYet =
      !Array.isArray(data_hien_tai) ||
      data_hien_tai.length === 0 ||
      !Array.isArray(data_tong_don_upyo) ||
      data_tong_don_upyo.length === 0 ||
      !Array.isArray(data_pancake_orders) ||
      data_pancake_orders.length === 0;
    if (activeBtn && hasNoDataYet) {
      activeBtn.textContent = "Đang tải...";
    }

    try {
      const waitBg = Promise.all([
        needThongKe ? tai_du_lieu_google_sheets(isThongKeStale, "", "", true).catch(() => false) : Promise.resolve(false),
        needThongBao ? ensureTongDonUpyoLoaded() : Promise.resolve(),
        needPancake ? tai_du_lieu_pancake(false).catch(() => {}) : Promise.resolve(),
      ]);
      const failSafe = new Promise((resolve) => setTimeout(resolve, 45000));
      await Promise.race([waitBg, failSafe]);
    } finally {
      if (activeBtn) activeBtn.textContent = defaultLabel;
    }

    if (needThongKe && current_od_mode === "all_table") {
      current_od_raw_list = lay_tat_ca_don_hang_tu_bang_a_den_p(false);
      const dateRangeText = document.getElementById("odDateRangeText");
      if (dateRangeText) {
        dateRangeText.textContent = `Tổng cộng ${current_od_raw_list.length} đơn hàng trong bảng`;
      }
    }

    const stillActive = isLandingErr ? od_only_landing_mkt_issue : od_only_dup_mkt;
    if (stillActive) {
      apply_od_filters_and_render(false);
    }
  };

  const clearOtherQuickFilters = (keepKey) => {
    if (keepKey !== "no_tracking") od_only_missing_tracking = false;
    if (keepKey !== "landing_missing") od_only_landing_mkt_issue = false;
    if (keepKey !== "dup_mkt") od_only_dup_mkt = false;
    resetQuickFilterBtnLabels();
  };

  document.getElementById("btnOdNoTracking")?.addEventListener("click", (e) => {
    e.stopPropagation();
    close_od_excel_filter();
    od_only_missing_tracking = !od_only_missing_tracking;
    if (od_only_missing_tracking) clearOtherQuickFilters("no_tracking");
    apply_od_filters_and_render(true);
  });

  document.getElementById("btnOdLandingMktCheck")?.addEventListener("click", (e) => {
    e.stopPropagation();
    close_od_excel_filter();
    od_only_landing_mkt_issue = !od_only_landing_mkt_issue;
    handleQuickCheckWithBgRefresh("landing_missing");
  });

  document.getElementById("btnOdDupMktCheck")?.addEventListener("click", (e) => {
    e.stopPropagation();
    close_od_excel_filter();
    od_only_dup_mkt = !od_only_dup_mkt;
    handleQuickCheckWithBgRefresh("dup_mkt");
  });

  document.getElementById("btnOdDateRange")?.addEventListener("click", (e) => {
    e.stopPropagation();
    close_od_excel_filter();
    toggle_calendar_popup("od_filter", e.currentTarget);
  });

  document.getElementById("btnResetOdColFilters")?.addEventListener("click", (e) => {
    e.stopPropagation();
    od_excel_filters = {};
    od_excel_sort = { col: null, dir: null };
    od_date_start = null;
    od_date_end = null;
    clearOtherQuickFilters("");
    update_od_date_btn_ui();
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

  const attachScrollFrameFade = (listId, frameId) => {
    const listEl = document.getElementById(listId);
    const frameEl = document.getElementById(frameId);
    if (!listEl || !frameEl) return;
    listEl.addEventListener("scroll", () => {
      frameEl.classList.toggle("is-scrolled", listEl.scrollTop > 4);
    }, { passive: true });
  };
  attachScrollFrameFade("containerMkt", "frameMkt");
  attachScrollFrameFade("listSp", "frameSp");

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

  document.getElementById("orderDetailModal")?.addEventListener("click", (e) => {
    if (e.target.id === "orderDetailModal") {
      dong_bang_don_hang_chi_tiet();
    }
  });

  document.getElementById("orderDetailCard")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!e.target.closest("#odExcelFilterPopover") && !e.target.closest(".od-th-filter-btn")) {
      close_od_excel_filter();
    }
    if (current_cal_target === "od_filter" && !e.target.closest("#calendarPopup") && !e.target.closest("#btnOdDateRange")) {
      const calPopup = document.getElementById("calendarPopup");
      calPopup?.classList.add("hidden");
      calPopup?.classList.remove("is-modal-cal");
      document.getElementById("btnOdDateRange")?.classList.remove("is-open");
      current_cal_target = null;
    }
  });

  // Sự kiện Modal Xem Camp MKT (v8.6.224)
  document.getElementById("btnMcDateRange")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle_calendar_popup("mc_filter", e.currentTarget);
  });
  const mcSearchInput = document.getElementById("mcSearchInput");
  const mcClearBtn = document.getElementById("btnClearMcSearch");
  mcSearchInput?.addEventListener("input", () => {
    render_mc_table_rows();
  });
  mcClearBtn?.addEventListener("click", () => {
    if (mcSearchInput) {
      mcSearchInput.value = "";
      mcSearchInput.focus();
      render_mc_table_rows();
    }
  });
  document.getElementById("btnMcClearSpFilter")?.addEventListener("click", (e) => {
    e.stopPropagation();
    current_mc_sp = "";
    render_mc_table_rows();
  });
  document.getElementById("btnCloseMktCamp")?.addEventListener("click", (e) => {
    e.stopPropagation();
    dong_bang_camp_mkt();
  });
  document.getElementById("mktCampModal")?.addEventListener("click", (e) => {
    if (e.target.id === "mktCampModal") {
      dong_bang_camp_mkt();
    }
  });
  document.getElementById("mktCampCard")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (current_cal_target === "mc_filter" && !e.target.closest("#calendarPopup") && !e.target.closest("#btnMcDateRange")) {
      const calPopup = document.getElementById("calendarPopup");
      calPopup?.classList.add("hidden");
      calPopup?.classList.remove("is-modal-cal");
      document.getElementById("btnMcDateRange")?.classList.remove("is-open");
      current_cal_target = null;
    }
  });

  // Sự kiện Modal Khách hàng theo Camp (v8.6.239)
  document.getElementById("mcOutsideReconcileBar")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const rec = last_mc_outside_reconcile;
    if (rec && rec.unmatchedCount > 0) {
      mo_bang_khach_hang_camp("__UNMATCHED__");
    }
  });
  document.getElementById("mcOutsideReconcileBar")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const rec = last_mc_outside_reconcile;
      if (rec && rec.unmatchedCount > 0) {
        mo_bang_khach_hang_camp("__UNMATCHED__");
      }
    }
  });
  document.getElementById("mcTableBody")?.addEventListener("click", (e) => {
    const row = e.target.closest("tr.mc-row-clickable");
    if (!row) return;
    const cid = row.dataset.campId || "";
    if (cid) mo_bang_khach_hang_camp(cid);
  });
  document.getElementById("ccTableBody")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".cc-sdt-btn");
    if (!btn) return;
    e.stopPropagation();
    const sdt = btn.dataset.copySdt || "";
    if (sdt) {
      show_toast_copy(sdt, `Đã copy SĐT: ${sdt}`, e.clientX, e.clientY);
    }
  });
  [
    ["ccFilterAll", "all"],
    ["ccFilterClosed", "closed"],
    ["ccFilterUnclosed", "unclosed"],
  ].forEach(([btnId, filterVal]) => {
    document.getElementById(btnId)?.addEventListener("click", (e) => {
      e.stopPropagation();
      current_cc_filter = filterVal;
      render_camp_customers_modal();
    });
  });
  const ccSearchInput = document.getElementById("ccSearchInput");
  const ccClearBtn = document.getElementById("btnClearCcSearch");
  ccSearchInput?.addEventListener("input", () => {
    render_camp_customers_modal();
  });
  ccClearBtn?.addEventListener("click", () => {
    if (ccSearchInput) {
      ccSearchInput.value = "";
      ccSearchInput.focus();
      render_camp_customers_modal();
    }
  });
  document.getElementById("btnCloseCampCust")?.addEventListener("click", (e) => {
    e.stopPropagation();
    dong_bang_khach_hang_camp();
  });
  document.getElementById("btnBackToCampList")?.addEventListener("click", (e) => {
    e.stopPropagation();
    dong_bang_khach_hang_camp();
  });
  document.getElementById("campCustomersModal")?.addEventListener("click", (e) => {
    if (e.target.id === "campCustomersModal") {
      dong_bang_khach_hang_camp();
    }
  });
  document.getElementById("campCustCard")?.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // TỰ ĐỘNG CẬP NHẬT TỨC THÌ KHI MÁY TÍNH BẮT ĐƯỢC SÓNG WI-FI / INTERNET
  window.addEventListener("online", () => {
    console.log("Phát hiện Windows vừa kết nối Internet thành công!");
    if (auto_retry_timer) {
      clearInterval(auto_retry_timer);
      auto_retry_timer = null;
    }
    if (_isDashboardSyncRunning) return;
    const hasCachedData = Array.isArray(data_hien_tai) && data_hien_tai.length > 0;
    if (hasCachedData) {
      const lastSyncEl = document.getElementById("lastSyncText");
      if (lastSyncEl) lastSyncEl.textContent = "⏳ Đã có Wi-Fi, đang đồng bộ ngầm...";
      tai_va_cap_nhat_theo_ngay(false);
    } else {
      const loadingOverlay = document.getElementById("loadingOverlay");
      const loadingMainText = document.getElementById("loadingMainText");
      const loadingSubText = document.getElementById("loadingSubText");
      if (loadingOverlay) loadingOverlay.classList.remove("hidden");
      if (loadingMainText) loadingMainText.textContent = "⏳ Đã có mạng Wi-Fi!";
      if (loadingSubText) loadingSubText.textContent = "Đang đồng bộ tức thì Google Sheets & Ads...";
      tai_va_cap_nhat_theo_ngay(true);
    }
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
      const calPop = document.getElementById("calendarPopup");
      if (current_cal_target === "od_filter" && calPop && !calPop.classList.contains("hidden")) {
        calPop.classList.add("hidden");
        calPop.classList.remove("is-modal-cal");
        document.getElementById("btnOdDateRange")?.classList.remove("is-open");
        current_cal_target = null;
        return;
      }
      if (current_cal_target === "mc_filter" && calPop && !calPop.classList.contains("hidden")) {
        calPop.classList.add("hidden");
        calPop.classList.remove("is-modal-cal");
        document.getElementById("btnMcDateRange")?.classList.remove("is-open");
        current_cal_target = null;
        return;
      }
      if (current_cal_target === "exp_cp" && calPop && !calPop.classList.contains("hidden")) {
        calPop.classList.add("hidden");
        calPop.classList.remove("is-modal-cal");
        document.getElementById("btnExpCpDateRange")?.classList.remove("is-open");
        current_cal_target = null;
        return;
      }
      if (current_cal_target === "exp_ship" && calPop && !calPop.classList.contains("hidden")) {
        calPop.classList.add("hidden");
        calPop.classList.remove("is-modal-cal");
        document.getElementById("btnExpShipDateRange")?.classList.remove("is-open");
        current_cal_target = null;
        return;
      }
      const vtpSyncModal = document.getElementById("vtpStatusSyncModal");
      if (vtpSyncModal && !vtpSyncModal.classList.contains("hidden")) {
        close_vtp_status_sync_modal();
        return;
      }
      const impMvdModal = document.getElementById("importMvdModal");
      if (impMvdModal && !impMvdModal.classList.contains("hidden")) {
        close_import_mvd_modal();
        return;
      }
      const expShipModal = document.getElementById("exportShipModal");
      if (expShipModal && !expShipModal.classList.contains("hidden")) {
        close_export_ship_modal();
        return;
      }
      const expCpModal = document.getElementById("exportCpModal");
      if (expCpModal && !expCpModal.classList.contains("hidden")) {
        close_export_cp_modal();
        return;
      }
      const ccModal = document.getElementById("campCustomersModal");
      if (ccModal && !ccModal.classList.contains("hidden")) {
        dong_bang_khach_hang_camp();
        return;
      }
      hide_all_popups();
      dong_bang_don_hang_chi_tiet();
      dong_bang_camp_mkt();
    }
  });

  init_export_cp_modal();
  init_export_ship_modal();
  init_import_mvd_modal();
  if (typeof init_vtp_status_sync_modal === "function") init_vtp_status_sync_modal();

  // Kiểm tra trạng thái đăng nhập khi mở app (giữ phiên qua các lần cập nhật trừ khi đổi mật khẩu mới)
  const isAuthed = await check_persisted_auth_session();
  if (!isAuthed) {
    show_auth_lock_screen();
    requestAnimationFrame(() => notify_native_ui_ready());
  } else {
    unlock_app(true);
    await tai_va_cap_nhat_theo_ngay();
  }

  await quet_don_dinh_ky();
  setInterval(quet_don_dinh_ky, 3000);
});

// ==============================================================
// XUẤT BẢN CHI PHÍ (EXCEL .XLSX & GOOGLE SHEETS) - v8.6.303
// ==============================================================
let _exp_cp_current_mkt = "__ALL__";
let _exp_cp_is_busy = false;
let _exp_cp_report_cache = null; // { key, timeMs, report }
let exp_cp_date_start = "";
let exp_cp_date_end = "";
const STORAGE_KEY_EXP_CP_TEST = "applam_exp_cp_test_sp_v1";
let exp_cp_test_codes = new Set();
const exp_cp_test_mode = "merge"; // Luôn gộp vào 1 dòng SP TEST

function get_exp_cp_month_key() {
  const s = exp_cp_date_start || format_ymd_date(new Date());
  return String(s).slice(0, 7);
}

function read_exp_cp_test_store() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EXP_CP_TEST);
    if (!raw) return { byMonth: {} };
    const parsed = JSON.parse(raw);
    return {
      byMonth: parsed && parsed.byMonth && typeof parsed.byMonth === "object" ? parsed.byMonth : {},
    };
  } catch (e) {
    return { byMonth: {} };
  }
}

function load_exp_cp_test_for_current_month() {
  const store = read_exp_cp_test_store();
  const mKey = get_exp_cp_month_key();
  const list = Array.isArray(store.byMonth[mKey]) ? store.byMonth[mKey] : [];
  exp_cp_test_codes = new Set(list.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean));
  render_exp_cp_test_chips();
}

function save_exp_cp_test_for_current_month() {
  try {
    const store = read_exp_cp_test_store();
    store.byMonth[get_exp_cp_month_key()] = Array.from(exp_cp_test_codes);
    localStorage.setItem(STORAGE_KEY_EXP_CP_TEST, JSON.stringify(store));
  } catch (e) {}
}

const _exp_cp_range_spent_cache = new Map(); // key -> { timeMs, map: Map<sp, spend> }
let _exp_cp_spent_req_seq = 0;

function get_exp_cp_spent_map() {
  const rangeKey = `${_exp_cp_current_mkt}|${exp_cp_date_start}|${exp_cp_date_end}`;
  if (_exp_cp_report_cache && _exp_cp_report_cache.key === rangeKey && _exp_cp_report_cache.report) {
    const m = new Map();
    for (const r of _exp_cp_report_cache.report.rows || []) {
      const k = String(r.sp || "").trim().toUpperCase();
      const val = Number(r.totalSpend || 0) || 0;
      if (val > 0 && k && k !== "CHƯA XÁC ĐỊNH") m.set(k, val);
    }
    if (m.size > 0) return m;
  }

  const cachedRange = _exp_cp_range_spent_cache.get(rangeKey);
  if (cachedRange && cachedRange.map instanceof Map) {
    return cachedRange.map;
  }

  const spent = new Map();
  const addSpend = (sp, val) => {
    const k = String(sp || "").trim().toUpperCase();
    const n = Number(val || 0) || 0;
    if (!k || k === "CHƯA XÁC ĐỊNH" || n <= 0) return;
    spent.set(k, (spent.get(k) || 0) + n);
  };

  if (_exp_cp_current_mkt && _exp_cp_current_mkt !== "__ALL__") {
    const mktDict = (cached_fb_chi_tiet && cached_fb_chi_tiet[_exp_cp_current_mkt]) || {};
    for (const [sp, val] of Object.entries(mktDict)) {
      addSpend(sp, val);
    }
  } else {
    if (cached_fb_chi_tiet && typeof cached_fb_chi_tiet === "object") {
      for (const mktDict of Object.values(cached_fb_chi_tiet)) {
        if (!mktDict || typeof mktDict !== "object") continue;
        for (const [sp, val] of Object.entries(mktDict)) {
          addSpend(sp, val);
        }
      }
    }
    if (spent.size === 0 && last_dash_data && last_dash_data.cp) {
      for (const [sp, val] of Object.entries(last_dash_data.cp)) {
        addSpend(sp, val);
      }
    }
  }

  return spent;
}

async function refresh_exp_cp_spent_chips_for_range() {
  const mktName = _exp_cp_current_mkt || "__ALL__";
  const st = exp_cp_date_start;
  const en = exp_cp_date_end;
  if (!st || !en) return;
  const rangeKey = `${mktName}|${st}|${en}`;
  const existing = _exp_cp_range_spent_cache.get(rangeKey);
  if (existing && Date.now() - existing.timeMs < 120000) {
    render_exp_cp_test_chips();
    return;
  }

  const isAllMkt = !mktName || mktName === "__ALL__";
  const targetActs = [];
  const seenActs = new Set();
  for (const m of LIST_MKT_FB) {
    if (isAllMkt || m.ten === mktName) {
      if (!seenActs.has(m.id)) {
        seenActs.add(m.id);
        targetActs.push(m.id);
      }
    }
  }
  if (targetActs.length === 0) return;

  const reqSeq = ++_exp_cp_spent_req_seq;
  const tr = JSON.stringify({ since: st <= en ? st : en, until: st <= en ? en : st });
  const url = build_apps_script_url(
    `fb_acts=${encodeURIComponent(targetActs.join(","))}&time_range=${encodeURIComponent(tr)}`
  );
  if (!url) return;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) return;
    const json = await resp.json();
    if (!json || !json.accounts || typeof json.accounts !== "object") return;

    const spent = new Map();
    for (const actId of targetActs) {
      const acc = json.accounts[actId];
      const list = acc && Array.isArray(acc.data) ? acc.data : [];
      for (const item of list) {
        const val = parseFloat(item.spend || 0) || 0;
        if (val <= 0) continue;
        const campName = String(item.campaign_name || "").trim();
        const campUpper = campName.toUpperCase();
        const campNoDau = bo_dau_tieng_viet(campName).toUpperCase();

        let resolvedMkt = null;
        if (actId === "act_1333165132087237") {
          if (campNoDau.includes("DUNG")) resolvedMkt = "D\u0168NG";
          else if (campUpper.includes("LS")) resolvedMkt = "SAN";
        } else {
          const found = LIST_MKT_FB.find((m) => m.id === actId);
          if (found) resolvedMkt = found.ten;
        }
        if (!resolvedMkt) continue;
        if (!isAllMkt && resolvedMkt !== mktName) continue;

        const spCode = String(trich_xuat_ten_mau_thong_minh(campName) || "").trim().toUpperCase();
        if (!spCode || spCode === "CHƯA XÁC ĐỊNH") continue;
        spent.set(spCode, (spent.get(spCode) || 0) + val);
      }
    }

    _exp_cp_range_spent_cache.set(rangeKey, { timeMs: Date.now(), map: spent });
    if (reqSeq === _exp_cp_spent_req_seq && `${_exp_cp_current_mkt}|${exp_cp_date_start}|${exp_cp_date_end}` === rangeKey) {
      render_exp_cp_test_chips();
    }
  } catch (e) {}
}

function render_exp_cp_test_chips() {
  const wrap = document.getElementById("expCpTestChips");
  const countBadge = document.getElementById("expCpTestCountBadge");
  const clearBtn = document.getElementById("btnExpCpClearTest");
  const q = bo_dau_tieng_viet(String(document.getElementById("expCpTestSearch")?.value || "").trim()).toUpperCase();

  if (countBadge) {
    countBadge.textContent = `${exp_cp_test_codes.size} mã`;
    countBadge.classList.toggle("hidden", exp_cp_test_codes.size === 0);
  }
  if (clearBtn) {
    clearBtn.classList.toggle("hidden", exp_cp_test_codes.size === 0);
  }
  if (!wrap) return;

  const spentMap = get_exp_cp_spent_map();
  const pool = q
    ? Array.from(
        new Set([
          ...Array.from(exp_cp_test_codes),
          ...Array.from(spentMap.keys()),
          ...(Array.isArray(KNOWN_CODES) ? KNOWN_CODES : []).map((s) => String(s || "").trim().toUpperCase()),
        ])
      ).filter((c) => c && c !== "CHƯA XÁC ĐỊNH")
    : Array.from(new Set([...Array.from(exp_cp_test_codes), ...Array.from(spentMap.keys())])).filter(
        (c) => c && c !== "CHƯA XÁC ĐỊNH"
      );

  const filtered = q ? pool.filter((c) => bo_dau_tieng_viet(c).toUpperCase().includes(q)) : pool;

  filtered.sort((a, b) => {
    const sa = exp_cp_test_codes.has(a) ? 0 : 1;
    const sb = exp_cp_test_codes.has(b) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const spa = spentMap.get(a) || 0;
    const spb = spentMap.get(b) || 0;
    if (spa !== spb) return spa - spb; // Chi phí tăng dần
    return a.localeCompare(b);
  });

  if (filtered.length === 0) {
    wrap.innerHTML = q
      ? `<span style="font-size:11.5px;color:var(--choco-muted,#7A5E4C);">Không tìm thấy mã sản phẩm phù hợp</span>`
      : `<span style="font-size:11.5px;color:var(--choco-muted,#7A5E4C);">Chưa có SP phát sinh chi tiêu — gõ tên mã ở trên để tìm thêm</span>`;
    return;
  }

  wrap.innerHTML = filtered
    .map((code) => {
      const sel = exp_cp_test_codes.has(code);
      const spVal = spentMap.get(code) || 0;
      const tip = spVal > 0 ? `${code} • Chi tiêu: ${format_tien_vnd(Math.round(spVal))}` : code;
      return `<button type="button" class="exp-cp-chip${sel ? " is-selected" : ""}" data-sp="${escape_html(code)}" title="${escape_html(tip)}">${sel ? "✓ " : ""}${escape_html(code)}</button>`;
    })
    .join("");
}

function prepare_cp_report_sections(report, testCodesSet, testMode) {
  const days = report.days;
  const selSet = testCodesSet instanceof Set ? testCodesSet : new Set();
  const mode = testMode === "split" ? "split" : "merge";

  const mainRows = [];
  const testRows = [];
  for (const r of report.rows) {
    if (selSet.has(String(r.sp || "").trim().toUpperCase())) {
      testRows.push(r);
    } else {
      mainRows.push(r);
    }
  }

  let mergedTestRow = null;
  if (testRows.length > 0 && mode === "merge") {
    const mergedDays = new Map();
    const mergedCamps = new Set();
    let tSpend = 0;
    let tOrders = 0;
    let tRev = 0;
    for (const tr of testRows) {
      tr.uniqueCamps.forEach((c) => mergedCamps.add(c));
      tSpend += tr.totalSpend;
      tOrders += tr.totalOrders;
      tRev += tr.totalRevenue;
      for (const d of days) {
        const dr = tr.days.get(d.ymd);
        if (!dr) continue;
        if (!mergedDays.has(d.ymd)) {
          mergedDays.set(d.ymd, { camps: new Set(), spend: 0, orders: 0, revenue: 0 });
        }
        const md = mergedDays.get(d.ymd);
        dr.camps.forEach((c) => md.camps.add(c));
        md.spend += dr.spend;
        md.orders += dr.orders;
        md.revenue += dr.revenue;
      }
    }
    mergedTestRow = {
      sp: "SP TEST",
      uniqueCamps: mergedCamps,
      totalSpend: tSpend,
      totalOrders: tOrders,
      totalRevenue: tRev,
      days: mergedDays,
    };
  }

  const sumList = (list) => ({
    camps: list.reduce((s, r) => s + r.uniqueCamps.size, 0),
    spend: list.reduce((s, r) => s + r.totalSpend, 0),
    orders: list.reduce((s, r) => s + r.totalOrders, 0),
    revenue: list.reduce((s, r) => s + r.totalRevenue, 0),
  });

  return {
    mode,
    hasTest: testRows.length > 0,
    mainRows,
    testRows,
    mergedTestRow,
    mainTotals: sumList(mainRows),
    testTotals: sumList(testRows),
    grandTotals: sumList(report.rows),
  };
}

function update_exp_cp_date_btn_ui() {
  const startEl = document.getElementById("expCpDateStartText");
  const sepEl = document.getElementById("expCpDateSep");
  const endEl = document.getElementById("expCpDateEndText");
  cap_nhat_nut_khoang_ngay_ui(startEl, sepEl, endEl, exp_cp_date_start, exp_cp_date_end, "Chọn ngày");
  const badge = document.getElementById("expCpDayCountBadge");
  if (badge) {
    const cnt = build_cp_date_list(exp_cp_date_start, exp_cp_date_end).length;
    badge.textContent = `${cnt} ngày`;
  }
}

function ap_dung_khoang_ngay_xuat_cp(st, en) {
  const calPopup = document.getElementById("calendarPopup");
  calPopup?.classList.add("hidden");
  calPopup?.classList.remove("is-modal-cal");
  document.getElementById("btnExpCpDateRange")?.classList.remove("is-open");
  current_cal_target = null;

  const prevMonth = get_exp_cp_month_key();
  const s = clamp_min_data_date(st || format_ymd_date(new Date()));
  const e = clamp_min_data_date(en || s);
  exp_cp_date_start = s <= e ? s : e;
  exp_cp_date_end = s <= e ? e : s;
  update_exp_cp_date_btn_ui();
  if (get_exp_cp_month_key() !== prevMonth) {
    load_exp_cp_test_for_current_month();
  }
  refresh_exp_cp_spent_chips_for_range();
}

function xlsx_col_letter(colIdx0) {
  let n = colIdx0 + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function xlsx_xml_escape(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xlsx_crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function xlsx_build_zip(entries) {
  const enc = new TextEncoder();
  const localParts = [];
  const cdParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const dataBytes = entry.data instanceof Uint8Array ? entry.data : enc.encode(String(entry.data || ""));
    const crc = xlsx_crc32(dataBytes);
    const size = dataBytes.length;

    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x5977, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);

    localParts.push(lh, dataBytes);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5977, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    cdParts.push(cd);

    offset += lh.length + size;
  }

  let cdSize = 0;
  for (const p of cdParts) cdSize += p.length;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...localParts, ...cdParts, eocd], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function build_cp_date_list(startYmd, endYmd) {
  const days = [];
  const s = clamp_min_data_date(startYmd);
  const e = clamp_min_data_date(endYmd);
  if (!s || !e || s > e) return days;
  const cur = parse_ymd_date(s);
  const endDt = parse_ymd_date(e);
  while (cur <= endDt && days.length < 62) {
    const ymd = format_ymd_date(cur);
    const label = `${cur.getDate()}/${cur.getMonth() + 1}/${cur.getFullYear()}`;
    days.push({ ymd, label });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

async function fetch_daily_cp_report_data(mktName, startYmd, endYmd, onProgress) {
  const days = build_cp_date_list(startYmd, endYmd);
  if (days.length === 0) {
    throw new Error("Khoảng ngày không hợp lệ.");
  }

  const effStart = days[0].ymd;
  const effEnd = days[days.length - 1].ymd;
  const cacheKey = `${mktName}|${effStart}|${effEnd}`;
  if (
    _exp_cp_report_cache &&
    _exp_cp_report_cache.key === cacheKey &&
    Date.now() - _exp_cp_report_cache.timeMs < 60000
  ) {
    if (onProgress) onProgress(100, "Đã dùng dữ liệu vừa tải xong.");
    return _exp_cp_report_cache.report;
  }

  if (onProgress) onProgress(5, "⏳ Đang đồng bộ đơn hàng từ Google Sheets...");
  await tai_du_lieu_google_sheets(false, effStart, effEnd, false).catch(() => false);

  const isAllMkt = !mktName || mktName === "__ALL__";
  const targetActs = [];
  const seenActs = new Set();
  for (const m of LIST_MKT_FB) {
    if (isAllMkt || m.ten === mktName) {
      if (!seenActs.has(m.id)) {
        seenActs.add(m.id);
        targetActs.push(m.id);
      }
    }
  }

  const bySp = new Map();
  const ensureSp = (spCode) => {
    const key = String(spCode || "").trim().toUpperCase();
    if (!key) return null;
    if (!bySp.has(key)) {
      bySp.set(key, {
        sp: key,
        uniqueCamps: new Set(),
        totalSpend: 0,
        totalOrders: 0,
        totalRevenue: 0,
        days: new Map(), // ymd -> { camps: Set, spend, orders, revenue }
      });
    }
    return bySp.get(key);
  };
  const ensureSpDay = (spObj, ymd) => {
    if (!spObj.days.has(ymd)) {
      spObj.days.set(ymd, { camps: new Set(), spend: 0, orders: 0, revenue: 0 });
    }
    return spObj.days.get(ymd);
  };

  // 1. Gom đơn hàng & doanh thu từng ngày
  for (const d of days) {
    const st = dem_don_chi_tiet_theo_ngay(d.ymd, d.ymd);
    const spDonMap = isAllMkt ? (st.sorted_sp || {}) : ((st.stats_mkt_sp_don && st.stats_mkt_sp_don[mktName]) || {});
    const spDtMap = isAllMkt ? (st.stats_sp_dt || {}) : ((st.stats_mkt_sp_dt && st.stats_mkt_sp_dt[mktName]) || {});
    const allKeys = new Set([...Object.keys(spDonMap), ...Object.keys(spDtMap)]);
    for (const spKey of allKeys) {
      const cnt = Number(spDonMap[spKey] || 0) || 0;
      const rev = Number(spDtMap[spKey] || 0) || 0;
      if (cnt <= 0 && rev <= 0) continue;
      const obj = ensureSp(spKey);
      if (!obj) continue;
      const dayRec = ensureSpDay(obj, d.ymd);
      dayRec.orders += cnt;
      dayRec.revenue += rev;
      obj.totalOrders += cnt;
      obj.totalRevenue += rev;
    }
  }

  // 2. Kéo Facebook Insights từng ngày cho đúng TKQC của MKT (song song 4 ngày/lượt)
  let completedDays = 0;
  const totalDays = days.length;
  const fetchOneDayFb = async (d) => {
    if (targetActs.length === 0) return;
    const tr = JSON.stringify({ since: d.ymd, until: d.ymd });
    const url = build_apps_script_url(
      `fb_acts=${encodeURIComponent(targetActs.join(","))}&time_range=${encodeURIComponent(tr)}`
    );
    if (!url) return;
    let json = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      try {
        const resp = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        json = await resp.json();
        break;
      } catch (err) {
        clearTimeout(timer);
        if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (json && json.accounts && typeof json.accounts === "object") {
      for (const actId of targetActs) {
        const acc = json.accounts[actId];
        const list = acc && Array.isArray(acc.data) ? acc.data : [];
        for (const item of list) {
          const spend = parseFloat(item.spend || 0) || 0;
          if (spend <= 0) continue;
          const campId = String(item.campaign_id || "").trim();
          const campName = String(item.campaign_name || "").trim();
          const campUpper = campName.toUpperCase();
          const campNoDau = bo_dau_tieng_viet(campName).toUpperCase();

          let resolvedMkt = null;
          if (actId === "act_1333165132087237") {
            if (campNoDau.includes("DUNG")) resolvedMkt = "D\u0168NG";
            else if (campUpper.includes("LS")) resolvedMkt = "SAN";
          } else {
            const found = LIST_MKT_FB.find((m) => m.id === actId);
            if (found) resolvedMkt = found.ten;
          }
          if (!resolvedMkt) continue;
          if (!isAllMkt && resolvedMkt !== mktName) continue;

          const spCode = trich_xuat_ten_mau_thong_minh(campName);
          const obj = ensureSp(spCode);
          if (!obj) continue;
          const dayRec = ensureSpDay(obj, d.ymd);
          const cKey = campId || campName;
          if (cKey) {
            dayRec.camps.add(cKey);
            obj.uniqueCamps.add(cKey);
          }
          dayRec.spend += spend;
          obj.totalSpend += spend;
        }
      }
    }
  };

  const CONCURRENCY = 4;
  let nextIdx = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, totalDays) }, async () => {
    while (nextIdx < totalDays) {
      const idx = nextIdx++;
      const d = days[idx];
      await fetchOneDayFb(d);
      completedDays += 1;
      const pct = Math.min(98, 10 + Math.round((completedDays / totalDays) * 88));
      if (onProgress) onProgress(pct, `⏳ Đang tải chi phí Facebook Ads (${completedDays}/${totalDays} ngày)...`);
    }
  });
  await Promise.all(workers);

  // 3. Xây danh sách dòng sản phẩm: ưu tiên SP có dữ liệu trước (giảm dần theo chi tiêu/đơn), sau đó các mã còn lại trong KNOWN_CODES
  const activeRows = Array.from(bySp.values())
    .filter((x) => x.totalSpend > 0 || x.totalOrders > 0 || x.totalRevenue > 0)
    .sort((a, b) => (b.totalSpend - a.totalSpend) || (b.totalOrders - a.totalOrders) || a.sp.localeCompare(b.sp));

  const addedSp = new Set(activeRows.map((r) => r.sp));
  const extraRows = [];
  const catalog = Array.isArray(KNOWN_CODES) ? KNOWN_CODES : [];
  for (const code of catalog) {
    const k = String(code || "").trim().toUpperCase();
    if (!k || addedSp.has(k) || k === "CHƯA XÁC ĐỊNH") continue;
    addedSp.add(k);
    extraRows.push({
      sp: k,
      uniqueCamps: new Set(),
      totalSpend: 0,
      totalOrders: 0,
      totalRevenue: 0,
      days: new Map(),
    });
  }
  const rows = [...activeRows, ...extraRows];

  const grandSpend = rows.reduce((s, r) => s + r.totalSpend, 0);
  const grandOrders = rows.reduce((s, r) => s + r.totalOrders, 0);
  const grandRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);

  const report = {
    mktName: isAllMkt ? "TỔNG CÔNG TY" : mktName,
    startYmd: effStart,
    endYmd: effEnd,
    days,
    rows,
    grandSpend,
    grandOrders,
    grandRevenue,
  };
  _exp_cp_report_cache = { key: cacheKey, timeMs: Date.now(), report };
  if (onProgress) onProgress(100, "✅ Đã tải xong dữ liệu chi phí!");
  return report;
}

function build_cp_xlsx_blob(report, opts = {}) {
  const days = report.days;
  const totalCols = 7 + days.length * 4;
  const sec = prepare_cp_report_sections(
    report,
    opts.testCodes instanceof Set ? opts.testCodes : exp_cp_test_codes,
    opts.testMode || exp_cp_test_mode
  );

  const startDt = parse_ymd_date(report.startYmd);
  const endDt = parse_ymd_date(report.endYmd);
  const sameMonth = startDt.getFullYear() === endDt.getFullYear() && startDt.getMonth() === endDt.getMonth();
  const groupTitle = sameMonth
    ? `TỔNG CHI TIÊU THÁNG ${startDt.getMonth() + 1}/${startDt.getFullYear()}`
    : `TỔNG CHI TIÊU (${days[0].label} - ${days[days.length - 1].label})`;

  const rawSheetName = `${report.mktName} - ${String(startDt.getMonth() + 1).padStart(2, "0")}-${String(startDt.getFullYear()).slice(-2)}`;
  const sheetName = rawSheetName.replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "ChiPhi";

  const cellStr = (ref, val, sIdx) =>
    `<c r="${ref}" t="inlineStr" s="${sIdx}"><is><t>${xlsx_xml_escape(val)}</t></is></c>`;
  const cellNum = (ref, num, sIdx) =>
    `<c r="${ref}" s="${sIdx}"><v>${Number.isFinite(num) ? Math.round(num * 10000) / 10000 : 0}</v></c>`;
  const cellBlank = (ref, sIdx) => `<c r="${ref}" s="${sIdx}"/>`;
  const cellFormula = (ref, formula, cachedVal, sIdx) =>
    `<c r="${ref}" s="${sIdx}"><f>${xlsx_xml_escape(formula)}</f><v>${Number.isFinite(cachedVal) ? Math.round(cachedVal * 10000) / 10000 : 0}</v></c>`;

  const sheetRowsXml = [];
  const merges = ["A1:A2", "B1:G1"];

  // Row 1
  const r1Cells = [
    cellStr("A1", "MÃ HÀNG", 1),
    cellStr("B1", groupTitle, 2),
    cellBlank("C1", 2),
    cellBlank("D1", 2),
    cellBlank("E1", 2),
    cellBlank("F1", 2),
    cellBlank("G1", 2),
  ];
  for (let d = 0; d < days.length; d++) {
    const c0 = 7 + d * 4;
    const styleId = d % 2 === 0 ? 3 : 4;
    const refStart = `${xlsx_col_letter(c0)}1`;
    const refEnd = `${xlsx_col_letter(c0 + 3)}1`;
    merges.push(`${refStart}:${refEnd}`);
    r1Cells.push(cellStr(refStart, days[d].label, styleId));
    r1Cells.push(cellBlank(`${xlsx_col_letter(c0 + 1)}1`, styleId));
    r1Cells.push(cellBlank(`${xlsx_col_letter(c0 + 2)}1`, styleId));
    r1Cells.push(cellBlank(`${xlsx_col_letter(c0 + 3)}1`, styleId));
  }
  sheetRowsXml.push(`<row r="1" ht="24" customHeight="1">${r1Cells.join("")}</row>`);

  // Row 2
  const r2Cells = [
    cellBlank("A2", 1),
    cellStr("B2", "Tổng Camp/ Tháng", 2),
    cellStr("C2", "Tổng Tiền chi tiêu", 2),
    cellStr("D2", "Đơn/tháng", 2),
    cellStr("E2", "CP đơn/tháng", 2),
    cellStr("F2", "Doanh thu", 2),
    cellStr("G2", "%CP/DT (CIR)", 2),
  ];
  for (let d = 0; d < days.length; d++) {
    const c0 = 7 + d * 4;
    const styleId = d % 2 === 0 ? 3 : 4;
    r2Cells.push(cellStr(`${xlsx_col_letter(c0)}2`, "Tổng Camp Lên", styleId));
    r2Cells.push(cellStr(`${xlsx_col_letter(c0 + 1)}2`, "Tổng Chi tiêu/ngày", styleId));
    r2Cells.push(cellStr(`${xlsx_col_letter(c0 + 2)}2`, "Đơn/ngày", styleId));
    r2Cells.push(cellStr(`${xlsx_col_letter(c0 + 3)}2`, "Chi phí/đơn", styleId));
  }
  sheetRowsXml.push(`<row r="2" ht="24" customHeight="1">${r2Cells.join("")}</row>`);

  let curRow = 3;
  const pushProductRow = (item, isTestStyle) => {
    const rowNum = curRow++;
    const sLbl = isTestStyle ? 11 : 5;
    const sNum = isTestStyle ? 12 : 6;
    const sPct = isTestStyle ? 13 : 7;
    const spendRefs = [];
    const orderRefs = [];
    const dayCells = [];

    for (let d = 0; d < days.length; d++) {
      const c0 = 7 + d * 4;
      const colCamp = xlsx_col_letter(c0);
      const colSpend = xlsx_col_letter(c0 + 1);
      const colDon = xlsx_col_letter(c0 + 2);
      const colCpd = xlsx_col_letter(c0 + 3);
      spendRefs.push(`${colSpend}${rowNum}`);
      orderRefs.push(`${colDon}${rowNum}`);

      const dRec = item.days.get(days[d].ymd);
      const campCnt = dRec ? dRec.camps.size : 0;
      const spVal = dRec ? Math.round(dRec.spend) : 0;
      const ordVal = dRec ? dRec.orders : 0;
      const cpdVal = ordVal > 0 ? Math.round(spVal / ordVal) : 0;

      dayCells.push(campCnt > 0 ? cellNum(`${colCamp}${rowNum}`, campCnt, sNum) : cellBlank(`${colCamp}${rowNum}`, sNum));
      dayCells.push(spVal > 0 ? cellNum(`${colSpend}${rowNum}`, spVal, sNum) : cellBlank(`${colSpend}${rowNum}`, sNum));
      dayCells.push(ordVal > 0 ? cellNum(`${colDon}${rowNum}`, ordVal, sNum) : cellBlank(`${colDon}${rowNum}`, sNum));
      dayCells.push(
        spVal > 0 || ordVal > 0
          ? cellFormula(`${colCpd}${rowNum}`, `IFERROR(${colSpend}${rowNum}/${colDon}${rowNum},0)`, cpdVal, sNum)
          : cellBlank(`${colCpd}${rowNum}`, sNum)
      );
    }

    const totalSpendInt = Math.round(item.totalSpend);
    const totalRevInt = Math.round(item.totalRevenue);
    const cpaMonth = item.totalOrders > 0 ? Math.round(totalSpendInt / item.totalOrders) : 0;
    const cirMonth = totalRevInt > 0 ? totalSpendInt / totalRevInt : 0;
    const spendSumFormula = spendRefs.length > 0 ? spendRefs.join("+") : "0";
    const orderSumFormula = orderRefs.length > 0 ? orderRefs.join("+") : "0";

    const cells = [
      cellStr(`A${rowNum}`, item.sp, sLbl),
      cellNum(`B${rowNum}`, item.uniqueCamps.size, sNum),
      cellFormula(`C${rowNum}`, spendSumFormula, totalSpendInt, sNum),
      cellFormula(`D${rowNum}`, orderSumFormula, item.totalOrders, sNum),
      cellFormula(`E${rowNum}`, `IFERROR(C${rowNum}/D${rowNum},0)`, cpaMonth, sNum),
      cellNum(`F${rowNum}`, totalRevInt, sNum),
      cellFormula(`G${rowNum}`, `IFERROR(C${rowNum}/F${rowNum},0)`, cirMonth, sPct),
      ...dayCells,
    ];
    sheetRowsXml.push(`<row r="${rowNum}" ht="20" customHeight="1">${cells.join("")}</row>`);
    return rowNum;
  };

  const pushTotalRangeRow = (label, rowStart, rowEnd, srcRows, styleSet) => {
    const totRow = curRow++;
    const sLbl = styleSet === "test" ? 11 : 8;
    const sNum = styleSet === "test" ? 12 : 9;
    const sPct = styleSet === "test" ? 13 : 10;
    const hasRows = rowStart > 0 && rowEnd >= rowStart;
    const totCamps = srcRows.reduce((s, r) => s + r.uniqueCamps.size, 0);
    const totSpend = Math.round(srcRows.reduce((s, r) => s + r.totalSpend, 0));
    const totOrd = srcRows.reduce((s, r) => s + r.totalOrders, 0);
    const totRev = Math.round(srcRows.reduce((s, r) => s + r.totalRevenue, 0));
    const totCpa = totOrd > 0 ? Math.round(totSpend / totOrd) : 0;
    const totCir = totRev > 0 ? totSpend / totRev : 0;

    const cells = [
      cellStr(`A${totRow}`, label, sLbl),
      hasRows ? cellFormula(`B${totRow}`, `SUM(B${rowStart}:B${rowEnd})`, totCamps, sNum) : cellNum(`B${totRow}`, 0, sNum),
      hasRows ? cellFormula(`C${totRow}`, `SUM(C${rowStart}:C${rowEnd})`, totSpend, sNum) : cellNum(`C${totRow}`, 0, sNum),
      hasRows ? cellFormula(`D${totRow}`, `SUM(D${rowStart}:D${rowEnd})`, totOrd, sNum) : cellNum(`D${totRow}`, 0, sNum),
      cellFormula(`E${totRow}`, `IFERROR(C${totRow}/D${totRow},0)`, totCpa, sNum),
      hasRows ? cellFormula(`F${totRow}`, `SUM(F${rowStart}:F${rowEnd})`, totRev, sNum) : cellNum(`F${totRow}`, 0, sNum),
      cellFormula(`G${totRow}`, `IFERROR(C${totRow}/F${totRow},0)`, totCir, sPct),
    ];
    for (let d = 0; d < days.length; d++) {
      const c0 = 7 + d * 4;
      const colCamp = xlsx_col_letter(c0);
      const colSpend = xlsx_col_letter(c0 + 1);
      const colDon = xlsx_col_letter(c0 + 2);
      const colCpd = xlsx_col_letter(c0 + 3);
      let dCamp = 0;
      let dSpend = 0;
      let dOrd = 0;
      for (const r of srcRows) {
        const dr = r.days.get(days[d].ymd);
        if (dr) {
          dCamp += dr.camps.size;
          dSpend += Math.round(dr.spend);
          dOrd += dr.orders;
        }
      }
      const dCpd = dOrd > 0 ? Math.round(dSpend / dOrd) : 0;
      cells.push(hasRows ? cellFormula(`${colCamp}${totRow}`, `SUM(${colCamp}${rowStart}:${colCamp}${rowEnd})`, dCamp, sNum) : cellNum(`${colCamp}${totRow}`, 0, sNum));
      cells.push(hasRows ? cellFormula(`${colSpend}${totRow}`, `SUM(${colSpend}${rowStart}:${colSpend}${rowEnd})`, dSpend, sNum) : cellNum(`${colSpend}${totRow}`, 0, sNum));
      cells.push(hasRows ? cellFormula(`${colDon}${totRow}`, `SUM(${colDon}${rowStart}:${colDon}${rowEnd})`, dOrd, sNum) : cellNum(`${colDon}${totRow}`, 0, sNum));
      cells.push(cellFormula(`${colCpd}${totRow}`, `IFERROR(${colSpend}${totRow}/${colDon}${totRow},0)`, dCpd, sNum));
    }
    sheetRowsXml.push(`<row r="${totRow}" ht="22" customHeight="1">${cells.join("")}</row>`);
    return totRow;
  };

  const pushTotalPairRow = (label, rowA, rowB, allSrcRows) => {
    const totRow = curRow++;
    const totCamps = allSrcRows.reduce((s, r) => s + r.uniqueCamps.size, 0);
    const totSpend = Math.round(allSrcRows.reduce((s, r) => s + r.totalSpend, 0));
    const totOrd = allSrcRows.reduce((s, r) => s + r.totalOrders, 0);
    const totRev = Math.round(allSrcRows.reduce((s, r) => s + r.totalRevenue, 0));
    const totCpa = totOrd > 0 ? Math.round(totSpend / totOrd) : 0;
    const totCir = totRev > 0 ? totSpend / totRev : 0;

    const cells = [
      cellStr(`A${totRow}`, label, 8),
      cellFormula(`B${totRow}`, `B${rowA}+B${rowB}`, totCamps, 9),
      cellFormula(`C${totRow}`, `C${rowA}+C${rowB}`, totSpend, 9),
      cellFormula(`D${totRow}`, `D${rowA}+D${rowB}`, totOrd, 9),
      cellFormula(`E${totRow}`, `IFERROR(C${totRow}/D${totRow},0)`, totCpa, 9),
      cellFormula(`F${totRow}`, `F${rowA}+F${rowB}`, totRev, 9),
      cellFormula(`G${totRow}`, `IFERROR(C${totRow}/F${totRow},0)`, totCir, 10),
    ];
    for (let d = 0; d < days.length; d++) {
      const c0 = 7 + d * 4;
      const colCamp = xlsx_col_letter(c0);
      const colSpend = xlsx_col_letter(c0 + 1);
      const colDon = xlsx_col_letter(c0 + 2);
      const colCpd = xlsx_col_letter(c0 + 3);
      let dCamp = 0;
      let dSpend = 0;
      let dOrd = 0;
      for (const r of allSrcRows) {
        const dr = r.days.get(days[d].ymd);
        if (dr) {
          dCamp += dr.camps.size;
          dSpend += Math.round(dr.spend);
          dOrd += dr.orders;
        }
      }
      const dCpd = dOrd > 0 ? Math.round(dSpend / dOrd) : 0;
      cells.push(cellFormula(`${colCamp}${totRow}`, `${colCamp}${rowA}+${colCamp}${rowB}`, dCamp, 9));
      cells.push(cellFormula(`${colSpend}${totRow}`, `${colSpend}${rowA}+${colSpend}${rowB}`, dSpend, 9));
      cells.push(cellFormula(`${colDon}${totRow}`, `${colDon}${rowA}+${colDon}${rowB}`, dOrd, 9));
      cells.push(cellFormula(`${colCpd}${totRow}`, `IFERROR(${colSpend}${totRow}/${colDon}${totRow},0)`, dCpd, 9));
    }
    sheetRowsXml.push(`<row r="${totRow}" ht="22" customHeight="1">${cells.join("")}</row>`);
    return totRow;
  };

  // Write main rows
  const mainStart = sec.mainRows.length > 0 ? curRow : 0;
  for (const item of sec.mainRows) pushProductRow(item, false);
  const mainEnd = sec.mainRows.length > 0 ? curRow - 1 : 0;

  if (!sec.hasTest) {
    pushTotalRangeRow("Tổng", mainStart, mainEnd, sec.mainRows, "grand");
  } else if (sec.mode === "merge") {
    const spTestRow = pushProductRow(sec.mergedTestRow, true);
    const mainTotRow = pushTotalRangeRow("Tổng hàng chính", mainStart, mainEnd, sec.mainRows, "grand");
    pushTotalPairRow("Tổng cộng", mainTotRow, spTestRow, [...sec.mainRows, sec.mergedTestRow]);
  } else {
    const mainTotRow = pushTotalRangeRow("Tổng hàng chính", mainStart, mainEnd, sec.mainRows, "grand");
    const testStart = curRow;
    for (const item of sec.testRows) pushProductRow(item, true);
    const testEnd = curRow - 1;
    const testTotRow = pushTotalRangeRow("Tổng mẫu test", testStart, testEnd, sec.testRows, "test");
    pushTotalPairRow("Tổng cộng", mainTotRow, testTotRow, report.rows);
  }

  // Column widths
  const colsXml = [
    `<col min="1" max="1" width="18" customWidth="1"/>`,
    `<col min="2" max="2" width="15" customWidth="1"/>`,
    `<col min="3" max="3" width="16" customWidth="1"/>`,
    `<col min="4" max="4" width="12" customWidth="1"/>`,
    `<col min="5" max="5" width="15" customWidth="1"/>`,
    `<col min="6" max="6" width="16" customWidth="1"/>`,
    `<col min="7" max="7" width="13" customWidth="1"/>`,
  ];
  if (days.length > 0) {
    colsXml.push(`<col min="8" max="${totalCols}" width="14" customWidth="1"/>`);
  }

  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane xSplit="7" ySplit="2" topLeftCell="H3" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="20"/>` +
    `<cols>${colsXml.join("")}</cols>` +
    `<sheetData>${sheetRowsXml.join("")}</sheetData>` +
    `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` +
    `</worksheet>`;

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="2">` +
    `<numFmt numFmtId="164" formatCode="#,##0"/>` +
    `<numFmt numFmtId="165" formatCode="0.0%"/>` +
    `</numFmts>` +
    `<fonts count="2">` +
    `<font><sz val="10"/><color rgb="FF1F1F1F"/><name val="Arial"/></font>` +
    `<font><b/><sz val="10"/><color rgb="FF111111"/><name val="Arial"/></font>` +
    `</fonts>` +
    `<fills count="8">` +
    `<fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFF4B183"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FF00E600"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFFFD966"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFEFE4D6"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFD9EAD3"/></patternFill></fill>` +
    `</fills>` +
    `<borders count="2">` +
    `<border><left/><right/><top/><bottom/><diagonal/></border>` +
    `<border><left style="thin"><color rgb="FF333333"/></left><right style="thin"><color rgb="FF333333"/></right><top style="thin"><color rgb="FF333333"/></top><bottom style="thin"><color rgb="FF333333"/></bottom><diagonal/></border>` +
    `</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="14">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
    `<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
    `<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
    `<xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>` +
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>` +
    `<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="1" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>` +
    `<xf numFmtId="164" fontId="1" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>` +
    `<xf numFmtId="165" fontId="1" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="1" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>` +
    `<xf numFmtId="164" fontId="1" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>` +
    `<xf numFmtId="165" fontId="1" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>` +
    `</cellXfs>` +
    `</styleSheet>`;

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rootRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const wbXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${xlsx_xml_escape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const wbRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  return xlsx_build_zip([
    { name: "[Content_Types].xml", data: contentTypesXml },
    { name: "_rels/.rels", data: rootRelsXml },
    { name: "xl/workbook.xml", data: wbXml },
    { name: "xl/_rels/workbook.xml.rels", data: wbRelsXml },
    { name: "xl/styles.xml", data: stylesXml },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml },
  ]);
}

function build_cp_sheet_html_and_tsv(report, opts = {}) {
  const days = report.days;
  const sec = prepare_cp_report_sections(
    report,
    opts.testCodes instanceof Set ? opts.testCodes : exp_cp_test_codes,
    opts.testMode || exp_cp_test_mode
  );
  const startDt = parse_ymd_date(report.startYmd);
  const endDt = parse_ymd_date(report.endYmd);
  const sameMonth = startDt.getFullYear() === endDt.getFullYear() && startDt.getMonth() === endDt.getMonth();
  const groupTitle = sameMonth
    ? `TỔNG CHI TIÊU THÁNG ${startDt.getMonth() + 1}/${startDt.getFullYear()}`
    : `TỔNG CHI TIÊU (${days[0].label} - ${days[days.length - 1].label})`;

  const fmtInt = (n) => Math.round(n || 0);
  const fmtPct = (ratio) => `${(Math.round((ratio || 0) * 1000) / 10).toFixed(1)}%`;
  const bd = "border:1px solid #333333;padding:4px 6px;font-family:Arial,sans-serif;font-size:10pt;";

  const htmlRows = [];
  const tsvRows = [];

  // Row 1
  let h1 = `<th rowspan="2" style="${bd}background:#F4B183;font-weight:bold;text-align:center;">MÃ HÀNG</th>`;
  h1 += `<th colspan="6" style="${bd}background:#00E600;font-weight:bold;text-align:center;">${escape_html(groupTitle)}</th>`;
  const t1 = ["MÃ HÀNG", groupTitle, "", "", "", "", ""];
  for (let d = 0; d < days.length; d++) {
    const bg = d % 2 === 0 ? "#FFD966" : "#FFFF00";
    h1 += `<th colspan="4" style="${bd}background:${bg};font-weight:bold;text-align:center;">${escape_html(days[d].label)}</th>`;
    t1.push(days[d].label, "", "", "");
  }
  htmlRows.push(`<tr>${h1}</tr>`);
  tsvRows.push(t1.join("\t"));

  // Row 2
  const sumHeaders = ["Tổng Camp/ Tháng", "Tổng Tiền chi tiêu", "Đơn/tháng", "CP đơn/tháng", "Doanh thu", "%CP/DT (CIR)"];
  let h2 = sumHeaders.map((t) => `<th style="${bd}background:#00E600;font-weight:bold;text-align:center;">${t}</th>`).join("");
  const t2 = ["", ...sumHeaders];
  for (let d = 0; d < days.length; d++) {
    const bg = d % 2 === 0 ? "#FFD966" : "#FFFF00";
    const sub = ["Tổng Camp Lên", "Tổng Chi tiêu/ngày", "Đơn/ngày", "Chi phí/đơn"];
    h2 += sub.map((t) => `<th style="${bd}background:${bg};font-weight:bold;text-align:center;">${t}</th>`).join("");
    t2.push(...sub);
  }
  htmlRows.push(`<tr>${h2}</tr>`);
  tsvRows.push(t2.join("\t"));

  const appendProductRow = (item, bgHex) => {
    const bgCss = bgHex ? `background:${bgHex};` : "";
    const wtCss = bgHex ? "font-weight:bold;" : "";
    const spInt = fmtInt(item.totalSpend);
    const revInt = fmtInt(item.totalRevenue);
    const cpa = item.totalOrders > 0 ? Math.round(spInt / item.totalOrders) : 0;
    const cir = revInt > 0 ? spInt / revInt : 0;

    let hr = `<td style="${bd}${bgCss}font-weight:bold;text-align:left;">${escape_html(item.sp)}</td>`;
    hr += `<td style="${bd}${bgCss}${wtCss}text-align:right;">${item.uniqueCamps.size}</td>`;
    hr += `<td style="${bd}${bgCss}${wtCss}text-align:right;">${spInt}</td>`;
    hr += `<td style="${bd}${bgCss}${wtCss}text-align:right;">${item.totalOrders}</td>`;
    hr += `<td style="${bd}${bgCss}${wtCss}text-align:right;">${cpa}</td>`;
    hr += `<td style="${bd}${bgCss}${wtCss}text-align:right;">${revInt}</td>`;
    hr += `<td style="${bd}${bgCss}${wtCss}text-align:right;">${fmtPct(cir)}</td>`;
    const tr = [item.sp, item.uniqueCamps.size, spInt, item.totalOrders, cpa, revInt, fmtPct(cir)];

    for (let d = 0; d < days.length; d++) {
      const dr = item.days.get(days[d].ymd);
      const c = dr ? dr.camps.size : 0;
      const s = dr ? fmtInt(dr.spend) : 0;
      const o = dr ? dr.orders : 0;
      const cpd = o > 0 ? Math.round(s / o) : 0;
      hr += `<td style="${bd}${bgCss}${wtCss}text-align:right;">${c || ""}</td>`;
      hr += `<td style="${bd}${bgCss}${wtCss}text-align:right;">${s || ""}</td>`;
      hr += `<td style="${bd}${bgCss}${wtCss}text-align:right;">${o || ""}</td>`;
      hr += `<td style="${bd}${bgCss}${wtCss}text-align:right;">${s || o ? cpd : ""}</td>`;
      tr.push(c || "", s || "", o || "", s || o ? cpd : "");
    }
    htmlRows.push(`<tr>${hr}</tr>`);
    tsvRows.push(tr.join("\t"));
  };

  const appendTotalRow = (label, srcRows, bgHex) => {
    const gSpend = fmtInt(srcRows.reduce((s, r) => s + r.totalSpend, 0));
    const gRev = fmtInt(srcRows.reduce((s, r) => s + r.totalRevenue, 0));
    const gOrd = srcRows.reduce((s, r) => s + r.totalOrders, 0);
    const gCpa = gOrd > 0 ? Math.round(gSpend / gOrd) : 0;
    const gCir = gRev > 0 ? gSpend / gRev : 0;
    const gCamps = srcRows.reduce((s, r) => s + r.uniqueCamps.size, 0);

    let ht = `<td style="${bd}background:${bgHex};font-weight:bold;text-align:left;">${escape_html(label)}</td>`;
    ht += `<td style="${bd}background:${bgHex};font-weight:bold;text-align:right;">${gCamps}</td>`;
    ht += `<td style="${bd}background:${bgHex};font-weight:bold;text-align:right;">${gSpend}</td>`;
    ht += `<td style="${bd}background:${bgHex};font-weight:bold;text-align:right;">${gOrd}</td>`;
    ht += `<td style="${bd}background:${bgHex};font-weight:bold;text-align:right;">${gCpa}</td>`;
    ht += `<td style="${bd}background:${bgHex};font-weight:bold;text-align:right;">${gRev}</td>`;
    ht += `<td style="${bd}background:${bgHex};font-weight:bold;text-align:right;">${fmtPct(gCir)}</td>`;
    const tt = [label, gCamps, gSpend, gOrd, gCpa, gRev, fmtPct(gCir)];

    for (let d = 0; d < days.length; d++) {
      let dc = 0;
      let ds = 0;
      let doCnt = 0;
      for (const r of srcRows) {
        const dr = r.days.get(days[d].ymd);
        if (dr) {
          dc += dr.camps.size;
          ds += fmtInt(dr.spend);
          doCnt += dr.orders;
        }
      }
      const dCpd = doCnt > 0 ? Math.round(ds / doCnt) : 0;
      ht += `<td style="${bd}background:${bgHex};font-weight:bold;text-align:right;">${dc}</td>`;
      ht += `<td style="${bd}background:${bgHex};font-weight:bold;text-align:right;">${ds}</td>`;
      ht += `<td style="${bd}background:${bgHex};font-weight:bold;text-align:right;">${doCnt}</td>`;
      ht += `<td style="${bd}background:${bgHex};font-weight:bold;text-align:right;">${dCpd}</td>`;
      tt.push(dc, ds, doCnt, dCpd);
    }
    htmlRows.push(`<tr>${ht}</tr>`);
    tsvRows.push(tt.join("\t"));
  };

  for (const item of sec.mainRows) appendProductRow(item, "");
  if (!sec.hasTest) {
    appendTotalRow("Tổng", sec.mainRows, "#EFE4D6");
  } else if (sec.mode === "merge") {
    appendProductRow(sec.mergedTestRow, "#D9EAD3");
    appendTotalRow("Tổng hàng chính", sec.mainRows, "#EFE4D6");
    appendTotalRow("Tổng cộng", [...sec.mainRows, sec.mergedTestRow], "#EFE4D6");
  } else {
    appendTotalRow("Tổng hàng chính", sec.mainRows, "#EFE4D6");
    for (const item of sec.testRows) appendProductRow(item, "#D9EAD3");
    appendTotalRow("Tổng mẫu test", sec.testRows, "#D9EAD3");
    appendTotalRow("Tổng cộng", report.rows, "#EFE4D6");
  }

  return {
    html: `<table style="border-collapse:collapse;">${htmlRows.join("")}</table>`,
    tsv: tsvRows.join("\n"),
  };
}

function open_export_cp_modal(mktName) {
  const modal = document.getElementById("exportCpModal");
  if (!modal) return;
  hide_all_popups();

  _exp_cp_current_mkt = mktName || "__ALL__";
  const badge = document.getElementById("expCpMktBadge");
  if (badge) {
    badge.textContent = _exp_cp_current_mkt === "__ALL__" ? "TỔNG CÔNG TY" : `MKT: ${_exp_cp_current_mkt}`;
  }

  const todayStr = format_ymd_date(new Date());
  const baseEnd = clamp_min_data_date(current_end_date || todayStr);
  const endDt = parse_ymd_date(baseEnd);
  const monthStart = clamp_min_data_date(
    `${endDt.getFullYear()}-${String(endDt.getMonth() + 1).padStart(2, "0")}-01`
  );

  exp_cp_date_start = monthStart;
  exp_cp_date_end = baseEnd;
  update_exp_cp_date_btn_ui();
  const testSearchEl = document.getElementById("expCpTestSearch");
  if (testSearchEl) testSearchEl.value = "";
  load_exp_cp_test_for_current_month();
  refresh_exp_cp_spent_chips_for_range();

  document.getElementById("expCpStatusBox")?.classList.add("hidden");
  document.getElementById("expCpSummaryRow")?.classList.add("hidden");
  modal.classList.remove("hidden");
}

function close_export_cp_modal() {
  if (current_cal_target === "exp_cp") {
    const calPopup = document.getElementById("calendarPopup");
    calPopup?.classList.add("hidden");
    calPopup?.classList.remove("is-modal-cal");
    document.getElementById("btnExpCpDateRange")?.classList.remove("is-open");
    current_cal_target = null;
  }
  document.getElementById("exportCpModal")?.classList.add("hidden");
}

function init_export_cp_modal() {
  const modal = document.getElementById("exportCpModal");
  if (!modal) return;

  const setStatus = (pct, text, state = "loading") => {
    const box = document.getElementById("expCpStatusBox");
    const txt = document.getElementById("expCpStatusText");
    const fill = document.getElementById("expCpProgressFill");
    if (box) {
      box.classList.remove("hidden", "is-done", "is-error");
      if (state === "done") box.classList.add("is-done");
      else if (state === "error") box.classList.add("is-error");
    }
    if (txt) txt.textContent = text;
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  };

  const renderSummary = (report) => {
    const el = document.getElementById("expCpSummaryRow");
    if (!el || !report) return;
    const sec = prepare_cp_report_sections(report, exp_cp_test_codes, exp_cp_test_mode);
    const gSpend = Math.round(report.grandSpend);
    const gRev = Math.round(report.grandRevenue);
    const cpa = report.grandOrders > 0 ? Math.round(gSpend / report.grandOrders) : 0;
    const cir = gRev > 0 ? ((gSpend / gRev) * 100).toFixed(1) : "0.0";
    const spendSub = sec.hasTest
      ? `Chính: ${format_tien_vnd(Math.round(sec.mainTotals.spend))} • Test: ${format_tien_vnd(Math.round(sec.testTotals.spend))}`
      : `${report.days.length} ngày • ${report.rows.length} mã`;
    el.innerHTML =
      `<div class="export-cp-kpi-card">` +
      `<span class="export-cp-kpi-label">Chi tiêu Ads</span>` +
      `<span class="export-cp-kpi-val is-spend">${format_tien_vnd(gSpend)}</span>` +
      `<span class="export-cp-kpi-sub" title="${escape_html(spendSub)}">${escape_html(spendSub)}</span>` +
      `</div>` +
      `<div class="export-cp-kpi-card">` +
      `<span class="export-cp-kpi-label">Tổng đơn</span>` +
      `<span class="export-cp-kpi-val is-orders">${report.grandOrders} đơn</span>` +
      `<span class="export-cp-kpi-sub">CP/đơn: ${format_tien_vnd(cpa)}</span>` +
      `</div>` +
      `<div class="export-cp-kpi-card">` +
      `<span class="export-cp-kpi-label">Doanh thu</span>` +
      `<span class="export-cp-kpi-val">${format_tien_vnd(gRev)}</span>` +
      `<span class="export-cp-kpi-sub">CIR: ${cir}%</span>` +
      `</div>`;
    el.classList.remove("hidden");
  };

  const setBusy = (busy) => {
    _exp_cp_is_busy = busy;
    const b1 = document.getElementById("btnDoExportCpXlsx");
    const b2 = document.getElementById("btnDoExportCpCopySheet");
    if (b1) b1.disabled = busy;
    if (b2) b2.disabled = busy;
  };

  const getRange = () => {
    if (!exp_cp_date_start || !exp_cp_date_end) return null;
    const st = clamp_min_data_date(exp_cp_date_start <= exp_cp_date_end ? exp_cp_date_start : exp_cp_date_end);
    const en = clamp_min_data_date(exp_cp_date_start <= exp_cp_date_end ? exp_cp_date_end : exp_cp_date_start);
    return { st, en };
  };

  document.getElementById("btnCloseExportCp")?.addEventListener("click", close_export_cp_modal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close_export_cp_modal();
  });
  document.getElementById("exportCpCard")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (current_cal_target === "exp_cp" && !e.target.closest("#calendarPopup") && !e.target.closest("#btnExpCpDateRange")) {
      const calPopup = document.getElementById("calendarPopup");
      calPopup?.classList.add("hidden");
      calPopup?.classList.remove("is-modal-cal");
      document.getElementById("btnExpCpDateRange")?.classList.remove("is-open");
      current_cal_target = null;
    }
  });

  document.getElementById("btnExpCpDateRange")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle_calendar_popup("exp_cp", e.currentTarget);
  });

  document.getElementById("expCpTestSearch")?.addEventListener("input", () => {
    render_exp_cp_test_chips();
  });

  document.getElementById("btnExpCpClearTest")?.addEventListener("click", () => {
    exp_cp_test_codes.clear();
    save_exp_cp_test_for_current_month();
    render_exp_cp_test_chips();
  });

  document.getElementById("expCpTestChips")?.addEventListener("click", (e) => {
    const chip = e.target.closest(".exp-cp-chip[data-sp]");
    if (!chip) return;
    const code = chip.getAttribute("data-sp");
    if (!code) return;
    if (exp_cp_test_codes.has(code)) exp_cp_test_codes.delete(code);
    else exp_cp_test_codes.add(code);
    save_exp_cp_test_for_current_month();
    render_exp_cp_test_chips();
  });

  document.getElementById("btnDoExportCpXlsx")?.addEventListener("click", async () => {
    if (_exp_cp_is_busy) return;
    const range = getRange();
    if (!range) {
      setStatus(0, "Vui lòng chọn khoảng thời gian muốn xuất bản.", "error");
      return;
    }
    setBusy(true);
    try {
      const report = await fetch_daily_cp_report_data(_exp_cp_current_mkt, range.st, range.en, (p, m) => setStatus(p, m, "loading"));
      renderSummary(report);
      const blob = build_cp_xlsx_blob(report);
      const safeMkt = bo_dau_tieng_viet(report.mktName).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const fileName = `ChiPhi_${safeMkt}_${report.startYmd}_den_${report.endYmd}.xlsx`;
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(dlUrl), 15000);
      setStatus(100, `Đã xuất file Excel: ${fileName}`, "done");
    } catch (err) {
      setStatus(0, `Lỗi xuất Excel: ${(err && err.message) || err}`, "error");
    } finally {
      setBusy(false);
    }
  });

  document.getElementById("btnDoExportCpCopySheet")?.addEventListener("click", async () => {
    if (_exp_cp_is_busy) return;
    const range = getRange();
    if (!range) {
      setStatus(0, "Vui lòng chọn khoảng thời gian muốn xuất bản.", "error");
      return;
    }
    setBusy(true);
    try {
      const report = await fetch_daily_cp_report_data(_exp_cp_current_mkt, range.st, range.en, (p, m) => setStatus(p, m, "loading"));
      renderSummary(report);
      const { html, tsv } = build_cp_sheet_html_and_tsv(report);
      let copiedRich = false;
      if (navigator.clipboard && typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/html": new Blob([html], { type: "text/html" }),
              "text/plain": new Blob([tsv], { type: "text/plain" }),
            }),
          ]);
          copiedRich = true;
        } catch (eClip) {}
      }
      if (!copiedRich) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(tsv);
        } else {
          const ta = document.createElement("textarea");
          ta.value = tsv;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
      }
      setStatus(
        100,
        copiedRich
          ? "Đã copy bảng (giữ màu + gộp ô)! Vào Google Sheets chọn ô A1 rồi nhấn Ctrl+V."
          : "Đã copy dữ liệu dạng bảng! Vào Google Sheets chọn ô A1 rồi nhấn Ctrl+V.",
        "done"
      );
    } catch (err) {
      setStatus(0, `Lỗi copy bảng: ${(err && err.message) || err}`, "error");
    } finally {
      setBusy(false);
    }
  });
}

// ==============================================================
// XUẤT FILE EXCEL TẠO ĐƠN HÀNG LOẠT (VIETTEL POST / J&T) - v8.6.311
// ==============================================================
const STORAGE_KEY_EXP_SHIP_PREFS = "applam_exp_ship_prefs_v1";
let _exp_ship_carrier = "vtp"; // "vtp" | "jt"
let _exp_ship_last_prepared = null;
let exp_ship_date_start = "";
let exp_ship_date_end = "";
let exp_ship_tag_codes = new Set();

function get_exp_ship_order_tag(o) {
  const t = String((o && o.trang_thai) || "").trim().toUpperCase();
  return t || "(CHƯA CÓ TAG)";
}

function update_exp_ship_date_btn_ui() {
  const startEl = document.getElementById("expShipDateStartText");
  const sepEl = document.getElementById("expShipDateSep");
  const endEl = document.getElementById("expShipDateEndText");
  cap_nhat_nut_khoang_ngay_ui(startEl, sepEl, endEl, exp_ship_date_start, exp_ship_date_end, "Tất cả ngày");
}

function ap_dung_khoang_ngay_xuat_ship(st, en) {
  const calPopup = document.getElementById("calendarPopup");
  calPopup?.classList.add("hidden");
  calPopup?.classList.remove("is-modal-cal");
  document.getElementById("btnExpShipDateRange")?.classList.remove("is-open");
  current_cal_target = null;

  if (!st || !en) {
    exp_ship_date_start = "";
    exp_ship_date_end = "";
  } else {
    const s = clamp_min_data_date(st);
    const e = clamp_min_data_date(en);
    exp_ship_date_start = s <= e ? s : e;
    exp_ship_date_end = s <= e ? e : s;
  }
  update_exp_ship_date_btn_ui();
  render_exp_ship_tag_chips();
  refresh_export_ship_preview();
}

function get_exp_ship_base_orders_by_date() {
  const odModal = document.getElementById("orderDetailModal");
  const isOdOpen = Boolean(odModal && !odModal.classList.contains("hidden"));
  let source = isOdOpen && Array.isArray(current_od_filtered_list) && current_od_filtered_list.length > 0
    ? current_od_filtered_list
    : (typeof lay_tat_ca_don_hang_tu_bang_a_den_p === "function" ? lay_tat_ca_don_hang_tu_bang_a_den_p(false) : []);
  if (!exp_ship_date_start || !exp_ship_date_end) return source;
  const patternsArr = tao_cac_dang_ngay_khop(exp_ship_date_start, exp_ship_date_end);
  return source.filter((o) => khop_ngay_chinh_xac(String(o.thoi_gian || "").trim(), patternsArr));
}

function render_exp_ship_tag_chips() {
  const wrap = document.getElementById("expShipTagChips");
  const countBadge = document.getElementById("expShipTagCountBadge");
  const clearBtn = document.getElementById("btnExpShipClearTag");
  const q = bo_dau_tieng_viet(String(document.getElementById("expShipTagSearch")?.value || "").trim()).toUpperCase();
  const onlyNoMvd = true;

  if (countBadge) {
    countBadge.textContent = `${exp_ship_tag_codes.size} tag`;
    countBadge.classList.toggle("hidden", exp_ship_tag_codes.size === 0);
  }
  if (clearBtn) {
    clearBtn.classList.toggle("hidden", exp_ship_tag_codes.size === 0);
  }
  if (!wrap) return;

  const dateFiltered = get_exp_ship_base_orders_by_date();
  const counts = new Map();
  for (const o of dateFiltered) {
    if (onlyNoMvd) {
      const mvd = String(o.ma_van_don || "").trim();
      if (mvd && mvd !== "-" && mvd !== "—") continue;
    }
    const tag = get_exp_ship_order_tag(o);
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }

  const pool = Array.from(new Set([...Array.from(exp_ship_tag_codes), ...Array.from(counts.keys())])).filter(Boolean);
  const filtered = q ? pool.filter((t) => bo_dau_tieng_viet(t).toUpperCase().includes(q)) : pool;

  filtered.sort((a, b) => {
    const sa = exp_ship_tag_codes.has(a) ? 0 : 1;
    const sb = exp_ship_tag_codes.has(b) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const ca = counts.get(a) || 0;
    const cb = counts.get(b) || 0;
    if (cb !== ca) return cb - ca;
    return a.localeCompare(b, "vi");
  });

  if (filtered.length === 0) {
    wrap.innerHTML = `<span style="font-size:11.5px;color:var(--choco-muted,#7A5E4C);">${
      q ? "Không tìm thấy tag phù hợp" : "Không có tag nào trong khoảng ngày này"
    }</span>`;
    return;
  }

  wrap.innerHTML = filtered
    .map((tag) => {
      const sel = exp_ship_tag_codes.has(tag);
      const cnt = counts.get(tag) || 0;
      const tip = `${tag} • ${cnt} đơn`;
      return `<button type="button" class="exp-cp-chip${sel ? " is-selected" : ""}" data-tag="${escape_html(tag)}" title="${escape_html(tip)}">${sel ? "✓ " : ""}${escape_html(tag)} (${cnt})</button>`;
    })
    .join("");
}

const VN_PROVINCES_CATALOG = [
  { name: "Hà Nội", vtpId: 1, vtpCode: "HNI", keys: ["ha noi", "hanoi", "tp ha noi", "hn"] },
  { name: "Hồ Chí Minh", vtpId: 2, vtpCode: "HCM", keys: ["ho chi minh", "hochiminh", "tp hcm", "tphcm", "hcm", "sai gon", "saigon", "sg"] },
  { name: "Hải Phòng", vtpId: 3, vtpCode: "HPG", keys: ["hai phong", "haiphong", "tp hai phong"] },
  { name: "Đà Nẵng", vtpId: 4, vtpCode: "DNG", keys: ["da nang", "danang", "tp da nang"] },
  { name: "Cần Thơ", vtpId: 5, vtpCode: "CTO", keys: ["can tho", "cantho", "tp can tho"] },
  { name: "Tiền Giang", vtpId: 6, vtpCode: "TGG", keys: ["tien giang", "my tho"] },
  { name: "Hậu Giang", vtpId: 8, vtpCode: "HUG", keys: ["hau giang", "vi thanh"] },
  { name: "Đăk Nông", vtpId: 9, vtpCode: "DKG", keys: ["dak nong", "dac nong", "daknong", "gia nghia"] },
  { name: "Vĩnh Phúc", vtpId: 10, vtpCode: "VPC", keys: ["vinh phuc", "vinh yen", "phuc yen"] },
  { name: "Bắc Ninh", vtpId: 11, vtpCode: "BNH", keys: ["bac ninh"] },
  { name: "Hải Dương", vtpId: 12, vtpCode: "HDG", keys: ["hai duong"] },
  { name: "Hưng Yên", vtpId: 13, vtpCode: "HYN", keys: ["hung yen", "van giang", "my hao"] },
  { name: "Hà Nam", vtpId: 14, vtpCode: "HNM", keys: ["ha nam", "phu ly"] },
  { name: "Nam Định", vtpId: 15, vtpCode: "NDH", keys: ["nam dinh"] },
  { name: "Thái Bình", vtpId: 16, vtpCode: "TBH", keys: ["thai binh"] },
  { name: "Ninh Bình", vtpId: 17, vtpCode: "NBH", keys: ["ninh binh", "tam diep"] },
  { name: "Hà Giang", vtpId: 18, vtpCode: "HGG", keys: ["ha giang"] },
  { name: "Cao Bằng", vtpId: 19, vtpCode: "CBG", keys: ["cao bang"] },
  { name: "Lào Cai", vtpId: 20, vtpCode: "LCI", keys: ["lao cai", "sapa", "sa pa"] },
  { name: "Bắc Kạn", vtpId: 21, vtpCode: "BKN", keys: ["bac kan", "bac can"] },
  { name: "Lạng Sơn", vtpId: 22, vtpCode: "LSN", keys: ["lang son"] },
  { name: "Tuyên Quang", vtpId: 23, vtpCode: "TQG", keys: ["tuyen quang"] },
  { name: "Yên Bái", vtpId: 24, vtpCode: "YBN", keys: ["yen bai"] },
  { name: "Thái Nguyên", vtpId: 25, vtpCode: "TNN", keys: ["thai nguyen", "song cong", "pho yen"] },
  { name: "Phú Thọ", vtpId: 26, vtpCode: "PHO", keys: ["phu tho", "viet tri"] },
  { name: "Bắc Giang", vtpId: 27, vtpCode: "BGG", keys: ["bac giang"] },
  { name: "Quảng Ninh", vtpId: 28, vtpCode: "QNH", keys: ["quang ninh", "ha long", "cam pha", "uong bi", "mong cai"] },
  { name: "Lai Châu", vtpId: 29, vtpCode: "LCU", keys: ["lai chau"] },
  { name: "Sơn La", vtpId: 30, vtpCode: "SLA", keys: ["son la", "moc chau"] },
  { name: "Hòa Bình", vtpId: 31, vtpCode: "HBH", keys: ["hoa binh"] },
  { name: "Thanh Hóa", vtpId: 32, vtpCode: "THA", keys: ["thanh hoa", "sam son", "bim son"] },
  { name: "Nghệ An", vtpId: 33, vtpCode: "NAN", keys: ["nghe an", "tp vinh"] },
  { name: "Hà Tĩnh", vtpId: 34, vtpCode: "HTH", keys: ["ha tinh"] },
  { name: "Quảng Bình", vtpId: 35, vtpCode: "QBH", keys: ["quang binh", "dong hoi"] },
  { name: "Quảng Trị", vtpId: 36, vtpCode: "QTI", keys: ["quang tri", "dong ha"] },
  { name: "Thừa Thiên Huế", vtpId: 37, vtpCode: "HUE", keys: ["thua thien hue", "tp hue", "hue"] },
  { name: "Quảng Nam", vtpId: 38, vtpCode: "QNM", keys: ["quang nam", "tam ky", "hoi an"] },
  { name: "Quảng Ngãi", vtpId: 39, vtpCode: "QNI", keys: ["quang ngai"] },
  { name: "Bình Định", vtpId: 40, vtpCode: "BDH", keys: ["binh dinh", "quy nhon"] },
  { name: "Phú Yên", vtpId: 41, vtpCode: "PYN", keys: ["phu yen", "tuy hoa"] },
  { name: "Khánh Hòa", vtpId: 42, vtpCode: "KHA", keys: ["khanh hoa", "nha trang", "cam ranh"] },
  { name: "Kon Tum", vtpId: 43, vtpCode: "KTM", keys: ["kon tum", "kontum"] },
  { name: "Gia Lai", vtpId: 44, vtpCode: "GLI", keys: ["gia lai", "pleiku"] },
  { name: "Đăk Lăk", vtpId: 45, vtpCode: "DLK", keys: ["dak lak", "dac lac", "daklak", "buon ma thuot", "buon me thuot", "bmt"] },
  { name: "Lâm Đồng", vtpId: 46, vtpCode: "LDG", keys: ["lam dong", "da lat", "bao loc"] },
  { name: "Ninh Thuận", vtpId: 47, vtpCode: "NTN", keys: ["ninh thuan", "phan rang"] },
  { name: "Bình Phước", vtpId: 48, vtpCode: "BPC", keys: ["binh phuoc", "dong xoai"] },
  { name: "Tây Ninh", vtpId: 49, vtpCode: "TNH", keys: ["tay ninh", "trang bang"] },
  { name: "Bình Dương", vtpId: 50, vtpCode: "BDG", keys: ["binh duong", "thu dau mot", "di an", "thuan an"] },
  { name: "Đồng Nai", vtpId: 51, vtpCode: "DNI", keys: ["dong nai", "bien hoa", "long thanh", "nhon trach"] },
  { name: "Bình Thuận", vtpId: 52, vtpCode: "BTN", keys: ["binh thuan", "phan thiet"] },
  { name: "Vũng Tàu", vtpId: 53, vtpCode: "VTU", keys: ["ba ria", "vung tau", "brvt", "br-vt"] },
  { name: "Long An", vtpId: 54, vtpCode: "LAN", keys: ["long an", "tan an", "duc hoa", "ben luc"] },
  { name: "Đồng Tháp", vtpId: 55, vtpCode: "DTP", keys: ["dong thap", "cao lanh", "sa dec"] },
  { name: "An Giang", vtpId: 56, vtpCode: "AGG", keys: ["an giang"] },
  { name: "Vĩnh Long", vtpId: 57, vtpCode: "VLG", keys: ["vinh long"] },
  { name: "Bến Tre", vtpId: 58, vtpCode: "BTE", keys: ["ben tre"] },
  { name: "Kiên Giang", vtpId: 59, vtpCode: "KGG", keys: ["kien giang", "rach gia", "phu quoc"] },
  { name: "Trà Vinh", vtpId: 60, vtpCode: "TVH", keys: ["tra vinh"] },
  { name: "Sóc Trăng", vtpId: 61, vtpCode: "STG", keys: ["soc trang"] },
  { name: "Bạc Liêu", vtpId: 62, vtpCode: "BLU", keys: ["bac lieu"] },
  { name: "Cà Mau", vtpId: 63, vtpCode: "CMU", keys: ["ca mau"] },
  { name: "Điện Biên", vtpId: 64, vtpCode: "DBN", keys: ["dien bien"] },
];

// Chuẩn hóa chính tả địa danh Việt Nam toàn quốc (Bắc - Trung - Tây Nguyên - Nam)
// Xử lý: dấu nháy (M'Đrăk/Cư M'gar/Ea H'Leo/Ia H'Drai), k<->c (Krông Păk/Pắc, Krông Búk/Búc, Đăk/Đắc, Lăk/Lắc),
// i<->y (Mỹ/Mĩ, Quy/Qui, Lý/Lí, Kỳ/Kì, Quý/Quí, Vỹ/Vĩ), ghép/tách từ (Đa Krông/Đakrông, Krông A Na/Ana, Bắc Kạn/Cạn, Buôn Mê Thuột/Ma Thuột)
function norm_vn_geo_fuzzy(str) {
  if (!str) return "";
  let s = bo_dau_tieng_viet(String(str)).toLowerCase();
  s = s.replace(/([a-z])['’`]([a-z])/g, "$1$2");
  s = s.replace(/[^a-z0-9]+/g, " ").trim();
  if (!s) return "";
  s = s
    .replace(/\bda krong\b/g, "dakrong")
    .replace(/\bkrong a na\b/g, "krong ana")
    .replace(/\bbuon me thuot\b/g, "buon ma thuot")
    .replace(/\bbac kan\b/g, "bac can")
    .replace(/\bcu jut\b/g, "cu giut")
    .replace(/\bplei ku\b/g, "pleiku")
    .replace(/\bsa pa\b/g, "sapa")
    .replace(/\bdaklak\b/g, "dac lac")
    .replace(/\bdaclac\b/g, "dac lac")
    .replace(/\bdaknong\b/g, "dac nong")
    .replace(/\bdacnong\b/g, "dac nong")
    .replace(/\b([bcdfghklmnpqrstvwxz]+|qu)y\b/g, "$1i")
    .replace(/k\b/g, "c");
  return s;
}

const VTP_DISTRICTS_RAW = {
  "1": "1~QUẬN HOÀN KIẾM~HOÀN KIẾM|2~HUYỆN BA VÌ~BA VÌ|3~HUYỆN HOÀI ĐỨC~HOÀI ĐỨC|4~QUẬN HOÀNG MAI~HOÀNG MAI|5~HUYỆN THẠCH THẤT~THẠCH THẤT|6~HUYỆN CHƯƠNG MỸ~CHƯƠNG MỸ|7~HUYỆN SÓC SƠN~SÓC SƠN|8~HUYỆN GIA LÂM~GIA LÂM|9~QUẬN HAI BÀ TRƯNG~HAI BÀ TRƯNG|10~QUẬN TÂY HỒ~TÂY HỒ|11~HUYỆN MÊ LINH~MÊ LINH|12~HUYỆN THANH TRÌ~THANH TRÌ|13~HUYỆN ỨNG HÒA~ỨNG HÒA|14~QUẬN CẦU GIẤY~CẦU GIẤY|15~HUYỆN PHÚC THỌ~PHÚC THỌ|16~HUYỆN THANH OAI~THANH OAI|17~HUYỆN MỸ ĐỨC~MỸ ĐỨC|18~THỊ XÃ SƠN TÂY~SƠN TÂY|19~HUYỆN ĐAN PHƯỢNG~ĐAN PHƯỢNG|20~QUẬN LONG BIÊN~LONG BIÊN|21~HUYỆN QUỐC OAI~QUỐC OAI|22~QUẬN BA ĐÌNH~BA ĐÌNH|23~QUẬN THANH XUÂN~THANH XUÂN|24~QUẬN ĐỐNG ĐA~ĐỐNG ĐA|25~QUẬN NAM TỪ LIÊM~NAM TỪ LIÊM|26~QUẬN BẮC TỪ LIÊM~BẮC TỪ LIÊM|27~HUYỆN PHÚ XUYÊN~PHÚ XUYÊN|28~HUYỆN ĐÔNG ANH~ĐÔNG ANH|30~QUẬN HÀ ĐÔNG~QUẬN HÀ ĐÔNG|31~HUYỆN THƯỜNG TÍN~THƯỜNG TÍN",
  "2": "43~QUẬN 1~QUẬN 1|32~QUẬN 6~QUẬN 6|33~QUẬN 5~QUẬN 5|34~QUẬN 3~QUẬN 3|38~QUẬN 10~QUẬN 10|39~QUẬN 7~QUẬN 7|40~QUẬN 12~QUẬN 12|45~QUẬN 11~QUẬN 11|47~QUẬN 8~QUẬN 8|48~QUẬN 4~QUẬN 4|49~HUYỆN BÌNH CHÁNH~BÌNH CHÁNH|1231~THÀNH PHỐ THỦ ĐỨC~THỦ ĐỨC|51~QUẬN BÌNH THẠNH~BÌNH THẠNH|52~QUẬN PHÚ NHUẬN~PHÚ NHUẬN|46~QUẬN BÌNH TÂN~BÌNH TÂN|44~QUẬN GÒ VẤP~GÒ VẤP|42~HUYỆN CẦN GIỜ~CẦN GIỜ|54~QUẬN TÂN PHÚ~TÂN PHÚ|55~HUYỆN HÓC MÔN~HÓC MÔN|35~QUẬN TÂN BÌNH~TÂN BÌNH|36~HUYỆN CỦ CHI~CỦ CHI|37~HUYỆN NHÀ BÈ~NHÀ BÈ",
  "3": "56~QUẬN HỒNG BÀNG~HỒNG BÀNG|57~QUẬN ĐỒ SƠN~ĐỒ SƠN|58~QUẬN LÊ CHÂN~LÊ CHÂN|59~HUYỆN AN DƯƠNG~AN DƯƠNG|60~HUYỆN ĐẢO BẠCH LONG VĨ~ĐẢO BẠCH LONG VĨ|61~HUYỆN KIẾN THỤY~KIẾN THỤY|62~QUẬN DƯƠNG KINH~DƯƠNG KINH|63~HUYỆN AN LÃO~AN LÃO|64~HUYỆN VĨNH BẢO~VĨNH BẢO|65~QUẬN KIẾN AN~KIẾN AN|66~HUYỆN ĐẢO CÁT HẢI~ĐẢO CÁT HẢI|67~HUYỆN THỦY NGUYÊN~THỦY NGUYÊN|68~QUẬN NGÔ QUYỀN~NGÔ QUYỀN|69~HUYỆN TIÊN LÃNG~TIÊN LÃNG|70~QUẬN HẢI AN~HẢI AN",
  "4": "71~QUẬN CẨM LỆ~CẨM LỆ|72~QUẬN THANH KHÊ~THANH KHÊ|73~QUẬN NGŨ HÀNH SƠN~NGŨ HÀNH SƠN|74~QUẬN HẢI CHÂU~HẢI CHÂU|75~QUẬN SƠN TRÀ~SƠN TRÀ|76~QUẬN LIÊN CHIỂU~LIÊN CHIỂU|77~HUYỆN HOÀNG SA~HOÀNG SA|78~HUYỆN ĐIỆN BÀN~ĐIỆN BÀN|79~HUYỆN HÒA VANG~HÒA VANG",
  "5": "80~QUẬN Ô MÔN~Ô MÔN|81~HUYỆN THỚI LAI~THỚI LAI|82~QUẬN NINH KIỀU~NINH KIỀU|83~QUẬN THỐT NỐT~THỐT NỐT|85~HUYỆN VĨNH THẠNH~VĨNH THẠNH|87~HUYỆN PHONG ĐIỀN~PHONG ĐIỀN|89~QUẬN CÁI RĂNG~CÁI RĂNG|90~HUYỆN CỜ ĐỎ~CỜ ĐỎ|91~QUẬN BÌNH THỦY~BÌNH THỦY",
  "6": "101~THÀNH PHỐ MỸ THO~MỸ THO|92~HUYỆN TÂN PHÚ ĐÔNG~TÂN PHÚ ĐÔNG|93~HUYỆN CHỢ GẠO~CHỢ GẠO|99~THỊ XÃ GÒ CÔNG~GÒ CÔNG|94~HUYỆN GÒ CÔNG TÂY~GÒ CÔNG TÂY|95~HUYỆN CÁI BÈ~CÁI BÈ|96~HUYỆN GÒ CÔNG ĐÔNG~GÒ CÔNG ĐÔNG|97~HUYỆN CHÂU THÀNH~CHÂU THÀNH|98~HUYỆN TÂN PHƯỚC~TÂN PHƯỚC|100~HUYỆN CAI LẬY~CAI LẬY",
  "8": "102~TP. VỊ THANH~VỊ THANH|104~HUYỆN LONG MỸ~LONG MỸ|105~HUYỆN CHÂU THÀNH~CHÂU THÀNH|103~HUYỆN CHÂU THÀNH A~CHÂU THÀNH A|106~HUYỆN VỊ THỦY~VỊ THỦY|107~THỊ XÃ NGÃ BẢY~NGÃ BẢY|108~HUYỆN PHỤNG HIỆP~PHỤNG HIỆP|109~TX LONG MỸ~TX LONG MỸ",
  "9": "110~HUYỆN ĐĂK GLONG~ĐĂK GLONG|111~HUYỆN TUY ĐỨC~TUY ĐỨC|112~THỊ XÃ GIA NGHĨA~GIA NGHĨA|113~HUYỆN CƯ JÚT~CƯ JÚT|114~HUYỆN KRÔNG NÔ~KRÔNG NÔ|115~HUYỆN ĐĂK SONG~ĐĂK SONG|116~HUYỆN ĐĂK MIL~ĐĂK MIL|117~HUYỆN ĐĂK RLÂP~ĐĂK RLÂP",
  "10": "118~HUYÊN YÊN LẠC~YÊN LẠC|119~HUYỆN TAM DƯƠNG~TAM DƯƠNG|120~HUYỆN BÌNH XUYÊN~BÌNH XUYÊN|121~HUYỆN SÔNG LÔ~SÔNG LÔ|122~THỊ XÃ PHÚC YÊN~PHÚC YÊN|123~THÀNH PHỐ VĨNH YÊN~VĨNH YÊN|124~HUỴÊN TAM ĐẢO~TAM ĐẢO|125~HUYỆN VĨNH TƯỜNG~VĨNH TƯỜNG|126~HUYỆN LẬP THẠCH~LẬP THẠCH",
  "11": "128~THÀNH PHỐ BẮC NINH~BẮC NINH|127~HUYỆN LƯƠNG TÀI~LƯƠNG TÀI|129~HUYỆN GIA BÌNH~GIA BÌNH|130~HUYỆN THUẬN THÀNH~THUẬN THÀNH|131~HUYỆN QUẾ VÕ~QUẾ VÕ|132~HUYỆN YÊN PHONG~YÊN PHONG|133~HUYỆN TIÊN DU~TIÊN DU|134~HUYỆN TỪ SƠN~TỪ SƠN",
  "12": "135~TP HẢI DƯƠNG~HẢI DƯƠNG|136~HUYỆN NINH GIANG~NINH GIANG|137~HUYỆN TỨ KỲ~TỨ KỲ|138~HUYỆN THANH HÀ~THANH HÀ|139~HUYỆN CẨM GIÀNG~CẨM GIÀNG|140~HUYỆN THANH MIỆN~THANH MIỆN|141~HUYỆN NAM SÁCH~NAM SÁCH|142~HUYỆN KINH MÔN~KINH MÔN|143~HUYỆN CHÍ LINH~CHÍ LINH|144~HUYỆN BÌNH GIANG~BÌNH GIANG|145~HUYỆN GIA LỘC~GIA LỘC|146~HUYỆN KIM THÀNH~KIM THÀNH",
  "13": "156~THỊ XÃ HƯNG YÊN~HƯNG YÊN|147~HUYỆN PHÙ CỪ~PHÙ CỪ|148~HUYỆN VĂN LÂM~VĂN LÂM|149~HUYỆN KHOÁI CHÂU~KHOÁI CHÂU|150~HUYỆN ÂN THI~ÂN THI|151~HUYỆN VĂN GIANG~VĂN GIANG|152~HUYỆN MỸ HÀO~MỸ HÀO|153~HUYỆN KIM ĐỘNG~KIM ĐỘNG|154~HUYỆN TIÊN LỮ~TIÊN LỮ|155~HUYỆN YÊN MỸ~YÊN MỸ",
  "14": "157~HUYỆN DUY TIÊN~DUY TIÊN|158~HUYỆN KIM BẢNG~KIM BẢNG|159~HUYỆN LÝ NHÂN~LÝ NHÂN|160~THỊ XÃ PHỦ LÝ~PHỦ LÝ|161~HUYỆN THANH LIÊM~THANH LIÊM|162~HUYỆN BÌNH LỤC~BÌNH LỤC",
  "15": "168~THÀNH PHỐ NAM ĐỊNH~NAM ĐỊNH|163~HUYỆN NAM TRỰC~NAM TRỰC|164~HUYỆN TRỰC NINH~TRỰC NINH|165~HUYỆN MỸ LỘC~MỸ LỘC|166~HUYỆN GIAO THỦY~GIAO THỦY|167~HUYỆN NGHĨA HƯNG~NGHĨA HƯNG|169~HUYỆN HẢI HẬU~HẢI HẬU|170~HUYỆN VỤ BẢN~VỤ BẢN|171~HUYỆN XUÂN TRƯỜNG~XUÂN TRƯỜNG|172~HUYỆN Ý YÊN~Ý YÊN",
  "16": "178~THÀNH PHỐ THÁI BÌNH~THÁI BÌNH|173~HUYỆN THÁI THỤY~THÁI THỤY|174~HUYỆN VŨ THƯ~VŨ THƯ|175~HUYỆN QUỲNH PHỤ~QUỲNH PHỤ|176~HUYỆN HƯNG HÀ~HƯNG HÀ|177~HUYỆN QUỲNH CÔI~QUỲNH CÔI|179~HUYỆN ĐÔNG HƯNG~ĐÔNG HƯNG|180~HUYỆN TIỀN HẢI~TIỀN HẢI|181~HUYỆN KIẾN XƯƠNG~KIẾN XƯƠNG",
  "17": "182~THÀNH PHỐ NINH BÌNH~NINH BÌNH|183~HUYỆN KIM SƠN~KIM SƠN|184~HUYỆN NHO QUAN~NHO QUAN|185~HUYỆN GIA VIỄN~GIA VIỄN|186~HUYỆN YÊN MÔ~YÊN MÔ|187~HUYỆN YÊN KHÁNH~YÊN KHÁNH|188~HUYỆN HOA LƯ~HOA LƯ|189~THỊ XÃ TAM ĐIỆP~TAM ĐIỆP",
  "18": "196~THỊ XÃ HÀ GIANG~HÀ GIANG|190~HUYỆN HOÀNG SU PHÌ~HOÀNG SU PHÌ|191~HUYỆN QUẢN BẠ~QUẢN BẠ|192~HUYỆN VỊ XUYÊN~VỊ XUYÊN|193~HUYỆN BẮC MÊ~BẮC MÊ|194~HUYỆN XÍN MẦN~XÍN MẦN|195~HUYỆN BẮC QUANG~BẮC QUANG|197~HUYỆN ĐỒNG VĂN~ĐỒNG VĂN|198~HUYỆN YÊN MINH~YÊN MINH|199~HUYỆN MÈO VẠC~MÈO VẠC|200~HUYỆN QUANG BÌNH~QUANG BÌNH",
  "19": "209~THỊ XÃ CAO BẰNG~CAO BẰNG|201~HUYỆN THẠCH AN~THẠCH AN|202~HUYỆN HẠ LANG~HẠ LANG|203~HUYỆN NGUYÊN BÌNH~NGUYÊN BÌNH|204~HUYỆN BẢO LẠC~BẢO LẠC|205~HUYỆN PHỤC HÒA~PHỤC HÒA|206~HUYỆN TRÙNG KHÁNH~TRÙNG KHÁNH|207~HUYỆN THÔNG NÔNG~THÔNG NÔNG|208~HUYỆN BẢO LÂM~BẢO LÂM|210~HUYỆN HÀ QUẢNG~HÀ QUẢNG|211~HUYỆN TRÀ LĨNH~TRÀ LĨNH|212~HUYỆN HÒA AN~HÒA AN|725~HUYỆN QUẢNG HÒA~QUẢNG HÒA|213~HUYỆN QUẢNG UYÊN~QUẢNG UYÊN",
  "20": "214~THÀNH PHỐ LÀO CAI~LÀO CAI|215~HUYỆN SA PA~SA PA|216~HUYỆN MƯỜNG KHƯƠNG~MƯỜNG KHƯƠNG|217~HUYỆN BÁT XÁT~BÁT XÁT|218~HUYỆN VĂN BÀN~VĂN BÀN|219~HUYỆN BẮC HÀ~BẮC HÀ|220~HUYỆN SI MA CAI~SI MA CAI|221~HUYỆN BẢO YÊN~BẢO YÊN|222~HUYỆN BẢO THẮNG~BẢO THẮNG",
  "21": "226~THỊ XÃ BẮC KẠN~BẮC KẠN|223~HUYỆN CHỢ MỚI~CHỢ MỚI|224~HUYỆN CHỢ ĐỒN~CHỢ ĐỒN|225~HUYỆN NGÂN SƠN~NGÂN SƠN|227~HUYỆN NA RÌ~NA RÌ|228~HUYỆN BẠCH THÔNG~BẠCH THÔNG|229~HUYỆN BA BỂ~BA BỂ|230~HUYỆN PẮC NẶM~PẮC NẶM",
  "22": "240~THÀNH PHỐ LẠNG SƠN~LẠNG SƠN|231~HUYỆN VĂN QUAN~VĂN QUAN|232~HUYỆN HỮU LŨNG~HỮU LŨNG|233~HUYỆN CHI LĂNG~CHI LĂNG|234~HUYỆN BẮC SƠN~BẮC SƠN|235~HUYỆN VĂN LÃNG~VĂN LÃNG|236~HUYỆN LỘC BÌNH~LỘC BÌNH|237~HUYỆN CAO LỘC~CAO LỘC|238~HUYỆN ĐÌNH LẬP~ĐÌNH LẬP|239~HUYỆN BÌNH GIA~BÌNH GIA|241~HUYỆN TRÀNG ĐỊNH~TRÀNG ĐỊNH",
  "23": "242~THỊ XÃ TUYÊN QUANG~TUYÊN QUANG|243~HUYỆN YÊN SƠN~YÊN SƠN|244~HUYỆN SƠN DƯƠNG~SƠN DƯƠNG|245~HUYỆN CHIÊM HÓA~CHIÊM HÓA|246~HUYỆN NÀ HANG~NÀ HANG|247~HUYỆN LÂM BÌNH~LÂM BÌNH|248~HUYỆN HÀM YÊN~HÀM YÊN",
  "24": "257~THÀNH PHỐ YÊN BÁI~YÊN BÁI|249~HUYỆN VĂN CHẤN~VĂN CHẤN|250~HUYỆN VĂN YÊN~VĂN YÊN|251~HUYỆN YÊN BÌNH~YÊN BÌNH|252~HUYỆN TRẠM TẤU~TRẠM TẤU|253~HUYỆN LỤC YÊN~LỤC YÊN|254~THỊ XÃ NGHĨA LỘ~NGHĨA LỘ|255~HUYỆN MÙ CĂNG CHẢI~MÙ CĂNG CHẢI|256~HUYỆN TRẤN YÊN~TRẤN YÊN",
  "25": "261~THÀNH PHỐ THÁI NGUYÊN~THÁI NGUYÊN|258~HUYỆN PHỔ YÊN~PHỔ YÊN|259~HUYỆN PHÚ LƯƠNG~PHÚ LƯƠNG|260~HUYỆN VÕ NHAI~VÕ NHAI|262~HUYỆN PHÚ BÌNH~PHÚ BÌNH|263~HUYỆN ĐỒNG HỶ~ĐỒNG HỶ|264~HUYỆN ĐẠI TỪ~ĐẠI TỪ|265~HUYỆN ĐỊNH HÓA~ĐỊNH HÓA|266~THỊ XÃ SÔNG CÔNG~SÔNG CÔNG",
  "26": "267~THỊ XÃ PHÚ THỌ~PHÚ THỌ|268~HUYỆN THANH BA~THANH BA|269~THÀNH PHỐ VIỆT TRÌ~VIỆT TRÌ|270~HUYỆN ĐOAN HÙNG~ĐOAN HÙNG|271~HUYỆN THANH THỦY~THANH THỦY|272~HUYỆN THANH SƠN~THANH SƠN|273~HUYỆN TÂN SƠN~TÂN SƠN|274~HUYỆN YÊN LẬP~YÊN LẬP|275~HUYỆN CẨM KHÊ~CẨM KHÊ|276~HUYỆN TAM NÔNG~TAM NÔNG|277~HUYỆN LÂM THAO~LÂM THAO|278~HUYỆN HẠ HÒA~HẠ HÒA|279~HUYỆN PHÙ NINH~PHÙ NINH",
  "27": "280~THÀNH PHỐ BẮC GIANG~BẮC GIANG|281~HUYỆN HIỆP HÒA~HIỆP HÒA|282~HUYỆN VIỆT YÊN~VIỆT YÊN|283~HUYỆN YÊN THẾ~YÊN THẾ|284~HUYỆN LỤC NGẠN~LỤC NGẠN|285~HUYỆN LẠNG GIANG~LẠNG GIANG|286~HUYỆN TÂN YÊN~TÂN YÊN|287~HUYỆN LỤC NAM~LỤC NAM|288~HUYỆN SƠN ĐỘNG~SƠN ĐỘNG|289~HUYỆN YÊN DŨNG~YÊN DŨNG",
  "28": "290~HUYỆN TIÊN YÊN~TIÊN YÊN|291~THỊ XÃ UÔNG BÍ~UÔNG BÍ|292~THỊ XÃ QUẢNG YÊN~QUẢNG YÊN|293~HUYỆN ĐÔNG TRIỀU~ĐÔNG TRIỀU|294~HUYỆN BA CHẼ~BA CHẼ|295~HUYỆN BÌNH LIÊU~BÌNH LIÊU|296~HUYỆN ĐẦM HÀ~ĐẦM HÀ|297~HUYỆN VÂN ĐỒN~VÂN ĐỒN|298~THỊ XÃ CẨM PHẢ~CẨM PHẢ|299~HUYỆN CÔ TÔ~CÔ TÔ|300~THỊ XÃ MÓNG CÁI~MÓNG CÁI|301~HUYỆN HẢI HÀ~HẢI HÀ|302~THÀNH PHỐ HẠ LONG~HẠ LONG|303~HUYỆN HOÀNH BỒ~HOÀNH BỒ",
  "29": "311~THỊ XÃ LAI CHÂU~LAI CHÂU|304~HUYỆN TAM ĐƯỜNG~TAM ĐƯỜNG|305~HUYỆN PHONG THỔ~PHONG THỔ|306~HUYỆN SÌN HỒ~SÌN HỒ|307~HUYỆN THAN UYÊN~THAN UYÊN|308~HUYỆN MƯỜNG TÈ~MƯỜNG TÈ|309~HUYỆN TÂN UYÊN~TÂN UYÊN|310~HUYỆN NẬM NHÙN~NẬM NHÙN",
  "30": "315~THỊ XÃ SƠN LA~SƠN LA|312~HUYỆN QUỲNH NHAI~QUỲNH NHAI|313~HUYỆN MƯỜNG LA~MƯỜNG LA|314~HUYỆN SÔNG MÃ~SÔNG MÃ|316~HUYỆN MAI SƠN~MAI SƠN|317~HUYỆN PHÙ YÊN~PHÙ YÊN|318~HUYỆN THUẬN CHÂU~THUẬN CHÂU|319~HUYỆN MỘC CHÂU~MỘC CHÂU|320~HUYỆN YÊN CHÂU~YÊN CHÂU|321~HUYỆN VÂN HỒ~VÂN HỒ|322~HUYỆN BẮC YÊN~BẮC YÊN|323~HUYỆN SỐP CỘP~SỐP CỘP",
  "31": "333~THỊ XÃ HÒA BÌNH~HÒA BÌNH|324~HUYỆN KỲ SƠN~KỲ SƠN|325~HUYỆN LẠC THỦY~LẠC THỦY|326~HUYỆN KIM BÔI~KIM BÔI|327~HUYỆN TÂN LẠC~TÂN LẠC|328~HUYỆN LƯƠNG SƠN~LƯƠNG SƠN|329~HUYỆN YÊN THỦY~YÊN THỦY|330~HUYỆN CAO PHONG~CAO PHONG|331~HUYỆN ĐÀ BẮC~ĐÀ BẮC|332~HUYỆN LẠC SƠN~LẠC SƠN|334~HUYỆN MAI CHÂU~MAI CHÂU",
  "32": "344~THÀNH PHỐ THANH HÓA~THANH HÓA|335~HUYỆN NGỌC LẶC~NGỌC LẶC|336~HUYỆN HOẰNG HÓA~HOẰNG HÓA|337~HUYỆN QUAN SƠN~QUAN SƠN|338~HUYỆN THẠCH THÀNH~THẠCH THÀNH|339~HUYỆN QUẢNG XƯƠNG~QUẢNG XƯƠNG|340~HUYỆN NGA SƠN~NGA SƠN|341~HUYỆN ĐÔNG SƠN~ĐÔNG SƠN|342~HUYỆN VĨNH LỘC~VĨNH LỘC|343~HUYỆN LANG CHÁNH~LANG CHÁNH|345~HUYỆN TRIỆU SƠN~TRIỆU SƠN|346~HUYỆN NÔNG CỐNG~NÔNG CỐNG|347~HUYỆN TĨNH GIA~TĨNH GIA|348~HUYỆN THƯỜNG XUÂN~THƯỜNG XUÂN|349~HUYỆN NHƯ XUÂN~NHƯ XUÂN|350~HUYỆN HẬU LỘC~HẬU LỘC|351~HUYỆN NHƯ THANH~NHƯ THANH|352~HUYỆN HÀ TRUNG~HÀ TRUNG|353~HUYỆN MƯỜNG LÁT~MƯỜNG LÁT|354~HUYỆN CẨM THỦY~CẨM THỦY|355~HUYỆN QUAN HÓA~QUAN HÓA|356~HUYỆN BÁ THƯỚC~BÁ THƯỚC|357~HUYỆN YÊN ĐỊNH~YÊN ĐỊNH|358~HUYỆN THỌ XUÂN~THỌ XUÂN|359~THỊ XÃ BỈM SƠN~BỈM SƠN|360~HUYỆN THIỆU HÓA~THIỆU HÓA|361~THỊ XÃ SẦM SƠN~SẦM SƠN",
  "33": "362~HUYỆN ANH SƠN~ANH SƠN|363~HUYỆN CON CUÔNG~CON CUÔNG|364~HUYỆN HƯNG NGUYÊN~HƯNG NGUYÊN|365~THỊ XÃ THÁI HÒA~THÁI HÒA|366~HUYỆN QUỲ CHÂU~QUỲ CHÂU|367~THỊ XÃ CỬA LÒ~CỬA LÒ|368~HUYỆN TƯƠNG DƯƠNG~TƯƠNG DƯƠNG|369~HUYỆN QUẾ PHONG~QUẾ PHONG|370~HUYỆN TÂN KỲ~TÂN KỲ|371~HUYỆN DIỄN CHÂU~DIỄN CHÂU|372~HUYỆN KỲ SƠN~KỲ SƠN|373~THÀNH PHỐ VINH~VINH|374~HUYỆN ĐÔ LƯƠNG~ĐÔ LƯƠNG|375~HUYỆN NGHI LỘC~NGHI LỘC|376~HUYỆN YÊN THÀNH~YÊN THÀNH|377~HUYỆN QUỲNH LƯU~QUỲNH LƯU|378~HUYỆN NAM ĐÀN~NAM ĐÀN|379~HUYỆN NGHĨA ĐÀN~NGHĨA ĐÀN|381~HUYỆN THANH CHƯƠNG~THANH CHƯƠNG|382~HUYỆN QUỲ HỢP~QUỲ HỢP|380~THỊ XÃ HOÀNG MAI~HOÀNG MAI",
  "34": "391~THÀNH PHỐ HÀ TĨNH~HÀ TĨNH|383~HUYỆN VŨ QUANG~VŨ QUANG|384~HUYỆN ĐỨC THỌ~ĐỨC THỌ|385~HUYỆN CAN LỘC~CAN LỘC|386~HUYỆN LỘC HÀ~LỘC HÀ|387~HUYỆN NGHI XUÂN~NGHI XUÂN|388~HUYỆN HƯƠNG SƠN~HƯƠNG SƠN|389~HUYỆN HƯƠNG KHÊ~HƯƠNG KHÊ|390~HUYỆN CẨM XUYÊN~CẨM XUYÊN|392~HUYỆN THẠCH HÀ~THẠCH HÀ|395~THỊ XÃ HỒNG LĨNH~HỒNG LĨNH|393~THỊ XÃ KỲ ANH~KỲ ANH|394~HUYỆN KỲ ANH~HUYỆN KỲ ANH",
  "35": "396~HUYỆN LỆ THỦY~LỆ THỦY|397~HUYỆN TUYÊN HÓA~TUYÊN HÓA|398~THÀNH PHỐ ĐỒNG HỚI~ĐỒNG HỚI|399~HUYỆN QUẢNG TRẠCH~QUẢNG TRẠCH|400~HUYỆN MINH HÓA~MINH HÓA|401~HUYỆN QUẢNG NINH~QUẢNG NINH|402~HUYỆN BỐ TRẠCH~BỐ TRẠCH|403~THỊ XÃ BA ĐỒN~BA ĐỒN",
  "36": "407~THỊ XÃ QUẢNG TRỊ~QUẢNG TRỊ|404~HUYỆN TRIỆU PHONG~TRIỆU PHONG|405~THÀNH PHỐ ĐÔNG HÀ~ĐÔNG HÀ|406~HUYỆN HƯỚNG HÓA~HƯỚNG HÓA|408~HUYỆN CAM LỘ~CAM LỘ|409~HUYỆN CỒN CỎ~CỒN CỎ|410~HUYỆN ĐA KRÔNG~ĐA KRÔNG|411~HUYỆN HẢI LĂNG~HẢI LĂNG|412~HUYỆN VĨNH LINH~VĨNH LINH|413~HUYỆN GIO LINH~GIO LINH",
  "37": "422~THÀNH PHỐ HUẾ~HUẾ|414~HUYỆN PHÚ VANG~PHÚ VANG|415~HUYỆN PHÚ LỘC~PHÚ LỘC|416~THỊ XÃ HƯƠNG THỦY~HƯƠNG THỦY|417~HUYỆN A LƯỚI~A LƯỚI|418~HUYỆN PHONG ĐIỀN~PHONG ĐIỀN|419~HUYỆN QUẢNG ĐIỀN~QUẢNG ĐIỀN|420~HUYỆN NAM ĐÔNG~NAM ĐÔNG|421~HUYỆN HƯƠNG TRÀ~HƯƠNG TRÀ",
  "38": "423~HUYỆN PHÚ NINH~PHÚ NINH|424~HUYỆN PHƯỚC SƠN~PHƯỚC SƠN|425~HUYỆN ĐẠI LỘC~ĐẠI LỘC|426~HUYỆN NAM GIANG~NAM GIANG|427~HUYỆN THĂNG BÌNH~THĂNG BÌNH|428~THÀNH PHỐ TAM KỲ~TAM KỲ|429~HUYỆN ĐÔNG GIANG~ĐÔNG GIANG|430~HUYỆN BẮC TRÀ MY~BẮC TRÀ MY|431~HUYỆN TÂY GIANG~TÂY GIANG|432~HUYỆN TIÊN PHƯỚC~TIÊN PHƯỚC|433~HUYỆN ĐIỆN BÀN~ĐIỆN BÀN|434~HUYỆN QUẾ SƠN~QUẾ SƠN|435~HUYỆN NÔNG SƠN~NÔNG SƠN|436~HUYỆN NÚI THÀNH~NÚI THÀNH|437~THÀNH PHỐ HỘI AN~HỘI AN|438~HUYỆN NAM TRÀ MY~NAM TRÀ MY|439~HUYỆN HIỆP ĐỨC~HIỆP ĐỨC|440~HUYỆN DUY XUYÊN~DUY XUYÊN",
  "39": "445~THÀNH PHỐ QUẢNG NGÃI~QUẢNG NGÃI|441~HUYỆN NGHĨA HÀNH~NGHĨA HÀNH|442~HUYỆN TƯ NGHĨA~TƯ NGHĨA|443~HUYỆN MINH LONG~MINH LONG|444~HUYỆN BÌNH SƠN~BÌNH SƠN|446~HUYỆN MỘ ĐỨC~MỘ ĐỨC|447~HUYỆN TRÀ BỒNG~TRÀ BỒNG|448~HUYỆN TÂY TRÀ~TÂY TRÀ|449~HUYỆN LÝ SƠN~LÝ SƠN|450~HUYỆN SƠN HÀ~SƠN HÀ|451~HUYỆN ĐỨC PHỔ~ĐỨC PHỔ|452~HUYỆN SƠN TỊNH~SƠN TỊNH|453~HUYỆN BA TƠ~BA TƠ|454~HUYỆN SƠN TÂY~SƠN TÂY",
  "40": "455~HUYÊN TÂY SƠN~TÂY SƠN|456~HUYỆN HOÀI ÂN~HOÀI ÂN|457~HUYỆN VÂN CANH~VÂN CANH|458~HUYỆN AN NHƠN~AN NHƠN|459~HUYỆN HOÀI NHƠN~HOÀI NHƠN|460~HUYỆN AN LÃO~AN LÃO|461~HUYỆN VĨNH THẠNH~VĨNH THẠNH|462~HUYỆN TUY PHƯỚC~TUY PHƯỚC|463~HUYỆN PHÙ MỸ~PHÙ MỸ|464~THÀNH PHỐ QUY NHƠN~QUY NHƠN|465~HUYỆN PHÙ CÁT~PHÙ CÁT",
  "41": "466~THỊ XÃ SÔNG CẦU~SÔNG CẦU|467~HUYỆN TUY AN~TUY AN|468~HUYỆN TÂY HÒA~TÂY HÒA|469~HUYỆN ĐÔNG HÒA~ĐÔNG HÒA|470~THÀNH PHỐ TUY HÒA~TUY HÒA|471~HUYỆN ĐỒNG XUÂN~ĐỒNG XUÂN|472~HUYỆN PHÚ HÒA~PHÚ HÒA|473~HUYỆN SƠN HÒA~SƠN HÒA|474~HUYỆN SÔNG HINH~SÔNG HINH",
  "42": "475~THÀNH PHỐ NHA TRANG~NHA TRANG|476~HUYỆN NINH HÒA~NINH HÒA|477~HUYỆN KHÁNH SƠN~KHÁNH SƠN|478~THÀNH PHỐ CAM RANH~CAM RANH|479~HUYỆN DIÊN KHÁNH~DIÊN KHÁNH|480~HUYỆN KHÁNH VĨNH~KHÁNH VĨNH|481~HUYỆN TRƯỜNG SA~TRƯỜNG SA|482~HUYỆN CAM LÂM~CAM LÂM|483~HUYỆN VẠN NINH~VẠN NINH",
  "43": "488~THÀNH PHỐ KON TUM~KON TUM|484~HUYỆN ĐĂK HÀ~ĐĂK HÀ|485~HUYỆN SA THẦY~SA THẦY|486~HUYỆN TU MƠ RÔNG~TU MƠ RÔNG|487~HUYỆN KON PLÔNG~KON PLÔNG|489~HUYỆN ĐĂK TÔ~ĐĂK TÔ|490~HUYỆN NGỌC HỒI~NGỌC HỒI|491~HUYỆN KON RẪY~KON RẪY|492~HUYỆN ĐĂK GLEI~ĐĂK GLEI|493~HUYỆN IA H'DRAI~IA H'DRAI",
  "44": "494~HUYỆN CHƯ PRÔNG~CHƯ PRÔNG|495~HUYỆN KRÔNG PA~KRÔNG PA|496~HUYỆN PHÚ THIỆN~PHÚ THIỆN|497~THÀNH PHỐ PLEIKU~PLEIKU|498~HUYỆN ĐĂK ĐOA~ĐĂK ĐOA|499~HUYỆN ĐĂK PƠ~ĐĂK PƠ|500~HUYỆN IA GRAI~IA GRAI|501~HUYỆN ĐỨC CƠ~ĐỨC CƠ|502~HUYỆN CHƯ SÊ~CHƯ SÊ|503~HUYỆN KBANG~KBANG|504~HUYỆN KÔNG CHRO~KÔNG CHRO|505~HUYỆN MANG YANG~MANG YANG|506~HUYỆN CHƯ PĂH~CHƯ PĂH|507~HUYỆN IA PA~IA PA|508~HUYỆN CHƯ PƯH~CHƯ PƯH|509~THỊ XÃ AN KHÊ~AN KHÊ|510~THỊ XÃ AYUN PA~AYUN PA",
  "45": "517~HUYỆN LĂK~LĂK|511~HUYỆN KRÔNG BÚK~KRÔNG BÚK|512~HUYỆN KRÔNG NĂNG~KRÔNG NĂNG|513~THỊ XÃ BUÔN HỒ~BUÔN HỒ|514~HUYỆN EA KAR~EA KAR|515~THÀNH PHỐ BUÔN MA THUỘT~BUÔN MA THUỘT|516~HUYỆN KRÔNG A NA~KRÔNG A NA|518~HUYỆN CƯ M'GAR~CƯ M'GAR|519~HUYỆN BUÔN ĐÔN~BUÔN ĐÔN|520~HUYỆN EA SÚP~EA SÚP|521~HUYỆN KRÔNG BÔNG~KRÔNG BÔNG|522~HUYỆN M'ĐRĂK~M'ĐRĂK|523~HUYỆN EA H'LEO~EA H'LEO|524~HUYỆN CƯ KUIN~CƯ KUIN|525~HUYỆN KRÔNG PĂK~KRÔNG PĂK",
  "46": "526~HUYỆN LẠC DƯƠNG~LẠC DƯƠNG|527~HUYỆN BẢO LÂM~BẢO LÂM|528~HUYỆN CÁT TIÊN~CÁT TIÊN|529~HUYỆN DI LINH~DI LINH|530~HUYỆN ĐẠ HUOAI~ĐẠ HUOAI|531~HUYỆN LÂM HÀ~LÂM HÀ|532~THÀNH PHỐ ĐÀ LẠT~ĐÀ LẠT|533~HUYỆN ĐẠ TẺH~ĐẠ TẺH|534~HUYỆN ĐAM RÔNG~ĐAM RÔNG|535~THỊ XÃ BẢO LỘC~BẢO LỘC|536~HUYỆN ĐƠN DƯƠNG~ĐƠN DƯƠNG|537~HUYỆN ĐỨC TRỌNG~ĐỨC TRỌNG",
  "47": "538~HUYỆN BÁC ÁI~BÁC ÁI|539~HUYỆN NINH PHƯỚC~NINH PHƯỚC|540~HUYỆN NINH SƠN~NINH SƠN|541~HUYỆN THUẬN NAM~THUẬN NAM|542~HUYỆN NINH HẢI~NINH HẢI|543~HUYỆN THUẬN BẮC~THUẬN BẮC|544~TP.PHAN RANG - THÁP CHÀM~PHAN RANG",
  "48": "545~HUYỆN BÙ ĐỐP~BÙ ĐỐP|546~HUYỆN LỘC NINH~LỘC NINH|547~THỊ XÃ ĐỒNG XOÀI~ĐỒNG XOÀI|548~HUYỆN ĐỒNG PHÚ~ĐỒNG PHÚ|549~HUYỆN HỚN QUẢN~HỚN QUẢN|550~THỊ XÃ BÌNH LONG~BÌNH LONG|551~HUYỆN CHƠN THÀNH~CHƠN THÀNH|552~HUYỆN BÙ ĐĂNG~BÙ ĐĂNG|553~THỊ XÃ PHƯỚC LONG~PHƯỚC LONG|555~HUYỆN BÙ GIA MẬP~BÙ GIA MẬP|554~HUYỆN PHÚ RIỀNG~PHÚ RIỀNG",
  "49": "558~THỊ XÃ TÂY NINH~TÂY NINH|556~HUYỆN TÂN CHÂU~TÂN CHÂU|557~HUYỆN CHÂU THÀNH~CHÂU THÀNH|564~HUYỆN HÒA THÀNH~HÒA THÀNH|559~HUYỆN TÂN BIÊN~TÂN BIÊN|560~HUYỆN GÒ DẦU~GÒ DẦU|561~HUYỆN TRẢNG BÀNG~TRẢNG BÀNG|562~HUYỆN DƯƠNG MINH CHÂU~DƯƠNG MINH CHÂU|563~HUYỆN BẾN CẦU~BẾN CẦU",
  "50": "565~THỊ XÃ TÂN UYÊN~TÂN UYÊN|566~THỊ XÃ DĨ AN~DĨ AN|567~THỊ XÃ BẾN CÁT~BẾN CÁT|568~HUYỆN BÀU BÀNG~BÀU BÀNG|569~HUYỆN BẮC TÂN UYÊN~BẮC TÂN UYÊN|570~THỊ XÃ THUẬN AN~THUẬN AN|571~HUYỆN PHÚ GIÁO~PHÚ GIÁO|572~HUYỆN DẦU TIẾNG~DẦU TIẾNG|573~THỊ XÃ THỦ DẦU MỘT~THỦ DẦU MỘT",
  "51": "574~HUYỆN TRẢNG BOM~TRẢNG BOM|575~HUYỆN TÂN PHÚ~TÂN PHÚ|576~HUYỆN THỐNG NHẤT~THỐNG NHẤT|577~HUYỆN VĨNH CỬU~VĨNH CỬU|578~HUYỆN NHƠN TRẠCH~NHƠN TRẠCH|579~THÀNH PHỐ BIÊN HÒA~BIÊN HÒA|580~HUYỆN CẨM MỸ~CẨM MỸ|581~HUYỆN XUÂN LỘC~XUÂN LỘC|582~HUYỆN ĐỊNH QUÁN~ĐỊNH QUÁN|583~HUYỆN LONG THÀNH~LONG THÀNH|584~THỊ XÃ LONG KHÁNH~LONG KHÁNH",
  "52": "585~HUYỆN HÀM THUẬN BẮC~HÀM THUẬN BẮC|586~HUYỆN PHÚ QUÝ~PHÚ QUÝ|587~HUYỆN TUY PHONG~TUY PHONG|588~HUYỆN TÁNH LINH~TÁNH LINH|589~HUYỆN ĐỨC LINH~ĐỨC LINH|590~THỊ XÃ LA GI~LA GI|591~HUYỆN HÀM TÂN~HÀM TÂN|592~HUYỆN HÀM THUẬN NAM~HÀM THUẬN NAM|593~HUYỆN BẮC BÌNH~BẮC BÌNH|594~THÀNH PHỐ PHAN THIẾT~PHAN THIẾT",
  "53": "599~THÀNH PHỐ VŨNG TÀU~VŨNG TÀU|595~THÀNH PHỐ BÀ RỊA~BÀ RỊA|596~THỊ XÃ PHÚ MỸ~PHÚ MỸ|597~HUYỆN XUYÊN MỘC~XUYÊN MỘC|598~HUYỆN CHÂU ĐỨC~CHÂU ĐỨC|600~HUYỆN ĐẤT ĐỎ~ĐẤT ĐỎ|602~HUYỆN CÔN ĐẢO~CÔN ĐẢO|603~HUYỆN LONG ĐIỀN~LONG ĐIỀN",
  "54": "604~HUYỆN TÂN TRỤ~TÂN TRỤ|605~HUYỆN ĐỨC HUỆ~ĐỨC HUỆ|606~HUYỆN CẦN GIUỘC~CẦN GIUỘC|607~HUYỆN CẦN ĐƯỚC~CẦN ĐƯỚC|616~THÀNH PHỐ TÂN AN~TÂN AN|608~HUYỆN TÂN HƯNG~TÂN HƯNG|609~HUYỆN CHÂU THÀNH~CHÂU THÀNH|610~HUYỆN BẾN LỨC~BẾN LỨC|611~HUYỆN TÂN THẠNH~TÂN THẠNH|612~HUYỆN THẠNH HÓA~THẠNH HÓA|613~HUYỆN MỘC HÓA~MỘC HÓA|614~HUYỆN ĐỨC HÒA~ĐỨC HÒA|615~HUYỆN VĨNH HƯNG~VĨNH HƯNG|617~HUYỆN THỦ THỪA~THỦ THỪA|618~THỊ XÃ KIẾN TƯỜNG~KIẾN TƯỜNG",
  "55": "619~HUYỆN TÂN HỒNG~TÂN HỒNG|620~HUYỆN LẤP VÒ~LẤP VÒ|622~HUYỆN LAI VUNG~LAI VUNG|623~HUYỆN CHÂU THÀNH~CHÂU THÀNH|624~HUYỆN HỒNG NGỰ~HỒNG NGỰ|625~HUYỆN CAO LÃNH~CAO LÃNH|621~TP CAO LÃNH~TP CAO LÃNH|626~THỊ XÃ SA ĐÉC~SA ĐÉC|627~HUYỆN THÁP MƯỜI~THÁP MƯỜI|628~THỊ XÃ HỒNG NGỰ~TX HỒNG NGỰ|629~HUYỆN THANH BÌNH~THANH BÌNH|630~HUYỆN TAM NÔNG~TAM NÔNG",
  "56": "633~THÀNH PHỐ LONG XUYÊN~LONG XUYÊN|631~THỊ XÃ CHÂU ĐỐC~CHÂU ĐỐC|632~HUYỆN PHÚ TÂN~PHÚ TÂN|634~HUYỆN AN PHÚ~AN PHÚ|635~HUYỆN CHỢ MỚI~CHỢ MỚI|636~HUYỆN CHÂU PHÚ~CHÂU PHÚ|637~THỊ XÃ TÂN CHÂU~TÂN CHÂU|638~HUYỆN TỊNH BIÊN~TỊNH BIÊN|639~HUYỆN TRI TÔN~TRI TÔN|640~HUYỆN CHÂU THÀNH~CHÂU THÀNH|641~HUYỆN THOẠI SƠN~THOẠI SƠN",
  "57": "647~THÀNH PHỐ VĨNH LONG~VĨNH LONG|642~HUYỆN BÌNH MINH~BÌNH MINH|643~HUYỆN LONG HỒ~LONG HỒ|644~HUYỆN BÌNH TÂN~BÌNH TÂN|645~HUYỆN VŨNG LIÊM~VŨNG LIÊM|646~HUYỆN TAM BÌNH~TAM BÌNH|648~HUYỆN TRÀ ÔN~TRÀ ÔN|649~HUYỆN MANG THÍT~MANG THÍT",
  "58": "658~THÀNH PHỐ BẾN TRE~BẾN TRE|650~HUYỆN BA TRI~BA TRI|651~HUYỆN CHỢ LÁCH~CHỢ LÁCH|652~HUYỆN BÌNH ĐẠI~BÌNH ĐẠI|653~HUYỆN MỎ CÀY NAM~MỎ CÀY NAM|654~HUYỆN MỎ CÀY BẮC~MỎ CÀY BẮC|655~HUYỆN THẠNH PHÚ~THẠNH PHÚ|656~HUYỆN GIỒNG TRÔM~GIỒNG TRÔM|657~HUYỆN CHÂU THÀNH~CHÂU THÀNH",
  "59": "659~HUYỆN AN BIÊN~AN BIÊN|660~HUYỆN GIỒNG RIỀNG~GIỒNG RIỀNG|673~HUYỆN AN MINH~AN MINH|661~HUYỆN U MINH THƯỢNG~U MINH THƯỢNG|662~HUYỆN KIÊN LƯƠNG~KIÊN LƯƠNG|663~HUYỆN CHÂU THÀNH~CHÂU THÀNH|664~HUYỆN HÒN ĐẤT~HÒN ĐẤT|665~HUYÊN GIANG THÀNH~GIANG THÀNH|666~HUYỆN VĨNH THUẬN~VĨNH THUẬN|667~THÀNH PHỐ RẠCH GIÁ~RẠCH GIÁ|668~HUYỆN TÂN HIỆP~TÂN HIỆP|669~HUYỆN PHÚ QUỐC~PHÚ QUỐC|670~HUYỆN GÒ QUAO~GÒ QUAO|671~THỊ XÃ HÀ TIÊN~HÀ TIÊN|672~HUYỆN KIÊN HẢI~KIÊN HẢI",
  "60": "680~THỊ XÃ TRÀ VINH~TRÀ VINH|674~HUYỆN TRÀ CÚ~TRÀ CÚ|675~HUYỆN DUYÊN HẢI~DUYÊN HẢI|676~HUYỆN CẦU KÈ~CẦU KÈ|677~HUYỆN CÀNG LONG~CÀNG LONG|678~HUYỆN CHÂU THÀNH~CHÂU THÀNH|679~HUYỆN CẦU NGANG~CẦU NGANG|681~HUYỆN TIỂU CẦN~TIỂU CẦN",
  "61": "689~THÀNH PHỐ SÓC TRĂNG~SÓC TRĂNG|682~HUYỆN LONG PHÚ~LONG PHÚ|683~HUYỆN THẠNH TRỊ~THẠNH TRỊ|684~HUYỆN CHÂU THÀNH~CHÂU THÀNH|685~HUYỆN NGÃ NĂM~NGÃ NĂM|686~HUYỆN KẾ SÁCH~KẾ SÁCH|687~HUYỆN CÙ LAO DUNG~CÙ LAO DUNG|688~HUYỆN TRẦN ĐỀ~TRẦN ĐỀ|690~HUYỆN MỸ XUYÊN~MỸ XUYÊN|691~HUYỆN MỸ TÚ~MỸ TÚ|692~HUYỆN VĨNH CHÂU~VĨNH CHÂU",
  "62": "695~THỊ XÃ BẠC LIÊU~BẠC LIÊU|693~HUYỆN HÒA BÌNH~HÒA BÌNH|694~HUYỆN ĐÔNG HẢI~ĐÔNG HẢI|696~HUYỆN GIÁ RAI~GIÁ RAI|697~HUYỆN VĨNH LỢI~VĨNH LỢI|698~HUYỆN HỒNG DÂN~HỒNG DÂN|699~HUYỆN PHƯỚC LONG~PHƯỚC LONG",
  "63": "707~THÀNH PHỐ CÀ MAU~CÀ MAU|700~HUYỆN CÁI NƯỚC~CÁI NƯỚC|701~HUYỆN NĂM CĂN~NĂM CĂN|702~HUYỆN ĐẦM DƠI~ĐẦM DƠI|703~HUYỆN NGỌC HIỂN~NGỌC HIỂN|704~HUYỆN U MINH~U MINH|705~HUYỆN TRẦN VĂN THỜI~TRẦN VĂN THỜI|706~HUYỆN PHÚ TÂN~PHÚ TÂN|708~HUYỆN THỚI BÌNH~THỚI BÌNH",
  "64": "710~HUYỆN ĐIỆN BIÊN~ĐIỆN BIÊN|711~HUYỆN ĐIỆN BIÊN ĐÔNG~ĐIỆN BIÊN ĐÔNG|709~THÀNH PHỐ ĐIỆN BIÊN PHỦ~ĐIỆN BIÊN PHỦ|712~THỊ XÃ MƯỜNG LAY~MƯỜNG LAY|713~HUYỆN MƯỜNG NHÉ~MƯỜNG NHÉ|714~HUYỆN MƯỜNG ÁNG~MƯỜNG ÁNG|715~HUYỆN NẬM PỒ~NẬM PỒ|716~HUYỆN MƯỜNG CHÀ~MƯỜNG CHÀ|717~HUYỆN TỦA CHÙA~TỦA CHÙA|718~HUYỆN TUẦN GIÁO~TUẦN GIÁO",
};
const _vtp_districts_parsed_cache = new Map();

function get_vtp_districts_for_prov(vtpProvId) {
  const key = String(vtpProvId || "");
  if (!key || !VTP_DISTRICTS_RAW[key]) return [];
  if (_vtp_districts_parsed_cache.has(key)) return _vtp_districts_parsed_cache.get(key);
  const items = VTP_DISTRICTS_RAW[key].split("|")
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split("~");
      const id = Number(parts[0]) || "";
      const full = parts[1] || "";
      const shortRaw = parts[2] || full;
      const normFull = norm_vn_geo_fuzzy(full);
      const normShort = norm_vn_geo_fuzzy(shortRaw);
      const keys = [];
      if (normFull) {
        keys.push(normFull);
        if (normFull.startsWith("quan ")) keys.push("q " + normFull.slice(5));
        else if (normFull.startsWith("huyen dao ")) {
          const islandShort = normFull.slice(10);
          keys.push("huyen " + islandShort, "h " + islandShort, islandShort);
        } else if (normFull.startsWith("huyen ")) keys.push("h " + normFull.slice(6));
        else if (normFull.startsWith("thi xa ")) keys.push("tx " + normFull.slice(7));
        else if (normFull.startsWith("thanh pho ")) keys.push("tp " + normFull.slice(10));
      }
      if (normShort && normShort !== normFull) keys.push(normShort);
      // Hỗ trợ viết tắt Quận 1..12 -> q1, q 1...
      const mQ = normShort.match(/^quan (\d{1,2})$/);
      if (mQ) {
        keys.push(`q ${mQ[1]}`);
        keys.push(`q${mQ[1]}`);
      }
      // HCM: Quận 2 & Quận 9 đã sáp nhập vào TP Thủ Đức (id 1231)
      if (key === "2" && id === 1231) {
        keys.push("quan 2", "q2", "q 2", "quan 9", "q9", "q 9");
      }
      // Ninh Thuận: TP Phan Rang - Tháp Chàm (id 544) -> khách hay ghi ngắn "Phan Rang"
      if (key === "47" && id === 544) {
        keys.push("phan rang", "tp phan rang");
      }
      // Đắk Lắk: TP Buôn Ma Thuột (id 515) -> khách hay ghi "BMT"
      if (key === "45" && id === 515) {
        keys.push("bmt", "tp bmt");
      }
      return { id, full, keys };
    });
  _vtp_districts_parsed_cache.set(key, items);
  return items;
}

const VTP_WARD_PREFIX_MAP = { "1": "PHƯỜNG ", "2": "XÃ ", "3": "THỊ TRẤN ", "0": "" };
const VTP_WARDS_RAW = {
  "1": "1~1HÀNG BUỒM|2~1HÀNG ĐÀO|3~1HÀNG GAI|4~1HÀNG MÃ|5~1LÝ THÁI TỔ|6~1PHÚC TÂN|7~1HÀNG BÀI|8~1HÀNG BÔNG|9~1TRÀNG TIỀN|10~1PHAN CHU TRINH|11~1CHƯƠNG DƯƠNG ĐỘ|12~1CỬA NAM|13~1TRẦN HƯNG ĐẠO|14~1CỬA ĐÔNG|15~1ĐỒNG XUÂN|16~1HÀNG BẠC|17~1HÀNG BỒ|18~1HÀNG TRỐNG",
  "2": "23~2BA VÌ|19~2TIÊN PHONG|20~2BA TRẠI|21~2YÊN BÀI|22~2KHÁNH THƯỢNG|24~3TÂY ĐẰNG|25~2PHÚ CƯỜNG|26~2CỔ ĐÔ|27~2TẢN HỒNG|28~2VẠN THẮNG|29~2PHONG VÂN|30~2PHÚ ĐÔNG|31~2PHÚ PHƯƠNG|32~2PHÚ CHÂU|33~2THÁI HÒA|34~2ĐỒNG THÁI|35~2PHÚ SƠN|36~2MINH CHÂU|37~2VẬT LẠI|38~2CHU MINH|39~2TÒNG BẠT|40~2CẨM LĨNH|41~2SƠN ĐÀ|42~2ĐÔNG QUANG|43~2THỤY AN|44~2CAM THƯỢNG|45~2THUẦN MỸ|46~2TẢN LĨNH|47~2VÂN HÒA|48~2CHÂU SƠN|49~2MINH QUANG",
  "3": "50~2LẠI YÊN|51~2CÁT QUẾ|52~2KIM CHUNG|53~2SONG PHƯƠNG|54~2TIỀN YÊN|55~2DƯƠNG LIỄU|56~2AN KHÁNH|57~2YÊN SỞ|58~3TRẠM TRÔI|59~2ĐỨC GIANG|60~2SƠN ĐỒNG|61~2VÂN CANH|62~2VÂN CÔN|63~2LA PHÙ|64~2DI TRẠCH|65~2ĐÔNG LA|66~2ĐỨC THƯỢNG|67~2MINH KHAI|68~2AN THƯỢNG|69~2ĐẮC SỞ|70~0ĐẠI LỘ THĂNG LONG",
  "4": "71~1YÊN SỞ|72~1VĨNH HƯNG|73~1THỊNH LIỆT|74~1ĐỊNH CÔNG|75~1ĐẠI KIM|76~1HOÀNG LIỆT|77~1TÂN MAI|78~1THANH TRÌ|79~1TRƯƠNG ĐỊNH|80~1GIÁP BÁT|81~1HOÀNG VĂN THỤ|82~1TƯƠNG MAI|83~1LĨNH NAM|84~1MAI ĐỘNG|85~1TRẦN PHÚ|86~2THANH LIỆT",
  "5": "87~2CANH NẬU|88~2CẨM YÊN|89~2CẦN KIỆM|90~2CHÀNG SƠN|91~2DỊ NẬU|92~2ĐẠI ĐỒNG|93~2ĐỒNG TRÚC|94~2HẠ BẰNG|95~2HƯƠNG NGẢI|96~3LIÊN QUAN|97~2TIẾN XUÂN|98~2THẠCH XÁ|99~2YÊN BÌNH|100~2YÊN TRUNG|101~2BÌNH PHÚ|102~2BÌNH YÊN|103~2HỮU BẰNG|104~2KIM QUAN|105~2LẠI THƯỢNG|106~2PHÚ KIM|107~2PHÙNG XÁ|108~2TÂN XÃ|109~2THẠCH HÒA",
  "6": "115~2PHÚ NGHĨA|116~3CHÚC SƠN|117~2ĐÔNG PHƯƠNG YÊN|118~2TRƯỜNG YÊN|119~2ĐỒNG LẠC|120~2HOÀ CHÍNH|121~2PHÚ NAM AN|122~2TRẦN PHÚ|123~2VĂN VÕ|124~2PHỤNG CHÂU|125~2TIÊN PHƯƠNG|126~2ĐÔNG SƠN|127~2NGỌC SƠN|128~2NGỌC HOÀ|129~2THUỶ XUÂN TIÊN|130~2THANH BÌNH|131~2TRUNG HOÀ|132~2ĐẠI YÊN|133~2THUỴ HƯƠNG|134~2TỐT ĐỘNG|135~2LAM ĐIỀN|136~2TÂN TIẾN|137~2NAM PHƯƠNG TIẾN|138~2HỢP ĐỒNG|139~2HỮU VĂN|140~2THƯỢNG VỰC|141~2HỒNG PHONG|142~2ĐỒNG PHÚ|110~2HOÀNG VĂN THỤ|111~2HOÀNG DIỆU|112~2QUẢNG BỊ|113~2MỸ LƯƠNG|114~3XUÂN MAI",
  "7": "143~2PHÚ MINH|144~2PHÚ CƯỜNG|145~2XUÂN GIANG|146~3SÓC SƠN|147~2QUANG TIẾN|148~2TÂN DÂN|149~2MINH TRÍ|150~2THANH XUÂN|151~2MINH PHÚ|152~2BẮC SƠN|153~2NAM SƠN|154~2HỒNG KỲ|155~2TÂN HƯNG|156~2TRUNG GIÃ|157~2TÂN MINH|158~2KIM LŨ|159~2XUÂN THU|160~2PHÙ LỖ|161~2MAI ĐÌNH|162~2VIỆT LONG|163~2XUÂN TÀNG|164~2TIÊN DƯỢC|165~2HIỀN NINH|166~2ĐỨC HOÀ|167~2ĐÔNG XUÂN|168~2BẮC PHÚ|169~2PHÙ LINH|170~2ĐỨC HẬU|171~3PHÙ LỖ",
  "8": "172~3YÊN VIÊN|173~2DƯƠNG XÁ|174~3TRÂU QUỲ|175~2BÁT TRÀNG|176~2TRUNG MẦU|177~2YÊN THƯỜNG|178~2BÌNH XUYÊN|179~2PHÙ ĐỔNG|180~2YÊN VIÊN|181~2ĐÔNG DƯ|182~2DƯƠNG HÀ|183~2NINH HIỆP|184~2DƯƠNG QUANG|185~2LỆ CHI|186~2KIÊU KỴ|187~2CỔ BI|188~2VĂN ĐỨC|189~2KIM LAN|190~2KIM SƠN|191~2PHÚ THỊ|192~2ĐẶNG XÁ|193~2ĐA TỐN|194~2ĐÌNH XUYÊN",
  "9": "195~1 QUỲNH LÔI|196~1TRƯƠNG ĐỊNH|197~1THANH TRÌ|198~1KIM NGƯU|199~1MINH KHAI|200~1THANH LƯƠNG|201~1BÁCH KHOA|202~1BẠCH MAI|203~1CẦU DỀN|204~1THANH NHÀN|205~1ĐỒNG TÂM|206~1QUỲNH MAI|207~1BẠCH ĐẰNG|208~1VĨNH TUY|209~1ĐÔNG MÁC|210~1PHẠM ĐÌNH HỔ|211~1NGUYỄN DU|212~1BÙI THỊ XUÂN|213~1LÊ ĐẠI HÀNH|214~1NGÔ THÌ NHẬM|215~1PHỐ HUẾ|216~1ĐỒNG NHÂN|217~1MINH KHAI",
  "10": "218~1QUẢNG AN|219~1TỨ LIÊN|220~1YÊN PHỤ|221~1NHẬT TÂN|222~1THỤY KHUÊ|223~1XUÂN LA|224~1PHÚ THƯỢNG|225~1BƯỞI|226~1XUÂN ĐỈNH|227~1XUÂN TẢO",
  "11": "247~2MÊ LINH|228~2TIỀN PHONG|229~2ĐẠI THỊNH|230~2MAI LÂM|231~2TIẾN THỊNH|232~2TIẾN THẮNG|233~2TRÁNG VIỆT|234~2VĂN KHÊ|235~2HOÀNG KIM|236~2CHU PHAN|237~2TAM ĐÔNG|238~2THẠCH ĐÀ|239~2LIÊN MẠC|240~2THỤY LÂM|241~2TỰ LẬP|242~2KIM HOA|243~2VẠN YÊN|244~3QUANG MINH|245~3CHI ĐÔNG|246~2THANH LÂM",
  "12": "257~2THANH TRÌ|248~2TÂN TRIỀU|249~2NGỌC HỒI|250~2NGŨ HIỆP|251~2TAM HIỆP|252~2TỨ HIỆP|253~3VĂN ĐIỂN|254~2VĨNH QUỲNH|255~2ĐẠI ÁNG|256~2LIÊN NINH|258~2THANH LIỆT|259~2HỮU HÒA|260~2YÊN MỸ|261~2DUYÊN HÀ|262~2VẠN PHÚC|263~2TẢ THANH OAI|264~2ĐÔNG MỸ",
  "13": "265~2CAO THÀNH|266~2ĐẠI CƯỜNG|267~2ĐẠI HÙNG|268~2ĐỘI BÌNH|269~2ĐÔNG LỖ|270~2ĐỒNG TÂN|271~2HÒA LÂM|272~2HÒA PHÚ|273~2HÒA XÁ|274~2TRUNG TÚ|275~2TRƯỜNG THỊNH|276~2VIÊN AN|277~3VÂN ĐÌNH|278~2ĐỒNG TIẾN|279~2HOA SƠN|280~2HÒA NAM|281~2HỒNG QUANG|282~2KIM ĐƯỜNG|283~2LIÊN BẠT|284~2LƯU HOÀNG|285~2MINH ĐỨC|286~2PHÙ LƯU|287~2PHƯƠNG TÚ|288~2QUẢNG PHÚ CẦU|289~2SƠN CÔNG|290~2TẢO DƯƠNG VĂN|291~2TRẦM LỘNG|292~2VẠN THÁI|293~2VIÊN NỘI|294~2TÂN PHƯƠNG",
  "14": "295~1NGHĨA ĐÔ|296~1NGHĨA TÂN|297~1DỊCH VỌNG HẬU|298~1DỊCH VỌNG|299~1QUAN HOA|300~1YÊN HÒA|301~1TRUNG HÒA|302~1MAI DỊCH",
  "15": "307~3PHÚC THỌ|303~2TAM THUẤN|304~2THANH ĐA|305~2 LIÊN HIỆP|306~2 THỌ LỘC|308~2PHÚC HÒA|309~2TRẠCH MỸ LỘC|310~2TÍCH GIANG|311~2SEN CHIỂU|312~2PHƯƠNG ĐỘ|313~2CẨM ĐÌNH|314~2VÕNG XUYÊN|315~2LONG XUYÊN|316~2THƯỢNG CỐC|317~2XUÂN PHÚ|318~2VÂN PHÚC|319~2 VÂN NAM|320~2VÂN HÀ|321~2 HÁT MÔN|322~2HIỆP THUẬN|323~2TAM HIỆP|324~2NGỌC TẢO|325~2PHỤNG THƯỢNG|326~2HÁT MÔN|327~2THỌ LỘC",
  "16": "328~2BÍCH HÒA|329~2CỰ KHÊ|330~2BÌNH MINH|331~2THANH MAI|332~2THANH THÙY|333~2KIM THƯ|334~2LIÊN CHÂU|335~2XUÂN DƯƠNG|336~3KIM BÀI|337~2KIM AN|338~2CAO DƯƠNG|339~2DÂN HÒA|340~2TÂN ƯỚC|341~2CAO VIÊN|342~2MỸ HƯNG|343~2TAM HƯNG|344~2THANH CAO|345~2THANH VĂN|346~2ĐỖ ĐỘNG|347~2PHƯƠNG TRUNG|348~2HỒNG DƯƠNG",
  "17": "349~2AN MỸ|350~2BỘT XUYÊN|351~2PHÚC LÂM|352~2AN PHÚ|353~2HỢP THANH|354~2MỸ THÀNH|355~2ĐỒNG TÂM|356~2HƯƠNG SƠN|357~2ĐỐC TÍN|358~2VẠN KIM|359~2HÙNG TIẾN|360~2AN TIẾN|361~2ĐẠI HƯNG|362~2HỢP TIẾN|363~2PHÙ LƯU TẾ|364~2PHÙNG XÁ|365~2XUY XÁ|366~2LÊ THANH|367~2HỒNG SƠN|368~2TUY LAI|369~2THƯỢNG LÂM|370~3ĐẠI NGHĨA",
  "18": "371~1NGÔ QUYỀN|372~2ĐƯỜNG LÂM|373~1XUÂN KHANH|374~2CỔ ĐÔNG|375~2XUÂN SƠN|376~1LÊ LỢI|377~1SƠN LỘC|378~1QUANG TRUNG|379~1PHÚ THỊNH|380~1TRUNG HƯNG|381~1VIÊN SƠN|382~1TRUNG SƠN TRẦM|383~2KIM SƠN|384~2SƠN ĐỒNG|385~2THANH MỸ|386~2SƠN ĐÔNG|387~2VÕNG XUYÊN|388~2THỌ LỘC",
  "19": "400~2ĐAN PHƯỢNG|389~2HẠ MỖ|390~2LIÊN HÀ|391~2LIÊN TRUNG|392~2TÂN HỘI|393~2TÂN LẬP|394~3PHÙNG|395~2PHƯƠNG ĐÌNH|396~2THƯỢNG MỖ|397~2TRUNG CHÂU|398~2THỌ AN|399~2THỌ XUÂN|401~2ĐỒNG THÁP|402~2HỒNG HÀ|403~2LIÊN HỒNG|404~2SONG PHƯỢNG",
  "20": "410~1LONG BIÊN|405~1THẠCH BÀN|406~1PHÚC ĐỒNG|407~1PHÚC LỢI|408~1NGỌC THỤY|409~1BỒ ĐỀ|411~1NGỌC LÂM|412~1ĐỨC GIANG|413~1PHÚ VIÊN|414~1SÀI ĐỒNG|415~1GIA THỤY|416~1THƯỢNG THANH|417~1VIỆT HƯNG|418~1GIANG BIÊN|419~1CỰ KHỐI",
  "21": "423~3QUỐC OAI|420~2ĐỒNG QUANG|421~2TÂN PHÚ|422~2ĐÔNG XUÂN|424~2SÀI SƠN|425~2PHƯỢNG CÁCH|426~2YÊN SƠN|427~2THẠCH THÁN|428~2NGỌC MỸ|429~2NGHĨA HƯƠNG|430~2CẤN HỮU|431~2NGỌC LIỆP|432~2LIỆP TUYẾT|433~2TUYẾT NGHĨA|434~2ĐÔNG YÊN|435~2HÒA THẠCH|436~2PHÚ CÁT|437~2PHÚ MÃN|438~2CỘNG HÒA|439~2ĐẠI THÀNH|440~2TÂN HÒA",
  "22": "455~1VĨNH PHÚC|456~1VẠN PHÚC|441~1NGỌC KHÁNH|442~1KIM MÃ|443~1ĐỘI CẤN|444~1GIẢNG VÕ|445~1NGỌC HÀ|446~1ĐIỆN BIÊN|447~1CỐNG VỊ|448~1NGUYỄN TRUNG TRỰC|449~1PHÚC XÁ|450~1QUÁN THÁNH|451~1TRÚC BẠCH|452~1LÁNG HẠ|453~1THÀNH CÔNG|454~1LIỄU GIAI",
  "23": "457~1THANH XUÂN NAM|458~1NHÂN CHÍNH|459~1HẠ ĐÌNH|460~1KHƯƠNG MAI|461~1THANH XUÂN BẮC|462~1PHƯƠNG MAI|463~1PHƯƠNG LIỆT|464~1THƯỢNG ĐÌNH|465~1KHƯƠNG ĐÌNH|466~1KHƯƠNG TRUNG|467~1THANH XUÂN TRUNG|468~1KIM GIANG",
  "24": "469~1Ô CHỢ DỪA|470~1VĂN CHƯƠNG|471~1TRUNG PHỤNG|472~1KHÂM THIÊN|473~1HÀNG BỘT|474~1THỔ QUAN|475~1CÁT LINH|476~1QUỐC TỬ GIÁM|477~1KHƯƠNG THƯỢNG|478~1PHƯƠNG MAI|479~1NGÃ TƯ SỞ|480~1LÁNG HẠ|481~1THỊNH QUANG|482~1LÁNG THƯỢNG|483~1TRUNG LIỆT|484~1TRUNG TỰ|485~1KIM LIÊN|486~1NAM ĐỒNG|487~1PHƯƠNG LIÊN|488~1VĂN MIẾU|489~1QUANG TRUNG|13329~1PHƯƠNG MAI",
  "25": "490~1PHÚ ĐÔ|491~1MỸ ĐÌNH I|492~1PHƯƠNG CANH|493~1CẦU DIỄN|494~1MỸ ĐÌNH II|495~1XUÂN PHƯƠNG|496~1MỄ TRÌ|497~1TRUNG VĂN|498~1ĐẠI MỖ|499~1TÂY MỖ",
  "26": "500~1XUÂN ĐỈNH|501~1CỔ NHUẾ 1|502~1THƯỢNG CÁT|503~1TÂY TỰU|504~1PHÚC DIỄN|505~1PHÚ DIỄN|506~1LIÊN MẠC|507~1MINH KHAI|508~1THỤY PHƯƠNG|509~1ĐỨC THẮNG|510~1ĐÔNG NGẠC|511~1CỔ NHUẾ 2|512~1XUÂN TẢO",
  "27": "540~3PHÚ XUYÊN|513~2QUANG LÃNG|514~2TÂN DÂN|515~2SƠN HÀ|516~2PHÚC TIẾN|517~2PHÚ YÊN|518~2HỒNG THÁI|519~2KHAI THÁI|520~2VĂN NHÂN|521~2TRI THỦY|522~2MINH TÂN|523~2HỒNG MINH|524~2PHƯỢNG DỰC|525~2ĐẠI THẮNG|526~2TRI TRUNG|527~2VĂN HOÀNG|528~2PHÚ TÚC|529~2QUANG TRUNG|530~2NAM TRIỀU|531~2VÂN TỪ|532~2CHÂU CAN|533~2BẠCH HẠ|534~2HOÀNG LONG|535~2CHUYÊN MỸ|536~2ĐẠI XUYÊN|537~2THỤY PHÚ|538~2NAM PHONG|539~3PHÚ MINH",
  "28": "553~3ĐÔNG ANH|541~2VÂN NỘI|542~2UY NỖ|543~2LIÊN HÀ|544~2KIM CHUNG|545~2MAI LÂM|546~2XUÂN CANH|547~2ĐÔNG HỘI|548~2KIM NỖ|549~2DỤC TÚ|550~2VÕNG LA|551~2HẢI BỐI|552~2NGUYÊN KHÊ|554~2XUÂN NỘN|555~2BẮC HỒNG|556~2TÀM XÁ|557~2VIỆT HÙNG|558~2TIÊN DƯƠNG|559~2VÂN HÀ|560~2VĨNH NGỌC|561~2ĐẠI MẠCH|562~2NAM HỒNG|563~2CỔ LOA|564~2THỤY LÂM|565~2XUÂN NỘN",
  "29": "566~2CỔ NHUẾ|567~2XUÂN ĐỈNH|568~1ĐẠI MỖ|569~1MỸ ĐÌNH|570~1MỄ TRÌ|571~1CẦU DIỄN|572~2ĐÔNG NGẠC|573~2NGHĨA ĐÔ|574~2CHÈM|575~2PHÚ DIỄN|576~1MAI DỊCH|577~2TÂY MỖ|578~2THƯỢNG CÁT|579~2THỤY PHƯƠNG|580~2TÂY TỰU|581~2XUÂN PHƯƠNG|582~2TRUNG VĂN",
  "30": "583~1QUANG TRUNG|584~1HÀ CẦU|585~1MỖ LAO|586~1VĂN QUÁN|587~1YẾT KIÊU|588~1PHÚC LA|589~1BIÊN GIANG|590~1LA KHÊ|591~1KIẾN HƯNG|592~1ĐỒNG MAI|593~1PHÚ LƯƠNG|594~1PHÚ LÃM|595~1VẠN PHÚC|596~1YÊN NGHĨA|597~1DƯƠNG NỘI|598~1PHÚ LA|599~1NGUYỄN TRÃI",
  "31": "600~3THƯỜNG TÍN|601~2DŨNG TIẾN|602~2NGUYỄN TRÃI|603~2TIỀN PHONG|604~2VĂN PHÚ|605~2NINH SỞ|606~2TỰ NHIÊN|607~2THƯ PHÚ|608~2LIÊN PHƯƠNG|609~2QUẤT ĐỘNG|610~2LÊ LỢI|611~2THẮNG LỢI|612~2TÔ HIỆU|613~2MINH CƯỜNG|614~2TÂN MINH|615~2HIỀN GIANG|616~2HÒA BÌNH|617~2KHÁNH HÀ|618~2NHỊ KHÊ|619~2DUYÊN THÁI|620~2HỒNG VÂN|621~2VÂN TẢO|622~2VĂN BÌNH|623~2HÀ HỒI|624~2CHƯƠNG DƯƠNG|625~2VĂN TỰ|626~2THỐNG NHẤT|627~2VẠN ĐIỂM|628~2NGHIÊM XUYÊN",
  "32": "640~11|629~14|630~15|631~16|632~17|633~18|634~19|635~110|636~111|637~112|638~113|639~114|641~12|642~13",
  "33": "643~1 1|644~12|645~13|646~14|647~15|648~16|649~17|650~18|651~19|652~110|653~111|654~112|655~113|656~114|657~115",
  "34": "658~14|659~15|660~16|661~17|664~11|662~19|663~110|665~12|666~13|667~18|668~111|669~112|670~113|671~114",
  "35": "681~1 1|672~114|673~19|674~110|675~111|676~112|677~113|678~17|679~18|680~16|682~12|683~13|684~14|685~15|686~115",
  "36": "687~3CỦ CHI|688~2TÂN PHÚ TRUNG|689~2TÂN THÔNG HỘI|690~2PHƯỚC VĨNH AN|691~2TÂN AN HỘI|692~2TRUNG LẬP|693~2TRUNG LẬP HẠ|694~2PHẠM VĂN CỘI|695~2NHUẬN ĐỨC|696~2TÂN THẠNH ĐÔNG|697~2TÂN THẠNH TÂY|698~2HOÀ PHÚ|699~2TRUNG AN|700~2PHÚ HOÀ ĐÔNG|701~2PHƯỚC HIỆP|702~2PHƯỚC THẠNH|703~2THÁI MỸ|704~2BÌNH MỸ|705~2AN PHÚ|706~2TRUNG LẬP THƯỢNG|707~2AN NHƠN TÂY|708~2PHÚ MỸ HƯNG",
  "37": "713~3NHÀ BÈ|709~2PHÚ XUÂN|710~2LONG THỚI|711~2HIỆP PHƯỚC|712~2PHƯỚC LỘC|714~2NHƠN ĐỨC|715~2PHƯỚC KIỂN",
  "38": "716~11|717~12|718~13|719~14|720~15|721~16|722~17|723~18|724~19|725~110|726~111|727~112|728~113|729~114|730~115",
  "39": "731~1TÂN PHONG|732~1TÂN PHÚ|733~1TÂN HƯNG|734~1TÂN KIỂNG|735~1TÂN QUY|736~1TÂN THUẬN ĐÔNG|737~1TÂN THUẬN TÂY|738~1PHÚ THUẬN|739~1BÌNH THUẬN|740~1PHÚ MỸ",
  "40": "741~1THẠNH XUÂN|742~1AN PHÚ ĐÔNG|743~1HIỆP THÀNH|744~1TRUNG MỸ TÂY|745~1TÂN HƯNG THUẬN|746~1TÂN CHÁNH HIỆP|747~1TÂN THỚI NHẤT|748~1ĐÔNG HƯNG THUẬN|749~1THỚI AN|750~1THẠNH LỘC|751~1TÂN THỚI HIỆP",
  "42": "765~3CẦN THẠNH|766~2AN THỚI ĐÔNG|767~2LÝ NHƠN|768~2TAM THÔN HIỆP|769~2BÌNH KHÁNH|770~2LONG HÒA|771~2THẠNH AN",
  "43": "772~1BẾN NGHÉ|773~1NGUYỄN THÁI BÌNH|774~1NGUYỄN CƯ TRINH|775~1TÂN ĐỊNH|776~1ĐA KAO|777~1BẾN THÀNH|778~1PHẠM NGŨ LÃO|779~1CÔ GIANG|780~1CẦU ÔNG LÃNH|781~1CẦU KHO",
  "44": "792~11|782~13|783~14|784~15|785~111|786~112|787~113|788~114|789~115|790~116|791~117|793~16|794~17|795~18|796~19|797~110",
  "45": "812~11|798~13|799~14|800~15|801~16|802~17|803~18|804~19|805~110|806~111|807~112|808~113|809~114|810~116|811~115|813~12",
  "46": "814~1AN LẠC|815~1BÌNH TRỊ ĐÔNG|816~1BÌNH TRỊ ĐÔNG A|817~1BÌNH TRỊ ĐÔNG B|818~1BÌNH HƯNG HÒA|819~1BÌNH HƯNG HÒA A|820~1BÌNH HƯNG HÒA B|821~1TÂN TẠO|822~1TÂN TẠO A|823~1AN LẠC A|17418~1BÌNH HƯNG HOÀ B",
  "47": "824~11|825~12|826~13|827~14|828~15|829~16|830~17|831~18|832~19|833~110|834~111|835~112|836~113|837~114|838~115|839~116",
  "48": "843~11|840~19|841~18|842~110|844~112|845~12|846~13|847~14|848~15|849~16|850~118|851~114|852~115|853~113|854~116",
  "49": "860~2BÌNH CHÁNH|855~2VĨNH LỘC A|856~2VĨNH LỘC B|857~2LÊ MINH XUÂN|858~2TÂN KIÊN|859~2TÂN TÚC|861~2TÂN NHỰT|862~2AN PHÚ TÂY|863~2TÂN QUÝ TÂY|864~2BÌNH HƯNG|865~2BÌNH LỢI|866~2ĐA PHƯỚC|867~2PHONG PHÚ|868~2PHẠM VĂN HAI|869~2HƯNG LONG|870~2QUY ĐỨC|871~3TÂN TÚC",
  "51": "901~11|902~12|884~126|885~115|886~124|887~13|888~117|889~121|890~119|891~122|892~15|893~16|894~17|895~111|896~112|897~113|898~114|899~125|900~127|16990~128",
  "52": "903~11|904~12|905~13|906~14|907~15|908~19|909~17|910~18|911~110|912~111|913~112|914~113|915~114|916~115|917~117",
  "54": "929~1TÂN THÀNH|930~1SƠN KỲ|931~1TÂN SƠN NHÌ|932~1TÂN QUÝ|933~1TÂY THẠNH|934~1HIỆP TÂN|935~1HÒA THẠNH|936~1TÂN THỚI HÒA|937~1PHÚ THỌ HÒA|938~1PHÚ TRUNG|939~1PHÚ THẠNH",
  "55": "951~3HÓC MÔN|940~2TÂN THỚI NHÌ|941~2NHỊ BÌNH|942~2XUÂN THỚI SƠN|943~2BÀ ĐIỂM|944~2TÂN HIỆP|945~2ĐÔNG THẠNH|946~2XUÂN THỚI ĐÔNG|947~2XUÂN THỚI THƯỢNG|948~2THỚI TAM THÔN|949~2TRUNG CHÁNH|950~2TÂN XUÂN",
  "56": "952~1HOÀNG VĂN THỤ|953~1MINH KHAI|954~1PHAN BỘI CHÂU|955~1QUANG TRUNG|956~1PHẠM HỒNG THÁI|957~1TRẠI CHUỐI|958~1THƯỢNG LÝ|959~1HẠ LÝ|960~1SỞ DẦU|961~1HÙNG VƯƠNG|962~1QUÁN TOAN",
  "57": "963~1BÀNG LA|964~1HỢP ĐỨC|965~1NGỌC HẢI|966~1NGỌC XUYÊN|967~1MINH ĐỨC|968~1VẠN HƯƠNG|969~1VẠN SƠN",
  "58": "970~1CÁT DÀI|971~1AN BIÊN|972~1ĐÔNG HẢI|973~1AN DƯƠNG|974~1DƯ HÀNG|975~1DƯ HÀNG KÊNH|976~1HÀNG KÊNH|977~1HỒ NAM|978~1KÊNH DƯƠNG|979~1LAM SƠN|980~1NIỆM NGHĨA|981~1NGHĨA XÃ|982~1TRẠI CAU|983~1TRẦN NGUYÊN HÃN|984~1VĨNH NIỆM",
  "59": "995~3AN DƯƠNG|985~2ĐẠI BẢN|986~2TÂN TIẾN|987~2AN HƯNG|988~2AN HỒNG|989~2NAM SƠN|990~2LÊ LỢI|991~2ĐĂNG CƯƠNG|992~2ĐỒNG THÁI|993~2QUỐC TUẤN|994~2HỒNG THÁI|996~2LÊ THIỆN|997~2AN HÒA|998~2HỒNG PHONG|999~2BẮC SƠN|1000~2AN ĐỒNG",
  "60": "1001~3BẠCH LONG VĨ",
  "61": "1002~3NÚI ĐỐI|1003~2ĐÔNG PHƯƠNG|1004~2THANH SƠN|1005~2MINH TÂN|1006~2HỮU BẰNG|1007~2THUẬN THIÊN|1008~2DU LỄ|1009~2NGŨ PHÚC|1010~2KIẾN QUỐC|1011~2THỤY HƯƠNG|1012~2ĐẠI HÀ|1013~2NGŨ ĐOAN|1014~2TÂN TRÀO|1015~2ĐOÀN XÁ|1016~2ĐẠI HỢP|1017~2TÚ SƠN|1018~2TÂN PHONG|1019~2ĐẠI ĐỒNG",
  "62": "1020~1ĐA PHÚC|1021~1HƯNG ĐẠO|1022~1ANH DŨNG|1023~1HẢI THÀNH|1024~1HÒA NGHĨA|1025~1TÂN THÀNH",
  "63": "1027~3AN LÃO|1026~3TRƯỜNG SƠN|1028~2MỸ ĐỨC|1029~2TRƯỜNG THÀNH|1030~2TRƯỜNG THỌ|1031~2QUANG TRUNG|1032~2AN THẮNG|1033~2CHIẾN THẮNG|1034~2TÂN DÂN|1035~2QUANG HƯNG|1036~2QUỐC TUẤN|1037~2AN THÁI|1038~2TÂN VIÊN|1039~2AN THỌ|1040~2BÁT TRANG|1041~2AN TIẾN|1042~2THÁI SƠN",
  "64": "1047~3VĨNH BẢO|1043~2AN HOÀ|1044~2VĨNH LONG|1045~2VĨNH TIẾN|1046~2TÂN LIÊN|1048~2TRUNG LẬP|1049~2HIỆP HÒA|1050~2ĐỒNG MINH|1051~2THANH LƯƠNG|1052~2CỘNG HIỀN|1053~2TIỀN PHONG|1054~2VĨNH PHONG|1055~2CAO MINH|1056~2TAM CƯỜNG|1057~2HƯNG NHÂN|1058~2TAM ĐA|1059~2NHÂN HOÀ|1060~2CỔ AM|1061~2TRẤN DƯƠNG|1062~2VĨNH AN|1063~2DŨNG TIẾN|1064~2VINH QUANG|1065~2LIÊN AM|1066~2GIANG BIÊN|1067~2HÒA BÌNH|1068~2LÝ HỌC|1069~2VIỆT TIẾN|1070~2THẮNG THỦY|1071~2HÙNG TIẾN|1072~2TÂN HƯNG",
  "65": "1073~1BẮC SƠN|1074~1ĐÔNG HÒA|1075~1LÃM HÀ|1076~1NAM SƠN|1077~1NGỌC SƠN|1078~1PHÙ LIỄN|1079~1QUÁN TRỮ|1080~1TRÀNG MINH|1081~1TRẦN THÀNH NGỌ|1082~1VĂN ĐẨU",
  "66": "1094~3CÁT HẢI|1083~2VĂN PHONG|1084~2PHÙ LONG|1085~2HOÀNG CHÂU|1086~2ĐỒNG BÀI|1087~2NGHĨA LỘ|1088~2TRÂN CHÂU|1089~2HIỀN HÀO|1090~2GIA LUẬN|1091~2VIỆT HẢI|1092~2XUÂN ĐÁM|1093~3CÁT BÀ",
  "67": "1095~2THIÊN HƯƠNG|1096~2KÊNH GIANG|1097~2KỲ SƠN|1098~2KIỀN BÁI|1099~2LÂM ĐỘNG|1100~2HOA ĐỘNG|1101~2THUỶ ĐƯỜNG|1102~3MINH ĐỨC|1103~2NGŨ LÃO|1104~2THUỶ SƠN|1105~2CAO NHÂN|1106~2PHỤC LỄ|1107~2AN SƠN|1108~2TÂN DƯƠNG|1109~2ĐÔNG SƠN|1110~2LƯU KIẾM|1111~2MINH TÂN|1112~2LIÊN KHÊ|1113~2MỸ ĐỒNG|1114~2HOÀ BÌNH|1115~3NÚI ĐÈO|1116~2TRUNG HÀ|1117~2GIA MINH|1118~2GIA ĐỨC|1119~2PHÙ NINH|1120~2AN LƯ|1121~2HỢP THÀNH|1122~2LƯU KỲ|1123~2TAM HƯNG|1124~2PHẢ LỄ|1125~2LẠI XUÂN|1126~2LẬP LỄ|1127~2DƯƠNG QUAN|1128~2QUẢNG THANH|1129~2CHÍNH MỸ|1130~2THỦY TRIỀU|1131~2HOÀNG ĐỘNG",
  "68": "1132~1MÁY TƠ|1133~1LƯƠNG KHÁNH THIỆN|1134~1CẦU ĐẤT|1135~1LẠCH TRAY|1136~1LÊ LỢI|1137~1ĐẰNG GIANG|1138~1ĐÔNG KHÊ|1139~1CẦU TRE|1140~1ĐỒNG QUỐC BÌNH|1141~1MÁY CHAI|1142~1GIA VIỆN|1143~1LẠC VIÊN|1144~1VẠN MỸ",
  "69": "1145~3TIÊN LÃNG|1146~2NAM HƯNG|1147~2ĐÔNG HƯNG|1148~2TOÀN THẮNG|1149~2QUYẾT TIẾN|1150~2ĐẠI THẮNG|1151~2TIÊN CƯỜNG|1152~2TIÊN THANH|1153~2CẤP TIẾN|1154~2KIẾN THIẾT|1155~2ĐOÀN LẬP|1156~2BẠCH ĐẰNG|1157~2TIÊN THẮNG|1158~2BẮC HƯNG|1159~2TÂY HƯNG|1160~2HÙNG THẮNG|1161~2VINH QUANG|1162~2KHỞI NGHĨA|1163~2TIÊN HƯNG|1164~2TỰ CƯỜNG|1165~2TIÊN TIẾN|1166~2QUANG PHỤC|1167~2TIÊN MINH",
  "70": "1168~1NAM HẢI|1169~1ĐẰNG HẢI|1170~1THÀNH TÔ|1171~1TRÀNG CÁT|1172~1ĐÔNG HẢI 2|1173~1ĐẰNG LÂM|1174~1ĐẰNG GIANG|1175~1CÁT BI|1176~1ĐÔNG HẢI 1",
  "71": "1177~1KHUÊ TRUNG|1178~1HÒA THỌ ĐÔNG|1179~1HÒA THỌ TÂY|1180~1HÒA PHÁT|1181~1HÒA XUÂN|1182~1HÒA AN",
  "72": "1183~1HÒA KHÊ|1184~1THANH KHÊ ĐÔNG|1185~1THANH KHÊ TÂY|1186~1AN KHÊ|1187~1CHÍNH GIÁN|1188~1TAM THUẬN|1189~1TÂN CHÍNH|1190~1THẠC GIÁN|1191~1VĨNH TRUNG|1192~1XUÂN HÀ|1193~1HOÀ MINH|1194~1HOÀ PHÁT",
  "73": "1195~1MỸ AN|1196~1KHUÊ MỸ|1197~1HÒA QUÝ|1198~1HÒA HẢI",
  "74": "1199~1HÒA CƯỜNG NAM|1200~1HẢI CHÂU 1|1201~1HẢI CHÂU 2|1202~1THẠCH THANG|1203~1THANH BÌNH|1204~1THUẬN PHƯỚC|1205~1HÒA THUẬN ĐÔNG|1206~1HÒA THUẬN TÂY|1207~1NAM DƯƠNG|1208~1PHƯỚC NINH|1209~1BÌNH THUẬN|1210~1BÌNH HIÊN|1211~1HÒA CƯỜNG BẮC",
  "75": "1212~1NẠI HIÊN ĐÔNG|1213~1AN HẢI BẮC|1214~1AN HẢI TÂY|1215~1MÂN THÁI|1216~1PHƯỚC MỸ|1217~1AN HẢI ĐÔNG|1218~1THỌ QUANG",
  "76": "1219~1HÒA KHÁNH BẮC|1220~1HÒA MINH|1221~1HÒA HIỆP NAM|1222~1HÒA HIỆP BẮC|1223~1HÒA KHÁNH NAM|1224~1THANH KHÊ TÂY",
  "77": "1225~0ĐẢO HOÀNG SA|1226~0ĐẢO ĐÁ BẮC|1227~0ĐÁ LỒI|1228~0ĐẢO BẮC|1229~0ĐẢO LINH CÔN|1230~0ĐẢO PHÚ LÂM|1231~0ĐẢO CÂY|1232~0ĐẢO NAM|1233~0ĐẢO QUANG HÒA|1234~0CỒN BÔNG BAY|1235~0CỒN QUAN SÁT|1236~0CỒN CÁT TÂY|1237~0ĐÁ CHIM YẾN|1238~0ĐẢO BẠCH QUY|1239~0ĐẢO TRI TÔN|1240~0ĐẢO GIỮA|1241~0ĐÁ THÁP|1242~0ĐẢO HỮU NHẬT",
  "78": "1243~0ĐIỆN DƯƠNG",
  "79": "1244~2HÒA LIÊN|1245~2HÒA SƠN|1246~2HÒA NINH|1247~2HÒA BẮC|1248~2HÒA PHONG|1249~2HÒA PHÚ|1250~2HÒA CHÂU|1251~2HÒA KHƯƠNG|1252~2HÒA PHƯỚC|1253~2HÒA TIẾN|1254~2HÒA NHƠN|1255~2HÒA THỌ",
  "80": "1256~1CHÂU VĂN LIÊM|1257~1PHƯỚC THỚI|1258~1TRƯỜNG LẠC|1259~1THỚI HÒA|1260~1THỚI AN|1261~1THỚI LONG|1262~1LONG HƯNG",
  "81": "1263~3THỚI LAI|1264~2THỚI THẠNH|1265~2TÂN THẠNH|1266~2TRƯỜNG THÀNH|1267~2TRƯỜNG XUÂN A|1268~2TRƯỜNG XUÂN|1269~2TRƯỜNG XUÂN B|1270~2TRƯỜNG THẮNG|1271~2XUÂN THẮNG|1272~2THỚI TÂN|1273~2ĐÔNG BÌNH|1274~2ĐÔNG THUẬN|1275~2ĐỊNH MÔN",
  "82": "1276~1CÁI KHẾ|1277~1THỚI BÌNH|1278~1AN NGHIỆP|1279~1AN CƯ|1280~1AN HỘI|1281~1TÂN AN|1282~1AN LẠC|1283~1AN PHÚ|1284~1XUÂN KHÁNH|1285~1HƯNG LỢI|1286~1AN BÌNH|1287~1AN KHÁNH|1288~1AN HÒA",
  "83": "1295~1THỐT NỐT|1289~1THẠNH HÒA|1290~1TRUNG NHỨT|1291~1TRUNG KIÊN|1292~1TÂN LỘC|1293~1THUẬN AN|1294~1THỚI THUẬN|1296~1THUẬN HƯNG|1297~1TÂN HƯNG",
  "85": "1303~3VĨNH THẠNH|1298~2THẠNH MỸ|1299~2THẠNH QUỚI|1300~2THẠNH AN|1301~2THẠNH LỢI|1302~2THẠNH LỘC|1304~3THẠNH AN|1305~2VĨNH TRINH|1306~2VĨNH BÌNH|1307~2THẠNH TIẾN|1308~2THẠNH THẮNG",
  "87": "1315~3PHONG ĐIỀN|1309~2NHƠN ÁI|1310~2NHƠN NGHĨA|1311~2TÂN THỚI|1312~2GIAI XUÂN|1313~2MỸ KHÁNH|1314~2TRƯỜNG LONG",
  "88": "1316~0Phường Ngã Bảy",
  "89": "1317~1PHÚ THỨ|1318~1TÂN PHÚ|1319~1BA LÁNG|1320~1HƯNG PHÚ|1321~1LÊ BÌNH|1322~1THƯỜNG THẠNH|1323~1HƯNG THẠNH",
  "90": "1333~3CỜ ĐỎ|1324~2ĐÔNG THẮNG|1325~2TRUNG HƯNG|1326~2THẠNH PHÚ|1327~2THỚI HƯNG|1328~2ĐÔNG HIỆP|1329~2THỚI ĐÔNG|1330~2THỚI XUÂN|1331~2TRUNG AN|1332~2TRUNG THẠNH",
  "91": "1336~1BÌNH THỦY|1334~1TRÀ NÓC|1335~1AN THỚI|1337~1LONG HÒA|1338~1TRÀ AN|1339~1BÙI HỮU NGHĨA|1340~1LONG TUYỀN|1341~1THỚI AN ĐÔNG",
  "92": "1345~2TÂN PHÚ|1342~2PHÚ ĐÔNG|1343~2PHÚ TÂN|1344~2TÂN THỚI|1346~2TÂN THẠNH|1347~2PHÚ THẠNH",
  "93": "1348~3CHỢ GẠO|1353~2AN THẠNH THỦY|1354~2BÌNH PHAN|1355~2HÒA ĐỊNH|1356~2BÌNH NINH|1357~2PHÚ KIẾT|1358~2QUƠN LONG|1359~2SONG BÌNH|1360~2TÂN BÌNH THẠNH|1361~2TÂN THUẬN BÌNH|1362~2TRUNG HÒA|1363~2MỸ TỊNH AN|1364~2LONG BÌNH ĐIỀN|1365~2LƯƠNG HÒA LẠC|1366~2HÒA TỊNH|1349~2BÌNH PHỤC NHỨT|1350~2THANH BÌNH|1351~2XUÂN ĐÔNG|1352~2ĐĂNG HƯNG PHƯỚC",
  "94": "1367~3VĨNH BÌNH|1368~2ĐỒNG SƠN|1369~2LONG BÌNH|1370~2THẠNH NHỰT|1371~2BÌNH PHÚ|1372~2BÌNH TÂN|1373~2ĐỒNG THẠNH|1374~2LONG VĨNH|1375~2THÀNH CÔNG|1376~2THẠNH TRỊ|1377~2VĨNH HỰU|1378~2YÊN LUÔNG|1379~2BÌNH NHÌ",
  "95": "1391~3CÁI BÈ|1380~2HÒA HƯNG|1381~2MỸ HỘI|1382~2MỸ ĐỨC ĐÔNG|1383~2MỸ LỢI A|1384~2MỸ LƯƠNG|1385~2MỸ TÂN|1386~2MỸ TRUNG|1387~2MỸ ĐỨC TÂY|1388~2HẬU MỸ BẮC A|1389~2AN THÁI ĐÔNG|1390~2ĐÔNG HÒA HIỆP|1392~2AN HỮU|1393~2HÒA KHÁNH|1394~2TÂN THANH|1395~2AN THÁI TRUNG|1396~2HẬU MỸ BẮC B|1397~2HẬU MỸ TRINH|1398~2HẬU THÀNH|1399~2AN CƯ|1400~2HẬU MỸ PHÚ|1401~2THIỆN TRÍ|1402~2THIỆN TRUNG|1403~2TÂN HƯNG|1404~2MỸ LỢI B",
  "96": "1405~3TÂN HÒA|1406~2TÂN TÂY|1407~2VÀM LÁNG|1408~2PHÚ TÂN|1409~2TÂN PHƯỚC|1410~2BÌNH ÂN|1411~2BÌNH NGHỊ|1412~2KIỂNG PHƯỚC|1413~2GIA THUẬN|1414~2TÂN ĐIỀN|1415~2TÂN THÀNH|1416~2TÂN ĐÔNG|1417~2PHƯỚC TRUNG|1418~2BÌNH ĐÔNG|1419~2PHÚ ĐÔNG|1420~2TĂNG HÒA",
  "97": "1421~3TÂN HIỆP|1422~2DƯỠNG ĐIỂM|1423~2VĨNH KIM|1424~2KIM SƠN|1425~2ĐIỀM HY|1426~2NHỊ BÌNH|1427~2TAM HIỆP|1428~2THÂN CỬU NGHĨA|1429~2LONG ĐỊNH|1430~2THỚI SƠN|1431~2BÀN LONG|1432~2SONG THUẬN|1433~2TÂN LÝ ĐÔNG|1434~2TÂN LÝ TÂY|1435~2LONG AN|1436~2TÂN HƯƠNG|1437~2THẠNH PHÚ|1438~2BÌNH ĐỨC|1439~2ĐÔNG HÒA|1440~2PHƯỚC THẠNH|1441~2BÌNH TRƯNG|1442~2TÂN HỘI ĐÔNG|1443~2HỮU ĐẠO|1444~2LONG HƯNG|1445~2PHÚ PHONG",
  "98": "1446~3MỸ PHƯỚC|1447~2PHÚ MỸ|1448~2MỸ PHƯỚC|1449~2HƯNG THẠNH|1450~2PHƯỚC LẬP|1451~2TÂN HÒA TÂY|1452~2TÂN HÒA THÀNH|1453~2TÂN LẬP 1|1454~2TÂN LẬP 2|1455~2THẠNH HÒA|1456~2THẠNH MỸ|1457~2THẠNH TÂN|1458~2TÂN HÒA ĐÔNG",
  "99": "1459~11|1460~12|1461~13|1462~14|1463~15|1464~2LONG CHÁNH|1465~2LONG THUẬN|1466~2LONG HÒA|1467~2LONG HƯNG|1468~2TÂN TRUNG|1469~2BÌNH ĐÔNG|1470~2BÌNH XUÂN",
  "100": "1471~0THỊ XÃ CAI LẬY|1472~2BÌNH PHÚ|1473~2NGŨ HIỆP|1474~2MỸ PHƯỚC TÂY|1475~2NHỊ QUÝ|1476~2TAM BÌNH|1477~2TÂN PHONG|1478~2THẠNH LỘC|1479~2CẨM SƠN|1480~2HỘI XUÂN|1481~2LONG KHÁNH|1482~2LONG TIÊN|1483~2MỸ HẠNH ĐÔNG|1484~2MỸ HẠNH TRUNG|1485~2MỸ LONG|1486~2PHÚ NHUẬN|1487~2MỸ THÀNH NAM|1488~2PHÚ CƯỜNG|1489~2MỸ THÀNH BẮC|1490~2TÂN PHÚ|1491~2NHỊ MỸ|1492~2TÂN HỘI|1493~2PHÚ AN|1494~2LONG TRUNG|1495~2TÂN BÌNH|1496~2THANH HÒA|1497~2HIỆP ĐỨC|1498~2PHÚ QUÝ|1499~12|1500~11|1501~14|1502~13|1503~15",
  "101": "1504~1 1|1505~12|1506~13|1507~14|1508~15|1509~16|1510~17|1511~18|1512~19|1513~110|1514~1TÂN LONG|1515~2TÂN MỸ CHÁNH|1516~2MỸ PHONG|1517~2ĐẠO THẠNH|1518~2TRUNG AN|16991~2PHƯỚC THẠNH|12810~2THỚI SƠN",
  "102": "1519~13|1520~14|1521~15|1522~17|1523~2HỎA LỰU|1524~2TÂN TIẾN|1525~2HỎA TIẾN|1526~2VỊ TÂN|1527~11",
  "103": "1528~2THẠNH XUÂN|1529~2TÂN HÒA|1530~2TRƯỜNG LONG TÂY|1531~2TRƯỜNG LONG A|1532~2NHƠN NGHĨA A|1533~3BẢY NGÀN|1534~0TT RẠCH GÒI|1535~2TÂN PHÚ THẠNH|1536~0TT CÁI TẮC|1537~0TT MỘT NGÀN",
  "104": "1544~0TT LONG MỸ|1538~2TÂN PHÚ|1539~2VĨNH THUẬN ĐÔNG|1540~2THUẬN HÒA|1541~2THUẬN HƯNG|1542~2LƯƠNG NGHĨA|1543~2VĨNH VIỄN A|1545~1TRÀ LỒNG|1546~2LONG BÌNH|1547~2LONG TRỊ|1548~2LONG TRỊ A|1549~2VĨNH VIỄN|1550~2XÀ PHIÊN|1551~2LƯƠNG TÂM|1552~2LONG PHÚ",
  "105": "1553~2ĐÔNG PHƯỚC|1554~2ĐÔNG PHƯỚC A|1555~2PHÚ HỮU|1556~2PHÚ TÂN|1557~2PHÚ HỮU A|1558~2PHÚ AN|1559~2ĐÔNG PHÚ|1560~2ĐÔNG THẠNH|1561~0TT NGÃ SÁU|1562~0TT MÁI DẦM",
  "106": "1563~2VỊ THỦY|1564~2VĨNH THUẬN TÂY|1565~2VỊ ĐÔNG|1566~2VỊ THẮNG|1567~2VỊ TRUNG|1568~2VĨNH TƯỜNG|1569~2VĨNH TRUNG|1570~2VỊ THANH|1571~2VỊ BÌNH|1572~0TT NÀNG MAU",
  "107": "1573~1NGÃ BẢY|1574~1LÁI HIẾU|1575~1HIỆP THÀNH|1576~2HIỆP LỢI|1577~2ĐẠI THÀNH|1578~2TÂN THÀNH",
  "108": "1591~2PHỤNG HIỆP|1579~3KINH CÙNG|1580~2HIỆP HƯNG|1581~2THẠNH HÒA|1582~2BÌNH THÀNH|1583~2TÂN LONG|1584~3CÂY DƯƠNG|1585~2TÂN PHƯỚC HƯNG|1586~2TÂN BÌNH|1587~2HÒA AN|1588~2PHƯƠNG BÌNH|1589~2PHƯƠNG PHÚ|1590~2HÒA MỸ|1592~2LONG THẠNH|1593~3BÚNG TÀU",
  "109": "1594~2TÂN PHÚ|1595~2LONG BÌNH|1596~2LONG TRỊ A|1597~1THUẬN AN|1598~1TRÀ LỒNG|1599~2LONG PHÚ|1600~2LONG TRỊ|1601~1VĨNH TƯỜNG|1602~1BÌNH THẠNH",
  "110": "1603~2QUẢNG HÒA|1604~2QUẢNG SƠN|1605~2ĐĂK HA|1606~2ĐĂK RMĂNG|1607~2QUẢNG KHÊ|1608~2ĐĂK PLAO|1609~2ĐĂK SOM",
  "111": "1610~2ĐĂK RTIH|1611~2ĐĂK NGO|1612~2QUẢNG TRỰC|1613~2ĐĂK BÚK SO|1614~2QUẢNG TÂM|1615~2QUẢNG TÂN",
  "112": "1616~1NGHĨA TÂN|1617~1NGHĨA PHÚ|1618~1NGHĨA THÀNH|1619~1NGHĨA TRUNG|1620~1NGHĨA ĐỨC|1621~2ĐĂK NIA|1622~2ĐĂK R'MOAN|1623~2QUẢNG THÀNH",
  "113": "1624~2NAM DONG|1625~2TÂM THẮNG|1626~2EAPÔ|1627~2ĐĂK WIL|1628~2ĐĂK DRONG|1629~2CƯ KNIA|1630~2TRÚC SƠN|1631~3EATLING",
  "114": "1632~2NAM XUÂN|1633~3ĐĂK MÂM|1634~2ĐĂK SÔR|1635~2ĐĂK RÔ|1636~2NAM NUNG|1637~2ĐỨC XUYÊN|1638~2ĐĂK NANG|1639~2QUẢNG PHÚ|1640~2BUÔN CHOACH|1641~2NAM ĐÀ|1642~2TÂN THÀNH|1643~2NÂM NĐIR",
  "115": "1644~2NAM BÌNH|1645~3ĐỨC AN|1646~2ĐĂK HÒA|1647~2ĐĂK MÔI|1648~2THUẬN HẠNH|1649~2ĐĂK NDRUNG|1650~2NÂM N JANG|1651~2TRƯỜNG XUÂN|1652~2THUẬN HÀ",
  "116": "1653~3ĐĂK MIL|1654~2ĐĂK LAO|1655~2ĐĂK RLA|1656~2ĐĂK GẰN|1657~2ĐỨC MẠNH|1658~2ĐĂK NDRÓT|1659~2ĐĂK SÂK|1660~2THUẬN AN|1661~2LONG SƠN|1662~2ĐỨC MINH",
  "117": "1663~2ĐẠO NGHĨA|1664~2ĐĂK SIN|1665~2HƯNG BÌNH|1666~2ĐĂK RU|1667~2NHÂN ĐẠO|1668~3KIẾN ĐỨC|1669~2QUẢNG TÍN|1670~2ĐĂK WER|1671~2NHÂN CƠ|1672~2KIẾN THÀNH|1673~2NGHĨA THẮNG",
  "118": "1674~3YÊN LẠC|1675~2BÌNH ĐỊNH|1676~2ĐẠI TỰ|1677~2ĐỒNG CƯƠNG|1678~2ĐỒNG VĂN|1679~2HỒNG CHÂU|1680~2HỒNG PHƯƠNG|1681~2LIÊN CHÂU|1682~2NGUYỆT ĐỨC|1683~2TỀ LỖ|1684~2TRUNG HÀ|1685~2TRUNG KIÊN|1686~2TRUNG NGUYÊN|1687~2VĂN TIẾN|1688~2YÊN ĐỒNG|1689~2YÊN PHƯƠNG|1690~2TAM HỒNG",
  "119": "1691~3HỢP HÒA|1692~2HOÀNG HOA|1693~2ĐỒNG TĨNH|1694~2KIM LONG|1695~2HƯỚNG ĐẠO|1696~2ĐẠO TÚ|1697~2AN HÒA|1698~2THANH VÂN|1699~2DUY PHIÊN|1700~2HOÀNG ĐAN|1701~2HOÀNG LÂU|1702~2VÂN HỘI|1703~2HỢP THỊNH",
  "120": "1704~3HƯƠNG CANH|1705~3THANH LÃNG|1706~3GIA KHÁNH|1707~2BÁ HIẾN|1708~2ĐẠO ĐỨC|1709~2HƯƠNG SƠN|1710~2PHÚ XUÂN|1711~2QUẤT LƯU|1712~2SƠN LÔI|1713~2TAM HỢP|1714~2TÂN PHONG|1715~2THIỆN KẾ|1716~2TRUNG MỸ|1717~2ĐẠO ĐỨC",
  "121": "1718~3TAM SƠN|1719~2LÃNG CÔNG|1720~2QUANG YÊN|1721~2BẠCH LƯU|1722~2HẢI LỰU|1723~2ĐỒNG QUẾ|1724~2NHÂN ĐẠO|1725~2ĐÔN NHÂN|1726~2PHƯƠNG KHOAN|1727~2TÂN LẬP|1728~2NHẠO SƠN|1729~2NHƯ THỤY|1730~2YÊN THẠCH|1731~2ĐỒNG THỊNH|1732~2TỨ YÊN|1733~2ĐỨC BÁC|1734~2CAO PHONG",
  "122": "1735~1HÙNG VƯƠNG|1736~1TRƯNG TRẮC|1737~1TRƯNG NHỊ|1738~1PHÚC THẮNG|1739~1XUÂN HOÀ|1740~1ĐỒNG XUÂN|1741~2CAO MINH|1742~2NAM VIÊM|1743~2TIỀN CHÂU|1744~2NGỌC THANH",
  "123": "1745~1HỘI HỢP|1746~1ĐỒNG TÂM|1747~1KHAI QUANG|1748~1ĐỐNG ĐA|1749~1LIÊN BẢO|1750~1NGÔ QUYỀN|1751~1TÍCH SƠN|1752~1ĐỊNH TRUNG|1753~2THANH TRÙ|1754~2ĐỊNH TRUNG",
  "124": "1755~3TAM ĐẢO|1756~2HỢP CHÂU|1757~2ĐẠO TRÙ|1758~2YÊN DƯƠNG|1759~2BỒ LÝ|1760~2ĐẠI ĐÌNH|1761~2TAM QUAN|1762~2HỒ SƠN|1763~2MINH QUANG",
  "125": "1787~3VĨNH TƯỜNG|1764~2CAO ĐẠI|1765~2CHẤN HƯNG|1766~2VIỆT XUÂN|1767~2ĐẠI ĐỒNG|1768~2VĨNH NINH|1769~2KIM XÁ|1770~2LŨNG HÒA|1771~2LÝ NHÂN|1772~2NGHĨA HƯNG|1773~2NGŨ KIÊN|1774~2PHÚ ĐA|1775~2PHÚ THỊNH|1776~2TAM PHÚC|1777~2TÂN CƯƠNG|1778~2TÂN TIẾN|1779~2THƯỢNG TRƯNG|1780~2TUÂN CHÍNH|1781~2TỨ TRƯNG|1782~2VÂN XUÂN|1783~2VĨNH THỊNH|1784~2VŨ DI|1785~2YÊN BÌNH|1786~2YÊN LẬP|1788~3THỔ TANG|1789~2AN TƯỜNG|1790~2BÌNH DƯƠNG|1791~2BỒ SAO|1792~2VĨNH SƠN",
  "126": "1793~3LẬP THẠCH|1794~3HOA SƠN|1795~2QUANG SƠN|1796~2NGỌC MỸ|1797~2HỢP LÝ|1798~2BẮC BÌNH|1799~2THÁI HÒA|1800~2LIỄN SƠN|1801~2XUÂN HÒA|1802~2VÂN TRỤC|1803~2LIÊN HÒA|1804~2TỬ DU|1805~2BÀN GIẢN|1806~2XUÂN LÔI|1807~2ĐỒNG ÍCH|1808~2TIÊN LỮ|1809~2VĂN QUÁN|1810~2ĐÌNH CHU|1811~2TRIỆU ĐỀ|1812~2SƠN ĐÔNG",
  "127": "1813~2QUẢNG PHÚ|1814~2BÌNH ĐỊNH|1815~2LÂM THAO|1816~2PHÚ LƯƠNG|1817~3THỨA|1818~2AN THỊNH|1819~2TRUNG KÊNH|1820~2MỸ HƯƠNG|1821~2PHÚ HÒA|1822~2TRUNG CHÍNH|1823~2MINH TÂN|1824~2TRỪNG XÁ|1825~2LAI HẠ|1826~2TÂN LÃNG",
  "128": "1827~1NINH XÁ|1828~1TIỀN AN|1829~1SUỐI HOA|1830~1ĐẠI PHÚC|1831~1ĐÁP CẦU|1832~1KINH BẮC|1833~1VỆ AN|1834~1VŨ NINH|1835~1VÕ CƯỜNG|1836~1THỊ CẦU|1837~2KIM CHÂN|1838~1VÂN DƯƠNG|1839~2NAM SƠN|1840~1HẠP LĨNH|1841~2KHẮC NIỆM|1842~2PHONG KHÊ|1843~2KHÚC XUYÊN|1844~2VẠN AN|1845~2HÒA LONG",
  "129": "1848~3GIA BÌNH|1846~2THÁI BẢO|1847~2ĐẠI BÁI|1849~2QUỲNH PHÚ|1850~2ĐÔNG CỨU|1851~2LÃNG NGÂM|1852~2GIANG SƠN|1853~2SONG GIANG|1854~2XUÂN LAI|1855~2NHÂN THẮNG|1856~2BÌNH DƯƠNG|1857~2CAO ĐỨC|1858~2VẠN NINH|1859~2ĐẠI LAI",
  "130": "1860~3HỒ|1861~2SONG HỒ|1862~2GIA ĐÔNG|1863~2MÃO ĐIỀN|1864~2AN BÌNH|1865~2HOÀI THƯỢNG|1866~2ĐÌNH TỔ|1867~2ĐẠI ĐỒNG THÀNH|1868~2NINH XÁ|1869~2TRẠM LỘ|1870~2NGHĨA ĐẠO|1871~2NGUYỆT ĐỨC|1872~2NGŨ THÁI|1873~2TRÍ QUẢ|1874~2THANH KHƯƠNG|1875~2XUÂN LÂM|1876~2HÀ MÃN|1877~2SONG LIỄU|1878~0ĐÔNG CÔI",
  "131": "1879~2NGỌC XÁ|1880~2PHÙ LƯƠNG|1881~2ĐỨC LONG|1882~2CHÂU PHONG|1883~2PHÙ LÃNG|1884~2VIỆT HÙNG|1885~2QUẾ TÂN|1886~2CÁCH BI|1887~2ĐÀO VIÊN|1888~2CHI LĂNG|1889~2MỘ ĐẠO|1890~2YÊN GIẢ|1891~2BỒNG LAI|1892~2HÁN QUẢNG|1893~2PHƯƠNG LIỄU|1894~2PHƯỢNG MAO|1895~3PHỐ MỚI|1896~2BẰNG AN|1897~2NHÂN HÒA|1898~2VIỆT THỐNG|1899~2ĐẠI XUÂN|1900~2VÂN DƯƠNG",
  "132": "1901~2YÊN TRUNG|1902~2THỤY HÒA|1903~2DŨNG LIỆT|1904~2ĐÔNG TIẾN|1905~3CHỜ|1906~2VĂN MÔN|1907~2ĐÔNG THỌ|1908~2YÊN PHỤ|1909~2HÒA TIẾN|1910~2TAM GIANG|1911~2TRUNG NGHĨA|1912~2LONG CHÂU|1913~2ĐÔNG PHONG|1914~2TAM ĐA",
  "133": "1915~2TRI PHƯƠNG|1916~2TÂN CHI|1917~2LẠC VỆ|1918~2HIÊN VÂN|1919~2PHÚ LÂM|1920~3LIM|1921~2NỘI DUỆ|1922~2HOÀN SƠN|1923~2ĐẠI ĐỒNG|1924~2LIÊN BÃO|1925~2VIỆT ĐOÀN|1926~2PHẬT TÍCH|1927~2CẢNH HƯNG|1928~2MINH ĐẠO|1929~2HOÀN",
  "134": "1943~0THỊ XÃ TỪ SƠN|1930~1ĐÌNH BẢNG|1931~1CHÂU KHÊ|1932~1ĐỒNG NGUYÊN|1933~1TÂN HỒNG|1934~2HƯƠNG MẠC|1935~2PHÙ KHÊ|1936~2TAM SƠN|1937~2TƯƠNG GIANG|1938~1ĐÔNG NGÀN|1939~2PHÙ CHẨN|1940~1TRANG HẠ|1941~1ĐỒNG KỴ|1942~2NAM HỒNG",
  "135": "1944~1PHẠM NGŨ LÃO|1945~1NGUYỄN TRÃI|1946~1QUANG TRUNG|1947~1HẢI TÂN|1948~1TRẦN PHÚ|1949~1TRẦN HƯNG ĐẠO|1950~1LÊ THANH NGHỊ|1951~1NGỌC CHÂU|1952~1VIỆT HOÀ|1953~1THANH BÌNH|1954~1BÌNH HÀN|1955~1TỨ MINH|1956~1CẨM THƯỢNG|1957~0KCN ĐẠI AN|1958~1TÂN BÌNH|1959~2THƯỢNG ĐẠT|1960~2ÁI QUỐC|1961~2AN CHÂU|1962~2NAM ĐỒNG|1963~2TÂN HƯNG|1964~2THẠCH KHÔI|1965~1NHỊ CHÂU",
  "136": "1994~3NINH GIANG|1966~2ĐỒNG TÂM|1967~2ĐÔNG XUYÊN|1968~2HIỆP LỰC|1969~2HOÀNG HANH|1970~2HỒNG DỤ|1971~2HỒNG ĐỨC|1972~2HỒNG PHONG|1973~2HỒNG PHÚC|1974~2HỒNG THÁI|1975~2HƯNG LONG|1976~2HƯNG THÁI|1977~2KIẾN QUỐC|1978~2NGHĨA AN|1979~2NINH HẢI|1980~2NINH HÒA|1981~2NINH THÀNH|1982~2NINH THỌ|1983~2QUANG HƯNG|1984~2QUYẾT THẮNG|1985~2TÂN HƯƠNG|1986~2TÂN PHONG|1987~2ỨNG HÒE|1988~2VĂN GIANG|1989~2VĂN HỘI|1990~2VẠN PHÚC|1991~2VĨNH HÒA|1992~2AN ĐỨC|1993~2TÂN QUANG",
  "137": "2009~3TỨ KỲ|1995~2KỲ SƠN|1996~2MINH ĐỨC|1997~2NGỌC KỲ|1998~2NGỌC SƠN|1999~2NGUYÊN GIÁP|2000~2PHƯỢNG KỲ|2001~2QUANG KHẢI|2002~2QUẢNG NGHIỆP|2003~2QUANG PHỤC|2004~2QUANG TRUNG|2005~2QUÝ CAO|2006~2TÁI SƠN|2007~2TÂN KỲ|2008~2TÂY KỲ|2010~2TIÊN ĐỘNG|2011~2TỨ XUYÊN|2012~2VĂN TỐ|2013~2AN THANH|2014~2BÌNH LĂNG|2015~2CỘNG LẠC|2016~2ĐẠI HỢP|2017~2DÂN CHỦ|2018~2ĐÔNG KỲ|2019~2HÀ KỲ|2020~2HÀ THANH|2021~2HƯNG ĐẠO|2022~2ĐẠI ĐỒNG|16992~2HÀM CÁCH|17010~2TRI LỄ",
  "138": "2036~3THANH HÀ|2023~2HỒNG LẠC|2024~2LIÊN MẠC|2025~2PHƯỢNG HOÀNG|2026~2TÂN VIỆT|2027~2THANH BÍNH|2028~2THANH HẢI|2029~2THANH HỒNG|2030~2THANH KHÊ|2031~2THANH LANG|2032~2THANH SƠN|2033~2THANH THỦY|2034~2THANH XÁ|2035~2TRƯỜNG THÀNH|2037~2VIỆT HỒNG|2038~2VĨNH LẬP|2039~2AN LƯƠNG|2040~2CẨM CHẾ|2041~2TIỀN TIẾN|2042~2THANH AN|2043~2THANH CƯỜNG|2044~2THANH XUÂN|2045~2HỢP ĐỨC|2046~2TÂN AN|2047~2QUYẾT THẮNG",
  "139": "2070~3CẨM GIÀNG|2048~2CẨM AN|2049~2CẨM ĐÁN|2050~2CẨM ĐIỀN|2051~2CẨM ĐỊNH|2052~2CẨM ĐOÀI|2053~2CẨM ĐÔNG|2054~2CẨM HOÀNG|2055~2CẨM HƯNG|2056~2CẨM LINH|2057~2CẨM PHÚ|2058~2CẨM PHÚC|2059~2CẨM SƠN|2060~2CẨM VĂN|2061~2CẨM VŨ|2062~2CAO AN|2063~0ĐỨC CHÍNH|2064~2GIA LỘC|2065~2KIM GIANG|2066~2LƯƠNG ĐIỀN|2067~2NGỌC LIÊN|2068~2TÂN TRƯỜNG|2069~2THẠCH LỖI|2071~3LAI CÁCH|2072~0KCN PHÚC ĐIỀN",
  "140": "2093~3THANH MIỆN|2073~2CAO THẮNG|2074~2CHI LĂNG BẮC|2075~2CHI LĂNG NAM|2076~2DIÊN HỒNG|2077~2ĐOÀN KẾT|2078~2ĐOÀN TÙNG|2079~2DUYÊN HỒNG|2080~2HỒNG QUANG|2081~2HÙNG SƠN|2082~2LAM SƠN|2083~2LÊ BÌNH|2084~2LÊ HỒNG|2085~2NGÔ QUYỀN|2086~2NGŨ HÙNG|2087~2PHẠM KHA|2088~2TÂN TRÀO|2089~2THANH GIANG|2090~2TỨ CƯỜNG|2091~2THANH TÙNG|2092~2TIỀN PHONG|2094~3TỨ BÓNG",
  "141": "2099~3NAM SÁCH|2095~2QUỐC TUẤN|2096~2THÁI TÂN|2097~2THANH QUANG|2098~2THƯỢNG ĐẠT|2100~2AN CHÂU|2101~2ÁI QUỐC|2102~2AN BÌNH|2103~2AN ĐOÀI|2104~2AN LÂM|2105~2AN LIÊN|2106~2AN SƠN|2107~2CỘNG HÒA|2108~2ĐỒNG LẠC|2109~2HIỆP CÁT|2110~2HỒNG PHONG|2111~2HỢP TIẾN|2112~2MINH TÂN|2113~2NAM ĐỒNG|2114~2NAM HỒNG|2115~2NAM HƯNG|2116~2NAM TÂN|2117~2NAM TRUNG|2118~2PHÚ ĐIỀN|17011~2AN CHÍNH|18458~2NAM CHÍNH",
  "142": "2142~3KINH MÔN|2119~2AN LƯU|2120~2AN PHỤ|2121~2AN SINH|2122~2BẠCH ĐẰNG|2123~2DUY TÂN|2124~2HIẾN THÀNH|2125~2HIỆP AN|2126~2HIỆP HÒA|2127~2HIỆP SƠN|2128~2HOÀNG SƠN|2129~2LẠC LONG|2130~2LÊ NINH|2131~2MINH HÒA|2132~2MINH TÂN|2133~2PHẠM MỆNH|2134~3PHÚ THỨ|2135~2PHÚC THÀNH B|2136~2QUANG TRUNG|2137~2TÂN DÂN|2138~2THÁI SƠN|2139~2THÁI THỊNH|2140~2THĂNG LONG|2141~2THẤT HÙNG|2143~3MINH TÂN|2144~2THƯỢNG QUẬN|2145~2LONG XUYÊN",
  "143": "2147~2BẮC AN|2148~1CHÍ MINH|2149~2CỔ THÀNH|2150~1CỘNG HÒA|2151~2ĐỒNG LẠC|2152~2HOÀNG HOA THÁM|2153~1HOÀNG TÂN|2154~2HOÀNG TIẾN|2155~2HƯNG ĐẠO|2156~2KÊNH GIANG|2157~2LÊ LỢI|2158~2MẬT SƠN|2159~1PHẢ LẠI|2160~2TÂN DÂN|2161~1THÁI HỌC|2162~1SAO ĐỎ|2163~1BẾN TẮM|2164~1VĂN AN|2165~2VĂN ĐỨC|2166~2NHÂN HUỆ|2146~2AN LẠC",
  "144": "2167~2BÌNH MINH|2168~2BÌNH XUYÊN|2169~2CỔ BÌ|2170~2HỒNG KHÊ|2171~2HÙNG THẮNG|2172~2HƯNG THỊNH|2173~2LONG XUYÊN|2174~2NHÂN QUYỀN|2175~2QUÁN GỎI|2176~2TÂN HỒNG|2177~2TÂN VIỆT|2178~2THÁI DƯƠNG|2179~2THÁI HÒA|2180~2THÁI HỌC|2181~2THÚC KHÁNG|2182~2TRÁNG LIỆT|2183~3KẺ SẶT|2184~2VĨNH HỒNG|2185~2VĨNH TUY",
  "145": "2209~3GIA LỘC|2186~2AN TÂN|2187~2ĐOÀN THƯỢNG|2188~2ĐỒNG GIANG|2189~2ĐỒNG QUANG|2190~2ĐỨC LƯƠNG|2191~2ĐỨC XƯƠNG|2192~2GIA HÒA|2193~2GIA HƯNG|2194~2GIA KHÁNH|2195~2GIA LƯƠNG|2196~2GIA TÂN|2197~2GIA XUYÊN|2198~2HOÀNG DIỆU|2199~2HỘI XUYÊN|2200~2HỒNG HƯNG|2201~2LIÊN HỒNG|2202~2NHẬT TÂN|2203~2PHẠM TRẤN|2204~2PHƯƠNG HƯNG|2205~2QUANG MINH|2206~2TÂN HƯNG|2207~2TÂN TIẾN|2208~2THẠCH KHÔI|2210~3HỘI XUYÊN|2211~2HỒNG HƯNG|2212~2THỐNG KÊNH|2213~2THỐNG NHẤT|2214~2TOÀN THẮNG|2215~2TRÙNG KHÁNH|2216~2YẾT KIÊU|2217~2TRẠM BÓNG|2218~2CẦU GỖ|2219~2LÊ LỢI",
  "146": "2220~2CỔ DŨNG|2221~2CỘNG HÒA|2222~0ĐẠI ĐỨC|2223~0ĐỒNG GIA|2224~2KIM ANH|2225~2KIM ĐÍNH|2226~2KIM KHÊ|2227~2KIM LƯƠNG|2228~2KIM TÂN|2229~2KIM XUYÊN|2230~2KỲ CÔI|2231~2LAI VU|2232~2LIÊN HÒA|2233~2NGŨ PHÚC|2234~2PHÚC THÀNH A|2235~2TAM KỲ|2236~2THƯỢNG VŨ|2237~2TUẤN HƯNG|2238~2VIỆT HƯNG|2239~2BÌNH DÂN|2240~2CẨM LA|2241~3PHÚ THÁI|2242~2PHẠM XÁ",
  "147": "2243~3TRẦN CAO|2244~2MINH TÂN|2245~2PHAN SÀO NAM|2246~2QUANG HƯNG|2247~2MINH HOÀNG|2248~2ĐOÀN ĐÀO|2249~2TỐNG PHAN|2250~2ĐÌNH CAO|2251~2NHẬT QUANG|2252~2TIÊN TIẾN|2253~2TAM ĐA|2254~2MINH TIẾN|2255~2NGUYÊN HOÀ|2256~2TỐNG TRÂN",
  "148": "2257~3NHƯ QUỲNH|2258~2LẠC ĐẠO|2259~2CHỈ ĐẠO|2260~2ĐẠI ĐỒNG|2261~2VIỆT HƯNG|2262~2TÂN QUANG|2263~2ĐÌNH DÙ|2264~2MINH HẢI|2265~2LƯƠNG TÀI|2266~2TRƯNG TRẮC|2267~2LẠC HỒNG|2268~0KCN NHƯ QUỲNH",
  "149": "2293~3KHOÁI CHÂU|2269~2ĐÔNG TẢO|2270~2BÌNH MINH|2271~2DẠ TRẠCH|2272~2HÀM TỬ|2273~2ÔNG ĐÌNH|2274~2TÂN DÂN|2275~2TỨ DÂN|2276~2AN VĨ|2277~2ĐÔNG KẾT|2278~2BÌNH KIỀU|2279~2DÂN TIẾN|2280~2ĐỒNG TIẾN|2281~2HỒNG TIẾN|2282~2TÂN CHÂU|2283~2LIÊN KHÊ|2284~2PHÙNG HƯNG|2285~2VIỆT HÒA|2286~2ĐÔNG NINH|2287~2ĐẠI TẬP|2288~2CHÍ TÂN|2289~2ĐẠI HƯNG|2290~2THUẦN HƯNG|2291~2NHUẾ DƯƠNG|2292~2THÀNH CÔNG",
  "150": "2294~3ÂN THI|2295~2PHÙ ỦNG|2296~2 BÃI SẬY|2297~2 BẮC SƠN|2298~2ĐÀO DƯƠNG|2299~2TÂN PHÚC|2300~2VĂN NHUỆ|2301~2HOÀNG HOA THÁM|2302~2QUANG VINH|2303~2VÂN DU|2304~2XUÂN TRÚC|2305~2 QUẢNG LÃNG|2306~2 ĐẶNG LỄ|2307~2CẨM NINH|2308~2 NGUYỄN TRÃI|2309~2 ĐA LỘC|2310~2 TIỀN PHONG|2311~2 HỒ TÙNG MẬU|2312~2 HỒNG VÂN|2313~2HỒNG QUANG|2314~2 HẠ LỄ",
  "151": "2318~3VĂN GIANG|2315~2LIÊN NGHĨA|2316~2MỄ SỞ|2317~2THẮNG LỢI|2319~2XUÂN QUAN|2320~2PHỤNG CÔNG|2321~2CỬU CAO|2322~2LONG HƯNG|2323~2NGHĨA TRỤ|2324~2VĨNH KHÚC|2325~2TÂN TIẾN",
  "152": "2326~3BẦN YÊN NHÂN|2327~2PHAN ĐÌNH PHÙNG|2328~2NHÂN HÒA|2329~2DỊ SỬ|2330~2HƯNG LONG|2331~2PHÙNG CHÍ KIÊN|2332~2CẨM XÁ|2333~2DƯƠNG QUANG|2334~2BẠCH SAM|2335~2XUÂN DỤC|2336~2NGỌC LÂM|2337~2MINH ĐỨC|2338~2HÒA PHONG",
  "153": "2339~3LƯƠNG BẰNG|2340~2NGHĨA DÂN|2341~2TOÀN THẮNG|2342~2VĨNH XÁ|2343~2PHẠM NGŨ LÃO|2344~2NHÂN LA|2345~2VŨ XÁ|2346~2CHÍNH NGHĨA|2347~2SONG MAI|2348~2ĐỒNG THANH|2349~2THỌ VINH|2350~2PHÚ THỊNH|2351~2MAI ĐỘNG|2352~2ĐỨC HỢP|2353~2HÙNG AN|2354~2NGỌC THANH|2355~2HIỆP CƯỜNG|2356~2BẢO KHÊ|2357~2HÙNG CƯỜNG|2358~2PHÚ CƯỜNG",
  "154": "2359~3VƯƠNG|2360~2LỆ XÁ|2361~2HƯNG ĐẠO|2362~2NGÔ QUYỀN|2363~2NHẬT TÂN|2364~2DỊ CHẾ|2365~2TRUNG DŨNG|2366~2ĐỨC THẮNG|2367~2AN VIÊN|2368~2THỦ SỸ|2369~2THIỆN PHIẾN|2370~2PHƯƠNG CHIỂU|2371~2TÂN HƯNG|2372~2HỒNG NAM|2373~2HOÀNG HANH|2374~2HẢI TRIỀU|2375~2THỤY LÔI|2376~2CƯƠNG CHÍNH|2377~2MINH PHƯỢNG",
  "155": "2378~3YÊN MỸ|2379~2GIAI PHẠM|2380~2NGỌC LONG|2381~2 NGHĨA HIỆP|2382~2  LIÊU XÁ|2383~2TÂN LẬP|2384~2TRUNG HÒA|2385~2THANH LONG|2386~2TRUNG HƯNG|2387~2TÂN VIỆT|2388~2LÝ THƯỜNG KIỆT|2389~2TRAI TRANG|2390~2ĐỒNG THAN|2391~2MINH CHÂU|2392~2VIỆT CƯỜNG|2393~2YÊN PHÚ|2394~2YÊN HÒA|2395~2HOÀN LONG|2396~0KCN PHỐ NỐI A",
  "156": "2397~1LAM SƠN|2398~1LÊ LỢI|2399~1QUANG TRUNG|2400~1HIẾN NAM|2401~1MINH KHAI|2402~1HỒNG CHÂU|2403~1AN TẢO|2404~2BẢO KHÊ|2405~2TRUNG NGHĨA|2406~2LIÊN PHƯƠNG|2407~2HỒNG NAM|2408~2QUẢNG CHÂU|2409~2HÙNG CƯỜNG|2410~2PHÚ CƯỜNG",
  "157": "2411~3HÒA MẠC|2412~3ĐỒNG VĂN|2413~2DUY HẢI|2414~2BẠCH THƯỢNG|2415~2DUY MINH|2416~2HOÀNG ĐÔNG|2417~2TIÊN NỘI|2418~2TIÊN NGOẠI|2419~2TIÊN TÂN|2420~2TIÊN HIỆP|2421~2TIÊN HẢI|2422~2CHÂU SƠN|2423~2ĐỌI SƠN|2424~2YÊN NAM|2425~2TRÁC VĂN|2426~2CHUYÊN NGOẠI|2427~2MỘC NAM|2428~2MỘC BẮC|2429~2CHÂU GIANG|2430~2TIÊN PHONG|2431~2YÊN BẮC|2432~2ĐIỆP SƠN",
  "158": "2433~3QUẾ|2434~3BA SAO|2435~2NGUYỄN ÚY|2436~2LÊ HỒ|2437~2ĐẠI CƯƠNG|2438~2NHẬT TỰU|2439~2HOÀNG TÂY|2440~2NHẬT TÂN|2441~2VÂN XÁ|2442~2KIM BÌNH|2443~2ĐỒNG HÓA|2444~2TƯỢNG LĨNH|2445~2TÂN SƠN|2446~2KHẢ PHONG|2447~2THỤY LÔI|2448~2NGỌC SƠN|2449~2THI SƠN|2450~2THANH SƠN|2451~2LIÊN SƠN",
  "159": "2452~3VĨNH TRỤ|2453~2HỢP LÝ|2454~2CHÍNH LÝ|2455~2VĂN LÝ|2456~2CÔNG LÝ|2457~2NGUYÊN LÝ|2458~2ĐỒNG LÝ|2459~2ĐỨC LÝ|2460~2ĐẠO LÝ|2461~2NHÂN KHANG|2462~2BẮC LÝ|2463~2CHÂN LÝ|2464~2NHÂN CHÍNH|2465~2NHÂN NGHĨA|2466~2NHÂN BÌNH|2467~2XUÂN KHÊ|2468~2PHÚ PHÚC|2469~2TIẾN THẮNG|2470~2HÒA HẬU|2471~2NHÂN THỊNH|2472~2NHÂN ĐẠO|2473~2NHÂN HƯNG|2474~2NHÂN MỸ",
  "160": "2475~1LÊ HỒNG PHONG|2476~2CHÂU SƠN|2477~2PHÙ VÂN|2478~1LƯƠNG KHÁNH THIỆN|2479~1HAI BÀ TRƯNG|2480~1MINH KHAI|2481~2LIÊM CHUNG|2482~2LIÊM CHÍNH|2483~2LAM HẠ|2484~1QUANG TRUNG|2485~1TRẦN HƯNG ĐẠO|2486~2THANH CHÂU|2487~0CỤM CN CHÂU SƠN|13835~2KIM BÌNH|18473~2TIÊN TÂN|18475~2LIÊM TUYỀN|18478~2TRỊNH XÁ|18474~2LIÊM TIẾT|18471~0TIÊN HẢI|18477~0P. THANH TUYỀN|18470~2ĐINH XÁ|18472~2TIÊN HIỆP",
  "161": "2488~0THANH TUYỀN ( TT CẦU GỪNG)|2489~2THANH HẢI|2490~2THANH NGUYÊN|2491~2THANH TUYỀN|2492~2THANH NGHỊ|2493~2THANH TÂM|2494~2THANH HƯƠNG|2495~2LIÊM SƠN|2496~2LIÊM TÚC|2497~2THANH LƯU|2498~2THANH PHONG|2499~2THANH BÌNH|2500~2LIÊM THUẬN|2501~2THANH THUỶ|2502~3KIỆN KHÊ|2503~2THANH HÀ|2504~2LIÊM CẦN|2505~2LIÊM PHONG|2506~2LIÊM TUYỀN|2507~2LIÊM TIẾT|17008~2THANH TÂN",
  "162": "2508~3BÌNH MỸ|2509~2ĐINH XÁ|2510~2TRỊNH XÁ|2511~2TRÀNG AN|2512~2ĐỒN XÁ|2513~2ĐỒNG DU|2514~2MỸ THỌ|2515~2AN MỸ|2516~2LA SƠN|2517~2AN ĐỔ|2518~2TIÊU ĐỘNG|2519~2AN LÃO|2520~2TRUNG LƯƠNG|2521~2BỐI CẦU|2522~2HƯNG CÔNG|2523~2NGỌC LŨ|2524~2BỒ ĐỀ|2525~2AN NỘI|2526~2VŨ BẢN|2527~2AN NINH|2528~2BÌNH NGHĨA|18476~2TRỊNH XÁ",
  "163": "2529~2BÌNH MINH|2530~2ĐIỀN XÁ|2531~2ĐỒNG SƠN|2532~2HỒNG QUANG|2533~2NAM CƯỜNG|2534~2NAM DƯƠNG|2535~3NAM GIANG|2536~2NAM HẢI|2537~2NAM HOA|2538~2NAM HỒNG|2539~2NAM HÙNG|2540~2NAM LỢI|2541~2NAM MỸ|2542~2NAM THÁI|2543~2NAM THẮNG|2544~2NAM THANH|2545~2NAM TIẾN|2546~2NAM TOÀN|2547~2NAM TRÀNG|2548~2NGHĨA AN|2549~2TÂN THỊNH|18479~2NAM THANH",
  "164": "2550~3CỔ LỄ|2551~2LIÊM HẢI|2552~2PHƯƠNG ĐỊNH|2553~2TRỰC CHÍNH|2554~2TRỰC CƯỜNG|2555~2TRỰC ĐẠI|2556~2TRỰC ĐẠO|2557~2TRỰC HÙNG|2558~2TRỰC HƯNG|2559~2TRỰC KHANG|2560~2TRỰC MỸ|2561~2TRỰC NỘI|2562~2TRỰC PHÚ|2563~2TRỰC THÁI|2564~2TRỰC THẮNG|2565~2TRỰC THANH|2566~2TRỰC THUẬN|2567~2TRỰC TUẤN|2568~2TRUNG ĐÔNG|2569~2VIỆT HÙNG|2570~3CÁT THÀNH|2571~2TÂN GIANG|2572~2NAM THANH|2573~2NAM HỒNG",
  "165": "2584~3MỸ LỘC|2574~2MỸ HƯNG|2575~2MỸ HÀ|2576~2MỸ PHÚC|2577~2MỸ TÂN|2578~2MỸ THẮNG|2579~2MỸ THÀNH|2580~2MỸ THỊNH|2581~2MỸ THUẬN|2582~2MỸ TIẾN|2583~2MỸ TRUNG",
  "166": "2585~2BẠCH LONG|2586~2GIAO THANH|2587~2GIAO HÀ|2588~2GIAO XUÂN|2589~2GIAO YẾN|2590~2HOÀNH SƠN|2591~2QUYẾT THẮNG|2592~3QUẤT LÂM|2593~2VĨNH HÀO|2594~2GIAO TÂN|2595~2GIAO THIỆN|2596~2BÌNH HÒA|2597~2GIAO AN|2598~2GIAO CHÂU|2599~2GIAO HẢI|2600~2GIAO HƯNG|2601~2GIAO HƯƠNG|2602~2GIAO LẠC|2603~2GIAO LÂM|2604~2GIAO LONG|2605~2GIAO NHÂN|2606~2GIAO PHONG|2607~2GIAO THỊNH|2608~2GIAO TIẾN|2609~2HỒNG THUẬN|2610~3NGÔ ĐỒNG|18480~2TRỰC THẰNG|18483~2TRỰC ĐẠI|18481~2TRỰC THÁI|18482~2TRỰC PHÚ|18485~2TRỰC CƯỜNG|18484~2TRỰC HÙNG",
  "167": "2611~2HOÀNG NAM|2612~2NAM ĐIỀN|2613~2NGHĨA BÌNH|2614~2NGHĨA CHÂU|2615~2NGHĨA ĐỒNG|2616~2NGHĨA HẢI|2617~2NGHĨA HỒNG|2618~2NGHĨA HÙNG|2619~2NGHĨA LẠC|2620~2NGHĨA LÂM|2621~2NGHĨA LỢI|2622~2NGHĨA MINH|2623~2NGHĨA PHONG|2624~2NGHIÃ PHÚ|2625~2NGHĨA PHÚC|2626~2NGHĨA SƠN|2627~2NGHĨA TÂN|2628~2NGHĨA THÁI|2629~2NGHĨA THẮNG|2630~2NGHĨA THÀNH|2631~2NGHĨA THỊNH|2632~2NGHĨA TRUNG|2633~3LIỄU ĐỀ|2634~3QUỸ NHẤT|2635~3RẠNG ĐÔNG|2636~2NGHĨA HÒA",
  "168": "2637~1BÀ TRIỆU|2638~1CỬA BẮC|2639~1CỬA NAM|2640~1HẠ LONG|2641~2LỘC AN|2642~1LỘC HẠ|2643~2LỘC HÒA|2644~1LỘC VƯỢNG|2645~2MỸ XÁ|2646~2NAM PHONG|2647~2NAM VÂN|2648~1NĂNG TĨNH|2649~1NGUYỄN DU|2650~1PHAN ĐÌNH PHÙNG|2651~1QUANG TRUNG|2652~1TRẦN ĐĂNG NINH|2653~1TRẦN HƯNG ĐẠO|2654~1NGÔ QUYỀN|2655~1TRẦN QUANG KHẢI|2656~1TRẦN TẾ XƯƠNG|2657~1TRƯỜNG THI|2658~1VĂN MIẾU|2659~1VỊ HOÀNG|2660~1VỊ XUYÊN|2661~1THỐNG NHẤT|2662~1NGUYỄN TRÃI|2663~2AN XÁ|2664~1HÒA XÁ",
  "169": "2665~2HẢI BẮC|2666~2HẢI CHÂU|2667~2HẢI CƯỜNG|2668~2HẢI ĐƯỜNG|2669~2HẢI GIANG|2670~2HẢI HÀ|2671~2HẢI HÒA|2672~2HẢI LONG|2673~2HẢI PHÚC|2674~2HẢI QUANG|2675~2HẢI SƠN|2676~2HẢI TRIỀU|2677~2HẢI TRUNG|2678~2HẢI VÂN|2679~2HẢI TÂN|2680~2HẢI TÂY|2681~2HẢI THANH|2682~2HẢI TOÀN|2683~2HẢI XUÂN|2684~3CỒN|2685~3THỊNH LONG|2686~3YÊN ĐỊNH|2687~2HẢI AN|2688~2HẢI ANH|2689~2HẢI CHÍNH|2690~2HẢI ĐÔNG|2691~2HẢI HƯNG|2692~2HẢI LỘC|2693~2HẢI LÝ|2694~2HẢI MINH|2695~2HẢI NAM|2696~2HẢI NINH|2697~2HẢI PHONG|2698~2HẢI PHÚ|2699~2HẢI PHƯƠNG",
  "170": "2700~2LIÊN MINH|2701~2MINH TÂN|2702~2MINH THUẬN|2703~2QUANG TRUNG|2704~2TAM THANH|2705~2TÂN KHÁNH|2706~2TÂN THÀNH|2707~2THÀNH LỢI|2708~2TRUNG THÀNH|2709~3GÔI|2710~2AN HƯNG|2711~2CỘNG HÒA|2712~2ĐẠI AN|2713~2ĐẠI THẮNG|2714~2HIỀN KHÁNH|2715~2HỢP HƯNG|2716~2KIM THÁI|2717~2LIÊN BẢO|2718~2VĨNH HÀO",
  "171": "2719~3XUÂN TRƯỜNG|2720~2THỌ NGHIỆP|2721~2XUÂN BẮC|2722~2XUÂN CHÂU|2723~0XUÂN ĐÀI|2724~2XUÂN HÒA|2725~2XUÂN HỒNG|2726~2XUÂN HÙNG|2727~2XUÂN KIÊN|2728~2XUÂN NGỌC|2729~2XUÂN NINH|2730~2XUÂN PHONG|2731~2XUÂN PHÚ|2732~2XUÂN PHƯƠNG|2733~0XUÂN TÂN|2734~2XUÂN THÀNH|2735~0XUÂN THỦY|2736~0XUÂN TIẾN|2737~0XUÂN TRUNG|2738~0XUÂN VINH|2739~2XUÂN THƯỢNG|2740~2XUÂN THỦY",
  "172": "2741~2YÊN MINH|2742~2YÊN MỸ|2743~2YÊN NGHĨA|2744~2YÊN NHÂN|2745~2YÊN NINH|2746~2YÊN PHONG|2747~2YÊN PHÚ|2748~2YÊN PHÚC|2749~2YÊN PHƯƠNG|2750~2YÊN QUANG|2751~2YÊN TÂN|2752~2YÊN THẮNG|2753~2YÊN THÀNH|2754~2YÊN THỌ|2755~2YÊN TIẾN|2756~2YÊN TRỊ|2757~2YÊN TRUNG|2758~2YÊN XÁ|2759~3LÂM|2760~2YÊN BẰNG|2761~2YÊN BÌNH|2762~2YÊN CHÍNH|2763~2YÊN CƯỜNG|2764~2YÊN ĐỒNG|2765~2YÊN DƯƠNG|2766~2YÊN HỒNG|2767~2YÊN HƯNG|2768~2YÊN KHANG|2769~2YÊN KHÁNH|2770~2YÊN LỘC|2771~2YÊN LỢI|2772~2YÊN LƯƠNG",
  "173": "2773~2THÁI TÂN|2774~2THÁI THÀNH|2775~2THÁI THỊNH|2776~2THÁI THỌ|2777~2THÁI THUẦN|2778~2THÁI THƯỢNG|2779~2THÁI THỦY|2780~2THÁI XUYÊN|2781~3DIÊM ĐIỀN|2782~2THỤY AN|2783~2THỤY BÌNH|2784~2THỤY CHÍNH|2785~2THỤY DÂN|2786~2THỤY DŨNG|2787~2THỤY DƯƠNG|2788~2THỤY DUYÊN|2789~2THỤY HÀ|2790~2THỤY HẢI|2791~2THỤY VIỆT|2792~2THỤY XUÂN|2793~2HỒNG QUỲNH|2794~2MỸ LỘC|2795~2THÁI AN|2796~2THÁI ĐÔ|2797~2THÁI DƯƠNG|2798~2THÁI GIANG|2799~2THÁI HÀ|2800~2THÁI HỌC|2801~2THÁI HỒNG|2802~2THÁI HƯNG|2803~2THÁI NGUYÊN|2804~2THÁI PHÚC|2805~2THÁI SƠN|2806~2THỤY HỒNG|2807~2THỤY HƯNG|2808~2THỤY LIÊN|2809~2THỤY LƯƠNG|2810~2THỤY NINH|2811~2THỤY PHONG|2812~2THỤY PHÚC|2813~2THỤY QUỲNH|2814~2THỤY SƠN|2815~2THỤY TÂN|2816~2THỤY THANH|2817~2THỤY TRÌNH|2818~2THỤY TRƯỜNG|2819~2THỤY VĂN|2820~2THÁI HÒA",
  "174": "2844~2VŨ THƯ|2856~3VŨ THƯ|2821~2HỒNG LÝ|2822~2HỒNG PHONG|2823~2MINH KHAI|2824~2MINH LÃNG|2825~2MINH QUANG|2826~2MINH TIẾN|2827~2NGUYÊN XÁ|2828~2PHÚ LỘC|2829~2PHÚC THÀNH|2830~2SONG AN|2831~2SONG LÃNG|2832~2TAM QUANG|2833~2TÂN BÌNH|2834~2TÂN HÒA|2835~2TÂN LẬP|2836~2TÂN PHONG|2837~2TÂN QUANG|2838~2TRUNG AN|2839~2TỰ TÂN|2840~2VIỆT HÙNG|2841~2VIỆT THUẬN|2842~2VŨ ĐOÀI|2843~2VŨ HỘI|2845~2VŨ TIẾN|2846~2VŨ VÂN|2847~2AN BÌNH|2848~2BÁCH THUẬN|2849~2ĐỒNG THANH|2850~2DŨNG NGHĨA|2851~2DUY NHẤT|2852~2HIỆP HOÀ|2853~2HOÀ BÌNH|2854~2VŨ VINH|2855~2XUÂN HÒA",
  "175": "2857~2QUỲNH BẢO|2858~2QUỲNH CHÂU|2859~2QUỲNH GIAO|2860~2QUỲNH HẢI|2861~2QUỲNH HOA|2862~2QUỲNH HOÀNG|2863~2QUỲNH HỘI|2864~2QUỲNH HỒNG|2865~2QUỲNH HƯNG|2866~2QUỲNH TRANG|2867~2QUỲNH VINH|2868~2QUỲNH XÁ|2869~3QUỲNH CÔI|2870~2AN ẤP|2871~3AN BÀI|2872~2AN CẦU|2873~2QUỲNH KHÊ|2874~2QUỲNH LÂM|2875~2QUỲNH MINH|2876~2QUỲNH MỸ|2877~2QUỲNH NGỌC|2878~2QUỲNH NGUYÊN|2879~2QUỲNH SƠN|2880~2QUỲNH THỌ|2881~2AN HIỆP|2882~2AN ĐỒNG|2883~2AN DỤC|2884~2AN KHÊ|2885~2AN LỄ|2886~2AN MỸ|2887~2AN NINH|2888~2AN QUÝ|2889~2AN THÁI|2890~2AN THANH|2891~2AN TRÀNG|2892~2AN VINH|2893~2AN VŨ|2894~2ĐÔNG HẢI|2895~2ĐỒNG TIẾN",
  "176": "2918~3HƯNG HÀ|2896~2CHÍ HÒA|2897~2CỘNG HÒA|2898~2DÂN CHỦ|2899~2ĐOAN HÙNG|2900~2ĐỘC LẬP|2901~2ĐÔNG ĐÔ|2902~2DUYÊN HẢI|2903~2HỒNG AN|2904~2HỒNG LĨNH|2905~2HỒNG MINH|2906~2HÙNG DŨNG|2907~2KIM TRUNG|2908~2MINH HÒA|2909~2MINH KHAI|2910~2MINH TÂN|2911~2PHÚ SƠN|2912~2PHÚC KHÁNH|2913~2TÂN HÒA|2914~2THÁI HƯNG|2915~2THÁI PHƯƠNG|2916~2THỐNG NHẤT|2917~2TIẾN ĐỨC|2919~2VĂN LANG|2920~2BẮC SƠN|2921~2HÒA TIẾN|2922~2LIÊN HIỆP|2923~2TÂN LỄ|2924~2TÂN TIẾN|2925~2TÂY ĐÔ|2926~2VĂN CẨM|2927~2BÌNH LÃNG|2928~2CANH TÂN|2929~2ĐIỆP NÔNG|2930~2CHI LĂNG|2931~2HÒA BÌNH|2932~2BÙI XÁ|2933~2HỒNG MỸ|2934~3HƯNG NHÂN",
  "177": "2935~0TT QUỲNH CÔI|2936~2QUỲNH HỒNG|2937~2QUỲNH GIAO|2938~2QUỲNH XÁ|2939~2QUỲNH HOA|2940~2QUỲNH HOÀNG|2941~2QUỲNH LÂM|2942~2QUỲNH NGỌC|2943~2QUỲNH THỌ|2944~2QUỲNH HỘI|2945~2QUỲNH HẢI|2946~2QUỲNH NGUYÊN|2947~2QUỲNH MỸ|2948~2QUỲNH TRANG|2949~2QUỲNH SƠN|2950~2QUỲNH BẢO|2951~2QUỲNH KHÊ|2952~2QUỲNH HƯNG",
  "178": "2953~1BỒ XUYÊN|2954~1ĐỀ THÁM|2955~2ĐÔNG HÒA|2956~1HOÀNG DIỆU|2957~1TIỀN PHONG|2958~1LÊ HỒNG PHONG|2959~1KỲ BÁ|2960~1TRẦN LÃM|2961~2VŨ LẠC|2962~2VŨ CHÍNH|2963~2VŨ PHÚC|2964~1PHÚC KHÁNH|2965~1PHÚ XUÂN|2966~1QUANG TRUNG|2967~1TRẦN HƯNG ĐẠO|2968~0KCN NGUYỄN ĐỨC CẢNH|2969~0KCN PHONG PHÚ|2970~0KCN PHÚ KHÁNH|2971~2ĐÔNG THỌ|2972~2TÂN BÌNH|2973~2PHÚ XUÂN",
  "179": "3002~3ĐÔNG HƯNG|2974~2CHƯƠNG DƯƠNG|2975~2ĐÔ LƯƠNG|2976~2ĐÔNG CÁC|2977~2ĐÔNG ĐỘNG|2978~2ĐÔNG DƯƠNG|2979~2ĐÔNG GIANG|2980~2ĐÔNG HÀ|2981~2ĐÔNG HOÀNG|2982~2ĐÔNG HỢP|2983~2ĐÔNG HUY|2984~2ĐÔNG LA|2985~2ĐÔNG LĨNH|2986~2ĐÔNG MỸ|2987~2ĐÔNG PHONG|2988~2ĐÔNG QUAN|2989~2ĐÔNG SƠN|2990~2ĐÔNG TÂN|2991~2ĐÔNG THỌ|2992~2ĐÔNG VINH|2993~2ĐÔNG XUÂN|2994~2HỢP TIẾN|2995~2LIÊN GIANG|2996~2MINH CHÂU|2997~2NGUYÊN XÁ|2998~2PHONG CHÂU|2999~2PHÚ CHÂU|3000~2PHÚ LƯƠNG|3001~2TRỌNG QUANG|3003~2ĐÔNG CƯỜNG|3004~2BẠCH ĐẰNG|3005~2ĐÔNG KINH|3006~2ĐỒNG PHÚ|3007~2ĐÔNG PHƯƠNG|3008~2ĐÔNG XÁ|3009~2HOA LƯ|3010~2HOA NAM|3011~2HỒNG CHÂU|3012~2HỒNG GIANG|3013~2LÔ GIANG|3014~2MÊ LINH|3015~2MINH TÂN|3016~2THĂNG LONG|3017~2AN CHÂU|3018~3TIÊN HƯNG|3019~2HỒNG VIỆT|3020~2ĐÔNG Á|3021~2ĐÔNG LĨNH",
  "180": "3054~3TIỀN HẢI|3053~2TÂY TIẾN|3055~2VÂN TRƯỜNG|3056~2VŨ LĂNG|3057~0KCN TIỀN HẢI|3022~2AN NINH|3023~2BẮC HẢI|3024~2ĐÔNG CƠ|3025~2ĐÔNG HẢI|3026~2ĐÔNG HOÀNG|3027~2ĐÔNG LÂM|3028~2ĐÔNG LONG|3029~2ĐÔNG MINH|3030~2ĐÔNG PHONG|3031~2ĐÔNG QUÝ|3032~2ĐÔNG TRÀ|3033~2TÂY GIANG|3034~2TÂY LƯƠNG|3035~2TÂY NINH|3036~2TÂY PHONG|3037~2NAM CHÍNH|3038~2NAM CƯỜNG|3039~2NAM HƯNG|3040~2NAM PHÚ|3041~2NAM THẮNG|3042~2NAM THANH|3043~2NAM THỊNH|3044~2NAM TRUNG|3045~2PHƯƠNG CÔNG|3046~2NAM HÀ|3047~2NAM HẢI|3048~2NAM HỒNG|3049~2ĐÔNG TRUNG|3050~2ĐÔNG XUYÊN|3051~2TÂY AN|3052~2TÂY SƠN",
  "181": "3082~3KIẾN XƯƠNG|3058~2AN BỒI|3059~2BÌNH ĐỊNH|3060~2BÌNH MINH|3061~2BÌNH NGUYÊN|3062~2BÌNH THANH|3063~2ĐÌNH PHÙNG|3064~2HÒA BÌNH|3065~2HỒNG THÁI|3066~2HỒNG TIẾN|3067~2LÊ LỢI|3068~2MINH HƯNG|3069~2MINH TÂN|3070~2NAM BÌNH|3071~2NAM CAO|3072~2NỮ TRUNG|3073~2QUANG BÌNH|3074~2QUANG HƯNG|3075~2QUANG LỊCH|3076~2QUANG MINH|3077~2QUANG TRUNG|3078~2QUỐC TUẤN|3079~2QUYẾT TIẾN|3080~2TÁN THUẬT|3081~2THANH TÂN|3083~2THƯỢNG HIỀN|3084~2TRÀ GIANG|3085~3THANH NÊ|3086~2VŨ AN|3087~2VŨ BÌNH|3088~2VŨ CÔNG|3089~2VŨ ĐÔNG|3090~2VŨ HÒA|3091~2VŨ LẠC|3092~2VŨ LỄ|3093~2VŨ NINH|3094~2VŨ QUÝ|3095~2VŨ SƠN|3096~2VŨ TÂY|3097~2VŨ THẮNG|3098~2VŨ THÚY|3099~2VŨ TRUNG|3100~2AN BÌNH",
  "182": "3101~1BÍCH ĐÀO|3102~1ĐÔNG THÀNH|3103~1NAM BÌNH|3104~1NAM THÀNH|3105~1NINH KHÁNH|3106~1NINH NHẤT|3107~1NINH PHONG|3108~1NINH PHÚC|3109~1NINH SƠN|3110~1NINH TIẾN|3111~1PHÚC THÀNH|3112~1QUANG TRUNG|3113~1TÂN THÀNH|3114~1THANH BÌNH|3115~1VÂN GIANG",
  "183": "3116~2LƯU PHƯƠNG|3117~2NAM DÂN|3118~2NHƯ HÒA|3119~2QUANG THIỆN|3120~2TÂN THÀNH|3121~2TÂN THỊNH|3122~2THƯỢNG KIÊM|3123~3BÌNH MINH|3124~3PHÁT DIỆM|3125~2VĂN HẢI|3126~0XUÂN THIỆN|3127~2YÊN LỘC|3128~2YÊN MẬT|3129~2ĐỒNG HƯỚNG|3130~2ÂN HOÀ|3131~2CHẤT BÌNH|3132~2CHÍNH TÂM|3133~2CỒN THOI|3134~2ĐỊNH HOÁ|3135~2HỒI NINH|3136~2HÙNG TIẾN|3137~2KIM CHÍNH|3138~2KIM ĐỊNH|3139~2KIM ĐỘNG|3140~2KIM HẢI|3141~2KIM MỸ|3142~2KIM TÂN|3143~2KIM TRUNG|3144~2LAI THÀNH",
  "184": "3166~3NHO QUAN|3145~2CÚC PHƯƠNG|3146~2ĐỒNG PHONG|3147~2ĐỨC LONG|3148~2GIA SƠN|3149~2KỲ PHÚ|3150~2GIA LÂM|3151~2GIA TƯỜNG|3152~2LẠC VÂN|3153~2LẠC PHONG|3154~2GIA THUỶ|3155~2PHÚ LỘC|3156~2PHÚ LONG|3157~2PHÚ SƠN|3158~2QUẢNG LẠC|3159~2QUỲNH LƯU|3160~2SƠN HÀ|3161~2SƠN LAI|3162~2SƠN THÀNH|3163~2THẠCH BÌNH|3164~2THANH LẠC|3165~2THƯỢNG HÒA|3167~2VĂN PHONG|3168~2VĂN PHÚ|3169~2VĂN PHƯƠNG|3170~2XÍCH THỔ|3171~2YÊN QUANG|16995~3RỊA",
  "185": "3172~2GIA HOÀ|3173~2GIA HƯNG|3174~2GIA LẠC|3175~2GIA LẬP|3176~2GIA PHÚ|3177~2GIA PHƯƠNG|3178~2GIA THÀNH|3179~2GIA TRẤN|3180~2GIA VÂN|3181~2GIA VƯỢNG|3182~2GIA XUÂN|3183~3ME|3184~2GIA MINH|3185~2GIA PHONG|3186~2GIA SINH|3187~2GIA TÂN|3188~2GIA THẮNG|3189~2GIA THỊNH|3190~2GIA TIẾN|3191~2GIA TRUNG|3192~2LIÊN SƠN|3193~0KCN GIÁN KHẨU",
  "186": "3194~2KHÁNH DƯƠNG|3195~2KHÁNH THỊNH|3196~3YÊN THỊNH|3197~2YÊN HOÀ|3198~2YÊN HƯNG|3199~2YÊN LÂM|3200~2YÊN MẠC|3201~2YÊN MỸ|3202~2YÊN NHÂN|3203~2YÊN PHONG|3204~2YÊN PHÚ|3205~2YÊN TỪ|3206~2KHÁNH THƯỢNG|3207~2MAI SƠN|3208~2YÊN ĐÔNG|3209~2YÊN THÁI|3210~2YÊN THẮNG|3211~2YÊN THÀNH|3212~3NGÓ",
  "187": "3213~2KHÁNH AN|3214~2KHÁNH CƯ|3215~2KHÁNH HẢI|3216~2KHÁNH HOÀ|3217~2KHÁNH NHẠC|3218~2KHÁNH PHÚ|3219~2KHÁNH VÂN|3220~3YÊN NINH|3221~2KHÁNH CÔNG|3222~2KHÁNH CƯỜNG|3223~2KHÁNH HỘI|3224~2KHÁNH HỒNG|3225~2KHÁNH LỢI|3226~2KHÁNH MẬU|3227~2KHÁNH  NINH|3228~2KHÁNH THÀNH|3229~2KHÁNH THIỆN|3230~2KHÁNH THUỶ|3231~2KHÁNH TIÊN|3232~2KHÁNH TRUNG|3233~0KCN NINH PHÚC",
  "188": "3234~2NINH SƠN|3235~0LÀNG LA MAI|3236~2NINH GIANG|3237~2NINH HOÀ|3238~2NINH KHANG|3239~2NINH KHÁNH|3240~2NINH MỸ|3241~2NINH NHẤT|3242~2NINH THẮNG|3243~2NINH XUÂN|3244~2TRƯỜNG YÊN|3245~3THIÊN TÔN|3246~2NINH TIẾN|3247~2NINH HẢI|3248~2NINH VÂN|3249~2NINH AN",
  "189": "3250~1BẮC SƠN|3251~2ĐÔNG SƠN|3252~1NAM SƠN|3253~2QUANG SƠN|3254~1TÂN BÌNH|3255~1TÂY SƠN|3256~1TRUNG SƠN|3257~1YÊN BÌNH|3258~1YÊN SƠN",
  "190": "3259~3VINH QUANG|3260~2TÂN TIẾN|3261~2CHIẾN PHỐ|3262~2NẬM TY|3263~2NẬM KHOÀ|3264~2NAM SƠN|3265~2TỤ NHÂN|3266~2BẢN MÁY|3267~2NGÀM ĐĂNG VÀI|3268~2BẢN PHÙNG|3269~2THÀNG TÍN|3270~2PỐ LỒ|3271~2TÚNG SÁN|3272~2ĐẢN VÁN|3273~2SÁN XÀ HỒ|3274~2NÀNG  ĐÔN|3275~2PỜ LY NGÀI|3276~2BẢN LUỐC|3277~2BẢN NHÙNG|3278~2TẢ SỬ CHÓONG|3279~2NẬM DỊCH|3280~2BẢN PÉO|3281~2HỒ THẦU|3282~2THÔNG NGUYÊN|3283~2THÈN CHU PHÌN|3284~2TÚNG SÁN",
  "191": "3285~3QUẢNG BẠ|3286~3TAM SƠN|3287~2THANH VÂN|3288~2QUYẾT TIẾN|3289~2ĐÔNG HÀ|3290~2LÙNG TAM|3291~2CÁN TỶ|3292~2TÙNG VÀI|3293~2NGHĨA THUẬN|3294~2CAO MÃ PỜ|3295~2TẢ VÁN|3296~2THÁI AN|3297~2BÁT ĐẠI SƠN",
  "192": "3298~3VỊ XUYÊN|3299~2VIỆT LÂM|3300~2PHÚ LINH|3301~2PHONG QUANG|3302~2NGỌC LINH|3303~2MINH TÂN|3304~2KIM LINH|3305~2KIM THẠCH|3306~2THUẬN HÒA|3307~2VIỆT LÂM|3308~2THANH THUỶ|3309~2TRUNG THÀNH|3310~2ĐẠO ĐỨC|3311~0TT NÔNG TRƯỜNG VIỆT LÂM|3312~2TÙNG BÁ|3313~2BẠCH NGỌC|3314~2NGỌC MINH|3315~2THANH ĐỨC|3316~2XÍN CHẢI|3317~2PHƯƠNG TIẾN|3318~2LAO CHẢI|3319~2CAO BỒ|3320~2THƯỢNG SƠN|3321~2LINH HỒ|3322~2QUẢNG NGẦN",
  "193": "3323~3BẮC MÊ|3324~2LẠC NÔNG|3325~2YÊN PHÚ|3326~2GIÁP TRUNG|3327~2YÊN PHONG|3328~2YÊN ĐỊNH|3329~2PHÚ NAM|3330~2ĐƯỜNG HỒNG|3331~2MINH SƠN|3332~2YÊN CƯỜNG|3333~2ĐƯỜNG ÂM|3334~2MINH NGỌC|3335~2PHIÊNG LUÔNG|3336~2THƯƠNG TÂN|3337~2LŨNG TÁO",
  "194": "18460~2XÍN MẦN|3338~3XÍ MẦN|3339~2NÀ TRÌ|3340~3CỐC PÀI|3341~2NGÁN CHIÊN|3342~2BẢN RÍU|3343~2CỐC RẾ|3344~2TRUNG THỊNH|3345~2THU TÀ|3346~2QUẢNG NGUYÊN|3347~2TẢ NHÌU|3348~2NÀN XỈN|3349~2THÈN PHÀNG|3350~2PÀ VẦY SỦ|3351~2NÀN MA|3352~2BẢN NGÒ|3353~2CHẾ LÀ|3354~2NẤM DẦN|3355~2KHUÔN LÙNG|3356~2CHÍ CÀ",
  "195": "3357~3BẮC QUANG|3358~2VIỆT VINH|3359~2BẰNG HÀNH|3360~2ĐỒNG TIẾN|3361~2ĐỒNG TÂM|3362~2LIÊN HIỆP|3363~2KIM NGỌC|3364~2HÙNG AN|3365~2ĐỨC XUÂN|3366~2VÔ ĐIẾM|3367~2ĐỒNG YÊN|3368~2VIỆT HỒNG|3369~2QUANG MINH|3370~3VĨNH TUY|3371~2TÂN LẬP|3372~2TÂN QUANG|3373~0THƯỢNG BÌNH|3374~2HỮU SẢN|3375~2TIÊN KIỀU|3376~2VĨNH PHÚC|3377~2ĐÔNG THÀNH|3378~2VĨNH HẢO|3379~2TÂN THÀNH|3380~2NGHĨA TÂN|3381~3VIỆT QUANG|3382~2THƯỢNG BÌNH",
  "196": "3383~1MINH KHAI|3384~1TRẦN PHÚ|3385~1NGUYỄN TRÃI|3386~1NGỌC HÀ|3387~1QUANG TRUNG|3388~2NGỌC ĐƯỜNG|3389~2QUYẾT THẮNG|3390~0THÔN TÀ VẢI|3391~2PHƯƠNG THIỆN|3392~2PHƯƠNG ĐỘ",
  "197": "3393~3ĐỒNG VĂN|3394~2LŨNG CÚ|3395~2ĐỒNG VĂN|3396~2PHỐ LÀ|3397~2LŨNG THẦU|3398~2LŨNG PHÌN|3399~2MÁ LÉ|3400~2PHỐ CÁO|3401~3PHÓ BẢNG|3402~2LŨNG TÁO|3403~2THÀI PHÌN TỦNG|3404~2XÀ PHÌN|3405~2SỦNG LÀ|3406~2TẢ PHÌN|3407~2TẢ LỦNG|3408~2SINH LỦNG|3409~2SẢNG TÙNG|3410~2HỐ QUÁNG PHÌN|3411~2VẨN CHẢI|3412~2SỦNG TRÁI",
  "198": "3413~3YÊN MINH|3414~2NGỌC LONG|3415~2LŨNG HỒ|3416~2MẬU DUỆ|3417~2HỮU VINH|3418~2BẠCH ĐÍCH|3419~2ĐÔNG MINH|3420~2THẮNG MỖ|3421~2PHÚ LŨNG|3422~2SỦNG TRÁNG|3423~2NA KHÊ|3424~2SỦNG THÀI|3425~2LAO VÀ CHẢI|3426~2MẬU LONG|3427~2NGAM LA|3428~2ĐƯỜNG THƯỢNG|3429~2DU TIẾN|3430~2DU GIÀ",
  "199": "3431~3MÈO VẠC|3432~2LẢ LỦNG|3433~2GIÀNG CHU PHÌN|3434~2PẢI LỦNG|3435~2NẬM PAN|3436~2NIÊM SƠN|3437~2TÁT NGÀ|3438~2PẢ VÌ|3439~2SƠN VĨ|3440~2LŨNG PÙ|3441~2SỦNG TRÀ|3442~2XÍN CÁI|3443~2CÁN CHU PHÌN|3444~2LŨNG CHINH|3445~2KHÂU VAI|3446~2THƯỢNG PHÙNG|3447~2SỦNG MÁNG|3448~2NIÊM TÒNG",
  "200": "3449~3YÊN BÌNH|3450~2YÊN THÀNH|3451~2BẰNG LANG|3452~2TÂN NAM|3453~2HƯƠNG SƠN|3454~2TIÊN YÊN|3455~2XUÂN GIANG|3456~2VĨ THƯỢNG|3457~2YÊN HÀ|3458~2TÂN BẮC|3459~2TÂN TRỊNH|3460~2TIÊN NGUYÊN|3461~2BẢN RỊA|3462~2YÊN BÌNH|3463~2NÀ KHƯƠNG|3464~2XUÂN MINH",
  "201": "3465~2ĐỨC THÔNG|3466~2QUANG TRỌNG|3467~2THÁI CƯỜNG|3468~2VÂN TRÌNH|3469~2THỊ NGÂN|3470~2THỤY HÙNG|3471~2ĐỨC LONG|3472~2TRỌNG CON|3473~2DANH SỸ|3474~2LÊ LỢI|3475~2ĐỨC XUÂN|3476~3ĐÔNG KHÊ|3477~2LÊ LAI|3478~2CANH TÂN|3479~2KIM ĐỒNG|3480~2MINH KHAI",
  "202": "3481~2ĐỨC QUANG|3482~2KIM LOAN|3483~2AN LẠC|3484~2QUANG LONG|3485~2VĨNH QUÍ|3486~2VIỆT CHU|3487~2THÁI ĐỨC|3488~2CÔ NGÂN|3489~2THỊ HOA|3490~3THANH NHẬT|3491~2MINH LONG|3492~2THẮNG LỢI|3493~2LÝ QUỐC|3494~2ĐỒNG LOAN",
  "203": "3495~3NGUYÊN BÌNH|3496~3TĨNH TÚC|3497~2YÊN LẠC|3498~2CA THÀNH|3499~2TRIỆU NGUYÊN|3500~2VŨ NÔNG|3501~2THÁI HỌC|3502~2THỂ DỤC|3503~2BẮC HỢP|3504~2MINH TÂM|3505~2MINH THANH|3506~2LANG MÔN|3507~2MAI LONG|3508~2PHAN THANH|3509~2QUANG THÀNH|3510~2TAM KIM|3511~2HOA THÁM|3512~2THÀNH CÔNG|3513~2HƯNG ĐẠO|3514~2THỊNH VƯỢNG",
  "204": "3515~3BẢO LẠC|3516~2CỐC PÀNG|3517~2THƯỢNG HÀ|3518~2CÔ BA|3519~2KHÁNH XUÂN|3520~2XUÂN TRƯỜNG|3521~2BẢO TOÀN|3522~2HỒNG TRỊ|3523~2PHAN THANH|3524~2HỒNG AN|3525~2HƯNG ĐẠO|3526~2HUY GIÁP|3527~2SƠN LỘ|3528~2ĐÌNH PHÙNG|3529~2HƯNG THỊNH|3530~2KIM CÚC|3531~2SƠN LẬP",
  "205": "3532~3TÀ LÙNG|3533~2HỒNG ĐẠI|3534~2TRIỆU ẨU|3535~2LƯƠNG THIỆN|3536~2ĐẠI SƠN|3537~2TIÊN THÀNH|3538~3HOÀ THUẬN|3539~2MỸ HƯNG|3540~2CÁCH LINH",
  "206": "3541~3TRÙNG KHÁNH|3542~2LĂNG YÊN|3543~2NGỌC CHUNG|3544~2PHONG NẬM|3545~2NGỌC KHÊ|3546~2 ĐÌNH PHONG|3547~2CHÍ VIỄN|3548~2ĐÀM THUỶ|3549~2LĂNG HIẾU|3550~2KHÂM THÀNH|3551~2 ĐÌNH MINH|3552~2PHONG CHÂU|3553~2CẢNH TIÊN|3554~2TRUNG PHÚC|3555~2 ĐỨC HỒNG|3556~2CAO THĂNG|3557~2THÔNG HUỀ|3558~2ĐOÀI CÔN|3559~2THÂN GIÁP|3560~2NGỌC CÔN",
  "207": "3568~3THÔNG NÔNG|3561~2VỊ QUANG|3562~2LƯƠNG THÔNG|3563~2NGỌC ĐỘNG|3564~2LƯƠNG CAN|3565~2THANH LONG|3566~2BÌNH LÃNG|3567~2CẦN NÔNG|3569~2ĐA THÔNG|3570~2CẦN YÊN|3571~2YÊN SƠN",
  "208": "3572~2QUẢNG LÂM|3573~2THẠCH LÂM|3574~2THÁI HỌC|3575~2THÁI SƠN|3576~2YÊN THỔ|3577~3PÁC MIEU|3578~2MÔNG ÂN|3579~2ĐỨC HẠNH|3580~2LÝ BÔN|3581~2VĨNH QUANG|3582~2VĨNH PHONG|3583~2NAM QUANG|3584~2NAM CAO|3585~2TÂN VIỆT",
  "209": "3586~1SÔNG HIẾN|3587~1SÔNG BẰNG|3588~1HỢP GIANG|3589~1TÂN GIANG|3590~2NGỌC XUÂN|3591~2DUYỆT TRUNG|3592~2HOÀ CHUNG|3593~2 ĐỀ THÁM|3594~2VĨNH QUANG|3595~2HƯNG ĐẠO|3596~2CHU CHINH",
  "210": "3597~3XUÂN HOÀ|3598~2TRƯỜNG HÀ|3599~2KÉO YÊN|3600~2LŨNG NẶM|3601~2VÂN AN|3602~2CẢI VIÊN|3603~2NÀ SÁC|3604~2NỘI THÔN|3605~2SÓC HÀ|3606~2THƯỢNG THÔN|3607~2TỔNG CỌT|3608~2QUÍ QUÂN|3609~2HỒNG SỸ|3610~2SĨ HAI|3611~2ĐÀO NGẠN|3612~2PHÙ NGỌC|3613~2MÃ BA|3614~2HẠ THÔN|3615~2VẦN DÍNH",
  "211": "3616~3HÙNG QUỐC|3617~2CÔ  MƯỜI|3618~2TRI PHƯƠNG|3619~2QUANG HÁN|3620~2QUANG VINH|3621~2QUANG TRUNG|3622~2LƯU NGỌC|3623~2XUÂN NỘI|3624~2CAO CHƯƠNG|3625~2QUỐC TOẢN",
  "212": "3626~3NƯỚC HAI|3627~2DÂN CHỦ|3628~2NAM TUẤN|3629~2ĐẠI TIẾN|3630~2 ĐỨC  XUÂN|3631~2 ĐỨC LONG|3632~2TRƯƠNG LƯƠNG|3633~2BÌNH LONG|3634~2BẾ TRIỀU|3635~2NGŨ LÃO|3636~2CÔNG TRỪNG|3637~2HỒNG VIỆT|3638~2VĨNH QUANG|3639~2NGUYỄN HUỆ|3640~2HOÀNG TUNG|3641~2HƯNG ĐẠO|3642~2QUANG TRUNG|3643~2TRƯNG VƯƠNG|3644~2BÌNH DƯƠNG|3645~2BẠCH ĐẰNG|3646~2LÊ CHUNG|3647~2CHU CHINH|3648~2HÀ TRÌ|3649~2HỒNG NAM",
  "213": "3655~3QUẢNG UYÊN|3650~2NGỌC ĐỘNG|3651~2HỒNG ĐỊNH|3652~2HỒNG QUANG|3653~2HOÀNG HẢI|3654~2HẠNH PHÚC|3656~2PHI HẢI|3657~2QUẢNG HƯNG|3658~2BÌNH LĂNG|3659~2ĐỘC LẬP|3660~2QUỐC PHONG|3661~2QUỐC DÂN|3662~2ĐOÀI KHÔN|3663~2PHÚC SEN|3664~2CHÍ THẢO|3665~2CAI BỘ|3666~2TỰ DO",
  "214": "3668~1LÀO CAI|3667~1CỐC LẾU|3669~1PHỐ MỚI|3670~1DUYÊN HẢI|3671~0KHU CÔNG NGHIỆP BẮC DUYÊN HẢI|3672~0KHU THƯƠNG MẠI KIM THÀNH|3673~1KIM TÂN|3674~1BẮC CƯỜNG|3675~1NAM CƯỜNG|3676~1POM HÁN|3677~1BÌNH MINH|3678~1BẮC LỆNH|3679~1THỐNG NHẤT|3680~1XUÂN TĂNG|3681~1KIM THÀNH|3682~2ĐỒNG TUYỂN|3683~2VẠN HÒA|3684~2CAM ĐƯỜNG|3685~2HỢP THÀNH|3686~2TẢ PHỜI",
  "215": "3689~3SA PA|3687~2SAN SẢ HỒ|3688~2TRUNG TRẢI|3690~2BẢN HỒ|3691~2LAO CHẢI|3692~2THANH PHÚ|3693~2TẢ VAN|3694~2SA PẢ|3695~2SUỐI THẦU|3696~2THANH KIM|3697~2TÒNG SÀNH|3698~2BẢN KHOANG|3699~2TẢ PHÌN|3700~2TẢ GIÀNG PHÌNH|3701~2SỬ PÁN|3702~2NẬM SÀI|3703~2NẬM CANG|3704~2HẦU THÀO|3705~2BẢN PHÙNG",
  "216": "3706~3MƯỜNG KHƯƠNG|3707~2TUNG CHUNG PHỐ|3708~2MƯỜNG KHƯƠNG|3709~2NA LỐC|3710~2BẢN LẦU|3711~2BẢN SEN|3712~2LÙNG VAI|3713~2THANH BÌNH|3714~2NẬM CHẨY|3715~2TUNG CHUNG PHỐ|3716~2TẢ NGẢI CHỒ|3717~2PHA LONG|3718~2LA VĂN TẨN|3719~2DÌN CHIN|3720~2TẢ THÀNG|3721~2TẢ GIA KHÂU|3722~2LÙNG KHẤU NHIN|3723~2LA PÁN THẨN|3724~2NẤM LƯ|3725~2CAO SƠN",
  "217": "3726~3BÁT SÁT|3727~2CỐC MỲ|3728~2MƯỜNG VI|3729~2BẢN XÈO|3730~2SÀNG MA SÁO|3731~2MƯỜNG HUM|3732~2DỀN SÁNG|3733~2Y TÝ|3734~2A LÙ|3735~2A MÚ SUNG|3736~2NẬM CHẠC|3737~2NGẢI THẦU|3738~2QUANG KIM|3739~2CỐC SAN|3740~2PHÌN NGAN|3741~2BẢN QUA|3742~2BẢN VƯỢC|3743~2TRỊNH TƯỜNG|3744~2NẬM PUNG|3745~2LA PÁN THẨN|3746~2DỀN THÀNG|3747~2PA CHEO|3748~2TÒNG SÀNH|3749~2TRUNG LÈNG HỒ",
  "218": "3750~2CỐC LY- BẮC HÀ|3751~2TẢ PHỜI|3752~2BẮC NGẦM|3753~2BẢN VƯỢC|3754~2BẢN PHIỆT|3755~2SAN XẢ HỒ|3756~2LIÊM PHÚ|3757~3KHÁNH YÊN|3758~2KHÁNH YÊN THƯỢNG|3759~2MINH LƯƠNG|3760~2VÕ LAO|3761~2SƠN THỦY|3762~2DƯƠNG QUỲ|3763~2LÀNG GIÀNG|3764~2KHÁNH YÊN HẠ|3765~2KHÁNH YÊN TRUNG|3766~2TÂN THƯỢNG|3767~2TÂN AN|3768~2VĂN SƠN|3769~2THẨM DƯƠNG|3770~2NẬM XÉ|3771~2NẬM XÂY|3772~2NẬM THA|3773~2NẬM RẠNG|3774~2NẬM MẢ|3775~2NẬM CHÁY|3776~2HOÀ MẠC|3777~2DẦN THÀNG|3778~2CHIỀNG KEN",
  "219": "3779~3BẮC HÀ|3780~2NA HỐI|3781~2TÀ CHẢI|3782~2LÙNG PHÌN|3783~2TẢ CỦ TỶ|3784~2NẬM MÒN|3785~2BẢN LIỀN|3786~2NẬM ĐÉT|3787~2CỐC LY 1|3788~2TẢ VAN CHƯ|3789~2HOÀNG THU PHỐ|3790~2LÙNG CẢI|3791~2BẢO NHAI|3792~2THẢI GIÀNG PHỐ|3793~2BẢN PHỐ|3794~2NẬM LÚC|3795~2CỐC LẦU|3796~2LẦU THÍ NGÀI|3797~2NA QUANG|3798~2NẬM KHÁNH|3799~2BẢN CÁI|3800~2CỐC LY|3801~2BẢN GIÀ",
  "220": "3802~3SIMACAI|3803~2SIMACAI|3805~2SÍN CHÉNG|3806~2BẢN MẾ|3807~2CÁN CẤU|3808~2SÁN CHẢI|3810~2NÀ SÁN|3811~2NÀN SÍN|25100~2LÙNG THẨN|3814~2NÀN SÁN|25099~2QUAN HỒ THẨN|3816~2THÀO CHƯ PHÌN",
  "221": "3817~2BẢO HÀ|3818~2LONG KHÁNH|3819~2LƯƠNG SƠN|3820~2TÂN DƯƠNG|3821~2TÂN TIẾN|3822~2MINH TÂN|3823~2ĐIỆN QUAN|3824~2LONG PHÚC|3825~2THƯỢNG HÀ|3826~2KIM SƠN|3827~2NGHĨA ĐÔ|3828~3PHỐ RÀNG|3829~2VIỆT TIẾN|3830~2CAM CON|3831~2VĨNH YÊN|3832~2XUÂN HOÀ|3833~2XUÂN THƯỢNG|3834~2YÊN SƠN",
  "222": "3837~3BẢO THẮNG|3845~2GIA PHÚ|3846~2BẢN PHIỆT|3847~2SƠN HẢI|3848~2BẮC NGẦM|3849~2PHỐ LU|3850~3PHỐ LU|3851~2TRÌ QUANG|3852~2BẢN PHIỆT|3835~2XUÂN GIAO|3836~2XUÂN QUANG|3838~3TẰNG LỎNG|3839~2BẢN CẦM|3840~2PHONG NIÊN|3841~2PHÚ NHUẬN|3842~2SƠN HÀ|3843~2THÁI NIÊN|3844~3PHONG HẢI",
  "223": "3853~3CHỢ MỚI|3854~2YÊN ĐĨNH|3855~2BÌNH VĂN|3856~2HÒA MỤC|3857~2MAI LẠP|3858~2NHƯ CỐ|3859~2NÔNG THỊNH|3860~2QUẢNG CHU|3861~2TÂN SƠN|3862~2THANH BÌNH|3863~2THANH MAI|3864~2THANH VẬN|3865~2YÊN CƯ|3866~2YÊN HÂN|3867~2NÔNG HẠ|3868~2CAO KỲ",
  "224": "3869~3BẰNG LŨNG|3870~2NGỌC PHÁI|3871~2LỦNG VÁNG|3872~3BẰNG LÃNG|3873~2BÌNH TRUNG|3874~2ĐẠI XẢO|3875~2ĐỒNG LẠC|3876~2LƯƠNG BẰNG|3877~2NAM CƯỜNG|3878~2NGHĨA TÁ|3879~2PHONG HUÂN|3880~2QUẢNG BẠCH|3881~2RÃ BẢN|3882~2TÂN LẬP|3883~2XUÂN LẠC|3884~2YÊN NHUẬN|3885~2YÊN THỊNH|3886~2YÊN THƯỢNG|3887~2YÊN MỸ|3888~2BẢN THI|3889~2ĐÔNG VIÊN|3890~2BẰNG PHÚC|3891~2PHƯƠNG VIÊN|3892~2NGỌC PHÁI|3893~2BẰNG LÃNG",
  "225": "3894~2CỐC ĐÁN|3895~3NÀ PHẶC|3896~2HƯƠNG NÊ|3897~2THƯỢNG QUAN|3898~2TRUNG HÒA|3899~2ĐỨC VÂN|3900~2THUẦN MANG|3901~2THƯỢNG ÂN|3902~2VÂN TÙNG|3903~2BẰNG VÂN|3904~2LÃNG NGÂM|3905~2HƯƠNG NÊ",
  "226": "3906~1NGUYỄN THỊ MINH KHAI|3907~1SÔNG CẦU|3908~1ĐỨC XUÂN|3909~1PHÙNG CHÍ KIÊN|3910~2DƯƠNG QUANG|3911~2NÔNG THƯỢNG|3912~2XUẤT HÓA|3913~2HUYỀN TỤNG",
  "227": "3914~0TT YẾN LẠC|3915~2ÂN TÌNH|3916~2CƯ LẾ|3917~2CƯỜNG LỢI|3918~2LƯƠNG THƯỢNG|3919~2QUANG PHONG|3920~2HỮU THÁC|3921~2KIM HỶ|3922~2VĂN MINH|3923~2VŨ LOAN|3924~2VĂN HỌC|3925~2XUÂN DƯƠNG|3926~2DƯƠNG SƠN|3927~2KIM LƯ|3928~2LAM SƠN|3929~2LIÊM THỦY|3930~2LƯƠNG HẠ|3931~2LƯƠNG THÀNH|3932~2CÔN MINH|3933~2HẢO NGHĨA|3934~2ĐỔNG XÁ|3935~2LẠNG SAN",
  "228": "3936~2QUANG THUẬN|3937~2ĐÔN PHONG|3938~2DƯƠNG PHONG|3939~2MỸ THANH|3940~2CAO SƠN|3941~2VI HƯƠNG|3942~2HÀ VỊ|3943~2LỤC BÌNH|3944~2TÚ TRĨ|3945~2CẨM GIÀNG|3946~2TÂN TIẾN|3947~2QUÂN BÌNH|3948~3PHỦ THÔNG|3949~2SỸ BÌNH|3950~2VŨ MUỘN|3951~2NGUYÊN PHÚC|3952~2PHƯƠNG LINH",
  "229": "3953~3BA BỂ (CHỢ RÃ)|3954~2BÀNH TRẠCH|3955~2CAO THƯỢNG|3956~2CAO TRĨ|3957~2CHU HƯƠNG|3958~2ĐỒNG PHÚC|3959~2HÀ HIẾU|3960~2HOÀNG TRĨ|3961~2MỸ PHƯƠNG|3962~2NAM MẪU|3963~2PHÚC LỘC|3964~2QUẢNG THUẬN|3965~2YẾN DƯƠNG|3966~2CHU HƠNG|3967~2ĐỊA LINH|3968~2DƯƠNG PHONG|3969~2KHANG NINH|3970~2THƯỢNG GIÁO|3971~2QUẢNG KHÊ|3972~2NGỌC PHÁI",
  "230": "3983~0TT HUYỆN PẮC NẶM|3973~2AN THẮNG|3974~2BẰNG THÀNH|3975~2XUÂN LA|3976~2NGHIÊN LOAN|3977~2CAO TÂN|3978~2CỔ LINH|3979~2CÔNG BẰNG|3980~2GIÁO HIỆU|3981~2NHẠN MÔN|3982~2BỘC BỐ",
  "231": "4004~3VĂN QUAN|3984~2CHI LỄ|3985~2CHU TÚC|3986~0ĐỒNG GIÁP|3987~2HỮU LỄ|3988~2KHÁNH KHÊ|3989~2LƯƠNG NĂNG|3990~2TÂN ĐOÀN|3991~2TRẤN NINH|3992~2TRÀNG CÁC|3993~2VIỆT YÊN|3994~2VĨNH LẠI|3995~2XUÂN MAI|3996~0YÊN PHÚC|3997~2BÌNH PHÚC|3998~0ĐẠI AN|3999~2HÒA BÌNH|4000~2PHÚ MỸ|4001~2SONG GIANG|4002~2TRÀNG PHÁI|4003~2TRÀNG SƠN|4005~2TÚ XUYÊN|4006~2VĂN AN|4007~2VÂN MỘNG",
  "232": "4033~3HỮU LŨNG|4008~2CAI KINH|4009~2ĐÔ LƯƠNG|4010~2ĐỒNG TIẾN|4011~2HỒ SƠN|4012~2HÒA BÌNH|4013~2HÒA LẠC|4014~2HÒA SƠN|4015~2HÒA THẮNG|4016~2HỮU LIÊN|4017~2MINH HÒA|4018~2QUYẾT THẮNG|4019~2SƠN HÀ|4020~2TÂN LẬP|4021~2TÂN THÀNH|4022~2THANH SƠN|4023~2THIÊN KY|4024~2VĂN NHAM|4025~2YÊN BÌNH|4026~2YÊN SƠN|4027~2YÊN THỊNH|4028~2YÊN VƯỢNG|4029~2ĐỒNG TÂN|4030~2MINH SƠN|4031~2MINH TIẾN|4032~2NHẬT TIẾN",
  "233": "4053~3CHI LĂNG|4034~2HÒA BÌNH1|4035~2HÒA BÌNH2|4036~2BẰNG HỮU|4037~2HỮU KIÊN|4038~2LÂM SƠN|4039~2LIÊN SƠN|4040~2NHÂN LÝ|4041~2QUAN SƠN|4042~2THƯỢNG CƯỜNG|4043~2VÂN AN|4044~2VẠN LINH|4045~2VÂN THỦY|4046~2Y TỊCH|4047~2BẮC THỦY|4048~2BẰNG MẠC|4049~2CHIẾN THẮNG|4050~2GIA LỘC|4051~2MAI SAO|4052~2QUANG LANG|4054~3ĐỒNG MỎ|4055~2HÒA BÌNH|4056~2CHI LĂNG",
  "234": "4075~3BẮC SƠN|4057~2BẮC SƠN|4058~2CHIẾN THẮNG|4059~2NHẤT HÒA|4060~2NHẤT TIẾN|4061~2QUỲNH SƠN|4062~2TÂN LẬP|4063~2TÂN THÀNH|4064~2TÂN TRI|4065~2TRẤN YÊN|4066~2VẠN THỦY|4067~2VŨ LĂNG|4068~2VŨ LỄ|4069~2VŨ SƠN|4070~2CHIÊU VŨ|4071~2ĐỒNG Ý|4072~2HƯNG VŨ|4073~2HỮU VĨNH|4074~2LONG ĐỒNG|4076~2TÂN HƯƠNG",
  "235": "4077~2HOÀNG VIỆT|4078~3NA SẦM|4079~2AN HÙNG|4080~2GIA MIỄN|4081~2BẮC LA|4082~2HOÀNG VĂN THỤ|4083~2HỒNG THÁI|4084~2HỘI HOAN|4085~2NAM LA|4086~2NHẠC KỲ|4087~2THANH LONG|4088~2THÀNH HÒA|4089~2THỤY HÙNG|4090~2TRÙNG KHÁNH|4091~2TRÙNG QUÁN|4092~2TÂN MỸ|4093~2TÂN TÁC|4094~2TÂN VIỆT|4095~2TÂN LANG|4096~2TÂN THANH",
  "236": "4124~3LỘC BÌNH|4097~2ÁI QUỐC|4098~2BẰNG KHÁNH|4099~2ĐỒNG ĐỤC|4100~2ĐÔNG QUAN|4101~2HIỆP BẠ|4102~2HỮU KHÁNH|4103~2HỮU LUÂN|4104~2KHUẤT XÁ|4105~2LỢI BÁC|4106~2LỤC THÔN|4107~2MẪU SƠN|4108~2MINH PHÁT|4109~2NAM QUAN|4110~2NHƯ KHÊ|4111~2NHƯỢNG BẠN|4112~2QUAN BẢN|4113~2SÀN VIÊN|4114~2TAM GIA|4115~2TĨNH BẮC|4116~2TÚ ĐOẠN|4117~2TÚ MỊCH|4118~2VÂN MỘNG|4119~2XUÂN DƯƠNG|4120~2XUÂN LỄ|4121~2XUÂN MÃN|4122~2XUÂN TÌNH|4123~2YÊN KHOÁI|4125~3NA DƯƠNG",
  "237": "4146~3CAO LỘC|4126~2BẢO LÂM|4127~2BÌNH TRUNG|4128~2CAO LÂU|4129~2CÔNG SƠN|4130~2GIA CÁT|4131~2HẢI YẾN|4132~2HOÀ CƯ|4133~2LỘC YÊN|4134~2MẪU SƠN|4135~2PHÚ XÁ|4136~2TÂN LIÊN|4137~2TÂN THÀNH|4138~2THẠCH ĐẠN|4139~2THANH LÒA|4140~2THỤY HÙNG|4141~2XUÂN LONG|4142~2XUẤT LỄ|4143~2HỒNG PHONG|4144~2HỢP THÀNH|4145~2SONG GIÁP|4147~3ĐỒNG ĐĂNG|4148~2YÊN TRẠCH",
  "238": "4159~3ĐÌNH LẬP|4149~2BẮC LÃNG|4150~2BẮC XA|4151~2BÍNH XÁ|4152~2CHÂU SƠN|4153~2CƯỜNG LỢI|4154~2ĐỒNG THẮNG|4155~2KIÊN MỘC|4156~2LÂM CA|4157~2THÁI BÌNH|4158~3CHÈ NÔNG TRƯỜNG THÁI BÌNH|4160~2ĐÌNH LẬP",
  "239": "4179~3BÌNH GIA|4161~2BÌNH LA|4162~2HÒA BÌNH|4163~2HOA THÁM|4164~2HỒNG PHONG|4165~2HƯNG ĐẠO|4166~2QUANG TRUNG|4167~2QUÝ HÒA|4168~2TÂN HÒA|4169~2THIỆN HÒA|4170~2THIỆN LONG|4171~2THIỆN THUẬT|4172~2VĨNH YÊN|4173~2YÊN LỖ|4174~2HOÀNG VĂN THỤ|4175~2MINH KHAI|4176~2MÔNG ÂN|4177~2TÂN VĂN|4178~2TÔ HIỆU|4180~2HỒNG THÁI",
  "240": "4181~1ĐÔNG KINH|4182~2HOÀNG ĐỒNG|4183~1HOÀNG VĂN THỤ|4184~1CHI LĂNG|4185~1TAM THANH|4186~2MAI PHA|4187~1VĨNH TRẠI|4188~2QUẢNG LẠC",
  "241": "4189~2HÙNG VIỆT|4190~2KHÁNG CHIẾN|4191~2KHÁNH LONG|4192~2KIM ĐỒNG|4193~2QUỐC KHÁNH|4194~2QUỐC VIỆT|4195~2TÂN MINH|4196~2TÂN TIẾN|4197~2TÂN YÊN|4198~2TRI PHƯƠNG|4199~2TRUNG THÀNH|4200~2VĨNH TIẾN|4201~2CHI LĂNG|4202~2ĐẠI ĐỒNG|4203~2ĐỀ THÁM|4204~2HÙNG SƠN|4205~3THẤT KHÊ|4206~2BÁC ÁI|4207~2CAO MINH|4208~2CHÍ MINH|4209~2ĐÀO VIÊN|4210~2ĐOÀN KẾT|4211~2ĐỘI CẤN",
  "242": "4212~1TÂN QUANG|4213~1MINH XUÂN|4214~1PHAN THIẾT|4215~1TÂN HÀ|4216~1Ỷ LA|4217~1HƯNG THÀNH|4218~1NÔNG TIẾN|4219~2AN TƯỜNG|4220~2TRÀNG ĐÀ|4221~2LƯỠNG VƯỢNG|4222~2AN KHANG|4223~2ĐỘI CẤN|4224~2THÁI LONG",
  "243": "4225~2AN KHANG|4226~2CHÂN SƠN|4227~2CHIÊU YÊN|4228~2CÔNG ĐA|4229~2ĐẠO VIỆN|4230~2ĐỘI BÌNH|4231~2ĐỘI CẤN|4232~2HOÀNG KHAI|4233~2HÙNG LỢI|4234~2KIẾN THIẾT|4235~2KIM PHÚ|4236~2TÂN TIẾN|4237~2KIM QUAN|4238~2LĂNG QUÁN|4239~2LỰC HÀNH|4240~2MỸ BẰNG|4241~2NHỮ HÁN|4242~2NHỮ KHÊ|4243~2PHÚ LÂM|4244~2PHÚ THỊNH|4245~2PHÚC NINH|4246~2QUÝ QUÂN|4247~3TÂN BÌNH|4248~2TÂN LONG|4249~2THÁI BÌNH|4250~2THÁI LONG|4251~2THẮNG QUÂN|4252~2THIÊN YÊN|4253~2TIẾN BỘ|4254~2TRUNG MINH|4255~2TRUNG MÔN|4256~2TRUNG NIÊN|4257~2TRUNG SƠN|4258~2TRUNG TRỰC|4259~3SÔNG LÔ|4260~2TỨ QUẬN|4261~2XUÂN TÂN|4262~2XUÂN VÂN",
  "244": "4273~3SƠN DƯƠNG|4263~2ĐỒNG QUÝ|4264~2THANH PHÁT|4265~2KHÁNG NHẬT|4266~2THIÊN TUẾ|4267~2SƠN NAM|4268~2ĐÔNG THỌ|4269~2VĂN PHÚ|4270~2CHI THIẾT|4271~2TAM ĐA|4272~2KỲ LÂM|4274~2PHÚC ỨNG|4275~2THIỆN KẾ|4276~2LÂM XUYÊN|4277~2TRUNG YÊN|4278~2LƯƠNG THIỆN|4279~2HỢP THÀNH|4280~2TÂN TRÀO|4281~2MINH THANH|4282~2HÀO PHÚ|4283~2HỒNG LẠC|4284~2HỢP HÒA|4285~2THỊNH TIẾN|4286~2TÚ THỊNH|4287~2ĐẠI PHÚ|4288~2TUÂN LỘ|4289~2NINH LAI|4290~2SẦM DƯƠNG|4291~2ĐÔNG LỢI|4292~2VÂN SƠN|4293~2QUYẾT THẮNG|4294~2VĨNH LỢI|4295~2LÂM PHIÊN|4296~2PHÚ LƯƠNG|4297~2THƯỢNG ẤM|4298~2CẤP TIẾN|4299~2BÌNH YÊN",
  "245": "4300~2BÌNH AN|4301~2BÌNH NHÂN|4302~2BÌNH PHÚ|4303~2HÀ LANG|4304~2HÒA AN|4305~2HÒA PHÚ|4306~2HỒNG QUANG|4307~2HÙNG MỸ|4308~2KIÊN ĐÀI|4309~2KIM BÌNH|4310~2LINH PHÚ|4311~2MINH QUANG|4312~2NGỌC HỘI|4313~2NHÂN LÝ|4314~2PHÚ BÌNH|4315~2PHÚC SƠN|4316~2PHÚC THỊNH|4317~2TÂN AN|4318~2TÂN MỸ|4319~2TÂN THỊNH|4320~2THỔ BÌNH|4321~2TRI PHÚ|4322~2TRUNG HÀ|4323~2TRUNG HÒA|4324~3VĨNH LỘC|4325~2VINH QUANG|4326~2XUÂN QUANG|4327~2YÊN LẬP|4328~2YÊN NGUYÊN",
  "246": "4345~3NÀ HANG|4329~2CÔN LÔN|4330~2ĐÀ VỊ|4331~2HỒNG THÁI|4332~2KHÂU TINH|4333~2KHUÔN HÀ|4334~2LĂNG CAN|4335~2NĂNG KHẢ|4336~2PHÚC TÂN|4337~2SINH LONG|4338~2SƠN PHÚ|4339~2THANH TƯƠNG|4340~2THƯỢNG GIÁP|4341~2THƯỢNG LÂM|4342~2THƯỢNG NÔNG|4343~2THÚY LOA|4344~2TRÙNG KHÁNH|4346~2VĨNH YÊN|4347~2XUÂN LẬP|4348~2XUÂN TIẾN|4349~2PHÚC YÊN|4350~2YÊN HOA",
  "247": "4351~2LĂNG CAN|4352~2XUÂN LẬP|4353~2THƯỢNG LÂM|4354~2THỔ BÌNH|4355~2PHÚC YÊN|4356~2KHUÔN HÀ|4357~2HỒNG QUANG|4358~2BÌNH AN",
  "248": "4359~2THÀNH LONG|4360~2THÚY HOA|4361~3TÂN YÊN|4362~2YÊN HOA|4363~2YÊN HƯƠNG|4364~2YÊN LÂM|4365~2YÊN PHÚ|4366~2YÊN THUẬN|4367~2BẠCH XA|4368~2BẰNG CỐC|4369~2ĐỨC MINH|4370~2HÙNG ĐỨC|4371~2MINH DÂN|4372~2MINH HƯƠNG|4373~2MINH KHƯƠNG|4374~2NHÂN MỤC|4375~2PHÙ LƯU|4376~2TÂN THÀNH|4377~2THÁI HÒA|4378~2THÁI SƠN|4379~2ĐỨC NINH|4380~2BÌNH XA",
  "249": "4381~3NT NGHĨA LỘ|4382~2BÌNH THUẬN|4383~2NGHĨA PHÚC|4384~2PHÙ NHAM|4385~2PHÚC SƠN|4386~2TÂN THỊNH|4387~2THƯỢNG BẰNG LA|4388~2SƠN THỊNH|4389~2PÁ HU|4390~2PÁ LAU|4391~2PHÌNH HỒ|4392~3NT LIÊN SƠN|4393~0ĐẠI LỊCH|4394~2GIA HỘI|4395~2CÁT THỊNH|4396~2CHẤN THỊNH|4397~2HẠNH SƠN|4398~2MINH AN|4399~2NẬM BÚNG|4400~2NẬM LÀNH|4401~2NẬM MƯỜI|4402~2AN LƯƠNG|4403~0ĐỒNG KHÊ|4404~2NGHĨA AN|4405~2NGHĨA LỢI|4406~2NGHĨA TÂM|4407~2SƠN LƯƠNG|4408~2SÙNG ĐÔ|4409~2SUỐI BU|4410~2SUỐI GIÀNG|4411~2SUỐI QUYỀN|4412~2THANH LƯƠNG|4413~3NT TRẦN PHÚ|4414~2TÚ LỆ|4415~2NGHĨA SƠN|4416~2SƠN A|4417~2THÁCH LƯƠNG|4418~2THẠCH LƯƠNG",
  "250": "4419~2YÊN THÁI|4420~2HOÀNG THẮNG|4421~2LANG THÍP|4422~2MẬU ĐÔNG|4423~2MỎ VÀNG|4424~2NÀ HẨU|4425~3MẬU A|4426~2CHÂU QUẾ THƯỢNG|4427~2ĐÔNG CUÔNG|4428~2LÂM GIANG|4429~2NGÒI A|4430~2PHONG DỤ HẠ|4431~2PHONG DỤ THƯỢNG|4432~2QUANG MINH|4433~2TÂN HỢP|4434~2VIỄN SƠN|4435~2XUÂN ÁI|4436~2XUÂN TẦM|4437~2YÊN HỢP|4438~2YÊN PHÚ|4439~2VIỄN SƠN|4440~2AN BÌNH|4441~2AN THỊNH|4442~2CHÂU QUẾ HẠ|4443~2ĐẠI PHÁC|4444~2ĐẠI SƠN|4445~2ĐÔNG AN|4446~2YÊN HƯNG",
  "251": "4453~3YÊN BÌNH|4447~2BẢO ÁI|4448~2CẨM ÂN|4449~2MỸ GIA|4450~2TÂN NGUYÊN|4451~2THỊNH HƯNG|4452~2VĨNH KIÊN|4454~2BẠCH HÀ|4455~2ĐẠI ĐỒNG|4456~2ĐẠI MINH|4457~2HÁN ĐÀ|4458~2MÔNG SƠN|4459~3THÁC BÀ|4460~2VŨ LINH|4461~2XUÂN LAI|4462~2YÊN BÌNH|4463~2YÊN THÀNH|4464~2PHÚC AN|4465~2PHÚC NINH|4466~2CẨM NHÂN|4467~2NGỌC CHẤN|4468~2PHÚ THỊNH|4469~2TÂN HƯƠNG|4470~2TÍCH CỐC|4471~2XUÂN LONG|4472~2VĂN LÃNG",
  "252": "4483~3TRẠM TẤU|4473~2PÁ HU|4474~2BẢN MÙ|4475~2PÁ LAU|4476~2TRẠM TẤU|4477~2HÁT LÌU|4478~2PHÌNH HỒ|4479~2TÚC ĐÁN|4480~0XÀ HỒ|4481~2BẢN CÔNG|4482~2TÀ SI LÁNG|4484~2LÀNG NHÌ",
  "253": "4485~2MINH TIẾN|4486~2MINH XUÂN|4487~2MƯỜNG LAI|4488~2XUÂN TẦM|4489~2YÊN PHÚ|4490~2YÊN THÁI|4491~3YÊN THẾ|4492~2AN LẠC|4493~2ĐỘNG QUAN|4494~2KHAI TRUNG`|4495~2KHÁNH THIỆN|4496~2LÂM THƯỢNG|4497~2LIẾU ĐÔ|4498~2MINH CHẨN|4499~2AN PHÚ|4500~2KHÁNH HÒA|4501~2MAI SƠN|4502~2XUÂN ÁI|4503~2YÊN HỢP|4504~2YÊN HƯNG|4505~2AN PHÚ|4506~2AN LẠC|4507~2ĐỘNG QUAN|4508~2KHAI TRUNG|4509~2KHÁNH HÒA|4510~2LÂM THƯỢNG|4511~2MINH TIẾN|4512~2MƯỜNG LAI|4513~2TÂN LĨNH|4514~2TÔ MẬU|4515~2KHÁNH THIỆN|4516~2LIỄU ĐÔ|4517~2MAI SƠN|4518~2MINH CHUẨN|4519~2MINH XUÂN|4520~2PHAN THANH|4521~2PHÚC LỢI|4522~2TÂN LẬP|4523~2TÂN PHƯỢNG|4524~2TRÚC LÂU|4525~2TRUNG TÂM|4526~2PHAN THANH|4527~2PHÚC LỢI|4528~2TÂN LẬP|4529~2TÂN LĨNH|4530~2TÂN PHƯỢNG|4531~2TÔ MẬU|4532~2TRÚC LÂU|4533~2TRUNG TÂM|4534~2VĨNH LẠC|4535~2YÊN THẮNG",
  "254": "4536~1PÚ TRẠNG|4537~1TÂN AN|4538~1CẦU THIA|4539~1TRUNG TÂM|4540~2NGHĨA LỢI|4541~2NGHĨA PHÚC|4542~2NGHĨA AN",
  "255": "4552~3MÙ CĂNG CHẢI|4543~2CHẾ CU NHA|4544~2CHẾ TẠO|4545~2DẾ SU PHÌNH|4546~2HỒ BỐN|4547~2KHAO MANG|4548~2KIM NỌI|4549~2LA PÁN TẨN|4550~2LAO CHẢI|4551~2MỒ DỀ|4553~2CAO PHẠ|4554~2NẬM CÓ|4555~2NẬM KHẮT|4556~2PÚNG LUÔNG",
  "256": "4557~2BẢO HƯNG|4558~2HÒA CUÔNG|4559~2HỒNG CA|4560~2HỢP MINH|4561~2HƯNG KHÁNH|4562~2HƯNG THỊNH|4563~2MINH TIẾN|4564~2PHÚC LỘC|4565~2LƯƠNG THỊNH|4566~2MINH QUÁN|4567~2MINH QUÂN|4568~2NGA QUÁN|4569~2VIỆT CƯỜNG|4570~2VIỆT HỒNG|4571~2VIỆT THÀNH|4572~3CỔ PHÚC|4573~2ÂU LÂU|4574~2BÁO ĐÁP|4575~2QUY MÔNG|4576~2TÂN ĐỒNG|4577~2VÂN HỘI|4578~2VĂN LÃNG|4579~2VĂN PHÚ|4580~2Y CAN|4581~2CƯỜNG THỊNH|4582~2ĐÀO THỊNH|4583~2KIÊN THÀNH",
  "257": "4584~2HỢP MINH|4585~2MINH BẢO|4586~2PHÚC LỘC|4587~2TÂN THỊNH|4588~2TUY LỘC|4589~1ĐỒNG TÂM|4590~1YÊN NINH|4591~1YÊN THỊNH|4592~1HỒNG HÀ|4593~1NGUYỄN PHÚC|4594~1NGUYỄN THÁI HỌC|4595~2NAM CƯỜNG|4596~1MINH TÂN|4597~2ÂU LÂU|4598~2GIỚI PHIÊN|4599~2VĂN PHÚ|4600~2VĂN TIẾN",
  "258": "4601~3BÃI BÔNG|4602~3BẮC SƠN|4603~3BA HÀNG|4604~2PHÚC TÂN|4605~2PHÚC THUẬN|4606~2HỒNG TIẾN|4607~2MINH ĐỨC|4608~2ĐẮC SƠN|4609~2ĐỒNG TIẾN|4610~2THÀNH CÔNG|4611~2TIÊN PHONG|4612~2VẠN PHÁI|4613~2NAM TIẾN|4614~2TÂN HƯƠNG|4615~2ĐÔNG CAO|4616~2TRUNG THÀNH|4617~2TÂN PHÚ|4618~2THUẬN THÀNH",
  "259": "4619~2YÊN TRẠCH|4620~2YÊN ĐỔ|4621~2YÊN LẠC|4622~2ÔN LƯƠNG|4623~2ĐỘNG ĐẠT|4624~2PHỦ LÝ|4625~2PHÚ ĐÔ|4626~2HỢP THÀNH|4627~2TÚC TRANH|4628~2PHẤN MỄ|4629~2VÔ TRANH|4630~2CỔ LŨNG|4631~2SƠN CẨM|4632~3GIANG TIÊN|4633~3ĐU|4634~2YÊN NINH",
  "260": "4635~3ĐÌNH CẢ|4636~2SẢNG MỘC|4637~2NGHÌN TƯỜNG|4638~2THẦN XA|4639~2VŨ CHẤN|4640~2THƯỢNG NUNG|4641~2PHÚ THƯỢNG|4642~2CÚC ĐƯỜNG|4643~2LA HIÊN|4644~2LÂU THƯỢNG|4645~2TRÀNG XÁ|4646~2PHƯƠNG GIAO|4647~2LIÊN MINH|4648~2DÂN TIẾN|4649~2BÌNH LONG",
  "261": "4650~1QUÁN TRIỀU|4651~1QUANG VINH|4652~1TÚC DUYÊN|4653~1HOÀNG VĂN THỤ|4654~1QUANG TRUNG|4655~1PHAN ĐÌNH PHÙNG|4656~1TÂN THỊNH|4657~1THỊNH ĐÁN|4658~1ĐỒNG QUANG|4659~1GIA SÀNG|4660~1TÂN LẬP|4661~1CAM GIÁ|4662~1PHÚ XÁ|4663~1HƯƠNG SƠN|4664~1TRUNG THÀNH|4665~1TÂN THÀNH|4666~1TÂN LONG|4667~2PHÚC HÀ|4668~2PHÚC XUÂN|4669~2QUYẾT THẮNG|4670~2PHÚC TRÌU|4671~2THỊNH ĐỨC|4672~2TÍCH LƯƠNG|4673~2TÂN CƯƠNG|4674~2LƯƠNG SƠN|4675~1TRƯNG VƯƠNG|4676~2CAO NGẠN|4677~2ĐỒNG BẨM|18467~1CHÙA HANG",
  "262": "4678~3HƯƠNG SƠN|4679~2BÀN ĐẠT|4680~2ĐỒNG LIÊN|4681~2TÂN KHÁNH|4682~2TÂN KIM|4683~2TÂN THÀNH|4684~2ĐÀO XÁ|4685~2BẢO LÝ|4686~2THƯỢNG ĐÌNH|4687~2TÂN HOÀ|4688~2NHÃ LỘNG|4689~2ĐIỀM THUỴ|4690~2XUÂN PHƯƠNG|4691~2TÂN ĐỨC|4692~2ÚC KỲ|4693~2LƯƠNG PHÚ|4694~2NGA MY|4695~2KHA SƠN|4696~2THANH NINH|4697~2DƯƠNG THÀNH|4698~2HÀ CHÂU",
  "263": "4699~2CÂY THỊ|4700~2HOÁ THƯỢNG|4701~2HỢP TIẾN|4702~2LINH SƠN|4703~2TÂN LỢI|4704~2NAM HOÀ|4705~2HUỐNG THƯỢNG|4706~2CAO NGẠN|4707~2ĐỒNG BẨM|4708~3SÔNG CẦU|4709~3CHÙA HANG|4710~3TRẠI CAU|4711~2VĂN LĂNG|4712~2TÂN LONG|4713~2HOÀ BÌNH|4714~2QUANG SƠN|4715~2MINH LẬP|4716~2VĂN HÁN|4717~2HOÁ TRUNG|4718~2KHE MO",
  "264": "4719~3ĐẠI TỪ|4720~3QUÂN CHU|4721~2PHÚC LƯƠNG|4722~2MINH TIẾN|4723~2YÊN LÃNG|4724~2ĐỨC LƯƠNG|4725~2PHÚ CƯỜNG|4726~2NA MAO|4727~2PHÚ LẠC|4728~2TÂN LINH|4729~2PHÚ THỊNH|4730~2PHỤC LINH|4731~2PHÚ XUYÊN|4732~2BẢN NGOẠI|4733~2TIÊN HỘI|4734~2HÙNG SƠN|4735~2CÙ VÂN|4736~2HÀ THƯỢNG|4737~2LA BẰNG|4738~2HOÀNG NÔNG|4739~2KHÔI KỲ|4740~2AN KHÁNH|4741~2TÂN THÁI|4742~2BÌNH THUẬN|4743~2LỤC BA|4744~2MỸ YÊN|4745~2VẠN THỌ|4746~2VĂN YÊN|4747~2KÝ PHÚ|4748~2CÁT NÊ|4749~2QUÂN CHU",
  "265": "4755~2KIM PHƯỢNG|4756~2BẢO LINH|4757~2KIM SƠN|4758~2PHÚC CHU|4759~2TÂN DƯƠNG|4760~2PHƯỢNG TIẾN|4761~2BẢO CƯỜNG|4762~2ĐỒNG THỊNH|4763~2ĐỊNH BIÊN|4764~2THANH ĐỊNH|4765~2TRUNG HỘI|4766~2TRUNG LƯƠNG|4767~2BÌNH YÊN|4768~2ĐIỂM MẶC|4769~2PHÚ TIẾN|4770~2BỘC NHIÊU|4771~2SƠN PHÚ|4772~2PHÚ ĐÌNH|4773~2BÌNH THÀNH|4750~3CHỢ CHU|4751~2LINH THÔNG|4752~2LAM VỸ|4753~2QUY KỲ|4754~2TÂN THỊNH",
  "266": "4774~1LƯƠNG CHÂU|4775~1MỎ CHÈ|4776~1CẢI ĐAN|4777~1THẮNG LỢI|4778~1PHỐ CÒ|4779~2VINH SƠN|4780~2TÂN QUANG|4781~2BÌNH SƠN|4782~2BÁ XUYÊN|4783~1BÁCH QUANG|4784~2LƯƠNG SƠN",
  "267": "4785~2HÀ LỘC|4786~2VĂN LUNG|4787~1ÂU CƠ|4788~2HÀ THẠCH|4789~2THANH VINH|4790~2NĂNG YÊN|4791~2VẪN LĨNH|4792~1HÙNG VƯƠNG|4793~1PHONG CHÂU|4794~1TRƯỜNG THỊNH|4795~2PHÚ HỘ|4796~2THANH MINH",
  "268": "4799~3THANH BA|4797~2ĐỒNG XUÂN|4798~2YỂN KHÊ|4800~2PHƯƠNG LĨNH|4801~2THANH XÁ|4802~2MẠN LẠN|4803~2CHÍ TIÊN|4804~2LƯƠNG LỖ|4805~2SƠN CƯƠNG|4806~2ĐÕ SƠN|4807~2THANH HÀ|4808~2KHẢI XUÂN|4809~2THANH VÂN|4810~2QUẢNG NẠP|4811~2NINH DÂN|4812~2YÊN NỘI|4813~2HANH CÙ|4814~2THÁI NINH|4815~2VÕ LAO|4816~2ĐÔNG LĨNH|4817~2ĐẠI AN|4818~2ĐÔNG THÀNH|4819~2HOÀNG CƯỜNG|4820~2VŨ ẺN|4821~2ĐỖ XUYÊN|4822~2NĂNG YÊN|4823~2VÂN LĨNH",
  "269": "4824~1TIÊN CÁT|4825~1NÔNG TRANG|4826~1MINH NÔNG|4827~1GIA CẨM|4828~1MINH PHƯƠNG|4829~2TRƯNG VƯƠNG|4830~1BẾN GÓT|4831~1THỌ SƠN|4832~2SÔNG LÔ|4833~1BẠCH HẠC|4834~1THANH MIẾU|4835~1DỮU LÂU|4836~2PHƯỢNG LÂU|4837~2HÙNG LÔ|4838~1VÂN CƠ|4839~1VÂN PHÚ|4840~0KCN THỤY VÂN|4841~1TÂN DÂN|4842~2KIM ĐỨC|4843~2TÂN ĐỨC|4844~2HY CƯƠNG|17003~2CHU HÓA|17012~2THANH ĐÌNH",
  "270": "4845~3ĐOAN HÙNG|4846~2NGỌC QUAN|4847~2TÂY CỐC|4848~2BẰNG LUÂN|4849~2CA ĐÌNH|4850~2HÙNG LONG|4851~2CHI ĐÁM|4852~2SÓC ĐĂNG|4853~2PHƯƠNG TRUNG|4854~2YÊN KIỆN|4855~2ĐẠI NGHĨA|4856~2PHÚ THỨ|4857~2QUẾ LÂM|4858~2TIÊU SƠN|4859~2VÂN ĐỒN|4860~2VÂN DU|4861~2BẰNG DOÃN|4862~2CHÍ ĐÁM|4863~2PHONG PHÚ|4864~2PHÚC LAI|4865~2MINH PHÚ|4866~2CHÂN MỘNG|4867~2HỮU ĐÔ|4868~2VỤ QUANG|4869~2NGHINH XUYÊN|4870~2HÙNG QUAN|4871~2ĐÔNG KHÊ|4872~2MINH TIẾN|4873~2MINH LƯƠNG",
  "271": "4874~3THANH THỦY|4875~2HOÀNG XÁ|4876~2 LA PHÙ|4877~2TÂN PHƯƠNG|4878~2ĐOAN HẠ|4879~2THẠCH ĐỒNG|4880~2BẢO YÊN|4881~2SƠN THỦY|4882~2XUÂN LỘC|4883~2ĐÀO XÁ|4884~2YẾN MAO|4885~2PHƯỢNG MAO|4886~2LƯƠNG NHA|4887~2TỈNH NHUỆ|4888~2TRUNG NGHĨA|4889~2TU VŨ|4890~2ĐỒNG LUẬN|4891~2TINH NHUỆ|4892~2TRUNG THỊNH",
  "272": "4894~0TT THANH SƠN|4893~2VĂN MIẾU|4895~2THỤC LUYỆN|4896~2CỰ ĐỒNG|4897~2GIÁP LAI|4898~2THẮNG SƠN|4899~2BA MỎ|4900~2CỰ THẮNG|4901~2TẤT THẮNG|4902~2XUÂN HÙNG|4903~2TÂN MINH|4904~2TÂN LẬP|4905~2KHẢ CỬU|4906~2THƯỢNG CỬU|4907~2LƯƠNG NHA|4908~2ĐỊCH QUẢ|4909~2YÊN SƠN|4910~2THẠCH KHOÁN|4911~2SƠN HÙNG|4912~2HƯƠNG CẦN|4913~2YÊN LƯƠNG|4914~2YÊN LÃNG|4915~2VÕ MIẾU|4916~2ĐÔNG CỬU",
  "273": "4924~2TÂN SƠN|4917~2TÂN PHÚ|4918~2MỸ THUẬN|4919~2THU NGẠC|4920~2VĂN LUÔNG|4921~2MINH ĐÀI|4922~2THẠCH KIỆT|4923~2KIỆT SƠN|4925~2XUÂN ĐÀI|4926~2LAI ĐỒNG|4927~2THU CÚC|4928~2TAM THANH|4929~2LONG CỐC|4930~2XUÂN SƠN|4931~2ĐÔNG SƠN|4932~2TAM THANH|4933~2VINH TIẾN|4934~2KIM THƯỢNG",
  "274": "4949~3YÊN LẬP|4935~2HƯNG LONG|4936~2XUÂN THỦY|4937~2NGA HOÀNG|4938~2ĐỒNG THỊNH|4939~2PHÚC KHÁNH|4940~2ĐỒNG LẠC|4941~2NGỌC ĐỒNG|4942~2MINH HÒA|4943~2XUÂN VIÊN|4944~2MỸ LUNG|4945~2MỸ LƯƠNG|4946~2XUÂN AN|4947~2LƯƠNG SƠN|4948~2NGỌC LẬP|4950~2TRUNG SƠN|4951~2THƯỢNG LONG",
  "275": "4952~2VĂN KHÚC|4953~2ĐIÊU LƯƠNG|4954~2ĐỒNG LƯƠNG|4955~2PHÚ KHÊ|4956~3ĐÔNG PHÚ|4957~2PHÚ LẠC|4958~2PHÙNG XÁ|4959~2PHƯƠNG XÁ|4960~2SƠN NGA|4961~2SAI NGA|4962~2THANH NGA|4963~2SƠN TỈNH|4964~2XƯƠNG THỊNH|4965~2YÊN TẬP|4966~2TÙNG KHÊ|4967~2CẤP DẪN|4968~2CÁT TRÙ|4969~2HIỀN ĐA|4970~2TUY LỘC|4971~2TA XÁ|4972~2TỈNH CƯƠNG|4973~2ĐỒNG CAM|4974~2TRƯƠNG XÁ|4975~2NGÔ XÁ|4976~2PHƯỢNG VĨ|4977~2YÊN DƯỠNG|4978~2TIÊN LƯƠNG|4979~2TAM SƠN|4980~2HƯƠNG LUNG|4981~2THỤY LIỄU|4982~2VĂN BÁN|4983~2SƠN TỈNH|17004~3SÔNG THAO",
  "276": "4984~3HƯNG HÓA|4985~2THỌ VĂN|4986~2HƯƠNG NỘN|4987~2CỔ TIẾT|4988~2VĂN LƯƠNG|4989~2DỊ NÂU|4990~2DẬU DƯƠNG|4991~2TỀ LỄ|4992~2THƯỢNG NÔNG|4993~2THANH UYÊN|4994~2QUANG HÚC|4995~2PHƯƠNG THỊNH|4996~2HỒNG ĐÀ|4997~2HƯƠNG NHA|4998~2HIỀN QUAN|4999~2TAM CƯỜNG|5000~2VỰC TRƯỜNG|5001~2TỨ MỸ|5002~2XUÂN QUANG|5003~2HÙNG ĐÔ",
  "277": "5010~3LÂM THAO|5004~2THANH ĐÌNH|5005~2KINH KỆ|5006~2CAO XÁ|5007~2TIÊN KIÊN|5008~2XUÂN HUY|5009~2XUÂN LŨNG|5011~2SƠN VI|5012~2HÙNG SƠN|5013~2TỨ XÃ|5014~2BẢN NGUYÊN|5015~2SƠN DƯƠNG|5016~2HỢP HẢI|5017~2VĨNH LẠI|5018~2THẠCH SƠN|5019~3HÙNG SƠN",
  "278": "5026~3HẠ HÒA|5020~2LỆNH KHANH|5021~2ĐAN HẠ|5022~2CÁO ĐIỀN|5023~2PHƯƠNG VIÊN|5024~2ĐẠI PHẠM|5025~2ÂM HẠ|5027~2MINH HẠC|5028~2Y SƠN|5029~2PHỤ KHÁNH|5030~2MINH CÔI|5031~2BẰNG GIÃ|5032~2ĐỘNG LÂM|5033~2LANG SƠN|5034~2VÔ TRANH|5035~2LÂM LỢI|5036~2CHUẾ LƯU|5037~2XUÂN ÁNG|5038~2HIỀN LƯƠNG|5039~2VĂN LANG|5040~2YÊN LUẬT|5041~2YÊN KỲ|5042~2HƯƠNG XẠ|5043~2VĨNH CHÂN|5044~2ĐAN THƯỢNG|5045~2HẬU BỔNG|5046~2HÀ LƯƠNG|5047~2LIÊN PHƯƠNG|5048~2GIA ĐIỀN|5049~2ẤM THƯỢNG|5050~2QUÂN KHÊ|5051~2CHÍNH CÔNG|5052~2ĐAN HÀ|5053~2MAI TÙNG|5054~2VỤ CẦU",
  "279": "5068~2PHÙ NINH|5055~2BÌNH BỘ|5056~2TỬ ĐÀ|5057~2VĨNH PHÚ|5058~2LIÊN HOA|5059~2PHÚ MỸ|5060~2HẠ GIÁP|5061~3PHONG CHÂU|5062~2PHÚ LỘC|5063~2BẢO THANH|5064~2GIA THANH|5065~2PHÚ NHAM|5066~2TIÊN DU|5067~2AN ĐẠO|5069~2PHỦ LỖ|5070~2TIÊN PHÚ|5071~2TRẠM THẢN|5072~2TRUNG GIÁP|5073~2LỆ MỸ|5074~2TRỊ QUẬN|5075~2RỪNG MẬN",
  "280": "5076~1THỌ XƯƠNG|5077~1TRẦN NGUYÊN HÃN|5078~1HOÀNG VĂN THỤ|5079~1TRẦN PHÚ|5080~1NGÔ QUYỀN|5081~1MỸ ĐỘ|5082~2DĨNH KẾ|5083~1LÊ LỢI|5084~2ĐỒI CỐC|5085~2XƯƠNG GIANG|5086~2ĐA MAI|5087~2SONG MAI|5088~2SONG KHÊ|5089~2TÂN MỸ|5090~2TÂN TIẾN|5091~2DĨNH TRÌ|5092~2ĐỒNG SƠN",
  "281": "5093~3THẮNG|5094~2ĐỒNG TÂN|5095~2THANH VÂN|5096~2HOÀNG LƯƠNG|5097~2HOÀNG THANH|5098~2HOÀNG AN|5099~2NGỌC SƠN|5100~2THÁI SƠN|5101~2HÒA SƠN|5102~2ĐỨC THẮNG|5103~2DANH THẮNG|5104~2THƯỜNG THẮNG|5105~2LƯƠNG PHONG|5106~2HÙNG SƠN|5107~2ĐOAN BÁI|5108~2ĐÔNG LỘ|5109~2CHÂU MINH|5110~2MAI ĐÌNH|5111~2XUÂN CẨM|5112~2HƯƠNG LÂM|5113~2ĐẠI THANH|5114~2HỢP THỊNH|5115~2MAI TRUNG|5116~2QUANG MINH|5117~2BẮC LÝ|5118~2HOÀNG VÂN|5119~2DĨNH TRÌ",
  "282": "5120~3BÍCH ĐỘNG|5121~3NÊNH|5122~2THƯỢNG LAN|5123~2VIỆT TIẾN|5124~2NGHĨA TRUNG|5125~2MINH ĐỨC|5126~2HƯƠNG MAI|5127~2TỰ LAN|5128~2BÍCH SƠN|5129~2TRUNG SƠN|5130~2HỒNG THÁI|5131~2XUÂN PHÚ|5132~2TĂNG TIẾN|5133~2QUẢNG MINH|5134~2HOÀNG NINH|5135~2NINH SƠN|5136~2VÂN TRUNG|5137~2VÂN HÀ|5138~2QUANG CHÂU|5139~0KCN ĐÌNH TRÁM|5140~2TIÊN SƠN",
  "283": "5141~2PHỒN XƯƠNG|5142~2TÂN SỎI|5143~2HƯƠNG VĨ|5144~2ĐỒNG HƯU|5145~2TÂN HIỆP|5146~0NÔNG TRƯỜNG BỐ HẠ|5147~3CẦU GỒ|5148~3BỐ HẠ|5149~2ĐỒNG TÂM|5150~2ĐỒNG TIẾN|5151~2CANH LỘ|5152~2XUÂN LƯƠNG|5153~2TAM TIẾN|5154~2ĐỒNG VƯƠNG|5155~2TAM HIỆP|5156~2TIẾN THẮNG|5157~2HỒNG KỲ|5158~2ĐÔNG SƠN|5159~2ĐỒNG LẠC|5160~2ĐỒNG KỲ|5161~2AN THƯỢNG|5162~2CANH NẬU|5163~2BỐ HẠ",
  "284": "5164~3CHŨ|5165~2CẤM SƠN|5166~2TÂN SƠN|5167~2PHONG MINH|5168~2PHONG VÂN|5169~2XA LÝ|5170~2HỘ ĐÁP|5171~2SƠN HẢI|5172~2THANH HẢI|5173~2KIÊN LAO|5174~2BIÊN SƠN|5175~2KIÊN THÀNH|5176~2HỒNG GIANG|5177~2KIM SƠN|5178~2TÂN HOA|5179~2GIÁP SƠN|5180~2BIỂN ĐỘNG|5181~2QUÝ SƠN|5182~2TRÙ HỰU|5183~2PHÌ ĐIỀN|5184~2NGHĨA HỒ|5185~2TÂN QUANG|5186~2ĐỒNG CỐC|5187~2TÂN LẬP|5188~2PHÚ NHUẬN|5189~2NAM DƯƠNG|5190~2MỸ AN|5191~2TÂN MỘC|5192~2ĐÈO GIA|5193~2PHƯƠNG SƠN",
  "285": "5194~3VÔI|5195~3KÉP|5196~2NGHĨA HÒA|5197~2NGHĨA HƯNG|5198~2QUANG THỊNH|5199~2HƯƠNG SƠN|5200~2ĐÀO MỸ|5201~2TIÊN LỤC|5202~2AN HÀ|5203~2TÂN THỊNH|5204~2MỸ HÀ|5205~2HƯƠNG LẠC|5206~2DƯƠNG ĐỨC|5207~2TÂN THANH|5208~2YÊN MỸ|5209~2PHI MÔ|5210~2XUÂN HƯƠNG|5211~2THÁI ĐÀO|5212~2DĨNH TRÌ|5213~2TÂN DĨNH|5214~2ĐẠI LÂM|5215~2XƯƠNG LÂM|5216~2MỸ THÁI|5217~2TÂN HƯNG",
  "286": "5218~3CAO THƯỢNG|5219~3NHÃ NAM|5220~2TÂN TRUNG|5221~2ĐẠI HÓA|5222~2QUANG TIẾN|5223~2PHÚC SƠN|5224~2AN DƯƠNG|5225~2PHÚC HÒA|5226~2LIÊN SƠN|5227~2HỢP ĐỨC|5228~2LAM CỐT|5229~2CAO XÁ|5230~2CAO THƯỢNG|5231~2SONG VÂN|5232~2NGỌC CHÂU|5233~2VIỆT LẬP|5234~2VIỆT NGỌC|5235~2LIÊN CHUNG|5236~2NGỌC THIỆN|5237~2NGỌC LÝ|5238~2QUẾ NHAM|5239~2NGỌC VÂN|5240~2LAN GIỚI|5241~2NHÃ NAM",
  "287": "5243~3LỤC NAM|5242~3ĐỒI NGÔ|5244~2ĐÔNG HƯNG|5245~2ĐỒNG PHÚ|5246~2TAM DỊ|5247~2BẢO SƠN|5248~2BẢO ĐÀI|5249~2THANH LÂM|5250~2TIÊN NHA|5251~2TRƯỜNG GIANG|5252~2TIÊN HƯNG|5253~2PHƯƠNG SƠN|5254~2CHU ĐIỆN|5255~2CƯỜNG SƠN|5256~2NGHĨA PHƯƠNG|5257~2VÔ TRANH|5258~2BÌNH SƠN|5259~2KHÁM LẠNG|5260~2HUYỀN SƠN|5261~2TRƯỜNG SƠN|5262~2LỤC SƠN|5263~2BẮC LŨNG|5264~2VŨ XÁ|5265~2CẨM LÝ|5266~2VU HỘI|5267~2YÊN SƠN|5268~2LAN MẪU|5269~2ĐAN HỘI",
  "288": "5270~3AN CHÂU|5271~2THẠCH SƠN|5272~2VÂN SƠN|5273~2HỮU HẢI|5274~2HỮU SẢN|5275~2PHÚC THẮNG|5276~2AN BÁ|5277~2YÊN ĐỊNH|5278~2LỆ VIỄN|5279~2TUẤN ĐẠO|5280~2DƯƠNG HƯU|5281~2BỒNG AM|5282~2LONG SƠN|5283~3THANH SƠN|5284~2THANH LUẬN|5285~2QUẾ SƠN|5286~2CHIÊN SƠN|5287~2GIÁO LIÊM|5288~2VĨNH KHƯƠNG|5289~2CẨM ĐÀN|5290~2AN LẠC|5291~2AN LẬP|5292~2AN CHÂU|5293~2TUẤN MẬU",
  "289": "5294~2NỘI HOÀNG|5295~2TIỀN PHONG|5296~2XUÂN PHÚ|5297~2TÂN LIỄU|5298~2TRÍ YÊN|5299~2LÃNG SƠN|5300~2YÊN LƯ|5301~2TIẾN DŨNG|5302~2NHAM SƠN|5303~2ĐỨC GIANG|5304~2CẢNH THỤY|5305~2TƯ MẠI|5306~2THẮNG CƯƠNG|5307~2ĐÔNG VIỆT|5308~2ĐÔNG PHÚC|5309~3NEO|5310~2LÃO HỘ|5311~2TÂN MỸ|5312~2HƯƠNG GIÁN|5313~3TÂN DÂN|5314~2ĐỒNG SƠN|5315~2TÂN TIẾN|5316~2QUỲNH SƠN|5317~2SONG KHÊ|5318~2TÂN AN",
  "290": "5319~3TIÊN YÊN|5320~2ĐỒNG RUI|5321~2ĐẠI DỰC|5322~2ĐIỀN XÁ|5323~2ĐÔNG HẢI|5324~2ĐÔNG NGŨ|5325~2HÀ LÂU|5326~2HẢI LẠNG|5327~2YÊN THAN|5328~2PHONG DỤ|5329~2TIÊN LÃNG|5330~2ĐẠI THÀNH",
  "291": "5331~1QUANG TRUNG|5332~1YÊN THANH|5333~1THANH SƠN|5334~1TRƯNG VƯƠNG|5335~2PHƯƠNG ĐÔNG|5336~1NAM KHÊ|5337~1VÀNG DANH|5338~1BẮC SƠN|5339~2PHƯƠNG NAM|5340~1ĐIỀN CÔNG|5341~1THƯỢNG YÊN CÔNG",
  "292": "5350~3QUẢNG YÊN|5342~2CỘNG HÒA|5343~2MINH THÀNH|5344~2ĐÔNG MAI|5345~2HIỆP HÒA|5346~2YÊN HẢI|5347~2PHONG HẢI|5348~2LIÊN HÒA|5349~2CẨM LA|5351~2TIỀN AN|5352~2NAM HÒA|5353~2HOÀNG TÂN|5354~2HÀ AN|5355~2TÂN AN|5356~2LIÊN VỊ|5357~2YÊN GIANG|5358~2PHONG CỐC|5359~2SÔNG KHOAI|5360~2TIỀN PHONG",
  "293": "5361~3ĐÔNG TRIỀU|5362~2NGUYỄN HUỆ|5363~3MẠO KHÊ|5364~2ĐỨC CHÍNH|5365~2HOÀNG QUẾ|5366~2HỒNG PHONG|5367~2HƯNG ĐẠO|5368~2KIM SƠN|5369~2VIỆT DÂN|5370~0XUÂN SƠN|5371~2YÊN ĐỨC|5372~2YÊN THỌ|5373~2AN SINH|5374~2BÌNH DƯƠNG|5375~2BÌNH KHÊ|5376~2TÂN VIỆT|5377~2HỒNG THÁI ĐÔNG|5378~2HỒNG THÁI TÂY|5379~2THỦY AN|5380~2TRÀNG AN|5381~2TRÀNG LƯƠNG",
  "294": "5389~3BA CHẼ|5382~2ĐẠP THANH|5383~2ĐỒN ĐẠC|5384~2LƯƠNG MÔNG|5385~2MINH CẦM|5386~2NAM SƠN|5387~2THANH LÂM|5388~2THANH SƠN",
  "295": "5397~3BÌNH LIÊU|5390~2ĐỒNG TÂM|5391~2ĐỒNG VĂN|5392~2HOÀNH MÔ|5393~2HÚC ĐỘNG|5394~2LỤC HỒN|5395~2TỈNH HÚC|5396~2VÔ NGẠI|5398~2BÌNH LIÊU",
  "296": "5401~3ĐẦM HÀ|5399~2QUẢNG AN|5400~2QUẢNG LÂM|5402~2QUẢNG LỢI|5403~2QUẢNG TÂN|5404~2ĐẠI BÌNH|5405~2DỰC YÊN|5406~2TÂN LẬP|5407~2TÂN BÌNH|5408~2ĐẦM HÀ",
  "297": "5409~3CÁI RỒNG|5410~2QUAN LẠN|5411~2THẮNG LỢI|5412~2VẠN YÊN|5413~2BẢN SEN|5414~2ĐÔNG XÁ|5415~2BÌNH DÂN|5416~2ĐÀI XUYÊN|5417~2ĐOÀN KẾT|5418~2HẠ LONG|5419~2MINH CHÂU|5420~2NGỌC VỪNG",
  "298": "5421~0P QUANG HANH|5422~1CẨM THẠCH|5423~1CẨM THÀNH|5424~1CẨM BÌNH|5425~0CỬA ÔNG|5426~1CẨM TÂY|5427~1CẨM ĐÔNG|5428~1CẨM PHÚ|5429~1CẨM TRUNG|5430~1CẨM THỦY|5431~1CẨM THỊNH|5432~1CẨM SƠN|5433~1CẨM HẢI|5434~0P MÔNG DƯƠNG|5435~2CỘNG HÒA|5436~2DƯƠNG HUY",
  "299": "5437~3CÔ TÔ|5438~2ĐỒNG TIẾN|5439~2THANH LÂN",
  "300": "5440~1 KA LONG|5441~1TRẦN PHÚ|5442~1HÒA LẠC|5443~1HẢI YÊN|5444~1NINH DƯƠNG|5445~2HẢI XUÂN|5446~1HẢI HÒA|5447~1 TRÀ CỔ|5448~2BÌNH NGỌC|5449~2BẮC SƠN|5450~2QUẢNG NGHĨA|5451~2VĨNH THỰC|5452~2HẢI TIẾN|5453~2HẢI ĐÔNG|5454~2VẠN NINH|5455~2HẢI SƠN|5456~2VĨNH TRUNG",
  "301": "5457~2ĐƯỜNG HOA|5458~2CÁI CHIÊN|5459~2PHÚ HẢI|5460~2QUẢNG CHÍNH|5461~2QUẢNG TRUNG|5462~2QUẢNG ĐIỀN|5463~2QUẢNG ĐỨC|5464~2QUẢNG HÀ|5465~2QUẢNG LONG|5466~2QUẢNG MINH|5467~2QUẢNG PHONG|5468~2QUẢNG SƠN|5469~2QUẢNG THẮNG|5470~2QUẢNG THÀNH|5471~2QUẢNG THỊNH|5472~3QUẢNG HÀ|5473~2TIẾN TỚI",
  "302": "5474~1TRẦN HƯNG ĐẠO|5475~1HỒNG GAI|5476~1YẾT KIÊU|5477~1HỒNG HẢI|5478~1HỒNG HÀ|5479~1HÀ TU|5480~1HÀ PHONG|5481~1HÀ TRUNG|5482~1HÀ LẦM|5483~1HÀ KHÁNH|5484~1CAO XANH|5485~1CAO THẮNG|5486~1BÃI CHÁY|5487~1TUẦN CHÂU|5488~1HÀ KHẨU|5489~1GIẾNG ĐÁY|5490~1HÙNG THẮNG|5491~1BẠCH ĐẰNG|5492~2VIỆT HƯNG|5493~2ĐẠI YÊN",
  "303": "5494~3TRỚI|5495~2LÊ LỢI|5496~2THỐNG NHẤT|5497~2BẰNG CÁ|5498~2DÂN CHỦ|5499~2ĐỒNG LÂM|5500~2ĐỒNG SƠN|5501~2HÒA BÌNH|5502~2KỲ THƯỢNG|5503~2QUẢNG LA|5504~2SƠN DƯƠNG|5505~2TÂN DÂN|5506~2VŨ OAI",
  "304": "5511~3TAM ĐƯỜNG|5507~3BÌNH LƯ|5508~2HỒ THẦU|5509~2NÀ TĂM|5510~2SÙNG PHÀI|5512~2THÈN SIN|5513~2BÀN GIANG|5514~2BẢN HON|5515~2KHUN HÁ|5516~2NÙNG NÀNG|5517~2TÀ LÈNG|5518~2BẢN BO|5519~2SƠN BÌNH|5520~2GIANG MA",
  "305": "5533~3PHONG THỔ|5521~2BẢN LANG|5522~2DÀO SAN|5523~2HOANG THÈN|5524~2KHỔNG LÀO|5525~2MA LI CHẢI|5526~2MA LI PHO|5527~2MỒ SÌ SAN|5528~2MÙ SANG|5529~2NẬM XE|5530~2PA VÂY SỬ|5531~2SÌ LỜ LẦU|5532~2MƯỜNG SO|5534~3PA SO|5535~2LẢN NHÌ THÀNG|5536~2SÌN SUỐI HỒ|5537~2TÔNG QUA LÌN|5538~2HUỔI LUÔNG|5539~2VÀNG MA CHẢI|5540~2VÀNG BÓ",
  "306": "5546~3SÌN HỒ|5548~2HỒNG THU|5549~2LÊ LỢI|5550~2MA QUAI|5551~2NẬM BAN|5552~2NẬM CHA|5553~2NẬM CUỔI|5554~2NẬM HÃN|5555~2NẬM MẠ|5556~2NẬM TĂM|5557~2NOONG HẺO|5558~2PHÌN HỒ|5559~2PHÚ ĐAO|5560~2PU SAM CÁP|5561~2SÀ DỀ PHÌN|5562~2TẢ NGẢO|5563~2TỦA SÍN CHẢI|5541~2CHĂN NƯA|5542~2LÀNG MÔ|5543~2PA TẦN|5544~2PHĂNG SÔ LIN|5545~2TẢ PHÌN|5547~2CĂN CO|18447~2LÙNG THÀNG|18448~2PA KHÓA",
  "307": "5568~3THAN UYÊN|5564~2MƯỜNG KIM|5565~2MƯỜNG THAN|5566~2NÀ CANG|5567~2TÀ GIA|5569~2HỐ MÍT|5570~2KHOEN ON|5571~2MƯỜNG MÍT|5572~2PHU MA|5573~2TÀ HỪA|5574~2MƯỜNG CANG|5575~2PHÚC KHOA|5576~2PHÚC THAN|5577~2TÀ MUNG|5578~2HUA NÀ",
  "308": "5580~3MƯỜNG TÈ|5579~2BUN NƯA|5581~2BUN TỞ|5582~2HUA BUN|5583~2KA LĂNG|5584~2KAN HỒ|5585~2MÙ CẢ|5586~2MƯỜNG MÔ|5587~2MƯỜNG TÈ|5588~2NẬM HÀNG|5589~2NẬM KHAO|5590~2PA Ủ|5591~2PA VỆ SỬ|5592~2TÀ TỔNG|5593~2THU LŨM|18445~2TÁ BẠ|18446~2VÀNG SAN",
  "309": "5602~3TÂN UYÊN|5594~2NẬM CẦN|5595~2PẮC TA|5596~2THÂN THUỘC|5597~3TRẤN NÔNG TRƯỜNG|5598~2MƯỜNG KHOA|5599~2NẬM SỎ|5600~2TÀ MÍT|5601~2TRUNG ĐỒNG|5603~2PHÚC KHOA|5604~2HỐ MÍT|5605~2BẢN BO",
  "310": "5615~3NẬM NHÙN|5606~2NẬM PÌ|5607~2LÊ LỢI|5608~2HUA BUM|5609~2NẬM CHÀ|5610~2PÚ ĐAO|5611~2NẬM MANH|5612~2MƯỜNG MÔ|5613~2NẬM BAN|5614~2TRUNG CHẢI|5616~2NẬM HÀNG",
  "311": "5617~1TÂN PHONG|5618~1QUYẾT THẮNG|5619~1ĐOÀN KẾT|5620~2NẬM LỎONG|5621~2 SAN THÀNG|5622~2TAM ĐƯỜNG ĐẤT|5623~1ĐÔNG PHONG|17006~1QUYẾT TIẾN",
  "312": "5637~3QUỲNH NHAI|5624~2MƯỜNG CHIÊN|5625~2CÀ NÀNG|5626~2CHIỀNG KHAY|5627~2PHA KHINH|5628~2MƯỜNG GION|5629~2PẮC MA|5630~2CHIỀNG ƠN|5631~2MƯỜNG GIÀNG|5632~2CHIỀNG BẰNG|5633~2MƯỜNG SAI|5634~2NẬM ÉT|5635~2LIỆT MUỘI|5636~2CHIỀNG KHOANG",
  "313": "5638~3MƯỜNG LA|5639~3ÍT ONG|5640~2NẬM GIỐN|5641~2CHIỀNG LAO|5642~2HUA TRAI|5643~2NGỌC CHIẾN|5644~2MƯỜNG TRAI|5645~2NẬM PĂM|5646~2CHIỀNG MUÔN|5647~2CHIỀNG ÂN|5648~2PI TOONG|5649~2CHIỀNG CÔNG|5650~2TẠ BÚ|5651~2CHIỀNG SAN|5652~2MƯỜNG BÚ|5653~2CHIỀNG HOA|5654~2MƯỜNG CHÙM",
  "314": "5655~3SÔNG MÃ|5656~2BÓ SINH|5657~2PÚ PẨU|5658~2CHIỀNG PHUNG|5659~2CHIỀNG EN|5660~2MƯỜNG LẦM|5661~2NẬM TY|5662~2ĐỨC MÒN|5663~2YÊN HƯNG|5664~2CHIỀNG SƠ|5665~2NÀ NGHỊU|5666~2NẬM MẰN|5667~2CHIỀNG KHOONG|5668~2CHIỀNG CANG|5669~2HUỔI MỘT|5670~2MƯỜNG SAI|5671~2MƯỜNG CAI|5672~2MƯỜNG HUNG|5673~2CHIỀNG KHƯƠNG.",
  "315": "5674~1CHIỀNG AN|5675~1CHIỀNG LỀ|5676~1TÔ HIỆU|5677~1QUYẾT THẮNG|5678~1QUYẾT TÂM|5679~1CHIỀNG SINH|5680~2CHIỀNG CỌ|5681~2CHIỀNG ĐEN|5682~2CHIỀNG XÔM|5683~1CHIỀNG CƠI|5684~2HUA LA|5685~2CHIỀNG NGẦN",
  "316": "5686~3MAI SƠN|5687~3CÒ NÒI|5688~0TK NÀ SẢN|5689~2CHIỀNG CHUNG|5690~2CHIỀNG MAI|5691~2HÁT LÓT|5692~2CÒ NÒI|5693~2CHIỀNG NƠI|5694~2PHIÊNG CẰM|5695~2CHIỀNG DONG|5696~2CHIỀNG KHEO|5697~2CHIỀNG VE|5698~2CHIỀNG LƯƠNG|5699~2PHIÊNG PẰN|5700~2NÀ ỚT|5701~0TÀ HỘC|5702~2CHIỀNG SUNG|5703~2MƯỜNG BẰNG|5704~2CHIỀNG CHĂN|5705~2MƯỜNG CHANH|5706~2CHIỀNG BAN|5707~2CHIỀNG MUNG|5708~2MƯỜNG BON|5709~3HÁT LÓT|5710~2NÀ BÓ",
  "317": "5711~3PHÙ YÊN|5712~2TÂN LANG|5713~2GIA PHÙ|5714~2TƯỜNG PHÙ|5715~2HUY HẠ|5716~2HUY TÂN|5717~2MƯỜNG LANG|5718~2SUỐI BAU|5719~2HUY TƯỜNG|5720~2MƯỜNG DO|5721~2SẬP XA|5722~2TƯỜNG THƯỢNG|5723~2TƯỜNG TIẾN|5724~2TƯỜNG PHONG|5725~2TƯỜNG HẠ|5726~2KIM BON|5727~2MƯỜNG BANG|5728~2ĐÁ ĐỎ|5729~2TÂN PHONG|5730~2NAM PHONG|5731~2BẮC PHONG|5732~2MƯỜNG THẢI|5733~2MƯỜNG CƠI|5734~2QUANG HUY|5735~2HUY BẮC|5736~2HUY THƯỢNG|5737~2SUỐI TỌ",
  "318": "5738~3THUẬN CHÂU|5739~2TÔNG LỆNH|5740~2CHIỀNG LA|5741~2PHỎNG LẬP|5742~2CHIỀNG SƠ|5743~2CHIỀNG LY|5744~2CHIỀNG NGÀM|5745~2LIỆP TÈ|5746~2E TÒNG|5747~2PHOGNR LẬP|5748~2NOONG LAY|5749~2MƯỜNG KHIÊNG|5750~2MƯỜNG BÁM|5751~2LONG HẸ|5752~2CHIỀNG BÔM|5753~2THÔM MÒN|5754~2TÒNG CỌ|5755~2BÓ MƯỜI|5756~2CO MẠ|5757~2PÚNG CHA|5758~2CHIỀNG PẤC|5759~2NẬM LẦU|5760~2BON PHẶNG|5761~2CO TÒNG|5762~2MUỔI NỌI|5763~2PÁ LÔNG|5764~2BẢN LẦM|5765~2MƯỜNG É|5766~2PHỎNG LÁI|5767~2CHIỀNG PHA|5768~2PHỔNG LĂNG",
  "319": "5772~3MỘC CHÂU|5769~3NÔNG TRƯỜNG|5770~0TK CỜ ĐỎ|5771~0TK CHÈ ĐEN|5773~2CHIỀNG HẶC|5774~2ĐÔNG SANG|5775~2HUA PĂNG|5776~2CHIỀNG SƠN|5777~2TÂN HỢP|5778~2QUI HƯỚNG|5779~2NÀ MƯỜNG|5780~2TÀ LAI|5781~2CHIỀNG KHỪA|5782~2MƯỜNG SANG|5783~2PHIÊNG LUÔNG|5784~2LÓNG SẬP|5785~2CHÀ LỒNG|5786~2TÂN LẬP",
  "320": "5789~3YÊN CHÂU|5787~2CHIỀNG ĐÔNG|5788~2VIỀNG LÁNG|5790~2SẠP VẠT|5791~2PHIÊNG KHOÀI|5792~2CHIỀNG TƯƠNG|5793~2LÓNG PHIÊNG|5794~2CHIỀNG PẰN|5795~2CHIỀNG SÀNG|5796~2CHIỀNG HẶC|5797~2MƯỜNG LỰM|5798~2CHIỀNG ON|5799~2YÊN SƠN|5800~2CHIỀNG KHOI|5801~2TÚ NANG",
  "321": "5811~2VÂN HỒ|5802~2TÔ MÚA|5803~2LÓNG LUÔNG|5804~2SUỐI BÀNG|5805~2CHIỀNG KHOA|5806~2LIÊN HÒA|5807~2MƯỜNG MEN|5808~2MƯỜNG TÈ|5809~2XUÂN NHA|5810~2CHIỀNG XUÂN|5812~2TÂN XUÂN|5813~2CHIỀNG YÊN|5814~2QUANG MINH|5815~2SONG KHỦA",
  "322": "5816~3BẮC YÊN|5817~2PHIỀNG BAN|5818~2HANG CHÚ|5819~2XÍM VÀNG|5820~2TÀ XÙA|5821~2PẮC NGÀ|5822~2LÀNG CHẾU|5823~2CHIM VÀN|5824~2MƯỜNG KHOA|5825~2SONG PE|5826~2HỒNG NGÀI|5827~2TẠ KHOA|5828~2PHIÊNG KÔN|5829~2CHIỀNG SẠI|5830~2HUA NHÀN",
  "323": "5833~2SỐP CỘP|5831~2XAM KHA|5832~2PÚNG BÁNH|5834~2DỒM CANG|5835~2NẬM LẠNH|5836~2MƯỜNG LÈO|5837~2MƯỜNG VÀ|5838~2MƯỜNG LẠN",
  "324": "5849~3KỲ SƠN|5839~2CHUNG MINH|5840~2DÂN HẠ|5841~2HỢP THÀNH|5842~2HỢP THỊNH|5843~2PHÚC TIẾN|5844~2MÔNG HÓA|5845~2ĐỘC LẬP|5846~2PHÚ MINH|5847~2DÂN HÒA|5848~2YÊN QUANG|5850~2PHỐ NGỌC",
  "325": "5851~2ĐỒNG TÂM|5852~3THANH HÀ|5853~2PHÚ THÀNH|5854~2HƯNG THI|5855~2AN BÌNH|5856~2AN LẠC|5857~2LIÊN HÒA|5858~2THANH NÔNG|5859~2CỐ NGHĨA|5860~2PHÚ LÃO|5861~2LẠC LONG|5862~2QUAN DỤ|5863~2YÊN BỒNG|5864~2ĐỒNG MÔN|5865~2LIÊN HOÀN|5866~3CHI LÊ|5867~2KHOAN  DỤ",
  "326": "5872~2KIM BÔI|5868~3BO|5869~2THANH NÔNG|5870~2NẬT SƠN|5871~2KIM BÌNH|5873~2HỢP KIM|5874~2CUỐI HẠ|5875~2NUÔNG DĂM|5876~2TÚ SƠN|5877~2VĨNH ĐỒNG|5878~2THƯỢNG BÌ|5879~2TRUNG BÌ|5880~2LẬP CHIỆNG|5881~2ĐÚ SÁNG|5882~2BẮC SƠN|5883~2SƠN THỦY|5884~2VĨNH TIẾN|5885~2ĐÔNG BẮC|5886~2THƯỢNG TIẾN|5887~2HỢP ĐỒNG|5888~2HÙNG TIẾN|5889~2BÌNH SƠN|5890~2HẠ BÌ|5891~2KIM SƠN|5892~2KIM TIẾN|5893~2KIM TRUY|5894~2NAM THƯỢNG|5895~2SÀO BÁY|5896~2MI HÒA",
  "327": "5897~2PHONG PHÚ|5898~2TỬ NÊ|5899~2LŨNG  VÂN|5900~2BẮC SƠN|5901~2QUY MỸ|5902~2DO NHÂN|5903~2NAM SƠN|5904~2LỖ SƠN|5905~2NGỔ LUÔNG|5906~2GIA MÔ|5907~3MƯỜNG KHẾN|5908~2MẠN ĐỨC|5909~2NGÒI HOA|5910~2TRUNG HÒA|5911~2PHÚ VINH|5912~2PHÚ CƯỜNG|5913~2MỸ HÒA|5914~2QUY HẬU|5915~2QUYẾT CHIẾN|5916~2ĐỊCH GIÁO|5917~2TUÂN LỘ|5918~2NGỌC MỸ|5919~2THANH HỐI|5920~2ĐÔNG LAI",
  "328": "5921~3LƯƠNG SƠN|5922~2LÂM SƠN|5923~2HÒA SƠN|5924~2TÂN VINH|5925~2TRƯỜNG SƠN|5926~2CƯ YÊN|5927~2NHUẬN TRẠCH|5928~2LIÊN SƠN|5929~2TIẾN SƠN|5930~2TRUNG SƠN|5931~2THÀNH LẬP|5932~2TÂN THÀNH|5933~2CAO DƯƠNG|5934~2HỢP CHÂU|5935~2CAO THẮNG|5936~2LONG SƠN|5937~2THANH LƯƠNG|5938~2HỢP THANH|5939~2CAO RĂM|5940~2HỢP HÒA",
  "329": "5941~2ĐOÀN KẾT|5942~2YÊN LẠC|5943~2ĐA PHÚC|5944~2BẢO HIỆU|5945~2HỮU LỢI|5946~2LẠC SỸ|5947~2LẠC HƯNG|5948~2LẠC HƯƠNG|5949~2LẠC THỊNH|5950~2PHÚ LAI|5951~3HÀNG TRẠM|5952~2NGỌC LƯƠNG|5953~2YÊN TRỊ",
  "330": "5954~3CAO PHONG|5955~2NAM PHONG|5956~2BẮC PHONG|5957~2TÂY PHONG|5958~2BÌNH THANH|5959~2THUNG NAI|5960~2THU PHONG|5961~2XUÂN PHONG|5962~2DŨNG PHONG|5963~2YÊN THƯỢNG|5964~2ĐÔNG PHONG|5965~2TÂN PHONG|5966~2YÊN LẬP",
  "331": "5967~3ĐÀ BẮC|5968~2MƯỜNG CHIỀNG|5969~2TÂN PHEO|5970~2ĐỒNG RUỘNG|5971~2GIÁP ĐẮT|5972~2ĐỒNG NGHÊ|5973~2SUỐI NÁNH|5974~2MƯỜNG TUỔNG|5975~2ĐỒNG CHUM|5976~2ĐOÀN KẾT|5977~2TÂN MINH|5978~2TRUNG THÀNH|5979~2YÊN HÒA|5980~2CAO SƠN|5981~2TIỀN PHONG|5982~2VẦY NƯA|5983~2HÀO LÝ|5984~2TU LÝ|5985~2HIỀN LƯƠNG|5986~2TOÀN SƠN",
  "332": "5987~2PHÚ LƯỢNG|5988~2CHÍ ĐẠO|5989~2VĂN SƠN|5990~2TUÂN ĐẠO|5991~2MỸ THÀNH|5992~2NGỌC SƠN|5993~2TÂN MỸ|5994~3VỤ BẢN|5995~2PHÚC TUY|5996~2CHÍ THIỆN|5997~2THƯỢNG CỐC|5998~2QUÝ HÒA|5999~2MIỀN ĐỒI|6000~2TỰ DO|6001~2YÊN NGHIỆP|6002~2NHÂN NGHĨA|6003~2TÂN LẬP|6004~2VĂN NGHĨA|6005~2NGỌC LÂU|6006~2LIÊN VŨ|6007~2BÌNH HẺM|6008~2XUẤT HÓA|6009~2ÂN  NGHĨA|6010~2YÊN  PHÚ|6011~2VŨ LÂM|6012~2BÌNH CẢNG|6013~2BÌNH CHÂN|6014~2ĐỊNH CƯ|6015~2HƯƠNG NHƯỢNG",
  "333": "6017~2HÒA BÌNH|6016~1THÁI BÌNH|6018~2DÂN CHỦ|6019~2THÁI THỊNH|6020~1THỊNH LANG|6021~1TÂN THỊNH|6022~1TÂN HOÀ|6023~2YÊN MÔNG|6024~2SỬI NGÒI|6025~2THỐNG NHẤT|6026~2TRUNG MINH|6027~1HỮU NGHỊ|6028~1PHƯƠNG LÂM|6029~1CHĂM MÁT|6030~1ĐỒNG TIẾN",
  "334": "6035~3MAI CHÂU|6031~2PÙ BIN|6032~2HANG KIA|6033~2TÂN DÂN|6034~2NA PHÒM|6036~2TRƯỜNG XUÂN|6037~2CUN PHEO|6038~2BAO LA|6039~2PIỀNG VẾ|6040~2VẠN MAI|6041~2MAI HẠ|6042~2CHIỀNG CHÂU|6043~2NÀ MÈO|6044~2XĂM KHÒE|6045~2MAI HỊCH|6046~2NÀ  PHÒN|6047~2TÂN SƠN|6048~2TÂN MAI|6049~2BA KHAN|6050~2THUNG KHE|6051~2PÀ CÒ|6052~2TÒNG ĐẬU|6053~2ĐỒNG BẢNG|6054~2PHÚC SẠN|6055~2NOONG LUÔNG",
  "335": "6061~3NGỌC LẶC|6056~2MỸ TÂN|6057~2CAO NGỌC|6058~2NGỌC KHÊ|6059~2PHÙNG MINH|6060~2THÚY SƠN|6062~2THẠCH LẬP|6063~2PHÙNG GIÁO|6064~2NGUYỆT ẤN|6065~2PHÚC THỊNH|6066~2QUANG TRUNG|6067~2LAM SƠN|6068~2NGỌC TRUNG|6069~2NGỌC LIÊN|6070~2KIÊN THỌ|6071~2VÂN ÂM|6072~2ĐỒNG THỊNH|6073~2NGỌC SƠN|6074~2LỘC THỊNH|6075~2CAO THỊNH|6076~2MINH SƠN|6077~2MINH TIẾN",
  "336": "6078~3BÚT SƠN|6079~3TÀO XUYÊN|6080~2HOẰNG KIM|6081~2HOẰNG PHÚ|6082~2HOẰNG KHÊ|6083~2HOẰNG LÝ|6084~2HOẰNG THẮNG|6085~2HOẰNG THANH|6086~2HOẰNG LƯU|6087~2HOẰNG HỢP|6088~2HOẰNG CÁT|6089~2HOẰNG ANH|6090~2HOẰNG PHÚC|6091~2HOẰNG ĐẠI|6092~2HOẰNG ĐÔNG|6093~2HOẰNG PHƯỢNG|6094~2HOẰNG QUÝ|6095~2HOẰNG SƠN|6096~2HOẰNG XUYÊN|6097~2HOẰNG ĐẠT|6098~2HOẰNG ĐẠO|6099~2HOẰNG QUANG|6100~2HOẰNG THỊNH|6101~2HOẰNG THÁI|6102~2HOẰNG YẾN|6103~2HOẰNG TRƯỜNG|6104~2HOẰNG TIẾN|6105~2HOẰNG CHÂU|6106~2HOẰNG TRUNG|6107~2HOẰNG GIANG|6108~2HOẰNG ĐỨC|6109~2HOẰNG ĐỒNG|6110~2HOẰNG HÀ|6111~2HOẰNG HẢI|6112~2HOẰNG TÂN|6113~2HOẰNG TRẠCH|6114~2HOẰNG NGỌC|6115~2HOẰNG PHONG|6116~2HOẰNG QUỲ|6117~2HOẰNG TRINH|6118~2HOẰNG LƯƠNG|6119~2HOẰNG LONG|6120~2HOẰNG MINH|6121~2HOẰNG VINH|6122~2HOẰNG KHÁNH|6123~2HOẰNG XUÂN|6124~2HOẰNG PHỤ|6125~2HOẰNG DŨNG|6126~2HOẰNG LỘC",
  "337": "6127~3QUAN SƠN|6128~2TAM LƯ|6129~2TAM THANH|6130~2SƠN LƯ|6131~2SƠN ĐIỆN|6132~2TRUNG HẠ|6133~2MƯỜNG MÌN|6134~2SƠN HÀ|6135~2TRUNG THƯỢNG|6136~2TRUNG TIẾN|6137~2SƠN THỦY|6138~2NA MÈO|6139~2TRUNG XUÂN",
  "338": "6140~2THẠCH TƯỢNG|6141~2THÀNH MỸ|6142~2THẠCH SƠN|6143~2THẠCH ĐỒNG|6144~2THÀNH TÂM|6145~2THẠCH LÂM|6146~2THÀNH YÊN|6147~2THÀNH VÂN|6148~2THÀNH TIẾN|6149~2THÀNH THỌ|6150~2THÀNH AN|6151~2THÀNH KIM|6152~2THÀNH HƯNG|6153~2THẠCH QUẢNG|6154~2THÀNH CÔNG|6155~2THÀNH LONG|6156~3KIM TÂN|6157~2THÀNH MINH|6158~2THÀNH TÂN|6159~2THẠCH CẨM|6160~3VÂN DU|6161~2THÀNH VINH|6162~2THÀNH TRỰC|6163~2NGỌC TRẠO|6164~2KIM TÂN|6165~2THÀNH ĐỊNH|6166~2THẠCH LONG|17002~0THẠCH TÂN|18453~2THẠCH BÌNH",
  "339": "6174~3QUẢNG XƯƠNG|6167~2QUẢNG TÂN|6168~2QUẢNG YÊN|6169~2QUẢNG PHÚ|6170~2QUẢNG ĐÔNG|6171~2QUẢNG PHONG|6172~2QUẢNG THỊNH|6173~2QUẢNG LỢI|6175~2QUẢNG HÒA|6176~2QUẢNG NINH|6177~2QUẢNG LƯU|6178~2QUẢNG ĐỊNH|6179~2QUẢNG TÂM|6180~2QUẢNG LONG|6181~2QUẢNG PHÚC|6182~2QUẢNG VỌNG|6183~2QUẢNG NGỌC|6184~2QUẢNG TRƯƠNG|6185~2QUẢNG KHÊ|6186~2QUẢNG TRUNG|6187~2QUẢNG THÁI|6188~2QUẢNG BÌNH|6189~2QUẢNG ĐỨC|6190~2QUẢNG HẢI|6191~2QUẢNG CHÂU|6192~2QUẢNG LĨNH|6193~2QUẢNG HÙNG|6194~2QUẢNG CÁT|6195~2QUẢNG GIAO|6196~2QUẢNG THỌ|6197~2QUẢNG TRẠCH|6198~2QUẢNG VĂN|6199~2QUẢNG CHÍNH|6200~2QUẢNG NHAM|6201~2QUẢNG THẠCH|6202~2QUẢNG LỘC|6203~2QUẢNG HỢP|6204~2QUẢNG NHÂN|6205~2QUẢNG ĐẠI|6206~2QUẢNG VINH|6207~2QUẢNG MINH|6208~3LƯU VỆ|6209~3NGÃ BA MÔI",
  "340": "6210~3NGA SƠN|6211~2NGA NHÂN|6212~2NGA MỸ|6213~2NGA GIÁP|6214~2NGA THỦY|6215~2NGA YÊN|6216~2NGA HẢI|6217~2NGA AN|6218~2NGA TIẾN|6219~2NGA LIÊN|6220~2NGA THÀNH|6221~2NGA THÁI|6222~2NGA PHÚ|6223~2NGA ĐIỀN|6224~2NGA THIỆN|6225~2NGA TRƯỜNG|6226~2NGA THẮNG|6227~2NGA TRUNG|6228~2NGA BẠCH|6229~2NGA VĂN|6230~2NGA VỊNH|6231~2NGA LĨNH|6232~2NGA THẠCH|6233~2NGA TÂN|6234~2NGA THANH|6235~2NGA HƯNG|6236~2BA ĐÌNH|6237~2NGA VÂN",
  "341": "6238~3RỪNG THÔNG|6239~2ĐÔNG HƯNG|6240~2ĐÔNG TÂN|6241~2ĐÔNG THANH|6242~2ĐÔNG KHÊ|6243~2ĐÔNG LĨNH|6244~2ĐÔNG MINH|6245~2ĐÔNG PHÚ|6247~2ĐÔNG NAM|6248~2ĐÔNG YÊN|6249~2ĐÔNG THỊNH|6250~2ĐÔNG VĂN|6251~2ĐÔNG HÒA|6252~2ĐÔNG HOÀNG|6253~2ĐÔNG ANH|6254~2ĐÔNG XUÂN|6255~2ĐÔNG TIẾN|6256~2ĐÔNG NINH|6257~2CAO SƠN|6258~2TÂY SƠN|6259~2QUAN SƠN|6260~0LÀNG NGHỀ ĐÔNG HƯNG|6261~3NHỒI|6262~2ĐÔNG QUANG",
  "342": "6273~3VĨNH LỘC|6263~2VĨNH QUANG|6264~2VĨNH TIẾN|6265~2VĨNH LONG|6266~2VĨNH HƯNG|6267~2VĨNH PHÚC|6268~2VĨNH HÒA|6269~2VĨNH MINH|6270~2VĨNH HÙNG|6271~2VĨNH TÂN|6272~2VĨNH AN|6274~2VĨNH YÊN|6275~2VĨNH THÀNH|6276~2VĨNH NINH|6277~2VĨNH THỊNH|6278~2VĨNH KHANG",
  "343": "6279~3LANG CHÁNH|6280~2LÂM PHÚ|6281~2YÊN KHƯƠNG|6282~2GIAO THIỆN|6283~2ĐỒNG LƯƠNG|6284~2TAM VĂN|6285~2GIAO AN|6286~2TAN PHÚC|6287~2QUANG HIẾN|6288~2YÊN THẮNG|6289~2CHÍ NANG",
  "344": "24603~2ĐÔNG VINH|6290~1BA ĐÌNH|6291~1NGỌC TRẠO|6292~1ĐÔNG VỆ|6293~1PHÚ SƠN|6294~1TÂN SƠN|6295~1ĐIỆN BIÊN|6296~2ĐÔNG CƯƠNG|6297~1ĐÔNG SƠN|6298~1LAM SƠN|6299~1TRƯỜNG THI|6300~1ĐÔNG THỌ|6301~1HÀM RỒNG|6302~1NAM NGẠN|6303~2QUẢNG HƯNG|6304~2QUẢNG THẮNG|6305~2ĐÔNG HƯƠNG|6306~2ĐÔNG HẢI|6307~2QUẢNG THÀNH|17000~1AN HOẠCH|13327~2QUẢNG CÁT|14348~2QUẢNG TÂM|18469~1QUẢNG CHÂU|18468~1TÀO XUYÊN|19466~2THIỆU DƯƠNG",
  "345": "6334~3TRIỆU SƠN|6308~2HỢP TIẾN|6309~2MINH SƠN|6310~2DÂN LỰC|6311~2TIẾN NÔNG|6312~2KHUYẾN NÔNG|6313~2THỌ THẾ|6314~2THỌ DÂN|6315~2THỌ TÂN|6316~2HỢP LÝ|6317~2HỢP THẮNG|6318~2THÁI HÒA|6319~2ĐỒNG THẮNG|6320~2BÌNH SƠN|6321~2THỌ SƠN|6322~2THỌ NGỌC|6323~2THỌ TIẾN|6324~2TRIỆU THÀNH|6325~2HỢP THÀNH|6326~2AN NÔNG|6327~2VĂN SƠN|6328~2TÂN NINH|6329~2NÔNG TRƯỜNG|6330~2ĐỒNG LỢI|6331~2ĐỒNG TIẾN|6332~2MINH CHÂU|6333~2DÂN LÝ|6335~2PHỐ THIỀU|6336~3GIẮT|6337~2THỌ CƯỜNG|6338~2THỌ BÌNH|6339~2XUÂN THỌ|6340~2XUÂN LỘC|6341~2THỌ VỰC|6342~2XUÂN THỊNH|6343~2THỌ PHÚ|6344~2MINH DÂN|6345~2DÂN QUYỀN",
  "346": "6373~3NÔNG CỐNG|6346~2HOÀNG GIANG|6347~2TẾ ĐỘ|6348~2TRUNG CHÍNH|6349~2MINH NGHĨA|6350~2TRƯỜNG SƠN|6351~2THĂNG BÌNH|6352~2TƯỢNG LĨNH|6353~2MINH THỌ|6354~2MINH KHÔI|6355~2VẠN THIỆN|6356~2VẠN THẮNG|6357~2TRUNG THÀNH|6358~2CÔNG LIÊM|6359~2TRƯỜNG GIANG|6360~2TRƯỜNG MINH|6361~2THĂNG THỌ|6362~2TƯỢNG SƠN|6363~2KHANG NINH|6364~2TẾ NÔNG|6365~2VẠN HÒA|6366~2TƯỢNG VĂN|6367~2THĂNG LONG|6368~2THƯỢNG SƠN|6369~2HOÀNG SƠN|6370~2TÂN KHANG|6371~2TRUNG Ý|6372~2TẾ LỢI|6374~2TÂN PHÚC|6375~2TÂN THỌ|6376~2TẾ TÂN|6377~2TẾ THẮNG|6378~2TRƯỜNG TRUNG|6379~2CÔNG CHÍNH|6380~2CÔNG BÌNH|6381~2YÊN MỸ",
  "347": "6392~3TĨNH GIA|6382~2HẢI AN|6383~2NIMH HẢI|6384~2HẢI NINH|6385~2TRÚC LÂM|6386~2XUÂN LÂM|6387~3CÒNG|6388~2TÙNG LÂM|6389~2HÙNG SƠN|6390~2TÂN DÂN|6391~2NGHI SƠN|6393~2HẢI THƯỢNG|6394~2ĐỊNH HẢI|6395~2HẢI NHÂN|6396~2NGUYÊN BÌNH|6397~2PHÚ SƠN|6398~2PHÚ LÂM|6399~2TÂN TRƯỜNG|6400~2TRƯỜNG LÂM|6401~2MAI LÂM|6402~2HẢI HÀ|6403~2HẢI YẾN|6404~2HẢI BÌNH|6405~2TĨNH HẢI|6406~2THANH THỦY|6407~2HẢI CHÂU|6408~2THANH SƠN|6409~2ANH SƠN|6410~2CÁC SƠN|6411~2NGỌC LĨNH|6412~2TRIỆU DƯƠNG|6413~2HẢI LĨNH|6414~2HẢI HÒA|6415~2BÌNH MINH|6416~2HẢI THANH",
  "348": "6419~3THƯỜNG XUÂN|6417~2THỌ THANH|6418~2NGỌC PHỤNG|6420~2LƯƠNG SƠN|6421~2BÁT MỌT|6422~0YÊN NHÂN|6423~2XUÂN CHINH|6424~2LUẬN THÀNH|6425~2LUẬN KHÊ|6426~2XUÂN CẨM|6427~3KHE HẠ|6428~2XUÂN CAO|6429~2XUÂN LIÊN|6430~2VẠN XUÂN|6431~2XUÂN LẸ|6432~2XUÂN THẮNG|6433~2XUÂN LỘC|6434~2TÂN THÀNH|6435~2XUÂN DƯƠNG",
  "349": "6436~2CÁT VÂN|6437~2BÌNH LƯƠNG|6438~2THANH PHONG|6439~2YÊN LỄ|6440~3BÃI TRÀNH|6441~2XUÂN HÒA|6442~2THANH XUÂN|6443~2THANH LÂM|6444~2CÁT TÂN|6445~3YÊN CÁT|6446~2XUÂN BÌNH|6447~2THANH HÒA|6448~2THANH QUÂN|6449~2THANH SƠN|6450~2HÓA QUỲ|6451~2XUÂN QUỲ|6452~2TÂN BÌNH|6453~2THƯỢNG NINH",
  "350": "6456~3HẬU LỘC|6457~2CHÂU LỘC|6458~2ĐA LỘC|6459~2TRIỆU LỘC|6460~2THÀNH LỘC|6461~2TIÊN LỘC|6462~2ĐỒNG LỘC|6463~2PHONG LỘC|6464~2CẦU LỘC|6465~2LỘC SƠN|6466~2LỘC TÂN|6467~2THỊNH LỘC|6468~2LIÊN LỘC|6469~2TUY LỘC|6470~2QUANG LỘC|6471~2THUẦN LỘC|6472~2VĂN LỘC|6473~2HÒA LỘC|6474~2XUÂN LỘC|6475~2HẢI LỘC|6476~2MINH LỘC|6477~2NGƯ LỘC|6478~2MỸ LỘC|6479~2ĐẠI LỘC|6454~2HƯNG LỘC|6455~2PHÚ LỘC|18466~2HOA LỘC",
  "351": "6480~2YÊN THỌ|6481~2HẢI VÂN|6482~2PHÚC ĐƯỜNG|6483~2THANH TÂN|6484~2HẢI LONG|6485~2XUÂN KHANG|6486~3BẾN SUNG|6487~2BÌNH THUẬN|6488~2CÁN KHÊ|6489~2XUÂN DU|6490~2PHƯỢNG NGHI|6491~2PHÚ NHUẬN|6492~2MẬU LÂM|6493~2XUÂN THÁI|6494~2THANH KỲ|6495~2XUÂN THỌ|6496~2XUÂN PHÚC|18457~2YÊN LẠC",
  "352": "18452~3HÀ TRUNG|6497~3ĐÒ LÈN|6498~2HÀ TÂN|6499~2HÀ NGỌC|6500~2HÀ LÂM|6501~2HÀ THÁI|6502~2HÀ PHÚ|6503~2HÀ PHONG|6504~2HÀ NINH|6505~2HÀ HẢI|6506~2HÀ TOẠI|6507~2HÀ THANH|6508~2HÀ CHÂU|6509~2HÀ VÂN|6510~2HÀ DƯƠNG|6511~2HÀ ĐÔNG|6512~2HÀ BÌNH|6513~2HÀ LAI|6514~2HÀ VINH|6515~2HÀ YÊN|6516~2HÀ SƠN|6517~2HÀ LONG|6518~2HÀ GIANG|6519~2HÀ BẮC|6520~2HÀ TIẾN|6521~2HÀ LĨNH",
  "353": "6526~3MƯỜNG LÁT|6522~2TÉN TẰN|6523~2NHI SƠN|6524~2MƯỜNG LÝ|6525~2TRUNG LÝ|6527~2QUANG CHIỂU|6528~2MƯỜNG CHANH|6529~2PHÙ NHI|6530~2TAM TRUNG",
  "354": "6536~3CẨM THỦY|6531~2CẨM THỦY|6532~2CẨM LIÊN|6533~2CẨM CHÂU|6534~2PHÚC DO|6535~2CẨM SƠN|6537~2CẨM QUÝ|6538~2CẨM THÀNH|6539~2CẨM LƯƠNG|6540~2CẨM GIANG|6541~2CẨM THẠCH|6542~2CẨM BÌNH|6543~2CẨM TÚ|6544~2CẨM NGỌC|6545~2CẨM TÂN|6546~2CẨM VÂN|6547~2CẨM LONG|6548~2CẨM YÊN|6549~2CẨM PHÚ|6550~2CẨM PHONG|16989~2CẨM TÂM",
  "355": "6563~3QUAN HÓA|6551~2HIỀN KIỆT|6552~2PHÚ SƠN|6553~2THANH XUÂN|6554~2NAM XUÂN|6555~0XUÂN PHÚ|6556~2TRUNG SƠN|6557~2THÀNH SƠN|6558~2NAM ĐỘNG|6559~2NAM TIẾN|6560~2PHÚ XUÂN|6561~2HỒI XUÂN|6562~2HIỀN TRUNG|6564~2PHÚ LỆ|6565~2THIÊN PHỦ|6566~2PHÚ NGHIÊM|6567~2TRUNG THÀNH|6568~2PHÚ THANH",
  "356": "6569~2ÁI THƯỢNG|6570~3CÀNH NÀNG|6571~2LŨNG CAO|6572~2HẠ TRUNG|6573~2LƯỢNG NỘI|6574~2KỲ TÂN|6575~2VĂN NHO|6576~2ĐIỀN THƯỢNG|6577~2ĐIỀN HẠ|6578~2ĐIỀN TRUNG|6579~2LƯƠNG TRUNG|6580~2ĐIỀN QUANG|6581~2ĐIỀN LƯ|6582~2TÂN LẬP|6583~2LÂM SA|6584~2LŨNG NIÊM|6585~2THANH LÂM|6586~2CỔ LŨNG|6587~2BAN CÔNG|6588~2LƯƠNG NGOẠI|6589~2THIẾT KẾ|6590~2ĐỒNG TÂM|6591~2THÀNH SƠN|12304~2QUẢNG CHÂU|18451~2THIẾT ỐNG",
  "357": "6592~2YÊN PHONG|6593~2YÊN THÁI|6594~2YÊN NINH|6595~2ĐỊNH TƯỜNG|6596~2ĐỊNH LONG|6597~2ĐỊNH HƯNG|6598~2ĐỊNH BÌNH|6599~2ĐỊNH TĂNG|6600~2ĐỊNH HÒA|6601~2YÊN TRƯỜNG|6602~3NÔNG TRƯỜNG THỐNG NHẤT|6603~2ĐỊNH THÀNH|6604~2ĐỊNH CÔNG|6605~2ĐỊNH TIẾN|6606~2ĐỊNH TÂN|6607~3QUÁN LÀO|6608~2YÊN LÂM|6609~2YÊN TÂM|6610~2YÊN GIANG|6611~2YÊN PHÚ|6612~2YÊN BÁI|6613~2YÊN TRUNG|6614~2YÊN LÝ|6615~2YÊN THỌ|6616~2QUÝ LỘC|6617~2YÊN HÙNG|6618~2YÊN THỊNH|6619~2YÊN LẠC|6620~2ĐỊNH LIÊN|6621~2ĐỊNH HẢI",
  "358": "6623~3THỌ XUÂN|6622~3SAO VÀNG|6624~2XUÂN TÂN|6625~3LAM SƠN|6626~2XUÂN CHÂU|6627~2XUÂN TÍN|6628~2THỌ THẮNG|6629~2XUÂN LẬP|6630~2XUÂN HÒA|6631~2XUÂN PHONG|6632~2NAM GIANG|6633~2XUÂN QUANG|6634~2XUÂN THIÊN|6635~2XUÂN LÂM|6636~2THỌ XƯƠNG|6637~2XUÂN KHÁNH|6638~2THỌ TRƯỜNG|6639~2THỌ NGUYÊN|6640~2XUÂN THÀNH|6641~2HẠNH PHÚC|6642~2BẮC LƯƠNG|6643~2THỌ LẬP|6644~2THỌ HẢI|6645~2XUÂN GIANG|6646~2THỌ DIÊN|6647~2XUÂN PHÚ|6648~2XUÂN THẮNG|6649~2XUÂN LAM|6650~2THỌ MINH|6651~2QUẢNG PHÚ|6652~2PHÚ YÊN|6653~2XUÂN LAI|6654~2XUÂN MINH|6655~2THỌ LỘC|6656~2XUÂN HƯNG|6657~2XUÂN SƠN|6658~2XUÂN BÁI|6659~2XUÂN VINH|6660~2XUÂN TRƯỜNG|6661~2XUÂN YÊN|18455~2TÂY HỒ|18456~2TÂY HỒ|18454~2THỌ LÂM",
  "359": "6662~1NGỌC TRẠO|6663~1LAM SƠN|6664~1BẮC SƠN|6665~1BA ĐÌNH|6666~1QUANG TRUNG|6667~2HÀ LAN|6668~1ĐÔNG SƠN|6669~1PHÚ SƠN",
  "360": "6670~2THIỆU CHÍNH|6671~2THIỆU VIÊN|6672~2THIỆU LONG|6673~2THIỆU PHÚC|6674~2THIỆU TRUNG|6675~2THIỆU TIẾN|6676~2THIỆU CÔNG|6677~3VẠN HÀ|6678~2THIỆU NGỌC|6679~2THIỆU TOÁN|6680~2THIỆU THÀNH|6681~2THIỆU VŨ|6682~2THIỆU PHÚ|6683~2THIỆU NGUYÊN|6684~2THIỆU DUY|6685~2THIỆU KHÁNH|6686~2THIỆU GIAO|6687~2THIỆU ĐÔ|6688~2THIỆU CHÂU|6689~2THIỆU LÝ|6690~2THIỆU HÒA|6691~2THIỆU GIANG|6692~2THIỆU VÂN|6693~2THIỆU DƯƠNG|6694~2THIỆU TÂN|6695~2THIỆU MINH|6696~2THIỆU TÂM|6697~2THIỆU VẬN|6698~2THIỆU QUANG|6699~2THIỆU HỢP|6700~2THIỆU THỊNH|6701~0PHỐ HẬU HIỀN|6702~0NGÃ BA CHÈ",
  "361": "6703~1BẮC SƠN|6704~1TRUNG SƠN|6705~1TRƯỜNG SƠN|6706~2QUẢNG CƯ|6707~2QUẢNG TIẾN|12305~1QUẢNG CHÂU|16394~1QUẢNG THỌ",
  "362": "6720~3ANH SƠN|6708~2CẨM SƠN|6709~2CAO SƠN|6710~2HOA SƠN|6711~2HỘI SƠN|6712~2HÙNG SƠN|6713~2LĨNH SƠN|6714~2TAM SƠN|6715~2TÀO SƠN|6716~2THẠCH SƠN|6717~2THÀNH SƠN|6718~2THỌ SƠN|6719~2TƯỜNG SƠN|6721~2ĐỈNH SƠN|6722~2ĐỨC SƠN|6723~2KHAI SƠN|6724~2LẠNG SƠN|6725~2LONG SƠN|6726~2PHÚC SƠN|6727~2VĨNH SƠN|6728~2BÌNH SƠN|6729~2YÊN KHÊ|6730~2MÔN SƠN|6731~2LỤC DẠ|6732~2TIẾN THÀNH|6733~0XUÂN THÀNH|18449~2HƯNG YÊN BẮC",
  "363": "6741~3CON CUÔNG|6734~2MÔN SƠN|6735~2BỒNG KHÊ|6736~2CHÂU KHÊ|6737~2CAM LÂM|6738~2LẠNG KHÊ|6739~2BÌNH CHUẨN|6740~2MẬU ĐỨC|6742~2ĐÔN PHỤC|6743~2THẠCH NGÀN|6744~2LỤC DẠ|6745~2YÊN KHÊ|6746~2CHI KHÊ",
  "364": "6747~3HƯNG NGUYÊN|6748~2HƯNG TÂY|6749~2HƯNG ĐẠO|6750~2HƯNG MỸ|6751~2HƯNG THỊNH|6752~2HƯNG LĨNH|6753~2HƯNG THÔNG|6754~2HƯNG TÂN|6755~2HƯNG LỢI|6756~2HƯNG THẮNG|6757~2HƯNG PHÚC|6758~2HƯNG LONG|6759~2HƯNG TIẾN|6760~2HƯNG XÁ|6761~2HƯNG CHÂU|6762~2HƯNG XUÂN|6763~2HƯNG NHÂN|6764~2HƯNG PHÚ|6765~2HƯNG KHÁNH|6766~2HƯNG LAM|6767~2HƯNG TRUNG|6768~2HƯNG YÊN|6769~2HƯNG CHÍNH|18450~2HƯNG YÊN BẮC",
  "365": "6770~2NGHĨA HÒA|6771~2TÂY HIẾU|6772~1QUANG PHONG|6773~1QUANG TIẾN|6774~1LONG SƠN|6775~2NGHĨA TIẾN|6776~2NGHĨA MỸ|6777~2NGHĨA THUẬN|6778~2ĐÔNG HIẾU|6779~1HÒA HIẾU",
  "366": "6785~3QUỲ CHÂU|6780~2CHÂU BÍNH|6781~2CHÂU HỘI|6782~2CHÂU NGA|6783~2CHÂU THẮNG|6784~2CHÂU HOÀN|6786~2CHÂU THUẬN|6787~2CHÂU TIẾN|6788~2CHÂU HẠNH|6789~2DIÊN LÃM|6790~2CHÂU PHONG|6791~2CHÂU BÌNH",
  "367": "6792~1NGHI THỦY|6793~1THU THỦY|6794~1NGHI HƯƠNG|6795~1NGHI TÂN|6796~1NGHI THU|6797~1NGHI HẢI|6798~1NGHI HÒA",
  "368": "6799~2TAM QUANG|6800~2LƯU KIỀN|6801~2LƯỢNG MINH|6802~2TAM ĐÌNH|6803~3HÒA BÌNH|6804~2TAM THÁI|6805~2TAM HỢP|6806~2MAI SƠN|6807~2YÊN TĨNH|6808~2YÊN THẮNG|6809~2NGA MY|6810~2LUÂN MAI|6811~2HỮU DƯƠNG|6812~2KIM ĐA|6813~2KIM TIẾN|6814~2THẠCH GIÁM|6815~2XÁ LƯỢNG|6816~2HỮU KHUÔNG|6817~2NHÔN MAI|6818~2YÊN NA|6819~2YÊN HÒA|6820~2XIÊNG MY",
  "369": "6821~2QUẾ SƠN|6822~2TRI LỄ|6823~2THÔNG THỤ|6824~2TIỀN PHONG|6825~2CẮM MUỘN|6826~2MƯỜNG NOỌC|6827~2HẠNH DỊCH|6828~2CHÂU THÔN|6829~2CHÂU KIM|6830~3KIM SƠN|6831~2NẬM GIẢI|6832~2NẬM NHOÓNG|6833~2QUANG PHONG|6834~2ĐỒNG VĂN",
  "370": "6835~3TÂN KỲ|6836~2KỲ SƠN|6837~2KỲ TÂN|6838~2NGHĨA DŨNG|6839~2NGHĨA HÀNH|6840~2TÂN LONG|6841~2TÂN HƯƠNG|6842~2ĐỒNG VĂN|6843~2GIAI XUÂN|6844~2HƯƠNG SƠN|6845~2NGHĨA BÌNH|6846~2NGHĨA ĐỒNG|6847~2NGHĨA HOÀN|6848~2NGHĨA HỢP|6849~2NGHĨA PHÚC|6850~2NGHĨA THÁI|6851~2PHÚ SƠN|6852~2TÂN AN|6853~2TÂN HỢP|6854~2TÂN PHÚ|6855~2TÂN XUÂN|6856~2TIÊN KỲ",
  "371": "6857~3DIỄN CHÂU|6858~2DIỄN NGỌC|6859~2DIỄN BÍCH|6860~2DIỄN KỶ|6861~2DIỄN PHÚC|6862~2DIỄN THỊNH|6863~2DIỄN THÀNH|6864~2DIỄN HỒNG|6865~2DIỄN XUÂN|6866~2DIỄN HOA|6867~2DIỄN HẠNH|6868~2DIỄN THÁP|6869~2DIỄN ĐỒNG|6870~2DIỄN AN|6871~2DIỄN ĐOÀI|6872~2DIỄN HOÀNG|6873~2DIỄN LÂM|6874~2DIỄN LIÊN|6875~2DIỄN LỘC|6876~2DIỄN LỢI|6877~2DIỄN MINH|6878~2DIỄN MỸ|6879~2DIỄN THỌ|6880~2DIỄN TRUNG|6881~2DIỄN TRƯỜNG|6882~2DIỄN CÁT|6883~2DIỄN PHÚ|6884~2DIỄN YÊN|6885~2DIỄN QUẢNG|6886~2DIỄN NGUYÊN|6887~2DIỄN PHONG|6888~2DIỄN HÙNG|6889~2YÊN LÝ|6890~2DIỄN BÌNH|6891~2DIỄN TÂN|6892~2DIỄN THẮNG|6893~2DIỄN VẠN|6894~2DIỄN THÁI|6895~2DIỄN KIM|6896~2DIỄN HẢI",
  "372": "6897~3MƯỜNG XÉN|6898~2KENG ĐU|6899~2ĐOỌC MẠY|6900~2MƯỜNG LỐNG|6901~2PHÀ ĐÁNH|6902~2BẢO NAM|6903~2HUỒI TỤ|6904~2BẢO THẮNG|6905~2HỮU LẬP|6906~2HỮU KIỆM|6907~2MƯỜNG ẢI|6908~2TÂY SƠN|6909~2NA NGOI|6910~2NẬM CÀN|6911~2NẬM CẮN|6912~2NA LOI|6913~2MỸ LÝ|6914~2BẮC LÝ|6915~2TÀ CẠ|6916~2CHIÊU LƯU|6917~2MƯỜNG TÍP",
  "373": "6918~1CỬA NAM|6919~1ĐỘI CUNG|6920~1ĐÔNG VĨNH|6921~1HÀ HUY TẬP|6922~1HỒNG SƠN|6923~1HƯNG BÌNH|6924~2HƯNG ĐÔNG|6925~1HƯNG DŨNG|6926~2HƯNG HOÀ|6927~2HƯNG LỘC|6928~1HƯNG PHÚC|6929~1LÊ LỢI|6930~1TRƯỜNG THI|6931~1VINH TÂN|6932~2NGHI ÂN|6933~2NGHI PHÚ|6934~2NGHI ĐỨC|6935~2NGHI LIÊN|6936~1BẾN THỦY|6937~1LÊ MAO|6938~2NGHI KIM|6939~1QUÁN BÀU|6940~1QUANG TRUNG|6941~1TRUNG ĐÔ|6942~2HƯNG CHÍNH",
  "374": "6943~3ĐÔ LƯƠNG|6944~2TÂN SƠN|6945~2THỊNH SƠN|6946~2HÒA SƠN|6947~2THÁI SƠN|6948~2XUÂN SƠN|6949~2MINH SƠN|6950~2LẠC SƠN|6951~2QUANG SƠN|6952~2ĐÀ SƠN|6953~2VĂN SƠN|6954~2LƯU SƠN|6955~2HIẾN SƠN|6956~2LIÊN SƠN|6957~2BẮC SƠN|6958~2BÀI SƠN|6959~2BỒI SƠN|6960~2ĐÔNG SƠN|6961~2ĐẠI SƠN|6962~2HỒNG SƠN|6963~2LAM SƠN|6964~2MỸ SƠN|6965~2THƯỢNG SƠN|6966~2NAM SƠN|6967~2NGỌC SƠN|6968~2ĐẶNG SƠN|6969~2TRUNG SƠN|6970~2GIANG SƠN TÂY|6971~2GIANG SƠN ĐÔNG|6972~2NHÂN SƠN|6973~2THUẬN SƠN|6974~2TRÀNG SƠN|6975~2TRÙ SƠN|6976~2YÊN SƠN|6977~2GIANG SƠN",
  "375": "6978~2NGHI KHÁNH|6979~2NGHI PHONG|6980~2NGHI LONG|6981~2NGHI PHƯƠNG|6982~2NGHI THẠCH|6983~2NGHI THỊNH|6984~2NGHI THUẬN|6985~2NGHI TRUNG|6986~2NGHI TRƯỜNG|6987~2NGHI XÁ|6988~2NGHI YÊN|6989~2NGHI CÔNG BẮC|6990~2NGHI CÔNG NAM|6991~2NGHI ĐỒNG|6992~2NGHI HƯNG|6993~2NGHI KIỀU|6994~2NGHI LÂM|6995~2NGHI MỸ|6996~2NGHI QUANG|6997~2NGHI THÁI|6998~2NGHI THIẾT|6999~2NGHI VẠN|7000~2NGHI TIẾN|7001~2NGHI VĂN|7002~2NGHI XUÂN|7003~2PHÚC THỌ|7004~3QUÁN HÀNH|7005~2NGHI DIÊN|7006~2NGHI HOA|7007~2NGHI HỢP|7008~2NGHI ÂN(QL46)|7009~2NGHI KIM|7010~2NGHI ĐỨC|7011~2NGHI LIÊN|7012~2NGHI KHÁNH",
  "376": "7032~3YÊN THÀNH|7013~2KHÁNH THÀNH|7014~2LONG THÀNH|7015~2TĂNG THÀNH|7016~2TRUNG THÀNH|7017~2BẢO THÀNH|7018~2CÔNG THÀNH|7019~2ĐẠI THÀNH|7020~2ĐÔ THÀNH|7021~2ĐỒNG THÀNH|7022~2ĐỨC THÀNH|7023~2HẬU THÀNH|7024~2HỒNG THÀNH|7025~2KIM THÀNH|7026~2LĂNG THÀNH|7027~2LIÊN THÀNH|7028~2LÝ THÀNH|7029~2MÃ THÀNH|7030~2MINH THÀNH|7031~2BẮC THÀNH|7033~2HOA THÀNH|7034~2HỢP THÀNH|7035~2MỸ THÀNH|7036~2NAM THÀNH|7037~2NHÂN THÀNH|7038~2PHÚ THÀNH|7039~2PHÚC THÀNH|7040~2QUANG THÀNH|7041~2SƠN THÀNH|7042~2TÂN THÀNH|7043~2TÂY THÀNH|7044~2THỊNH THÀNH|7045~2THỌ THÀNH|7046~2VĂN THÀNH|7047~2VIÊN THÀNH|7048~2VĨNH THÀNH|7049~2HÙNG THÀNH|7050~2XUÂN THÀNH|7051~2TIẾN THÀNH",
  "377": "7052~2QUỲNH LẬP|7053~2QUỲNH LIÊN|7054~2QUỲNH LỘC|7055~2QUỲNH LONG|7056~2QUỲNH LƯƠNG|7057~2QUỲNH MINH|7058~3HOÀNG MAI|7059~2AN HÒA|7060~2QUỲNH BÁ|7061~2QUỲNH DĨ|7062~2QUỲNH DIỆN|7063~2QUỲNH GIANG|7064~2QUỲNH HẬU|7065~2QUỲNH HOA|7066~2QUỲNH HỒNG|7067~2QUỲNH HƯNG|7068~2QUỲNH LÂM|7069~2QUỲNH THẠCH|7070~2QUỲNH VĂN|7071~2QUỲNH YÊN|7072~2SƠN HÀI|7073~3CẦU GIÁT|7074~2MAI HÙNG|7075~2NGỌC SƠN|7076~2QUỲNH BẢNG|7077~2QUỲNH CHÂU|7078~2QUỲNH ĐÔI|7079~2TÂN SƠN|7080~2TÂN THẮNG|7081~2TIẾN THỦY|7082~2QUỲNH VĨNH|7083~2QUỲNH XUÂN|7084~2QUỲNH MỸ|7085~2QUỲNH NGHĨA|7086~2QUỲNH NGỌC|7087~2QUỲNH PHƯƠNG|7088~2QUỲNH TAM|7089~2QUỲNH TÂN|7090~2QUỲNH THẮNG|7091~2QUỲNH THANH|7092~2QUỲNH THIỆN|7093~2QUỲNH THỌ|7094~2QUỲNH THUẬN|7095~2QUỲNH TRANG|7096~2QUỲNH VINH|7097~2QUỲNH THƯƠNG",
  "378": "7100~3NAM ĐÀN|7098~2KIM LIÊN|7099~2NAM GIANG|7101~2XUÂN HÒA|7102~2NAM HƯNG|7103~2XUÂN LÂM|7104~2NAM LĨNH|7105~2HỒNG LONG|7106~2HÙNG TIẾN|7107~2KHÁNH SƠN|7108~2NAM ANH|7109~2NAM CÁT|7110~2VÂN DIÊN|7111~2NAM KIM|7112~2NAM THÁI|7113~2NAM THANH|7114~2NAM LỘC|7115~2NAM THƯỢNG|7116~2NAM TRUNG|7117~2NAM PHÚC|7118~2NAM NGHĨA|7119~2NAM XUÂN|7120~2NAM CƯỜNG|7121~2NAM TÂN|7122~2NAM MỸ",
  "379": "7149~3NGHĨA ĐÀN|7123~2NGHĨA AN|7124~2NGHĨA ĐỨC|7125~2NGHĨA HIẾU|7126~2NGHĨA HỒNG|7127~2NGHĨA HƯNG|7128~2NGHĨA KHÁNH|7129~2NGHĨA LIÊN|7130~2NGHĨA LỢI|7131~2NGHĨA LONG|7132~2NGHĨA MAI|7133~2NGHĨA MINH|7134~2NGHĨA QUANG|7135~2NGHĨA TÂN|7136~2NGHĨA THẮNG|7137~2NGHĨA XUÂN|7138~2NGHĨA YÊN|7139~2NGHĨA HỘI|7140~2NGHĨA BÌNH|7141~2NGHĨA PHÚ|7142~2NGHĨA THỌ|7143~2NGHĨA LẠC|7144~2NGHĨA TRUNG|7145~2NGHĨA SƠN|7146~2NGHĨA LÂM|7147~2NGHĨA LỘC|7148~2NGHĨA THỊNH",
  "380": "7150~1QUỲNH DỊ|7151~1QUỲNH THIỆN|7152~1MAI HÙNG|7153~1QUỲNH PHƯƠNG|7154~1QUỲNH XUÂN|7155~2QUỲNH LẬP|7156~2QUỲNH TRANG|7157~2QUỲNH LỘC|7158~2QUỲNH VINH|7159~2QUỲNH LIÊN",
  "381": "7177~2THANH CHƯƠNG|7160~2THANH XUÂN|7161~2THANH YÊN|7162~0XUÂN TƯỜNG|7163~2THANH ĐỒNG|7164~2THANH LĨNH|7165~2THANH TIÊN|7166~2THANH HƯNG|7167~2THANH VĂN|7168~2ĐỒNG VĂN|7169~2THANH NGỌC|7170~2NGỌC SƠN|7171~2THANH HƯƠNG|7172~2THANH THỊNH|7173~2CÁT VĂN|7174~2PHONG THỊNH|7175~2THANH AN|7176~2THANH CHI|7178~2THANH ĐỨC|7179~2THANH DƯƠNG|7180~2THANH GIANG|7181~2THANH GIAO|7182~2THANH HÀ|7183~2THANH KHAI|7184~2THANH KHÊ|7185~2THANH LÂM|7186~2THANH LIÊN|7187~2THANH PHONG|7188~2THANH LƯƠNG|7189~2THANH MAI|7190~2THANH MỸ|7191~2THANH NHO|7192~2THANH THỦY|7193~2THANH TÙNG|7194~3DÙNG|7195~2THANH TƯỜNG|7196~2HẠNH LÂM|7197~2HƯNG DŨNG|7198~2THANH LONG|7199~2THANH SƠN|7200~2THANH HÒA|7201~2VÕ LIỆT|7202~2NGỌC LÂM",
  "382": "7203~3QUỲ HỢP|7204~2CHÂU CƯỜNG|7205~2CHÂU ĐÌNH|7206~2CHÂU LỘC|7207~2CHÂU LÝ|7208~2CHÂU QUANG|7209~2CHÂU THÁI|7210~2ĐỒNG HỢP|7211~2TAM HỢP|7212~2THỌ HỢP|7213~2BẮC SƠN|7214~2CHÂU HỒNG|7215~2CHÂU THÀNH|7216~2CHÂU TIẾN|7217~2HẠ SƠN|7218~2LIÊN HỢP|7219~2MINH HỢP|7220~2NAM SƠN|7221~2NGHĨA XUÂN|7222~2VĂN LỢI|7223~2YÊN HỢP",
  "383": "7224~3VŨ QUANG|7225~2ĐỨC LIÊN|7226~2ĐỨC HƯƠNG|7227~2ĐỨC BỒNG|7228~2ĐỨC LĨNH|7229~2ĐỨC GIANG|7230~2ÂN PHÚ|7231~2HƯƠNG THỌ|7232~2HƯƠNG MINH|7233~2HƯƠNG ĐẠI|7234~2HƯƠNG ĐIỀN|7235~2HƯƠNG QUANG|7236~2SƠN THỌ",
  "384": "7237~3ĐỨC THỌ|7251~2TRUNG LỄ|7252~2ĐỨC LÂM|7253~2ĐỨC DŨNG|7254~2ĐỨC AN|7255~2ĐỨC LẬP|7256~2ĐỨC LẠNG|7257~2ĐỨC LẠC|7258~2ĐỨC LONG|7259~2ĐỨC HÒA|7260~2BÙI XÁ|7261~2ĐỨC YÊN|7262~2TRƯỜNG SƠN|7263~2LIÊN MINH|7264~2ĐỨC THỊNH|7265~2ĐỨC LA|7266~2ĐỨC LĨNH|7238~2ĐỨC VĨNH|7239~2ĐỨC QUANG|7240~2ĐỨC CHÂU|7241~2ĐỨC TÙNG|7242~2YÊN HỒ|7243~2YÊN ĐỒNG|7244~2TÙNG ẢNH|7245~2ĐỨC ĐỒNG|7246~2TÂN HƯƠNG|7247~2ĐỨC NHÂN,|7248~2ĐỨC THỦY|7249~2THÁI YÊN|7250~2ĐỨC THANH",
  "385": "7267~3NGHÈN|7268~2THIÊN LỘC|7269~2THUẦN THIỆN|7270~2KIM LỘC|7271~2VƯỢNG LỘC|7272~2THANH LỘC|7273~2SONG LỘC|7274~2THƯỜNG NGA|7275~2TRƯỜNG LỘC|7276~2TÙNG LỘC|7277~2YÊN LỘC|7278~2PHÚ LỘC|7279~2KHÁNH LỘC|7280~2GIA HANH|7281~2VĨNH LỘC|7282~2TIẾN LỘC|7283~2TRUNG LỘC|7284~2XUÂN LỘC|7285~2QUANG LỘC|7286~2THƯỢNG LỘC|7287~2ĐỒNG LỘC|7288~2MỸ LỘC|7289~2SƠN LỘC",
  "386": "7303~3LỘC HÀ|7290~2ÍCH HẬU|7291~2PHÙ LƯU|7292~2HỒNG LỘC|7293~2BÌNH LỘC|7294~2TÂN LỘC|7295~2AN LỘC|7296~2THỊNH LỘC|7297~2THẠCH KIM|7298~2THẠCH BẰNG|7299~2THẠCH CHÂU|7300~2THẠCH MỸ|7301~2MAI PHỤ|7302~2HỘ ĐỘ",
  "387": "7322~3NGHI XUÂN|7304~3XUÂN AN|7305~2XUÂN HỘI|7306~2XUÂN TRƯỜNG|7307~2XUÂN ĐAN|7308~2XUÂN PHỔ|7309~2XUÂN HẢI|7310~2XUÂN YÊN|7311~2TIÊN ĐIỀN|7312~2XUÂN GIANG|7313~2XUÂN MỸ|7314~2XUÂN THÀNH|7315~2XUÂN HỒNG|7316~2XUÂN VIÊN|7317~2XUÂN LAM|7318~2XUÂN LĨNH|7319~2XUÂN LIÊN|7320~2CỔ ĐẠM|7321~2CƯƠNG GIÁN",
  "388": "7323~3PHỐ CHÂU|7324~3TÂY SƠN|7325~2SƠN TÂY|7326~2SƠN KIM 1|7327~2SƠN KIM 2|7328~2SƠN HỒNG|7329~2SƠN LĨNH|7330~2SƠN DIỆM|7331~2SƠN QUANG|7332~2SƠN GIANG|7333~2SƠN LÂM|7334~2SƠN HÀM|7335~2SƠN TRUNG|7336~2SƠN PHÚ|7337~2SƠN TRƯỜNG|7338~2SƠN PHÚC|7339~2SƠN MAI,|7340~2SƠN THỦY|7341~2SƠN BẰNG|7342~2SƠN NINH|7343~2SƠN THỊNH|7344~2SƠN HÒA|7345~2SƠN AN|7346~2SƠN LỄ|7347~2SƠN TIẾN|7348~2SƠN CHÂU|7349~2SƠN BÌNH|7350~2SƠN HÀ|7351~2SƠN TRÀ|7352~2SƠN LONG|7353~2SƠN TÂN|7354~2SƠN MỸ",
  "389": "7361~3HƯƠNG KHÊ|7355~2HƯƠNG ĐÔ|7356~2PHÚC ĐỒNG|7357~2HOÀ HẢI|7358~2HÀ LINH|7359~2PHƯƠNG ĐIỀN|7360~2PHƯƠNG MỸ|7362~2HƯƠNG TRẠCH|7363~2PHÚC TRẠCH|7364~2HƯƠNG TRÀ|7365~2HƯƠNG LIÊN|7366~2HƯƠNG LÂM|7367~2LỘC YÊN|7368~2HƯƠNG XUÂN|7369~2PHÚ PHONG|7370~2HƯƠNG VĨNH|7371~2PHÚ GIA|7372~2HƯƠNG LONG|7373~2GIA PHỐ|7374~2HƯƠNG GIANG|7375~2HƯƠNG THUỶ|7376~2HƯƠNG BÌNH",
  "390": "7393~3CẨM XUYÊN|7377~3THIÊN CẦM|7378~2CẨM THÀNH|7379~2CẨM DUỆ|7380~2CẨM MỸ|7381~2CẨM QUAN|7382~2CẨM SƠN|7383~2CẨM THỊNH|7384~2CẨM HƯNG|7385~2CẨM HÀ|7386~2CẨM PHÚC|7387~2CẨM NHƯỢNG|7388~2CẨM LỘC|7389~2CẨM LĨNH|7390~2CẨM TRUNG|7391~2CẨM MINH|7392~2CẨM LẠC|7394~2CẨM YÊN|7395~2CẨM HOÀ|7396~2CẨM DƯƠNG|7397~2CẨM NAM|7398~2CẨM LONG|7399~2CẨM HUY|7400~2CẨM THĂNG|7401~2CẨM QUANG|7402~2CẨM BÌNH|7403~2CẨM VỊNH|7404~2CẨM THẠCH",
  "391": "7405~1ĐẠI NÀI|7406~1HÀ HUY TẬP|7407~1VĂN YÊN|7408~1NAM HÀ|7409~1TRẦN PHÚ|7410~1NGUYỄN DU|7411~1THẠCH LINH|7412~1BẮC HÀ|7413~1TÂN GIANG|7414~1THẠCH QUÝ|7415~2THẠCH TRUNG|7416~2THẠCH HẠ|7417~2THẠCH MÔN|7418~2THẠCH HƯNG|7419~2THẠCH ĐỒNG|7420~2THẠCH BÌNH",
  "392": "7421~3THẠCH HÀ|7422~2THẠCH LIÊN|7423~2THẠCH KÊNH|7424~2VIỆT XUYÊN|7425~2THẠCH SƠN|7426~2THẠCH HỘI|7427~2THẠCH BÀN|7428~2PHÙ VIỆT|7429~2THẠCH LONG|7430~2THẠCH KHÊ|7431~2THẠCH ĐỈNH|7432~2THẠCH HẢI|7433~2THẠCH TIẾN|7434~2THẠCH THANH|7435~2THẠCH TRỊ|7436~2TƯỢNG SƠN|7437~2THẠCH LẠC|7438~2THẠCH NGỌC|7439~2THẠCH VĨNH|7440~2THẠCH LƯU|7441~2BẮC SƠN|7442~2THẠCH ĐÀI|7443~2THẠCH THẮNG|7444~2THẠCH VĂN|7445~2THẠCH XUÂN|7446~2THẠCH TÂN|7447~2THẠCH HƯƠNG|7448~2THẠCH ĐIỀN|7449~2NAM HƯƠNG|7450~2THẠCH LÂM|7451~2NGỌC SƠN",
  "393": "7452~0THỊ XÃ KỲ ANH|7453~2KỲ LONG|7454~2KỲ PHƯƠNG|7455~2KỲ NAM|7456~2KỲ NINH|7457~2KỲ LIÊN|7458~2KỲ HÀ|7459~2KỲ HƯNG|7460~2KỲ HOA|7461~2KỲ LỢI|7462~2KỲ TRINH|7463~2KỲ THỊNH|13328~1SÔNG TRÍ|22539~1HƯNG TRÍ",
  "394": "7464~2KỲ ANH|7465~2KỲ BẮC|7466~2KỲ TIẾN|7467~2KỲ XUÂN|7468~2KỲ GIANG|7469~2KỲ PHÚ|7470~2KỲ PHONG|7471~2KỲ SƠN|7472~2KỲ TÂY|7473~2KỲ HỢP|7474~2KỲ LÂM|7475~2KỲ KHANG|7476~2KỲ VĂN|7477~2KỲ LẠC|7478~2KỲ HÀ|7479~2KỲ HƯNG|7480~2KỲ HẢI|7481~2KỲ CHÂU|7482~2KỲ TÂN|7483~2KỲ HOA|7484~2KỲ THƯ|7485~2KỲ THỌ|7486~2KỲ PHƯƠNG|7487~2KỲ LỢI|7488~2KỲ LIÊN|7489~2KỲ NINH|7490~2KỲ ĐỒNG|7491~2KỲ LONG|7492~2KỲ TRINH|7493~2KỲ THỊNH|7494~2KỲ THƯỢNG|7495~2KỲ NAM|7496~2KỲ TRUNG",
  "395": "7497~1BẮC HỒNG|7498~1NAM HỒNG|7499~1TRUNG LƯƠNG|7500~1ĐỨC THUẬN|7501~1ĐẬU LIÊU|7502~1THUẬN LỘC",
  "396": "7503~3KIẾN GIANG|7504~2PHONG THỦY|7505~2LIÊN THỦY|7506~2LỘC THỦY|7507~2HỒNG THỦY|7508~2THANH THỦY|7509~2HOA THỦY|7510~2AN THỦY|7511~2SƠN THỦY|7512~2NGÂN THỦY|7513~2HƯNG THỦY|7514~2TÂN THỦY|7515~2XUÂN THỦY|7516~2DƯƠNG THỦY|7517~2MAI THỦY|7518~2PHÚ THỦY|7519~2MỸ THỦY|7520~2SEN THỦY|7521~2TRƯỜNG THỦY|7522~2VĂN THỦY|7523~2KIM THỦY|7524~2THÁI THỦY|7525~3NÔNG TRƯỜNG LỆ NINH|7526~2CAM THỦY|7527~2LÂM THỦY|7528~2NGƯ THỦY BẮC|7529~2NGƯ THỦY TRUNG|7530~2NGƯ THỦY NAM",
  "397": "7531~3ĐỒNG LÊ|7532~2LÂM HÓA|7533~2HƯƠNG HÓA|7534~2THANH HÓA|7535~2THANH THẠCH|7536~2KIM HÓA|7537~2SƠN HÓA|7538~2LÊ HÓA|7539~2THUẬN HÓA|7540~2ĐỒNG HÓA|7541~2THẠCH HÓA|7542~2NAM HÓA|7543~2ĐỨC HÓA|7544~2PHONG HÓA|7545~2MAI HÓA|7546~2NGƯ HÓA|7547~2TIẾN HÓA|7548~2CHÂU HÓA|7549~2CAO QUẢNG|7550~2VĂN HÓA",
  "398": "7551~2QUANG PHÚ|7552~2THUẬN ĐỨC|7553~1BẮC LÝ|7554~1BẮC NGHĨA|7555~1ĐỒNG MỸ|7556~1ĐỒNG PHÚ|7557~1ĐỒNG SƠN (TIỂU KHU 1 - 7)|7558~1ĐỨC NINH|7559~1HẢI ĐÌNH|7560~1HẢI THÀNH|7561~1NAM LÝ|7562~1PHÚ HẢI|7563~2BẢO NINH|7564~1ĐỨC NINH ĐÔNG|7565~2LỘC NINH|7566~2NGHĨA NINH|7567~1ĐỒNG SƠN (TIỂU KHU 8-11)",
  "399": "7568~3BA ĐỒN|7569~2QUẢNG THỌ|7570~2QUẢNG LONG|7571~2QUẢNG PHONG|7572~2QUẢNG HỢP|7573~2QUẢNG THUẬN|7574~2QUẢNG XUÂN|7575~2QUẢNG THANH|7576~2QUẢNG KIM|7577~2QUẢNG PHÚ|7578~2QUẢNG ĐÔNG|7579~2QUẢNG LIÊN|7580~2QUẢNG TIẾN|7581~2QUẢNG CHÂU|7582~2QUẢNG LƯU|7583~2QUẢNG TRƯỜNG|7584~2QUẢNG HẢI|7585~2QUẢNG VĂN|7586~2QUẢNG LỘC|7587~2QUẢNG HÒA|7588~2QUẢNG MINH|7589~2QUẢNG SƠN|7590~2QUẢNG TRUNG|7591~2QUẢNG TÂN|7592~2QUẢNG TIÊN|7593~2QUẢNG THỦY|7594~2CẢNH HÓA|7595~2QUẢNG PHÚC|7596~2PHÙ HÓA|7597~2QUẢNG HƯNG|7598~2QUẢNG PHƯƠNG|7599~2QUẢNG THẠCH|7600~2QUẢNG TÙNG|7601~2CẢNH DƯƠNG",
  "400": "7607~2MINH HÓA|7602~2YÊN HÓA|7603~3QUY ĐẠT|7604~2XUÂN HÓA|7605~2TRUNG HÓA|7606~2TÂN HÓA|7608~2HỒNG HÓA|7609~2HÓA TIẾN|7610~2HÓA HỢP|7611~2HÓA PHÚC|7612~2HÓA THANH|7613~2DÂN HÓA|7614~2THƯỢNG HÓA|7615~2TRỌNG HÓA|7616~2QUY HÓA|7617~2HÓA SƠN",
  "401": "7618~3QUÁN HÀU|7619~2VÕ NINH|7620~2LƯƠNG NINH|7621~2HẢI NINH|7622~2DUY NINH|7623~2VĨNH NINH|7624~2HÀM NINH|7625~2HIỀN NINH|7626~2XUÂN NINH|7627~2AN NINH|7628~2GIA NINH|7629~2TÂN NINH|7630~2VẠN NINH|7631~2TRƯỜNG XUÂN|7632~2TRƯỜNG SƠN",
  "402": "7633~3HOÀN LÃO|7634~2NHÂN TRẠCH|7635~2THƯỢNG TRẠCH|7636~2TÂN TRẠCH|7637~2XUÂN TRẠCH|7638~2LÂM TRẠCH|7639~2PHÚC TRẠCH|7640~2HƯNG TRẠCH|7641~2LIÊN TRẠCH|7642~2MỸ TRẠCH|7643~2HẠ TRẠCH|7644~2BẮC TRẠCH|7645~2THANH TRẠCH|7646~2HẢI TRẠCH|7647~2ĐỒNG TRẠCH|7648~2ĐỨC TRẠCH|7649~2PHÚ TRẠCH|7650~2ĐẠI TRẠCH|7651~2NAM TRẠCH|7652~2TRUNG TRẠCH|7653~2HÒA TRẠCH|7654~2LÝ TRẠCH|7655~2VẠN TRẠCH|7656~2SƠN TRẠCH|7657~2CỰ NẪM|7658~2HOÀN TRẠCH|7659~3NÔNG TRƯỜNG VIỆT TRUNG|7660~2SƠN LỘC|7661~2PHÚ ĐỊNH|7662~2TÂY TRẠCH",
  "403": "7666~1BA ĐỒN|7663~1QUẢNG PHÚC|7664~2QUẢNG TIÊN|7665~2QUẢNG HẢI|7667~2QUẢNG SƠN|7668~2QUẢNG THUỶ|7669~2QUẢNG VĂN|7670~1QUẢNG PHONG|7671~2QUẢNG TRUNG|7672~2QUẢNG HOÀ|7673~1QUẢNG THUẬN|7674~1QUẢNG THỌ|7675~1QUẢNG LONG|7676~2QUẢNG LỘC|7677~2QUẢNG MINH|7678~2QUẢNG TÂN",
  "404": "7679~2TRIỆU VÂN|7680~2TRIỆU ĐỘ|7681~2TRIỆU ĐẠI|7682~2TRIỆU LĂNG|7683~2TRIỆU AN|7684~2TRIỆU TRẠCH|7685~2TRIỆU TRUNG|7686~2TRIỆU ÁI|7687~3ẢI TỬ|7688~2TRIỆU THƯỢNG|7689~2TRIỆU PHƯỚC|7690~2TRIỆU THÀNH|7691~2TRIỆU LONG|7692~2TRIỆU HÒA|7693~2TRIỆU TÀI|7694~2TRIỆU SƠN|7695~2TRIỆU ĐÔNG|7696~2TRIỆU GIANG|7697~2TRIỆU THUẬN",
  "405": "7698~11|7699~12|7700~13|7701~14|7702~15|7703~1ĐÔNG GIANG|7704~1ĐÔNG LƯƠNG|7705~1ĐÔNG LỄ|7706~1ĐÔNG THANH",
  "406": "7707~2HÚC|7708~2HƯỚNG LỘC|7709~2TÂN HỢP|7710~2TÂN LIÊN|7711~2TÂN LẬP|7712~2TÂN LONG|7713~2TÂN THÀNH|7714~2HƯỚNG TÂN|7715~2HƯỚNG LINH|7716~2HƯỚNG PHÙNG|7717~2HƯỚNG SƠN|7718~2HƯỚNG VIỆT|7719~2HƯỚNG LẬP|7720~3KHE SANH|7721~3LAO BẢO|7722~2XY|7723~2A TÚC|7724~2A DƠI|7725~2A XING|7726~2THANH|7727~2THUẬN|7728~2PA TẦNG",
  "407": "7729~11|7730~12|7731~13|7732~1AN ĐÔN|7733~1HẢI LỆ",
  "408": "7734~3CAM LỘ|7735~2CAM THÀNH|7736~2CAM AN|7737~2CAM THANH|7738~2CAM THỦY|7739~2CAM TUYỀN|7740~2CAM HIẾU|7741~2CAM CHÍNH|7742~2CAM NGHĨA",
  "409": "7743~0CỒN CỎ",
  "410": "7757~2ĐA KRÔNG|7744~2BA NANG|7745~3KRÔNG KLANG|7746~2A VAO|7747~2A BUNG|7748~2A NGO|7749~2TÀ RỤT|7750~2HÚC NGHÌ|7751~2TÀ LONG|7752~2MÒ Ó|7753~2TRIỆU NGUYÊN|7754~2BA LÒNG|7755~2HẢI PHÚC|7756~2HƯỚNG HIỆP",
  "411": "7760~3HẢI LĂNG|7758~2HẢI CHÁNH|7759~2HẢI KHÊ|7761~2HẢI LÂM|7762~2HẢI AN|7763~2HẢI BA|7764~2HẢI XUÂN|7765~2HẢI QUY|7766~2HẢI QUẾ|7767~2HẢI VĨNH|7768~2HẢI PHÚ|7769~2HẢI THƯỢNG|7770~2HẢI DƯƠNG|7771~2HẢI THIỆN|7772~2HẢI THÀNH|7773~2HẢI HÒA|7774~2HẢI TÂN|7775~2HẢI TRƯỜNG|7776~2HẢI THỌ|7777~2HẢI SƠN|7778~2HẢI LỆ",
  "412": "7779~3HỒ XÁ|7780~3BẾN QUAN|7781~3CỬA TÙNG|7782~2VĨNH THÁI|7783~2VĨNH Ô|7784~2VĨNH KHÊ|7785~2VĨNH HÀ|7786~2VĨNH LONG|7787~2VĨNH CHẤP|7788~2VĨNH LÂM|7789~2VĨNH SƠN|7790~2VĨNH THỦY|7791~2VĨNH NAM|7792~2VĨNH TRUNG|7793~2VĨNH TÚ|7794~2VĨNH HIỀN|7795~2VĨNH HÒA|7796~2VĨNH THẠCH|7797~2VĨNH KIM|7798~2VĨNH GIANG|7799~2VĨNH TÂN|7800~2VĨNH THÀNH|7801~2VĨNH QUANG",
  "413": "7802~3GIO LINH|7803~3CỬA VIỆT|7804~2GIO CHÂU|7805~2TRUNG HẢI|7806~2TRUNG GIANG|7807~2TRUNG SƠN|7808~2GIO MỸ|7809~2GIO PHONG|7810~2GIO AN|7811~2GIO BÌNH|7812~2GIO HẢI|7813~2GIO SƠN|7814~2GIO HÒA|7815~2LINH HẢI|7816~2GIO VIỆT|7817~2VĨNH TRƯỜNG|7818~2HẢI THÁI|7819~2GIO MAI|7820~2GIO QUANG|7821~2LINH THƯỢNG|7822~2GIO THÀNH",
  "414": "7823~2PHÚ LƯƠNG|7824~3THUẬN AN|7825~2VINH AN|7826~2PHÚ THƯỢNG|7827~2PHÚ DIÊN|7828~2VINH PHÚ|7829~2PHÚ MẬU|7830~2PHÚ XUÂN|7831~2VINH XUÂN|7832~2PHÚ THANH|7833~2PHÚ AN|7834~3PHÚ ĐA|7835~2PHÚ MỸ|7836~2PHÚ THUẬN|7837~2PHÚ HẢI|7838~2VINH THÁI|7839~2PHÚ DƯƠNG|7840~2PHÚ HỒ|7841~2VINH THANH|7842~2VINH HÀ",
  "415": "7843~3PHÚ LỘC|7844~2LỘC AN|7845~2VINH HẢI|7846~2LỘC VĨNH|7847~2VINH HƯNG|7848~2VINH GIANG|7849~2LỘC TRÌ|7850~3LĂNG CÔ|7851~2LỘC BỔN|7852~2VINH HIỀN|7853~2LỘC THUỶ|7854~2XUÂN LỘC|7855~2LỘC SƠN|7856~2LỘC HOÀ|7857~2LỘC TIẾN|7858~2VINH MỸ|7859~2LỘC ĐIỀN|7860~2LỘC BÌNH",
  "416": "7861~2THUỶ VÂN|7862~1THUỶ CHÂU|7863~1THUỶ LƯƠNG|7864~2THUỶ THANH|7865~2THUỶ TÂN|7866~2THUỶ PHÙ|7867~2THUỶ BẰNG|7868~2DƯƠNG HOÀ|7869~1THUỶ PHƯƠNG|7870~2PHÚ SƠN|7871~1PHÚ BÀI|7872~1THUỶ DƯƠNG",
  "417": "7895~3A LƯỚI|7873~2HỒNG BẮC|7874~2HỒNG HẠ|7875~2HỒNG THƯỢNG|7876~2A ĐỚT|7877~2A NGO|7878~2HỒNG TRUNG|7879~2HƯƠNG PHONG|7880~2HỒNG VÂN|7881~2NHÂM|7882~2HƯƠNG NGUYÊN|7883~2HỒNG KIM|7884~2PHÚ VINH|7885~2ĐÔNG SƠN|7886~2BẮC SƠN|7887~2SƠN THUỶ|7888~2HƯƠNG LÂM|7889~2HỒNG THUỶ|7890~2HỒNG QUẢNG|7891~2HỒNG THÁI|7892~2A ROẰNG|7893~2HỒNG NAM|7894~2HỒNG SƠN",
  "418": "7897~3PHONG ĐIỀN|7896~2ĐIỀN HẢI|7898~2PHONG BÌNH|7899~2PHONG MỸ|7900~2ĐIỀN LỘC|7901~2PHONG HOÀ|7902~2PHONG SƠN|7903~2ĐIỀN MÔN|7904~2PHONG HẢI|7905~2ĐIỀN HOÀ|7906~2PHONG XUÂN|7907~2PHONG HIỀN|7908~2ĐIỀN HƯƠNG|7909~2PHONG CHƯƠNG|7910~2PHONG AN|7911~2PHONG THU",
  "419": "7912~3SỊA|7913~2QUẢNG PHƯỚC|7914~2QUẢNG VINH|7915~2QUẢNG PHÚ|7916~2QUẢNG THÀNH|7917~2QUẢNG CÔNG|7918~2QUẢNG NGẠN|7919~2QUẢNG AN|7920~2QUẢNG LỢI|7921~2QUẢNG THÁI|7922~2QUẢNG THỌ",
  "420": "7923~2HƯƠNG HOÀ|7924~2HƯƠNG PHÚ|7925~2HƯƠNG LỘC|7926~3KHE TRE|7927~2HƯƠNG SƠN|7928~2THƯỢNG LONG|7929~2THƯỢNG QUẢNG|7930~2THƯỢNG NHẬT|7931~2HƯƠNG HỮU|7932~2THƯỢNG LỘ|7933~2HƯƠNG GIANG",
  "421": "7934~2 HẢI DƯƠNG|7935~2HƯƠNG VINH|7936~2BÌNH THÀNH|7937~2HƯƠNG XUÂN|7938~2HƯƠNG AN|7939~2HỒNG TIẾN|7940~2HƯƠNG VĂN|7941~2HƯƠNG BÌNH|7942~2HƯƠNG TOÀN|7943~2HƯƠNG THỌ|7944~2HƯƠNG CHỮ|7945~2HƯƠNG HỒ|7946~2BÌNH ĐIỀN|7947~3TỨ HẠ|7948~2HƯƠNG VÂN|7949~2HƯƠNG PHONG",
  "422": "7950~1AN ĐÔNG|7951~1THUẬN HÒA|7952~1PHÚ HẬU|7953~1PHÚ HIỆP|7954~1THUẬN LỘC|7955~1PHÚ BÌNH|7956~1ĐÚC|7957~1PHÚ HÒA|7958~1PHÚ CÁT|7959~1VỸ DẠ|7960~1KIM LONG|7961~1VĨNH NINH|7962~1PHÚ HỘI|7963~1TRƯỜNG AN|7964~1XUÂN PHÚ|7965~1PHƯỚC VĨNH|7966~1AN CỰU|7967~1TÂY LỘC|7968~1THUẬN THÀNH|7969~1THỦY XUÂN|7970~1AN TÂY|7971~1AN HÒA|7972~1THỦY BIỀU|7973~1HƯƠNG SƠ|7974~1HƯƠNG LONG|7975~1PHÚ NHUẬN|7976~1PHÚ THUẬN",
  "423": "7977~3PHÚ THỊNH|7978~2TAM ĐẠI|7979~2TAM PHƯỚC|7980~2TAM VINH|7981~2TAM DÂN|7982~2TAM THÀNH|7983~2TAM LỘC|7984~2TAM AN|7985~2TAM ĐÀN|7986~2TAM THÁI|7987~2TAM LÃNH",
  "424": "7988~2PHƯỚC LỘC|7989~2PHƯỚC THÀNH|7990~2PHƯỚC KIM|7991~2PHƯỚC CÔNG|7992~2PHƯỚC CHÁNH|7993~2PHƯỚC MỸ|7994~2PHƯỚC NĂNG|7995~2PHƯỚC ĐỨC|7996~2PHƯỚC XUÂN|7997~2PHƯỚC HIỆP|7998~2PHƯỚC HÒA|7999~3KHÂM ĐỨC",
  "425": "8000~3ÁI NGHĨA|8001~2ĐẠI QUANG|8002~2ĐẠI LÃNH|8003~2ĐẠI ĐỒNG|8004~2ĐẠI HIỆP|8005~2ĐẠI CHÁNH|8006~2ĐẠI AN|8007~2ĐẠI SƠN|8008~2ĐẠI HƯNG|8009~2ĐẠI NGHĨA|8010~2ĐẠI THẮNG|8011~2ĐẠI MINH|8012~2ĐẠI HÒA|8013~2ĐẠI TÂN|8014~2ĐẠI PHONG|8015~2ĐẠI CƯỜNG|8016~2ĐẠI THẠNH|8017~2ĐẠI HỒNG",
  "426": "8018~3THẠNH MỸ|8019~2CÀ DY|8020~2TÀ BHINH|8021~2ĐAC PRINH|8022~2ĐAC PRE|8023~2LA DÊÊ|8024~2LA ÊE|8025~2CHÀ VÀI|8026~2ZUÔIH|8027~2ĐẮC TÔI|8028~2TÀ PƠƠ|8029~2CHƠ CHUN",
  "427": "8030~3HÀ LAM|8031~2BÌNH NGUYÊN|8032~2BÌNH ĐÀO|8033~2BÌNH HẢI|8034~2BÌNH MINH|8035~2BÌNH TÚ|8036~2BÌNH AN|8037~2BÌNH LÃNH|8038~2BÌNH TRỊ|8039~2BÌNH ĐỊNH NAM|8040~2BÌNH QUÝ|8041~2BÌNH SA|8042~2BÌNH CHÁNH|8043~2BÌNH GIANG|8044~2BÌNH PHỤC|8045~2BÌNH TRIỀU|8046~2BÌNH ĐỊNH BẮC|8047~2BÌNH NAM|8048~2BÌNH TRUNG|8049~2BÌNH QUẾ|8050~2BÌNH DƯƠNG|8051~2BÌNH PHÚ",
  "428": "8052~2TAM NGỌC|8053~1HÒA THUẬN|8054~2TAM THĂNG|8055~1PHƯỚC HÒA|8056~1AN XUÂN|8057~1HÒA HƯƠNG|8058~1AN MỸ|8059~1AN SƠN|8060~1TRƯỜNG XUÂN|8061~1TÂN THẠNH|8062~2TAM PHÚ|8063~2TAM THANH|8064~1AN PHÚ",
  "429": "8065~2MÀ COOI|8066~2BA|8067~2TƯ|8068~2A TING|8069~2SÔNG KÔN|8070~2JƠ NGÂY|8071~2TÀ LU|8072~2ZA HUNG|8073~2A ROOI|8074~2KA DĂNG|8075~3PRAO",
  "430": "8076~3TRÀ MY|8077~2TRÀ BUI|8078~2TRÀ GIANG|8079~2TRÀ ĐÔNG|8080~2TRÀ TÂN|8081~2TRÀ ĐỐC|8082~2TRÀ DƯƠNG|8083~2TRÀ GIÁC|8084~2TRÀ NÚ|8085~2TRÀ GIÁP|8086~2TRÀ KA|8087~2TRÀ KÓT|8088~2TRÀ SƠN",
  "431": "8089~2CH'ƠM|8090~2A XAN|8091~2TR'HY|8092~2LĂNG|8093~2A TIÊNG|8094~2BHALLÊ|8095~2G'RY|8096~2A NÔNG|8097~2DANG|8098~2A VƯƠNG",
  "432": "8099~3TIÊN KỲ|8100~2TIÊN CẢNH|8101~2TIÊN PHONG|8102~2TIÊN HIỆP|8103~2TIÊN HÀ|8104~2TIÊN THỌ|8105~2TIÊN CHÂU|8106~2TIÊN LẬP|8107~2TIÊN LỘC|8108~2TIÊN AN|8109~2TIÊN LÃNH|8110~2TIÊN NGỌC|8111~2TIÊN CẨM|8112~2TIÊN MỸ|8113~2TIÊN SƠN",
  "433": "8114~2ĐIỆN NGỌC|8115~2ĐIỆN AN|8116~2ĐIỆN NAM ĐÔNG|8117~2ĐIỆN TRUNG|8118~2ĐIỆN DƯƠNG|8119~3VĨNH ĐIỆN|8120~2ĐIỆN MINH|8121~2ĐIỆN PHƯƠNG|8122~2ĐIỆN HÒA|8123~2ĐIỆN THẮNG NAM|8124~2ĐIỆN NAM TRUNG|8125~2ĐIỆN NAM BẮC|8126~2ĐIỆN THẮNG BẮC|8127~2ĐIỆN THẮNG TRUNG|8128~2ĐIỆN PHƯỚC|8129~2ĐIỆN THỌ|8130~2ĐIỆN HỒNG|8131~2ĐIỆN TIẾN|8132~2ĐIỆN QUANG|8133~2ĐIỆN PHONG|8134~0ĐIỆN PHONG",
  "434": "8135~2QUẾ XUÂN 1|8136~2QUẾ XUÂN 2|8137~2QUẾ PHÚ|8138~2QUẾ CƯỜNG|8139~2PHÚ THỌ|8140~2QUẾ THUẬN|8141~2QUẾ HIỆP|8142~2QUẾ CHÂU|8143~2QUẾ MINH|8144~2QUẾ AN|8145~2QUẾ PHONG|8146~2QUẾ LONG|8147~2HƯƠNG AN|8148~3ĐÔNG PHÚ",
  "435": "8154~2PHƯỚC NINH|8155~2QUẾ LÂM|8149~2QUẾ TRUNG|8150~2QUẾ LỘC|8151~2QUẾ NINH|8152~2QUẾ PHƯỚC|8153~2SƠN VIÊN",
  "436": "8156~3NÚI THÀNH|8157~2TAM HÒA|8158~2TAM TIẾN|8159~2TAM NGHĨA|8160~2TAM QUANG|8161~2TAM HẢI|8162~2TAM SƠN|8163~2TAM TRÀ|8164~2TAM XUÂN 1|8165~2TAM ANH BẮC|8166~2TAM HIỆP|8167~2TAM ANH NAM|8168~2TAM MỸ TÂY|8169~2TAM XUÂN 2|8170~2TAM THẠNH|8171~2TAM GIANG|8172~2TAM MỸ ĐÔNG",
  "437": "8173~1THANH HÀ|8174~1TÂN AN|8175~1CỬA ĐẠI|8176~1MINH AN|8177~1CẨM PHÔ|8178~1SƠN PHONG|8179~2CẦM HÀ|8180~2CẨM THANH|8181~1CẨM AN|8182~1CẨM CHÂU|8183~1CẨM NAM|8184~2CẨM KIM|8185~2TÂN HIỆP",
  "438": "8186~2TRÀ DON|8187~2TRÀ VÂN|8188~2TRÀ LENG|8189~2TRÀ VINH|8190~2TRÀ TẬP|8191~2TRÀ DƠN|8192~2TRÀ NAM|8193~2TRÀ CANG|8194~2TRÀ MAI|8195~2TRÀ LINH",
  "439": "8196~3TÂN AN|8197~2HIỆP HÒA|8198~2HIỆP THUẬN|8199~2QUẾ THỌ|8200~2BÌNH LÂM|8201~2SÔNG TRÀ|8202~2PHƯỚC TRÀ|8203~2PHƯỚC GIA|8204~2QUẾ BÌNH|8205~2QUẾ LƯU|8206~2THĂNG PHƯỚC|8207~2BÌNH SƠN",
  "440": "8208~2DUY HẢI|8209~3NAM PHƯỚC|8210~2DUY HÒA|8211~2DUY TRUNG|8212~2DUY TRINH|8213~2DUY CHÂU|8214~2DUY PHƯỚC|8215~2DUY VINH|8216~2DUY SƠN|8217~2DUY NGHĨA|8218~2DUY THÀNH|8219~2DUY THU|8220~2DUY PHÚ|8221~2DUY TÂN",
  "441": "8222~2HÀNH ĐỨC|8223~2HÀNH DŨNG|8224~2HÀNH MINH|8225~2HÀNH NHÂN|8226~2HÀNH PHƯỚC|8227~2HÀNH THIỆN|8228~2HÀNH THỊNH|8229~2HÀNH TÍN ĐÔNG|8230~2HÀNH TÍN TÂY|8231~2HÀNH TRUNG|8232~2HÀNH THUẬN|8233~3CHỢ CHÙA",
  "442": "8234~3 SÔNG VỆ|8235~3LA HÀ|8237~2NGHĨA ĐIỀN|8239~2NGHĨA HIỆP|8240~2NGHĨA HÒA|8241~2NGHĨA KỲ|8242~2NGHĨA LÂM|8243~2NGHĨA MỸ|8245~2NGHĨA PHƯƠNG|8246~2NGHĨA SƠN|8247~2NGHĨA THẮNG|8248~2NGHĨA THỌ|8249~2NGHĨA THUẬN|8250~2NGHĨA THƯƠNG|8251~2NGHĨA TRUNG|22027~2NGHĨA AN",
  "443": "8257~3MINH LONG|8252~2LONG HIỆP|8253~2LONG MAI|8254~2LONG MÔN|8255~2LONG SƠN|8256~2THANH AN",
  "444": "8258~2BÌNH THANH TÂY|8259~2BÌNH CHÁNH|8260~2BÌNH CHƯƠNG|8261~2BÌNH AN|8262~2BÌNH CHÂU|8263~2BÌNH DƯƠNG|8264~2BÌNH HIỆP|8265~2BÌNH HÒA|8266~2BÌNH KHƯƠNG|8267~2BÌNH LONG|8268~2BÌNH MINH|8269~2BÌNH MỸ|8270~2BÌNH NGUYÊN|8271~2BÌNH PHÚ|8272~2BÌNH PHƯỚC|8273~2BÌNH TÂN|8274~2BÌNH THANH ĐÔNG|8275~2BÌNH THỚI|8276~2BÌNH TRUNG|8277~2BÌNH ĐÔNG|8278~2BÌNH THẠNH|8279~3CHÂU Ổ|8280~2BÌNH HẢI|8281~2BÌNH TRỊ|8282~2BÌNH THUẬN",
  "445": "8283~1NGUYỄN NGHIÊM|8284~1LÊ HỒNG PHONG|8285~1TRẦN PHÚ|8286~1QUẢNG PHÚ|8287~1TRẦN HƯNG ĐẠO|8288~1CHÁNH LỘ|8289~1NGHĨA LỘ|8290~1NGHĨA CHÁNH|8291~2NGHĨA DÕNG|8292~2NGHĨA DŨNG|14858~2TỊNH LONG|13330~1TRƯƠNG QUANG TRỌNG|23569~2TỊNH HÒA|23570~2TỊNH KHÊ|23571~2TỊNH KỲ|23572~2TỊNH LONG|23573~2TỊNH THIỆN|23565~2TỊNH AN|23566~2TỊNH ẤN ĐÔNG|23567~2TỊNH ẤN TÂY|23568~2TỊNH CHÂU|23563~2NGHĨA PHÚ|23564~2NGHĨA HÀ",
  "446": "8293~3MỘ ĐỨC|8294~2ĐỨC PHONG|8295~2ĐỨC PHÚ|8296~2ĐỨC TÂN|8297~2ĐỨC THẮNG|8298~2ĐỨC THẠNH|8299~2ĐỨC CHÁNH|8300~2ĐỨC HIỆP|8301~2ĐỨC HÒA|8302~2ĐỨC LÂN|8303~2ĐỨC LỢI|8304~2ĐỨC MINH|8305~2ĐỨC NHUẬN|8306~3THI PHỔ",
  "447": "8314~3TRÀ BỒNG|8307~2TRÀ BÌNH|8308~2TRÀ BÙI|8309~2TRÀ GIANG|8310~2TRÀ HIỆP|8311~2TRÀ LÂM|8312~2TRÀ TÂN|8313~2TRÀ THỦY|8315~3TRÀ XUÂN|8316~2TRÀ PHÚ|8317~2TRÀ SƠN",
  "448": "8318~2TRÀ KHÊ|8319~2TRÀ LÃNH|8320~2TRÀ NHAM|8321~2TRÀ PHONG|8322~2TRÀ QUÂN|8323~2TRÀ THANH|8324~2TRÀ THỌ|8325~2TRÀ TRUNG|8326~2TRÀ XINH",
  "449": "25697~2LÝ SƠN|8327~2AN BÌNH|8328~2AN HẢI|8329~2AN VĨNH",
  "450": "8330~2SƠN BA|8331~2SƠN BAO|8332~2SƠN CAO|8333~2SƠN GIANG|8334~2SƠN HẠ|8335~2SƠN HẢI|8336~2SƠN LINH|8337~2SƠN NHAM|8338~2SƠN THÀNH|8339~2SƠN THƯỢNG|8340~2SƠN KỲ|8341~2SƠN THỦY|8342~2SƠN TRUNG|8343~3DI LĂNG",
  "451": "8345~3ĐỨC PHỔ|8344~3SA HUỲNH|8346~2PHỔ MINH|8347~2PHỔ CHÂU|8348~2PHỔ AN|8349~2PHỔ CƯỜNG|8350~2PHỔ KHÁNH|8351~2PHỔ NHƠN|8352~2PHỔ PHONG|8353~2PHỔ QUANG|8354~2PHỔ THẠNH|8355~2PHỔ VĂN|8356~2PHỔ VINH|8357~2PHỔ HOÀ|8358~2PHỔ THUẬN|8359~2PHỔ NINH",
  "452": "8360~3SƠN TỊNH|8365~2TỊNH MINH|8366~2TỊNH PHONG|8367~2TỊNH SƠN|8369~2TỊNH THỌ|8370~2TỊNH TRÀ|8371~2TỊNH BẮC|8375~2TỊNH BÌNH|8377~2TỊNH ĐÔNG|8378~2TỊNH GIANG|8379~2TỊNH HÀ|8380~2TỊNH HIỆP",
  "453": "8399~3BA TƠ|8381~2BA CHÙA|8382~2BA CUNG|8383~2BA ĐIỀN|8384~2BA DINH|8385~2BA ĐỘNG|8386~2BA KHÂM|8387~2BA LỄ|8388~2BA LIÊN|8389~2BA NAM|8390~2BA NGẠC|8391~2BA THÀNH|8392~2BA TIÊU|8393~2BA TÔ|8394~2BA TRANG|8395~2BA VÌ|8396~2BA VINH|8397~2BA XA|8398~2BA BÍCH|8400~2BA GIANG",
  "454": "8401~2SƠN DUNG|8402~2SƠN LẬP|8403~2SƠN LIÊN|8404~2SƠN LONG|8405~2SƠN BUA|8406~2SƠN MÀU|8407~2SƠN MÙA|8408~2SƠN TÂN|8409~2SƠN TINH",
  "455": "8410~2BÌNH TƯỜNG|8411~2BÌNH HÒA|8412~2BÌNH TÂN|8413~2BÌNH THUẬN|8414~2TÂY AN|8415~2TÂY VINH|8416~2TÂY BÌNH|8417~2TÂY XUÂN|8418~2TÂY PHÚ|8419~2TÂY GIANG|8420~2TÂY THUẬN|8421~2VĨNH AN|8422~3PHÚ PHONG|8423~2BÌNH THÀNH|8424~2BÌNH NGHI",
  "456": "8425~2ÂN ĐỨC|8426~2ÂN PHONG|8427~2ÂN THẠNH|8428~2ÂN TÍN|8429~2ÂN HẢO ĐÔNG|8430~2ÂN HẢO TÂY|8431~2ÂN MỸ|8432~2BOKTỚI|8433~2ÂN SƠN|8434~2ÂN HỮU|8435~2ÂN NGHĨA|8436~3TĂNG BẠT HỔ|8437~2ÂN TƯỜNG ĐÔNG|8438~2ÂN TƯỜNG TÂY|8439~2ĐAKMANG",
  "457": "8440~3VÂN CANH|8441~2CANH HÒA|8442~2CANH THUẬN|8443~2CANH HIỆP|8444~2CANH HIỂN|8445~2CANH VINH|8446~2CANH LIÊN",
  "458": "8447~2NHƠN AN|8448~2NHƠN HƯNG|8449~2NHƠN KHÁNH|8450~2NHƠN LỘC|8451~2NHƠN HÒA|8452~3BÌNH ĐỊNH|8453~3ĐẬP ĐÁ|8454~2NHƠN THÀNH|8455~2NHƠN MỸ|8456~2NHƠN HẠNH|8457~2NHƠN PHONG|8458~2NHƠN HẬU|8459~2NHƠN PHÚC|8460~2NHƠN THỌ|8461~2NHƠN TÂN",
  "459": "8462~2TAM QUAN NAM|8463~2HOÀI THANH|8464~2HOÀI THANH TÂY|8465~2HOÀI HƯƠNG|8466~2HOÀI HẢI|8467~2HOÀI TÂN|8468~3BỒNG SƠN|8469~3TAM QUAN|8470~2HOÀI SƠN|8471~2HOÀI CHÂU|8472~2HOÀI CHÂU BẮC|8473~2HOÀI PHÚ|8474~2TAM QUAN BẮC|8475~2HOÀI HẢO|8476~2HÒA XUÂN|8477~2HOÀI MỸ|8478~2HOÀI ĐỨC",
  "460": "8479~3AN LÃO|8480~2AN DŨNG|8481~2AN HÒA|8482~2AN HƯNG|8483~2AN NGHĨA|8484~2ANH QUANG|8485~2AN TÂN|8486~2AN TOÀN|8487~2AN TRUNG|8488~2AN VINH",
  "461": "8495~3VĨNH THẠNH|8489~2VĨNH HÒA|8490~2VĨNH HIỆP|8491~2VĨNH HẢO|8492~2VĨNH THỊNH|8493~2VĨNH QUANG|8494~2VĨNH THUẬN|8496~2VĨNH SƠN|8497~2VĨNH KIM",
  "462": "8499~3TUY PHƯỚC|8498~3DIÊU TRÌ|8500~2PHƯỚC THẮNG|8501~2PHƯỚC HƯNG|8502~2PHƯỚC HÒA|8503~2PHƯỚC QUANG|8504~2PHƯỚC SƠN|8505~2PHƯỚC HIỆP|8506~2PHƯỚC LỘC|8507~2PHƯỚC THUẬN|8508~2PHƯỚC NGHĨA|8509~2PHƯỚC AN|8510~2PHƯỚC THÀNH",
  "463": "8528~3PHÙ MỸ|8511~3BÌNH DƯƠNG|8512~2MỸ AN|8513~2MỸ CÁT|8514~2MỸ CHÁNH TÂY|8515~2MỸ CHÂU|8516~2MỸ ĐỨC|8517~2MỸ HIỆP|8518~2MỸ HÒA|8519~2MỸ LỘC|8520~2MỸ LỢI|8521~2MỸ PHONG|8522~2MỸ QUANG|8523~2MỸ TÀI|8524~2MỸ THÀNH|8525~2MỸ THỌ|8526~2MỸ THẮNG|8527~2MỸ TRINH|8529~2MỸ CHÁNH",
  "464": "8530~1LÊ HỒNG PHONG|8531~1TRẦN PHÚ|8532~1LÝ THƯỜNG KIỆT|8533~2NHƠN CHÂU|8534~2NHƠN LÝ|8535~2NHƠN HỘI|8536~2PHƯỚC MỸ|8537~2NHƠN HẢI|8538~1NGUYỄN VĂN CỪ|8539~1ĐỐNG ĐA|8540~1THỊ NẠI|8541~1HẢI CẢNG|8542~1NGÔ MÂY|8543~1GHỀNH RÁNG|8544~1QUANG TRUNG|8545~1NHƠN BÌNH|8546~1NHƠN PHÚ|8547~1BÙI THỊ XUÂN|8548~1TRẦN QUANG DIỆU|8549~1TRẦN HƯNG ĐẠO|8550~1LÊ LỢI",
  "465": "8551~3NGÔ MÂY|8552~2CÁT SƠN|8553~2CÁT MINH|8554~2CÁT TÀI|8555~2CÁT KHÁNH|8556~2CÁT LÂM|8557~2CÁT HANH|8558~2CÁT THÀNH|8559~2CÁT HẢI|8560~2CÁT HIỆP|8561~2CÁT TRINH|8562~2CÁT NHƠN|8563~2CÁT HƯNG|8564~2CÁT TƯỜNG|8565~2CÁT TÂN|8566~2CÁT TIẾN|8567~3GÒ GĂNG|8568~2CÁT THẮNG|8569~2CÁT CHÁNH",
  "466": "8570~2XUÂN THỌ 1|8571~2XUÂN THỌ 2|8572~2XUÂN HẢI|8573~2XUÂN LỘC|8574~2XUÂN BÌNH|8575~2XUÂN CẢNH|8576~2XUÂN HOÀ|8577~2XUÂN THỊNH|8578~2XUÂN PHƯƠNG|8579~2XUÂN LÂM|8580~1XUÂN PHÚ|8581~1XUÂN ĐÀI|8582~1XUÂN YÊN|8583~1XUÂN THÀNH",
  "467": "8584~2AN XUÂN|8585~2AN LĨNH|8586~2AN DÂN|8587~2AN THẠCH|8588~2AN CƯ|8589~2AN ĐỊNH|8590~2AN HÒA|8591~2AN CHẤN|8592~2AN NINH TÂY|8593~2AN THỌ|8594~3CHÍ THẠNH|8595~2AN NINH ĐÔNG|8596~2AN PHÚ|8597~2AN MỸ|8598~2AN HẢI|8599~2AN HIỆP|8600~2AN NGHIỆP",
  "468": "8601~3TÂY HOÀ|8602~2HOÀ THÀNH|8603~2HOÀ BÌNH 1|8604~2HÒA MỸ ĐÔNG|8605~2HÒA MỸ TÂY|8606~2HÒA PHONG|8607~2HÒA PHÚ|8608~2HÒA THỊNH|8609~2HÒA ĐỒNG|8610~2HÒA TÂN TÂY|8611~2SƠN THÀNH TÂY|8612~2SƠN THÀNH ĐÔNG|8613~2HÒA BÌNH 2",
  "469": "8614~3ĐÔNG HOÀ|8615~2HOÀ HIỆP BẮC|8616~2HOÀ VINH|8617~2HÒA XUÂN NAM|8618~2HÒA HIỆP TRUNG|8619~2HÒA HIỆP NAM|8620~2HÒA TÂM|8621~2HÒA TÂN ĐÔNG|8622~2HÒA THÀNH|8623~2HÒA XUÂN TÂY|8624~2HÒA XUÂN ĐÔNG",
  "470": "8625~11|8626~12|8627~13|8628~14|8629~15|8630~16|8631~17|8632~18|8633~19|8634~1PHÚ LÂM|8635~2BÌNH KIẾN|8636~2BÌNH NGỌC|8637~1PHÚ THẠNH|8638~1PHÚ ĐÔNG|18459~2HÒA KIẾN",
  "471": "8639~3LA HAI|8640~2XUÂN LÃNH|8641~2XUÂN QUANG 2|8642~2XUÂN QUANG 3|8643~2XUÂN SƠN BẮC|8644~2XUÂN SƠN NAM|8645~2XUÂN QUANG 1|8646~2XUÂN PHƯỚC|8647~2ĐA LỘC|8648~2PHÚ MỠ|8649~2XUÂN LONG 1|8650~2XUÂN LONG 2",
  "472": "8651~2HOÀ TRỊ|8652~2HOÀ THẮNG|8653~3PHÚ HOÀ|8654~2HOÀ AN|8655~2HÒA ĐỊNH TÂY|8656~2HÒA QUANG BẮC|8657~2HÒA QUANG NAM|8658~2HÒA HỘI|8659~2HÒA ĐỊNH ĐÔNG",
  "473": "8660~3CỦNG SƠN|8661~2SUỐI BẠC|8662~2SƠN HÀ|8663~2SƠN NGUYÊN|8664~2SƠN ĐỊNH|8665~2EACHARANG|8666~2KRONG PA|8667~2SƠN LONG|8668~2SƠN HỘI|8669~2SUỐI TRAI|8670~2SƠN PHƯỚC|8671~2SƠN XUÂN|8672~2PHƯỚC TÂN|8673~2CÀ LÚI",
  "474": "8685~2SÔNG HINH|8674~2EA LÂM|8675~3HAI RIÊNG|8676~2EABIA|8677~2EABÁ|8678~2EABAR|8679~2EALY|8680~2ĐỨC BÌNH TÂY|8681~2ĐỨC BÌNH ĐÔNG|8682~2TÂN LẬP|8683~2EATROL|8684~2SƠN GIANG|8686~2CHÍ THÁN",
  "475": "8687~1LỘC THỌ|8688~1NGỌC HIỆP|8689~2PHƯỚC ĐỒNG|8690~1PHƯỚC HẢI|8691~1PHƯỚC HÒA|8692~1PHƯỚC LONG|8693~1PHƯỚC TÂN|8694~1PHƯỚC TIẾN|8695~1PHƯƠNG SÀI|8696~1PHƯƠNG SƠN|8697~1TÂN LẬP|8698~1VẠN THẠNH|8699~1VĨNH HẢI|8700~2VĨNH HIỆP|8701~1VĨNH HÒA|8702~2VĨNH LƯƠNG|8703~2VĨNH NGỌC|8704~1VĨNH NGUYÊN|8705~1VĨNH PHƯỚC|8706~2VĨNH PHƯƠNG|8707~2VĨNH THÁI|8708~2VĨNH THẠNH|8709~1VĨNH THỌ|8710~2VĨNH TRUNG|8711~1VĨNH TRƯỜNG|8712~1XƯƠNG HUÂN|8713~1VẠN THẮNG",
  "476": "8740~3NINH HÒA|8714~2NINH AN|8715~2NINH BÌNH|8716~2NINH ĐA|8717~2NINH DIÊM|8718~2NINH ĐỒNG|8719~2NINH GIANG|8720~2NINH HÀ|8721~2NINH HẢI|8722~2NINH HƯNG|8723~2NINH ÍCH|8724~2NINH LỘC|8725~2NINH PHÚ|8726~2NINH PHỤNG|8727~2NINH PHƯỚC|8728~2NINH QUANG|8729~2NINH SIM|8730~2NINH SƠN|8731~2NINH TÂN|8732~2NINH TÂY|8733~2NINH THÂN|8734~2NINH THỌ|8735~2NINH THƯỢNG|8736~2NINH THỦY|8737~2NINH TRUNG|8738~2NINH VÂN|8739~2NINH XUÂN|16994~2NINH HIỆP",
  "477": "8741~2BA CỤM BẮC|8742~2BA CỤM NAM|8743~2SƠN BÌNH|8744~2SƠN HIỆP|8745~2SƠN LÂM|8746~2SƠN TRUNG|8747~2THÀNH SƠN|8748~3TÔ HẠP",
  "478": "8749~1BA NGÒI|8750~2CAM BÌNH|8751~2CAM LẬP|8752~1CAM LINH|8753~1CAM LỘC|8754~1CAM LỢI|8755~1CAM NGHĨA|8756~1CAM PHÚ|8757~1CAM PHÚC NAM|8758~2CAM PHƯỚC ĐÔNG|8759~1CAM PHÚC BẮC|8760~2CAM THÀNH NAM|8761~2CAM THỊNH ĐÔNG|8762~2CAM THỊNH TÂY|8763~1CAM THUẬN|8764~3MỸ CA",
  "479": "8782~3DIÊN KHÁNH|8765~2DIÊN BÌNH|8766~2DIÊN AN|8767~2DIÊN ĐIỀN|8768~2DIÊN ĐÔNG|8769~2DIÊN HÒA|8770~2DIÊN LẠC|8771~2DIÊN LÂM|8772~2DIÊN LỘC|8773~2DIÊN PHÚ|8774~2DIÊN PHƯỚC|8775~2DIÊN SƠN|8776~2DIÊN TÂN|8777~2DIÊN THẠNH|8778~2DIÊN THỌ|8779~2DIÊN TOÀN|8780~2DIÊN XUÂN|8781~2SUỐI HIỆP",
  "480": "8796~3KHÁNH VĨNH|8783~2CẦU BÀ|8784~2GIANG LY|8785~2KHÁNH BÌNH|8786~2KHÁNH ĐÔNG|8787~2KHÁNH HIỆP|8788~2KHÁNH NAM|8789~2KHÁNH PHÚ|8790~2KHÁNH THÀNH|8791~2KHÁNH THƯỢNG|8792~2KHÁNH TRUNG|8793~2LIÊN SANG|8794~2SƠN THÁI|8795~2SÔNG CẦU",
  "481": "8798~3TRƯỜNG SA|8797~0BÁN ĐẢO TRƯỜNG SA|8799~2SINH TỒN|8800~2SONG TỬ TÂY",
  "482": "8801~2CAM AN BẮC|8802~2CAM AN NAM|8803~2CAM HẢI ĐÔNG|8804~2CAM HẢI TÂY|8805~2CAM HIỆP BẮC|8806~2CAM HIỆP NAM|8807~2CAM HÒA|8808~2CAM PHƯỚC TÂY|8809~2CAM TÂN|8810~2CAM THÀNH BẮC|8811~2SƠN TÂN|8812~2SUỐI TÂN|8813~3CAM ĐỨC|8814~2SUỐI CÁT|8815~2SUỐI DẦU|8816~2SUỐI TIÊN|8817~2SUỐI HIỆP",
  "483": "8818~2ĐẠI LÃNH|8819~3VẠN GIÃ|8820~2VẠN BÌNH|8821~2VẠN KHÁNH|8822~2VẠN LONG|8823~2VẠN LƯƠNG|8824~2VẠN PHÚ|8825~2VẠN PHƯỚC|8826~2VẠN THẮNG|8827~2VẠN THẠNH|8828~2VẠN THỌ|8829~2XUÂN SƠN|8830~2VẠN HƯNG",
  "484": "8831~3ĐĂK HÀ|8832~2ĐĂK PXI|8833~2ĐĂK HRING|8834~2ĐĂK UI|8835~2ĐĂK MAR|8836~2NGOK WANG|8837~2NGOK RÉO|8838~2HÀ MÒN|8839~2ĐĂK LA|18461~2ĐĂK NGỌK|18465~2ĐĂK LONG",
  "485": "8840~3SA THẦY|8841~2RƠ KƠI|8842~2SA NHƠN|8843~2MO RAY|8844~2SA SƠN|8845~2SA NGHĨA|8846~2SA BÌNH|8847~2YA XIÊR|8848~2YA TĂNG|8849~2YA LY|8850~2HƠ MOONG",
  "486": "8851~2NGOK LÂY|8852~2ĐĂK NA|8853~2MĂNG RI|8854~2NGOK YÊU|8855~2ĐĂK SAO|8856~2ĐĂK RƠ ÔNG|8857~2ĐĂK HÀ|8858~2TÊ XĂNG|8859~2VĂN XUÔI|8860~2TU MƠ RÔNG|8861~2ĐẮK TƠ KAN",
  "487": "8862~3 KON PLÔNG|8863~2ĐĂK NÊN|8864~2ĐĂK RING|8865~2MĂNG BÚK|8866~2ĐĂK TĂNG|8867~2NGOK TEM|8868~2PỜ Ê|8869~2MĂNG CÀNH|8870~2ĐĂK LONG|8871~2HIẾU",
  "488": "8872~1QUANG TRUNG|8873~1QUYẾT THẮNG|8874~1DUY TÂN|8875~1TRƯỜNG CHINH|8876~1NGÔ MÂY|8877~1LÊ LỢI|8878~1TRẦN HƯNG ĐẠO|8879~1NGUYỄN TRÃI|8880~2CHƯ HRENG|8881~2HÒA BÌNH|8882~2ĐĂK BLÀ|8883~2ĐĂK RƠ VA|8884~2IA CHIM|8885~2VINH QUANG|8886~2NGỌC BAY|8887~2KROONG|8888~2ĐĂK CẤM|8889~2ĐOÀN KẾT|8890~1THẮNG LỢI|8891~1THỐNG NHẤT|8892~2ĐẮK NĂNG",
  "489": "8893~3ĐĂK TÔ|8894~2NGOK TỤ|8895~2VĂN LEM|8896~2KON ĐÀO|8897~2TÂN CẢNH|8898~2DIÊN BÌNH|8899~2PÔ KÔ|8900~2ĐĂK RƠ NGA|8901~2ĐĂK TRĂM",
  "490": "8902~3PLEI KẦN|8903~2ĐĂK ANG|8904~2ĐĂK DỤC|8905~2ĐĂK NÔNG|8906~2ĐĂK KAN|8907~2PỜ Y|8908~2SA LOONG|8909~2ĐĂK XÚ",
  "491": "8910~3ĐĂK RVE|8911~2ĐĂK KÔI|8912~2ĐĂK TƠ LÙNG|8913~2ĐĂK RUỒNG|8914~2ĐĂK PNE|8915~2ĐĂK TỜ RE|8916~2TÂN LẬP",
  "492": "8917~3ĐĂK GLEI|8918~2ĐĂK PLÔ|8919~2ĐĂK MAN|8920~2ĐĂK CHOONG|8921~2XỐP|8922~2MƯỜNG HOONG|8923~2NGỌC LINH|8924~2ĐĂK LONG|8925~2ĐĂK KROONG|8926~2ĐĂK MÔN|8927~2ĐẮK NHOONG|8928~2ĐẶ PÉK",
  "493": "8929~0IA TƠI|8930~0IA ĐAI|8931~0IA DOM",
  "494": "8941~3CHƯ PRÔNG|8944~2BÌNH GIÁO|8945~2BẦU CẠN|8946~2IA TOR|8947~2IABĂNG|8948~2IA BOÒNG|8949~2IA LÂU|8950~2IA ME|8951~2IA PHÌN|8932~2IA PIOR|8933~2IA PIA|8934~2IA VÊ|8935~2IA O|8936~2IA GAR|8937~2IA PÚCH|8938~2IA MƠR|8939~2IA BANG|8940~2IA KLY|8942~2IA DRĂNG|8943~2THĂNG HƯNG",
  "495": "8952~2IAR MOOK|8953~2KRÔNG NĂNG|8954~2IA MLÁH|8955~2ĐẤT BẰNG|8956~2IA HDREH|8957~2UAR|8958~2CHƯR CĂM|8959~3PHÚ TÚC|8960~2PHÚ CẦN|8961~2CHƯ GU|8962~2CHƯ NGỌC|8963~2IARSƯƠM|8964~2CHƯ DRĂNG|8965~2IA SAI",
  "496": "8966~3PHÚ THIỆN|8967~2AYUN HẠ|8968~2CHRÔH PƠNAN|8969~2CHƯ A THAI|8970~2IAKE|8971~2IA HIAO|8972~2IA PIAR|8973~2IA PENG|8974~2IASOL|8975~2IA YENG",
  "497": "8976~1HỘI PHÚ|8977~2AN PHÚ|8978~2DIÊN PHÚ|8979~2IAKÊNH|8980~2BIỂN HỒ|8981~2TRÀ ĐA|8982~2CHƯHDRÔNG|8983~2CHƯ Á|8984~2TÂN SƠN|8985~1CHI LĂNG|8986~1HOA LƯ|8987~1YÊN THẾ|8988~1THỐNG NHẤT|8989~1TÂY SƠN|8990~1THẮNG LỢI|8991~1ĐỐNG ĐA|8992~1YÊN ĐỔ|8993~1DIÊN HỒNG|8994~1TRÀ BÁ|8995~1IAKRING|8996~1HỘI THƯƠNG|8997~1PHÙ ĐỔNG|8998~2GÀO",
  "498": "9016~3ĐĂK ĐOA|8999~2ĐĂK SƠ MEI|9000~2HÀ ĐÔNG|9001~2ĐĂK ĐOA|9002~2NAM  YANG|9003~2ADƠK|9004~2TÂN BÌNH|9005~2H'NENG|9006~2GLAR|9007~2IA BĂNG|9008~2IA PẾT|9009~2ĐĂK KRONG|9010~2KDANG|9011~2HÀ BẦU|9012~2TRANG|9013~2KON GANG|9014~2H'NOL|9015~2HẢI YANG",
  "499": "9017~2ĐAKPƠ|9018~2CƯ AN|9019~2TÂN AN|9020~2HÀ TAM|9021~2PHÚ AN|9022~2AN THÀNH|9023~2YA HỘI|9024~2YANG BẮC",
  "500": "9025~3IAKHA|9026~2IA SAO|9027~2IA DÊR|9028~2IA YOK|9029~2IA HRUNG|9030~2IA TÔ|9031~2IA KRÁI|9032~2IA O|9033~2IA PẾCH|9034~2IACHÍA|9035~2IA BĂ|9036~2IA GRĂNG|9037~2IA KHAI|18954~0IA DOM",
  "501": "9038~3CHƯ TY|9039~2IA DƠK|9040~2IA KLA|9041~2IA NAN|9042~2IA KRÊL|9043~2IADIN|9044~2IA DOM|9045~2IA KRIÊNG|9046~2IA PNÔN|9047~2IA LANG",
  "502": "9048~3CHƯ SÊ|9049~2IA TIÊM|9050~2ALBÁ|9051~2IAPAL|9052~2KÔNGHTOK|9053~2IA BLANG|9054~2DUN|9055~2HBÔNG|9056~2BỜ NGOONG|9057~2IA GLAI|9058~2IA HLỐP|9059~2AYUN|9060~2IAKO|9061~2CHƯPƠNG|9062~2BAR MAIH",
  "503": "9063~3KBANG|9064~2 ĐÔNG|9065~2NGHĨA AN|9066~2TƠ TUNG|9067~2KON LƠNG KHƠNG|9068~2SƠ LANG|9069~2SƠ PAI|9070~2K'ROONG|9071~2ĐĂK H'LƠ|9072~2ĐĂK ROONG|9073~2ĐĂK SA MAR|9074~2KON PLA|9075~2KON PNE|9076~2LƠ KU",
  "504": "9077~3KON CHRO|9078~2KÔNG YANG|9079~2YAMA|9080~2AN TRUNG|9081~2YANG TRUNG|9082~2ĐĂK PƠ PHO|9083~2YANG NAM|9084~2CHƠ LONG|9085~2CHƯ KREI|9086~2ĐĂK KƠ NING|9087~2ĐĂK TƠ PANG|9088~2SRÓ|9089~2ĐĂK PLING|9090~2ĐĂK SONG",
  "505": "9091~3KONG DỠNG|9092~2ĐĂK ÝA|9093~2ĐĂK JRĂNG|9094~2KON THỤP|9095~2AYUN|9096~2ĐĂK JO TA|9097~2ĐÊ AR|9098~2ĐĂK TRÔI|9099~2LƠ PANG|9100~2KON CHIÊNG|9101~2HÀ RA|9102~2ĐĂK TALEY",
  "506": "9103~2CHƯ JÔR|9104~2IA PHÍ|9105~2IA KHƯƠL|9106~2IAKA|9107~2CHƯ ĐĂNG YA|9108~2ĐĂK TỜ VER|9109~2IA MƠ NÔNG|9110~2HÀ TÂY|9111~2IAKRENG|9112~3PHÚ HÒA|9113~2NGHĨA HƯNG|9114~2NGHĨA HÒA|9115~2IALY|9116~2IA NHIN|9117~2HÒA PHÚ",
  "507": "9118~3IAPA|9119~2IA TRÔK|9120~2IAMƠRƠN|9121~2IABROĂI|9122~2KIM TÂN|9123~2CHƯ RĂNG|9124~2PỜ TÓ|9125~2CHƯ MỐ|9126~2IA KDĂM|9127~2IA TUL",
  "508": "9128~3NHƠN HOÀ - H. CHƯ PƯH|9129~2IALE|9130~2IA HRÚ|9131~2CHƯDON|9132~2IARONG|9133~2IADRENG|9134~2IA PHANG|9135~2IA HLA|9136~2IA BLỨ",
  "509": "9137~1AN BÌNH|9138~1NGÔ MÂY|9139~1AN PHƯỚC|9140~1AN PHÚ|9141~1TÂY SƠN|9142~1AN TÂN|9143~2SONG AN|9144~2TÚ AN|9145~2CỬU AN|9146~2XUÂN AN|9147~2THÀNH AN",
  "510": "9148~1HÒA BÌNH|9149~1ĐOÀN KẾT|9150~1CHEO REO|9151~1SÔNG BỜ|9152~2IASAO|9153~2RBOL|9154~2CHƯ BAP|9155~2IARTÔ",
  "511": "9156~2CHƯ KBÔ|9157~2CƯ NÉ|9158~0TRUNG TÂM HUYỆN KRÔNG BU'K|9159~2CƯ PƠNG|9160~2DRÔNG|9161~2EA NGAI|9162~2PƠNGDRANG|9163~2EA SIN|9164~2TÂN LẬP",
  "512": "9176~3KRÔNG NĂNG|9165~2CƯ KLÔNG|9166~2ĐLIÊ YA|9167~2EA DĂH|9168~2EA HỒ|9169~2EA PUK|9170~2EA TAM|9171~2EA TÂN|9172~2EA TOH|9173~2PHÚ LỘC|9174~2PHÚ XUÂN|9175~2TAM GIANG",
  "513": "9177~1AN LẠC|9178~1ĐOÀN KẾT|9179~1AN BÌNH|9180~2EA DRÔNG|9181~2BÌNH THUẬN|9182~2CƯ BAO|9183~2EA SIÊN|9184~2EA BLANG|9185~1THIỆN AN|9186~1THỐNG NHẤT|9187~1ĐẠT HIẾU|9188~1BÌNH TÂN|9189~1BÌNH AN",
  "514": "9201~3EA KAR|9190~2EA LANG|9191~2CƯ HUÊ|9192~2CƯ NIÊ|9193~2CƯ PRÔNG|9194~2CƯ YANG|9195~2EA ĐAR|9196~2EA KMÚT|9197~2EA PĂL|9198~2 EA SÔ|9199~2EA TYH|9200~2XUÂN PHÚ|9202~3EA KNỐP|9203~2CƯ BÔNG|9204~2EA Ô|9205~2EA SAR|9206~2CƯ JANG",
  "515": "9207~1TÂN HOÀ|9208~1TÂN LẬP|9209~1EATAM|9210~1TÂN THÀNH|9211~1TÂN AN|9212~1KHÁNH XUÂN|9213~2HOÀ THẮNG|9214~2HOÀ THUẬN|9215~1THỐNG NHẤT|9216~1THÀNH NHẤT|9217~1TỰ AN|9218~2EAKAO|9219~2HOÀ PHÚ|9220~2HOÀ XUÂN|9221~2EATU|9222~2HOÀ KHÁNH|9223~1TÂN LỢI|9224~1THẮNG LỢI|9225~1TÂN TIẾN|9226~1THÀNH CÔNG|9227~2HÒA PHÚ|9228~2CUEBUOR",
  "516": "9229~2DRAY SÁP|9230~2DUR KMĂL|9231~2EA BÔNG|9232~2EA NA|9233~2QUẢNG ĐIỀN|9234~3BUÔN TRẤP|9235~2BĂNG A DRÊNH|9236~2BÌNH HOÀ",
  "517": "9237~2YANG TAO|9238~3LIÊN SƠN|9239~2BÔNG KRANG|9240~2BUÔN TRÍA|9241~2BUÔN TRIẾT|9242~2ĐĂK NUÊ|9243~2ĐĂK PHƠI|9244~2ĐĂK LIÊNG|9245~2EA R'BIN|9246~2KRÔNG NÔ|9247~2NAM KA",
  "518": "9259~2CƯ M'GA|9248~3QUẢNG PHÚ|9249~3EA PỐK|9250~2QUẢNG TIẾN|9251~2EA M'NANG|9252~2EA KPAM|9253~2CƯ SUÊ|9254~2CUÔR DĂNG|9255~2EA D'RƠNG|9256~2EA TUL|9257~2EA TAR|9258~2QUẢNG HIỆP|9260~2CƯ DLIÊ M'NÔNG|9261~2EA KUÊH|9262~2EA KIẾT|9263~2EA H'ĐING|9264~2EA M'DRO'H",
  "519": "9272~0TRUNG TÂM HUYỆN BUÔN ĐÔN|9265~2EA BAR|9266~2EA NUÔL|9267~2EA WER|9268~2KRÔNG NA|9269~2TÂN HOÀ|9270~2EA HUAR|9271~2CUÔR KNIA",
  "520": "9282~3EA SÚP|9273~2CƯ KBLANG|9274~2CƯ M'LAN|9275~2EA BUNG|9276~2EA LÊ|9277~2EA ROK|9278~2IA JLƠI|9279~2IA RVÊ|9280~2IA LỐP|9281~2YA TỜ MỐT",
  "521": "9283~2CƯ DRĂM|9284~2CƯ KTY|9285~2CƯ PUI|9286~2DANG KANG|9287~2EA TRUL|9288~2HÒA LỄ|9289~2HÒA PHONG|9290~3KRÔNG KMAR|9291~2HÒA SƠN|9292~2HÒA TÂN|9293~2HÒA THÀNH|9294~2KHUÊ NGỌC ĐIỀN|9295~2YANG MAO|9296~2YANG REH",
  "522": "9306~3M'ĐRĂK|9297~2CƯ KRÓA|9298~2CƯ M'TA|9299~2CƯ PRAO|9300~2EA AN|9301~2EA LAI|9302~2EA H'MLAY|9303~2EM M'DOAL|9304~2KRÔNG Á|9305~2KRÔNG JING|9307~2EA PIL|9308~2EA TRANG|9309~2EA RIÊNG|9310~2CƯ SAN",
  "523": "9313~2EA H'LEO|9311~3EA DRĂNG|9312~2CƯ A MUNG|9314~2EA TIR|9315~2EA NAM|9316~2EA KHAL|9317~2EA RAL|9318~2EA SOL|9319~2CƯ MỐT|9320~2EA HIAO|9321~2DLIÊ YANG|9322~2EA WY",
  "524": "9331~0TRUNG TÂM HUYỆN CƯ KUIN|9323~2EA NING|9324~2EA TIÊU|9325~2EA KTUR|9326~2EA BHỐK|9327~2HOÀ HIỆP|9328~2DRAY BHĂNG|9329~2EA HU|9330~2CƯ Ê WI",
  "525": "9332~2EA KÊNH|9333~2EA KLY|9334~2EA KMÊC|9335~2EA KNĂNG|9336~2EA PHÊ|9337~2HOÀ TIẾN|9338~2KRÔNG BUK|9339~2TÂN TIẾN|9340~3PHƯỚC AN|9341~2VỤ BỔN|9342~2EA HIU|9343~2EA UY|9344~2EA YIÊNG|9345~2EA YÔNG|9346~2HOÀ AN|9347~2HOÀ ĐÔNG",
  "526": "9349~3LẠC DƯƠNG|9348~2ĐẠ NHIM|9350~2LÁT|9351~2ĐẠ SAR|9352~2ĐẠ CHAIS|9353~2ĐƯNG K'NỚH",
  "527": "9354~2LỘC QUẢNG|9355~2LỘC NGÃI|9356~2LỘC ĐỨC|9357~2LỘC PHÚ|9358~2LỘC TLÂM|9359~3LỘC THẮNG|9360~2LỘC BẮC|9361~2LỘC BẢO`|9362~2LỘC AN|9363~2LỘC TÂN|9364~2LỘC THÀNH|9365~2LỘC NAM|9366~2B'LÁ|9367~2TÂN LẠC|13326~2LỘC QUẢNG",
  "528": "15371~3CÁT TIÊN|9368~2ĐỨC PHỔ|9369~2GIA VIỄN|9370~2PHƯỚC CÁT 2|9371~2QUẢNG NGÃI|9372~2TƯ NGHĨA|9373~2TIÊN HOÀNG|9374~2PHÙ MỸ|9375~2ĐỒNG NAI THƯỢNG|9376~2MỸ LÂM|9377~2NAM NINH|9378~2PHƯỚC CÁT 1|9379~3ĐỒNG NAI",
  "529": "9391~3DI LINH|9380~2ĐINH TRANG HÒA|9381~2GUNG RÉ|9382~2LIÊN ĐẦM|9383~2BẢO THUẬN|9384~2HÒA NINH|9385~2HÒA TRUNG|9386~2HÒA NAM|9387~2HÒA BẮC|9388~2SƠN ĐIỀN|9389~2GIA BẮC|9390~2TÂN LÂM|9392~2ĐINH TRANG THƯỢNG|9393~2TÂN THƯỢNG|9394~2TÂN CHÂU|9395~2TÂN NGHĨA|9396~2GIA HIỆP|9397~2ĐINH LẠC|9398~2TAM BỐ",
  "530": "9399~3ĐẠM'RI|9400~2HÀ LÂM|9401~2ĐẠM'RI|9402~2ĐẠP'LOA|9403~3MADAGOIL|9404~2ĐẠ TỒN|9405~2ĐẠ OAI|9406~2PHƯỚC LỘC|9407~2ĐOÀN KẾT|9408~2MADAGUOIL",
  "531": "9409~3NAM BAN|9410~2TÂN VĂN|9411~2ĐẠ ĐỜN|9412~2PHÚ SƠN|9413~2PHI TÔ|9414~2TÂN HÀ|9415~2LIÊN HÀ|9416~2PHÚC THỌ|9417~2HOÀI ĐỨC|9418~2ĐAN PHƯỢNG|9419~2TÂN THANH|9420~2NAM HÀ|9421~2GIA LÂM|9422~2ĐÔNG THANH|9423~2MÊ LINH|9424~3ĐINH VĂN",
  "532": "9425~12|9426~13|9427~14|9428~15|9429~16|9430~17|9431~18|9432~19|9433~110|9434~111|9435~112|9436~11|9437~2TÀ NUNG|9438~2XUÂN TRƯỜNG|9439~2XUÂN THỌ|9440~2TRẠM HÀNH",
  "533": "9441~2ĐẠ LÂY|9442~2HƯƠNG LÂM|9443~2AN NHƠN|9444~2ĐẠ PAL|9445~2HÀ ĐÔNG|9446~2TRIỆU HẢI|9447~2ĐẠ KHO|9448~3ĐÀ TẺH|9449~2QUỐC OAI|9450~2MỸ ĐỨC|9451~2QUẢNG TRỊ",
  "534": "9452~3BẰNG LĂNG|9453~2ĐAMRÔNG|9454~2ĐẠ TÔNG|9455~2ĐẠ LONG|9456~2LIÊNG S'RONH|9457~2ĐẠ RSAL|9458~2PHI LIÊNG|9459~2ĐẠ K'NĂNG|9460~2RÔ MEN",
  "535": "9461~1LỘC SƠN|9462~1LỘC TIẾN|9463~2ĐAMBRI|9464~1LỘC PHÁT|9465~11|9466~1BLAO|9467~12|9468~2ĐẠI LÀO|9469~2LỘC CHÂU|9470~2LỘC THANH|9471~2LỘC NGA",
  "536": "9472~2ĐÀ RÒN|9473~2KA ĐÔ|9474~2LẠC XUÂN|9475~2QUẢNG LẬP|9476~2TU TRA|9477~2K'ĐƠN|9478~2P'RÓH|9479~2LẠC LÂM|9480~3THẠNH MỸ|9481~3ĐRAN",
  "537": "9482~2HIỆP AN|9483~2HIỆP THẠNH|9484~2LIÊN HIỆP|9485~2BÌNH THẠNH|9486~3LIÊN NGHĨA|9487~2ĐÀ LOAN|9488~2TÀ NĂNG|9489~2PHÚ HỘI|9490~2TÂN HỘI|9491~2NINH GIA|9492~2N'THÔN HẠ|9493~2TÂN THÀNH|9494~2TÀ HINE|9495~2ĐA QUYN|9496~2NINH LOAN",
  "538": "9497~2PHƯỚC TÂN|9498~2PHƯỚC CHÍNH|9499~2PHƯỚC BÌNH|9500~2PHƯỚC HÒA|9501~2PHƯỚC TIẾN|9502~2PHƯỚC THÀNH|9503~2PHƯỚC THẮNG|9504~2PHƯỚC TRUNG|9505~2PHƯỚC ĐẠI",
  "539": "9506~3PHƯỚC DÂN|9507~2PHƯỚC THÁI|9508~2PHƯỚC HẬU|9509~2AN HẢI|9510~2PHƯỚC SƠN|9511~2PHƯỚC THUẬN|9512~2PHƯỚC HẢI|9513~2PHƯỚC HỮU|9514~2PHƯỚC VINH",
  "540": "9515~3TÂN SƠN|9516~2LƯƠNG SƠN|9517~2QUẢNG SƠN|9518~2HÒA SƠN|9519~2NHƠN SƠN|9520~2LÂM SƠN|9521~2MỸ SƠN|9522~2MA NỚI",
  "541": "9523~2PHƯỚC NAM|9524~2NHỊ HÀ|9525~2PHƯỚC DINH|9526~2PHƯỚC MINH|9527~2PHƯỚC DIÊM|9528~2PHƯỚC HÀ|9529~2CÀ NÁ|17930~2PHƯỚC NINH",
  "542": "9530~3KHÁNH HẢI|9531~2HỘ HẢI|9532~2NHƠN HẢI|9533~2PHƯƠNG HẢI|9534~2THANH HẢI|9535~2TRI HẢI|9536~2TÂN HẢI|9537~2VĨNH HẢI|9538~2XUÂN HẢI",
  "543": "9545~3THUẬN BẮC|9539~2BẮC PHONG|9540~2BẮC SƠN|9541~2CÔNG HẢI|9542~2LỢI HẢI|9543~2PHƯỚC CHIẾN|9544~2PHƯỚC KHÁNG",
  "544": "9546~2THÀNH HẢI|9547~1BẢO AN|9548~1ĐÔ VINH|9549~1PHƯỚC MỸ|9550~1ĐÀI SƠN|9551~1THANH SƠN|9552~1PHỦ HÀ|9553~1TẤN TÀI|9554~1KINH DINH|9555~1MỸ BÌNH|9556~1MỸ HƯƠNG|9557~1ĐẠO LONG|9558~1MỸ ĐÔNG|9559~1MỸ HẢI|9560~1VĂN HẢI|9561~1ĐÔNG HẢI",
  "545": "9562~3THANH BÌNH|9563~2TÂN THÀNH|9564~2HƯNG PHƯỚC|9565~2TÂN TIẾN|9566~2THIỆN HƯNG|9567~2PHƯỚC THIỆN|9568~2THANH HÒA",
  "546": "9569~3LỘC NINH|9570~2LỘC QUANG|9571~2LỘC THIỆN|9572~2LỘC PHÚ|9573~2LỘC THỊNH|9574~2LỘC THÁI|9575~2LỘC HIỆP|9576~2LỘC HƯNG|9577~2LỘC TẤN|9578~2LỘC ĐIỀN|9579~2LỘC KHÁNH|9580~2LÔC THÀNH|9581~2LỘC HÒA|9582~2LỘC AN|9583~2LỘC THẠCH|9584~2LỘC THUẬN",
  "547": "9585~1TÂN BÌNH|9586~2TIẾN HƯNG|9587~1TÂN PHÚ|9588~1TÂN THIỆN|9589~1TÂN ĐỒNG|9590~1TÂN XUÂN|9591~2TÂN THÀNH|9592~2TIẾN THÀNH",
  "548": "9593~3TÂN PHÚ|9594~2TÂN TIẾN|9595~2ĐỒNG TIẾN|9596~2ĐỒNG TÀ|9597~2THUẬN PHÚ|9598~2THUẬN LỢI|9599~2TÂN LỢI|9600~2TÂN PHƯỚC|9601~2TÂN LẬP|9602~2TÂN HÒA|9603~2ĐỒNG TÂM|9604~2TÂN HƯNG",
  "549": "9605~2TÂN KHAI|9606~2TÂN LỢI|9607~2TÂN HƯNG|9608~2AN KHƯƠNG|9609~2ĐỒNG NƠ|9610~2MINH ĐỨC|9611~2MINH TÂM|9612~2THANH AN|9613~2PHƯỚC AN|9614~2THANH BÌNH|9615~2TÂN HIỆP|9616~2AN PHÚ|9617~2TÂN QUANG",
  "550": "9618~2THANH LƯƠNG|9619~2THANH PHÚ|9620~1AN LỘC|9621~1HƯNG CHIẾN|9622~1PHÚ THỊNH|9623~1PHÚ ĐỨC|9624~2THANH BÌNH",
  "551": "9625~3CHƠN THÀNH|9626~2MINH LẬP|9627~2MINH THẮNG|9628~2NHA BÍCH|9629~2MINH THÀNH|9630~2THÀNH TÂM|9631~2MINH LONG|9632~2MINH HƯNG|9633~2QUANG MINH|9634~2TÂN QUAN",
  "552": "9635~2ĐỨC LIỄU|9636~2MINH HƯNG|9637~3ĐỨC PHONG|9638~2BOM BO|9639~2PHƯỚC SƠN|9640~2THỐNG NHẤT|9641~2NGHĨA BÌNH|9642~2ĐĂKNHAU|9643~2BÌNH MINH|9644~2ĐOÀN KẾT|9645~2PHÚ SƠN|9646~2NGHĨA TRUNG|9647~2ĐƯỜNG MƯỜI|9648~2ĐĂNG HÀ|9649~2ĐỒNG NAI|9650~2THỌ SƠN",
  "553": "9651~1PHƯỚC BÌNH|9652~1LONG PHƯỚC|9653~1THÁC MƠ|9654~1LONG THUỶ|9655~2LONG GIANG|9656~2PHƯỚC TÍN|9657~1SƠN GIANG",
  "554": "9662~2PHÚ RIỀNG|9658~2BÌNH SƠN|9659~2PHÚ TRUNG|9660~2LONG TÂN|9661~2LONG BÌNH|9663~2BÌNH TÂN|9664~2BÙ NHO|9665~2LONG HÀ|9666~2LONG HƯNG|9667~2PHƯỚC TÂN",
  "555": "9668~2BÙ GIA MẬP|9669~2BÌNH THẮNG|9670~2PHÚ VĂN|9671~2ĐẮK Ơ|9672~2PHÚ NGHĨA|9673~2PHƯỚC MINH|9674~2ĐACHIA|9675~2ĐỨC HẠNH",
  "556": "9686~3TÂN CHÂU|9676~2TÂN ĐÔNG|9677~2TÂN HÀ|9678~2TÂN HIỆP|9679~2TÂN HOÀ|9680~2TÂN HỘI|9681~2TÂN HƯNG|9682~2TÂN PHÚ|9683~2TÂN THÀNH|9684~2THẠNH ĐÔNG|9685~2SUỐI NGÔ|9687~2SUỐI DÂY",
  "557": "9688~3CHÂU THÀNH|9689~2AN BÌNH|9690~2BIÊN GIỚI|9691~2ĐỒNG KHỞI|9692~2HẢO ĐƯỚC|9693~2NINH ĐIỀN|9694~2PHƯỚC VINH|9695~2TRÍ BÌNH|9696~2AN CƠ|9697~2HOÀ HỘI|9698~2HOÀ THẠNH|9699~2LONG VĨNH|9700~2THÁI BÌNH|9701~2THANH ĐIỀN|9702~2THÀNH LONG",
  "558": "9703~11|9704~12|9705~13|9706~14|9707~2BÌNH MINH|9708~2NINH SƠN|9709~2NINH THẠNH|9710~2TÂN BÌNH|9711~2THẠNH TÂN|9712~1HIỆP NINH",
  "559": "9720~3TÂN BIÊN|9713~2TÂN BÌNH|9714~2TÂN LẬP|9715~2TÂN PHONG|9716~2THẠNH BẮC|9717~2THẠNH BÌNH|9718~2THẠNH TÂY|9719~2TRÀ VONG|9721~2HOÀ HIỆP|9722~2MỎ CÔNG",
  "560": "9726~3GÒ DẦU|9723~2PHƯỚC TRẠCH|9724~2THẠNH ĐỨC|9725~2THANH PHƯỚC|9727~2BÀU ĐÔN|9728~2CẨM GIANG|9729~2HIỆP THẠNH|9730~2PHƯỚC ĐÔNG|9731~2PHƯỚC THẠNH",
  "561": "9734~3TRẢNG BÀNG|9732~2PHƯỚC CHỈ|9733~2AN HOÀ|9735~2AN TỊNH|9736~2BÌNH THẠNH|9737~2ĐÔN THUẬN|9738~2GIA BÌNH|9739~2GIA LỘC|9740~2HƯNG THUẬN|9741~2LỘC HƯNG|9742~2PHƯỚC LƯU",
  "562": "9743~3DƯƠNG MINH CHÂU|9744~2BÀU NĂNG|9745~2PHƯỚC NINH|9746~2SUỐI ĐÁ|9747~2TRUÔNG MÍT|9748~2CHÀ LÀ|9749~2BẾN CỦI|9750~2CẦU KHỞI|9751~2LỘC NINH|9752~2PHAN|9753~2PHƯỚC MINH",
  "563": "9754~3BẾN CẦU|9755~2LỢI THUẬN|9756~2LONG CHỮ|9757~2LONG GIANG|9758~2LONG PHƯỚC|9759~2LONG THUẬN|9760~2LONG KHÁNH|9761~2TIÊN THUẬN|9762~2AN THẠNH",
  "564": "9763~2LONG THÀNH BẮC|9764~3HOÀ THÀNH|9765~2HIỆP TÂN|9766~2LONG THÀNH TRUNG|9767~2TRƯỜNG ĐÔNG|9768~2TRƯỜNG HOÀ|9769~2TRƯỜNG TÂY|9770~2HIỆP HOÀ|9771~2LONG YÊN|9772~2LONG THÀNH NAM",
  "565": "9773~1UYÊN HƯNG|9774~2VĨNH TÂN|9775~2HỘI NGHĨA|9776~1TÂN HIỆP|9777~1KHÁNH BÌNH|9778~2PHÚ CHÁNH|9779~1THÁI HÒA|9780~2BẠCH ĐẰNG|9781~2TÂN VĨNH HIỆP|9782~1THẠNH PHƯỚC|9783~2THẠNH HỘI|9784~1TÂN PHƯỚC KHÁNH",
  "566": "9785~3DĨ AN|9786~1AN BÌNH|9787~1TÂN ĐÔNG HIỆP|9788~1TÂN BÌNH|9789~1BÌNH AN|9790~1BÌNH THẮNG|9791~1ĐÔNG HÒA",
  "567": "9792~1MỸ PHƯỚC|9793~1CHÁNH PHÚ HÒA|9794~2AN ĐIỀN|9795~2AN TÂY|9796~1THỚI HÒA|9797~1HÒA LỢI|9798~1TÂN ĐỊNH|9799~2PHÚ AN",
  "568": "9800~2TRỪ VĂN THỐ|9801~2CÂY TRƯỜNG|9802~2LAI UYÊN|9803~2TÂN HƯNG|9804~2LONG NGUYÊN|9805~2HƯNG HÒA|9806~2LAI HƯNG",
  "569": "9807~2TÂN ĐỊNH|9808~2BÌNH MỸ|9809~2TÂN BÌNH|9810~2TÂN LẬP|9811~2TÂN THÀNH|9812~2ĐẤT QUỐC|9813~2HIẾU LIÊM|9814~2LẠC AN|9815~2TÂN MỸ|9816~2THƯỜNG TÂN",
  "570": "9817~1BÌNH HÒA|9818~1BÌNH CHUẨN|9819~1THUẬN GIAO|9820~1AN PHÚ|9821~2HƯNG ĐỊNH|9822~2BÌNH NHÂM|9823~1VĨNH PHÚ|9824~2AN SƠN|9825~3LÁI THIÊU|9826~3AN THẠNH",
  "571": "9827~3PHƯỚC VĨNH|9828~2AN LINH|9829~2PHƯỚC SANG|9830~2AN THÁI|9831~2AN LONG|9832~2AN BÌNH|9833~2TÂN HIỆP|9834~2TAM LẬP|9835~2TÂN LONG|9836~2VĨNH HÒA|9837~2PHƯỚC HÒA",
  "572": "9838~3DẦU TIẾNG|9839~2AN LẬP|9840~2LONG TÂN|9841~2THANH AN|9842~2THANH TUYỀN|9843~2MINH HÒA|9844~2MINH THẠNH|9845~2MINH TÂN|9846~2ĐỊNH AN|9847~2LONG HÒA|9848~2ĐỊNH THÀNH|9849~2ĐỊNH HIỆP",
  "573": "9860~1ĐỊNH HÒA|9861~2TƯƠNG BÌNH HIỆP|9862~2TÂN AN|9863~1HÒA PHÚ|9850~2CHÁNH MỸ|9851~1HIỆP THÀNH|9852~1PHÚ LỢI|9853~1PHÚ CƯỜNG|9854~1PHÚ HÒA|9855~1PHÚ THỌ|9856~1CHÁNH NGHĨA|9857~1PHÚ MỸ|9858~1HIỆP AN|9859~1PHÚ TÂN",
  "574": "9864~3TRẢNG BOM|9865~2AN VIỄN|9866~2BÀU HÀM 1|9867~2BÌNH MINH|9868~2CÂY GÁO|9869~2ĐÔNG HÒA|9870~2GIANG ĐIỀN|9871~2HƯNG THỊNH|9872~2QUẢNG TIẾN|9873~2SÔNG THAO|9874~2SÔNG TRẦU|9875~2TÂY HÒA|9876~2THANH BÌNH|9877~2TRUNG HÒA|9878~2BẮC SƠN|9879~2ĐỒI 61|9880~2HỐ NAI 3|9881~0KCN GIANG ĐIỀN|9882~0KCN HỐ NAI|9883~0KCN BÀU XÉO",
  "575": "9884~3TÂN PHÚ|9885~2PHÚ LÂM|9886~2ĐAK LUA|9887~2NAM CÁT TIÊN|9888~2NÚI TƯỢNG|9889~2PHÚ AN|9890~2PHÚ BÌNH|9891~2PHÚ ĐIỀN|9892~2PHÚ LẬP|9893~2PHÚ LỘC|9894~2PHÚ SƠN|9895~2PHÚ THANH|9896~2PHÚ THỊNH|9897~2PHÚ TRUNG|9898~2PHÚ XUÂN|9899~2TÀ LÀI|9900~2THANH SƠN|9901~2TRÀ CỔ|9902~0KCN TÂN PHÚ",
  "576": "9903~3DẦU GIÂY|9904~2GIA KIỆM (THỊ TRẤN GIA KIỆM)|9905~2GIA TÂN 1|9906~2GIA TÂN 2|9907~2GIA TÂN 3|9908~2HƯNG LỘC|9909~2LỘ 25|9910~2QUANG TRUNG|9911~2XUÂN THẠNH|9912~2XUÂN THIỆN|9913~2BÀU HÀM 2|9914~0KCN DẦU GIÂY",
  "577": "9915~2BÌNH HÒA|9916~2BÌNH LỢI|9917~2TÂN BÌNH|9918~2THẠNH PHÚ|9919~2THIỆN TÂN|9920~3VĨNH AN|9921~2TÂN AN|9922~2TRỊ AN|9923~2VĨNH TÂN|9924~2HIẾU LIÊM|9925~2MÃ ĐÀ|9926~2PHÚ LÝ|9927~2TÂN ĐỊNH|9928~0KCN THẠNH PHÚ",
  "578": "9929~2PHÚ THẠNH|9930~2PHƯỚC KHÁNH|9931~2VĨNH THANH|9932~2HIỆP PHƯỚC|9933~2PHƯỚC THIỀN|9934~2LONG THỌ|9935~2PHƯỚC AN|9936~2ĐẠI PHƯỚC|9937~2LONG TÂN|9938~2PHÚ ĐÔNG|9939~2PHÚ HỘI|9940~2PHÚ HỮU|9941~0KCN NHƠN TRẠCH 1|9942~0KCN NHƠN TRẠCH 5|9943~0KCN VINATEX TÂN TẠO|9944~0KCN DỆT MAY|9945~0KCN NHƠN TRẠCH 2|9946~0KCN NHƠN TRẠCH 3|9947~0KCN NHƠN TRẠCH 6",
  "579": "9948~1LONG BÌNH|9949~1QUANG VINH|9950~1QUYẾT THẮNG|9951~1TAM HIỆP|9952~1TAM HÒA|9953~1TÂN BIÊN|9954~2TÂN HẠNH|9955~1TÂN HIỆP|9956~1TÂN HÒA|9957~1TÂN MAI|9958~1TÂN PHONG|9959~1TÂN TIẾN|9960~1TÂN VẠN|9961~1THANH BÌNH|9962~1THỐNG NHẤT|9963~1TRẢNG DÀI|9964~1TRUNG DŨNG|9965~1AN BÌNH|9966~1BÌNH ĐA|9967~1LONG BÌNH TÂN|9968~1BỬU HÒA|9969~1BỬU LONG|9970~2HIỆP HÒA|9971~1HỐ NAI|9972~1HỐ NAI 1|9973~2HÓA AN|9974~1HÒA BÌNH|9975~2AN HÒA|9976~2LONG HƯNG|9977~2PHƯỚC TÂN|9978~2TAM PHƯỚC|9979~0KCN AMATA|9980~0KCN LONG BÌNH (LOTECO)|9981~0KCN TAM PHƯỚC|9982~0KCN BIÊN HÒA 2|9983~0KCN BIÊN HÒA 1",
  "580": "9984~2LÂM SAN|9985~3LONG GIAO|9986~2NHÂN NGHĨA|9987~2XUÂN TÂY|9988~2SÔNG RAY|9989~2XÀ BANG|9990~2XUÂN ĐÔNG|9991~2XUÂN ĐƯỜNG|9992~2XUÂN QUẾ|9993~2SÔNG NHẠN|9994~2BẢO BÌNH|9995~2XUÂN MỸ|9996~2THỪA ĐỨC|9997~2XUÂN BẢO|9998~0KCN SÔNG MÂY",
  "581": "9999~3XUÂN LỘC|10000~3GIA RAY|10001~2BẢO ĐỊNH|10002~2BẢO HÒA|10003~2SUỐI CÁT|10004~2XUÂN BẮC|10005~2XUÂN ĐỊNH|10006~2XUÂN PHÚ|10007~2XUÂN TÂM|10008~2LANG MINH|10009~2SUỐI CAO|10010~2XUÂN BẢO|10011~2XUÂN ĐÔNG|10012~2XUÂN HIỆP|10013~2XUÂN HÒA|10014~2XUÂN HƯNG|10015~2XUÂN THÀNH|10016~2XUÂN THỌ|10017~2XUÂN TOÀN|10018~2XUÂN TRƯỜNG|10019~0KCN XUÂN LỘC",
  "582": "10020~3ĐỊNH QUÁN|10021~2LA NGÀ|10022~2PHÚ CƯỜNG|10023~2PHÚ TÚC|10024~2TÚC TRƯNG|10025~2GIA CANH|10026~2NGỌC ĐỊNH|10027~2PHÚ HÒA|10028~2PHÚ LỢI|10029~2PHÚ NGỌC|10030~2PHÚ TÂN|10031~2PHÚ VINH|10032~2SUỐI NHO|10033~2THANH SƠN|10034~0KCN ĐỊNH QUÁN",
  "583": "10036~3LONG THÀNH|10035~2LONG AN|10037~2AN PHƯỚC|10038~2BÌNH AN|10039~2BÌNH SƠN|10040~2CẨM ĐƯỜNG|10041~2LỘC AN|10042~2LONG ĐỨC|10043~2SUỐI TRẦU|10044~2TAM AN|10045~2SUỐI QUÝT|10046~2BÀU TRE|10047~2PHƯỚC THÁI|10048~0KCN LONG THÀNH|10049~0KCN AN PHƯỚC|10050~0KCN LỘC AN - BÌNH SƠN|10051~0KCN LONG ĐỨC|12306~2BÀU CẠN|14346~2TÂN HIỆP|17005~2LONG PHƯỚC|13331~2PHƯỚC BÌNH|11786~2LONG PHƯỚC|14347~0KCN GÒ DẦU",
  "584": "10052~0THỊ XÃ LONG KHÁNH|10053~2BẢO ĐỊNH|10054~2BẢO QUANG|10055~2BẢO VINH|10056~2BÀU SEN|10057~2BÀU TRÂM|10058~2BÌNH LỘC|10059~2HÀNG GÒN|10060~2NÚI TRUNG|10061~1PHÚ BÌNH|10062~2SUỐI TRE|10063~2TÂN PHONG|10064~1XUÂN AN|10065~1XUÂN BÌNH|10066~1XUÂN HÒA|10067~2XUÂN LẬP|10068~2XUÂN MỸ|10069~2XUÂN TÂN|10070~1XUÂN THANH|10071~1XUÂN TRUNG",
  "585": "10072~2HÀM THẮNG|10073~2HÀM CHÍNH|10074~2HÀM LIÊM|10075~3PHÚ LONG|10076~3MA LÂM|10077~2ĐA MI|10078~2THUẬN MINH|10079~2HÀM HIỆP|10080~2HÀM TRÍ|10081~2HỒNG LIÊM|10082~2ĐÔNG TIẾN|10083~2LA DẠ|10084~2ĐÔNG GIANG|10085~2THUẬN HÒA|10086~2HÀM PHÚ|10087~2HÀM ĐỨC|10088~2HỒNG SƠN",
  "586": "10089~2NGŨ PHỤNG|10090~2LONG HẢI|10091~2TAM THANH",
  "587": "10092~3LIÊN HƯƠNG|10093~2HÒA MINH|10094~2CHÍ CÔNG|10095~2BÌNH THẠNH|10096~2PHÚ LẠC|10097~2VĨNH HẢO|10098~2PHONG PHÚ|10099~2VĨNH TÂN|10100~2PHAN DŨNG|10101~2PHƯỚC THỂ|10102~2HÒA PHÚ|10103~3PHAN RÍ CỬA",
  "588": "10104~2LẠC HÀ|10105~3LẠC TÁNH|10106~2LẠC HƯNG|10107~2ĐỒNG KHO|10108~2ĐỨC BÌNH|10109~2ĐỨC THUẬN|10110~2GIA AN|10111~2GIA HUYNH|10112~2HUY KHIÊM|10113~2LA NGÂU|10114~2ĐỨC TÂN|10115~2ĐỨC PHÚ|10116~2BẮC RUỘNG|10117~2NGHỊ ĐỨC|10118~2SUỐI KIẾT|10119~2MĂNG TỐ",
  "589": "10120~2ĐỨC CHÍNH|10121~2VÕ ĐẮC|10122~2NAM CHÍNH|10123~3ĐỨC TÀI|10124~3VÕ XU|10125~2ĐỨC HẠNH|10126~2VŨ HÒA|10127~2ĐỨC TÍN|10128~2TÂN HÀ|10129~2MÊ PU|10130~2TRÀ TÂN|10131~2ĐA KAI|10132~2ĐÔNG HÀ|10133~2SÙNG NHƠN",
  "590": "10134~1TÂN AN|10135~1TÂN THIỆN|10136~1BÌNH TÂN|10137~1PHƯỚC LỘC|10138~1PHƯỚC HỘI|10139~2TÂN PHƯỚC|10140~2TÂN TIẾN|10141~2TÂN BÌNH|10142~2TÂN HẢI",
  "591": "10143~2TÂN HÀ|10144~2TÂN NGHĨA|10145~2TÂN XUÂN|10146~2SÔNG PHAN|10147~2TÂN ĐỨC|10148~2THẮNG HẢI|10149~2TÂN THẮNG|10150~2TÂN PHÚC|10151~2SƠN MỸ|10152~3TÂN MINH|10153~3TÂN NGHĨA",
  "592": "25647~3THUẬN NAM|10154~2HÀM THẠNH|10155~2HÀM MINH|10156~2HÀM KIỆM|10157~2TÂN THUẬN|10158~2TÂN THÀNH|10159~2HÀM MỸ|10160~2THUẬN QUÝ|10161~2TÂN LẬP|10163~2MƯƠNG MÁN|10164~2MỸ THẠNH|10165~2HÀM CẦN|10166~2HÀM CƯỜNG",
  "593": "10167~3CHỢ LẦU|10168~2PHAN RÍ THÀNH|10169~3LƯƠNG SƠN|10170~2HẢI NINH|10171~2BÌNH AN|10172~2PHAN ĐIỀN|10173~2PHAN SƠN|10174~2PHAN LÂM|10175~2HỒNG PHONG|10176~2HÒA THẮNG|10177~2BÌNH TÂN|10178~2PHAN HÒA|10179~2PHAN TIẾN|10180~2SÔNG LŨY|10181~2SÔNG BÌNH|10182~2HỒNG THÁI|10183~2PHAN THANH|10184~2PHAN HIỆP",
  "594": "10185~1XUÂN AN|10186~1XUÂN AN|10187~1BÌNH HƯNG|10188~1HƯNG LONG|10189~1PHÚ THỦY|10190~1PHÚ TRINH|10191~1ĐỨC LONG|10192~1ĐỨC THẮNG|10193~1ĐỨC NGHĨA|10194~1PHÚ TÀI|10195~1THANH HẢI|10196~1PHÚ HÀI|10197~1HÀM TIẾN|10198~1LẠC ĐẠO|10199~1MŨI NÉ|10200~2THIỆN NGHIỆP|10201~2PHONG MẪN|10202~2TIẾN THÀNH|10203~2TIẾN LỢI|13322~2PHONG NẪM",
  "595": "10204~1LONG TÂM|10205~1KIM DINH|10206~1PHƯỚC HƯNG|10207~2LONG PHƯỚC|10208~1PHƯỚC NGUYÊN|10209~1LONG HƯƠNG|10210~1LONG TOÀN|10211~1PHƯỚC HIỆP|10212~1PHƯỚC TRUNG|10213~2HÒA LONG|10214~2TÂN HƯNG",
  "596": "10219~3PHÚ MỸ|10215~2HẮC DỊCH|10216~2PHƯỚC HOÀ|10217~2CHÂU PHA|10218~2HỘI BÀI|10220~2MỸ XUÂN|10221~2TÂN HẢI|10222~2TÂN HOÀ|10223~2TÂN PHƯỚC|10224~2SÔNG XOÀI|10225~2TÓC TIÊN",
  "597": "10229~2XUYÊN MỘC|10226~2PHƯỚC THUẬN|10227~0TT PHƯỚC BỬU|10228~2PHƯỚC TÂN|10230~2BÔNG TRANG|10231~2BÀU LÂM|10232~0TT HÒA BÌNH|10233~2HÒA HƯNG|10234~2HÒA HIỆP|10235~2HÒA HỘI|10236~2BƯNG RIỀNG|10237~2TÂN LÂM|10238~2BÌNH CHÂU",
  "598": "10239~0TT NGÃI GIAO|10240~0TT KIM LONG|10241~2CÙ BỊ|10242~2XÀ BANG|10243~2QUẢNG THÀNH|10244~2LÁNG LỚN|10245~2BẦU CHINH|10246~2BÌNH BA|10247~2SUỐI NGHỆ|10248~2BÌNH TRUNG|10249~2BÌNH GIÃ|10250~2XUÂN SƠN|10251~2SƠN BÌNH|10252~2SUỐI RAO|10253~2ĐÁ BẠC|10254~2NGHĨA THÀNH",
  "599": "10256~112|10258~11|10257~110|10255~111|10259~18|10260~1NGUYỄN AN NINH|10261~1THẮNG TAM|10262~12|10263~1RẠCH DỪA|10264~19|10265~1THẮNG NHẤT|10266~13|10267~14|10268~15|10269~16|10270~17|10271~2LONG SƠN|10272~1THẮNG NHÌ",
  "600": "10281~3ĐẤT ĐỎ|10273~2LONG TÂN|10274~2PHƯỚC LONG THỌ|10275~2PHƯỚC THẠNH|10276~2LÁNG DÀI|10277~2PHƯỚC HỘI|10278~2LONG MỸ|10279~2LỘC AN|10280~3PHƯỚC HẢI",
  "601": "10282~2BÀU CẠN|10283~2LONG PHƯỚC|10284~2PHƯỚC BÌNH|10285~2PHƯỚC THÁI|10286~2TÂN HIỆP",
  "602": "10287~2CÔN ĐẢO",
  "603": "10293~3LONG ĐIỀN|10288~2AN NGÃI|10289~2TAM PHƯỚC|10290~2AN NHỨT|10291~2PHƯỚC HƯNG|10292~2PHƯỚC TỈNH|10294~3LONG HẢI",
  "604": "10295~3TÂN TRỤ|10296~2BÌNH TỊNH|10297~2BÌNH TRINH ĐÔNG|10298~2TÂN PHƯỚC TÂY|10299~2ĐỨC TÂN|10300~2NHỰT NINH|10301~2MỸ BÌNH|10302~2QUÊ MỸ THẠNH|10303~2AN NHỰT TÂN|10304~2LẠC TẤN|10305~2BÌNH LÃNG",
  "605": "10306~3ĐỒNG THÀNH|10307~2MỸ QUÝ ĐÔNG|10308~2MỸ QUÝ TÂY|10309~2MỸ THẠNH BẮC|10310~2BÌNH THÀNH|10311~2BÌNH HÒA HƯNG|10312~2BÌNH HÒA NAM|10313~2BÌNH HÒA BẮC|10314~2MỸ THẠNH ĐÔNG|10315~2MỸ THẠNH TÂY|10316~2MỸ BÌNH",
  "606": "10317~3CẦN GUỘC|10318~2LONG THƯỢNG|10319~2PHƯỚC LÝ|10320~2PHƯỚC HẬU|10321~2MỸ LỘC|10322~2TÂN KIM|10323~2LONG HẬU|10324~2PHƯỚC LÂM|10325~2PHƯỚC LẠI|10326~2TRƯỜNG BÌNH|10327~2THUẬN THÀNH|10328~2LONG AN|10329~2PHƯỚC VĨNH TÂY|10330~2PHƯỚC VĨNH ĐÔNG|10331~2LONG PHỤNG|10332~2TÂN LẬP|10333~2ĐÔNG THẠNH",
  "607": "10334~3CẦN ĐƯỚC|10335~2LONG HỰU ĐÔNG|10336~2LONG HỰU TÂY|10337~2PHƯỚC ĐÔNG|10338~2TÂN CHÁNH|10339~2TÂN ÂN|10340~2TÂN LÂN|10341~2PHƯỚC TUY|10342~2MỸ LỆ|10343~2LONG ĐỊNH|10344~2TÂN TRẠCH|10345~2LONG SƠN|10346~2LONG HÒA|10347~2LONG CANG|10348~2LONG KHÊ|10349~2LONG TRẠCH|10350~2PHƯỚC VÂN|10351~2MỸ LỆ|10352~2LONG KHÊ",
  "608": "10353~3TÂN HƯNG|10354~2HƯNG HÀ|10355~2HƯNG THẠNH|10356~2THẠNH HƯNG|10357~2HƯNG ĐIỀN|10358~2VĨNH THẠNH|10359~2HƯNG ĐIỀN B|10360~2VĨNH LỢI|10361~2VĨNH CHÂU B|10362~2VĨNH CHÂU A|10363~2VĨNH ĐẠI|10364~2VĨNH BỬU",
  "609": "10365~2HIỆP THẠNH|10366~2PHƯỚC TÂN HƯNG|10367~2DƯƠNG XUÂN HỘI|10368~2LONG TRÌ|10369~2AN LỤC LONG|10370~2THANH PHÚ LONG|10371~2THANH VĨNH ĐÔNG|10372~2THUẬN MỸ|10373~3TẦM VU|10374~2BÌNH QUỚI|10375~2HÒA PHÚ|10376~2VĨNH CÔNG|10377~2PHÚ NGÃI TRỊ",
  "610": "10392~3BẾN LỨC|10378~2NHỰT CHÁNH|10379~2THẠNH ĐỨC|10380~2LONG HIỆP|10381~2PHƯỚC LỢI|10382~2LƯƠNG HÒA|10383~2LƯƠNG BÌNH|10384~2THẠNH LỢI|10385~2TÂN BỮU|10386~2THẠNH HÒA|10387~2TÂN HÒA|10388~2BÌNH ĐỨC|10389~2THẠNH PHÚ|10390~2AN THẠNH|10391~2MỸ YÊN|10393~2PHƯỚC LỢI",
  "611": "10394~3TÂN THẠNH|10395~2HẬU THẠNH TÂY|10396~2HẬU THẠNH ĐÔNG|10397~2BẮC HÒA|10398~2NHƠN HÒA LẬP|10399~2TÂN LẬP|10400~2TÂN THÀNH|10401~2TÂN NINH|10402~2NHƠN NINH|10403~2TÂN HÒA|10404~2TÂN BÌNH|10405~2NHƠN HÒA|10406~2KIẾN BÌNH",
  "612": "10407~3THẠNH HÓA|10408~2TÂN HIỆP|10409~2THUẬN BÌNH|10410~2THẠNH PHƯỚC|10411~2THẠNH PHÚ|10412~2THUẬN NGHĨA HÒA|10413~2THUỶ ĐÔNG|10414~2THỦY TÂY|10415~2TÂN TÂY|10416~2TÂN ĐÔNG|10417~2THANH AN",
  "613": "10418~3MỘC HÓA|10419~2THẠNH TRỊ|10420~2BÌNH TÂN|10421~2TUYÊN THẠNH|10422~2THẠNH HƯNG|10423~2BÌNH HIỆP|10424~2BÌNH HÒA TÂY|10425~2BÌNH HÒA TRUNG|10426~2BÌNH THẠNH|10427~2BÌNH PHONG THẠNH|10428~2TÂN LẬP|10429~2TÂN THÀNH|10430~2BÌNH HÒA ĐÔNG",
  "614": "10431~3ĐỨC HÒA|10432~2ĐỨC HÒA HẠ|10433~2ĐỨC HÒA ĐÔNG|10434~2MỸ HẠNH BẮC|10435~2MỸ HẠNH NAM|10436~3HẬU NGHĨA|10437~3HIỆP HÒA|10438~2LỘC GIANG|10439~2AN NINH TÂY|10440~2AN NINH ĐÔNG|10441~2TÂN MỸ|10442~2ĐỨC LẬP THƯỢNG|10443~2ĐỨC LẬP HẠ|10444~2HÒA KHÁNH TÂY|10445~2HÒA KHÁNH ĐÔNG|10446~2HÒA KHÁNH NAM|10447~2HỰU THÀNH|10448~2ĐỨC HÒA THƯỢNG|10449~2HIỆP HÒA|10450~2TÂN PHÚ",
  "615": "10451~3VĨNH HƯNG|10452~2HƯNG ĐIỀN A|10453~2KHÁNH HƯNG|10454~2VĨNH TRỊ|10455~2THÁI TRỊ|10456~2THÁI BÌNH TRUNG|10457~2TUYÊN BÌNH|10458~2TUYÊN BÌNH TÂY|10459~2VĨNH THUẬN|10460~2VĨNH BÌNH",
  "616": "10461~11|10462~12|10463~13|10464~14|10465~15|10466~16|10467~17|10468~1KHÁNH HẬU|10469~1TÂN KHÁNH|10470~2BÌNH TÂM|10471~2LỢI BÌNH NHƠN|10472~2HƯỚNG THỌ PHÚ|10473~2NHƠN THẠNH TRUNG|10474~2AN VĨNH NGÃI",
  "617": "10476~3THỦ THỪA|10475~2NHỊ THÀNH|10477~2LONG THẠNH|10478~2LONG THUẬN|10479~2TÂN THÀNH|10480~2MỸ LẠC|10481~2MỸ THẠNH|10482~2BÌNH AN|10483~2MỸ AN|10484~2MỸ PHÚ|10485~2BÌNH THẠNH|10486~2TÂN LẬP|10487~2LONG THÀNH",
  "618": "10488~2BÌNH HIỆP|10489~12|10490~13|10491~2THẠNH HƯNG|10492~2THẠNH TRỊ|10493~11|10494~2TUYÊN THẠNH|10495~2BÌNH TÂN",
  "619": "10496~2THÔNG BÌNH|10497~2BÌNH PHÚ|10498~2TÂN THÀNH A|10499~2TÂN THÀNH B|10500~0TT SA RÀI|10501~2TÂN HỘI CƠ|10502~2TÂN PHƯỚC|10503~2TÂN CÔNG CHÍ|10504~2AN PHƯỚC",
  "620": "10505~0TT LẤP VÒ|10506~2MỸ AN HƯNG A|10507~2MỸ AN HƯNG B|10508~2TÂN MỸ|10509~2TÂN KHÁNH TRUNG|10510~2LONG HƯNG A|10511~2LONG HƯNG B|10512~2VĨNH THẠNH|10513~2BÌNH THÀNH|10514~2ĐỊNH AN|10515~2ĐỊNH YÊN|10516~2AN ĐÔNG|10517~2BÌNH THẠNH TRUNG",
  "621": "10518~111|10519~11|10520~12|10521~2TỊNH THỚI|10522~13|10523~14|10524~16|10525~1MỸ PHÚ|10526~1HÒA THUẬN|10527~2MỸ NGÃI|10528~2MỸ TÂN|10529~2MỸ TRÀ|10530~2TÂN THUẬN TÂY|10531~2TÂN THUẬN ĐÔNG|10532~2HÒA AN",
  "622": "10533~0TT LAI VUNG|10534~2TÂN DƯƠNG|10535~2HÒA THÀNH|10536~2LONG HẬU|10537~2TÂN PHƯỚC|10538~2HÒA LONG|10539~2TÂN THÀNH|10540~2LONG THẮNG|10541~2VĨNH THỚI|10542~2TÂN HÒA|10543~2ĐỊNH HÒA|10544~2PHONG HÒA",
  "623": "10545~0TT CÁI TÀU HẠ|10546~2AN HIỆP|10547~2AN NHƠN|10548~2TÂN NHUẬN ĐÔNG|10549~2TÂN BÌNH|10550~2PHÚ TRUNG|10551~2PHÚ LONG|10552~2PHÚ THUẬN|10553~2PHÚ HỰU|10554~2AN KHÁNH|10555~2TÂN PHÚ|10556~2HÒA TÂN",
  "624": "10557~0TT HỒNG NGỰ|10558~2THƯỜNG PHƯỚC 1|10559~2BÌNH THẠNH|10560~2THƯỜNG THỚI HẬU A|10561~2TÂN HỘI|10562~2THƯỜNG THỚI HẬU B|10563~2THƯỜNG THỚI TIỀN|10564~2THƯỜNG PHƯỚC 2|10565~2THƯỜNG LẠC|10566~2LONG KHÁNH A|10567~2LONG KHÁNH B|10568~2AN BÌNH A|10569~2AN BÌNH B|10570~2LONG THUẬN|10571~2PHÚ THUẬN B|10572~2PHÚ THUẬN A",
  "625": "10573~2PHƯƠNG THỊNH|10574~2BA SAO|10575~2PHONG MỸ|10576~2TÂN NGHĨA|10577~2PHƯƠNG TRÀ|10578~2NHỊ MỸ|10579~2MỸ THỌ|10580~2TÂN HỘI TRUNG|10581~2AN BÌNH|10582~2MỸ HỘI|10583~2MỸ HIỆP|10584~2MỸ LONG|10585~2BÌNH HÀNG TRUNG|10586~2MỸ XƯƠNG|10587~2BÌNH HÀNG TÂY|10588~2BÌNH THẠNH|10589~0TT MỸ THỌ|10590~2GÁO GIỒNG",
  "626": "10591~11|10592~12|10593~13|10594~14|10595~1TÂN QUY ĐÔNG|10596~1AN HÒA|10597~2TÂN KHÁNH ĐÔNG|10598~2TÂN QUY TÂY|10599~2TÂN PHÚ ĐÔNG",
  "627": "10600~2THẠNH LỢI|10601~2HƯNG THẠNH|10602~2TRƯỜNG XUÂN|10603~2TÂN KIỀU|10604~2MỸ HÒA|10605~2MỸ QUÝ|10606~2MỸ ĐÔNG|10607~2ĐỐC BINH KIỀU|10608~0TT MỸ AN|10609~2PHÚ ĐIỀN|10610~2LÁNG BIỂN|10611~2THANH MỸ|10612~2MỸ AN",
  "628": "10613~1AN LỘC|10614~1AN THẠNH|10615~2TÂN HỘI|10616~2BÌNH THẠNH|10617~2AN BÌNH B|10618~1AN LẠC|10619~2AN BÌNH A|16988~1AN LỢI",
  "629": "10620~0TT THANH BÌNH|10621~2TÂN QUỚI|10622~2TÂN HÒA|10623~2AN PHONG|10624~2PHÚ LỢI|10625~2TÂN MỸ|10626~2BÌNH TẤN|10627~2TÂN HUỀ|10628~2TÂN BÌNH|10629~2TÂN THẠNH|10630~2TÂN PHÚ ĐÔNG|10631~2TÂN LONG|10632~2BÌNH THÀNH|16987~2TÂN PHÚ|16997~3TRÀM CHIM|18443~2TÂN PHÚ",
  "630": "10636~2TÂN CÔNG SÍNH|10637~2PHÚ ĐỨC|10638~2PHÚ THÀNH B|10639~2PHÚ THÀNH A|10640~2AN HÒA|10641~2AN LONG|10642~2PHÚ CƯỜNG|10643~2PHÚ NINH|10644~2PHÚ THỌ|10633~2PHÚ HIỆP|10634~0TT TRÀM CHIM|10635~2HÒA BÌNH",
  "631": "10645~1CHÂU PHÚ A|10646~1CHÂU PHÚ B|10647~1VĨNH MỸ|10648~1NÚI SAM|10649~2VĨNH NGƯƠN|10650~2VĨNH TẾ|10651~2VĨNH CHÂU",
  "632": "10652~2LONG HOÀ|10653~2PHÚ HIỆP|10654~3PHÚ MỸ|10655~3CHỢ VÀM|10656~2PHÚ LONG|10657~2PHÚ LÂM|10658~2PHÚ THẠNH|10659~2PHÚ AN|10660~2PHÚ XUÂN|10661~2HIỆP XƯƠNG|10662~2PHÚ BÌNH|10663~2PHÚ HƯNG|10664~2BÌNH THẠNH ĐÔNG|10665~2TÂN HOÀ|10666~2TÂN TRUNG|10667~2PHÚ THỌ|10668~2PHÚ THÀNH|10669~2HÒA LẠC",
  "633": "10670~1MỸ LONG|10671~1MỸ BÌNH|10672~1MỸ PHƯỚC|10673~1MỸ QUÝ|10674~1MỸ THỚI|10675~1MỸ THẠNH|10676~1MỸ HOÀ|10677~1ĐÔNG XUYÊN|10678~1MỸ XUYÊN|10679~1BÌNH KHÁNH|10680~1BÌNH ĐỨC|10681~2MỸ KHÁNH|10682~2MỸ HOÀ HƯNG",
  "634": "10690~3AN PHÚ|10683~2PHÚ HỘI|10684~2PHƯỚC HƯNG|10685~2VĨNH LỘC|10686~2VĨNH HẬU|10687~2VĨNH TRƯỜNG|10688~2VĨNH HỘI ĐÔNG|10689~2ĐA PHƯỚC|10691~3LONG BÌNH|10692~2KHÁNH AN|10693~2KHÁNH BÌNH|10694~2QUỐC THÁI|10695~2NHƠN HỘI|10696~2PHÚ HỮU",
  "635": "10702~3CHỢ MỚI|10697~2BÌNH PHƯỚC XUÂN|10698~2AN THẠNH TRUNG|10699~2HỘI AN|10700~2HOÀ BÌNH|10701~2HOÀ AN|10703~3MỸ LUÔNG|10704~2KIẾN AN|10705~2MỸ HỘI ĐÔNG|10706~2LONG ĐIỀN A|10707~2TẤN MỸ|10708~2LONG ĐIỀN B|10709~2KIẾN THÀNH|10710~2MỸ HIỆP|10711~2MỸ AN|10712~2NHƠN MỸ|10713~2LONG GIANG|10714~2LONG KIẾN",
  "636": "10715~2MỸ ĐỨC|10716~3CÁI DẦU|10717~2KHÁNH HOÀ|10718~2MỸ PHÚ|10719~2Ô LONG VỸ|10720~2VĨNH THẠNH TRUNG|10721~2THẠNH MỸ TÂY|10722~2BÌNH LONG|10723~2BÌNH MỸ|10724~2BÌNH THUỶ|10725~2BÌNH CHÁNH|10726~0ĐÀO HỬU CẢNH|10727~2BÌNH PHÚ",
  "637": "10728~2PHÚ LỘC|10729~2VĨNH XƯƠNG|10730~2VĨNH HOÀ|10731~2TÂN THẠNH|10732~2TÂN AN|10733~2LONG AN|10734~1LONG PHÚ|10735~2CHÂU PHONG|10736~2PHÚ VĨNH|10737~2LÊ CHÁNH|10738~1LONG SƠN|10739~1LONG CHÂU|10740~1LONG THẠNH|10741~1LONG HƯNG",
  "638": "10744~3TỊNH BIÊN|10742~3NHÀ BÀN|10743~3CHI LĂNG|10745~2NÚI VOI|10746~2NHƠN HƯNG|10747~2AN PHÚ|10748~2THỚI SƠN|10749~2VĂN GIÁO|10750~2AN CƯ|10751~2VĨNH TRUNG|10752~2TÂN LỢI|10753~2AN HẢO|10754~2TÂN LẬP|10755~2AN NÔNG",
  "639": "10756~3TRI TÔN|10757~3BA CHÚC|10758~2LẠC QƯỚI|10759~2LÊ TRÌ|10760~2VĨNH GIA|10761~2VĨNH PHƯỚC|10762~2CHÂU LĂNG|10763~2LƯƠNG PHI|10764~2LƯƠNG AN TRÀ|10765~2TÀ ĐẢNH|10766~2NÚI TÔ|10767~2AN TỨC|10768~2CÔ TÔ|10769~2TÂN TUYẾN|10770~2Ô LÂM",
  "640": "10771~3AN CHÂU|10772~2AN HOÀ|10773~2CẦN ĐĂNG|10774~2VĨNH HANH|10775~2BÌNH THẠNH|10776~2VĨNH BÌNH|10777~2BÌNH HOÀ|10778~2VÌNH AN|10779~2HOÀ BÌNH THẠNH|10780~2VĨNH LỢI|10781~2VĨNH NHUẬN|10782~2TÂN PHÚ|10783~2VĨNH THÀNH",
  "641": "10784~2ĐỊNH THÀNH|10785~2MỸ PHÚ ĐÔNG|10786~3NÚI SẬP|10787~3PHÚ HOÀ|10788~3ÓC EO|10789~2TÂY PHÚ|10790~2VĨNH TRẠCH|10791~2PHÚ THUẬN|10792~2VĨNH CHÁNH|10793~2ĐỊNH MỸ|10794~2VỌNG ĐÔNG|10795~2VĨNH KHÁNH|10796~2THOẠI GIANG|10797~2BÌNH THÀNH|10798~2VỌNG THÊ|10799~2VĨNH PHÚ|10800~2AN BÌNH|10801~2ĐỊNH THÀNH",
  "642": "10802~3CÁI VỒN|10803~2ĐÔNG THÀNH|10804~2ĐÔNG BÌNH|10805~2THUẬN AN|10806~0MỸ HÒA|10807~0ĐÔNG THẠNH|10808~2ĐÔNG THUẬN|17009~1THÀNH PHƯỚC",
  "643": "10809~0TT LONG HỒ|10810~2HÒA PHÚ|10811~0TÂN HẠNH|10812~0LỘC HÒA|10813~0LONG PHƯỚC|10814~0THANH ĐỨC|10815~0PHÚ ĐỨC|10816~0ĐỒNG PHÚ|10817~0HÒA NINH|10818~0BÌNH HÒA PHƯỚC|10819~0AN BÌNH|10820~0PHƯỚC HẬU|10821~0THẠNH QUỚI|10822~0PHÚ QUỚI|10823~0LONG AN",
  "644": "10824~0TT TÂN QƯỚI|10825~2THÀNH LỢI|10826~2TÂN LƯỢC|10827~2TÂN HƯNG|10828~0TÂN THÀNH|10829~0TÂN LƯỢC|10830~0TÂN BÌNH|10831~0TÂN AN THẠNH|10832~0THÀNH ĐÔNG|10833~0THÀNH TRUNG|10834~0THÀNH LỢI|10835~0TÂN QUỚI|10836~0NGUYỄN VĂN THẢNH|10837~0MỸ THUẬN",
  "645": "10843~0TT VŨNG LIÊM|10838~0HIẾU THUẬN|10839~0HIẾU NHƠN|10840~0TRUNG AN|10841~0HIẾU THÀNH|10842~0HIẾU NGHĨA|10844~2QƯỚI AN|10845~0TRUNG THÀNH TÂY|10846~0TRUNG THÀNH|10847~0TRUNG HIẾU|10848~0HIẾU PHỤNG|10849~0TÂN AN LUÔNG|10850~0TÂN QUỚI TRUNG|10851~0QUỚI THIỆN|10852~0TRUNG CHÁNH|10853~0TRUNG HIỆP|10854~0THANH BÌNH|10855~0TRUNG THÀNH ĐÔNG|10856~0TRUNG NGÃI|10857~0TRUNG NGHĨA",
  "646": "10863~0TT TAM BÌNH|10858~0HÒA THẠNH|10859~0HÒA HIỆP|10860~0HÒA LỘC|10861~0MỸ LỘC|10862~0PHÚ LỘC|10864~2BÌNH NINH|10865~0SONG PHÚ|10866~0PHÚ THỊNH|10867~0MỸ THẠNH TRUNG|10868~0LOAN MỸ|10869~0NGÃI TỨ|10870~0TÂN LỘC|10871~0LONG PHÚ|10872~0TƯỜNG LỘC|10873~2TÂN PHÚ|10874~2HẬU LỘC|10875~2XUÂN HIỆP|10876~2VĨNH XUÂN",
  "647": "10877~11|10878~12|10879~13|10880~14|10881~15|10882~18|10883~19|10884~2TRƯỜNG AN|10885~2TÂN NGÃI|10886~2TÂN HÒA|10887~2TÂN HỘI",
  "648": "10888~0TT TRÀ ÔN|10889~2XUÂN HIỆP|10890~0NHƠN BÌNH|10891~0HÒA BÌNH|10892~0HỰU THÀNH|10893~0VĨNH XUÂN|10894~0THUẬN THỚI|10895~0TÂN MỸ|10896~0THIỆN MỸ|10897~0TÍCH THIỆN|10898~0PHÚ THÀNH|10899~0LỤC SĨ|10900~0THỚI HÒA|10901~0TRÀ CÔN|10902~2LỤC SỸ THÀNH",
  "649": "10903~0TT CÁI NHUM|10904~2MANG THÍT|10905~0AN PHƯỚC|10906~0CHÁNH AN|10907~0BÌNH PHƯỚC|10908~0CHÁNH HỘI|10909~0MỸ AN|10910~0MỸ PHƯỚC|10911~0NHƠN PHÚ|10912~0TÂN AN HỘI|10913~0TÂN LONG HỘI|10914~0TÂN QUỚI TRUNG|10915~2TÂN LONG|10916~2LONG MỸ|10917~2HOÀ TỊNH",
  "650": "10918~3BA TRI|10919~2TÂN XUÂN|10920~2MỸ HÒA|10921~2MỸ CHÁNH|10922~2MỸ NHƠN|10923~2MỸ THẠNH|10924~2AN PHÚ TRUNG|10925~2AN NGHÃI TRUNG|10926~2TÂN HƯNG|10927~2AN NGÃI TÂY|10928~2AN HIỆP|10929~2AN BÌNH TÂY|10930~2PHÚ LỄ|10931~2PHÚ NGÃI|10932~2PHƯỚC TUY|10933~2BẢO THẠNH|10934~2BẢO THUẬN|10935~2TÂN THỦY|10936~2VĨNH HÒA|10937~2VĨNH AN|10938~2AN ĐỨC|10939~2AN HÒA TÂY|10940~2AN THỦY|10941~2TÂN MỸ|13323~2MỸ THÀNH",
  "651": "10942~3CHỢ LÁCH|10943~2PHÚ PHỤNG|10944~2VĨNH BÌNH|10945~2LONG THỚI|10946~2VĨNH THÀNH|10947~2PHÚ SƠN|10948~2VĨNH HÒA|10949~2TÂN THIỀNG|10950~2SƠN ĐỊNH|10951~2HÒA NGHĨA|10952~2HƯNG KHÁNH TRUNG|13325~2HƯNG KHÁNH TRUNG B",
  "652": "10953~3BÌNH ĐẠI|10954~2TAM HIỆP|10955~2LONG ĐỊNH|10956~2LONG HÒA|10957~2PHÚ THUẬN|10958~2CHÂU HƯNG|10959~2VANG QUỚI TÂY|10960~2VANG QUỚI ĐÔNG|10961~2THỚI LAI|10962~2PHÚ VANG|10963~2LỘC THUẬN|10964~2ĐỊNH TRUNG|10965~2PHÚ LONG|10966~2BÌNH THỚI|10967~2THẠNH TRỊ|10968~2ĐẠI HÒA LỘC|10969~2BÌNH THẮNG|10970~2THẠNH PHƯỚC|10971~2THỪA ĐỨC|10972~2THỚI THUẬN",
  "653": "10978~3MỎ CÀY NAM|10973~2TÂN TRUNG|10974~2BÌNH KHÁNH TÂY|10975~2NGÃI ĐĂNG|10976~2THÀNH THỚI A|10977~2MINH ĐỨC|10979~2BÌNH KHÁNH ĐÔNG|10980~2CẨM SƠN|10981~2AN ĐỊNH|10982~2PHƯỚC HIỆP|10983~2ĐỊNH THỦY|10984~2ĐA PHƯỚC HỘI|10985~2AN THẠNH|10986~2HƯƠNG MỸ|10987~2THÀNH THỚI B|10988~2AN THỚI|10989~2TÂN HỘI",
  "654": "10997~0TT MỎ CÀY BẮC|10990~2KHÁNH THẠNH TÂN|10991~2NHUẬN PHÚ TÂN|10992~2TÂN PHÚ TÂY|10993~2HÒA LỘC|10994~2THANH TÂN|10995~2THẠNH NGÃI|10996~2PHƯỚC MỸ TRUNG|10998~2TÂN BÌNH|10999~2THÀNH AN|11000~2HƯNG KHÁNH TRUNG A|11001~2TÂN THÀNH BÌNH|11002~2TÂN THANH TÂY|11003~2PHÚ MỸ",
  "655": "11006~3THẠNH PHÚ|11004~2THẠNH HẢI|11005~2THẠNH PHONG|11007~2PHÚ KHÁNH|11008~2ĐẠI ĐIỀN|11009~2TÂN PHONG|11010~2THỚI THẠNH|11011~2QƯỚI ĐIỀN|11012~2MỸ HƯNG|11013~2HÒA LỢI|11014~2BÌNH THẠNH|11015~2AN THẠNH|11016~2AN ĐIỀN|11017~2AN THUẬN|11018~2AN QUI|11019~2AN NHƠN|11020~2GIAO THẠNH|11021~2MỸ AN",
  "656": "11022~3GIỒNG TRÔM|11023~2PHONG NẪM|11024~2PHONG MỸ|11025~2MỸ THẠNH|11026~2LƯƠNG PHÚ|11027~2THUẬN ĐIỀN|11028~2SƠN PHÚ|11029~2PHƯỚC LONG|11030~2LONG MỸ|11031~2HƯNG PHONG|11032~2LƯƠNG HÒA|11033~2LƯƠNG QƯỚI|11034~2CHÂU HÒA|11035~2CHÂU BÌNH|11036~2BÌNH HÒA|11037~2BÌNH THÀNH|11038~2TÂN THANH|11039~2TÂN HÀO|11040~2TÂN LỢI THUẬN|11041~2THẠNH PHÚ ĐÔNG|11042~2HƯNG LỄ|11043~2HƯNG NHƯỢNG|17001~2TÂN LỢI THẠNH",
  "657": "11047~3CHÂU THÀNH|11044~2AN KHÁNH|11045~2THÀNH TRIỆU|11046~2PHÚ ĐỨC|11048~2PHÚ TÚC|11049~2TƯỜNG ĐA|11050~2TAM PHƯỚC|11051~2PHƯỚC THẠNH|11052~2HỮU ĐỊNH|11053~2TÂN THẠCH|11054~2AN PHƯỚC|11055~2GIAO LONG|11056~2AN HIỆP|11057~2QUỚI SƠN|11058~2TÂN PHÚ|11059~2MỸ THÀNH|11060~2PHÚ AN HÒA|11061~2AN HÓA|11062~2GIAO HÒA|11063~2TIÊN LONG|11064~2TIÊN THỦY|11065~2QUỚI THÀNH|11066~2SƠN HÒA",
  "658": "11067~1PHÚ KHƯƠNG|11068~2PHÚ NHUẬN|11069~2MỸ THẠNH AN|11070~11|11071~12|11072~13|11073~15|11074~1PHÚ TÂN|11075~2NHƠN THẠNH|11076~2BÌNH PHÚ|11077~2SƠN ĐÔNG|11078~2PHÚ HƯNG|11079~14|11080~16|11081~17|11082~18|13324~2MỸ THÀNH",
  "659": "11083~2TÂY YÊN|11084~2HƯNG YÊN|11085~2 ĐÔNG YÊN|11086~2NAM YÊN|11087~2ĐÔNG THÁI|11088~0TT THỨ BA|11089~2NAM THÁI|11090~2NAM THÁI A|11091~3THỨ 7|11092~2TÂY YÊN A",
  "660": "11102~0TT GIỒNG RIỀNG|11093~2HÒA THUẬN|11094~2NGỌC CHÚC|11095~2NGỌC THUẬN|11096~2NGỌC THÀNH|11097~2HÒA HƯNG|11098~2HÒA AN|11099~2VĨNH THẠNH|11100~2VĨNH PHÚ|11101~2BÀN THẠCH|11103~2LONG THẠNH|11104~2HÒA LỢI|11105~2THẠNH HÒA|11106~2THẠNH LỘC|11107~2THẠNH HƯNG|11108~2THẠNH PHƯỚC|11109~2NGỌC HÒA|11110~2THANH BÌNH|11111~2BÀN TÂN ĐỊNH",
  "661": "11112~2THẠNH YÊN|11113~2THẠNH YÊN A|11118~2AN MINH|11114~2AN MINH BẮC|11115~2MINH THUẬN|11116~2VĨNH HÒA|11117~2HÒA CHÁNH",
  "662": "11126~0TT KIÊN LƯƠNG|11119~0ẤP BÃI GIẾNG|11120~0ẤP BA TRẠI|11121~0KHU CÔNG NGHIỆP SẢN XUẤT XI MĂNG|11122~2BÌNH TRỊ|11123~2DƯƠNG HÒA|11124~2HÒA ĐIỀN|11125~2KIÊN BÌNH|11127~0NGÃ BA BA HÒN|11128~0ẤP CƯ XÁ MẠC THIÊN TỨ|11129~0KÊNH TÁM THƯỚC|11130~0ẤP NGÃ BA|11131~0ẤP BA NÚI|11132~0ẤP HÒN CHONG|11133~0ẤP LÒ BOM|11134~0ẤP BA HÒN|11135~2HÒN NGHỆ|11136~2SƠN HẢI|11137~2BÌNH AN",
  "663": "11138~2MONG THỌ A|11139~2THẠNH LỘC|11140~2MONG THỌ B|11141~0TT MINH LƯƠNG|11142~2BÌNH AN|11143~2MINH HÒA|11144~2VĨNH HÒA HIỆP|11145~0KHU CÔNG NGHIỆP CẢNG CÁ TẮC CẬU|11146~2GIỤC TƯỢNG|11147~2VĨNH HÒA PHÚ|11148~2MONG THỌ",
  "664": "11161~0TT HÒN ĐẤT|11149~0TT SÓC XOÀI|11150~0TT MỸ LÂM|11151~2BÌNH GIANG|11152~2LÌNH HUỲNH|11153~2MỸ HIỆP SƠN|11154~2MỸ PHƯỚC|11155~2MỸ THÁI|11156~2MỸ THUẬN|11157~2NAM THÁI SƠN|11158~2SƠN KIÊN|11159~2THỔ SƠN|11160~2SƠN BÌNH|11162~2BÌNH SƠN",
  "665": "11163~2PHÚ MỸ|11164~2PHÚ LỢI|11165~2TÂN KHÁNH HÒA|11166~2VĨNH ĐIỀU|11167~2VĨNH PHÚ",
  "666": "11175~0TT VĨNH THUẬN|11168~2VĨNH BÌNH BẮC|11169~2VĨNH BÌNH NAM|11170~2BÌNH THUẬN|11171~2TÂN THUẬN|11172~2VĨNH PHONG|11173~2ĐÔNG PHONG|11174~2VĨNH ĐÔNG|11176~2VĨNH THUẬN|15370~2PHONG ĐÔNG|18444~2BÌNH MINH",
  "667": "11177~1VĨNH HIỆP|11178~2PHI THÔNG|11179~1VĨNH BẢO|11180~1VĨNH THANH|11181~1VĨNH THANH VÂN|11182~1AN HÒA|11183~1VĨNH QUANG|11184~1RẠCH SỎI|11185~1 AN BÌNH|11186~1VĨNH LỢI|11187~1VĨNH THÔNG|11188~1VĨNH LẠC",
  "668": "11189~0TT TÂN HIỆP|11190~0CHỢ KINH B|11191~2TÂN HIỆP A|11192~2TÂN HIỆP B|11193~2TÂN AN|11194~2TÂN THÀNH|11195~2TÂN HỘI|11196~2THẠNH TRỊ|11197~2THẠNH ĐÔNG|11198~2THẠNH ĐÔNG A|11199~2THẠNH ĐÔNG B|11200~2TÂN HÒA",
  "669": "11201~2THỔ CHÂU|11202~0TT DƯƠNG ĐÔNG|11203~0TT AN THỚI|11204~2DƯƠNG TƠ|11205~2CỬA CẠN|11206~2GÀNH DẦU|11207~2CỬA DƯƠNG|11208~2BÃI THƠM|11209~2HÒN THƠM|11210~2HÀM NINH",
  "670": "11211~0TT GÒ QUAO|11212~2ĐỊNH AN|11213~2THỦY LIỄU|11214~2VĨNH HÒA HƯNG BẮC|11215~2VĨNH HÒA HƯNG NAM|11216~2VĨNH PHƯỚC A|11217~2VĨNH PHƯỚC B|11218~2ĐỊNH HÒA|11219~2VĨNH TUY|11220~2VĨNH THẮNG|11221~2THỚI QUẢN",
  "671": "11222~1TÔ CHÂU|11223~1PHÁO ĐÀI|11224~1BÌNH SAN|11225~1ĐÔNG HỒ|11226~2MỸ ĐỨC|11227~2 TIÊN HẢI|11228~2THUẬN YÊN",
  "672": "11229~2HÒN TRE|11230~2LẠI SƠN|11231~2AN SƠN|11232~0ĐẢO NAM DU",
  "673": "11244~3AN MINH|11233~0TT THỨ 11|11234~2ĐÔNG THẠNH|11235~2TÂN THẠNH|11236~2THUẬN HÒA|11237~2VÂN KHÁNH ĐÔNG|11238~2ĐÔNG HƯNG|11239~2ĐÔNG HƯNG A|11240~2ĐÔNG HÒA|11241~2VÂN KHÁNH TÂY|11242~2VÂN KHÁNH|11243~2ĐÔNG HƯNG B",
  "674": "11254~0TT TRÀ CÚ|11245~0TẬP SƠN|11246~0THANH SƠN|11247~0ĐÔN CHÂU|11248~0ĐÔN XUÂN|11249~0NGÃI XUYÊN|11250~0LƯU NGHIỆP ANH|11251~0PHƯỚC HƯNG|11252~0HÀM GIANG|11253~0HÀM TÂN|11255~0AN QUẢNG HỮU|11256~0TÂN HIỆP|11257~0NGỌC BIÊN|11258~0LÔNG HIỆP|11259~0KIM SƠN|11260~0TÂN SƠN|11261~2ĐẠI AN|11262~2ĐỊNH AN",
  "675": "11267~0TT DUYÊN HẢI|11263~0LONG HỮU|11264~0LONG TOÀN|11265~0LONG KHÁNH|11266~0NGŨ LẠC|11268~0DÂN THÀNH|11269~0TRƯỜNG LONG HOÀ|11270~0CỒN CÙ|11271~0LONG VĨNH|11272~0HIỆP THẠNH|11273~0ĐÔNG HẢI|13834~2ĐÔN CHÂU|18464~2ĐÔN XUÂN|18462~3LONG THÀNH|18463~12",
  "676": "11283~0TT CẦU KÈ|11274~0THẠNH PHÚ|11275~0AN PHÚ TÂN|11276~0PHONG THẠNH|11277~0PHONG PHÚ|11278~0NINH THỚI|11279~0CHÂU ĐIỀN|11280~0HOÀ ÂN|11281~0TAM NGÃI|11282~0HOÀ TÂN|11284~0THÔNG HOÀ",
  "677": "11292~0TT CÀNG LONG|11285~0PHƯƠNG THẠNH|11286~0BÌNH PHÚ|11287~0HUYỀN HỘI|11288~0TÂN AN|11289~0TÂN BÌNH|11290~0AN TRƯỜNG|11291~0NHỊ LONG|11293~0AN TRƯỜNG A|11294~0ĐẠI PHÚC|11295~0ĐẠI PHƯỚC|11296~0NHỊ LONG PHÚ|11297~0MỸ CẨM|11298~2ĐỨC MỸ",
  "678": "11307~0TT CHÂU THÀNH|11299~0SÔNG LỘC|11300~0THANH MỸ|11301~0MỸ CHÁNH|11302~0ĐA LỘC|11303~0HOÀ THUẬN|11304~0HOÀ LỢI|11305~0PHƯỚC HẢO|11306~0NGUYỆT HOÁ|11308~0LONG HOÀ|11309~0HOÀ MINH|11310~0HƯNG MỸ LƯƠNG HOÀ A|11311~2LƯƠNG HOÀ|11312~2HƯNG MỸ|11313~2TRƯỜNG LONG HOÀ|11314~2LƯƠNG HÒA A",
  "679": "11323~0TT CẦU NGANG|11315~0KIM HOÀ|11316~0VINH KIM|11317~0MỸ HOÀ|11318~0THUẬN HOÀ|11319~0LONG SƠN|11320~0HIỆP HOÀ|11321~0HIỆP MỸ TÂY|11322~0THẠNH HOÀ SƠN|11324~0MỸ LONG|11325~0NHỊ TRƯỜNG|11326~0TRƯỜNG THỌ|11327~2VĨNH KIM|11328~2MỸ LONG NAM|11329~2MỸ LONG BẮC|11330~2HIỆP MỸ ĐÔNG",
  "680": "11331~11|11332~12|11333~13|11334~14|11335~15|11336~16|11337~17|11338~18|11339~19|11340~2LONG ĐỨC|11341~2NGUYỆT HÓA",
  "681": "11349~0TT TIỂU CẦN|11342~0HIẾU TỬ|11343~0HIẾU TRUNG|11344~0HÙNG HOÀ|11345~0NGÃI HÙNG|11346~0TÂN HÙNG|11347~0PHÚ CẦN|11348~0TT CẦU QUAN|11350~0TẬP NGÃI|11351~0TÂN HOÀ|11352~0LONG THỚI",
  "682": "11355~2LONG PHÚ|11353~0TT THỊ TRẤN LONG PHÚ|11354~2TÂN THẠNH|11356~2CHÂU KHÁNH|11357~2VIÊN AN|11358~2LIÊU TÚ|11359~2ĐẠI ÂN II|11360~2TRƯỜNG KHÁNH|11361~2HẬU THẠNH|11362~2LONG ĐỨC|11363~2TÂN HƯNG|11364~2PHÚ HỮU|11365~2ĐẠI NGÃI|11366~2TRUNG BÌNH|11367~2SONG PHỤNG",
  "683": "11375~2THẠNH TRỊ|11368~2THẠNH TÂN|11369~2VĨNH THÀNH|11370~2TUÂN TỨC|11371~2LÂM TÂN|11372~2CHÂU HƯNG|11373~3PHÚ LỘC|11374~2LÂM KIẾT|11376~2VĨNH LỢI|11377~3HƯNG LỢI",
  "684": "11382~3CHÂU THÀNH|11378~2PHÚ TÂN|11379~2PHÚ TÂM|11380~2AN HIỆP|11381~2THUẬN HOÀ|11383~2TÂN HƯNG|11384~2THIỆN MỸ|11385~2HỒ ĐẮC KIỆN",
  "685": "11390~3NGÃ NĂM|11386~2VĨNH BIÊN|11387~2LONG BÌNH|11388~2MỸ BỈNH|11389~2MỸ QUỚI|11391~2VĨNH QUỚI|11392~2LONG TÂN|11393~2TÂN LONG",
  "686": "11394~3KẾ SÁCH|11395~2SONG PHỤNG|11396~2XUÂN HOÀ|11397~2AN LẠC THÔN|11398~2BA TRINH|11399~2TRINH PHÚ|11400~2AN LẠC TÂY|11401~2THỚI AN HỘI|11402~2ĐẠI HẢI|11403~2KẾ AN|11404~2KẾ THÀNH|11405~2NHƠN MỸ|11406~2AN MỸ|11407~2PHONG NẪM",
  "687": "11410~3CÙ LAO DUNG|11408~2AN THẠNH I|11409~2AN THẠNH TÂY|11411~2AN THẠNH ĐÔNG|11412~2AN THẠNH II|11413~2AN THẠNH III|11414~2ĐẠI AN I|11415~2AN THẠNH NAM",
  "688": "11417~0TT TRẦN ĐỀ|11416~0TT LỊCH HỘI THƯỢNG|11418~2ĐẠI ÂN 2|11419~2LỊCH HỘI THƯỢNG|11420~2LIÊU TÚ|11421~2TÀI VĂN|11422~2THẠNH THỚI AN|11423~2TRUNG BÌNH|11424~2VIÊN AN|11425~2VIÊN BÌNH|11426~2THẠNH THỚI THUẬN",
  "689": "11427~11|11428~17|11429~18|11430~19|11431~12|11432~13|11433~14|11434~15|11435~16|11436~110",
  "690": "11438~3MỸ XUYÊN|11437~2THAM ĐÔN|11439~2NGỌC ĐÔNG|11440~2HÒA TÚ I|11441~2GIA HÒA I|11442~2THẠNH THỚI THUẬN|11443~2THẠNH THỚI AN|11444~2VIÊN BÌNH|11445~2GIA HÒA II|11446~2THẠNH PHÚ|11447~2HÒA TÚ II|11448~2NGỌC TỐ|11449~2THẠNH QUỚI|11450~2ĐẠI TÂM|11451~2TÀI VĂN",
  "691": "11461~2MỸ TÚ|11452~2AN NINH|11453~2MỸ HƯƠNG|11454~2THIÊN MỸ|11455~2THUẬN HOÀ|11456~2MỸ THUẬN|11457~2THUẬN HƯNG|11458~3HUỲNH HỮU NGHĨA|11459~2HƯNG PHÚ|11460~2MỸ PHƯỚC|11462~2HỒ ĐẮC KIỆN|11463~2LONG HƯNG|11464~2PHÚ MỸ",
  "692": "11465~0TT VĨNH CHÂU|11466~2VĨNH CHÂU|11467~2VĨNH HIỆP|11468~2VĨNH TÂN|11469~2VĨNH PHƯỚC|11470~2LẠC HÒA|11471~2VĨNH HẢI|11472~2HÒA ĐÔNG|11473~2KHÁNH HÒA|11474~2LAI HÒA",
  "693": "11476~0TT HÒA BÌNH|11475~2VĨNH HẬU A|11477~2VĨNH BÌNH|11478~2VĨNH MỸ A|11479~2VĨNH MỸ B|11480~2VĨNH THỊNH|11481~2VĨNH HẬU|11482~2MINH DIỆU",
  "694": "11483~0TT GÀNH HÀO|11484~2LONG ĐIỀN|11485~2LONG ĐIỀN TÂY|11486~2AN TRẠCH A|11487~2AN PHÚC|11488~2ĐỊNH THÀNH|11489~2ĐỊNH THÀNH A|11490~2LONG ĐIỀN ĐÔNG A|11491~2ĐIỀN HẢI|11492~2AN TRẠCH|11493~2LONG ĐIỀN ĐÔNG",
  "695": "11494~17|11495~11|11496~18|11497~12|11498~13|11499~15|11500~1NHÀ MÁT|11501~2HIỆP THÀNH|11502~2VĨNH TRẠCH|11503~2VĨNH TRẠCH ĐÔNG",
  "696": "11509~0TT GIÁ RAI|11504~2PHONG THẠNH|11505~2PHONG THẠNH ĐÔNG|11506~2PHONG TÂN|11507~2TÂN THẠNH|11508~2PHONG THẠNH TÂY|11510~0TT HỘ PHÒNG|11511~2TÂN PHONG|11512~2PHONG THẠNH A|11513~2PHONG THẠNH ĐÔNG A",
  "697": "11514~2CHÂU HƯNG|11515~2CHÂU HƯNG A|11516~2HƯNG THÀNH|11517~2HƯNG HỘI|11518~2CHÂU THỚI|11519~2VĨNH HƯNG|11520~2VĨNH HƯNG A|11521~2LONG THẠNH|11522~3CHÂU HƯNG",
  "698": "11523~0TT NGAN DỪA|11524~2VĨNH LỘC|11525~2NINH THẠNH LỢI|11526~2NINH QUỚI|11527~2LỘC NINH|11528~2NINH QUỚI A|11529~2NINH HÒA|11530~2VĨNH LỘC A|11531~2NINH THẠNH LỢI A",
  "699": "11535~0TT PHƯỚC LONG|11536~2PHONG THẠNH TÂY A|11537~2PHONG THẠNH TÂY B|11538~2PHƯỚC LONG|11539~2HƯNG PHÚ|11532~2VĨNH THANH|11533~2VĨNH PHÚ ĐÔNG|11534~2VĨNH PHÚ TÂY",
  "700": "11549~0TT CÁI NƯỚC|11540~2LƯƠNG THẾ CHÂN|11541~2TÂN HƯNG|11542~2HƯNG MỸ|11543~2ĐÔNG THỚI|11544~2TÂN HƯNG ĐÔNG|11545~2HÒA MỸ|11546~2PHÚ HƯNG|11547~2TRẦN THỚI|11548~2THẠNH PHÚ|11550~2ĐÔNG HƯNG",
  "701": "11558~0TT NĂM CĂN|11551~2LÂM HẢI|11552~2ĐẤT MỚI|11553~2HÀM RỒNG|11554~2HÀNG VỊNH|11555~2HIỆP TÙNG|11556~2TAM GIANG|11557~2TAM GIANG ĐÔNG",
  "702": "11573~0TT ĐẦM DƠI|11559~2TẠ AN KHƯƠNG|11560~2TẠ AN KHƯƠNG ĐÔNG|11561~2AN KHƯƠNG NAM|11562~2TÂN ĐỨC|11563~2TÂN THUẬN|11564~2TRẦN PHÁN|11565~2TÂN DUYỆT|11566~2TÂN DÂN|11567~2TÂN TIẾN|11568~2QUÁCH PHẨM BẮC|11569~2QUÁCH PHẨM|11570~2NGỌC CHÁNH|11571~2THANH TÙNG|11572~2NGUYỄN HUÂN|11574~2TÂN TRUNG|18442~2TẠ AN KHƯƠNG NAM",
  "703": "11575~2TAM GIANG TÂY|11576~2ĐẤT MŨI|11577~2VIÊN AN|11578~2VIÊN AN ĐÔNG|11579~2TÂN ÂN|11580~2TÂN ÂN TÂY|13332~3RẠCH GỐC|16996~3RẠCH GỐC",
  "704": "11587~0TT U MINH|11581~2KHÁNH AN|11582~2KHÁNH TIẾN|11583~2KHÁNH HÒA|11584~2KHÁNH HỘI|11585~2KHÁNH LÂM|11586~2NGUYỄN PHÍCH|11588~2KHÁNH THUẬN",
  "705": "11597~0TT TRẦN VĂN THỜI|11589~2KHÁNH BÌNH TÂY|11590~2KHÁNH BÌNH TÂY BẮC|11591~2KHÁNH HẢI|11592~2KHÁNH HƯNG|11593~2KHÁNH LỘC|11594~2KHÁNH BÌNH ĐÔNG|11595~2KHÁNH BÌNH|11596~2TRẦN HỢI|11598~2LỢI AN|11599~2PHONG LẠC|11600~0TT SÔNG ĐỐC|11601~2PHONG ĐIỀN",
  "706": "11607~2PHÚ TÂN|11602~2NGUYỄN VIỆT KHÁI|11603~2RẠCH CHÈO|11604~2VIỆT THẮNG|11605~2TÂN HƯNG TÂY|11606~2TÂN HẢI|11608~2PHÚ MỸ|11609~2PHÚ THUẬN|11610~0TT CÁI ĐÔI VÀM",
  "707": "11611~1LÝ VĂN LÂM|11612~2TẮC VÂN|11613~2AN XUYÊN|11614~2ĐỊNH BÌNH|11615~2HÒA THÀNH|11616~11|11617~12|11618~14|11619~15|11620~16|11621~17|11622~18|11623~19|11624~1TÂN XUYÊN|11625~1TÂN THÀNH|11626~2HÒA TÂN",
  "708": "11638~0TT THỚI BÌNH|11627~2BIỂN BẠCH|11628~2BIỂN BẠCH ĐÔNG|11629~2TÂN BẰNG|11630~2TRÍ LỰC|11631~2TRÍ PHẢI|11632~2TÂN PHÚ|11633~2THỚI BÌNH|11634~2TÂN LỘC|11635~2TÂN LỘC BẮC|11636~2TÂN LỘC ĐÔNG|11637~2HỒ THỊ KỶ",
  "709": "11639~2THANH MINH|11640~1TÂN THANH|11641~1MƯỜNG THANH|11642~1HIM LAM|11643~1THANH BÌNH|11644~1THANH TRƯỜNG|11645~1NAM THANH|11646~1NOONG BUA|11647~2TÀ LÈNG",
  "710": "11648~2THANH LUÔNG|11649~2THANH HƯNG|11650~2THANH CHĂN|11651~2THANH XƯƠNG|11652~2THANH AN|11653~2THANH  YÊN|11654~2NÚA NGAM|11655~2SAM MỨN|11656~2NOONG HẸT|11657~2NÀ TẤU|11658~2MƯỜNG PỒN|11659~2THANH NƯA|11660~2NÀ NHẠN|11661~2MƯỜNG PHĂNG|11662~2NOONG LUỐNG|11663~2PA THƠM|11664~2NA Ư|11665~2MƯỜNG NHÀ|11666~2MƯỜNG LÓI|11667~2POM LÓT|11668~2HẸ MUÔNG|11669~2HUA THANH|11670~2NA TÔNG|11671~2PHU LUÔNG|11672~2PÁ KHOANG",
  "711": "11678~3ĐIỆN BIÊN ĐÔNG|11673~2LUÂN GIÓI|11674~2PÚ NHI|11675~2PHÌNH GIÀNG|11676~2PÚ HỒNG|11677~2CHIỀNG SƠ|11679~2NA SON|11680~2MƯỜNG LUÂN|11681~2NOONG U|11682~2TIA DÌNH|11683~2HÁNG LÌA|11684~2KEO LÔM|11685~2PHÌ NHỪ|11686~2XA DUNG",
  "712": "11687~1NA LAY|11688~1SÔNG ĐÀ|11689~1LAY NƯA|16993~2NẬM NÈN|16998~2MƯỜNG TÙNG|16999~2SÁ TỔNG|17007~2PA HAM|17013~2NẬM MỨC",
  "713": "11690~3MƯỜNG NHÉ|11691~2CHÀ CANG|11692~2MƯỜNG TOONG|11693~2QUẢNG LÂM|11694~2NẬM KÈ|11695~2CHUNG CHẢI|11696~2SÍN THẦU|11697~2PA TẦN|11698~2NÀ HỲ|11699~2NÀ KHOA|11700~2NÀ BÙNG|11701~2NA CÔ SA|11702~2SEN THƯỢNG|11703~2NẬM VI|11704~2PÁ MỲ|11705~2LENG SU SÌN|11706~2HUỔI LẾCH",
  "714": "11707~3MƯỜNG ÁNG|11708~2ẲNG NƯA|11709~2MƯỜNG ĐĂNG|11710~2BÚNG LAO|11711~2MƯỜNG LẠN|11712~2ẲNG TỞ|11713~2ẲNG CANG|11714~2XUÂN LAO|11715~2NẶM LỊCH|11716~2NGỐI CÁY",
  "715": "11717~2CHÀ CANG|11718~2NÀ KHOA|11719~2NÀ BÙNG|11720~2NÀ HỲ|11721~2NA CÔ SA|11722~2NẬM NHỪ|11723~2NẬM CHUA|11724~2VÀNG ĐÁN|11725~2CHÀ TỞ|11726~2NẬM KHĂN|11727~2CHÀ NƯA|11728~2PHÌN HỒ|11729~2SI PA PHÌN|11730~2NẬM TIN|11731~2PA TẦN",
  "716": "11732~3MƯỜNG CHÀ|11733~2SI PA PHÌN|11734~2MƯỜNG TÙNG|11735~2PA HAM|11736~2CHÀ NƯA|11737~2CHÀ TỞ|11738~2HỨA NGÀI|11739~2HUỔI LÈNG|11740~2SÁ TỔNG|11741~2MƯỜNG MƯƠN|11742~2NA SANG|11743~2MA THI HỒ|11744~2SA  LÔNG|11745~2PHÌN HỒ|11746~2NẬM NÈN|11747~2HUỔI MÍ|11748~2XÁ TỔNG|11749~2HẸ MUÔNG|11750~2HẸ MUÔNG|11751~2NẬM KHĂN|11752~2MƯỜNG KHONG",
  "717": "11754~3TỦA CHÙA|11753~2HUỔI SÓ|11755~2XẢ PHÌNH|11756~2MƯỜNG BÁNG|11757~2MƯỜNG ĐUN|11758~2XÁ NHÈ|11759~2SÍN CHẢI|11760~2SÍNH PHÌNH|11761~2TẢ PHÌN|11762~2TẢ SÌNH THÀNG|11763~2TRUNG THU|11764~2TỦA THÀNG|11765~2NẬM KHĂN|11766~2LAO XẢ PHÌNH",
  "718": "11775~3TUẦN GIÁO|11767~2TỎA TÌNH|11768~2MƯỜNG THÍN|11769~2TA MA|11770~2CHIỀNG SINH|11771~2MƯỜNG MUN|11772~2PHÌNH SÁNG|11773~2PÚ NHUNG|11774~2TÊNH PHÔNG|11776~2QUÀI CANG|11777~2QUÀI NƯA|11778~2QUÀI TỞ|11779~2MÙN CHUNG|11780~2NÀ SÁY|11781~2CHIỀNG ĐÔNG|11782~2MƯỜNG KHONG|11783~2PÚ XI|11784~2RẠNG ĐÔNG|11785~2NÀ TÒNG",
  "1231": "25630~1PHƯỚC LONG A|25626~1HIỆP PHÚ|25629~1PHƯỚC LONG B|25634~1PHƯỚC BÌNH|25635~1PHÚ HỮU|25633~1LONG TRƯỜNG|25632~1LONG PHƯỚC|25631~1TRƯỜNG THẠNH|25624~1LONG THẠNH MỸ|25623~1LONG BÌNH|25625~1TÂN PHÚ|25627~1TĂNG NHƠN PHÚ A|25628~1TĂNG NHƠN PHÚ B|25614~1TAM BÌNH|25611~1LINH XUÂN|25613~1LINH TRUNG|25619~1LINH TÂY|25622~1TRƯỜNG THỌ|25621~1BÌNH THỌ|25615~1TAM PHÚ|25612~1BÌNH CHIỂU|25618~1LINH CHIỂU|25616~1HIỆP BÌNH PHƯỚC|25620~1LINH ĐÔNG|25617~1HIỆP BÌNH CHÁNH|25638~1BÌNH KHÁNH|25644~1AN KHÁNH|25643~1AN LỢI ĐÔNG|25639~1BÌNH TRƯNG ĐÔNG|25644~1THỦ THIÊM|25642~1THẠNH MỸ LỢI|25641~1CÁT LÁI|25640~1BÌNH TRƯNG TÂY|25636~1THẢO ĐIỀN|25637~1AN PHÚ|25638~1BÌNH AN",
};
const _vtp_wards_parsed_cache = new Map();

function get_vtp_wards_for_dist(vtpDistId) {
  const key = String(vtpDistId || "");
  if (!key || !VTP_WARDS_RAW[key]) return [];
  if (_vtp_wards_parsed_cache.has(key)) return _vtp_wards_parsed_cache.get(key);
  const items = VTP_WARDS_RAW[key].split("|")
    .filter(Boolean)
    .map((entry) => {
      const tilde = entry.indexOf("~");
      if (tilde <= 0) return null;
      const id = Number(entry.slice(0, tilde)) || "";
      const typeCode = entry.charAt(tilde + 1);
      const shortRaw = entry.slice(tilde + 2);
      const full = (VTP_WARD_PREFIX_MAP[typeCode] || "") + shortRaw;
      const normShort = norm_vn_geo_fuzzy(shortRaw);
      const explicitKeys = [];
      if (normShort) {
        if (typeCode === "1") {
          explicitKeys.push("phuong " + normShort, "p " + normShort);
          if (/^\d{1,2}$/.test(normShort)) {
            explicitKeys.push("p" + normShort);
            if (normShort.length === 1) {
              explicitKeys.push("phuong 0" + normShort, "p 0" + normShort, "p0" + normShort);
            }
          }
        } else if (typeCode === "2") {
          explicitKeys.push("xa " + normShort, "x " + normShort);
        } else if (typeCode === "3") {
          explicitKeys.push("thi tran " + normShort, "tt " + normShort);
        }
      }
      const bareKey = !/^\d+$/.test(normShort) && normShort.length >= 3 ? normShort : "";
      return { id, full, explicitKeys, bareKey };
    })
    .filter(Boolean);
  _vtp_wards_parsed_cache.set(key, items);
  return items;
}

// Bảng quy đổi địa chỉ 2 cấp sau sáp nhập 2025 (34 tỉnh/TP, 3.321 phường/xã mới) -> 3 cấp cũ Viettel Post
const VTP_MERGER_2025_RAW = {"1":"an khanh:,3,63.53.62.56.68.65|ba dinh:,22,446.443.442.445.450.451;,1,14|ba vi:,2,22.49.23|bach mai:,9,196.201.202.205.217.206.204|bat bat:,2,41.40.45.39|bat trang:,8,175.193.186;,20,419|binh minh:,16,328.330.341.329.344;,30,593|bo de:,20,409.415.411.408.416|cau giay:,14,297.298.299.300;,25,|chuong duong:,31,610.611.612.624.606|chuong my:,6,128.124.133.125.116.132;,30,589|chuyen my:,27,532.535.517.531.514|co do:,2,29.25.30.26.28|cua nam:,1,12.7.8.10.13.9|da phuc:,7,166.168.158.155.162.145.159|dai mo:,25,497.496.498.490|dai thanh:,12,254.253.259.263.251|dai xuyen:,27,519.522.536.533.516.513.521|dan hoa:,16,339.348.334.340|dan phuong:,19,394.400.401.404.396|dinh cong:,4,75.74|doai phuong:,18,374.383.386|dong anh:,28,547.549.545.553.563.542.557.560.546|dong da:,24,480.486.469.489.481.483|dong ngac:,26,508.500.510.509.511|duong hoa:,3,67.55.57.51.69|duong noi:,30,596.597.590|gia lam:,8,174.187.193.192.173.186;,20,405|giang vo:,22,444.442.441.453.447;,24,480|ha bang:,5,108.93.102.89.94|ha dong:,30,588.584.590.585.583.595.586|hai ba trung:,9,211.207.216.213.210.215|hat mon:,15,322.305.324.323.303.304.326|hoa lac:,5,108.109.102.94;,18,374|hoa phu:,6,140.123.119|hoa xa:,13,272.286|hoai duc:,3,59.66.52.58.64|hoan kiem:,1,14.15.17.8.1.2.3.4.18.5.16.9|hoang liet:,12,258.253.251;,4,76.75|hoang mai:,4,81.73.85.72.71.80.77|hong ha:,10,221.219.220.224;,9,207.200;,20,409.408;,22,449;,1,6|hong son:,17,365.349.367.362.366.364|hong van:,31,605.608.619.623.620.621|hung dao:,21,420.438|huong son:,17,356.360.359|khuong dinh:,23,467.464.459.465.466|kien hung:,30,584.591.598|kieu phu:,21,431.428.433.430|kim anh:,7,151.149.148|kim lien:,24,477.485.486.13329.489.481.483|lang:,24,480.482|lien minh:,19,395.398.399.397|linh nam:,4,83.78.85.71;,9,200|long bien:,20,406.405.419.410|me linh:,11,247.228.233.234;,19,390.391;,28,561|minh chau:,2,36.38.24|my duc:,17,370.352.361.353.363|nam phu:,12,256.262.260.264.261.250|nghia do:,14,297.298.299.295.296;,10,223;,26,501|ngoc ha:,22,443.442.454.445.455.441.447|ngoc hoi:,12,256.249.255;,31,619|noi bai:,7,165.144.143.147.150|o cho dua:,24,475.473.469.483;,22,453|o dien:,19,389.402.390.403.391.392.393|phu cat:,21,434.435.436.437|phu dien:,26,505.501.504;,14,302|phu dong:,8,180.187.177.183.179|phu luong:,30,593.594|phu nghia:,6,130.131.118.115.117.126|phu thuong:,26,500.510;,10,224|phu xuyen:,27,539.540.518.538;,31,613.625.612|phuc loc:,15,318.314|phuc loi:,20,406.407.417|phuc son:,17,368.355.351.369|phuc thinh:,28,562.552.553.555.558.541|phuc tho:,15,308.325.309.307|phuong duc:,27,534.523.528.524.527|phuong liet:,23,463.465.460.466;,4,74|quang bi:,6,111.138.135.112.134|quang minh:,11,244.242.247.246.229.245|quang oai:,2,44.38.42.24.43.19|quoc oai:,21,424.427.423|soc son:,7,169.167.146.161.171.157.164|son dong:,3,50.53.54.61.56.60|son tay:,18,371.379.377.380.381.372.385|suoi hai:,2,20.40.46|tam hung:,16,342.343.332.345|tay ho:,10,225.221.218.223.220.222;,14,295|tay mo:,25,499.498|tay phuong:,5,98.95.107;,21,431.423|tay tuu:,26,503.507|thach that:,5,92.96.88.104.105.106|thanh liet:,23,459.461;,12,248.258;,30,586|thanh oai:,16,336.346.337.333.347.331|thanh tri:,12,252.254.260.253.250|thanh xuan:,23,458.467.464.461|thien loc:,28,544.548.561.550|thu lam:,28,549.543.553.564.542.559.557.565|thuan an:,8,187.192.184.185|thuong cat:,26,503.502.508.506.507|thuong phuc:,31,628.602.609.614.601|thuong tin:,31,618.600.603.615.616.617.622.604|tien thang:,11,242.247.237.238.246.232.241.234.229|tran phu:,6,110.139.113.136.122;,17,355|trung gia:,7,152.154.153.156|tu liem:,25,496.493.490;,14,302|tung thien:,18,377.382.385.375.373|tuong mai:,4,81.84.82.80.77;,9,196.205.217|ung hoa:,13,282.266.267.269.270.285.291.274|ung thien:,13,275.283.288|van dinh:,13,277.287.290|van mieu quoc tu giam:,24,473.472.474.470|vat lai:,2,32.35.34.33.37|viet hung:,20,417.412.415.418.416|vinh hung:,4,83.78.72;,9,208|vinh thanh:,28,551.548.556.560.546|vinh tuy:,9,208.200;,4,84|xuan dinh:,26,500.501.512;,10,223|xuan mai:,6,137.136.129.114|xuan phuong:,25,499.495.492;,26,507.504|yen bai:,2,47.21|yen hoa:,14,301.300;,23,458|yen lang:,11,235.239.238.231.236;,19,402.397|yen nghia:,30,596.592|yen so:,4,76.71;,12,252|yen xuan:,5,100.109.97.99;,21,422","2":"an dong:,33,647.649.651|an hoi dong:,44,789.790|an hoi tay:,44,786.788.789|an khanh:,1231,25644.25636.25637.25643|an lac:,46,814.823.817|an long:50,571,9828.9831.9835|an nhon:,44,784.793|an nhon tay:,36,707.705.708|an phu:50,570,9818.9820|an phu dong:,40,742.750|an thoi dong:,42,766.767|ba diem:,55,943.949.947|ba ria:53,595,10210.10206.10208.10212|bac tan uyen:50,569,9807.9811|ban co:,34,664.666.658.659.665|bau bang:50,568,9802|bau lam:53,597,10231.10237|bay hien:,35,674.675.676|ben cat:50,568,9803.9806;50,567,9792|ben thanh:,43,773.778.777.780|binh chanh:,49,860.863.862|binh chau:53,597,10238|binh co:50,565,9775;50,569,9808|binh dong:,47,829.830.828;,49,862|binh duong:50,573,9863.9857.9859;50,565,9778|binh gia:53,598,10249.10248.10243|binh hoa:50,570,9817.9823|binh hung:,49,864.867|binh hung hoa:,46,818.819;,54,930|binh khanh:,42,766.769.768|binh loi:,49,865.857|binh loi trung:,51,892.895.897|binh my:,36,698.704.699|binh phu:,32,636.635;,47,839|binh quoi:,51,900.16990|binh tan:,46,17418.816.821|binh tay:,32,641.634|binh thanh:,51,884.896.898|binh thoi:,45,805.798.803|binh tien:,32,632.633.640|binh tri dong:,46,815.819.816|binh trung:,1231,25640.25639.25637|can gio:,42,770.765|cat lai:,1231,25642.25641|cau kieu:,52,903.916.904.909|cau ong lanh:,43,774.781.780.779|chanh hiep:50,573,9860.9858.9850.9861|chanh hung:,47,827.828|chanh phu hoa:50,567,9793;50,568,9805|chau duc:53,598,10242.10241|chau pha:53,596,10217.10225|cho lon:,33,653.654.655.656|cho quan:,33,643.644.646|con dao:53,602,|cu chi:,36,690.688.689|dau tieng:50,572,9848.9838.9846.9849|di an:50,566,9785.9786.9787|dien hong:,38,729.721.723|dong hoa:50,566,9790.9789.9791|dong hung thuan:,40,745.748.747|dong thanh:,55,945.941.948|duc nhuan:,52,906.907.908|gia dinh:,51,892.894.888.902.901|go vap:,44,797.791|hanh thong:,44,782.792|hiep binh:,1231,25620.25617.25616|hiep phuoc:,37,711.710.714|ho tram:53,597,10227.10228.10226|hoa binh:,45,800.809|hoa hiep:53,597,10234|hoa hoi:53,597,10232.10235.10233|hoa hung:,38,727.728.729.730|hoa loi:50,567,9797.9798|hoc mon:,55,951.944.950|hung long:,49,869.870.866|khanh hoi:,48,852.845.847.841.840|kim long:53,598,10240.10245.10244|lai thieu:50,570,9822.9823.9825|linh xuan:,1231,25619.25613.25611|long binh:,1231,25624.25623|long hoa:50,572,9844.9847.9840.9845|long huong:53,595,10205.10209.10214|long nguyen:50,567,9792.9794;50,568,9804|long phuoc:,1231,25631.25632|long son:53,599,10271|long truong:,1231,25633.25635|minh phung:,45,812.810.802|minh thanh:50,572,9844.9843.9845|ngai giao:53,598,10239.10246.10247|nghia thanh:53,598,10253.10254|nha be:,37,713.709.715.712|nhieu loc:,34,668.669.662.671|nhuan duc:,36,695.694.693|phu an:50,573,9858.9862;50,567,9799|phu dinh:,47,837.838.839|phu giao:50,571,9827.9832.9834|phu hoa dong:,36,700.696.697|phu lam:,32,637.638.639|phu loi:50,573,9851.9854.9852|phu my:53,596,10219.10220|phu nhuan:,52,911.912.914.916.910|phu thanh:,54,934.939.936|phu tho:,45,806.811.803|phu tho hoa:,54,932.937.929|phu thuan:,39,738.740|phuoc hoa:50,571,9837.9834.9836|phuoc long:,1231,25629.25630.25634|phuoc thang:53,599,10255.10256|phuoc thanh:50,571,9830.9829.9833|rach dua:53,599,10257.10263.10265|sai gon:,43,776.773.772|tam binh:,1231,25612.25614.25615|tam long:53,595,10204.10213.10207|tam thang:53,599,10260.10270.10259.10264|tan an hoi:,36,701.687.691|tan binh:,35,677.672|tan dinh:,43,776.775|tan dong hiep:50,566,9788.9787;50,565,9779|tan hai:53,596,10221.10222|tan hiep:50,565,9777.9776|tan hoa:,35,680.679.673|tan hung:,39,733.734.731.735|tan khanh:50,565,9781.9783.9782.9784.9779|tan my:,39,732|tan nhut:,49,858.861.871|tan phu:,54,935.938.929.936|tan phuoc:53,596,10216.10223|tan son:,35,686|tan son hoa:,35,681.682.683|tan son nhat:,35,684.685.678|tan son nhi:,54,930.932.931|tan tao:,46,821.822|tan thanh:53,596,10215.10224|tan thoi hiep:,40,743.751|tan thuan:,39,739.736.737|tan uyen:50,565,9773.9780;50,569,9810.9815|tan vinh loc:,49,868.856|tang nhon phu:,1231,25628.25627.25625.25624.25626|tay nam:50,572,9842.9839;50,567,9795|tay thanh:,54,933|thai my:,36,702.703.706|thanh an:50,572,9839.9849.9841;,42,771|thanh my tay:,51,891.899.890|thoi an:,40,741.749|thoi hoa:50,567,9796|thong tay hoi:,44,785.795|thu dau mot:50,573,9851.9856.9853.9855.9850|thu duc:,1231,25619.25618.25620.25621.25622|thuan an:50,570,9821.9826.9824|thuan giao:50,570,9818.9819|thuong tan:50,569,9814.9813.9816.9815|tru van tho:50,568,9800.9802|trung my tay:,40,746.744|vinh hoi:,48,845.846.847.843|vinh loc:,49,868.855|vinh tan:50,565,9774;50,569,9809|vung tau:53,599,10258.10262.10266.10267.10268.10272.10261|vuon lai:,38,716.725.717.724.719|xom chieu:,48,853.852.854.850|xuan hoa:,34,658|xuan son:53,598,10250.10251.10252|xuan thoi son:,55,940.946.942|xuyen moc:53,597,10230.10236.10229","3":"ai quoc:12,135,1960|an bien:,58,971.973.983.984|an duong:,59,992.990.989.986|an hai:,59,992.994.990.1000|an hung:,63,1033.1037.1039|an khanh:,63,1028.1038.1042|an lao:,63,1041.1034.1042.1027.1026.1032|an phong:,59,997.998.996|an phu:12,141,2102.2107|an quang:,63,1035.1031.1036|an thanh:12,146,2225.2228.2233|an truong:,63,1040.1029.1030|bac an phu:12,142,2122.2130.2141|bac thanh mien:12,140,2084.2080.2082|bach dang:,67,1102|binh giang:12,144,2184.2177.2169.2170.2173|cam giang:12,139,2055.2067.2054.2066.2070|chan hung:,69,1158.1147.1146.1159|chi linh:12,143,2159.2149.2166|chi minh:12,137,2013.2012|chu van an:12,143,2148.2150.2162.2161.2164.2165|dai son:12,137,2014.2021;12,138,2028|do son:,57,966.968;,62,1025|dong hai:,70,1176.1172.1168|duong an:12,144,2181.2176|duong kinh:,62,1022.1023.1024.1025|gia loc:12,145,2209.2216|gia phuc:12,145,2209.2187.2214.2198.2211|gia vien:,68,1137.1138.1142.1135.1134|ha bac:12,138,2023.2026|ha dong:12,138,2029|ha nam:12,138,2024.2042.2031.2044|ha tay:12,138,2046.2028|hai an:,70,1170.1171.1169.1173.1175.1168|hai duong:12,135,1965.1949.1946.1951|hai hung:12,140,2088.2085.2077|hoa binh:,67,1114.1120|hong an:,56,962;,59,996|hong bang:,56,952.961.953.954.960.958;,68,1142|hong chau:12,136,1975.1993.1989|hop tien:12,141,2111.2115.2116|hung dao:,62,1022.1020.1023.1021|hung thang:,69,1160.1161|ke sat:12,144,2184.2171.2183|khuc thua du:12,136,1972|kien an:,65,1073.1074.1076.1081|kien hai:,61,1016.1015.1018.1017|kien hung:,61,1014.1015|kien minh:,61,1019.1003.1005|kien thuy:,61,1002.1006.1004.1007|kim thanh:12,146,2222.2235|kinh mon:12,142,2119.2125.2145|lac phuong:12,137,2004|lai khe:12,146,;12,138,|le chan:,58,975.976.978.983.984;,68,1135.1134|le dai hanh:12,143,2146.2151.2160|le ich moc:,67,1128|le thanh nghi:12,135,1958.1953.1948.1950|luu kiem:,67,1110|mao dien:12,139,2068.2053|nam an phu:12,142,2129.2140|nam do son:,57,966.963.964.967|nam dong:12,135,1962|nam sach:12,141,2099.2108.2110|nam thanh mien:12,140,2074.2075.2089|nam trieu:,67,1123.1126|nghi duong:,61,1008.1010.1009|ngo quyen:,68,1139.1138.1142.1144.1141|nguyen binh khiem:,64,1061.1067.1068|nguyen dai nang:12,142,2124.2131.2139|nguyen giap:12,137,2010.2019.2020.1999|nguyen luong bang:12,140,2087.2091.2078;12,144,2174|nguyen trai:12,143,2163.2147.2152|nhi chieu:12,142,2143.2134.2123.2137|ninh giang:12,136,1970.1968.1994.1991|pham su manh:12,142,2121.2127|phu lien:,65,1074.1076.1077.1081.1082;,63,1026|phu thai:12,146,2241.2224.2229.2234;12,142,2144|quyet thang:,69,1150.1151.1164|tan an:12,136,1992.1986|tan hung:12,135,1963.1948.1947|tan ky:12,137,2021.2016.1995.2007|tan minh:,69,1154.1153.1155|thach khoi:12,135,1964|thai tan:12,141,2096.2112.2106|thanh dong:12,135,1956.1954.1945|thanh ha:12,138,2036.2032|thanh mien:12,140,2086.2090.2093.2073|thien huong:,67,1095.1100|thuong hong:12,144,2178.2179.2176.2168|thuy nguyen:,67,1127.1100.1101.1120|tien lang:,69,1145.1162.1149.1152|tien minh:,69,1167.1157|tran hung dao:12,143,2150.2155.2157|tran lieu:12,142,2120.2126.2144|tran nhan tong:12,143,2154.2153.2165|tran phu:12,141,2095.2109|truong tan:12,145,2187.2203.2212|tu ky:12,137,2009.1996.2001.2003|tu minh:12,139,2052.2071;12,135,1955|tue tinh:12,139,2060.2061.2063|viet hoa:12,139,2071.2062;12,135,1952|viet khe:,67,|vinh am:,64,1065.1055.1056|vinh bao:,64,1047.1072.1046|vinh hai:,64,1053|vinh hoa:,64,1071|vinh lai:12,136,1978.1985.1987|vinh thinh:,64,1048.1069.1070|vinh thuan:,64,1062.1063.1066|yet kieu:12,145,2213.2216.2219","4":"an hai:,75,1216.1213|an khe:,71,1180.1182;,72,1186|an thang:38,433,8115.8123.8127|avuong:38,431,8098|ba na:,79,1246.1254|ban thach:38,428,8053.8061.8054|ben giang:38,426,8019.8020.8028|ben hien:38,429,8074.8065|cam le:,71,1177.1179.1178|chien dan:38,423,7986.7977.7985|dac pring:38,426,8022|dai loc:38,425,8000.8006.8004.8012.8009|dien ban:38,433,8119.8120.8121|dien ban bac:38,433,8122.8126.8131|dien ban dong:38,433,8124.8125.8118.8114.8116|dien ban tay:38,433,8128.8130.8129|dong duong:38,427,8037.8038|dong giang:38,429,8073.8071.8072|duc phu:38,436,8162.8170|duy nghia:38,440,8208.8217.8218|duy xuyen:38,440,8216.8212.8211|go noi:38,433,8134.8132.8117|ha nha:38,425,8003.8017.8001|hai chau:,74,1208.1204.1203.1202|hai van:,76,1221.1222;,79,1247|hiep duc:38,439,8205|hoa cuong:,74,1209.1206.1199.1211|hoa khanh:,76,1220.1223;,79,1245|hoa tien:,79,1253.1251|hoa vang:,79,1249.1248|hoa xuan:,79,1252.1250;,71,1181|hoang sa:,77,|hoi an:38,437,8183.8177.8184.8176.8178|hoi an dong:38,437,8182.8180.8175|hoi an tay:38,437,8174.8181.8173.8179|hung son:38,431,8090.8089.8091|huong tra:38,428,8059.8057.8052|kham duc:38,424,7996.7999|la dee:38,426,8023.8027|la ee:38,426,8029|lanh ngoc:38,432,8102.8109.8110|lien chieu:,76,1219;,79,1244|nam giang:38,426,|nam phuoc:38,440,8209.8214.8215|nam tra my:38,438,8191.8194|ngu hanh son:,73,1196.1197.1198.1195|nong son:38,434,|nui thanh:38,436,8171.8156.8166.8159.8160|phu ninh:38,423,7978.7985.7987|phu thuan:38,425,8005.8013.8010.8016|phuoc chanh:38,424,7992.7991|phuoc hiep:38,424,7997.7998|phuoc nang:38,424,7995.7993.7994|phuoc thanh:38,424,7988.7989.7990|phuoc tra:38,439,8203.8202.8201|quang phu:38,428,8064.8062.8063|que phuoc:38,434,|que son:38,434,8146.8143.8148.8144.8145|que son trung:38,434,8142.8141.8140|son cam ha:38,432,8105.8103.8113|son tra:,75,1218.1215.1212|song kon:38,429,8070.8069.8068|song vang:38,429,8067.8066|tam anh:38,436,8167.8165.8157|tam hai:38,436,8161|tam ky:38,428,8058.8056.8060|tam my:38,436,8163.8172.8168|tam xuan:38,436,8158.8169.8164|tan hiep:38,437,8185|tay giang:38,431,8097.8096.8092.8093|tay ho:38,423,7983.7979.7982.7984|thang an:38,427,8032.8050.8034.8043.8045|thang binh:38,427,8030.8031.8044.8040|thang dien:38,427,8036.8048.8035|thang phu:38,427,8051.8049|thang truong:38,427,8047.8033.8041|thanh binh:38,432,8108.8100.8106.8107|thanh khe:,72,1184.1190.1187.1192.1185|thanh my:38,426,8018|thu bon:38,440,8213.8210.8220.8221|thuong duc:38,425,8008.8002.8007|tien phuoc:38,432,8099.8112.8101.8104|tra doc:38,430,8081.8077|tra giap:38,430,8086.8085|tra leng:38,438,8188.8191|tra lien:38,430,8079.8087.8084|tra linh:38,438,8195.8192|tra my:38,430,8076.8082.8078.8088|tra tan:38,430,8083.8080|tra tap:38,438,8190.8193|tra van:38,438,8187.8189|viet an:38,439,8200.8207.8199.8206|vu gia:38,425,8015.8011.8014|xuan phu:38,434,8135.8147.8137.8136","5":"an binh:,91,1340;,82,1286;,87,1313|an lac thon:61,686,11396.11397.11399|an ninh:61,684,11380|an thanh:61,687,11411.11409.11410|binh thuy:,91,1335.1336.1339|cai khe:,82,1288.1276;,91,1339|cai rang:,89,1321.1319.1322.1323|chau thanh:8,105,1562.1561.1559|co do:,90,1333.1329.1330|cu lao dung:61,687,11415|dai hai:61,686,11402.11398|dai ngai:61,682,11365.11362|dai thanh:8,107,1577.1576.1578|dong hiep:,90,1324.1328;,81,1271|dong phuoc:8,105,1554.1560;8,103,1536|dong thuan:,81,1273.1274|gia hoa:61,690,11449|hiep hung:8,108,1584.1580|ho dac kien:61,684,11384.11385|hoa an:8,108,1579.1587|hoa luu:8,102,1524.1523.1525|hoa tu:61,690,|hung phu:,89,1318.1317.1320|ke sach:61,686,11394.11404.11403|khanh hoa:61,692,11467.11472.11473|lai hoa:61,692,11474|lam tan:61,683,11370.11374.11371|lich hoi thuong:61,688,11419|lieu tu:61,688,11425.11420|long binh:8,109,1595.1601.1602|long hung:61,691,11459.11463|long my:8,109,1600.1596.1597|long phu:61,682,11355|long phu 1:8,109,1594.1598.1599|long tuyen:,91,1337.1340|luong tam:8,109,|my huong:61,691,11453.11464.11457|my phuoc:61,691,11460|my quoi:61,685,11388.11389|my tu:61,691,11458.11456.11461|my xuyen:61,690,11450.11438;61,689,11436|nga bay:8,107,1573.1575.1574|nga nam:61,685,11391|ngoc to:61,690,11437.11439.11448|nhon ai:,87,1309.1310|nhon my:61,686,11406.11405;61,682,11367|nhu gia:61,690,11446|ninh kieu:,82,1281.1277.1284|o mon:,80,1260.1259.1256;,81,1264|phong dien:,87,1312.1315.1311|phong nam:61,686,11407|phu huu:8,105,1556.1553.1555|phu loc:61,683,11375.11377.11373|phu loi:61,689,11427.11431.11432.11433|phu tam:61,684,11382.11379|phung hiep:8,108,1590.1591|phuoc thoi:,80,1257.1258|phuong binh:8,108,1588.1589|soc trang:61,689,11434.11435.11428.11429|tai van:61,688,11421.11424|tan an:,82,1287.1285|tan binh:8,108,1582.1586|tan hoa:8,103,1537.1532.1529.1533|tan loc:,83,1292|tan long:61,685,11387.11393;61,683,11368|tan phuoc hung:8,108,1585.1593|tan thanh:61,682,11356.11363.11354|thanh an:,85,1308.1304.1301|thanh hoa:8,108,1592.1583.1581|thanh phu:,90,1326|thanh quoi:,85,1299.1307.1304|thanh thoi an:61,688,11422.11426|thanh xuan:8,103,1534.1535.1528|thoi an dong:,91,1341.1338.1334|thoi an hoi:61,686,11400.11401|thoi hung:,90,1327|thoi lai:,81,1270.1263.1272|thoi long:,80,1261.1262;,83,1297|thot not:,83,1293.1294.1295|thuan hoa:61,684,11378.11381|thuan hung:,83,1296.1291.1295|tran de:61,688,11423.11418.11417|trung hung:,90,1325.1332|trung nhut:,83,1290.1289;,90,1331|truong khanh:61,682,11361.11364.11360|truong long:,87,1314|truong long tay:8,103,1531.1530|truong thanh:,81,1275.1265.1266|truong xuan:,81,1269.1268.1267|vi tan:8,102,1520.1521.1526|vi thanh:8,102,1527.1519.1522|vi thanh 1:8,106,1571.1565.1570|vi thuy:8,106,1572.1566.1567|vinh chau:61,692,11470|vinh hai:61,692,11471|vinh loi:61,683,11372.11376.11369|vinh phuoc:61,692,11468.11469|vinh thanh:,85,1302.1303.1298|vinh thuan dong:8,106,1563.1564;8,109,|vinh trinh:,85,1306.1305|vinh tuong:8,106,1569.1568|vinh vien:8,109,|xa phien:8,109,","11":"an lac:27,288,5278.5290|bac giang:27,280,5078.5085.5080.5076.5079.5082.5091|bac lung:27,287,5267.5263.5259.5268|bao dai:27,287,5246.5249.5247.5248|bien dong:27,284,5180.5177.5188|bien son:27,284,5174.5168|bo ha:27,283,5163.5158.5143|bong lai:,131,1891.1886.1889|cam ly:27,287,5269.5265|canh thuy:27,280,|cao duc:,129,1857.1858|chi lang:,131,1890.1888|da mai:27,280,5081.5086.5087.5089;27,286,5238|dai dong:,133,1922.1923.1915|dai lai:,129,1859.1853|dai son:27,288,5287|dao vien:,131,1887.1879.1880|deo gia:27,284,5192.5187|dong cuu:,129,1850.1852.1851|dong ky:27,283,5144.5160.5154|dong nguyen:,134,1941.1932.1940|dong phu:27,287,5244.5245|dong viet:27,280,|duong huu:27,288,5280.5282|gia binh:,129,1848.1847.1854.1849|hap linh:,128,1840.1841|hiep hoa:27,281,5105.5103.5107.5108.5093|hoang van:27,281,5118.5099|hop thinh:27,281,5114.5115.5104|kep:27,285,5195.5199.5198|kinh bac:,128,1845.1829.1832.1844.1843|lam thao:,127,1813.1814.1815|lang giang:27,285,5194.5205.5217.5215|lien bao:,133,1918.1924.1925|luc nam:27,287,5255.5253.5250.5242.5254|luc ngan:27,284,5186.5179.5183.5178.5185|luc son:27,287,5262.5258|luong tai:,127,1826.1817.1821|mao dien:,130,1864.1865.1863|my thai:27,285,5206.5216.5207.5210|nam duong:27,284,5191|nam son:,128,1838.1839|nenh:27,282,5136.5121.5138.5132|nghia phuong:27,287,5251.5256.5260|ngoc thien:27,286,5232.5236.5239.5231.5234|nha nam:27,286,5241.5224.5226.5220|nhan hoa:,131,1898.1899.1897|nhan thang:,129,1856.1855.1846|ninh xa:,130,1871.1868|phat tich:,133,1927.1928.1926|phu khe:,134,1931.1934.1935|phu lang:,131,1881.1882.1883|phuc hoa:27,286,5227.5235.5225|phuong lieu:,131,1893.1894|quang trung:27,286,|que vo:,131,1885.1884.1895.1896|sa ly:27,284,5167.5169|son dong:27,288,5276.5292|son hai:27,284,5170.5171|song lieu:,130,1876.1872.1877.1875|tam da:,132,1913.1914.1902|tam giang:,132,1909.1910|tam son:,134,1936.1937|tam tien:27,283,5153.5161.5156|tan an:27,280,|tan chi:,133,1917.1916|tan dinh:27,285,5214.5213.5211|tan son:27,284,5165.5166|tan tien:27,280,5090|tan yen:27,286,5230.5229.5237.5233|tay yen tu:27,288,5284|thuan thanh:,130,1862.1860.1867.1861|tien du:,133,1920.1921.1919|tien luc:27,285,5202.5200.5196.5197.5201|tien phong:27,280,5092.5088|tram lo:,130,1870.1869|tri qua:,130,1866.1874.1873|trung chinh:,127,1816.1822|trung kenh:,127,1819.1818|truong son:27,287,5261.5257|tu lan:27,282,5127.5123.5126.5122|tu son:,134,1938.1930.1933.1939|tuan dao:27,288,5279|van ha:27,282,5137.5140.5129.5135.5133|van mon:,132,1907.1906.1908|van son:27,288,5274.5272|viet yen:27,282,5120.5130.5125.5124|vo cuong:,128,1830.1835.1842|vu ninh:,128,1831.1836.1834.1837|xuan cam:27,281,5112.5110.5109.5111.5117|xuan luong:27,283,5150.5162.5152|yen dinh:27,288,5289.5277|yen dung:27,280,|yen phong:,132,1905.1904.1912.1911|yen the:27,283,5159.5149.5145.5142.5141|yen trung:,132,1903.1901","13":"a sao:16,175,2884.2882.2881.2889|ai quoc:16,180,3033|an thi:,150,2302.2301.2294|bac dong hung:16,179,3003.3007.3008|bac dong quan:16,179,3005.2992|bac thai ninh:16,173,2804|bac thuy anh:16,173,2813.2791.2819|bac tien hung:16,179,3013.3014.3000|binh dinh:16,181,3059.3066.3070|binh nguyen:16,181,3100.3081.3061|binh thanh:16,181,3062.3069|chau ninh:,149,2286.2282.2275.2287|chi minh:,149,2290|dai dong:,148,2265.2261.2260|dien ha:16,176,2902.2926|doan dao:,147,2248.2247.2245|dong bang:16,175,2870.2872.2885|dong chau:16,180,3024.3026.3027.3029|dong hung:16,179,2997.3002.2976.2982.2984.2989|dong quan:16,179,3020.2988.2990|dong thai ninh:16,173,2780.2796.2794|dong thuy anh:16,173,2818.2792|dong tien hai:16,180,3028.3032.3050|dong tien hung:16,179,2999|duc hop:,153,2352.2351|duong hao:,152,2329.2330.2336.2331.2335|hiep cuong:,153,2354.2355.2353.2347|hoan long:,155,2390.2395;,149,2269|hoang hoa tham:,154,2361.2363.2359.2367|hong chau:,156,2402.2408|hong minh:16,176,2908.2896.2905|hong quang:,150,2313.2310.2311.2314|hong vu:16,181,3088|hung ha:16,176,2918.2909.2919.2916.2931.2904|hung phu:16,180,3039.3040.3044|khoai chau:,149,2283.2284.2277.2293|kien xuong:16,181,3082.3077.3060.3073.3076|lac dao:,148,2264.2258.2259|le loi:16,181,3067|le quy don:16,176,2910.2900.2903|long hung:16,176,2917.2923.2914.2934.2922|luong bang:,153,2339.2346.2343|me so:,151,2316.2317;,149,2270|minh tho:16,175,2861.2880.2875.2859|my hao:,152,2326.2332.2328.2327|nam cuong:16,180,3037.3038.3043|nam dong hung:16,179,2981|nam thai ninh:16,173,2776.2775|nam thuy anh:16,173,2811.2816.2788|nam tien hai:16,180,3046.3047.3048|nam tien hung:16,179,3012|nghia dan:,153,2340.2348.2342.2341|nghia tru:,151,2322.2323.2324|ngoc lam:16,175,2877.2874.2862|ngu thien:16,176,2913.2928.2897.2921|nguyen du:16,175,2878.2873|nguyen trai:,150,2308.2307.2306.2309|nguyen van linh:,155,2380.2382|nhu quynh:,148,2267.2262.2266.2263.2257|pham ngu lao:,150,2295.2298.2297.2296|pho hien:,156,2398.2401.2403.2400.2406.2405|phu duc:16,175,2871.2886.2887.2890.2893|phung cong:,151,2321.2320.2319|quang hung:,147,2249.2243.2244.2246|quang lich:16,181,3064.3075.3092|quynh an:16,175,2894.2892|quynh phu:16,175,2876.2865.2864.2863.2860.2869|son nam:,156,2404.2397.2409.2410|tan hung:,154,2368;,156,|tan thuan:16,174,2848.2835.2839|tan tien:16,175,2883.2891.2895|tay thai ninh:16,173,2798|tay thuy anh:16,173,2810.2785.2784|tay tien hai:16,180,3055.3045.3023|thai binh:16,178,2972.2958.2953.2957;16,174,2836.2834.2829|thai ninh:16,173,2778.2803.2802|thai thuy:16,173,2817.2783.2790.2808.2781|than khe:16,176,2925.2930.2901.2920|thu tri:16,174,2831.2852.2824|thu vu:16,174,2841.2854.2846.2843|thuong hong:,152,2338.2334.2333.2337|thuy anh:16,173,2814.2807|tien hai:16,180,3035.3034.3054.3022.3056|tien hoa:,154,2360.2376.2365|tien hung:16,179,3019.3016.3015|tien la:16,176,2912.2924.2915.2899|tien lu:,154,2369.2375|tien tien:,147,2250.2251.2252|tong tran:,147,2256.2255.2253|tra giang:16,181,3078.3084.3065|tra ly:16,178,2956.2955.2971;16,179,2978|tran hung dao:16,178,2954.2966.2967.2973|tran lam:16,178,2962.2959.2960.2961;16,181,|trieu viet vuong:,149,2273.2274.2276|van giang:,151,2318.2315.2325|van xuan:16,174,2821.2849.2855.2840|viet tien:,149,2280.2285.2279|viet yen:,155,2393.2385|vu phuc:16,174,2830.2838.2827;16,178,2963|vu quy:16,181,3086.3099.3093|vu thu:16,174,2832.2856.2850.2853.2823.2825|vu tien:16,174,2822.2851.2845.2842|xuan truc:,150,2305.2303.2304|yen my:,155,2384.2383.2378","17":"bac ly:14,159,2460.2463.2462|binh an:14,162,2523.2520|binh giang:14,162,2524.2526.2527|binh luc:14,162,2513.2511.2528|binh minh:,183,3133.3123.3141|binh my:14,162,2516.2512.2508|binh son:14,162,2518.2517.2519|cat thanh:15,164,2569.2570.2556|chat binh:,183,3131.3135|chau son:14,160,18477.2476;14,161,2502|co le:15,164,2567.2568.2550|cuc phuong:,184,3145.3169|dai hoang:,185,3191.3177|dinh hoa:,183,3134.3142.3125|dong a:15,168,2643|dong hoa lu:,187,3213.3216.3218;,188,|dong thai:,186,3208.3209.3211|dong thinh:15,167,2611|dong van:14,157,2412.2414.2431|duy ha:14,157,2413.2415|duy tan:14,157,2411.2429|duy tien:14,157,2426.2411.2425.2424|gia hung:,185,3192.3173.3176|gia lam:,184,3150.3148.3170|gia phong:,185,3174.3184.3185|gia tran:,185,3179.3182.3178|gia tuong:,184,3147.3154.3151|gia van:,185,3180.3175.3187|gia vien:,185,3172|giao binh:15,166,2589.2585.2594|giao hoa:15,166,2609.2597.2602|giao hung:15,166,2598.2604.2605|giao minh:15,166,2601.2586.2595|giao ninh:15,166,2607.2592.2606|giao phuc:15,166,2588.2587.2599|giao thuy:15,166,2596|ha nam:14,157,2416.2418.2417;14,160,2484.2483|hai an:15,169,2687.2669.2697|hai anh:15,169,2694.2688.2668|hai hau:15,169,2686.2672.2677|hai hung:15,169,2691.2692.2695|hai quang:15,169,2690.2674.2680|hai thinh:15,169,2685.2666.2696|hai tien:15,169,2684.2675.2679|hai xuan:15,169,2671.2698.2683|hien khanh:15,170,2714.2715.2703.2708|hoa lu:,188,3240.3238.3239.3241.3246|hong phong:15,167,2617.2623.2624|hong quang:15,163,2532.2548;15,168,2647|khanh hoi:,187,3226.3223.3230|khanh nhac:,187,3224.3217|khanh thien:,187,3222.3225.3229|khanh trung:,187,3221.3228.3232|kim bang:14,158,2433.2448.2441|kim dong:,183,3139.3143|kim son:,183,3130.3136.3138|kim thanh:14,158,2439|lai thanh:,183,3144.3120.3127|le ho:14,158,2437.2436.2443|liem ha:14,161,2503.2504.2505|liem tuyen:14,160,18470.18478|lien minh:15,170,2700.2713.2718|ly nhan:14,159,2455.2454.2453|ly thuong kiet:14,158,2450.2451.2449|minh tan:15,170,2711.2701|minh thai:15,164,2564.2555.2563|my loc:15,168,|nam dinh:15,168,2651.2653.2648.2660.2638.2639.2644|nam dong:15,163,2542.2531|nam hoa lu:,188,3247.3249.3248.3234|nam hong:15,163,2538.2543.2549|nam ly:14,159,2468.2469.2470|nam minh:15,163,2534.2529.2545|nam ninh:15,163,2536.2537.2540.18479|nam truc:15,163,2535.2533.2539|nam xang:14,159,2456.2459.2457|nghia hung:15,167,2633.2614.2632.2628|nghia lam:15,167,2616.2618.2620|nghia son:15,167,2619.2626|nguyen uy:14,158,2445.2444.2435|nhan ha:14,159,2474.2471.2467|nho quan:,184,3146.3166.3171|ninh cuong:15,164,2554.2558|ninh giang:15,164,2551.2552.2553|phat diem:,183,3124.3137.3122|phong doanh:15,172,2762.2754|phu long:,184,3149.3156|phu ly:14,160,2482.2484.2486|phu son:,184,3152.3157.3163|phu van:14,160,2477.2475.13835|quang hung:15,164,2566.2559.2560|quang thien:,183,3129.3118.3119|quy nhat:15,167,2634.2621.2630|quynh luu:,184,3155.3159|rang dong:15,167,2635.2612|tam chuc:14,158,2446.2434.2447|tam diep:,189,3250.3255.3253|tan minh:15,172,|tan thanh:14,161,2498.2501|tay hoa lu:,188,3236.3237.3244;,185,3186.3187;,184,|thanh binh:14,161,2495.2500.2496|thanh lam:14,161,17008.2489.2492|thanh liem:14,161,2493.2494.2490|thanh nam:15,168,2645;15,170,2712|thanh son:,184,3168.3165|thien truong:15,168,2642|tien son:14,157,2418.2417|tran thuong:14,159,2465.2466|truc ninh:15,164,2565.2558.2561|trung son:,189,3252.3256.3251|truong thi:15,168,2657;15,170,2707|van thang:15,172,2772.2752.2755|vi khe:15,168,2646;15,163,|vinh tru:14,159,2461.2452.2464|vu ban:15,170,2716.2704.2709|vu duong:15,172,2761.2765.2742.2745|xuan giang:15,171,2731.2733|xuan hong:15,171,2722.2734.2725.2739|xuan hung:15,171,2720.2738|xuan truong:15,171,2719.2728.2729|y yen:15,172,2759.2769.2746|yen cuong:15,172,2763.2770.2744.2748|yen dong:15,172,2768.2764.2756|yen khanh:,187,3220.3214.3215.3219|yen mac:,186,3199.3200.3201|yen mo:,186,3196.3194.3197|yen son:,189,3254.3258;,184,3158|yen thang:,186,3206.3210;,189,3257|yen tu:,186,3205.3202.3203","19":"bach dang:,212,3644.3645;,203,3514|bao lac:,204,3521.3522.3515|bao lam:,208,3578.3582|be van dan:,725,|ca thanh:,203,3497.3498|can yen:,210,|canh tan:,201,3465.3478|co ba:,204,3518.3517|coc pang:,208,3579;,204,3516|dam thuy:,206,3547.3552.3548|dinh phong:,206,3560.3544.3546.3545|doai duong:,206,3556.3554|doc lap:,725,|dong khe:,201,3476.3475.3472|duc long:,201,3471.3470.3474|ha lang:,202,3490.3489|ha quang:,210,3609.3613|hanh phuc:,725,|hoa an:,212,3637.3629.3626|hung dao:,204,3529.3530.3525|huy giap:,204,3528.3526|khanh xuan:,204,3519.3523|kim dong:,201,3479.3467;,212,3649|lung nam:,210,3600.3606|ly bon:,208,3581.3580|ly quoc:,202,3493.3491.3494|minh khai:,201,3480.3466|minh tam:,212,3632;,203,3504|nam quang:,208,3584.3583|nam tuan:,212,3627.3628.3631|nguyen binh:,203,3502.3495|nguyen hue:,212,3639.3642.3635|nung tri cao:,209,3594.3587.3590|phan thanh:,203,3507.3508|phuc hoa:,725,|quang han:,206,|quang lam:,208,3572.3573|quang long:,202,3492.3484.3481|quang trung:,206,|quang uyen:,725,|son lo:,204,3531.3527|tam kim:,203,3513.3511.3510|tan giang:,209,3589.3591.3592;,212,3646|thach an:,201,3477.3468;,725,|thanh cong:,203,3512.3509|thanh long:,210,|thong nong:,210,|thuc phan:,209,3588.3586.3593.3595;,212,3640|tinh tuc:,203,3499.3500.3496|tong cot:,210,3602.3604.3607|tra linh:,206,;,725,|trung khanh:,206,3555.3550.3549.3541|truong ha:,210,3598.3597.3605|vinh quy:,202,3482.3483.3488|xuan truong:,204,3520.3524|yen tho:,208,3574.3575.3576","20":"a mu sung:,217,3735.3736|au lau:24,257,4584.4598.4597;24,256,4567|bac ha:,219,3780.3779.3793.3789.3784.3792|ban ho:,215,3690|ban lau:,216,3710.3711.3712|ban lien:,219,3785.3798|ban xeo:,217,3729.3728.3747|bao ai:24,251,4447.4448.4450.4458|bao ha:,221,3830.3817.3826;,218,3766.3767|bao nhai:,219,3791.3786.3800|bao thang:,222,3847.3850.3842.3843|bao yen:,221,3828.3819.3833.3834|bat xat:,217,3742.3740.3738.3741|cam duong:,214,3674.3677.3678.3675.3676.3680.3684|cam nhan:24,251,4467.4471.4466|cao son:,216,3725.3722.3720|cat thinh:24,249,4395|cau thia:24,254,4538|chan thinh:24,249,4386.4396.4393|chau que:24,250,4426.4442|che tao:24,255,4544|chieng ken:,218,3778.3772|coc lau:,219,3799.3794.3795|coc san:,214,3682;,217,3748|den sang:,217,3732.3746.3730|dong cuong:24,250,4427.4445.4440.4432|duong quy:,218,3769.3762|gia hoi:24,249,4394.4399.4400|gia phu:,222,3845.3835;,214,3679|hanh phuc:24,252,4481.4476.4480.4477|hop thanh:,214,3685.3686|hung khanh:24,256,4559.4561|khanh hoa:24,253,4506.4507.4509.4531|khanh yen:,218,3756.3765.3764|khao mang:24,255,4546.4547|lam giang:24,250,4421.4428|lam thuong:24,253,4515.4510.4530.4517|lao cai:,214,3668.3667.3670.3673.3683;,222,3852|lao chai:24,255,4550|lien son:24,254,4541;24,249,|luc yen:24,253,4491.4535.4516.4519|lung phinh:,219,3788;,220,25100|luong thinh:24,256,4562.4565|mau a:24,250,4422.4441.4425.4419.4429|minh luong:,218,3759.3771|mo vang:24,249,4402;24,250,4423|mu cang chai:24,255,4548.4552.4543.4551|muong bo:,215,|muong hum:,217,3749.3744.3731|muong khuong:,216,3714.3708.3724.3713.3715|muong lai:24,253,4534.4505.4511.4512|nam chay:,218,3775.3777|nam co:24,255,4554|nam cuong:24,257,4588.4595.4585;24,256,4581|nam xe:,218,3770|nghia do:,221,3831.3827.3821|nghia lo:24,254,4542.4537.4536;24,249,4415|nghia tam:24,249,4398.4406.4382|ngu chi son:,215,|pha long:,216,3719.3717.3721.3716|phinh ho:24,252,4484.4478.4474|phong du ha:24,250,4436.4430|phong du thuong:24,250,4431|phong hai:,222,3839|phuc khanh:,221,3829|phuc loi:24,253,4527.4532.4533|pung luong:24,255,4555.4556.4549.4545|quy mong:24,256,4583.4575.4580|sa pa:,215,3694|si ma cai:,220,25099.3807.3814.3808|sin cheng:,220,3805.3816.3806|son luong:24,249,4407.4411.4408.4401|ta cu ty:,219,3790.3783|ta phin:,215,3699|ta van:,215,3693|ta xi lang:24,252,4482|tan hop:24,250,4424.4444.4433|tan linh:24,253,4508.4518.4526.4528.4529|tang loong:,222,3841|thac ba:24,251,4454.4459.4457.4456.4460.4452|thuong bang la:24,249,4387|thuong ha:,221,3823.3822.3825|tram tau:24,252,4475.4473.4479.4476|tran yen:24,256,4572.4574.4558.4576.4567|trinh tuong:,217,3727.3743|trung tam:24,254,4540.4539|tu le:24,255,4553;24,249,4414|van ban:,218,3758.3763.3757.3776.3761|van chan:24,249,4388.4403.4409.4410|van phu:24,257,4591.4599.4587;24,251,4468|viet hong:24,256,4577.4569.4570|vo lao:,218,3774.3773.3760|xuan ai:24,250,4439.4438.4443.4437.4435|xuan hoa:,221,3832.3820|xuan quang:,222,3840.3851.3836|y ty:,217,3734.3733|yen bai:24,257,4590.4594.4596.4592.4589|yen binh:24,251,4455.4451.4469.4462|yen thanh:24,251,4465.4464.4449.4463.4461","22":"ba son:,237,4134.4142.4128|bac son:,234,4057.4074|bang mac:,233,4042.4050.4048.4036|binh gia:,239,4179.4174.4176|cai kinh:,232,4026.4008.4028|cao loc:,237,4133.4138.4139|chau son:,238,4152.4154.4149.4153.4155|chi lang:,233,4056.4054|chien thang:,233,4039.4043.4045.4049|cong son:,237,4129.4131.4132|diem he:,231,3991|dinh lap:,238,4160.4151|doan ket:,241,4207.4191.4210|dong dang:,237,4126.4135.4140.4147.4143|dong kinh:,240,4187.4181.4186;,237,4148|hoa tham:,239,4165.4163|hoang van thu:,235,4086.4096.4083.4082.4092|hoi hoan:,235,4080.4084|hong phong:,239,4175.4164|hung vu:,234,4072.4065|huu lien:,232,4027.4016|huu lung:,232,4033.4029.4011|khang chien:,241,4195.4190.4199|khanh khe:,237,4141.4127;,231,3988|khuat xa:,236,4114.4104|kien moc:,238,4150.4151.4155|ky lua:,237,4136.4144.4146.4130;,240,4183|loc binh:,236,4102.4124|loi bac:,236,4105.4113|luong van tri:,240,4184.4188|mau son:,236,4123.4117.4107|na duong:,236,4125.4100.4116|na sam:,235,4078.4077|nhan ly:,233,4051.4040.4038.4047|nhat hoa:,234,4059.4060.4063|quan son:,233,4041.4037|quoc khanh:,241,4198.4211.4193.4205|quoc viet:,241,4209.4194|quy hoa:,239,4167.4172|tam thanh:,240,4185.4182|tan doan:,231,3990.4002;,237,4137|tan thanh:,232,4021.4013.4014|tan tien:,241,4192.4196.4197|tan tri:,234,4071.4064.4066|tan van:,239,4161.4180.4177|thai binh:,238,4156.4157|that khe:,241,4201.4208.4205|thien hoa:,239,4173.4169|thien long:,239,4168.4162.4170|thien tan:,232,4010.4022|thien thuat:,239,4166.4171|thong nhat:,236,|thuy hung:,235,4090.4087.4089|trang dinh:,241,4189.4203.4204|tri le:,231,3989.3987|tuan son:,232,4015.4017.4030|van lang:,235,4081.4093.4088|van linh:,233,4044.4046.4055|van nham:,232,4031.4032.4024|van quan:,231,4004.3999.4005|vu lang:,234,4070.4076.4062.4067|vu le:,234,4058.4069.4068|xuan duong:,236,4097.4119.4109|yen binh:,232,4018.4025.4012|yen phuc:,231,3997.3996","23":"an tuong:,242,4221.4217.4222.4219;,243,4232|bac me:18,193,3324.3325.3327|bac quang:18,195,3369.3381.3358|bach dich:18,198,3423.3418.3421|bach ngoc:18,192,3313.3314|bach xa:,248,4366.4373.4367|ban may:18,190,3268.3266.3261|bang hanh:18,195,3366.3359.3363|bang lang:18,200,3451.3457|binh an:,247,4354.4358|binh ca:,244,4298.4294.4297|binh thuan:,242,4224.4223|binh xa:,248,4380.4372|can ty:18,191,3297.3291|cao bo:18,192,3319|chiem hoa:,245,4316.4324.4323.4326.4312|con lon:,246,4329.4337|dong tam:18,195,3382.3360.3361|dong tho:,244,4263.4268.4293|dong van:18,197,3395.3407.3406.3403;18,199,3434|dong yen:18,195,3376.3367|du gia:18,198,3429.3430|duong hong:18,193,3329.3330.3333|duong thuong:18,198,3428.3415|giap trung:18,193,3326|ha giang 1:18,196,3392.3391.3385|ha giang 2:18,196,3387.3384.3383.3386;18,192,3301|ham yen:,248,4361.4368.4374.4376|ho thau:18,190,3281.3263.3264|hoa an:,245,4319.4304.4313|hoang su phi:18,190,3272.3259.3276.3267.3265|hong son:,244,4270.4269|hong thai:,246,4331.4330.4338|hung an:18,195,3375.3368.3364|hung duc:,248,4370|hung loi:,243,4254.4233|khau vai:18,199,3443.3445.3440|khuon lung:18,194,3355|kien dai:,245,4308.4314|kien thiet:,243,4234|kim binh:,245,4301.4325.4309|lam binh:,247,4355.4352.4351|lao chai:18,192,3318.3315.3316|lien hiep:18,195,3362.3365.3374|linh ho:18,192,3321.3302.3309|luc hanh:,243,4227.4239|lung cu:18,197,3394.3399.3402|lung phin:18,197,3410.3398.3412|lung tam:18,191,3290.3289.3296|mau due:18,198,3426.3427.3416|meo vac:18,199,3431.3433.3438.3434|minh ngoc:18,193,3336.3328.3334|minh quang:,247,4357|minh son:18,193,3331|minh tan:18,192,3303|minh thanh:,244,4299.4278.4281|minh xuan:,242,4214.4213.4215.4212.4216;,243,4255|my lam:,243,4240;,242,|na hang:,246,4339.4345.4335|nam dan:18,194,3353.3354.3347|nam dich:18,190,3279.3262.3278|nghia thuan:18,191,3293.3287|ngoc duong:18,196,3388;18,193,3328|ngoc long:18,198,3414|nhu khe:,243,4230.4241.4242|niem son:18,199,3436.3448|nong tien:,242,4220.4218|pa vay su:18,194,3350.3340.3352.3351|pho bang:18,197,3397.3400.3396.3401|phu linh:18,192,3304.3305.3300|phu luong:,244,4296.4287.4271|phu luu:,248,4371.4375|po ly ngai:18,190,3273.3274.3275|quan ba:18,191,3286.3288|quang binh:18,200,3452.3462|quang nguyen:18,194,3346|sa phin:18,197,3409.3408.3405.3404|son duong:,244,4274.4273.4279.4286|son thuy:,244,4289.4267.4275|son vi:18,199,3439.3446.3442|sung mang:18,199,3441.3444.3447|tan an:,245,4317.4303|tan long:,243,4248.4236|tan my:,245,4318.4307|tan quang:18,195,3371.3372.3379|tan thanh:,244,4284.4265|tan tien:18,190,3277.3260.3284|tan trao:,244,4280.4277;,243,4237|tan trinh:18,200,3458.3459|tat nga:18,199,3437|thai binh:,243,4244.4249.4253|thai hoa:,248,4377.4379|thai son:,248,4378.4359|thang mo:18,198,3422.3424.3420|thang tin:18,190,3270.3269.3283|thanh thuy:18,192,3317.3308|thong nguyen:18,190,3282;18,200,3464|thuan hoa:18,192,3306|thuong lam:,247,4353.4356|thuong nong:,246,4340.4342|thuong son:18,192,3320|tien nguyen:18,200,3460|tien yen:18,200,3453.3454.3456|tri phu:,245,4321.4310|trung ha:,245,4322|trung son:,243,4228.4229.4257|trung thinh:18,194,3345.3343.3344|truong sinh:,244,4291.4282|tung ba:18,192,3312|tung vai:18,191,3294.3295.3292|vi xuyen:18,192,3310.3311.3298.3307|viet lam:18,192,3322.3307|vinh tuy:18,195,3378.3370.3377|xin man:18,194,3348.3349.3356.18460|xuan giang:18,200,3463.3455|xuan van:,243,4245.4258.4262|yen cuong:18,193,3335.3332|yen hoa:,246,4332.4350|yen lap:,245,4302.4327|yen minh:18,198,3425.3413.3419.3417;18,197,3411|yen nguyen:,245,4305.4328|yen phu:,248,4364.4365|yen son:,243,4238.4260.4226|yen thanh:18,200,3461.3450","25":"an khanh:,264,4740.4735.4736|ba be:21,229,3962.3969.3955|ba xuyen:,266,4775.4782|bac kan:21,226,3912.3909.3907.3911|bach quang:,266,4780.4784.4783|bach thong:21,228,3936.3938;21,224,|bang thanh:21,230,3974.3982.3980.3981|bang van:21,225,3903.3901|binh thanh:,265,4771.4773|binh yen:,265,4766.4764.4767.4763|cam giang:21,228,3945.3939.3951|cao minh:21,230,3977.3978.3979|cho don:21,224,3892.3891.3869.3893|cho moi:21,223,3860.3858|cho ra:21,229,3970.3967|con minh:21,227,3926.3932.3919|cuong loi:21,227,3917|dai phuc:,261,4670.4668;,264,4741.4734;,258,4604|dai tu:,264,4742.4739.4744.4743|dan tien:,260,4649.4648.4646|diem thuy:,262,4686.4689.4698.4694|dinh hoa:,265,4750.4756.4762.4758|dong hy:,263,4708.4700.4717.4715|dong phuc:21,229,3958.3960.3971;21,224,3890|duc luong:,264,4721.4724.4722|duc xuan:21,226,3908.3906.3913|gia sang:,261,4661.4659.4663|hiep luc:21,225,3900|hop thanh:,259,4626.4622.4624|kha son:,262,4691.4696.4697.4695.4693|kim phuong:,265,4753.4755|la bang:,264,4733.4738.4737|la hien:,260,4642.4643|lam vy:,265,4752.4751|linh son:,261,4676.4677.18467|na phac:21,225,3898.3895|na ri:21,227,3914.3927|nam cuong:21,224,3877.3883.3875|nam hoa:,263,4699.4704|ngan son:21,225,3894.3899.3902|nghia ta:21,224,3873.3876.3878|nghien loan:21,230,3973.3976.3975|nghinh tuong:,260,4639|phan dinh phung:,261,4656.4675.4652.4658.4653.4655.4654|pho yen:,258,4606.4603.4601.4608|phong quang:21,226,3910;21,228,3937|phu binh:,262,4692.4678.4685.4688.4690|phu dinh:,265,4772.4768|phu lac:,264,4728.4727.4730|phu luong:,259,4633.4632.4623.4621|phu thinh:,264,4725.4729.4732|phu thong:21,228,3941.3948.3943|phu xuyen:,264,4725.4731.4723|phuc loc:21,229,3963.3959.3954|phuc thuan:,258,4607.4605.4602|phuong tien:,265,4759.4754.4760|quan chu:,264,4749.4748|quan trieu:,261,4666.4650.4651|quang bach:21,224,3880.3882|quang son:,263,4712.4714|quyet thang:,261,4657.4667.4669|sang moc:,260,4636|song cong:,266,4776.4778.4777|tan cuong:,261,4673.4671;,266,4781|tan khanh:,262,4681.4679.4684|tan ky:21,223,3868.3856.3861|tan thanh:,262,4683.4682.4687|than sa:,260,4640.4638|thanh cong:,258,4612.4610|thanh mai:21,223,3857.3864.3863|thanh thinh:21,223,3867|thuong minh:21,229,3961.3965.3957|thuong quan:21,225,3897|tich luong:,261,4660.4665.4664.4662.4672|trai cau:,263,4710.4701|tran phu:21,227,3916.3922|trang xa:,260,4645.4647|trung hoi:,265,4765.4770.4769|trung thanh:,258,4617.4616.4618.4615|van han:,263,4716.4718|van lang:21,227,3921.3918;,263,4711.4713|van phu:,264,4746|van xuan:,258,4614.4611.4609.4613|vinh thong:21,228,3940.3950|vo nhai:,260,4635.4644.4641|vo tranh:,259,4629.4627.4630.4625|xuan duong:21,227,3934.3929.3925|yen binh:21,223,3855.3865.3866|yen phong:21,224,3887|yen thinh:21,224,3888.3885.3886|yen trach:,259,4634.4620.4619","26":"an binh:31,325,5855.5854|an nghia:31,325,5853|au co:,267,4796.4789.4787|ban nguyen:,277,5014.5006.5017|bang luan:,270,4864.4861.4848|bao la:31,334,6038.6045|binh nguyen:10,120,1711.1704.1712.1713|binh phu:,279,5067.5066|binh tuyen:10,120,1707.1716|binh xuyen:10,120,1709.1706.1715|cam khe:,275,|cao duong:31,328,5933|cao phong:31,330,5960.5954|cao son:31,331,5977.5980|chan mong:,270,4854.4850.4866|chi dam:,270,4862|chi tien:,268,4805.4803.4807|cu dong:,272,4896.4901.4898|da bac:31,331,5986.5967.5985.5984|dai dinh:10,124,1759.1760|dai dong:31,332,6001.6009.5993|dan chu:,279,5060.5064.5063.5074|dan thuong:,278,5046.5024.5044|dao tru:10,124,1757.1758|dao xa:,271,4879.4883.4877.4882|doan hung:,270,4845.4846|dong luong:,275,4953.4954.4977|dong thanh:,268,4815.4818.4808|duc nhan:31,331,5968|dung tien:31,326,5896.5874.5875|ha hoa:,278,5026.5025.5048.5027|hai luu:10,121,1722.1725.1724.1726|hien luong:,278,5038.5037|hien quan:,276,4998.4993|hoa binh:31,333,6030.6027.6028.6021.6020.6026|hoang an:10,119,1697.1700.1701|hoang cuong:,268,4819.4802.4811|hoi thinh:10,119,1699.1698|hop kim:31,326,5894.5895|hop ly:10,126,1797.1796.1795|hung viet:,275,|huong can:,272,4912.4914.4913|hy cuong:,269,17003.4844.17012|kha cuu:,272,4916.4905.4906|kim boi:31,326,5872.5877.5868|ky son:31,333,|lac luong:31,329,5946.5944.5943|lac son:31,332,5994.6015|lac thuy:31,325,5867.5851.5863|lai dong:,273,4931.4923.4926.4924|lam thao:,277,5019.5010.5018|lap thach:10,126,1793.1804.1802.1801|lien chau:10,118,1679.1676.1681|lien hoa:10,126,1794.1803.1805|lien minh:,268,4804.4806.4821|lien son:31,328,5926.5928|long coc:,273,4933.4929.4932|luong son:31,328,5922.5923.5927.5924.5921|mai chau:31,334,6035.6046.6052|mai ha:31,334,6040.6042.6041|minh dai:,273,4921.4918.4920|minh hoa:,274,4948.4942.4941|muong bi:31,327,5912.5913.5897|muong dong:31,326,5885.5876.5884|muong hoa:31,327,5911|muong thang:31,330,5962.5955.5957|muong vang:31,332,5998.6003.5990|nat son:31,326,5881.5889|ngoc son:31,332,5992.6005.6000|nguyet duc:10,118,1682.1684.1685.1687|nhan nghia:31,332,6002.5991.6004|nong trang:,269,4828.4825|pa co:31,334,6032.6037.6051|phong chau:,267,4788.4795.4793|phu khe:,275,4980.4955|phu my:,279,5073.5058.5059|phu ninh:,279,5068.5061.5062.5065|phu tho:,267,4785.4786.4792|phuc yen:10,122,1738.1735.1742.1743|phung nguyen:,277,5011.5013|quang yen:,268,4817.4816|quy duc:31,331,5970.5978.5979.5976|quyet thang:31,332,5988.6014|son dong:10,126,1812;10,121,1734|son luong:,274,4947.4944.4945|song lo:10,121,1733.1731.1732.1730|tam dao:10,124,1755.1762.1756.1763|tam duong:10,119,1696.1691.1695.1694|tam duong bac:10,119,1693.1692;10,124,1761|tam hong:10,118,1690.1688.1689|tam nong:,276,4986.4984|tam son:10,121,1718.1723.1727|tan hoa:31,333,6022.6017.6023|tan lac:31,327,5908.5920.5918.5919.5898|tan mai:31,334,|tan pheo:31,331,5969.5975.5971|tan son:,273,4917.4922.4919|tay coc:,270,4847.4849|te lo:10,118,1678.1683.1686|thai hoa:10,126,1798.1800.1799|thanh ba:,268,4797.4813.4799.4823|thanh mieu:,269,4824.4833.4834.4831.4832|thanh son:,272,4894.4897.4911.4910.4895|thanh thuy:,271,4878.4880.4874.4881|thinh minh:31,333,|tho tang:10,125,1788.1779.1780|tho van:,276,4989.4991.4985|thong nhat:31,333,6016.6018.6025;31,331,5982|thu cuc:,273,4927|thung nai:31,330,5956.5958.5959|thuong coc:31,332,5999.5997.5989|thuong long:,274,4939.4951.4937|tien lu:10,126,1807.1808.1809.1806|tien luong:,275,4978.4976|tien phong:31,331,5981.5982|toan thang:31,327,5906.5904|tram than:,279,5070.5071.5072|trung son:,274,4950|tu vu:,271,4875.4889|van ban:,275,4979.4966.4982|van lang:,278,5031.5030.5039.5034|van mieu:,272,4904.4903.4893|van phu:,269,4839.4837.4842.4836|van son:31,327,5905.5915|van xuan:,276,4994|viet tri:,269,4827.4835.4841.4829.4826|vinh an:10,125,1765.1769.1785|vinh chan:,278,5033.5043.5040|vinh hung:10,125,1767.1772.1786|vinh phu:10,125,1773.1783|vinh phuc:10,123,1748.1747.1749.1750.1754|vinh thanh:10,125,1770|vinh tuong:10,125,1781.1787.1784|vinh yen:10,123,1746.1745.1751.1753|vo mieu:,272,4900.4908.4915|xuan dai:,273,4934.4925.4930|xuan hoa:10,122,1740.1739.1741.1744|xuan lang:10,120,1705.1717.1710.1714|xuan lung:,277,5009.5007.5008|xuan vien:,274,4943.4946.4936|yen ky:,278,5042.5023.5041|yen lac:10,118,1674.1675.1677|yen lang:10,121,1719.1720|yen lap:,274,4938.4949.4940.4935|yen phu:31,332,6010.6008.6007|yen son:,272,4907.4909|yen thuy:31,329,5951.5949.5950|yen tri:31,329,5952.5941.5945.5953","28":"an sinh:,293,5373.5374.5364.5369|ba che:,294,5389.5383.5386.5388|bai chay:,302,5486.5490|binh khe:,293,5380.5381.5375|binh lieu:,295,5393.5398.5396|cai chien:,301,5458|cam pha:,298,5424.5427.5426.5423.5429|cao xanh:,302,5484.5483|co to:,299,5437.5438.5439|cua ong:,298,5428.5432.5425.5431|dam ha:,296,5408.5404.5407.5406|dien xa:,290,5327.5322.5325|dong mai:,292,5344.5343|dong ngu:,290,5321.5323.5324|dong trieu:,293,5362.5379.5364.5366.5367|duong hoa:,301,5457.5465.5468|ha an:,292,5354.5355.5353|ha lam:,302,5485.5481.5482|ha long:,302,5478.5477|ha tu:,302,5480.5479|hai hoa:,298,|hai lang:,290,5320.5326;,298,|hai ninh:,300,5452.5450|hai son:,300,5449.5455|hiep hoa:,292,5342.5345.5359|hoang que:,293,5371.5365.5377.5378|hoanh bo:,302,|hoanh mo:,295,5392.5391|hong gai:,302,5491.5475.5474|ky thuong:,294,5382.5387;,302,|lien hoa:,292,5348.5347.5360.5356|luc hon:,295,5390.5394|luong minh:,302,;,294,|mao khe:,293,5368.5370.5372.5363|mong cai 1:,300,5448.5446.5447.5441.5445|mong cai 2:,300,5444.5440.5454|mong cai 3:,300,5443.5453|mong duong:,298,5434.5436|phong coc:,292,5349.5352.5346.5358|quang duc:,301,5463.5470.5471|quang ha:,301,5460.5465.5467.5466.5472|quang hanh:,298,5422.5430.5421|quang la:,302,|quang tan:,296,5405.5399.5400.5403|quang yen:,292,5350.5351.5357|thong nhat:,302,|tien yen:,290,5321.5328.5329.5327.5319|tuan chau:,302,5493.5488.5487|uong bi:,291,5333.5334.5332.5331|van don:,297,5409.5415.5416.5417.5414.5418.5410.5412.5413.5411.5419.5420|vang danh:,291,5334.5337.5338.5336|viet hung:,302,5492.5489.5488|vinh thuc:,300,5451.5456|yen tu:,291,5335.5339.5341","29":"ban bo:,304,5509.5518|binh lu:,304,5511.5507.5519|bum nua:,308,5591|bum to:,308,5587.5584|dao san:,305,5528.5537.5522|doan ket:,311,5619.5618.17006;,305,|hong thu:,306,5550.5548.5558|hua bum:,308,18446;,310,|khoen on:,307,5567.5570|khong lao:,305,5521.5523.5524|khun ha:,304,5515.5514|le loi:,310,5606.5610.5607;,306,5541|mu ca:,308,5585|muong khoa:,309,5598.5603|muong kim:,307,5577.5564.5573|muong mo:,310,5609.5612|muong te:,308,5589.5587|muong than:,307,5571.5576|nam cuoi:,306,5553.5554|nam hang:,310,5615.5611.5616|nam ma:,306,5547.5555|nam so:,309,5599.5600|nam tam:,306,18447.5552.5556|pa tan:,310,5614.5613;,306,5543|pa u:,308,18445.5590|pac ta:,309,5604.5595|phong tho:,305,5538.5532.5533|pu sam cap:,306,18448.5557.5560|si lo lau:,305,5530.5531.5539.5527|sin ho:,306,5544.5546.5561.5545|sin suoi ho:,305,5536.5529;,304,5512|ta leng:,304,5517.5520.5508|ta tong:,308,5592|tan phong:,311,5623.5621.5617;,304,5516.5513|tan uyen:,309,5594.5602.5596.5601|than uyen:,307,5568.5578.5574.5565|thu lum:,308,5593.5583|tua sin chai:,306,5542.5562.5563","30":"bac yen:,322,5817.5816.5825.5826|binh thuan:,318,5767.5766|bo sinh:,314,5659.5656.5657|chieng an:,315,5681.5674.5682|chieng coi:,315,5683.5680.5684|chieng hac:,320,5796.5797.5801|chieng hoa:,313,5647.5649.5653|chieng khoong:,314,5667.5671|chieng khuong:,314,5673.5670|chieng la:,318,5754.5748.5744.5740|chieng lao:,313,5642.5640.5641|chieng mai:,316,5706.5696.5695.5697.5690|chieng mung:,316,5707.5703.5708|chieng sai:,322,5829|chieng sinh:,315,5679.5685|chieng so:,314,5664.5663|chieng son:,319,5776;,321,5810|chieng sung:,316,5704.5702|co ma:,318,5763.5756.5761|doan ket:,319,|gia phu:,317,5713.5714.5721.5718|huoi mot:,314,5669.5666|kim bon:,317,5728.5726|long he:,318,5746.5751|long phieng:,320,5792.5793|long sap:,319,5784.5782.5781|mai son:,316,5709.5692|moc chau:,319,5773.5782|moc son:,319,5774|muoi noi:,318,5760.5762.5764|muong bam:,318,5750|muong bang:,317,5727.5720.5717|muong bu:,313,5652.5650.5654|muong chanh:,316,5689.5705|muong chien:,312,5625.5626.5624|muong coi:,317,5733.5712.5732|muong e:,318,5765.5741|muong gion:,312,5628|muong hung:,314,5668.5672|muong khieng:,318,5745.5755.5749|muong la:,313,5639.5651.5646.5644.5648.5645|muong lam:,314,5660|muong lan:,323,5838|muong leo:,323,5836|muong sai:,312,5633.5634|nam lau:,318,5759.5752|nam ty:,314,5658.5661|ngoc chien:,313,5643|pac nga:,322,5823.5821|phieng cam:,316,5693.5694|phieng khoai:,320,5791|phieng pan:,316,5698.5700.5699|phu yen:,317,5734.5715.5716.5736.5719.5737|pung banh:,323,5834.5832|quynh nhai:,312,5636.5630.5631.5632|song khua:,321,5815.5806.5808.5814|song ma:,314,5665.5655|sop cop:,323,5837.5835.5833|ta hoc:,316,5701|ta khoa:,322,5824.5830.5827|ta xua:,322,5822.5820|tan phong:,317,5731.5730.5729|tan yen:,319,|thao nguyen:,319,|thuan chau:,318,5753.5738.5758|to hieu:,315,5678.5675.5677.5676|to mua:,321,5805.5804.5802|tuong ha:,317,5725.5724.5722.5723|van ho:,321,5811.5803.5813.5807|van son:,319,|xim vang:,322,5818.5819|xuan nha:,321,5809.5812|yen chau:,320,5800.5789.5787.5794.5795.5790|yen son:,320,5798.5799","32":"an nong:,345,6311.6312.6326.6329|ba dinh:,340,6236.6224.6230.6225|ba thuoc:,356,6570.6587.6572|bat mot:,348,6421|bien thuong:,342,6272.6270.6277|bim son:,359,6665.6668.6663;,352,6514|cam tan:,354,6547.6549.6545|cam thach:,354,6542.6532.6541.6538|cam thuy:,354,6544|cam tu:,354,6540.6539.6543.6537|cam van:,354,6546.6533.16989.6548|co lung:,356,6586.6571|cong chinh:,346,6379.6358.6381|dien lu:,356,6569.6581.6578|dien quang:,356,6577.6580.6576|dinh hoa:,357,6598.6604.6600.6603;,360,6672|dinh tan:,357,6621.6597.6606.6605|dong luong:,343,6283.6286|dong quang:,344,6304.24603|dong son:,344,|dong thanh:,350,6460.6462.6464.6469|dong tien:,345,6330.6319.6331;,360,6686;,344,|giao an:,343,6285.6282|ha long:,352,6519.6518.6517|ha trung:,352,6512.18452.6511.6499|hac thanh:,344,6300.6292.6298.6290.6295.6297.6291.6293.6299.6306.6305|ham rong:,344,19466.6300.6301.6302.6296|hau loc:,350,6471.6465.6456.6478|hien kiet:,355,6551|ho vuong:,340,6213.6234.6216.6219|hoa loc:,350,6468.18466.6455.6470.6474|hoa quy:,349,6450.6437|hoang chau:,336,6086.6115.6105.6084|hoang giang:,336,6123.6087.6116.6107|hoang hoa:,336,6078.6098.6097.6109.6108.6110|hoang loc:,336,6085.6100.6113.6126.6112.6101|hoang phu:,336,6106.6080.6124.6116|hoang son:,336,6117.6095.6088.6096|hoang thanh:,336,6085.6114.6124.6109|hoang tien:,336,6104.6103.6102.6111|hoat giang:,352,6512|hoi xuan:,355,6561.6566|hop tien:,345,6324.6316.6317.6325.6308|kien tho:,335,6070.6065.6059|kim tan:,338,6164.6152.6149.6148.6162|lam son:,358,6625.6636.6658|linh son:,343,6279|linh toai:,352,6508.6505|luan thanh:,348,6425.6424.6428|luong son:,348,6420|luu ve:,339,6178.6189|mau lam:,351,6492.6491|minh son:,335,6057.6067.6076.6077|muong chanh:,353,6528|muong lat:,353,6526|muong ly:,353,6524|muong min:,337,6133|na meo:,337,6138|nam sam son:,339,6195;,361,|nam xuan:,355,6559.6554|nga an:,340,6217.6223.6222|nga son:,340,6210.6214.6234.6215|nga thang:,340,6232.6226.6237|ngoc lac:,335,6060.6061.6056|ngoc lien:,335,6075.6074.6069.6073.6068|ngoc trao:,338,6163.6150.6155.6144|nguyet an:,335,6071.6064.6063|nguyet vien:,344,18468|nhi son:,353,6523|nhu thanh:,351,6485.6480.6486.6484|nhu xuan:,349,6452.6445|nong cong:,346,6373.6354.6349.6365.6356.6355|phu le:,355,6552.6564.6568|phu xuan:,355,6560|pu luong:,356,6591.6585.6584|pu nhi:,353,|quan son:,337,6130.6135|quang binh:,339,6188.6202.6177.6187|quang chieu:,353,6527|quang chinh:,339,6186.6199.6185.6184|quang ngoc:,339,6181.6198.6203.6183|quang ninh:,339,6204.6176.6190|quang phu:,344,14348.13327.6307.6303|quang trung:,359,6664.6662.6669.6666|quang yen:,339,6197.6168.6175.6180|quy loc:,357,6616.6608.6615|quy luong:,356,6579.6588.6573|sam son:,361,16394.12305.6707.6704.6705.6706.6703|sao vang:,358,6622.18454.6647|son dien:,337,6131|son thuy:,337,6137|tam chung:,353,|tam lu:,337,6134.6130.6128|tam thanh:,337,6129|tan ninh:,345,6318.6327|tan thanh:,348,6425.6434|tan tien:,340,6218.6233.6221|tay do:,342,6265.6263.6264.6274|thach binh:,338,18453.6159.6166.6142|thach lap:,335,6062.6072.6066|thach quang:,338,6145.6153.6140|thang binh:,346,6361.6351.6367|thang loc:,348,6433.6432|thang loi:,346,6372.6364.6377.6357|thanh ky:,351,6494.6483|thanh phong:,349,6438.6447.6443|thanh quan:,349,6448.6449.6442|thanh vinh:,338,6157.6141.6161.6146|thien phu:,355,6565.6558|thiet ong:,356,18451.6589|thieu hoa:,360,6676.6690.6672.6683.6673|thieu quang:,360,6699.6700.6691.6698.6684|thieu tien:,360,6675.6678.6680.6681|thieu toan:,360,6670.6690.6679|thieu trung:,360,6690.6689.6674.6697.6671|tho binh:,345,6338.6321.6320|tho lap:,358,6634.6643|tho long:,358,6642.6632.18456.6655.6631|tho ngoc:,345,6337.6322.6323.6339|tho phu:,345,6343.6314.6315.6313.6340|tho xuan:,358,6623.6645.6660|thuong ninh:,349,6453.6444.6436|thuong xuan:,348,6419.6418.6417.6435|tien trang:,339,6200.6201|tong son:,352,6521.6516.6498.6520|trieu loc:,350,6459.6461.6479|trieu son:,345,6334.6333.6345.6310.6309|trung chinh:,346,6348.6346.6369.6370.6374.6375|trung ha:,337,6139.6132.6136|trung ly:,353,6525|trung son:,355,6556|trung thanh:,355,6567.6557|truong van:,346,6359.6360.6350.6378|tuong linh:,346,6352.6362.6366|van du:,338,6160.6154.6158|van loc:,350,6477.6458.6475.6454.6476|van nho:,356,6574.6575|van phu:,343,6284.6280|van xuan:,348,6430|vinh loc:,342,6270.6273.6268.6267|xuan binh:,349,6441.6446.6440|xuan chinh:,348,6423.6431|xuan du:,351,6490.6489.6488|xuan hoa:,358,6656.6646.6644.6630|xuan lap:,358,6653.6629.6654|xuan thai:,351,6493|xuan tin:,358,6627.6651|yen dinh:,357,6607.6620.6596.6599|yen khuong:,343,6281|yen nhan:,348,6422|yen ninh:,357,6617.6594.6618|yen phu:,357,6611.6609|yen thang:,343,6288|yen tho:,351,6496.18457.6480|yen truong:,357,6592.6593.6613.6601","33":"an chau:,371,6870.6891.6862.6880|anh son:,362,6722.6726|anh son dong:,362,6715.6724.6727|bac ly:,372,6914|bach ha:,374,6975.6955.6961.6964|bach ngoc:,374,6959.6970.6971|bich hao:,381,7185.7193.7160|binh chuan:,363,6739|binh minh:,376,7029.7042.7051.7022|cam phuc:,363,6737.6742|cat ngan:,381,7174.7173|chau binh:,366,6791|chau hong:,382,7214.7215.7216|chau khe:,363,6736.6738|chau loc:,382,7206.7218|chau tien:,366,6791.6786.6787.6783|chieu luu:,372,6904.6916|con cuong:,363,6746.6745|cua lo:,373,|dai dong:,381,7169.7187.7168.7194|dai hue:,378,7119.7104.7108|dien chau:,371,6866.6861.6863|do luong:,374,6945.6953.6976.6943.6957.6952.6968.6966.6954|dong hieu:,365,6778.6776.6777|dong loc:,375,6982|dong thanh:,376,7038.7045.7020|duc chau:,371,6864.6860.6887.6893|giai lac:,376,7023.7026.7039|giai xuan:,370,6843.6853|hai chau:,371,6895.6872.6878|hai loc:,375,6998.7000.6988|hanh lam:,381,7196.7178|hoa quan:,381,7172.7175.7171|hoang mai:,380,7151.7156.7158|hop minh:,376,7048.7014.7041.7047.7017|hung chan:,366,6784.6790.6789|hung chau:,371,6871.6873.6884.6881|hung nguyen:,364,6747.6749.6748|hung nguyen nam:,364,6752|huoi tu:,372,6903|huu khuong:,368,6816|huu kiem:,372,6902.6906.6905|keng du:,372,6898|kim bang:,381,7192.7182|kim lien:,378,7109.7099.7098.7106|lam thanh:,364,|luong minh:,368,6801|luong son:,374,6974.6958.6960.6962|mau thach:,363,6740.6743|minh chau:,371,6882.6886|minh hop:,382,7217.7219.7222|mon son:,363,6744.6734|muong chong:,382,7213.7207.7220|muong ham:,382,7204.7209|muong long:,372,6900|muong quang:,369,6833.6828.6825|muong tip:,372,6907.6917|muong xen:,372,6897.6915.6908|my ly:,372,6913|na loi:,372,6899.6912|na ngoi:,372,6911.6909|nam can:,372,6911.6901|nam dan:,378,7113.7102|nga my:,368,6809.6820|nghi loc:,375,6985.7001.7004|nghia dan:,379,7140.7144.7149|nghia dong:,370,6846|nghia hanh:,370,6841.6839.6851|nghia hung:,379,7127|nghia khanh:,379,7123.7124.7128|nghia lam:,379,7145.7143.7146.7138|nghia loc:,379,7131.7147|nghia mai:,379,7132.7133.7126|nghia tho:,379,7139.7130.7142|nhan hoa:,362,6708.6712|nhon mai:,368,6806.6817|phuc loc:,375,6994.6995.6989.6990|quan thanh:,376,7016.7050.7036.7031|quang chau:,371,6869.6874.6894|quang dong:,376,7021.7025.7040|que phong:,369,6831.6830.6829|quy chau:,366,6781.6782.6788|quy hop:,382,7203.7208.7205.7212|quynh anh:,377,7071.7076.7078.7091|quynh luu:,377,7073.7062.7063.7064|quynh mai:,380,7159.7152.7153.7154|quynh phu:,377,7059|quynh son:,377,7075.7068|quynh tam:,377,7077.7088.7079|quynh thang:,377,7090.7080|quynh van:,377,7089.7069.7070|son lam:,381,7199.7202|tam dong:,381,7186.7190.7165|tam hop:,382,7210.7221.7211.7223|tam quang:,368,6802.6799|tam thai:,368,6805.6804|tan an:,370,6844.6849.6852|tan chau:,371,6875.6876.6883.6879|tan ky:,370,6835.6836.6837.6838|tan mai:,380,7150.7157.7155|tan phu:,370,6850.6854.6855|tay hieu:,365,6773.6775.6771|thai hoa:,365,6779.6774.6772|than linh:,375,6981.6991.6992|thanh binh tho:,362,6717.6718.6728|thanh vinh:,373,6918.6920.6923.6929.6940.6942|thien nhan:,378,7111.7107|thong thu:,369,6823.6834|thuan trung:,374,6973.6969.6948.6950.6972.6949|tien dong:,370,6842.6856|tien phong:,369,6824.6827|tri le:,369,6832.6822|trung loc:,375,6980.6996.6987.6984|truong vinh:,373,6936.6930.6931.6925.6928.6941.6926|tuong duong:,368,6814.6800.6815|van an:,378,7100.7101|van du:,376,7030.7043.7044|van hien:,374,6951.6944.6947.6965.6946|van kieu:,375,6993.7001|van tu:,376,7027.7035|vinh hung:,373,6939.6924.6938.6935|vinh loc:,373,6927|vinh phu:,373,6933.6921.6932.6934|vinh tuong:,362,6710.6711.6719|xuan lam:,381,7170|yen hoa:,368,6819.6808|yen na:,368,6818.6807|yen thanh:,376,7021.7015.7046.7033|yen trung:,364,6767.18450.6768|yen xuan:,362,6709.6723.6713.6725","34":"bac hong linh:,395,7497.7500.7499;,387,7317|cam binh:,391,7420;,390,7378|cam due:,390,7379.7380.7404|cam hung:,390,7385.7384.7383|cam lac:,390,7392.7382.7391|cam trung:,390,7389.7388.7390|cam xuyen:,390,7393.7381.7401|can loc:,385,7267.7268.7271|co dam:,387,7320.7321.7319|dan hai:,387,7305.7309.7308|dong kinh:,392,7423.7422|dong loc:,385,7288.7286.7287|dong tien:,391,|duc dong:,384,7256.7246.7245|duc minh:,384,7263.7262|duc quang:,384,7242|duc thinh:,384,|duc tho:,384,7237.7244|gia hanh:,385,7280.7272|ha huy tap:,391,7405|ha linh:,389,7358|hai ninh:,394,7478.7489.7480|hoanh son:,394,7488.7487.7486.7495|hong loc:,392,|huong binh:,389,7356.7376.7357|huong do:,389,7355.7364.7367|huong khe:,389,7361.7372.7371|huong pho:,389,7373.7374.7375|huong son:,388,7341.7335.7342.7336.7323|huong xuan:,389,7366.7368.7370|kim hoa:,388,|ky anh:,394,7490.7468.7469.7466|ky hoa:,394,7483.7482|ky khang:,394,7475.7485.7484|ky lac:,394,7477|ky thuong:,394,7471.7494|ky van:,394,7472.7496.7476|ky xuan:,394,7465.7470.7467|loc ha:,392,|mai hoa:,383,7230.7229.7228|mai phu:,392,|nam hong linh:,395,7501.7498.7502|nghi xuan:,387,7315.7304.7312.7316.7318|phuc trach:,389,7363.7365.7362|son giang:,388,7333.7332|son hong:,388,7328.7329|son kim 1:,388,7326|son kim 2:,388,7327|son tay:,388,7324.7325|son tien:,388,7347.7346|song tri:,394,7487.7492.7481|thach ha:,392,7421.7425.7429|thach khe:,391,|thach lac:,391,|thach xuan:,392,7445|thanh sen:,391,7408.7412.7405.7406.7413.7409.7414.7407.7418|thien cam:,390,7377.7387|thuong duc:,383,7227.7226.7225|tien dien:,387,7314.7313.7310.7311|toan luu:,392,7451|tran phu:,391,7416.7415|truong luu:,385,7278.7274|tu my:,388,|tung loc:,385,7269.7276|viet xuyen:,392,7438|vu quang:,383,7232.7224|vung ang:,394,7487.7491.7493|xuan loc:,385,7285.7289.7284|yen hoa:,390,7396","36":"a doi:,406,7724.7722|ai tu:,404,7686.7691.7696|ba don:35,403,7665.7666.7675.7670|ba long:,410,7754.7753|bac gianh:35,403,7663.7674.7673|bac trach:35,402,7644.7641.7645|ben hai:,413,7806.7805.7807|ben quan:,412,7785.7784.7780.7783|bo trach:35,402,7657.7640.7661.7655|cam hong:35,396,7508.7526.7507.7528|cam lo:,408,7737.7734.7741.7742|con co:,409,|con tien:,413,7813.7818.7810|cua tung:,412,7798.7781|cua viet:,413,7812.7819.7803|dakrong:,410,7757.7744.7751|dan hoa:35,400,7613.7615|dien sanh:,411,7775|dong ha:,405,7698.7700.7701.7703.7706|dong hoi:35,398,7561.7563.7558.7556.7564.7560.7562|dong le:35,397,7531.7536.7538.7537.7539|dong son:35,398,7566.7552.7554|dong thuan:35,398,7565.7551.7553|dong trach:35,402,7647.7648.7660|gio linh:,413,7808.7820.7802|hai lang:,411,7761.7768.7769|hieu giang:,408,7740.7738.7739|hoa trach:35,399,7601.7581.7600|hoan lao:35,402,7653.7662.7652.7633.7650|huong hiep:,410,7745.7752.7756|huong lap:,406,7718.7719|huong phung:,406,7717.7715.7716|khe sanh:,406,7714.7720.7709.7707|kim dien:35,400,7617.7610|kim ngan:35,396,7523.7527.7512|kim phu:35,400,7606.7607.7614.7605|la lay:,410,7748.7747|lao bao:,406,7721.7712.7713|le ninh:35,396,7525.7509.7511|le thuy:35,396,7515.7503.7510.7506.7504.7505|lia:,406,7726.7727|minh hoa:35,400,7602.7603.7608.7604|my thuy:,411,7759.7762.7770|nam ba don:35,403,7668.7664.7671.7667.7678|nam cua viet:,404,7684.7689|nam dong ha:,405,7705.7704.7699.7702|nam gianh:35,403,7669.7672.7677.7676|nam hai lang:,411,7758.7777|nam trach:35,402,7659.7634|ninh chau:35,401,7629.7622.7628.7621|phong nha:35,402,7639.7637.7638|phu trach:35,399,7572.7576.7578.7577|quang ninh:35,401,7624.7623.7619.7618|quang trach:35,399,7598.7574.7597|quang tri:,407,7733.7730.7731.7732.7729|sen ngu:35,396,7513.7520|ta rut:,410,7746.7750.7749|tan gianh:35,399,7575|tan lap:,406,7711.7710.7708|tan my:35,396,7514.7524.7516.7519|tan thanh:35,400,|thuong trach:35,402,7636.7635|trieu binh:,404,7681.7680.7692.7697|trieu co:,404,7685.7693|trieu phong:,404,7687.7690.7688|trung thuan:35,399,7582.7599.7592|truong ninh:35,401,7627.7626.7625.7630|truong phu:35,396,7521.7517.7518|truong son:35,401,7631.7632|tuyen binh:35,397,7545.7544.7546|tuyen hoa:35,397,7548.7550.7549.7547|tuyen lam:35,397,7532.7534|tuyen phu:35,397,7540.7543.7541|tuyen son:35,397,7533.7535|vinh dinh:,411,7765|vinh hoang:,412,7795.7782.7793|vinh linh:,412,7786.7779.7787|vinh thuy:,412,7788.7789.7790","37":"a luoi 1:,417,7889.7883.7880|a luoi 2:,417,7895.7877.7873|a luoi 3:,417,7891.7875.7884.7887|a luoi 4:,417,7892.7885.7879|a luoi 5:,417,7874.7882|binh dien:,421,7936.7941|chan may lang co:,415,7846.7853.7857.7850|dan dien:,419,7920.7915.7921.7914|hoa chau:,419,7916|hung loc:,415,7851.7855.7854|huong thuy:,416,7863.7862.7865|huong tra:,421,7948.7947|khe tre:,415,|kim tra:,421,7944.7937.7942|loc an:,415,7844.7859.7856|long quang:,415,|my thuong:,414,7833.7835|nam dong:,415,|phong dien:,418,7911.7899.7906|phong dinh:,418,7901.7898.7909|phong phu:,418,|phong quang:,419,7918.7917;,418,7904|phong thai:,418,7907.7910.7902|phu bai:,416,7871.7868.7870.7866|phu ho:,414,7840.7823.7830|phu loc:,415,7843.7860.7849|phu vang:,414,7834.7842|phu vinh:,414,7827.7825.7841.7831|quang dien:,419,7913.7922.7912.7919|thanh thuy:,416,7872.7869.7864|thuan an:,414,7837.7836|vinh loc:,415,7852.7847.7858","39":"an phu:,445,8291.8292.23564|ba dinh:,453,8400.8384|ba dong:,453,8391.8385.8388|ba gia:,452,8380.8370.8371|ba to:,453,8387.8389.8382.8393.8398|ba vi:,453,8392.8390.8395|ba vinh:,453,8383.8396|ba xa:,453,8397|binh chuong:,444,8260.8269|binh minh:,444,8261.8266.8268|binh son:,444,8279.8259.8263.8278.8276.8267.8270|bo y:43,490,8909.8902|ca dam:,447,8308.8312|cam thanh:,445,8287.8288.8290.8283|dak bla:43,488,8877.8879.8878|dak cam:43,488,8888.8874.8876|dak ha:43,484,8839.8831.8838|dak koi:43,491,8911.8912|dak long:43,492,8924|dak mar:43,484,8835.8833|dak mon:43,492,8925.8926|dak pek:43,492,8917|dak plo:43,492,8919.8927|dak pxi:43,484,18465.8832|dak ro wa:43,488,8880.8882.8881|dak rve:43,491,8910.8914|dak sao:43,486,8852.8855|dak to:43,489,8899.8893.8898.8897|dak to kan:43,486,8856.8861|dak ui:43,484,18461.8834|dang thuy tram:,453,8386.8394|dinh cuong:,441,8228.8226.8222|dong son:,444,8262.8264.8278;,445,23569|dong tra bong:,447,8307.8309.8316|duc nong:43,490,8903.8905.8904|duc pho:,451,8356.8357.8346.8359|ia chim:43,488,8892.8889.8884|ia dal:43,493,|ia toi:43,493,8931.8929|khanh cuong:,451,8349.8350|kon braih:43,491,8913.8915.8916|kon dao:43,489,8895.8901.8896|kon plong:43,487,8867.8871.8868|kon tum:43,488,8890.8891.8875.8872.8873|lan phong:,446,8302.8294|long phung:,446,8300.8305|ly son:,449,|mang but:43,487,8863.8865.8864|mang den:43,487,8866.8869|mang ri:43,486,8859.8858.8853|minh long:,443,8252.8254.8256|mo cay:,446,8299.8304.8298|mo duc:,446,8293.8301.8295.8296|mo rai:43,485,|nghia giang:,442,8249.8241.8237|nghia hanh:,441,8233.8232.8231|nghia lo:,445,8286.8284.8285.8289|ngoc linh:43,492,8922.8923|ngok bay:43,488,8887.8885|ngok reo:43,484,8836.8837|ngok tu:43,489,8900.8894|nguyen nghiem:,451,8351.8352|phuoc giang:,441,8225.8223.8224|ro koi:43,485,8841|sa binh:43,485,8845.8850.8846|sa huynh:,451,8347.8354|sa loong:43,490,8906.8908|sa thay:43,485,8844.8842.8840|son ha:,450,8343.8331.8334.8337.8338.8339|son ky:,450,8330.8340|son linh:,450,8332.8333.8336|son mai:,443,8253.8255|son tay:,454,8401.8408.8404|son tay ha:,454,8409.8402.8406|son tay thuong:,454,8403.8407.8405|son thuy:,450,8341.8342.8335|son tinh:,452,8367.8375.8379|tay tra:,447,|tay tra bong:,447,|thanh bong:,447,8310.8311|thien tin:,441,8227.8229.8230|tho phong:,452,8366.8369|tinh khe:,445,23570.23571.23572.23573.23568|tra bong:,447,8315.8317.8313|tra cau:,451,8348.8353.8358.8355|tra giang:,442,8246.8247.8242|truong giang:,452,8365.8377.8378|truong quang trong:,445,13330.23565.23566.23567|tu mo rong:43,486,8860.8857|tu nghia:,442,8250.8251.8235.8240|van tuong:,444,8265.8277.8280.8282.8281.8272|ve giang:,442,8234.8239.8245|xop:43,492,8921.8920|ya ly:43,485,8849.8848.8847","42":"anh dung:47,540,9518.9522|ba ngoi:,478,8749.8758|bac ai:47,538,9498.9503.9501|bac ai dong:47,538,9502.9505|bac ai tay:47,538,9497.9499.9500|bac cam ranh:,478,8755.8759.8760|bac khanh vinh:,480,8785.8786|bac nha trang:,475,8706.8699.8701.8705.8709.8702|bac ninh hoa:,476,8714.8730.8734|bao an:47,544,9546.9549.9547|ca na:47,541,9529.9527|cam an:,482,8801.8802.8808|cam hiep:,482,8805.8806.8809.8811.8814.8812|cam lam:,482,8813.8802.8803.8804.8806.8807.8809.8810.8812|cam linh:,478,8752.8754.8763|cam ranh:,478,8753.8756.8757|cong hai:47,543,9541.9543|dai lanh:,483,8827.8818.8828|dien dien:,479,8773.8775.8767|dien khanh:,479,8779.8782.8766|dien lac:,479,8769.8770.8777|dien lam:,479,8771|dien tho:,479,8774.8778.8776|do vinh:47,544,9548;47,540,9519|dong hai:47,544,9561.9555.9558.9559|dong khanh son:,477,8741.8742.8746|dong ninh hoa:,476,8721.8736.8717.8727|hoa thang:,476,8719.8720.8725|hoa tri:,476,8735.8737.8733|khanh son:,477,8748.8743.8744|khanh vinh:,480,8796.8789.8795|lam son:47,540,9520.9516|my son:47,538,9504;47,540,9521|nam cam ranh:,478,8751.8761.8762.8750|nam khanh vinh:,480,8783.8790.8793.8794|nam nha trang:,475,8707.8690.8692.8711.8689|nam ninh hoa:,476,8722.8723.8731.8724|nha trang:,475,8687.8691.8698.8704|ninh chu:47,544,9560;47,542,9530|ninh hai:47,542,9533.9535;47,543,9540|ninh hoa:,476,16994.8716.8718.8726|ninh phuoc:47,539,9506.9511.9512|ninh son:47,540,9515.9517|phan rang:47,544,9554.9557.9552.9550|phuoc dinh:47,544,9561;47,539,9509;47,541,9525|phuoc ha:47,541,9524.9528|phuoc hau:47,539,9510.9514.9508|phuoc huu:47,539,9507.9513|suoi dau:,482,8807.8809.8814.8812|suoi hiep:,479,8781|tan dinh:,476,8715.8739.8728|tay khanh son:,477,8745.8747|tay khanh vinh:,480,8784.8788.8791|tay nha trang:,475,8708.8710.8688.8695.8700.8703|tay ninh hoa:,476,8729.8732|thuan bac:47,543,9542.9539.9544|thuan nam:47,541,9526.9523.17930|trung khanh vinh:,480,8787.8792|truong sa:,481,8798.8800.8799|tu bong:,483,8821.8822.8825|van hung:,483,8830.8829|van ninh:,483,8823.8824.8819|van thang:,483,8820.8826|vinh hai:47,542,9532.9537.9534|xuan hai:47,542,9538.9531.9536","44":"al ba:,502,9059|an binh:,499,9018.9019;,509,9137|an hao:40,456,8429.8430.8431|an hoa:40,460,8483.8481|an khe:,509,9139.9142.9138.9147.9140.9141|an lao:40,460,8482.8479.8485|an luong:40,463,8529.8513.8524|an nhon:40,458,8453.8458.8455|an nhon bac:40,458,8454.8456.8457|an nhon dong:40,458,8447.8448|an nhon nam:40,458,8460.8451|an nhon tay:40,458,8461.8450|an phu:,497,8990.8977.8983|an toan:40,460,8483.8486|an tuong:40,456,8434.8438|an vinh:40,460,8480.8488.8487|ayun:,505,9096.9095|ayun pa:,510,9149.9150.9148.9151|bau can:,494,8945.8944.8943|bien ho:,506,9113.9107;,497,8980;,498,9011|binh an:40,455,8411.8423.8416.8415|binh dinh:40,458,8459.8452.8449|binh duong:40,463,8511.8520.8521|binh hiep:40,455,8412.8413.8414|binh khe:40,455,8419.8420|binh phu:40,455,8421.8410.8418|bo ngoong:,502,9062.9056.9049|bong son:40,459,8468.8478|canh lien:40,457,8446|canh vinh:40,457,8443.8444.8445|cat tien:40,465,8559.8558.8566|cho long:,504,9084.9082|chu a thai:,496,8969.8967|chu krey:,504,9080|chu pah:,506,9117.9114.9112|chu prong:,494,8941.8940.8951.8942|chu puh:,508,9134|chu se:,502,9054.9053.9048.9057|cuu an:,509,9145.9143.9144.9146|dak doa:,498,9001.9006.9004|dak po:,499,9022.9020.9024|dak rong:,503,9072.9075|dak somei:,498,9000|dak song:,504,9089.9090|de gi:40,465,8555.8553.8554|dien hong:,497,8993.8992.8978|duc co:,501,9038.9045|gao:,497,8998;,500,9033|hoa hoi:40,465,8557.8560|hoai an:40,456,8436.8425.8437.8426|hoai nhon:40,459,8464.8463.8462|hoai nhon bac:40,459,8472.8470.8474|hoai nhon dong:40,459,8466.8465.8477|hoai nhon nam:40,459,8467|hoai nhon tay:40,459,8473.8475|hoi phu:,497,8976.8985.8994|hoi son:40,465,8556.8552|hra:,505,|ia bang:,498,9007.9008|ia boong:,494,8948.8950.8935|ia chia:,500,|ia dok:,501,9039.9040|ia dom:,501,9044|ia dreh:,495,8953.8956|ia grai:,500,9035.9036|ia hiao:,496,8968.8971.8973|ia hru:,508,9130;,502,|ia hrung:,500,9027.9029.9026.9028|ia khuol:,506,9110.9108.9105|ia ko:,502,9058;,508,9135|ia krai:,500,9037.9031.9030|ia krel:,501,9042.9047|ia lau:,494,8932.8949|ia le:,508,9136|ia ly:,506,9109|ia mo:,494,|ia nan:,501,9041|ia o:,500,9032|ia pa:,507,9119.9122|ia phi:,506,9116.9104|ia pia:,494,8933.8934|ia pnon:,501,9046|ia puch:,494,8937|ia rbol:,510,|ia rsai:,495,8961|ia sao:,510,|ia tor:,494,8939.8946|ia tul:,507,9126.9127.9125|kbang:,503,9076.9063|kdang:,498,9012|kim son:40,456,8435|kon chieng:,505,9098.9100|kon gang:,498,9013.9002.9009.9005|kong bo la:,503,9065.9064|kong chro:,504,9083.9081|krong:,503,|lo pang:,505,9099.9097.9094|mang yang:,505,9092;,498,9015|ngo may:40,465,8569.8563.8568|nhon chau:40,464,8533|phu cat:40,465,8551.8565.8561|phu my:40,463,8514.8528.8522|phu my bac:40,463,8515.8516.8519|phu my dong:40,463,8512.8526.8525|phu my nam:40,463,8517.8523|phu my tay:40,463,8518.8527|phu thien:,496,8966.8975.8972|phu tuc:,495,8959.8962.8955.8954.8960|pleiku:,497,8996.8981.8986.8997.8989|po to:,507,9123.9124|quy nhon:40,464,8539.8541.8540.8531|quy nhon bac:40,464,8546.8548|quy nhon dong:40,464,8537.8545.8535.8534|quy nhon nam:40,464,8543.8542.8538.8544|quy nhon tay:40,464,8547.8536|son lang:,503,9069|sro:,504,9086.9088|tam quan:40,459,8471.8469|tay son:40,455,8424.8422.8417|thong nhat:,497,8987.8991.8988|to tung:,503,9066|tuy phuoc:40,462,8507.8506.8498.8499.8508|tuy phuoc bac:40,462,8501.8505.8503|tuy phuoc dong:40,462,8502.8504.8500|tuy phuoc tay:40,462,8510.8509|uar:,495,8964.8957|van canh:40,457,8441.8443.8442.8440|van duc:40,456,8433.8427.8428|vinh quang:40,461,8489.8493.8494|vinh son:40,461,8497.8496|vinh thanh:40,461,8495.8491|vinh thinh:40,461,8490.8492|xuan an:40,465,8562.8564|ya hoi:,499,9021.9023|ya ma:,504,9087.9078","45":"binh kien:41,470,8635.8633.18459|buon don:,519,9268|buon ho:,513,9177.9187.9178.9185.9179.9186|buon ma thuot:,515,9223.9210.9225.9226.9217|cu bao:,513,9181.9182.9188|cu m gar:,518,9252|cu m ta:,522,9298|cu pong:,511,9159.9163|cu prao:,522,9299.9307|cu pui:,521,9285.9289|cu yang:,514,9203.9206|cuor dang:,518,9254.9255|dak lieng:,517,9240.9241.9244|dak phoi:,517,9242.9243|dang kang:,521,9284.9286.9293|dlie ya:,512,9171.9166.9172|dong hoa:41,469,8621.8616.8623|dong xuan:41,471,8639.8641.8643.8644|dray bhang:,524,9326.9328.9327|duc binh:41,474,8681.8680.8684|dur kmal:,516,9235.9230|ea ba:41,474,|ea bung:,520,9275.9281|ea drang:,523,9311.9321.9317|ea drong:,513,9180.9183|ea h leo:,523,9313|ea hiao:,523,9320.9318|ea kao:,515,|ea kar:,514,9200.9196.9201.9191.9195|ea khal:,523,9316.9315.9314|ea kiet:,518,9261.9262|ea knop:,514,9205.9198.9202|ea ktur:,524,9326.9325.9324|ea ly:41,474,8679.8674|ea m droh:,518,9258.9251|ea na:,516,9229.9231.9232|ea ning:,524,9330.9329.9323|ea nuol:,519,9266.9271.9265|ea o:,514,9204|ea pal:,514,9197.9193|ea rieng:,522,9309.9302|ea rok:,520,9277.9278|ea sup:,520,9276.9282.9274|ea trang:,522,9308|ea tul:,518,9257.9256.9260|ea wer:,519,9267.9269.9270|ea wy:,523,9312.9319.9322|hoa hiep:41,469,8615.8619.8618|hoa my:41,468,8604.8605|hoa phu:,515,9220.9222.9227|hoa son:,521,9287.9291.9296|hoa thinh:41,468,8609.8608|hoa xuan:41,469,8620.8624.8617|ia lop:,520,9280|ia rve:,520,9279|krong a:,522,9310.9304|krong ana:,516,9234.9236.9233|krong bong:,521,9290.9288.9294|krong buk:,511,9156.9157|krong nang:,512,9176.9168.9173|krong no:,517,9246|lien son lak:,517,9238.9239.9237|m drak:,522,9301.9305.9306|nam ka:,517,9245.9247|o loan:41,467,8588.8599|phu hoa 1:41,472,8653.8654.8659.8655.8658.8652|phu hoa 2:41,472,8656.8657.8651|phu mo:41,471,8648.8645|phu xuan:,512,9167.9169.9174|phu yen:41,470,8638.8634.8637;41,469,8622;41,468,8603|pong drang:,511,9161.9164|quang phu:,518,9249.9248.9253.9250|son hoa:41,473,8660.8662.8663.8670.8661|son thanh:41,468,8612.8611.8607|song cau:41,466,8580.8577.8582.8578|song hinh:41,474,8675.8676.8683.8685|suoi trai:41,473,8666.8669|tam giang:,512,9170.9175.9165|tan an:,515,9214.9211|tan lap:,515,9213.9207.9208|tay hoa:41,468,8603.8606.8610|tay son:41,473,8673.8672.8668|thanh nhat:,515,9216.9212|tuy an bac:41,467,8594.8589.8586|tuy an dong:41,467,8595.8592.8587|tuy an nam:41,467,8591.8597.8593|tuy an tay:41,467,8584.8585.8600|tuy hoa:41,470,8625.8626.8628.8629.8631.8633;41,472,8654.8651|van hoa:41,473,8664.8667.8671|xuan canh:41,466,8575.8574|xuan dai:41,466,8583.8581|xuan lanh:41,471,8647.8640|xuan loc:41,466,8572.8573|xuan phuoc:41,471,8646.8642|xuan tho:41,466,8579.8571.8570|yang mao:,521,9283.9295","46":"1 bao loc:,535,9465.9464.9470|2 bao loc:,535,9467;,527,9363|3 bao loc:,535,9468.9462.9469|b lao:,535,9461.9471|bac binh:52,593,10167.10184.10178.10168|bac gia nghia:9,112,1620.1618.1623;9,110,1605|bac ruong:52,588,10119.10116|bao lam 1:,527,9355.13326.9359|bao lam 2:,527,9367.9356.9362|bao lam 3:,527,9365.9364|bao lam 4:,527,9357.9366|bao lam 5:,527,9360.9361|bao thuan:,529,9395.9383.9397|binh thuan:52,594,13322.10194;52,585,10079|cam ly da lat:,532,9428.9429.9437|cat tien:,530,|cat tien 2:,530,|cat tien 3:,530,|cu jut:9,113,1629.1625.1630|d ran:,536,9474|da huoai:,530,9405|da huoai 2:,530,9400|da huoai 3:,530,|da teh:,530,|da teh 2:,530,|da teh 3:,530,|dak mil:9,116,1656|dak sak:9,116,1659.1661;9,114,1632|dak song:9,115,1646|dak wil:9,113,1627|dam rong 1:,534,9458.9459|dam rong 2:,534,9460|dam rong 3:,534,9457|dam rong 4:,534,9455.9454;,526,|di linh:,529,9391.9381.9382.9394|dinh trang thuong:,529,9392.9390.9393|dinh van lam ha:,531,9424.9410;,537,9485|don duong:,536,9472.9480.9476|dong gia nghia:9,112,1619.1621|dong giang:52,585,10082.10084|dong kho:52,588,10112.10113.10107.10108|duc an:9,115,1645.1644|duc lap:9,116,1662.1653.1657|duc linh:52,589,10124.10122.10126|duc trong:,537,9486.9489|gia hiep:,529,9396.9398|hai ninh:52,593,10171.10170.10172|ham kiem:52,592,10163.10166.10156|ham liem:52,585,10073.10074|ham tan:52,591,10153.10143.10145|ham thang:52,585,10075.10072;52,594,10186|ham thanh:52,592,10154.10164.10165|ham thuan:52,585,10078.10076.10087|ham thuan bac:52,585,10086.10080.10085|ham thuan nam:52,592,25647.10155|hiep thanh:,537,9482.9483.9484|hoa bac:,529,9386.9387|hoa ninh:,529,9380.9384.9385|hoa thang:52,593,10176.10175|hoai duc:52,589,10125.10127.10123|hong son:52,585,10081.10088|hong thai:52,593,10183.10182|ka do:,536,9473.9479|krong no:9,114,1633.1642|la da:52,585,10077.10083|la gi:52,590,10134.10135.10141.10136|lac duong:,526,9351.9352.9348|lam vien da lat:,532,9431.9432.9435|lang biang da lat:,526,9349.9350;,532,9430|lien huong:52,587,10092.10095.10096.10101|luong son:52,593,10181.10169|mui ne:52,594,10197.10200.10199|nam ban lam ha:,531,9409.9422.9421.9423|nam da:9,114,1634.1641|nam dong:9,113,1628.1624|nam gia nghia:9,112,1617.1616.1622|nam ha lam ha:,531,9420.9413|nam nung:9,114,1636|nam thanh:52,589,10129.10131.10133|nghi duc:52,588,10115.10117|ninh gia:,537,9491|phan ri cua:52,587,10103.10094.10093|phan son:52,593,10174.10173|phan thiet:52,594,10187.10198.10190|phu quy:52,586,10090.10089.10091|phu son lam ha:,531,9411.9412|phu thuy:52,594,10196.10189.10195|phuc tho lam ha:,531,9416.9419|phuoc hoi:52,590,10137.10139.10138|quang hoa:9,110,1603|quang khe:9,110,1608.1607|quang lap:,536,9475|quang phu:9,114,1638.1637.1639|quang son:9,110,1604|quang tan:9,111,1611.1615|quang truc:9,111,1612|son dien:,529,9389.9388|son my:52,591,10148.10151.10149|song luy:52,593,10179.10180.10177|suoi kiet:52,588,10118.10111|ta dung:9,110,1609|ta hine:,537,9487.9496.9494|ta nang:,537,9495.9488|tan ha lam ha:,531,9418.9417.9414.9415|tan hai:52,590,10142.10140|tan hoi:,537,9490.9493|tan lap:52,591,10146;52,592,10161|tan minh:52,591,10152.10147.10150|tan thanh:52,592,10158.10157.10160|tanh linh:52,588,10105.10109.10110|thuan an:9,116,1654.1660|thuan hanh:9,115,1652.1648|tien thanh:52,594,10191.10202|tra tan:52,589,10132.10128.10130|truong xuan:9,115,1651.1650|tuy duc:9,111,1614.1613|tuy phong:52,587,10100.10098|tuyen quang:52,594,10203;52,592,10159|vinh hao:52,587,10097.10099|xuan huong da lat:,532,9436.9433.9425.9426.9427|xuan truong da lat:,532,9434.9440.9439.9438","49":"an luc long:54,609,10369.10367.10368|an ninh:54,614,10440.10439.10438|an tinh:,561,9735.9741|ben cau:,563,9755.9754.9762.9761|ben luc:54,610,10390.10392.10389|binh duc:54,610,10388.10379.10378|binh hiep:54,618,10492.10495.10488;54,613,10424|binh hoa:54,613,10426.10430.10425|binh minh:,558,9710.9711.9707.9708|binh thanh:54,612,10408.10409;54,605,10311|can duoc:54,607,10341.10339.10338.10334|can giuoc:54,606,10323.10325|cau khoi:,562,9750.9748.9745|chau thanh:,557,9688.9689.9691.9700|dong thanh:54,605,10316.10315.10306.10314|duc hoa:54,614,10431.10432.10447|duc hue:54,605,10310.10313.10312|duc lap:54,614,10443.10434|duong minh chau:,562,9743.9752.9753.9746|gia loc:,560,9730;,561,9739|go dau:,560,9726.9725;,561,9738|hao duoc:,557,9696.9692.9695|hau nghia:54,614,10436.10442.10441|hau thanh:54,611,10397.10396.10395|hiep hoa:54,614,10449.10450|hoa hoi:,557,9690.9697.9698|hoa khanh:54,614,10445.10446.10444|hoa thanh:,564,9772.9766|hung dien:54,608,10357.10359.10354|hung thuan:,561,9740.9737|khanh hau:54,616,10468.10469.10471|khanh hung:54,615,10454.10452.10455.10453|kien tuong:54,618,10490.10489.10493|loc ninh:,562,9749.9751.9753|long an:54,616,10463.10464.10465.10472.10466.10461;54,617,10485|long cang:54,607,10347.10343.10350|long chu:,563,9756.9758;,557,9699|long hoa:,564,9763.9768.9769.9767|long huu:54,607,10336.10335|long thuan:,563,9757.9760.9759|luong hoa:54,610,10385.10382|moc hoa:54,613,10429.10428.10427|my an:54,617,10484.10483|my hanh:54,614,10433.10448.10435|my le:54,607,10345.10344.10351|my loc:54,606,10321.10324.10327|my quy:54,605,10307.10308.10309|my thanh:54,617,10479.10481.10480.10482|my yen:54,610,10380.10391.10393|nhon hoa lap:54,611,10405.10398.10399|nhon ninh:54,611,10400.10401.10402|nhut tao:54,604,10304.10302;54,617,10475|ninh dien:,557,9693.9702|ninh thanh:,562,9744.9748;,558,9709|phuoc chi:,561,9732|phuoc ly:54,606,10320.10318.10319|phuoc thanh:,560,9729.9731.9723|phuoc vinh:,557,9694;,559,9721|phuoc vinh tay:54,606,10329.10328.10331|rach kien:54,607,10346.10352.10349|tam vu:54,609,10377.10366.10373.10365|tan an:54,616,10474.10470.10473.10467|tan bien:,559,9713.9718.9720|tan chau:,556,9684.9686.9682|tan dong:,556,9676.9677|tan hoa:,556,9685.9679|tan hoi:,556,9678.9680|tan hung:54,608,10353.10358.10360|tan lan:54,607,10337.10340|tan lap:,559,9714.9716|tan long:54,617,10487.10478|tan ninh:,558,9703.9704.9705.9706.9712|tan phu:,556,9681.9682|tan tap:54,606,10330.10333|tan tay:54,612,10415.10413.10416|tan thanh:54,611,10400.10406.10404.10403;,556,9687.9683|tan tru:54,604,10297.10295.10305.10296|thanh binh:,559,9717.9715|thanh dien:,557,9701;,564,9765|thanh duc:,560,9724.9728|thanh hoa:54,612,10417.10407.10414|thanh loi:54,610,10386.10384.10383|thanh phuoc:54,612,10411.10410.10412|thu thua:54,617,10479.10485.10475.10476|thuan my:54,609,10370.10371.10372|tra vong:,559,9719.9722|trang bang:,561,9734.9733|truong mit:,562,9747;,560,9727|tuyen binh:54,615,10459.10458.10456.10457.10460|tuyen thanh:54,618,10494.10491;54,611,10397|vam co:54,604,10299.10300.10298|vinh chau:54,608,10364.10362.10363|vinh cong:54,609,10376.10374.10375|vinh hung:54,615,10459.10454.10451.10456.10460|vinh thanh:54,608,10355.10356.10361","51":"an loc:48,550,9622.9618.9619|an phuoc:,583,10044.10037|an vien:,574,9879.9865|bao vinh:,584,10054.10055|bau ham:,574,9868.9873.9876|bien hoa:,579,9960.9968.9973.9954|binh an:,583,10038.10042|binh loc:,584,10058.10062;,576,9912|binh long:48,550,9621.9620.9623;48,549,9614|binh minh:,574,9867.9878|binh phuoc:48,547,9585.9589.9587.9588.9590.9586|binh tan:48,554,9661.9666.9663|bom bo:48,552,9643.9638|bu dang:48,552,9644.9636.9637|bu gia map:48,555,9668|cam my:,580,9994.9985.9986.9995|chon thanh:48,551,9629.9630|da kia:48,555,9673.9669|dai phuoc:,578,9936.9938.9940.9930|dak lua:,575,9886|dak nhau:48,552,|dak o:48,555,9671|dau giay:,576,9913.9908.9909.9903|dinh quan:,582,10020.10025.10026.10029|dong phu:48,548,9593.9601.9594|dong tam:48,548,9595.9603.9600|dong xoai:48,547,9592.9591|gia kiem:,576,9907.9910|hang gon:,584,10069.10059|ho nai:,579,9956;,574,9880|hung phuoc:48,545,9564.9567|hung thinh:,574,9877.9869.9871.9875|la nga:,582,10021.10024|loc hung:48,546,9576.9579.9578|loc ninh:48,546,9569.9574.9584|loc quang:48,546,9575.9572.9570|loc tan:48,546,9577.9571|loc thanh:48,546,9581.9580.9573|long binh:,579,9948.9971.9953|long ha:48,554,9665.9660|long hung:,579,9975.9967.9976|long khanh:,584,10065.10066.10061.10064.10057|long phuoc:,583,11786.12306|long thanh:,583,10041.10035.10039.10036|minh duc:48,549,9610.9611.9616|minh hung:48,551,9632.9631|nam cat tien:,575,9887.9889|nghia trung:48,552,9635.9641.9646|nha bich:48,551,9626.9627.9628|nhon trach:,578,9932.9937.9939.9929.9933|phu hoa:,582,10027.10028;,575,9891|phu lam:,575,9890.9885.9894.9900|phu ly:,577,9926|phu nghia:48,555,9675.9672.9670|phu rieng:48,554,9664.9662|phu trung:48,554,9659.9667|phu vinh:,582,10030.10031|phuoc an:,578,9934.9935.9931|phuoc binh:48,553,9655.9652.9651;48,554,9658|phuoc long:48,553,9654.9657.9653.9656|phuoc son:48,552,9648.9639.9640|phuoc tan:,579,9977|phuoc thai:,583,14346.13331.10047|song ray:,580,9984.9988|ta lai:,575,9887.9892.9896.9899|tam hiep:,579,9966.9951.9955.9957|tam phuoc:,579,9978|tan an:,577,9921.9923|tan hung:48,549,9612.9607.9608|tan khai:48,549,9615.9609.9605|tan loi:48,548,9602.9604.9599|tan phu:,575,9884.9893.9895.9898.9901|tan quan:48,549,9613.9606;48,551,9633|tan tien:48,545,9563.9565;48,546,9582|tan trieu:,577,9916.9917.9918;,579,9958|thanh son:,582,10033|thien hung:48,545,9568.9562.9566|tho son:48,552,9649.9645.9650|thong nhat:,582,10022.10023;,576,9906.9905|thuan loi:48,548,9598.9597|tran bien:,579,9961.9962.9964.9965.9969.9949.9970|trang bom:,574,9870.9872.9874.9864|trang dai:,579,9963;,577,9919|tri an:,577,9920.9925.9922|xuan bac:,582,10032;,581,10004|xuan dinh:,581,10002.10005;,580,9997|xuan dong:,580,9990.9987|xuan duong:,580,9996.9991;,583,10040|xuan hoa:,581,10013.10014.10007|xuan lap:,584,10067.10056|xuan loc:,581,10016.10018.10000.10003.10012|xuan phu:,581,10008.10006|xuan que:,580,9993.9992|xuan thanh:,581,10009.10015","55":"an binh:,628,10617.10613.10619|an hoa:,630,10638.10640|an huu:6,95,1384.1392.1380|an long:,630,10641.10643;,629,10623|an phuoc:,619,10502.10504|an thanh thuy:6,93,1349.1353.1354|ba sao:,621,|binh hang trung:,621,|binh ninh:6,93,1351.1356.1355|binh phu:6,100,1472.1479.1493|binh thanh:,629,10632.10626|binh trung:6,97,1425.1441|binh xuan:6,99,1464.1470|cai be:6,95,1391.1390.1393|cai lay:6,100,1481.1503.1501|cao lanh:,621,10531.10519.10522.10523.10524.10526.10532.10530.10521|chau thanh:6,97,1435.1428.1421|cho gao:6,93,1359.1348.1364|dao thanh:6,101,1517.1507.1508|doc binh kieu:,627,10607.10603|dong son:6,94,1379.1368.1373|gia thuan:6,96,1407.1413.1412|go cong:6,99,1463.1466.1459|go cong dong:6,96,1415.1420|hau my:6,95,1388.1396.1397|hiep duc:6,100,1477.1480.1497|hoa long:,622,10538.10533.10536.10540|hoi cu:6,95,1399.1381.1400.1398|hong ngu:,628,10616.10615.10614|hung thanh:6,98,1449.1447.1452|kim son:6,97,1424.1432.1438|lai vung:,620,10514.10515;,622,10537.10539|lap vo:,620,10512.10505.10513.10517|long binh:6,94,1372.1369|long dinh:6,97,1439.1429.1426|long hung:6,97,1444.1427.1437|long khanh:,628,|long phu thuan:,628,|long thuan:6,99,1465.1460|long tien:6,100,1482.1494.1485|luong hoa lac:6,93,1357.1350.1365|my an hung:,620,10506.10507.10508|my duc tay:6,95,1382.1387.1401|my hiep:,621,|my loi:6,95,1389.1383.1404|my ngai:,621,10527.10528|my phong:6,101,1515.1512.1516|my phuoc tay:6,100,1500.1484.1474.1502|my qui:,627,10610.10606.10605|my thanh:6,100,1489.1487.1486|my thien:6,95,1385.1386.1402|my tho:6,101,1514.1504.1505;,621,|my tinh an:6,93,1360.1362.1366.1363|my tra:,621,10529.10525|ngu hiep:6,100,1473.1476|nhi quy:6,100,1498.1491.1475|phong hoa:,622,10543.10544.10542.10541|phong my:,621,|phu cuong:,630,10635.10642|phu huu:,623,10545.10546.10547.10553|phu thanh:6,94,1378.1371.1375|phu tho:,630,10639.10644|phuong thinh:,627,10601;,621,|sa dec:,626,10591.10592.10593.10594.10596.10595.10597.10598|son qui:6,99,1468.1467.1469|tam nong:,630,10637.10633|tan dien:6,96,1414.1410|tan dong:6,96,1416.1409.1406|tan duong:,622,10535.10534;,626,10599|tan ho co:,619,10499|tan hoa:6,96,1405.1411.1417|tan hong:,619,10497.10503.10500|tan huong:6,97,1442.1436.1433|tan khanh trung:,620,10510.10511.10509|tan long:,629,10628.10622.10627.10631.10621;,628,|tan nhuan dong:,623,10554.10556.10548|tan phu:6,100,1483.1492.1490|tan phu dong:6,92,1342.1343.1347|tan phu trung:,623,10551.10549.10555|tan phuoc 1:6,98,1456.1448.1458|tan phuoc 2:6,98,1457.1455.1451|tan phuoc 3:6,98,1454.1453.1450|tan thanh:,619,10498.10496;,629,10624.10629|tan thoi:6,92,1346.1345.1344|tan thuan binh:6,93,1358.1361.1352|thanh binh:,629,10620.10625.18443|thanh hoa:6,100,1496.1495.1499|thanh hung:6,95,1395.1403.1394|thanh my:,627,10611.10609|thanh phu:6,100,1478.1488|thap muoi:,627,10612.10604|thoi son:6,101,12810.1509|thuong lac:,628,10618|thuong phuoc:,628,|tram chim:,630,10634.10636|trung an:6,101,1513.16991.1518|truong xuan:,627,10600.10602|vinh binh:6,94,1376.1367.1370|vinh huu:6,94,1374.1377|vinh kim:6,97,1431.1445.1423","56":"an bien:59,659,11088.11085.11084|an chau:,640,10779.10783.10771|an cu:,638,10750.10749.10751|an minh:59,673,11243.11238|an phu:,634,10690.10683.10684.10688|ba chuc:,639,10757.10758.10759|binh an:59,663,11144.11147.11142|binh duc:,633,10681.10680.10679|binh giang:59,664,11151|binh hoa:,640,10772.10777.10775|binh my:,636,10724.10725.10723|binh son:59,664,11162|binh thanh dong:,632,10664.10661.10662|can dang:,640,10780.10773|chau doc:,631,10647.10651.10649.10645.10646|chau phong:,637,10735.10737.10736|chau phu:,636,10716.10722.10727|chau thanh:59,663,11141.11146.11143|chi lang:,638,10752.10745.10743|cho moi:,635,10702.10709.10704|cho vam:,632,10655.10668|co to:,639,10768.10769.10765|cu lao gieng:,635,10697.10710.10707|dinh hoa:59,670,11218.11221.11213|dinh my:,641,10793.10799.10801|dong hoa:59,673,11240.11234|dong hung:59,673,11237.11239|dong thai:59,659,11087.11089.11090|giang thanh:59,665,11164.11163.11165|giong rieng:59,660,11105.11101.11102.11111.11110|go quao:59,670,11211.11212.11217|ha tien:59,671,11224.11225.11223.11226|hoa dien:59,662,11124.11125|hoa hung:59,660,11098.11097.11104|hoa lac:,632,10653.10669|hoa thuan:59,660,11093.11109|hoi an:,635,10701.10700.10699|hon dat:59,664,11159.11161.11152.11157|hon nghe:59,662,11135|khanh binh:,634,10691.10692.10693|kien hai:59,672,11229.11230.11231|kien luong:59,662,11126.11137.11122|long dien:,635,10703.10706.10708|long kien:,635,10698.10714.10711|long phu:,637,10739.10741.10734|long thanh:59,660,11099.11103.11100|long xuyen:,633,10678.10671.10676.10670.10672.10673|my duc:,636,10717.10715|my hoa hung:,633,10682|my thoi:,633,10674.10675|my thuan:59,664,11154.11153.11156|ngoc chuc:59,660,11095.11094.11096|nhon hoi:,634,10695.10683.10684.10694|nhon my:,635,10713.10705.10712|nui cam:,638,10754.10753|o lam:,639,10767.10763.10770|oc eo:,641,10788.10794.10798|phu an:,632,10659.10667.10660|phu hoa:,641,10791.10792.10787|phu huu:,634,10685.10696|phu lam:,632,10652.10656.10657|phu quoc:59,669,11204.11203.11202.11208.11205.11207.11206.11210|phu tan:,632,10654.10663.10665.10666|rach gia:59,667,11185.11182.11184.11177.11188.11186.11183.11180.11181|son hai:59,662,11136|son kien:59,664,11155.11158.11160|tan an:,637,10733.10732.10731|tan chau:,637,10738.10740|tan hiep:59,668,11189.11192.11197.11199|tan hoi:59,668,11193.11200.11195.11194|tan thanh:59,673,11235.11236|tay phu:,641,10785.10789.10800|tay yen:59,659,11086.11083.11092|thanh dong:59,668,11191.11198.11196|thanh hung:59,660,11108.11107.11106|thanh loc:59,663,11139.11148.11138.11140|thanh my tay:,636,10726.10721.10719|tho chau:59,669,11201|thoai son:,641,10786.10797.10796|thoi son:,638,10748.10746|tien hai:59,671,11227|tinh bien:,638,10747.10744.10755|to chau:59,671,11222.11228;59,662,11123|tri ton:,639,10756.10762.10766|u minh thuong:59,661,11114.11115|van khanh:59,673,11241.11242|vinh an:,640,10782.10778.10776|vinh binh:59,666,18444.11168.11169|vinh dieu:59,665,11166.11167|vinh gia:,639,10760.10761.10764|vinh hanh:,640,10781.10774|vinh hau:,634,10689.10686.10687|vinh hoa:59,661,11117.11112.11113.11116|vinh hoa hung:59,670,11214.11215|vinh phong:59,666,15370.11176.11172|vinh te:,631,10648.10651.10650|vinh thanh trung:,636,10718.10720|vinh thong:59,667,11187.11178;59,664,11150|vinh thuan:59,666,11171.11176|vinh trach:,641,10795.10790|vinh tuy:59,670,11216.11220.11219|vinh xuong:,637,10728.10730.10729","57":"an binh:,643,10819.10818.10816.10817|an dinh:58,653,10977.10981.10973|an hiep:58,650,10927.10926.10928|an hoi:58,658,11069.11068;58,656,11028|an ngai trung:58,650,10924.13323|an phu tan:60,676,11275.11282|an qui:58,655,11019.11017|an truong:60,677,11290.11289.11293|ba tri:58,650,10938.10918.10929.10937.10936|bao thanh:58,650,10933.10934|ben tre:58,658,11081.11076;58,654,10994|binh dai:58,652,10966.10953.10969|binh minh:,642,17009.10802.10805|binh phu:60,677,11285.11286.11294|binh phuoc:,649,10907.10917.10916|cai ngang:,646,10870.10874.10861.10862|cai nhum:,649,10903.10905.10906|cai von:,642,17009.10802.10806|cang long:60,677,11297.11296.11292|cau ke:60,676,11279.11280.11283|cau ngang:60,679,11323.11317.11318|chau hoa:58,656,11035.11034.11033|chau hung:58,652,10958.10956.10961|chau thanh:60,678,11300.11302.11307.11301|cho lach:58,651,10945.10951.10942|dai an:60,674,11262.11261|dai dien:58,655,11008.11010.11009.11007|don chau:60,675,13834.18464|dong hai:60,675,11273|dong khoi:58,653,10983.10982|dong thanh:,642,10804.10807.10808|duyen hai:60,675,11268.11264|giao long:58,657,11057.11054.11055|giong trom:58,656,11036.11022.11037|ham giang:60,674,11252.11253.11259|hiep my:60,679,11330.11321.11319|hieu phung:,645,10848.10838.10840|hieu thanh:,645,10842.10839.10841|hoa binh:,648,10889.10891.10900|hoa hiep:,646,10859.10860.10858|hoa minh:60,678,11309|hoa thuan:60,680,11335;60,678,11303|hung hoa:60,681,11344.11345.11346|hung khanh trung:58,651,10948.13325;58,654,11000|hung my:60,678,11304.11312.11305|hung nhuong:58,656,11042.11043.11038|huong my:58,653,10980.10986.10975|loc thuan:58,652,10960.10959.10963|long chau:,647,10877.10883.10884|long duc:60,680,11340.11334|long hiep:60,674,11258.11257.11256|long ho:,643,10809.10823.10813|long hoa:60,678,11308|long huu:60,675,11272.11263|long thanh:60,675,11265.18462|long vinh:60,675,11271|luc si thanh:,648,10902.10898|luong hoa:58,656,11032.11023|luong phu:58,656,11026.11025.11027|luu nghiep anh:60,674,11255.11250|mo cay:58,653,10985.10984.10989|my chanh hoa:58,650,10921.10920.10922|my long:60,679,11328.11324.11329|my thuan:,644,10837.10836.10833|ngai tu:,646,10864.10868.10869|ngu lac:60,679,11322;60,675,11266|nguyet hoa:60,680,11337.11338;60,678,11306|nhi long:60,677,11291.11295.11298|nhi truong:60,679,11320.11325.11326|nhon phu:,649,10909.10910.10911|nhuan phu tan:58,654,11002.10990.10991|phong thanh:60,676,11277.11278.11276|phu khuong:58,658,11082.11067.11075.11078|phu phung:58,651,10943.10944.10950|phu quoi:,643,10821.10822.10810.10812|phu tan:58,657,11051.11052;58,658,11074|phu thuan:58,652,10954.10955.10957|phu tuc:58,657,11049.11048.11047.11053|phuoc hau:,647,10879.10880;,643,10820|phuoc long:58,656,11031.11029.11030|phuoc my trung:58,654,10995.11003.10996.10992|quoi an:,645,10850.10844.10845|quoi dien:58,655,11013.11012.11011|quoi thien:,645,10851.10854|son dong:58,658,11080.11077;58,657,11050|song loc:60,678,11311.11314.11299|song phu:,646,10871.10866.10865.10873|tam binh:,646,10863.10867|tam ngai:60,676,11281.11274.11284|tan an:60,677,11287.11288|tan hanh:,647,10882;,643,10811|tan hao:58,656,11039.17001.11041|tan hoa:60,681,11352.11348.11351|tan long hoi:,649,10912.10915.10913|tan luoc:,644,10831.10829.10828|tan ngai:,647,10886.10887.10885|tan phu:58,657,11063.11058.11046|tan quoi:,644,10830.10834.10835|tan thanh binh:58,654,10998.10999.11001.10993|tan thuy:58,650,10939.10935|tan xuan:58,650,10930.10919|tap ngai:60,681,11342.11350|tap son:60,674,11251.11260.11245|thanh duc:,647,10881;,643,10814|thanh hai:58,655,11016.11004|thanh phong:58,655,11005.11020|thanh phu:58,655,11015.11021.11006.11014|thanh phuoc:58,652,10968.10970|thanh thoi:58,653,10988.10976.10987|thanh tri:58,652,10964.10967.10965|thoi thuan:58,652,10972.10971|tien thuy:58,657,11065.11045.11064|tieu can:60,681,11349.11343.11347|tra con:,648,10890.10895.10901;,646,10863|tra cu:60,674,11249.11254.11246|tra on:,648,10888.10897|tra vinh:60,680,11339.11331.11333|trung hiep:,645,10852.10849.10853|trung ngai:,645,10856.10857.10855|trung thanh:,645,10843.10846.10847|truong long hoa:60,675,11269.18463|vinh kim:60,679,11315.11327|vinh thanh:58,651,10947.10949.10946|vinh xuan:,648,10892.10894.10893","63":"an trach:62,694,11492.11486|an xuyen:,707,11616.11617.11623.11624.11613|bac lieu:62,695,11498.11494.11496.11495.11497|bien bach:,708,11629.11627.11628|cai doi vam:,706,11602.11610|cai nuoc:,700,11543.11547.11549.11544|chau thoi:62,697,11519.11518.11520|da bac:,705,11596.11589.11590|dam doi:,702,11566.11565.11573|dat moi:,701,11552.11551.11558.11553|dat mui:,703,11577.11576|dinh thanh:62,694,11487.11488.11489|dong hai:62,694,11490.11493|ganh hao:62,694,11483.11485|gia rai:62,696,11504.11512.11510|hiep thanh:62,695,11500.11501.11503|ho thi ky:,708,11637|hoa binh:62,693,11478.11476;62,697,11521|hoa thanh:,707,11620.11621.11626.11615.11612.11614|hong dan:62,698,11529.11527.11523|hung hoi:62,697,11517.11516|hung my:,700,11545.11542.11544|khanh an:,704,11586.11581|khanh binh:,705,11594.11595|khanh hung:,705,11592.11591|khanh lam:,704,11586.11584.11585|lang tron:62,696,11505.11506|long dien:62,694,11491.11484|luong the tran:,700,11546.11548;,705,11598|ly van lam:,707,11622.11611;,705,11598|nam can:,701,11554.11558.11553|nguyen phich:,704,11586.11587.11588|nguyen viet khai:,706,11603.11605.11604|ninh quoi:62,698,11526.11528|ninh thanh loi:62,698,11525.11531|phan ngoc hien:,703,16996.11579.11578|phong hiep:62,699,11537.11536|phong thanh:62,696,11507.11508.11511|phu my:,706,11608.11609;,700,11545|phu tan:,706,11607.11606|phuoc long:62,699,11538.11533|quach pham:,702,11569.11568|song doc:,705,11600.11601|ta an khuong:,702,11559.11560.18442|tam giang:,701,11556.11557.11555|tan an:,703,11575.11580|tan hung:,700,11550.11541|tan loc:,708,11636.11634.11635|tan thanh:,707,11619.11620.11621.11612.11625.11614|tan thuan:,702,11562.11563|tan tien:,702,11572.11567|thanh tung:,702,11570.11571|thoi binh:,708,11633|tran phan:,702,11574.11564|tran van thoi:,705,11597.11601.11599.11596.11593|tri phai:,708,11632.11630.11631|u minh:,704,11583.11582|vinh hau:62,693,11480.11475.11481|vinh loc:62,698,11524.11530|vinh loi:62,697,11515.11522|vinh my:62,693,11482.11477.11479|vinh phuoc:62,699,11538.11534|vinh thanh:62,699,11539.11532|vinh trach:62,695,11499.11502","64":"bung lao:,714,11712.11710;,718,11781|cha to:,715,11725.11726|chieng sinh:,718,11782.11770.11768.11780|dien bien phu:,709,11641.11640.11642.11643.11644.11639|muong ang:,714,11707.11713.11708|muong cha:,715,11727.11717.11731.11730|muong lan:,714,11715.11711.11714|muong lay:,712,11689.11687.11688;,716,11748|muong luan:,711,11673.11680.11677|muong mun:,718,11783.11779.11771|muong nha:,710,11666.11665.11671|muong nhe:,713,11690.11703.11695|muong phang:,709,|muong pon:,716,11741;,710,11658|muong thanh:,709,11645.11646;,710,11651|muong toong:,713,11692|muong tung:,716,11734.11739|na bung:,715,11719.11724|na hy:,715,11718.11720.11722.11723|na sang:,716,11743.11742.11732.11744|na son:,711,11684.11678.11679|na tau:,714,11709.11716;,709,|nam ke:,713,11694.11704|nam nen:,716,11746.11747|nua ngam:,710,11654.11668.11670|pa ham:,716,11738.11735|phinh giang:,711,11675.11676|pu nhi:,711,11674|pu nhung:,718,11784.11769.11773|quai to:,718,11778.11774.11767|quang lam:,713,11693;,715,11721|sam mun:,710,11664.11667|sang nhe:,718,11772;,717,11757|si pa phin:,715,11728.11729|sin chai:,717,11766|sin thau:,713,11705.11702.11696|sinh phinh:,717,11763.11760.11761|thanh an:,710,11656.11655.11652|thanh nua:,710,11659.11650.11649.11648.11669|thanh yen:,710,11662.11663.11653|tia dinh:,711,11683.11682|tua chua:,717,11754.11756;,718,11785|tua thang:,717,11753.11764|tuan giao:,718,11775.11776.11777|xa dung:,711,11686.11685"};
const _vtp_merger_2025_cache = new Map();

function get_vtp_merger_2025_for_prov(newProvId) {
  const key = String(newProvId || "");
  if (!key || !VTP_MERGER_2025_RAW[key]) return [];
  if (_vtp_merger_2025_cache.has(key)) return _vtp_merger_2025_cache.get(key);
  const items = VTP_MERGER_2025_RAW[key]
    .split("|")
    .map((entry) => {
      const ci = entry.indexOf(":");
      if (ci === -1) return null;
      const wKey = norm_vn_geo_fuzzy(entry.slice(0, ci));
      const groups = entry
        .slice(ci + 1)
        .split(";")
        .map((g) => {
          const parts = g.split(",");
          if (parts.length < 2) return null;
          const oldProvId = parts[0] ? Number(parts[0]) : Number(key);
          const oldDistId = String(parts[1] || "");
          const wardIds = parts[2] ? parts[2].split(".").filter(Boolean) : [];
          return { oldProvId, oldDistId, wardIds };
        })
        .filter(Boolean);
      return wKey && groups.length > 0 ? { wKey, groups } : null;
    })
    .filter(Boolean);
  _vtp_merger_2025_cache.set(key, items);
  return items;
}

function find_vtp_prov_by_id(vtpProvId) {
  const numId = Number(vtpProvId);
  if (!numId) return null;
  const found = VN_PROVINCES_CATALOG.find((p) => Number(p.vtpId) === numId);
  return found ? { name: found.name, vtpId: found.vtpId, vtpCode: found.vtpCode, matchIdx: -1, matchKey: "" } : null;
}

function find_vtp_dist_by_id(vtpProvId, vtpDistId) {
  const list = get_vtp_districts_for_prov(vtpProvId);
  const found = list.find((d) => String(d.id) === String(vtpDistId));
  return found ? { name: found.full, id: found.id, matchIdx: -1, matchKey: "" } : null;
}

function detect_vtp_2025_merged_address(addrRaw, provInfo, distInfo) {
  const raw = String(addrRaw || "").trim();
  if (!raw || !provInfo || !provInfo.vtpId) return null;
  const entries = get_vtp_merger_2025_for_prov(provInfo.vtpId);
  if (entries.length === 0) return null;

  // Nếu địa chỉ đã có Quận/Huyện cũ rõ ràng nằm TRƯỚC tên tỉnh -> không phải địa chỉ 2 cấp mới
  const hasExplicitOldDist = Boolean(
    distInfo &&
      distInfo.id &&
      (provInfo.matchIdx <= 0 ||
        (typeof distInfo.matchIdx === "number" && distInfo.matchIdx >= 0 && distInfo.matchIdx < provInfo.matchIdx))
  );
  if (hasExplicitOldDist) return null;

  const norm = " " + norm_vn_geo_fuzzy(raw) + " ";
  const beforeProv =
    typeof provInfo.matchIdx === "number" && provInfo.matchIdx > 0
      ? norm.slice(0, provInfo.matchIdx + 1)
      : norm;

  const prefixes = ["phuong ", "xa ", "thi tran ", "dac khu ", "p ", "x ", "tt "];
  let best = null;
  let bestScore = -1;

  for (const item of entries) {
    const k = item.wKey;
    if (!k) continue;
    let matchedIdx = -1;
    let hasPrefix = false;
    for (const pf of prefixes) {
      const tok = " " + pf + k + " ";
      const idx = beforeProv.lastIndexOf(tok);
      if (idx !== -1 && idx > matchedIdx) {
        matchedIdx = idx;
        hasPrefix = true;
      }
    }
    if (!hasPrefix) {
      // Không có tiền tố phường/xã: chỉ khớp nếu tên >= 2 từ (tránh trùng từ đơn trên tên đường)
      if (k.indexOf(" ") === -1) continue;
      const tok = " " + k + " ";
      const idx = beforeProv.lastIndexOf(tok);
      if (idx !== -1) matchedIdx = idx;
    }
    if (matchedIdx !== -1) {
      const score = (hasPrefix ? 100000 : 0) + matchedIdx * 20 + k.length * 5;
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
  }
  if (!best) return null;

  // Chọn nhóm (oldProvId, oldDistId) phù hợp nhất (ưu tiên nếu chuỗi địa chỉ có nhắc tên huyện/xã cũ)
  let chosen = best.groups[0];
  if (best.groups.length > 1) {
    for (const g of best.groups) {
      const wList = get_vtp_wards_for_dist(g.oldDistId);
      const hitWard = wList.some(
        (w) => g.wardIds.includes(String(w.id)) && w.bareKey && norm.indexOf(" " + w.bareKey + " ") !== -1
      );
      if (hitWard) {
        chosen = g;
        break;
      }
    }
  }

  const oldProv = find_vtp_prov_by_id(chosen.oldProvId);
  const oldDist = oldProv ? find_vtp_dist_by_id(oldProv.vtpId, chosen.oldDistId) : null;
  if (!oldProv || !oldDist) return null;

  return {
    oldProv,
    oldDist,
    candidateWardIds: chosen.wardIds,
    newWardKey: best.wKey,
    newProvName: provInfo.name,
  };
}

const _arcgis_ward_centroid_cache = new Map();

async function fetch_arcgis_ward_centroid(wardFull, distShort, provName) {
  const key = `${wardFull}|${distShort}|${provName}`;
  if (_arcgis_ward_centroid_cache.has(key)) return _arcgis_ward_centroid_cache.get(key);
  try {
    const q = [wardFull, distShort, provName].filter(Boolean).join(", ");
    const url =
      "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&countryCode=VNM&maxLocations=1&SingleLine=" +
      encodeURIComponent(q);
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const loc = data && data.candidates && data.candidates[0] && data.candidates[0].location;
    const pt = loc && typeof loc.x === "number" && typeof loc.y === "number" ? { x: loc.x, y: loc.y } : null;
    _arcgis_ward_centroid_cache.set(key, pt);
    return pt;
  } catch (e) {
    return null;
  }
}

async function resolve_vtp_ward_online(warnItem) {
  if (!warnItem || !warnItem.vtpDistId || !warnItem.addr) return null;
  const wList = get_vtp_wards_for_dist(warnItem.vtpDistId);
  if (wList.length === 0) return null;

  const provName = String(warnItem.province || "").trim();
  const distShort = String(warnItem.district || "")
    .replace(/^(THÀNH PHỐ|QUẬN|HUYỆN|THỊ XÃ|TP\.?|TX\.?)\s+/i, "")
    .trim();

  // Tách tên đường/KĐT sạch để tìm tọa độ chính xác trên Photon OSM
  const rawAddr = String(warnItem.addr || "").trim();
  const cleanStreet = rawAddr
    .replace(/^(số\s*nhà|số|sn|nhà)\s*[\w\/\-]+[\s,.-]*/i, "")
    .replace(/^\d+[\w\/\-]*\s+(?=[a-zA-ZÀ-ỹ])/u, "")
    .replace(/\b(tổ|khu|ngõ|ngách|hẻm)\s*[\w\/\-]+/gi, " ")
    .replace(/\b(phường|xã|thị trấn|quận|huyện|thị xã|tỉnh|thành phố|tp\.?)\s+[^,.-]+/gi, " ")
    .replace(/[,.\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const queries = [];
  if (cleanStreet && distShort) queries.push(`${cleanStreet} ${distShort} ${provName}`.trim());
  if (cleanStreet && provName) queries.push(`${cleanStreet} ${provName}`.trim());
  queries.push(`${rawAddr} ${provName}`.trim());

  let coords = null;
  for (const q of queries) {
    if (!q) continue;
    try {
      const resp = await fetch("https://photon.komoot.io/api/?limit=3&q=" + encodeURIComponent(q));
      if (!resp.ok) continue;
      const data = await resp.json();
      const feats = Array.isArray(data && data.features) ? data.features : [];
      const vnHit = feats.find((f) => {
        const c = f && f.geometry && f.geometry.coordinates;
        return Array.isArray(c) && c[0] >= 102 && c[0] <= 110 && c[1] >= 8 && c[1] <= 24;
      });
      if (vnHit) {
        coords = { lon: vnHit.geometry.coordinates[0], lat: vnHit.geometry.coordinates[1] };
        break;
      }
    } catch (e) {}
  }
  // Dự phòng: nếu Photon không ra (do địa chỉ có tên quán/shop/ngã tư), gọi ArcGIS findAddressCandidates
  if (!coords) {
    try {
      const arcUrl =
        "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&countryCode=VNM&maxLocations=1&SingleLine=" +
        encodeURIComponent(rawAddr);
      const ar = await fetch(arcUrl);
      if (ar.ok) {
        const ad = await ar.json();
        const loc = ad && ad.candidates && ad.candidates[0] && ad.candidates[0].location;
        if (loc && loc.x >= 102 && loc.x <= 110 && loc.y >= 8 && loc.y <= 24) {
          coords = { lon: loc.x, lat: loc.y };
        }
      }
    } catch (e) {}
  }
  if (!coords) return null;

  // Bước 1: Reverse geocode trực tiếp qua ArcGIS (bắt chính xác ngay các phường không bị đổi tên như Phú Thượng / Ciputra)
  try {
    const revUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=json&location=${coords.lon},${coords.lat}`;
    const rResp = await fetch(revUrl);
    if (rResp.ok) {
      const rData = await rResp.json();
      const a = (rData && rData.address) || {};
      const fields = [a.Neighborhood, a.District, a.City].filter(Boolean);
      for (const fVal of fields) {
        const nf = bo_dau_tieng_viet(String(fVal)).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        if (!nf) continue;
        const directHit = wList.find((w) => w.bareKey && (nf === w.bareKey || nf.endsWith(" " + w.bareKey)));
        if (directHit) return directHit;
      }
    }
  } catch (e) {}

  // Bước 2: So khoảng cách tới tâm các phường/xã ứng viên (đặc biệt chuẩn cho phường sáp nhập 2025 như Minh Tân / Đồng Tâm / Yên Ninh...)
  const prefIds = Array.isArray(warnItem.preferredWardIds) && warnItem.preferredWardIds.length > 0
    ? new Set(warnItem.preferredWardIds.map(String))
    : null;
  const candidates = prefIds ? wList.filter((w) => prefIds.has(String(w.id))) : wList.slice(0, 12);
  if (candidates.length === 0) return null;

  const points = await Promise.all(
    candidates.map(async (w) => ({
      ward: w,
      pt: await fetch_arcgis_ward_centroid(w.full, distShort, provName),
    }))
  );
  let bestWard = null;
  let bestDist2 = Infinity;
  for (const item of points) {
    if (!item.pt) continue;
    const dx = item.pt.x - coords.lon;
    const dy = item.pt.y - coords.lat;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist2) {
      bestDist2 = d2;
      bestWard = item.ward;
    }
  }
  return bestWard;
}

async function resolve_vtp_full_addr_online(warnItem) {
  if (!warnItem || !warnItem.addr) return null;
  // Nếu đã có sẵn Quận/Huyện -> chỉ cần tìm Phường/Xã chuẩn
  if (warnItem.vtpDistId) {
    const wardHit = await resolve_vtp_ward_online(warnItem);
    return wardHit ? { wardOnly: true, ward: wardHit } : null;
  }

  // Trường hợp thiếu Quận/Huyện hoặc thiếu Tỉnh/TP -> tra tọa độ qua Photon + ArcGIS rồi quy đổi về 3 cấp VTP
  const rawAddr = String(warnItem.addr || "").trim();
  const provHint = String(warnItem.province || "").trim();
  const cleanQ = rawAddr
    .replace(/^(số\s*nhà|số|sn|nhà)\s*[\w\/\-]+[\s,.-]*/i, "")
    .replace(/\b(thôn|xóm|tổ|khu|ấp|ngõ|ngách|hẻm)\s*[\w\/\-]+/gi, " ")
    .replace(/[,.\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const queries = [];
  if (cleanQ && provHint && !norm_vn_geo_fuzzy(cleanQ).includes(norm_vn_geo_fuzzy(provHint))) {
    queries.push(`${cleanQ} ${provHint}`);
  }
  if (cleanQ) queries.push(cleanQ);
  queries.push(rawAddr);

  let coords = null;
  let osmText = "";
  for (const q of queries) {
    if (!q) continue;
    try {
      const resp = await fetch("https://photon.komoot.io/api/?limit=3&q=" + encodeURIComponent(q));
      if (!resp.ok) continue;
      const data = await resp.json();
      const feats = Array.isArray(data && data.features) ? data.features : [];
      const vnHit = feats.find((f) => {
        const c = f && f.geometry && f.geometry.coordinates;
        return Array.isArray(c) && c[0] >= 102 && c[0] <= 110 && c[1] >= 8 && c[1] <= 24;
      });
      if (vnHit) {
        coords = { lon: vnHit.geometry.coordinates[0], lat: vnHit.geometry.coordinates[1] };
        const p = vnHit.properties || {};
        osmText = [p.name, p.locality, p.district, p.city, p.county, p.state].filter(Boolean).join(", ");
        break;
      }
    } catch (e) {}
  }

  let arcText = "";
  if (!coords) {
    try {
      const arcUrl =
        "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&countryCode=VNM&maxLocations=1&outFields=Match_addr,City,Subregion,Region&SingleLine=" +
        encodeURIComponent(rawAddr);
      const ar = await fetch(arcUrl);
      if (ar.ok) {
        const ad = await ar.json();
        const cand = ad && ad.candidates && ad.candidates[0];
        if (cand && cand.location && cand.location.x >= 102 && cand.location.x <= 110) {
          coords = { lon: cand.location.x, lat: cand.location.y };
          const at = cand.attributes || {};
          arcText = [at.Match_addr, at.City, at.Subregion, at.Region].filter(Boolean).join(", ");
        }
      }
    } catch (e) {}
  }
  if (coords && !arcText) {
    try {
      const revUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=json&location=${coords.lon},${coords.lat}`;
      const rResp = await fetch(revUrl);
      if (rResp.ok) {
        const rData = await rResp.json();
        const a = (rData && rData.address) || {};
        arcText = [a.Neighborhood, a.District, a.City, a.Subregion, a.Region, a.Match_addr].filter(Boolean).join(", ");
      }
    } catch (e) {}
  }

  const candidateTexts = [arcText, osmText, `${arcText}, ${osmText}`].filter((t) => t && t.trim().length > 3);
  for (const txt of candidateTexts) {
    let pInfo = detect_vn_province_info(txt);
    if (!pInfo.vtpId && provHint) pInfo = detect_vn_province_info(provHint);
    if (!pInfo.vtpId) continue;
    let dInfo = detect_vtp_district_info(txt, pInfo.vtpId, pInfo);
    const m2025 = detect_vtp_2025_merged_address(txt, pInfo, dInfo);
    if (m2025) {
      pInfo = m2025.oldProv;
      dInfo = m2025.oldDist;
    }
    if (!dInfo.id) continue;
    let wInfo = detect_vtp_ward_info(txt, dInfo.id, dInfo, pInfo);
    if (!wInfo.id && m2025 && m2025.candidateWardIds.length > 0) {
      const wList = get_vtp_wards_for_dist(dInfo.id);
      const firstCand = wList.find((w) => m2025.candidateWardIds.includes(String(w.id)));
      if (firstCand) wInfo = { name: firstCand.full, id: firstCand.id };
    }
    if (!wInfo.id) wInfo = pick_default_vtp_ward(dInfo.id);
    return {
      wardOnly: false,
      provInfo: pInfo,
      distInfo: dInfo,
      wardInfo: { name: wInfo.name, id: wInfo.id, isDefault: false, isManual: true },
    };
  }
  return null;
}

function detect_vn_province_info(addrRaw) {
  const raw = String(addrRaw || "").trim();
  if (!raw) return { name: "", vtpId: "", vtpCode: "", matchIdx: -1, matchKey: "" };
  const norm = " " + norm_vn_geo_fuzzy(raw) + " ";
  // Ưu tiên khớp ở phần cuối địa chỉ trước (tránh nhầm tên đường "Nguyễn Thái Bình", "Lê Văn Hưu"...)
  let best = null;
  let bestPos = -1;
  let bestKey = "";
  for (const prov of VN_PROVINCES_CATALOG) {
    for (const kRaw of prov.keys) {
      const k = norm_vn_geo_fuzzy(kRaw);
      if (!k) continue;
      if (k.length <= 2) {
        const reEnd = new RegExp(`(?:^|[,\\-\\s])${k}$`);
        const normTail = norm_vn_geo_fuzzy(raw);
        if (reEnd.test(normTail)) {
          const idxShort = norm.lastIndexOf(` ${k} `);
          const pos = idxShort !== -1 ? idxShort : norm.length - 1;
          if (pos > bestPos || (pos === bestPos && k.length > bestKey.length)) {
            bestPos = pos;
            bestKey = k;
            best = prov;
          }
        }
        continue;
      }
      const token = ` ${k} `;
      const idx = norm.lastIndexOf(token);
      if (idx !== -1 && (idx > bestPos || (idx === bestPos && k.length > bestKey.length))) {
        bestPos = idx;
        bestKey = k;
        best = prov;
      }
    }
  }
  return best
    ? { name: best.name, vtpId: best.vtpId, vtpCode: best.vtpCode, matchIdx: bestPos, matchKey: bestKey }
    : { name: "", vtpId: "", vtpCode: "", matchIdx: -1, matchKey: "" };
}

function detect_vn_province(addrRaw) {
  return detect_vn_province_info(addrRaw).name;
}

function detect_vtp_district_info(addrRaw, vtpProvId, provInfo) {
  const raw = String(addrRaw || "").trim();
  if (!raw || !vtpProvId) return { name: "", id: "", matchIdx: -1, matchKey: "" };
  const list = get_vtp_districts_for_prov(vtpProvId);
  if (list.length === 0) return { name: "", id: "", matchIdx: -1, matchKey: "" };
  const norm = " " + norm_vn_geo_fuzzy(raw) + " ";
  const hasProvSlice = provInfo && typeof provInfo.matchIdx === "number" && provInfo.matchIdx > 0;
  const searchTargets = hasProvSlice ? [norm.slice(0, provInfo.matchIdx + 1), norm] : [norm];

  for (const target of searchTargets) {
    let best = null;
    let bestScore = -1;
    let bestIdx = -1;
    let bestKey = "";
    for (const d of list) {
      for (const k of d.keys) {
        if (!k) continue;
        const token = ` ${k} `;
        const idx = target.lastIndexOf(token);
        if (idx !== -1) {
          // Ưu tiên cụm từ dài hơn (VD: "quan 12" hơn "quan 1") và nằm gần cuối địa chỉ hơn
          const score = idx * 10 + k.length;
          if (score > bestScore) {
            bestScore = score;
            best = d;
            bestIdx = idx;
            bestKey = k;
          }
        }
      }
    }
    if (best) return { name: best.full, id: best.id, matchIdx: bestIdx, matchKey: bestKey };
  }
  return { name: "", id: "", matchIdx: -1, matchKey: "" };
}

function detect_vtp_ward_info(addrRaw, vtpDistId, distInfo, provInfo) {
  const raw = String(addrRaw || "").trim();
  if (!raw || !vtpDistId) return { name: "", id: "" };
  const list = get_vtp_wards_for_dist(vtpDistId);
  if (list.length === 0) return { name: "", id: "" };
  const norm = " " + norm_vn_geo_fuzzy(raw) + " ";
  const provLimit = provInfo && typeof provInfo.matchIdx === "number" && provInfo.matchIdx > 0
    ? norm.slice(0, provInfo.matchIdx + 1)
    : norm;
  const hasDistSlice = distInfo && typeof distInfo.matchIdx === "number" && distInfo.matchIdx > 0;
  const searchTargets = hasDistSlice
    ? [norm.slice(0, distInfo.matchIdx + 1), provLimit]
    : [provLimit];

  for (let pass = 0; pass < searchTargets.length; pass++) {
    const target = searchTargets[pass];
    const skipStart = pass === 1 && hasDistSlice ? distInfo.matchIdx : -1;
    const skipEnd = skipStart >= 0 ? skipStart + (distInfo.matchKey ? distInfo.matchKey.length + 1 : 0) : -1;
    let best = null;
    let bestScore = -1;
    for (const w of list) {
      for (const k of w.explicitKeys) {
        const idx = target.lastIndexOf(` ${k} `);
        if (idx !== -1 && !(idx >= skipStart && idx <= skipEnd)) {
          const score = 100000 + idx * 10 + k.length;
          if (score > bestScore) {
            bestScore = score;
            best = w;
          }
        }
      }
      if (w.bareKey) {
        const idx = target.lastIndexOf(` ${w.bareKey} `);
        if (idx !== -1 && !(idx >= skipStart && idx <= skipEnd)) {
          const score = idx * 10 + w.bareKey.length;
          if (score > bestScore) {
            bestScore = score;
            best = w;
          }
        }
      }
    }
    if (best) return { name: best.full, id: best.id, isDefault: false };
  }
  return { name: "", id: "", isDefault: false };
}

function pick_default_vtp_ward(vtpDistId) {
  const list = get_vtp_wards_for_dist(vtpDistId);
  if (!list || list.length === 0) return { name: "", id: "", isDefault: false };
  const chosen =
    list.find((w) => w.full.startsWith("THỊ TRẤN ")) ||
    list.find((w) => w.full.startsWith("PHƯỜNG ")) ||
    list[0];
  return { name: chosen.full, id: chosen.id, isDefault: true };
}

let _exp_ship_ward_overrides = {};
let _exp_ship_addr_overrides = {};

const VTP_SERVICE_NORMALIZE_MAP = {
  VSL7: "VSL7 - Cam kết sản lượng 07",
  SCN: "SCN - Chuyển phát nhanh",
  STK: "STK - Chuyển phát tiết kiệm",
  VCBO: "VCBO - Chuyển phát đường bộ",
  VCBA: "VCBA - Chuyển phát đường bay",
  VCN: "VCN - CP nhanh thỏa thuận",
  VTK: "VTK - CP tiết kiệm thỏa thuận",
  SCOD: "SCOD - COD Liên tỉnh nhanh",
  ECOD: "ECOD - COD Liên tỉnh tiết kiệm",
  NCOD: "NCOD - TMĐT nhanh thỏa thuận",
  LCOD: "LCOD - TMĐT tiết kiệm thỏa thuận",
  PTN: "PTN - Nội tỉnh nhanh thỏa thuận",
  PHS: "PHS - Nội tỉnh tiết kiệm thỏa thuận",
  SHT: "SHT - Chuyển phát hỏa tốc",
  VHT: "VHT - Hỏa tốc thỏa thuận",
  VSL1: "VSL1 - Cam kết sản lượng 01",
  VSL2: "VSL2 - Cam kết sản lượng 02",
  VSL3: "VSL3 - Cam kết sản lượng 03",
  VSL4: "VSL4 - Flashsale Tết",
  VSL5: "VSL5 - Cam kết sản lượng 05",
  VSL6: "VSL6 - Cam kết sản lượng 06",
  VSL8: "VSL8 - Cam kết sản lượng 08",
  VSL9: "VSL9 - Flashsale thỏa thuận",
};

function normalize_vtp_service_value(raw) {
  const s = String(raw || "").trim();
  if (!s) return VTP_SERVICE_NORMALIZE_MAP.VSL7;
  const code = s.split(/\s*-\s*/)[0].trim().toUpperCase();
  return VTP_SERVICE_NORMALIZE_MAP[code] || VTP_SERVICE_NORMALIZE_MAP.VSL7;
}

function normalize_vn_phone_for_ship(rawPhone) {
  let d = String(rawPhone || "").replace(/\D/g, "");
  if (d.startsWith("84") && d.length === 11) {
    d = "0" + d.slice(2);
  } else if (d.length === 9 && /^[35789]/.test(d)) {
    d = "0" + d;
  }
  const valid = /^0[35789]\d{8}$/.test(d);
  return { phone: d, valid };
}

function read_exp_ship_prefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EXP_SHIP_PREFS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

function infer_ship_order_qty(o) {
  const n = Math.round(Number((o && o.so_luong_num) || 0));
  if (n > 0) return n;
  const rawSl = String((o && o.so_luong) || "").trim();
  const mSl = rawSl.match(/\d+/);
  if (mSl && parseInt(mSl[0], 10) > 0) return parseInt(mSl[0], 10);
  const sizeStr = String((o && o.size) || "").trim();
  if (sizeStr) {
    const sizeTokens = sizeStr
      .split(/[,/+;&|]+/)
      .map((s) => s.trim())
      .filter((s) => /\d{2}/.test(s));
    if (sizeTokens.length > 1) return sizeTokens.length;
  }
  return 1;
}

// Danh mục chuẩn Mã mẫu mã (Cột D) theo file SKU UPYO 1021306427_variations.xlsx (v8.6.355)
const UPYO_SKU_CATALOG = [{"keys": ["SAND", "UD12"], "code": "SAND-UD12", "noAttr": false, "variants": {"-01(Đen)": {"38": "SAND-UD12-01(DEN)-38", "39": "SAND-UD12-01(DEN)-39", "40": "SAND-UD12-01(DEN)-40", "41": "SAND-UD12-01(DEN)-41", "42": "SAND-UD12-01(DEN)-42", "43": "SAND-UD12-01(DEN)-43"}, "-02(Trắng be)": {"38": "SAND-UD12-02(TRANGBE)-38", "39": "SAND-UD12-02(TRANGBE)-39", "40": "SAND-UD12-02(TRANGBE)-40", "41": "SAND-UD12-02(TRANGBE)-41", "42": "SAND-UD12-02(TRANGBE)-42", "43": "SAND-UD12-02(TRANGBE)-43"}}}, {"keys": ["NOVA", "UD63", "UD3"], "code": "NOVA-UD63", "noAttr": false, "variants": {"-01(Kem)": {"36": "NOVA-UD63-01(KEM)-36", "37": "NOVA-UD63-01(KEM)-37", "38": "NOVA-UD63-01(KEM)-38", "39": "NOVA-UD63-01(KEM)-39", "40": "NOVA-UD63-01(KEM)-40", "41": "NOVA-UD63-01(KEM)-41", "42": "NOVA-UD63-01(KEM)-42", "43": "NOVA-UD63-01(KEM)-43"}, "-02(Đen Lì)": {"36": "NOVA-UD63-02(DENLI)-36", "37": "NOVA-UD63-02(DENLI)-37", "38": "NOVA-UD63-02(DENLI)-38", "39": "NOVA-UD63-02(DENLI)-39", "40": "NOVA-UD63-02(DENLI)-40", "41": "NOVA-UD63-02(DENLI)-41", "42": "NOVA-UD63-02(DENLI)-42", "43": "NOVA-UD63-02(DENLI)-43"}, "-03(Xám Ghi)": {"36": "NOVA-UD63-03(XAMGHI)-36", "37": "NOVA-UD63-03(XAMGHI)-37", "38": "NOVA-UD63-03(XAMGHI)-38", "39": "NOVA-UD63-03(XAMGHI)-39", "40": "NOVA-UD63-03(XAMGHI)-40", "41": "NOVA-UD63-03(XAMGHI)-41", "42": "NOVA-UD63-03(XAMGHI)-42", "43": "NOVA-UD63-03(XAMGHI)-43"}, "-04(Rêu)": {"36": "NOVA-UD63-04(REU)-36", "37": "NOVA-UD63-04(REU)-37", "38": "NOVA-UD63-04(REU)-38", "39": "NOVA-UD63-04(REU)-39", "40": "NOVA-UD63-04(REU)-40", "41": "NOVA-UD63-04(REU)-41", "42": "NOVA-UD63-04(REU)-42", "43": "NOVA-UD63-04(REU)-43"}, "-05(Đen Da Lộn)": {"36": "NOVA-UD63-05(DENDALON)-36", "37": "NOVA-UD63-05(DENDALON)-37", "38": "NOVA-UD63-05(DENDALON)-38", "39": "NOVA-UD63-05(DENDALON)-39", "40": "NOVA-UD63-05(DENDALON)-40", "41": "NOVA-UD63-05(DENDALON)-41", "42": "NOVA-UD63-05(DENDALON)-42", "43": "NOVA-UD63-05(DENDALON)-43"}}}, {"keys": ["POSEIDON", "UD20"], "code": "POSEIDON-UD20", "noAttr": false, "variants": {"-01(Logo đỏ)": {"36": "POSEIDON-UD20-01(LOGODO)-36", "37": "POSEIDON-UD20-01(LOGODO)-37", "38": "POSEIDON-UD20-01(LOGODO)-38", "39": "POSEIDON-UD20-01(LOGODO)-39", "40": "POSEIDON-UD20-01(LOGODO)-40", "41": "POSEIDON-UD20-01(LOGODO)-41", "42": "POSEIDON-UD20-01(LOGODO)-42", "43": "POSEIDON-UD20-01(LOGODO)-43"}, "-02(Logo đen)": {"36": "POSEIDON-UD20-02(LOGODEN)-36", "37": "POSEIDON-UD20-02(LOGODEN)-37", "38": "POSEIDON-UD20-02(LOGODEN)-38", "39": "POSEIDON-UD20-02(LOGODEN)-39", "40": "POSEIDON-UD20-02(LOGODEN)-40", "41": "POSEIDON-UD20-02(LOGODEN)-41", "42": "POSEIDON-UD20-02(LOGODEN)-42", "43": "POSEIDON-UD20-02(LOGODEN)-43"}, "-03(Logo vàng)": {"36": "POSEIDON-UD20-03(LOGOVANG)-36", "37": "POSEIDON-UD20-03(LOGOVANG)-37", "38": "POSEIDON-UD20-03(LOGOVANG)-38", "39": "POSEIDON-UD20-03(LOGOVANG)-39", "40": "POSEIDON-UD20-03(LOGOVANG)-40", "41": "POSEIDON-UD20-03(LOGOVANG)-41", "42": "POSEIDON-UD20-03(LOGOVANG)-42", "43": "POSEIDON-UD20-03(LOGOVANG)-43"}}}, {"keys": ["HOMER", "UG34"], "code": "HOMER-UG34", "noAttr": false, "variants": {"-01(Navy)": {"38": "HOMER-UG34-01(NAVY)-38", "39": "HOMER-UG34-01(NAVY)-39", "40": "HOMER-UG34-01(NAVY)-40", "41": "HOMER-UG34-01(NAVY)-41", "42": "HOMER-UG34-01(NAVY)-42", "43": "HOMER-UG34-01(NAVY)-43"}, "-02(Đen)": {"38": "HOMER-UG34-02(DEN)-38", "39": "HOMER-UG34-02(DEN)-39", "40": "HOMER-UG34-02(DEN)-40", "41": "HOMER-UG34-02(DEN)-41", "42": "HOMER-UG34-02(DEN)-42", "43": "HOMER-UG34-02(DEN)-43"}, "-03(Choco)": {"38": "HOMER-UG34-03(CHOCO)-38", "39": "HOMER-UG34-03(CHOCO)-39", "40": "HOMER-UG34-03(CHOCO)-40", "41": "HOMER-UG34-03(CHOCO)-41", "42": "HOMER-UG34-03(CHOCO)-42", "43": "HOMER-UG34-03(CHOCO)-43"}, "-04(Beige)": {"38": "HOMER-UG34-04(BEIGE)-38", "39": "HOMER-UG34-04(BEIGE)-39", "40": "HOMER-UG34-04(BEIGE)-40", "41": "HOMER-UG34-04(BEIGE)-41", "42": "HOMER-UG34-04(BEIGE)-42", "43": "HOMER-UG34-04(BEIGE)-43"}}}, {"keys": ["LAURO", "UG33"], "code": "LAURO-UG33", "noAttr": false, "variants": {"-01(Navy)": {"38": "LAURO-UG33-01(NAVY)-38", "39": "LAURO-UG33-01(NAVY)-39", "40": "LAURO-UG33-01(NAVY)-40", "41": "LAURO-UG33-01(NAVY)-41", "42": "LAURO-UG33-01(NAVY)-42", "43": "LAURO-UG33-01(NAVY)-43"}, "-02(Đen)": {"38": "LAURO-UG33-02(DEN)-38", "39": "LAURO-UG33-02(DEN)-39", "40": "LAURO-UG33-02(DEN)-40", "41": "LAURO-UG33-02(DEN)-41", "42": "LAURO-UG33-02(DEN)-42", "43": "LAURO-UG33-02(DEN)-43"}, "-03(Choco)": {"38": "LAURO-UG33-03(CHOCO)-38", "39": "LAURO-UG33-03(CHOCO)-39", "40": "LAURO-UG33-03(CHOCO)-40", "41": "LAURO-UG33-03(CHOCO)-41", "42": "LAURO-UG33-03(CHOCO)-42", "43": "LAURO-UG33-03(CHOCO)-43"}, "-04(Beige)": {"38": "LAURO-UG33-04(BEIGE)-38", "39": "LAURO-UG33-04(BEIGE)-39", "40": "LAURO-UG33-04(BEIGE)-40", "41": "LAURO-UG33-04(BEIGE)-41", "42": "LAURO-UG33-04(BEIGE)-42", "43": "LAURO-UG33-04(BEIGE)-43"}, "-05(Đen trơn)": {"38": "LAURO-UG33-05(DENTRON)-38", "39": "LAURO-UG33-05(DENTRON)-39", "40": "LAURO-UG33-05(DENTRON)-40", "41": "LAURO-UG33-05(DENTRON)-41", "42": "LAURO-UG33-05(DENTRON)-42", "43": "LAURO-UG33-05(DENTRON)-43"}}}, {"keys": ["MONTIA", "UG32"], "code": "MONTIA-UG32", "noAttr": false, "variants": {"-01(Navy)": {"38": "MONTIA-UG32-01(NAVY)-38", "39": "MONTIA-UG32-01(NAVY)-39", "40": "MONTIA-UG32-01(NAVY)-40", "41": "MONTIA-UG32-01(NAVY)-41", "42": "MONTIA-UG32-01(NAVY)-42", "43": "MONTIA-UG32-01(NAVY)-43"}, "-02(Đen)": {"38": "MONTIA-UG32-02(DEN)-38", "39": "MONTIA-UG32-02(DEN)-39", "40": "MONTIA-UG32-02(DEN)-40", "41": "MONTIA-UG32-02(DEN)-41", "42": "MONTIA-UG32-02(DEN)-42", "43": "MONTIA-UG32-02(DEN)-43"}, "-03(Choco)": {"38": "MONTIA-UG32-03(CHOCO)-38", "39": "MONTIA-UG32-03(CHOCO)-39", "40": "MONTIA-UG32-03(CHOCO)-40", "41": "MONTIA-UG32-03(CHOCO)-41", "42": "MONTIA-UG32-03(CHOCO)-42", "43": "MONTIA-UG32-03(CHOCO)-43"}, "-04(Beige)": {"38": "MONTIA-UG32-04(BEIGE)-38", "39": "MONTIA-UG32-04(BEIGE)-39", "40": "MONTIA-UG32-04(BEIGE)-40", "41": "MONTIA-UG32-04(BEIGE)-41", "42": "MONTIA-UG32-04(BEIGE)-42", "43": "MONTIA-UG32-04(BEIGE)-43"}}}, {"keys": ["DORIAN", "UG31"], "code": "DORIAN-UG31", "noAttr": false, "variants": {"-01(Navy)": {"38": "DORIAN-UG31-01(NAVY)-38", "39": "DORIAN-UG31-01(NAVY)-39", "40": "DORIAN-UG31-01(NAVY)-40", "41": "DORIAN-UG31-01(NAVY)-41", "42": "DORIAN-UG31-01(NAVY)-42", "43": "DORIAN-UG31-01(NAVY)-43"}, "-02(Đen)": {"38": "DORIAN-UG31-02(DEN)-38", "39": "DORIAN-UG31-02(DEN)-39", "40": "DORIAN-UG31-02(DEN)-40", "41": "DORIAN-UG31-02(DEN)-41", "42": "DORIAN-UG31-02(DEN)-42", "43": "DORIAN-UG31-02(DEN)-43"}, "-03(Choco)": {"38": "DORIAN-UG31-03(CHOCO)-38", "39": "DORIAN-UG31-03(CHOCO)-39", "40": "DORIAN-UG31-03(CHOCO)-40", "41": "DORIAN-UG31-03(CHOCO)-41", "42": "DORIAN-UG31-03(CHOCO)-42", "43": "DORIAN-UG31-03(CHOCO)-43"}, "-04(Beige)": {"38": "DORIAN-UG31-04(BEIGE)-38", "39": "DORIAN-UG31-04(BEIGE)-39", "40": "DORIAN-UG31-04(BEIGE)-40", "41": "DORIAN-UG31-04(BEIGE)-41", "42": "DORIAN-UG31-04(BEIGE)-42", "43": "DORIAN-UG31-04(BEIGE)-43"}}}, {"keys": ["FRANK", "UG30"], "code": "FRANK-UG30", "noAttr": false, "variants": {"-01(Lightbrown)": {"36": "FRANK-UG30-01(LIGHTBROWN)-36", "37": "FRANK-UG30-01(LIGHTBROWN)-37", "38": "FRANK-UG30-01(LIGHTBROWN)-38", "39": "FRANK-UG30-01(LIGHTBROWN)-39", "40": "FRANK-UG30-01(LIGHTBROWN)-40", "41": "FRANK-UG30-01(LIGHTBROWN)-41", "42": "FRANK-UG30-01(LIGHTBROWN)-42", "43": "FRANK-UG30-01(LIGHTBROWN)-43"}, "-02(Đen)": {"36": "FRANK-UG30-02(DEN)-36", "37": "FRANK-UG30-02(DEN)-37", "38": "FRANK-UG30-02(DEN)-38", "39": "FRANK-UG30-02(DEN)-39", "40": "FRANK-UG30-02(DEN)-40", "41": "FRANK-UG30-02(DEN)-41", "42": "FRANK-UG30-02(DEN)-42", "43": "FRANK-UG30-02(DEN)-43"}, "-03(Choco)": {"36": "FRANK-UG30-03(CHOCO)-36", "37": "FRANK-UG30-03(CHOCO)-37", "38": "FRANK-UG30-03(CHOCO)-38", "39": "FRANK-UG30-03(CHOCO)-39", "40": "FRANK-UG30-03(CHOCO)-40", "41": "FRANK-UG30-03(CHOCO)-41", "42": "FRANK-UG30-03(CHOCO)-42", "43": "FRANK-UG30-03(CHOCO)-43"}, "-04(Beige)": {"36": "FRANK-UG30-04(BEIGE)-36", "37": "FRANK-UG30-04(BEIGE)-37", "38": "FRANK-UG30-04(BEIGE)-38", "39": "FRANK-UG30-04(BEIGE)-39", "40": "FRANK-UG30-04(BEIGE)-40", "41": "FRANK-UG30-04(BEIGE)-41", "42": "FRANK-UG30-04(BEIGE)-42", "43": "FRANK-UG30-04(BEIGE)-43"}}}, {"keys": ["IRIS", "UG07"], "code": "IRIS-UG07", "noAttr": false, "variants": {"-01(Trắng)": {"36": "IRIS-UG07-01(TRANG)-36", "37": "IRIS-UG07-01(TRANG)-37", "38": "IRIS-UG07-01(TRANG)-38", "39": "IRIS-UG07-01(TRANG)-39", "40": "IRIS-UG07-01(TRANG)-40", "41": "IRIS-UG07-01(TRANG)-41", "42": "IRIS-UG07-01(TRANG)-42", "43": "IRIS-UG07-01(TRANG)-43"}, "-02(Đen)": {"36": "IRIS-UG07-02(DEN)-36", "37": "IRIS-UG07-02(DEN)-37", "38": "IRIS-UG07-02(DEN)-38", "39": "IRIS-UG07-02(DEN)-39", "40": "IRIS-UG07-02(DEN)-40", "41": "IRIS-UG07-02(DEN)-41", "42": "IRIS-UG07-02(DEN)-42", "43": "IRIS-UG07-02(DEN)-43"}}}, {"keys": ["PIANY", "UG29"], "code": "PIANY-UG29", "noAttr": false, "variants": {"-01(Lightbrown)": {"38": "PIANY-UG29-01(LIGHTBROWN)-38", "39": "PIANY-UG29-01(LIGHTBROWN)-39", "40": "PIANY-UG29-01(LIGHTBROWN)-40", "41": "PIANY-UG29-01(LIGHTBROWN)-41", "42": "PIANY-UG29-01(LIGHTBROWN)-42", "43": "PIANY-UG29-01(LIGHTBROWN)-43"}, "-02(Đen)": {"38": "PIANY-UG29-02(DEN)-38", "39": "PIANY-UG29-02(DEN)-39", "40": "PIANY-UG29-02(DEN)-40", "41": "PIANY-UG29-02(DEN)-41", "42": "PIANY-UG29-02(DEN)-42", "43": "PIANY-UG29-02(DEN)-43"}, "-03(Choco)": {"38": "PIANY-UG29-03(CHOCO)-38", "39": "PIANY-UG29-03(CHOCO)-39", "40": "PIANY-UG29-03(CHOCO)-40", "41": "PIANY-UG29-03(CHOCO)-41", "42": "PIANY-UG29-03(CHOCO)-42", "43": "PIANY-UG29-03(CHOCO)-43"}, "-04(Beige)": {"38": "PIANY-UG29-04(BEIGE)-38", "39": "PIANY-UG29-04(BEIGE)-39", "40": "PIANY-UG29-04(BEIGE)-40", "41": "PIANY-UG29-04(BEIGE)-41", "42": "PIANY-UG29-04(BEIGE)-42", "43": "PIANY-UG29-04(BEIGE)-43"}}}, {"keys": ["LOTGIAY", "LOT GIAY MASSAGE", "MASSAGE 1CM"], "code": "LOTGIAY", "noAttr": true, "variants": {}}, {"keys": ["MERCURY", "UD01"], "code": "MERCURY-UD01", "noAttr": false, "variants": {"-01(Đen)": {"36": "MERCURY-UD01-01(DEN)-36", "37": "MERCURY-UD01-01(DEN)-37", "38": "MERCURY-UD01-01(DEN)-38", "39": "MERCURY-UD01-01(DEN)-39", "40": "MERCURY-UD01-01(DEN)-40", "41": "MERCURY-UD01-01(DEN)-41", "42": "MERCURY-UD01-01(DEN)-42", "43": "MERCURY-UD01-01(DEN)-43"}}}, {"keys": ["MARS", "UD03"], "code": "MARS-UD03", "noAttr": false, "variants": {"-01(Beige)": {"38": "MARS-UD03-01(BEIGE)-38", "39": "MARS-UD03-01(BEIGE)-39", "40": "MARS-UD03-01(BEIGE)-40", "41": "MARS-UD03-01(BEIGE)-41", "42": "MARS-UD03-01(BEIGE)-42", "43": "MARS-UD03-01(BEIGE)-43"}, "-02(Đen)": {"38": "MARS-UD03-02(DEN)-38", "39": "MARS-UD03-02(DEN)-39", "40": "MARS-UD03-02(DEN)-40", "41": "MARS-UD03-02(DEN)-41", "42": "MARS-UD03-02(DEN)-42", "43": "MARS-UD03-02(DEN)-43"}}}, {"keys": ["CARLTON", "UG26"], "code": "CARLTON-UG26", "noAttr": false, "variants": {"-02(Đen)": {"38": "CARLTON-UG26-02(DEN)-38", "39": "CARLTON-UG26-02(DEN)-39", "40": "CARLTON-UG26-02(DEN)-40", "41": "CARLTON-UG26-02(DEN)-41", "42": "CARLTON-UG26-02(DEN)-42", "43": "CARLTON-UG26-02(DEN)-43"}, "-03(Choco)": {"38": "CARLTON-UG26-03(CHOCO)-38", "39": "CARLTON-UG26-03(CHOCO)-39", "40": "CARLTON-UG26-03(CHOCO)-40", "41": "CARLTON-UG26-03(CHOCO)-41", "42": "CARLTON-UG26-03(CHOCO)-42", "43": "CARLTON-UG26-03(CHOCO)-43"}, "-04(Beige)": {"38": "CARLTON-UG26-04(BEIGE)-38", "39": "CARLTON-UG26-04(BEIGE)-39", "40": "CARLTON-UG26-04(BEIGE)-40", "41": "CARLTON-UG26-04(BEIGE)-41", "42": "CARLTON-UG26-04(BEIGE)-42", "43": "CARLTON-UG26-04(BEIGE)-43"}}}, {"keys": ["VESPER", "UG27"], "code": "VESPER-UG27", "noAttr": false, "variants": {"-01(Grey)": {"38": "VESPER-UG27-01(GREY)-38", "39": "VESPER-UG27-01(GREY)-39", "40": "VESPER-UG27-01(GREY)-40", "41": "VESPER-UG27-01(GREY)-41", "42": "VESPER-UG27-01(GREY)-42", "43": "VESPER-UG27-01(GREY)-43"}, "-02(Đen)": {"38": "VESPER-UG27-02(DEN)-38", "39": "VESPER-UG27-02(DEN)-39", "40": "VESPER-UG27-02(DEN)-40", "41": "VESPER-UG27-02(DEN)-41", "42": "VESPER-UG27-02(DEN)-42", "43": "VESPER-UG27-02(DEN)-43"}, "-03(Choco)": {"38": "VESPER-UG27-03(CHOCO)-38", "39": "VESPER-UG27-03(CHOCO)-39", "40": "VESPER-UG27-03(CHOCO)-40", "41": "VESPER-UG27-03(CHOCO)-41", "42": "VESPER-UG27-03(CHOCO)-42", "43": "VESPER-UG27-03(CHOCO)-43"}, "-04(Beige)": {"38": "VESPER-UG27-04(BEIGE)-38", "39": "VESPER-UG27-04(BEIGE)-39", "40": "VESPER-UG27-04(BEIGE)-40", "41": "VESPER-UG27-04(BEIGE)-41", "42": "VESPER-UG27-04(BEIGE)-42", "43": "VESPER-UG27-04(BEIGE)-43"}}}, {"keys": ["ENVI", "UD06"], "code": "ENVI-UD06", "noAttr": false, "variants": {"-01(Trắng)": {"38": "ENVI-UD06-01(TRANG)-38", "39": "ENVI-UD06-01(TRANG)-39", "40": "ENVI-UD06-01(TRANG)-40", "41": "ENVI-UD06-01(TRANG)-41", "42": "ENVI-UD06-01(TRANG)-42", "43": "ENVI-UD06-01(TRANG)-43"}, "-02(Đen)": {"38": "ENVI-UD06-02(DEN)-38", "39": "ENVI-UD06-02(DEN)-39", "40": "ENVI-UD06-02(DEN)-40", "41": "ENVI-UD06-02(DEN)-41", "42": "ENVI-UD06-02(DEN)-42", "43": "ENVI-UD06-02(DEN)-43"}}}, {"keys": ["ROGER", "UG28"], "code": "ROGER-UG28", "noAttr": false, "variants": {"-1(Lightbrown)": {"38": "ROGER-UG28-1(LIGHTBROWN)-38", "39": "ROGER-UG28-1(LIGHTBROWN)-39", "40": "ROGER-UG28-1(LIGHTBROWN)-40", "41": "ROGER-UG28-1(LIGHTBROWN)-41", "42": "ROGER-UG28-1(LIGHTBROWN)-42", "43": "ROGER-UG28-1(LIGHTBROWN)-43"}, "-2(Đen)": {"38": "ROGER-UG28-2(DEN)-38", "39": "ROGER-UG28-2(DEN)-39", "40": "ROGER-UG28-2(DEN)-40", "41": "ROGER-UG28-2(DEN)-41", "42": "ROGER-UG28-2(DEN)-42", "43": "ROGER-UG28-2(DEN)-43"}, "-3(Choco)": {"38": "ROGER-UG28-3(CHOCO)-38", "39": "ROGER-UG28-3(CHOCO)-39", "40": "ROGER-UG28-3(CHOCO)-40", "41": "ROGER-UG28-3(CHOCO)-41", "42": "ROGER-UG28-3(CHOCO)-42", "43": "ROGER-UG28-3(CHOCO)-43"}, "-4(Beige)": {"38": "ROGER-UG28-4(BEIGE)-38", "39": "ROGER-UG28-4(BEIGE)-39", "40": "ROGER-UG28-4(BEIGE)-40", "41": "ROGER-UG28-4(BEIGE)-41", "42": "ROGER-UG28-4(BEIGE)-42", "43": "ROGER-UG28-4(BEIGE)-43"}}}, {"keys": ["SKYWALK", "UD36"], "code": "SKYWALK-UD36", "noAttr": false, "variants": {"-01(Đen)": {"36/37": "SKYWALK-UD36-01(DEN)-36/37", "38/39": "SKYWALK-UD36-01(DEN)-38/39", "40/41": "SKYWALK-UD36-01(DEN)-40/41", "42/43": "SKYWALK-UD36-01(DEN)-42/43"}, "-02(Be)": {"36/37": "SKYWALK-UD36-02(BE)-36/37", "38/39": "SKYWALK-UD36-02(BE)-38/39", "40/41": "SKYWALK-UD36-02(BE)-40/41", "42/43": "SKYWALK-UD36-02(BE)-42/43"}, "-04(Trắng)": {"36/37": "SKYWALK-UD36-04(TRANG)-36/37", "38/39": "SKYWALK-UD36-04(TRANG)-38/39", "40/41": "SKYWALK-UD36-04(TRANG)-40/41", "42/43": "SKYWALK-UD36-04(TRANG)-42/43"}, "-03(Trà sữa)": {"36/37": "SKYWALK-UD36-03(TRASUA)-36/37", "38/39": "SKYWALK-UD36-03(TRASUA)-38/39", "40/41": "SKYWALK-UD36-03(TRASUA)-40/41", "42/43": "SKYWALK-UD36-03(TRASUA)-42/43"}, "-05(Be sữa)": {"36/37": "SKYWALK-UD36-05(BESUA)-36/37", "38/39": "SKYWALK-UD36-05(BESUA)-38/39", "40/41": "SKYWALK-UD36-05(BESUA)-40/41", "42/43": "SKYWALK-UD36-05(BESUA)-42/43"}}}, {"keys": ["COVE", "UG24"], "code": "COVE-UG24", "noAttr": false, "variants": {"-01(Đen)": {"38": "COVE-UG24-01(DEN)-38", "39": "COVE-UG24-01(DEN)-39", "40": "COVE-UG24-01(DEN)-40", "41": "COVE-UG24-01(DEN)-41", "42": "COVE-UG24-01(DEN)-42", "43": "COVE-UG24-01(DEN)-43"}, "-02(Light brown)": {"38": "COVE-UG24-02(LIGHTBROWN)-38", "39": "COVE-UG24-02(LIGHTBROWN)-39", "40": "COVE-UG24-02(LIGHTBROWN)-40", "41": "COVE-UG24-02(LIGHTBROWN)-41", "42": "COVE-UG24-02(LIGHTBROWN)-42", "43": "COVE-UG24-02(LIGHTBROWN)-43"}, "-03(Đen da lộn)": {"38": "COVE-UG24-03(DENDALON)-38", "39": "COVE-UG24-03(DENDALON)-39", "40": "COVE-UG24-03(DENDALON)-40", "41": "COVE-UG24-03(DENDALON)-41", "42": "COVE-UG24-03(DENDALON)-42", "43": "COVE-UG24-03(DENDALON)-43"}}}, {"keys": ["SUN", "UD53"], "code": "SUNUD53", "noAttr": false, "variants": {"-01(Đen)": {"36": "SUNUD53-01(DEN)-36", "37": "SUNUD53-01(DEN)-37", "38": "SUNUD53-01(DEN)-38", "39": "SUNUD53-01(DEN)-39", "40": "SUNUD53-01(DEN)-40", "41": "SUNUD53-01(DEN)-41", "42": "SUNUD53-01(DEN)-42", "43": "SUNUD53-01(DEN)-43"}, "-02(Kem)": {"36": "SUNUD53-02(KEM)-36", "37": "SUNUD53-02(KEM)-37", "38": "SUNUD53-02(KEM)-38", "39": "SUNUD53-02(KEM)-39", "40": "SUNUD53-02(KEM)-40", "41": "SUNUD53-02(KEM)-41", "42": "SUNUD53-02(KEM)-42", "43": "SUNUD53-02(KEM)-43"}, "-03(Nâu)": {"36": "SUNUD53-03(NAU)-36", "37": "SUNUD53-03(NAU)-37", "38": "SUNUD53-03(NAU)-38", "39": "SUNUD53-03(NAU)-39", "40": "SUNUD53-03(NAU)-40", "41": "SUNUD53-03(NAU)-41", "42": "SUNUD53-03(NAU)-42", "43": "SUNUD53-03(NAU)-43"}, "-04(Rêu)": {"36": "SUNUD53-04(REU)-36", "37": "SUNUD53-04(REU)-37", "38": "SUNUD53-04(REU)-38", "39": "SUNUD53-04(REU)-39", "40": "SUNUD53-04(REU)-40", "41": "SUNUD53-04(REU)-41", "42": "SUNUD53-04(REU)-42", "43": "SUNUD53-04(REU)-43"}}}, {"keys": ["REGAL", "UD44"], "code": "REGALUD44", "noAttr": false, "variants": {"-01(Đen)": {"36": "UD44REGAL-01(DEN)-36", "37": "UD44REGAL-01(DEN)-37", "38": "UD44REGAL-01(DEN)-38", "39": "UD44REGAL-01(DEN)-39", "40": "UD44REGAL-01(DEN)-40", "41": "UD44REGAL-01(DEN)-41", "42": "UD44REGAL-01(DEN)-42", "43": "UD44REGAL-01(DEN)-43"}, "-02(Xám ghi)": {"36": "UD44REGAL-02(XAMGHI)-36", "37": "UD44REGAL-02(XAMGHI)-37", "38": "UD44REGAL-02(XAMGHI)-38", "39": "UD44REGAL-02(XAMGHI)-39", "40": "UD44REGAL-02(XAMGHI)-40", "41": "UD44REGAL-02(XAMGHI)-41", "42": "UD44REGAL-02(XAMGHI)-42", "43": "UD44REGAL-02(XAMGHI)-43"}, "-03(Be)": {"36": "UD44REGAL-03(BE)-36", "37": "UD44REGAL-03(BE)-37", "38": "UD44REGAL-03(BE)-38", "39": "UD44REGAL-03(BE)-39", "40": "UD44REGAL-03(BE)-40", "41": "UD44REGAL-03(BE)-41", "42": "UD44REGAL-03(BE)-42", "43": "UD44REGAL-03(BE)-43"}, "-04(Rêu)": {"36": "UD44REGAL-04(REU)-36", "37": "UD44REGAL-04(REU)-37", "38": "UD44REGAL-04(REU)-38", "39": "UD44REGAL-04(REU)-39", "40": "UD44REGAL-04(REU)-40", "41": "UD44REGAL-04(REU)-41", "42": "UD44REGAL-04(REU)-42", "43": "UD44REGAL-04(REU)-43"}}}, {"keys": ["LINO", "UD40"], "code": "LINO-UD40", "noAttr": false, "variants": {"-01(Đen)": {"36": "LINO-UD40-01(DEN)-36", "37": "LINO-UD40-01(DEN)-37", "38": "LINO-UD40-01(DEN)-38", "39": "LINO-UD40-01(DEN)-39", "40": "LINO-UD40-01(DEN)-40", "41": "LINO-UD40-01(DEN)-41", "42": "LINO-UD40-01(DEN)-42", "43": "LINO-UD40-01(DEN)-43"}, "-02(Trắng)": {"36": "LINO-UD40-02(TRANG)-36", "37": "LINO-UD40-02(TRANG)-37", "38": "LINO-UD40-02(TRANG)-38", "39": "LINO-UD40-02(TRANG)-39", "40": "LINO-UD40-02(TRANG)-40", "41": "LINO-UD40-02(TRANG)-41", "42": "LINO-UD40-02(TRANG)-42", "43": "LINO-UD40-02(TRANG)-43"}, "-03(Nâu)": {"36": "LINO-UD40-03(NAU)-36", "37": "LINO-UD40-03(NAU)-37", "38": "LINO-UD40-03(NAU)-38", "39": "LINO-UD40-03(NAU)-39", "40": "LINO-UD40-03(NAU)-40", "41": "LINO-UD40-03(NAU)-41", "42": "LINO-UD40-03(NAU)-42", "43": "LINO-UD40-03(NAU)-43"}}}, {"keys": ["LEX", "UD52"], "code": "DépLEX-UD52", "noAttr": false, "variants": {"-01(Đen)": {"38": "DEPLEX-UD52-01(DEN)-38", "39": "DEPLEX-UD52-01(DEN)-39", "40": "DEPLEX-UD52-01(DEN)-40", "41": "DEPLEX-UD52-01(DEN)-41", "42": "DEPLEX-UD52-01(DEN)-42", "43": "DEPLEX-UD52-01(DEN)-43"}}}, {"keys": ["ELIOS", "UG23"], "code": "ELIOS-UG23", "noAttr": false, "variants": {"-01(Lightgrey)": {"38": "ELIOS-UG23-01(LIGHTGREY)-38", "39": "ELIOS-UG23-01(LIGHTGREY)-39", "40": "ELIOS-UG23-01(LIGHTGREY)-40", "41": "ELIOS-UG23-01(LIGHTGREY)-41", "42": "ELIOS-UG23-01(LIGHTGREY)-42", "43": "ELIOS-UG23-01(LIGHTGREY)-43"}, "-02(Đen)": {"38": "ELIOS-UG23-02(DEN)-38", "39": "ELIOS-UG23-02(DEN)-39", "40": "ELIOS-UG23-02(DEN)-40", "41": "ELIOS-UG23-02(DEN)-41", "42": "ELIOS-UG23-02(DEN)-42", "43": "ELIOS-UG23-02(DEN)-43"}, "-03(Choco)": {"38": "ELIOS-UG23-03(CHOCO)-38", "39": "ELIOS-UG23-03(CHOCO)-39", "40": "ELIOS-UG23-03(CHOCO)-40", "41": "ELIOS-UG23-03(CHOCO)-41", "42": "ELIOS-UG23-03(CHOCO)-42", "43": "ELIOS-UG23-03(CHOCO)-43"}, "-04(Beige)": {"38": "ELIOS-UG23-04(BEIGE)-38", "39": "ELIOS-UG23-04(BEIGE)-39", "40": "ELIOS-UG23-04(BEIGE)-40", "41": "ELIOS-UG23-04(BEIGE)-41", "42": "ELIOS-UG23-04(BEIGE)-42", "43": "ELIOS-UG23-04(BEIGE)-43"}, "-05(Navy)": {"38": "ELIOS-UG23-05(NAVY)-38", "39": "ELIOS-UG23-05(NAVY)-39", "40": "ELIOS-UG23-05(NAVY)-40", "41": "ELIOS-UG23-05(NAVY)-41", "42": "ELIOS-UG23-05(NAVY)-42", "43": "ELIOS-UG23-05(NAVY)-43"}}}, {"keys": ["TIDES", "UD17"], "code": "TIDES-UD17", "noAttr": false, "variants": {"-01 (Ghi Kem)": {"38": "TIDES-UD17-01(GHIKEM)-38", "39": "TIDES-UD17-01(GHIKEM)-39", "40": "TIDES-UD17-01(GHIKEM)-40", "41": "TIDES-UD17-01(GHIKEM)-41", "42": "TIDES-UD17-01(GHIKEM)-42", "43": "TIDES-UD17-01(GHIKEM)-43"}, "-02 (Ghi Đỏ Mận)": {"38": "TIDES-UD17-02(GHIDOMAN)-38", "39": "TIDES-UD17-02(GHIDOMAN)-39", "40": "TIDES-UD17-02(GHIDOMAN)-40", "41": "TIDES-UD17-02(GHIDOMAN)-41", "42": "TIDES-UD17-02(GHIDOMAN)-42", "43": "TIDES-UD17-02(GHIDOMAN)-43"}, "-03 (Kem Ghi)": {"38": "TIDES-UD17-03(KEMGHI)-38", "39": "TIDES-UD17-03(KEMGHI)-39", "40": "TIDES-UD17-03(KEMGHI)-40", "41": "TIDES-UD17-03(KEMGHI)-41", "42": "TIDES-UD17-03(KEMGHI)-42", "43": "TIDES-UD17-03(KEMGHI)-43"}, "-04 (Kem Đỏ Mận)": {"38": "TIDES-UD17-04(KEMDOMAN)-38", "39": "TIDES-UD17-04(KEMDOMAN)-39", "40": "TIDES-UD17-04(KEMDOMAN)-40", "41": "TIDES-UD17-04(KEMDOMAN)-41", "42": "TIDES-UD17-04(KEMDOMAN)-42", "43": "TIDES-UD17-04(KEMDOMAN)-43"}, "-05 (Đen)": {"38": "TIDES-UD17-05(DEN)-38", "39": "TIDES-UD17-05(DEN)-39", "40": "TIDES-UD17-05(DEN)-40", "41": "TIDES-UD17-05(DEN)-41", "42": "TIDES-UD17-05(DEN)-42", "43": "TIDES-UD17-05(DEN)-43"}}}, {"keys": ["COMO", "UG22"], "code": "COMO-UG22", "noAttr": false, "variants": {"-02( Đen)": {"38": "COMO-UG22-02(DEN)-38", "39": "COMO-UG22-02(DEN)-39", "40": "COMO-UG22-02(DEN)-40", "41": "COMO-UG22-02(DEN)-41", "42": "COMO-UG22-02(DEN)-42", "43": "COMO-UG22-02(DEN)-43"}, "-03( Nâu choco)": {"38": "COMO-UG22-03(NAUCHOCO)-38", "39": "COMO-UG22-03(NAUCHOCO)-39", "40": "COMO-UG22-03(NAUCHOCO)-40", "41": "COMO-UG22-03(NAUCHOCO)-41", "42": "COMO-UG22-03(NAUCHOCO)-42", "43": "COMO-UG22-03(NAUCHOCO)-43"}, "-04( Beige)": {"38": "COMO-UG22-04(BEIGE)-38", "39": "COMO-UG22-04(BEIGE)-39", "40": "COMO-UG22-04(BEIGE)-40", "41": "COMO-UG22-04(BEIGE)-41", "42": "COMO-UG22-04(BEIGE)-42", "43": "COMO-UG22-04(BEIGE)-43"}, "-05( Dark Navy)": {"38": "COMO-UG22-05(DARKNAVY)-38", "39": "COMO-UG22-05(DARKNAVY)-39", "40": "COMO-UG22-05(DARKNAVY)-40", "41": "COMO-UG22-05(DARKNAVY)-41", "42": "COMO-UG22-05(DARKNAVY)-42", "43": "COMO-UG22-05(DARKNAVY)-43"}, "-01(Lightgrey)": {"38": "COMO-UG22-01(LIGHTGREY)-38", "39": "COMO-UG22-01(LIGHTGREY)-39", "40": "COMO-UG22-01(LIGHTGREY)-40", "41": "COMO-UG22-01(LIGHTGREY)-41", "42": "COMO-UG22-01(LIGHTGREY)-42", "43": "COMO-UG22-01(LIGHTGREY)-43"}}}, {"keys": ["VERGE", "UG21"], "code": "VERGE-UG21", "noAttr": false, "variants": {"-01 ( Camel)": {"38": "VERGE-UG21-01(CAMEL)-38", "39": "VERGE-UG21-01(CAMEL)-39", "40": "VERGE-UG21-01(CAMEL)-40", "41": "VERGE-UG21-01(CAMEL)-41", "42": "VERGE-UG21-01(CAMEL)-42", "43": "VERGE-UG21-01(CAMEL)-43"}, "-02( Đen)": {"38": "VERGE-UG21-02(DEN)-38", "39": "VERGE-UG21-02(DEN)-39", "40": "VERGE-UG21-02(DEN)-40", "41": "VERGE-UG21-02(DEN)-41", "42": "VERGE-UG21-02(DEN)-42", "43": "VERGE-UG21-02(DEN)-43"}, "-03( Nâu choco)": {"38": "VERGE-UG21-03(NAUCHOCO)-38", "39": "VERGE-UG21-03(NAUCHOCO)-39", "40": "VERGE-UG21-03(NAUCHOCO)-40", "41": "VERGE-UG21-03(NAUCHOCO)-41", "42": "VERGE-UG21-03(NAUCHOCO)-42", "43": "VERGE-UG21-03(NAUCHOCO)-43"}, "-04( Beige)": {"38": "VERGE-UG21-04(BEIGE)-38", "39": "VERGE-UG21-04(BEIGE)-39", "40": "VERGE-UG21-04(BEIGE)-40", "41": "VERGE-UG21-04(BEIGE)-41", "42": "VERGE-UG21-04(BEIGE)-42", "43": "VERGE-UG21-04(BEIGE)-43"}, "-05( Dark Navy)": {"38": "VERGE-UG21-05(DARKNAVY)-38", "39": "VERGE-UG21-05(DARKNAVY)-39", "40": "VERGE-UG21-05(DARKNAVY)-40", "41": "VERGE-UG21-05(DARKNAVY)-41", "42": "VERGE-UG21-05(DARKNAVY)-42", "43": "VERGE-UG21-05(DARKNAVY)-43"}}}, {"keys": ["LORENZO", "UG25"], "code": "LORENZO-UG25", "noAttr": false, "variants": {"-Beige": {"38": "LORENZO-UG25-BEIGE-38", "39": "LORENZO-UG25-BEIGE-39", "40": "LORENZO-UG25-BEIGE-40", "41": "LORENZO-UG25-BEIGE-41", "42": "LORENZO-UG25-BEIGE-42", "43": "LORENZO-UG25-BEIGE-43"}, "-Đen": {"38": "LORENZO-UG25-DEN-38", "39": "LORENZO-UG25-DEN-39", "40": "LORENZO-UG25-DEN-40", "41": "LORENZO-UG25-DEN-41", "42": "LORENZO-UG25-DEN-42", "43": "LORENZO-UG25-DEN-43"}, "-Navy": {"38": "LORENZO-UG25-NAVY-38", "39": "LORENZO-UG25-NAVY-39", "40": "LORENZO-UG25-NAVY-40", "41": "LORENZO-UG25-NAVY-41", "42": "LORENZO-UG25-NAVY-42", "43": "LORENZO-UG25-NAVY-43"}, "-Choco": {"38": "LORENZO-UG25-CHOCO-38", "39": "LORENZO-UG25-CHOCO-39", "40": "LORENZO-UG25-CHOCO-40", "41": "LORENZO-UG25-CHOCO-41", "42": "LORENZO-UG25-CHOCO-42", "43": "LORENZO-UG25-CHOCO-43"}, "-CoolGrey": {"38": "LORENZO-UG25-COOLGREY-38", "39": "LORENZO-UG25-COOLGREY-39", "40": "LORENZO-UG25-COOLGREY-40", "41": "LORENZO-UG25-COOLGREY-41", "42": "LORENZO-UG25-COOLGREY-42", "43": "LORENZO-UG25-COOLGREY-43"}}}, {"keys": ["FLOAT", "UD26"], "code": "FLOAT-UD26", "noAttr": false, "variants": {"-01 (Be sữa)": {"36-37": "FLOAT-UD26-01(BESUA)36-37", "38-39": "FLOAT-UD26-01(BESUA)38-39", "40-41": "FLOAT-UD26-01(BESUA)40-41", "42-43": "FLOAT-UD26-01(BESUA)42-43"}, "-02 (Ghi)": {"36-37": "FLOAT-UD26-02(GHI)36-37", "38-39": "FLOAT-UD26-02(GHI)38-39", "40-41": "FLOAT-UD26-02(GHI)40-41", "42-43": "FLOAT-UD26-02(GHI)42-43"}, "-03 (Nâu)": {"36-37": "FLOAT-UD26-03(NAU)36-37", "38-39": "FLOAT-UD26-03(NAU)38-39", "40-41": "FLOAT-UD26-03(NAU)40-41", "42-43": "FLOAT-UD26-03(NAU)42-43"}, "-04 (Trắng)": {"36-37": "FLOAT-UD26-04(TRANG)36-37", "38-39": "FLOAT-UD26-04(TRANG)38-39", "40-41": "FLOAT-UD26-04(TRANG)40-41", "42-43": "FLOAT-UD26-04(TRANG)42-43"}, "-05 (Đen)": {"36-37": "FLOAT-UD26-05(DEN)36-37", "38-39": "FLOAT-UD26-05(DEN)38-39", "40-41": "FLOAT-UD26-05(DEN)40-41", "42-43": "FLOAT-UD26-05(DEN)42-43"}}}, {"keys": ["NOBLE", "UG19"], "code": "NOBLE-UG19", "noAttr": false, "variants": {"-01 Đen": {"38": "NOBLE-UG19-01DEN-38", "39": "NOBLE-UG19-01DEN-39", "40": "NOBLE-UG19-01DEN-40", "41": "NOBLE-UG19-01DEN-41", "42": "NOBLE-UG19-01DEN-42", "43": "NOBLE-UG19-01DEN-43"}, "-02 Beige": {"38": "NOBLE-UG19-02BEIGE-38", "39": "NOBLE-UG19-02BEIGE-39", "40": "NOBLE-UG19-02BEIGE-40", "41": "NOBLE-UG19-02BEIGE-41", "42": "NOBLE-UG19-02BEIGE-42", "43": "NOBLE-UG19-02BEIGE-43"}, "-03 Camel": {"38": "NOBLE-UG19-03CAMEL-38", "39": "NOBLE-UG19-03CAMEL-39", "40": "NOBLE-UG19-03CAMEL-40", "41": "NOBLE-UG19-03CAMEL-41", "42": "NOBLE-UG19-03CAMEL-42", "43": "NOBLE-UG19-03CAMEL-43"}, "-04 Choco": {"38": "NOBLE-UG19-04CHOCO-38", "39": "NOBLE-UG19-04CHOCO-39", "40": "NOBLE-UG19-04CHOCO-40", "41": "NOBLE-UG19-04CHOCO-41", "42": "NOBLE-UG19-04CHOCO-42", "43": "NOBLE-UG19-04CHOCO-43"}, "-05 Dark navy": {"38": "NOBLE-UG19-05DARKNAVY-38", "39": "NOBLE-UG19-05DARKNAVY-39", "40": "NOBLE-UG19-05DARKNAVY-40", "41": "NOBLE-UG19-05DARKNAVY-41", "42": "NOBLE-UG19-05DARKNAVY-42", "43": "NOBLE-UG19-05DARKNAVY-43"}}}, {"keys": ["ROYAL", "UG18"], "code": "ROYAL-UG18", "noAttr": false, "variants": {"-01 Đen": {"38": "ROYAL-UG18-01DEN-38", "39": "ROYAL-UG18-01DEN-39", "40": "ROYAL-UG18-01DEN-40", "41": "ROYAL-UG18-01DEN-41", "42": "ROYAL-UG18-01DEN-42", "43": "ROYAL-UG18-01DEN-43"}, "-02 Beige": {"38": "ROYAL-UG18-02BEIGE38", "39": "ROYAL-UG18-02BEIGE39", "40": "ROYAL-UG18-02BEIGE40", "41": "ROYAL-UG18-02BEIGE41", "42": "ROYAL-UG18-02BEIGE42", "43": "ROYAL-UG18-02BEIGE43"}, "-03 Camel": {"38": "ROYAL-UG18-03CAMEL38", "39": "ROYAL-UG18-03CAMEL39", "40": "ROYAL-UG18-03CAMEL40", "41": "ROYAL-UG18-03CAMEL41", "42": "ROYAL-UG18-03CAMEL42", "43": "ROYAL-UG18-03CAMEL43"}, "-04 Choco": {"38": "ROYAL-UG18-04CHOCO38", "39": "ROYAL-UG18-04CHOCO39", "40": "ROYAL-UG18-04CHOCO40", "41": "ROYAL-UG18-04CHOCO41", "42": "ROYAL-UG18-04CHOCO42", "43": "ROYAL-UG18-04CHOCO43"}}}, {"keys": ["TAT", "TAT CHAN"], "code": "TAT", "noAttr": false, "variants": {"Đen": {"Cổ cao": "TATCOCAODEN", "Cổ thấp": "TATCOTHAPDEN"}, "Trắng": {"Cổ cao": "TATCOCAOTRANG", "Cổ thấp": "TATCOTHAPTRANG"}}}, {"keys": ["LOT", "LOT GIAY TANG CHIEU CAO", "3CM"], "code": "LOT", "noAttr": true, "variants": {}}, {"keys": ["GLOSS", "UG17"], "code": "GLOSS-UG17", "noAttr": false, "variants": {"-02 (Màu đen)": {"38": "GLOSS-UG17-02(MAUDEN)38", "39": "GLOSS-UG17-02(MAUDEN)39", "40": "GLOSS-UG17-02(MAUDEN)40", "41": "GLOSS-UG17-02(MAUDEN)41", "42": "GLOSS-UG17-02(MAUDEN)42", "43": "GLOSS-UG17-02(MAUDEN)43", "36": "GLOSS-UG17-02(MAUDEN)36", "37": "GLOSS-UG17-02(MAUDEN)37"}, "-01 ( Màu nâu)": {"38": "GLOSS-UG17-01(MAUNAU)38", "39": "GLOSS-UG17-01(MAUNAU)39", "40": "GLOSS-UG17-01(MAUNAU)40", "41": "GLOSS-UG17-01(MAUNAU)41", "42": "GLOSS-UG17-01(MAUNAU)42", "43": "GLOSS-UG17-01(MAUNAU)43", "36": "GLOSS-UG17-01(MAUNAU)36", "37": "GLOSS-UG17-01(MAUNAU)37"}}}, {"keys": ["GENC", "UG09"], "code": "GenC-UG09", "noAttr": false, "variants": {"-02 (Đen)": {"38": "GENC-UG09-02(DEN)38", "39": "GENC-UG09-02(DEN)39", "40": "GENC-UG09-02(DEN)40", "41": "GENC-UG09-02(DEN)41", "42": "GENC-UG09-02(DEN)42", "43": "GENC-UG09-02(DEN)43", "36": "GENC-UG09-02(DEN)36", "37": "GENC-UG09-02(DEN)37"}, "-01 (Trắng)": {"38": "GENC-UG09-01(TRANG)38", "39": "GENC-UG09-01(TRANG)39", "40": "GENC-UG09-01(TRANG)40", "41": "GENC-UG09-01(TRANG)41", "42": "GENC-UG09-01(TRANG)42", "43": "GENC-UG09-01(TRANG)43", "36": "GENC-UG09-01(TRANG)36", "37": "GENC-UG09-01(TRANG)37"}}}, {"keys": ["AURO", "UD45"], "code": "Auro-UD45", "noAttr": false, "variants": {"-01 (Be)": {"38": "AURO-UD45-01(BE)38", "39": "AURO-UD45-01(BE)39", "40": "AURO-UD45-01(BE)40", "41": "AURO-UD45-01(BE)41", "42": "AURO-UD45-01(BE)42", "43": "AURO-UD45-01(BE)43", "36": "AURO-UD45-01(BE)36", "37": "AURO-UD45-01(BE)37"}, "-02 (Đen)": {"38": "AURO-UD45-02(DEN)38", "39": "AURO-UD45-02(DEN)39", "40": "AURO-UD45-02(DEN)40", "41": "AURO-UD45-02(DEN)41", "42": "AURO-UD45-02(DEN)42", "43": "AURO-UD45-02(DEN)43", "36": "AURO-UD45-02(DEN)36", "37": "AURO-UD45-02(DEN)37"}, "-03(Xám ghi)": {"38": "AURO-UD45-03(XAMGHI)38", "39": "AURO-UD45-03(XAMGHI)39", "40": "AURO-UD45-03(XAMGHI)40", "41": "AURO-UD45-03(XAMGHI)41", "42": "AURO-UD45-03(XAMGHI)42", "43": "AURO-UD45-03(XAMGHI)43", "36": "AURO-UD45-03(XAMGHI)36", "37": "AURO-UD45-03(XAMGHI)37"}, "-04 (Rêu)": {"38": "AURO-UD45-04(REU)38", "39": "AURO-UD45-04(REU)39", "40": "AURO-UD45-04(REU)40", "41": "AURO-UD45-04(REU)41", "42": "AURO-UD45-04(REU)42", "43": "AURO-UD45-04(REU)43", "36": "AURO-UD45-04(REU)36", "37": "AURO-UD45-04(REU)37"}}}, {"keys": ["PENNY", "UG16"], "code": "PENNY-UG16", "noAttr": false, "variants": {"-02( Đen)": {"38": "PENNY-UG16-02(DEN)38", "39": "PENNY-UG16-02(DEN)39", "40": "PENNY-UG16-02(DEN)40", "41": "PENNY-UG16-02(DEN)41", "42": "PENNY-UG16-02(DEN)42", "43": "PENNY-UG16-02(DEN)43"}, "-03 (Nâu Choco (Chocolate))": {"38": "PENNY-UG16-03(NAUCHOCO(CHOCOLATE))38", "39": "PENNY-UG16-03(NAUCHOCO(CHOCOLATE))39", "40": "PENNY-UG16-03(NAUCHOCO(CHOCOLATE))40", "41": "PENNY-UG16-03(NAUCHOCO(CHOCOLATE))41", "42": "PENNY-UG16-03(NAUCHOCO(CHOCOLATE))42", "43": "PENNY-UG16-03(NAUCHOCO(CHOCOLATE))43"}, "-04 (Mầu Beige)": {"38": "PENNY-UG16-04(MAUBEIGE)38", "39": "PENNY-UG16-04(MAUBEIGE)39", "40": "PENNY-UG16-04(MAUBEIGE)40", "41": "PENNY-UG16-04(MAUBEIGE)41", "42": "PENNY-UG16-04(MAUBEIGE)42", "43": "PENNY-UG16-04(MAUBEIGE)43"}, "-05 (Dark Navy": {"38": "PENNY-UG16-05(DARKNAVY38", "39": "PENNY-UG16-05(DARKNAVY39", "40": "PENNY-UG16-05(DARKNAVY40", "41": "PENNY-UG16-05(DARKNAVY41", "42": "PENNY-UG16-05(DARKNAVY42", "43": "PENNY-UG16-05(DARKNAVY43"}, "- 01( Nâu Camel)": {"38": "PENNY-UG16-01(NAUCAMEL)38", "39": "PENNY-UG16-01(NAUCAMEL)39", "40": "PENNY-UG16-01(NAUCAMEL)40", "41": "PENNY-UG16-01(NAUCAMEL)41", "42": "PENNY-UG16-01(NAUCAMEL)42", "43": "PENNY-UG16-01(NAUCAMEL)43"}, "-06(Cool Grey": {"38": "PENNY-UG16-06(COOLGREY38", "39": "PENNY-UG16-06(COOLGREY39", "40": "PENNY-UG16-06(COOLGREY40", "41": "PENNY-UG16-06(COOLGREY41", "42": "PENNY-UG16-06(COOLGREY42", "43": "PENNY-UG16-06(COOLGREY43"}, "07 ( Tan)": {"38": "PENNY-UG1607(TAN)38", "39": "PENNY-UG1607(TAN)39", "40": "PENNY-UG1607(TAN)40", "41": "PENNY-UG1607(TAN)41", "42": "PENNY-UG1607(TAN)42", "43": "PENNY-UG1607(TAN)43"}}}, {"keys": ["MUSE", "UG15"], "code": "MUSE-UG15", "noAttr": false, "variants": {"-01(Nâu Camel)": {"38": "MUSE-UG15-01(NAUCAMEL)38", "39": "MUSE-UG15-01(NAUCAMEL)39", "40": "MUSE-UG15-01(NAUCAMEL)40", "41": "MUSE-UG15-01(NAUCAMEL)41", "42": "MUSE-UG15-01(NAUCAMEL)42", "43": "MUSE-UG15-01(NAUCAMEL)43"}, "-02( Đen)": {"38": "MUSE-UG15-02(DEN)38", "39": "MUSE-UG15-02(DEN)39", "40": "MUSE-UG15-02(DEN)40", "41": "MUSE-UG15-02(DEN)41", "42": "MUSE-UG15-02(DEN)42", "43": "MUSE-UG15-02(DEN)43"}, "-03 (Nâu Choco (Chocolate))": {"38": "MUSE-UG15-03(NAUCHOCO(CHOCOLATE))38", "39": "MUSE-UG15-03(NAUCHOCO(CHOCOLATE))39", "40": "MUSE-UG15-03(NAUCHOCO(CHOCOLATE))40", "41": "MUSE-UG15-03(NAUCHOCO(CHOCOLATE))41", "42": "MUSE-UG15-03(NAUCHOCO(CHOCOLATE))42", "43": "MUSE-UG15-03(NAUCHOCO(CHOCOLATE))43"}, "-04 (Mầu Beige)": {"38": "MUSE-UG15-04(MAUBEIGE)38", "39": "MUSE-UG15-04(MAUBEIGE)39", "40": "MUSE-UG15-04(MAUBEIGE)40", "41": "MUSE-UG15-04(MAUBEIGE)41", "42": "MUSE-UG15-04(MAUBEIGE)42", "43": "MUSE-UG15-04(MAUBEIGE)43"}, "-05 (Dark Navy)": {"38": "MUSE-UG15-05(DARKNAVY)38", "39": "MUSE-UG15-05(DARKNAVY)39", "40": "MUSE-UG15-05(DARKNAVY)40", "41": "MUSE-UG15-05(DARKNAVY)41", "42": "MUSE-UG15-05(DARKNAVY)42", "43": "MUSE-UG15-05(DARKNAVY)43"}, "-06 Cool Grey": {"38": "MUSE-UG15-06COOLGREY38", "39": "MUSE-UG15-06COOLGREY39", "40": "MUSE-UG15-06COOLGREY40", "41": "MUSE-UG15-06COOLGREY41", "42": "MUSE-UG15-06COOLGREY42", "43": "MUSE-UG15-06COOLGREY43"}}}, {"keys": ["NEON", "UD61"], "code": "NEON-UD61", "noAttr": false, "variants": {"-01(Cam)": {"38": "NEON-UD61-01(CAM)38", "39": "NEON-UD61-01(CAM)39", "40": "NEON-UD61-01(CAM)40", "41": "NEON-UD61-01(CAM)41", "42": "NEON-UD61-01(CAM)42", "43": "NEON-UD61-01(CAM)43", "36": "NEON-UD61-01(CAM)36", "37": "NEON-UD61-01(CAM)37"}, "-02(Xanh)": {"38": "NEON-UD61-02(XANH)38", "39": "NEON-UD61-02(XANH)39", "40": "NEON-UD61-02(XANH)40", "41": "NEON-UD61-02(XANH)41", "42": "NEON-UD61-02(XANH)42", "43": "NEON-UD61-02(XANH)43", "36": "NEON-UD61-02(XANH)36", "37": "NEON-UD61-02(XANH)37"}}}, {"keys": ["DEMETER", "UG04"], "code": "Demeter-UG04", "noAttr": false, "variants": {"-01(Đen trắng)": {"38": "DEMETER-UG04-01(DENTRANG)38", "39": "DEMETER-UG04-01(DENTRANG)39", "40": "DEMETER-UG04-01(DENTRANG)40", "41": "DEMETER-UG04-01(DENTRANG)41", "42": "DEMETER-UG04-01(DENTRANG)42", "43": "DEMETER-UG04-01(DENTRANG)43", "36": "DEMETER-UG04-01(DENTRANG)36", "37": "DEMETER-UG04-01(DENTRANG)37"}}}, {"keys": ["JUNO", "UG08"], "code": "JUNO-UG08", "noAttr": false, "variants": {"-01(trắng sữa)": {"38": "JUNO-UG08-01(TRANGSUA)38", "39": "JUNO-UG08-01(TRANGSUA)39", "40": "JUNO-UG08-01(TRANGSUA)40", "41": "JUNO-UG08-01(TRANGSUA)41", "42": "JUNO-UG08-01(TRANGSUA)42", "43": "JUNO-UG08-01(TRANGSUA)43", "36": "JUNO-UG08-01(TRANGSUA)36", "37": "JUNO-UG08-01(TRANGSUA)37"}, "-02(Đen)": {"38": "JUNO-UG08-02(DEN)38", "39": "JUNO-UG08-02(DEN)39", "40": "JUNO-UG08-02(DEN)40", "41": "JUNO-UG08-02(DEN)41", "42": "JUNO-UG08-02(DEN)42", "43": "JUNO-UG08-02(DEN)43", "36": "JUNO-UG08-02(DEN)36", "37": "JUNO-UG08-02(DEN)37"}, "-03(xanh Denim)": {"38": "JUNO-UG08-03(XANHDENIM)38", "39": "JUNO-UG08-03(XANHDENIM)39", "40": "JUNO-UG08-03(XANHDENIM)40", "41": "JUNO-UG08-03(XANHDENIM)41", "42": "JUNO-UG08-03(XANHDENIM)42", "43": "JUNO-UG08-03(XANHDENIM)43", "36": "JUNO-UG08-03(XANHDENIM)36", "37": "JUNO-UG08-03(XANHDENIM)37"}, "-04(Đỏ)": {"38": "JUNO-UG08-04(DO)38", "39": "JUNO-UG08-04(DO)39", "40": "JUNO-UG08-04(DO)40", "41": "JUNO-UG08-04(DO)41", "42": "JUNO-UG08-04(DO)42", "43": "JUNO-UG08-04(DO)43", "36": "JUNO-UG08-04(DO)36", "37": "JUNO-UG08-04(DO)37"}}}, {"keys": ["SOLE", "UG13"], "code": "SOLE-UG13", "noAttr": false, "variants": {"-01 (Nâu Camel)": {"38": "SOLE-UG13-01(NAUCAMEL)38", "39": "SOLE-UG13-01(NAUCAMEL)39", "40": "SOLE-UG13-01(NAUCAMEL)40", "41": "SOLE-UG13-01(NAUCAMEL)41", "42": "SOLE-UG13-01(NAUCAMEL)42", "43": "SOLE-UG13-01(NAUCAMEL)43"}, "-02 (Màu đen)": {"38": "SOLE-UG13-02(MAUDEN)38", "39": "SOLE-UG13-02(MAUDEN)39", "40": "SOLE-UG13-02(MAUDEN)40", "41": "SOLE-UG13-02(MAUDEN)41", "42": "SOLE-UG13-02(MAUDEN)42", "43": "SOLE-UG13-02(MAUDEN)43"}, "-03 (Nâu Choco (Chocolate))": {"38": "SOLE-UG13-03(NAUCHOCO(CHOCOLATE))38", "39": "SOLE-UG13-03(NAUCHOCO(CHOCOLATE))39", "40": "SOLE-UG13-03(NAUCHOCO(CHOCOLATE))40", "41": "SOLE-UG13-03(NAUCHOCO(CHOCOLATE))41", "42": "SOLE-UG13-03(NAUCHOCO(CHOCOLATE))42", "43": "SOLE-UG13-03(NAUCHOCO(CHOCOLATE))43"}, "-04(Mầu Beige)": {"38": "SOLE-UG13-04(MAUBEIGE)38", "39": "SOLE-UG13-04(MAUBEIGE)39", "40": "SOLE-UG13-04(MAUBEIGE)40", "41": "SOLE-UG13-04(MAUBEIGE)41", "42": "SOLE-UG13-04(MAUBEIGE)42", "43": "SOLE-UG13-04(MAUBEIGE)43"}, "-05 (Màu Dark Navy)": {"38": "SOLE-UG13-05(MAUDARKNAVY)38", "39": "SOLE-UG13-05(MAUDARKNAVY)39", "40": "SOLE-UG13-05(MAUDARKNAVY)40", "41": "SOLE-UG13-05(MAUDARKNAVY)41", "42": "SOLE-UG13-05(MAUDARKNAVY)42", "43": "SOLE-UG13-05(MAUDARKNAVY)43"}, "-06( Cool Grey)": {"38": "SOLE-UG13-06(COOLGREY)38", "39": "SOLE-UG13-06(COOLGREY)39", "40": "SOLE-UG13-06(COOLGREY)40", "41": "SOLE-UG13-06(COOLGREY)41", "42": "SOLE-UG13-06(COOLGREY)42", "43": "SOLE-UG13-06(COOLGREY)43"}}}, {"keys": ["AMUN", "UG06"], "code": "Amun-UG06", "noAttr": false, "variants": {"- 01 (Trắng, ghi)": {"38": "AMUN-UG06-01(TRANG,GHI)38", "39": "AMUN-UG06-01(TRANG,GHI)39", "40": "AMUN-UG06-01(TRANG,GHI)40", "41": "AMUN-UG06-01(TRANG,GHI)41", "42": "AMUN-UG06-01(TRANG,GHI)42", "43": "AMUN-UG06-01(TRANG,GHI)43"}, "- 02 (Đen)": {"38": "AMUN-UG06-02(DEN)38", "39": "AMUN-UG06-02(DEN)39", "40": "AMUN-UG06-02(DEN)40", "41": "AMUN-UG06-02(DEN)41", "42": "AMUN-UG06-02(DEN)42", "43": "AMUN-UG06-02(DEN)43"}, "-03 (Trắng nâu)": {"38": "AMUN-UG06-03(TRANGNAU)38", "39": "AMUN-UG06-03(TRANGNAU)39", "40": "AMUN-UG06-03(TRANGNAU)40", "41": "AMUN-UG06-03(TRANGNAU)41", "42": "AMUN-UG06-03(TRANGNAU)42", "43": "AMUN-UG06-03(TRANGNAU)43"}}}, {"keys": ["SUEDE", "UG12"], "code": "SUEDE-UG12", "noAttr": false, "variants": {"-01 Nâu Camel": {"38": "SUEDE-UG12-01NAUCAMEL38", "39": "SUEDE-UG12-01NAUCAMEL39", "40": "SUEDE-UG12-01NAUCAMEL40", "41": "SUEDE-UG12-01NAUCAMEL41", "42": "SUEDE-UG12-01NAUCAMEL42", "43": "SUEDE-UG12-01NAUCAMEL43"}, "-02 Đen": {"38": "SUEDE-UG12-02DEN38", "39": "SUEDE-UG12-02DEN39", "40": "SUEDE-UG12-02DEN40", "41": "SUEDE-UG12-02DEN41", "42": "SUEDE-UG12-02DEN42", "43": "SUEDE-UG12-02DEN43"}, "-03 Nâu Choco (Chocolate)": {"38": "SUEDE-UG12-03NAUCHOCO(CHOCOLATE)38", "39": "SUEDE-UG12-03NAUCHOCO(CHOCOLATE)39", "40": "SUEDE-UG12-03NAUCHOCO(CHOCOLATE)40", "41": "SUEDE-UG12-03NAUCHOCO(CHOCOLATE)41", "42": "SUEDE-UG12-03NAUCHOCO(CHOCOLATE)42", "43": "SUEDE-UG12-03NAUCHOCO(CHOCOLATE)43"}, "-04 Beige": {"38": "SUEDE-UG12-04BEIGE38", "39": "SUEDE-UG12-04BEIGE39", "40": "SUEDE-UG12-04BEIGE40", "41": "SUEDE-UG12-04BEIGE41", "42": "SUEDE-UG12-04BEIGE42", "43": "SUEDE-UG12-04BEIGE43"}}}, {"keys": ["GEM", "UG14"], "code": "GEM-UG14", "noAttr": false, "variants": {"-01 Nâu Camel": {"38": "GEM-UG14-01NAUCAMEL38", "39": "GEM-UG14-01NAUCAMEL39", "40": "GEM-UG14-01NAUCAMEL40", "41": "GEM-UG14-01NAUCAMEL41", "42": "GEM-UG14-01NAUCAMEL42", "43": "GEM-UG14-01NAUCAMEL43"}, "-02 Đen": {"38": "GEM-UG14-02DEN38", "39": "GEM-UG14-02DEN39", "40": "GEM-UG14-02DEN40", "41": "GEM-UG14-02DEN41", "42": "GEM-UG14-02DEN42", "43": "GEM-UG14-02DEN43"}, "-03 Nâu Choco (Chocolate)": {"38": "GEM-UG14-03NAUCHOCO(CHOCOLATE)38", "39": "GEM-UG14-03NAUCHOCO(CHOCOLATE)39", "40": "GEM-UG14-03NAUCHOCO(CHOCOLATE)40", "41": "GEM-UG14-03NAUCHOCO(CHOCOLATE)41", "42": "GEM-UG14-03NAUCHOCO(CHOCOLATE)42", "43": "GEM-UG14-03NAUCHOCO(CHOCOLATE)43"}, "-04 Beige": {"38": "GEM-UG14-04BEIGE38", "39": "GEM-UG14-04BEIGE39", "40": "GEM-UG14-04BEIGE40", "41": "GEM-UG14-04BEIGE41", "42": "GEM-UG14-04BEIGE42", "43": "GEM-UG14-04BEIGE43"}, "-05 Navy": {"38": "GEM-UG14-05NAVY38", "39": "GEM-UG14-05NAVY39", "40": "GEM-UG14-05NAVY40", "41": "GEM-UG14-05NAVY41", "42": "GEM-UG14-05NAVY42", "43": "GEM-UG14-05NAVY43"}}}, {"keys": ["ELITE", "UG11"], "code": "ELITE-UG11", "noAttr": false, "variants": {"-01 Nâu Camel": {"38": "ELITE-UG11-01NAUCAMEL38", "39": "ELITE-UG11-01NAUCAMEL39", "40": "ELITE-UG11-01NAUCAMEL40", "41": "ELITE-UG11-01NAUCAMEL41", "42": "ELITE-UG11-01NAUCAMEL42", "43": "ELITE-UG11-01NAUCAMEL43"}, "-02 Đen": {"38": "ELITE-UG11-02DEN38", "39": "ELITE-UG11-02DEN39", "40": "ELITE-UG11-02DEN40", "41": "ELITE-UG11-02DEN41", "42": "ELITE-UG11-02DEN42", "43": "ELITE-UG11-02DEN43"}, "-03 Nâu Choco (Chocolate)": {"38": "ELITE-UG11-03NAUCHOCO(CHOCOLATE)38", "39": "ELITE-UG11-03NAUCHOCO(CHOCOLATE)39", "40": "ELITE-UG11-03NAUCHOCO(CHOCOLATE)40", "41": "ELITE-UG11-03NAUCHOCO(CHOCOLATE)41", "42": "ELITE-UG11-03NAUCHOCO(CHOCOLATE)42", "43": "ELITE-UG11-03NAUCHOCO(CHOCOLATE)43"}, "-04 Beige": {"38": "ELITE-UG11-04BEIGE38", "39": "ELITE-UG11-04BEIGE39", "40": "ELITE-UG11-04BEIGE40", "41": "ELITE-UG11-04BEIGE41", "42": "ELITE-UG11-04BEIGE42", "43": "ELITE-UG11-04BEIGE43"}, "-05( Dark Navy)": {"38": "ELITE-UG11-05(DARKNAVY)38", "39": "ELITE-UG11-05(DARKNAVY)39", "40": "ELITE-UG11-05(DARKNAVY)40", "41": "ELITE-UG11-05(DARKNAVY)41", "42": "ELITE-UG11-05(DARKNAVY)42", "43": "ELITE-UG11-05(DARKNAVY)43"}, "-06(Cool Grey)": {"38": "ELITE-UG11-06(COOLGREY)38", "39": "ELITE-UG11-06(COOLGREY)39", "40": "ELITE-UG11-06(COOLGREY)40", "41": "ELITE-UG11-06(COOLGREY)41", "42": "ELITE-UG11-06(COOLGREY)42", "43": "ELITE-UG11-06(COOLGREY)43"}}}];
function normalize_sku_color_token(s) {
  return bo_dau_tieng_viet(String(s || ""))
    .toUpperCase()
    .replace(/CHOCOLATE/g, "")
    .replace(/\bMAU\b/g, "")
    .replace(/^[-\s]*0?\d+\s*/g, "")
    .replace(/[^A-Z0-9]+/g, "")
    .trim();
}

function match_upyo_sku_entry(spClean) {
  const spNorm = bo_dau_tieng_viet(String(spClean || ""))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  if (!spNorm) return null;
  const spCompact = spNorm.replace(/\s+/g, "");
  const spTokens = spNorm.split(" ").filter(Boolean);
  for (let i = 0; i < UPYO_SKU_CATALOG.length; i++) {
    const item = UPYO_SKU_CATALOG[i];
    for (let k = 0; k < item.keys.length; k++) {
      const key = item.keys[k];
      if (spCompact === key.replace(/\s+/g, "") || spTokens.includes(key) || (key.length >= 4 && spNorm.includes(key))) {
        return item;
      }
    }
  }
  return null;
}

function match_upyo_sku_color(entry, colorClean) {
  const colorKeys = entry && entry.variants ? Object.keys(entry.variants) : [];
  if (!colorKeys.length || !colorClean) return colorKeys.length === 1 ? colorKeys[0] : "";
  const cTok = normalize_sku_color_token(colorClean);
  if (!cTok) return colorKeys.length === 1 ? colorKeys[0] : "";

  for (let i = 0; i < colorKeys.length; i++) {
    if (normalize_sku_color_token(colorKeys[i]) === cTok) return colorKeys[i];
  }

  const aliases = [cTok];
  if (cTok === "DARKNAVY") aliases.push("NAVY");
  if (cTok === "NAVY") aliases.push("DARKNAVY");
  if (cTok === "NAUCHOCO" || cTok === "CHOCO" || cTok === "CHOCOLATE") aliases.push("CHOCO", "NAUCHOCO", "NAU");
  if (cTok === "NAUCAMEL" || cTok === "CAMEL") aliases.push("CAMEL", "NAUCAMEL");
  if (cTok === "BEIGE" || cTok === "BE") aliases.push("BEIGE", "BE");
  if (cTok === "COOLGREY" || cTok === "LIGHTGREY" || cTok === "GREY" || cTok === "XAMGHI" || cTok === "GHI") {
    aliases.push("COOLGREY", "LIGHTGREY", "GREY", "XAMGHI", "GHI");
  }
  if (cTok === "DEN" || cTok === "DENTRON" || cTok === "DENLI") aliases.push("DEN", "DENLI", "DENTRON");
  if (cTok === "LIGHTBROWN" || cTok === "NAUSANG") aliases.push("LIGHTBROWN");
  if (cTok === "TRANGSUA" || cTok === "TRANG") aliases.push("TRANG", "TRANGSUA");
  if (cTok === "BESUA") aliases.push("BESUA", "BE");

  for (let a = 0; a < aliases.length; a++) {
    for (let i = 0; i < colorKeys.length; i++) {
      if (normalize_sku_color_token(colorKeys[i]) === aliases[a]) return colorKeys[i];
    }
  }
  for (let i = 0; i < colorKeys.length; i++) {
    const lTok = normalize_sku_color_token(colorKeys[i]);
    if (lTok && (lTok.includes(cTok) || cTok.includes(lTok))) return colorKeys[i];
  }
  return "";
}

function match_upyo_sku_size_code(sizeMap, sizeClean) {
  if (!sizeMap) return "";
  const keys = Object.keys(sizeMap);
  if (!keys.length) return "";
  const raw = String(sizeClean || "").trim().replace(/^[-]+/, "").trim();
  if (!raw) return "";
  const rawNorm = bo_dau_tieng_viet(raw).toUpperCase().replace(/\s+/g, "");
  const rawSlash = rawNorm.replace(/-/g, "/");

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const kNorm = bo_dau_tieng_viet(k).toUpperCase().replace(/\s+/g, "");
    if (kNorm === rawNorm || kNorm.replace(/-/g, "/") === rawSlash) return sizeMap[k];
  }
  const mNum = rawNorm.match(/^\d{2}$/);
  if (mNum) {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const parts = k.split(/[\/\-]+/).map((p) => p.trim());
      if (parts.includes(rawNorm)) return sizeMap[k];
    }
  }
  const firstKey = keys[0];
  const firstCode = sizeMap[firstKey];
  if (firstKey && firstCode && firstCode.endsWith(firstKey)) {
    return firstCode.slice(0, firstCode.length - firstKey.length) + raw;
  }
  return "";
}

function format_ship_item_name(qty, sp, color, size) {
  const spClean = String(sp || "").trim();
  const colorClean = String(color || "")
    .trim()
    .replace(/^m[aà]u\s*[:\-]?\s*/i, "")
    .trim();
  const sizeClean = String(size || "")
    .trim()
    .replace(/^size\s*[:\-]?\s*/i, "")
    .trim();

  if (!spClean) return "Giày";
  const skuEntry = match_upyo_sku_entry(spClean);
  if (skuEntry) {
    if (skuEntry.noAttr) return skuEntry.code;
    const matchedColorKey = match_upyo_sku_color(skuEntry, colorClean);
    if (matchedColorKey && skuEntry.variants && skuEntry.variants[matchedColorKey]) {
      const exactCode = match_upyo_sku_size_code(skuEntry.variants[matchedColorKey], sizeClean);
      if (exactCode) return exactCode;
    }
    return [skuEntry.code, colorClean, sizeClean].filter(Boolean).join("-");
  }

  const spUpperNoDau = bo_dau_tieng_viet(spClean).toUpperCase();
  const productPart = spUpperNoDau.includes("GIAY") || spUpperNoDau.includes("DEP") ? spClean : `GIÀY ${spClean}`;
  let out = productPart;
  if (colorClean) out += ` / Màu: ${colorClean}`;
  if (sizeClean) out += `${colorClean ? "," : " /"} Size: ${sizeClean}`;
  return out;
}

const DEFAULT_VTP_SENDER_PHONE = "0915519166";
const DEFAULT_VTP_SENDER_ADDR =
  "Số nhà 179 Giẽ Thượng, xã Chuyên Mỹ, Hà Nội (địa chỉ mới), XÃ PHÚ YÊN, HUYỆN PHÚ XUYÊN, HÀ NỘI";
const DEFAULT_SHIP_NOTE = "Cho xem hàng và thử, ko nhận thu 30k";

function save_exp_ship_prefs() {
  try {
    const prefs = {
      carrier: _exp_ship_carrier,
      unitWeight: Number(document.getElementById("expShipWeight")?.value || 1000) || 1000,
      vtpService: normalize_vtp_service_value(document.getElementById("expShipVtpService")?.value),
      vtpServiceVer: 2,
      senderPhone: document.getElementById("expShipSenderPhone")?.value || "",
      senderAddr: document.getElementById("expShipSenderAddr")?.value || "",
      defaultNote: document.getElementById("expShipDefaultNote")?.value || "",
      onlyNoMvd: true,
      skipErrors: true,
      vtpXmg: Boolean(document.getElementById("expShipVtpXmg")?.checked ?? true),
      vtpXmgMoney: Math.max(0, Math.round(Number(document.getElementById("expShipVtpXmgMoney")?.value || 30000) || 0)),
      tags: Array.from(exp_ship_tag_codes),
    };
    localStorage.setItem(STORAGE_KEY_EXP_SHIP_PREFS, JSON.stringify(prefs));
  } catch (e) {}
}

function prepare_ship_export_rows(orders, opts) {
  const onlyNoMvd = Boolean(opts.onlyNoMvd);
  const skipErrors = Boolean(opts.skipErrors);
  const unitWeightGram = Math.max(50, Math.round(Number(opts.weightGram) || 1000));
  const senderPhone = String(opts.senderPhone || "").trim();
  const senderAddr = String(opts.senderAddr || "").trim();
  const senderProvInfo = detect_vn_province_info(senderAddr);
  const senderInfo = [senderAddr, senderPhone].filter(Boolean).join(" - ");
  const defaultNote = String(opts.defaultNote || "").trim();
  const vtpService = normalize_vtp_service_value(opts.vtpService);
  const vtpXmg = opts.vtpXmg !== false;

  const source = Array.isArray(orders) ? orders : [];
  const sortedSource = source.slice().sort((a, b) => (a.row_num || 0) - (b.row_num || 0));
  const groupMap = new Map();
  const groupedList = [];
  for (const row of sortedSource) {
    const ownMvd = String(row.ma_van_don || "").trim();
    const parentMvd = String(row.parent_ma_van_don || "").trim();
    const effMvd = ownMvd && ownMvd !== "-" && ownMvd !== "—" ? ownMvd : parentMvd;
    if (onlyNoMvd && effMvd && effMvd !== "-" && effMvd !== "—") continue;

    const rawSdt = String(row.sdt || row.parent_sdt || "").trim();
    const { phone: normPh, valid: phOk } = normalize_vn_phone_for_ship(rawSdt);
    const dateKey = String(row.ngay_only || "").trim();
    let gKey;
    if (phOk && normPh) {
      gKey = `P:${normPh}|${dateKey}`;
    } else if (row.group_id) {
      gKey = `G:${row.group_id}`;
    } else {
      gKey = `R:${row.row_num || Math.random()}`;
    }
    let grp = groupMap.get(gKey);
    if (!grp) {
      grp = { primary: row, items: [] };
      groupMap.set(gKey, grp);
      groupedList.push(grp);
    } else {
      const pHasInfo = Boolean(String(grp.primary.ho_ten || "").trim() && String(grp.primary.dia_chi || "").trim());
      const rHasInfo = Boolean(String(row.ho_ten || "").trim() && String(row.dia_chi || "").trim());
      if (!pHasInfo && rHasInfo) grp.primary = row;
    }
    grp.items.push(row);
  }

  const allCandidates = [];
  const warnings = [];
  let validCount = 0;
  let totalCod = 0;
  let totalQty = 0;

  let seq = 0;
  for (const grp of groupedList) {
    const o = grp.primary;
    const name = String(o.ho_ten || o.parent_ho_ten || "").trim();
    const { phone, valid: phoneValid } = normalize_vn_phone_for_ship(o.sdt || o.parent_sdt);
    const addr = String(o.dia_chi || o.parent_dia_chi || "").trim();
    const orderKey = `${phone}|${addr}`;
    const fullAddrOverride = _exp_ship_addr_overrides[orderKey];
    let provInfo = fullAddrOverride ? fullAddrOverride.provInfo : detect_vn_province_info(addr);
    let distInfo = fullAddrOverride ? fullAddrOverride.distInfo : detect_vtp_district_info(addr, provInfo.vtpId, provInfo);
    const merged2025 = fullAddrOverride ? null : detect_vtp_2025_merged_address(addr, provInfo, distInfo);
    if (merged2025) {
      provInfo = merged2025.oldProv;
      distInfo = merged2025.oldDist;
    }
    const province = provInfo.name;
    const district = distInfo.name;
    const manualWard = _exp_ship_ward_overrides[orderKey];
    let wardInfo;
    if (manualWard && manualWard.id && String(manualWard.distId || "") === String(distInfo.id || "")) {
      wardInfo = { name: manualWard.name, id: manualWard.id, isDefault: false, isManual: true };
    } else if (fullAddrOverride && fullAddrOverride.wardInfo && fullAddrOverride.wardInfo.id) {
      wardInfo = fullAddrOverride.wardInfo;
    } else if (merged2025) {
      const wList = get_vtp_wards_for_dist(distInfo.id);
      const normAddr = " " + bo_dau_tieng_viet(addr).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
      const candWards = wList.filter((w) => merged2025.candidateWardIds.includes(String(w.id)));
      const exactOldHit = candWards.find(
        (w) =>
          w.bareKey !== merged2025.newWardKey &&
          ((w.explicitKeys && w.explicitKeys.some((ek) => normAddr.indexOf(" " + ek + " ") !== -1)) ||
            (w.bareKey && normAddr.indexOf(" " + w.bareKey + " ") !== -1))
      );
      if (exactOldHit) {
        wardInfo = { name: exactOldHit.full, id: exactOldHit.id, isDefault: false, isMerged2025: true };
      } else if (candWards.length === 1) {
        wardInfo = { name: candWards[0].full, id: candWards[0].id, isDefault: false, isMerged2025: true };
      } else if (candWards.length > 1) {
        wardInfo = { name: candWards[0].full, id: candWards[0].id, isDefault: true, isMerged2025: true };
      } else {
        wardInfo = detect_vtp_ward_info(addr, distInfo.id, distInfo, provInfo);
        if (!wardInfo.name && distInfo.id) wardInfo = pick_default_vtp_ward(distInfo.id);
        wardInfo.isMerged2025 = true;
      }
    } else {
      wardInfo = detect_vtp_ward_info(addr, distInfo.id, distInfo, provInfo);
      if (!wardInfo.name && distInfo.id) {
        wardInfo = pick_default_vtp_ward(distInfo.id);
      }
    }
    const ward = wardInfo.name;
    let rowVtpService = vtpService;
    if (provInfo.vtpId && senderProvInfo.vtpId && String(provInfo.vtpId) === String(senderProvInfo.vtpId)) {
      const svcCode = rowVtpService.split(" - ")[0].trim().toUpperCase();
      if (svcCode === "ECOD" || svcCode === "LCOD") {
        rowVtpService = VTP_SERVICE_NORMALIZE_MAP.PHS;
      } else if (svcCode === "SCOD" || svcCode === "NCOD") {
        rowVtpService = VTP_SERVICE_NORMALIZE_MAP.PTN;
      }
    }
    const listItems = [];
    let qty = 0;
    let cod = 0;
    let rowWeightGram = 0;
    let hasAnySp = false;
    for (const it of grp.items) {
      const itSp = String(it.dong_sp || "").trim();
      if (itSp) hasAnySp = true;
      const itColor = String(it.mau_sac || "").trim();
      const itSize = String(it.size || "").trim();
      const itQty = infer_ship_order_qty(it);
      const itWeight = itQty * unitWeightGram;
      const itCod = Math.max(0, Math.round(Number(it.gia_ban) || 0));
      const itCode = format_ship_item_name(itQty, itSp, itColor, itSize);
      qty += itQty;
      cod += itCod;
      rowWeightGram += itWeight;
      listItems.push({
        PRODUCT_NAME: itCode,
        PRODUCT_PRICE: itCod,
        PRODUCT_WEIGHT: itWeight,
        PRODUCT_QUANTITY: itQty,
      });
    }
    const sp = hasAnySp ? "OK" : "";
    const rowWeightKg = Math.round((rowWeightGram / 1000) * 100) / 100;
    const itemName = listItems.map((it) => it.PRODUCT_NAME).join(", ");
    const fullNote = defaultNote;

    const issues = [];
    if (!name) issues.push("Thiếu họ tên");
    if (!phoneValid) issues.push(phone ? `Số điện thoại lỗi (${phone})` : "Thiếu số điện thoại");
    if (!addr || addr.length < 10) issues.push("Địa chỉ quá ngắn");
    else if (!province) issues.push("Chưa rõ Tỉnh/Thành phố");
    else if (!district) issues.push("Chưa rõ Quận/Huyện");
    else if (!ward) issues.push("Chưa rõ Phường/Xã");
    else if (merged2025 && wardInfo.isDefault) {
      issues.push("Cần AI sửa địa chỉ lên đơn chuẩn");
    } else if (wardInfo.isDefault) issues.push("Cần AI sửa địa chỉ lên đơn chuẩn");
    if (!sp) issues.push("Thiếu tên sản phẩm");

    const hasHardError = !name || !phoneValid || !addr || !sp;
    if (issues.length > 0) {
      warnings.push({
        orderKey,
        name: name || "(Chưa có tên)",
        phone: phone || "—",
        addr: addr || "—",
        reason: issues.join(", "),
        province,
        district,
        vtpDistId: distInfo.id,
        wardId: wardInfo.id,
        wardName: ward,
        preferredWardIds: merged2025 ? merged2025.candidateWardIds : null,
        canPickWard: Boolean(distInfo.id && (wardInfo.isDefault || !ward)),
        canResolveOnline: Boolean(addr && addr.length >= 6 && (!province || !district || !ward || wardInfo.isDefault)),
      });
    } else {
      validCount += 1;
    }

    if (skipErrors && hasHardError) continue;

    seq += 1;
    totalCod += cod;
    totalQty += qty;
    const dateTag = String(o.thoi_gian || "").replace(/\D/g, "").slice(0, 8) || format_ymd_date(new Date()).replace(/-/g, "");
    const orderCode = `UPYO${dateTag}_${String(seq).padStart(3, "0")}`;

    allCandidates.push({
      stt: seq,
      orderCode,
      orderDateYmd: String(o.ngay_only || o.thoi_gian || "").trim(),
      senderInfo,
      name,
      phone,
      addr,
      province,
      vtpProvCode: provInfo.vtpCode,
      vtpProvId: provInfo.vtpId,
      district,
      vtpDistId: distInfo.id,
      ward,
      vtpWardId: wardInfo.id,
      itemName,
      listItems,
      qty,
      weightGram: rowWeightGram,
      weightKg: rowWeightKg,
      cod,
      value: cod,
      cargoType: "Bưu kiện",
      vtpService: rowVtpService,
      vtpExtraService: vtpXmg && cod > 0 ? "XMG" : "",
      note: fullNote,
      sale: String(o.sale || "").trim(),
      mkt: String(o.mkt || "").trim(),
      issues,
    });
  }

  return {
    rows: allCandidates,
    warnings,
    validCount,
    totalCod,
    totalQty,
    totalSource: source.length,
  };
}

function get_ship_export_headers_and_rows(carrier, preparedRows) {
  if (carrier === "jt") {
    const headers = [
      "STT",
      "Mã đơn hàng riêng",
      "Tên người nhận (*)",
      "SĐT người nhận (*)",
      "Địa chỉ người nhận (*)",
      "Tỉnh/Thành phố",
      "Quận/Huyện",
      "Phường/Xã",
      "Tên hàng hóa (*)",
      "Số lượng",
      "Trọng lượng (kg) (*)",
      "Tiền thu hộ COD (VND)",
      "Giá trị hàng hóa (VND)",
      "Phương thức thanh toán",
      "Ghi chú",
    ];
    const colWidths = [6, 18, 22, 15, 42, 18, 16, 16, 36, 10, 14, 16, 16, 16, 32];
    const numCols = new Set([0, 9, 10, 11, 12]);
    const moneyCols = new Set([11, 12]);
    const rows = preparedRows.map((r) => [
      r.stt,
      r.orderCode,
      r.name,
      r.phone,
      r.addr,
      r.province,
      r.district,
      r.ward,
      r.itemName,
      r.qty,
      r.weightKg,
      r.cod,
      r.value,
      "PP_PM",
      r.note,
    ]);
    return { headers, colWidths, numCols, moneyCols, rows, sheetName: "JT_Express", vtpTemplateHeader: false };
  }

  // Mặc định: Viettel Post (chuẩn 100% file mẫu VTP_mau_excel_don_hang.xlsx: sheet "Danh sách", 28 cột A..AB, dòng 7 tiêu đề, dòng 8+ dữ liệu)
  const headers = [
    "STT",
    "Mã đơn hàng ",
    "Tên người nhận (*)",
    "Số ĐT người nhận (*)",
    "Địa chỉ nhận (*)",
    "Tỉnh đến (*)",
    "Quận/Huyện đến (*)",
    "Phường/Xã đến",
    "Tên hàng hóa (*)",
    "Số lượng",
    "Trọng lượng (gram)  (*)",
    "Giá trị hàng (VND) (*)",
    "Tiền thu hộ COD (VND)",
    "Loại hàng hóa (*)",
    "Tính chất hàng hóa đặc biệt",
    "Dịch vụ  (*)",
    "Dài (cm)",
    "Rộng (cm)",
    "Cao (cm)",
    "Dịch vụ cộng thêm ",
    "Người trả cước",
    "Yêu cầu khác",
    "Thời gian hẹn lấy",
    "Thời gian giao",
    "ID tỉnh",
    "Mã tỉnh",
    "Mã huyện",
    "Mã xã",
  ];
  const colWidths = [
    6, 18, 22, 15, 42, 16, 22, 18, 36, 10, 16, 16, 16, 14, 18, 28, 9, 9, 9, 16, 15, 34, 20, 14, 10, 10, 10, 10,
  ];
  const numCols = new Set([0, 9, 10, 11, 12, 16, 17, 18, 25, 26, 27]);
  const moneyCols = new Set([11, 12]);
  const rows = preparedRows.map((r) => [
    r.stt,
    r.orderCode,
    r.name,
    r.phone,
    r.addr,
    r.province,
    r.district,
    r.ward,
    r.itemName,
    r.qty,
    r.weightGram,
    r.value,
    r.cod,
    r.cargoType,
    "",
    r.vtpService,
    1,
    1,
    1,
    r.vtpExtraService || "",
    "Người gửi trả",
    r.note,
    "",
    "Cả ngày",
    r.vtpProvCode,
    r.vtpProvId,
    r.vtpDistId,
    r.vtpWardId,
  ]);
  return { headers, colWidths, numCols, moneyCols, rows, sheetName: "Danh sách", vtpTemplateHeader: true };
}

function build_ship_xlsx_blob(carrier, preparedRows) {
  const { headers, colWidths, numCols, moneyCols, rows, sheetName, vtpTemplateHeader } =
    get_ship_export_headers_and_rows(carrier, preparedRows);
  const totalCols = headers.length;

  const cellStr = (ref, val, sIdx) =>
    `<c r="${ref}" t="inlineStr" s="${sIdx}"><is><t>${xlsx_xml_escape(val)}</t></is></c>`;
  const cellNum = (ref, val, sIdx) => `<c r="${ref}" s="${sIdx}"><v>${Number(val)}</v></c>`;

  const sheetRowsXml = [];
  let headerRowNum = 1;
  if (vtpTemplateHeader) {
    // Đúng cấu trúc 6 dòng đầu của file mẫu Viettel Post (VTP_mau_excel_don_hang.xlsx)
    sheetRowsXml.push(`<row r="2" ht="20" customHeight="1">${cellStr("D2", "TẬP ĐOÀN CÔNG NGHIỆP - VIỄN THÔNG QUÂN ĐỘI", 5)}</row>`);
    sheetRowsXml.push(`<row r="3" ht="20" customHeight="1">${cellStr("D3", "TỔNG CÔNG TY CỔ PHẦN BƯU CHÍNH VIETTEL", 5)}</row>`);
    sheetRowsXml.push(`<row r="5" ht="24" customHeight="1">${cellStr("I5", "DANH SÁCH ĐƠN HÀNG", 5)}</row>`);
    sheetRowsXml.push(`<row r="6" ht="18" customHeight="1">${cellStr("A6", "(*) là các trường bắt buộc nhập", 0)}</row>`);
    headerRowNum = 7;
  }

  // Header row (Row 7 cho VTP, Row 1 cho J&T)
  const hCells = headers.map((h, ci) => cellStr(`${xlsx_col_letter(ci)}${headerRowNum}`, h, 1));
  sheetRowsXml.push(`<row r="${headerRowNum}" ht="28" customHeight="1">${hCells.join("")}</row>`);

  // Data rows (Row 8+ cho VTP, Row 2+ cho J&T)
  rows.forEach((arr, rIdx) => {
    const excelRow = headerRowNum + 1 + rIdx;
    const cells = arr.map((val, ci) => {
      const ref = `${xlsx_col_letter(ci)}${excelRow}`;
      if (numCols.has(ci) && val !== "" && val !== null && val !== undefined && !Number.isNaN(Number(val))) {
        const isMoney = moneyCols && moneyCols.has(ci);
        return cellNum(ref, val, isMoney ? 3 : 2);
      }
      return cellStr(ref, val === null || val === undefined ? "" : val, 4);
    });
    sheetRowsXml.push(`<row r="${excelRow}" ht="20" customHeight="1">${cells.join("")}</row>`);
  });

  const colsXml = colWidths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  const lastRowNum = headerRowNum + rows.length;
  const lastRef = `${xlsx_col_letter(totalCols - 1)}${lastRowNum}`;

  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:${lastRef}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRowNum}" topLeftCell="A${headerRowNum + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="20"/>` +
    `<cols>${colsXml}</cols>` +
    `<sheetData>${sheetRowsXml.join("")}</sheetData>` +
    `</worksheet>`;

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>` +
    `<fonts count="3">` +
    `<font><sz val="10"/><name val="Arial"/></font>` +
    `<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>` +
    `<font><b/><sz val="11"/><color rgb="FF1F2937"/><name val="Arial"/></font>` +
    `</fonts>` +
    `<fills count="3">` +
    `<fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FF15803D"/><bgColor indexed="64"/></patternFill></fill>` +
    `</fills>` +
    `<borders count="2">` +
    `<border><left/><right/><top/><bottom/><diagonal/></border>` +
    `<border><left style="thin"><color rgb="FFD4C4B4"/></left><right style="thin"><color rgb="FFD4C4B4"/></right><top style="thin"><color rgb="FFD4C4B4"/></top><bottom style="thin"><color rgb="FFD4C4B4"/></bottom><diagonal/></border>` +
    `</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="6">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `</cellXfs>` +
    `</styleSheet>`;

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rootRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${xlsx_xml_escape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const workbookRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  return xlsx_build_zip([
    { name: "[Content_Types].xml", data: contentTypesXml },
    { name: "_rels/.rels", data: rootRelsXml },
    { name: "xl/workbook.xml", data: workbookXml },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml },
    { name: "xl/styles.xml", data: stylesXml },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml },
  ]);
}

function build_ship_tsv(carrier, preparedRows) {
  const { headers, rows } = get_ship_export_headers_and_rows(carrier, preparedRows);
  const cleanCell = (v) => String(v === null || v === undefined ? "" : v).replace(/[\t\r\n]+/g, " ");
  const lines = [headers.map(cleanCell).join("\t")];
  for (const arr of rows) {
    lines.push(arr.map(cleanCell).join("\t"));
  }
  return lines.join("\n");
}

function refresh_export_ship_preview() {
  const weightGram = Number(document.getElementById("expShipWeight")?.value || 1000) || 1000;
  const vtpService = document.getElementById("expShipVtpService")?.value || VTP_SERVICE_NORMALIZE_MAP.VSL7;
  const senderPhone = document.getElementById("expShipSenderPhone")?.value || "";
  const senderAddr = document.getElementById("expShipSenderAddr")?.value || "";
  const defaultNote = document.getElementById("expShipDefaultNote")?.value || "";
  const onlyNoMvd = true;
  const skipErrors = true;
  const vtpXmgEl = document.getElementById("expShipVtpXmg");
  const vtpXmg = vtpXmgEl ? Boolean(vtpXmgEl.checked) : true;

  let filteredOrders = get_exp_ship_base_orders_by_date().filter((o) => {
    const tagNorm = bo_dau_tieng_viet(get_exp_ship_order_tag(o) || "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();
    return tagNorm === "LEN APP VTP" || tagNorm === "LEN APPVTP";
  });

  const prep = prepare_ship_export_rows(filteredOrders, {
    onlyNoMvd,
    skipErrors,
    weightGram,
    senderPhone,
    senderAddr,
    vtpService,
    vtpXmg,
    defaultNote,
  });
  _exp_ship_last_prepared = prep;

  const srcBadge = document.getElementById("expShipSourceBadge");
  if (srcBadge) srcBadge.textContent = `${prep.totalSource} ĐƠN TAG LÊN APP VTP`;
  const readyBadge = document.getElementById("expShipReadyBadge");
  if (readyBadge) readyBadge.textContent = `${prep.rows.length} đơn xuất`;

  const sumEl = document.getElementById("expShipSummaryRow");
  if (sumEl) {
    sumEl.innerHTML =
      `<div class="export-cp-kpi-card">` +
      `<span class="export-cp-kpi-label">Đơn sẽ xuất</span>` +
      `<span class="export-cp-kpi-val is-orders">${prep.rows.length} đơn</span>` +
      `<span class="export-cp-kpi-sub">Đạt chuẩn: ${prep.validCount} • ${prep.totalQty} đôi</span>` +
      `</div>` +
      `<div class="export-cp-kpi-card">` +
      `<span class="export-cp-kpi-label">Cần kiểm tra</span>` +
      `<span class="export-cp-kpi-val ${prep.warnings.length > 0 ? "is-spend" : ""}">${prep.warnings.length} đơn</span>` +
      `<span class="export-cp-kpi-sub">${prep.warnings.length > 0 ? "Xem danh sách dưới" : "Đủ thông tin"}</span>` +
      `</div>` +
      `<div class="export-cp-kpi-card">` +
      `<span class="export-cp-kpi-label">Tổng thu hộ COD</span>` +
      `<span class="export-cp-kpi-val">${format_tien_vnd(prep.totalCod)}</span>` +
      `<span class="export-cp-kpi-sub">${_exp_ship_carrier === "jt" ? "J&T Express" : "Viettel Post"}</span>` +
      `</div>`;
  }

  const warnBox = document.getElementById("expShipWarnBox");
  const warnTitle = document.getElementById("expShipWarnTitle");
  const warnList = document.getElementById("expShipWarnList");
  const aiFixBtn = document.getElementById("btnExpShipResolveOnline");
  if (warnBox && warnList) {
    if (prep.warnings.length > 0) {
      warnBox.classList.remove("hidden");
      if (aiFixBtn) {
        aiFixBtn.classList.toggle("hidden", !prep.warnings.some((w) => w.canResolveOnline));
      }
      if (warnTitle) {
        warnTitle.textContent = `⚠️ ${prep.warnings.length} đơn cần kiểm tra lại địa chỉ và thông tin`;
      }
      warnList.innerHTML = prep.warnings
        .slice(0, 30)
        .map((w) => {
          return (
            `<div class="export-ship-warn-item export-ship-v2-warn-item">` +
            `<span class="export-ship-v2-warn-who"><strong>${escape_html(w.name)}</strong><span class="export-ship-v2-warn-phone">${escape_html(w.phone)}</span></span>` +
            `<span class="export-ship-warn-reason export-ship-v2-warn-reason">${escape_html(w.reason)}</span>` +
            `</div>`
          );
        })
        .join("") +
        (prep.warnings.length > 30
          ? `<div class="export-ship-warn-item export-ship-v2-warn-item"><span>...và ${prep.warnings.length - 30} đơn khác</span></div>`
          : "");
    } else {
      warnBox.classList.add("hidden");
      warnList.innerHTML = "";
    }
  }

  const vtpWrap = document.getElementById("expShipVtpServiceWrap");
  if (vtpWrap) vtpWrap.classList.toggle("hidden", _exp_ship_carrier !== "vtp");
  const senderPhoneWrap = document.getElementById("expShipSenderPhoneWrap");
  if (senderPhoneWrap) senderPhoneWrap.classList.toggle("hidden", _exp_ship_carrier !== "vtp");
  const senderAddrWrap = document.getElementById("expShipSenderAddrWrap");
  if (senderAddrWrap) senderAddrWrap.classList.toggle("hidden", _exp_ship_carrier !== "vtp");
  const shipGrid = document.querySelector("#exportShipModal .export-ship-grid-compact");
  if (shipGrid) shipGrid.classList.toggle("is-jt", _exp_ship_carrier === "jt");
  const shipGridRow2 = document.getElementById("expShipGridRow2");
  if (shipGridRow2) shipGridRow2.classList.toggle("is-jt", _exp_ship_carrier === "jt");
  const xmgWrap = document.getElementById("expShipVtpXmgWrap");
  if (xmgWrap) xmgWrap.classList.toggle("hidden", _exp_ship_carrier !== "vtp");
  const isVtp = _exp_ship_carrier === "vtp";
  const actionsBar = document.getElementById("expShipActionsBar");
  if (actionsBar) actionsBar.classList.toggle("is-vtp", isVtp);
  const pushVtpBtn = document.getElementById("btnDoPushVtpApi");
  if (pushVtpBtn) {
    pushVtpBtn.classList.toggle("hidden", !isVtp);
    const hasWarnings = prep.warnings.length > 0;
    pushVtpBtn.disabled = prep.rows.length === 0 || hasWarnings;
    pushVtpBtn.title = hasWarnings
      ? `Cần xử lý hết ${prep.warnings.length} đơn trong mục Cần kiểm tra trước khi đẩy đơn Viettel Post`
      : "Đẩy đơn trực tiếp lên Viettel Post qua Token (chuẩn Thu tiền xem hàng 30.000đ)";
    const spanEl = pushVtpBtn.querySelector("span");
    if (spanEl) {
      spanEl.textContent = hasWarnings
        ? `🔒 Cần xử lý hết ${prep.warnings.length} đơn lỗi trước khi đẩy`
        : "🚀 Đẩy đơn thẳng Viettel Post";
    }
  }

  const b1 = document.getElementById("btnDoExportShipXlsx");
  const b2 = document.getElementById("btnDoExportShipCopy");
  const disabled = prep.rows.length === 0;
  if (b1) {
    b1.classList.toggle("hidden", isVtp);
    b1.disabled = disabled;
  }
  if (b2) {
    b2.classList.toggle("hidden", isVtp);
    b2.disabled = disabled;
  }
}

function open_export_ship_modal() {
  const modal = document.getElementById("exportShipModal");
  if (!modal) return;
  if (typeof sync_vtp_token_with_cloud === "function") {
    sync_vtp_token_with_cloud().catch(() => {});
  }

  const prefs = read_exp_ship_prefs();
  _exp_ship_carrier = "vtp";
  document.querySelectorAll("#expShipCarrierGroup .export-ship-carrier-btn").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-carrier") === "vtp");
  });
  const wEl = document.getElementById("expShipWeight");
  if (wEl) wEl.value = String(prefs.unitWeight || 1000);
  const svcEl = document.getElementById("expShipVtpService");
  if (svcEl) {
    const useSavedSvc = Number(prefs.vtpServiceVer || 0) >= 2 && prefs.vtpService;
    svcEl.value = useSavedSvc ? normalize_vtp_service_value(prefs.vtpService) : VTP_SERVICE_NORMALIZE_MAP.VSL7;
    if (typeof sync_vtp_service_dd_ui === "function") sync_vtp_service_dd_ui();
  }
  const senderPhoneEl = document.getElementById("expShipSenderPhone");
  if (senderPhoneEl) {
    senderPhoneEl.value =
      typeof prefs.senderPhone === "string" && prefs.senderPhone.trim()
        ? prefs.senderPhone
        : DEFAULT_VTP_SENDER_PHONE;
  }
  const senderAddrEl = document.getElementById("expShipSenderAddr");
  if (senderAddrEl) {
    senderAddrEl.value =
      typeof prefs.senderAddr === "string" && prefs.senderAddr.trim()
        ? prefs.senderAddr
        : DEFAULT_VTP_SENDER_ADDR;
  }
  const noteEl = document.getElementById("expShipDefaultNote");
  if (noteEl) {
    const savedNote = typeof prefs.defaultNote === "string" ? prefs.defaultNote.trim() : "";
    noteEl.value =
      savedNote && savedNote !== "Cho xem hàng, không thử"
        ? prefs.defaultNote
        : DEFAULT_SHIP_NOTE;
  }
  const noMvdEl = document.getElementById("expShipOnlyNoMvd");
  if (noMvdEl && typeof prefs.onlyNoMvd === "boolean") noMvdEl.checked = prefs.onlyNoMvd;
  const skipEl = document.getElementById("expShipSkipErrors");
  if (skipEl && typeof prefs.skipErrors === "boolean") skipEl.checked = prefs.skipErrors;
  const xmgEl = document.getElementById("expShipVtpXmg");
  if (xmgEl) xmgEl.checked = typeof prefs.vtpXmg === "boolean" ? prefs.vtpXmg : true;
  const xmgMoneyEl = document.getElementById("expShipVtpXmgMoney");
  if (xmgMoneyEl) xmgMoneyEl.value = String(typeof prefs.vtpXmgMoney === "number" ? prefs.vtpXmgMoney : 30000);

  exp_ship_date_start = od_date_start || "";
  exp_ship_date_end = od_date_end || "";
  exp_ship_tag_codes = new Set(
    Array.isArray(prefs.tags) ? prefs.tags.map((t) => String(t || "").trim().toUpperCase()).filter(Boolean) : []
  );
  const tagSearchEl = document.getElementById("expShipTagSearch");
  if (tagSearchEl) tagSearchEl.value = "";
  update_exp_ship_date_btn_ui();
  render_exp_ship_tag_chips();

  document.getElementById("expShipStatusBox")?.classList.add("hidden");
  refresh_export_ship_preview();
  modal.classList.remove("hidden");
}

function close_export_ship_modal() {
  if (current_cal_target === "exp_ship") {
    const calPopup = document.getElementById("calendarPopup");
    calPopup?.classList.add("hidden");
    calPopup?.classList.remove("is-modal-cal");
    document.getElementById("btnExpShipDateRange")?.classList.remove("is-open");
    current_cal_target = null;
  }
  document.getElementById("expShipVtpSvcMenu")?.classList.add("hidden");
  document.getElementById("expShipVtpSvcTrigger")?.classList.remove("open");
  document.getElementById("expShipVtpSvcTrigger")?.setAttribute("aria-expanded", "false");
  document.getElementById("exportShipModal")?.classList.add("hidden");
}

function sync_vtp_service_dd_ui() {
  const sel = document.getElementById("expShipVtpService");
  const txtEl = document.getElementById("expShipVtpSvcText");
  const menuEl = document.getElementById("expShipVtpSvcMenu");
  if (!sel || !txtEl || !menuEl) return;
  const curVal = sel.value || (sel.options[0] ? sel.options[0].value : "");
  txtEl.textContent = curVal || "Chọn dịch vụ Viettel Post";
  menuEl.innerHTML = Array.from(sel.options)
    .map((opt) => {
      const val = String(opt.value || "");
      const parts = val.split(" - ");
      const code = parts[0] || val;
      const desc = parts.slice(1).join(" - ");
      const isAct = val === curVal;
      return `<button type="button" class="exp-ship-dd-opt${isAct ? " active" : ""}" role="option" aria-selected="${isAct ? "true" : "false"}" data-value="${escape_html(val)}">` +
        `<span class="exp-ship-dd-opt-code">${escape_html(code)}</span>` +
        `<span class="exp-ship-dd-opt-desc">${escape_html(desc)}</span>` +
        `</button>`;
    })
    .join("");
}

function init_export_ship_modal() {
  const modal = document.getElementById("exportShipModal");
  if (!modal) return;

  const setStatus = (text, state = "done") => {
    const box = document.getElementById("expShipStatusBox");
    const txt = document.getElementById("expShipStatusText");
    if (box) {
      box.classList.remove("hidden", "is-done", "is-error");
      if (state === "done") box.classList.add("is-done");
      else if (state === "error") box.classList.add("is-error");
    }
    if (txt) txt.textContent = text;
  };

  document.getElementById("btnOdExportShip")?.addEventListener("click", (e) => {
    e.stopPropagation();
    open_export_ship_modal();
  });

  document.getElementById("btnCloseExportShip")?.addEventListener("click", close_export_ship_modal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close_export_ship_modal();
  });
  document.getElementById("exportShipCard")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!e.target.closest("#expShipVtpSvcDd")) {
      document.getElementById("expShipVtpSvcMenu")?.classList.add("hidden");
      document.getElementById("expShipVtpSvcTrigger")?.classList.remove("open");
      document.getElementById("expShipVtpSvcTrigger")?.setAttribute("aria-expanded", "false");
    }
    if (current_cal_target === "exp_ship" && !e.target.closest("#calendarPopup") && !e.target.closest("#btnExpShipDateRange")) {
      const calPopup = document.getElementById("calendarPopup");
      calPopup?.classList.add("hidden");
      calPopup?.classList.remove("is-modal-cal");
      document.getElementById("btnExpShipDateRange")?.classList.remove("is-open");
      current_cal_target = null;
    }
  });

  // Custom Dropdown Dịch vụ Viettel Post (Tone Kem Cozy đồng bộ App)
  const svcTrigger = document.getElementById("expShipVtpSvcTrigger");
  const svcMenu = document.getElementById("expShipVtpSvcMenu");
  const svcSelect = document.getElementById("expShipVtpService");
  if (svcTrigger && svcMenu && svcSelect) {
    sync_vtp_service_dd_ui();
    svcTrigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const willOpen = svcMenu.classList.contains("hidden");
      if (willOpen) sync_vtp_service_dd_ui();
      svcMenu.classList.toggle("hidden", !willOpen);
      svcTrigger.classList.toggle("open", willOpen);
      svcTrigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
    svcMenu.addEventListener("click", (e) => {
      const optBtn = e.target.closest(".exp-ship-dd-opt[data-value]");
      if (!optBtn) return;
      e.preventDefault();
      e.stopPropagation();
      svcSelect.value = optBtn.getAttribute("data-value") || "";
      sync_vtp_service_dd_ui();
      svcMenu.classList.add("hidden");
      svcTrigger.classList.remove("open");
      svcTrigger.setAttribute("aria-expanded", "false");
      save_exp_ship_prefs();
      refresh_export_ship_preview();
    });
  }

  document.getElementById("btnExpShipDateRange")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle_calendar_popup("exp_ship", e.currentTarget);
  });

  document.getElementById("expShipTagSearch")?.addEventListener("input", () => {
    render_exp_ship_tag_chips();
  });

  document.getElementById("btnExpShipClearTag")?.addEventListener("click", () => {
    exp_ship_tag_codes.clear();
    save_exp_ship_prefs();
    render_exp_ship_tag_chips();
    refresh_export_ship_preview();
  });

  document.getElementById("expShipTagChips")?.addEventListener("click", (e) => {
    const chip = e.target.closest(".exp-cp-chip[data-tag]");
    if (!chip) return;
    const tag = chip.getAttribute("data-tag");
    if (!tag) return;
    if (exp_ship_tag_codes.has(tag)) exp_ship_tag_codes.delete(tag);
    else exp_ship_tag_codes.add(tag);
    save_exp_ship_prefs();
    render_exp_ship_tag_chips();
    refresh_export_ship_preview();
  });

  document.getElementById("expShipOnlyNoMvd")?.addEventListener("change", () => {
    render_exp_ship_tag_chips();
  });

  document.querySelectorAll("#expShipCarrierGroup .export-ship-carrier-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      _exp_ship_carrier = "vtp";
      document.querySelectorAll("#expShipCarrierGroup .export-ship-carrier-btn").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
      save_exp_ship_prefs();
      refresh_export_ship_preview();
    });
  });

  [
    "expShipWeight",
    "expShipVtpService",
    "expShipSenderPhone",
    "expShipSenderAddr",
    "expShipDefaultNote",
    "expShipOnlyNoMvd",
    "expShipSkipErrors",
    "expShipVtpXmg",
    "expShipVtpXmgMoney",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => {
      save_exp_ship_prefs();
      refresh_export_ship_preview();
    });
    if (el.tagName === "INPUT" && el.type !== "checkbox") {
      el.addEventListener("input", () => {
        save_exp_ship_prefs();
        refresh_export_ship_preview();
      });
    }
  });

  document.getElementById("btnExpShipResolveOnline")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnExpShipResolveOnline");
    const prep = _exp_ship_last_prepared;
    if (!prep || !Array.isArray(prep.warnings)) return;
    const targets = prep.warnings.filter((w) => (w.canResolveOnline || w.canPickWard) && w.addr && w.addr !== "—");
    if (targets.length === 0) {
      setStatus("Không có đơn nào cần tra địa chỉ online.", "done");
      return;
    }
    const origText = btn ? btn.textContent : "";
    if (btn) btn.disabled = true;
    let resolvedCount = 0;
    const resolvedSamples = [];
    try {
      for (let i = 0; i < targets.length; i++) {
        const w = targets[i];
        if (btn) btn.textContent = `⏳ Đang tra ${i + 1}/${targets.length}...`;
        const resOnline = await resolve_vtp_full_addr_online(w);
        if (resOnline) {
          if (resOnline.wardOnly && resOnline.ward && resOnline.ward.id) {
            _exp_ship_ward_overrides[w.orderKey] = {
              name: resOnline.ward.full,
              id: resOnline.ward.id,
              distId: w.vtpDistId,
            };
            resolvedCount += 1;
            if (resolvedSamples.length < 3) resolvedSamples.push(resOnline.ward.full);
          } else if (!resOnline.wardOnly && resOnline.provInfo && resOnline.distInfo) {
            _exp_ship_addr_overrides[w.orderKey] = {
              provInfo: resOnline.provInfo,
              distInfo: resOnline.distInfo,
              wardInfo: resOnline.wardInfo,
            };
            resolvedCount += 1;
            if (resolvedSamples.length < 3) {
              resolvedSamples.push(`${resOnline.wardInfo?.name || ""} - ${resOnline.distInfo.name} - ${resOnline.provInfo.name}`);
            }
          }
        }
      }
      refresh_export_ship_preview();
      if (resolvedCount > 0) {
        setStatus(
          `Đã tự tìm chuẩn địa chỉ cho ${resolvedCount}/${targets.length} đơn (${resolvedSamples.join("; ")}).`,
          "done"
        );
      } else {
        setStatus("Không tìm thêm được địa chỉ rõ hơn từ bản đồ online — bạn kiểm tra/sửa lại địa chỉ gốc nhé.", "error");
      }
    } catch (err) {
      setStatus(`Lỗi tra cứu online: ${(err && err.message) || err}`, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = origText || "✨ AI sửa địa chỉ chuẩn";
      }
    }
  });

  document.getElementById("expShipWarnList")?.addEventListener("change", (e) => {
    const sel = e.target.closest(".export-ship-ward-select");
    if (!sel) return;
    const orderKey = sel.getAttribute("data-order-key") || "";
    const distId = sel.getAttribute("data-dist-id") || "";
    const wardId = sel.value || "";
    if (!orderKey || !distId || !wardId) return;
    const wList = get_vtp_wards_for_dist(distId);
    const chosen = wList.find((w) => String(w.id) === String(wardId));
    if (chosen) {
      _exp_ship_ward_overrides[orderKey] = {
        name: chosen.full,
        id: chosen.id,
        distId,
      };
      refresh_export_ship_preview();
    }
  });

  async function reload_orders_for_modals(btnEl) {
    const origHtml = btnEl ? btnEl.textContent : "";
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = "⏳ Đang tải...";
    }
    try {
      await tai_va_cap_nhat_theo_ngay(false, false, true);
      if (current_od_mode === "all_table" && typeof lay_tat_ca_don_hang_tu_bang_a_den_p === "function") {
        current_od_raw_list = lay_tat_ca_don_hang_tu_bang_a_den_p(false);
        const dateRangeText = document.getElementById("odDateRangeText");
        if (dateRangeText) {
          dateRangeText.textContent = `Tổng cộng ${current_od_raw_list.length} đơn hàng trong bảng`;
        }
      }
      const odModal = document.getElementById("orderDetailModal");
      if (odModal && !odModal.classList.contains("hidden") && typeof apply_od_filters_and_render === "function") {
        apply_od_filters_and_render(false);
      }
      const expModal = document.getElementById("exportShipModal");
      if (expModal && !expModal.classList.contains("hidden")) {
        render_exp_ship_tag_chips();
        refresh_export_ship_preview();
        setStatus("Đã tải lại dữ liệu đơn hàng mới nhất.", "done");
      }
    } catch (err) {
      setStatus(`Lỗi tải lại dữ liệu: ${(err && err.message) || err}`, "error");
    } finally {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = origHtml || "↻ Tải lại";
      }
    }
  }

  document.getElementById("btnOdReloadData")?.addEventListener("click", (e) => {
    e.stopPropagation();
    reload_orders_for_modals(e.currentTarget);
  });

  document.getElementById("btnExpShipReloadData")?.addEventListener("click", (e) => {
    e.stopPropagation();
    reload_orders_for_modals(e.currentTarget);
  });

  async function save_blob_silently_to_downloads(blob, fileName) {
    try {
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      const b64 = btoa(bin);
      const resp = await fetch("/api/save-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: fileName, base64: b64 }),
      });
      if (resp.ok) {
        const data = await resp.json().catch(() => null);
        if (data && data.ok) return true;
      }
    } catch (e) {}
    return false;
  }

  async function push_vtp_token_to_cloud(tokenStr) {
    try {
      const apiKey = typeof get_apps_script_api_key === "function" ? get_apps_script_api_key() : "";
      if (!apiKey) return false;
      const url = build_apps_script_url("mode=set_vtp_token");
      if (!url) return false;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ mode: "set_vtp_token", key: apiKey, token: String(tokenStr || "").trim() }),
      });
      if (resp.ok) {
        const d = await resp.json().catch(() => null);
        return Boolean(d && d.ok);
      }
    } catch (e) {}
    return false;
  }

  async function sync_vtp_token_with_cloud() {
    let localHas = false;
    let localToken = "";
    try {
      const rLoc = await fetch("/api/vtp-token?sync=1");
      if (rLoc.ok) {
        const dLoc = await rLoc.json();
        localHas = Boolean(dLoc && dLoc.hasToken);
        localToken = String((dLoc && dLoc.token) || "").trim();
      }
    } catch (e) {}

    let cloudToken = "";
    try {
      const url = build_apps_script_url("mode=get_vtp_token");
      if (url) {
        const rCloud = await fetch(url);
        if (rCloud.ok) {
          const dCloud = await rCloud.json().catch(() => null);
          if (dCloud && dCloud.ok && dCloud.token) {
            cloudToken = String(dCloud.token).trim();
          }
        }
      }
    } catch (e) {}

    // Máy nhân viên chưa có Token (hoặc Token trên Cloud mới hơn) -> tự tải từ Apps Script về lưu máy
    if (cloudToken && (!localHas || (localToken && localToken !== cloudToken))) {
      try {
        const sr = await fetch("/api/vtp-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: cloudToken }),
        });
        if (sr.ok) return true;
      } catch (e) {}
    }

    // Máy chính đã có Token sẵn nhưng Cloud chưa có -> tự đẩy lên Apps Script để các máy khác cùng dùng
    if (localHas && localToken && !cloudToken) {
      await push_vtp_token_to_cloud(localToken);
    }
    return localHas || Boolean(cloudToken);
  }
  window.sync_vtp_token_with_cloud = sync_vtp_token_with_cloud;

  document.getElementById("btnEditVtpToken")?.addEventListener("click", async () => {
    try {
      const r0 = await fetch("/api/vtp-token");
      const info = r0.ok ? await r0.json() : {};
      const curMsg = info && info.hasToken ? `Token hiện tại: ${info.masked}\n` : "Chưa có Token Viettel Post.\n";
      const val = window.prompt(curMsg + "Dán Token lấy từ mục Quản lý token trên viettelpost.vn:", "");
      if (val === null) return;
      const clean = String(val).trim();
      const resp = await fetch("/api/vtp-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: clean }),
      });
      if (resp.ok) {
        const cloudOk = await push_vtp_token_to_cloud(clean);
        setStatus(
          clean
            ? cloudOk
              ? "Đã lưu Token Viettel Post vào máy và đồng bộ cho các máy nhân viên."
              : "Đã lưu Token Viettel Post vào máy thành công."
            : "Đã xóa Token Viettel Post.",
          "done"
        );
      } else {
        setStatus("Không lưu được Token (hãy chạy từ APPLAM.exe).", "error");
      }
    } catch (e) {
      setStatus("Chức năng lưu Token chỉ chạy trong APPLAM.exe.", "error");
    }
  });

  document.getElementById("btnDoPushVtpApi")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnDoPushVtpApi");
    refresh_export_ship_preview();
    const prep = _exp_ship_last_prepared;
    if (!prep || prep.rows.length === 0) {
      setStatus("Không có đơn nào để đẩy sang Viettel Post.", "error");
      return;
    }
    if (prep.warnings && prep.warnings.length > 0) {
      setStatus(`Còn ${prep.warnings.length} đơn cần kiểm tra — hãy xử lý hết lỗi trước khi đẩy đơn.`, "error");
      return;
    }

    const vtpXmg = Boolean(document.getElementById("expShipVtpXmg")?.checked ?? true);
    const xmgMoney = Math.max(0, Math.round(Number(document.getElementById("expShipVtpXmgMoney")?.value || 30000) || 0));
    const senderPhone = String(document.getElementById("expShipSenderPhone")?.value || "").replace(/\D/g, "");

    // Kiểm tra Token VTP (ưu tiên đồng bộ tự động từ Google Apps Script cho máy nhân viên)
    let hasToken = await sync_vtp_token_with_cloud();

    if (!hasToken) {
      const pasted = window.prompt("Chưa có Token Viettel Post. Dán Token từ Quản lý token trên viettelpost.vn:", "");
      if (!pasted || !pasted.trim()) return;
      const cleanTk = pasted.trim();
      const sr = await fetch("/api/vtp-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cleanTk }),
      });
      if (!sr.ok) {
        setStatus("Không lưu được Token Viettel Post.", "error");
        return;
      }
      await push_vtp_token_to_cloud(cleanTk);
    }

    const origText = btn ? btn.textContent : "";
    if (btn) btn.disabled = true;
    try {
      if (btn) btn.textContent = "⏳ Đang lấy kho gửi...";
      const invResp = await fetch("/api/vtp-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "/v2/user/listInventory", method: "GET" }),
      });
      const invData = await invResp.json();
      const invList = Array.isArray(invData && invData.data) ? invData.data : [];
      if (invList.length === 0) {
        setStatus(`Không lấy được kho gửi VTP: ${(invData && invData.message) || "Kiểm tra lại Token VTP"}`, "error");
        return;
      }
      // Ưu tiên đúng kho UPYO + SĐT người gửi + 179 Giẽ Thượng
      const inv =
        invList.find((x) => String(x.phone || "").replace(/\D/g, "") === senderPhone && /UPYO/i.test(String(x.name || "")) && /179/.test(String(x.address || ""))) ||
        invList.find((x) => String(x.phone || "").replace(/\D/g, "") === senderPhone && /179/.test(String(x.address || ""))) ||
        invList.find((x) => String(x.phone || "").replace(/\D/g, "") === senderPhone) ||
        invList[0];

      const pad2 = (n) => String(n).padStart(2, "0");
      const now = new Date();
      const delivDate = `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

      const okList = [];
      const createdMvdItems = [];
      const failList = [];
      for (let i = 0; i < prep.rows.length; i++) {
        const r = prep.rows[i];
        if (btn) btn.textContent = `⏳ Đang đẩy ${i + 1}/${prep.rows.length}...`;
        if (!r.vtpProvId || !r.vtpDistId || !r.vtpWardId) {
          failList.push(`${r.name}: Thiếu Tỉnh/Huyện/Xã (bấm AI sửa địa chỉ chuẩn trước)`);
          continue;
        }
        const svcCode = String(r.vtpService || "VSL7").split(" - ")[0].trim().toUpperCase();
        const useXmg = Boolean(vtpXmg && r.cod > 0);
        const payload = {
          ORDER_NUMBER: r.orderCode,
          GROUPADDRESS_ID: Number(inv.groupaddressId),
          CUS_ID: Number(inv.cusId),
          DELIVERY_DATE: delivDate,
          SENDER_FULLNAME: String(inv.name || "UPYO").trim(),
          SENDER_ADDRESS: String(inv.address || ""),
          SENDER_PHONE: String(inv.phone || senderPhone),
          SENDER_WARD: Number(inv.wardsId),
          SENDER_DISTRICT: Number(inv.districtId),
          SENDER_PROVINCE: Number(inv.provinceId),
          RECEIVER_FULLNAME: r.name,
          RECEIVER_ADDRESS: r.addr,
          RECEIVER_PHONE: r.phone,
          RECEIVER_WARD: Number(r.vtpWardId),
          RECEIVER_DISTRICT: Number(r.vtpDistId),
          RECEIVER_PROVINCE: Number(r.vtpProvId),
          PRODUCT_NAME: String(r.itemName || "").slice(0, 240),
          PRODUCT_DESCRIPTION: String(r.itemName || "").slice(0, 240),
          PRODUCT_QUANTITY: Number(r.qty) || 1,
          PRODUCT_PRICE: Number(r.value) || 0,
          PRODUCT_WEIGHT: Number(r.weightGram) || 1000,
          PRODUCT_LENGTH: 1,
          PRODUCT_WIDTH: 1,
          PRODUCT_HEIGHT: 1,
          PRODUCT_TYPE: "HH",
          ORDER_PAYMENT: r.cod > 0 ? 3 : 1,
          ORDER_SERVICE: svcCode,
          ORDER_SERVICE_ADD: useXmg ? "XMG" : "",
          XMG_EXTRA_MONEY: useXmg ? xmgMoney : 0,
          EXTRA_MONEY: useXmg ? xmgMoney : 0,
          ORDER_VOUCHER: "",
          ORDER_NOTE: r.note || "",
          MONEY_COLLECTION: Number(r.cod) || 0,
          CHECK_UNIQUE: false,
          LIST_ITEM:
            Array.isArray(r.listItems) && r.listItems.length > 0
              ? r.listItems
              : [
                  {
                    PRODUCT_NAME: r.itemName,
                    PRODUCT_PRICE: Number(r.value) || 0,
                    PRODUCT_WEIGHT: Number(r.weightGram) || 1000,
                    PRODUCT_QUANTITY: Number(r.qty) || 1,
                  },
                ],
        };
        const cr = await fetch("/api/vtp-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: "/v2/order/createOrder", method: "POST", payload }),
        });
        const cd = await cr.json();
        if (cd && !cd.error && cd.data && cd.data.ORDER_NUMBER) {
          const mvdStr = String(cd.data.ORDER_NUMBER).trim();
          const shipFeeVal = Math.round(Number(cd.data.MONEY_TOTAL) || 0);
          okList.push(`${r.name}: ${mvdStr} (cước ${format_tien_vnd(shipFeeVal)})`);
          let ymdDate = "";
          const dm = String(r.orderDateYmd || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (dm) ymdDate = `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
          else if (/^\d{4}-\d{2}-\d{2}/.test(String(r.orderDateYmd || ""))) ymdDate = String(r.orderDateYmd).slice(0, 10);
          createdMvdItems.push({
            mvd: mvdStr,
            sdt: r.phone,
            name: r.name,
            orderDate: ymdDate,
            shipFee: shipFeeVal,
          });
        } else {
          failList.push(`${r.name}: ${(cd && cd.message) || "Lỗi không xác định"}`);
        }
      }

      // Tự động ghi Mã vận đơn + Phí Ship lên Google Sheet (giữ nguyên tag)
      let sheetSyncMsg = "";
      if (createdMvdItems.length > 0) {
        const apiKey = typeof get_apps_script_api_key === "function" ? get_apps_script_api_key() : "";
        if (apiKey) {
          try {
            if (btn) btn.textContent = "⏳ Đang ghi MVĐ lên Sheet...";
            const gsUrl = build_apps_script_url("mode=update_mvd");
            const gsResp = await fetch(gsUrl, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({
                mode: "update_mvd",
                key: apiKey,
                autoMarkSent: false,
                items: createdMvdItems,
              }),
              redirect: "follow",
            });
            const gsJson = gsResp.ok ? await gsResp.json().catch(() => null) : null;
            if (gsJson && gsJson.ok) {
              sheetSyncMsg = ` • Đã tự ghi ${gsJson.updated}/${createdMvdItems.length} MVĐ + Phí Ship lên Sheet`;
              await tai_va_cap_nhat_theo_ngay(false, false, true).catch(() => {});
              if (current_od_mode === "all_table" && typeof lay_tat_ca_don_hang_tu_bang_a_den_p === "function") {
                current_od_raw_list = lay_tat_ca_don_hang_tu_bang_a_den_p(false);
                if (typeof apply_od_filters_and_render === "function") apply_od_filters_and_render(false);
              }
              refresh_export_ship_preview();
            } else {
              sheetSyncMsg = ` • Chưa ghi được MVĐ lên Sheet (${(gsJson && gsJson.error) || "HTTP " + gsResp.status})`;
            }
          } catch (gsErr) {
            sheetSyncMsg = ` • Lỗi ghi MVĐ lên Sheet: ${(gsErr && gsErr.message) || gsErr}`;
          }
        }
      }

      if (okList.length > 0 && failList.length === 0) {
        const shortSuffix = okList.length <= 2 ? ` (${okList.join(" • ")})` : "";
        setStatus(`✅ Đẩy thành công ${okList.length}/${prep.rows.length} đơn VTP${sheetSyncMsg}${shortSuffix}`, "done");
      } else if (okList.length > 0) {
        const previewFail =
          failList.length <= 2
            ? failList.join(" | ")
            : `${failList.slice(0, 2).join(" | ")} … (+${failList.length - 2} lỗi khác)`;
        setStatus(`⚠️ Thành công ${okList.length}, lỗi ${failList.length}${sheetSyncMsg}: ${previewFail}`, "error");
      } else {
        const previewFail =
          failList.length <= 2
            ? failList.join(" | ")
            : `${failList.slice(0, 2).join(" | ")} … (+${failList.length - 2} lỗi khác)`;
        setStatus(`❌ Không đẩy được đơn nào: ${previewFail}`, "error");
      }
    } catch (err) {
      setStatus(`Lỗi đẩy đơn VTP: ${(err && err.message) || err}`, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = origText || "🚀 Đẩy thẳng VTP";
      }
    }
  });

  document.getElementById("btnDoExportShipXlsx")?.addEventListener("click", async () => {
    refresh_export_ship_preview();
    const prep = _exp_ship_last_prepared;
    if (!prep || prep.rows.length === 0) {
      setStatus("Không có đơn nào phù hợp để xuất Excel.", "error");
      return;
    }
    try {
      const blob = build_ship_xlsx_blob(_exp_ship_carrier, prep.rows);
      const tag = _exp_ship_carrier === "jt" ? "JT" : "ViettelPost";
      const now = new Date();
      const dStr = format_ymd_date(now);
      const tStr =
        String(now.getHours()).padStart(2, "0") +
        String(now.getMinutes()).padStart(2, "0") +
        String(now.getSeconds()).padStart(2, "0");
      const fileName = `LenDon_${tag}_${dStr}_${tStr}_${prep.rows.length}don.xlsx`;
      const savedSilent = await save_blob_silently_to_downloads(blob, fileName);
      if (!savedSilent) {
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = dlUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(dlUrl), 10000);
      }
      setStatus(`Đã lưu vào Downloads: ${fileName} (${prep.rows.length} đơn).`, "done");
    } catch (err) {
      setStatus(`Lỗi xuất file Excel: ${(err && err.message) || err}`, "error");
    }
  });

  document.getElementById("btnDoExportShipCopy")?.addEventListener("click", async () => {
    refresh_export_ship_preview();
    const prep = _exp_ship_last_prepared;
    if (!prep || prep.rows.length === 0) {
      setStatus("Không có đơn nào phù hợp để copy.", "error");
      return;
    }
    try {
      const tsv = build_ship_tsv(_exp_ship_carrier, prep.rows);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(tsv);
      } else {
        const ta = document.createElement("textarea");
        ta.value = tsv;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setStatus(`Đã copy ${prep.rows.length} đơn! Vào file Excel mẫu rồi nhấn Ctrl+V.`, "done");
    } catch (err) {
      setStatus(`Lỗi copy dữ liệu: ${(err && err.message) || err}`, "error");
    }
  });
}

// ==============================================================
// NHẬP MÃ VẬN ĐƠN TỪ EXCEL (VIETTEL POST / J&T) -> GOOGLE SHEET (v8.6.320)
// ==============================================================
let _imp_mvd_parsed_items = [];
let _imp_mvd_match_result = null;
let _imp_mvd_is_busy = false;

function col_letter_to_idx0(letters) {
  let col = 0;
  const s = String(letters || "").toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 65 && c <= 90) {
      col = col * 26 + (c - 64);
    }
  }
  return Math.max(0, col - 1);
}

function parse_delimited_grid_text(text) {
  const raw = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!raw) return [];

  // Hỗ trợ file .xls xuất dạng HTML <table>
  if (/<\s*(table|tr|html)\b/i.test(raw)) {
    try {
      const doc = new DOMParser().parseFromString(raw, "text/html");
      const trs = Array.from(doc.querySelectorAll("tr"));
      if (trs.length > 0) {
        return trs.map((tr) =>
          Array.from(tr.querySelectorAll("th, td")).map((td) => String(td.textContent || "").trim())
        );
      }
    } catch (e) {}
  }

  const firstLine = raw.split(/\r?\n/)[0] || "";
  const tabs = (firstLine.match(/\t/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const delim = tabs > 0 ? "\t" : semis > commas ? ";" : ",";

  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = raw[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(cur.trim());
      cur = "";
    } else if (ch === "\r" && next === "\n") {
      row.push(cur.trim());
      rows.push(row);
      row = [];
      cur = "";
      i++;
    } else if (ch === "\n" || ch === "\r") {
      row.push(cur.trim());
      rows.push(row);
      row = [];
      cur = "";
    } else {
      cur += ch;
    }
  }
  row.push(cur.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

async function read_xlsx_zip_entries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  // Tìm End of Central Directory (0x06054b50) từ cuối buffer
  let eocdOffset = -1;
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("File .xlsx không đúng định dạng ZIP chuẩn.");
  }

  const cdCount = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder("utf-8");
  const entryMap = new Map();

  let ptr = cdOffset;
  for (let i = 0; i < cdCount && ptr + 46 <= bytes.length; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const entryName = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    entryMap.set(entryName, { method, compSize, localOffset });
    ptr += 46 + nameLen + extraLen + commentLen;
  }

  const readEntryText = async (targetPath) => {
    const info = entryMap.get(targetPath);
    if (!info) return null;
    const lo = info.localOffset;
    if (view.getUint32(lo, true) !== 0x04034b50) return null;
    const fnLen = view.getUint16(lo + 26, true);
    const exLen = view.getUint16(lo + 28, true);
    const dataStart = lo + 30 + fnLen + exLen;
    const compBytes = bytes.subarray(dataStart, dataStart + info.compSize);

    if (info.method === 0) {
      return decoder.decode(compBytes);
    }
    if (info.method === 8) {
      if (typeof DecompressionStream === "undefined") {
        throw new Error("Trình duyệt chưa hỗ trợ giải nén file .xlsx, vui lòng copy-dán trực tiếp từ Excel.");
      }
      const ds = new DecompressionStream("deflate-raw");
      const stream = new Blob([compBytes]).stream().pipeThrough(ds);
      return await new Response(stream).text();
    }
    throw new Error(`Phương thức nén ZIP (${info.method}) không được hỗ trợ.`);
  };

  return { entryMap, readEntryText };
}

async function parse_xlsx_file_to_grid(file) {
  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf);
  const isZip = u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b;
  if (!isZip) {
    const txt = new TextDecoder("utf-8").decode(u8);
    return parse_delimited_grid_text(txt);
  }

  const { entryMap, readEntryText } = await read_xlsx_zip_entries(buf);

  // Đọc sharedStrings nếu có
  const sharedStrings = [];
  const ssXml = await readEntryText("xl/sharedStrings.xml");
  if (ssXml) {
    const docSs = new DOMParser().parseFromString(ssXml, "application/xml");
    const siNodes = docSs.getElementsByTagName("si");
    for (let i = 0; i < siNodes.length; i++) {
      const tNodes = siNodes[i].getElementsByTagName("t");
      let val = "";
      for (let j = 0; j < tNodes.length; j++) {
        val += tNodes[j].textContent || "";
      }
      sharedStrings.push(val);
    }
  }

  // Tìm worksheet đầu tiên
  let sheetPath = "xl/worksheets/sheet1.xml";
  if (!entryMap.has(sheetPath)) {
    for (const k of entryMap.keys()) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(k)) {
        sheetPath = k;
        break;
      }
    }
  }
  const sheetXml = await readEntryText(sheetPath);
  if (!sheetXml) {
    throw new Error("Không tìm thấy dữ liệu bảng tính trong file .xlsx.");
  }

  const docSh = new DOMParser().parseFromString(sheetXml, "application/xml");
  const rowNodes = docSh.getElementsByTagName("row");
  const grid = [];

  for (let i = 0; i < rowNodes.length; i++) {
    const cNodes = rowNodes[i].getElementsByTagName("c");
    const rowArr = [];
    for (let j = 0; j < cNodes.length; j++) {
      const c = cNodes[j];
      const ref = c.getAttribute("r") || "";
      const mCol = ref.match(/^([A-Z]+)/i);
      const colIdx = mCol ? col_letter_to_idx0(mCol[1]) : rowArr.length;
      const tAttr = c.getAttribute("t") || "";

      let val = "";
      if (tAttr === "inlineStr") {
        const tEls = c.getElementsByTagName("t");
        for (let k = 0; k < tEls.length; k++) val += tEls[k].textContent || "";
      } else {
        const vEl = c.getElementsByTagName("v")[0];
        const rawV = vEl ? String(vEl.textContent || "") : "";
        if (tAttr === "s") {
          const idx = parseInt(rawV, 10);
          val = !Number.isNaN(idx) && idx >= 0 && idx < sharedStrings.length ? sharedStrings[idx] : rawV;
        } else {
          val = rawV;
        }
      }
      while (rowArr.length <= colIdx) rowArr.push("");
      rowArr[colIdx] = String(val || "").trim();
    }
    if (rowArr.some((x) => x !== "")) {
      grid.push(rowArr);
    }
  }
  return grid;
}

function extract_mvd_records_from_grid(grid) {
  if (!Array.isArray(grid) || grid.length === 0) {
    return { items: [], error: "Không đọc được dòng dữ liệu nào." };
  }

  const normHdr = (s) => bo_dau_tieng_viet(String(s || "").trim()).toLowerCase().replace(/\s+/g, " ");
  const isMvdHeader = (h) =>
    (h.includes("ma van don") ||
      h.includes("so van don") ||
      h.includes("van don") ||
      h.includes("ma buu gui") ||
      h.includes("waybill") ||
      h.includes("billcode") ||
      h === "mvd" ||
      h.includes("tracking")) &&
    !h.includes("ma don hang");
  const isPhoneHeader = (h) =>
    (h.includes("dien thoai") || h.includes("sdt") || h.includes("so dt") || h.includes("phone") || h.includes("tel")) &&
    !h.includes("nguoi gui") &&
    !h.includes("kho gui");
  const isNameHeader = (h) =>
    (h.includes("nguoi nhan") || h.includes("ho ten") || h.includes("ten khach") || h.includes("customer")) &&
    !h.includes("sdt") &&
    !h.includes("dien thoai") &&
    !h.includes("dia chi");
  const isOrderCodeHeader = (h) => h.includes("ma don hang") || h.includes("order code") || h.includes("ma rieng");

  let headerIdx = -1;
  let colMvd = -1;
  let colPhone = -1;
  let colName = -1;
  let colOrderCode = -1;

  const maxScan = Math.min(20, grid.length);
  for (let r = 0; r < maxScan; r++) {
    const row = grid[r] || [];
    let fMvd = -1;
    let fPhone = -1;
    let fName = -1;
    let fOrderCode = -1;
    for (let c = 0; c < row.length; c++) {
      const h = normHdr(row[c]);
      if (!h) continue;
      if (fMvd === -1 && isMvdHeader(h)) fMvd = c;
      if (fPhone === -1 && isPhoneHeader(h)) fPhone = c;
      if (fName === -1 && isNameHeader(h)) fName = c;
      if (fOrderCode === -1 && isOrderCodeHeader(h)) fOrderCode = c;
    }
    if (fMvd !== -1 && fPhone !== -1) {
      headerIdx = r;
      colMvd = fMvd;
      colPhone = fPhone;
      colName = fName;
      colOrderCode = fOrderCode;
      break;
    }
  }

  if (headerIdx === -1 || colMvd === -1 || colPhone === -1) {
    return {
      items: [],
      error: "Không tìm thấy cột 'Mã vận đơn' và 'Số điện thoại người nhận' trong file. Vui lòng kiểm tra lại đúng file xuất từ Quản lý vận đơn Viettel Post / J&T.",
    };
  }

  const items = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const mvd = String(row[colMvd] || "").trim();
    const rawPhone = String(row[colPhone] || "").trim();
    const { phone } = normalize_vn_phone_for_ship(rawPhone);
    if (!mvd || mvd === "-" || mvd === "—") continue;
    const digits = (phone || rawPhone).replace(/\D/g, "");
    if (digits.length < 9) continue;
    const sdt9 = digits.slice(-9);
    const name = colName !== -1 ? String(row[colName] || "").trim() : "";
    const orderCode = colOrderCode !== -1 ? String(row[colOrderCode] || "").trim() : "";
    let orderDate = "";
    const mDate = orderCode.match(/^UPYO(\d{4})(\d{2})(\d{2})/i);
    if (mDate) orderDate = `${mDate[1]}-${mDate[2]}-${mDate[3]}`;

    items.push({
      mvd,
      sdt: phone || rawPhone,
      sdt9,
      name,
      orderDate,
    });
  }

  return { items, error: items.length === 0 ? "File không có dòng nào đủ Mã vận đơn + SĐT hợp lệ." : "" };
}

function match_import_mvd_with_orders(parsedItems) {
  const allOrders = lay_tat_ca_don_hang_tu_bang_a_den_p(false);
  const byPhone = new Map();
  for (const o of allOrders) {
    const mvdCur = String(o.ma_van_don || "").trim();
    if (mvdCur && mvdCur !== "-" && mvdCur !== "—") continue; // Bỏ qua đơn đã có MVĐ
    const digits = String(o.sdt || "").replace(/\D/g, "");
    if (digits.length < 9) continue;
    const sdt9 = digits.slice(-9);
    if (!byPhone.has(sdt9)) byPhone.set(sdt9, []);
    byPhone.get(sdt9).push({
      order: o,
      ymd: tach_ngay_ymd_tu_chuoi(o.thoi_gian || o.ngay_only || ""),
      hoTenLower: bo_dau_tieng_viet(String(o.ho_ten || "").trim()).toLowerCase(),
      used: false,
    });
  }

  const matched = [];
  const unmatched = [];
  for (const it of parsedItems) {
    const list = byPhone.get(it.sdt9) || [];
    const reqName = bo_dau_tieng_viet(it.name || "").toLowerCase();
    let picked = null;
    for (let pass = 0; pass < 3 && !picked; pass++) {
      for (let i = list.length - 1; i >= 0; i--) {
        const cand = list[i];
        if (cand.used) continue;
        if (pass === 0 && (!it.orderDate || cand.ymd !== it.orderDate || !reqName || !cand.hoTenLower.includes(reqName))) continue;
        if (pass === 1 && (!it.orderDate || cand.ymd !== it.orderDate)) continue;
        picked = cand;
        break;
      }
    }
    if (picked) {
      picked.used = true;
      matched.push({
        mvd: it.mvd,
        sdt: it.sdt,
        name: picked.order.ho_ten || it.name || "—",
        orderDate: picked.ymd || it.orderDate || "",
        oldStatus: picked.order.trang_thai || "",
        sp: picked.order.dong_sp || "",
      });
    } else {
      unmatched.push({
        mvd: it.mvd,
        sdt: it.sdt,
        name: it.name || "—",
        reason: list.length > 0 ? "Các đơn SĐT này đã có MVĐ" : "Không thấy đơn chưa có MVĐ",
      });
    }
  }

  return { matched, unmatched, totalParsed: parsedItems.length };
}

function render_import_mvd_preview() {
  const sumEl = document.getElementById("impMvdSummaryRow");
  const badgeEl = document.getElementById("impMvdReadyBadge");
  const listEl = document.getElementById("impMvdPreviewList");
  const btnCommit = document.getElementById("btnDoCommitImportMvd");

  const res = _imp_mvd_match_result;
  if (!res) {
    if (badgeEl) badgeEl.textContent = "0 đơn khớp";
    if (btnCommit) btnCommit.disabled = true;
    if (sumEl) sumEl.innerHTML = "";
    if (listEl) {
      listEl.innerHTML = `<div class="imp-mvd-empty">Chọn file Excel hoặc dán dữ liệu ở bên trái để đối chiếu đơn chưa có MVĐ.</div>`;
    }
    return;
  }

  if (badgeEl) badgeEl.textContent = `${res.matched.length} đơn khớp`;
  if (btnCommit) btnCommit.disabled = _imp_mvd_is_busy || res.matched.length === 0;

  if (sumEl) {
    sumEl.innerHTML =
      `<div class="export-cp-kpi-card">` +
      `<span class="export-cp-kpi-label">Đọc từ file</span>` +
      `<span class="export-cp-kpi-val">${res.totalParsed} dòng</span>` +
      `<span class="export-cp-kpi-sub">Có MVĐ &amp; SĐT</span>` +
      `</div>` +
      `<div class="export-cp-kpi-card">` +
      `<span class="export-cp-kpi-label">Khớp điền Sheet</span>` +
      `<span class="export-cp-kpi-val is-orders">${res.matched.length} đơn</span>` +
      `<span class="export-cp-kpi-sub">Sẵn sàng cập nhật</span>` +
      `</div>` +
      `<div class="export-cp-kpi-card">` +
      `<span class="export-cp-kpi-label">Bỏ qua / Đã có</span>` +
      `<span class="export-cp-kpi-val ${res.unmatched.length > 0 ? "is-spend" : ""}">${res.unmatched.length} đơn</span>` +
      `<span class="export-cp-kpi-sub">Không ghi đè</span>` +
      `</div>`;
  }

  if (listEl) {
    const rowsHtml = [];
    for (const m of res.matched.slice(0, 40)) {
      rowsHtml.push(
        `<div class="imp-mvd-row">` +
          `<div class="imp-mvd-row-main"><span><strong>${escape_html(m.name)}</strong> (${escape_html(m.sdt)})</span><span>${escape_html(m.sp)}${m.orderDate ? " • " + escape_html(m.orderDate) : ""}</span></div>` +
          `<span class="imp-mvd-row-code">${escape_html(m.mvd)}</span>` +
        `</div>`
      );
    }
    for (const u of res.unmatched.slice(0, 20)) {
      rowsHtml.push(
        `<div class="imp-mvd-row is-unmatched">` +
          `<div class="imp-mvd-row-main"><span><strong>${escape_html(u.name)}</strong> (${escape_html(u.sdt)})</span><span>MVĐ: ${escape_html(u.mvd)}</span></div>` +
          `<span class="imp-mvd-row-code">${escape_html(u.reason)}</span>` +
        `</div>`
      );
    }
    if (rowsHtml.length === 0) {
      listEl.innerHTML = `<div class="imp-mvd-empty">Không có dòng nào hợp lệ để đối chiếu.</div>`;
    } else {
      listEl.innerHTML = rowsHtml.join("");
    }
  }
}

function open_import_mvd_modal() {
  const modal = document.getElementById("importMvdModal");
  if (!modal) return;
  _imp_mvd_parsed_items = [];
  _imp_mvd_match_result = null;
  _imp_mvd_is_busy = false;
  const fIn = document.getElementById("impMvdFileInput");
  if (fIn) fIn.value = "";
  const pasteEl = document.getElementById("impMvdPasteInput");
  if (pasteEl) pasteEl.value = "";
  document.getElementById("btnClearImpMvdPaste")?.classList.add("hidden");
  document.getElementById("btnPickImpMvdFile")?.classList.remove("has-file");
  const nameEl = document.getElementById("impMvdFileNameText");
  if (nameEl) nameEl.textContent = "Bấm chọn file .xlsx / .csv tải từ Viettel Post";
  const srcBadge = document.getElementById("impMvdSourceBadge");
  if (srcBadge) srcBadge.textContent = "CHƯA CHỌN FILE";
  document.getElementById("impMvdStatusBox")?.classList.add("hidden");
  render_import_mvd_preview();
  modal.classList.remove("hidden");
}

function close_import_mvd_modal() {
  document.getElementById("importMvdModal")?.classList.add("hidden");
}

function init_import_mvd_modal() {
  const modal = document.getElementById("importMvdModal");
  if (!modal) return;

  const setStatus = (text, state = "done") => {
    const box = document.getElementById("impMvdStatusBox");
    const txt = document.getElementById("impMvdStatusText");
    if (box) {
      box.classList.remove("hidden", "is-done", "is-error");
      if (state === "done") box.classList.add("is-done");
      else if (state === "error") box.classList.add("is-error");
    }
    if (txt) txt.textContent = text;
  };

  const processGrid = (grid, sourceLabel) => {
    const extracted = extract_mvd_records_from_grid(grid);
    const srcBadge = document.getElementById("impMvdSourceBadge");
    if (srcBadge) srcBadge.textContent = sourceLabel;
    if (extracted.error) {
      _imp_mvd_parsed_items = [];
      _imp_mvd_match_result = null;
      render_import_mvd_preview();
      setStatus(extracted.error, "error");
      return;
    }
    _imp_mvd_parsed_items = extracted.items;
    _imp_mvd_match_result = match_import_mvd_with_orders(extracted.items);
    document.getElementById("impMvdStatusBox")?.classList.add("hidden");
    render_import_mvd_preview();
  };

  document.getElementById("btnOdImportMvd")?.addEventListener("click", (e) => {
    e.stopPropagation();
    open_import_mvd_modal();
  });

  document.getElementById("btnCloseImportMvd")?.addEventListener("click", close_import_mvd_modal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close_import_mvd_modal();
  });
  document.getElementById("importMvdCard")?.addEventListener("click", (e) => e.stopPropagation());

  document.getElementById("btnPickImpMvdFile")?.addEventListener("click", () => {
    document.getElementById("impMvdFileInput")?.click();
  });

  document.getElementById("impMvdFileInput")?.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    document.getElementById("btnPickImpMvdFile")?.classList.add("has-file");
    const nameEl = document.getElementById("impMvdFileNameText");
    if (nameEl) nameEl.textContent = file.name;
    try {
      const grid = await parse_xlsx_file_to_grid(file);
      processGrid(grid, file.name);
    } catch (err) {
      setStatus(`Không đọc được file: ${(err && err.message) || err}`, "error");
    }
  });

  document.getElementById("impMvdPasteInput")?.addEventListener("input", (e) => {
    const val = String(e.target.value || "").trim();
    document.getElementById("btnClearImpMvdPaste")?.classList.toggle("hidden", !val);
    if (!val) {
      _imp_mvd_parsed_items = [];
      _imp_mvd_match_result = null;
      render_import_mvd_preview();
      return;
    }
    const grid = parse_delimited_grid_text(val);
    processGrid(grid, "DỮ LIỆU DÁN EXCEL");
  });

  document.getElementById("btnClearImpMvdPaste")?.addEventListener("click", () => {
    const pasteEl = document.getElementById("impMvdPasteInput");
    if (pasteEl) pasteEl.value = "";
    document.getElementById("btnClearImpMvdPaste")?.classList.add("hidden");
    _imp_mvd_parsed_items = [];
    _imp_mvd_match_result = null;
    render_import_mvd_preview();
  });

  document.getElementById("btnDoCommitImportMvd")?.addEventListener("click", async () => {
    if (_imp_mvd_is_busy || !_imp_mvd_match_result || _imp_mvd_match_result.matched.length === 0) return;
    const key = get_apps_script_api_key();
    if (!key) {
      setStatus("Chưa có khóa xác thực, vui lòng đăng nhập lại.", "error");
      return;
    }

    _imp_mvd_is_busy = true;
    render_import_mvd_preview();
    setStatus(`⏳ Đang ghi ${_imp_mvd_match_result.matched.length} mã vận đơn lên Google Sheet...`, "done");

    try {
      const autoMarkSent = Boolean(document.getElementById("impMvdAutoMarkSent")?.checked);
      const url = build_apps_script_url("mode=update_mvd");
      const payload = {
        mode: "update_mvd",
        key,
        autoMarkSent,
        items: _imp_mvd_match_result.matched.map((m) => ({
          mvd: m.mvd,
          sdt: m.sdt,
          name: m.name,
          orderDate: m.orderDate,
        })),
      };

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        redirect: "follow",
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const resJson = await resp.json();
      if (!resJson || !resJson.ok) {
        throw new Error((resJson && resJson.error) || "Apps Script chưa hỗ trợ ghi MVĐ (cần cập nhật file .gs mới).");
      }

      setStatus(`✅ Đã ghi xong ${resJson.updated} mã vận đơn vào Google Sheet! Đang làm mới bảng...`, "done");
      await tai_du_lieu_google_sheets(true, "", "", true, true).catch(() => false);
      if (typeof ap_dung_bo_loc_chi_tiet_don === "function" && current_od_mode === "all_table") {
        ap_dung_bo_loc_chi_tiet_don();
      }
      _imp_mvd_match_result = match_import_mvd_with_orders(_imp_mvd_parsed_items);
      setStatus(`✅ Hoàn tất! Đã cập nhật ${resJson.updated} mã vận đơn trực tiếp vào Google Sheet.`, "done");
    } catch (err) {
      setStatus(`Lỗi cập nhật MVĐ: ${(err && err.message) || err}`, "error");
    } finally {
      _imp_mvd_is_busy = false;
      render_import_mvd_preview();
    }
  });
}


// ==============================================================
// MODAL UPDATE TRẠNG THÁI ĐƠN VIETTEL POST -> CỘT N GOOGLE SHEET (v8.6.365)
// ==============================================================
let _vtp_sync_busy = false;
let _vtp_sync_days = 35;
let _vtp_sync_filter = "all";
let _vtp_sync_state = {
  totalChecked: 0,
  changedItems: [],
  counts: {},
  scanned: false,
};

function map_vtp_status_to_sheet_tag(vtpRec, sheetTotalQty) {
  if (!vtpRec) return "";
  const st = Number(vtpRec.orderStatus);
  if (Number.isNaN(st)) return "";

  const svcAdd = String(vtpRec.serviceAdd || "").toUpperCase();
  const noteNorm = bo_dau_tieng_viet(String(vtpRec.note || ""))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const vtpQty = Math.max(0, Number(vtpRec.qty) || 0);
  const effQty = Math.max(vtpQty, Number(sheetTotalQty) || 0, 1);

  const isPartialOrReturnNote =
    /(^|,)GGDH(,|$)/.test(svcAdd) ||
    noteNorm.includes("giao hang mot phan") ||
    noteNorm.includes("nhan lai san pham");

  if (st === 501) {
    if (isPartialOrReturnNote) {
      return effQty <= 1 ? "ĐÃ HOÀN" : "GIAO 1 PHẦN";
    }
    return "GIAO THÀNH CÔNG";
  }
  if (st === 504) return "ĐÃ HOÀN";
  if (st === 502 || st === 505 || st === 515) return "ĐANG CHUYỂN HOÀN";
  if (st === 107 || st === 201 || st === 503) return "ĐÃ HỦY";
  if (
    [105, 200, 202, 300, 301, 302, 303, 320, 400, 401, 402, 403, 500, 506, 507, 508, 509].includes(st)
  ) {
    return "ĐANG GIAO HÀNG";
  }
  return "";
}

function parse_vtp_excel_money(raw) {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
  }
  const s = String(raw || "").trim();
  if (!s) return 0;
  // File .xlsx lưu ô số dạng "30000.0", "595000.00", "1.2e6" -> phải parse số trước khi lọc ký tự
  if (/^-?\d+\.\d{1,2}$/.test(s) || /^-?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(s)) {
    const f = Number(s);
    return Number.isFinite(f) ? Math.max(0, Math.round(f)) : 0;
  }
  const cleaned = s.replace(/[^\d\-]/g, "");
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? 0 : Math.max(0, n);
}

function map_vtp_excel_row_to_sheet_tag(vtpStatusRaw, vtpThu, sheetCod) {
  const stNorm = bo_dau_tieng_viet(String(vtpStatusRaw || ""))
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!stNorm) return "";

  if (stNorm === "DA TRA" || (stNorm.includes("DA TRA") && !stNorm.includes("HOAN"))) {
    return "ĐÃ TRẢ";
  }
  if (
    stNorm.includes("TRA LAI") ||
    stNorm.includes("DA HOAN") ||
    stNorm.includes("HOAN THANH CONG") ||
    stNorm.includes("CHUYEN TRA NGUOI GUI")
  ) {
    return "ĐÃ HOÀN";
  }
  if (stNorm.includes("DUYET HOAN")) {
    return "ĐÃ DUYỆT HOÀN";
  }
  if (stNorm.includes("CHUYEN HOAN") || stNorm.includes("CHO HOAN")) {
    return "ĐANG CHUYỂN HOÀN";
  }
  if (stNorm.includes("SHOP HUY")) {
    return "SHOP HỦY LẤY";
  }
  if (stNorm.includes("VTP HUY")) {
    return "VTP HỦY LẤY";
  }
  if (stNorm.includes("HUY")) {
    return "ĐÃ HỦY";
  }
  if (stNorm.includes("GIAO 1 PHAN") || stNorm.includes("GIAO MOT PHAN") || stNorm.includes("PHAT 1 PHAN")) {
    if (vtpThu === sheetCod || vtpThu > 50000) {
      return "GIAO 1 PHẦN";
    }
    return "ĐÃ HOÀN";
  }
  if (stNorm.includes("GIAO THANH CONG") || stNorm.includes("PHAT THANH CONG")) {
    // Quy tắc đối soát COD:
    // - Tiền thu == COD gốc trên Sheet => GIAO THÀNH CÔNG (bao gồm cả đơn 0đ chuyển khoản, đơn 20k khớp)
    // - Nếu khác COD gốc: Tiền thu > 50.000đ => GIAO THÀNH CÔNG; <= 50.000đ => ĐÃ HOÀN
    if (vtpThu === sheetCod || vtpThu > 50000) {
      return "GIAO THÀNH CÔNG";
    }
    return "ĐÃ HOÀN";
  }
  if (stNorm.includes("CHO PHAT LAI")) {
    return "CHỜ PHÁT LẠI";
  }
  if (stNorm.includes("CHO XU LY")) {
    return "CHỜ XỬ LÝ";
  }
  if (stNorm.includes("PHAT TIEP")) {
    return "PHÁT TIẾP";
  }
  if (
    stNorm.includes("DANG GIAO") ||
    stNorm.includes("DANG PHAT") ||
    stNorm.includes("GIAO KHONG THANH CONG") ||
    stNorm.includes("TON")
  ) {
    return "ĐANG GIAO HÀNG";
  }
  if (stNorm.includes("VAN CHUYEN") || stNorm.includes("DA KET NOI")) {
    return "ĐANG VẬN CHUYỂN";
  }
  if (stNorm.includes("DA LAY HANG")) {
    return "ĐÃ LẤY HÀNG";
  }
  if (stNorm.includes("DANG LAY HANG") || stNorm.includes("CHO LAY HANG") || stNorm.includes("LAY KHONG THANH CONG")) {
    return "ĐANG LẤY HÀNG";
  }
  if (stNorm.includes("DA TIEP NHAN")) {
    return "ĐÃ TIẾP NHẬN";
  }
  if (stNorm.includes("TAO MOI") || stNorm.includes("DA DUYET")) {
    return "LÊN APP VTP";
  }
  return "";
}

function extract_vtp_excel_status_rows(grid) {
  if (!Array.isArray(grid) || grid.length === 0) {
    return { items: [], error: "Không đọc được dòng dữ liệu nào trong file." };
  }
  const normHdr = (s) => bo_dau_tieng_viet(String(s || "").trim()).toLowerCase().replace(/\s+/g, " ");

  let headerIdx = -1;
  let colMvd = -1;
  let colStatus = -1;
  let colCodThu = -1;
  let colReceiverPay = -1;

  const maxScan = Math.min(25, grid.length);
  for (let r = 0; r < maxScan; r++) {
    const row = grid[r] || [];
    let fMvd = -1;
    let fSt = -1;
    let fThu = -1;
    let fRecPay = -1;
    for (let c = 0; c < row.length; c++) {
      const h = normHdr(row[c]);
      if (!h) continue;
      if (fMvd === -1 && (h.includes("ma van don") || h.includes("so van don") || h === "mvd") && !h.includes("ma don hang")) fMvd = c;
      if (fSt === -1 && (h === "trang thai" || h.includes("trang thai don")) && !h.includes("doi soat") && !h.includes("thanh toan") && !h.includes("ngay")) fSt = c;
      if (fThu === -1 && (h.includes("tien thu ho") || h === "cod" || h.includes("thu ho (4)"))) fThu = c;
      if (fRecPay === -1 && h.includes("tien thu nguoi nhan")) fRecPay = c;
    }
    if (fMvd !== -1 && fSt !== -1) {
      headerIdx = r;
      colMvd = fMvd;
      colStatus = fSt;
      colCodThu = fThu !== -1 ? fThu : fRecPay;
      colReceiverPay = fRecPay;
      break;
    }
  }

  if (headerIdx === -1 || colMvd === -1 || colStatus === -1 || colCodThu === -1) {
    return {
      items: [],
      error: "File chưa đúng mẫu xuất từ Quản lý vận đơn Viettel Post (cần đủ cột Mã Vận Đơn, Trạng Thái và Tiền thu hộ).",
    };
  }

  const items = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const mvd = String(row[colMvd] || "").trim();
    if (!mvd || mvd === "-" || mvd === "—") continue;
    const vtpStatus = String(row[colStatus] || "").trim();
    const thuVal = parse_vtp_excel_money(row[colCodThu]);
    items.push({ mvd, vtpStatus, thuVal });
  }
  return { items, error: items.length === 0 ? "Không tìm thấy dòng vận đơn hợp lệ nào trong file." : "" };
}

function set_vtp_sync_status_msg(text, state = "done") {
  const box = document.getElementById("vtpSyncStatusBox");
  const txt = document.getElementById("vtpSyncStatusText");
  if (!box || !txt) return;
  if (!text) {
    box.classList.add("hidden");
    txt.textContent = "";
    return;
  }
  box.classList.remove("hidden", "is-error", "is-done");
  if (state === "error") box.classList.add("is-error");
  else box.classList.add("is-done");
  txt.textContent = text;
}

function get_vtp_sync_category(tag) {
  if (tag === "GIAO THÀNH CÔNG") return "ok";
  if (tag === "ĐÃ HOÀN" || tag === "ĐÃ TRẢ" || tag === "ĐANG CHUYỂN HOÀN" || tag === "ĐÃ DUYỆT HOÀN" || tag === "GIAO 1 PHẦN") return "return";
  return "shipping";
}

function render_vtp_sync_modal() {
  const listEl = document.getElementById("vtpSyncPreviewList");
  const kpiEl = document.getElementById("vtpSyncKpiRow");
  const breakdownEl = document.getElementById("vtpSyncBreakdown");
  const badgeEl = document.getElementById("vtpSyncSourceBadge");
  const chipEl = document.getElementById("vtpSyncReadyChip");
  const commitBtn = document.getElementById("btnDoCommitVtpSync");

  const items = _vtp_sync_state.changedItems || [];
  const counts = _vtp_sync_state.counts || {};
  const isCommitted = Boolean(_vtp_sync_state.committed);
  const excelMeta = _vtp_sync_state.excelMeta || null;
  const okCount = counts["GIAO THÀNH CÔNG"] || 0;
  const returnCount = (counts["ĐÃ HOÀN"] || 0) + (counts["ĐÃ TRẢ"] || 0) + (counts["ĐANG CHUYỂN HOÀN"] || 0) + (counts["ĐÃ DUYỆT HOÀN"] || 0) + (counts["GIAO 1 PHẦN"] || 0);

  if (badgeEl) {
    badgeEl.textContent = excelMeta
      ? `EXCEL: ${excelMeta.totalRows} ĐƠN (${excelMeta.matchedCount} KHỚP)`
      : "EXCEL VTP";
  }
  if (chipEl) chipEl.textContent = isCommitted ? `Đã ghi ${items.length} đơn` : `${items.length} đơn đổi`;

  if (kpiEl) {
    kpiEl.innerHTML =
      `<div class="export-cp-kpi-card">` +
      `<span class="export-cp-kpi-label">ĐỌC FILE EXCEL</span>` +
      `<span class="export-cp-kpi-val">${excelMeta ? excelMeta.totalRows : 0} đơn</span>` +
      `<span class="export-cp-kpi-sub">${excelMeta ? `${excelMeta.matchedCount} đơn khớp Sheet` : "Chưa chọn file"}</span>` +
      `</div>` +
      `<div class="export-cp-kpi-card">` +
      `<span class="export-cp-kpi-label">${isCommitted ? "ĐÃ CẬP NHẬT" : "CẦN CẬP NHẬT"}</span>` +
      `<span class="export-cp-kpi-val is-ok">${items.length} đơn</span>` +
      `<span class="export-cp-kpi-sub">${isCommitted ? "Đã ghi lên cột N" : items.length > 0 ? "Sẵn sàng ghi cột N" : "Chưa có thay đổi"}</span>` +
      `</div>` +
      `<div class="export-cp-kpi-card">` +
      `<span class="export-cp-kpi-label">HOÀN / ĐỔI / 1 PHẦN</span>` +
      `<span class="export-cp-kpi-val ${returnCount > 0 ? "is-spend" : ""}">${returnCount} đơn</span>` +
      `<span class="export-cp-kpi-sub">${okCount} giao thành công</span>` +
      `</div>`;
  }

  if (breakdownEl) {
    const keys = Object.keys(counts);
    if (_vtp_sync_state.idleReady && !_vtp_sync_state.scanned) {
      breakdownEl.innerHTML = `<span class="vtp-sync-empty" style="padding:14px 4px;">Bấm nút xanh bên dưới để chọn file Excel xuất từ Viettel Post.</span>`;
    } else if (!_vtp_sync_state.scanned) {
      breakdownEl.innerHTML = `<span class="vtp-sync-empty" style="padding:14px 4px;">Đang đối chiếu trạng thái từ Viettel Post...</span>`;
    } else if (keys.length === 0) {
      if (excelMeta && excelMeta.rawVtpCounts && Object.keys(excelMeta.rawVtpCounts).length > 0) {
        breakdownEl.innerHTML = Object.keys(excelMeta.rawVtpCounts)
          .map((rk) => `<span class="vtp-sync-stat-pill"><span>${escape_html(rk)}</span><span class="vtp-sync-stat-count is-ship">${excelMeta.rawVtpCounts[rk]}</span></span>`)
          .join("");
      } else {
        breakdownEl.innerHTML = `<span class="vtp-sync-empty" style="padding:14px 4px;">Không phát hiện đơn nào có trạng thái mới so với Google Sheet.</span>`;
      }
    } else {
      breakdownEl.innerHTML = keys
        .map((k) => {
          let cls = "is-ship";
          if (k === "GIAO THÀNH CÔNG") cls = "is-ok";
          else if (k === "ĐÃ HOÀN" || k === "ĐÃ TRẢ" || k === "ĐANG CHUYỂN HOÀN" || k === "ĐÃ DUYỆT HOÀN" || k === "ĐÃ HỦY" || k === "SHOP HỦY LẤY" || k === "VTP HỦY LẤY") cls = "is-return";
          else if (k === "GIAO 1 PHẦN") cls = "is-partial";
          return `<span class="vtp-sync-stat-pill"><span>${escape_html(k)}</span><span class="vtp-sync-stat-count ${cls}">${counts[k]}</span></span>`;
        })
        .join("");
    }
  }

  if (commitBtn) {
    commitBtn.disabled = _vtp_sync_busy;
    const sp = commitBtn.querySelector("span");
    if (sp) {
      sp.textContent = _vtp_sync_busy
        ? "⏳ Đang đọc Excel & cập nhật lên Google Sheet..."
        : isCommitted
          ? "✅ Chọn file Excel VTP khác & Cập nhật Sheet"
          : items.length > 0
            ? `✅ Chọn Excel VTP & Cập nhật lên Sheet (${items.length} đơn dự kiến)`
            : "✅ Chọn Excel VTP & Cập nhật lên Sheet";
    }
  }

  if (listEl) {
    if (_vtp_sync_state.idleReady && !_vtp_sync_state.scanned) {
      listEl.innerHTML = `<div class="vtp-sync-empty">📂 Bấm nút <strong>Chọn Excel VTP &amp; Cập nhật lên Sheet</strong> ở góc dưới bên phải để nạp file Excel tải từ Viettel Post (app tự lọc COD &gt; 50k / = COD Sheet và ghi cột N).</div>`;
      return;
    }
    if (!_vtp_sync_state.scanned) {
      listEl.innerHTML = `<div class="vtp-sync-empty">⏳ Đang xử lý &amp; đối chiếu dữ liệu từ Viettel Post...</div>`;
      return;
    }
    const filtered = items.filter((it) => _vtp_sync_filter === "all" || get_vtp_sync_category(it.status) === _vtp_sync_filter);
    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="vtp-sync-empty">${
        items.length === 0
          ? excelMeta
            ? `Đã đọc ${excelMeta.totalRows} đơn từ "${escape_html(excelMeta.fileName)}" (${excelMeta.matchedCount} đơn khớp chưa chốt) — chưa có đơn nào cần đổi trạng thái mới.`
            : "Tất cả đơn đang đi đều khớp với trạng thái mới nhất trên Viettel Post."
          : "Không có đơn nào trong nhóm lọc này."
      }</div>`;
      return;
    }

    listEl.innerHTML = filtered
      .slice(0, 120)
      .map((it) => {
        const oldCls = typeof get_status_pill_cls === "function" ? get_status_pill_cls(it.oldStatus) : "pill-status-default";
        const newCls = typeof get_status_pill_cls === "function" ? get_status_pill_cls(it.status) : "pill-status-default";
        return (
          `<div class="vtp-sync-row">` +
          `<div class="vtp-sync-row-left">` +
          `<div class="vtp-sync-row-name"><strong>${escape_html(it.name || "(Khách hàng)")}</strong><span class="vtp-sync-row-mvd">${escape_html(it.mvd)}</span></div>` +
          `<div class="vtp-sync-row-meta">${escape_html(it.phone || "—")}${it.date ? " • " + escape_html(it.date) : ""}${it.qty > 1 ? " • " + it.qty + " đôi" : ""}${it.codNote ? " • " + escape_html(it.codNote) : ""}</div>` +
          `</div>` +
          `<div class="vtp-sync-row-tags">` +
          `<span class="od-status-pill ${oldCls}">${escape_html(it.oldStatus || "Trống")}</span>` +
          `<span class="vtp-sync-arrow">→</span>` +
          `<span class="od-status-pill ${newCls}">${escape_html(it.status)}</span>` +
          `</div>` +
          `</div>`
        );
      })
      .join("") +
      (filtered.length > 120 ? `<div class="vtp-sync-empty" style="padding:10px;">...và ${filtered.length - 120} đơn khác</div>` : "");
  }
}

async function scan_vtp_status_sync_modal() {
  if (_vtp_sync_busy) return;
  _vtp_sync_busy = true;
  _vtp_sync_state = { totalChecked: 0, changedItems: [], counts: {}, scanned: false };
  set_vtp_sync_status_msg("", "done");

  const scanBtn = document.getElementById("btnVtpSyncScan");
  const origScanTxt = scanBtn ? scanBtn.textContent : "";
  if (scanBtn) {
    scanBtn.disabled = true;
    scanBtn.textContent = "⏳ Đang quét...";
  }
  render_vtp_sync_modal();

  try {
    if (typeof sync_vtp_token_with_cloud === "function") {
      const hasTk = await sync_vtp_token_with_cloud().catch(() => false);
      if (!hasTk) {
        _vtp_sync_state.scanned = true;
        set_vtp_sync_status_msg("Chưa có Token Viettel Post — hãy mở mục 📦 Lên đơn để kết nối Token.", "error");
        render_vtp_sync_modal();
        return;
      }
    }

    const cutoffDate = new Date(Date.now() - _vtp_sync_days * 86400000);
    const cutoffYmd = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, "0")}-${String(cutoffDate.getDate()).padStart(2, "0")}`;
    const effCutoffYmd = typeof clamp_min_data_date === "function" ? clamp_min_data_date(cutoffYmd) : cutoffYmd;
    if (
      (!Array.isArray(data_hien_tai) || data_hien_tai.length === 0 || !thong_ke_loaded_start || thong_ke_loaded_start > effCutoffYmd) &&
      typeof tai_du_lieu_google_sheets === "function"
    ) {
      await tai_du_lieu_google_sheets(false, effCutoffYmd, "", false).catch(() => false);
    }

    const allOrders = typeof lay_tat_ca_don_hang_tu_bang_a_den_p === "function"
      ? lay_tat_ca_don_hang_tu_bang_a_den_p(false)
      : [];

    const PROTECTED_NORM = new Set([
      "DON TEST",
      "TRUNG",
      "DOI HANG",
      "HOAN DE DOI HANG",
      "CHUA CHOT DUOC",
      "GIAO THANH CONG",
      "DA HOAN",
      "DA TRA",
      "DA HUY",
      "SHOP HUY LAY",
      "VTP HUY LAY",
    ]);

    const normSt = (s) =>
      bo_dau_tieng_viet(String(s || ""))
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim();

    const mvdMap = new Map();
    for (const o of allOrders) {
      const ymd = typeof parse_order_ymd === "function" ? parse_order_ymd(o) : "";
      if (ymd && ymd < cutoffYmd) continue;

      const rawMvd = String(o.ma_van_don || o.parent_ma_van_don || "").trim();
      if (!rawMvd || rawMvd === "-" || rawMvd === "—" || rawMvd.length < 6) continue;
      const mvdKey = rawMvd.toUpperCase();

      const stNorm = normSt(o.trang_thai);
      const q = typeof infer_ship_order_qty === "function" ? infer_ship_order_qty(o) : 1;

      let entry = mvdMap.get(mvdKey);
      if (!entry) {
        entry = {
          mvd: rawMvd,
          name: String(o.ho_ten || o.parent_ho_ten || "").trim(),
          phone: String(o.sdt || o.parent_sdt || "").trim(),
          date: String(o.ngay_only || "").trim(),
          oldStatus: String(o.trang_thai || "").trim(),
          totalQty: 0,
          rowStatuses: new Set(),
          hasUpdatable: false,
        };
        mvdMap.set(mvdKey, entry);
      } else {
        if (!entry.name && o.ho_ten) entry.name = String(o.ho_ten).trim();
        if (!entry.phone && o.sdt) entry.phone = String(o.sdt).trim();
        if (!entry.oldStatus && o.trang_thai) entry.oldStatus = String(o.trang_thai).trim();
      }
      entry.totalQty += q;
      entry.rowStatuses.add(stNorm);
      if (!PROTECTED_NORM.has(stNorm)) {
        entry.hasUpdatable = true;
      }
    }

    const targetMvds = [];
    for (const entry of mvdMap.values()) {
      if (entry.hasUpdatable) targetMvds.push(entry);
    }

    _vtp_sync_state.totalChecked = targetMvds.length;
    if (targetMvds.length === 0) {
      _vtp_sync_state.scanned = true;
      set_vtp_sync_status_msg(`Không có đơn chưa chốt nào có MVĐ trong ${_vtp_sync_days} ngày gần nhất.`, "done");
      render_vtp_sync_modal();
      return;
    }

    if (scanBtn) scanBtn.textContent = `⏳ Tra 0/${targetMvds.length} MVĐ...`;
    render_vtp_sync_modal();

    const results = [];
    const CHUNK_SZ = 40;
    for (let idx = 0; idx < targetMvds.length; idx += CHUNK_SZ) {
      const chunk = targetMvds.slice(idx, idx + CHUNK_SZ);
      if (scanBtn) {
        scanBtn.textContent = `⏳ Tra ${Math.min(idx + chunk.length, targetMvds.length)}/${targetMvds.length} MVĐ...`;
      }
      const rVtp = await fetch("/api/vtp-batch-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mvds: chunk.map((e) => e.mvd) }),
      });
      const dVtp = await rVtp.json().catch(() => null);
      if (!dVtp || !dVtp.ok) {
        throw new Error((dVtp && dVtp.message) || "Không tra cứu được trạng thái Viettel Post.");
      }
      if (Array.isArray(dVtp.results)) {
        for (const rec of dVtp.results) results.push(rec);
      }
    }

    const changedItems = [];
    const counts = {};

    for (const rec of results) {
      const mvdKey = String(rec.mvd || "").trim().toUpperCase();
      const info = mvdMap.get(mvdKey);
      if (!info) continue;

      const targetTag = map_vtp_status_to_sheet_tag(rec, info.totalQty);
      if (!targetTag) continue;
      const targetNorm = normSt(targetTag);

      let needUpdate = false;
      for (const curNorm of info.rowStatuses) {
        if (!PROTECTED_NORM.has(curNorm) && curNorm !== targetNorm) {
          needUpdate = true;
          break;
        }
      }
      if (!needUpdate) continue;

      changedItems.push({
        mvd: info.mvd,
        status: targetTag,
        name: info.name,
        phone: info.phone,
        date: info.date,
        qty: info.totalQty,
        oldStatus: info.oldStatus,
      });
      counts[targetTag] = (counts[targetTag] || 0) + 1;
    }

    _vtp_sync_state = {
      totalChecked: targetMvds.length,
      changedItems,
      counts,
      scanned: true,
    };
    if (changedItems.length > 0) {
      set_vtp_sync_status_msg(`Quét đơn VTP tìm thấy ${changedItems.length} đơn thay đổi. Bấm nút xanh để chọn file Excel VTP đối soát chuẩn COD & ghi lên cột N.`, "done");
    } else {
      set_vtp_sync_status_msg(`Đã quét xong ${targetMvds.length} đơn — tất cả đều khớp. Bạn vẫn có thể bấm nút xanh để đối soát bằng Excel VTP.`, "done");
    }
  } catch (err) {
    _vtp_sync_state.scanned = true;
    set_vtp_sync_status_msg(`Lỗi quét Viettel Post: ${(err && err.message) || err}`, "error");
  } finally {
    _vtp_sync_busy = false;
    if (scanBtn) {
      scanBtn.disabled = false;
      scanBtn.textContent = origScanTxt || "↻ Quét đơn VTP";
    }
    render_vtp_sync_modal();
  }
}

async function sync_vtp_items_to_sheet_core(changedItems, counts, matchedCount) {
  const apiKey = typeof get_apps_script_api_key === "function" ? get_apps_script_api_key() : "";
  if (!apiKey) {
    throw new Error("Chưa có khóa xác thực Apps Script, vui lòng đăng nhập lại.");
  }

  const itemsToSend = changedItems.map((it) => ({ mvd: it.mvd, status: it.status }));
  set_vtp_sync_status_msg(`⏳ Đã khớp ${itemsToSend.length} đơn cần đổi trạng thái! Đang ghi vào cột N Google Sheet...`, "done");
  render_vtp_sync_modal();

  const syncUrl = build_apps_script_url("mode=sync_vtp_status");
  const sr = await fetch(syncUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ mode: "sync_vtp_status", key: apiKey, items: itemsToSend }),
    redirect: "follow",
  });
  const sd = await sr.json().catch(() => null);
  if (!sd || !sd.ok) {
    throw new Error((sd && sd.error) || "Apps Script chưa hỗ trợ sync_vtp_status (cần cập nhật file applam_v8.6.364.gs).");
  }

  set_vtp_sync_status_msg(`⏳ Đã ghi ${sd.updatedRows || itemsToSend.length} dòng! Đang đồng bộ lại bảng APPLAM...`, "done");
  await tai_va_cap_nhat_theo_ngay(false, false, true);

  const summaryParts = Object.keys(counts || {}).map((k) => `${counts[k]} ${k}`);
  const okMsg = `✅ Đã đối soát Excel VTP (${matchedCount} đơn khớp) & cập nhật ${sd.updatedRows || itemsToSend.length} dòng lên cột N (${summaryParts.join(", ")})`;
  _vtp_sync_state.committed = true;
  set_vtp_sync_status_msg(okMsg, "done");
  if (typeof show_update_toast_notification === "function") {
    show_update_toast_notification(okMsg);
  }
}

function open_vtp_status_sync_modal() {
  const modal = document.getElementById("vtpStatusSyncModal");
  if (!modal) return;
  _vtp_sync_filter = "all";
  document.querySelectorAll("#vtpSyncFilterPills .vtp-sync-filter-pill").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-filter") === "all");
  });
  if (!_vtp_sync_busy) {
    _vtp_sync_state = { totalChecked: 0, changedItems: [], counts: {}, scanned: false, idleReady: true, committed: false, excelMeta: null };
    set_vtp_sync_status_msg("", "done");
  }
  modal.classList.remove("hidden");
  render_vtp_sync_modal();
}

function close_vtp_status_sync_modal() {
  document.getElementById("vtpStatusSyncModal")?.classList.add("hidden");
}

async function scan_vtp_excel_file_to_modal(file) {
  if (!file || _vtp_sync_busy) return;
  _vtp_sync_busy = true;
  _vtp_sync_state = { totalChecked: 0, changedItems: [], counts: {}, scanned: false };
  set_vtp_sync_status_msg(`⏳ Đang đọc file ${file.name}...`, "done");
  render_vtp_sync_modal();

  try {
    const grid = await parse_xlsx_file_to_grid(file);
    const parsed = extract_vtp_excel_status_rows(grid);
    if (parsed.error) {
      _vtp_sync_state.scanned = true;
      set_vtp_sync_status_msg(parsed.error, "error");
      render_vtp_sync_modal();
      return;
    }

    if (
      (!Array.isArray(data_hien_tai) || data_hien_tai.length === 0 || !thong_ke_loaded_start || thong_ke_loaded_start > APP_DATA_MIN_DATE) &&
      typeof tai_du_lieu_google_sheets === "function"
    ) {
      set_vtp_sync_status_msg("⏳ Đang tải đủ dữ liệu Google Sheet từ đầu tháng...", "done");
      await tai_du_lieu_google_sheets(false, "", "", true).catch(() => false);
    }

    const allOrders = typeof lay_tat_ca_don_hang_tu_bang_a_den_p === "function"
      ? lay_tat_ca_don_hang_tu_bang_a_den_p(false)
      : [];

    const PROTECTED_NORM = new Set([
      "DON TEST",
      "TRUNG",
      "DOI HANG",
      "HOAN DE DOI HANG",
      "CHUA CHOT DUOC",
      "GIAO THANH CONG",
      "DA HOAN",
      "DA TRA",
      "DA HUY",
      "SHOP HUY LAY",
      "VTP HUY LAY",
    ]);
    const normSt = (s) =>
      bo_dau_tieng_viet(String(s || ""))
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim();
    const stripPkeKey = (k) => String(k || "").trim().toUpperCase().replace(/\s+/g, "").replace(/^PKE(?=\d)/, "");

    const mvdMap = new Map();
    const mvdNoPkeMap = new Map();
    for (const o of allOrders) {
      const rawMvd = String(o.ma_van_don || o.parent_ma_van_don || "").trim();
      if (!rawMvd || rawMvd === "-" || rawMvd === "—" || rawMvd.length < 6) continue;
      const mvdKey = rawMvd.toUpperCase();
      const altKey = stripPkeKey(mvdKey);
      const stNorm = normSt(o.trang_thai);
      const q = typeof infer_ship_order_qty === "function" ? infer_ship_order_qty(o) : 1;
      const rowCod = Math.max(0, Math.round(Number(o.gia_ban) || 0));

      let entry = mvdMap.get(mvdKey);
      if (!entry) {
        entry = {
          mvd: rawMvd,
          name: String(o.ho_ten || o.parent_ho_ten || "").trim(),
          phone: String(o.sdt || o.parent_sdt || "").trim(),
          date: String(o.ngay_only || "").trim(),
          oldStatus: String(o.trang_thai || "").trim(),
          totalQty: 0,
          sheetCod: 0,
          rowStatuses: new Set(),
          hasUpdatable: false,
        };
        mvdMap.set(mvdKey, entry);
        if (altKey && !mvdNoPkeMap.has(altKey)) mvdNoPkeMap.set(altKey, entry);
      } else {
        if (!entry.name && o.ho_ten) entry.name = String(o.ho_ten).trim();
        if (!entry.phone && o.sdt) entry.phone = String(o.sdt).trim();
        if (!entry.oldStatus && o.trang_thai) entry.oldStatus = String(o.trang_thai).trim();
      }
      entry.totalQty += q;
      entry.sheetCod += rowCod;
      entry.rowStatuses.add(stNorm);
      if (!PROTECTED_NORM.has(stNorm)) {
        entry.hasUpdatable = true;
      }
    }

    const changedItems = [];
    const counts = {};
    const rawVtpCounts = {};
    let matchedCount = 0;
    let skippedAlreadyFinal = 0;

    for (const rowVtp of parsed.items) {
      const rawStLbl = String(rowVtp.vtpStatus || "").trim() || "(Trống)";
      rawVtpCounts[rawStLbl] = (rawVtpCounts[rawStLbl] || 0) + 1;

      const mvdKey = String(rowVtp.mvd || "").trim().toUpperCase();
      const altKey = stripPkeKey(mvdKey);
      const info = mvdMap.get(mvdKey) || (altKey ? mvdNoPkeMap.get(altKey) : null);
      if (!info) continue;
      if (!info.hasUpdatable) {
        skippedAlreadyFinal += 1;
        continue;
      }
      matchedCount += 1;

      const targetTag = map_vtp_excel_row_to_sheet_tag(rowVtp.vtpStatus, rowVtp.thuVal, info.sheetCod);
      if (!targetTag) continue;
      const targetNorm = normSt(targetTag);

      let needUpdate = false;
      for (const curNorm of info.rowStatuses) {
        if (PROTECTED_NORM.has(curNorm) || curNorm === targetNorm) continue;
        // Không hạ ngược đơn đang vận chuyển / đang giao / đang chuyển hoàn xuống LÊN APP VTP
        if (targetNorm === "LEN APP VTP" && (curNorm === "DANG VAN CHUYEN" || curNorm === "DANG GIAO HANG" || curNorm === "DANG CHUYEN HOAN" || curNorm === "GIAO 1 PHAN")) {
          continue;
        }
        needUpdate = true;
        break;
      }
      if (!needUpdate) continue;

      changedItems.push({
        mvd: info.mvd,
        status: targetTag,
        name: info.name,
        phone: info.phone,
        date: info.date,
        qty: info.totalQty,
        oldStatus: info.oldStatus,
        codNote: `Thu VTP: ${format_tien_vnd(rowVtp.thuVal)} / COD Sheet: ${format_tien_vnd(info.sheetCod)}`,
      });
      counts[targetTag] = (counts[targetTag] || 0) + 1;
    }

    const excelMeta = {
      fileName: file.name,
      totalRows: parsed.items.length,
      matchedCount,
      skippedAlreadyFinal,
      rawVtpCounts,
    };

    _vtp_sync_state = {
      totalChecked: matchedCount,
      changedItems,
      counts,
      scanned: true,
      idleReady: false,
      committed: false,
      excelMeta,
    };
    if (matchedCount === 0) {
      const sample = parsed.items
        .slice(0, 3)
        .map((x) => x.mvd)
        .join(", ");
      const msg =
        skippedAlreadyFinal > 0
          ? `File Excel có ${parsed.items.length} đơn (${skippedAlreadyFinal} đơn khớp đã chốt tag cuối sẵn trên Sheet nên bỏ qua).`
          : `File "${file.name}" đọc được ${parsed.items.length} đơn (${sample}), nhưng 0 đơn khớp với đơn chưa chốt trên Sheet (đã tải ${mvdMap.size} MVĐ). Kiểm tra lại tab lọc / ngày khi Xuất Excel trên web Viettel Post.`;
      set_vtp_sync_status_msg(msg, skippedAlreadyFinal > 0 ? "done" : "error");
      return;
    }
    if (changedItems.length === 0) {
      set_vtp_sync_status_msg(
        `Đã đọc ${parsed.items.length} dòng Excel (${matchedCount} đơn chưa chốt khớp Sheet) — chưa có thay đổi mới.`,
        "done"
      );
      return;
    }

    await sync_vtp_items_to_sheet_core(changedItems, counts, matchedCount);
  } catch (err) {
    _vtp_sync_state.scanned = true;
    set_vtp_sync_status_msg(`Lỗi đọc/cập nhật Excel VTP: ${(err && err.message) || err}`, "error");
  } finally {
    _vtp_sync_busy = false;
    render_vtp_sync_modal();
  }
}

const VTP_SYNC_PASS_HASH = "9f81d297ced7c1a39e6bef29cc373a5416730d1043d7841326acbf78962809c6";

function close_vtp_sync_pass_modal() {
  const modal = document.getElementById("vtpSyncPassModal");
  const inp = document.getElementById("vtpSyncPassInput");
  const err = document.getElementById("vtpSyncPassError");
  if (inp) {
    inp.value = "";
    inp.type = "password";
  }
  document.getElementById("vtpPassEyeOpen")?.classList.remove("hidden");
  document.getElementById("vtpPassEyeClosed")?.classList.add("hidden");
  if (err) err.classList.add("hidden");
  modal?.classList.add("hidden");
}

function open_vtp_sync_pass_modal() {
  const modal = document.getElementById("vtpSyncPassModal");
  const inp = document.getElementById("vtpSyncPassInput");
  const err = document.getElementById("vtpSyncPassError");
  if (!modal || !inp) return;
  inp.value = "";
  inp.type = "password";
  document.getElementById("vtpPassEyeOpen")?.classList.remove("hidden");
  document.getElementById("vtpPassEyeClosed")?.classList.add("hidden");
  if (err) err.classList.add("hidden");
  modal.classList.remove("hidden");
  setTimeout(() => {
    try { inp.focus(); } catch (e) {}
  }, 40);
}

function init_vtp_status_sync_modal() {
  const modal = document.getElementById("vtpStatusSyncModal");
  if (!modal) return;

  document.getElementById("btnVtpStatusModal")?.addEventListener("click", (e) => {
    e.stopPropagation();
    open_vtp_sync_pass_modal();
  });

  const passModal = document.getElementById("vtpSyncPassModal");
  document.getElementById("btnCloseVtpSyncPass")?.addEventListener("click", close_vtp_sync_pass_modal);
  document.getElementById("btnCancelVtpSyncPass")?.addEventListener("click", close_vtp_sync_pass_modal);
  passModal?.addEventListener("click", (e) => {
    if (e.target === passModal) close_vtp_sync_pass_modal();
  });
  document.getElementById("vtpSyncPassCard")?.addEventListener("click", (e) => e.stopPropagation());
  document.getElementById("btnToggleVtpSyncPass")?.addEventListener("click", () => {
    const inp = document.getElementById("vtpSyncPassInput");
    const eyeOpen = document.getElementById("vtpPassEyeOpen");
    const eyeClosed = document.getElementById("vtpPassEyeClosed");
    if (!inp) return;
    const show = inp.type === "password";
    inp.type = show ? "text" : "password";
    eyeOpen?.classList.toggle("hidden", show);
    eyeClosed?.classList.toggle("hidden", !show);
    try { inp.focus(); } catch (e) {}
  });
  document.getElementById("vtpSyncPassForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const inp = document.getElementById("vtpSyncPassInput");
    const err = document.getElementById("vtpSyncPassError");
    const rawPass = inp ? String(inp.value || "") : "";
    const digest = await compute_sha256(rawPass);
    if (digest === VTP_SYNC_PASS_HASH) {
      close_vtp_sync_pass_modal();
      open_vtp_status_sync_modal();
      return;
    }
    if (err) err.classList.remove("hidden");
    if (inp) {
      try {
        inp.focus();
        inp.select();
      } catch (ex) {}
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && passModal && !passModal.classList.contains("hidden")) {
      close_vtp_sync_pass_modal();
    }
  });
  document.getElementById("btnCloseVtpSync")?.addEventListener("click", close_vtp_status_sync_modal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close_vtp_status_sync_modal();
  });
  document.getElementById("vtpStatusSyncCard")?.addEventListener("click", (e) => e.stopPropagation());

  document.getElementById("vtpSyncDaysGroup")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".vtp-sync-day-btn");
    if (!btn || _vtp_sync_busy) return;
    const d = parseInt(btn.getAttribute("data-days") || "35", 10) || 35;
    _vtp_sync_days = d;
    document.querySelectorAll("#vtpSyncDaysGroup .vtp-sync-day-btn").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
    scan_vtp_status_sync_modal();
  });

  document.getElementById("vtpSyncFilterPills")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".vtp-sync-filter-pill");
    if (!btn) return;
    _vtp_sync_filter = btn.getAttribute("data-filter") || "all";
    document.querySelectorAll("#vtpSyncFilterPills .vtp-sync-filter-pill").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
    render_vtp_sync_modal();
  });

  document.getElementById("btnVtpSyncScan")?.addEventListener("click", () => {
    scan_vtp_status_sync_modal();
  });

  document.getElementById("vtpSyncExcelInput")?.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) scan_vtp_excel_file_to_modal(file);
  });

  document.getElementById("btnDoCommitVtpSync")?.addEventListener("click", () => {
    if (_vtp_sync_busy) return;
    const apiKey = typeof get_apps_script_api_key === "function" ? get_apps_script_api_key() : "";
    if (!apiKey) {
      set_vtp_sync_status_msg("Chưa có khóa xác thực Apps Script, vui lòng đăng nhập lại.", "error");
      return;
    }
    const fIn = document.getElementById("vtpSyncExcelInput");
    if (fIn) {
      fIn.value = "";
      fIn.click();
    }
  });
}
