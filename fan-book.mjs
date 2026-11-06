// 老粉识别 + 材质集卡：按昵称记录来访天数与已收集的头像材质，存本地（localStorage）。
// 抖音页面拿不到稳定的用户 ID，这里以昵称为准：改名会被当成新观众，同名会合并。
// 粉丝墙在场判定：10 分钟内没有任何动静就当作已离开。
export const WALL_ACTIVE_MS = 10 * 60 * 1000;
export const MATERIALS = [
  { id: 'wood', label: '木纹' },
  { id: 'silver', label: '银色' },
  { id: 'black', label: '黑曜' },
  { id: 'porcelain', label: '白瓷' },
  { id: 'gold', label: '金色' }, // 只能通过关注获得
];
export const DIAMOND = { id: 'diamond', label: '钻石' };
const KEY = 'printer-fan-book-v1';

// ---- 记录清洗与合并（浏览器和数据桥共用；数据桥的 fan-store.mjs 用它写本地文件）----
export const MAX_FANS = 5000;
const MAX_NAME = 40;

const num = (v, d = 0) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : d);

// 清洗单条记录，丢弃格式不对的字段，防止页面传来脏数据写坏文件。
export function cleanFan(f) {
  if (!f || typeof f !== 'object') return null;
  const cards = {};
  if (f.cards && typeof f.cards === 'object') for (const [k, v] of Object.entries(f.cards)) if (/^[a-z]{2,16}$/.test(k) && num(v) > 0) cards[k] = num(v);
  const out = { visits: num(f.visits), day: typeof f.day === 'string' ? f.day.slice(0, 12) : '', first: num(f.first), last: num(f.last), cards, diamondReady: !!f.diamondReady, diamonds: num(f.diamonds) };
  // 粉丝墙 / 连续来看：fan=关注过（金色卡只能靠关注获得，所以有金色卡也算），avatar 只收 http(s) 链接。
  if (f.fan || out.cards.gold) { out.fan = true; out.fanAt = num(f.fanAt) || out.first; }
  if (typeof f.avatar === 'string' && /^https?:\/\//.test(f.avatar) && f.avatar.length <= 600) out.avatar = f.avatar;
  if (num(f.streak)) { out.streak = num(f.streak); out.best = Math.max(num(f.best), out.streak); }
  // 鱼塘：关注过的人保存自己的鱼 {lv,xp,sp}
  if (f.fish && typeof f.fish === 'object' && /^[a-z]{2,12}$/.test(String(f.fish.sp || ''))) out.fish = { lv: Math.min(99, num(f.fish.lv, 1)) || 1, xp: num(f.fish.xp), sp: String(f.fish.sp) };
  // 钓鱼：关注过的人保存鱼竿等级和最大一条 {lv,best}
  if (f.rod && typeof f.rod === 'object' && num(f.rod.lv)) out.rod = { lv: Math.min(5, num(f.rod.lv)), best: Math.round(Math.min(999, Math.max(0, Number(f.rod.best) || 0)) * 100) / 100 };
  return out;
}

// 两份记录合并：来访天数/卡片/钻石取较大值，首次取最早、最近取最晚。两边都不会丢数据。
export function mergeFan(a, b) {
  if (!a) return b; if (!b) return a;
  const newer = (b.last || 0) >= (a.last || 0) ? b : a;
  const cards = { ...a.cards };
  for (const [k, v] of Object.entries(b.cards || {})) cards[k] = Math.max(cards[k] || 0, v);
  return {
    visits: Math.max(a.visits || 0, b.visits || 0), day: newer.day,
    first: Math.min(a.first || Infinity, b.first || Infinity) === Infinity ? 0 : Math.min(a.first || Infinity, b.first || Infinity),
    last: Math.max(a.last || 0, b.last || 0), cards,
    diamondReady: newer.diamondReady, diamonds: Math.max(a.diamonds || 0, b.diamonds || 0),
    ...(a.fan || b.fan ? { fan: true, fanAt: Math.min(a.fanAt || Infinity, b.fanAt || Infinity) === Infinity ? 0 : Math.min(a.fanAt || Infinity, b.fanAt || Infinity) } : {}),
    ...(newer.avatar || a.avatar || b.avatar ? { avatar: newer.avatar || a.avatar || b.avatar } : {}),
    ...(newer.streak ? { streak: newer.streak, best: Math.max(a.best || 0, b.best || 0, newer.streak) } : {}),
    ...(a.rod || b.rod ? { rod: { lv: Math.max(a.rod?.lv || 0, b.rod?.lv || 0), best: Math.max(a.rod?.best || 0, b.rod?.best || 0) } } : {}),
    ...(a.fish || b.fish ? { fish: !a.fish ? b.fish : !b.fish ? a.fish : (b.fish.xp >= a.fish.xp ? b.fish : a.fish) } : {}),
  };
}

export function mergeFans(base = {}, incoming = {}) {
  const out = { ...base };
  if (incoming && typeof incoming === 'object') for (const [name, raw] of Object.entries(incoming)) {
    if (!name || name.length > MAX_NAME) continue;
    const f = cleanFan(raw);
    if (f) out[name] = mergeFan(out[name], f);
  }
  const names = Object.keys(out);
  if (names.length > MAX_FANS) names.sort((x, y) => (out[x].last || 0) - (out[y].last || 0)).slice(0, names.length - MAX_FANS).forEach(n => delete out[n]);
  return out;
}


// 打印分数 → 材质，与 index.html createProduct 的分档一致（<70 木纹，<80 银，<90 黑，其余白瓷）。
export function materialOf(job) {
  if (job.diamond) return 'diamond';
  if (job.gold) return 'gold';
  const s = Number(job.score) || 0;
  return s >= 90 ? 'porcelain' : s >= 80 ? 'black' : s >= 70 ? 'silver' : 'wood';
}
export const materialLabel = id => (MATERIALS.find(m => m.id === id) || (id === 'diamond' ? DIAMOND : null))?.label || id;
// 连续来看解锁：连续第 3 天 → 下一张升级钻石款；连续第 7 天 → 「铁粉」称号（铭牌显示）。
export const STREAK = { diamond: 3, title: 7 };
export const dayOf = t => { const d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

export class FanBook {
  constructor(storage = globalThis.localStorage, now = () => Date.now()) {
    this.storage = storage; this.now = now; this.fans = {};
    try { const raw = storage?.getItem(KEY); if (raw) this.fans = mergeFans({}, JSON.parse(raw)); } catch { this.fans = {}; }
  }
  // 本地缓存始终写 localStorage；数据桥在线时 onChange 把记录同步到本地文件（fan-store.mjs）。
  save() {
    const names = Object.keys(this.fans);
    if (names.length > MAX_FANS) names.sort((a, b) => (this.fans[a].last || 0) - (this.fans[b].last || 0)).slice(0, names.length - MAX_FANS).forEach(n => delete this.fans[n]);
    try { this.storage?.setItem(KEY, JSON.stringify(this.fans)); } catch { }
    try { this.onChange?.(this.fans); } catch { }
  }
  // 收到文件里的记录：与浏览器缓存合并（两边都不丢），返回合并后的全部记录用于回写文件。
  absorb(fans) {
    this.fans = mergeFans(this.fans, fans);
    try { this.storage?.setItem(KEY, JSON.stringify(this.fans)); } catch { }
    return this.fans;
  }
  get(name) { return this.fans[name] || null; }
  // 记录一次来访：同一天只算一次。firstToday=今天第一次出现；returning=以前来过（不同的天）。
  visit(name) {
    if (!name) return null;
    const t = this.now(), day = dayOf(t);
    let f = this.fans[name], isNew = false;
    if (!f) { f = this.fans[name] = { visits: 0, day: '', first: t, last: t, cards: {}, diamondReady: false, diamonds: 0 }; isNew = true; }
    const firstToday = f.day !== day;
    let reward = null;
    if (firstToday) {
      // 昨天来过就连续 +1，否则从 1 重新计
      f.streak = f.day && f.day === dayOf(t - 86400000) ? (f.streak || 1) + 1 : 1;
      f.best = Math.max(f.best || 0, f.streak);
      f.visits++; f.day = day;
      if (f.streak === STREAK.diamond) { f.diamondReady = true; reward = 'diamond'; }
      else if (f.streak === STREAK.title) reward = 'title';
    }
    f.last = t;
    if (firstToday) this.save();
    return { visits: f.visits, isNew, firstToday, returning: firstToday && f.visits >= 2, owned: this.owned(name), streak: f.streak || 1, reward, fan: !!f.fan };
  }
  // ---- 粉丝墙：关注过的人永久上墙 ----
  isFan(name) { return !!this.fans[name]?.fan; }
  // 关注时调用。返回 true = 第一次上墙。
  markFan(name, avatar) {
    if (!name) return false;
    if (!this.fans[name]) this.visit(name);
    const f = this.fans[name], first = !f.fan;
    if (first) { f.fan = true; f.fanAt = this.now(); }
    if (avatar && /^https?:\/\//.test(avatar)) f.avatar = String(avatar).slice(0, 600);
    this.save();
    return first;
  }
  // 见到观众时顺手记下头像（只记粉丝的，文件不会因路人变大）。
  noteAvatar(name, avatar) {
    const f = this.fans[name];
    if (!f || !f.fan || !avatar || f.avatar === avatar || !/^https?:\/\//.test(avatar)) return;
    f.avatar = String(avatar).slice(0, 600); this.save();
  }
  presentCount(activeMs = WALL_ACTIVE_MS) { const since = this.now() - activeMs; return Object.values(this.fans).filter(f => f.fan && (f.last || 0) >= since).length; }
  fanCount() { return Object.values(this.fans).filter(f => f.fan).length; }
  // 墙上展示：今天来过的（亮灯）在前，其次按上墙时间新→旧。
  // 只显示「现在还在」的粉丝：最近 activeMs 内有过进场/评论/点赞/礼物的；离开太久就从墙上撤下，位置让给新人。
  wall(n = 12, activeMs = WALL_ACTIVE_MS) {
    const today = dayOf(this.now()), since = this.now() - activeMs;
    return Object.entries(this.fans).filter(([, f]) => f.fan && (f.last || 0) >= since)
      .map(([name, f]) => ({ name, avatar: f.avatar || '', lit: f.day === today, streak: f.day === today ? f.streak || 1 : 0, fanAt: f.fanAt || 0, last: f.last || 0 }))
      .sort((a, b) => b.last - a.last)
      .slice(0, n);
  }
  streakOf(name) { const f = this.fans[name]; return f && f.day === dayOf(this.now()) ? f.streak || 1 : 0; }
  owned(name) { const c = this.fans[name]?.cards || {}; return MATERIALS.filter(m => c[m.id]).length; }
  missing(name) { const c = this.fans[name]?.cards || {}; return MATERIALS.filter(m => !c[m.id]).map(m => m.label); }
  // 打印完成后收卡。集齐 5 种时置 diamondReady，下一张头像升级为钻石款。
  collect(name, material) {
    if (!name || !material) return null;
    if (!this.fans[name]) this.visit(name);
    const f = this.fans[name];
    f.last = Math.max(f.last || 0, this.now());
    if (material === 'diamond') { f.diamonds = (f.diamonds || 0) + 1; this.save(); return { material, isNewCard: false, owned: this.owned(name), total: MATERIALS.length, completed: false, diamond: true }; }
    const before = this.owned(name);
    const isNewCard = !f.cards[material];
    f.cards[material] = (f.cards[material] || 0) + 1;
    const owned = this.owned(name);
    const completed = before < MATERIALS.length && owned === MATERIALS.length;
    if (completed) f.diamondReady = true;
    this.save();
    return { material, isNewCard, owned, total: MATERIALS.length, completed, diamond: false };
  }
  takeDiamond(name) { const f = this.fans[name]; if (!f?.diamondReady) return false; f.diamondReady = false; f.last = Math.max(f.last || 0, this.now()); this.save(); return true; }
  top(n = 8) {
    return Object.entries(this.fans)
      .map(([name, f]) => ({ name, visits: f.visits, owned: this.owned(name), diamonds: f.diamonds || 0, cards: f.cards, last: f.last }))
      .sort((a, b) => b.diamonds - a.diamonds || b.owned - a.owned || b.visits - a.visits || b.last - a.last)
      .slice(0, n);
  }
  // ---- 鱼塘：只给关注过的人存鱼（等级 / 经验 / 品种），下次进场接着养 ----
  fishOf(name) { const f = this.fans[name]; return f && f.fan && f.fish ? { ...f.fish } : null; }
  saveFish(name, fish) {
    const f = this.fans[name];
    if (!f || !f.fan || !fish) return false;
    const next = cleanFan({ fish })?.fish; if (!next) return false;
    const cur = f.fish;
    if (cur && cur.lv === next.lv && cur.sp === next.sp && Math.abs(cur.xp - next.xp) < 5) return false; // 小变化不频繁写文件
    f.fish = next; f.last = Math.max(f.last || 0, this.now()); this.save(); return true;
  }
  // ---- 钓鱼：只给关注过的人存鱼竿 ----
  rodOf(name) { const f = this.fans[name]; return f && f.fan && f.rod ? { ...f.rod } : null; }
  saveRod(name, rod) {
    const f = this.fans[name];
    if (!f || !f.fan || !rod) return false;
    const next = cleanFan({ rod })?.rod; if (!next) return false;
    const cur = f.rod;
    const merged = { lv: Math.max(cur?.lv || 0, next.lv), best: Math.max(cur?.best || 0, next.best) };
    if (cur && cur.lv === merged.lv && cur.best === merged.best) return false;
    f.rod = merged; f.last = Math.max(f.last || 0, this.now()); this.save(); return true;
  }
  clear() { this.fans = {}; try { this.storage?.setItem(KEY, '{}'); } catch { } try { this.onClear?.(); } catch { } }
}
