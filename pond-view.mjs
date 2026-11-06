// 互动鱼塘画面：纯 Canvas 程序绘制（无需图片素材），基准 1080×1920 竖屏，卡通蓝色池塘。
import { SPECIES, MAX_LV, LEVEL_XP, sizeOf } from './pond.mjs';

const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const INK = '#123047';

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

// ---------- 背景：岸边 + 池水 + 水草 + 光斑 ----------
function pondBg(ctx, now) {
  const sky = ctx.createLinearGradient(0, 0, 0, 420);
  sky.addColorStop(0, '#bfeaff'); sky.addColorStop(1, '#e6f8ff');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 1080, 420);
  // 远处草地和小树
  ctx.fillStyle = '#8fd67a'; ctx.beginPath(); ctx.moveTo(0, 400); ctx.quadraticCurveTo(270, 330, 540, 380); ctx.quadraticCurveTo(810, 330, 1080, 390); ctx.lineTo(1080, 440); ctx.lineTo(0, 440); ctx.fill();
  for (const [x, s] of [[110, 1], [960, 1.2], [860, .8]]) {
    ctx.fillStyle = '#8a5a3a'; ctx.fillRect(x - 8 * s, 330 - 10 * s, 16 * s, 60 * s);
    ctx.fillStyle = '#5fbf5a'; ctx.beginPath(); ctx.arc(x, 310 - 20 * s, 50 * s, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#78d26f'; ctx.beginPath(); ctx.arc(x - 18 * s, 296 - 20 * s, 26 * s, 0, 6.283); ctx.fill();
  }
  // 池水
  const w = ctx.createLinearGradient(0, 420, 0, 1580);
  w.addColorStop(0, '#5fd0f0'); w.addColorStop(.5, '#2fa8dc'); w.addColorStop(1, '#1b6fae');
  ctx.fillStyle = w; ctx.beginPath(); ctx.moveTo(0, 430);
  for (let x = 0; x <= 1080; x += 40) ctx.lineTo(x, 430 + Math.sin(x / 60 + now / 600) * 6);
  ctx.lineTo(1080, 1580); ctx.lineTo(0, 1580); ctx.closePath(); ctx.fill();
  // 水面高光
  ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = 5;
  for (let i = 0; i < 5; i++) { const x = ((now / 30 + i * 230) % 1300) - 110; ctx.beginPath(); ctx.moveTo(x, 452 + i % 2 * 10); ctx.lineTo(x + 80, 452 + i % 2 * 10); ctx.stroke(); }
  // 水下光柱
  ctx.save(); ctx.globalAlpha = .1; ctx.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) { const x = 140 + i * 260 + Math.sin(now / 2000 + i) * 40; ctx.beginPath(); ctx.moveTo(x, 440); ctx.lineTo(x + 70, 440); ctx.lineTo(x + 190, 1560); ctx.lineTo(x + 40, 1560); ctx.fill(); }
  ctx.restore();
  // 池底沙子和石头
  ctx.fillStyle = '#e8d29a'; ctx.beginPath(); ctx.moveTo(0, 1500); ctx.quadraticCurveTo(540, 1440, 1080, 1500); ctx.lineTo(1080, 1580); ctx.lineTo(0, 1580); ctx.fill();
  for (const [x, y, r, c] of [[120, 1510, 36, '#9aa7b4'], [180, 1525, 22, '#b6c1cb'], [820, 1505, 44, '#8d9aa8'], [900, 1528, 24, '#b6c1cb'], [520, 1520, 18, '#c7b07a']]) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, r * 1.3, r, 0, 0, 6.283); ctx.fill();
  }
  // 水草
  for (const [x, h, c] of [[60, 260, '#3fbf6f'], [95, 190, '#58d184'], [1000, 300, '#3fbf6f'], [1040, 200, '#58d184'], [640, 150, '#47c77a'], [300, 120, '#58d184']]) {
    ctx.strokeStyle = c; ctx.lineWidth = 18; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, 1530);
    for (let k = 1; k <= 6; k++) ctx.lineTo(x + Math.sin(now / 700 + k * .8 + x) * 16 * k / 3, 1530 - h * k / 6);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  // 荷叶
  for (const [x, y, r] of [[170, 470, 58], [900, 455, 70]]) {
    ctx.fillStyle = '#4fbf5f'; ctx.beginPath(); ctx.ellipse(x, y + Math.sin(now / 900 + x) * 3, r, r * .38, 0, .25, 6.03); ctx.lineTo(x, y); ctx.fill();
  }
  ctx.fillStyle = '#ffb3cf'; ctx.beginPath(); ctx.arc(915, 440, 16, 0, 6.283); ctx.fill();
  // 底部小气泡
  ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 3;
  for (let i = 0; i < 10; i++) {
    const per = 6000, ph = ((now + i * 777) % per) / per;
    const x = 80 + (i * 97) % 920 + Math.sin(ph * 12 + i) * 10, y = 1500 - ph * 1050;
    ctx.beginPath(); ctx.arc(x, y, 5 + (i % 3) * 3, 0, 6.283); ctx.stroke();
  }
}

// ---------- 鱼 ----------
const PAL = {
  goldfish: ['#ff8a3d', '#ffb36b'], puffer: ['#ffd84a', '#fff2a8'], tropical: ['#ffd23c', '#2f8fff'],
  koi: ['#ffffff', '#ff4b3a'], turtle: ['#5fbf5a', '#3a8f3f'], shark: ['#8fa4b8', '#e8f0f6'], whale: ['#3f7fd8', '#bfe0ff'],
};
function fryColors(h) { return [`hsl(${h},75%,62%)`, `hsl(${(h + 30) % 360},85%,80%)`]; }

function tailFin(ctx, L, H, wag, color) {
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(-L * .8, 0); ctx.lineTo(-L * 1.35, -H * .8 + wag); ctx.quadraticCurveTo(-L * 1.15, wag * .5, -L * 1.35, H * .8 + wag); ctx.closePath(); ctx.fill();
}

// 画一条鱼，原点在身体中心，朝右。返回头像半径。
function fishBody(ctx, f, now, sc) {
  const sp = f.species, wag = Math.sin(now / 140 + f.wiggle) * 10 * sc;
  const [c1, c2] = PAL[sp] || fryColors(f.hue);
  let L = 64 * sc, H = 46 * sc;
  ctx.lineWidth = 4; ctx.strokeStyle = '#0b2a4066';
  if (sp === 'turtle') {
    ctx.fillStyle = '#9be08a';
    for (const [x, y] of [[.6, -.8], [.6, .8], [-.6, -.85], [-.6, .85]]) { ctx.beginPath(); ctx.ellipse(x * L, y * H + Math.sin(now / 200 + x) * 4, 22 * sc, 12 * sc, x * y, 0, 6.283); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(L * 1.05, 0, 24 * sc, 20 * sc, 0, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(L * 1.12, -6 * sc, 4 * sc, 0, 6.283); ctx.fill();
    ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(0, 0, L, H * 1.05, 0, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c1; ctx.beginPath(); ctx.ellipse(0, 0, L * .82, H * .85, 0, 0, 6.283); ctx.fill();
    return H * .62;
  }
  if (sp === 'whale') { L *= 1.35; H *= 1.05; }
  if (sp === 'shark') { L *= 1.3; H *= .85; }
  if (sp === 'koi') { L *= 1.2; H *= .85; }
  if (sp === 'puffer') { L = H = 54 * sc; }
  // 尾巴
  tailFin(ctx, L, H, wag, sp === 'koi' ? '#ff4b3a' : sp === 'goldfish' ? '#ffb36b' : c1);
  if (sp === 'goldfish') { ctx.globalAlpha = .7; tailFin(ctx, L * 1.15, H * 1.2, -wag, '#ffd2a0'); ctx.globalAlpha = 1; }
  // 背鳍
  ctx.fillStyle = sp === 'shark' ? c1 : c2;
  ctx.beginPath();
  if (sp === 'shark') { ctx.moveTo(-L * .1, -H * .9); ctx.lineTo(L * .05, -H * 1.9); ctx.lineTo(L * .35, -H * .9); }
  else { ctx.moveTo(-L * .4, -H * .8); ctx.quadraticCurveTo(0, -H * 1.5, L * .3, -H * .85); }
  ctx.closePath(); ctx.fill();
  // 身体
  ctx.fillStyle = c1; ctx.beginPath(); ctx.ellipse(0, 0, L, H, 0, 0, 6.283); ctx.fill(); ctx.stroke();
  // 肚子
  ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, L, H, 0, 0, 6.283); ctx.clip();
  if (sp === 'tropical') { ctx.fillStyle = c2; for (const x of [-.45, .05, .5]) ctx.fillRect(x * L - 9 * sc, -H, 18 * sc, H * 2); }
  else if (sp === 'koi') { ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(-L * .35, -H * .4, L * .35, H * .45, .3, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.ellipse(L * .55, -H * .5, L * .25, H * .35, 0, 0, 6.283); ctx.fill(); }
  else if (sp === 'whale' || sp === 'shark') { ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(L * .1, H * .75, L * 1.05, H * .6, 0, 0, 6.283); ctx.fill(); }
  else { ctx.fillStyle = c2; ctx.globalAlpha = .75; ctx.beginPath(); ctx.ellipse(L * .1, H * .7, L * .8, H * .5, 0, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; }
  ctx.restore();
  if (sp === 'puffer') {
    ctx.fillStyle = '#e0a800';
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; ctx.beginPath(); ctx.moveTo(Math.cos(a - .12) * L, Math.sin(a - .12) * H); ctx.lineTo(Math.cos(a) * L * 1.22, Math.sin(a) * H * 1.22); ctx.lineTo(Math.cos(a + .12) * L, Math.sin(a + .12) * H); ctx.fill(); }
  }
  // 胸鳍
  ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(-L * .05, H * .55, 16 * sc, 8 * sc, .6 + Math.sin(now / 180 + f.wiggle) * .3, 0, 6.283); ctx.fill();
  // 眼睛
  const ex = L * .7, ey = -H * .25;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, 11 * sc, 0, 6.283); ctx.fill();
  if (f.asleep) { ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ex, ey, 7 * sc, .2, Math.PI - .2); ctx.stroke(); }
  else { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ex + 3 * sc, ey, 6 * sc, 0, 6.283); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 5 * sc, ey - 3 * sc, 2.2 * sc, 0, 6.283); ctx.fill(); }
  // 嘴
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); if (f.eat > 0) ctx.arc(L * .93, H * .12, 6 * sc, 0, 6.283); else ctx.arc(L * .86, H * .15, 6 * sc, -.4, 1.2); ctx.stroke();
  // 腮红
  ctx.fillStyle = '#ff7aa866'; ctx.beginPath(); ctx.ellipse(L * .62, H * .2, 9 * sc, 5 * sc, 0, 0, 6.283); ctx.fill();
  if (sp === 'whale' && Math.sin(now / 900 + f.wiggle) > .6) {
    ctx.strokeStyle = '#d9f2ff'; ctx.lineWidth = 5;
    for (const a of [-.5, 0, .5]) { ctx.beginPath(); ctx.moveTo(L * .2, -H); ctx.quadraticCurveTo(L * .2 + a * 40, -H - 50, L * .2 + a * 60, -H - 40); ctx.stroke(); }
  }
  return Math.min(H * .62, 34 * sc);
}

function avatarCircle(ctx, img, name, x, y, r, gold) {
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.closePath();
  ctx.fillStyle = '#ffb36b'; ctx.fill(); ctx.clip();
  if (img && img.complete && img.naturalWidth) ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  else { ctx.fillStyle = '#fff'; ctx.font = `900 ${r}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(name || '?').slice(0, 1), x, y + 2); }
  ctx.restore();
  ctx.strokeStyle = gold ? '#ffd23c' : '#fff'; ctx.lineWidth = gold ? 6 : 4; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
}

function drawFish(ctx, f, now, getImage, highlight) {
  const sc = sizeOf(f.lv) * (f.species === 'fry' ? .85 : 1);
  const bob = Math.sin(now / 500 + f.wiggle) * 4;
  ctx.save(); ctx.translate(f.x, f.y + bob);
  ctx.globalAlpha = f.asleep ? .75 : 1;
  if (f.fan) { ctx.fillStyle = '#ffd23c33'; ctx.beginPath(); ctx.ellipse(0, 0, 100 * sc, 70 * sc, 0, 0, 6.283); ctx.fill(); }
  if (highlight) { ctx.strokeStyle = '#fff6b0'; ctx.lineWidth = 6; ctx.globalAlpha = .5 + .5 * Math.sin(now / 120); ctx.beginPath(); ctx.ellipse(0, 0, 110 * sc, 80 * sc, 0, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.save(); ctx.scale(f.dir < 0 ? -1 : 1, 1); ctx.rotate(Math.max(-.35, Math.min(.35, (f.vy || 0) / 400)) * (f.dir < 0 ? -1 : 1));
  if (f.fan) { ctx.shadowColor = '#ffd23c'; ctx.shadowBlur = 18; }
  const ar = fishBody(ctx, f, now, sc);
  ctx.shadowBlur = 0;
  ctx.restore();
  // 头像贴在身上（不翻转，保证头像正着）
  const ax = f.species === 'turtle' ? 0 : -8 * sc * (f.dir < 0 ? -1 : 1);
  avatarCircle(ctx, getImage ? getImage(f.avatar, f.name) : null, f.name, ax, 0, ar, f.fan);
  // 名字牌
  const H = 46 * sc;
  ctx.font = `800 ${Math.round(22 + f.lv)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const label = fitText(ctx, String(f.name).slice(0, 8), 180);
  const lv = `Lv${f.lv}`;
  const tw = ctx.measureText(label).width + ctx.measureText(lv).width + 34;
  const ty = H + 28;
  ctx.fillStyle = f.fan ? '#5a3a00cc' : '#0b2a40aa'; rr(ctx, -tw / 2, ty - 18, tw, 36, 18); ctx.fill();
  ctx.fillStyle = f.fan ? '#ffd23c' : '#9be7ff'; ctx.textAlign = 'left';
  ctx.fillText(lv, -tw / 2 + 12, ty + 1);
  ctx.fillStyle = '#fff'; ctx.fillText(label, -tw / 2 + 22 + ctx.measureText(lv).width, ty + 1);
  if (f.asleep) { ctx.font = `40px ${EMOJI}`; ctx.textAlign = 'center'; ctx.globalAlpha = .6 + .4 * Math.sin(now / 400); ctx.fillText('💤', 50 * sc, -H - 20); }
  ctx.restore();
}

// ---------- 主画面 ----------
/**
 * state: pond.tick() 的结果 + {leftText, getImage(src,name), likeBurst:[{at,e}]}
 */
export function drawPondScene(ctx, W, H, state, now) {
  ctx.save(); ctx.setTransform(W / 1080, 0, 0, H / 1920, 0, 0);
  pondBg(ctx, now);
  const t = state.now || Date.now();
  // 鱼食
  for (const p of state.food || []) {
    if (t < p.at) continue;
    ctx.fillStyle = p.owner ? '#ffcf6b' : '#ff9e5e'; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#ffffff99'; ctx.beginPath(); ctx.arc(p.x - 3, p.y - 3, 3, 0, 6.283); ctx.fill();
  }
  // 鱼：大鱼画在后面，小鱼在前面不被挡住；最近有特效的鱼最后画
  const fxNames = new Set((state.fx || []).map(x => x.name));
  const fish = [...(state.fish || [])].sort((a, b) => (fxNames.has(a.name) - fxNames.has(b.name)) || b.lv - a.lv || a.y - b.y);
  for (const f of fish) drawFish(ctx, f, now, state.getImage, fxNames.has(f.name));
  // 特效：进场水花 / 升级 / 金边 / 礼物
  const byName = new Map((state.fish || []).map(f => [f.name, f]));
  for (const e of state.fx || []) {
    const f = byName.get(e.name); if (!f) continue;
    const ph = Math.min(1, (t - e.at) / 3000);
    ctx.globalAlpha = 1 - ph; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const y = f.y - 90 * sizeOf(f.lv) - ph * 80;
    if (e.kind === 'level') { ctx.font = `900 40px ${FONT}`; ctx.fillStyle = '#fff36b'; ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 6; ctx.strokeText('升级！Lv' + f.lv, f.x, y); ctx.fillText('升级！Lv' + f.lv, f.x, y); }
    else if (e.kind === 'gold') { ctx.font = `60px ${EMOJI}`; ctx.fillText('⭐', f.x - 50, y); ctx.fillText('✨', f.x + 50, y + 10); }
    else if (e.kind === 'gift') { ctx.font = `60px ${EMOJI}`; for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; ctx.fillText(['🎉', '✨', '💖'][i % 3], f.x + Math.cos(a) * (60 + ph * 120), f.y + Math.sin(a) * (40 + ph * 90)); } }
    else if (e.kind === 'enter') { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; for (const r of [30, 55]) { ctx.beginPath(); ctx.ellipse(f.x, f.y, r + ph * 60, (r + ph * 60) * .5, 0, 0, 6.283); ctx.stroke(); } }
    ctx.globalAlpha = 1;
  }
  // 评论泡泡：从发言人的鱼头上冒出
  for (const b of state.bubbles || []) {
    const f = byName.get(b.name); if (!f) continue;
    const age = t - b.at, a = Math.min(1, (7000 - age) / 1200);
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = `800 30px ${FONT}`;
    const s = fitText(ctx, b.text, 360), w = ctx.measureText(s).width + 44;
    const bx = Math.max(20, Math.min(1060 - w, f.x - w / 2)), by = f.y - 80 * sizeOf(f.lv) - 70 - Math.min(40, age / 60);
    ctx.fillStyle = '#ffffffee'; rr(ctx, bx, by, w, 54, 27); ctx.fill();
    ctx.strokeStyle = '#7fd6ff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(f.x + 6, by + 66, 7, 0, 6.283); ctx.arc(f.x + 16, by + 82, 4, 0, 6.283); ctx.fillStyle = '#ffffffcc'; ctx.fill();
    ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, bx + 22, by + 28);
    ctx.globalAlpha = 1;
  }
  // 点赞飘心（右侧）
  for (const b of state.likeBurst || []) {
    const ph = (now - b.at) / 1600; if (ph < 0 || ph > 1) continue;
    ctx.globalAlpha = 1 - ph; ctx.font = `56px ${EMOJI}`; ctx.textAlign = 'center';
    ctx.fillText(b.e || '👍', 980 + Math.sin(ph * 8 + b.at) * 30, 1400 - ph * 500);
  }
  ctx.globalAlpha = 1;

  // 顶部标题
  ctx.fillStyle = '#0b3a5a99'; rr(ctx, 40, 60, 1000, 120, 40); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `900 58px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('🐟 互动鱼塘', 80, 120);
  ctx.font = `800 32px ${FONT}`; ctx.fillStyle = '#bff0ff';
  ctx.fillText(`${state.count || 0} 条鱼在游`, 420, 122);
  if (state.leftText) { ctx.font = `700 26px ${FONT}`; ctx.textAlign = 'right'; ctx.fillStyle = '#ffe9a8'; ctx.fillText(state.leftText, 1010, 122); }

  // 鱼塘榜（右上，水面上方）
  const top = state.top || [];
  ctx.fillStyle = '#0b3a5a88'; rr(ctx, 600, 200, 440, 190, 30); ctx.fill();
  ctx.fillStyle = '#ffe9a8'; ctx.font = `900 30px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText('🏆 鱼塘榜', 626, 232);
  if (!top.length) { ctx.fillStyle = '#ffffffcc'; ctx.font = `700 26px ${FONT}`; ctx.fillText('进场就有你的鱼', 626, 300); }
  top.forEach((f, i) => {
    const y = 278 + i * 44;
    ctx.font = `800 26px ${FONT}`; ctx.fillStyle = ['#ffd23c', '#e6eef5', '#ffb37a'][i]; ctx.fillText(['🥇', '🥈', '🥉'][i], 622, y);
    avatarCircle(ctx, state.getImage ? state.getImage(f.avatar, f.name) : null, f.name, 682, y, 18, f.fan);
    ctx.fillStyle = '#fff'; ctx.fillText(fitText(ctx, f.name, 150), 710, y);
    ctx.fillStyle = '#9be7ff'; ctx.font = `700 22px ${FONT}`; ctx.fillText(`Lv${f.lv} ${SPECIES[f.species].label}`, 880, y);
  });

  // 底部规则卡
  const by = 1600;
  ctx.fillStyle = '#0b2a40dd'; rr(ctx, 30, by, 1020, 290, 40); ctx.fill();
  ctx.fillStyle = '#ffe9a8'; ctx.font = `900 40px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('🐠 进场就有一条你的小鱼', 70, by + 50);
  const rows = [
    ['👍 点赞', '喂你的鱼 · 长大升级'],
    ['💬 评论', '鱼吐泡泡 ·「喂食」全池开抢'],
    ['⭐ 关注', '升一级换金边 · 下次来还是它'],
    ['🎁 礼物', '换品种：金鱼 河豚 锦鲤 鲸鱼…'],
  ];
  rows.forEach(([k, v], i) => {
    const y = by + 108 + i * 46;
    ctx.fillStyle = '#ffffff1f'; rr(ctx, 64, y - 20, 150, 40, 20); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 26px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(k, 139, y);
    ctx.fillStyle = '#cfeeff'; ctx.textAlign = 'left'; ctx.font = `700 28px ${FONT}`; ctx.fillText(v, 232, y);
  });
  ctx.fillStyle = '#9be7ff'; ctx.font = `700 22px ${FONT}`; ctx.textAlign = 'right';
  ctx.fillText(`Lv1→Lv${MAX_LV} · 满级 ${LEVEL_XP[MAX_LV - 1]} 经验`, 1020, by + 50);
  ctx.restore();
}
