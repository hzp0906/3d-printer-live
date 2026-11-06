// 卡通主播「小印」：不想出镜时代替摄像头。跟着语音播报做表情：
// 播报开始 → 张嘴说话（按音节起伏）、按播报内容换表情；播报结束 → 闭嘴、待机眨眼。
export const MOODS = ['happy', 'excited', 'worried', 'calm'];

// 根据播报文字挑表情
export function moodOf(text = '') {
  const t = String(text);
  if (/快要倒|快倒|歪了|扶一把|倒了|塌/.test(t)) return 'worried';
  if (/金色|满分|插队|钻石|新纪录|最高|鼓掌|哇|太棒|元气/.test(t)) return 'excited';
  if (/感谢|谢谢|欢迎|关注|小心心|礼物|恭喜|抽到|老粉/.test(t)) return 'happy';
  return 'calm';
}

// 说话时嘴巴开合 0..1：用几个正弦叠加模拟音节，boundary 事件到来时再顶一下
export function mouthOpen(state, now) {
  if (!state.speaking) return 0;
  const t = (now - state.since) / 1000;
  let v = .45 + .3 * Math.sin(t * 17) + .2 * Math.sin(t * 7.3 + 1.3);
  if (state.pulseAt && now - state.pulseAt < 160) v += .35 * (1 - (now - state.pulseAt) / 160);
  return Math.max(0, Math.min(1, v));
}

export function createToonState() {
  return { speaking: false, since: 0, text: '', mood: 'calm', moodUntil: 0, pulseAt: 0, nextBlink: 0, blinkAt: -1000 };
}

// 语音事件 → 状态：{state:'start'|'boundary'|'end', text}
export function toonSpeech(st, ev, now) {
  if (ev.state === 'start') { st.speaking = true; st.since = now; st.text = ev.text || ''; st.mood = moodOf(st.text); st.moodUntil = now + 1e9; }
  else if (ev.state === 'boundary') st.pulseAt = now;
  else if (ev.state === 'end') { st.speaking = false; st.moodUntil = now + 1800; }
  return st;
}

const MOOD_COLOR = { happy: '#ffd76a', excited: '#ff9ec7', worried: '#9ecbff', calm: '#ffd76a' };

// 在 size×size 画布上画小印（圆脸打印机头 + 喷嘴天线）
export function drawToon(ctx, size, st, now) {
  const s = size / 300;
  if (now > st.moodUntil && !st.speaking) st.mood = 'calm';
  if (!st.nextBlink) st.nextBlink = now + 1500;
  if (now >= st.nextBlink) { st.blinkAt = now; st.nextBlink = now + 2200 + Math.random() * 2600; }
  const blink = now - st.blinkAt < 140 ? 1 - Math.abs((now - st.blinkAt) / 70 - 1) : 0;
  const mood = st.mood, open = mouthOpen(st, now);
  const bob = st.speaking ? Math.sin(now / 120) * 4 : Math.sin(now / 900) * 3;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, 300, 300);
  const bg = ctx.createRadialGradient(150, 130, 20, 150, 150, 200);
  bg.addColorStop(0, mood === 'worried' ? '#2d3f66' : mood === 'excited' ? '#55264a' : '#3b2a5c'); bg.addColorStop(1, '#140f22');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 300, 300);
  // 说话时外圈声波
  if (st.speaking) {
    ctx.strokeStyle = MOOD_COLOR[mood]; ctx.lineWidth = 4;
    for (let i = 0; i < 2; i++) {
      const p = ((now / 700) + i / 2) % 1;
      ctx.globalAlpha = (1 - p) * .55; ctx.beginPath(); ctx.arc(150, 160, 95 + p * 50, 0, 6.283); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.save(); ctx.translate(150, 165 + bob);
  if (mood === 'worried') ctx.rotate(Math.sin(now / 90) * .04);
  // 天线喷嘴
  ctx.strokeStyle = '#c9b27a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, -92); ctx.lineTo(0, -122); ctx.stroke();
  ctx.fillStyle = st.speaking ? MOOD_COLOR[mood] : '#e8c36a';
  ctx.beginPath(); ctx.arc(0, -128, 11 + (st.speaking ? open * 4 : 0), 0, 6.283); ctx.fill();
  // 脸
  const face = ctx.createLinearGradient(0, -95, 0, 95);
  face.addColorStop(0, '#fff6e0'); face.addColorStop(1, '#f3d9a8');
  ctx.fillStyle = face; ctx.beginPath(); ctx.ellipse(0, 0, 108, 96, 0, 0, 6.283); ctx.fill();
  ctx.strokeStyle = '#9c7a32'; ctx.lineWidth = 5; ctx.stroke();
  // 屏幕面板
  ctx.fillStyle = '#1d1633'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-82, -58, 164, 112, 30) : ctx.rect(-82, -58, 164, 112); ctx.fill();
  // 腮红
  if (mood !== 'worried') { ctx.fillStyle = '#ff8fb066'; for (const x of [-62, 62]) { ctx.beginPath(); ctx.ellipse(x, 24, 15, 9, 0, 0, 6.283); ctx.fill(); } }
  // 眼睛
  const eyeC = MOOD_COLOR[mood];
  ctx.fillStyle = eyeC; ctx.strokeStyle = eyeC; ctx.lineWidth = 7; ctx.lineCap = 'round';
  for (const x of [-36, 36]) {
    if (mood === 'happy' && st.speaking || blink > .6) { // 笑眯眯 / 眨眼：弯线
      ctx.beginPath(); ctx.arc(x, -10, 13, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    } else if (mood === 'excited') { // 星星眼
      ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 7 : 17; ctx.lineTo(x + Math.cos(a) * r, -14 + Math.sin(a) * r); } ctx.closePath(); ctx.fill();
    } else {
      const h = 16 * (1 - blink);
      ctx.beginPath(); ctx.ellipse(x, -14, 11, Math.max(2, h), 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + 4, -20, 3.5, 0, 6.283); ctx.fill(); ctx.fillStyle = eyeC;
    }
  }
  // 眉毛
  if (mood === 'worried') {
    ctx.lineWidth = 5; for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(d * 22, -40); ctx.lineTo(d * 50, -34); ctx.stroke(); }
  }
  // 嘴
  ctx.lineWidth = 6;
  if (open > .05) {
    const w = mood === 'worried' ? 16 : 22, h = 5 + open * 20;
    ctx.fillStyle = '#ff7a9a'; ctx.beginPath(); ctx.ellipse(0, 26, w, h, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#7a1f3d'; ctx.beginPath(); ctx.ellipse(0, 26 + h * .25, w * .6, h * .5, 0, 0, 6.283); ctx.fill();
  } else if (mood === 'worried') {
    ctx.beginPath(); ctx.arc(0, 40, 14, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(0, 18, mood === 'excited' ? 20 : 15, Math.PI * .15, Math.PI * .85); ctx.stroke();
  }
  ctx.restore();
  // 情绪小符号
  ctx.font = '40px "Apple Color Emoji","Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center';
  const sym = mood === 'excited' ? '✨' : mood === 'worried' ? '💦' : mood === 'happy' && st.speaking ? '💕' : '';
  if (sym) { ctx.globalAlpha = .6 + .4 * Math.sin(now / 200); ctx.fillText(sym, 240, 80 + Math.sin(now / 300) * 6); ctx.globalAlpha = 1; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
