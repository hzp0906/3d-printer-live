// 钓鱼大赛（第四个玩法）：河两岸 20 个钓位，观众点赞或评论「选+编号」入座，鱼上钩时评论「6」收杆。
// 点赞打窝让鱼更快上钩；关注升级鱼竿（永久保留）；礼物换幸运鱼饵。本轮按总斤数排「小时榜」。
// 这里只有纯逻辑（可单测），画面在 fishing-view.mjs。

export const FISHING = {
  spots: 20,               // 左岸 1–10，右岸 11–20
  biteMinMs: 7000,         // 下竿后多久上钩（随机，鱼竿等级越高越快）
  biteMaxMs: 18000,
  biteWindowMs: 8000,      // 「来了！」后多久不收杆鱼就跑了
  showMs: 3500,            // 收杆 / 跑鱼的展示时间
  idleMs: 5 * 60000,
  guideMs: 9000,           // 有人进场：画面中间显示「怎么玩」三步引导的时长
  guideVoiceMs: 25000,     // 进场语音引导最短间隔（人多时合并成一句）       // 5 分钟没互动自动离开钓位
  likeChumMs: 900,         // 每个赞让鱼提前多少毫秒上钩
  maxRodLv: 5,
};

// 鱼：tier 0 杂物 / 1 常见 / 2 少见 / 3 稀有 / 4 传说；重量单位：斤
export const CATCHES = [
  { id: 'shoe', label: '破拖鞋', emoji: '👟', tier: 0, min: 0, max: 0 },
  { id: 'can', label: '空罐头', emoji: '🥫', tier: 0, min: 0, max: 0 },
  { id: 'crucian', label: '小鲫鱼', emoji: '🐟', tier: 1, min: 0.3, max: 1.2 },
  { id: 'perch', label: '鲈鱼', emoji: '🐟', tier: 1, min: 0.8, max: 2.5 },
  { id: 'grass', label: '草鱼', emoji: '🐠', tier: 1, min: 1.5, max: 4 },
  { id: 'carp', label: '大鲤鱼', emoji: '🐠', tier: 2, min: 3, max: 8 },
  { id: 'snakehead', label: '黑鱼', emoji: '🐡', tier: 2, min: 3, max: 9 },
  { id: 'arowana', label: '金龙鱼', emoji: '🐉', tier: 3, min: 10, max: 25 },
  { id: 'sturgeon', label: '大鲟鱼', emoji: '🦈', tier: 3, min: 15, max: 35 },
  { id: 'koiking', label: '锦鲤王', emoji: '🎏', tier: 4, min: 30, max: 66 },
];
export const TIER_NAME = ['杂物', '常见', '少见', '稀有', '传说'];

// 抽一条：luck 0~1（鱼竿等级、幸运鱼饵叠加）
export function rollCatch(rand = Math.random, luck = 0) {
  const w = [0.06 * (1 - luck), 0.58 - luck * 0.35, 0.26 + luck * 0.1, 0.08 + luck * 0.18, 0.02 + luck * 0.07];
  let r = rand() * w.reduce((a, b) => a + b, 0), tier = 0;
  for (; tier < w.length - 1; tier++) { r -= w[tier]; if (r < 0) break; }
  const pool = CATCHES.filter(c => c.tier === tier);
  const c = pool[Math.floor(rand() * pool.length) % pool.length];
  const weight = c.max ? Math.round((c.min + rand() * (c.max - c.min)) * (1 + luck * 0.3) * 100) / 100 : 0;
  return { ...c, weight };
}

// 一定是大鱼（稀有 / 传说），关注福利用
export function rollBig(rand = Math.random) {
  for (let i = 0; i < 20; i++) { const c = rollCatch(rand, 1); if (c.tier >= 3) return c; }
  const c = CATCHES.find(x => x.id === 'arowana'); return { ...c, weight: c.min };
}

export const SIT_RE = /^\s*(?:选|坐|钓位)\s*(\d{1,2})\s*号?\s*$/;
export const REEL_RE = /^\s*(?:6+|收杆|收|拉|拉杆|起竿|起)\s*[!！]*\s*$/;
export const LEAVE_RE = /^\s*(?:离开|不钓了|下线)\s*$/;

const short = (n, k = 8) => String(n || '').replace(/[<>\n\r]/g, '').slice(0, k);
export const fmtJin = w => (Math.round(w * 100) / 100).toFixed(2).replace(/\.?0+$/, '') + '斤';

export class FishingGame {
  constructor(opts = {}, now = () => Date.now(), rand = Math.random) {
    this.opts = { ...FISHING, ...opts }; this.now = now; this.rand = rand;
    this.seats = new Array(this.opts.spots + 1).fill(null); // 1..spots
    this.anglers = new Map(); // name -> angler
    this.board = new Map();   // 本轮成绩 name -> {name,avatar,count,weight,best}
    this.feed = [];           // 最近收获 {name,label,emoji,weight,tier,at}
    this.fx = [];             // {kind,name,at}
    this.bubbles = [];        // {name,text,at}
    this.roundAt = now();
    this.alerts = [];         // 给页面播报：大鱼咬钩（路人拉不动）等
    this.arrivals = [];       // 最近进场还没入座的人 {name,avatar,at}，画面上显示新手引导
    this.guideVoiceAt = -Infinity; this.guideNames = [];
  }
  takeAlerts() { const a = this.alerts; this.alerts = []; return a; }
  luckOf(a) { return Math.min(1, (a.rodLv - 1) * 0.08 + (a.bait > 0 ? 0.35 : 0)); }
  static saveOf(a) { return { lv: a.rodLv, best: a.best || 0 }; }
  get(name) { return this.anglers.get(name) || null; }
  freeSpots() { const out = []; for (let i = 1; i <= this.opts.spots; i++) if (!this.seats[i]) out.push(i); return out; }
  waitMs(a) {
    const o = this.opts, k = 1 - (a.rodLv - 1) * 0.1;
    return (o.biteMinMs + this.rand() * (o.biteMaxMs - o.biteMinMs)) * k * (a.bait > 0 ? 0.6 : 1);
  }
  // 入座：spot 为空则随机找空位；返回 {a, moved, full}
  sit(name, avatar, spot = null, { fan = false, saved = null } = {}) {
    const t = this.now();
    let a = this.anglers.get(name);
    if (spot != null && (spot < 1 || spot > this.opts.spots)) return { bad: true };
    if (a) {
      if (avatar) a.avatar = avatar; if (fan) a.fan = true; a.touch = t;
      if (spot == null || spot === a.spot) return { a };
      if (this.seats[spot]) return { a, taken: true };
      this.seats[a.spot] = null; a.spot = spot; this.seats[spot] = name; return { a, moved: true };
    }
    if (spot != null && this.seats[spot]) {
      const free = this.freeSpots(); if (!free.length) return { full: true };
      spot = free[Math.floor(this.rand() * free.length)];
    }
    if (spot == null) {
      const free = this.freeSpots();
      if (!free.length) { if (!this.kickIdle(60000)) return { full: true }; return this.sit(name, avatar, null, { fan, saved }); }
      spot = free[Math.floor(this.rand() * free.length)];
    }
    const rodLv = Math.max(1, Math.min(this.opts.maxRodLv, Number(saved && saved.lv) || 1));
    a = { name, avatar, fan, spot, rodLv, best: Number(saved && saved.best) || 0, bait: 0, phase: 'wait', phaseAt: t, biteAt: 0, catch: null, touch: t, sat: t };
    a.biteAt = t + this.waitMs(a);
    this.anglers.set(name, a); this.seats[spot] = name;
    this.arrivals = this.arrivals.filter(x => x.name !== name);
    this.fx.push({ kind: 'sit', name, at: t });
    return { a, fresh: true };
  }
  leave(name) { const a = this.anglers.get(name); if (!a) return false; this.seats[a.spot] = null; this.anglers.delete(name); return true; }
  // 钓位满时请走最久没互动的路人（至少闲了 minIdle）
  kickIdle(minIdle) {
    const t = this.now();
    const c = [...this.anglers.values()].filter(a => t - a.touch >= minIdle).sort((x, y) => (x.fan - y.fan) || x.touch - y.touch)[0];
    return c ? this.leave(c.name) : false;
  }
  // 收杆：只有「来了！」时才有收获
  reel(a) {
    const t = this.now();
    if (a.phase !== 'bite') return null;
    const c = a.pending || rollCatch(this.rand, this.luckOf(a));
    const baited = a.bait > 0; if (baited) a.bait--;
    a.pending = null;
    // 稀有以上只有金鱼竿（关注过）拉得上来，普通竿会断线——这是引导关注的核心
    if (c.tier >= 3 && !a.fan && !baited) {
      a.phase = 'snap'; a.phaseAt = t; a.catch = c; a.snaps = (a.snaps || 0) + 1;
      this.fx.push({ kind: 'snap', name: a.name, at: t });
      return { ...c, snapped: true };
    }
    a.phase = 'show'; a.phaseAt = t; a.catch = c;
    const b = this.board.get(a.name) || { name: a.name, avatar: a.avatar, count: 0, weight: 0, best: 0 };
    if (a.avatar) b.avatar = a.avatar;
    if (c.weight > 0) { b.count++; b.weight = Math.round((b.weight + c.weight) * 100) / 100; b.best = Math.max(b.best, c.weight); }
    this.board.set(a.name, b);
    const record = c.weight > (a.best || 0); if (record) a.best = c.weight;
    this.feed.unshift({ name: a.name, label: c.label, emoji: c.emoji, weight: c.weight, tier: c.tier, at: t });
    if (this.feed.length > 6) this.feed.length = 6;
    this.fx.push({ kind: c.tier >= 3 ? 'big' : 'catch', name: a.name, at: t });
    return { ...c, record };
  }
  top(k = 3) { return [...this.board.values()].filter(b => b.count).sort((a, b) => b.weight - a.weight || b.count - a.count).slice(0, k); }
  rankOf(name) { const i = this.top(999).findIndex(b => b.name === name); return i < 0 ? 0 : i + 1; }
  newRound() { this.board.clear(); this.feed = []; this.roundAt = this.now(); }

  // 观众事件 → {receipt?, banner?, say?, gold?, save?, caught?}
  event(type, name, avatar, v = {}) {
    const who = short(name, 10), out = {};
    if (!name || name === '直播观众') return out;
    const opts = { fan: !!v.fan, saved: v.saved };
    if (type === 'join') {
      const a = this.anglers.get(name);
      if (a) { a.touch = this.now(); return out; }
      const t = this.now();
      this.arrivals = this.arrivals.filter(x => x.name !== name && t - x.at < this.opts.guideMs);
      this.arrivals.push({ name, avatar, at: t }); if (this.arrivals.length > 4) this.arrivals.shift();
      out.receipt = `🎣 欢迎 ${who} · 点个赞就能坐下钓鱼`;
      // 语音：间隔内进来的人攒着，下一句一起念，避免人多时刷屏
      if (!this.guideNames.includes(who)) this.guideNames.push(who);
      if (t - this.guideVoiceAt >= this.opts.guideVoiceMs) {
        const names = this.guideNames.slice(0, 3).join('、') + (this.guideNames.length > 3 ? `等${this.guideNames.length}位朋友` : '');
        out.say = `欢迎${names}来钓鱼！点个赞就能坐下，看到来了两个字，评论六就能收杆！`;
        this.guideVoiceAt = t; this.guideNames = [];
      }
      return out;
    }
    if (type === 'like') {
      const n = Math.max(1, Math.min(100, Math.floor(Number(v.count) || 1)));
      const r = this.sit(name, avatar, null, opts);
      if (r.full) return out;
      const a = r.a;
      if (r.fresh) out.receipt = `🎣 ${who} 坐上 ${a.spot} 号钓位 · 鱼上钩时评论「6」收杆`;
      if (a.phase === 'bite') return this.reelOut(a, out);
      if (a.phase === 'wait') a.biteAt = Math.max(this.now() + 500, a.biteAt - n * this.opts.likeChumMs);
      out.likes = n;
      return out;
    }
    if (type === 'comment') {
      const text = String(v.text || '').trim();
      let m;
      if (LEAVE_RE.test(text)) { if (this.leave(name)) out.receipt = `👋 ${who} 收竿离开 · 钓位空出来啦`; return out; }
      if ((m = text.match(SIT_RE))) {
        const r = this.sit(name, avatar, Number(m[1]), opts);
        if (r.bad) out.receipt = `🎣 钓位是 1–${this.opts.spots} 号哦`;
        else if (r.full) out.receipt = `🎣 钓位满了 · 等有人离开再来`;
        else if (r.taken) out.receipt = `🎣 ${m[1]} 号有人了 · 你还在 ${r.a.spot} 号`;
        else if (r.moved) out.receipt = `🎣 ${who} 换到 ${r.a.spot} 号钓位`;
        else if (r.fresh) out.receipt = `🎣 ${who} 坐上 ${r.a.spot} 号钓位${r.a.spot !== Number(m[1]) ? '（' + m[1] + ' 号有人了）' : ''} · 鱼上钩时评论「6」收杆`;
        return out;
      }
      const reel = REEL_RE.test(text);
      const r = this.sit(name, avatar, null, opts);
      if (r.full) { out.receipt = `🎣 钓位满了 · 等有人离开再来`; return out; }
      const a = r.a;
      if (reel && a.phase === 'bite') return this.reelOut(a, out);
      if (r.fresh) out.receipt = `🎣 ${who} 坐上 ${a.spot} 号钓位 · 鱼上钩时评论「6」收杆`;
      else if (reel && a.phase === 'wait') out.receipt = `🎣 ${who} 还没上钩 · 看到「来了！」再收杆`;
      if (!reel && text) { this.bubbles.push({ name, text: text.slice(0, 16), at: this.now() }); if (this.bubbles.length > 8) this.bubbles.shift(); }
      return out;
    }
    if (type === 'follow') {
      const r = this.sit(name, avatar, null, { ...opts, fan: true });
      const a = r.a;
      if (!a) { out.banner = `⭐ ${who} 关注了\n钓位满了，鱼竿升级先给你记着`; out.gold = true; return out; }
      a.fan = true;
      const up = a.rodLv < this.opts.maxRodLv; if (up) a.rodLv++;
      a.bait += 3;
      // 关注福利：马上咬钩一条大鱼（正在上钩的大鱼也能直接拉了）
      if (a.phase === 'bite') { if (!a.pending || a.pending.tier < 3) a.pending = rollBig(this.rand); a.phaseAt = this.now(); }
      else { a.phase = 'wait'; a.catch = null; a.biteAt = this.now() + 1500; a.gift = rollBig(this.rand); }
      this.fx.push({ kind: 'gold', name, at: this.now() });
      out.banner = `⭐ ${who} 关注了 · 换上${up ? ' Lv' + a.rodLv : '满级'}金鱼竿\n关注福利：大鱼马上咬钩！`;
      out.say = `谢谢${who}的关注！金鱼竿到手，关注福利大鱼马上咬钩，评论六拉上来！`;
      out.gold = true; out.save = FishingGame.saveOf(a);
      return out;
    }
    if (type === 'gift') {
      const count = Math.max(1, Math.min(100, Math.floor(Number(v.count) || 1)));
      const r = this.sit(name, avatar, null, opts);
      const a = r.a; if (!a) return out;
      a.bait += Math.min(30, count * 3);
      if (a.phase === 'wait') a.biteAt = this.now() + 1200;
      this.fx.push({ kind: 'gift', name, at: this.now() });
      const g = short(v.raw || v.gift || '礼物', 8);
      out.banner = `🎁 感谢 ${who} 送出 ${g}\n换上 ${a.bait} 次幸运鱼饵 · 大鱼更容易上钩`;
      out.say = `谢谢${who}的${g}！幸运鱼饵挂上了，大鱼马上来！`;
      out.gold = true;
      if (a.fan) out.save = FishingGame.saveOf(a);
      return out;
    }
    return out;
  }
  reelOut(a, out) {
    const c = this.reel(a); if (!c) return out;
    const who = short(a.name, 10);
    if (c.snapped) {
      out.receipt = `💔 ${who} 的${c.label}（${fmtJin(c.weight)}）把线拉断了 · 点关注换金鱼竿`;
      out.banner = `💔 ${c.label} ${fmtJin(c.weight)} 拉断了线！\n${who} 点个关注 · 金鱼竿稳稳拉上来`;
      out.say = `可惜！${who}的${c.label}把线拉断了！点个关注换金鱼竿，大鱼就跑不掉啦！`;
      out.snapped = c;
      return out;
    }
    out.caught = c;
    if (c.tier === 0) out.receipt = `😂 ${who} 钓上来一只${c.label}`;
    else out.receipt = `${c.emoji} ${who} 钓到 ${c.label} ${fmtJin(c.weight)}` + (this.rankOf(a.name) ? ` · 本轮第 ${this.rankOf(a.name)}` : '');
    if (c.tier >= 3) {
      out.banner = `${c.emoji} ${TIER_NAME[c.tier]}！${who} 钓到 ${c.label}\n${fmtJin(c.weight)}`;
      out.say = `哇！${who}钓到了一条${fmtJin(c.weight)}的${c.label}！`;
      out.gold = true;
    }
    if (a.fan && c.record) out.save = FishingGame.saveOf(a);
    return out;
  }

  // 推进：上钩、跑鱼、展示结束、闲置离开。返回本次跑掉的人名（可用于提示）。
  tick() {
    const t = this.now(), o = this.opts, missed = [];
    for (const a of [...this.anglers.values()]) {
      if (t - a.touch > o.idleMs) { this.leave(a.name); continue; }
      if (a.phase === 'wait' && t >= a.biteAt) {
        a.phase = 'bite'; a.phaseAt = t; this.fx.push({ kind: 'bite', name: a.name, at: t });
        a.pending = a.gift || rollCatch(this.rand, this.luckOf(a)); a.gift = null;
        if (a.pending.tier >= 3 && !a.fan && !(a.bait > 0)) this.alerts.push({ kind: 'bigBite', name: a.name, fish: a.pending });
      }
      else if (a.phase === 'bite' && t - a.phaseAt > o.biteWindowMs) { a.phase = 'miss'; a.phaseAt = t; a.catch = a.pending; a.pending = null; missed.push(a.name); }
      else if ((a.phase === 'show' || a.phase === 'miss' || a.phase === 'snap') && t - a.phaseAt > o.showMs) { a.phase = 'wait'; a.phaseAt = t; a.catch = null; a.biteAt = t + this.waitMs(a); }
    }
    this.fx = this.fx.filter(x => t - x.at < 3000);
    this.bubbles = this.bubbles.filter(x => t - x.at < 6000);
    this.arrivals = this.arrivals.filter(x => t - x.at < o.guideMs);
    return missed;
  }
  state() {
    return { arrivals: this.arrivals, anglers: [...this.anglers.values()], top: this.top(3), feed: this.feed, fx: this.fx, bubbles: this.bubbles, spots: this.opts.spots, count: this.anglers.size, now: this.now() };
  }
  need() {
    const biting = [...this.anglers.values()].filter(a => a.phase === 'bite');
    const big = biting.find(a => !a.fan && !(a.bait > 0) && a.pending && a.pending.tier >= 3);
    if (big) return { key: 'bigBite', text: `🦈 ${short(big.name, 8)} 钓到大家伙了！普通竿拉不动 · 点关注换金鱼竿`, voice: `${short(big.name, 10)}，大鱼咬钩了！普通鱼竿拉不动，点个关注换金鱼竿，再评论六！` };
    if (biting.length) return { key: 'bite', text: `❗ ${short(biting[0].name, 8)} 的鱼上钩了 · 快评论「6」收杆`, voice: `${short(biting[0].name, 10)}，你的鱼上钩啦，快评论六收杆！` };
    if (!this.anglers.size) return { key: 'empty', text: '🎣 钓位全空 · 点赞或评论「选+编号」来钓鱼', voice: '钓位都空着呢，点个赞或者评论选加编号，就能坐下来钓鱼！' };
    return { key: 'play', text: '⭐ 稀有大鱼只有金鱼竿拉得上 · 点关注马上换', voice: '稀有大鱼只有金鱼竿才拉得上来！点个关注马上换金鱼竿，还送一条大鱼咬钩！' };
  }
}
