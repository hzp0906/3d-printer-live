// 引导关注：关注插队不丢、金色材质、限频邀请播报、兜底涨粉不记到具体人。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GiftSpeech } from './gift-speech.mjs';
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('./douyin-bridge.mjs', import.meta.url), 'utf8');

test('关注任务不会被队列保鲜丢弃', () => {
  const code = html.slice(html.indexOf('const STALE_MS=20000'), html.indexOf('const preloaded='));
  const queue = [{ name: '粉丝', priority: true, gold: true, at: 0 }];
  for (let i = 0; i < 20; i++) queue.push({ name: 'l' + i, fromLike: true, at: 99000 });
  new Function('queue', code + 'return trimQueue;')(queue)(100000);
  assert.equal(queue[0].name, '粉丝');
  assert.equal(queue.length, 15);
});

test('关注走金色材质、规则牌有关注一行、收到关注有横幅', () => {
  assert.ok(html.includes("const tier=v.gold||v.diamond?3:"));
  assert.ok(html.includes('<b>⭐ 点关注</b><span>金色大头像 · 永久上粉丝墙</span>'));
  assert.ok(html.includes("liveEvent('follow',{name,avatar},1,null,'关注');celebrateFollow(name)"));
  assert.ok(html.includes("giftSpeech.printing(active.name,true,!active.gold&&!active.filler&&liveMode)"));
});

test('关注邀请限频 45 秒，感谢关注带昵称', () => {
  const s = new GiftSpeech(); const said = []; s.enqueue = t => said.push(t);
  s.welcome('小A', true); s.welcome('小B', true);
  assert.ok(said[0].includes('关注'));
  assert.ok(!said[1].includes('关注'), '45 秒内第二次进场不再邀请');
  s.thankFollow('小C'); assert.ok(said[2].includes('小C') && said[2].includes('金色'));
  assert.equal(s.inviteReady(Date.now() + 46000), true);
});

test('冷场邀请：播报中不插入', () => {
  const s = new GiftSpeech(); const said = []; s.enqueue = t => said.push(t);
  assert.equal(s.idleInvite(), false, '未解锁语音前不播');
  s.unlocked = true; assert.equal(s.idleInvite(), true); assert.ok(said[0].includes('关注'));
  s.speaking = true; assert.equal(s.idleInvite(), false);
});

test('粉丝数兜底只广播新增粉丝，不打印具体人', () => {
  const fn = bridge.slice(bridge.indexOf('async function pollFollowers'), bridge.indexOf('// 串行悬停'));
  assert.ok(fn.includes("hub.broadcast({ type: 'fans', count: fans, delta })"));
  assert.ok(!fn.includes("type: 'follow'"));
  assert.ok(html.includes("else if(type==='fans'){"));
});

test('画面常驻关注提示：打印现场右上角 + 竖屏直播窗口规则牌', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const live = readFileSync(new URL('./live.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./assets/live-rules.css', import.meta.url), 'utf8');
  const stage = html.slice(html.indexOf('id="stage"'), html.indexOf('<div class="controls">'));
  assert.ok(stage.includes('id="follow-cta"') && stage.includes('金色大头像'), '提示在 3D 画面里，直播捕获能拍到');
  assert.ok(css.includes('#follow-cta{') && css.includes('follow-cta-pulse'));
  assert.ok(!live.includes('follow-rule'), '关注已在顶部提示牌，规则牌不重复');
});

test('关注插队到队首时，新任务按身份识别（不能用 slice(at) 取到别人的任务）', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('added=queue.filter(j=>!before.has(j))'));
  assert.ok(!html.includes('added=queue.slice(at)'));
  const { DemoRules } = await import('./demo-rules.mjs');
  const r = new DemoRules(); r.event('like', { name: '进场甲' }, 'a');
  const before = new Set(r.queue); r.event('follow', { name: '关注乙' }, 'b');
  const added = r.queue.filter(j => !before.has(j));
  assert.equal(added.length, 1); assert.equal(added[0].name, '关注乙'); assert.equal(added[0].gold, true);
});

test('金色款/钻石款的铭牌写明款式，观众一眼看出是关注换来的', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.ok(html.includes("special=v.trophy?'🏆 点赞王':v.keepsake?keepsakeTag(v.keepsake):v.diamond?'💎 钻石款':v.gold?'⭐ 原始股东':"));
});

test('竖屏直播窗口镜像关注提示、横幅、回执和点赞能量面板', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const live = readFileSync(new URL('./live.html', import.meta.url), 'utf8');
  assert.ok(html.includes("const MIRROR_IDS=['follow-cta','follow-banner','receipt-toast','energy-hud','fan-wall','idle-tip']"));
  assert.ok(html.includes('overlayTimer=setInterval(mirrorOverlays,250)'));
  assert.ok(html.includes('clearInterval(overlayTimer)'));
  assert.ok(live.includes('<div id="overlays"></div>'));
});

test('竖屏窗口在主页面刷新后能自己重新接上画面', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const live = readFileSync(new URL('./live.html', import.meta.url), 'utf8');
  assert.ok(html.includes('window.__attachLive=attachLive'));
  assert.ok(live.includes('opener.__attachLive(window)'));
  assert.ok(live.includes('setInterval(hook,1500)'));
});

test('直播窗口打开时自动降低反光和阴影精度，关闭后恢复', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('const ql=liveLow?1:qualityLevel;'));
  assert.ok(html.includes('const sm=ql>=4?8192:ql>=2?4096:2048;'));
  assert.ok(html.includes('controls.update();applyQuality();refreshAnimationHost();'));
  assert.ok(html.includes("liveButton.textContent='弹出直播窗口';applyQuality();"));
});
