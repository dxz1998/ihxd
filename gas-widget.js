// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep orange; icon-glyph: flame.fill;
// ============================================================
// gas-widget.js — 成都双流兴能天然气 余额小组件 (Scriptable)
// 单文件 · 零依赖 · 不需要服务器/后端
// 内置: 纯JS RSA-1024 (PKCS1 v1.5) + AES-128-ECB/Pkcs7 加密
// 数据: /api/sec/serverKey 协商 + /api/micro/bill/arrearage 余额
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
function gfInv(a) { return gfPow(a, 254); } // a^(2^8-2) = a^-1 in GF(2^8)
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
// 解析服务端 RSA 公钥 (SPKI DER base64) -> {n, e}
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
  // 1. serverKey 协商
  const sk = await postJson('/api/sec/serverKey', { key: CLIENT_KEY.PUB_SPKI_B64, data: '' }, commonHdrs);
  if (!sk || !sk.obj) throw new Error('协商失败');
  const secret = sk.obj.key;
  const serverPub = parseSpkiPub(sk.obj.data);
  // 2. 加密请求体
  const aesKeyStr = genAesKey();
  const aesKeyBytes = strToBytes(aesKeyStr);
  const encData = aes128EcbEncrypt(pkcs7Pad(strToBytes(JSON.stringify(payload))), aesKeyBytes);
  const encKey = rsaPublicEncrypt(strToBytes(aesKeyStr), serverPub.n, serverPub.e);
  // 3. 调用
  const resp = await postJson(path, { key: b64encode(encKey), data: b64encode(encData) }, Object.assign({ secret }, commonHdrs));
  if (!resp || !resp.key || !resp.data) throw new Error('接口失败: ' + JSON.stringify(resp).slice(0, 200));
  // 4. 解密
  const aesKey2 = rsaPrivateDecrypt(b64decode(resp.key), b64urlToBigInt(CLIENT_KEY.N), b64urlToBigInt(CLIENT_KEY.D));
  const plain = JSON.parse(bytesToStr(pkcs7Unpad(aes128EcbDecrypt(b64decode(resp.data), aesKey2))));
  if (plain.success === false) throw new Error(plain.msg || '接口返回失败');
  return plain;
}
// 主查询: arrearage(余额/欠费/上期余额) + accountInfo(户名/卡号/气种)
async function queryBalance() {
  const ar = await callEncrypted('/api/micro/bill/arrearage', { consNo: CONFIG.CONSNO });
  const ac = await callEncrypted('/api/micro/bill/accountInfo', { consNo: CONFIG.CONSNO });
  const a = ar.obj || {}, b = ac.obj || {};
  return {
    balance: a.balance ?? b.presBalance ?? '—',
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

// ================= 小组件 UI (参考港华燃气组件风格) =================
const tone = (light, dark) => Color.dynamic(new Color(light), new Color(dark));
const C = {
  bg: tone('#FFF9F3', '#211C19'), bgEnd: tone('#F6EEE5', '#171513'),
  text: tone('#33251E', '#F8EDE4'), muted: tone('#796352', '#C4B2A4'),
  accent: tone('#B75022', '#FFB581'), panel: tone('#F3E7DA', '#33291F'),
  iconBg: tone('#F9DFC9', '#4B3022'), alert: tone('#A12D25', '#FFAA99'),
  ok: tone('#1F7A4D', '#7FD9A8'),
};
const pad2 = v => String(v).padStart(2, '0');
function stamp(ms) {
  if (!ms) return '尚未查询';
  const d = new Date(ms);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function font(size, weight = 'medium', rounded = false) {
  const method = rounded ? (weight === 'bold' ? 'boldRoundedSystemFont' : 'semiboldRoundedSystemFont') : (weight === 'bold' ? 'semiboldSystemFont' : 'mediumSystemFont');
  return typeof Font[method] === 'function' ? Font[method](size) : (weight === 'bold' ? Font.boldSystemFont(size) : Font.mediumSystemFont(size));
}
function text(parent, value, size = 11, weight = 'medium', color = C.text, rounded = false) {
  const t = parent.addText(String(value));
  t.font = font(size, weight, rounded);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.65;
  return t;
}
function row(p) { const r = p.addStack(); r.layoutHorizontally(); r.centerAlignContent(); return r; }
function col(p) { const r = p.addStack(); r.layoutVertically(); return r; }
function symbol(p, name, size, color = C.accent) {
  const s = SFSymbol.named(name);
  if (!s) return;
  const v = p.addImage(s.image);
  v.imageSize = new Size(size, size);
  v.tintColor = color;
}
function tile(p, padding = 8) {
  const t = col(p);
  t.backgroundColor = C.panel;
  t.cornerRadius = 11;
  t.setPadding(padding, padding, padding, padding);
  return t;
}
function setup(family) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  if (typeof LinearGradient !== 'undefined') {
    const g = new LinearGradient();
    g.colors = [C.bg, C.bgEnd];
    g.locations = [0, 1];
    g.startPoint = new Point(0, 0);
    g.endPoint = new Point(1, 1);
    w.backgroundGradient = g;
  }
  const p = family === 'small' ? 11 : (family === 'large' ? 16 : 14);
  w.setPadding(p, p, p, p);
  w.url = URLScheme.forRunningScript();
  w.refreshAfterDate = new Date(Date.now() + 4 * 60 * 60 * 1000);
  return w;
}
function header(w, data, compact = false) {
  const r = row(w);
  const badge = row(r);
  badge.backgroundColor = C.iconBg;
  badge.cornerRadius = 6;
  badge.setPadding(3, 3, 3, 3);
  symbol(badge, 'flame.fill', 13);
  r.addSpacer(6);
  text(r, '兴能燃气', compact ? 12 : 13, 'bold');
  r.addSpacer();
  if (data && data.arrears > 0) text(r, '有欠费', 9, 'medium', C.alert);
  else if (!compact) text(r, '账户余额', 10, 'medium', C.muted);
}
function formatMoney(v, digits = 2) {
  return v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(digits);
}
function amount(parent, data, size) {
  const value = formatMoney(data.balance);
  const len = value.length;
  text(parent, value, Math.min(size, len > 9 ? 26 : len > 7 ? 30 : size), 'bold', C.accent, true);
}
function footer(w, result, compact = false) {
  const r = row(w);
  text(r, `更新 ${stamp(result.updatedAt)}`, compact ? 9 : 9.5, 'medium', C.muted);
  r.addSpacer();
  if (result.stale) text(r, '上次成功', 9, 'medium', C.alert);
}
function small(result) {
  const d = result.data, w = setup('small');
  header(w, d, true);
  w.addSpacer(6);
  const caption = row(w);
  text(caption, '账户余额 · 元', 9, 'medium', C.muted);
  caption.addSpacer();
  text(caption, d.arrears > 0 ? `待缴 ¥${formatMoney(d.arrears)}` : '无欠费', 8.5, 'medium', d.arrears > 0 ? C.alert : C.ok);
  amount(w, d, 33);
  w.addSpacer(5);
  const panel = row(w);
  panel.backgroundColor = C.panel;
  panel.cornerRadius = 10;
  panel.setPadding(5, 7, 5, 7);
  const left = col(panel);
  text(left, '上期余额', 8.5, 'medium', C.muted);
  text(left, formatMoney(d.lastBalance), 12, 'bold', C.text, true);
  panel.addSpacer();
  const right = col(panel);
  text(right, '户号', 8.5, 'medium', C.muted);
  text(right, String(d.consNo || '—').slice(-4), 12, 'bold', C.text, true);
  w.addSpacer();
  w.addSpacer(5);
  footer(w, result, true);
  return w;
}
function medium(result) {
  const d = result.data, w = setup('medium');
  header(w, d);
  w.addSpacer(8);
  const r = w.addStack();
  r.layoutHorizontally();
  r.topAlignContent();
  const left = col(r);
  left.size = new Size(124, 0);
  text(left, '账户余额 · 元', 10, 'medium', C.muted);
  left.addSpacer(2);
  amount(left, d, 35);
  left.addSpacer(1);
  text(left, d.arrears > 0 ? `待缴 ¥${formatMoney(d.arrears)}` : '无欠费', 10, 'medium', d.arrears > 0 ? C.alert : C.ok);
  r.addSpacer(12);
  r.addSpacer();
  const t = tile(r, 8);
  t.size = new Size(134, 0);
  const l1 = row(t);
  text(l1, '上期余额', 9, 'medium', C.muted);
  l1.addSpacer();
  const v1 = row(t);
  text(v1, formatMoney(d.lastBalance), 20, 'bold', C.text, true);
  v1.addSpacer(3);
  text(v1, '元', 10, 'medium', C.muted);
  t.addSpacer(3);
  text(t, `户号 ${d.consNo || '—'}`, 9, 'medium', C.muted);
  w.addSpacer();
  w.addSpacer(5);
  footer(w, result);
  return w;
}
function large(result) {
  const d = result.data, w = setup('large');
  header(w, d);
  w.addSpacer(14);
  const r = w.addStack();
  r.layoutHorizontally();
  r.topAlignContent();
  const left = col(r);
  left.size = new Size(128, 0);
  text(left, '账户余额 · 元', 10, 'medium', C.muted);
  left.addSpacer(2);
  amount(left, d, 39);
  left.addSpacer(1);
  text(left, d.arrears > 0 ? `待缴 ¥${formatMoney(d.arrears)}` : '无欠费', 10, 'medium', d.arrears > 0 ? C.alert : C.ok);
  r.addSpacer(12);
  r.addSpacer();
  const t = tile(r, 8);
  t.size = new Size(142, 0);
  const l1 = row(t);
  text(l1, '上期余额', 9, 'medium', C.muted);
  l1.addSpacer();
  const v1 = row(t);
  text(v1, formatMoney(d.lastBalance), 24, 'bold', C.text, true);
  v1.addSpacer(3);
  text(v1, '元', 10, 'medium', C.muted);
  t.addSpacer(3);
  text(t, `户名 ${d.consName || '—'}`, 9, 'medium', C.muted);
  w.addSpacer(14);
  const info = tile(w, 11);
  const r1 = row(info);
  text(r1, '户号', 10, 'medium', C.muted);
  r1.addSpacer();
  text(r1, d.consNo || '—', 12, 'bold', C.text);
  info.addSpacer(6);
  const r2 = row(info);
  text(r2, '气种', 10, 'medium', C.muted);
  r2.addSpacer();
  text(r2, d.gasPropName || '—', 12, 'bold', C.text);
  info.addSpacer(6);
  const r3 = row(info);
  text(r3, '余额刷新', 10, 'medium', C.muted);
  r3.addSpacer();
  text(r3, d.preBalanceTime ? stamp(Number(d.preBalanceTime)) : '—', 11, 'bold', C.text);
  if (d.gasAddress) {
    info.addSpacer(6);
    const r4 = row(info);
    text(r4, '地址', 10, 'medium', C.muted);
    r4.addSpacer();
    const a = text(r4, d.gasAddress, 11, 'medium', C.text);
    a.lineLimit = 2;
  }
  w.addSpacer();
  w.addSpacer(7);
  footer(w, result);
  return w;
}
function make(result, family = 'medium') {
  if (family === 'small') return small(result);
  if (family === 'large') return large(result);
  return medium(result);
}
function placeholder(hint) {
  const family = config.widgetFamily || 'medium';
  const w = setup(family);
  header(w, null, family === 'small');
  w.addSpacer(12);
  const msg = text(w, hint || '请打开脚本填写 Token', family === 'small' ? 11 : 13, 'medium', C.muted);
  msg.lineLimit = 4;
  w.addSpacer();
  text(w, '打开脚本完成配置', family === 'small' ? 8 : 9, 'medium', C.muted);
  return w;
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
  // 4小时内直接使用缓存, 避免频繁请求
  if (cached && cached.updatedAt && Date.now() - cached.updatedAt < 4 * 60 * 60 * 1000) {
    const w = make({ data: cached, updatedAt: cached.updatedAt, stale: false }, family);
    Script.setWidget(w);
    Script.complete();
    return;
  }
  try {
    const data = await queryBalance();
    writeCache(data);
    const w = make({ data, updatedAt: data.updatedAt, stale: false }, family);
    Script.setWidget(w);
    Script.complete();
  } catch (e) {
    if (cached) {
      const w = make({ data: cached, updatedAt: cached.updatedAt, stale: true }, family);
      Script.setWidget(w);
    } else {
      const w = placeholder(e.message || String(e));
      Script.setWidget(w);
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
      const w = make({ data, updatedAt: data.updatedAt, stale: false }, family);
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
