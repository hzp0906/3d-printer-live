// 打印页队列保鲜、排队提速、回执与延迟显示（从 index.html 抽取真实函数执行）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const s = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const pick = (start, end) => s.slice(s.indexOf(start), s.indexOf(end, s.indexOf(start)));

test('点赞/进场/填充任务 20 秒过期，超 15 张先丢这类，评论礼物不丢', () => {
  const code = pick('const STALE_MS=20000', 'const preloaded=');
  const queue = [];
  const trim = new Function('queue', code + 'return trimQueue;')(queue);
  const now = 100000;
  queue.push({ name: 'old-like', fromLike: true, at: now - 21000 }, { name: 'old-comment', at: now - 60000 }, { name: 'gift', priority: true, fromLike: false, at: now - 60000 }, { name: 'filler', filler: true, at: now - 25000 }, { name: 'fresh-like', fromLike: true, at: now - 1000 });
  assert.equal(trim(now), true);
  assert.deepEqual(queue.map(j => j.name), ['old-comment', 'gift', 'fresh-like']);
  queue.length = 0;
  for (let i = 0; i < 10; i++) queue.push({ name: 'c' + i, at: now });
  for (let i = 0; i < 10; i++) queue.push({ name: 'l' + i, fromLike: true, at: now });
  trim(now);
  assert.equal(queue.length, 15);
  assert.equal(queue.filter(j => j.name.startsWith('c')).length, 10, '评论全部保留');
  assert.deepEqual(queue.filter(j => j.name.startsWith('l')).map(j => j.name), ['l5', 'l6', 'l7', 'l8', 'l9'], '丢最旧的点赞');
});

test('直播中队列积压自动加速，填充图让位真实观众，演示模式不变', () => {
  const code = pick('function effectiveSpeed(){', '\n');
  const make = (liveMode, queue, active) => new Function('simulationSpeed', 'liveMode', 'queue', 'active', code + 'return effectiveSpeed();')(4, liveMode, queue, active);
  const q = n => Array.from({ length: n }, () => ({}));
  assert.equal(make(false, q(20), null), 4);
  assert.equal(make(true, q(3), null), 4);
  assert.equal(make(true, q(6), null), 8);
  assert.equal(make(true, q(11), null), 12);
  assert.equal(make(true, [{ filler: false }], { filler: true }), 12, '真实观众排队时填充图加速收尾');
  assert.equal(make(true, [{ filler: true }], { filler: true }), 4);
});

test('真实评论排在填充任务前、入队即回执与预加载头像，延迟显示在连接面板', () => {
  assert.ok(s.includes("queue.findIndex(j=>(j.fromLike||j.filler)&&!j.priority)"));
  assert.ok(s.includes("const n=pos+1+(busy?1:0);showReceipt(user.name,n,"));
  assert.ok(s.includes('preloadAvatar(j.avatar)'));
  assert.ok(s.includes("' · 弹幕延迟 '+(lastLatency.ms/1000).toFixed(1)+'秒'"));
  assert.ok(s.includes("let dt=Math.min((now-last)/1000,.25)*effectiveSpeed();"));
});
