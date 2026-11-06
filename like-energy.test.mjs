import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LikeEnergy, ENERGY, energyBanner, energySpeech, energyHint } from './like-energy.mjs';

test('全场点赞攒能量，满格给点赞最多的前 3 位发福利，然后下一轮目标变大', () => {
  const e = new LikeEnergy({ goal: 100, step: 50 });
  assert.equal(e.add(30, '小明'), null);
  e.add(20, '阿花'); e.add(10, '老王'); e.add(5, '糖糖'); e.add(5, '直播观众');
  assert.equal(e.value, 70); assert.equal(e.left, 30);
  assert.deepEqual(e.top(3).map(t => t.name), ['小明', '阿花', '老王']);
  const r = e.add(30, '阿花');
  assert.ok(r && r.full);
  assert.deepEqual(r.winners.map(w => w.name), ['阿花', '小明', '老王']);
  assert.equal(e.round, 2); assert.equal(e.value, 0); assert.equal(e.goal, 150);
  assert.equal(e.top().length, 0);
  assert.ok(energyBanner(r).includes('阿花') && energySpeech(r).includes('能量款'));
  assert.ok(energyHint(e).includes('150'));
});

test('单次点赞数夹在 1-100，目标有上限，里程碑只提示一次', () => {
  const e = new LikeEnergy({ goal: 100, step: 1000, maxGoal: 400 });
  e.add(999, 'x'); assert.equal(e.round, 2); assert.equal(e.goal, 400);
  const f = new LikeEnergy({ goal: 100 });
  f.add(85, 'a'); assert.equal(f.milestone(), 0.8); assert.equal(f.milestone(), null);
  assert.equal(ENERGY.rewardTop, 3);
});

test('打印页去掉头像塔，接入点赞能量条', () => {
  const html = fs.readFileSync('index.html', 'utf8'), live = fs.readFileSync('live.html', 'utf8');
  assert.ok(!/tower|头像塔/i.test(html) && !/tower|头像塔/i.test(live));
  assert.ok(!fs.existsSync('avatar-tower.mjs'));
  assert.ok(html.includes("from './like-energy.mjs'"));
  assert.ok(html.includes("energyLike(name,avatar,n)"));
  assert.ok(html.includes("liveEvent('other',{name:w.name,avatar:w.avatar},1,null,'⚡能量款',true,{energy:true})"));
  assert.ok(html.includes("v.energy?'⚡ 点赞能量款'"));
  assert.ok(live.includes('⚡ 点赞攒能量'));
});
