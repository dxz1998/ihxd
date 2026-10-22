/**
 * 米家山水务 API 链路 (从 Scriptable 版移植)
 * 流程: serverKey 协商 -> AES 加密请求 + RSA 加密 AES key -> RSA 解密响应 key -> AES 解密数据
 */
import { fetch } from "scripting";
import {
  b64encode, b64decode, b64urlToBigInt, strToBytes, bytesToStr,
  aes128EcbEncrypt, aes128EcbDecrypt, pkcs7Pad, pkcs7Unpad,
  rsaPublicEncrypt, rsaPrivateDecrypt, parseSpkiPub,
} from "./crypto";

export const CONFIG = {
  BASE_URL: "https://m.cdmjwater.com",
  FROM_DOMAIN_ID: "2",
  CONSNO: "121338748",
  // 抓包获取的 token (JWT)。重新抓包后替换, 或在脚本配置页中填写
  TOKEN:
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3OTI0MDA4MzkwMDAsInBheWxvYWQiOiJcImxkaTk0dnFFbXB4bENLdzNob0NobTlaTTdyUmZTdEk5dldNME14bS9tWjdjMlR3aFdybnBPdFZ5aVRnQWYyeGVvaUVRa3RiMUVHQkhHZlpiQnQyS1Q4aEowbTk0K241RFpuU3I3L2Yra0l1N2lhR1pOL1BhSTJWOVdZNk1rUFdGalowVHFDK2t2VmdTdktvT25XOGdYTGhrdDVoSnFsYjU3OWgrOG0zeWE3Zk1BNU5leDZBYjlMci95VXlCb3AxVk8zNWh6WjlabVdmeU1KY1V2dzVqUGRBNmJYM0hOaGNPaUdOQm1UZHNKTFhNZnI3eEg3VElxQkNjYUJtbE56eW1BZ3Z6UE5wdzFUQVN3dXU0L3A5dzJRPT1cIiJ9.xSClksjVlr74YX8wx7j93J9G4TyRJkbjr6JWVqbO3qM",
};

// 客户端固定 RSA-1024 密钥对 (用于解密服务端响应中的 AES key)
export const CLIENT_KEY = {
  PUB_SPKI_B64:
    "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCs7q1cdBwpVEUSRP1ha2KwhI59HpmnXS5g48CKQGy46HtexjzpGL3CAwQirbskqBrPXnzRLbUnESgTiJmgqG1MVbwYRtqqjTJ6VX+nK9Utz/cNLTcg/Xoz6LDZVKuZU9kglNOYAw7o4kM0sbJ4AxNms5h+x7cO3BwZX72cbsBuOwIDAQAB",
  N: "AKzurVx0HClURRJE_WFrYrCEjn0emaddLmDjwIpAbLjoe17GPOkYvcIDBCKtuySoGs9efNEttScRKBOImaCobUxVvBhG2qqNMnpVf6cr1S3P9w0tNyD9ejPosNlUq5lT2SCU05gDDujiQzSxsngDE2azmH7Htw7cHBlfvZxuwG47",
  D: "FjZqKi_31g8u-BPIgBTtDkNYkhW2IttDM8rNVnTEAlRKVHgeJsq4xQziIRozqZe2KeC3I589X5FClo-7O_mmYCuPzx3esYYws4QpBE3_oSw7sRdGSKNKl9PrCQJLIHLVWkQcJ8pbFuiew6wGn_QaIYAFWmUcDpk720_QeZjHQhE",
  E: "AQAB",
};

type AnyObj = Record<string, any>;

async function postJson(urlPath: string, bodyObj: unknown, headers: Record<string, string>): Promise<AnyObj> {
  const res = await fetch(CONFIG.BASE_URL + urlPath, {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers),
    body: JSON.stringify(bodyObj),
    timeout: 12,
    allowInsecureRequest: true,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as AnyObj;
}

function genAesKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** 加密调用: 与小程序相同的服务端加密协议 */
export async function callEncrypted(path: string, payload: unknown, token: string): Promise<AnyObj> {
  const commonHdrs = { token, fromDomainId: CONFIG.FROM_DOMAIN_ID, part: "WECHAT" };
  const sk = await postJson("/api/sec/serverKey", { key: CLIENT_KEY.PUB_SPKI_B64, data: "" }, commonHdrs);
  if (!sk || !sk.obj) throw new Error("协商失败");
  const secret = sk.obj.key;
  const serverPub = parseSpkiPub(sk.obj.data);
  const aesKeyStr = genAesKey();
  const aesKeyBytes = strToBytes(aesKeyStr);
  const encData = aes128EcbEncrypt(pkcs7Pad(strToBytes(JSON.stringify(payload))), aesKeyBytes);
  const encKey = rsaPublicEncrypt(strToBytes(aesKeyStr), serverPub.n, serverPub.e);
  const resp = await postJson(path, { key: b64encode(encKey), data: b64encode(encData) }, Object.assign({ secret }, commonHdrs));
  if (!resp || !resp.key || !resp.data) throw new Error("接口失败: " + JSON.stringify(resp).slice(0, 200));
  const aesKey2 = rsaPrivateDecrypt(b64decode(resp.key), b64urlToBigInt(CLIENT_KEY.N), b64urlToBigInt(CLIENT_KEY.D));
  const plain = JSON.parse(bytesToStr(pkcs7Unpad(aes128EcbDecrypt(b64decode(resp.data), aesKey2))));
  if (plain.success === false) throw new Error(plain.msg || "接口返回失败");
  return plain;
}

export interface BillRecord {
  /** 抄表日期 (YYYY-MM-DD) */
  date: string;
  /** 该期抄表读数 */
  reading: string;
  /** 该期用量 (m³), 由相邻两期读数差得出; 首期无上期读数时为空 */
  usage: string | null;
}

export interface BalanceResult {
  balance: number | string | null;
  arrears: number | string | null;
  lastBalance: number | string | null;
  consNo: string;
  consName: string;
  gasPropName: string;
  gasAddress: string;
  preBalanceTime: string | null;
  lastRecord: string | null;
  lastRecordTime: string | null;
  companyName: string | null;
  wechatUserId: string | null;
  /** 历史抄表/账单记录, 按日期倒序 */
  bills: BillRecord[];
  updatedAt: number;
}

/** 查询余额 / 欠费 / 抄表信息 */
export async function queryBalance(token: string, consNo: string): Promise<BalanceResult> {
  const ar = await callEncrypted("/api/micro/bill/arrearage", { consNo }, token);
  const ac = await callEncrypted("/api/micro/bill/accountInfo", { consNo }, token);
  const a = ar.obj || {}, b = ac.obj || {};
  // 抄表记录: 取最新一条 + 整理历史账单
  let lastRecord: string | null = null;
  let lastRecordTime: string | null = null;
  let bills: BillRecord[] = [];
  try {
    const mr = await callEncrypted("/api/micro/readMeter/mrInfo", { consNo, pageNo: 1, pageSize: 12 }, token);
    if (mr && Array.isArray(mr.obj) && mr.obj.length > 0) {
      const first = mr.obj[0];
      lastRecord = first.thisNum != null && first.thisNum !== "" ? String(first.thisNum) : (first.lastNum != null ? String(first.lastNum) : null);
      lastRecordTime = first.thisYmd || first.lastMrDate || null;
      bills = buildBills(mr.obj);
    }
  } catch (_) {
    // 抄表接口失败不影响余额展示
  }
  // 用 token 提取服务单位 / 微信用户ID (失败不影响主数据)
  let companyName: string | null = null;
  let wechatUserId: string | null = null;
  try {
    const ci = await callEncrypted("/api/companyInfo/curentInfo", {}, token);
    if (ci && ci.obj && ci.obj.name) companyName = ci.obj.name;
  } catch (_) {}
  try {
    const ui = await callEncrypted("/api/my/getUserInfo", {}, token);
    if (ui && ui.obj && ui.obj.weixinAccount) wechatUserId = ui.obj.weixinAccount;
  } catch (_) {}
  return {
    balance: a.balance ?? b.presBalance ?? null,
    arrears: a.amt ?? a.allFee ?? null,
    lastBalance: a.lastBalance ?? null,
    consNo: b.consNo || a.consNo || consNo,
    consName: b.userName || a.yhmc || "",
    gasPropName: b.gasPropName || "",
    gasAddress: b.gasAddress || a.yhdz || "",
    preBalanceTime: a.preBalanceTime || null,
    lastRecord: lastRecord,
    lastRecordTime: lastRecordTime,
    companyName: companyName,
    wechatUserId: wechatUserId,
    bills: bills,
    updatedAt: Date.now(),
  };
}

/**
 * 把抄表列表整理成账单列表 (按日期倒序)。
 * 接口每期通常自带用量/金额字段, 字段名众多, 这里依次尝试;
 * 都取不到时用相邻两期读数差推导用量。
 */
function buildBills(rows: any[]): BillRecord[] {
  const pickNum = (o: any): string | null => {
    const keys = ["thisNum", "curNum", "thisRead", "readNum"];
    for (const k of keys) {
      if (o[k] !== null && o[k] !== undefined && String(o[k]).trim() !== "") return String(o[k]);
    }
    return null;
  };
  const pickDate = (o: any): string | null => {
    const raw = o.thisYmd || o.lastMrDate || o.mrDate || o.readDate || o.ymd || o.date;
    if (!raw) return null;
    const s = String(raw).trim();
    // 时间戳 (10 位秒 / 13 位毫秒)
    if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000).toISOString().slice(0, 10);
    if (/^\d{13}$/.test(s)) return new Date(Number(s)).toISOString().slice(0, 10);
    // 2026-09-28 / 20260928 / 2026/09/28
    const m = s.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return s;
  };
  const pickUsage = (o: any): string | null => {
    const keys = ["thisUse", "useNum", "thisAmount", "amount", "num", "use"];
    for (const k of keys) {
      if (o[k] !== null && o[k] !== undefined && String(o[k]).trim() !== "") {
        const n = parseFloat(String(o[k]));
        if (!Number.isNaN(n)) return String(n);
      }
    }
    return null;
  };

  const items = rows
    .map((o, i) => ({
      idx: i,
      date: pickDate(o),
      reading: pickNum(o),
      usage: pickUsage(o),
    }))
    .filter((x): x is { idx: number; date: string; reading: string | null; usage: string | null } => !!x.date)
    .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : x.idx - y.idx));

  return items.map((it, i) => {
    let usage = it.usage;
    // 无自带用量时, 用 (本期读数 - 下一期/上期读数) 推导
    if (usage === null && it.reading !== null) {
      const prev = items[i + 1]; // 更早的一期
      if (prev && prev.reading !== null) {
        const cur = parseFloat(it.reading);
        const old = parseFloat(prev.reading);
        if (!Number.isNaN(cur) && !Number.isNaN(old) && cur >= old) {
          usage = (Math.round((cur - old) * 100) / 100).toString();
        }
      }
    }
    return { date: it.date, reading: it.reading ?? "--", usage };
  });
}
