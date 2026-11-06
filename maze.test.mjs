import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MazeGame, makeMaze, distMap, neighbors, seeded, fmtSec, MAZE } from './maze.mjs';
import { cellCenter, runnerPos } from './maze-view.mjs';
import { MODES, ORDER } from './game-modes.mjs';

function game(opts = {}) { let t = 1000; const g = new MazeGame({ now: () => t, rand: seeded(7), ...opts }); return { g, step(ms) { for (let i = 0; i < ms / 100; i++) { t += 100; g.tick(100); } }, at: () => t }; }

test('迷宫：每一格都能走到出口，金钥匙路线不比普通路线长', () => {
  for (const seed of [1, 2, 3, 42]) {
    const m = makeMaze(9, 11, seeded(seed));
    const d = distMap(m), gd = distMap(m, true);
    for (let y = 0; y < 11; y++) for (let x = 0; x < 9; x++) { assert.ok(Number.isFinite(d[y][x])); assert.ok(gd[y][x] <= d[y][x]); }
    assert.ok(m.shortcuts.length > 0);
  }
  const m = makeMaze(9, 11, seeded(5));
  assert.deepEqual(makeMaze(9, 11, seeded(5)).walls, m.walls); // 同种子同迷宫
  assert.ok(neighbors(m, 0, 0).length >= 1);
});

test('进场自动出发，一局里能走出迷宫并上榜', () => {
  const { g, step } = game();
  const r = g.event('join', '小美', 'a.png');
  assert.match(r.receipt, /进迷宫/);
  assert.equal(g.runners.size, 1);
  step(80000);
  const fin = g.takeAlerts().filter(a => a.kind === 'finish');
  assert.equal(fin.length, 1); assert.equal(fin[0].name, '小美'); assert.equal(fin[0].rank, 1); assert.ok(fin[0].print);
  assert.equal(g.board[0].name, '小美');
});

test('点赞冲刺、评论运气、关注金钥匙', () => {
  const { g, at } = game();
  g.event('join', 'A', '');
  g.event('like', 'A', '');
  assert.ok(g.runners.get('A').dashUntil > at());
  const c = g.event('comment', 'A', '', { text: '冲冲冲' });
  assert.match(c.receipt, /运气/); assert.ok(g.runners.get('A').luckUntil > at());
  const f = g.event('follow', 'A', '');
  assert.ok(f.gold && f.banner && f.say); assert.ok(g.runners.get('A').gold);
  assert.deepEqual(g.event('follow', 'A', ''), {}); // 重复关注不重复播报
  const o = g.event('join', '老粉', '', { gold: true });
  assert.match(o.receipt, /金钥匙/); assert.ok(g.runners.get('老粉').gold);
  // 只点赞没进场的人也能直接加入
  g.event('like', '路人', ''); assert.ok(g.runners.has('路人'));
});

test('金钥匙比普通人平均更快通关', () => {
  const { g, step } = game();
  for (let i = 0; i < 10; i++) g.event('join', 'p' + i, '');
  g.event('follow', 'p0', '');
  step(85000);
  const fin = g.takeAlerts().filter(a => a.kind === 'finish');
  const gold = fin.find(a => a.name === 'p0');
  assert.ok(gold); assert.ok(gold.rank <= 2, 'gold rank ' + gold.rank);
});

test('人满排队，局间结算后下一局带上排队的人', () => {
  const { g, step } = game({ maxRunners: 3 });
  for (const n of ['a', 'b', 'c']) g.event('join', n, '');
  const q = g.event('join', 'd', '');
  assert.match(q.receipt, /第 1 位/); assert.equal(g.waiting.length, 1);
  step(MAZE.roundMs + 100);
  const end = g.takeAlerts().find(a => a.kind === 'roundEnd');
  assert.ok(end); assert.ok(g.inBreak());
  step(MAZE.breakMs + 200);
  assert.equal(g.round, 2); assert.ok(g.runners.has('d')); assert.equal(g.runners.size, 3);
});

test('长时间不互动的人下一局不再自动带上', () => {
  const { g, step } = game({ idleMs: 1000 });
  g.event('join', '挂机', '');
  step(MAZE.roundMs + MAZE.breakMs + 500);
  assert.equal(g.runners.has('挂机'), false);
});

test('need 提示 / 时间格式 / 画面坐标', () => {
  const { g } = game();
  assert.equal(g.need().key, 'empty');
  g.event('join', 'x', ''); assert.equal(g.need().key, 'key');
  assert.equal(fmtSec(12340), '12.3秒');
  const c = cellCenter(0, 0); assert.ok(c.x > 0 && c.y >= 150);
  const last = cellCenter(8, 10); assert.ok(last.y < 1480 && last.x < 1080);
  const p = runnerPos({ name: 'x', px: 0, py: 0, x: 1, y: 0, prog: .5, done: false });
  assert.ok(p.x > c.x - 30 && p.x < cellCenter(1, 0).x + 30);
});

test('迷宫接入：玩法轮换、打印页、直播页', () => {
  assert.ok(MODES.maze); assert.equal(ORDER[1], 'maze');
  const s = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.ok(s.includes("if(gameMode==='maze'&&mazeEvent(type,name,avatar,v))return;"));
  assert.ok(s.includes("if(gameMode==='maze'){mazeFrame(now-last);last=now;return}"));
  assert.ok(s.includes("gameMode==='maze'?mazeCanvas"));
  assert.ok(s.includes("'🏃迷宫款'"));
  const l = fs.readFileSync(new URL('./live.html', import.meta.url), 'utf8');
  assert.ok(l.includes('body[data-mode=maze] #rules'));
});

test('关注：返回 print，横幅讲清金钥匙 + 金色头像', () => {
  let t = 0; const g = new MazeGame({ now: () => t, rand: seeded(3) });
  g.event('join', 'A', '');
  const r = g.event('follow', 'A', '');
  assert.equal(r.print, true); assert.match(r.banner, /金钥匙/); assert.match(r.banner, /金色大头像/);
  const q = g.event('follow', 'B', '');
  assert.equal(q.print, true);
});

test('死胡同点名邀请：每人每局最多一次，金钥匙不邀请', () => {
  let t = 0; const g = new MazeGame({ now: () => t, rand: seeded(5), baseSmart: 0, inviteGapMs: 0 });
  for (const n of ['A', 'B', 'C']) g.event('join', n, '');
  g.event('follow', 'C', '');
  const stuck = [];
  for (let i = 0; i < 600; i++) { t += 100; g.tick(100); for (const a of g.takeAlerts()) if (a.kind === 'stuck') stuck.push(a.name); }
  assert.ok(stuck.length >= 1);
  assert.ok(!stuck.includes('C'));
  assert.equal(new Set(stuck).size, stuck.length);
});

test('局末统计：金钥匙 vs 普通平均用时', () => {
  let t = 0; const g = new MazeGame({ now: () => t, rand: seeded(9) });
  for (const n of ['A', 'B', 'C', 'D']) g.event('join', n, '');
  g.event('follow', 'A', '');
  let end = null;
  for (let i = 0; i < 1000 && !end; i++) { t += 100; g.tick(100); for (const a of g.takeAlerts()) if (a.kind === 'roundEnd') end = a; }
  assert.ok(end && end.stats);
  assert.equal(end.stats.gold, 1);
  assert.ok(end.stats.goldAvg > 0);
});

test('画面常驻规则条 + 飘过横幅 + 打印机联动', async () => {
  const fs = await import('node:fs');
  const v = fs.readFileSync(new URL('./maze-view.mjs', import.meta.url), 'utf8');
  assert.match(v, /RULE_LINE/); assert.match(v, /MARQUEE_TEXT/); assert.match(v, /卡住了？点关注直接开门/);
  const h = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(h, /r\.print&&type==='follow'/);
  assert.match(h, /al\.kind==='stuck'/);
});
