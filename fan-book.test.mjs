import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FanBook, MATERIALS, materialOf } from './fan-book.mjs';
import { GiftSpeech } from './gift-speech.mjs';
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const DAY = 86400000;

test('来访按天计数，第二天再来才算老粉', () => {
  let t = new Date(2026, 10, 3, 20).getTime(); const store = mem();
  const b = new FanBook(store, () => t);
  const v1 = b.visit('小A'); assert.equal(v1.visits, 1); assert.equal(v1.isNew, true); assert.equal(v1.returning, false);
  t += 3600000; const v2 = b.visit('小A'); assert.equal(v2.firstToday, false); assert.equal(v2.visits, 1);
  t += DAY; const v3 = new FanBook(store, () => t).visit('小A');
  assert.equal(v3.visits, 2); assert.equal(v3.returning, true, '跨天且从本地存储恢复');
});

test('分数映射材质，与打印页分档一致', () => {
  assert.equal(materialOf({ score: 65 }), 'wood'); assert.equal(materialOf({ score: 75 }), 'silver');
  assert.equal(materialOf({ score: 85 }), 'black'); assert.equal(materialOf({ score: 92 }), 'porcelain');
  assert.equal(materialOf({ score: 60, gold: true }), 'gold'); assert.equal(materialOf({ diamond: true, gold: true }), 'diamond');
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('const tier=v.gold||v.diamond?3:v.score>=90?3:v.score>=80?2:v.score>=70?1:0;'));
});

test('集齐 5 种解锁一次钻石款，重复卡不算新卡', () => {
  const b = new FanBook(mem());
  assert.equal(b.collect('粉', 'wood').isNewCard, true);
  assert.equal(b.collect('粉', 'wood').isNewCard, false);
  for (const m of ['silver', 'black', 'porcelain']) assert.equal(b.collect('粉', m).completed, false);
  assert.deepEqual(b.missing('粉'), ['金色']);
  const r = b.collect('粉', 'gold'); assert.equal(r.completed, true); assert.equal(r.owned, MATERIALS.length);
  assert.equal(b.takeDiamond('粉'), true); assert.equal(b.takeDiamond('粉'), false, '只升级一张');
  assert.equal(b.collect('粉', 'gold').completed, false, '已集齐不再重复解锁');
  assert.equal(b.collect('粉', 'diamond').diamond, true); assert.equal(b.top(1)[0].diamonds, 1);
});

test('存储损坏或不可用时不报错', () => {
  const bad = { getItem: () => '{bad', setItem: () => { throw new Error('quota'); } };
  const b = new FanBook(bad); assert.doesNotThrow(() => b.visit('x')); assert.doesNotThrow(() => new FanBook(undefined).visit('y'));
});

test('老粉播报带天数与图鉴进度', () => {
  const s = new GiftSpeech(); const said = []; s.enqueue = t => said.push(t);
  s.welcomeBack('老王', 3, 2); assert.ok(said[0].includes('老王') && said[0].includes('第3天') && said[0].includes('再集3种'));
  s.welcomeBack('老李', 9, 5); assert.ok(said[1].includes('集齐'));
  s.cardDone('小粉'); assert.ok(said[2].includes('钻石'));
});

test('打印页接入：只统计真实观众，完成收卡，钻石升级，面板与规则牌', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.ok(html.includes("function collectCard(job){if(!job||!job.live||job.filler||job.group)return null;"));
  assert.ok(html.includes('logPrint(active);collectCard(active);'));
  assert.ok(html.includes('if(active.live&&!active.filler&&!active.diamond&&!active.keepsake&&!active.trophy&&fanBook.takeDiamond(active.name))'));
  assert.ok(html.includes('id="fan-board"') && html.includes('<b>💎 集齐5种材质</b><span>升级钻石款</span>'));
});
