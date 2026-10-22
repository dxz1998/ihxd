/**
 * 纯JS 加密核心 (从 Scriptable 版原样移植)
 * RSA-1024 PKCS1 v1.5 + AES-128-ECB/Pkcs7 + Base64 + UTF-8 + ASN.1 SPKI 解析
 */

// ================= Base64 =================
const B64C = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function b64encode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64C[b0 >> 2];
    out += B64C[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? "=" : B64C[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? "=" : B64C[b2 & 63];
  }
  return out;
}

export function b64decode(str: string): Uint8Array {
  const table: Record<string, number> = {};
  for (let i = 0; i < 64; i++) table[B64C[i]] = i;
  const out: number[] = [];
  let buf = 0, bits = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === "=" || c === "\n" || c === "\r") continue;
    const v = table[c];
    if (v === undefined) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); }
  }
  return new Uint8Array(out);
}

// ================= BigInt / 字节工具 =================
export function bytesToBigInt(bytes: Uint8Array): bigint {
  let hex = "0x";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return BigInt(hex);
}

export function bigIntToBytesFixed(v: bigint, len: number): Uint8Array {
  const out = new Uint8Array(len);
  let x = BigInt(v);
  for (let i = len - 1; i >= 0; i--) { out[i] = Number(x & BigInt(0xff)); x >>= BigInt(8); }
  return out;
}

export function b64urlToBigInt(s: string): bigint {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return bytesToBigInt(b64decode(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
}

export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let r = BigInt(1);
  base %= mod;
  while (exp > BigInt(0)) {
    if (exp & BigInt(1)) r = (r * base) % mod;
    base = (base * base) % mod;
    exp >>= BigInt(1);
  }
  return r;
}

// ================= UTF-8 =================
export function strToBytes(s: string): Uint8Array {
  const out: number[] = [];
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

export function bytesToStr(b: Uint8Array): string {
  let out = "", i = 0;
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

// ================= AES-128-ECB/Pkcs7 =================
function gfMul(a: number, b: number): number {
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
function gfPow(base: number, exp: number): number {
  let r = 1;
  while (exp > 0) {
    if (exp & 1) r = gfMul(r, base);
    base = gfMul(base, base);
    exp >>= 1;
  }
  return r;
}
function gfInv(a: number): number { return gfPow(a, 254); }
function affine(inv: number): number {
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

function keyExpansion(key: Uint8Array): Uint8Array {
  const Nk = 4, Nr = 10;
  const w = new Uint8Array(4 * (Nr + 1) * 4);
  const Rcon = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
  for (let i = 0; i < 4 * Nk; i++) w[i] = key[i];
  const temp = new Uint8Array(4);
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
function addRoundKey(s: Uint8Array, rk: Uint8Array, r: number) { for (let i = 0; i < 16; i++) s[i] ^= rk[r * 16 + i]; }
function subBytes(s: Uint8Array, box: Uint8Array) { for (let i = 0; i < 16; i++) s[i] = box[s[i]]; }
function shiftRows(s: Uint8Array) { const t = s.slice(); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s[c * 4 + r] = t[((c + r) % 4) * 4 + r]; }
function invShiftRows(s: Uint8Array) { const t = s.slice(); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s[c * 4 + r] = t[((c - r + 4) % 4) * 4 + r]; }
function mixColumns(s: Uint8Array) {
  for (let c = 0; c < 4; c++) {
    const i = c * 4;
    const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
    s[i] = gfMul(a0, 2) ^ gfMul(a1, 3) ^ a2 ^ a3;
    s[i + 1] = a0 ^ gfMul(a1, 2) ^ gfMul(a2, 3) ^ a3;
    s[i + 2] = a0 ^ a1 ^ gfMul(a2, 2) ^ gfMul(a3, 3);
    s[i + 3] = gfMul(a0, 3) ^ a1 ^ a2 ^ gfMul(a3, 2);
  }
}
function invMixColumns(s: Uint8Array) {
  for (let c = 0; c < 4; c++) {
    const i = c * 4;
    const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
    s[i] = gfMul(a0, 14) ^ gfMul(a1, 11) ^ gfMul(a2, 13) ^ gfMul(a3, 9);
    s[i + 1] = gfMul(a0, 9) ^ gfMul(a1, 14) ^ gfMul(a2, 11) ^ gfMul(a3, 13);
    s[i + 2] = gfMul(a0, 13) ^ gfMul(a1, 9) ^ gfMul(a2, 14) ^ gfMul(a3, 11);
    s[i + 3] = gfMul(a0, 11) ^ gfMul(a1, 13) ^ gfMul(a2, 9) ^ gfMul(a3, 14);
  }
}
function encryptBlock(block: Uint8Array, w: Uint8Array): Uint8Array {
  const s = block.slice();
  addRoundKey(s, w, 0);
  for (let r = 1; r < 10; r++) { subBytes(s, SBOX); shiftRows(s); mixColumns(s); addRoundKey(s, w, r); }
  subBytes(s, SBOX); shiftRows(s); addRoundKey(s, w, 10);
  return s;
}
function decryptBlock(block: Uint8Array, w: Uint8Array): Uint8Array {
  const s = block.slice();
  addRoundKey(s, w, 10);
  for (let r = 9; r >= 1; r--) { invShiftRows(s); subBytes(s, INV_SBOX); addRoundKey(s, w, r); invMixColumns(s); }
  invShiftRows(s); subBytes(s, INV_SBOX); addRoundKey(s, w, 0);
  return s;
}
export function aes128EcbEncrypt(plainBytes: Uint8Array, keyBytes: Uint8Array): Uint8Array {
  const w = keyExpansion(keyBytes);
  const out: number[] = [];
  for (let i = 0; i < plainBytes.length; i += 16) {
    const block = new Uint8Array(16);
    block.set(plainBytes.subarray(i, i + 16));
    for (const b of encryptBlock(block, w)) out.push(b);
  }
  return new Uint8Array(out);
}
export function aes128EcbDecrypt(cipherBytes: Uint8Array, keyBytes: Uint8Array): Uint8Array {
  const w = keyExpansion(keyBytes);
  const out: number[] = [];
  for (let i = 0; i < cipherBytes.length; i += 16) {
    const block = new Uint8Array(16);
    block.set(cipherBytes.subarray(i, i + 16));
    for (const b of decryptBlock(block, w)) out.push(b);
  }
  return new Uint8Array(out);
}
export function pkcs7Pad(data: Uint8Array): Uint8Array {
  const pad = 16 - (data.length % 16);
  const out = new Uint8Array(data.length + pad);
  out.set(data);
  for (let i = 0; i < pad; i++) out[data.length + i] = pad;
  return out;
}
export function pkcs7Unpad(data: Uint8Array): Uint8Array {
  const pad = data[data.length - 1];
  if (pad < 1 || pad > 16) throw new Error("非法PKCS7填充");
  return data.subarray(0, data.length - pad);
}

// ================= RSA (PKCS1 v1.5) =================
export function rsaPublicEncrypt(messageBytes: Uint8Array, n: bigint, e: bigint): Uint8Array {
  const k = 128;
  if (messageBytes.length > k - 11) throw new Error("消息过长");
  const em = new Uint8Array(k);
  em[0] = 0x00; em[1] = 0x02;
  const psLen = k - messageBytes.length - 3;
  for (let i = 0; i < psLen; i++) em[2 + i] = Math.floor(Math.random() * 255) + 1;
  em[k - messageBytes.length - 1] = 0x00;
  em.set(messageBytes, k - messageBytes.length);
  return bigIntToBytesFixed(modPow(bytesToBigInt(em), e, n), k);
}
export function rsaPrivateDecrypt(cipherBytes: Uint8Array, n: bigint, d: bigint): Uint8Array {
  const k = 128;
  const m = modPow(bytesToBigInt(cipherBytes), d, n);
  const em = bigIntToBytesFixed(m, k);
  if (em[0] !== 0x00 || em[1] !== 0x02) throw new Error("RSA填充错误");
  let i = 2;
  while (i < k && em[i] !== 0x00) i++;
  if (i >= k) throw new Error("RSA无分隔符");
  return em.subarray(i + 1);
}

/** 解析 X.509 SubjectPublicKeyInfo (DER, base64) 提取 RSA (n, e) */
export function parseSpkiPub(b64: string): { n: bigint; e: bigint } {
  const der = b64decode(b64);
  const readLen = (p: number): { len: number; next: number } => {
    if (!(der[p] & 0x80)) return { len: der[p], next: p + 1 };
    const n = der[p] & 0x7f;
    let v = 0;
    for (let j = 0; j < n; j++) v = v * 256 + der[p + 1 + j];
    return { len: v, next: p + 1 + n };
  };
  let i = 0;
  if (der[i++] !== 0x30) throw new Error("SPKI头错误");
  i = readLen(i).next;
  if (der[i++] !== 0x30) throw new Error("算法头错误");
  const algLen = readLen(i); i = algLen.next + algLen.len;
  if (der[i++] !== 0x03) throw new Error("BIT STRING错误");
  const bsLen = readLen(i); i = bsLen.next + bsLen.len;
  let j = i - bsLen.len;
  if (der[j] !== 0x00) throw new Error("BIT STRING padding错误");
  j += 1;
  if (der[j++] !== 0x30) throw new Error("内部序列错误");
  j = readLen(j).next;
  if (der[j++] !== 0x02) throw new Error("n错误");
  const nLen = readLen(j); const nBytes = der.subarray(nLen.next, nLen.next + nLen.len);
  j = nLen.next + nLen.len;
  if (der[j++] !== 0x02) throw new Error("e错误");
  const eLen = readLen(j); const eBytes = der.subarray(eLen.next, eLen.next + eLen.len);
  return { n: bytesToBigInt(nBytes), e: bytesToBigInt(eBytes) };
}
