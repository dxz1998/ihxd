/**
 * 米家山水务 设置与缓存存储 (基于 Scripting 全局 Storage，App 与小组件共享)
 */
import { CONFIG, queryBalance, BalanceResult, BillRecord } from "./api";

export interface Settings {
  custCode: string;       // 水费户号
  custName: string;       // 客户姓名
  userId: string;         // 微信用户ID (可留空)
  customCompName: string; // 服务单位
  alias: string;          // 组件别名
  xMasAppInfo: string;    // 登录凭证 token (JWT)
  interval: string;       // 刷新间隔(分钟)
  balanceLimit: string;   // 满额基准(元)
  useGradientBar: boolean; // 进度条渐变色
  maskCustCode: boolean;  // 户号脱敏
  maskCompName: boolean;  // 服务单位脱敏
  themeColor: string;     // 品牌强调色
  balanceColor: string;   // 余额主题色
}

export interface GasData {
  countMoney: number | string | null;
  newCountMoney: number | string | null;
  oweMoney: number | string | null;
  lastBalance?: number | string | null;
  custCode: string;
  custName: string;
  compName: string;
  gasPropName: string;
  gasAddress: string;
  lastRecord: string | null;
  lastRecordTime: string | null;
  /** 历史账单 (按日期倒序) */
  bills?: BillRecord[];
  _fetchTime?: string;
  _fetchDate?: string;
  _updateTimestamp?: number;
}

// 与兴能燃气区分开, 两套脚本可同时存在
const SETTINGS_KEY = "mj-water.settings";
const CACHE_KEY = "mj-water.cache";
// 用共享域: index.tsx (App) 与 widget.tsx (组件进程) 一定能读到同一份配置与缓存
const SHARED = { shared: true };

export function defaultSettings(): Settings {
  return {
    custCode: CONFIG.CONSNO,
    custName: "",
    userId: "",
    customCompName: "",
    alias: "米家山水务",
    xMasAppInfo: "",
    interval: "360",
    balanceLimit: "500",
    useGradientBar: true,
    maskCustCode: false,
    maskCompName: false,
    themeColor: "#0EA5E9",
    balanceColor: "#10B981",
  };
}

export function loadSettings(): Settings {
  const s = Storage.get<Partial<Settings>>(SETTINGS_KEY, SHARED);
  const d = defaultSettings();
  if (!s) return d;
  const merged: Settings = { ...d, ...s } as Settings;
  merged.useGradientBar = merged.useGradientBar !== false;
  merged.maskCustCode = merged.maskCustCode === true;
  merged.maskCompName = merged.maskCompName === true;
  return merged;
}

export function saveSettings(s: Settings) {
  Storage.set(SETTINGS_KEY, s, SHARED);
}

export function loadCache(): GasData | null {
  return Storage.get<GasData>(CACHE_KEY, SHARED) ?? null;
}

export function saveCache(d: GasData) {
  Storage.set(CACHE_KEY, d, SHARED);
}

export function clearCache() {
  Storage.remove(CACHE_KEY, SHARED);
}

/** 登录凭据: 设置中的 token 优先, 否则用内置抓包 token */
export function getToken(s: Settings): string {
  const t = (s.xMasAppInfo || "").trim();
  return t || CONFIG.TOKEN;
}

export interface FetchResult {
  data: GasData | null;
  offline: boolean;
  error: string | null;
  settings: Settings;
}

/** 核心: 拉取水费数据 (含缓存间隔与离线回退) */
export async function fetchGasInfo(force: boolean, settings?: Settings): Promise<FetchResult> {
  const s = settings ?? loadSettings();
  const consNo = (s.custCode || "").trim();
  const token = getToken(s);

  let cachedData: GasData | null = loadCache();
  if (cachedData && typeof cachedData === "object" && cachedData.countMoney === undefined) cachedData = null;

  if (!consNo || !token) {
    if (cachedData) return { data: cachedData, offline: true, error: null, settings: s };
    return { data: null, offline: false, error: null, settings: s };
  }

  const intervalMin = parseInt(s.interval) || 360;
  if (!force && cachedData && cachedData._updateTimestamp) {
    const elapsedMin = Math.floor((Date.now() - cachedData._updateTimestamp) / 1000 / 60);
    if (elapsedMin >= 0 && elapsedMin < intervalMin) {
      return { data: cachedData, offline: false, error: null, settings: s };
    }
  }

  try {
    const result: BalanceResult = await queryBalance(token, consNo);
    if (!result || result.balance === null || result.balance === undefined) {
      throw new Error("接口返回异常状态");
    }
    const gasData: GasData = {
      countMoney: result.balance,
      newCountMoney: result.balance,
      oweMoney: result.arrears,
      lastBalance: result.lastBalance,
      custCode: result.consNo,
      custName: result.consName,
      compName: s.customCompName || result.companyName || detectCompanyName(result) || "成都市岷江自来水厂",
      gasPropName: result.gasPropName,
      gasAddress: result.gasAddress,
      lastRecord: result.lastRecord,
      lastRecordTime: result.lastRecordTime,
      bills: result.bills,
    };

    // token 自动提取: 户名 / 服务单位 / 微信用户ID (仅在未配置或明显非法时回填)
    const isBadName = (v: string) => !v || /[=;{}()]/.test(v) || !/^[\u4e00-\u9fa5A-Za-z*·\s]{2,20}$/.test(v);
    const isBadComp = (v: string) => !v || /[=;{}]/.test(v) || !/^[\u4e00-\u9fa5A-Za-z0-9（）()]{4,40}$/.test(v);
    let settingsChanged = false;
    if (result.consName && isBadName(s.custName)) {
      s.custName = result.consName;
      settingsChanged = true;
    }
    if (result.companyName && isBadComp(s.customCompName)) {
      s.customCompName = result.companyName;
      settingsChanged = true;
    }
    if (result.wechatUserId && isBadName(s.userId)) {
      s.userId = result.wechatUserId;
      settingsChanged = true;
    }
    if (settingsChanged) saveSettings(s);

    const dateObj = new Date();
    gasData._fetchTime = dateObj.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    gasData._fetchDate = dateObj.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
    gasData._updateTimestamp = Date.now();

    saveCache(gasData);
    return { data: gasData, offline: false, error: null, settings: s };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (cachedData) return { data: cachedData, offline: true, error: msg, settings: s };
    return { data: null, offline: false, error: msg, settings: s };
  }
}

function detectCompanyName(obj: object): string {
  try {
    for (const v of Object.values(obj)) {
      if (typeof v === "string" && (v.includes("水") || v.includes("自来水") || v.includes("公司")) && !v.includes("http") && v.length < 50) {
        return v.trim();
      }
    }
  } catch (_) {}
  return "";
}
