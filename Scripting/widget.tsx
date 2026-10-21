/**
 * 组件名称: 米家山水务 (Mijia Water)
 * 版本号: v1.8.3 (Scripting 转换版)
 * 来源: Scriptable 版「米家山水务.scriptable」
 * 依赖: Scripting (TSX + Hooks)
 * 使用说明: 导入 Scripting 后运行，按设置界面配置户号与 token 即可
 */

import {
  Widget, VStack, HStack, Text, Image, Spacer, Canvas,
  Navigation, NavigationStack, List, Section,
  TextField, Button, Toggle, Color, Font, Keychain, Storage,
  Pasteboard, fetch, Script, Alert, confirmationDialog,
  WidgetReloadPolicy,
} from 'scripting'

// ============================================================
// 常量 (原样保留)
// ============================================================
const CONFIG = {
  BASE_URL: 'https://m.cdmjwater.com',
  FROM_DOMAIN_ID: '2',
  CONSNO: '121338748',
  // ↓ 抓包获取的 token (JWT)。每次重新抓包后替换
  // 也支持在设置界面粘贴新 token 后存入钥匙串
  TOKEN: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3OTI0MDA4MzkwMDAsInBheWxvYWQiOiJcImxkaTk0dnFFbXB4bENLdzNob0NobTlaTTdyUmZTdEk5dldNME14bS9tWjdjMlR3aFdybnBPdFZ5aVRnQWYyeGVvaUVRa3RiMUVHQkhHZlpiQnQyS1Q4aEowbTk0K241RFpuU3I3L2Yra0l1N2lhR1pOL1BhSTJWOVdZNk1rUFdGalowVHFDK2t2VmdTdktvT25XOGdYTGhrdDVoSnFsYjU3OWgrOG0zeWE3Zk1BNU5leDZBYjlMci95VXlCb3AxVk8zNWh6WjlabVdmeU1KY1V2dzVqUGRBNmJYM0hOaGNPaUdOQm1UZHNKTFhNZnI3eEg3VElxQkNjYUJtbE56eW1BZ3Z6UE5wdzFUQVN3dXU0L3A5dzJRPT1cIiJ9.xSClksjVlr74YX8wx7j93J9G4TyRJkbjr6JWVqbO3qM',
}

// 客户端固定 RSA-1024 密钥对 (仅存于本脚本, 用于解密服务端响应)
const CLIENT_KEY = {
  PUB_SPKI_B64: 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCs7q1cdBwpVEUSRP1ha2KwhI59HpmnXS5g48CKQGy46HtexjzpGL3CAwQirbskqBrPXnzRLbUnESgTiJmgqG1MVbwYRtqqjTJ6VX+nK9Utz/cNLTcg/Xoz6LDZVKuZU9kglNOYAw7o4kM0sbJ4AxNms5h+x7cO3BwZX72cbsBuOwIDAQAB',
  N: 'AKzurVx0HClURRJE_WFrYrCEjn0emaddLmDjwIpAbLjoe17GPOkYvcIDBCKtuySoGs9efNEttScRKBOImaCobUxVvBhG2qqNMnpVf6cr1S3P9w0tNyD9ejPosNlUq5lT2SCU05gDDujiQzSxsngDE2azmH7Htw7cHBlfvZxuwG47',
  D: 'FjZqKi_31g8u-BPIgBTtDkNYkhW2IttDM8rNVnTEAlRKVHgeJsq4xQziIRozqZe2KeC3I589X5FClo-7O_mmYCuPzx3esYYws4QpBE3_oSw7sRdGSKNKl9PrCQJLIHLVWkQcJ8pbFuiew6wGn_QaIYAFWmUcDpk720_QeZjHQhE',
  E: 'AQAB',
}

// 钥匙串键名 (存 Token / 缓存 / 设置)
const KEYCHAIN = {
  TOKEN: 'mj-water.token',
  CACHE: 'mj-water.cache',
  SETTINGS: 'mj-water.settings',
}

// ============================================================
// 纯JS 基础工具 (原样保留)
// ============================================================
const B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function b64encode(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2]
    out += B64C[b0 >> 2]
    out += B64C[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)]
    out += b1 === undefined ? '=' : B64C[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)]
    out += b2 === undefined ? '=' : B64C[b2 & 63]
  }
  return out
}
function b64decode(str) {
  const table = {}
  for (let i = 0; i < 64; i++) table[B64C[i]] = i
  const out = []
  let buf = 0, bits = 0
  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (c === '=' || c === '\n' || c === '\r') continue
    const v = table[c]
    if (v === undefined) continue
    buf = (buf << 6) | v
    bits += 6
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff) }
  }
  return new Uint8Array(out)
}
function bytesToBigInt(bytes) {
  let hex = '0x'
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0')
  return BigInt(hex)
}
function bigIntToBytesFixed(v, len) {
  const out = new Uint8Array(len)
  let x = BigInt(v)
  for (let i = len - 1; i >= 0; i--) { out[i] = Number(x & 0xffn); x >>= 8n }
  return out
}
function b64urlToBigInt(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  return bytesToBigInt(b64decode(b64 + '='.repeat((4 - b64.length % 4) % 4)))
}
function modPow(base, exp, mod) {
  let r = 1n
  base %= mod
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod
    base = (base * base) % mod
    exp >>= 1n
  }
  return r
}
function strToBytes(s) {
  const out = []
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const lo = s.charCodeAt(i + 1)
      if (lo >= 0xdc00 && lo <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00); i++ }
      else c = 0xfffd
    } else if (c >= 0xdc00 && c <= 0xdfff) c = 0xfffd
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
  }
  return new Uint8Array(out)
}
function bytesToStr(b) {
  let out = '', i = 0
  while (i < b.length) {
    const c = b[i]
    if (c < 0x80) { out += String.fromCharCode(c); i++ }
    else if ((c & 0xe0) === 0xc0 && i + 1 < b.length) {
      out += String.fromCharCode(((c & 0x1f) << 6) | (b[i + 1] & 0x3f)); i += 2
    } else if ((c & 0xf0) === 0xe0 && i + 2 < b.length) {
      out += String.fromCharCode(((c & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f)); i += 3
    } else if ((c & 0xf8) === 0xf0 && i + 3 < b.length) {
      const cp = ((c & 0x07) << 18) | ((b[i + 1] & 0x3f) << 12) | ((b[i + 2] & 0x3f) << 6) | (b[i + 3] & 0x3f)
      out += String.fromCodePoint(cp); i += 4
    } else { i++ }
  }
  return out
}

// ============================================================
// 纯JS AES-128-ECB/Pkcs7 (原样保留)
// ============================================================
function gfMul(a, b) {
  let p = 0
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a
    const hi = a & 0x80
    a = (a << 1) & 0xff
    if (hi) a ^= 0x1b
    b >>= 1
  }
  return p
}
function gfPow(base, exp) {
  let r = 1
  while (exp > 0) {
    if (exp & 1) r = gfMul(r, base)
    base = gfMul(base, base)
    exp >>= 1
  }
  return r
}
function gfInv(a) { return gfPow(a, 254) }
function affine(inv) {
  let res = 0
  for (let i = 0; i < 8; i++) {
    const bit = ((inv >> i) & 1) ^ ((inv >> ((i + 4) % 8)) & 1) ^ ((inv >> ((i + 5) % 8)) & 1) ^ ((inv >> ((i + 6) % 8)) & 1) ^ ((inv >> ((i + 7) % 8)) & 1) ^ ((0x63 >> i) & 1)
    res |= bit << i
  }
  return res
}
const SBOX = (() => {
  const s = new Uint8Array(256)
  for (let i = 0; i < 256; i++) s[i] = i === 0 ? 0x63 : affine(gfInv(i))
  return s
})()
const INV_SBOX = (() => { const inv = new Uint8Array(256); for (let i = 0; i < 256; i++) inv[SBOX[i]] = i; return inv })()
function keyExpansion(key) {
  const Nk = 4, Nr = 10
  const w = new Uint8Array(4 * (Nr + 1) * 4)
  const Rcon = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]
  for (let i = 0; i < 4 * Nk; i++) w[i] = key[i]
  let temp = new Uint8Array(4)
  for (let i = Nk; i < 4 * (Nr + 1); i++) {
    for (let j = 0; j < 4; j++) temp[j] = w[(i - 1) * 4 + j]
    if (i % Nk === 0) {
      const t0 = temp[0]
      temp[0] = temp[1]; temp[1] = temp[2]; temp[2] = temp[3]; temp[3] = t0
      for (let j = 0; j < 4; j++) temp[j] = SBOX[temp[j]]
      temp[0] ^= Rcon[i / Nk - 1]
    }
    for (let j = 0; j < 4; j++) w[i * 4 + j] = w[(i - Nk) * 4 + j] ^ temp[j]
  }
  return w
}
function addRoundKey(s, rk, r) { for (let i = 0; i < 16; i++) s[i] ^= rk[r * 16 + i] }
function subBytes(s, box) { for (let i = 0; i < 16; i++) s[i] = box[s[i]] }
function shiftRows(s) { const t = s.slice(); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s[c * 4 + r] = t[((c + r) % 4) * 4 + r] }
function invShiftRows(s) { const t = s.slice(); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s[c * 4 + r] = t[((c - r + 4) % 4) * 4 + r] }
function mixColumns(s) {
  for (let c = 0; c < 4; c++) {
    const i = c * 4
    const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3]
    s[i] = gfMul(a0, 2) ^ gfMul(a1, 3) ^ a2 ^ a3
    s[i + 1] = a0 ^ gfMul(a1, 2) ^ gfMul(a2, 3) ^ a3
    s[i + 2] = a0 ^ a1 ^ gfMul(a2, 2) ^ gfMul(a3, 3)
    s[i + 3] = gfMul(a0, 3) ^ a1 ^ a2 ^ gfMul(a3, 2)
  }
}
function invMixColumns(s) {
  for (let c = 0; c < 4; c++) {
    const i = c * 4
    const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3]
    s[i] = gfMul(a0, 14) ^ gfMul(a1, 11) ^ gfMul(a2, 13) ^ gfMul(a3, 9)
    s[i + 1] = gfMul(a0, 9) ^ gfMul(a1, 14) ^ gfMul(a2, 11) ^ gfMul(a3, 13)
    s[i + 2] = gfMul(a0, 13) ^ gfMul(a1, 9) ^ gfMul(a2, 14) ^ gfMul(a3, 11)
    s[i + 3] = gfMul(a0, 11) ^ gfMul(a1, 13) ^ gfMul(a2, 9) ^ gfMul(a3, 14)
  }
}
function encryptBlock(block, w) {
  const s = block.slice()
  addRoundKey(s, w, 0)
  for (let r = 1; r < 10; r++) { subBytes(s, SBOX); shiftRows(s); mixColumns(s); addRoundKey(s, w, r) }
  subBytes(s, SBOX); shiftRows(s); addRoundKey(s, w, 10)
  return s
}
function decryptBlock(block, w) {
  const s = block.slice()
  addRoundKey(s, w, 10)
  for (let r = 9; r >= 1; r--) { invShiftRows(s); subBytes(s, INV_SBOX); addRoundKey(s, w, r); invMixColumns(s) }
  invShiftRows(s); subBytes(s, INV_SBOX); addRoundKey(s, w, 0)
  return s
}
function aes128EcbEncrypt(plainBytes, keyBytes) {
  const w = keyExpansion(keyBytes)
  const out = []
  for (let i = 0; i < plainBytes.length; i += 16) {
    const block = new Uint8Array(16)
    block.set(plainBytes.subarray(i, i + 16))
    out.push(...encryptBlock(block, w))
  }
  return new Uint8Array(out)
}
function aes128EcbDecrypt(cipherBytes, keyBytes) {
  const w = keyExpansion(keyBytes)
  const out = []
  for (let i = 0; i < cipherBytes.length; i += 16) {
    const block = new Uint8Array(16)
    block.set(cipherBytes.subarray(i, i + 16))
    out.push(...decryptBlock(block, w))
  }
  return new Uint8Array(out)
}
function pkcs7Pad(data) {
  const pad = 16 - (data.length % 16)
  const out = new Uint8Array(data.length + pad)
  out.set(data)
  for (let i = 0; i < pad; i++) out[data.length + i] = pad
  return out
}
function pkcs7Unpad(data) {
  const pad = data[data.length - 1]
  if (pad < 1 || pad > 16) throw new Error('非法PKCS7填充')
  return data.subarray(0, data.length - pad)
}

// ============================================================
// 纯JS RSA (PKCS1 v1.5) (原样保留)
// ============================================================
function rsaPublicEncrypt(messageBytes, n, e) {
  const k = 128
  if (messageBytes.length > k - 11) throw new Error('消息过长')
  const em = new Uint8Array(k)
  em[0] = 0x00; em[1] = 0x02
  const psLen = k - messageBytes.length - 3
  for (let i = 0; i < psLen; i++) em[2 + i] = Math.floor(Math.random() * 255) + 1
  em[k - messageBytes.length - 1] = 0x00
  em.set(messageBytes, k - messageBytes.length)
  return bigIntToBytesFixed(modPow(bytesToBigInt(em), e, n), k)
}
function rsaPrivateDecrypt(cipherBytes, n, d) {
  const k = 128
  const m = modPow(bytesToBigInt(cipherBytes), d, n)
  const em = bigIntToBytesFixed(m, k)
  if (em[0] !== 0x00 || em[1] !== 0x02) throw new Error('RSA填充错误')
  let i = 2
  while (i < k && em[i] !== 0x00) i++
  if (i >= k) throw new Error('RSA无分隔符')
  return em.subarray(i + 1)
}
function parseSpkiPub(b64) {
  const der = b64decode(b64)
  const readLen = (p) => {
    if (!(der[p] & 0x80)) return { len: der[p], next: p + 1 }
    const n = der[p] & 0x7f
    let v = 0
    for (let j = 0; j < n; j++) v = v * 256 + der[p + 1 + j]
    return { len: v, next: p + 1 + n }
  }
  let i = 0
  if (der[i++] !== 0x30) throw new Error('SPKI头错误')
  i = readLen(i).next
  if (der[i++] !== 0x30) throw new Error('算法头错误')
  const algLen = readLen(i); i = algLen.next + algLen.len
  if (der[i++] !== 0x03) throw new Error('BIT STRING错误')
  const bsLen = readLen(i); i = bsLen.next + bsLen.len
  let j = i - bsLen.len
  if (der[j] !== 0x00) throw new Error('BIT STRING padding错误')
  j += 1
  if (der[j++] !== 0x30) throw new Error('内部序列错误')
  j = readLen(j).next
  if (der[j++] !== 0x02) throw new Error('n错误')
  const nLen = readLen(j); const nBytes = der.subarray(nLen.next, nLen.next + nLen.len)
  j = nLen.next + nLen.len
  if (der[j++] !== 0x02) throw new Error('e错误')
  const eLen = readLen(j); const eBytes = der.subarray(eLen.next, eLen.next + eLen.len)
  return { n: bytesToBigInt(nBytes), e: bytesToBigInt(eBytes) }
}

// ============================================================
// 业务流程 (API 层已改为 Scripting fetch / Keychain)
// ============================================================
function genAesKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}
function getToken() {
  try { if (Keychain.contains(KEYCHAIN.TOKEN)) { const t = Keychain.get(KEYCHAIN.TOKEN).trim(); if (t) return t } } catch (_) {}
  return CONFIG.TOKEN
}
async function postJson(urlPath, bodyObj, headers) {
  const resp = await fetch(CONFIG.BASE_URL + urlPath, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers),
    body: JSON.stringify(bodyObj),
    timeout: 12,
  })
  return resp.json()
}
async function callEncrypted(path, payload, token) {
  const commonHdrs = { token, fromDomainId: CONFIG.FROM_DOMAIN_ID, part: 'WECHAT' }
  const sk = await postJson('/api/sec/serverKey', { key: CLIENT_KEY.PUB_SPKI_B64, data: '' }, commonHdrs)
  if (!sk || !sk.obj) throw new Error('协商失败')
  const secret = sk.obj.key
  const serverPub = parseSpkiPub(sk.obj.data)
  const aesKeyStr = genAesKey()
  const aesKeyBytes = strToBytes(aesKeyStr)
  const encData = aes128EcbEncrypt(pkcs7Pad(strToBytes(JSON.stringify(payload))), aesKeyBytes)
  const encKey = rsaPublicEncrypt(strToBytes(aesKeyStr), serverPub.n, serverPub.e)
  const resp = await postJson(path, { key: b64encode(encKey), data: b64encode(encData) }, Object.assign({ secret }, commonHdrs))
  if (!resp || !resp.key || !resp.data) throw new Error('接口失败: ' + JSON.stringify(resp).slice(0, 200))
  const aesKey2 = rsaPrivateDecrypt(b64decode(resp.key), b64urlToBigInt(CLIENT_KEY.N), b64urlToBigInt(CLIENT_KEY.D))
  const plain = JSON.parse(bytesToStr(pkcs7Unpad(aes128EcbDecrypt(b64decode(resp.data), aesKey2))))
  if (plain.success === false) throw new Error(plain.msg || '接口返回失败')
  return plain
}
async function queryBalance(token, consNo) {
  const ar = await callEncrypted('/api/micro/bill/arrearage', { consNo }, token)
  const ac = await callEncrypted('/api/micro/bill/accountInfo', { consNo }, token)
  const a = ar.obj || {}, b = ac.obj || {}
  let lastRecord = null
  let lastRecordTime = null
  try {
    const mr = await callEncrypted('/api/micro/readMeter/mrInfo', { consNo, pageNo: 1, pageSize: 10 }, token)
    if (mr && Array.isArray(mr.obj) && mr.obj.length > 0) {
      const first = mr.obj[0]
      lastRecord = first.thisNum != null && first.thisNum !== '' ? String(first.thisNum) : (first.lastNum != null ? String(first.lastNum) : null)
      lastRecordTime = first.thisYmd || first.lastMrDate || null
    }
  } catch (_) {}
  let companyName = null
  let wechatUserId = null
  try {
    const ci = await callEncrypted('/api/companyInfo/curentInfo', {}, token)
    if (ci && ci.obj && ci.obj.name) companyName = ci.obj.name
  } catch (_) {}
  try {
    const ui = await callEncrypted('/api/my/getUserInfo', {}, token)
    if (ui && ui.obj && ui.obj.weixinAccount) wechatUserId = ui.obj.weixinAccount
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
  }
}

// ============================================================
// 存储与缓存封装 (FileManager -> Storage / Keychain)
// ============================================================
const Cache = {
  load(key) {
    try { const s = Storage.get(key); return s || null } catch (_) { return null }
  },
  save(key, content) {
    try { Storage.set(key, content) } catch (_) {}
  },
  clear() {
    try {
      for (const k of Storage.keys()) {
        if (k.startsWith('mj-water.')) Storage.remove(k)
      }
    } catch (_) {}
  },
}

const SettingsStore = {
  load() {
    try {
      const raw = Keychain.get(KEYCHAIN.SETTINGS)
      if (raw) return JSON.parse(raw)
    } catch (_) {}
    return {}
  },
  save(settings) {
    try { Keychain.set(KEYCHAIN.SETTINGS, JSON.stringify(settings)) } catch (_) {}
  },
}

function loadSettings() {
  const s = SettingsStore.load()
  s.alias = s.alias || '米家山水务'
  s.themeColor = s.themeColor || '#FF9500'
  s.balanceColor = s.balanceColor || '#10B981'
  s.interval = s.interval || '360'
  s.balanceLimit = s.balanceLimit || '500'
  if (s.useGradientBar === undefined) s.useGradientBar = 'true'
  return s
}

// ============================================================
// 通用工具函数 (原样保留, 颜色插值改为 hex 字符串)
// ============================================================
function formatMoney(num) {
  const val = parseFloat(num)
  return isNaN(val) ? '0.00' : val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function detectCompanyName(obj) {
  if (!obj || typeof obj !== 'object') return ''
  try {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && (v.includes('水') || v.includes('自来水') || v.includes('公司')) && !v.includes('http') && v.length < 50) {
        return v.trim()
      }
    }
  } catch (_) {}
  return ''
}
function formatCustCode(code, isShort = false, settings) {
  if (!code) return '--'
  if (settings.maskCustCode === 'true') {
    if (code.length >= 8) return code.slice(0, 3) + '****' + code.slice(-2)
    return '****' + code.slice(-2)
  }
  if (isShort) return code.length > 5 ? code.slice(-5) : code
  return code
}
function formatCompName(name, isFull = false, settings, gasData) {
  const raw = (name || (gasData && gasData.compName) || settings.customCompName || '').trim()
  if (settings.maskCompName === 'true') return '米家山水务'
  if (!raw || raw === 'undefined' || raw === 'null') return '米家山水务'
  if (isFull) return raw
  return raw.replace(/自来水厂|自来水有限公司|有限责任公司|有限公司/g, '')
}
function getBalanceRatio(gasData, settings) {
  const d = gasData || {}
  const isOwe = d.oweMoney && parseFloat(d.oweMoney) > 0
  if (isOwe) return 0
  const bal = parseFloat(d.countMoney || d.newCountMoney || '0')
  if (isNaN(bal) || bal <= 0) return 0
  const maxLimit = parseFloat(settings.balanceLimit) || 500
  return Math.max(0, Math.min(1.0, bal / maxLimit))
}
function getCapsuleActiveCount(totalSegments = 10, gasData, settings) {
  const d = gasData || {}
  const isOwe = d.oweMoney && parseFloat(d.oweMoney) > 0
  if (isOwe) return 1
  const ratio = getBalanceRatio(gasData, settings)
  if (ratio <= 0) return 0
  return Math.max(1, Math.round(ratio * totalSegments))
}
function getBarColors(ratio, isOwe, settings) {
  if (settings.useGradientBar === 'false') {
    const single = settings.themeColor || '#FF9500'
    return { start: single, end: single }
  }
  if (isOwe) return { start: '#EF4444', end: '#DC2626' }
  if (ratio >= 0.8) return { start: '#10B981', end: '#34D399' }
  else if (ratio >= 0.6) return { start: '#06B6D4', end: '#22D3EE' }
  else if (ratio >= 0.4) return { start: '#EAB308', end: '#FACC15' }
  else if (ratio >= 0.2) return { start: '#F97316', end: '#FB923C' }
  else return { start: '#EF4444', end: '#F87171' }
}
function interpolateHex(color1Hex, color2Hex, factor) {
  try {
    const c1 = parseInt(color1Hex.replace('#', ''), 16)
    const c2 = parseInt(color2Hex.replace('#', ''), 16)
    const r1 = (c1 >> 16) & 255, g1 = (c1 >> 8) & 255, b1 = c1 & 255
    const r2 = (c2 >> 16) & 255, g2 = (c2 >> 8) & 255, b2 = c2 & 255
    const r = Math.round(r1 + (r2 - r1) * factor)
    const g = Math.round(g1 + (g2 - g1) * factor)
    const b = Math.round(b1 + (b2 - b1) * factor)
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
  } catch (_) {
    return color1Hex
  }
}
function getWidgetScaleFactor() {
  try {
    const deviceSize = Widget.displaySize
    const screenData = [
      { width: 440, height: 956, scale: 1.0 },
      { width: 430, height: 932, scale: 0.98 },
      { width: 428, height: 926, scale: 0.97 },
      { width: 414, height: 896, scale: 0.95 },
      { width: 402, height: 874, scale: 0.93 },
      { width: 393, height: 852, scale: 0.90 },
      { width: 390, height: 844, scale: 0.89 },
      { width: 375, height: 812, scale: 0.85 },
    ]
    const match = screenData.find(
      d => (d.width === deviceSize.width && d.height === deviceSize.height) ||
           (d.width === deviceSize.height && d.height === deviceSize.width)
    )
    return match ? match.scale : 0.95
  } catch (_) { return 0.95 }
}
function getWidgetLargeWidth() {
  try {
    const deviceSize = Widget.displaySize
    const screenW = Math.min(deviceSize.width, deviceSize.height)
    const screenH = Math.max(deviceSize.width, deviceSize.height)
    const sizes = [
      { w: 440, h: 956, largeW: 368 },
      { w: 430, h: 932, largeW: 364 },
      { w: 428, h: 926, largeW: 364 },
      { w: 414, h: 896, largeW: 360 },
      { w: 402, h: 874, largeW: 348 },
      { w: 393, h: 852, largeW: 338 },
      { w: 390, h: 844, largeW: 338 },
      { w: 375, h: 812, largeW: 329 },
    ]
    const match = sizes.find(s => s.w === screenW && s.h === screenH)
    return match ? match.largeW : 338
  } catch (_) { return 338 }
}

// ============================================================
// 数据获取 (fetchGasInfo)
// ============================================================
async function fetchGasInfo(settings, force = false) {
  const consNo = (settings.custCode || '').trim()
  const token = (settings.xMasAppInfo || '').trim()
  const cacheKey = `mj-water.cache.${consNo || 'default'}.json`
  const intervalMin = parseInt(settings.interval) || 360

  let cachedData = null
  const cacheStr = Cache.load(cacheKey)
  if (cacheStr) {
    try { cachedData = JSON.parse(cacheStr) } catch (_) { cachedData = null }
  }

  if (!consNo || !token) {
    return { gasData: cachedData, isOffline: !!cachedData, settings }
  }

  if (!force && cachedData && cachedData._updateTimestamp) {
    const elapsedMin = Math.floor((Date.now() - cachedData._updateTimestamp) / 1000 / 60)
    if (elapsedMin >= 0 && elapsedMin < intervalMin) {
      console.log(`[MijiaWaterGas] 命中缓存：上次更新于 ${elapsedMin} 分钟前，直接读取本地数据`)
      return { gasData: cachedData, isOffline: false, settings }
    }
    console.log(`[MijiaWaterGas] 本地数据已超出读取周期（已过 ${elapsedMin} 分钟），正在联网拉取最新数据...`)
  }

  try {
    const result = await queryBalance(token, consNo)
    if (!result || result.balance === null) throw new Error('接口返回异常状态')
    const gasData = {
      countMoney: result.balance,
      newCountMoney: result.balance,
      oweMoney: result.arrears,
      custCode: result.consNo,
      custName: result.consName,
      compName: result.companyName || settings.customCompName || '成都市岷江自来水厂',
      gasPropName: result.gasPropName,
      gasAddress: result.gasAddress,
      lastRecord: result.lastRecord,
      lastRecordTime: result.lastRecordTime,
    }
    const comp = settings.customCompName || result.companyName || detectCompanyName(gasData) || '成都市岷江自来水厂'
    gasData.compName = comp

    // token 自动提取: 户名 / 服务单位 / 微信用户ID
    const isBadName = (v) => !v || /[=;{}()]/.test(v) || !/^[\u4e00-\u9fa5A-Za-z*·\s]{2,20}$/.test(v)
    const isBadComp = (v) => !v || /[=;{}]/.test(v) || !/^[\u4e00-\u9fa5A-Za-z0-9（）()]{4,40}$/.test(v)
    let settingsChanged = false
    if (result.consName && isBadName(settings.custName)) { settings.custName = result.consName; settingsChanged = true }
    if (result.companyName && isBadComp(settings.customCompName)) { settings.customCompName = result.companyName; settingsChanged = true }
    if (result.wechatUserId && (isBadName(settings.userId) || /^o[A-Za-z0-9_-]{15,40}$/.test(result.wechatUserId))) { settings.userId = result.wechatUserId; settingsChanged = true }
    if (settingsChanged) {
      SettingsStore.save(settings)
      console.log(`[MijiaWaterGas] 已自动提取并保存: 户名=${settings.custName}, 服务单位=${settings.customCompName}, 微信用户ID=${settings.userId}`)
    }

    const dateObj = new Date()
    gasData._fetchTime = dateObj.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    gasData._fetchDate = dateObj.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
    gasData._updateTimestamp = Date.now()

    Cache.save(cacheKey, JSON.stringify(gasData))
    console.log(`[MijiaWaterGas] 成功获取最新水费数据并写入缓存，余额: ${gasData.countMoney}，更新时间: ${gasData._fetchTime}`)
    return { gasData, isOffline: false, settings }
  } catch (e) {
    console.warn('[MijiaWaterGas] 联网请求失败或 token 异常，安全回退本地缓存: ' + e)
    return { gasData: cachedData, isOffline: !!cachedData, settings }
  }
}

// ============================================================
// Canvas 胶囊进度条 (DrawContext -> Canvas 2D)
// ============================================================
function CapsuleBar({ width, height, totalSegments = 10, activeSegments = 7, colors, bgColor = '#6B7280' }) {
  return (
    <Canvas
      draw={(ctx, size) => {
        const gap = 3.5
        const segWidth = (size.width - gap * (totalSegments - 1)) / totalSegments
        const corner = size.height / 2
        const startHex = (colors && colors.start) || '#FF9500'
        const endHex = (colors && colors.end) || startHex
        for (let i = 0; i < totalSegments; i++) {
          const x = i * (segWidth + gap)
          const col = i < activeSegments
            ? interpolateHex(startHex, endHex, activeSegments > 1 ? (i / (activeSegments - 1)) : 0)
            : bgColor
          ctx.fillStyle = col
          ctx.beginPath()
          const r = corner, w = segWidth, h = size.height
          ctx.moveTo(x + r, 0)
          ctx.lineTo(x + w - r, 0)
          ctx.arc(x + w - r, r, r, -Math.PI / 2, 0)
          ctx.lineTo(x + w, h - r)
          ctx.arc(x + w - r, h - r, r, 0, Math.PI / 2)
          ctx.lineTo(x + r, h)
          ctx.arc(x + r, h - r, r, Math.PI / 2, Math.PI)
          ctx.lineTo(x, r)
          ctx.arc(x + r, r, r, Math.PI, Math.PI * 1.5)
          ctx.closePath()
          ctx.fill()
        }
      }}
      frame={{ width: width, height: height }}
    />
  )
}

// ============================================================
// Widget 渲染组件
// ============================================================
function GuideWidget({ settings }) {
  return (
    <VStack alignment="center" spacing={4}>
      <Spacer />
      <Text font={Font.boldSystemFont(15)} foregroundStyle={Color('#FF9500')}>China Gas</Text>
      <Text font={Font.boldSystemFont(12)} foregroundStyle={Color('#F59E0B')}>未检测到凭证配置</Text>
      <Text font={Font.systemFont(11)} foregroundStyle={Color('#9CA3AF')} multilineTextAlignment="center">
        请打开组件，在【账户设置】中输入参数或使用剪贴板智能解析。
      </Text>
      <Spacer />
    </VStack>
  )
}

function ErrorWidget() {
  return (
    <VStack alignment="center" spacing={6}>
      <Spacer />
      <Text font={Font.boldSystemFont(14)} foregroundStyle={Color('#EF4444')}>数据连接失败</Text>
      <Text font={Font.systemFont(11)} foregroundStyle={Color('#9CA3AF')} multilineTextAlignment="center">
        网络超时且无离线缓存，请检查网络或重新配置凭证。
      </Text>
      <Spacer />
    </VStack>
  )
}

function SmallWidget({ gasData, settings, isOffline, scale }) {
  const d = gasData || {}
  const themeColor = settings.themeColor || '#FF9500'
  const balanceColor = settings.balanceColor || '#10B981'
  const isOwe = d.oweMoney && parseFloat(d.oweMoney) > 0
  const ratio = getBalanceRatio(gasData, settings)
  const activeSegs = getCapsuleActiveCount(10, gasData, settings)
  const barColors = getBarColors(ratio, isOwe, settings)

  return (
    <VStack spacing={2} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} padding={12 * scale}>
      <HStack alignment="center">
        <Image systemName="flame.fill" resizable frame={{ width: 16 * scale, height: 16 * scale }} foregroundStyle={Color(themeColor)} />
        <Text font={Font.boldSystemFont(13 * scale)} foregroundStyle={Color('#F59E0B')}>{settings.alias || '米家山水务'}</Text>
        <Spacer />
        <HStack spacing={4} padding={{ top: 2 * scale, bottom: 2 * scale, leading: 6 * scale, trailing: 6 * scale }} background={Color('#F3F4F6')} cornerRadius={6 * scale}>
          <Text font={Font.semiboldSystemFont(9.5 * scale)} foregroundStyle={isOffline ? Color(themeColor) : Color(balanceColor)}>
            {isOffline ? '离线' : '● 正常'}
          </Text>
        </HStack>
      </HStack>
      <Spacer />
      <Text font={Font.mediumSystemFont(11 * scale)} foregroundStyle={isOwe ? Color('#EF4444') : Color('#6B7280')}>
        {isOwe ? '水费欠费' : '账户余额'}
      </Text>
      <Text font={Font.boldRoundedSystemFont(27 * scale)} foregroundStyle={isOwe ? Color('#EF4444') : Color(balanceColor)} lineLimit={1} minimumScaleFactor={0.6}>
        {'¥ ' + formatMoney(d.countMoney || d.newCountMoney || '0.00')}
      </Text>
      <CapsuleBar width={130 * scale} height={5.5 * scale} totalSegments={10} activeSegments={activeSegs} colors={barColors} />
      <Spacer />
      <VStack spacing={3} padding={6 * scale} background={Color('#F8FAFC')} cornerRadius={8 * scale}>
        <HStack alignment="center" spacing={3}>
          <Image systemName="gauge.badge.plus" resizable frame={{ width: 11 * scale, height: 11 * scale }} foregroundStyle={Color(themeColor)} />
          <Text font={Font.systemFont(9.5 * scale)} foregroundStyle={Color('#6B7280')}>抄表: {d.lastRecord || '0'} m³</Text>
          <Spacer />
          <Text font={Font.systemFont(9.5 * scale)} foregroundStyle={Color('#6B7280')}>{d._fetchTime || '刚刚'}</Text>
        </HStack>
        <HStack alignment="center" spacing={3}>
          <Image systemName="creditcard" resizable frame={{ width: 11 * scale, height: 11 * scale }} foregroundStyle={Color('#3B82F6')} />
          <Text font={Font.systemFont(9.5 * scale)} foregroundStyle={Color('#6B7280')}>户号: {formatCustCode(d.custCode, true, settings)}</Text>
          <Spacer />
          <Text font={Font.systemFont(9.5 * scale)} foregroundStyle={Color('#6B7280')}>{d.custName || '米家山水务'}</Text>
        </HStack>
      </VStack>
    </VStack>
  )
}

function TechRow({ iconName, label, valStr, iconColor, textColor, scale }) {
  return (
    <HStack alignment="center" spacing={4}>
      <Image systemName={iconName} resizable frame={{ width: 13 * scale, height: 13 * scale }} foregroundStyle={Color(iconColor)} />
      <Text font={Font.systemFont(10.5 * scale)} foregroundStyle={Color(textColor)}>{label}</Text>
      <Text font={Font.semiboldSystemFont(11 * scale)} foregroundStyle={Color('#F59E0B')} lineLimit={1} minimumScaleFactor={0.7}>
        {valStr}
      </Text>
      <Spacer />
    </HStack>
  )
}

function MediumWidget({ gasData, settings, isOffline, scale }) {
  const d = gasData || {}
  const themeColor = settings.themeColor || '#FF9500'
  const balanceColor = settings.balanceColor || '#10B981'
  const isOwe = d.oweMoney && parseFloat(d.oweMoney) > 0
  const ratio = getBalanceRatio(gasData, settings)
  const activeSegs = getCapsuleActiveCount(10, gasData, settings)
  const barColors = getBarColors(ratio, isOwe, settings)

  return (
    <HStack spacing={12} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} padding={12 * scale}>
      <VStack spacing={2} frame={{ width: 155 * scale }}>
        <HStack alignment="center" spacing={5}>
          <Image systemName="flame.fill" resizable frame={{ width: 16 * scale, height: 16 * scale }} foregroundStyle={Color(themeColor)} />
          <Text font={Font.boldSystemFont(13 * scale)} foregroundStyle={Color('#F59E0B')}>{settings.alias || '米家山水务'}</Text>
        </HStack>
        <Spacer />
        <Text font={Font.mediumSystemFont(11 * scale)} foregroundStyle={isOwe ? Color('#EF4444') : Color('#6B7280')}>
          {isOwe ? '水费欠费 (元)' : '可用水费余额 (元)'}
        </Text>
        <Text font={Font.boldRoundedSystemFont(28 * scale)} foregroundStyle={isOwe ? Color('#EF4444') : Color(balanceColor)} lineLimit={1} minimumScaleFactor={0.6}>
          {'¥ ' + formatMoney(d.countMoney || d.newCountMoney || '0.00')}
        </Text>
        <CapsuleBar width={148 * scale} height={7 * scale} totalSegments={10} activeSegments={activeSegs} colors={barColors} />
        <Spacer />
        <HStack alignment="center" spacing={2}>
          <Text font={Font.systemFont(8 * scale)} foregroundStyle={isOwe ? Color('#EF4444') : Color(balanceColor)}>● </Text>
          <Text font={Font.systemFont(10 * scale)} foregroundStyle={Color('#6B7280')}>
            {isOwe ? '账户已欠费 · 请及时充值' : '水网连接正常 · 气压稳定'}
          </Text>
        </HStack>
      </VStack>
      <HStack frame={{ width: 1 }} background={Color('#E5E7EB')} />
      <VStack spacing={4}>
        <HStack alignment="center" spacing={3}>
          <Image systemName="arrow.triangle.2.circlepath" resizable frame={{ width: 10 * scale, height: 10 * scale }} foregroundStyle={Color('#6B7280')} />
          <Text font={Font.systemFont(10 * scale)} foregroundStyle={Color('#6B7280')}>{d._fetchTime ? `更新时间 ${d._fetchTime}` : '实时同步'}</Text>
          <Spacer />
        </HStack>
        <Spacer />
        <TechRow iconName="person.crop.rectangle" label="客户户号" valStr={`${d.custName || '--'} (${formatCustCode(d.custCode, false, settings)})`} iconColor={themeColor} textColor="#6B7280" scale={scale} />
        <TechRow iconName="speedometer" label="上次抄表" valStr={`${d.lastRecord || '0'} m³`} iconColor="#3B82F6" textColor="#6B7280" scale={scale} />
        <TechRow iconName="calendar.badge.clock" label="抄表日期" valStr={d.lastRecordTime || '近期已抄表'} iconColor="#8B5CF6" textColor="#6B7280" scale={scale} />
        <TechRow iconName="building.2" label="服务单位" valStr={formatCompName(d.compName, false, settings, gasData)} iconColor="#10B981" textColor="#6B7280" scale={scale} />
        <Spacer />
      </VStack>
    </HStack>
  )
}

function LargeWidget({ gasData, settings, isOffline, scale }) {
  const d = gasData || {}
  const themeColor = settings.themeColor || '#FF9500'
  const balanceColor = settings.balanceColor || '#10B981'
  const isOwe = d.oweMoney && parseFloat(d.oweMoney) > 0
  const ratio = getBalanceRatio(gasData, settings)
  const activeSegs = getCapsuleActiveCount(14, gasData, settings)
  const barColors = getBarColors(ratio, isOwe, settings)

  return (
    <VStack spacing={6} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} padding={14 * scale}>
      <HStack alignment="center" spacing={6}>
        <Image systemName="flame.fill" resizable frame={{ width: 20 * scale, height: 20 * scale }} foregroundStyle={Color(themeColor)} />
        <Text font={Font.boldSystemFont(15 * scale)} foregroundStyle={Color('#F59E0B')}>{settings.alias || '米家山水务在线监控'}</Text>
        <Spacer />
        <HStack padding={{ top: 3 * scale, bottom: 3 * scale, leading: 8 * scale, trailing: 8 * scale }} background={Color('#F3F4F6')} cornerRadius={6 * scale}>
          <Text font={Font.semiboldSystemFont(10 * scale)} foregroundStyle={isOffline ? Color(themeColor) : Color(balanceColor)}>
            {isOffline ? '离线模式' : `更新时间 ${d._fetchTime || '刚刚'}`}
          </Text>
        </HStack>
      </HStack>
      <Spacer />
      <VStack spacing={3} padding={12 * scale} background={Color('#F8FAFC')} cornerRadius={14 * scale}>
        <Text font={Font.mediumSystemFont(11.5 * scale)} foregroundStyle={isOwe ? Color('#EF4444') : Color('#6B7280')}>
          {isOwe ? '账户欠费总额 (元)' : '当前账户可用水费余额 (元)'}
        </Text>
        <Text font={Font.boldRoundedSystemFont(33 * scale)} foregroundStyle={isOwe ? Color('#EF4444') : Color(balanceColor)}>
          {'¥ ' + formatMoney(d.countMoney || d.newCountMoney || '0.00')}
        </Text>
        <CapsuleBar width={260 * scale} height={8 * scale} totalSegments={14} activeSegments={activeSegs} colors={barColors} />
      </VStack>
      <Spacer />
      <HStack spacing={8}>
        <VStack spacing={4} padding={9 * scale} background={Color('#F3F4F6')} cornerRadius={10 * scale} frame={{ maxWidth: 'infinity' }}>
          <HStack alignment="center" spacing={3}>
            <Image systemName="speedometer" resizable frame={{ width: 12 * scale, height: 12 * scale }} foregroundStyle={Color('#3B82F6')} />
            <Text font={Font.systemFont(10 * scale)} foregroundStyle={Color('#6B7280')} lineLimit={1}>上次抄表读数</Text>
          </HStack>
          <Text font={Font.boldRoundedSystemFont(16 * scale)} foregroundStyle={Color('#F59E0B')} lineLimit={1} minimumScaleFactor={0.8}>
            {d.lastRecord || '0'} m³
          </Text>
        </VStack>
        <VStack spacing={4} padding={9 * scale} background={Color('#F3F4F6')} cornerRadius={10 * scale} frame={{ maxWidth: 'infinity' }}>
          <HStack alignment="center" spacing={3}>
            <Image systemName="calendar.badge.clock" resizable frame={{ width: 12 * scale, height: 12 * scale }} foregroundStyle={Color('#8B5CF6')} />
            <Text font={Font.systemFont(10 * scale)} foregroundStyle={Color('#6B7280')} lineLimit={1}>抄表核算日期</Text>
          </HStack>
          <Text font={Font.boldRoundedSystemFont(13.5 * scale)} foregroundStyle={Color('#F59E0B')} lineLimit={1} minimumScaleFactor={0.8}>
            {d.lastRecordTime || '近期已核算'}
          </Text>
        </VStack>
        <VStack spacing={4} padding={9 * scale} background={Color('#F3F4F6')} cornerRadius={10 * scale} frame={{ maxWidth: 'infinity' }}>
          <HStack alignment="center" spacing={3}>
            <Image systemName="waveform.path.ecg" resizable frame={{ width: 12 * scale, height: 12 * scale }} foregroundStyle={isOwe ? Color('#EF4444') : (isOffline ? Color(themeColor) : Color(balanceColor))} />
            <Text font={Font.systemFont(10 * scale)} foregroundStyle={Color('#6B7280')} lineLimit={1}>管网监控状态</Text>
          </HStack>
          <HStack alignment="center" spacing={2}>
            <Text font={Font.systemFont(7 * scale)} foregroundStyle={isOwe ? Color('#EF4444') : (isOffline ? Color(themeColor) : Color(balanceColor))}>● </Text>
            <Text font={Font.boldSystemFont(12 * scale)} foregroundStyle={Color('#F59E0B')} lineLimit={1} minimumScaleFactor={0.8}>
              {isOwe ? '账户欠费' : (isOffline ? '离线保持' : '气压稳定')}
            </Text>
          </HStack>
        </VStack>
      </HStack>
      <Spacer />
      <VStack spacing={6} padding={10 * scale} background={Color('#F8FAFC')} cornerRadius={10 * scale}>
        <TechRow iconName="person.crop.rectangle" label="客户姓名" valStr={d.custName || '--'} iconColor={themeColor} textColor="#6B7280" scale={scale} />
        <TechRow iconName="number" label="水费户号" valStr={formatCustCode(d.custCode, false, settings)} iconColor={themeColor} textColor="#6B7280" scale={scale} />
        <TechRow iconName="building.2" label="服务单位" valStr={formatCompName(d.compName, true, settings, gasData)} iconColor="#10B981" textColor="#6B7280" scale={scale} />
        <TechRow iconName="phone.badge.waveform" label="客服热线" valStr="028-85818581" iconColor="#F59E0B" textColor="#6B7280" scale={scale} />
      </VStack>
    </VStack>
  )
}

// 主 Widget 组件：按尺寸分支渲染
function MijiaWaterWidget() {
  const [settings, setSettings] = useState(loadSettings())
  const [gasData, setGasData] = useState(null)
  const [isOffline, setIsOffline] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const scale = getWidgetScaleFactor()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const result = await fetchGasInfo(settings, false)
      if (cancelled) return
      setGasData(result.gasData)
      setIsOffline(result.isOffline)
      setSettings(result.settings)
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [])

  if (!loaded) return <VStack frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }} />

  if (!settings.custCode || !settings.xMasAppInfo) {
    return <GuideWidget settings={settings} />
  }
  if (!gasData) {
    return <ErrorWidget />
  }

  const family = Widget.family
  if (family === 'medium') return <MediumWidget gasData={gasData} settings={settings} isOffline={isOffline} scale={scale} />
  else if (family === 'large') return <LargeWidget gasData={gasData} settings={settings} isOffline={isOffline} scale={scale} />
  else return <SmallWidget gasData={gasData} settings={settings} isOffline={isOffline} scale={scale} />
}

// ============================================================

// ============================================================
// 入口: 小组件模式
// ============================================================
Widget.present(<MijiaWaterWidget />, { policy: WidgetReloadPolicy.atEndOfInteraction })
