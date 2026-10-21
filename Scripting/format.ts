/**
 * 米家山水务 格式化与配色工具 (format.ts)
 * 由 Scriptable 版对应方法移植: formatMoney / formatCustCode / formatCompName /
 * getBalanceRatio / getCapsuleActiveCount / getBarColors(五色阶) / interpolateColor
 */
import type { Color } from "scripting";
import type { Settings, GasData } from "./store";

/** 低余额阈值 (元): 低于该值金额显示红色 */
export const LOW_BALANCE = 30;

/* ---------------- 数值 ---------------- */

export function toNumber(v: string | number | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^\d.\-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

export function formatMoney(num: string | number | null | undefined): string {
  const val = toNumber(num);
  return val.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 余额原始值: countMoney 优先, 0 是合法值不能用 || 兜底 */
export function balanceRaw(d: GasData): string | number {
  const has = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";
  if (has(d.countMoney)) return d.countMoney as string | number;
  if (has(d.newCountMoney)) return d.newCountMoney as string | number;
  return 0;
}

/* ---------------- 状态判断 ---------------- */

/** 是否欠费: oweMoney > 0 或余额为负 */
export function isOwe(d: GasData): boolean {
  if (toNumber(d.oweMoney) > 0) return true;
  return toNumber(balanceRaw(d)) < 0;
}

/* ---------------- 户号 / 单位名 ---------------- */

export function formatCustCode(settings: Settings, code: string | null | undefined, short?: boolean): string {
  const c = String(code ?? "").trim();
  if (!c) return "--";
  if (settings.maskCustCode) {
    return c.length >= 8 ? c.slice(0, 3) + "****" + c.slice(-2) : "****" + c.slice(-2);
  }
  if (short) return c.length > 5 ? c.slice(-5) : c;
  return c;
}

export function formatCompName(settings: Settings, name: string | null | undefined, _isFull?: boolean): string {
  if (settings.maskCompName) return "米家山水务";
  const raw = (name || settings.customCompName || "").trim();
  if (!raw || raw === "undefined" || raw === "null") return "米家山水务";
  return raw.replace(/自来水厂|自来水有限公司|有限责任公司|有限公司/g, "");
}

/* ---------------- 进度条 ---------------- */

/** 余额占满额基准比例 0~1; 欠费返回 0 */
export function getBalanceRatio(settings: Settings, d: GasData): number {
  if (isOwe(d)) return 0;
  const bal = toNumber(balanceRaw(d));
  if (bal <= 0) return 0;
  const maxLimit = toNumber(settings.balanceLimit) || 500;
  return Math.max(0, Math.min(1, bal / maxLimit));
}

/** 胶囊点亮格数: 欠费 1 格, 比例 0 时 0 格, 否则至少 1 格 */
export function getCapsuleActiveCount(settings: Settings, d: GasData, total: number): number {
  if (isOwe(d)) return 1;
  const ratio = getBalanceRatio(settings, d);
  if (ratio <= 0) return 0;
  return Math.max(1, Math.round(ratio * total));
}

/** 五色阶渐变色: 绿(≥80%) 青(60%) 黄(40%) 橙(20%) 红(<20%); 欠费深红 */
export function getBarColors(settings: Settings, ratio: number, owe: boolean): { start: Color; end: Color } {
  const single = (settings.themeColor || "#FF9500") as Color;
  if (!settings.useGradientBar) return { start: single, end: single };
  if (owe) return { start: "#EF4444" as Color, end: "#DC2626" as Color };
  if (ratio >= 0.8) return { start: "#10B981" as Color, end: "#34D399" as Color };
  if (ratio >= 0.6) return { start: "#06B6D4" as Color, end: "#22D3EE" as Color };
  if (ratio >= 0.4) return { start: "#EAB308" as Color, end: "#FACC15" as Color };
  if (ratio >= 0.2) return { start: "#F97316" as Color, end: "#FB923C" as Color };
  return { start: "#EF4444" as Color, end: "#F87171" as Color };
}

/** hex 线性插值: interpolateHex("#10B981", "#34D399", 0.5) */
export function interpolateHex(a: Color, b: Color, t: number): Color {
  const c1 = parseInt(String(a).replace("#", ""), 16);
  const c2 = parseInt(String(b).replace("#", ""), 16);
  if (Number.isNaN(c1) || Number.isNaN(c2)) return a;
  const r1 = (c1 >> 16) & 255, g1 = (c1 >> 8) & 255, b1 = c1 & 255;
  const r2 = (c2 >> 16) & 255, g2 = (c2 >> 8) & 255, b2 = c2 & 255;
  const k = Math.min(1, Math.max(0, t));
  const r = Math.round(r1 + (r2 - r1) * k);
  const g = Math.round(g1 + (g2 - g1) * k);
  const bl = Math.round(b1 + (b2 - b1) * k);
  return ("#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)) as Color;
}

/** 金额颜色: 欠费或余额低于阈值 → 红色 */
export function amountColor(d: GasData, balanceColor: Color): Color {
  return isOwe(d) || toNumber(balanceRaw(d)) < LOW_BALANCE ? "#EF4444" as Color : balanceColor;
}
