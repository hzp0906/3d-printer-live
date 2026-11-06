import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { FanBook, STREAK, WALL_ACTIVE_MS } from './fan-book.mjs';
import { GroupPhoto, circleGrid, groupBanner, GROUP } from './group-photo.mjs';
import { ClipRecorder, clipName, pickMime, extOf } from './clip-recorder.mjs';
import { handleClipRequest, safeClipName } from './clip-store.mjs';
import { startWSServer } from './bridge-ws.mjs';

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
const DAY = 86400000;

test('粉丝墙：只挂在场粉丝，离开 10 分钟撤下，新来的排最前', () => {
  let t = new Date(2026, 10, 1, 20).getTime();
  const b = new FanBook(mem(), () => t);
  assert.equal(b.markFan('小明', 'https://p.cn/a.jpg'), true);
  assert.equal(b.markFan('小明'), false);
  b.markFan('阿花', 'javascript:alert(1)');
  b.visit('路人');
  assert.equal(b.fanCount(), 2); assert.ok(b.isFan('小明') && !b.isFan('路人'));
  assert.equal(b.wall().find(f => f.name === '阿花').avatar, '');
  assert.equal(b.presentCount(), 2);
  t += WALL_ACTIVE_MS + 1000; b.visit('阿花');
  const w = b.wall();
  assert.deepEqual(w.map(f => f.name), ['阿花']); assert.equal(w[0].lit, true);
  assert.equal(b.presentCount(), 1); assert.equal(b.fanCount(), 2);
  t += 1000; b.visit('小明');
  assert.deepEqual(b.wall().map(f => f.name), ['小明', '阿花']);
  t += DAY;
  assert.equal(b.wall().length, 0);
  b.noteAvatar('路人', 'https://p.cn/x.jpg'); assert.equal(b.get('路人').avatar, undefined);
  // 存进文件再读回来不丢
  const b2 = new FanBook(mem(), () => t); b2.absorb(JSON.parse(JSON.stringify(b.fans)));
  assert.equal(b2.fanCount(), 2); assert.equal(b2.get('小明').avatar, 'https://p.cn/a.jpg');
});

test('连续来看：昨天来过 +1，断一天重计；第 3 天升级钻石款，第 7 天铁粉', () => {
  let t = new Date(2026, 10, 1, 20).getTime();
  const b = new FanBook(mem(), () => t);
  const seen = [];
  for (let d = 0; d < 7; d++) { const v = b.visit('小明'); seen.push([v.streak, v.reward]); t += DAY; }
  assert.deepEqual(seen.map(x => x[0]), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(seen[STREAK.diamond - 1][1], 'diamond'); assert.equal(seen[STREAK.title - 1][1], 'title');
  assert.equal(b.takeDiamond('小明'), true);
  t += DAY; // 断一天
  assert.equal(b.visit('小明').streak, 1);
  assert.equal(b.get('小明').best, 7);
  assert.equal(b.visit('小明').reward, null); // 同一天再来不重复奖励
});

test('全场合影：攒够人+到时间才拍，粉丝排前；格子装进圆里且不重叠', () => {
  let t = 0; const g = new GroupPhoto({}, () => t);
  g.add('a'); g.add('b'); g.add('直播观众');
  t = GROUP.everyMs; assert.equal(g.due(), false); // 人不够
  g.add('c', 'https://p/c.jpg'); g.add('fan');
  assert.equal(g.due(), true);
  const shot = g.take(n => n === 'fan');
  assert.equal(shot.round, 1); assert.equal(shot.total, 4); assert.equal(shot.people[0].name, 'fan'); assert.ok(shot.people[0].fan);
  assert.equal(g.count, 0); assert.equal(g.take(), null);
  assert.ok(groupBanner(shot).includes('4 人'));
  for (const n of [1, 2, 5, 12, 30]) {
    const c = circleGrid(n, 236); assert.equal(c.length, n);
    for (const p of c) assert.ok(Math.hypot(p.x, p.y) + p.r <= 236 + 1);
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) assert.ok(Math.hypot(c[i].x - c[j].x, c[i].y - c[j].y) >= c[i].r + c[j].r - 1e-6);
  }
});

test('短视频素材：两路错开滚动录制，保存时取录得久的那一路', () => {
  let t = 0; const timers = []; const clips = [];
  class MR { static isTypeSupported(m) { return m === 'video/webm'; } constructor() { this.state = 'inactive'; } start() { this.state = 'recording'; this.ondataavailable({ data: { size: 5 } }); } stop() { this.state = 'inactive'; this.onstop(); } }
  globalThis.Blob ??= class { constructor(p, o) { this.parts = p; this.type = o.type; } };
  const canvas = { captureStream: () => ({ getTracks: () => [] }) };
  const r = new ClipRecorder({ getCanvas: () => canvas, MediaRecorder: MR, now: () => t, setTimer: (f, ms) => (timers.push({ f, at: t + ms }), timers.length), clearTimer: () => { }, onClip: (b, n) => clips.push(n) });
  assert.equal(pickMime(MR), 'video/webm'); assert.equal(extOf('video/mp4'), 'mp4');
  assert.ok(r.supported && r.start());
  t = 10000; timers.find(x => x.at === 10000).f(); // 第二路开录（错开半个周期）
  t = 18000;
  assert.equal(r.save('小明'), 18); // 第一路录了 18 秒
  assert.equal(clips.length, 1); assert.match(clips[0], /^头像打印-19700101-\d{6}-小明\.webm$/);
  r.stop(); assert.equal(r.save(), 0);
  assert.equal(clipName('a/b:c', new Date(2026, 0, 2, 3, 4, 5)), '头像打印-20260102-030405-abc');
});

test('数据桥保存素材到 clips/，文件名防穿越，不覆盖同名', async () => {
  assert.equal(safeClipName('../../etc/passwd'), 'etcpasswd.webm');
  assert.equal(safeClipName('a.mp4'), 'a.mp4');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clips-'));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const hub = startWSServer(port, { onRequest: (q, s) => handleClipRequest(q, s, dir) });
  await new Promise(r => setTimeout(r, 100));
  const post = () => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/clip?name=' + encodeURIComponent('测试.webm') }, s => { let b = ''; s.on('data', d => b += d); s.on('end', () => res([s.statusCode, b])); }); q.on('error', rej); q.end(Buffer.from('VIDEO')); });
  const [code, body] = await post(); await post();
  hub.close();
  assert.equal(code, 200); assert.ok(JSON.parse(body).ok);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['测试-2.webm', '测试.webm']);
  assert.equal(fs.readFileSync(path.join(dir, '测试.webm'), 'utf8'), 'VIDEO');
});

test('打印页接入：粉丝墙、连续来看铭牌、全家福、素材录制按钮', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes("if(fanBook.markFan(name,avatar))wallFlash(name)"));
  assert.ok(html.includes("'energy-hud','fan-wall','idle-tip']"));
  assert.ok(html.includes("liveEvent('other',{name:'直播间全家福',avatar:img},1,null,'📸全家福',true,{group:shot.round,groupTotal:shot.total})"));
  assert.ok(html.includes("'🏆 铁粉 · 连续 '+st+' 天'"));
  assert.ok(html.includes('id="clip-save"') && html.includes('autoClip(active)'));
  assert.ok(fs.readFileSync('douyin-bridge.mjs', 'utf8').includes("handleClipRequest(req, res, CLIP_DIR)"));
  assert.ok(fs.readFileSync('.gitignore', 'utf8').includes('clips/'));
});

test('播报防重复：同一人只欢迎一次，关注后不再欢迎，人多合并成一句', async () => {
  const { GiftSpeech } = await import('./gift-speech.mjs');
  globalThis.speechSynthesis = { getVoices: () => [], speak() {}, cancel() {} };
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  let t = 1e12;
  const s = new GiftSpeech(); s.now = () => t; s.speaking = true; // 正在播，后面的都排队
  s.welcome('小天', true); s.welcome('小天', true); s.welcomeBack('小天', 3, 1);
  assert.equal(s.queue.length, 1);
  s.thankFollow('小天'); s.thankFollow('小天');
  assert.equal(s.queue.length, 1); assert.ok(s.queue[0].text.includes('小天') && s.queue[0].kind === 'follow');
  s.welcome('小天');
  assert.equal(s.queue.length, 1, '刚谢过关注，不再欢迎');
  s.welcome('A'); s.welcome('B');
  assert.equal(s.queue.length, 3);
  s.welcome('C'); s.welcome('D'); s.welcome('E');
  const crowd = s.queue.filter(q => q.kind === 'crowd');
  assert.equal(crowd.length, 1); assert.ok(crowd[0].text.includes('等5位朋友'), crowd[0].text);
  assert.ok(s.queue.length <= 3);
  s.enqueue('同一句'); s.enqueue('同一句');
  assert.equal(s.queue.filter(q => q.text === '同一句').length, 1);
  t += 11 * 60000; s.speaking = false; s.queue = [];
  s.speaking = true; s.welcome('A'); assert.equal(s.queue.length, 1, '10 分钟后可以再欢迎');
  delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance;
});

test('同一个人刷相同评论 2 分钟内只打印一次，已排队的人再评论不加张', () => {
  const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const a = html.indexOf('const COMMENT_REPEAT_MS'), b = html.indexOf('function upgradeJoinJob(');
  assert.ok(a > 0 && b > a);
  assert.ok(html.includes("if(repeatComment(name,v.text))return;const ks=parseKeepsake(v.text)"));
  const receipts = [];
  const mk = new Function('queue', 'showReceipt', 'parseFortune', 'drawFortune', 'renderQueue', 'ctx',
    'let active=null,busy=false;' + html.slice(a, b) + ';return {repeatComment,commentNorm,set:(x,y)=>{active=x;busy=y}}');
  const queue = [];
  const h = mk(queue, (n, p, t) => receipts.push(t), t => /^\d+$/.test(t) && +t < 100 ? { num: +t } : null, () => ({ no: 1 }), () => {});
  assert.equal(h.commentNorm('哈哈哈'), h.commentNorm('哈哈'));
  assert.notEqual(h.commentNorm('666'), h.commentNorm('66'));   // 数字不压缩
  assert.notEqual(h.commentNorm('99'), h.commentNorm('9'));
  assert.equal(h.repeatComment('小天', '666', 0), false);       // 第一次：打印
  queue.push({ name: '小天', source: '评论' });
  assert.equal(h.repeatComment('小天', '666', 1000), true);    // 一样的：不打
  assert.equal(h.repeatComment('小天', '哈哈', 3000), true);   // 还在排队：不加张
  assert.equal(queue.length, 1);
  queue.length = 0;
  assert.equal(h.repeatComment('小天', '666', 60000), true);   // 打完 2 分钟内再刷同一句：不打
  assert.ok(receipts.some(t => t && t.includes('换个 1-99 的数字')), '数字重复有提示');
  assert.equal(h.repeatComment('小天', '66', 61000), false);   // 换个数字：可以再打
  assert.equal(h.repeatComment('小天', '666', 130000), false);  // 2 分钟后同一句：可以
  assert.equal(h.repeatComment('阿花', '666', 1000), false);   // 别人不受影响
  assert.ok(receipts.some(t => t && t.includes('已经在排队')));
});

test('关注感谢插队到播报队首，队满时挤掉普通播报', async () => {
  const { GiftSpeech } = await import('./gift-speech.mjs');
  globalThis.speechSynthesis = { getVoices: () => [], speak() {}, cancel() {} };
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  const s = new GiftSpeech(); s.speaking = true;
  s.enqueue('礼物感谢甲'); s.enqueue('空闲提示乙');
  s.thankFollow('粉一'); s.thankFollow('粉二');
  assert.deepEqual(s.queue.map(q => q.kind === 'follow' ? q.who : q.text), ['粉一', '粉二', '礼物感谢甲', '空闲提示乙']);
  for (let i = 0; i < 8; i++) s.enqueue('普通' + i);
  assert.equal(s.queue.length, 12);
  s.thankFollow('粉三');
  assert.equal(s.queue.length, 12); assert.equal(s.queue[2].who, '粉三');
  assert.ok(!s.queue.some(q => q.text === '普通7'));
  delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance;
});
