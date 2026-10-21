/**
 * 米家山水务 数据与配置模块 (store.ts)
 * 由 Scriptable 版 MijiaWaterGas 移植:
 * - serverKey 协商 -> AES 加密请求 -> RSA 加密密钥 -> RSA 解密响应密钥 -> AES 解密响应
 * - 配置与缓存通过 Storage shared 域保存, widget.tsx 与配置页 index.tsx 共享
 */
import { Storage } from "scripting";
import {
  aes128EcbDecrypt, aes128EcbEncrypt, b64decode, b64encode, b64urlToBigInt,
  bytesToStr, parseSpkiPub, pkcs7Pad, pkcs7Unpad, rsaPrivateDecrypt, rsaPublicEncrypt, strToBytes,
} from "./crypto";

/* ---------------- 类型 ---------------- */

export type Settings = {
  /** 组件标题别名 */
  alias: string;
  /** 主题色 (图标/单色进度条), hex */
  themeColor: string;
  /** 余额充沛色 (进度条顶端), hex */
  balanceColor: string;
  /** 组件自动刷新间隔 (分钟), 钳制 15~1440 */
  interval: string;
  /** 水费户号 consNo (9 位) */
  custCode: string;
  /** 登录凭证 JWT token (抓包请求头 token) */
  token: string;
  /** 进度条 100% 对应的余额基准 (元) */
  balanceLimit: string;
  /** 进度条五色阶渐变开关 */
  useGradientBar: boolean;
  /** 户号脱敏 (636****78) */
  maskCustCode: boolean;
  /** 服务单位脱敏 */
  maskCompName: boolean;
  /** 自定义服务单位 (优先于接口返回) */
  customCompName: string;
  /** 客户姓名 (接口失败兜底) */
  custName: string;
};

export type GasData = {
  countMoney?: string | number;
  newCountMoney?: string | number;
  /** 欠费金额 */
  oweMoney?: string | number;
  custCode?: string;
  custName?: string;
  compName?: string;
  gasPropName?: string;
  gasAddress?: string;
  /** 上次抄表读数 (m³) */
  lastRecord?: string | null;
  /** 抄表日期 */
  lastRecordTime?: string | null;
  /** 抓取时间 HH:mm */
  _fetchTime?: string;
  /** 抓取日期 MM-DD */
  _fetchDate?: string;
  /** 缓存时间戳 (ms) */
  _ts?: number;
};

/* ---------------- 常量 ---------------- */

const BASE_URL = "https://m.cdmjwater.com";
const FROM_DOMAIN_ID = "2";
const PART = "WECHAT";

/** 客户端固定 RSA-1024 密钥对 (仅用于解密服务端响应), 与原版一致 */
const CLIENT_KEY = {
  PUB_SPKI_B64:
    "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCs7q1cdBwpVEUSRP1ha2KwhI59HpmnXS5g48CKQGy46HtexjzpGL3CAwQirbskqBrPXnzRLbUnESgTiJmgqG1MVbwYRtqqjTJ6VX+nK9Utz/cNLTcg/Xoz6LDZVKuZU9kglNOYAw7o4kM0sbJ4AxNms5h+x7cO3BwZX72cbsBuOwIDAQAB",
  N: "AKzurVx0HClURRJE_WFrYrCEjn0emaddLmDjwIpAbLjoe17GPOkYvcIDBCKtuySoGs9efNEttScRKBOImaCobUxVvBhG2qqNMnpVf6cr1S3P9w0tNyD9ejPosNlUq5lT2SCU05gDDujiQzSxsngDE2azmH7Htw7cHBlfvZxuwG47",
  D: "FjZqKi_31g8u-BPIgBTtDkNYkhW2IttDM8rNVnTEAlRKVHgeJsq4xQziIRozqZe2KeC3I589X5FClo-7O_mmYCuPzx3esYYws4QpBE3_oSw7sRdGSKNKl9PrCQJLIHLVWkQcJ8pbFuiew6wGn_QaIYAFWmUcDpk720_QeZjHQhE",
};

const SETTINGS_KEY = "mijia_water_settings";
const CACHE_KEY_PREFIX = "mijia_water_cache_";
const SHARED = { shared: true }; // widget 与配置页必须用 shared 域

export const DEFAULT_SETTINGS: Settings = {
  alias: "米家山水务",
  themeColor: "#FF9500",
  balanceColor: "#10B981",
  interval: "360",
  custCode: "",
  token: "",
  balanceLimit: "500",
  useGradientBar: true,
  maskCustCode: false,
  maskCompName: false,
  customCompName: "",
  custName: "",
};

export function loadSettings(): Settings {
  const saved = Storage.get<Partial<Settings>>(SETTINGS_KEY, SHARED) ?? {};
  return { ...DEFAULT_SETTINGS, ...saved };
}

export function saveSettings(s: Settings): void {
  Storage.set(SETTINGS_KEY, s, SHARED);
}

function readCache(consNo: string): GasData | null {
  return Storage.get<GasData>(CACHE_KEY_PREFIX + (consNo || "default"), SHARED) ?? null;
}

function writeCache(consNo: string, d: GasData): void {
  Storage.set(CACHE_KEY_PREFIX + (consNo || "default"), d, SHARED);
}

/* ---------------- 加密请求链路 ---------------- */

async function postJson(path: string, bodyObj: unknown, headers: Record<string, string>): Promise<any> {
  const resp = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
    body: JSON.stringify(bodyObj),
    timeout: 15,
  });
  return await resp.json();
}

function genAesKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** serverKey 协商 -> 加密请求 -> 解密响应 */
async function callEncrypted(path: string, payload: unknown, token: string): Promise<any> {
  const commonHdrs: Record<string, string> = { token, fromDomainId: FROM_DOMAIN_ID, part: PART };

  // 1. 协商: 拿服务端公钥与 secret
  const sk = await postJson("/api/sec/serverKey", { key: CLIENT_KEY.PUB_SPKI_B64, data: "" }, commonHdrs);
  if (!sk || !sk.obj) throw new Error("密钥协商失败");
  const secret: string = sk.obj.key;
  const serverPub = parseSpkiPub(sk.obj.data);

  // 2. 请求体: 随机 AES 密钥加密 payload, 密钥本身用服务端公钥 RSA 加密
  const aesKeyStr = genAesKey();
  const aesKeyBytes = strToBytes(aesKeyStr);
  const encData = aes128EcbEncrypt(pkcs7Pad(strToBytes(JSON.stringify(payload))), aesKeyBytes);
  const encKey = rsaPublicEncrypt(strToBytes(aesKeyStr), serverPub.n, serverPub.e);

  // 3. 发送并解密响应
  const resp = await postJson(path, { key: b64encode(encKey), data: b64encode(encData) }, { secret, ...commonHdrs });
  if (!resp || !resp.key || !resp.data) throw new Error("接口失败: " + JSON.stringify(resp).slice(0, 200));

  const aesKey2 = rsaPrivateDecrypt(b64decode(resp.key), b64urlToBigInt(CLIENT_KEY.N), b64urlToBigInt(CLIENT_KEY.D));
  const plain = JSON.parse(bytesToStr(pkcs7Unpad(aes128EcbDecrypt(b64decode(resp.data), aesKey2))));
  if (plain.success === false) throw new Error(plain.msg || "接口返回失败");
  return plain;
}

/* ---------------- 业务查询 ---------------- */

export type QueryResult = {
  balance: number | null;
  arrears: number | null;
  consNo: string;
  consName: string;
  companyName: string | null;
  lastRecord: string | null;
  lastRecordTime: string | null;
};

export async function queryBalance(token: string, consNo: string): Promise<QueryResult> {
  const ar = await callEncrypted("/api/micro/bill/arrearage", { consNo }, token);
  const ac = await callEncrypted("/api/micro/bill/accountInfo", { consNo }, token);
  const a = ar?.obj || {}, b = ac?.obj || {};

  // 抄表记录: 首页第一条即最近抄表 (失败不影响余额)
  let lastRecord: string | null = null;
  let lastRecordTime: string | null = null;
  try {
    const mr = await callEncrypted("/api/micro/readMeter/mrInfo", { consNo, pageNo: 1, pageSize: 10 }, token);
    if (mr && Array.isArray(mr.obj) && mr.obj.length > 0) {
      const first = mr.obj[0];
      lastRecord = first.thisNum != null && first.thisNum !== ""
        ? String(first.thisNum)
        : (first.lastNum != null ? String(first.lastNum) : null);
      lastRecordTime = first.thisYmd || first.lastMrDate || null;
    }
  } catch (_) { /* 忽略 */ }

  // 服务单位 / 微信用户 (失败不影响主数据)
  let companyName: string | null = null;
  try {
    const ci = await callEncrypted("/api/companyInfo/curentInfo", {}, token);
    if (ci?.obj?.name) companyName = ci.obj.name;
  } catch (_) { /* 忽略 */ }

  return {
    balance: a.balance ?? b.presBalance ?? null,
    arrears: a.amt ?? a.allFee ?? null,
    consNo: b.consNo || a.consNo || consNo,
    consName: b.userName || a.yhmc || "",
    companyName,
    lastRecord,
    lastRecordTime,
  };
}

/* ---------------- 对外入口 ---------------- */

/**
 * 获取水费数据 (widget 与配置页共用)
 * - 缓存在 TTL 内直接命中, offline=false
 * - 联网失败回退旧缓存, offline=true
 * - 无任何数据返回 data=null
 */
export async function fetchGasInfo(force: boolean, settings: Settings): Promise<{ data: GasData | null; offline: boolean }> {
  const consNo = (settings.custCode || "").trim();
  const token = (settings.token || "").trim();
  const intervalMin = Math.min(1440, Math.max(15, Math.round(Number(settings.interval) || 360)));
  const cache = readCache(consNo);

  if (!consNo || !token) {
    return cache ? { data: cache, offline: true } : { data: null, offline: false };
  }

  if (!force && cache?._ts && Date.now() - cache._ts < intervalMin * 60 * 1000) {
    return { data: cache, offline: false };
  }

  try {
    const r = await queryBalance(token, consNo);
    if (r.balance === null || r.balance === undefined) throw new Error("接口返回异常状态");

    const now = new Date();
    const fresh: GasData = {
      countMoney: r.balance,
      newCountMoney: r.balance,
      oweMoney: r.arrears ?? undefined,
      custCode: r.consNo,
      custName: r.consName || settings.custName,
      compName: settings.customCompName || r.companyName || "成都市岷江自来水厂",
      lastRecord: r.lastRecord,
      lastRecordTime: r.lastRecordTime,
      _fetchTime: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      _fetchDate: `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      _ts: Date.now(),
    };
    writeCache(consNo, fresh);

    // 接口拿到户名/单位时回填设置 (仅当用户未手动配置)
    let changed = false;
    if (r.consName && !settings.custName) { settings.custName = r.consName; changed = true; }
    if (r.companyName && !settings.customCompName) { settings.customCompName = r.companyName; changed = true; }
    if (changed) saveSettings(settings);

    return { data: fresh, offline: false };
  } catch (e) {
    console.warn("[米家山水务] 联网失败, 回退缓存: " + e);
    if (cache) return { data: cache, offline: true };
    throw e;
  }
}

/* ---------------- 剪贴板智能解析 ---------------- */

const isJunkValue = (v: string): boolean => {
  if (!v) return true;
  if (v.length < 2 || v.length > 60) return true;
  if (/^(null|undefined|true|false|NaN)$/i.test(v)) return true;
  if (/[=;{}()<>[\]]/.test(v)) return true;
  if (/^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*/.test(v)) return true;
  if (/^[\w$]+\(/.test(v)) return true;
  return false;
};

/**
 * 从复制的 cURL / 请求头文本提取配置
 * 支持: token (JWT) / consNo / consName / compName
 */
export function parseClipboard(text: string): Partial<Settings> {
  const out: Partial<Settings> = {};
  const str = (text || "").trim();
  if (!str) return out;

  const tokenMatch =
    str.match(/token['":\s=]+([A-Za-z0-9._\-]{20,})/i) ||
    str.match(/\beyJ[A-Za-z0-9._\-]{20,}\.[A-Za-z0-9._\-]{20,}\.[A-Za-z0-9._\-]{10,}\b/);
  if (tokenMatch && tokenMatch[1]) out.token = tokenMatch[1].trim();

  const custMatch = str.match(/(?:consNo|consno|custCode|custcode)['":\s=]+([0-9]{6,12})/i);
  if (custMatch && custMatch[1]) out.custCode = custMatch[1].trim();

  const nameRegex = /(?:consName|consname|custName|custname)['":\s=]+([^'"&\r\n\s]+)/gi;
  let nMatch;
  while ((nMatch = nameRegex.exec(str)) !== null) {
    let rawName = nMatch[1].trim();
    try { rawName = decodeURIComponent(rawName); } catch (_) { /* 忽略 */ }
    rawName = rawName.replace(/['"]+$/, "");
    if (!isJunkValue(rawName) && !/^\d+$/.test(rawName)) {
      out.custName = rawName;
      break;
    }
  }

  const compMatch = str.match(/(?:compName|companyName|company|corpName)['":\s=]+([^'"&\r\n]+)/i);
  if (compMatch && compMatch[1]) {
    let rawComp = compMatch[1].trim();
    try { rawComp = decodeURIComponent(rawComp); } catch (_) { /* 忽略 */ }
    rawComp = rawComp.replace(/['"]+$/, "");
    if (!isJunkValue(rawComp) && /[\u4e00-\u9fa5]/.test(rawComp)) {
      out.customCompName = rawComp;
    }
  }

  return out;
}
