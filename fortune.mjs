// 评论「幸运卡」或报一个 1–99 的数字：抽一张今日幸运卡（卡号、卡名、一句鼓励、今日小建议），
// 印在这张头像的铭牌上，打完念出来。纯娱乐，只给鼓励，不做预测，不和任何奖励挂钩。
// 合规：不用签/运势/宜忌/方位/五行等占卜用语（平台禁止宣扬封建迷信）。
export const FORTUNES = [
  { level: '满分卡', text: '今天的你，值得一个满分', poem: '闪闪发光 · 自信满满', w: 1, great: true },
  { level: '元气卡', text: '元气满满，干劲十足', poem: '活力拉满 · 一路向前', w: 3, great: true },
  { level: '暖心卡', text: '身边一直有人在支持你', poem: '被人记挂 · 心里暖暖', w: 5 },
  { level: '小确幸卡', text: '留意身边的小美好', poem: '细水长流 · 渐入佳境', w: 6 },
  { level: '平安卡', text: '平平安安就是最好的', poem: '风平浪静 · 安安稳稳', w: 5 },
  { level: '魅力卡', text: '今天的笑容特别好看', poem: '大方自在 · 人见人爱', w: 3 },
  { level: '加油卡', text: '再坚持一下，你可以的', poem: '一步一步 · 越来越好', w: 3 },
  { level: '休息卡', text: '累了就歇会儿，明天继续', poem: '慢慢来 · 不着急', w: 2 },
];
// 今日小建议：生活化的小提醒，不是黄历宜忌
export const TIPS = ['早点睡', '出门走走', '多喝温水', '给朋友发个消息', '吃顿好的', '学点新东西', '整理一下房间', '动一动身体', '听首喜欢的歌', '对自己好一点', '少刷一会手机', '夸夸身边的人'];

// 吉利数：666/6666…、888、999、520、1314 打成固定的特殊款（闪光款），不算普通卡号。
export const LUCKY = [
  { re: /^6{3,}$/, no: '666', level: '六六大顺卡', text: '事事顺利，一路开挂', poem: '六六大顺 · 越来越好' },
  { re: /^8{3,}$/, no: '888', level: '发发发卡', text: '好运跟着你，发发发', poem: '财源滚滚 · 红红火火' },
  { re: /^9{3,}$/, no: '999', level: '长长久久卡', text: '好事长长久久', poem: '久久如意 · 天天开心' },
  { re: /^520$/, no: '520', level: '520 爱心卡', text: '被爱包围的一天', poem: '心里甜甜 · 笑容满满' },
  { re: /^1314$/, no: '1314', level: '一生一世卡', text: '珍惜身边的人', poem: '长长久久 · 一直都在' },
];
export function parseLucky(text) {
  const t = String(text || '').trim();
  const l = LUCKY.find(x => x.re.test(t));
  return l ? { num: 0, lucky: l.no } : null;
}

// 幸运卡：「幸运卡/抽卡」（也兼容观众习惯打的「抽签/求签」），或「幸运卡27」「抽27」「27号」；纯数字 1–99 也算；666/888 等吉利数走 LUCKY 特殊款。
export function parseFortune(text) {
  const t = String(text || '').trim();
  if (!t || /签到|签名/.test(t)) return null;
  const lucky = parseLucky(t);
  if (lucky) return lucky;
  const pure = t.match(/^(\d{1,2})$/);
  if (pure) { const n = +pure[1]; return n >= 1 && n <= 99 ? { num: n } : null; }
  const withNum = t.match(/(?:幸运卡|抽卡|抽签|求签|抽个签|抽)\s*(\d{1,2})(?!\d)|(?<!\d)(\d{1,2})\s*号(?:签|卡)?$/);
  if (withNum) { const n = +(withNum[1] || withNum[2]); if (n >= 1 && n <= 99) return { num: n }; }
  if (/幸运卡|抽卡|抽签|求签|抽个签|^签$/.test(t)) return { num: 0 };
  return null;
}
export const isFortuneComment = text => !!parseFortune(text);

// 同一个人同一天报同一个数字，抽到的卡一样；不报数字就随机给一个卡号。
function hash(str) { let h = 2166136261; for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
function seeded(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
export function dayKey(d = new Date()) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

export function drawFortune(rand = Math.random, opts = {}) {
  const l = opts.lucky && LUCKY.find(x => x.no === String(opts.lucky));
  if (l) {
    const tip = TIPS[Math.floor(rand() * TIPS.length) % TIPS.length];
    return { no: l.no, level: l.level, text: l.text, poem: l.poem, great: true, lucky: true, tip };
  }
  let num = Number(opts.num) || 0;
  const r = num ? seeded(hash(String(opts.name || '') + '|' + num + '|' + (opts.day || dayKey()))) : rand;
  if (!num) num = 1 + Math.floor(r() * 99) % 99;
  const total = FORTUNES.reduce((s, f) => s + f.w, 0);
  let x = r() * total, f = FORTUNES[FORTUNES.length - 1];
  for (const c of FORTUNES) { if ((x -= c.w) < 0) { f = c; break; } }
  const tip = TIPS[Math.floor(r() * TIPS.length) % TIPS.length];
  return { no: num, level: f.level, text: f.text, poem: f.poem, great: !!f.great, tip };
}

// 横幅 / 语音 / 铭牌用的文案
export function fortuneBanner(name, f) { if (f.lucky) return `🎉 ${name} 开出吉利款「${f.level}」· ${f.poem}\n${f.text} · 小建议：${f.tip}`; return `🍀 ${name} 第${f.no}号「${f.level}」· ${f.poem}\n${f.text} · 小建议：${f.tip}`; }
export function fortuneSpeech(name, f) { if (f.lucky) return `${name}开出了${f.level}！${f.text}！`; return `${name}抽到第${f.no}号${f.level}！${f.text}。今天的小建议：${f.tip}${f.great ? '，为你鼓掌！' : '。'}`; }
