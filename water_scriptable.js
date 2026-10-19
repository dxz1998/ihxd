/**
 * 组件名称: 米家山水务 (Mijia Water)
 * 版本号: v1.8.3
 * 依赖框架: DmYY
 * 使用说明: 根据 UI 账户设置教程
 */

if (typeof require === 'undefined') require = importModule;
const { DmYY, Runing } = require('./DmYY');

// ============================================================
// 米家山水务核心: 纯JS RSA-1024 + AES-128-ECB/Pkcs7 加密查询
// (已验证: serverKey 协商 -> 加密请求 -> 解密响应)
// ============================================================
const CONFIG = {
  BASE_URL: 'https://m.cdmjwater.com',
  FROM_DOMAIN_ID: '2',
  CONSNO: '121338748',
  // ↓ 抓包获取的 token (JWT)。每次重新抓包后替换
  // 也支持在 Scriptable 中运行脚本 -> "填写 Token" 存到钥匙串
  TOKEN: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3OTI0MDA4MzkwMDAsInBheWxvYWQiOiJcImxkaTk0dnFFbXB4bENLdzNob0NobTlaTTdyUmZTdEk5dldNME14bS9tWjdjMlR3aFdybnBPdFZ5aVRnQWYyeGVvaUVRa3RiMUVHQkhHZlpiQnQyS1Q4aEowbTk0K241RFpuU3I3L2Yra0l1N2lhR1pOL1BhSTJWOVdZNk1rUFdGalowVHFDK2t2VmdTdktvT25XOGdYTGhrdDVoSnFsYjU3OWgrOG0zeWE3Zk1BNU5leDZBYjlMci95VXlCb3AxVk8zNWh6WjlabVdmeU1KY1V2dzVqUGRBNmJYM0hOaGNPaUdOQm1UZHNKTFhNZnI3eEg3VElxQkNjYUJtbE56eW1BZ3Z6UE5wdzFUQVN3dXU0L3A5dzJRPT1cIiJ9.xSClksjVlr74YX8wx7j93J9G4TyRJkbjr6JWVqbO3qM',
};
// 客户端固定 RSA-1024 密钥对 (仅存于本脚本, 用于解密服务端响应)
const CLIENT_KEY = {
  PUB_SPKI_B64: 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCs7q1cdBwpVEUSRP1ha2KwhI59HpmnXS5g48CKQGy46HtexjzpGL3CAwQirbskqBrPXnzRLbUnESgTiJmgqG1MVbwYRtqqjTJ6VX+nK9Utz/cNLTcg/Xoz6LDZVKuZU9kglNOYAw7o4kM0sbJ4AxNms5h+x7cO3BwZX72cbsBuOwIDAQAB',
  N: 'AKzurVx0HClURRJE_WFrYrCEjn0emaddLmDjwIpAbLjoe17GPOkYvcIDBCKtuySoGs9efNEttScRKBOImaCobUxVvBhG2qqNMnpVf6cr1S3P9w0tNyD9ejPosNlUq5lT2SCU05gDDujiQzSxsngDE2azmH7Htw7cHBlfvZxuwG47',
  D: 'FjZqKi_31g8u-BPIgBTtDkNYkhW2IttDM8rNVnTEAlRKVHgeJsq4xQziIRozqZe2KeC3I589X5FClo-7O_mmYCuPzx3esYYws4QpBE3_oSw7sRdGSKNKl9PrCQJLIHLVWkQcJ8pbFuiew6wGn_QaIYAFWmUcDpk720_QeZjHQhE',
  E: 'AQAB',
};
// 钥匙串键名 (存 Token / 缓存 / 设置)
const KEYCHAIN = {
  TOKEN: 'mj-water.token',
  CACHE: 'mj-water.cache',
  SETTINGS: 'mj-water.settings',
};
// ================================

// ================= 纯JS 基础工具 =================
const B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64encode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64C[b0 >> 2];
    out += B64C[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? '=' : B64C[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? '=' : B64C[b2 & 63];
  }
  return out;
}
function b64decode(str) {
  const table = {};
  for (let i = 0; i < 64; i++) table[B64C[i]] = i;
  const out = [];
  let buf = 0, bits = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '=' || c === '\n' || c === '\r') continue;
    const v = table[c];
    if (v === undefined) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); }
  }
  return new Uint8Array(out);
}
function bytesToBigInt(bytes) {
  let hex = '0x';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return BigInt(hex);
}
function bigIntToBytesFixed(v, len) {
  const out = new Uint8Array(len);
  let x = BigInt(v);
  for (let i = len - 1; i >= 0; i--) { out[i] = Number(x & 0xffn); x >>= 8n; }
  return out;
}
function b64urlToBigInt(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return bytesToBigInt(b64decode(b64 + '='.repeat((4 - b64.length % 4) % 4)));
}
function modPow(base, exp, mod) {
  let r = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return r;
}
function strToBytes(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const lo = s.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00); i++; }
      else c = 0xfffd;
    } else if (c >= 0xdc00 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return new Uint8Array(out);
}
function bytesToStr(b) {
  let out = '', i = 0;
  while (i < b.length) {
    const c = b[i];
    if (c < 0x80) { out += String.fromCharCode(c); i++; }
    else if ((c & 0xe0) === 0xc0 && i + 1 < b.length) {
      out += String.fromCharCode(((c & 0x1f) << 6) | (b[i + 1] & 0x3f)); i += 2;
    } else if ((c & 0xf0) === 0xe0 && i + 2 < b.length) {
      out += String.fromCharCode(((c & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f)); i += 3;
    } else if ((c & 0xf8) === 0xf0 && i + 3 < b.length) {
      const cp = ((c & 0x07) << 18) | ((b[i + 1] & 0x3f) << 12) | ((b[i + 2] & 0x3f) << 6) | (b[i + 3] & 0x3f);
      out += String.fromCodePoint(cp); i += 4;
    } else { i++; }
  }
  return out;
}

// ================= 纯JS AES-128-ECB/Pkcs7 =================
function gfMul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}
function gfPow(base, exp) {
  let r = 1;
  while (exp > 0) {
    if (exp & 1) r = gfMul(r, base);
    base = gfMul(base, base);
    exp >>= 1;
  }
  return r;
}
function gfInv(a) { return gfPow(a, 254); }
function affine(inv) {
  let res = 0;
  for (let i = 0; i < 8; i++) {
    const bit = ((inv >> i) & 1) ^ ((inv >> ((i + 4) % 8)) & 1) ^ ((inv >> ((i + 5) % 8)) & 1) ^ ((inv >> ((i + 6) % 8)) & 1) ^ ((inv >> ((i + 7) % 8)) & 1) ^ ((0x63 >> i) & 1);
    res |= bit << i;
  }
  return res;
}
const SBOX = (() => {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i === 0 ? 0x63 : affine(gfInv(i));
  return s;
})();
const INV_SBOX = (() => { const inv = new Uint8Array(256); for (let i = 0; i < 256; i++) inv[SBOX[i]] = i; return inv; })();
function keyExpansion(key) {
  const Nk = 4, Nr = 10;
  const w = new Uint8Array(4 * (Nr + 1) * 4);
  const Rcon = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
  for (let i = 0; i < 4 * Nk; i++) w[i] = key[i];
  let temp = new Uint8Array(4);
  for (let i = Nk; i < 4 * (Nr + 1); i++) {
    for (let j = 0; j < 4; j++) temp[j] = w[(i - 1) * 4 + j];
    if (i % Nk === 0) {
      const t0 = temp[0];
      temp[0] = temp[1]; temp[1] = temp[2]; temp[2] = temp[3]; temp[3] = t0;
      for (let j = 0; j < 4; j++) temp[j] = SBOX[temp[j]];
      temp[0] ^= Rcon[i / Nk - 1];
    }
    for (let j = 0; j < 4; j++) w[i * 4 + j] = w[(i - Nk) * 4 + j] ^ temp[j];
  }
  return w;
}
function addRoundKey(s, rk, r) { for (let i = 0; i < 16; i++) s[i] ^= rk[r * 16 + i]; }
function subBytes(s, box) { for (let i = 0; i < 16; i++) s[i] = box[s[i]]; }
function shiftRows(s) { const t = s.slice(); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s[c * 4 + r] = t[((c + r) % 4) * 4 + r]; }
function invShiftRows(s) { const t = s.slice(); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s[c * 4 + r] = t[((c - r + 4) % 4) * 4 + r]; }
function mixColumns(s) {
  for (let c = 0; c < 4; c++) {
    const i = c * 4;
    const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
    s[i] = gfMul(a0, 2) ^ gfMul(a1, 3) ^ a2 ^ a3;
    s[i + 1] = a0 ^ gfMul(a1, 2) ^ gfMul(a2, 3) ^ a3;
    s[i + 2] = a0 ^ a1 ^ gfMul(a2, 2) ^ gfMul(a3, 3);
    s[i + 3] = gfMul(a0, 3) ^ a1 ^ a2 ^ gfMul(a3, 2);
  }
}
function invMixColumns(s) {
  for (let c = 0; c < 4; c++) {
    const i = c * 4;
    const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
    s[i] = gfMul(a0, 14) ^ gfMul(a1, 11) ^ gfMul(a2, 13) ^ gfMul(a3, 9);
    s[i + 1] = gfMul(a0, 9) ^ gfMul(a1, 14) ^ gfMul(a2, 11) ^ gfMul(a3, 13);
    s[i + 2] = gfMul(a0, 13) ^ gfMul(a1, 9) ^ gfMul(a2, 14) ^ gfMul(a3, 11);
    s[i + 3] = gfMul(a0, 11) ^ gfMul(a1, 13) ^ gfMul(a2, 9) ^ gfMul(a3, 14);
  }
}
function encryptBlock(block, w) {
  const s = block.slice();
  addRoundKey(s, w, 0);
  for (let r = 1; r < 10; r++) { subBytes(s, SBOX); shiftRows(s); mixColumns(s); addRoundKey(s, w, r); }
  subBytes(s, SBOX); shiftRows(s); addRoundKey(s, w, 10);
  return s;
}
function decryptBlock(block, w) {
  const s = block.slice();
  addRoundKey(s, w, 10);
  for (let r = 9; r >= 1; r--) { invShiftRows(s); subBytes(s, INV_SBOX); addRoundKey(s, w, r); invMixColumns(s); }
  invShiftRows(s); subBytes(s, INV_SBOX); addRoundKey(s, w, 0);
  return s;
}
function aes128EcbEncrypt(plainBytes, keyBytes) {
  const w = keyExpansion(keyBytes);
  const out = [];
  for (let i = 0; i < plainBytes.length; i += 16) {
    const block = new Uint8Array(16);
    block.set(plainBytes.subarray(i, i + 16));
    out.push(...encryptBlock(block, w));
  }
  return new Uint8Array(out);
}
function aes128EcbDecrypt(cipherBytes, keyBytes) {
  const w = keyExpansion(keyBytes);
  const out = [];
  for (let i = 0; i < cipherBytes.length; i += 16) {
    const block = new Uint8Array(16);
    block.set(cipherBytes.subarray(i, i + 16));
    out.push(...decryptBlock(block, w));
  }
  return new Uint8Array(out);
}
function pkcs7Pad(data) {
  const pad = 16 - (data.length % 16);
  const out = new Uint8Array(data.length + pad);
  out.set(data);
  for (let i = 0; i < pad; i++) out[data.length + i] = pad;
  return out;
}
function pkcs7Unpad(data) {
  const pad = data[data.length - 1];
  if (pad < 1 || pad > 16) throw new Error('非法PKCS7填充');
  return data.subarray(0, data.length - pad);
}

// ================= 纯JS RSA (PKCS1 v1.5) =================
function rsaPublicEncrypt(messageBytes, n, e) {
  const k = 128;
  if (messageBytes.length > k - 11) throw new Error('消息过长');
  const em = new Uint8Array(k);
  em[0] = 0x00; em[1] = 0x02;
  const psLen = k - messageBytes.length - 3;
  for (let i = 0; i < psLen; i++) em[2 + i] = Math.floor(Math.random() * 255) + 1;
  em[k - messageBytes.length - 1] = 0x00;
  em.set(messageBytes, k - messageBytes.length);
  return bigIntToBytesFixed(modPow(bytesToBigInt(em), e, n), k);
}
function rsaPrivateDecrypt(cipherBytes, n, d) {
  const k = 128;
  const m = modPow(bytesToBigInt(cipherBytes), d, n);
  const em = bigIntToBytesFixed(m, k);
  if (em[0] !== 0x00 || em[1] !== 0x02) throw new Error('RSA填充错误');
  let i = 2;
  while (i < k && em[i] !== 0x00) i++;
  if (i >= k) throw new Error('RSA无分隔符');
  return em.subarray(i + 1);
}
function parseSpkiPub(b64) {
  const der = b64decode(b64);
  const readLen = (p) => {
    if (!(der[p] & 0x80)) return { len: der[p], next: p + 1 };
    const n = der[p] & 0x7f;
    let v = 0;
    for (let j = 0; j < n; j++) v = v * 256 + der[p + 1 + j];
    return { len: v, next: p + 1 + n };
  };
  let i = 0;
  if (der[i++] !== 0x30) throw new Error('SPKI头错误');
  i = readLen(i).next;
  if (der[i++] !== 0x30) throw new Error('算法头错误');
  const algLen = readLen(i); i = algLen.next + algLen.len;
  if (der[i++] !== 0x03) throw new Error('BIT STRING错误');
  const bsLen = readLen(i); i = bsLen.next + bsLen.len;
  let j = i - bsLen.len;
  if (der[j] !== 0x00) throw new Error('BIT STRING padding错误');
  j += 1;
  if (der[j++] !== 0x30) throw new Error('内部序列错误');
  j = readLen(j).next;
  if (der[j++] !== 0x02) throw new Error('n错误');
  const nLen = readLen(j); const nBytes = der.subarray(nLen.next, nLen.next + nLen.len);
  j = nLen.next + nLen.len;
  if (der[j++] !== 0x02) throw new Error('e错误');
  const eLen = readLen(j); const eBytes = der.subarray(eLen.next, eLen.next + eLen.len);
  return { n: bytesToBigInt(nBytes), e: bytesToBigInt(eBytes) };
}

// ================= 业务流程 =================
function genAesKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function getToken() {
  try { if (Keychain.contains(KEYCHAIN.TOKEN)) { const t = Keychain.get(KEYCHAIN.TOKEN).trim(); if (t) return t; } } catch (_) {}
  return CONFIG.TOKEN;
}
async function postJson(urlPath, bodyObj, headers) {
  const req = new Request(CONFIG.BASE_URL + urlPath);
  req.method = 'POST';
  req.timeoutInterval = 12;
  req.headers = Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers);
  req.body = JSON.stringify(bodyObj);
  return await req.loadJSON();
}
async function callEncrypted(path, payload, token) {
  const commonHdrs = { token, fromDomainId: CONFIG.FROM_DOMAIN_ID, part: 'WECHAT' };
  const sk = await postJson('/api/sec/serverKey', { key: CLIENT_KEY.PUB_SPKI_B64, data: '' }, commonHdrs);
  if (!sk || !sk.obj) throw new Error('协商失败');
  const secret = sk.obj.key;
  const serverPub = parseSpkiPub(sk.obj.data);
  const aesKeyStr = genAesKey();
  const aesKeyBytes = strToBytes(aesKeyStr);
  const encData = aes128EcbEncrypt(pkcs7Pad(strToBytes(JSON.stringify(payload))), aesKeyBytes);
  const encKey = rsaPublicEncrypt(strToBytes(aesKeyStr), serverPub.n, serverPub.e);
  const resp = await postJson(path, { key: b64encode(encKey), data: b64encode(encData) }, Object.assign({ secret }, commonHdrs));
  if (!resp || !resp.key || !resp.data) throw new Error('接口失败: ' + JSON.stringify(resp).slice(0, 200));
  const aesKey2 = rsaPrivateDecrypt(b64decode(resp.key), b64urlToBigInt(CLIENT_KEY.N), b64urlToBigInt(CLIENT_KEY.D));
  const plain = JSON.parse(bytesToStr(pkcs7Unpad(aes128EcbDecrypt(b64decode(resp.data), aesKey2))));
  if (plain.success === false) throw new Error(plain.msg || '接口返回失败');
  return plain;
}
async function queryBalance(token, consNo) {
  const ar = await callEncrypted('/api/micro/bill/arrearage', { consNo }, token);
  const ac = await callEncrypted('/api/micro/bill/accountInfo', { consNo }, token);
  const a = ar.obj || {}, b = ac.obj || {};
  // 抄表记录: 取最新一条 (pageNo=1 首页第一条即最近抄表)
  let lastRecord = null;
  let lastRecordTime = null;
  try {
    const mr = await callEncrypted('/api/micro/readMeter/mrInfo', { consNo, pageNo: 1, pageSize: 10 }, token);
    if (mr && Array.isArray(mr.obj) && mr.obj.length > 0) {
      const first = mr.obj[0];
      lastRecord = first.thisNum != null && first.thisNum !== '' ? String(first.thisNum) : (first.lastNum != null ? String(first.lastNum) : null);
      lastRecordTime = first.thisYmd || first.lastMrDate || null;
    }
  } catch (_) {
    // 抄表接口失败不影响余额展示
  }
  // 用 token 提取服务单位 / 微信用户ID (失败不影响主数据)
  let companyName = null;
  let wechatUserId = null;
  try {
    const ci = await callEncrypted('/api/companyInfo/curentInfo', {}, token);
    if (ci && ci.obj && ci.obj.name) companyName = ci.obj.name;
  } catch (_) {}
  try {
    const ui = await callEncrypted('/api/my/getUserInfo', {}, token);
    if (ui && ui.obj && ui.obj.weixinAccount) wechatUserId = ui.obj.weixinAccount;
  } catch (_) {}
  return {
    balance: a.balance ?? b.presBalance ?? null,
    arrears: a.amt ?? a.allFee ?? null,
    lastBalance: a.lastBalance ?? null,
    consNo: b.consNo || a.consNo || consNo,
    consName: b.userName || a.yhmc || '',
    gasPropName: b.gasPropName || '',
    gasAddress: b.gasAddress || a.yhdz || '',
    preBalanceTime: a.preBalanceTime || null,
    lastRecord: lastRecord,
    lastRecordTime: lastRecordTime,
    companyName: companyName,
    wechatUserId: wechatUserId,
    updatedAt: Date.now(),
  };
}

// ============================================================
// 米家山水务小组件 (基于 ChinaGas v1.8.3 原版, 仅替换核心数据)
// 依赖框架: DmYY
// 使用说明: 根据 UI 账户设置教程
// ============================================================

class Widget extends DmYY {
  version = '1.8.3';

  SCALE = 1;
  gasData = null;
  isOffline = false;

  constructor(arg) {
    super(arg);
    this.name = '米家山水务';
    this.en = 'MijiaWaterGas';
    this.logo = 'https://raw.githubusercontent.com/anker1209/Scriptable/main/icon/water.png';
    this.fm = FileManager.local();
    this.cachePath = this.fm.joinPath(this.fm.documentsDirectory(), 'MijiaWaterGas_Cache');

    if (typeof this.Run === 'function') {
      this.Run();
    }
  }

  loadCache(key) {
    try {
      const file = this.fm.joinPath(this.cachePath, key);
      if (this.fm.fileExists(file)) {
        return this.fm.readString(file);
      }
    } catch (_) {}
    return null;
  }

  saveCache(key, content) {
    try {
      if (!this.fm.fileExists(this.cachePath)) {
        this.fm.createDirectory(this.cachePath, true);
      }
      const file = this.fm.joinPath(this.cachePath, key);
      this.fm.writeString(file, content);
    } catch (_) {}
  }

  readStorage(key) {
    return this.loadCache(key);
  }

  writeStorage(key, content) {
    return this.saveCache(key, content);
  }

  clearStorage() {
    try {
      if (this.fm.fileExists(this.cachePath)) {
        this.fm.remove(this.cachePath);
      }
    } catch (_) {}
  }

  async init() {
    this.settings.alias = this.settings.alias || '米家山水务';
    this.settings.themeColor = this.settings.themeColor || '#FF9500';
    this.settings.balanceColor = this.settings.balanceColor || '#10B981';
    this.settings.interval = this.settings.interval || '360';
    this.settings.balanceLimit = this.settings.balanceLimit || '500';
    if (this.settings.useGradientBar === undefined) {
      this.settings.useGradientBar = 'true';
    }

    this.SCALE = this.getWidgetScaleFactor();
    await this.fetchGasInfo(false);
  }

  getWidgetScaleFactor() {
    try {
      const deviceSize = Device.screenSize();
      const screenData = [
        { width: 440, height: 956, scale: 1.0 },
        { width: 430, height: 932, scale: 0.98 },
        { width: 428, height: 926, scale: 0.97 },
        { width: 414, height: 896, scale: 0.95 },
        { width: 402, height: 874, scale: 0.93 },
        { width: 393, height: 852, scale: 0.90 },
        { width: 390, height: 844, scale: 0.89 },
        { width: 375, height: 812, scale: 0.85 },
      ];
      const match = screenData.find(
        d => (d.width === deviceSize.width && d.height === deviceSize.height) ||
             (d.width === deviceSize.height && d.height === deviceSize.width)
      );
      return match ? match.scale : 0.95;
    } catch (_) {
      return 0.95;
    }
  }

  getWidgetLargeWidth() {
    try {
      const deviceSize = Device.screenSize();
      const screenW = Math.min(deviceSize.width, deviceSize.height);
      const screenH = Math.max(deviceSize.width, deviceSize.height);
      const sizes = [
        { w: 440, h: 956, largeW: 368 },
        { w: 430, h: 932, largeW: 364 },
        { w: 428, h: 926, largeW: 364 },
        { w: 414, h: 896, largeW: 360 },
        { w: 402, h: 874, largeW: 348 },
        { w: 393, h: 852, largeW: 338 },
        { w: 390, h: 844, largeW: 338 },
        { w: 375, h: 812, largeW: 329 },
      ];
      const match = sizes.find(s => s.w === screenW && s.h === screenH);
      return match ? match.largeW : 338;
    } catch (_) {
      return 338;
    }
  }

  getColor() {
    if (this.settings && this.settings.lightColor && this.settings.darkColor) {
      return Color.dynamic(
        new Color(this.settings.lightColor),
        new Color(this.settings.darkColor)
      );
    }
    return Color.dynamic(new Color('#111827'), new Color('#F9FAFB'));
  }

  async fetchGasInfo(force = false) {
    const consNo = (this.settings.custCode || '').trim();
    const token = (this.settings.xMasAppInfo || '').trim();

    const cacheKey = `gas_cache_${consNo || 'default'}.json`;
    const intervalMin = parseInt(this.settings.interval) || 360;

    let cachedData = null;
    const cacheStr = this.loadCache(cacheKey);
    if (cacheStr) {
      try {
        cachedData = JSON.parse(cacheStr);
      } catch (_) {
        cachedData = null;
      }
    }

    if (!consNo || !token) {
      if (cachedData) {
        this.gasData = cachedData;
        this.isOffline = true;
      } else {
        this.gasData = null;
      }
      return;
    }

    if (!force && cachedData && cachedData._updateTimestamp) {
      const elapsedMin = Math.floor((Date.now() - cachedData._updateTimestamp) / 1000 / 60);
      if (elapsedMin >= 0 && elapsedMin < intervalMin) {
        console.log(`[MijiaWaterGas] 命中沙盒缓存：上次更新于 ${elapsedMin} 分钟前（数据读取间隔: ${intervalMin} 分钟），直接读取本地数据，跳过网络请求`);
        this.gasData = cachedData;
        this.isOffline = false;
        return;
      }
      console.log(`[MijiaWaterGas] 本地数据已超出读取周期（已过 ${elapsedMin} 分钟，设定间隔: ${intervalMin} 分钟），正在联网拉取最新数据...`);
    }

    try {
      // 使用米家山水务加密链路: serverKey 协商 -> AES/RSA 加密请求 -> 解密响应
      const result = await queryBalance(token, consNo);
      if (!result || result.balance === null) {
        throw new Error('接口返回异常状态');
      }
      this.gasData = {
        countMoney: result.balance,
        newCountMoney: result.balance,
        oweMoney: result.arrears,
        custCode: result.consNo,
        custName: result.consName,
        compName: result.companyName || this.settings.customCompName || '成都市岷江自来水厂',
        gasPropName: result.gasPropName,
        gasAddress: result.gasAddress,
        lastRecord: result.lastRecord,
        lastRecordTime: result.lastRecordTime,
      };
      const comp = this.settings.customCompName || result.companyName || this.detectCompanyName(this.gasData) || '成都市岷江自来水厂';
      this.gasData.compName = comp;

      // token 自动提取: 户名 / 服务单位 / 微信用户ID
      // 仅在用户未手动配置或已有配置为明显非法值(如被误解析的代码片段)时回填
      const isBadName = (v) => !v || /[=;{}()]/.test(v) || !/^[\u4e00-\u9fa5A-Za-z*·\s]{2,20}$/.test(v);
      const isBadComp = (v) => !v || /[=;{}]/.test(v) || !/^[\u4e00-\u9fa5A-Za-z0-9（）()]{4,40}$/.test(v);
      let settingsChanged = false;
      if (result.consName && isBadName(this.settings.custName)) {
        this.settings.custName = result.consName;
        settingsChanged = true;
      }
      if (result.companyName && isBadComp(this.settings.customCompName)) {
        this.settings.customCompName = result.companyName;
        settingsChanged = true;
      }
      if (result.wechatUserId && (isBadName(this.settings.userId) || /^o[A-Za-z0-9_-]{15,40}$/.test(result.wechatUserId))) {
        this.settings.userId = result.wechatUserId;
        settingsChanged = true;
      }
      if (settingsChanged) {
        this.saveSettings(false);
        console.log(`[MijiaWaterGas] 已自动提取并保存: 户名=${this.settings.custName}, 服务单位=${this.settings.customCompName}, 微信用户ID=${this.settings.userId}`);
      }

      const dateObj = new Date();
      this.gasData._fetchTime = dateObj.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      this.gasData._fetchDate = dateObj.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
      this.gasData._updateTimestamp = Date.now();

      this.saveCache(cacheKey, JSON.stringify(this.gasData));
      this.isOffline = false;
      console.log(`[MijiaWaterGas] 成功获取最新水费数据并写入沙盒，余额: ${this.gasData.countMoney}，更新时间: ${this.gasData._fetchTime}`);
    } catch (e) {
      console.warn('[MijiaWaterGas] 联网请求失败或 token 异常，安全回退本地缓存: ' + e);
      if (cachedData) {
        this.gasData = cachedData;
        this.isOffline = true;
      } else {
        this.gasData = null;
      }
    }
  }

  async parseClipboardCurl() {
    const paste = Pasteboard.paste();
    if (!paste || !paste.trim()) {
      const a = new Alert();
      a.title = '剪贴板为空';
      a.message = '请先在 Surge / Loon 抓包软件中复制请求 cURL 或请求头，再点击此功能。';
      a.addAction('知道了');
      await a.presentAlert();
      return;
    }

    const str = paste.trim();
    let modified = false;

    // 统一的值有效性检测: 拦截代码片段/字面量, 但放行真实数据
    const isJunkValue = (v) => {
      if (!v) return true;
      if (v.length < 2 || v.length > 60) return true;
      if (/^(null|undefined|true|false|NaN)$/i.test(v)) return true;
      if (/[=;{}()<>\[\]]/.test(v)) return true;                 // 含代码符号
      if (/^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*/.test(v)) return true; // 变量访问模式 b.userName
      if (/^[\w$]+\(/.test(v)) return true;                       // 函数调用 foo(
      return false;
    };

    // 米家山水务: 登录凭据为 JWT token (请求头 token 字段)
    const tokenMatch = str.match(/token['":\s=]+([A-Za-z0-9._\-]{20,})/i) || str.match(/\beyJ[A-Za-z0-9._\-]{20,}\.[A-Za-z0-9._\-]{20,}\.[A-Za-z0-9._\-]{10,}\b/);
    if (tokenMatch && tokenMatch[1]) {
      this.settings.xMasAppInfo = tokenMatch[1].trim();
      modified = true;
    }

    const custMatch = str.match(/(?:consNo|consno|custCode|custcode)['":\s=]+([0-9]{6,12})/i);
    if (custMatch && custMatch[1]) {
      this.settings.custCode = custMatch[1].trim();
      modified = true;
    }

    // 户名: 提取真实姓名 (含中文/字母/星号脱敏), 拦截代码片段
    const nameRegex = /(?:consName|consname|custName|custname)['":\s=]+([^'"&\r\n\s]+)/gi;
    let nMatch;
    while ((nMatch = nameRegex.exec(str)) !== null) {
      let rawName = nMatch[1].trim();
      try { rawName = decodeURIComponent(rawName); } catch (_) {}
      rawName = rawName.replace(/['"]+$/, '');
      if (!isJunkValue(rawName) && !/^\d+$/.test(rawName)) {
        this.settings.custName = rawName;
        modified = true;
        break;
      }
    }

    // 服务单位: 提取真实公司名 (必须含中文), 拦截代码片段
    const compMatch = str.match(/(?:compName|companyName|company|corpName)['":\s=]+([^'"&\r\n]+)/i);
    if (compMatch && compMatch[1]) {
      let rawComp = compMatch[1].trim();
      try { rawComp = decodeURIComponent(rawComp); } catch (_) {}
      rawComp = rawComp.replace(/['"]+$/, '');
      if (!isJunkValue(rawComp) && /[\u4e00-\u9fa5]/.test(rawComp)) {
        this.settings.customCompName = rawComp;
        modified = true;
      }
    }

    const a = new Alert();
    if (modified) {
      this.saveSettings(false);
      await this.fetchGasInfo(true);
      const d = this.gasData || {};
      a.title = '凭据解析成功';
      a.message = `已自动提取并保存：\n• 水费户号: ${this.settings.custCode || '未找到'}\n• 户名: ${d.custName || this.settings.custName || '接口自动获取'}\n• 登录凭据: 已更新\n• 服务单位: ${d.compName || this.settings.customCompName || '接口自动获取'}`;
    } else {
      a.title = '未识别到米家山水务请求参数';
      a.message = '未能从剪贴板解析出有效凭据，请确认复制的是 m.cdmjwater.com 的请求。';
    }
    a.addAction('确定');
    await a.presentAlert();
    this.reopenScript();
  }

  formatMoney(num) {
    const val = parseFloat(num);
    return isNaN(val) ? '0.00' : val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  detectCompanyName(obj) {
    if (!obj || typeof obj !== 'object') return '';
    try {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string' && (v.includes('水') || v.includes('自来水') || v.includes('公司')) && !v.includes('http') && v.length < 50) {
          return v.trim();
        }
      }
    } catch (_) {}
    return '';
  }

  formatCustCode(code, isShort = false) {
    if (!code) return '--';
    if (this.settings.maskCustCode === 'true') {
      if (code.length >= 8) {
        return code.slice(0, 3) + '****' + code.slice(-2);
      }
      return '****' + code.slice(-2);
    }
    if (isShort) {
      return code.length > 5 ? code.slice(-5) : code;
    }
    return code;
  }

  formatCompName(name, isFull = false) {
    const raw = (name || (this.gasData && this.gasData.compName) || this.settings.customCompName || '').trim();
    if (this.settings.maskCompName === 'true') {
      return '米家山水务';
    }
    if (!raw || raw === 'undefined' || raw === 'null') {
      return '米家山水务';
    }
    if (isFull) {
      return raw;
    }
    return raw.replace(/自来水厂|自来水有限公司|有限责任公司|有限公司/g, '');
  }

  /**
   * 计算当前余额占基准的比例
   */
  getBalanceRatio() {
    const d = this.gasData || {};
    const isOwe = d.oweMoney && parseFloat(d.oweMoney) > 0;
    if (isOwe) return 0;
    const bal = parseFloat(d.countMoney || d.newCountMoney || '0');
    if (isNaN(bal) || bal <= 0) return 0;
    const maxLimit = parseFloat(this.settings.balanceLimit) || 500;
    return Math.max(0, Math.min(1.0, bal / maxLimit));
  }

  /**
   * 动态计算胶囊点亮格数（以预设满额为基准）
   */
  getCapsuleActiveCount(totalSegments = 10) {
    const d = this.gasData || {};
    const isOwe = d.oweMoney && parseFloat(d.oweMoney) > 0;
    if (isOwe) {
      return 1;
    }
    const ratio = this.getBalanceRatio();
    if (ratio <= 0) return 0;
    return Math.max(1, Math.round(ratio * totalSegments));
  }

  /**
   * 动态色阶渐变算法（绿 -> 青 -> 黄 -> 橙 -> 红 5 大色阶）
   */
  getBarColors(ratio, isOwe) {
    if (this.settings.useGradientBar === 'false') {
      const single = this.settings.themeColor || '#FF9500';
      return { start: single, end: single };
    }

    if (isOwe) {
      return { start: '#EF4444', end: '#DC2626' };
    }

    if (ratio >= 0.8) {
      return { start: '#10B981', end: '#34D399' };
    } else if (ratio >= 0.6) {
      return { start: '#06B6D4', end: '#22D3EE' };
    } else if (ratio >= 0.4) {
      return { start: '#EAB308', end: '#FACC15' };
    } else if (ratio >= 0.2) {
      return { start: '#F97316', end: '#FB923C' };
    } else {
      return { start: '#EF4444', end: '#F87171' };
    }
  }

  /**
   * 颜色平滑线性插值
   */
  interpolateColor(color1Hex, color2Hex, factor) {
    try {
      const c1 = parseInt(color1Hex.replace('#', ''), 16);
      const c2 = parseInt(color2Hex.replace('#', ''), 16);
      const r1 = (c1 >> 16) & 255, g1 = (c1 >> 8) & 255, b1 = c1 & 255;
      const r2 = (c2 >> 16) & 255, g2 = (c2 >> 8) & 255, b2 = c2 & 255;
      const r = Math.round(r1 + (r2 - r1) * factor);
      const g = Math.round(g1 + (g2 - g1) * factor);
      const b = Math.round(b1 + (b2 - b1) * factor);
      return new Color('#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1));
    } catch (_) {
      return new Color(color1Hex);
    }
  }

  /**
   * 绘制科技感胶囊进度条（支持多色阶渐变与平滑单元插值）
   */
  drawCapsuleBar(width, height, totalSegments = 10, activeSegments = 7, colors) {
    const dc = new DrawContext();
    dc.size = new Size(width, height);
    dc.opaque = false;
    dc.respectScreenScale = true;

    const gap = 3.5;
    const segWidth = (width - gap * (totalSegments - 1)) / totalSegments;
    const corner = height / 2;

    const bgCol = Color.dynamic(new Color('#E5E7EB'), new Color('#374151'));

    const startHex = (colors && colors.start) || '#FF9500';
    const endHex = (colors && colors.end) || startHex;

    for (let i = 0; i < totalSegments; i++) {
      const x = i * (segWidth + gap);
      const path = new Path();
      path.addRoundedRect(new Rect(x, 0, segWidth, height), corner, corner);
      dc.addPath(path);

      if (i < activeSegments) {
        const factor = activeSegments > 1 ? (i / (activeSegments - 1)) : 0;
        dc.setFillColor(this.interpolateColor(startHex, endHex, factor));
      } else {
        dc.setFillColor(bgCol);
      }
      dc.fillPath();
    }

    return dc.getImage();
  }

  async render() {
    await this.init();
    const widget = new ListWidget();
    await this.getWidgetBackgroundImage(widget);
    this.widgetColor = this.getColor();

    const intervalMin = parseInt(this.settings.interval) || 360;
    widget.refreshAfterDate = new Date(Date.now() + 1000 * 60 * intervalMin);

    if (!this.settings.custCode || !this.settings.xMasAppInfo) {
      return this.renderGuideWidget(widget);
    }

    if (!this.gasData) {
      return this.renderErrorWidget(widget);
    }

    if (this.widgetFamily === 'medium') {
      return await this.renderMedium(widget);
    } else if (this.widgetFamily === 'large') {
      return await this.renderLarge(widget);
    } else {
      return await this.renderSmall(widget);
    }
  }

  /**
   * 小尺寸组件 (Small) - 饱满紧凑对齐
   */
  async renderSmall(w) {
    const pX = 14 * this.SCALE;
    const pY = 12 * this.SCALE;
    w.setPadding(pY, pX, pY, pX);
    w.backgroundColor = Color.dynamic(new Color('#FFFFFF'), new Color('#111827'));

    const d = this.gasData || {};
    const themeColor = new Color(this.settings.themeColor || '#FF9500');
    const balanceColor = new Color(this.settings.balanceColor || '#10B981');
    const subColor = Color.dynamic(new Color('#6B7280'), new Color('#9CA3AF'));

    const body = w.addStack();
    body.layoutVertically();

    const header = body.addStack();
    header.centerAlignContent();

    const flame = SFSymbol.named('flame.fill');
    flame.applyHeavyWeight();
    const icon = header.addImage(flame.image);
    icon.imageSize = new Size(16 * this.SCALE, 16 * this.SCALE);
    icon.tintColor = themeColor;
    header.addSpacer(5);

    const title = header.addText(this.settings.alias || '米家山水务');
    title.font = Font.boldSystemFont(13 * this.SCALE);
    title.textColor = this.widgetColor;

    header.addSpacer();

    const statePill = header.addStack();
    statePill.centerAlignContent();
    statePill.backgroundColor = Color.dynamic(new Color('#F3F4F6'), new Color('#1F2937'));
    statePill.cornerRadius = 6 * this.SCALE;
    statePill.setPadding(2 * this.SCALE, 6 * this.SCALE, 2 * this.SCALE, 6 * this.SCALE);
    const stateText = statePill.addText(this.isOffline ? '离线' : '● 正常');
    stateText.font = Font.semiboldSystemFont(9.5 * this.SCALE);
    stateText.textColor = this.isOffline ? themeColor : balanceColor;

    body.addSpacer();

    const isOwe = d.oweMoney && parseFloat(d.oweMoney) > 0;
    const labelRow = body.addStack();
    labelRow.centerAlignContent();
    const balLabel = labelRow.addText(isOwe ? '水费欠费' : '账户余额');
    balLabel.font = Font.mediumSystemFont(11 * this.SCALE);
    balLabel.textColor = isOwe ? new Color('#EF4444') : subColor;

    body.addSpacer(2 * this.SCALE);

    const valRow = body.addStack();
    valRow.centerAlignContent();
    const valText = valRow.addText(`¥ ${this.formatMoney(d.countMoney || d.newCountMoney || '0.00')}`);
    valText.font = Font.boldRoundedSystemFont(27 * this.SCALE);
    valText.textColor = isOwe ? new Color('#EF4444') : balanceColor;
    valText.lineLimit = 1;
    valText.minimumScaleFactor = 0.6;

    body.addSpacer(6 * this.SCALE);

    const ratio = this.getBalanceRatio();
    const activeSegs = this.getCapsuleActiveCount(10);
    const barColors = this.getBarColors(ratio, isOwe);
    const capsuleImg = body.addImage(this.drawCapsuleBar(130 * this.SCALE, 5.5 * this.SCALE, 10, activeSegs, barColors));
    capsuleImg.imageSize = new Size(130 * this.SCALE, 5.5 * this.SCALE);

    body.addSpacer();

    const footerCard = body.addStack();
    footerCard.layoutVertically();
    footerCard.backgroundColor = Color.dynamic(new Color('#F8FAFC'), new Color('#161E2E'));
    footerCard.cornerRadius = 8 * this.SCALE;
    footerCard.setPadding(6 * this.SCALE, 8 * this.SCALE, 6 * this.SCALE, 8 * this.SCALE);

    const fRow1 = footerCard.addStack();
    fRow1.centerAlignContent();
    const gIcon = SFSymbol.named('gauge.badge.plus');
    const gImg = fRow1.addImage(gIcon.image);
    gImg.imageSize = new Size(11 * this.SCALE, 11 * this.SCALE);
    gImg.tintColor = themeColor;
    fRow1.addSpacer(3);

    const mText = fRow1.addText(`抄表: ${d.lastRecord || '0'} m³`);
    mText.font = Font.systemFont(9.5 * this.SCALE);
    mText.textColor = subColor;
    fRow1.addSpacer();

    const timeText = fRow1.addText(d._fetchTime || '刚刚');
    timeText.font = Font.systemFont(9.5 * this.SCALE);
    timeText.textColor = subColor;

    footerCard.addSpacer(3 * this.SCALE);

    const fRow2 = footerCard.addStack();
    fRow2.centerAlignContent();
    const idIcon = SFSymbol.named('creditcard');
    const idImg = fRow2.addImage(idIcon.image);
    idImg.imageSize = new Size(11 * this.SCALE, 11 * this.SCALE);
    idImg.tintColor = new Color('#3B82F6');
    fRow2.addSpacer(3);

    const custCodeText = fRow2.addText(`户号: ${this.formatCustCode(d.custCode, true)}`);
    custCodeText.font = Font.systemFont(9.5 * this.SCALE);
    custCodeText.textColor = subColor;
    fRow2.addSpacer();

    const nameText = fRow2.addText(d.custName || '米家山水务');
    nameText.font = Font.systemFont(9.5 * this.SCALE);
    nameText.textColor = subColor;

    return w;
  }

  /**
   * 中尺寸组件 (Medium) - 余额紧挨进度条，基线精准对齐，动态渐变色
   */
  async renderMedium(w) {
    const pX = 16 * this.SCALE;
    const pY = 12 * this.SCALE;
    w.setPadding(pY, pX, pY, pX);
    w.backgroundColor = Color.dynamic(new Color('#FFFFFF'), new Color('#111827'));

    const d = this.gasData || {};
    const themeColor = new Color(this.settings.themeColor || '#FF9500');
    const balanceColor = new Color(this.settings.balanceColor || '#10B981');
    const subColor = Color.dynamic(new Color('#6B7280'), new Color('#9CA3AF'));

    const body = w.addStack();
    body.layoutHorizontally();

    const left = body.addStack();
    left.layoutVertically();
    left.size = new Size(155 * this.SCALE, 0);

    const lHeader = left.addStack();
    lHeader.centerAlignContent();
    const flame = SFSymbol.named('flame.fill');
    flame.applyHeavyWeight();
    const fImg = lHeader.addImage(flame.image);
    fImg.imageSize = new Size(16 * this.SCALE, 16 * this.SCALE);
    fImg.tintColor = themeColor;
    lHeader.addSpacer(5);
    const lTitle = lHeader.addText(this.settings.alias || '米家山水务');
    lTitle.font = Font.boldSystemFont(13 * this.SCALE);
    lTitle.textColor = this.widgetColor;

    left.addSpacer();

    const isOwe = d.oweMoney && parseFloat(d.oweMoney) > 0;
    const balLabel = left.addText(isOwe ? '水费欠费 (元)' : '可用水费余额 (元)');
    balLabel.font = Font.mediumSystemFont(11 * this.SCALE);
    balLabel.textColor = isOwe ? new Color('#EF4444') : subColor;

    left.addSpacer(2 * this.SCALE);

    const valRow = left.addStack();
    valRow.centerAlignContent();
    const valText = valRow.addText(`¥ ${this.formatMoney(d.countMoney || d.newCountMoney || '0.00')}`);
    valText.font = Font.boldRoundedSystemFont(28 * this.SCALE);
    valText.textColor = isOwe ? new Color('#EF4444') : balanceColor;
    valText.lineLimit = 1;
    valText.minimumScaleFactor = 0.6;

    left.addSpacer(7 * this.SCALE);

    const ratio = this.getBalanceRatio();
    const activeSegs = this.getCapsuleActiveCount(10);
    const barColors = this.getBarColors(ratio, isOwe);
    const capsuleImg = left.addImage(this.drawCapsuleBar(148 * this.SCALE, 7 * this.SCALE, 10, activeSegs, barColors));
    capsuleImg.imageSize = new Size(148 * this.SCALE, 7 * this.SCALE);

    left.addSpacer();

    const stateRow = left.addStack();
    stateRow.centerAlignContent();
    const dot = stateRow.addText('● ');
    dot.font = Font.systemFont(8 * this.SCALE);
    dot.textColor = isOwe ? new Color('#EF4444') : balanceColor;

    const stateText = stateRow.addText(isOwe ? '账户已欠费 · 请及时充值' : '管网连接正常 · 气压稳定');
    stateText.font = Font.systemFont(10 * this.SCALE);
    stateText.textColor = subColor;

    body.addSpacer(12 * this.SCALE);

    const divider = body.addStack();
    divider.size = new Size(1, 0);
    divider.backgroundColor = Color.dynamic(new Color('#E5E7EB'), new Color('#1F2937'));
    body.addSpacer(12 * this.SCALE);

    const right = body.addStack();
    right.layoutVertically();

    const rTop = right.addStack();
    rTop.centerAlignContent();
    const syncSymbol = SFSymbol.named('arrow.triangle.2.circlepath');
    const syncImg = rTop.addImage(syncSymbol.image);
    syncImg.imageSize = new Size(10 * this.SCALE, 10 * this.SCALE);
    syncImg.tintColor = subColor;
    rTop.addSpacer(3);
    const syncTime = rTop.addText(d._fetchTime ? `更新时间 ${d._fetchTime}` : '实时同步');
    syncTime.font = Font.systemFont(10 * this.SCALE);
    syncTime.textColor = subColor;
    rTop.addSpacer();

    right.addSpacer();

    this.createTechRow(right, 'person.crop.rectangle', '客户户号', `${d.custName || '--'} (${this.formatCustCode(d.custCode)})`, themeColor, subColor);
    right.addSpacer();

    this.createTechRow(right, 'speedometer', '上次抄表', `${d.lastRecord || '0'} m³`, new Color('#3B82F6'), subColor);
    right.addSpacer();

    this.createTechRow(right, 'calendar.badge.clock', '抄表日期', d.lastRecordTime || '近期已抄表', new Color('#8B5CF6'), subColor);
    right.addSpacer();

    this.createTechRow(right, 'building.2', '服务单位', this.formatCompName(d.compName, false), new Color('#10B981'), subColor);

    return w;
  }

  createTechRow(parent, iconName, label, valStr, iconCol, subCol) {
    const row = parent.addStack();
    row.centerAlignContent();

    const sym = SFSymbol.named(iconName);
    const img = row.addImage(sym.image);
    img.imageSize = new Size(13 * this.SCALE, 13 * this.SCALE);
    img.tintColor = iconCol;
    row.addSpacer(4);

    const lText = row.addText(label);
    lText.font = Font.systemFont(10.5 * this.SCALE);
    lText.textColor = subCol;
    row.addSpacer(6);

    const vText = row.addText(valStr);
    vText.font = Font.semiboldSystemFont(11 * this.SCALE);
    vText.textColor = this.widgetColor;
    vText.lineLimit = 1;
    vText.minimumScaleFactor = 0.7;
    row.addSpacer();
  }

  /**
   * 大尺寸组件 (Large) - 颜色同步支持渐变或自定义单色
   */
  async renderLarge(w) {
    const pX = 16 * this.SCALE;
    const pY = 14 * this.SCALE;
    w.setPadding(pY, pX, pY, pX);
    w.backgroundColor = Color.dynamic(new Color('#FFFFFF'), new Color('#111827'));

    const d = this.gasData || {};
    const themeColor = new Color(this.settings.themeColor || '#FF9500');
    const balanceColor = new Color(this.settings.balanceColor || '#10B981');
    const subColor = Color.dynamic(new Color('#6B7280'), new Color('#9CA3AF'));

    const body = w.addStack();
    body.layoutVertically();

    const header = body.addStack();
    header.centerAlignContent();
    const flame = SFSymbol.named('flame.fill');
    flame.applyHeavyWeight();
    const fImg = header.addImage(flame.image);
    fImg.imageSize = new Size(20 * this.SCALE, 20 * this.SCALE);
    fImg.tintColor = themeColor;
    header.addSpacer(6);

    const title = header.addText(this.settings.alias || '米家山水务在线监控');
    title.font = Font.boldSystemFont(15 * this.SCALE);
    title.textColor = this.widgetColor;
    header.addSpacer();

    const tagBadge = header.addStack();
    tagBadge.centerAlignContent();
    tagBadge.backgroundColor = Color.dynamic(new Color('#F3F4F6'), new Color('#1F2937'));
    tagBadge.cornerRadius = 6 * this.SCALE;
    tagBadge.setPadding(3 * this.SCALE, 8 * this.SCALE, 3 * this.SCALE, 8 * this.SCALE);

    const tag = tagBadge.addText(this.isOffline ? '离线模式' : `更新时间 ${d._fetchTime || '刚刚'}`);
    tag.font = Font.semiboldSystemFont(10 * this.SCALE);
    tag.textColor = this.isOffline ? themeColor : balanceColor;

    body.addSpacer();

    const card = body.addStack();
    card.layoutVertically();
    card.backgroundColor = Color.dynamic(new Color('#F8FAFC'), new Color('#161E2E'));
    card.cornerRadius = 14 * this.SCALE;
    card.setPadding(12 * this.SCALE, 16 * this.SCALE, 12 * this.SCALE, 16 * this.SCALE);

    const isOwe = d.oweMoney && parseFloat(d.oweMoney) > 0;
    const cLabel = card.addText(isOwe ? '账户欠费总额 (元)' : '当前账户可用水费余额 (元)');
    cLabel.font = Font.mediumSystemFont(11.5 * this.SCALE);
    cLabel.textColor = isOwe ? new Color('#EF4444') : subColor;

    card.addSpacer(3 * this.SCALE);

    const cValRow = card.addStack();
    cValRow.centerAlignContent();
    const val = cValRow.addText(`¥ ${this.formatMoney(d.countMoney || d.newCountMoney || '0.00')}`);
    val.font = Font.boldRoundedSystemFont(33 * this.SCALE);
    val.textColor = isOwe ? new Color('#EF4444') : balanceColor;

    card.addSpacer(7 * this.SCALE);

    const widgetW = this.getWidgetLargeWidth();
    const contentW = widgetW - 2 * pX;
    const barW = Math.max(260 * this.SCALE, contentW - 32 * this.SCALE);

    const ratio = this.getBalanceRatio();
    const activeSegs = this.getCapsuleActiveCount(14);
    const barColors = this.getBarColors(ratio, isOwe);
    const capsule = card.addImage(this.drawCapsuleBar(barW, 8 * this.SCALE, 14, activeSegs, barColors));
    capsule.imageSize = new Size(barW, 8 * this.SCALE);

    body.addSpacer();

    const grid = body.addStack();
    grid.layoutHorizontally();

    const gap = 8 * this.SCALE;
    const colW = Math.floor((contentW - 2 * gap) / 3);
    const colW3 = contentW - 2 * gap - 2 * colW;

    const cardA = grid.addStack();
    cardA.layoutVertically();
    cardA.backgroundColor = Color.dynamic(new Color('#F3F4F6'), new Color('#1F2937'));
    cardA.cornerRadius = 10 * this.SCALE;
    cardA.setPadding(9 * this.SCALE, 9 * this.SCALE, 9 * this.SCALE, 9 * this.SCALE);
    cardA.size = new Size(colW, 0);

    const aHead = cardA.addStack();
    aHead.centerAlignContent();
    const aIcon = SFSymbol.named('speedometer');
    const aImg = aHead.addImage(aIcon.image);
    aImg.imageSize = new Size(12 * this.SCALE, 12 * this.SCALE);
    aImg.tintColor = new Color('#3B82F6');
    aHead.addSpacer(3 * this.SCALE);
    const aTitle = aHead.addText('上次抄表读数');
    aTitle.font = Font.systemFont(10 * this.SCALE);
    aTitle.textColor = subColor;
    aTitle.lineLimit = 1;

    cardA.addSpacer(4 * this.SCALE);
    const aVal = cardA.addText(`${d.lastRecord || '0'} m³`);
    aVal.font = Font.boldRoundedSystemFont(16 * this.SCALE);
    aVal.textColor = this.widgetColor;
    aVal.lineLimit = 1;
    aVal.minimumScaleFactor = 0.8;

    grid.addSpacer(gap);

    const cardB = grid.addStack();
    cardB.layoutVertically();
    cardB.backgroundColor = Color.dynamic(new Color('#F3F4F6'), new Color('#1F2937'));
    cardB.cornerRadius = 10 * this.SCALE;
    cardB.setPadding(9 * this.SCALE, 9 * this.SCALE, 9 * this.SCALE, 9 * this.SCALE);
    cardB.size = new Size(colW, 0);

    const bHead = cardB.addStack();
    bHead.centerAlignContent();
    const bIcon = SFSymbol.named('calendar.badge.clock');
    const bImg = bHead.addImage(bIcon.image);
    bImg.imageSize = new Size(12 * this.SCALE, 12 * this.SCALE);
    bImg.tintColor = new Color('#8B5CF6');
    bHead.addSpacer(3 * this.SCALE);
    const bTitle = bHead.addText('抄表核算日期');
    bTitle.font = Font.systemFont(10 * this.SCALE);
    bTitle.textColor = subColor;
    bTitle.lineLimit = 1;

    cardB.addSpacer(4 * this.SCALE);
    const bVal = cardB.addText(d.lastRecordTime || '近期已核算');
    bVal.font = Font.boldRoundedSystemFont(13.5 * this.SCALE);
    bVal.textColor = this.widgetColor;
    bVal.lineLimit = 1;
    bVal.minimumScaleFactor = 0.8;

    grid.addSpacer(gap);

    const cardC = grid.addStack();
    cardC.layoutVertically();
    cardC.backgroundColor = Color.dynamic(new Color('#F3F4F6'), new Color('#1F2937'));
    cardC.cornerRadius = 10 * this.SCALE;
    cardC.setPadding(9 * this.SCALE, 9 * this.SCALE, 9 * this.SCALE, 9 * this.SCALE);
    cardC.size = new Size(colW3, 0);

    const cHead = cardC.addStack();
    cHead.centerAlignContent();
    const cIcon = SFSymbol.named('waveform.path.ecg');
    const cImg = cHead.addImage(cIcon.image);
    cImg.imageSize = new Size(12 * this.SCALE, 12 * this.SCALE);
    const statusCol = isOwe ? new Color('#EF4444') : (this.isOffline ? themeColor : balanceColor);
    cImg.tintColor = statusCol;
    cHead.addSpacer(3 * this.SCALE);
    const cTitle = cHead.addText('管网监控状态');
    cTitle.font = Font.systemFont(10 * this.SCALE);
    cTitle.textColor = subColor;
    cTitle.lineLimit = 1;

    cardC.addSpacer(4 * this.SCALE);
    const cStatusRow = cardC.addStack();
    cStatusRow.centerAlignContent();
    const cDot = cStatusRow.addText('● ');
    cDot.font = Font.systemFont(7 * this.SCALE);
    cDot.textColor = statusCol;

    const cValText = isOwe ? '账户欠费' : (this.isOffline ? '离线保持' : '气压稳定');
    const cVal = cStatusRow.addText(cValText);
    cVal.font = Font.boldSystemFont(12 * this.SCALE);
    cVal.textColor = this.widgetColor;
    cVal.lineLimit = 1;
    cVal.minimumScaleFactor = 0.8;

    body.addSpacer();

    const listCard = body.addStack();
    listCard.layoutVertically();
    listCard.backgroundColor = Color.dynamic(new Color('#F8FAFC'), new Color('#161E2E'));
    listCard.cornerRadius = 10 * this.SCALE;
    listCard.setPadding(10 * this.SCALE, 14 * this.SCALE, 10 * this.SCALE, 14 * this.SCALE);

    this.createTechRow(listCard, 'person.crop.rectangle', '客户姓名', d.custName || '--', themeColor, subColor);
    listCard.addSpacer(6 * this.SCALE);
    this.createTechRow(listCard, 'number', '水费户号', this.formatCustCode(d.custCode), themeColor, subColor);
    listCard.addSpacer(6 * this.SCALE);
    this.createTechRow(listCard, 'building.2', '服务单位', this.formatCompName(d.compName, true), new Color('#10B981'), subColor);
    listCard.addSpacer(6 * this.SCALE);
    this.createTechRow(listCard, 'phone.badge.waveform', '客服热线', '028-85818581', new Color('#F59E0B'), subColor);

    return w;
  }

  renderGuideWidget(w) {
    w.setPadding(16, 16, 16, 16);
    w.backgroundColor = Color.dynamic(new Color('#FFFFFF'), new Color('#111827'));
    const center = w.addStack();
    center.layoutVertically();
    center.centerAlignContent();

    const title = center.addText('China Gas');
    title.font = Font.boldSystemFont(15);
    title.textColor = new Color('#FF9500');

    center.addSpacer(8);

    const tip = center.addText('未检测到凭证配置');
    tip.font = Font.boldSystemFont(12);
    tip.textColor = this.widgetColor;

    center.addSpacer(4);

    const desc = center.addText('请点击打开组件，在【账户设置】中输入参数或使用剪贴板智能解析。');
    desc.font = Font.systemFont(11);
    desc.textColor = new Color('#9CA3AF');
    desc.centerAlignText();

    return w;
  }

  renderErrorWidget(w) {
    w.setPadding(16, 16, 16, 16);
    w.backgroundColor = Color.dynamic(new Color('#FFFFFF'), new Color('#111827'));
    const center = w.addStack();
    center.layoutVertically();
    center.centerAlignContent();

    const title = center.addText('数据连接失败');
    title.font = Font.boldSystemFont(14);
    title.textColor = new Color('#EF4444');

    center.addSpacer(6);

    const msg = center.addText('网络超时且无离线缓存，请检查网络或重新配置凭证。');
    msg.font = Font.systemFont(11);
    msg.textColor = new Color('#9CA3AF');
    msg.centerAlignText();

    return w;
  }

  async promptInput(title, desc, key, placeholder) {
    const a = new Alert();
    a.title = String(title || '');
    a.message = String(desc || '');
    const cur = String(this.settings[key] || '');
    a.addTextField(String(placeholder || ''), cur);
    a.addAction('确定');
    a.addCancelAction('取消');
    const res = await a.presentAlert();
    if (res === 0) {
      this.settings[key] = String(a.textFieldValue(0) || '').trim();
      this.saveSettings(false);
    }
  }

  async showHelpGuide() {
    const a = new Alert();
    a.title = '米家山水务抓包指引';
    a.message = [
      '1. 开启手机抓包软件 (Surge / Loon / Quantumult X)；',
      '2. 打开微信进入【米家山水务】小程序并点击查询或我的；',
      '3. 筛选主机包含 m.cdmjwater.com 的请求；',
      '4. 复制该请求的 cURL 或请求头（需含 token 请求头）；',
      '5. 返回此处点击【剪贴板一键智能解析】即可全自动填入。'
    ].join('\n\n');
    a.addAction('我知道了');
    await a.presentAlert();
  }

  setAccountConfig = async () => {
    return this.renderAppView([
      {
        title: '账户凭证与抓包配置',
        menu: [
          {
            icon: { name: 'questionmark.circle', color: '#3B82F6' },
            type: 'input',
            name: 'help_guide',
            val: 'help_guide',
            title: '抓包指引与帮助',
            desc: '查看如何抓包获取米家山水务凭证',
            onClick: async () => {
              await this.showHelpGuide();
            }
          },
          {
            icon: { name: 'doc.on.clipboard', color: '#10B981' },
            type: 'input',
            name: 'parse_clipboard',
            val: 'parse_clipboard',
            title: '剪贴板一键智能解析',
            desc: '复制抓包后点击自动提取所有参数',
            onClick: async () => {
              await this.parseClipboardCurl();
            }
          },
          {
            icon: { name: 'message.fill', color: '#07C160' },
            type: 'input',
            name: 'open_wechat',
            val: 'open_wechat',
            title: '快捷打开微信',
            desc: '跳转微信打开米家山水务小程序',
            onClick: () => {
              Safari.open('weixin://');
            }
          },
          {
            icon: { name: 'number', color: '#F59E0B' },
            type: 'input',
            title: '水费户号 (custCode)',
            desc: this.settings.custCode ? `当前: ${this.settings.custCode}` : '未配置 (点击输入)',
            val: 'custCode',
            onClick: async () => {
              await this.promptInput('水费户号', '请输入 9 位水费客户编号 (如 121338748)', 'custCode', '121338748');
              this.reopenScript();
            }
          },
          {
            icon: { name: 'person.crop.rectangle', color: '#8B5CF6' },
            type: 'input',
            title: '客户姓名 (custName)',
            desc: this.settings.custName ? `当前: ${this.settings.custName}` : '未配置 (点击输入)',
            val: 'custName',
            onClick: async () => {
              await this.promptInput('客户姓名', '请输入客户姓名 (如 董鑫周)', 'custName', '董鑫周');
              this.reopenScript();
            }
          },
          {
            icon: { name: 'person.fill', color: '#06B6D4' },
            type: 'input',
            title: '微信用户 ID (userId)',
            desc: '米家山水务无需 userId，可留空',
            val: 'userId',
            onClick: async () => {
              await this.promptInput('User ID', '米家山水务无需 userId，直接留空即可', 'userId', '');
              this.reopenScript();
            }
          },
          {
            icon: { name: 'building.2.fill', color: '#10B981' },
            type: 'input',
            title: '服务单位 (compName)',
            desc: this.settings.customCompName ? `当前: ${this.settings.customCompName}` : '默认: 成都市岷江自来水厂 (点击修改)',
            val: 'customCompName',
            onClick: async () => {
              await this.promptInput('服务单位', '请输入实际所属服务单位 (如：成都市岷江自来水厂)', 'customCompName', '成都市岷江自来水厂');
              this.reopenScript();
            }
          },
          {
            icon: { name: 'key.fill', color: '#EC4899' },
            type: 'input',
            title: '登录凭证 (token)',
            desc: this.settings.xMasAppInfo ? '已配置 (点击修改)' : '未配置 (点击输入)',
            val: 'xMasAppInfo',
            onClick: async () => {
              await this.promptInput('token 凭据', '请粘贴抓包中的完整 JWT token (eyJ... 开头)', 'xMasAppInfo', 'eyJhbGciOi...');
              this.reopenScript();
            }
          },
          {
            icon: { name: 'tag.fill', color: '#F97316' },
            type: 'input',
            title: '组件别名',
            desc: this.settings.alias || '米家山水务',
            val: 'alias',
            onClick: async () => {
              await this.promptInput('组件别名', '如：我家水费、父母家、店面', 'alias', '我家水费');
              this.reopenScript();
            }
          }
        ]
      }
    ]);
  };

  setShowConfig = async () => {
    return this.renderAppView([
      {
        title: '显示设置',
        menu: [
          {
            icon: { name: 'slider.horizontal.3', color: '#FF9500' },
            type: 'switch',
            title: '进度条余额渐变色',
            desc: '根据余额多少动态变换绿-青-黄-橙-红5大色阶',
            val: 'useGradientBar',
            default: true,
          },
          {
            icon: { name: 'paintpalette.fill', color: '#F59E0B' },
            type: 'color',
            title: '自定义品牌强调色(单色)',
            desc: '关闭渐变色时生效，进度条采用此单色',
            defaultValue: '#FF9500',
            val: 'themeColor',
          },
          {
            icon: { name: 'number.square.fill', color: '#3B82F6' },
            type: 'switch',
            title: '隐藏户号脱敏 (512****03)',
            val: 'maskCustCode',
          },
          {
            icon: { name: 'building.2', color: '#10B981' },
            type: 'switch',
            title: '隐藏服务单位脱敏 (自来水厂)',
            val: 'maskCompName',
          },
          {
            icon: { name: 'speedometer', color: '#8B5CF6' },
            type: 'input',
            placeholder: '500',
            title: '满额基准额度 (元)',
            desc: '进度条 100% 对应的金额基准，默认500元',
            val: 'balanceLimit',
          },
          {
            icon: { name: 'flame.fill', color: '#10B981' },
            type: 'color',
            title: '余额充沛主题色',
            defaultValue: '#10B981',
            val: 'balanceColor',
          },
          {
            icon: { name: 'arrow.counterclockwise', color: '#EF4444' },
            title: '重置默认状态',
            desc: '恢复显示配置、色阶渐变与额度为出厂默认值',
            val: 'reset_show_config',
            name: 'reset_show_config',
            onClick: async () => {
              const alert = new Alert();
              alert.title = '重置显示配置';
              alert.message = '确定将所有显示配置（渐变色、脱敏、主题色、满额基准等）恢复为初始默认值吗？';
              alert.addAction('确认重置');
              alert.addCancelAction('取消');
              const res = await alert.presentAlert();
              if (res === 0) {
                this.settings.useGradientBar = 'true';
                this.settings.themeColor = '#FF9500';
                this.settings.balanceColor = '#10B981';
                this.settings.maskCustCode = 'false';
                this.settings.maskCompName = 'false';
                this.settings.balanceLimit = '500';
                this.saveSettings(false);
                const s = new Alert();
                s.title = '重置成功';
                s.message = '显示配置已恢复为默认状态！';
                s.addAction('确定');
                await s.presentAlert();
                this.reopenScript();
              }
            }
          }
        ]
      }
    ]);
  };

  isNewerVersion(v1, v2) {
    if (!v1 || !v2) return false;
    const p1 = String(v1).split('.').map(Number);
    const p2 = String(v2).split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const num1 = p1[i] || 0;
      const num2 = p2[i] || 0;
      if (num1 > num2) return true;
      if (num1 < num2) return false;
    }
    return false;
  }

  async checkAndUpdateScript() {
    // 米家山水务为本地定制版，不提供在线更新源
    const alert = new Alert();
    alert.title = '不支持在线更新';
    alert.message = '本脚本为米家山水务定制版（基于 ChinaGas v1.8.3 改造），未托管远程更新源，请保留本地文件。\n\n如需更新，请直接替换两个文件：MijiaWaterGas.js 与 DmYY.js（须放在同一目录）。';
    alert.addAction('知道了');
    await alert.presentAlert();
    this.settings.lastUpdateCheckTime = Date.now();
    this.saveSettings(false);
    return;
  }

  Run() {
    if (config.runsInApp) {
      this.registerAction({
        title: '组件配置',
        menu: [
          {
            icon: { name: 'arrow.triangle.2.circlepath', color: '#10B981' },
            type: 'input',
            title: '脚本更新',
            desc: '检测 GitHub 官方仓库最新版本',
            name: 'update',
            val: 'update',
            onClick: async () => {
              await this.checkAndUpdateScript();
            },
          },
          {
            icon: { name: 'clock.arrow.2.circlepath', color: '#3B82F6' },
            type: 'input',
            placeholder: '360',
            title: '刷新时间',
            desc: '数据刷新时间，单位：分钟，默认360分钟',
            val: 'interval',
          },
          {
            icon: { name: 'arrow.clockwise', color: '#FF9500' },
            name: 'force_refresh',
            title: '立即刷新',
            desc: '强制跳过缓存间隔，立即向米家山水务拉取最新数据',
            val: 'force_refresh',
            onClick: async () => {
              await this.fetchGasInfo(true);
              const s = new Alert();
              s.title = this.isOffline ? '获取异常' : '刷新成功';
              s.message = this.isOffline ? '在线拉取未成功，已继续保留使用沙盒离线数据。' : `已拉取最新数据！当前余额: ¥ ${this.formatMoney(this.gasData.countMoney)}`;
              s.addAction('确定');
              await s.presentAlert();
              this.reopenScript();
            }
          },
          {
            icon: { name: 'trash', color: '#EF4444' },
            name: 'reset_cache',
            title: '清除缓存',
            desc: '清空本地所有历史缓存数据',
            val: 'reset_cache',
            onClick: async () => {
              const alert = new Alert();
              alert.title = '清除缓存';
              alert.message = '将清空本地所有水费历史缓存数据。确定清除吗？';
              alert.addAction('确认清除');
              alert.addCancelAction('取消');
              const res = await alert.presentAlert();
              if (res === 0) {
                this.clearStorage();
                const s = new Alert();
                s.title = '清除成功';
                s.message = '缓存已清空，请重新进入或刷新拉取！';
                s.addAction('确定');
                await s.presentAlert();
                this.reopenScript();
              }
            }
          },
        ]
      });

      this.registerAction({
        title: '',
        menu: [
          {
            icon: { name: 'person.crop.circle', color: '#3B82F6' },
            name: 'account',
            title: '账户设置',
            type: 'input',
            onClick: () => {
              return this.setAccountConfig();
            }
          },
          {
            icon: { name: 'slider.horizontal.3', color: '#8B5CF6' },
            name: 'show',
            title: '显示配置',
            type: 'input',
            onClick: () => {
              return this.setShowConfig();
            }
          }
        ]
      });

      this.registerAction({
        title: '',
        menu: [
          {
            icon: { name: 'gearshape.fill', color: '#096dd9' },
            name: 'basic',
            title: '基础设置',
            type: 'input',
            onClick: () => {
              return this.setWidgetConfig();
            }
          },
          {
            icon: { name: 'arrow.triangle.2.circlepath.circle.fill', color: '#10B981' },
            name: 'reload',
            title: '重载组件',
            type: 'input',
            onClick: () => {
              this.reopenScript();
            }
          }
        ]
      });
    }
  }
}

await Runing(Widget, args.widgetParameter, false);
