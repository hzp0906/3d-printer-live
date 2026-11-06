#!/usr/bin/env node
// 抖音直播数据桥：从本机浏览器的直播间页面读取弹幕/点赞/礼物，转发给头像打印机。
// 用法：node douyin-bridge.mjs [房间号] [WS端口]（房间号也可写入 .bridge-room 文件），端口默认 8765
// 浏览器优先级：BrowserOS neo(:9110) → 已开调试端口的 Chromium(:9222) → 自建无头 Chrome(:9223)
// 页面(http://127.0.0.1:8080)会自动连接 ws://127.0.0.1:8765，无需手动操作。
import http from 'node:http';
import { handleClipRequest } from './clip-store.mjs';
import { handleTtsRequest } from './tts-server.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startWSServer } from './bridge-ws.mjs';
import { FanStore } from './fan-store.mjs';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOM_RE = /live\.douyin\.com\/(\d+)/;

// 保留 Windows 默认路径，同时支持 macOS 应用目录和自定义浏览器路径。
export function chromeCandidates(platform = process.platform, env = process.env) {
  const candidates = platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    env.HOME ? env.HOME + '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ] : [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  return [env.CHROME_PATH || '', ...candidates].filter(Boolean);
}

const CHROME_CANDIDATES = chromeCandidates();

// —— 纯解析函数（供测试） ——

export function parseChatLine(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (/欢迎来到直播间|严禁|未成年人|网络诈骗|理性消费|新功能|三屏|点击体验/.test(text) || /^(新功能|提示|公告|系统)\s*[：:]/.test(text)) return { kind: 'system', text };
  let m = text.match(/^(.{1,24}?)\s*[：:]\s*(.*)$/);
  if (m) {
    const name = m[1].trim(), body = m[2].trim();
    if (!name || isJunkName(name)) return null;
    const g = body.match(/^(?:送出|送了|送给主播)了?\s*(.+?)(?:\s*[xX×]\s*(\d{1,3}))?$/);
    if (g && g[1].trim()) return { kind: 'gift', name, gift: g[1].trim(), count: g[2] ? +g[2] : 1 };
    if (/^(?:为主播点赞了|点赞了主播|为主播点赞)$/.test(body)) return { kind: 'like', name };
    if (/^(关注了主播|关注了直播间|成为新粉丝)/.test(body)) return { kind: 'follow', name };
    if (/^(?:来了|进来了|进入直播间|进入了直播间)$/.test(body)) return { kind: 'join', name };
    if (!body) return null;
    return { kind: 'comment', name, text: body };
  }
  m = text.match(/^(.{1,24}?)\s*(?:送出|送了|送给主播)了?\s*(.+?)(?:\s*[xX×]\s*(\d{1,3}))?$/);
  if (m && m[2].trim() && !isJunkName(m[1].trim())) return { kind: 'gift', name: m[1].trim(), gift: m[2].trim(), count: m[3] ? +m[3] : 1 };
  m = text.match(/^(.{1,24}?)\s*(?:为主播点赞了|点赞了主播|为主播点赞)$/);
  if (m && !isJunkName(m[1].trim())) return { kind: 'like', name: m[1].trim() };
  m = text.match(/^(.{1,24}?)\s*(?:来了|进来了|进入直播间|进入了直播间)$/);
  if (m && !isJunkName(m[1].trim())) return { kind: 'join', name: m[1].trim() };
  m = text.match(/^(.{1,24}?)\s*(?:关注了主播|关注了直播间|成为新粉丝|推荐了直播)/);
  if (m && !isJunkName(m[1].trim())) return { kind: 'follow', name: m[1].trim() };
  return null;
}

export function mapGift(name) {
  if (/啤酒/.test(name)) return 'beer';
  if (/棒棒糖/.test(name)) return 'lollipop';
  if (/爱心|红心|心心/.test(name)) return 'heart';
  return 'other';
}

// 垃圾名判定：feed卡标签、动作短语等不是观众昵称。
export function isJunkName(n) {
  if (!n) return true;
  const s = String(n);
  if (/充钻石|客户端|壁纸通知|消息投稿|互相关注|粉丝团|账号已在其他地方|进入直播间|扫码登录/.test(s)) return true;
  if (/^粉丝\d*群\d*|陌生人消息|群聊邀请|AI分身/.test(s)) return true;
  if (s.length < 1 || s.length > 24) return true;
  if (/^(送出了?|送了|来了|关注|粉丝|评论|分享|关注了.*)$/.test(s)) return true;
  if (/分享\[视频\]|前天分享|小时榜|人气榜|本场点赞|在线观众|贡献/.test(s)) return true;
  if (!/[\u{4e00}-\u{9fff}a-zA-Z]/u.test(s)) return true;
  return false;
}

// 昵称归一化：去掉空格与装饰 emoji，用于弹幕昵称 ↔ 观众面板头像的模糊匹配。
export function normKey(name) {
  return String(name || '').replace(/[\s\u3000]+/g, '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, '');
}

// —— 协议级解码：通用 protobuf 遍历 + 直播间 WebSocket 帧 → 用户(昵称,头像) ——
export function pbDecode(buf) {
  const fields = [];
  let i = 0;
  try {
    while (i < buf.length) {
      let key = 0, shift = 0, byte;
      do { if (i >= buf.length) return fields; byte = buf[i++]; key |= (byte & 0x7f) << shift; shift += 7; if (shift > 35) return fields; } while (byte & 0x80);
      const fieldNum = key >>> 3, wire = key & 7;
      if (fieldNum === 0) return fields;
      if (wire === 0) { let v = 0n, s = 0n; do { if (i >= buf.length) return fields; byte = buf[i++]; v |= BigInt(byte & 0x7f) << s; s += 7n; } while (byte & 0x80); fields.push({ n: fieldNum, wire, num: v }); }
      else if (wire === 1) { if (i + 8 > buf.length) return fields; i += 8; fields.push({ n: fieldNum, wire, buf: buf.subarray(i - 8, i) }); }
      else if (wire === 2) { let len = 0, sh = 0; do { if (i >= buf.length) return fields; byte = buf[i++]; len |= (byte & 0x7f) << sh; sh += 7; } while (byte & 0x80); if (i + len > buf.length) return fields; fields.push({ n: fieldNum, wire, buf: buf.subarray(i, i + len) }); i += len; }
      else if (wire === 5) { if (i + 4 > buf.length) return fields; i += 4; fields.push({ n: fieldNum, wire, buf: buf.subarray(i - 4, i) }); }
      else return fields;
    }
  } catch { }
  return fields;
}

function imageUrl(buf, depth = 0) {
  if (depth > 5) return '';
  const text = buf.toString('utf8');
  if (/^https?:\/\/[^\s]+$/.test(text) && /douyinpic|byteimg|douyinstatic/.test(text)) return text;
  for (const field of pbDecode(buf)) {
    if (field.wire !== 2 || !field.buf) continue;
    const url = imageUrl(field.buf, depth + 1);
    if (url) return url;
  }
  return '';
}

export function extractUser(buf, depth = 0) {
  if (depth > 7) return null;
  const fields = pbDecode(buf);
  // User.nickname is field 3; Image.url_list is nested inside the avatar field.
  const nickname = fields.find(f => f.n === 3 && f.wire === 2)?.buf?.toString('utf8');
  if (nickname && nickname.length <= 40 && !/[\x00-\x1f\ufffd]/.test(nickname)) {
    for (const n of [9, 10, 11, 6]) {
      const field = fields.find(f => f.n === n && f.wire === 2);
      const avatar = field?.buf && imageUrl(field.buf);
      if (avatar) return { name: nickname, avatar };
    }
  }
  for (const f of fields) {
    if (f.wire !== 2 || !f.buf?.length) continue;
    const user = extractUser(f.buf, depth + 1);
    if (user) return user;
  }
  return null;
}

const pbStr = (fields, n) => { const f = fields.find(x => x.n === n && x.wire === 2); return f ? f.buf.toString('utf8') : ''; };
const pbNum = (fields, n) => { const f = fields.find(x => x.n === n && x.wire === 0); return f ? f.num : 0n; };
const pbSub = (fields, n) => fields.find(x => x.n === n && x.wire === 2 && x.buf?.length)?.buf || null;

// Common { method=1, msgId=2, roomId=3, createTime=4 }
function decodeCommon(buf) {
  const c = buf ? pbDecode(buf) : [];
  return { msgId: String(pbNum(c, 2) || ''), createTime: Number(pbNum(c, 4) || 0) };
}
function userFrom(fields, n, body) {
  const ub = pbSub(fields, n);
  const u = ub && extractUser(ub);
  return u && u.name ? u : extractUser(body);
}

// WebcastChatMessage { common=1, user=2, content=3 }
export function decodeChat(buf) {
  const f = pbDecode(buf);
  const user = userFrom(f, 2, buf);
  const content = pbStr(f, 3).replace(/\s+/g, ' ').trim();
  if (!user || !content || /[\x00-\x08\ufffd]/.test(content)) return null;
  return { ...decodeCommon(pbSub(f, 1)), user, content };
}

// WebcastGiftMessage { common=1, giftId=2, groupCount=4, repeatCount=5, comboCount=6, user=7, repeatEnd=9, gift=15{ describe=2, id=5, name=16 } }
export function decodeGift(buf) {
  const f = pbDecode(buf);
  const user = userFrom(f, 7, buf);
  if (!user) return null;
  const gs = pbSub(f, 15), g = gs ? pbDecode(gs) : [];
  let giftName = pbStr(g, 16).trim();
  if (!giftName) giftName = (pbStr(g, 2).match(/送出了?\s*(.+)$/) || [])[1] || '';
  return {
    ...decodeCommon(pbSub(f, 1)), user,
    giftId: String(pbNum(f, 2) || pbNum(g, 5) || giftName),
    giftName: giftName || '礼物',
    repeat: Number(pbNum(f, 5) || 0),
    group: Number(pbNum(f, 4) || 1),
    repeatEnd: Number(pbNum(f, 9) || 0) === 1
  };
}

// 连击礼物会多次下发同一组合（repeatCount 递增），只放行增量。
const giftCombo = new Map();
export function giftDelta(key, repeat, repeatEnd = false, now = Date.now()) {
  const prev = giftCombo.get(key);
  const r = Math.max(1, repeat || 0);
  let delta = r;
  if (prev && now - prev.at < 15000) delta = r > prev.n ? r - prev.n : r < prev.n ? r : 0;
  if (repeatEnd) giftCombo.delete(key); else giftCombo.set(key, { n: r, at: now });
  if (giftCombo.size > 300) giftCombo.delete(giftCombo.keys().next().value);
  return delta;
}

const seenMsgIds = new Set();
function freshMsg(id) {
  if (!id || id === '0') return true;
  if (seenMsgIds.has(id)) return false;
  seenMsgIds.add(id);
  if (seenMsgIds.size > 3000) seenMsgIds.delete(seenMsgIds.values().next().value);
  return true;
}
// 协议流 30 秒内有评论/礼物时，页面轮询只做兜底（点赞计数、头像、漏帧），降到 1 秒一次。
export function collectInterval(now = Date.now(), wsChatAt = lastWsChatAt, wsGiftAt = lastWsGiftAt) {
  return now - Math.max(wsChatAt, wsGiftAt) < 30000 ? 1000 : 300;
}
const lagOf = t => (t > 1e12 && t < 1e13 ? Date.now() - t : null);

export function handleWSFrame(buf) {
  if (roomEnded) return;
  try {
    let payload = buf;
    const idx = buf.indexOf(Buffer.from([0x1f, 0x8b]));
    if (idx >= 0) { try { payload = zlib.gunzipSync(buf.subarray(idx)); } catch { return } }
    for (const f of pbDecode(payload)) {
      if (f.wire !== 2 || !f.buf || f.buf.length < 12) continue;
      const head = f.buf.toString('utf8', 0, Math.min(48, f.buf.length));
      const mt = head.match(/Webcast(Chat|Like|Member|Social|Gift)Message/);
      if (!mt) continue;
      const kind = mt[1];
      const msg = pbDecode(f.buf);
      // Message { method=1, payload=2 }；字段缺失时退回旧的“最大子字段”启发式。
      let body = pbSub(msg, 2);
      if (!body) {
        let best = null;
        for (const s of msg) {
          if (s.wire !== 2 || !s.buf || s.buf.length < 12) continue;
          const t = s.buf.toString('utf8', 0, Math.min(40, s.buf.length));
          if (/Webcast\w*Message/.test(t)) continue;
          if (!best || s.buf.length > best.buf.length) best = s;
        }
        body = best?.buf;
      }
      if (!body) continue;
      if (kind === 'Chat') {
        const c = decodeChat(body);
        if (!c || isJunkName(c.user.name) || !freshMsg(c.msgId)) continue;
        feedAvatar(c.user.name, c.user.avatar);
        touchRoster(c.user.name, c.user.avatar);
        lastWsChatAt = Date.now();
        emitComment(c.user, c.content, 'ws', Date.now(), lagOf(c.createTime));
        continue;
      }
      if (kind === 'Gift') {
        const g = decodeGift(body);
        if (!g || isJunkName(g.user.name) || !freshMsg(g.msgId)) continue;
        feedAvatar(g.user.name, g.user.avatar);
        touchRoster(g.user.name, g.user.avatar);
        lastWsGiftAt = Date.now();
        const n = giftDelta(g.user.name + '|' + g.giftId, g.repeat, g.repeatEnd) * Math.max(1, g.group);
        if (n > 0) emitGift(g.user, g.giftName, n, lagOf(g.createTime) ?? 0);
        continue;
      }
      const user = extractUser(body);
      if (!user || !user.name) continue;
      feedAvatar(user.name, user.avatar);
      if (kind === 'Like') emitLike(user);
      else if (kind === 'Social') emitFollow(user);
      else if (kind === 'Member') emitJoinWS(user);
    }
  } catch { }
}

function touchRoster(name, avatar) {
  if (!roster.has(name)) { likeState.used.clear(); roster.set(name, avatar || ''); }
  lastSeen.set(name, Date.now());
}

const normMap = new Map();
function feedAvatar(name, avatar) {
  if (!name || !avatar || isJunkName(name)) return;
  const k = normKey(name);
  if (avatars[name] !== avatar) avatars[name] = avatar;
  if (k) normMap.set(k, avatar);
  if (roster.get(name) !== avatar) {
    if (!roster.has(name)) likeState.used.clear();
    roster.set(name, avatar);
    lastSeen.set(name, Date.now());
  }
  // 先发后补：之前以无头像发出的事件，补到头像后通知打印页面替换。
  if (awaitingAvatar.has(name) && hub) {
    awaitingAvatar.delete(name);
    hub.broadcast({ type: 'avatar', name, avatar });
    console.log('[' + stamp() + '] 🖼 补发头像 → ' + name);
  }
}

const awaitingAvatar = new Set();
function markAwaiting(user) {
  if (!user?.name || user.avatar) return;
  awaitingAvatar.add(user.name);
  if (awaitingAvatar.size > 300) awaitingAvatar.delete(awaitingAvatar.values().next().value);
}

// 协议流与 DOM 轮询会读到同一条评论：谁先到谁发，另一方到来时抵消一次（同文连发按次数计）。
const crossSeen = new Map();
export function commentKey(name, text) {
  return normKey(name) + '|' + normKey(String(text || '').replace(/\[[^\]]{1,8}\]/g, ''));
}
export function dedupeCross(key, src, now = Date.now(), windowMs = 20000) {
  const list = (crossSeen.get(key) || []).filter(e => now - e.at < windowMs);
  const i = list.findIndex(e => e.src !== src);
  if (i >= 0) list.splice(i, 1); else list.push({ src, at: now });
  if (list.length) crossSeen.set(key, list); else crossSeen.delete(key);
  if (crossSeen.size > 800) crossSeen.delete(crossSeen.keys().next().value);
  return i < 0;
}

export function emitComment(user, text, src = 'dom', now = Date.now(), lagMs = null) {
  if (!user?.name || !hub) return false;
  if (!dedupeCross(commentKey(user.name, text), src, now)) return false;
  total.comment++;
  lastEventAt = now;
  markAwaiting(user);
  hub.broadcast({ type: 'comment', name: user.name, text, avatar: user.avatar || '', ts: now, lag: lagMs != null && lagMs > 0 ? lagMs : 0, via: src });
  console.log('[' + stamp() + '] 💬 %s：%s（%s%s）', user.name, text || '', src === 'ws' ? '协议' : '页面', lagMs != null ? ' 延迟' + lagMs + 'ms' : '');
  return true;
}

export function emitGift(user, rawName, count, lagMs = null) {
  if (!user?.name || !hub || count < 1) return;
  total.gift++;
  lastEventAt = Date.now();
  markAwaiting(user);
  const gift = mapGift(rawName);
  hub.broadcast({ type: 'gift', name: user.name, gift, raw: rawName, count, avatar: user.avatar || '', ts: Date.now(), lag: lagMs != null && lagMs > 0 ? lagMs : 0, via: lagMs != null ? 'ws' : 'dom' });
  console.log('[' + stamp() + '] 🎁 %s 送出 %s x%d → %s%s', user.name, rawName, count, gift, lagMs != null ? '（延迟' + lagMs + 'ms）' : '');
}

const personEventSeen = new Map();
export function allowPersonEvent(kind, name, windowMs = 10000, now = Date.now()) {
  const key = kind + ':' + (normKey(name) || String(name || ''));
  const last = personEventSeen.get(key) || 0;
  if (now - last < windowMs) return false;
  personEventSeen.set(key, now);
  return true;
}

export function emitLike(user, maxCount = 3) {
  const nowMs = Date.now();
  if (!user?.name || !hub || !allowPersonEvent('like', user.name, 10000, nowMs)) return;
  likeTokens = Math.min(20, likeTokens + (nowMs - likeTokensAt) / 400);
  likeTokensAt = nowMs;
  const allowed = Math.min(maxCount, Math.floor(likeTokens));
  likeTokens -= allowed;
  lastWsLikeAt = nowMs;
  if (allowed <= 0) {
    if (nowMs - lastThrottleLog > 10000) { lastThrottleLog = nowMs; console.log('[' + stamp() + '] ❤️ 点赞高峰限速中'); }
    return;
  }
  total.like += allowed;
  lastEventAt = nowMs;
  hub.broadcast({ type: 'like', name: user.name, avatar: user.avatar || '', count: allowed });
  console.log('[' + stamp() + '] ❤️ %s 点赞 +%d', user.name, allowed);
}

let lastWsFollowAt = 0;
export function emitFollow(user) {
  if (!user?.name || !hub || !allowPersonEvent('follow', user.name, 10000)) return;
  lastWsFollowAt = Date.now();
  total.join++;
  lastEventAt = Date.now();
  hub.broadcast({ type: 'follow', name: user.name, avatar: user.avatar || '' });
  console.log('[' + stamp() + '] ⭐ %s 关注了直播间 → 打印头像', user.name);
}

export function emitJoinWS(user) {
  if (!user?.name || !hub || !allowPersonEvent('join', user.name, 10000)) return;
  lastWsJoinAt = Date.now();
  total.join++;
  lastEventAt = Date.now();
  markAwaiting(user);
  hub.broadcast({ type: 'join', name: user.name, avatar: user.avatar || '' });
  console.log('[' + stamp() + '] 👋 %s 进入直播间', user.name);
}

export function parseLike(text) {
  const m = String(text || '').match(/([\d.]+)(万)?\s*本场点赞/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (!isFinite(v)) return null;
  return Math.round(v * (m[2] ? 10000 : 1));
}

// 从弹幕行列表里找出新行：从末尾向前扫到已见签名即停；签名缓冲防重复。
export function diffNew(lines, seen, cap = 80) {
  const fresh = [];
  for (let i = lines.length - 1; i >= 0 && fresh.length < cap; i--) {
    if (seen.has(lines[i])) break;
    fresh.unshift(lines[i]);
  }
  for (const sig of fresh) seen.add(sig);
  while (seen.size > 600) seen.delete(seen.values().next().value);
  return fresh;
}

// 点赞无法从页面获知点赞人：在累积观众花名册上公平轮换，同一人最多连续 cap 次，
// 所有人用满后开新一轮；一轮内打不完的点赞直接丢弃（避免同一人刷屏）。
export function allocateLikes(delta, roster, state, cap = 3) {
  const events = [];
  let assigned = 0, passes = 0;
  const capFor = e => (e[1] ? cap : 1);
  const maxScan = roster.reduce((s, e) => s + capFor(e), 0);
  while (assigned < delta && passes < 2 && roster.length) {
    let scanned = 0;
    while (assigned < delta && scanned < maxScan) {
      if (state.idx >= roster.length) state.idx = 0;
      const entry = roster[state.idx];
      state.idx = (state.idx + 1) % roster.length;
      scanned++;
      const used = state.used.get(entry[0]) || 0;
      if (used >= capFor(entry)) continue;
      state.used.set(entry[0], used + 1);
      const last = events[events.length - 1];
      if (last && last.name === entry[0]) last.count++;
      else events.push({ name: entry[0], avatar: entry[1], count: 1 });
      assigned++;
    }
    if (assigned < delta) {
      state.used.clear();
      passes++;
    } else break;
  }
  return events;
}

// —— 页面内采集脚本（不依赖混淆类名，按文本特征定位） ——

const COLLECT = String.raw`(() => {
  const tick = (window.__scanTick = (window.__scanTick || 0) + 1);
  // 只每 10 轮读一次整页文本判断直播结束（innerText 会强制整页排版，代价高）。
  if (tick % 10 === 1) { const bodyText = document.body.textContent || ''; window.__ended = bodyText.includes('直播已结束'); }
  const out = { likes: null, lines: [], avatars: {}, owner: '', href: location.href, ended: !!window.__ended };
  const visible = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const om = document.title.match(/^(.+?)的抖音直播间/);
  if (om) out.owner = om[1];
  const likeOf = e => { const t = (e.textContent || '').replace(/\s+/g, ' ').trim(); if (!t || t.length >= 20 || t.indexOf('本场点赞') < 0) return null; const m = t.match(/([\d.]+)(万)?\s*本场点赞/); return m ? Math.round(parseFloat(m[1]) * (m[2] ? 10000 : 1)) : null; };
  // 点赞计数元素缓存复用，失效（被替换/文本变了）才全页重找。
  if (window.__likeEl && window.__likeEl.isConnected) out.likes = likeOf(window.__likeEl);
  if (out.likes == null) {
    window.__likeEl = null;
    for (const e of document.querySelectorAll('span,div,b,p')) {
      if (e.children.length) continue;
      const v = likeOf(e);
      if (v != null) { out.likes = v; window.__likeEl = e; break; }
    }
  }
  const entryText = t => /(?:来了|进来了|进入直播间|进入了直播间)$/.test(t);
  const single = t => /^.{1,24}[：:][^：:]{0,80}$/.test(t) || /^.{1,24}(送出|送了)\s*[^：:]{1,20}(\s*[xX×]\s*\d{1,3})?$/.test(t) || entryText(t);
  if (tick % 4 === 1 || !window.__chatRoot || !window.__chatRoot.isConnected) {
    let best = null, bestN = 0;
    for (const c of document.querySelectorAll('div')) {
      // 群聊/私聊及不可见容器不能作为直播弹幕来源。
      if (!visible(c) || /陌生人消息|群聊邀请|加入了群聊/.test(c.innerText || '')) continue;
      let n = 0;
      for (const k of c.children) { const t = (k.innerText || '').replace(/\s+/g, ' ').trim(); if (t && t.length <= 90 && single(t)) n++; }
      if (n > bestN) { bestN = n; best = c; }
    }
    window.__chatRoot = best;
  }
  let chatRoot = window.__chatRoot;
  if (chatRoot && !visible(chatRoot)) { window.__chatRoot = null; chatRoot = null; }
  const scope = chatRoot || document;
  const leaves = [...scope.querySelectorAll('span,div')].filter(e => !e.children.length && visible(e));
  const seeds = leaves.filter(e => { const t = (e.textContent || '').replace(/\s+/g, ' ').trim(); return t && t.length <= 90 && (/[：:]/.test(t) || /(送出|送了)/.test(t) || entryText(t)); });
  const bestSet = new Set();
  for (const e of seeds) {
    let best = e;
    let n = e.parentElement;
    while (n && n !== document.body && (!chatRoot || chatRoot.contains(n))) {
      const t = (n.innerText || '').replace(/\s+/g, ' ').trim();
      if (t && t.length <= 90 && single(t)) { best = n; n = n.parentElement; } else break;
    }
    bestSet.add(best);
  }
  const chosen = [...bestSet].filter(a => ![...bestSet].some(b => b !== a && b.contains(a)));
  out.lines = chosen.map(n => (n.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (tick % 2 === 0 || !window.__avMap) {
    const av = {};
    for (const img of document.querySelectorAll('img')) {
      const src = img.currentSrc || img.src || '';
      if (src.indexOf('douyinpic.com') < 0) continue;
      if (!/(aweme-avatar|tos-cn-avt|\/aweme\/100x100\/)/.test(src) && !/img\/webcast\/[a-f0-9]{16,}\.(p|png|jpe?g|webp)/i.test(src)) continue;
      if (/grade_level|badge|medal|icon|\.svg|ranklist/i.test(src)) continue;
      let n = img.parentElement, name = '';
      for (let i = 0; i < 5 && n && !name; i++) {
        const t = (n.innerText || '').replace(/\s+/g, ' ').trim();
        if (/\d+\s*钻|充值|礼物周榜|小时榜|人气榜/.test(t) || t.length > 40) { n = n.parentElement; continue; }
        const m = t.match(/^([^：:\s]{1,24})/);
        if (m && m[1]) {
        const c = m[1].replace(/关注\d*粉丝\d*.*$/, '').replace(/\d{1,2}\/\d{1,2}.*$/, '').replace(/暂不支持.*$/, '').replace(/(?:来了|进来了|进入直播间|进入了直播间)$/, '').replace(/\d+天前.*/, '').replace(/分享\[视频\]/, '').replace(/在线$/, '').trim();
        if (c.length >= 1 && c.length <= 20 && /[\u4e00-\u9fa5A-Za-z]/.test(c) && !/^用户\d{6,}$/.test(c) && !/^(送出了?|送了|来了|关注|粉丝|评论|分享)$/.test(c) && !/分享\[|前天|小时榜|人气榜|本场点赞|在线观众|贡献/.test(c)) name = c;
        }
        n = n.parentElement;
      }
      if (name && !av[name]) av[name] = src;
    }
    window.__avMap = av;
  }
  Object.assign(out.avatars, window.__avMap || {});
  if (tick % 40 === 7) {
    const hdr = [...document.querySelectorAll('div,span')].find(e => /在线观众/.test(e.textContent || '') && (e.textContent || '').length < 30);
    if (hdr) { for (const ty of ['mousedown', 'mouseup', 'click']) { try { hdr.dispatchEvent(new MouseEvent(ty, { bubbles: true, cancelable: true })) } catch (e) { } } }
  }
  if (tick % 8 === 0) {
    for (const d of document.querySelectorAll('div')) {
      if (chatRoot && (chatRoot.contains(d) || d.contains(chatRoot))) continue;
      if (d.scrollHeight > d.clientHeight + 60 && d.clientHeight > 80 && d.querySelectorAll('img').length >= 2) {
        if (!d.__scanDir) d.__scanDir = 1;
        d.scrollTop += d.__scanDir * 300;
        if (d.scrollTop + d.clientHeight >= d.scrollHeight - 4) d.__scanDir = -1;
        else if (d.scrollTop <= 0) d.__scanDir = 1;
      }
    }
  }
  return out;
})()`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toTimeString().slice(0, 8);

function getJson(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function listPages(port) {
  const list = await getJson('http://127.0.0.1:' + port + '/json/list');
  return (Array.isArray(list) ? list : []).filter(t => t.type === 'page' && t.webSocketDebuggerUrl);
}

async function openTab(port, url) {
  try {
    await getJson('http://127.0.0.1:' + port + '/json/new?url=' + encodeURIComponent(url), 'PUT');
  } catch {
    await getJson('http://127.0.0.1:' + port + '/json/new?' + encodeURIComponent(url)).catch(() => { });
  }
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      const hit = (await listPages(port)).find(t => (t.url || '').indexOf(url.replace(/^https?:\/\//, '').split('?')[0]) >= 0);
      if (hit) return hit;
    } catch { return null }
  }
  return null;
}

async function findTarget(room, allowOpen = true) {
  const roomUrl = 'https://live.douyin.com/' + room;
  for (const port of (process.env.PRINTER_CDP_PORT ? [Number(process.env.PRINTER_CDP_PORT)] : [9223, 9110, 9222])) {
    let pages;
    try { pages = await listPages(port) } catch { continue }
    let hit = pages.find(t => { const m = (t.url || '').match(ROOM_RE); return m && m[1] === room });
    if (!hit && (process.env.PRINTER_CDP_PORT || !allowOpen)) continue;
    if (!hit) {
      if (onWindowOpen) onWindowOpen();
      console.log('[' + stamp() + '] 在 :' + port + ' 没找到房间标签页，新开一个（不动你已开的页面）…');
      hit = await openTab(port, roomUrl);
      if (!hit) continue;
    }
    return { port, target: hit };
  }
  return null;
}

async function launchStandaloneChrome(room) {
  const exe = CHROME_CANDIDATES.find(p => fs.existsSync(p));
  if (!exe) throw new Error('没有可用的 CDP 浏览器，也未找到 Chrome/Edge；可通过 CHROME_PATH 指定浏览器路径');
  const dir = path.join(__dirname, '.bridge-profile');
  fs.mkdirSync(dir, { recursive: true });
  console.log('[' + stamp() + '] 弹出直播间窗口(:9223)…可在里面登录抖音，登录后头像抓取更全');
  spawn(exe, [
    '--remote-debugging-port=9223', '--user-data-dir=' + dir,
    '--no-first-run', '--no-default-browser-check', '--lang=zh-CN',
    '--window-position=120,90', '--window-size=1180,800',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling', '--disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion',
    'https://live.douyin.com/' + room
  ], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 50; i++) {
    await sleep(500);
    try { await getJson('http://127.0.0.1:9223/json/version'); return } catch { }
  }
  throw new Error('自建浏览器启动超时');
}

export function isUsefulCdpMessage(raw) {
  // CDP 事件以 {"method":"..." 开头；RPC 响应以 {"id": 开头，一律保留。
  const mm = raw.slice(0, 80).match(/^\{"method":"([\w.]+)"/);
  if (!mm) return true;
  return mm[1] === 'Network.webSocketFrameReceived' || mm[1] === 'Target.attachedToTarget' || !mm[1].startsWith('Network.');
}

function attachCDP(target) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let mid = 0;
    const pend = new Map();
    const rpc = (method, params = {}, sessionId) => new Promise((res, rej) => {
      const id = ++mid;
      pend.set(id, { res, rej });
      ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
    ws.onopen = async () => {
      try {
        await rpc('Runtime.enable');
        // 只需要 WebSocket 帧：缩小网络缓冲，减少浏览器为数据桥保留响应体的开销。
        await rpc('Network.enable', { maxTotalBufferSize: 1024 * 1024, maxResourceBufferSize: 64 * 1024 }).catch(() => rpc('Network.enable'));
        resolve({ ws, rpc });
      } catch (e) { reject(e) }
    };
    ws.onmessage = ev => {
      // 快速丢弃与协议流无关的网络事件（请求/响应/加载等），避免对每条都做 JSON 解析。
      if (typeof ev.data === 'string' && !isUsefulCdpMessage(ev.data)) return;
      let m;
      try { m = JSON.parse(ev.data) } catch { return }
      if (m.id && pend.has(m.id)) {
        const p = pend.get(m.id);
        pend.delete(m.id);
        m.error ? p.rej(new Error(m.error.message || 'cdp error')) : p.res(m.result);
        return;
      }
      if (m.method && cdpEventSink) { try { cdpEventSink(m) } catch { } }
    };
    ws.onerror = () => reject(new Error('CDP WebSocket 连接失败'));
  });
}

let currentRoom = '';
let cdpRef = null, hub = null;
export function _injectCdpForTest(ref) { cdpRef = ref; }
export function _injectHubForTest(ref) { hub = ref; }
export function _feedAvatarForTest(name, avatar) { feedAvatar(name, avatar); }
let lastLikes = null, clientCount = 0, chatSeen = false, owner = '', roomEnded = false, lastEndedReload = 0;
// 读弹幕用的直播间页面不需要画面：暂停并静音视频，省掉解码直播流的 CPU（弹幕走 WebSocket，不受影响）。
// 播放器可能自己恢复播放，所以装一个 play 监听立刻再暂停，并在采集循环里定期补一次。
export const PAUSE_MEDIA_MS = 5000;
export const PAUSE_MEDIA = `(() => {
  if (!window.__mediaGuard) {
    window.__mediaGuard = true;
    document.addEventListener('play', e => { const m = e.target; if (m && m.pause) { m.muted = true; m.pause(); } }, true);
  }
  let n = 0;
  for (const m of document.querySelectorAll('video,audio')) { m.muted = true; if (!m.paused) { m.pause(); n++; } }
  return n;
})()`;
export const ENDED_RELOAD_MS = 20000;
const roster = new Map(), likeState = { idx: 0, used: new Map() }, lastSeen = new Map();
const seen = new Set(), avatars = {};
const total = { comment: 0, gift: 0, like: 0, join: 0 };
let likeTokens = 20, likeTokensAt = Date.now(), lastThrottleLog = 0, lastEventAt = 0, lastNavFix = 0, lastWsLikeAt = 0, lastWsJoinAt = 0, lastWsChatAt = 0, lastWsGiftAt = 0, cdpEventSink = null, lastFollowerCount = null, lastFollowerPoll = 0;

function resetRoomState() {
  lastLikes = null; chatSeen = false; owner = '';
  roster.clear(); lastSeen.clear(); seen.clear();
  for (const k of Object.keys(avatars)) delete avatars[k];
  likeState.used.clear(); likeState.idx = 0; personEventSeen.clear();
  awaitingAvatar.clear(); hoverPending.length = 0; crossSeen.clear(); giftCombo.clear(); seenMsgIds.clear(); normMap.clear();
  total.comment = total.gift = total.like = total.join = 0;
}

// 关注兜底：轮询登录账号菜单里的粉丝数。涨粉时无法确定是谁关注的，只广播“新增粉丝”，不打印具体某个人，避免记错人。
async function pollFollowers() {
  if (!cdpRef || !owner || roomEnded) return;
  if (Date.now() - lastFollowerPoll < 30000) return;
  lastFollowerPoll = Date.now();
  try {
    const posRaw = (await cdpRef.rpc('Runtime.evaluate', {
      expression: `(() => {
        const imgs = [...document.querySelectorAll('img')].filter(i => { const r = i.getBoundingClientRect(); return r.top < 130 && r.left > innerWidth * 0.55 && r.width >= 22 && r.width <= 90 && r.height >= 22 && /douyinpic/.test(i.currentSrc || i.src || ''); });
        const el = imgs[0];
        if (!el) return 'null';
        const r = el.getBoundingClientRect();
        return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
      })()`,
      returnByValue: true
    })).result.value;
    if (!posRaw || posRaw === 'null') return;
    const { x, y } = JSON.parse(posRaw);
    await cdpRef.rpc('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await sleep(500);
    await cdpRef.rpc('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 2, y: y + 2 });
    await sleep(700);
    const fansRaw = (await cdpRef.rpc('Runtime.evaluate', {
      expression: `(() => { const m = (document.body.innerText || '').match(/粉丝(\\d{3,9})/); return m ? m[1] : ''; })()`,
      returnByValue: true
    })).result.value;
    await cdpRef.rpc('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 }).catch(() => { });
    const fans = fansRaw ? parseInt(fansRaw, 10) : null;
    if (fans == null) return;
    if (lastFollowerCount != null && fans > lastFollowerCount) {
      const delta = fans - lastFollowerCount;
      // 协议流 Social 消息已经实名发过关注的，不再重复播报。
      if (Date.now() - lastWsFollowAt > 35000) {
        lastEventAt = Date.now();
        hub.broadcast({ type: 'fans', count: fans, delta });
        console.log('[' + stamp() + '] ⭐ 粉丝 ' + lastFollowerCount + '→' + fans + '（未识别到具体关注者，只播报不打印）');
      }
    }
    lastFollowerCount = fans;
  } catch { }
}

// 串行悬停，避免多条评论同时移动鼠标导致资料卡串人。
// 有界待补队列：同名不重复排队，超过上限丢最旧的；单个工作循环串行处理，不再无限链式堆积。
const hoverTried = new Map();
export const HOVER_MAX_TRIES = 3;
const hoverTries = new Map();
export const HOVER_CAP = 5;
export const hoverPending = [];
let hoverRunning = false;
export function enqueueHover(names, cap = HOVER_CAP) {
  for (const n of names) {
    if (!n || avatars[n] || hoverPending.includes(n)) continue;
    hoverPending.push(n);
  }
  while (hoverPending.length > cap) hoverPending.shift();
}
function hoverResolveAvatars(names) {
  enqueueHover(names);
  if (hoverRunning) return;
  hoverRunning = true;
  const room = currentRoom;
  (async () => {
    try {
      while (hoverPending.length && room === currentRoom && !roomEnded && cdpRef) {
        const name = hoverPending.pop(); // 最新的先补：正在等打印的人更需要头像
        if (avatars[name]) continue;
        await resolveHoverBatch([name]);
      }
    } catch { } finally { hoverRunning = false; if (room !== currentRoom) hoverPending.length = 0; }
  })();
}
export async function clickNickname(rpc, x, y) {
  await rpc('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await rpc('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x, y });
  await rpc('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x, y });
}

const CARD_OPEN = `!![...document.querySelectorAll('[role="dialog"],dialog')].find(e => { const r=e.getBoundingClientRect(); return r.width>0 && r.height>0; })`;
export async function dismissProfileCard(rpc, force = false) {
  const read = async expression => (await rpc('Runtime.evaluate', {expression,returnByValue:true})).result.value;
  const open = await read(CARD_OPEN);
  if (!open && !force) return true;
  const point = await read(`(() => {
    const editors = [...document.querySelectorAll('[contenteditable="true"],textarea')];
    for (const editor of editors) {
      if (editor.closest('[role="dialog"],dialog')) continue;
      const r=editor.getBoundingClientRect();
      if(r.width<10 || r.height<5 || r.bottom>innerHeight || r.top<0) continue;
      const x=r.left+Math.min(20,r.width/2), y=r.top+r.height/2;
      const hit=document.elementFromPoint(x,y);
      if(hit && (hit===editor || editor.contains(hit))) return {x,y};
    }
    return null;
  })()`);
  if (!point) return false;
  // Only focus the comment editor; never type, press Enter, or click Send.
  await clickNickname(rpc, point.x, point.y);
  for (let i=0;i<5;i++) {
    await sleep(100);
    if (!await read(CARD_OPEN)) return true;
  }
  return false;
}

export async function resolveHoverBatch(names) {
  if (!cdpRef || roomEnded) return;
  for (const name of names) {
    if (roomEnded) return;
    const last = hoverTried.get(name) || 0;
    if (Date.now() - last < 6000) continue;
    // 同一昵称最多补取 HOVER_MAX_TRIES 次，找不到就放弃，不再每 40 秒重复点击。
    const tries = (hoverTries.get(name) || 0) + 1;
    if (tries > HOVER_MAX_TRIES) continue;
    hoverTries.set(name, tries);
    hoverTried.set(name, Date.now());
    let avRaw = '';
    try {
      // 同一昵称最多点3轮，每轮换一个点击位置（靠左 / 靠左起点 / 居中 / 靠右），提高资料卡命中率。
      for (let round = 0; round < 3 && !avRaw && !roomEnded; round++) {
      if (!await dismissProfileCard(cdpRef.rpc)) { console.warn('资料卡未关闭，暂停本轮点击，避免误入主页'); return; }
      const posRaw = (await cdpRef.rpc('Runtime.evaluate', {
        expression: `(() => {
          const name = ${JSON.stringify(name)};
          const scope = window.__chatRoot;
          if (!scope || !scope.isConnected) return '[]';
          const els = [...scope.querySelectorAll('span,a,div')].filter(e => {
            if (e.closest?.('[role="dialog"],dialog,a[href],button')) return false;
            const text = (e.textContent || '').trim();
            const r = e.getBoundingClientRect();
            const matches = text === name || text === name + '：' || text === name + ':' || (!e.children.length && (text.startsWith(name + '：') || text.startsWith(name + ':')));
            return matches && r.width > 2 && r.height > 2 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.left < innerWidth;
          });
          const el = els[els.length - 1];
          if (!el) return '[]';
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.top < 40) return '[]';
          const y = Math.round(r.top + r.height / 2);
          const ends = [['左', Math.min(30, r.width / 2)], ['靠左', Math.min(12, r.width / 2)], ['中', r.width / 2], ['右', r.width - Math.min(14, r.width / 3)]];
          const out = [];
          for (const [label, off] of ends) {
            const x = Math.round(r.left + off);
            const hit = document.elementFromPoint(x, y);
            if (!hit || !(hit === el || el.contains(hit))) continue;
            if (out.some(p => p.x === x && p.y === y)) continue;
            out.push({ x, y, label });
          }
          return JSON.stringify(out);
        })()`,
        returnByValue: true
      })).result.value;
      const points = JSON.parse(posRaw || '[]');
      if (!points.length) { console.log('头像补取：未定位到可见昵称 ' + name); break; }
      const spot = points[Math.min(round, points.length - 1)];
      await clickNickname(cdpRef.rpc, spot.x, spot.y);
      // 点击后等待资料卡出现，并持续轮询等头像图片读取完成（卡片开着最多等约4秒）。
      let cardSeen = false;
      for (let attempt = 0; attempt < 16 && !avRaw && !roomEnded; attempt++) {
      await sleep(250);
      const rawCard = (await cdpRef.rpc('Runtime.evaluate', {
        expression: `(() => {
          const name = ${JSON.stringify(name)};
          let card = false;
          for (const dialog of document.querySelectorAll('[role="dialog"],dialog')) {
            const heading = [...dialog.querySelectorAll('h1,h2,h3,h4,[role="heading"]')].find(e => (e.textContent || '').trim() === name);
            if (!heading || !dialog.getBoundingClientRect().width) continue;
            card = true;
            const images = [...dialog.querySelectorAll('img')].filter(img => {
              const src = img.currentSrc || img.src || '', r = img.getBoundingClientRect();
              return img.complete && img.naturalWidth > 0 && r.width >= 40 && r.height >= 40 && r.width / r.height > .8 && r.width / r.height < 1.2 && /douyinpic|byteimg/.test(src) && !/badge|medal|grade_level|icon/.test(src);
            }).sort((a,b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
            if (images.length) return JSON.stringify({ card: true, avatar: images[0].currentSrc || images[0].src });
          }
          // Require an exact nickname inside a compact card; never scan a broad page ancestor.
          const labels = [...document.querySelectorAll('span,a,div,h1,h2,h3,h4')].filter(e => (e.textContent || '').trim() === name && ![...e.children].some(c => (c.textContent || '').trim() === name));
          const pops = [];
          for (const label of labels) {
            let e = label.parentElement;
            for (let i = 0; i < 5 && e; i++, e = e.parentElement) {
              const t = e.innerText || '', r = e.getBoundingClientRect();
              if (t.length > 300) break;
              if (/粉丝|关注/.test(t) && r.width > 0 && r.height > 0 && e.querySelector('img')) {
                const imgs = [...e.querySelectorAll('img')].filter(img => /aweme-avatar|tos-cn-avt|sc=avatar/.test(img.currentSrc || img.src || ''));
                if (imgs.length === 1) pops.push(e);
                break;
              }
            }
          }
          for (const e of pops) {
            card = true;
            for (const img of e.querySelectorAll('img')) {
              const s = img.currentSrc || img.src || '';
              if (/(aweme-avatar|tos-cn-avt|\\/aweme\\/100x100\\/)/.test(s) || /img\\/webcast\\/[a-f0-9]{16,}\\./i.test(s)) {
                if (img.complete && img.naturalWidth > 0 && !/grade_level|badge|medal|icon|\\.svg/i.test(s)) return JSON.stringify({ card: true, avatar: s });
              }
            }
          }
          return JSON.stringify({ card, avatar: '' });
        })()`,
        returnByValue: true
      })).result.value;
        let read = {}; try { read = JSON.parse(rawCard || '{}') } catch { }
        if (read.avatar) { avRaw = read.avatar; break }
        if (read.card) cardSeen = true;
        else if (!cardSeen && attempt >= 2) break;
      }
      await cdpRef.rpc('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 }).catch(() => { });
      if (avRaw) {
        feedAvatar(name, avRaw);
        console.log('[' + stamp() + '] 🪪 点击资料卡获取到头像：' + name + '（第' + (round + 1) + '次点击·' + spot.label + '）');
      } else {
        console.log('头像补取：第' + (round + 1) + '次点击（' + spot.label + '）' + (cardSeen ? '头像未读取完成' : '资料卡未出现') + ' ' + name);
        // 到评论区点一下，关闭资料卡或清掉残留弹层，再换位置重试。
        await dismissProfileCard(cdpRef.rpc, true).catch(() => false);
        await sleep(350);
      }
      }
    } catch (err) { console.warn('点击头像补取失败：' + err.message); }
    finally {
      if (!roomEnded && !await dismissProfileCard(cdpRef.rpc).catch(() => false)) console.warn('资料卡仍显示，下次获取前将先关闭资料卡');
    }
  }
}

// 窗口被关后的处理：直播中被关掉，10 分钟内最多自动重开 1 次；已下播就不再重开；
// 下播（或等不到窗口）超过 30 分钟，数据桥自动退出，避免一直弹窗。
export const REOPEN_WINDOW_MS = 10 * 60000;
export const ENDED_EXIT_MS = (process.env.BRIDGE_ENDED_EXIT_MIN != null ? Number(process.env.BRIDGE_ENDED_EXIT_MIN) : 30) * 60000;
export const WAIT_POLL_MS = 10000;
export function reopenPolicy({ ended, endedAt, now, reopenTimes, waitSince = 0, exitMs = ENDED_EXIT_MS }) {
  if (exitMs > 0 && ended && endedAt && now - endedAt >= exitMs) return 'exit';
  if (exitMs > 0 && waitSince && now - waitSince >= exitMs) return 'exit';
  if (ended) return 'wait';
  return reopenTimes.some(t => now - t < REOPEN_WINDOW_MS) ? 'wait' : 'reopen';
}
let onWindowOpen = null, roomEndedAt = 0, waitSince = 0, waitLogged = false;
const reopenTimes = [];

function exitBridge(reason) {
  console.log('[' + stamp() + '] 🛑 ' + reason + '，数据桥自动退出；下次开播重新运行 node douyin-bridge.mjs ' + currentRoom);
  process.exit(0);
}

function reconnect(hub) {
  const now = Date.now();
  const decision = reopenPolicy({ ended: roomEnded, endedAt: roomEndedAt, now, reopenTimes, waitSince });
  if (decision === 'exit') return exitBridge(roomEnded ? '直播已结束超过 ' + ENDED_EXIT_MS / 60000 + ' 分钟' : '直播间窗口关闭超过 ' + ENDED_EXIT_MS / 60000 + ' 分钟');
  const allowOpen = decision === 'reopen';
  if (!allowOpen) {
    if (!waitSince) waitSince = now;
    if (!waitLogged) {
      waitLogged = true;
      console.log('[' + stamp() + '] ' + (roomEnded
        ? '已下播：直播间窗口关闭后不再自动弹出；重新打开 https://live.douyin.com/' + currentRoom + ' 会继续采集'
        : '直播间窗口 10 分钟内被关了 2 次，不再自动弹出；要继续采集请手动打开 https://live.douyin.com/' + currentRoom + '，或重启数据桥'));
    }
  }
  onWindowOpen = allowOpen ? () => reopenTimes.push(Date.now()) : null;
  run(hub, { allowOpen }).then(() => { waitSince = 0; waitLogged = false; }).catch(e => {
    if (allowOpen) console.error('[' + stamp() + '] ❌ ' + (e.message || e));
    setTimeout(() => reconnect(hub), allowOpen ? 3000 : WAIT_POLL_MS);
  }).finally(() => { onWindowOpen = null; });
}

async function run(hub, { allowOpen = true } = {}) {
  const room = currentRoom;
  let found = await findTarget(room, allowOpen);
  if (!found) {
    if (!allowOpen) throw new Error('等待直播间窗口');
    if (process.env.PRINTER_CDP_PORT) throw new Error('独立直播窗口未就绪，请完成登录后重新开始抓取');
    if (onWindowOpen) onWindowOpen();
    await launchStandaloneChrome(room);
    found = await findTarget(room, false) || await findTarget(room);
  }
  if (!found) throw new Error('无法获得直播间页面（尝试过 :9110 :9222 :9223）');
  const { port, target } = found;
  console.log('[' + stamp() + '] 已挂接浏览器 :%d → %s', port, target.url);
  const { ws, rpc } = await attachCDP(target);
  cdpRef = { ws, rpc };
  // 挂接已有浏览器（:9110/:9222）时标签页可能在后台：模拟焦点并保持页面活跃，避免计时器和渲染被降频。
  await rpc('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => { });
  await rpc('Page.setWebLifecycleState', { state: 'active' }).catch(() => { });
  if (((target.url || '').match(ROOM_RE) || [])[1] !== currentRoom) {
    await rpc('Page.navigate', { url: 'https://live.douyin.com/' + currentRoom }).catch(() => { });
    await sleep(4000);
  }
  console.log('[' + stamp() + '] 📺 直播间 https://live.douyin.com/' + currentRoom + ' 采集中：协议流实时解码 + 页面兜底轮询（协议活跃时 1 秒，否则 0.3 秒）');
  cdpEventSink = m => {
    if (m.method === 'Target.attachedToTarget' && m.params && m.params.sessionId) {
      const sid = m.params.sessionId;
      cdpRef.rpc('Network.enable', {}, sid).catch(() => { });
      cdpRef.rpc('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sid).catch(() => { });
    } else if (m.method === 'Network.webSocketFrameReceived' && m.params && m.params.response && m.params.response.payloadData) {
      const p = m.params.response;
      try {
        if (p.opcode === 2) handleWSFrame(Buffer.from(p.payloadData, 'base64'));
        else if (typeof p.payloadData === 'string' && p.payloadData.length > 40) handleWSFrame(Buffer.from(p.payloadData, 'utf8'));
      } catch { }
    }
  };
  await cdpRef.rpc('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }).catch(() => { });

  let failed = false;
  const fail = err => {
    if (failed) return;
    failed = true;
    clearInterval(timer);
    cdpRef = null;
    console.log('[' + stamp() + '] 连接断开（%s），3 秒后重连…', err.message || err);
    try { ws.close() } catch { }
    setTimeout(() => reconnect(hub), 3000);
  };
  ws.onerror = () => { };
  ws.onclose = () => fail(new Error('CDP closed'));

  function emit(ev) {
    lastEventAt = Date.now();
    hub.broadcast(ev);
    if (ev.type === 'comment') { total.comment++; console.log('[' + stamp() + '] 💬 %s：%s', ev.name, ev.text || '') }
    else if (ev.type === 'gift') { total.gift++; console.log('[' + stamp() + '] 🎁 %s 送出 %s x%d → %s', ev.name, ev.raw, ev.count, ev.gift) }
    else if (ev.type === 'like') { total.like += ev.count; console.log('[' + stamp() + '] ❤️ %s 点赞 +%d%s', ev.name, ev.count, ev.avatar ? '（带头像）' : '') }
    else if (ev.type === 'join') { total.join++; console.log('[' + stamp() + '] 👋 %s 进入直播间', ev.name) }
  }

  let historyPrimed = false;
  function handle(s) {
    if (roomEnded) return;
    if (s.owner) owner = s.owner;
    for (const [n, a] of Object.entries(s.avatars || {})) {
      if (!a || !n || n === owner || isJunkName(n)) continue;
      if (!roster.has(n) && !(s.lines || []).some(line => parseChatLine(line)?.name === n)) continue;
      if (!roster.has(n)) likeState.used.clear();
      feedAvatar(n, a);
    }
    const normAvatars = {};
    for (const [n, a] of Object.entries(s.avatars || {})) { const k = normKey(n); if (k && a && !normAvatars[k]) normAvatars[k] = a; }
    if (s.likes != null) {
      if (lastLikes == null) lastLikes = s.likes;
      else if (s.likes > lastLikes && Date.now() - lastWsLikeAt > 30000) {
        const delta = Math.min(s.likes - lastLikes, 100);
        const pool = [...roster.entries()].sort((x, y) => (Number(!!y[1]) - Number(!!x[1])) || ((lastSeen.get(y[0]) || 0) - (lastSeen.get(x[0]) || 0)));
        const events = allocateLikes(delta, pool, likeState);
        const nowMs = Date.now();
        likeTokens = Math.min(20, likeTokens + (nowMs - likeTokensAt) / 400);
        likeTokensAt = nowMs;
        const budget = Math.floor(likeTokens);
        const allowed = Math.min(events.length, budget);
        likeTokens -= allowed;
        if (events.length > allowed && nowMs - lastThrottleLog > 10000) {
          lastThrottleLog = nowMs;
          console.log('[' + stamp() + '] ❤️ 点赞风暴限速中（高峰期限流，平时秒放行）');
        }
        for (const ev of events.slice(0, allowed).filter(ev => allowPersonEvent('like', ev.name, 10000, nowMs))) emit({ type: 'like', ...ev });
        if (delta > 0 && !events.length && !roster.size) console.log('[' + stamp() + '] ❤️ 点赞 +%d（观众名单还没就绪，先不打印）', delta);
      }
      lastLikes = s.likes;
    }
    const parsedNames = [];
    // 数据桥刚启动时页面上已有的历史弹幕只用于建观众名单，不再当新弹幕重复打印。
    const priming = !historyPrimed && (s.lines || []).length > 0;
    if (priming) historyPrimed = true;
    for (const line of diffNew(s.lines || [], seen)) {
      const ev = parseChatLine(line);
      if (!ev) continue;
      const key = normKey(ev.name);
      const avatar = avatars[ev.name] || (key && (normMap.get(key) || normAvatars[key])) || roster.get(ev.name) || '';
      if (!roster.has(ev.name)) likeState.used.clear();
      roster.set(ev.name, avatar);
      lastSeen.set(ev.name, Date.now());
      if (!avatar) parsedNames.push(ev.name);
      if (priming) continue;
      // 先发后补：事件立即发出，头像缺失时后台点资料卡补取，拿到后推送 avatar 更新。
      // 协议流 30 秒内有评论时以协议为准（表情图片在 DOM 文本里会丢失，难以精确对齐）；
      // 协议静默时由 DOM 兜底，dedupeCross 抵消切换瞬间两路都读到的同一条。
      if (ev.kind === 'comment') { if (Date.now() - lastWsChatAt > 30000) emitComment({ name: ev.name, avatar }, ev.text, 'dom'); }
      // 协议流在工作时礼物以协议为准（连击计数更准），DOM 只作兜底，避免重复打印。
      else if (ev.kind === 'gift') { if (Date.now() - lastWsGiftAt > 30000) emitGift({ name: ev.name, avatar }, ev.gift, ev.count); }
      else if (ev.kind === 'like') emitLike({ name: ev.name, avatar }, 1);
      else if (ev.kind === 'follow') emitFollow({ name: ev.name, avatar });
      else if (ev.kind === 'join') emitJoinWS({ name: ev.name, avatar });
    }
    if (parsedNames.length) {
      const need = [...new Set(parsedNames)].filter(n => !avatars[n]);
      if (need.length) hoverResolveAvatars(need.slice(0, 3));
    }
    pollFollowers();
  }

  // 防重入：上一次页面采集未返回时跳过本轮，避免慢页面上 evaluate 叠加抢占渲染线程。
  let collecting = false, lastCollect = 0, lastPause = 0;
  const timer = setInterval(async () => {
    if (ws.readyState !== 1 || collecting) return;
    if (Date.now() - lastCollect < collectInterval(Date.now())) return;
    collecting = true;
    lastCollect = Date.now();
    try {
      if (Date.now() - lastPause >= PAUSE_MEDIA_MS) {
        lastPause = Date.now();
        const pr = await rpc('Runtime.evaluate', { expression: PAUSE_MEDIA, returnByValue: true, timeout: 2000 }).catch(() => null);
        const paused = pr && pr.result && pr.result.value;
        if (paused) console.log('[' + stamp() + '] 🔇 已暂停直播间视频 %d 个（只读弹幕，省 CPU）', paused);
      }
      const r = await rpc('Runtime.evaluate', { expression: COLLECT, returnByValue: true, timeout: 2000 });
      if (r && r.result && r.result.value) {
        const s = r.result.value;
        // Leave login / verification pages alone; only an explicit room switch navigates.
        if (s.href && !s.href.includes('live.douyin.com/' + currentRoom)) return;
        // 刷新后页面还没加载出“直播已结束”时会短暂像在播：已下播状态下要看到真实弹幕/点赞数才算恢复，
        // 否则会“结束/恢复”来回跳，下播计时也一直被重置。
        const looksLive = !s.ended && (s.lines.length > 0 || s.likes != null || lastEventAt > roomEndedAt);
        if (s.ended || (roomEnded && !looksLive)) {
          if (roomEnded && ENDED_EXIT_MS > 0 && Date.now() - roomEndedAt >= ENDED_EXIT_MS) return exitBridge('直播已结束超过 ' + ENDED_EXIT_MS / 60000 + ' 分钟');
          if (!roomEnded) { resetRoomState(); roomEnded = true; roomEndedAt = lastEndedReload = Date.now(); console.log('[' + stamp() + '] 直播已结束，暂停弹幕采集和头像补取；每 ' + ENDED_RELOAD_MS / 1000 + ' 秒刷新一次等待重新开播'); }
          else if (Date.now() - lastEndedReload >= ENDED_RELOAD_MS) {
            // The ended page never turns back into a live page by itself: a new
            // broadcast gets a new room id, so reload to pick it up.
            lastEndedReload = Date.now();
            await rpc('Page.reload', { ignoreCache: true }).catch(() => {});
          }
          return;
        }
        if (roomEnded) { resetRoomState(); roomEnded = false; roomEndedAt = 0; console.log('[' + stamp() + '] 直播已恢复，重新开始采集'); }
        if (!chatSeen && (s.lines.length || s.likes != null)) {
          chatSeen = true;
          console.log('[' + stamp() + '] ✅ 已读到直播数据：弹幕 %d 条，点赞计数 %s', s.lines.length, s.likes);
        }
        handle(s);
      }
    } catch (e) { fail(e) } finally { collecting = false; }
  }, 100);

  const watch = setInterval(() => {
    const n = hub.clientCount();
    if (n !== clientCount) {
      if (n > clientCount) {
        hub.broadcast({ type: 'hello', room: currentRoom, people: [...roster.entries()].sort((a, b) => Number(!!b[1]) - Number(!!a[1])).slice(0, 8).map(([name, avatar]) => ({ name, avatar })) });
        console.log('[' + stamp() + '] 🖨 打印页面已连接（共 %d 个）', n);
      } else console.log('[' + stamp() + '] 打印页面断开（剩 %d 个）', n);
      clientCount = n;
    }
    if (hub.clientCount()) hub.broadcast({ type: 'ping', room: currentRoom, ts: Date.now(), people: [...roster.entries()].sort((a, b) => Number(!!b[1]) - Number(!!a[1])).slice(0, 8).map(([name, avatar]) => ({ name, avatar })), stats: { comment: total.comment, like: total.like, gift: total.gift, join: total.join, lastAgo: lastEventAt ? Date.now() - lastEventAt : null, roster: roster.size, hoverQueue: hoverPending.length } });
  }, 2000);
  watch.unref?.();

  // 空闲补取：即使没人发言，也定期给最近活跃、还没有头像的观众再点几次资料卡。
  const sweep = setInterval(() => {
    if (!cdpRef || roomEnded || !hub.clientCount()) return;
    const need = [...roster.keys()].filter(n => !avatars[n])
      .sort((a, b) => (lastSeen.get(b) || 0) - (lastSeen.get(a) || 0)).slice(0, 2);
    if (need.length) hoverResolveAvatars(need);
  }, 45000);
  sweep.unref?.();
}

// 老粉记录存本地文件 fan-book.json（与打印页 localStorage 双向合并，文件为准、两边都不丢）。
export const FAN_BOOK_FILE = path.join(__dirname, 'fan-book.json');
export function handleFanBookMessage(m, store, hub) {
  if (m.type === 'fan-book-get') { hub.broadcast({ type: 'fan-book', fans: store.fans }); return true; }
  if (m.type === 'fan-book-save') { store.update(m.fans); return true; }
  if (m.type === 'fan-book-clear') { store.reset(); console.log('[' + stamp() + '] 📒 老粉记录已清空'); hub.broadcast({ type: 'fan-book', fans: {}, cleared: true }); return true; }
  return false;
}

async function main() {
  const argRoom = (process.argv[2] || '').replace(/\D/g, '');
  let fileRoom = '';
  try { fileRoom = ((fs.readFileSync(path.join(__dirname, '.bridge-room'), 'utf8').match(/(\d{5,25})/)) || [])[1] || '' } catch { }
  currentRoom = argRoom || fileRoom || currentRoom;
  if (!currentRoom) { console.error('请提供直播间号：node douyin-bridge.mjs 房间号（也可写入 .bridge-room 文件，或在打印程序里切换房间）'); process.exit(1); }
  const wsPort = Number(process.argv[3]) || 8765;
  const fanStore = new FanStore(FAN_BOOK_FILE);
  console.log('[' + stamp() + '] 📒 老粉记录：' + FAN_BOOK_FILE + '（' + Object.keys(fanStore.fans).length + ' 人）');
  const flushFans = () => { if (fanStore.timer) fanStore.flush(); };
  process.on('exit', flushFans);
  const CLIP_DIR = path.join(__dirname, 'clips');
  const TTS_DIR = path.join(__dirname, '.tts-cache');
  hub = startWSServer(wsPort, {
    onRequest: (req, res) => {
      if (handleTtsRequest(req, res, TTS_DIR)) return true;
      const done = handleClipRequest(req, res, CLIP_DIR);
      if (done && req.method === 'POST') res.on('finish', () => console.log('[' + stamp() + '] 🎬 短视频素材已保存到 clips/（' + res.statusCode + '）'));
      return done;
    },
    onStatus: p => console.log('[' + stamp() + '] ✅ 数据桥服务 ws://127.0.0.1:' + p + '（等待打印页面接入）'),
    onError: err => {
      console.error('[' + stamp() + '] ❌ 端口 ' + wsPort + ' 启动失败（' + err.code + '），可能有另一个数据桥在运行，本实例退出');
      process.exit(1);
    },
    onMessage: raw => {
      let m; try { m = JSON.parse(raw) } catch { return }
      if (handleFanBookMessage(m, fanStore, hub)) return;
      if (m.type === 'perf') { try { fs.appendFileSync(path.join(__dirname, '.perf.log'), '[' + stamp() + '] ' + JSON.stringify(m) + '\n') } catch { } return; }
      if (m.type !== 'set-room') return;
      const id = String(m.room || '').match(/(\d{5,25})/);
      if (!id) return;
      const room = id[1];
      if (room === currentRoom) { hub.broadcast({ type: 'hello', room, people: [...roster.entries()].slice(0, 6).map(([name, avatar]) => ({ name, avatar })) }); return }
      currentRoom = room;
      try { fs.writeFileSync(path.join(__dirname, '.bridge-room'), room) } catch { }
      console.log('[' + stamp() + '] 📺 切换直播间 → ' + room);
      resetRoomState(); roomEnded = false;
      hub.broadcast({ type: 'hello', room, people: [] });
      if (cdpRef) cdpRef.rpc('Page.navigate', { url: 'https://live.douyin.com/' + room }).catch(() => { });
    }
  });
  console.log('房间号 ' + currentRoom + '。正在弹出直播间窗口（可在里面登录抖音）；来源优先级：自建窗口(:9223) → BrowserOS(:9110) → 调试Chromium(:9222)');
  try { await run(hub) } catch (e) {
    console.error('[' + stamp() + '] ❌ ' + e.message);
    console.error('提示：先打开 BrowserOS neo（会自动用 :9110），或重试本命令。');
    process.exitCode = 1;
  }
  process.on('SIGINT', () => process.exit());
  process.on('SIGTERM', () => process.exit());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
