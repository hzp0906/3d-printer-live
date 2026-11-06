import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTarot, drawTarot, TarotQueue, MAJOR, holdMs } from './tarot.mjs';
import { ModeCycle, WARN_MS } from './game-modes.mjs';

test('能量卡：解析数字与抽卡指令', () => {
  assert.deepEqual(parseTarot('27'), { num: 27 });
  assert.deepEqual(parseTarot('抽卡'), { num: 0 });
  assert.deepEqual(parseTarot('翻牌 5'), { num: 5 });
  assert.equal(parseTarot('666'), null);
  assert.equal(parseTarot('99'), null);
  assert.equal(parseTarot('你好'), null);
});

test('能量卡：同人同日同数字结果一致，22 张大牌', () => {
  const a = drawTarot(Math.random, { num: 7, name: '甲', day: 'd' }), b = drawTarot(Math.random, { num: 7, name: '甲', day: 'd' });
  assert.deepEqual(a, b);
  assert.equal(MAJOR.length, 22);
  for (const c of MAJOR) assert.ok(!/会发生|一定会|注定/.test(c.up + c.rev), '只给鼓励不做预测');
});

test('能量卡队列：插队、去重、上限', () => {
  const q = new TarotQueue(3);
  q.add({ name: 'a' }); assert.equal(q.add({ name: 'a' }), -1);
  q.add({ name: 'b' }); q.add({ name: 'c' }); q.add({ name: 'd' });
  assert.equal(q.length, 3);
  assert.equal(q.add({ name: 'v', priority: true }), 1);
  assert.ok(holdMs({ priority: true }) > holdMs({}));
});

test('玩法轮换：预告、切换、锁定、恢复', () => {
  const m = new ModeCycle({ minutes: 60, now: 0 });
  assert.equal(m.mode, 'printer');
  assert.equal(m.tick(60 * 60000 - WARN_MS - 1), null);
  assert.equal(m.tick(60 * 60000 - WARN_MS + 1).type, 'warn');
  assert.deepEqual(m.tick(60 * 60000), { type: 'switch', mode: 'maze' });
  m.setLocked(true, 0); assert.equal(m.tick(10 * 3600000), null);
  const r = new ModeCycle({ minutes: 60, now: 1000, state: { mode: 'tarot', startedAt: 500, locked: false } });
  assert.equal(r.mode, 'tarot');
  // 能量卡限时 10 分钟，打印机仍按设定时长
  const c = new ModeCycle({ minutes: 60, now: 0, state: { mode: 'tarot', startedAt: 0, locked: false } });
  assert.equal(c.remaining(0), 10 * 60000);
  assert.deepEqual(c.tick(10 * 60000), { type: 'switch', mode: 'pond' });
  assert.equal(c.remaining(10 * 60000), 60 * 60000);
});

test('打印页接入玩法轮换与能量卡画面流', () => {
  const s = fs.readFileSync('index.html', 'utf8');
  assert.ok(s.includes("if(gameMode==='tarot'&&tarotEvent(type,name,avatar,v))return;"));
  assert.ok(s.includes('liveSourceCanvas()'));
  assert.ok(s.includes('仅供娱乐') || fs.readFileSync('tarot-view.mjs', 'utf8').includes('仅供娱乐'));
  assert.ok(fs.readFileSync('live.html', 'utf8').includes('body[data-mode=tarot] #rules'));
});

test('能量卡卡面中央放观众头像，牌图案缩到角章', () => {
  const v = fs.readFileSync('tarot-view.mjs', 'utf8');
  assert.ok(v.includes('cardFace(ctx, cw, ch, c, state.getImage && state.getImage(c.avatar, c.name), now)'));
  assert.ok(v.includes('卡面中央：观众本人的大圆头像'));
});
