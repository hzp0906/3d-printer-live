// 互动鱼塘：每个进场的观众变成一条带头像的小鱼。点赞投喂、评论吐泡泡、关注升级并永久保留、送礼换品种。
// 这里只放纯逻辑（可单测）：鱼的数据、成长、游动、鱼食。画面在 pond-view.mjs。

export const POND = {
  maxFish: 70,            // 同屏最多鱼数，超出时先请走最久没互动的路人鱼
  sleepAfterMs: 5 * 60000, // 5 分钟没互动：沉到水底睡觉
  leaveAfterMs: 15 * 60000, // 15 分钟没互动：游走
  bounds: { x0: 70, x1: 1010, y0: 470, y1: 1470 }, // 鱼活动区域（1080×1920 画布坐标）
  surfaceY: 430,          // 水面，鱼食从这里落下
  maxFood: 90,
};

// 等级：累计经验门槛（Lv1..Lv10）。体型 Lv1=1 倍 → Lv10≈2.6 倍。
export const LEVEL_XP = [0, 5, 15, 30, 50, 80, 120, 170, 230, 300];
export const MAX_LV = LEVEL_XP.length;
export function levelOfXp(xp) {
  let lv = 1;
  for (let i = 0; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) lv = i + 1;
  return lv;
}
export const sizeOf = lv => 1 + (Math.max(1, Math.min(MAX_LV, lv)) - 1) * 0.18;

// 品种。tier 越高越稀有；普通礼物（不认识的）沿「锦鲤→海龟→鲨鱼→鲸鱼」逐级升级。
export const SPECIES = {
  fry: { id: 'fry', label: '小鱼苗', tier: 0 },
  goldfish: { id: 'goldfish', label: '金鱼', tier: 1 },
  puffer: { id: 'puffer', label: '河豚', tier: 1 },
  tropical: { id: 'tropical', label: '热带鱼', tier: 1 },
  koi: { id: 'koi', label: '锦鲤', tier: 2 },
  turtle: { id: 'turtle', label: '海龟', tier: 3 },
  shark: { id: 'shark', label: '鲨鱼', tier: 4 },
  whale: { id: 'whale', label: '鲸鱼', tier: 5 },
};
const LADDER = ['koi', 'turtle', 'shark', 'whale'];
export function giftSpecies(giftName = '', current = 'fry') {
  const g = String(giftName);
  if (/心/.test(g)) return 'goldfish';
  if (/啤酒|酒/.test(g)) return 'puffer';
  if (/棒棒糖|糖/.test(g)) return 'tropical';
  const i = LADDER.indexOf(current);
  return LADDER[Math.min(LADDER.length - 1, i + 1)];
}

// 评论「喂食 / 撒食 / 投喂」：全池撒一把鱼食
export const FEED_RE = /喂食|撒食|投喂|喂鱼|鱼食|饿/;

const short = (n, k = 8) => String(n || '').replace(/[<>\n\r]/g, '').slice(0, k);
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export class Pond {
  constructor(opts = {}, now = () => Date.now(), rand = Math.random) {
    this.opts = { ...POND, ...opts };
    this.now = now; this.rand = rand;
    this.fish = new Map();   // name -> fish
    this.food = [];          // {x,y,vy,owner,at}
    this.bubbles = [];       // 评论气泡 {name,text,at}
    this.fx = [];            // 特效 {kind,name,at}
    this.lastTick = now();
    this.stats = { joins: 0, likes: 0, comments: 0, gifts: 0, follows: 0 };
  }
  // 存档（关注过的人才保存）：{lv,xp,sp}
  static saveOf(f) { return { lv: f.lv, xp: Math.round(f.xp), sp: f.species }; }

  get(name) { return this.fish.get(name) || null; }
  count() { return this.fish.size; }

  // 新鱼或取回已有的鱼。saved = 粉丝本里保存的 {lv,xp,sp}
  spawn(name, avatar = '', { fan = false, saved = null } = {}) {
    if (!name || name === '直播观众') return null;
    let f = this.fish.get(name);
    const t = this.now();
    if (f) { if (avatar) f.avatar = avatar; if (fan) f.fan = true; f.touch = t; f.asleep = false; return f; }
    this.makeRoom();
    const b = this.opts.bounds, h = hash(name);
    const fromLeft = this.rand() < 0.5;
    const xp = saved && Number.isFinite(saved.xp) ? Math.max(0, saved.xp) : 0;
    f = {
      name, avatar, fan, xp, lv: levelOfXp(xp),
      species: saved && SPECIES[saved.sp] ? saved.sp : 'fry',
      hue: h % 360,
      x: fromLeft ? -60 : 1140, y: b.y0 + (h % 1000) / 1000 * (b.y1 - b.y0),
      vx: fromLeft ? 120 : -120, vy: 0, dir: fromLeft ? 1 : -1,
      tx: b.x0 + this.rand() * (b.x1 - b.x0), ty: b.y0 + this.rand() * (b.y1 - b.y0),
      born: t, touch: t, asleep: false, eat: 0, wiggle: (h % 100) / 100 * 6.28,
    };
    this.fish.set(name, f);
    return f;
  }
  makeRoom() {
    while (this.fish.size >= this.opts.maxFish) {
      const all = [...this.fish.values()];
      const pool = all.filter(f => !f.fan).length ? all.filter(f => !f.fan) : all;
      pool.sort((a, b) => a.touch - b.touch);
      this.fish.delete(pool[0].name);
    }
  }
  // 加经验，返回升级后的新等级（没升级返回 0）
  grow(f, xp) {
    const before = f.lv;
    f.xp = Math.min(LEVEL_XP[MAX_LV - 1] + 999, f.xp + xp);
    f.lv = levelOfXp(f.xp);
    return f.lv > before ? f.lv : 0;
  }
  dropFood(n, owner = '', x = null) {
    const t = this.now(), b = this.opts.bounds;
    for (let i = 0; i < n; i++) {
      const fx = x == null ? b.x0 + this.rand() * (b.x1 - b.x0) : Math.max(b.x0, Math.min(b.x1, x + (this.rand() - 0.5) * 160));
      this.food.push({ x: fx, y: this.opts.surfaceY, vy: 60 + this.rand() * 50, owner, at: t + i * 60 });
    }
    if (this.food.length > this.opts.maxFood) this.food.splice(0, this.food.length - this.opts.maxFood);
  }
  top(k = 3) {
    return [...this.fish.values()].sort((a, b) => b.xp - a.xp || SPECIES[b.species].tier - SPECIES[a.species].tier || a.born - b.born).slice(0, k);
  }
  rankOf(name) { const i = this.top(this.fish.size).findIndex(f => f.name === name); return i < 0 ? 0 : i + 1; }

  // 观众事件 → {receipt?, banner?, say?, gold?, levelUp?, save?}；save 不为空时页面应把它存进粉丝本
  event(type, name, avatar, v = {}) {
    const who = short(name, 10);
    const out = {};
    const named = name && name !== '直播观众';
    if (type === 'join') {
      this.stats.joins++;
      if (!named) return out;
      const had = this.fish.has(name);
      const f = this.spawn(name, avatar, { fan: !!v.fan, saved: v.saved });
      if (!f || had) return out;
      this.fx.push({ kind: 'enter', name, at: this.now() });
      if (f.fan && (f.lv > 1 || f.species !== 'fry')) {
        out.banner = `⭐ ${who} 的 Lv${f.lv} ${SPECIES[f.species].label} 回来了`;
        out.say = `欢迎${who}回来！你的${SPECIES[f.species].label}一直在等你！`;
        out.gold = true;
      } else {
        out.receipt = `🐟 ${who} 的小鱼游进来了 · 点赞喂它长大`;
      }
      return out;
    }
    if (!named && type !== 'like') return out;
    const f = named ? this.spawn(name, avatar, { fan: !!v.fan, saved: v.saved }) : null;
    if (type === 'like') {
      const n = Math.max(1, Math.min(100, Math.floor(Number(v.count) || 1)));
      this.stats.likes += n;
      const near = f ? f.x : null;
      this.dropFood(Math.min(6, Math.ceil(n / 3)), f ? name : '', near);
      if (f) { f.touch = this.now(); f.asleep = false; const up = this.grow(f, Math.min(10, n * 0.5)); if (up) out.levelUp = up; }
      out.likes = n;
    } else if (type === 'comment') {
      this.stats.comments++;
      f.touch = this.now(); f.asleep = false;
      const text = String(v.text || '').trim();
      if (FEED_RE.test(text)) {
        this.dropFood(14, '', null);
        const up = this.grow(f, 3); if (up) out.levelUp = up;
        out.receipt = `🍤 ${who} 撒了一把鱼食 · 全池开抢`;
      } else {
        const up = this.grow(f, 2); if (up) out.levelUp = up;
        if (text) { this.bubbles.push({ name, text: text.slice(0, 18), at: this.now() }); if (this.bubbles.length > 8) this.bubbles.shift(); }
      }
    } else if (type === 'follow') {
      this.stats.follows++;
      f.touch = this.now(); f.asleep = false;
      const first = !f.fan;
      f.fan = true;
      // 关注直接升一级
      const need = LEVEL_XP[Math.min(MAX_LV - 1, f.lv)] - f.xp;
      const up = this.grow(f, Math.max(need, 0) || 5);
      if (up) out.levelUp = up;
      this.fx.push({ kind: 'gold', name, at: this.now() });
      out.banner = `⭐ ${who} 关注了\n小鱼升到 Lv${f.lv} · 换上金边 · 下次来还是这条鱼`;
      out.say = first ? `谢谢${who}的关注！你的小鱼升级啦，下次来它还在！` : `谢谢${who}的关注！`;
      out.gold = true;
    } else if (type === 'gift') {
      this.stats.gifts++;
      const count = Math.max(1, Math.min(100, Math.floor(Number(v.count) || 1)));
      f.touch = this.now(); f.asleep = false;
      const raw = v.raw || v.gift || '礼物';
      const sp = giftSpecies(raw, f.species);
      const changed = sp !== f.species;
      f.species = sp;
      const up = this.grow(f, 10 * count); if (up) out.levelUp = up;
      this.fx.push({ kind: 'gift', name, at: this.now() });
      const gname = short(raw, 8);
      out.banner = `🎁 感谢 ${who} 送出 ${gname}\n` + (changed ? `小鱼变成了「${SPECIES[sp].label}」！` : `${SPECIES[sp].label}长大了！Lv${f.lv}`);
      out.say = `谢谢${who}的${gname}！` + (changed ? `你的鱼变成${SPECIES[sp].label}啦！` : `你的${SPECIES[sp].label}又长大啦！`);
      out.gold = true;
    } else return out;
    if (out.levelUp && f) this.fx.push({ kind: 'level', name, at: this.now() });
    if (f && f.fan) out.save = Pond.saveOf(f);
    return out;
  }

  // 每帧推进：鱼游动、追鱼食、吃食、睡觉、离开。dt 秒。
  tick(dtMs = null) {
    const t = this.now();
    const dt = Math.min(0.1, Math.max(0, (dtMs == null ? t - this.lastTick : dtMs) / 1000));
    this.lastTick = t;
    const o = this.opts, b = o.bounds;
    // 鱼食下沉
    for (const p of this.food) { if (t < p.at) continue; p.y = Math.min(b.y1 + 40, p.y + p.vy * dt); }
    this.food = this.food.filter(p => t - p.at < 20000);
    for (const f of [...this.fish.values()]) {
      const idle = t - f.touch;
      if (idle > o.leaveAfterMs) { f.leaving = true; }
      f.asleep = idle > o.sleepAfterMs && !f.leaving;
      if (f.eat > 0) f.eat = Math.max(0, f.eat - dt);
      let tx = f.tx, ty = f.ty, speed = 70 + f.lv * 6;
      if (f.leaving) { tx = f.dir > 0 ? 1200 : -120; ty = f.y; speed = 90; }
      else if (f.asleep) { ty = b.y1; tx = f.x; speed = 25; }
      else {
        // 找鱼食：自己的鱼食优先，其次就近（160px 内才去抢）
        let best = null, bd = 1e9;
        for (const p of this.food) {
          if (t < p.at || p.y < o.surfaceY + 5) continue;
          const d = Math.hypot(p.x - f.x, p.y - f.y) - (p.owner === f.name ? 600 : 0);
          if (d < bd && (p.owner === f.name || d < 260)) { bd = d; best = p; }
        }
        if (best) { tx = best.x; ty = best.y; speed = 160 + f.lv * 10; }
        else if (Math.hypot(tx - f.x, ty - f.y) < 30 || this.rand() < dt * 0.15) {
          f.tx = b.x0 + this.rand() * (b.x1 - b.x0); f.ty = b.y0 + this.rand() * (b.y1 - b.y0); tx = f.tx; ty = f.ty;
        }
        if (best && Math.hypot(best.x - f.x, best.y - f.y) < 22 + f.lv * 4) {
          this.food.splice(this.food.indexOf(best), 1);
          f.eat = 0.5;
          if (best.owner === f.name || !best.owner) this.grow(f, 0.2);
        }
      }
      const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy) || 1;
      const ax = dx / d * speed, ay = dy / d * speed;
      const k = Math.min(1, dt * 2.5);
      f.vx += (ax - f.vx) * k; f.vy += (ay - f.vy) * k;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (!f.leaving) { f.x = Math.max(b.x0 - 80, Math.min(b.x1 + 80, f.x)); f.y = Math.max(b.y0 - 20, Math.min(b.y1 + 10, f.y)); }
      if (Math.abs(f.vx) > 8) f.dir = f.vx > 0 ? 1 : -1;
      if (f.leaving && (f.x > 1180 || f.x < -100)) this.fish.delete(f.name);
    }
    this.bubbles = this.bubbles.filter(x => t - x.at < 7000);
    this.fx = this.fx.filter(x => t - x.at < 3000);
    return this.state();
  }
  state() {
    return { fish: [...this.fish.values()], food: this.food, bubbles: this.bubbles, fx: this.fx, top: this.top(3), count: this.fish.size, now: this.now() };
  }
  // 冷场提示
  need() {
    if (!this.fish.size) return { key: 'empty', text: '🐟 鱼塘空空的 · 进来就有一条你的小鱼', voice: '鱼塘还空着呢，进来的朋友都会有一条自己的小鱼！' };
    if (this.food.length < 3) return { key: 'hungry', text: '👍 点赞喂鱼 · 评论「喂食」全池开抢', voice: '小鱼们饿啦，点赞就能喂你的小鱼，评论喂食给全池撒鱼食！' };
    return { key: 'play', text: '⭐ 关注升级金边 · 下次来还是你的鱼', voice: '点个关注，你的小鱼马上升级换金边，下次来还是这条鱼哦！' };
  }
}
