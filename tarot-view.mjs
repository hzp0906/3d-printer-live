// 今日能量卡画面：程序绘制黑金卡面（无需图片素材），基准 1080×1920 竖屏，按目标画布等比缩放。
export const FLIP_MS = 1200;
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
const GOLD = '#e8c36a', GOLD_D = '#9c7a32', INK = '#0b0912';
const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';

function stars(ctx, now) {
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) {
    const x = 50 + rnd() * 980, y = 50 + rnd() * 1820, r = 1 + rnd() * 2.6, ph = rnd() * 6.28;
    ctx.globalAlpha = .25 + .55 * (0.5 + 0.5 * Math.sin(now / 700 + ph));
    ctx.fillStyle = rnd() > .7 ? '#fff6d8' : GOLD;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function sparkle(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * .28 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}

function frame(ctx) {
  ctx.strokeStyle = GOLD_D; ctx.lineWidth = 3; ctx.strokeRect(28, 28, 1024, 1864);
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.strokeRect(44, 44, 992, 1832);
  ctx.fillStyle = GOLD;
  for (const [x, y] of [[44, 44], [1036, 44], [44, 1876], [1036, 1876]]) {
    ctx.beginPath(); ctx.arc(x, y, 46, 0, 6.283); ctx.strokeStyle = GOLD_D; ctx.lineWidth = 2; ctx.stroke();
    sparkle(ctx, x, y, 30);
  }
}

function moon(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x, y, r * .2, x, y, r * 2.2);
  g.addColorStop(0, '#f6d98a55'); g.addColorStop(1, '#f6d98a00');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, 6.283); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.clip();
  ctx.fillStyle = '#f3d27c'; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(x + r * .42, y - r * .18, r * .86, 0, 6.283); ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function wrapText(ctx, text, maxW) {
  const out = []; let line = '';
  for (const ch of String(text)) {
    if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch;
  }
  if (line) out.push(line);
  return out;
}

function cardBack(ctx, w, h, gold, now, who = null) {
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, gold ? '#3b2a0a' : '#22183d'); g.addColorStop(1, gold ? '#140d02' : '#0d0a1a');
  ctx.fillStyle = g; roundRect(ctx, -w / 2, -h / 2, w, h, 26); ctx.fill();
  ctx.strokeStyle = GOLD; ctx.lineWidth = gold ? 10 : 6; ctx.stroke();
  ctx.strokeStyle = GOLD_D; ctx.lineWidth = 2; roundRect(ctx, -w / 2 + 26, -h / 2 + 26, w - 52, h - 52, 16); ctx.stroke();
  ctx.save(); ctx.rotate(now / 6000);
  ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
  for (const r of [70, 120, 170]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.stroke(); }
  ctx.fillStyle = GOLD;
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; sparkle(ctx, Math.cos(a) * 145, Math.sin(a) * 145, 12); }
  ctx.restore();
  moon(ctx, 0, -h / 2 + 110, 34); moon(ctx, 0, h / 2 - 110, 34);
  if (!who) { ctx.fillStyle = GOLD; sparkle(ctx, 0, 0, 56); return; }
  // 卡背中央印观众头像 + 名字：一进场就看到「这张是我的」
  const R = 110, img = who.img;
  ctx.save(); ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.283); ctx.clip();
  if (img && img.complete && img.naturalWidth) {
    const iw = img.naturalWidth, ih = img.naturalHeight, sc = Math.max(2 * R / iw, 2 * R / ih);
    try { ctx.drawImage(img, -iw * sc / 2, -ih * sc / 2, iw * sc, ih * sc); } catch (e) { }
  } else {
    ctx.fillStyle = '#3d2f6b'; ctx.fillRect(-R, -R, 2 * R, 2 * R);
    ctx.fillStyle = '#fff3cf'; ctx.font = `900 110px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(initial(who.name), 0, 6);
  }
  ctx.restore();
  ctx.strokeStyle = GOLD; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(0, 0, R + 4, 0, 6.283); ctx.stroke();
  const nm = String(who.name || '').slice(0, 8);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 44px ${FONT}`;
  const nw = Math.min(w - 60, ctx.measureText(nm).width + 56);
  ctx.fillStyle = '#0d0a18e6'; roundRect(ctx, -nw / 2, R + 34, nw, 64, 32); ctx.fill();
  ctx.strokeStyle = GOLD_D; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffe9a8'; ctx.fillText(nm, 0, R + 66);
  ctx.fillStyle = '#d9cdf5'; ctx.font = `700 34px ${FONT}`; ctx.fillText('评论翻开', 0, -R - 50);
}

function initial(name) { return Array.from(String(name || '客').trim() || '客')[0]; }

function cardFace(ctx, w, h, item, img, now = 0) {
  const r = item.result, gold = item.priority;
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, gold ? '#4a360c' : '#2a1d4a'); g.addColorStop(1, gold ? '#1a1104' : '#0f0b1e');
  ctx.fillStyle = g; roundRect(ctx, -w / 2, -h / 2, w, h, 26); ctx.fill();
  ctx.strokeStyle = GOLD; ctx.lineWidth = gold ? 10 : 6; ctx.stroke();
  ctx.strokeStyle = GOLD_D; ctx.lineWidth = 2; roundRect(ctx, -w / 2 + 24, -h / 2 + 24, w - 48, h - 48, 16); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = GOLD; ctx.font = `700 54px Georgia,serif`; ctx.fillText('No.' + String(r.no + 1).padStart(2, '0'), 0, -h / 2 + 86);
  if (item.tag) { ctx.font = `800 30px ${FONT}`; ctx.fillStyle = '#ffe9a8'; ctx.fillText(item.tag, 0, -h / 2 + 128); }
  // 卡面中央：观众本人的大圆头像 + 金色光环（头像始终正着放，「正在充电」只倒置角上的图案）
  const ay = -72, R = 140;
  const halo = ctx.createRadialGradient(0, ay, R * .6, 0, ay, R * 1.55);
  halo.addColorStop(0, gold ? '#ffd76a88' : '#f6d98a66'); halo.addColorStop(1, '#f6d98a00');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, ay, R * 1.55, 0, 6.283); ctx.fill();
  ctx.save(); ctx.translate(0, ay); ctx.rotate(now / 5000);
  ctx.fillStyle = GOLD;
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; sparkle(ctx, Math.cos(a) * (R + 34), Math.sin(a) * (R + 34), i % 3 ? 7 : 12); }
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(0, ay, R, 0, 6.283); ctx.clip();
  if (img && img.complete && img.naturalWidth) {
    const iw = img.naturalWidth, ih = img.naturalHeight, sc = Math.max(2 * R / iw, 2 * R / ih);
    try { ctx.drawImage(img, -iw * sc / 2, ay - ih * sc / 2, iw * sc, ih * sc); } catch (e) { }
  } else {
    const ig = ctx.createLinearGradient(0, ay - R, 0, ay + R); ig.addColorStop(0, '#5b4a8c'); ig.addColorStop(1, '#2b2150');
    ctx.fillStyle = ig; ctx.fillRect(-R, ay - R, 2 * R, 2 * R);
    ctx.fillStyle = '#fff3cf'; ctx.font = `900 130px ${FONT}`; ctx.fillText(initial(item.name), 0, ay + 6);
  }
  ctx.restore();
  ctx.strokeStyle = GOLD; ctx.lineWidth = gold ? 9 : 6; ctx.beginPath(); ctx.arc(0, ay, R + 4, 0, 6.283); ctx.stroke();
  ctx.strokeStyle = GOLD_D; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, ay, R + 16, 0, 6.283); ctx.stroke();
  // 卡面图案缩小放在右下角的小圆章里；「正在充电」时倒置
  const bx = R * .78, by = ay + R * .78;
  ctx.fillStyle = '#140e24'; ctx.beginPath(); ctx.arc(bx, by, 46, 0, 6.283); ctx.fill();
  ctx.strokeStyle = GOLD; ctx.lineWidth = 4; ctx.stroke();
  ctx.save(); ctx.translate(bx, by); if (!r.upright) ctx.rotate(Math.PI);
  ctx.font = `52px "Apple Color Emoji","Segoe UI Emoji",sans-serif`; ctx.fillStyle = '#fff'; ctx.fillText(r.sym, 0, 3);
  ctx.restore();
  // 昵称写在头像下方的小金条上
  const nm = String(item.name || '').slice(0, 8);
  ctx.font = `800 30px ${FONT}`; const nw = Math.min(w - 90, ctx.measureText(nm).width + 48);
  ctx.fillStyle = '#0d0a18d9'; roundRect(ctx, -nw / 2, ay + R + 22, nw, 46, 23); ctx.fill();
  ctx.strokeStyle = GOLD_D; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffe9a8'; ctx.fillText(nm, 0, ay + R + 46);
  ctx.fillStyle = '#fff3cf'; ctx.font = `900 76px ${FONT}`; ctx.fillText(r.name, 0, h / 2 - 210);
  ctx.fillStyle = GOLD; ctx.font = `600 28px Georgia,serif`; ctx.fillText(r.en, 0, h / 2 - 148);
  ctx.fillStyle = r.upright ? '#ffd76a' : '#b9a4ff'; roundRect(ctx, -80, h / 2 - 112, 160, 54, 27); ctx.fill();
  ctx.fillStyle = INK; ctx.font = `900 32px ${FONT}`; ctx.fillText(r.pos, 0, h / 2 - 84);
}

// state: { cards:[{name,avatar,result,priority,tag,start}] (1-3 张并排) | cur:单张兼容, next:[names], leftText, getImage(src,name) }
export function drawTarotScene(ctx, W, H, state, now) {
  const k = Math.min(W / 1080, H / 1920);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#06050a'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(k, 0, 0, k, (W - 1080 * k) / 2, (H - 1920 * k) / 2);
  const bg = ctx.createRadialGradient(540, 820, 80, 540, 900, 1200);
  bg.addColorStop(0, '#2a1f45'); bg.addColorStop(.6, '#120e20'); bg.addColorStop(1, '#07060c');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1080, 1920);
  stars(ctx, now); frame(ctx);
  moon(ctx, 540, 215, 62);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = GOLD; ctx.font = `900 66px ${FONT}`; ctx.fillText('今日能量卡', 540, 345);
  ctx.fillStyle = '#d9cdf5'; ctx.font = `600 32px ${FONT}`; ctx.fillText('限时活动 · 评论任意内容 · 翻开你的今日能量', 540, 410);

  const cards = state.cards && state.cards.length ? state.cards : state.cur ? [state.cur] : [];
  const cur = cards[0] || null, cw = 500, ch = 800, cy = 900;
  const n = cards.length, sc = n >= 3 ? .62 : n === 2 ? .8 : 1;
  const xs = n >= 3 ? [200, 540, 880] : n === 2 ? [290, 790] : [540];
  if (!cur) {
    ctx.save(); ctx.translate(540, cy);
    ctx.translate(0, Math.sin(now / 900) * 14);
    ctx.shadowColor = '#f6d98a'; ctx.shadowBlur = 40 + 20 * Math.sin(now / 500);
    const p0 = state.pending && state.pending[0];
    cardBack(ctx, cw, ch, false, now, p0 ? { name: p0.name, img: state.getImage && state.getImage(p0.avatar, p0.name) } : null);
    ctx.restore();
  } else {
    cards.forEach((c, i) => {
      ctx.save(); ctx.translate(xs[i], n > 1 ? cy - 40 : cy); ctx.scale(sc, sc);
      const p = Math.min(1, Math.max(0, (now - c.start) / FLIP_MS));
      const e = p < 1 ? p * p * (3 - 2 * p) : 1;
      const sx = Math.max(.02, Math.abs(Math.cos(e * Math.PI)));
      const lift = Math.sin(e * Math.PI) * 40;
      ctx.translate(0, -lift); ctx.scale(sx * (1 + .06 * Math.sin(e * Math.PI)), 1);
      ctx.shadowColor = c.priority ? '#ffcc33' : '#b69cff'; ctx.shadowBlur = c.priority ? 70 : 40;
      if (e < .5) cardBack(ctx, cw, ch, c.priority, now); else { ctx.shadowBlur = 0; cardFace(ctx, cw, ch, c, state.getImage && state.getImage(c.avatar, c.name), now); }
      ctx.restore();
    });
  }
  ctx.shadowBlur = 0;

  if (cur && n === 1) {
    ctx.fillStyle = '#cbbdf0'; ctx.font = `600 34px ${FONT}`;
    ctx.fillText(String(cur.name).slice(0, 10) + (cur.result.num ? ` 报数 ${cur.result.num} · 翻开了` : ' 翻开了'), 540, 1400);
    ctx.textAlign = 'center';
    if (now - cur.start >= FLIP_MS * .55) {
      const a = Math.min(1, (now - cur.start - FLIP_MS * .55) / 500);
      ctx.globalAlpha = a; ctx.fillStyle = '#ffe7a3'; ctx.font = `800 44px ${FONT}`;
      const lines = wrapText(ctx, cur.result.text, 860);
      lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, 540, 1500 + i * 62));
      ctx.globalAlpha = 1;
    }
  } else if (cur) {
    // 多张并排：每张下面一行「报数 N」+ 短鼓励语
    const a = Math.min(1, Math.max(0, (now - cur.start - FLIP_MS * .55) / 500));
    cards.forEach((c, i) => {
      const colW = n >= 3 ? 320 : 470;
      ctx.fillStyle = '#cbbdf0'; ctx.font = `600 ${n >= 3 ? 26 : 30}px ${FONT}`;
      const bot = cy - 40 + ch * sc / 2;
      ctx.fillText(c.priority ? '金卡' : c.result.num ? '报数 ' + c.result.num : '随机翻', xs[i], bot + 34);
      ctx.globalAlpha = a; ctx.fillStyle = '#ffe7a3'; ctx.font = `700 ${n >= 3 ? 26 : 30}px ${FONT}`;
      wrapText(ctx, c.result.text, colW).slice(0, 2).forEach((l, k) => ctx.fillText(l, xs[i], bot + 78 + k * 40));
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = '#ffd76a'; ctx.font = `800 40px ${FONT}`;
    ctx.fillText('🔥 人多啦 · 一次翻 ' + n + ' 张', 540, 1420);
    ctx.fillStyle = '#cbbdf0'; ctx.font = `600 32px ${FONT}`;
    ctx.fillText('评论任意内容都能排队 · 报数字翻固定那张', 540, 1490);
  } else {
    const p0 = state.pending && state.pending[0];
    ctx.fillStyle = '#ffe7a3'; ctx.font = `800 46px ${FONT}`;
    ctx.fillText(p0 ? String(p0.name).slice(0, 8) + '，你的卡已就位 · 评论任意内容翻开' : '评论任意内容，翻开属于你的那张', 540, 1420);
    ctx.fillStyle = '#cbbdf0'; ctx.font = `600 32px ${FONT}`; ctx.fillText('点关注 / 送礼物 → 金色能量卡插队', 540, 1490);
  }
  // 底部一排：刚进场观众的待翻小卡（卡背印头像）
  const pend = (state.pending || []).slice(cur ? 0 : 1, cur ? 5 : 6);
  if (pend.length) {
    const gap = 112, x0 = 540 - (pend.length - 1) * gap / 2;
    pend.forEach((p, i) => {
      ctx.save(); ctx.translate(x0 + i * gap, 1578); ctx.scale(.16, .16);
      cardBack(ctx, cw, ch, false, now, { name: p.name, img: state.getImage && state.getImage(p.avatar, p.name) });
      ctx.restore();
    });
  }
  if (state.next && state.next.length) {
    ctx.fillStyle = '#b3a6d6'; ctx.font = `600 30px ${FONT}`;
    ctx.fillText('下一位：' + state.next.map(n => String(n).slice(0, 6)).join(' · '), 540, 1672);
  }
  ctx.fillStyle = '#8f84ad'; ctx.font = `600 26px ${FONT}`;
  ctx.fillText((state.leftText ? state.leftText + '　' : '') + '仅供娱乐', 540, 1850);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
