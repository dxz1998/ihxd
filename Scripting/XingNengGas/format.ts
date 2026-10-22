/**
 * 展示层共用工具: 金额格式化 / 脱敏 / 色阶算法
 */
import { type Color } from "scripting";
import { GasData, Settings } from "./store";

export function formatMoney(num: number | string | null | undefined): string {
  const val = parseFloat(String(num ?? "0"));
  if (isNaN(val)) return "0.00";
  return val.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatCustCode(s: Settings, code: string | null | undefined, isShort = false): string {
  const c = String(code || "");
  if (!c) return "--";
  if (s.maskCustCode) {
    if (c.length >= 8) return c.slice(0, 3) + "****" + c.slice(-2);
    return "****" + c.slice(-2);
  }
  if (isShort) return c.length > 5 ? c.slice(-5) : c;
  return c;
}

export function formatCompName(s: Settings, name: string | null | undefined, isFull = false): string {
  const raw = String(name || "").trim();
  if (s.maskCompName) return "兴能燃气";
  if (!raw || raw === "undefined" || raw === "null") return "兴能燃气";
  if (isFull) return raw;
  return raw.replace(/城市燃气发展有限公司|燃气发展有限公司|有限责任公司|有限公司/g, "");
}

export function isOwe(d: GasData | null): boolean {
  if (!d) return false;
  return !!d.oweMoney && parseFloat(String(d.oweMoney)) > 0;
}

/** 余额占基准比例 */
export function getBalanceRatio(s: Settings, d: GasData | null): number {
  if (!d) return 0;
  if (isOwe(d)) return 0;
  const bal = parseFloat(String(d.countMoney || d.newCountMoney || "0"));
  if (isNaN(bal) || bal <= 0) return 0;
  const maxLimit = parseFloat(s.balanceLimit) || 500;
  return Math.max(0, Math.min(1.0, bal / maxLimit));
}

/** 胶囊点亮格数 */
export function getCapsuleActiveCount(s: Settings, d: GasData | null, totalSegments = 10): number {
  if (isOwe(d)) return 1;
  const ratio = getBalanceRatio(s, d);
  if (ratio <= 0) return 0;
  return Math.max(1, Math.round(ratio * totalSegments));
}

/** 色阶渐变 (绿->青->黄->橙->红) */
export function getBarColors(s: Settings, ratio: number, owe: boolean): { start: Color; end: Color } {
  if (!s.useGradientBar) {
    const single = (s.themeColor || "#FF9500") as Color;
    return { start: single, end: single };
  }
  if (owe) return { start: "#EF4444", end: "#DC2626" };
  if (ratio >= 0.8) return { start: "#10B981", end: "#34D399" };
  if (ratio >= 0.6) return { start: "#06B6D4", end: "#22D3EE" };
  if (ratio >= 0.4) return { start: "#EAB308", end: "#FACC15" };
  if (ratio >= 0.2) return { start: "#F97316", end: "#FB923C" };
  return { start: "#EF4444", end: "#F87171" };
}

/** 颜色线性插值 (hex) */
export function interpolateHex(color1Hex: string, color2Hex: string, factor: number): Color {
  try {
    const c1 = parseInt(color1Hex.replace("#", ""), 16);
    const c2 = parseInt(color2Hex.replace("#", ""), 16);
    const r1 = (c1 >> 16) & 255, g1 = (c1 >> 8) & 255, b1 = c1 & 255;
    const r2 = (c2 >> 16) & 255, g2 = (c2 >> 8) & 255, b2 = c2 & 255;
    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);
    return ("#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)) as Color;
  } catch (_) {
    return color1Hex as Color;
  }
}
