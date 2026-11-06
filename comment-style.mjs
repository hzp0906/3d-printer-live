// 评论花样：评论里的关键词决定头像款式（贴纸 / 滤镜 / 主题），评论原文刻在铭牌上，
// 每张评论头像随机开出 普通 / 闪光 / 彩虹传说。稀有度只看评论运气，不和送礼挂钩。

// 贴纸：可叠加，最多 2 个。
export const DECOS = [
  { id: 'crown', label: '👑 皇冠', re: /皇冠|王冠|国王|女王|王者/ },
  { id: 'ears', label: '🐱 猫耳', re: /猫耳|猫咪|喵|小猫/ },
  { id: 'shades', label: '🕶 墨镜', re: /墨镜|眼镜|酷|帅/ },
  { id: 'halo', label: '😇 光环', re: /光环|天使/ },
  { id: 'horns', label: '😈 小恶魔', re: /恶魔|魔鬼|小恶魔/ },
];
// 滤镜：只取第一个命中的。
export const FILTERS = [
  { id: 'pixel', label: '👾 像素风', re: /像素|马赛克|8\s*bit|游戏/i },
  { id: 'sketch', label: '✏️ 素描', re: /素描|铅笔|黑白|线稿/ },
  { id: 'retro', label: '📷 复古', re: /复古|老照片|怀旧|胶片/ },
];
// 主题：只取第一个命中的。
export const THEMES = [
  { id: 'birthday', label: '🎂 生日款', re: /生日|生快|蛋糕/ },
  { id: 'koi', label: '🐟 锦鲤款', re: /锦鲤|好运|转运|发财/ },
];

export const RARITY = {
  normal: { id: 'normal', label: '普通款', p: 0.80 },
  shiny: { id: 'shiny', label: '✨ 闪光款', p: 0.15 },
  legend: { id: 'legend', label: '🌈 传说款', p: 0.05 },
};

export function rollRarity(rand = Math.random) {
  const r = rand();
  if (r < RARITY.legend.p) return 'legend';
  if (r < RARITY.legend.p + RARITY.shiny.p) return 'shiny';
  return 'normal';
}

// 铭牌上的评论原文：去掉链接、联系方式、敏感词；不合适就返回空串（只写名字）。
const BAD = /微信|vx|v信|加我|私聊|qq|电话|手机号|二维码|赌|博彩|色情|约炮|裸|毒品|枪|政府|习近平|共产|台独|法轮|傻[逼比b]|sb|煞笔|操你|草泥马|妈的|nmsl|fuck|shit|死全家|去死|垃圾主播|骗子|刷单|兼职|返利|代练/i;
export function cleanQuote(text, max = 14) {
  let t = String(text || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (/https?:|www\.|\.com|\.cn/i.test(t)) return '';
  if (/\d{6,}/.test(t)) return '';
  if (BAD.test(t.replace(/[\s.·_\-*]/g, ''))) return '';
  t = t.replace(/[<>"`]/g, '');
  const chars = Array.from(t);
  return chars.length > max ? chars.slice(0, max).join('') + '…' : t;
}

// 从评论生成款式；rand 只用来开稀有度。
export function makeStyle(text, rand = Math.random) {
  const t = String(text || '');
  const deco = DECOS.filter(d => d.re.test(t)).slice(0, 2).map(d => d.id);
  const filter = (FILTERS.find(f => f.re.test(t)) || {}).id || '';
  const theme = (THEMES.find(f => f.re.test(t)) || {}).id || '';
  return { deco, filter, theme, rarity: rollRarity(rand), quote: cleanQuote(t) };
}

export function hasKeywords(style) { return !!(style && (style.deco.length || style.filter || style.theme)); }

const byId = list => Object.fromEntries(list.map(x => [x.id, x]));
const DECO_BY = byId(DECOS), FILTER_BY = byId(FILTERS), THEME_BY = byId(THEMES);

// 铭牌上的一行款式说明，例如「🌈 传说款 · 👑 皇冠 · 👾 像素风」。
export function styleTag(style) {
  if (!style) return '';
  const parts = [];
  if (style.rarity !== 'normal') parts.push(RARITY[style.rarity].label);
  if (style.theme) parts.push(THEME_BY[style.theme].label);
  for (const d of style.deco) parts.push(DECO_BY[d].label);
  if (style.filter) parts.push(FILTER_BY[style.filter].label);
  return parts.join(' · ') || '💬 评论款';
}

export function styleReceipt(style) {
  return hasKeywords(style) ? '已点单 ' + styleTag({ ...style, rarity: 'normal' }) : '';
}

export function legendBanner(name) { return '🌈 恭喜 ' + name + ' 开出传说款头像！'; }
export function legendSpeech(name) { return '哇！恭喜' + name + '开出了彩虹传说款头像！评论换一句话，你也有机会！'; }
export function shinySpeech(name) { return name + '的头像开出了闪光款！'; }

// 本场款式统计，用来做提示/日志。
export class StyleStats {
  constructor() { this.total = 0; this.legend = 0; this.shiny = 0; this.keywords = {}; }
  note(style) {
    if (!style) return;
    this.total++;
    if (style.rarity === 'legend') this.legend++;
    if (style.rarity === 'shiny') this.shiny++;
    for (const k of [...style.deco, style.filter, style.theme].filter(Boolean)) this.keywords[k] = (this.keywords[k] || 0) + 1;
  }
}

// ---- 浏览器端：把头像和款式合成到一张画布上（size×size，圆形头像区域铺满整张图）----
function ring(c, s, colors, width) {
  const g = c.createConicGradient ? c.createConicGradient(0, s / 2, s / 2) : null;
  if (g) colors.forEach((col, i) => g.addColorStop(i / (colors.length - 1), col));
  c.save(); c.lineWidth = width; c.strokeStyle = g || colors[0];
  c.beginPath(); c.arc(s / 2, s / 2, s / 2 - width / 2, 0, Math.PI * 2); c.stroke(); c.restore();
}

function drawFiltered(c, img, s, filter) {
  if (filter === 'pixel') {
    const n = 28, tmp = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(n, n) : Object.assign(document.createElement('canvas'), { width: n, height: n });
    tmp.getContext('2d').drawImage(img, 0, 0, n, n);
    c.imageSmoothingEnabled = false; c.drawImage(tmp, 0, 0, s, s); c.imageSmoothingEnabled = true; return;
  }
  c.filter = filter === 'sketch' ? 'grayscale(1) contrast(1.7) brightness(1.12)' : filter === 'retro' ? 'sepia(.85) contrast(1.08) saturate(1.2)' : 'none';
  c.drawImage(img, 0, 0, s, s); c.filter = 'none';
  if (filter === 'retro') { const g = c.createRadialGradient(s / 2, s / 2, s * .3, s / 2, s / 2, s * .55); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,30,0,.45)'); c.fillStyle = g; c.fillRect(0, 0, s, s); }
  if (filter === 'sketch') { c.globalAlpha = .12; c.strokeStyle = '#000'; c.lineWidth = 1; for (let x = -s; x < s; x += 7) { c.beginPath(); c.moveTo(x, s); c.lineTo(x + s, 0); c.stroke(); } c.globalAlpha = 1; }
}

function crown(c, s) {
  const w = s * .44, h = s * .2, x = s / 2 - w / 2, y = s * .03;
  c.save(); c.fillStyle = '#ffcc2e'; c.strokeStyle = '#a86b00'; c.lineWidth = s * .012;
  c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + h * .25); c.lineTo(x + w * .25, y + h * .62); c.lineTo(x + w * .5, y); c.lineTo(x + w * .75, y + h * .62); c.lineTo(x + w, y + h * .25); c.lineTo(x + w, y + h); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#e53935'; for (const fx of [.25, .5, .75]) { c.beginPath(); c.arc(x + w * fx, y + h * .8, s * .018, 0, 7); c.fill(); }
  c.restore();
}
function ears(c, s) {
  c.save();
  for (const side of [-1, 1]) {
    const cx = s / 2 + side * s * .29, by = s * .3;
    c.fillStyle = '#ff9f43'; c.strokeStyle = '#8a4a12'; c.lineWidth = s * .012;
    c.beginPath(); c.moveTo(cx - side * s * .14, by); c.lineTo(cx + side * s * .06, s * .01); c.lineTo(cx + side * s * .12, by - s * .02); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ffd1dc'; c.beginPath(); c.moveTo(cx - side * s * .07, by - s * .03); c.lineTo(cx + side * s * .05, s * .08); c.lineTo(cx + side * s * .08, by - s * .05); c.closePath(); c.fill();
  }
  c.restore();
}
function shades(c, s) {
  c.save(); c.fillStyle = 'rgba(10,10,14,.92)'; c.strokeStyle = '#000'; c.lineWidth = s * .02;
  const y = s * .42, r = s * .1;
  for (const side of [-1, 1]) { c.beginPath(); c.ellipse(s / 2 + side * s * .14, y, r * 1.15, r * .8, 0, 0, 7); c.fill(); }
  c.beginPath(); c.moveTo(s / 2 - s * .04, y - s * .02); c.lineTo(s / 2 + s * .04, y - s * .02); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.35)'; for (const side of [-1, 1]) { c.beginPath(); c.ellipse(s / 2 + side * s * .14 - s * .04, y - s * .03, s * .025, s * .015, -.5, 0, 7); c.fill(); }
  c.restore();
}
function halo(c, s) {
  c.save(); c.strokeStyle = '#ffe680'; c.shadowColor = '#fff3b0'; c.shadowBlur = s * .05; c.lineWidth = s * .03;
  c.beginPath(); c.ellipse(s / 2, s * .08, s * .2, s * .05, 0, 0, 7); c.stroke(); c.restore();
}
function horns(c, s) {
  c.save(); c.fillStyle = '#d32f2f'; c.strokeStyle = '#6d0d0d'; c.lineWidth = s * .01;
  for (const side of [-1, 1]) { const x = s / 2 + side * s * .2; c.beginPath(); c.moveTo(x - s * .06, s * .22); c.quadraticCurveTo(x + side * s * .02, s * .1, x + side * s * .1, s * .02); c.quadraticCurveTo(x + side * s * .04, s * .16, x + s * .06, s * .24); c.closePath(); c.fill(); c.stroke(); }
  c.restore();
}
function themeFx(c, s, theme) {
  if (theme === 'birthday') {
    const cols = ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#e040fb'];
    for (let i = 0; i < 40; i++) { const a = i * 2.39996, r = s * (.36 + (i % 5) * .025); c.fillStyle = cols[i % 5]; c.fillRect(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, s * .022, s * .012); }
    c.font = Math.round(s * .17) + 'px sans-serif'; c.textAlign = 'center'; c.fillText('🎂', s * .8, s * .95);
  } else if (theme === 'koi') {
    ring(c, s, ['#d50000', '#ff6d00', '#d50000'], s * .05);
    c.font = Math.round(s * .14) + 'px sans-serif'; c.textAlign = 'center'; c.fillText('🐟', s * .16, s * .94); c.fillText('🍀', s * .84, s * .94);
  }
}
const DRAW = { crown, ears, shades, halo, horns };

export function composeStyled(img, style, size = 512) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d');
  drawFiltered(c, img, size, style.filter);
  themeFx(c, size, style.theme);
  for (const d of style.deco) DRAW[d] && DRAW[d](c, size);
  if (style.rarity === 'shiny') {
    ring(c, size, ['#ffffff', '#cfd8dc', '#ffffff', '#b0bec5', '#ffffff'], size * .05);
    c.save(); c.globalCompositeOperation = 'lighter'; const g = c.createLinearGradient(0, 0, size, size); g.addColorStop(.35, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.35)'); g.addColorStop(.65, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, size, size); c.restore();
    c.font = Math.round(size * .1) + 'px sans-serif'; c.fillText('✨', size * .1, size * .16); c.fillText('✨', size * .82, size * .2);
  } else if (style.rarity === 'legend') {
    ring(c, size, ['#ff1744', '#ff9100', '#ffea00', '#00e676', '#2979ff', '#d500f9', '#ff1744'], size * .07);
    c.save(); c.globalCompositeOperation = 'overlay'; const g = c.createLinearGradient(0, 0, size, size); ['#ff1744', '#ffea00', '#00e676', '#2979ff', '#d500f9'].forEach((col, i) => g.addColorStop(i / 4, col)); c.globalAlpha = .28; c.fillStyle = g; c.fillRect(0, 0, size, size); c.restore();
    c.font = Math.round(size * .11) + 'px sans-serif'; c.fillText('🌈', size * .06, size * .17); c.fillText('⭐', size * .84, size * .17);
  }
  return cv;
}

// 数字幸运卡没点关键词时：随机配一套款式（1 个贴纸，约一半再加滤镜或主题），稀有度照旧单独开。
export function randomStyle(base, rand = Math.random) {
  const pick = list => list[Math.floor(rand() * list.length) % list.length].id;
  const st = { ...(base || { quote: '', rarity: rollRarity(rand) }), deco: [pick(DECOS)], filter: '', theme: '' };
  const r = rand();
  if (r < 0.3) st.filter = pick(FILTERS); else if (r < 0.5) st.theme = pick(THEMES);
  st.random = true;
  return st;
}
