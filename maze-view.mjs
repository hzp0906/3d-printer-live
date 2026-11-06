// 头像迷宫画面：纯 Canvas 绘制，1080×1920 竖屏。
// 竖屏安全区：抖音顶部和底部（评论区、礼物栏）会盖住画面，迷宫和榜单放在 y≈150–1480 之间。
import { fmtSec } from './maze.mjs';

const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';
export const LAYOUT = { x0: 108, y0: 290, cell: 96 };

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
function outlined(ctx, text, x, y, fill, stroke = '#000000aa', lw = 6) {
  ctx.lineJoin = 'round'; ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) >>> 0; return h; };

// 格子中心坐标
export function cellCenter(x, y, L = LAYOUT) { return { x: L.x0 + (x + .5) * L.cell, y: L.y0 + (y + .5) * L.cell }; }
// 头像当前位置：在上一格和这一格之间插值，同格多人按名字错开一点
export function runnerPos(r, L = LAYOUT) {
  const a = cellCenter(r.px, r.py, L), b = cellCenter(r.x, r.y, L), k = r.done ? 1 : Math.min(1, r.prog);
  const h = hash(r.name), ox = ((h % 7) - 3) * 6, oy = (((h >> 3) % 7) - 3) * 6;
  return { x: a.x + (b.x - a.x) * k + ox, y: a.y + (b.y - a.y) * k + oy };
}

function avatar(ctx, img, name, x, y, rad, ring) {
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.283); ctx.closePath();
  ctx.fillStyle = `hsl(${hash(name) % 360} 60% 60%)`; ctx.fill(); ctx.clip();
  if (img && img.complete && img.naturalWidth) ctx.drawImage(img, x - rad, y - rad, rad * 2, rad * 2);
  else { ctx.fillStyle = '#fff'; ctx.font = `700 ${rad}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText([...String(name)][0] || '?', x, y + 2); }
  ctx.restore();
  ctx.lineWidth = ring === '#ffd23c' ? 7 : 4; ctx.strokeStyle = ring; ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.283); ctx.stroke();
}

function board(ctx, maze, now, flash = false) {
  const { x0, y0, cell } = LAYOUT, W = maze.cols * cell, H = maze.rows * cell;
  ctx.fillStyle = '#1e2a4a'; rr(ctx, x0 - 18, y0 - 18, W + 36, H + 36, 26); ctx.fill();
  // 地板格子
  for (let y = 0; y < maze.rows; y++) for (let x = 0; x < maze.cols; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#2f4070' : '#33467a'; ctx.fillRect(x0 + x * cell, y0 + y * cell, cell, cell);
  }
  // 入口 / 出口
  const s = cellCenter(maze.start.x, maze.start.y), e = cellCenter(maze.exit.x, maze.exit.y);
  ctx.fillStyle = '#3ddc8455'; ctx.fillRect(x0, y0, cell, cell);
  ctx.fillStyle = '#ffd23c55'; ctx.fillRect(x0 + maze.exit.x * cell, y0 + maze.exit.y * cell, cell, cell);
  ctx.font = `700 26px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  outlined(ctx, '入口', s.x, s.y + 36, '#7dffb6', '#000000aa', 5);
  ctx.font = `48px ${FONT}`; ctx.fillText('🏁', e.x, e.y - 8 + Math.sin(now / 300) * 4);
  ctx.font = `700 26px ${FONT}`; outlined(ctx, '出口', e.x, e.y + 36, '#ffe37a', '#000000aa', 5);
  // 墙
  ctx.strokeStyle = '#9fd3ff'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath();
  for (let y = 0; y < maze.rows; y++) for (let x = 0; x < maze.cols; x++) {
    const w = maze.walls[y][x], X = x0 + x * cell, Y = y0 + y * cell;
    if (w.n && !(x === 0 && y === 0)) { ctx.moveTo(X, Y); ctx.lineTo(X + cell, Y); }
    if (w.w) { ctx.moveTo(X, Y); ctx.lineTo(X, Y + cell); }
    if (y === maze.rows - 1 && w.s && x !== maze.exit.x) { ctx.moveTo(X, Y + cell); ctx.lineTo(X + cell, Y + cell); }
    if (x === maze.cols - 1 && w.e) { ctx.moveTo(X + cell, Y); ctx.lineTo(X + cell, Y + cell); }
  }
  ctx.stroke();
  // 近路门：金色，只有拿到金钥匙的人能穿过
  const glow = flash ? .55 + .45 * Math.sin(now / 90) : .6 + .4 * Math.sin(now / 250);
  for (const sc of maze.shortcuts) {
    const X = x0 + sc.x * cell, Y = y0 + sc.y * cell;
    ctx.strokeStyle = `rgba(255,210,60,${glow})`; ctx.lineWidth = flash ? 16 : 11; ctx.setLineDash([14, 10]); ctx.beginPath();
    if (sc.d === 'e') { ctx.moveTo(X + cell, Y + 8); ctx.lineTo(X + cell, Y + cell - 8); } else { ctx.moveTo(X + 8, Y + cell); ctx.lineTo(X + cell - 8, Y + cell); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.font = `30px ${FONT}`; ctx.fillText('🔑', sc.d === 'e' ? X + cell : X + cell / 2, sc.d === 'e' ? Y + cell / 2 : Y + cell);
  }
}

function header(ctx, st) {
  ctx.fillStyle = '#0b1230cc'; rr(ctx, 40, 150, 1000, 100, 24); ctx.fill();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = `800 44px ${FONT}`;
  outlined(ctx, '🏃 头像迷宫', 66, 192, '#fff');
  ctx.font = `700 28px ${FONT}`; ctx.textAlign = 'right';
  const run = st.runners.filter(r => !r.done).length, done = st.runners.length - run;
  const info = st.inBreak ? '本局结束 · 马上换新迷宫' : `第 ${st.round} 局 · 剩 ${Math.ceil(st.leftMs / 1000)} 秒`;
  outlined(ctx, info, 1014, 182, '#ffe37a');
  outlined(ctx, `🏃 ${run} 人在跑 · 🏁 ${done} 人通关` + (st.waiting ? ` · ⏳ ${st.waiting} 人排队` : ''), 1014, 222, '#bfe3ff', '#000000aa', 5);
  if (st.leftText) { ctx.font = `600 22px ${FONT}`; ctx.textAlign = 'center'; ctx.textAlign = 'left'; outlined(ctx, st.leftText, 70, 236, '#ffffffaa', '#000000aa', 4); }
}

function runners(ctx, st, now, getImage) {
  const t = st.now;
  const list = [...st.runners].sort((a, b) => a.gold - b.gold);
  for (const r of list) {
    if (r.done) continue;
    const p = runnerPos(r);
    const dash = t < r.dashUntil, luck = t < r.luckUntil;
    if (dash) { // 冲刺拖尾
      const a = cellCenter(r.px, r.py);
      ctx.strokeStyle = '#7fd6ffaa'; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    const bob = Math.sin(now / 120 + hash(r.name)) * 3;
    const ring = r.gold ? '#ffd23c' : luck ? '#7dffb6' : '#ffffff';
    avatar(ctx, getImage && getImage(r.avatar, r.name), r.name, p.x, p.y + bob, r.gold ? 36 : 30, ring);
    ctx.font = `700 20px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    outlined(ctx, fitText(ctx, r.name, 120), p.x, p.y + bob + 46, r.gold ? '#ffe37a' : '#fff', '#000000cc', 5);
    if (dash || luck || r.gold) { ctx.font = `24px ${FONT}`; ctx.fillText(r.gold ? '🔑' : dash ? '💨' : '🍀', p.x + 30, p.y + bob - 30); }
  }
  // 头顶气泡：刚评论的人
  const byName = new Map(st.runners.map(r => [r.name, r]));
  for (const f of st.feed || []) {
    const r = byName.get(f.name); if (!r || r.done || !f.text) continue;
    const p = runnerPos(r), age = (t - f.at) / 6000;
    ctx.globalAlpha = Math.max(0, 1 - age * age);
    ctx.font = `700 22px ${FONT}`; const w = Math.min(220, ctx.measureText(f.text).width + 28);
    ctx.fillStyle = '#ffffffee'; rr(ctx, p.x - w / 2, p.y - 92, w, 38, 14); ctx.fill();
    ctx.fillStyle = '#223'; ctx.textAlign = 'center'; ctx.fillText(fitText(ctx, f.text, w - 20), p.x, p.y - 72);
    ctx.globalAlpha = 1;
  }
  // 死胡同点名：@名字 卡住了？点关注直接开门
  for (const f of st.fx || []) if (f.kind === 'stuck') {
    const r = byName.get(f.name); if (!r || r.done || r.gold) continue;
    const k = (t - f.at) / 5000; if (k > 1) continue;
    const p = runnerPos(r); ctx.globalAlpha = k > .8 ? (1 - k) * 5 : 1;
    ctx.font = `800 26px ${FONT}`; const text = `@${fitText(ctx, r.name, 140)} 卡住了？点关注直接开门`;
    const w = ctx.measureText(text).width + 36, bx = Math.max(50, Math.min(1030 - w, p.x - w / 2)), by = Math.max(270, p.y - 112);
    ctx.fillStyle = '#ffd23cf2'; rr(ctx, bx, by, w, 46, 18); ctx.fill();
    ctx.fillStyle = '#3a2400'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + w / 2, by + 24);
    ctx.globalAlpha = 1;
  }
  // 通关瞬间的弹字
  for (const f of st.fx || []) if (f.kind === 'finish') {
    const k = (t - f.at) / 2500, e = cellCenter(st.maze.exit.x, st.maze.exit.y);
    ctx.globalAlpha = Math.max(0, 1 - k); ctx.font = `800 34px ${FONT}`; ctx.textAlign = 'center';
    outlined(ctx, `🎉 ${fitText(ctx, f.name, 200)} 通关！`, Math.min(900, e.x - 120), e.y - 60 - k * 80, '#ffe37a');
    ctx.globalAlpha = 1;
  }
}

// 底部：本局通关 + 今日最快
function footer(ctx, st, getImage) {
  const y = 1370;
  ctx.fillStyle = '#0b1230cc'; rr(ctx, 40, y - 4, 1000, 70, 22); ctx.fill();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = `700 24px ${FONT}`;
  outlined(ctx, '🏆 今日最快', 60, y + 31, '#ffe37a', '#000000aa', 4);
  const top = st.board.slice(0, 3);
  if (!top.length) { ctx.font = `600 24px ${FONT}`; outlined(ctx, '还没人通关 · 点赞冲刺抢第一！', 230, y + 31, '#fff', '#000000aa', 4); return; }
  top.forEach((b, i) => {
    const x = 230 + i * 270;
    avatar(ctx, getImage && getImage(b.avatar, b.name), b.name, x + 22, y + 31, 22, ['#ffd23c', '#dfe6f0', '#e8a06a'][i]);
    ctx.font = `700 22px ${FONT}`; ctx.textAlign = 'left';
    outlined(ctx, fitText(ctx, b.name, 120) + ' ' + fmtSec(b.ms), x + 52, y + 31, '#fff', '#000000aa', 4);
  });
}

// 常驻规则条：一直挂在画面里，后来的人也看得懂
export const RULE_LINE = ['👍 点赞＝冲刺', '💬 评论＝运气 +1', '⭐ 关注＝金钥匙 + 金色打印头像'];
function rules(ctx, now) {
  const y = 1444, h = 64;
  ctx.fillStyle = '#ffd23c22'; rr(ctx, 40, y, 1000, h, 22); ctx.fill();
  ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 3; rr(ctx, 40, y, 1000, h, 22); ctx.stroke();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const xs = [175, 405, 760];
  RULE_LINE.forEach((r, i) => {
    const hot = i === 2, pulse = hot ? 1 + .05 * Math.sin(now / 200) : 1;
    ctx.font = `${hot ? 800 : 700} ${Math.round(26 * pulse)}px ${FONT}`;
    outlined(ctx, r, xs[i], y + h / 2, hot ? '#ffe37a' : '#fff', '#000000cc', 5);
  });
}

// 飘过的横幅：每 40 秒从右往左飘一次规则，新进来的人一定能看到
export const MARQUEE_EVERY = 40000, MARQUEE_MS = 8000;
export const MARQUEE_TEXT = '⭐ 点关注 = 🔑 金钥匙走近路 + 金色大头像排进打印 + 永久上粉丝墙　👍 点赞冲刺　💬 评论运气 +1';
function marquee(ctx, t) {
  const k = (t % MARQUEE_EVERY) / MARQUEE_MS; if (k >= 1) return;
  ctx.font = `800 40px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const w = ctx.measureText(MARQUEE_TEXT).width, x = 1080 - k * (1080 + w + 80), y = 820;
  ctx.fillStyle = '#b8860bdd'; ctx.fillRect(0, y - 40, 1080, 80);
  ctx.fillStyle = '#ffd23c'; ctx.fillRect(0, y - 40, 1080, 4); ctx.fillRect(0, y + 36, 1080, 4);
  outlined(ctx, MARQUEE_TEXT, x, y, '#fff8d6', '#5a3a00', 6);
}

// 进场引导：最新进来的人 + 三步玩法
function guide(ctx, st, getImage) {
  const t = st.now, arr = (st.arrivals || []).filter(a => t - a.at < 9000);
  const empty = !st.runners.length;
  if (!arr.length && !empty) return;
  const x = 130, y = 650, w = 820, h = 330;
  ctx.fillStyle = '#0b1230e6'; rr(ctx, x, y, w, h, 30); ctx.fill();
  ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 4; rr(ctx, x, y, w, h, 30); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 38px ${FONT}`;
  const names = arr.slice(-3).map(a => a.name);
  outlined(ctx, names.length ? fitText(ctx, `欢迎 ${names.join('、')}`, w - 60) : '进来就自动出发！', 540, y + 56, '#fff');
  arr.slice(-3).forEach((a, i, all) => avatar(ctx, getImage && getImage(a.avatar, a.name), a.name, 540 + (i - (all.length - 1) / 2) * 90, y + 130, 36, '#fff'));
  ctx.font = `700 30px ${FONT}`;
  const steps = ['🏃 头像已自动出发', '👍 点赞＝冲刺', '💬 评论＝运气 +1', '⭐ 关注＝金钥匙+金色头像'];
  steps.forEach((s, i) => outlined(ctx, s, x + (i % 2 ? w * .73 : w * .28), y + 210 + Math.floor(i / 2) * 56, i === 3 ? '#ffe37a' : '#fff', '#000000aa', 5));
}

// 两局之间：本局前三名
function breakCard(ctx, st, getImage) {
  if (!st.inBreak) return;
  const x = 110, y = 540, w = 860, h = 580;
  ctx.fillStyle = '#0b1230f0'; rr(ctx, x, y, w, h, 34); ctx.fill();
  ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 5; rr(ctx, x, y, w, h, 34); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 46px ${FONT}`;
  outlined(ctx, `第 ${st.round} 局结束`, 540, y + 70, '#ffe37a');
  const res = st.results || [];
  if (!res.length) { ctx.font = `700 32px ${FONT}`; outlined(ctx, '这局没人走出去 · 下一局点赞冲刺！', 540, y + 250, '#fff'); }
  res.forEach((r, i) => {
    const cy = y + 170 + i * 100;
    ctx.font = `48px ${FONT}`; ctx.fillText(['🥇', '🥈', '🥉'][i], x + 90, cy);
    avatar(ctx, getImage && getImage(r.avatar, r.name), r.name, x + 190, cy, 38, r.gold ? '#ffd23c' : '#fff');
    ctx.textAlign = 'left'; ctx.font = `800 34px ${FONT}`;
    outlined(ctx, fitText(ctx, r.name, 330), x + 250, cy, '#fff');
    ctx.textAlign = 'right'; outlined(ctx, fmtSec(r.ms), x + w - 50, cy, '#7dffb6'); ctx.textAlign = 'center';
  });
  ctx.font = `700 28px ${FONT}`;
  const sx = st.stats || {};
  if (sx.gold && sx.normal) outlined(ctx, `🔑 金钥匙平均 ${fmtSec(sx.goldAvg)} · 普通平均 ${fmtSec(sx.normalAvg)}`, 540, y + h - 100, '#ffe37a', '#000000aa', 5);
  else outlined(ctx, '⭐ 点关注 · 下局带金钥匙走近路', 540, y + h - 100, '#ffe37a', '#000000aa', 5);
  outlined(ctx, '前 3 名送打印头像 · 新迷宫马上开始', 540, y + h - 50, '#bfe3ff', '#000000aa', 5);
}

export function drawMazeScene(ctx, W, H, st, now) {
  ctx.save(); ctx.setTransform(W / 1080, 0, 0, H / 1920, 0, 0);
  const bg = ctx.createLinearGradient(0, 0, 0, 1920); bg.addColorStop(0, '#2b1f5c'); bg.addColorStop(1, '#0f1a3a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1080, 1920);
  header(ctx, st);
  const inviting = (st.fx || []).some(f => f.kind === 'stuck' && st.now - f.at < 5000);
  board(ctx, st.maze, now, inviting);
  runners(ctx, st, now, st.getImage);
  footer(ctx, st, st.getImage);
  rules(ctx, now);
  guide(ctx, st, st.getImage);
  if (!st.inBreak) marquee(ctx, st.now);
  breakCard(ctx, st, st.getImage);
  if (st.tip) { ctx.font = `700 26px ${FONT}`; ctx.textAlign = 'center'; outlined(ctx, st.tip, 540, 1540, '#fff', '#000000cc', 5); }
  ctx.restore();
}
