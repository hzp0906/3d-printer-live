import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Pond, levelOfXp, sizeOf, giftSpecies, SPECIES, LEVEL_XP, POND } from './pond.mjs';
import { ModeCycle, ORDER, MODES } from './game-modes.mjs';
import { FanBook, mergeFans } from './fan-book.mjs';

function clock(t0 = 1000) { const c = { t: t0 }; c.now = () => c.t; return c; }
function mem() { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; }

test('pond: levels and sizes grow', () => {
  assert.equal(levelOfXp(0), 1);
  assert.equal(levelOfXp(5), 2);
  assert.equal(levelOfXp(9999), LEVEL_XP.length);
  assert.ok(sizeOf(10) > 2.5 && sizeOf(1) === 1);
});

test('pond: join spawns one fish per viewer, anonymous ignored', () => {
  const c = clock(); const p = new Pond({}, c.now, () => 0.5);
  const r = p.event('join', '小明', 'https://a/x.png', {});
  assert.match(r.receipt, /小明/);
  p.event('join', '小明', '', {});
  p.event('join', '直播观众', '', {});
  assert.equal(p.count(), 1);
  assert.equal(p.get('小明').species, 'fry');
});

test('pond: likes drop food and fish eat it to grow', () => {
  const c = clock(); const p = new Pond({}, c.now, () => 0.5);
  p.event('join', '小明', '', {});
  const f = p.get('小明'); f.x = 540; f.y = 800;
  const xp0 = f.xp;
  const r = p.event('like', '小明', '', { count: 9 });
  assert.equal(r.likes, 9);
  assert.ok(p.food.length >= 3);
  assert.ok(f.xp > xp0);
  for (let i = 0; i < 400; i++) { c.t += 50; p.tick(50); }
  assert.ok(p.food.filter(x => x.owner === '小明').length < 3, 'fish ate its food');
});

test('pond: comment bubbles, 喂食 feeds everyone', () => {
  const c = clock(); const p = new Pond({}, c.now, Math.random);
  p.event('comment', '阿花', '', { text: '大家好' });
  assert.equal(p.bubbles[0].text, '大家好');
  assert.equal(p.count(), 1, 'commenter without join still gets a fish');
  const r = p.event('comment', '阿花', '', { text: '喂食' });
  assert.match(r.receipt, /鱼食/);
  assert.ok(p.food.length >= 14);
});

test('pond: follow levels up, turns gold, returns save; gifts change species', () => {
  const c = clock(); const p = new Pond({}, c.now, () => 0.5);
  p.event('join', '老铁', '', {});
  const r = p.event('follow', '老铁', '', {});
  assert.ok(r.gold && r.banner && r.save);
  assert.equal(p.get('老铁').fan, true);
  assert.equal(p.get('老铁').lv, 2);
  const g = p.event('gift', '老铁', '', { raw: '小心心', count: 1 });
  assert.match(g.banner, /金鱼/);
  assert.equal(r.save.lv <= g.save.lv, true);
  assert.equal(giftSpecies('啤酒'), 'puffer');
  assert.equal(giftSpecies('嘉年华', 'fry'), 'koi');
  assert.equal(giftSpecies('嘉年华', 'koi'), 'turtle');
  assert.equal(giftSpecies('火箭', 'whale'), 'whale');
});

test('pond: saved fish come back for fans; idle fish sleep then leave; cap evicts non-fans first', () => {
  const c = clock(); const p = new Pond({ maxFish: 3 }, c.now, () => 0.5);
  const r = p.event('join', '老粉', '', { fan: true, saved: { lv: 5, xp: 60, sp: 'koi' } });
  assert.match(r.banner, /Lv5 锦鲤/);
  assert.equal(p.get('老粉').species, 'koi');
  p.event('join', 'a', '', {}); p.event('join', 'b', '', {});
  c.t += 10; p.event('join', 'c', '', {});
  assert.equal(p.count(), 3); assert.ok(p.get('老粉')); assert.equal(p.get('a'), null);
  c.t += POND.sleepAfterMs + 1; p.tick(16);
  assert.equal(p.get('老粉').asleep, true);
  c.t += POND.leaveAfterMs; for (let i = 0; i < 400; i++) { c.t += 50; p.tick(50); }
  assert.equal(p.count(), 0);
});

test('fan-book stores fish only for fans and merges by xp', () => {
  const c = clock(); const fb = new FanBook(mem(), c.now);
  fb.visit('路人');
  assert.equal(fb.saveFish('路人', { lv: 2, xp: 6, sp: 'fry' }), false);
  fb.markFan('粉丝', '');
  assert.equal(fb.saveFish('粉丝', { lv: 3, xp: 20, sp: 'goldfish' }), true);
  assert.deepEqual(fb.fishOf('粉丝'), { lv: 3, xp: 20, sp: 'goldfish' });
  const m = mergeFans({ x: { fan: true, fish: { lv: 2, xp: 8, sp: 'fry' } } }, { x: { fan: true, fish: { lv: 4, xp: 40, sp: 'koi' } } });
  assert.equal(m.x.fish.sp, 'koi');
});

test('pond is the fourth rotating mode and wired into the page', () => {
  assert.deepEqual(ORDER, ['printer', 'maze', 'tarot', 'pond', 'fishing']);
  assert.ok(MODES.pond && !MODES.pet);
  const m = new ModeCycle({ minutes: 60, now: 0, state: { mode: 'tarot', startedAt: 0, locked: false } });
  assert.deepEqual(m.tick(10 * 60000), { type: 'switch', mode: 'pond' });
  const s = fs.readFileSync('index.html', 'utf8');
  assert.ok(s.includes("if(gameMode==='pond'&&pondEvent(type,name,avatar,v))return;"));
  assert.ok(s.includes("if(gameMode==='pond'){last=now;pondFrame();return}"));
  assert.ok(s.includes("gameMode==='pond'?pondCanvas"));
  assert.ok(!/pet\.mjs|petFrame/.test(s));
  assert.ok(fs.readFileSync('live.html', 'utf8').includes('body[data-mode=pond] #rules'));
  assert.ok(Object.keys(SPECIES).length >= 8);
});
