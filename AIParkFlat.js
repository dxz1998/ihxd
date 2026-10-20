// ============================================================
// AIParkFlat.js — AI电管家·停车月卡小组件 (扁平化 · 简洁大气)
// ============================================================
// 数据: https://app.cdbost.cn (Bearer token 免签名直查)
// 用法:
//   1. Scriptable 添加脚本 (单文件, 无依赖)
//   2. 桌面添加组件 → 选本脚本 → 小/中/大
//   3. 直接运行脚本 = 设置菜单 (刷新/换token/预览/清缓存)
// token 失效时: 运行脚本 → "粘贴token" → 粘贴 Bearer 后完整 JWT
// ============================================================

// ---------- 配置 ----------
const BASE_URL = 'https://app.cdbost.cn';
const API_PATH = '/System/api/v1/park/no-intercept/parkMonthList/1/';
const KEYCHAIN_TOKEN = 'ai-park.flat.token';
const KEYCHAIN_NICKNAME = 'ai-park.flat.nickname';
const KEYCHAIN_HIDE_CARD = 'ai-park.flat.hidecard';   // '1' = 脱敏隐藏, '0' = 完整显示
const KEYCHAIN_LOGO = 'ai-park.flat.logo';            // 自定义 logo 图片 URL (可选)
const CACHE_FILE = 'AIParkFlat_Cache.json';
const CACHE_TTL_MIN = 360;   // 缓存有效期 (分钟)
const MONTH_DAYS = 30;       // 月卡周期, 用于进度
const DEFAULT_NICKNAME = '小董同学';  // 客户昵称 (接口无此字段, 设置菜单可改)

const BUILTIN_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI2OTI4MjQxNTExMzE0MzA5MTIiLCJvcGVuSWQiOiJvY0JGSzdIN0RKWUJjWTNmM0NZWGhtM3RLUmFvIiwiY3VzdG9tZXJJZCI6NjkyODI0MTUxMTMxNDMwOTEyLCJpc3MiOiJjZGJvb3N0IiwiZXhwIjoxNzkyNDA1MjQyLCJ2ZXJzaW9uIjoxNzkyNDA0OTQyNTcyLCJpYXQiOjE3OTI0MDQ5NDIsImp0aSI6ImFlNjEwOTIxYzIyYTRhODNiMmRlMGNmNjNhNzlmNTYxIiwiYWxpcGF5VXNlcklkIjpudWxsfQ.vMyAEDq78jPaJ8mBvpC4y3GqYaVr7toC3nAt7I-EEiE';

// ---------- 扁平化配色 (日/夜双套, 跟随系统自动切换) ----------
const C_DARK = {
  bg:      '#111318',   // 页面底
  card:    '#1D2129',   // 信息卡
  line:    '#2A2F38',   // 进度条轨道
  text:    '#F2F4F7',   // 主文字
  sub:     '#8A919E',   // 次要文字
  accent:  '#FF9500',   // 品牌强调
  ok:      '#30D158',   // 充足
  warn:    '#FF9F0A',   // 临近
  danger:  '#FF453A',   // 紧张/过期
};
const C_LIGHT = {
  bg:      '#F4F5F7',   // 页面底
  card:    '#FFFFFF',   // 信息卡
  line:    '#E3E6EB',   // 进度条轨道
  text:    '#1C1E24',   // 主文字
  sub:     '#6B7280',   // 次要文字
  accent:  '#E08600',   // 品牌强调 (浅底加深保证对比度)
  ok:      '#1E9E4F',   // 充足
  warn:    '#C77A00',   // 临近
  danger:  '#D93A2E',   // 紧张/过期
};
let PAL = C_DARK; // 当前生效配色 (入口处按系统外观设置)

// 跟随手机系统外观: 深色模式 / 浅色模式
function isDarkMode() {
  try { return Device.isUsingDarkAppearance(); } catch (_) { return true; }
}
function applyColorScheme() {
  PAL = isDarkMode() ? C_DARK : C_LIGHT;
}

// ---------- 工具 ----------
function log(tag, msg) { console.log('[' + tag + '] ' + msg); }

function getToken() {
  try {
    if (Keychain.contains(KEYCHAIN_TOKEN)) {
      const t = Keychain.get(KEYCHAIN_TOKEN).trim();
      if (t) return t;
    }
  } catch (_) {}
  return BUILTIN_TOKEN;
}
function saveToken(t) {
  try { Keychain.set(KEYCHAIN_TOKEN, t.trim()); return true; } catch (_) { return false; }
}

// 客户昵称 (可配置, 默认内置)
function getNickname() {
  try {
    if (Keychain.contains(KEYCHAIN_NICKNAME)) {
      const n = Keychain.get(KEYCHAIN_NICKNAME).trim();
      if (n) return n;
    }
  } catch (_) {}
  return DEFAULT_NICKNAME;
}
function saveNickname(n) {
  try { Keychain.set(KEYCHAIN_NICKNAME, n.trim()); return true; } catch (_) { return false; }
}

// 卡号脱敏开关
function isCardHidden() {
  try {
    if (Keychain.contains(KEYCHAIN_HIDE_CARD)) {
      return Keychain.get(KEYCHAIN_HIDE_CARD).trim() === '1';
    }
  } catch (_) {}
  return true; // 默认脱敏
}
function setCardHidden(v) {
  try { Keychain.set(KEYCHAIN_HIDE_CARD, v ? '1' : '0'); return true; } catch (_) { return false; }
}
// 卡号脱敏: 3266072134 -> 3266****34 (保留前4后2, 中间掩码)
function maskCard(no) {
  const s = String(no || '');
  if (!s) return '—';
  if (s.length <= 8) return s;
  return s.slice(0, 4) + '*'.repeat(Math.max(3, s.length - 6)) + s.slice(-2);
}
function displayCard(no) {
  return isCardHidden() ? maskCard(no) : String(no || '—');
}

// ---------- Logo ----------
let LOGO_IMG = null; // 内存缓存的 logo 图片 (异步加载, 渲染时同步使用)
function getLogoUrl() {
  try {
    if (Keychain.contains(KEYCHAIN_LOGO)) {
      const u = Keychain.get(KEYCHAIN_LOGO).trim();
      if (u && u.indexOf('http') === 0) return u;
    }
  } catch (_) {}
  return '';
}
function setLogoUrl(u) {
  try {
    if (u && u.indexOf('http') === 0) Keychain.set(KEYCHAIN_LOGO, u.trim());
    else Keychain.remove(KEYCHAIN_LOGO);
    LOGO_IMG = null; // 清除内存缓存, 下次重新加载
    return true;
  } catch (_) { return false; }
}
// 异步加载 logo (带 3 秒超时保护, 失败回退文字徽标)
async function loadLogo() {
  const url = getLogoUrl();
  if (!url) { LOGO_IMG = null; return; }
  try {
    const img = await Promise.race([
      Image.fromUrl(url),
      new Promise((_, rej) => setTimeout(() => rej(new Error('logo timeout')), 3000)),
    ]);
    LOGO_IMG = img;
  } catch (_) { LOGO_IMG = null; }
}
// 在横向 stack 头部加 logo: 有图片显示图片, 无图片显示橙色"停"字徽标 (扁平化)
function addLogo(head, size) {
  if (LOGO_IMG) {
    const imgEl = head.addImage(LOGO_IMG);
    imgEl.imageSize = new Size(size, size);
    imgEl.cornerRadius = size * 0.22;
    head.addSpacer(6);
    return;
  }
  const box = head.addStack();
  box.size = new Size(size, size);
  box.cornerRadius = size * 0.22;
  box.backgroundColor = new Color(PAL.accent);
  box.centerVertically();
  const t = box.addText('停');
  t.font = Font.boldSystemFont(Math.round(size * 0.52));
  t.textColor = new Color('#FFFFFF');
  t.centerAlignText();
  head.addSpacer(6);
}

// 纯JS base64 解码 (Scriptable 无 atob)
function b64decode(s) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '', buffer = 0, bits = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '=') break;
    const val = chars.indexOf(c);
    if (val < 0) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xFF);
    }
  }
  return out;
}

// JWT payload -> 对象 (第二段 base64url)
function parseJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = b64decode(b64);
    return JSON.parse(decodeURIComponent(bin.split('').map(c =>
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
  } catch (e) { return null; }
}
function getOpenId(token) {
  const p = parseJwt(token);
  return (p && p.openId) || '';
}

// ---------- 数据 ----------
async function fetchPark(token) {
  const openId = getOpenId(token);
  if (!openId) throw new Error('token 中未解析到 openId');
  const req = new Request(BASE_URL + API_PATH + encodeURIComponent(openId));
  req.method = 'GET';
  req.timeoutInterval = 5;   // 组件渲染时间预算有限, 请求超时快速回退缓存
  req.headers = {
    'content-type': 'application/json',
    'charset': 'utf-8',
    'Authorization': 'Bearer ' + token,
    'sessionId': openId,
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.79',
  };
  const resp = await req.loadJSON();
  if (!resp || resp.code !== 1) throw new Error((resp && resp.message) || '查询失败');
  const list = (resp.data && resp.data.list) || [];
  const first = list[0] || {};
  let remain = null;
  const expire = first.expireTime || null;
  if (expire) {
    const exp = new Date(expire.replace(/-/g, '/'));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    remain = Math.round((exp.getTime() - today.getTime()) / 86400000);
  }
  let spot = '';
  const pn = first.projectName || '';
  const m = pn.match(/库(\d+)$/) || pn.match(/(\d+)$/);
  if (m) spot = m[1];
  return {
    remain, expire,
    cardNo: first.cardId || '',
    projectName: pn || '',
    spot,
    nickname: getNickname(),  // 接口无昵称字段, 取可配置昵称
    updatedAt: Date.now(),
  };
}

// ---------- 缓存 ----------
function cachePath() {
  const fm = FileManager.local();
  const dir = fm.joinPath(fm.documentsDirectory(), 'AIParkFlat');
  if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
  return fm.joinPath(dir, CACHE_FILE);
}
function readCache() {
  try {
    const fm = FileManager.local();
    const p = cachePath();
    if (!fm.fileExists(p)) return null;
    return JSON.parse(fm.readString(p));
  } catch (_) { return null; }
}
function writeCache(data) {
  try {
    const fm = FileManager.local();
    fm.writeString(cachePath(), JSON.stringify(data));
  } catch (_) {}
}

async function getData(force) {
  const cached = readCache();
  if (!force && cached && cached.updatedAt &&
      (Date.now() - cached.updatedAt) / 60000 < CACHE_TTL_MIN) {
    return { data: cached, offline: false };
  }
  try {
    const fresh = await fetchPark(getToken());
    writeCache(fresh);
    return { data: fresh, offline: false };
  } catch (e) {
    log('data', '联网失败, 回退缓存: ' + e);
    if (cached && cached.remain !== null) return { data: cached, offline: true };
    throw e;
  }
}

// ---------- 状态 ----------
function statusOf(remain) {
  if (remain === null) return { color: PAL.sub, text: '暂无数据' };
  if (remain <= 0)  return { color: PAL.danger, text: '已过期' };
  if (remain <= 3)  return { color: PAL.danger, text: '即将到期' };
  if (remain <= 7)  return { color: PAL.warn,   text: '临近到期' };
  return { color: PAL.ok, text: '使用中' };
}

// ---------- 渲染基础 ----------
function baseWidget(pad) {
  const w = new ListWidget();
  w.backgroundColor = new Color(PAL.bg);
  w.setPadding(pad || 14, 14, 14, 14);
  return w;
}

// 实色圆角进度条 (扁平化: 轨道+填充两段纯色)
function addBar(w, ratio, color, width, height) {
  ratio = Math.max(0, Math.min(1, ratio));
  const bar = w.addStack();
  bar.layoutHorizontally();
  bar.size = new Size(width, height);
  bar.backgroundColor = new Color(PAL.line);
  bar.cornerRadius = height / 2;
  const fill = bar.addStack();
  fill.size = new Size(Math.max(4, width * ratio), height);
  fill.backgroundColor = new Color(color);
  fill.cornerRadius = height / 2;
  return bar;
}

// 信息行: 左标签右值 (大组件卡片用)
function infoRow(parent, label, value) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerVertically();
  const lt = row.addText(label);
  lt.font = Font.regularSystemFont(11);
  lt.textColor = new Color(PAL.sub);
  lt.lineLimit = 1;
  row.addSpacer(12);
  const vt = row.addText(value);
  vt.font = Font.mediumSystemFont(12);
  vt.textColor = new Color(PAL.text);
  vt.lineLimit = 1;
  row.addSpacer(1);
  return row;
}

// ---------- 小组件 (数字为主角) ----------
function renderSmall(data) {
  const st = statusOf(data.remain);
  const w = baseWidget(12);
  // 品牌行: logo + 品牌名
  const brandRow = w.addStack();
  brandRow.layoutHorizontally();
  brandRow.centerVertically();
  addLogo(brandRow, 16);
  const brand = brandRow.addText('AI电管家');
  brand.font = Font.boldSystemFont(10);
  brand.textColor = new Color(PAL.accent);
  brandRow.addSpacer(1);
  w.addSpacer(6);
  // 状态字
  const stt = w.addText(st.text);
  stt.font = Font.regularSystemFont(9);
  stt.textColor = new Color(st.color);
  w.addSpacer(2);
  // 大数字
  const num = w.addText(data.remain === null ? '—' : String(data.remain));
  num.font = Font.boldSystemFont(44);
  num.textColor = new Color(st.color);
  num.centerAlignText();
  // 单位
  const unit = w.addText(data.remain === null ? '' : '剩余天数');
  unit.font = Font.regularSystemFont(10);
  unit.textColor = new Color(PAL.sub);
  unit.centerAlignText();
  w.addSpacer(6);
  if (data.remain !== null) addBar(w, data.remain / MONTH_DAYS, st.color, 128, 5);
  w.addSpacer(8);
  const exp = w.addText('到期 ' + (data.expire || '—'));
  exp.font = Font.regularSystemFont(9);
  exp.textColor = new Color(PAL.sub);
  exp.centerAlignText();
  return w;
}

// ---------- 中组件 (左数字+右信息) ----------
// ---------- 中组件 (品牌行 + 数字/信息主体 + 进度条 + 到期/项目) ----------
function renderMedium(data) {
  const st = statusOf(data.remain);
  const w = baseWidget(12);
  // 1. 品牌行: logo + 品牌 + 状态徽标
  const head = w.addStack();
  head.layoutHorizontally();
  head.centerVertically();
  addLogo(head, 18);
  const brand = head.addText('AI电管家 · 停车月卡');
  brand.font = Font.boldSystemFont(11);
  brand.textColor = new Color(PAL.accent);
  brand.lineLimit = 1;
  const badge = head.addText('  ' + st.text);
  badge.font = Font.boldSystemFont(9);
  badge.textColor = new Color(st.color);
  head.addSpacer(1);
  w.addSpacer(8);
  // 2. 主体: 左大数字 + 右信息
  const main = w.addStack();
  main.layoutHorizontally();
  main.centerVertically();
  // 左: 大数字
  const left = main.addStack();
  left.layoutVertically();
  left.centerVertically();
  left.size = new Size(112, 0);
  const num = left.addText(data.remain === null ? '—' : String(data.remain));
  num.font = Font.boldSystemFont(42);
  num.textColor = new Color(st.color);
  const unit = left.addText(data.remain === null ? '暂无数据' : '剩余天数');
  unit.font = Font.regularSystemFont(10);
  unit.textColor = new Color(PAL.sub);
  // 弹性空隙
  main.addSpacer();
  // 右: 信息竖排 (昵称/车位/卡号(可脱敏))
  const right = main.addStack();
  right.layoutVertically();
  right.centerVertically();
  right.size = new Size(190, 0);
  const nickRow = right.addStack();
  nickRow.layoutHorizontally();
  nickRow.centerVertically();
  const nl = nickRow.addText('昵称');
  nl.font = Font.regularSystemFont(10); nl.textColor = new Color(PAL.sub); nl.lineLimit = 1;
  nickRow.addSpacer(8);
  const nv = nickRow.addText(data.nickname || '—');
  nv.font = Font.boldSystemFont(12); nv.textColor = new Color(PAL.accent); nv.lineLimit = 1;
  nickRow.addSpacer(1);
  right.addSpacer(6);
  infoRow(right, '车位', (data.spot || '—') + ' 号');
  right.addSpacer(6);
  infoRow(right, '停车卡号', displayCard(data.cardNo));
  w.addSpacer(10);
  // 3. 进度条
  if (data.remain !== null) addBar(w, data.remain / MONTH_DAYS, st.color, 300, 5);
  w.addSpacer(6);
  // 4. 到期行: 到期日期 + 项目名
  const foot = w.addStack();
  foot.layoutHorizontally();
  foot.centerVertically();
  const exp = foot.addText('到期 ' + (data.expire || '—'));
  exp.font = Font.regularSystemFont(9);
  exp.textColor = new Color(PAL.text);
  exp.lineLimit = 1;
  foot.addSpacer(6);
  const proj = foot.addText(data.projectName || '');
  proj.font = Font.regularSystemFont(9);
  proj.textColor = new Color(PAL.sub);
  proj.lineLimit = 1;
  foot.addSpacer(1);
  return w;
}

// ---------- 大组件 (品牌+数字+信息卡) ----------
function renderLarge(data) {
  const st = statusOf(data.remain);
  const w = baseWidget(16);
  // 头部
  const head = w.addStack();
  head.layoutHorizontally();
  head.centerVertically();
  addLogo(head, 20);
  const brand = head.addText('AI电管家 · 停车月卡');
  brand.font = Font.boldSystemFont(12);
  brand.textColor = new Color(PAL.text);
  const badge = head.addText(st.text);
  badge.font = Font.boldSystemFont(10);
  badge.textColor = new Color(st.color);
  head.addSpacer(1);
  w.addSpacer(14);
  // 数字行
  const numRow = w.addStack();
  numRow.layoutHorizontally();
  numRow.centerVertically();
  const num = numRow.addText(data.remain === null ? '—' : String(data.remain));
  num.font = Font.boldSystemFont(56);
  num.textColor = new Color(st.color);
  const unit = numRow.addText('  天');
  unit.font = Font.boldSystemFont(15);
  unit.textColor = new Color(PAL.sub);
  numRow.addSpacer(1);
  w.addSpacer(4);
  // 进度条
  if (data.remain !== null) addBar(w, data.remain / MONTH_DAYS, st.color, 300, 6);
  w.addSpacer(16);
  // 信息卡 (扁平化色块)
  const card = w.addStack();
  card.backgroundColor = new Color(PAL.card);
  card.cornerRadius = 12;
  card.layoutVertically();
  card.setPadding(12, 14, 12, 14);
  infoRow(card, '客户昵称', data.nickname || '—');
  card.addSpacer(7);
  infoRow(card, '项目', data.projectName || '—');
  card.addSpacer(7);
  infoRow(card, '车位', (data.spot || '—') + ' 号');
  card.addSpacer(7);
  infoRow(card, '停车卡号', displayCard(data.cardNo));
  card.addSpacer(7);
  infoRow(card, '到期', data.expire || '—');
  return w;
}

// ---------- 设置菜单 ----------
async function showSettings() {
  applyColorScheme();
  const cache = readCache();
  const a = new Alert();
  a.title = 'AI电管家停车 · 设置';
  a.message = 'Token: ' + (getToken() === BUILTIN_TOKEN ? '内置 (未自定义)' : '已自定义') +
    '\n卡号显示: ' + (isCardHidden() ? '脱敏隐藏' : '完整显示') +
    '\n客户昵称: ' + getNickname() +
    (cache && cache.remain !== null ? '\n缓存: 剩余 ' + cache.remain + ' 天 (' + new Date(cache.updatedAt).toLocaleString() + ')' : '');
  a.addAction('刷新数据');
  a.addAction('粘贴token');
  a.addAction('切换卡号脱敏');
  a.addAction('修改客户昵称');
  a.addAction('设置logo');
  a.addAction('预览组件');
  a.addAction('清空缓存');
  a.addCancelAction('取消');
  const idx = await a.presentAlert();
  try {
    if (idx === 0) {
      const { data } = await getData(true);
      const ok = new Alert();
      ok.title = '刷新完成';
      ok.message = '剩余 ' + data.remain + ' 天 · 到期 ' + data.expire + '\n车位 ' + (data.spot || '—') + ' 号 · 卡号 ' + displayCard(data.cardNo);
      ok.addAction('好'); await ok.presentAlert();
    } else if (idx === 1) {
      const p = new Alert();
      p.title = '粘贴token';
      p.message = '粘贴 Authorization: Bearer 后的完整 JWT (可带 Bearer 前缀)';
      p.addTextField('eyJ...');
      p.addAction('保存'); p.addCancelAction('取消');
      const pi = await p.presentAlert();
      if (pi === 0) {
        const raw = p.textFieldValue(0).trim();
        const m = raw.match(/Bearer\s+(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i) || raw.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
        const t = m ? (m[1] || m[0]) : '';
        if (t && saveToken(t)) {
          const ok = new Alert(); ok.title = '已保存'; ok.message = 'token 已更新'; ok.addAction('好'); await ok.presentAlert();
          try { await getData(true); } catch (_) {}
        } else {
          const err = new Alert(); err.title = '无效'; err.message = '未识别到有效 JWT'; err.addAction('好'); await err.presentAlert();
        }
      }
    } else if (idx === 2) {
      // 切换卡号脱敏
      const now = isCardHidden();
      setCardHidden(!now);
      const ok = new Alert(); ok.title = '已切换'; ok.message = '停车卡号改为: ' + (now ? '完整显示' : '脱敏隐藏'); ok.addAction('好'); await ok.presentAlert();
    } else if (idx === 3) {
      // 修改客户昵称
      const p = new Alert();
      p.title = '修改客户昵称';
      p.message = '当前: ' + getNickname();
      p.addTextField(getNickname());
      p.addAction('保存'); p.addCancelAction('取消');
      const pi = await p.presentAlert();
      if (pi === 0) {
        const n = p.textFieldValue(0).trim();
        if (n && saveNickname(n)) {
          const ok = new Alert(); ok.title = '已保存'; ok.message = '客户昵称已更新: ' + n; ok.addAction('好'); await ok.presentAlert();
        } else {
          const err = new Alert(); err.title = '无效'; err.message = '昵称不能为空'; err.addAction('好'); await err.presentAlert();
        }
      }
    } else if (idx === 4) {
      // 设置 logo: 粘贴图片 URL (留空则恢复文字徽标)
      const p = new Alert();
      p.title = '设置Logo';
      p.message = '粘贴 AI电管家 logo 图片 URL (https://...)。留空则使用"停"字徽标。\n当前: ' + (getLogoUrl() || '(文字徽标)');
      p.addTextField(getLogoUrl());
      p.addAction('保存'); p.addCancelAction('取消');
      const pi = await p.presentAlert();
      if (pi === 0) {
        const u = p.textFieldValue(0).trim();
        if (setLogoUrl(u)) {
          await loadLogo();
          const ok = new Alert(); ok.title = '已保存'; ok.message = u ? 'logo 已更新' : '已恢复文字徽标'; ok.addAction('好'); await ok.presentAlert();
        } else {
          const err = new Alert(); err.title = '无效'; err.message = '请输入 https:// 开头的图片地址'; err.addAction('好'); await err.presentAlert();
        }
      }
    } else if (idx === 5) {
      const { data } = await getData(true);
      await renderSmall(data).presentSmall();
      await renderMedium(data).presentMedium();
      await renderLarge(data).presentLarge();
    } else if (idx === 6) {
      const fm = FileManager.local();
      const p = cachePath();
      if (fm.fileExists(p)) fm.remove(p);
      const ok = new Alert(); ok.title = '已清空'; ok.message = '缓存已清除'; ok.addAction('好'); await ok.presentAlert();
    }
  } catch (e) {
    const err = new Alert(); err.title = '操作失败'; err.message = String(e); err.addAction('好'); await err.presentAlert();
  }
}

// ---------- 入口 ----------
// 关键: 组件渲染有严格时间预算, 必须先立即渲染缓存/占位 (毫秒级),
// 再异步联网刷新, 第二次 setWidget 覆盖。避免 "Received timeout"。
function emptyData() {
  return { remain: null, expire: null, cardNo: '', projectName: '', spot: '', nickname: getNickname() };
}
function renderByFamily(data) {
  if (config.widgetFamily === 'small') return renderSmall(data);
  if (config.widgetFamily === 'medium') return renderMedium(data);
  return renderLarge(data);
}
async function main() {
  applyColorScheme(); // 按手机系统外观切换日夜配色
  if (!config.runsInWidget && !args.widgetParameter) {
    await showSettings();
    return;
  }
  // 第一步: 立即用缓存渲染 (无缓存则用占位), 保证不超时
  // logo 首次为文字徽标 (同步), 联网刷新时并行加载图片 logo
  const cached = readCache();
  const firstData = (cached && cached.remain !== null) ? cached : emptyData();
  let widget = renderByFamily(firstData);
  Script.setWidget(widget);
  if (cached && cached.remain !== null) log('main', '先渲染缓存 (剩余 ' + cached.remain + ' 天)');
  else log('main', '无缓存, 渲染占位, 联网刷新中');

  // 第二步: 并行联网刷新 + 加载 logo, 完成后覆盖组件内容
  try {
    const [fresh, _] = await Promise.all([
      fetchPark(getToken()),
      loadLogo(), // 有自定义 logo URL 则加载图片, 无则保持文字徽标
    ]);
    writeCache(fresh);
    widget = renderByFamily(fresh);
    Script.setWidget(widget);
    log('main', '联网刷新完成 (剩余 ' + fresh.remain + ' 天)');
  } catch (e) {
    log('main', '联网失败, 保留缓存/占位: ' + e);
  }

  if (!config.runsInWidget) {
    await widget.presentSmall();
    Script.complete();
  }
}

main();
