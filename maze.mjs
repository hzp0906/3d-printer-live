// 头像迷宫（第五个玩法）：进场的观众头像自动从入口出发找出口，不用任何操作。
// 点赞＝冲刺几步；评论任意内容＝运气 +1（岔路更容易选对）；关注＝金钥匙（头像变金，直接走近路）；礼物＝冲刺 + 运气。
// 每局 90 秒、换一张新迷宫；同时最多 20 个头像，其余在入口排队下一局出发。走出去的人上「今日通关榜」。
// 这里只有纯逻辑（可单测），画面在 maze-view.mjs。

export const MAZE = {
  cols: 9, rows: 11,
  roundMs: 90000,       // 一局时长
  breakMs: 6000,        // 两局之间展示结果的时间
  maxRunners: 20,
  speed: 2,             // 每秒走几格（模拟：单人通关中位数约 31 秒）
  dashMs: 3000, dashMul: 2.2,
  luckMs: 25000,        // 评论后运气持续时间
  baseSmart: 0.65,      // 岔路选对概率
  luckSmart: 0.85,
  idleMs: 3 * 60000,    // 只进场、3 分钟没互动的人，下一局不再自动带上
  guideMs: 9000,
  inviteGapMs: 8000,    // 死胡同点名邀请：全场最少间隔
  printTop: 3,          // 每局前 3 名送一张打印头像
};

const short = (s, n) => [...String(s || '')].slice(0, n).join('');

// 可复现的伪随机（同一个种子＝同一张迷宫，方便测试）
export function seeded(seed) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// 生成完美迷宫（任意两格之间只有一条路）：walls[y][x] = {n,e,s,w}，true 表示有墙
export function makeMaze(cols, rows, rand = Math.random) {
  const walls = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ n: true, e: true, s: true, w: true })));
  const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
  const stack = [[0, 0]]; seen[0][0] = true;
  const dirs = [['n', 0, -1, 's'], ['e', 1, 0, 'w'], ['s', 0, 1, 'n'], ['w', -1, 0, 'e']];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const opts = dirs.filter(([, dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[ny][nx]; });
    if (!opts.length) { stack.pop(); continue; }
    const [d, dx, dy, back] = opts[Math.floor(rand() * opts.length) % opts.length];
    const nx = x + dx, ny = y + dy;
    walls[y][x][d] = false; walls[ny][nx][back] = false; seen[ny][nx] = true; stack.push([nx, ny]);
  }
  // 打通 3 堵墙做「近路」：金钥匙的人可以走，普通人当它不存在
  const shortcuts = [];
  for (let tries = 0; shortcuts.length < 3 && tries < 200; tries++) {
    const x = 1 + Math.floor(rand() * (cols - 2)), y = 1 + Math.floor(rand() * (rows - 2));
    const d = rand() < .5 ? 'e' : 's';
    if (!walls[y][x][d]) continue;
    if (shortcuts.some(s => s.x === x && s.y === y)) continue;
    shortcuts.push({ x, y, d });
  }
  return { cols, rows, walls, shortcuts, start: { x: 0, y: 0 }, exit: { x: cols - 1, y: rows - 1 } };
}

const STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const BACK = { n: 's', e: 'w', s: 'n', w: 'e' };
function isShortcut(maze, x, y, d) {
  return maze.shortcuts.some(s => (s.x === x && s.y === y && s.d === d) || (s.x + STEP[s.d][0] === x && s.y + STEP[s.d][1] === y && BACK[s.d] === d));
}
export function neighbors(maze, x, y, gold = false) {
  const out = [];
  for (const d of ['n', 'e', 's', 'w']) {
    const open = !maze.walls[y][x][d] || (gold && isShortcut(maze, x, y, d));
    if (open) out.push({ x: x + STEP[d][0], y: y + STEP[d][1] });
  }
  return out;
}
// 到出口的步数表（BFS），用来判断哪个方向是「对的路」
export function distMap(maze, gold = false) {
  const { cols, rows, exit } = maze;
  const dist = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
  dist[exit.y][exit.x] = 0; const q = [exit];
  while (q.length) { const c = q.shift(); for (const n of neighbors(maze, c.x, c.y, gold)) if (dist[n.y][n.x] === Infinity) { dist[n.y][n.x] = dist[c.y][c.x] + 1; q.push(n); } }
  return dist;
}

export const fmtSec = ms => (Math.round(ms / 100) / 10).toFixed(1) + '秒';

export class MazeGame {
  constructor(opts = {}) {
    this.opts = { ...MAZE, ...opts };
    this.rand = opts.rand || Math.random; this.now = opts.now || (() => Date.now());
    this.runners = new Map(); this.waiting = []; this.board = []; this.best = new Map();
    this.alerts = []; this.arrivals = []; this.feed = []; this.fx = []; this.round = 0; this.roundResults = [];
    this.newRound();
  }
  newRound() {
    const t = this.now();
    this.round++; this.seed = Math.floor(this.rand() * 1e9);
    this.maze = makeMaze(this.opts.cols, this.opts.rows, seeded(this.seed));
    this.dist = distMap(this.maze); this.goldDist = distMap(this.maze, true);
    this.startedAt = t; this.endsAt = t + this.opts.roundMs; this.breakUntil = 0; this.finishedCount = 0; this.roundResults = [];
    // 先让排队的人出发（等过一局了），再把上一局还在活跃的人带进来，坐不下的继续排队
    const keep = [...this.runners.values()].filter(r => t - r.lastActive < this.opts.idleMs);
    this.runners.clear();
    const queued = this.waiting; this.waiting = [];
    for (const w of queued) this.enter(w.name, w.avatar, { gold: w.gold });
    for (const r of keep) {
      if (this.runners.has(r.name)) continue;
      if (this.runners.size < this.opts.maxRunners) this.place(r.name, r.avatar, { gold: r.gold, lastActive: r.lastActive });
      else this.waiting.push({ name: r.name, avatar: r.avatar, gold: r.gold });
    }
  }
  place(name, avatar, { gold = false, lastActive = this.now() } = {}) {
    const t = this.now(), s = this.maze.start;
    const r = { name, avatar, gold, x: s.x, y: s.y, px: s.x, py: s.y, from: null, prog: 0, path: [], visited: new Set([s.x + ',' + s.y]), dashUntil: 0, luckUntil: 0, startAt: t, lastActive, done: false, doneAt: 0, rank: 0, joinedAt: t };
    this.runners.set(name, r); return r;
  }
  enter(name, avatar, { gold = false } = {}) {
    if (!name) return { bad: true };
    const r = this.runners.get(name);
    if (r) { if (avatar && !r.avatar) r.avatar = avatar; r.lastActive = this.now(); return { r }; }
    if (this.inBreak() || this.runners.size >= this.opts.maxRunners) {
      let w = this.waiting.find(x => x.name === name);
      if (!w) { w = { name, avatar, gold }; this.waiting.push(w); if (this.waiting.length > 60) this.waiting.shift(); }
      else if (gold) w.gold = true;
      return { queued: true, pos: this.waiting.indexOf(w) + 1 };
    }
    return { r: this.place(name, avatar, { gold }), fresh: true };
  }
  // 走进死胡同：没金钥匙的人，每局最多被点名邀请一次（全场至少隔 inviteGapMs）
  inviteStuck(r) {
    if (r.gold || r.invited) return;
    const t = this.now();
    if (t - (this.lastInviteAt || 0) < this.opts.inviteGapMs) return;
    r.invited = true; this.lastInviteAt = t;
    this.fx.push({ kind: 'stuck', name: r.name, at: t });
    this.alerts.push({ kind: 'stuck', name: r.name, avatar: r.avatar });
  }
  // 本局金钥匙 vs 普通的平均用时，让大家看到关注到底快多少
  roundStats() {
    const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y.ms, 0) / a.length) : 0;
    const g = this.roundResults.filter(r => r.gold), n = this.roundResults.filter(r => !r.gold);
    return { goldAvg: avg(g), normalAvg: avg(n), gold: g.length, normal: n.length };
  }
  inBreak() { return this.breakUntil > this.now(); }
  // 选下一格：走过的格子尽量不回头；岔路上按「聪明度」选靠近出口的方向
  chooseNext(r) {
    const dist = r.gold ? this.goldDist : this.dist;
    let opts = neighbors(this.maze, r.x, r.y, r.gold);
    const fresh = opts.filter(o => !r.visited.has(o.x + ',' + o.y));
    if (fresh.length) opts = fresh;
    else { // 死胡同：原路退回
      this.inviteStuck(r);
      const back = r.path.pop(); if (back) return { ...back, back: true };
      opts = opts.length ? opts : [{ x: r.x, y: r.y }];
    }
    const t = this.now();
    const smart = r.gold ? 1 : t < r.luckUntil ? this.opts.luckSmart : this.opts.baseSmart;
    const best = opts.reduce((a, b) => dist[b.y][b.x] < dist[a.y][a.x] ? b : a);
    return this.rand() < smart ? best : opts[Math.floor(this.rand() * opts.length) % opts.length];
  }
  tick(dtMs = 100) {
    const t = this.now();
    if (this.inBreak()) return;
    if (this.breakUntil && !this.inBreak()) { this.breakUntil = 0; this.newRound(); return; }
    if (t >= this.endsAt) { this.endRound(); return; }
    for (const r of this.runners.values()) {
      if (r.done) continue;
      const mul = t < r.dashUntil ? this.opts.dashMul : 1;
      r.prog += dtMs / 1000 * this.opts.speed * mul * (r.gold ? 1.25 : 1);
      while (r.prog >= 1 && !r.done) {
        r.prog -= 1;
        const n = this.chooseNext(r);
        if (!n.back) r.path.push({ x: r.x, y: r.y });
        r.px = r.x; r.py = r.y; r.x = n.x; r.y = n.y; r.visited.add(n.x + ',' + n.y);
        if (r.x === this.maze.exit.x && r.y === this.maze.exit.y) this.finish(r);
      }
    }
    this.fx = this.fx.filter(f => t - f.at < 2500);
    this.feed = this.feed.filter(f => t - f.at < 6000);
    this.arrivals = this.arrivals.filter(a => t - a.at < this.opts.guideMs && !this.runners.get(a.name)?.done);
  }
  finish(r) {
    const t = this.now();
    r.done = true; r.doneAt = t; r.prog = 0; r.px = r.x; r.py = r.y; r.rank = ++this.finishedCount;
    const ms = t - r.startAt, prev = this.best.get(r.name);
    const record = !prev || ms < prev;
    if (record) this.best.set(r.name, ms);
    this.board = [...this.best.entries()].map(([name, ms]) => ({ name, ms, avatar: this.runners.get(name)?.avatar || this.board.find(b => b.name === name)?.avatar || '' })).sort((a, b) => a.ms - b.ms).slice(0, 10);
    const res = { name: r.name, avatar: r.avatar, ms, rank: r.rank, gold: r.gold, record };
    this.roundResults.push(res);
    this.alerts.push({ kind: 'finish', ...res, print: r.rank <= this.opts.printTop });
    this.fx.push({ kind: 'finish', name: r.name, at: t });
  }
  endRound() {
    this.breakUntil = this.now() + this.opts.breakMs;
    const left = [...this.runners.values()].filter(r => !r.done).length;
    this.alerts.push({ kind: 'roundEnd', round: this.round, results: this.roundResults.slice(0, 3), left, stats: this.roundStats() });
  }
  takeAlerts() { const a = this.alerts; this.alerts = []; return a; }
  note(name, text) { this.feed.push({ name, text, at: this.now() }); if (this.feed.length > 8) this.feed.shift(); }
  // 直播事件 → 返回要显示的回执 / 横幅 / 播报
  event(type, name, avatar, v = {}) {
    const t = this.now(), nm = short(name, 10);
    // 老粉（关注过）进来就带金钥匙：关注一次，以后每局都有好处
    if (type === 'join') {
      const e = this.enter(name, avatar, { gold: !!v.gold });
      if (e.fresh) { this.arrivals.push({ name, avatar, at: t }); if (this.arrivals.length > 4) this.arrivals.shift(); return { receipt: e.r.gold ? `🔑 老粉 ${nm} 带着金钥匙进迷宫啦` : `🏃 ${nm} 进迷宫啦 · 点赞冲刺 · 关注拿金钥匙` }; }
      if (e.queued) return { receipt: `⏳ ${nm} 排在入口第 ${e.pos} 位 · 下一局出发` };
      return {};
    }
    const e = this.enter(name, avatar, { gold: type === 'follow' || !!v.gold });
    const r = e.r;
    if (r) r.lastActive = t;
    if (type === 'like') {
      if (!r) return e.queued ? { receipt: `⏳ ${nm} 下一局出发 · 第 ${e.pos} 位` } : {};
      if (r.done) return {};
      r.dashUntil = t + this.opts.dashMs; this.fx.push({ kind: 'dash', name, at: t });
      return e.fresh ? { receipt: `🏃 ${nm} 进迷宫啦 · 点赞冲刺中` } : {};
    }
    if (type === 'comment') {
      this.note(name, short(v.text || '', 12));
      if (!r) return e.queued ? { receipt: `⏳ ${nm} 下一局出发 · 第 ${e.pos} 位` } : {};
      if (r.done) return { receipt: `🏁 ${nm} 已经通关啦 · 等下一局再刷纪录` };
      r.luckUntil = t + this.opts.luckMs; this.fx.push({ kind: 'luck', name, at: t });
      return { receipt: `🍀 ${nm} 运气 +1 · 岔路更容易选对` };
    }
    if (type === 'follow') {
      const thanks = { banner: `⭐ 感谢 ${nm} 关注\n🔑 金钥匙开近路 · 金色大头像已排进打印`, gold: true, print: true, say: `谢谢${nm}的关注！金钥匙给你，金色头像也给你排上打印啦！` };
      if (!r) return { ...thanks, receipt: `🔑 ${nm} 拿到金钥匙 · 下一局开近路` };
      if (r.gold && !e.fresh) return {};
      r.gold = true; this.fx.push({ kind: 'key', name, at: t });
      return { ...thanks, receipt: `🔑 ${nm} 拿到金钥匙 · 金色头像排进打印` };
    }
    if (type === 'gift') {
      if (!r) return {};
      r.dashUntil = t + this.opts.dashMs * 2; r.luckUntil = t + this.opts.luckMs; this.fx.push({ kind: 'dash', name, at: t });
      return { receipt: `🎁 ${nm} 冲刺 + 运气 +1` };
    }
    return {};
  }
  need() {
    const running = [...this.runners.values()].filter(r => !r.done);
    if (!this.runners.size) return { key: 'empty', text: '🏃 迷宫空着 · 进来就自动出发，点赞冲刺', voice: '迷宫空着呢，进来就自动出发，点赞还能冲刺！' };
    const lost = running.find(r => !r.gold);
    if (lost) return { key: 'key', text: `🔑 ${short(lost.name, 8)} 迷路了？点关注＝金钥匙+金色打印头像`, voice: `迷路了吗？点个关注，金钥匙开近路，还送金色头像打印！` };
    return { key: 'luck', text: '🍀 评论任意内容 · 运气 +1，岔路更容易选对', voice: '随便评论一句，运气加一，岔路更容易选对！' };
  }
  state() {
    const t = this.now();
    return {
      maze: this.maze, runners: [...this.runners.values()], waiting: this.waiting.length, board: this.board.slice(0, 5),
      round: this.round, leftMs: Math.max(0, this.endsAt - t), inBreak: this.inBreak(), results: this.roundResults.slice(0, 3), stats: this.roundStats(),
      arrivals: this.arrivals, feed: this.feed, fx: this.fx, now: t,
    };
  }
}
