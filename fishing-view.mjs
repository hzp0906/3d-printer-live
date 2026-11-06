// 钓鱼大赛画面：纯 Canvas 绘制，1080×1920 竖屏。河在中间，两岸沙滩各 10 个钓位（左 1–10 由下往上，右 11–20 由上往下）。
import { fmtJin, TIER_NAME } from './fishing.mjs';

const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
// 竖屏安全区：抖音顶部（主播信息）和底部（评论区、礼物栏）会盖住画面，重要内容放在 y≈150–1480 之间
const TOP = 560, BOT = 1300;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fitText(ctx, text, maxW) {
  let s = String(text);
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}
function outlined(ctx, text, x, y, fill, stroke = '#00000099', lw = 6) {
  ctx.lineJoin = 'round'; ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

// 钓位坐标（人站的位置）和浮漂落点
export function spotPos(i, spots = 20) {
  const half = spots / 2, left = i <= half, k = left ? i - 1 : i - half - 1;
  const step = (BOT - 30 - (TOP + 50)) / (half - 1);
  const y = left ? BOT - 30 - k * step : TOP + 50 + k * step;
  const wob = k % 2 ? 92 : 0; // 前后错开两排，名字不互相挡
  return left ? { x: 80 + wob, y, side: 1 } : { x: 1000 - wob, y, side: -1 };
}
function bobberPos(p, a, now) {
  const reach = 200 + ((a.name.length * 37) % 70) - (p.x < 540 ? p.x - 80 : 1000 - p.x);
  return { x: p.x + p.side * reach, y: p.y + 30 + Math.sin(now / 700 + p.y) * 4 };
}

function bank(ctx, now) {
  // 天空 + 远山
  const sky = ctx.createLinearGradient(0, 0, 0, TOP);
  sky.addColorStop(0, '#ffb86b'); sky.addColorStop(1, '#ffe2a8');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 1080, TOP + 20);
  ctx.fillStyle = '#e59a5a'; ctx.beginPath(); ctx.moveTo(0, TOP); ctx.quadraticCurveTo(200, TOP - 90, 420, TOP - 20); ctx.quadraticCurveTo(700, TOP - 120, 1080, TOP - 10); ctx.lineTo(1080, TOP + 20); ctx.lineTo(0, TOP + 20); ctx.fill();
  ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(860, 470, 50, 0, 6.283); ctx.fill();
  // 河水
  const w = ctx.createLinearGradient(0, TOP, 0, BOT);
  w.addColorStop(0, '#e8a35e'); w.addColorStop(.25, '#7a8f8a'); w.addColorStop(1, '#3d6170');
  ctx.fillStyle = w; ctx.fillRect(0, TOP, 1080, BOT - TOP + 360);
  // 两岸沙滩（弯曲河岸）
  for (const side of [1, -1]) {
    const g = ctx.createLinearGradient(side > 0 ? 0 : 1080, 0, side > 0 ? 300 : 780, 0);
    g.addColorStop(0, '#f5c26b'); g.addColorStop(1, '#f9dc95');
    ctx.fillStyle = g; ctx.beginPath();
    const x0 = side > 0 ? 0 : 1080;
    ctx.moveTo(x0, TOP);
    for (let y = TOP; y <= BOT + 340; y += 40) ctx.lineTo(x0 + side * (220 + Math.sin(y / 170 + (side > 0 ? 0 : 2)) * 40), y);
    ctx.lineTo(x0, BOT + 360); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 6; ctx.beginPath();
    for (let y = TOP; y <= BOT + 340; y += 40) { const x = x0 + side * (222 + Math.sin(y / 170 + (side > 0 ? 0 : 2)) * 40 + Math.sin(now / 500 + y / 50) * 3); y === TOP ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // 水面波光
  ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 4;
  for (let i = 0; i < 14; i++) {
    const x = 300 + ((i * 137) % 480), y = TOP + 40 + ((i * 251 + now / 40) % (BOT - TOP));
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30, y); ctx.stroke();
  }
  // 椰子树
  for (const [x, y, s] of [[40, 600, .8], [1040, 1380, 1], [1030, 560, .7]]) {
    ctx.strokeStyle = '#8a5a3a'; ctx.lineWidth = 16 * s; ctx.beginPath(); ctx.moveTo(x, y + 120 * s); ctx.quadraticCurveTo(x + 20 * s, y + 40 * s, x, y); ctx.stroke();
    ctx.fillStyle = '#3f9e4a';
    for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283 + .3; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 46 * s, y + Math.sin(a) * 22 * s, 56 * s, 16 * s, a, 0, 6.283); ctx.fill(); }
  }
}

// 一条会摆尾的鱼（俯视剪影），angle 为游动方向
export function drawFish(ctx, x, y, len, angle, color, now, alpha = 1) {
  const wig = Math.sin(now / 110 + x * 0.01) * 0.35;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0, 0, len * 0.5, len * 0.2, 0, 0, 6.283); ctx.fill();
  ctx.save(); ctx.translate(-len * 0.45, 0); ctx.rotate(wig);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-len * 0.32, -len * 0.2); ctx.lineTo(-len * 0.26, 0); ctx.lineTo(-len * 0.32, len * 0.2); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(len * 0.05, -len * 0.18, len * 0.16, len * 0.06, -0.4 + wig * 0.5, 0, 6.283); ctx.fill();
  ctx.beginPath(); ctx.ellipse(len * 0.05, len * 0.18, len * 0.16, len * 0.06, 0.4 - wig * 0.5, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#ffffffcc'; ctx.beginPath(); ctx.arc(len * 0.32, -len * 0.07, len * 0.04, 0, 6.283); ctx.fill();
  ctx.restore(); ctx.globalAlpha = 1;
}
const SCHOOL = Array.from({ length: 16 }, (_, i) => ({
  len: i % 7 === 0 ? 120 : 52 + ((i * 29) % 40),
  color: i % 7 === 0 ? '#ffb43a' : ['#1f3f4acc', '#26485599', '#183844bb', '#d9722faa'][i % 4],
  sp: 0.025 + ((i * 13) % 10) / 400, ph: i * 1.37, lane: 620 + i * 52,
}));
function school(ctx, now) {
  for (const f of SCHOOL) {
    const k = now / 1000 * f.sp + f.ph;
    const x = 540 + Math.sin(k) * 230, y = f.lane + Math.sin(k * 1.9) * 40;
    const dx = Math.cos(k) * 230, dy = Math.cos(k * 1.9) * 76;
    drawFish(ctx, x, y, f.len, Math.atan2(dy, dx), f.color, now, f.len > 100 ? 0.75 : 1);
  }
}
const FISH_COLOR = ['#8a8a8a', '#4f86a8', '#3d7a5a', '#e0a12a', '#ff5a7a'];

function avatarCircle(ctx, img, name, x, y, r, gold) {
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.closePath(); ctx.clip();
  if (img && img.complete && img.naturalWidth) ctx.drawImage(img, x - r, y - r, 2 * r, 2 * r);
  else { ctx.fillStyle = '#7aa'; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); ctx.fillStyle = '#fff'; ctx.font = `900 ${r}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(name || '?').slice(0, 1), x, y); }
  ctx.restore();
  ctx.lineWidth = Math.max(3, r * .14); ctx.strokeStyle = gold ? '#ffd23c' : '#ffffff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
}

function drawAngler(ctx, a, now, t, getImage, spots) {
  const p = spotPos(a.spot, spots), b = bobberPos(p, a, now);
  const bite = a.phase === 'bite', show = a.phase === 'show';
  const shake = bite ? Math.sin(now / 40) * 6 : 0;
  // 鱼竿 + 鱼线
  const tipX = p.x + p.side * 110, tipY = p.y - 70 + (bite ? Math.sin(now / 60) * 10 : 0);
  ctx.strokeStyle = a.fan ? '#ffcf3a' : '#5a3a22'; if (a.fan) { ctx.shadowColor = '#ffd23c'; ctx.shadowBlur = 16; } ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(p.x + p.side * 20, p.y + 10); ctx.quadraticCurveTo(p.x + p.side * 70, p.y - 60, tipX, tipY); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 2; ctx.beginPath();
  if (a.phase === 'snap') { ctx.moveTo(tipX, tipY); ctx.lineTo(tipX + 6, tipY + 34); }
  else if (show) { ctx.moveTo(tipX, tipY); ctx.lineTo(tipX, tipY + 60); }
  else { ctx.moveTo(tipX, tipY); ctx.quadraticCurveTo((tipX + b.x) / 2, Math.max(tipY, b.y) + (bite ? -10 : 30), b.x + shake, b.y); }
  ctx.stroke();
  if (!show && a.phase !== 'snap') {
    // 浮漂 + 涟漪
    ctx.strokeStyle = '#ffffff77'; ctx.lineWidth = 3;
    const ph = (now / 1200) % 1;
    ctx.beginPath(); ctx.ellipse(b.x, b.y + 6, 14 + ph * 30, (14 + ph * 30) * .4, 0, 0, 6.283); ctx.stroke();
    ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(b.x + shake, b.y - (bite ? 0 : 4), 8, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x + shake, b.y + 4, 8, 0, Math.PI); ctx.fill();
  }
  if (bite) {
    // 水下那条鱼在挣扎：大鱼更大、带金光
    const pf = a.pending || { tier: 1 }, big = pf.tier >= 3;
    const fl = big ? 170 : 70 + pf.tier * 20;
    const ang = now / 160, fx = b.x + Math.cos(ang) * (big ? 46 : 26), fy = b.y + 28 + Math.sin(ang) * (big ? 22 : 12);
    if (big) { ctx.fillStyle = '#ffd23c33'; ctx.beginPath(); ctx.ellipse(b.x, b.y + 28, 130, 60, 0, 0, 6.283); ctx.fill(); }
    drawFish(ctx, fx, fy, fl, ang + Math.PI / 2, big ? '#1b2a30dd' : '#20414dcc', now * 2);
    ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 4;
    for (let k = 0; k < 3; k++) { const r = ((now / 6 + k * 30) % 90) + 10; ctx.globalAlpha = 1 - r / 100; ctx.beginPath(); ctx.ellipse(b.x, b.y + 8, r * (big ? 1.6 : 1), r * 0.4, 0, 0, 6.283); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (big && !a.fan && !(a.bait > 0)) {
      ctx.font = `900 32px ${FONT}`; ctx.textAlign = 'center';
      outlined(ctx, '大家伙！普通竿拉不动', b.x, b.y + 110, '#ffd23c', '#000', 7);
      ctx.font = `800 26px ${FONT}`; outlined(ctx, '⭐ 点关注换金鱼竿', b.x, b.y + 148, '#ffffff', '#000', 6);
    }
  }
  if (bite) {
    // 上钩提示：鱼钩气泡 + 来了！
    const s = 1 + Math.sin(now / 120) * .08;
    ctx.save(); ctx.translate(b.x, b.y - 70); ctx.scale(s, s);
    ctx.fillStyle = '#ffffff'; rr(ctx, -38, -34, 76, 64, 24); ctx.fill();
    ctx.strokeStyle = '#3ad1e6'; ctx.lineWidth = 5; ctx.stroke();
    ctx.font = `44px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🪝', 0, -2);
    ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 6;
    for (const k of [-1, 1]) for (const d of [-.5, 0, .5]) { ctx.beginPath(); ctx.moveTo(k * 52 * Math.cos(d), -2 + 52 * Math.sin(d)); ctx.lineTo(k * 72 * Math.cos(d), -2 + 72 * Math.sin(d)); ctx.stroke(); }
    ctx.restore();
    ctx.font = `900 50px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    outlined(ctx, '来了！', p.x + p.side * 60, p.y - 150, '#b6ff5a', '#1d5a00', 10);
    ctx.font = `800 24px ${FONT}`; outlined(ctx, '评论 6 收杆', p.x + p.side * 60, p.y - 108, '#ffffff', '#000000aa', 5);
  }
  // 人：头像 + 名字 + 编号
  avatarCircle(ctx, getImage ? getImage(a.avatar, a.name) : null, a.name, p.x, p.y, 34, a.fan);
  if (a.rodLv > 1 || a.bait > 0) {
    ctx.fillStyle = '#000000aa'; rr(ctx, p.x - 44, p.y - 76, 88, 28, 14); ctx.fill();
    ctx.fillStyle = '#ffe36b'; ctx.font = `800 20px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((a.rodLv > 1 ? '🎣Lv' + a.rodLv : '') + (a.bait > 0 ? ' 🪱' + a.bait : ''), p.x, p.y - 62);
  }
  ctx.font = `800 24px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  outlined(ctx, fitText(ctx, a.name, 130), p.x, p.y + 52, a.fan ? '#ffe36b' : '#ffffff', '#000000aa', 5);
  // 收获展示
  if ((show || a.phase === 'snap') && a.catch && t - a.phaseAt < 800) {
    // 出水：鱼从浮漂处甩出水面，飞向竿尖（断线则往回掉）
    const k = (t - a.phaseAt) / 800, c = a.catch, snap = a.phase === 'snap';
    const sx = b.x, sy = b.y, ex = snap ? b.x + p.side * 60 : tipX, ey = snap ? b.y + 30 : tipY - 80;
    const x = sx + (ex - sx) * k, y = sy + (ey - sy) * k - Math.sin(k * Math.PI) * 220;
    drawFish(ctx, x, y, c.tier >= 3 ? 150 : 80, -Math.PI / 2 + k * 3, FISH_COLOR[c.tier], now * 3);
    ctx.fillStyle = '#ffffffcc';
    for (let i = 0; i < 8; i++) { const ang = i / 8 * 6.283; ctx.beginPath(); ctx.arc(sx + Math.cos(ang) * (20 + k * 80), sy - Math.abs(Math.sin(ang)) * (k * 90), 7 * (1 - k), 0, 6.283); ctx.fill(); }
  }
  if (a.phase === 'snap' && a.catch) {
    const c = a.catch;
    ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(tipX - 14, tipY + 30); ctx.lineTo(tipX + 14, tipY + 50); ctx.moveTo(tipX + 14, tipY + 30); ctx.lineTo(tipX - 14, tipY + 50); ctx.stroke();
    ctx.font = `900 36px ${FONT}`; ctx.textAlign = 'center';
    outlined(ctx, '💔 线断了！' + c.label + '跑了', p.x + p.side * 90, p.y - 140, '#ff8a8a', '#000', 7);
    ctx.font = `800 26px ${FONT}`; outlined(ctx, '⭐ 关注换金鱼竿 · 稀有鱼拉得上', p.x + p.side * 90, p.y - 100, '#ffe36b', '#000', 6);
  }
  if (show && a.catch && t - a.phaseAt >= 800) {
    const age = (t - a.phaseAt - 800) / 1000, y = p.y - 120 - Math.min(40, age * 40);
    const c = a.catch, big = c.tier >= 3;
    drawFish(ctx, tipX, y - 6 + Math.sin(now / 90) * 4, big ? 150 : 90, -Math.PI / 2 + Math.sin(now / 70) * 0.3, FISH_COLOR[c.tier], now * 3);
    ctx.font = `900 ${big ? 40 : 32}px ${FONT}`;
    outlined(ctx, c.tier ? c.label + ' ' + fmtJin(c.weight) : c.label + ' 😂', tipX, y + (big ? 70 : 56), big ? '#ffd23c' : '#ffffff', '#000000cc', 7);
    if (big) { ctx.font = `800 26px ${FONT}`; outlined(ctx, TIER_NAME[c.tier] + '！', tipX, y - 70, '#ff8a3c', '#000', 6); }
  } else if (a.phase === 'wait' && t - a.sat < 15000 && !(a.snaps)) {
    ctx.font = `800 24px ${FONT}`; ctx.textAlign = 'center';
    const tx = Math.max(150, Math.min(930, p.x + p.side * 60));
    outlined(ctx, '等鱼上钩… 出现「来了！」', tx, p.y - 132, '#ffffff', '#000000cc', 6);
    outlined(ctx, '就评论 6 收杆', tx, p.y - 100, '#b6ff5a', '#000000cc', 6);
  } else if (a.phase === 'miss') {
    ctx.font = `900 34px ${FONT}`; outlined(ctx, '鱼跑了…', p.x + p.side * 70, p.y - 120, '#cfe7ff', '#000000aa', 6);
  }
}

function spotNumbers(ctx, taken, spots) {
  ctx.font = `800 26px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 1; i <= spots; i++) {
    if (taken.has(i)) continue;
    const p = spotPos(i, spots);
    ctx.fillStyle = '#ffffff66'; ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#7a4a1a'; ctx.fillText(String(i), p.x, p.y);
  }
}
function seatBadge(ctx, a, spots) {
  const p = spotPos(a.spot, spots), x = p.x - p.side * 52, y = p.y - 26;
  ctx.fillStyle = '#e8483c'; ctx.beginPath(); ctx.arc(x, y, 17, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `900 20px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(a.spot), x, y + 1);
}

// 有人进场（或钓位全空）：河中间弹出「怎么玩」三步卡，带新人头像
function guideCard(ctx, state, t, now) {
  const arr = state.arrivals || [], empty = !(state.anglers || []).length;
  if (!arr.length && !empty) return;
  const newest = arr[arr.length - 1];
  const age = newest ? t - newest.at : 1000;
  const k = Math.min(1, age / 250), fade = newest ? Math.min(1, (9000 - age) / 600) : 1;
  ctx.save(); ctx.globalAlpha = Math.max(0, empty && !newest ? 1 : fade);
  const x = 90, y = 700, w = 900, h = 400;
  ctx.translate(540, y + h / 2); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); ctx.translate(-540, -(y + h / 2));
  ctx.fillStyle = '#0d2a3cee'; rr(ctx, x, y, w, h, 40); ctx.fill();
  ctx.strokeStyle = '#ffe36b'; ctx.lineWidth = 5; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (newest) {
    const names = arr.slice(-3).map(a => String(a.name).slice(0, 6)).join('、');
    arr.slice(-3).forEach((a, i, all) => avatarCircle(ctx, state.getImage ? state.getImage(a.avatar, a.name) : null, a.name, 540 + (i - (all.length - 1) / 2) * 84, y + 6, 38, false));
    ctx.font = `900 40px ${FONT}`; outlined(ctx, `👋 欢迎 ${names}`, 540, y + 82, '#ffffff', '#000', 6);
  } else { ctx.font = `900 44px ${FONT}`; outlined(ctx, '🎣 钓位空着 · 快来钓鱼', 540, y + 70, '#ffffff', '#000', 6); }
  const steps = [['👍', '点个赞', '马上坐下钓鱼'], ['❗', '等「来了！」', '鱼上钩了'], ['💬', '评论 6', '收杆拉鱼']];
  const pulse = Math.floor(now / 900) % 3;
  steps.forEach(([ic, a, b], i) => {
    const cx = 240 + i * 300, cy = y + 230, on = i === pulse;
    ctx.fillStyle = on ? '#ffe36b' : '#ffffff22'; rr(ctx, cx - 125, cy - 85, 250, 170, 28); ctx.fill();
    ctx.font = `56px ${EMOJI}`; ctx.fillText(ic, cx, cy - 38);
    ctx.font = `900 34px ${FONT}`; ctx.fillStyle = on ? '#4a2600' : '#ffffff'; ctx.fillText(a, cx, cy + 22);
    ctx.font = `700 24px ${FONT}`; ctx.fillStyle = on ? '#6a3a00' : '#cfe7ff'; ctx.fillText(b, cx, cy + 60);
    if (i < 2) { ctx.font = `900 40px ${FONT}`; ctx.fillStyle = '#ffe36b'; ctx.fillText('›', cx + 150, cy); }
  });
  ctx.font = `800 26px ${FONT}`; ctx.fillStyle = '#ffd23c'; ctx.fillText('⭐ 点关注 = 金鱼竿 · 稀有大鱼才拉得上', 540, y + h - 36);
  ctx.restore();
}

/** state: game.state() + {leftText, getImage(src,name), roundLeft} */
export function drawFishingScene(ctx, W, H, state, now) {
  ctx.save(); ctx.setTransform(W / 1080, 0, 0, H / 1920, 0, 0);
  bank(ctx, now);
  const t = state.now || Date.now(), spots = state.spots || 20;
  const anglers = state.anglers || [];
  school(ctx, now);
  spotNumbers(ctx, new Set(anglers.map(a => a.spot)), spots);
  // 正在上钩的人最后画，不被挡住
  const order = [...anglers].sort((a, b) => (a.phase === 'bite') - (b.phase === 'bite') || (a.phase === 'show') - (b.phase === 'show'));
  for (const a of order) drawAngler(ctx, a, now, t, state.getImage, spots);
  for (const a of anglers) seatBadge(ctx, a, spots);
  // 评论气泡
  const byName = new Map(anglers.map(a => [a.name, a]));
  for (const b of state.bubbles || []) {
    const a = byName.get(b.name); if (!a || a.phase === 'bite' || a.phase === 'show') continue;
    const p = spotPos(a.spot, spots);
    ctx.globalAlpha = Math.max(0, Math.min(1, (6000 - (t - b.at)) / 1000));
    ctx.font = `800 26px ${FONT}`; const s = fitText(ctx, b.text, 280), w = ctx.measureText(s).width + 36;
    const bx = Math.max(10, Math.min(1070 - w, p.x - w / 2)), by = p.y - 130;
    ctx.fillStyle = '#ffffffee'; rr(ctx, bx, by, w, 46, 23); ctx.fill();
    ctx.fillStyle = '#123047'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, bx + 18, by + 24);
    ctx.globalAlpha = 1;
  }
  // 特效：关注金光 / 礼物 / 大鱼
  for (const e of state.fx || []) {
    const a = byName.get(e.name); if (!a || e.kind === 'bite' || e.kind === 'catch') continue;
    const p = spotPos(a.spot, spots), ph = Math.min(1, (t - e.at) / 3000);
    ctx.globalAlpha = 1 - ph; ctx.font = `54px ${EMOJI}`; ctx.textAlign = 'center';
    const icons = e.kind === 'gold' ? ['⭐', '✨'] : e.kind === 'gift' ? ['🎁', '💖'] : e.kind === 'big' ? ['🎉', '✨'] : ['💦', '💦'];
    for (let i = 0; i < 6; i++) { const ang = i / 6 * 6.283; ctx.fillText(icons[i % 2], p.x + Math.cos(ang) * (50 + ph * 90), p.y + Math.sin(ang) * (40 + ph * 70)); }
    ctx.globalAlpha = 1;
  }

  guideCard(ctx, state, t, now);
  // 顶部：标题 + 本轮榜
  ctx.fillStyle = '#5a2a0acc'; rr(ctx, 30, 150, 1020, 100, 40); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `900 54px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('🎣 钓鱼大赛', 66, 200);
  ctx.font = `800 30px ${FONT}`; ctx.fillStyle = '#ffe2a8'; ctx.fillText(`${state.count || 0}/${spots} 人在钓`, 380, 202);
  if (state.leftText) { ctx.font = `700 24px ${FONT}`; ctx.textAlign = 'right'; ctx.fillStyle = '#ffe9a8'; ctx.fillText(state.leftText, 1020, 202); }
  // 关注引导条：一直显示，金色闪动
  { const pulse = 0.75 + Math.sin(now / 300) * 0.25;
    ctx.fillStyle = `rgba(255,190,40,${pulse})`; rr(ctx, 30, 262, 1020, 60, 30); ctx.fill();
    ctx.fillStyle = '#4a2600'; ctx.font = `900 32px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⭐ 点关注 = 金鱼竿 · 稀有大鱼只有金鱼竿拉得上 · 立送一条大鱼', 540, 293); }
  const top = state.top || [];
  ctx.fillStyle = '#00000077'; rr(ctx, 30, 336, 500, 196, 28); ctx.fill();
  ctx.textAlign = 'left'; ctx.fillStyle = '#ffe36b'; ctx.font = `900 28px ${FONT}`; ctx.fillText('🏆 本轮榜 · 按总斤数', 54, 368);
  if (!top.length) { ctx.fillStyle = '#ffffffcc'; ctx.font = `700 26px ${FONT}`; ctx.fillText('还没人上鱼 · 第一条就是你的', 54, 440); }
  top.forEach((b, i) => {
    const y = 414 + i * 42;
    ctx.font = `800 26px ${EMOJI}`; ctx.fillText(['🥇', '🥈', '🥉'][i], 50, y);
    avatarCircle(ctx, state.getImage ? state.getImage(b.avatar, b.name) : null, b.name, 110, y, 17, false);
    ctx.font = `800 26px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(fitText(ctx, b.name, 170), 136, y);
    ctx.fillStyle = '#b6ff5a'; ctx.textAlign = 'right'; ctx.fillText(`${b.count}条 ${fmtJin(b.weight)}`, 510, y); ctx.textAlign = 'left';
  });

  // 左下：最近收获
  const feed = (state.feed || []).slice(0, 4);
  ctx.fillStyle = '#00000077'; rr(ctx, 550, 336, 500, 196, 28); ctx.fill();
  ctx.fillStyle = '#9fe8ff'; ctx.font = `900 28px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('🪣 刚刚钓到', 574, 368);
  if (!feed.length) { ctx.fillStyle = '#ffffffcc'; ctx.font = `700 26px ${FONT}`; ctx.fillText('等第一条鱼上岸…', 574, 440); }
  feed.slice(0, 3).forEach((f, i) => {
    const y = 414 + i * 42;
    ctx.globalAlpha = 1 - i * .15;
    ctx.font = `800 26px ${FONT}`;
    const s = `${f.emoji} ${String(f.name).slice(0, 6)}：${f.label}${f.weight ? ' ' + fmtJin(f.weight) : ''}`;
    const w = Math.min(470, ctx.measureText(s).width + 28);
    ctx.fillStyle = f.tier >= 3 ? '#b8860bdd' : '#ffffff18'; rr(ctx, 565, y - 19, w, 38, 19); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(fitText(ctx, s, w - 28), 579, y);
    ctx.globalAlpha = 1;
  });
  // 右下：规则卡
  const rx = 30, ry = 1336;
  ctx.fillStyle = '#1b1208dd'; rr(ctx, rx, ry, 1020, 150, 30); ctx.fill();
  ctx.strokeStyle = '#ffffff44'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffe36b'; ctx.font = `900 30px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('点赞 或 评论「选+编号」入座 · 「来了！」评论 6 收杆', 540, ry + 32);
  const rows = [['👍 点赞', '打窝 · 鱼更快上钩'], ['⭐ 关注', '金鱼竿 · 拉得上大鱼'], ['🎁 礼物', '幸运鱼饵 · 钓大鱼'], ['💬 离开', '空出钓位']];
  rows.forEach(([k, v], i) => {
    const x = rx + 18 + (i % 2) * 505, y = ry + 82 + Math.floor(i / 2) * 44;
    ctx.fillStyle = '#ffffff22'; rr(ctx, x, y - 19, 130, 38, 19); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 24px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(k, x + 65, y);
    ctx.fillStyle = '#ffe9c8'; ctx.textAlign = 'left'; ctx.font = `700 26px ${FONT}`; ctx.fillText(v, x + 144, y);
  });
  ctx.restore();
}
