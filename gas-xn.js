// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep orange; icon-glyph: flame.fill;
// ============================================================
// 兴能燃气余额小组件 (Scriptable) — 参考 ChinaGas v1.8.3 UI
// 单文件 · 零依赖 · 不需要服务器
// 内置: 纯JS RSA-1024 (PKCS1 v1.5) + AES-128-ECB/Pkcs7 加密
// 数据: /api/sec/serverKey 协商 + /api/micro/bill/arrearage + accountInfo
// 用法: 存到 Scriptable -> 首次运行填 TOKEN -> 添加桌面小组件
// ============================================================

// ============ 配置区 ============
const CONFIG = {
  BASE_URL: 'http://wx.shuangliu.qjcode.com',
  FROM_DOMAIN_ID: '3000000007',
  CONSNO: '636550678',
  // ↓ 抓包获取的 token (JWT)。每次重新抓包后替换
  // 也支持在 Scriptable 中运行脚本 -> "填写 Token" 存到钥匙串
  TOKEN: 'PASTE_YOUR_JWT_TOKEN_HERE',
};
// 客户端固定 RSA-1024 密钥对 (仅存于本脚本, 用于解密服务端响应)
const CLIENT_KEY = {
  PUB_SPKI_B64: 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCvBLp7nrZQmB4wvmiDEmR/41GwWrqVvysT4wtG2BtoVqMm1MM5QInvf+BxPBtzmtOKD4zneNGmcnvkxfT+VG0TeYJNLw99SVg3SepWy33gQXFOktSeoplF3ZTBEfjWgm2ROWirDyumlm5IwASK39b91hW9ZLCTmdqeMvHkzHbCNwIDAQAB',
  N: 'rwS6e562UJgeML5ogxJkf-NRsFq6lb8rE-MLRtgbaFajJtTDOUCJ73_gcTwbc5rTig-M53jRpnJ75MX0_lRtE3mCTS8PfUlYN0nqVst94EFxTpLUnqKZRd2UwRH41oJtkTloqw8rppZuSMAEit_W_dYVvWSwk5nanjLx5Mx2wjc',
  D: 'GU-vwI0VhNZbF2WSK9KPIke32q9kaJ-7FScyzE4YuKA-_DCtAyyoRjDSPs4YkkGD8mWJVTiN6WqJLG7MnbOMCpW-03AKr6Y5EpJ-TwlUDwWJ2hL2OmAUb-Kh0TLifx_fTLgivDGwQK9zcq84_zOOzEiEq9lkYTBT1vjIbbpP1rE',
  E: 'AQAB',
};
// 钥匙串键名 (存 Token / 缓存)
const KEYCHAIN = {
  TOKEN: 'xl-gas.token',
  CACHE: 'xl-gas.cache',
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
async function callEncrypted(path, payload) {
  const token = getToken();
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
async function queryBalance() {
  const ar = await callEncrypted('/api/micro/bill/arrearage', { consNo: CONFIG.CONSNO });
  const ac = await callEncrypted('/api/micro/bill/accountInfo', { consNo: CONFIG.CONSNO });
  const a = ar.obj || {}, b = ac.obj || {};
  return {
    balance: a.balance ?? b.presBalance ?? null,
    arrears: a.amt ?? a.allFee ?? null,
    lastBalance: a.lastBalance ?? null,
    consNo: b.consNo || a.consNo || CONFIG.CONSNO,
    consName: b.userName || a.yhmc || '',
    gasPropName: b.gasPropName || '',
    gasAddress: b.gasAddress || a.yhdz || '',
    preBalanceTime: a.preBalanceTime || null,
    updatedAt: Date.now(),
  };
}

// ================= UI (参考 ChinaGas v1.8.3) =================
const UI_SETTINGS = {
  alias: '兴能燃气',
  themeColor: '#FF9500',
  balanceColor: '#10B981',
  balanceLimit: 500,     // 进度条满额基准(元), 余额达到此值进度条全亮
  intervalMin: 360,      // 刷新间隔(分钟)
  useGradientBar: true,
  maskCustCode: true,
};
const tone = (light, dark) => Color.dynamic(new Color(light), new Color(dark));
const subColor = () => tone('#6B7280', '#9CA3AF');
const cardColor = () => tone('#F8FAFC', '#161E2E');
const cardLite = () => tone('#F3F4F6', '#1F2937');
const bgWhite = () => tone('#FFFFFF', '#111827');
const dividerColor = () => tone('#E5E7EB', '#1F2937');
const widgetColor = () => tone('#111827', '#F9FAFB');

function getScale() {
  try {
    const s = Device.screenSize();
    const map = [
      [440, 956, 1.0], [430, 932, 0.98], [428, 926, 0.97], [414, 896, 0.95],
      [402, 874, 0.93], [393, 852, 0.90], [390, 844, 0.89], [375, 812, 0.85],
    ];
    const m = map.find(d => (d[0] === s.width && d[1] === s.height) || (d[0] === s.height && d[1] === s.width));
    return m ? m[2] : 0.95;
  } catch (_) { return 0.95; }
}
function getLargeWidth() {
  try {
    const s = Device.screenSize();
    const map = [
      [440, 956, 368], [430, 932, 364], [428, 926, 364], [414, 896, 360],
      [402, 874, 348], [393, 852, 338], [390, 844, 338], [375, 812, 329],
    ];
    const m = map.find(d => (d[0] === Math.min(s.width, s.height) && d[1] === Math.max(s.width, s.height)));
    return m ? m[2] : 338;
  } catch (_) { return 338; }
}
function formatMoney(num) {
  const v = parseFloat(num);
  return isNaN(v) ? '0.00' : v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function maskCode(code) {
  if (!code) return '--';
  const s = String(code);
  if (s.length >= 8) return s.slice(0, 3) + '****' + s.slice(-2);
  return '****' + s.slice(-2);
}
function shortCode(code) {
  if (!code) return '--';
  const s = String(code);
  return s.length > 5 ? s.slice(-5) : s;
}
function formatCompName(name) {
  const raw = (name || '').trim();
  if (!raw || raw === 'undefined' || raw === 'null') return '兴能燃气';
  return raw.replace(/有限责任公司|有限公司|天然气发展有限公司/g, '');
}
function getBalanceRatio(data) {
  const isOwe = data.arrears && parseFloat(data.arrears) > 0;
  if (isOwe) return 0;
  const bal = parseFloat(data.balance);
  if (isNaN(bal) || bal <= 0) return 0;
  const maxLimit = parseFloat(UI_SETTINGS.balanceLimit) || 500;
  return Math.max(0, Math.min(1.0, bal / maxLimit));
}
function getCapsuleActiveCount(data, total = 10) {
  const isOwe = data.arrears && parseFloat(data.arrears) > 0;
  if (isOwe) return 1;
  const ratio = getBalanceRatio(data);
  if (ratio <= 0) return 0;
  return Math.max(1, Math.round(ratio * total));
}
function getBarColors(data) {
  if (!UI_SETTINGS.useGradientBar) {
    const single = UI_SETTINGS.themeColor;
    return { start: single, end: single };
  }
  const isOwe = data.arrears && parseFloat(data.arrears) > 0;
  if (isOwe) return { start: '#EF4444', end: '#DC2626' };
  const ratio = getBalanceRatio(data);
  if (ratio >= 0.8) return { start: '#10B981', end: '#34D399' };
  if (ratio >= 0.6) return { start: '#06B6D4', end: '#22D3EE' };
  if (ratio >= 0.4) return { start: '#EAB308', end: '#FACC15' };
  if (ratio >= 0.2) return { start: '#F97316', end: '#FB923C' };
  return { start: '#EF4444', end: '#F87171' };
}
function interpolateColor(c1hex, c2hex, factor) {
  try {
    const c1 = parseInt(c1hex.replace('#', ''), 16);
    const c2 = parseInt(c2hex.replace('#', ''), 16);
    const r = Math.round(((c1 >> 16) & 255) + (((c2 >> 16) & 255) - ((c1 >> 16) & 255)) * factor);
    const g = Math.round(((c1 >> 8) & 255) + (((c2 >> 8) & 255) - ((c1 >> 8) & 255)) * factor);
    const b = Math.round((c1 & 255) + ((c2 & 255) - (c1 & 255)) * factor);
    return new Color('#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1));
  } catch (_) { return new Color(c1hex); }
}
function drawCapsuleBar(width, height, totalSegments, activeSegments, colors) {
  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const gap = 3.5;
  const segW = (width - gap * (totalSegments - 1)) / totalSegments;
  const corner = height / 2;
  const bg = Color.dynamic(new Color('#E5E7EB'), new Color('#374151'));
  for (let i = 0; i < totalSegments; i++) {
    const x = i * (segW + gap);
    const path = new Path();
    path.addRoundedRect(new Rect(x, 0, segW, height), corner, corner);
    dc.addPath(path);
    if (i < activeSegments) {
      const f = activeSegments > 1 ? (i / (activeSegments - 1)) : 0;
      dc.setFillColor(interpolateColor(colors.start, colors.end, f));
    } else {
      dc.setFillColor(bg);
    }
    dc.fillPath();
  }
  return dc.getImage();
}
// ---- 小号 ----
function renderSmall(w, data, isOffline) {
  const SCALE = getScale();
  const pX = 14 * SCALE, pY = 12 * SCALE;
  w.setPadding(pY, pX, pY, pX);
  w.backgroundColor = bgWhite();
  const themeColor = new Color(UI_SETTINGS.themeColor);
  const balanceColor = new Color(UI_SETTINGS.balanceColor);
  const sub = subColor();
  const isOwe = data.arrears && parseFloat(data.arrears) > 0;
  const body = w.addStack();
  body.layoutVertically();
  // header
  const header = body.addStack();
  header.centerAlignContent();
  const flame = SFSymbol.named('flame.fill');
  flame.applyHeavyWeight();
  const icon = header.addImage(flame.image);
  icon.imageSize = new Size(16 * SCALE, 16 * SCALE);
  icon.tintColor = themeColor;
  header.addSpacer(5);
  const title = header.addText(UI_SETTINGS.alias);
  title.font = Font.boldSystemFont(13 * SCALE);
  title.textColor = widgetColor();
  header.addSpacer();
  const pill = header.addStack();
  pill.centerAlignContent();
  pill.backgroundColor = tone('#F3F4F6', '#1F2937');
  pill.cornerRadius = 6 * SCALE;
  pill.setPadding(2 * SCALE, 6 * SCALE, 2 * SCALE, 6 * SCALE);
  const pillT = pill.addText(isOffline ? '离线' : '● 正常');
  pillT.font = Font.semiboldSystemFont(9.5 * SCALE);
  pillT.textColor = isOffline ? themeColor : balanceColor;
  body.addSpacer();
  // 余额
  const labelRow = body.addStack();
  labelRow.centerAlignContent();
  const balLabel = labelRow.addText(isOwe ? '燃气欠费' : '账户余额');
  balLabel.font = Font.mediumSystemFont(11 * SCALE);
  balLabel.textColor = isOwe ? new Color('#EF4444') : sub;
  body.addSpacer(2 * SCALE);
  const valRow = body.addStack();
  valRow.centerAlignContent();
  const valText = valRow.addText(`¥ ${formatMoney(data.balance)}`);
  valText.font = Font.boldRoundedSystemFont(27 * SCALE);
  valText.textColor = isOwe ? new Color('#EF4444') : balanceColor;
  valText.lineLimit = 1;
  valText.minimumScaleFactor = 0.6;
  body.addSpacer(6 * SCALE);
  // 胶囊进度条
  const active = getCapsuleActiveCount(data, 10);
  const colors = getBarColors(data);
  const capImg = body.addImage(drawCapsuleBar(130 * SCALE, 5.5 * SCALE, 10, active, colors));
  capImg.imageSize = new Size(130 * SCALE, 5.5 * SCALE);
  body.addSpacer();
  // 底部卡片
  const card = body.addStack();
  card.layoutVertically();
  card.backgroundColor = cardColor();
  card.cornerRadius = 8 * SCALE;
  card.setPadding(6 * SCALE, 8 * SCALE, 6 * SCALE, 8 * SCALE);
  const r1 = card.addStack();
  r1.centerAlignContent();
  const gIcon = SFSymbol.named('gauge.badge.plus');
  const gImg = r1.addImage(gIcon.image);
  gImg.imageSize = new Size(11 * SCALE, 11 * SCALE);
  gImg.tintColor = themeColor;
  r1.addSpacer(3);
  const mText = r1.addText(`上期: ¥${formatMoney(data.lastBalance)}`);
  mText.font = Font.systemFont(9.5 * SCALE);
  mText.textColor = sub;
  r1.addSpacer();
  const timeText = r1.addText(stamp(data.updatedAt));
  timeText.font = Font.systemFont(9.5 * SCALE);
  timeText.textColor = sub;
  card.addSpacer(3 * SCALE);
  const r2 = card.addStack();
  r2.centerAlignContent();
  const idIcon = SFSymbol.named('creditcard');
  const idImg = r2.addImage(idIcon.image);
  idImg.imageSize = new Size(11 * SCALE, 11 * SCALE);
  idImg.tintColor = new Color('#3B82F6');
  r2.addSpacer(3);
  const codeText = r2.addText(`户号: ${UI_SETTINGS.maskCustCode ? maskCode(data.consNo) : shortCode(data.consNo)}`);
  codeText.font = Font.systemFont(9.5 * SCALE);
  codeText.textColor = sub;
  r2.addSpacer();
  const nameText = r2.addText(data.consName || '兴能燃气');
  nameText.font = Font.systemFont(9.5 * SCALE);
  nameText.textColor = sub;
  return w;
}
// ---- 中号 ----
function renderMedium(w, data, isOffline) {
  const SCALE = getScale();
  const pX = 16 * SCALE, pY = 12 * SCALE;
  w.setPadding(pY, pX, pY, pX);
  w.backgroundColor = bgWhite();
  const themeColor = new Color(UI_SETTINGS.themeColor);
  const balanceColor = new Color(UI_SETTINGS.balanceColor);
  const sub = subColor();
  const isOwe = data.arrears && parseFloat(data.arrears) > 0;
  const body = w.addStack();
  body.layoutHorizontally();
  const left = body.addStack();
  left.layoutVertically();
  left.size = new Size(155 * SCALE, 0);
  // 左 header
  const lH = left.addStack();
  lH.centerAlignContent();
  const flame = SFSymbol.named('flame.fill');
  flame.applyHeavyWeight();
  const fImg = lH.addImage(flame.image);
  fImg.imageSize = new Size(16 * SCALE, 16 * SCALE);
  fImg.tintColor = themeColor;
  lH.addSpacer(5);
  const lTitle = lH.addText(UI_SETTINGS.alias);
  lTitle.font = Font.boldSystemFont(13 * SCALE);
  lTitle.textColor = widgetColor();
  left.addSpacer();
  const balLabel = left.addText(isOwe ? '燃气欠费 (元)' : '账户余额 (元)');
  balLabel.font = Font.mediumSystemFont(11 * SCALE);
  balLabel.textColor = isOwe ? new Color('#EF4444') : sub;
  left.addSpacer(2 * SCALE);
  const valRow = left.addStack();
  valRow.centerAlignContent();
  const valText = valRow.addText(`¥ ${formatMoney(data.balance)}`);
  valText.font = Font.boldRoundedSystemFont(28 * SCALE);
  valText.textColor = isOwe ? new Color('#EF4444') : balanceColor;
  valText.lineLimit = 1;
  valText.minimumScaleFactor = 0.6;
  left.addSpacer(7 * SCALE);
  const active = getCapsuleActiveCount(data, 10);
  const colors = getBarColors(data);
  const capImg = left.addImage(drawCapsuleBar(148 * SCALE, 7 * SCALE, 10, active, colors));
  capImg.imageSize = new Size(148 * SCALE, 7 * SCALE);
  left.addSpacer();
  const stateRow = left.addStack();
  stateRow.centerAlignContent();
  const dot = stateRow.addText('● ');
  dot.font = Font.systemFont(8 * SCALE);
  dot.textColor = isOwe ? new Color('#EF4444') : balanceColor;
  const stateT = stateRow.addText(isOwe ? '账户已欠费 · 请及时充值' : isOffline ? '离线数据 · 网络不可用' : '账户正常 · 民用阶梯');
  stateT.font = Font.systemFont(10 * SCALE);
  stateT.textColor = sub;
  body.addSpacer(12 * SCALE);
  const divider = body.addStack();
  divider.size = new Size(1, 0);
  divider.backgroundColor = dividerColor();
  body.addSpacer(12 * SCALE);
  const right = body.addStack();
  right.layoutVertically();
  const rTop = right.addStack();
  rTop.centerAlignContent();
  const syncSym = SFSymbol.named('arrow.triangle.2.circlepath');
  const syncImg = rTop.addImage(syncSym.image);
  syncImg.imageSize = new Size(10 * SCALE, 10 * SCALE);
  syncImg.tintColor = sub;
  rTop.addSpacer(3);
  const syncT = rTop.addText(`更新 ${stamp(data.updatedAt)}`);
  syncT.font = Font.systemFont(10 * SCALE);
  syncT.textColor = sub;
  rTop.addSpacer();
  right.addSpacer();
  techRow(right, 'person.crop.rectangle', '客户户号', `${data.consName || '--'}`, themeColor, sub, SCALE);
  right.addSpacer();
  techRow(right, 'number', '燃气户号', UI_SETTINGS.maskCustCode ? maskCode(data.consNo) : String(data.consNo || '--'), new Color('#3B82F6'), sub, SCALE);
  right.addSpacer();
  techRow(right, 'speedometer', '上期余额', `¥${formatMoney(data.lastBalance)}`, new Color('#8B5CF6'), sub, SCALE);
  right.addSpacer();
  techRow(right, 'building.2', '服务单位', formatCompName('双流兴能天然气有限责任公司'), new Color('#10B981'), sub, SCALE);
  return w;
}
function techRow(parent, iconName, label, valStr, iconCol, subCol, SCALE) {
  const r = parent.addStack();
  r.centerAlignContent();
  const sym = SFSymbol.named(iconName);
  const img = r.addImage(sym.image);
  img.imageSize = new Size(13 * SCALE, 13 * SCALE);
  img.tintColor = iconCol;
  r.addSpacer(4);
  const lT = r.addText(label);
  lT.font = Font.systemFont(10.5 * SCALE);
  lT.textColor = subCol;
  r.addSpacer(6);
  const vT = r.addText(valStr);
  vT.font = Font.semiboldSystemFont(11 * SCALE);
  vT.textColor = widgetColor();
  vT.lineLimit = 1;
  vT.minimumScaleFactor = 0.7;
  r.addSpacer();
}
// ---- 大号 ----
function renderLarge(w, data, isOffline) {
  const SCALE = getScale();
  const pX = 16 * SCALE, pY = 14 * SCALE;
  w.setPadding(pY, pX, pY, pX);
  w.backgroundColor = bgWhite();
  const themeColor = new Color(UI_SETTINGS.themeColor);
  const balanceColor = new Color(UI_SETTINGS.balanceColor);
  const sub = subColor();
  const isOwe = data.arrears && parseFloat(data.arrears) > 0;
  const body = w.addStack();
  body.layoutVertically();
  // header
  const header = body.addStack();
  header.centerAlignContent();
  const flame = SFSymbol.named('flame.fill');
  flame.applyHeavyWeight();
  const fImg = header.addImage(flame.image);
  fImg.imageSize = new Size(20 * SCALE, 20 * SCALE);
  fImg.tintColor = themeColor;
  header.addSpacer(6);
  const title = header.addText(UI_SETTINGS.alias);
  title.font = Font.boldSystemFont(15 * SCALE);
  title.textColor = widgetColor();
  header.addSpacer();
  const badge = header.addStack();
  badge.centerAlignContent();
  badge.backgroundColor = tone('#F3F4F6', '#1F2937');
  badge.cornerRadius = 6 * SCALE;
  badge.setPadding(3 * SCALE, 8 * SCALE, 3 * SCALE, 8 * SCALE);
  const tag = badge.addText(isOffline ? '离线模式' : `更新 ${stamp(data.updatedAt)}`);
  tag.font = Font.semiboldSystemFont(10 * SCALE);
  tag.textColor = isOffline ? themeColor : balanceColor;
  body.addSpacer();
  // 余额卡片
  const card = body.addStack();
  card.layoutVertically();
  card.backgroundColor = cardColor();
  card.cornerRadius = 14 * SCALE;
  card.setPadding(12 * SCALE, 16 * SCALE, 12 * SCALE, 16 * SCALE);
  const cLabel = card.addText(isOwe ? '账户欠费总额 (元)' : '当前账户余额 (元)');
  cLabel.font = Font.mediumSystemFont(11.5 * SCALE);
  cLabel.textColor = isOwe ? new Color('#EF4444') : sub;
  card.addSpacer(3 * SCALE);
  const cValRow = card.addStack();
  cValRow.centerAlignContent();
  const val = cValRow.addText(`¥ ${formatMoney(data.balance)}`);
  val.font = Font.boldRoundedSystemFont(33 * SCALE);
  val.textColor = isOwe ? new Color('#EF4444') : balanceColor;
  card.addSpacer(7 * SCALE);
  const contentW = getLargeWidth() - 2 * pX;
  const barW = Math.max(260 * SCALE, contentW - 32 * SCALE);
  const active = getCapsuleActiveCount(data, 14);
  const colors = getBarColors(data);
  const cap = card.addImage(drawCapsuleBar(barW, 8 * SCALE, 14, active, colors));
  cap.imageSize = new Size(barW, 8 * SCALE);
  body.addSpacer();
  // 三卡片
  const grid = body.addStack();
  grid.layoutHorizontally();
  const gap = 8 * SCALE;
  const colW = Math.floor((contentW - 2 * gap) / 3);
  const colW3 = contentW - 2 * gap - 2 * colW;
  const cardA = grid.addStack();
  cardA.layoutVertically();
  cardA.backgroundColor = cardLite();
  cardA.cornerRadius = 10 * SCALE;
  cardA.setPadding(9 * SCALE, 9 * SCALE, 9 * SCALE, 9 * SCALE);
  cardA.size = new Size(colW, 0);
  const aHead = cardA.addStack();
  aHead.centerAlignContent();
  const aIcon = SFSymbol.named('speedometer');
  const aImg = aHead.addImage(aIcon.image);
  aImg.imageSize = new Size(12 * SCALE, 12 * SCALE);
  aImg.tintColor = new Color('#3B82F6');
  aHead.addSpacer(3 * SCALE);
  const aTitle = aHead.addText('上期余额');
  aTitle.font = Font.systemFont(10 * SCALE);
  aTitle.textColor = sub;
  aTitle.lineLimit = 1;
  cardA.addSpacer(4 * SCALE);
  const aVal = cardA.addText(`¥${formatMoney(data.lastBalance)}`);
  aVal.font = Font.boldRoundedSystemFont(16 * SCALE);
  aVal.textColor = widgetColor();
  aVal.lineLimit = 1;
  aVal.minimumScaleFactor = 0.8;
  grid.addSpacer(gap);
  const cardB = grid.addStack();
  cardB.layoutVertically();
  cardB.backgroundColor = cardLite();
  cardB.cornerRadius = 10 * SCALE;
  cardB.setPadding(9 * SCALE, 9 * SCALE, 9 * SCALE, 9 * SCALE);
  cardB.size = new Size(colW, 0);
  const bHead = cardB.addStack();
  bHead.centerAlignContent();
  const bIcon = SFSymbol.named('flame.circle');
  const bImg = bHead.addImage(bIcon.image);
  bImg.imageSize = new Size(12 * SCALE, 12 * SCALE);
  bImg.tintColor = new Color('#8B5CF6');
  bHead.addSpacer(3 * SCALE);
  const bTitle = bHead.addText('气价类型');
  bTitle.font = Font.systemFont(10 * SCALE);
  bTitle.textColor = sub;
  bTitle.lineLimit = 1;
  cardB.addSpacer(4 * SCALE);
  const bVal = cardB.addText(data.gasPropName || '--');
  bVal.font = Font.boldRoundedSystemFont(13.5 * SCALE);
  bVal.textColor = widgetColor();
  bVal.lineLimit = 1;
  bVal.minimumScaleFactor = 0.8;
  grid.addSpacer(gap);
  const cardC = grid.addStack();
  cardC.layoutVertically();
  cardC.backgroundColor = cardLite();
  cardC.cornerRadius = 10 * SCALE;
  cardC.setPadding(9 * SCALE, 9 * SCALE, 9 * SCALE, 9 * SCALE);
  cardC.size = new Size(colW3, 0);
  const cHead = cardC.addStack();
  cHead.centerAlignContent();
  const cIcon = SFSymbol.named('waveform.path.ecg');
  const cImg = cHead.addImage(cIcon.image);
  cImg.imageSize = new Size(12 * SCALE, 12 * SCALE);
  const statusCol = isOwe ? new Color('#EF4444') : (isOffline ? themeColor : balanceColor);
  cImg.tintColor = statusCol;
  cHead.addSpacer(3 * SCALE);
  const cTitle = cHead.addText('账户状态');
  cTitle.font = Font.systemFont(10 * SCALE);
  cTitle.textColor = sub;
  cTitle.lineLimit = 1;
  cardC.addSpacer(4 * SCALE);
  const cRow = cardC.addStack();
  cRow.centerAlignContent();
  const cDot = cRow.addText('● ');
  cDot.font = Font.systemFont(7 * SCALE);
  cDot.textColor = statusCol;
  const cValT = isOwe ? '账户欠费' : (isOffline ? '离线保持' : '余额充足');
  const cVal = cRow.addText(cValT);
  cVal.font = Font.boldSystemFont(12 * SCALE);
  cVal.textColor = widgetColor();
  cVal.lineLimit = 1;
  cVal.minimumScaleFactor = 0.8;
  body.addSpacer();
  // 列表卡
  const listCard = body.addStack();
  listCard.layoutVertically();
  listCard.backgroundColor = cardColor();
  listCard.cornerRadius = 10 * SCALE;
  listCard.setPadding(10 * SCALE, 14 * SCALE, 10 * SCALE, 14 * SCALE);
  techRow(listCard, 'person.crop.rectangle', '客户姓名', data.consName || '--', themeColor, sub, SCALE);
  listCard.addSpacer(6 * SCALE);
  techRow(listCard, 'number', '燃气户号', UI_SETTINGS.maskCustCode ? maskCode(data.consNo) : String(data.consNo || '--'), new Color('#3B82F6'), sub, SCALE);
  listCard.addSpacer(6 * SCALE);
  techRow(listCard, 'building.2', '服务单位', formatCompName('双流兴能天然气有限责任公司'), new Color('#10B981'), sub, SCALE);
  listCard.addSpacer(6 * SCALE);
  techRow(listCard, 'phone.badge.waveform', '服务热线', '028-85860568', new Color('#F59E0B'), sub, SCALE);
  return w;
}
// ---- 占位/错误 ----
function renderGuideWidget(w) {
  w.setPadding(16, 16, 16, 16);
  w.backgroundColor = bgWhite();
  const center = w.addStack();
  center.layoutVertically();
  center.centerAlignContent();
  const title = center.addText('兴能燃气');
  title.font = Font.boldSystemFont(15);
  title.textColor = new Color('#FF9500');
  center.addSpacer(8);
  const tip = center.addText('未检测到 Token 配置');
  tip.font = Font.boldSystemFont(12);
  tip.textColor = widgetColor();
  center.addSpacer(4);
  const desc = center.addText('请点击打开组件，选择「填写 Token」。');
  desc.font = Font.systemFont(11);
  desc.textColor = new Color('#9CA3AF');
  desc.centerAlignText();
  return w;
}
function renderErrorWidget(w, msg) {
  w.setPadding(16, 16, 16, 16);
  w.backgroundColor = bgWhite();
  const center = w.addStack();
  center.layoutVertically();
  center.centerAlignContent();
  const title = center.addText('数据连接失败');
  title.font = Font.boldSystemFont(14);
  title.textColor = new Color('#EF4444');
  center.addSpacer(6);
  const m = center.addText((msg || '网络超时且无离线缓存，请检查网络或重新配置 Token。').slice(0, 60));
  m.font = Font.systemFont(11);
  m.textColor = new Color('#9CA3AF');
  m.centerAlignText();
  m.lineLimit = 4;
  return w;
}
function makeWidget(result, family) {
  const w = new ListWidget();
  w.refreshAfterDate = new Date(Date.now() + 1000 * 60 * UI_SETTINGS.intervalMin);
  w.url = URLScheme.forRunningScript();
  const d = result.data;
  if (family === 'medium') return renderMedium(w, d, result.stale);
  if (family === 'large') return renderLarge(w, d, result.stale);
  return renderSmall(w, d, result.stale);
}
function stamp(ms) {
  if (!ms) return '--';
  const d = new Date(ms);
  const p = v => String(v).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function placeholder(hint) {
  const family = config.widgetFamily || 'medium';
  const w = new ListWidget();
  w.refreshAfterDate = new Date(Date.now() + 1000 * 60 * UI_SETTINGS.intervalMin);
  w.url = URLScheme.forRunningScript();
  if (family === 'medium') return renderGuideWidget(w);
  if (family === 'large') return renderGuideWidget(w);
  return renderGuideWidget(w);
}

// ================= 缓存 =================
function readCache() {
  try { if (Keychain.contains(KEYCHAIN.CACHE)) return JSON.parse(Keychain.get(KEYCHAIN.CACHE)); } catch (_) {}
  return null;
}
function writeCache(data) {
  try { Keychain.set(KEYCHAIN.CACHE, JSON.stringify(data)); } catch (_) {}
}
function readTokenCfg() {
  try { if (Keychain.contains(KEYCHAIN.TOKEN)) return Keychain.get(KEYCHAIN.TOKEN).trim(); } catch (_) {}
  return '';
}

// ================= 主流程 =================
async function runWidget() {
  const family = config.widgetFamily || 'medium';
  let cached = null;
  try { cached = readCache(); } catch (_) {}
  if (cached && cached.updatedAt && Date.now() - cached.updatedAt < UI_SETTINGS.intervalMin * 60 * 1000) {
    Script.setWidget(makeWidget({ data: cached, updatedAt: cached.updatedAt, stale: false }, family));
    Script.complete();
    return;
  }
  try {
    const data = await queryBalance();
    writeCache(data);
    Script.setWidget(makeWidget({ data, updatedAt: data.updatedAt, stale: false }, family));
    Script.complete();
  } catch (e) {
    if (cached) {
      Script.setWidget(makeWidget({ data: cached, updatedAt: cached.updatedAt, stale: true }, family));
    } else {
      Script.setWidget(renderErrorWidget(new ListWidget(), e.message || String(e)));
    }
    Script.complete();
  }
}
async function runApp() {
  const a = new Alert();
  a.title = '兴能燃气 · 小组件';
  const saved = readTokenCfg();
  a.message = saved ? 'Token 已配置 ✓\n选择要执行的操作。' : '需要先填写 Token 才能查询余额。';
  a.addAction('填写 Token');
  a.addAction('立即刷新并预览');
  a.addAction('预览中号');
  a.addAction('预览小号');
  a.addAction('预览大号');
  a.addCancelAction('取消');
  const i = await a.presentSheet();
  if (i === 0) {
    const b = new Alert();
    b.title = '填写 Token';
    b.message = '粘贴 Quantumult X 抓包得到的 token (JWT)。会保存到 iPhone 钥匙串。';
    b.addTextField('token');
    b.addAction('保存');
    b.addCancelAction('取消');
    if (await b.presentAlert() === -1) return;
    const t = b.textFieldValue(0).trim();
    if (!t) { await notice('未保存', 'Token 为空。'); return; }
    try {
      Keychain.set(KEYCHAIN.TOKEN, t);
      await notice('已保存', 'Token 已写入钥匙串。');
    } catch (_) { await notice('保存失败', '钥匙串不可用，请直接编辑脚本顶部 CONFIG.TOKEN。'); }
  } else if (i === 1 || i === 2 || i === 3 || i === 4) {
    const family = i === 3 ? 'small' : (i === 4 ? 'large' : 'medium');
    try {
      const data = await queryBalance();
      writeCache(data);
      const w = makeWidget({ data, updatedAt: data.updatedAt, stale: false }, family);
      if (family === 'small') await w.presentSmall();
      else if (family === 'large') await w.presentLarge();
      else await w.presentMedium();
    } catch (e) {
      await notice('查询失败', e.message || String(e));
    }
  }
}
async function notice(title, body) {
  const a = new Alert();
  a.title = title;
  a.message = body;
  a.addAction('知道了');
  await a.presentAlert();
}

// ================= 入口 =================
if (config.runsInWidget) {
  await runWidget();
} else {
  await runApp();
}
Script.complete();
