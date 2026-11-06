import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PendingCards, commentCard, isCrowded, takeBatch, batchSize, batchSpeech, batchHoldMs, TarotQueue, drawTarot, holdMs } from './tarot.mjs';

const item = (name, priority = false, num = 5) => ({ name, priority, result: drawTarot(Math.random, { num, name }) });

test('任何评论都能抽卡，人多也不拒绝；报数字翻固定那张', () => {
  assert.equal(isCrowded(3), false); assert.equal(isCrowded(4), true);
  assert.deepEqual(commentCard('666', false), { num: 0 });
  assert.deepEqual(commentCard('哈哈', false), { num: 0 });
  assert.deepEqual(commentCard('666', true), { num: 0 });
  assert.deepEqual(commentCard('哈哈', true), { num: 0 });
  assert.deepEqual(commentCard('27', true), { num: 27 });
  assert.deepEqual(commentCard('抽卡12', true), { num: 12 });
});

test('进场待翻卡：去重、上限、过期、评论取走', () => {
  const p = new PendingCards(3, 1000);
  p.add('a', 'x', 0); p.add('b', '', 0); p.add('a', 'y', 10);
  assert.deepEqual(p.list(20).map(i => i.name), ['a', 'b']);
  p.add('c', '', 30); p.add('d', '', 40);
  assert.equal(p.list(50).length, 3);
  assert.equal(p.take('d').name, 'd'); assert.equal(p.take('zz'), null);
  assert.equal(p.list(5000).length, 0, '2 分钟后过期');
});

test('排队越多一次翻越多张，金卡单独翻', () => {
  assert.equal(batchSize(1), 1); assert.equal(batchSize(4), 2); assert.equal(batchSize(8), 3);
  const q = new TarotQueue(15);
  for (let i = 0; i < 9; i++) q.add(item('观众' + i));
  assert.equal(takeBatch(q).length, 3);
  assert.equal(takeBatch(q).length, 2, '剩 6 人翻 2 张');
  q.add(item('关注人', true));
  const b = takeBatch(q);
  assert.equal(b.length, 1); assert.equal(b[0].name, '关注人');
  const q2 = new TarotQueue(15); q2.add(item('a')); q2.add(item('b'));
  assert.equal(takeBatch(q2).length, 1, '人少还是一张一张翻');
});

test('人多时语音只念名字和卡名', () => {
  const a = item('小明'), b = item('小红');
  const short = batchSpeech([a, b], true);
  assert.ok(short.includes('小明，' + a.result.name) && short.includes('小红，' + b.result.name));
  assert.ok(!short.includes(a.result.text));
  assert.equal(batchSpeech([a], true), '小明，' + a.result.name);
  assert.ok(batchSpeech([a], false).includes(a.result.text), '人少时念完整鼓励语');
  assert.ok(batchHoldMs([a, b], 8) > holdMs(a, 8));
});

test('打印页和画面接入批量翻牌', () => {
  const s = fs.readFileSync('index.html', 'utf8');
  assert.ok(s.includes('commentCard(v.text,crowded)'));
  assert.ok(s.includes('takeBatch(tarotQueue,waiting)'));
  assert.ok(s.includes('batchSpeech(tarotCards,tarotCur.crowded)'));
  assert.ok(s.includes('tarotPending.add(name,avatar)') && s.includes('pending:tarotPending.list()'));
  assert.ok(!s.includes('报 1-78 的数字才能排队翻卡'));
  const v = fs.readFileSync('tarot-view.mjs', 'utf8');
  assert.ok(v.includes('一次翻 ') && v.includes('[200, 540, 880]'));
});
