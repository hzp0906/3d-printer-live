import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FishingGame, rollCatch, SIT_RE, REEL_RE, LEAVE_RE, fmtJin, CATCHES } from './fishing.mjs';
import { spotPos } from './fishing-view.mjs';
import { FanBook } from './fan-book.mjs';
import { MODES, ORDER } from './game-modes.mjs';

function game(opts = {}) {
  let t = 1000; const clock = { t: () => t, add: ms => { t += ms; } };
  let seed = 1; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return { g: new FishingGame(opts, clock.t, rand), clock };
}

test('指令识别：选+编号 / 6 收杆 / 离开', () => {
  assert.equal('选3'.match(SIT_RE)[1], '3');
  assert.equal(' 坐 12 号 '.match(SIT_RE)[1], '12');
  assert.ok(!SIT_RE.test('选我选我'));
  for (const s of ['6', '666', '收杆', '拉！']) assert.ok(REEL_RE.test(s), s);
  assert.ok(!REEL_RE.test('66块钱'));
  assert.ok(LEAVE_RE.test('离开'));
  assert.equal(fmtJin(3.5), '3.5斤');
  assert.equal(fmtJin(2), '2斤');
});

test('点赞入座，选编号换座，满座时提示', () => {
  const { g } = game({ spots: 4 });
  const r = g.event('like', '小明', 'a.png', { count: 1 });
  assert.match(r.receipt, /坐上 \d 号钓位/);
  const spot = g.get('小明').spot;
  const target = spot === 1 ? 2 : 1;
  assert.match(g.event('comment', '小明', '', { text: '选' + target }).receipt, /换到/);
  assert.equal(g.get('小明').spot, target);
  assert.match(g.event('comment', '小红', '', { text: '选' + target }).receipt, /有人了/); // 自动换到空位
  assert.notEqual(g.get('小红').spot, target);
  g.event('like', 'c', ''); g.event('like', 'd', '');
  assert.match(g.event('comment', 'e', '', { text: '选1' }).receipt, /满了/);
  assert.match(g.event('comment', 'e', '', { text: '选99' }).receipt, /1–4/);
  assert.match(g.event('comment', '小明', '', { text: '离开' }).receipt, /离开/);
  assert.equal(g.get('小明'), null);
});

test('上钩后评论 6 收杆有收获并进榜；没上钩收杆只提示；超时鱼跑了', () => {
  const { g, clock } = game();
  g.event('like', '阿钓', 'x.png');
  const a = g.get('阿钓');
  assert.match(g.event('comment', '阿钓', '', { text: '6' }).receipt, /还没上钩/);
  clock.add(20000); g.tick();
  assert.equal(a.phase, 'bite');
  assert.match(g.need().text, /阿钓/);
  const r = g.event('comment', '阿钓', '', { text: '666' });
  assert.ok(r.caught);
  assert.equal(a.phase, 'show');
  if (r.caught.weight) assert.equal(g.top(1)[0].name, '阿钓');
  clock.add(4000); g.tick(); assert.equal(a.phase, 'wait');
  clock.add(20000); g.tick(); assert.equal(a.phase, 'bite');
  clock.add(9000); assert.deepEqual(g.tick(), ['阿钓']); assert.equal(a.phase, 'miss');
});

test('点赞打窝让鱼提前上钩，上钩时点赞也算收杆', () => {
  const { g, clock } = game();
  g.event('like', 'p', '');
  const a = g.get('p'), before = a.biteAt;
  g.event('like', 'p', '', { count: 5 });
  assert.ok(a.biteAt < before);
  clock.add(20000); g.tick();
  assert.ok(g.event('like', 'p', '').caught);
});

test('关注升级鱼竿 + 幸运鱼饵，并返回要保存的数据；礼物加鱼饵', () => {
  const { g } = game();
  const r = g.event('follow', '粉丝', 'f.png');
  const a = g.get('粉丝');
  assert.equal(a.rodLv, 2); assert.equal(a.bait, 3); assert.ok(a.fan);
  assert.deepEqual(r.save, { lv: 2, best: 0 });
  assert.match(r.banner, /Lv2金鱼竿/);
  const gr = g.event('gift', '粉丝', '', { count: 2, raw: '小心心' });
  assert.equal(a.bait, 9); assert.match(gr.banner, /小心心/);
  // 下次进场带回保存的鱼竿
  const { g: g2 } = game();
  g2.event('like', '粉丝', '', { fan: true, saved: { lv: 4, best: 12 } });
  assert.equal(g2.get('粉丝').rodLv, 4);
  assert.equal(g2.get('粉丝').best, 12);
});

test('5 分钟不互动自动离座；新一轮清空榜单', () => {
  const { g, clock } = game();
  g.event('like', 'idle', '');
  clock.add(5 * 60000 + 1); g.tick();
  assert.equal(g.get('idle'), null);
  g.board.set('x', { name: 'x', count: 1, weight: 3, best: 3 });
  g.newRound(); assert.equal(g.top().length, 0);
});

test('rollCatch：鱼竿/鱼饵越好，稀有鱼越多', () => {
  let s = 7; const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const rare = luck => { let n = 0; for (let i = 0; i < 3000; i++) if (rollCatch(rand, luck).tier >= 3) n++; return n; };
  assert.ok(rare(0.7) > rare(0) * 2);
  for (const c of CATCHES) assert.ok(c.tier === 0 ? c.max === 0 : c.max > c.min);
});

test('钓位坐标：左岸 1–10、右岸 11–20，都在画面内', () => {
  for (let i = 1; i <= 20; i++) {
    const p = spotPos(i, 20);
    assert.ok(p.x > 0 && p.x < 1080 && p.y > 400 && p.y < 1600, String(i));
    assert.equal(p.side, i <= 10 ? 1 : -1);
  }
});

test('粉丝本只给关注过的人存鱼竿', () => {
  const store = new Map();
  const fb = new FanBook({ getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) });
  fb.visit('路人', ''); assert.equal(fb.saveRod('路人', { lv: 2, best: 1 }), false);
  fb.markFan('老粉', 'a.png');
  assert.equal(fb.saveRod('老粉', { lv: 3, best: 8.5 }), true);
  assert.deepEqual(fb.rodOf('老粉'), { lv: 3, best: 8.5 });
  fb.saveRod('老粉', { lv: 2, best: 20 }); // 等级不降，最大鱼取更大
  assert.deepEqual(fb.rodOf('老粉'), { lv: 3, best: 20 });
});

test('接入玩法轮换和直播页', () => {
  assert.ok(MODES.fishing); assert.ok(ORDER.includes('fishing'));
  const s = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.ok(s.includes("if(gameMode==='fishing'&&fishingEvent(type,name,avatar,v))return;"));
  assert.ok(s.includes("if(gameMode==='fishing'){last=now;fishingFrame();return}"));
  assert.ok(s.includes("gameMode==='fishing'?fishCanvas"));
  // 切换玩法时清掉上一个玩法排队中的语音，打印机里不会再播钓鱼的话
  assert.ok(s.includes('function applyMode(mode,announce=true){if(mode!==gameMode)giftSpeech.stop();'));
  const l = readFileSync(new URL('./live.html', import.meta.url), 'utf8');
  assert.ok(l.includes('body[data-mode=fishing] #rules'));
});

test('稀有大鱼：路人拉断线并提示关注；关注后立刻送大鱼且能拉上来', () => {
  const { g, clock } = game();
  g.event('like', '路人甲', '');
  const a = g.get('路人甲');
  clock.add(20000); g.tick();
  a.pending = { ...CATCHES.find(c => c.id === 'sturgeon'), weight: 20 };
  const r = g.event('comment', '路人甲', '', { text: '6' });
  assert.ok(r.snapped); assert.match(r.banner, /关注/); assert.equal(a.phase, 'snap');
  assert.equal(g.top().length, 0);
  clock.add(4000); g.tick(); assert.equal(a.phase, 'wait');
  const f = g.event('follow', '路人甲', '');
  assert.match(f.banner, /大鱼马上咬钩/);
  clock.add(2000); g.tick();
  assert.equal(a.phase, 'bite'); assert.ok(a.pending.tier >= 3);
  const c = g.event('comment', '路人甲', '', { text: '6' });
  assert.ok(c.caught && c.caught.tier >= 3);
  assert.equal(g.top(1)[0].name, '路人甲');
});

test('路人大鱼咬钩时给页面一条提醒', () => {
  const { g, clock } = game();
  g.event('like', '乙', '');
  const a = g.get('乙'); a.gift = { ...CATCHES.find(c => c.id === 'koiking'), weight: 40 };
  clock.add(20000); g.tick();
  const al = g.takeAlerts();
  assert.equal(al[0].kind, 'bigBite'); assert.equal(al[0].name, '乙');
  assert.equal(g.need().key, 'bigBite');
});

test('有人进场：显示新手引导 + 语音教玩法，人多时合并成一句，入座后引导消失', () => {
  const { g, clock } = game();
  const r = g.event('join', '新人A', 'a.png');
  assert.match(r.receipt, /点个赞就能坐下/);
  assert.match(r.say, /新人A.*点个赞.*评论六/);
  assert.equal(g.state().arrivals.length, 1);
  // 25 秒内再进来的人不单独念，攒到下一句
  assert.equal(g.event('join', '新人B', '').say, undefined);
  assert.equal(g.event('join', '新人C', '').say, undefined);
  clock.add(26000);
  assert.match(g.event('join', '新人D', '').say, /新人B、新人C、新人D/);
  // 点赞入座后不再出现在引导里
  g.event('like', '新人D', '');
  assert.ok(!g.state().arrivals.some(x => x.name === '新人D'));
  clock.add(10000); g.tick();
  assert.equal(g.state().arrivals.length, 0);
});
