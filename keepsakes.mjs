// 打印机的「别的东西」：评论打立体字、生肖 / 星座摆件、10 分钟点赞王奖杯。
// 逻辑（解析、统计）可单测；绘制只在浏览器里调用（需要 canvas）。
import { cleanQuote } from './comment-style.mjs';

export const TEXT_MAX = 6;

export const ZODIAC = [
  ['鼠', '🐭'], ['牛', '🐮'], ['虎', '🐯'], ['兔', '🐰'], ['龙', '🐲'], ['蛇', '🐍'],
  ['马', '🐴'], ['羊', '🐑'], ['猴', '🐵'], ['鸡', '🐔'], ['狗', '🐶'], ['猪', '🐷'],
].map(([id, emoji]) => ({ id, emoji, label: '属' + id }));

export const STARS = [
  ['白羊', '♈'], ['金牛', '♉'], ['双子', '♊'], ['巨蟹', '♋'], ['狮子', '♌'], ['处女', '♍'],
  ['天秤', '♎'], ['天蝎', '♏'], ['射手', '♐'], ['摩羯', '♑'], ['水瓶', '♒'], ['双鱼', '♓'],
].map(([id, emoji]) => ({ id, emoji, label: id + '座' }));
const STAR_ALIAS = { 天平: '天秤', 人马: '射手', 山羊: '摩羯', 宝瓶: '水瓶' };

const ZRE = /(?:属|生肖)\s*([鼠牛虎兔龙蛇马羊猴鸡狗猪])|([鼠牛虎兔龙蛇马羊猴鸡狗猪])年/;
const SNAMES = [...STARS.map(s => s.id), ...Object.keys(STAR_ALIAS)].join('|');
const SRE = new RegExp('(' + SNAMES + ')座');
const SEXACT = new RegExp('^(' + SNAMES + ')$');
const TRE = /^\s*(?:打字|刻字|立体字)[\s:：,，]*(.+)$/;

// 评论 → 摆件：{kind:'text',text} | {kind:'zodiac',id,emoji,label} | {kind:'star',...} | null
export function parseKeepsake(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const tm = text.match(TRE);
  if (tm) {
    const q = cleanQuote(tm[1].replace(/[!！?？。.,，~～]+$/g, ''), 40);
    const chars = Array.from(q.replace(/\s+/g, '').replace(/…$/, ''));
    if (!chars.length) return { kind: 'text', text: '', rejected: true };
    return { kind: 'text', text: chars.slice(0, TEXT_MAX).join(''), label: '✍️ 立体字' };
  }
  const zm = text.match(ZRE);
  if (zm) { const z = ZODIAC.find(z => z.id === (zm[1] || zm[2])); return { kind: 'zodiac', ...z }; }
  const sm = text.match(SRE) || text.match(SEXACT);
  if (sm) { const id = STAR_ALIAS[sm[1]] || sm[1]; const s = STARS.find(s => s.id === id); return { kind: 'star', ...s }; }
  return null;
}

export function keepsakeTag(k) {
  if (!k) return '';
  if (k.kind === 'text') return '✍️ 立体字';
  return k.emoji + ' ' + k.label + (k.kind === 'zodiac' ? ' · 生肖摆件' : ' · 星座摆件');
}

export function keepsakeReceipt(name, k, pos) {
  const nm = String(name).slice(0, 10);
  if (k.kind === 'text') return '✍️ 已收到 ' + nm + ' 的立体字「' + k.text + '」 · 排第 ' + pos + ' 位';
  return k.emoji + ' 已收到 ' + nm + ' 的' + k.label + (k.kind === 'zodiac' ? '生肖' : '') + '摆件 · 排第 ' + pos + ' 位';
}

export function keepsakeSpeech(name, k) {
  if (k.kind === 'text') return name + '的立体字，' + k.text + '，打好啦！';
  return name + '的' + k.label + (k.kind === 'zodiac' ? '生肖' : '') + '摆件打好啦！';
}

// —— 点赞王：每 10 分钟统计一次，点赞最多（且不少于 minLikes）的人得金奖杯。
export const LIKE_KING = { windowMs: 10 * 60000, minLikes: 30 };

export class LikeKing {
  constructor({ windowMs = LIKE_KING.windowMs, minLikes = LIKE_KING.minLikes, now = Date.now() } = {}) {
    this.windowMs = windowMs; this.minLikes = minLikes; this.start = now; this.counts = new Map(); this.round = 1;
  }
  add(name, avatar, n = 1, now = Date.now()) {
    if (!name || name === '直播观众') return;
    const e = this.counts.get(name) || { name, avatar: '', likes: 0, at: now };
    e.likes += Math.max(1, Number(n) || 1); e.at = now;
    if (avatar) e.avatar = avatar;
    this.counts.set(name, e);
  }
  leader() {
    let best = null;
    for (const e of this.counts.values()) if (!best || e.likes > best.likes) best = e;
    return best;
  }
  remaining(now = Date.now()) { return Math.max(0, this.windowMs - (now - this.start)); }
  // 到点返回冠军（或 null：没人够门槛），并开始下一轮；没到点返回 undefined。
  tick(now = Date.now()) {
    if (now - this.start < this.windowMs) return undefined;
    const w = this.leader();
    this.start = now; this.counts.clear(); this.round++;
    return w && w.likes >= this.minLikes ? { ...w } : null;
  }
  reset(now = Date.now()) { this.start = now; this.counts.clear(); }
}

export function likeKingHint(k, now = Date.now()) {
  const m = Math.ceil(k.remaining(now) / 60000), l = k.leader();
  return '🏆 点赞王 ' + m + ' 分钟后揭晓' + (l ? ' · 领先 ' + String(l.name).replace(/[<>&]/g, '').slice(0, 6) + ' ' + l.likes + '赞' : ' · 点赞抢奖杯');
}
export function likeKingBanner(w) { return '🏆 本场点赞王：' + String(w.name).slice(0, 10) + ' · ' + w.likes + ' 赞\n金色奖杯插队开打'; }
export function likeKingSpeech(w) { return '恭喜' + String(w.name).slice(0, 24) + '成为本场点赞王！金色奖杯马上给你打出来！'; }

// —— 绘制（浏览器）：画到圆形头像位上的贴图，内容都放在圆内。
const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';
function circleImg(c, img, x, y, r, ring = '#ffd76a') {
  c.save(); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.closePath(); c.clip();
  if (img && (img.naturalWidth || img.width)) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, s = Math.max(2 * r / iw, 2 * r / ih);
    c.drawImage(img, x - iw * s / 2, y - ih * s / 2, iw * s, ih * s);
  } else { c.fillStyle = '#555'; c.fillRect(x - r, y - r, 2 * r, 2 * r); }
  c.restore();
  c.lineWidth = r * .14; c.strokeStyle = ring; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
}
function bg(c, size, inner, outer) {
  const g = c.createRadialGradient(size / 2, size * .42, size * .05, size / 2, size / 2, size * .72);
  g.addColorStop(0, inner); g.addColorStop(1, outer); c.fillStyle = g; c.fillRect(0, 0, size, size);
}
function extruded(c, text, x, y, px, face, side, depth) {
  c.font = '900 ' + px + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = side;
  for (let i = depth; i > 0; i--) c.fillText(text, x + i * .55, y + i);
  const g = c.createLinearGradient(0, y - px / 2, 0, y + px / 2);
  face.forEach((col, i) => g.addColorStop(i / (face.length - 1), col));
  c.fillStyle = g; c.fillText(text, x, y);
  c.lineWidth = Math.max(2, px * .03); c.strokeStyle = '#ffffffaa'; c.strokeText(text, x - 1, y - 1);
}
function fitPx(c, text, maxW, start) {
  let px = start;
  do { c.font = '900 ' + px + 'px ' + FONT; if (c.measureText(text).width <= maxW) break; px -= 4; } while (px > 40);
  return px;
}

export function drawKeepsake(c, size, k, img) {
  const S = size / 512;
  if (k.kind === 'text') {
    bg(c, size, '#fff7e2', '#d8a95b');
    const chars = Array.from(k.text), lines = chars.length > 3 ? [chars.slice(0, Math.ceil(chars.length / 2)).join(''), chars.slice(Math.ceil(chars.length / 2)).join('')] : [k.text];
    const px = Math.min(...lines.map(l => fitPx(c, l, 380 * S, (lines.length > 1 ? 150 : 190) * S)));
    const y0 = lines.length > 1 ? 205 * S : 260 * S;
    lines.forEach((l, i) => extruded(c, l, size / 2, y0 + i * px * 1.12, px, ['#fff1a8', '#ffb300', '#e65100'], '#7a3b08', Math.round(16 * S)));
  } else {
    const zodiac = k.kind === 'zodiac';
    bg(c, size, zodiac ? '#e53935' : '#3949ab', zodiac ? '#6d0b0b' : '#0b1033');
    if (!zodiac) { c.fillStyle = '#ffffffcc'; for (let i = 0; i < 40; i++) { const a = i * 2.39996, r = (60 + (i * 37) % 190) * S; c.fillRect(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r, 3 * S, 3 * S); } }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 210 * S + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    c.fillStyle = '#ffe082'; c.fillText(k.emoji, size / 2, 225 * S);
    extruded(c, k.label, size / 2, 395 * S, fitPx(c, k.label, 330 * S, 84 * S), ['#fff8d6', '#ffd54f', '#ff8f00'], zodiac ? '#4a0606' : '#05081f', Math.round(8 * S));
  }
  circleImg(c, img, 392 * S, 138 * S, 52 * S);
}

export function drawTrophy(c, size, img, likes) {
  const S = size / 512;
  bg(c, size, '#fff3c4', '#b07a12');
  circleImg(c, img, size / 2, 250 * S, 150 * S, '#ffcf40');
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = 92 * S + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  c.fillText('🏆', size / 2, 70 * S);
  c.fillStyle = '#8a1c1c'; c.beginPath(); c.roundRect ? c.roundRect(116 * S, 392 * S, 280 * S, 74 * S, 30 * S) : c.rect(116 * S, 392 * S, 280 * S, 74 * S); c.fill();
  c.font = '900 ' + 46 * S + 'px ' + FONT; c.fillStyle = '#ffe9a8'; c.fillText('点赞王 · ' + likes + '赞', size / 2, 430 * S);
}
