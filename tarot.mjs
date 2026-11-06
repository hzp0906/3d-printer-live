// 今日能量卡（娱乐向）：22 张中性名字的鼓励卡 × 满格/充电两种状态，只给鼓励和提醒，不做任何预测/断言。
// 合规：不用塔罗牌名、正逆位、占卜等用语（平台禁止宣扬封建迷信）。
export const MAJOR = [
  { no: 0, name: '出发卡', en: 'START', sym: '🎒', up: '勇敢迈出第一步，世界会给你回应。', rev: '先看清脚下的路，再出发也不迟。' },
  { no: 1, name: '创造卡', en: 'CREATE', sym: '🪄', up: '你手里的资源，比你想的更多。', rev: '专注一件事，力量才不会分散。' },
  { no: 2, name: '直觉卡', en: 'INSIGHT', sym: '🌙', up: '相信你的感觉，它常常是对的。', rev: '安静下来，答案会自己浮现。' },
  { no: 3, name: '温柔卡', en: 'GENTLE', sym: '🌸', up: '好好照顾自己，你值得被温柔对待。', rev: '别只顾着付出，也留一点给自己。' },
  { no: 4, name: '掌控卡', en: 'FOCUS', sym: '👑', up: '定好计划，你就是自己的主人。', rev: '放松一点，掌控不必那么紧。' },
  { no: 5, name: '请教卡', en: 'LEARN', sym: '📜', up: '向有经验的人请教，会少走弯路。', rev: '老办法不灵时，试试自己的方式。' },
  { no: 6, name: '真诚卡', en: 'SINCERE', sym: '💞', up: '真诚的选择，会带来真诚的关系。', rev: '先听听自己内心真正想要什么。' },
  { no: 7, name: '冲刺卡', en: 'SPRINT', sym: '🏇', up: '保持方向，你正在全速前进。', rev: '踩一下刹车，调整好再冲。' },
  { no: 8, name: '勇气卡', en: 'BRAVE', sym: '🦁', up: '温柔也是一种力量，你比自己想的强大。', rev: '累了就休息，勇气会回来的。' },
  { no: 9, name: '独处卡', en: 'QUIET', sym: '🏮', up: '独处的时间，会让你看得更清楚。', rev: '别一个人扛，朋友就在身边。' },
  { no: 10, name: '转机卡', en: 'CHANCE', sym: '🎡', up: '机会来了就伸手接住它。', rev: '起起伏伏很正常，稳住节奏。' },
  { no: 11, name: '公平卡', en: 'FAIR', sym: '⚖️', up: '你做的每件好事，都会被记得。', rev: '换个角度看看，也许会更公平。' },
  { no: 12, name: '换角度卡', en: 'NEW VIEW', sym: '🙃', up: '换个角度看世界，会有新发现。', rev: '别再等了，现在就可以动起来。' },
  { no: 13, name: '新开始卡', en: 'RESTART', sym: '🦋', up: '旧的结束，是新的开始。', rev: '放下一点，才能装进新的好东西。' },
  { no: 14, name: '平衡卡', en: 'BALANCE', sym: '🏺', up: '慢慢来，平衡是最好的节奏。', rev: '别太勉强自己，留点余地。' },
  { no: 15, name: '自律卡', en: 'SELF CONTROL', sym: '🔓', up: '看见让你分心的事，你就能放下它。', rev: '你已经在摆脱坏习惯了，继续加油。' },
  { no: 16, name: '突破卡', en: 'BREAKTHROUGH', sym: '⚡', up: '打破旧框框，你会更自由。', rev: '小变化先接受，大风浪就不怕。' },
  { no: 17, name: '希望卡', en: 'HOPE', sym: '⭐', up: '希望一直都在，继续向前走。', rev: '别忘了抬头，星星一直在发光。' },
  { no: 18, name: '内心卡', en: 'HEART', sym: '🌕', up: '拿不准的时候，听听自己的心。', rev: '想不通就先放一放，慢慢会清楚。' },
  { no: 19, name: '阳光卡', en: 'SUNSHINE', sym: '☀️', up: '今天的你闪闪发光，好心情加倍！', rev: '乌云挡不住太阳，笑一笑会更好。' },
  { no: 20, name: '再出发卡', en: 'TRY AGAIN', sym: '📯', up: '是时候给自己一个新机会了。', rev: '别太苛责自己，你已经做得很好。' },
  { no: 21, name: '圆满卡', en: 'COMPLETE', sym: '🌍', up: '一个阶段完成了，为自己鼓掌！', rev: '还差最后一步，坚持就会完成。' },
];
export const MAX_NUM = 78;

// 解析抽卡评论：纯数字 1–78，或「抽卡/翻牌/能量卡」(+可选数字)。返回 {num}（0=随机）或 null。
export function parseTarot(text) {
  const t = String(text || '').trim().replace(/\s+/g, '');
  if (!t) return null;
  let m = t.match(/^(\d{1,2})(号|号牌|号卡)?$/);
  if (m) { const n = Number(m[1]); return n >= 1 && n <= MAX_NUM ? { num: n } : null; }
  m = t.match(/^(?:抽卡|翻牌|翻卡|抽牌|能量卡)(\d{1,2})?号?$/);
  if (m) { const n = m[1] ? Number(m[1]) : 0; return n === 0 || (n >= 1 && n <= MAX_NUM) ? { num: n } : null; }
  return null;
}

function hash(str) { let h = 2166136261 >>> 0; for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
export function today(d = new Date()) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

// 同一人同一天报同一个数字，翻到同一张；num=0 时随机。
export function drawTarot(rand = Math.random, { num = 0, name = '', day = today() } = {}) {
  const seed = num ? hash(name + '|' + num + '|' + day + '|tarot') : Math.floor(rand() * 2 ** 32);
  const card = MAJOR[seed % MAJOR.length];
  const upright = ((seed >>> 8) % 100) < 68;
  return { no: card.no, name: card.name, en: card.en, sym: card.sym, upright, pos: upright ? '能量满格' : '正在充电', text: upright ? card.up : card.rev, num };
}

export function tarotBanner(name, r) {
  return `✨ ${String(name).slice(0, 10)} 翻开「${r.name} · ${r.pos}」\n${r.text}`;
}
export function tarotSpeech(name, r) {
  const safe = String(name).replace(/[<>\n\r]/g, '').slice(0, 24);
  return `${safe}翻开了${r.name}，${r.pos}。${r.text}`;
}

// 抽卡队列：关注/送礼插队（排在已有插队之后），普通最多保留 cap 张，超出丢最早的普通卡。
export class TarotQueue {
  constructor(cap = 15) { this.items = []; this.cap = cap; }
  get length() { return this.items.length; }
  has(name) { return this.items.some(i => i.name === name); }
  add(item) {
    if (!item.priority && this.has(item.name)) return -1; // 同一人排队中只留一张普通卡
    if (item.priority) {
      // 同名普通卡被插队卡替换
      this.items = this.items.filter(i => !(i.name === item.name && !i.priority));
      const at = this.items.findIndex(i => !i.priority);
      if (at < 0) this.items.push(item); else this.items.splice(at, 0, item);
    } else {
      this.items.push(item);
      while (this.items.filter(i => !i.priority).length > this.cap) {
        const k = this.items.findIndex(i => !i.priority); this.items.splice(k, 1);
      }
    }
    return this.items.indexOf(item) + 1;
  }
  shift() { return this.items.shift(); }
  clear() { this.items = []; }
  names(n = 3) { return this.items.slice(0, n).map(i => i.name); }
}

// 人多判定：排队（含正在翻的）达到 CROWD_AT 视为人多
export const CROWD_AT = 4;
export function isCrowded(waiting) { return waiting >= CROWD_AT; }

// 评论抽卡：任何评论都能翻（没数字就随机，报数字 = 固定今日那张）；人多时也不拒绝，靠批量翻牌消化。
export function commentCard(text, crowded) {
  const t = parseTarot(text);
  if (t) return t;
  const m = String(text || '').match(/(?:^|\D)(\d{1,2})(?!\d)/);
  const n = m ? +m[1] : 0;
  return { num: n >= 1 && n <= MAX_NUM ? n : 0 };
}

// 一次翻几张：排队越多翻越多（金卡单独翻，保留排面）
export function batchSize(waiting) { return waiting >= 8 ? 3 : waiting >= CROWD_AT ? 2 : 1; }
export function takeBatch(queue, waiting = queue.length) {
  const first = queue.shift();
  if (!first) return [];
  const out = [first];
  if (first.priority) return out;
  const n = batchSize(waiting);
  while (out.length < n && queue.length && !queue.items[0].priority) out.push(queue.shift());
  return out;
}

// 人多时语音只念名字和卡名
export function tarotShortSpeech(items) {
  return items.map(i => String(i.name).replace(/[<>\n\r]/g, '').slice(0, 12) + '，' + i.result.name).join('；');
}
export function batchSpeech(items, crowded) {
  if (items.length === 1 && !crowded) return tarotSpeech(items[0].name, items[0].result);
  return tarotShortSpeech(items);
}
export function batchHoldMs(items, waiting = 0) {
  const base = Math.max(...items.map(i => holdMs(i, waiting)));
  return items.length > 1 ? base + (items.length - 1) * 1500 : base;
}

// 单张卡展示时长：翻牌 1.2s + 停留；排队多时缩短。
export function holdMs(item, waiting = 0) {
  if (item && item.priority) return waiting > 6 ? 7000 : 11000;
  return waiting > 6 ? 3500 : waiting > 2 ? 5000 : 7000;
}

// 进场观众的「待翻卡」：卡背印头像和名字，评论任意内容就翻开。
export class PendingCards {
  constructor(cap = 6, ttlMs = 120000) { this.items = []; this.cap = cap; this.ttl = ttlMs; }
  add(name, avatar, now = Date.now()) {
    if (!name) return;
    this.items = this.items.filter(i => i.name !== name);
    this.items.unshift({ name, avatar, at: now });
    if (this.items.length > this.cap) this.items.length = this.cap;
  }
  take(name) { const i = this.items.findIndex(x => x.name === name); if (i < 0) return null; return this.items.splice(i, 1)[0]; }
  list(now = Date.now()) { this.items = this.items.filter(i => now - i.at < this.ttl); return this.items.slice(); }
  clear() { this.items = []; }
}
