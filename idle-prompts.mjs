// 冷场互动提示：10 秒没人进场/互动时，按当前场面挑一句提示（画面卡片 + 隔一段时间念一句）。
export const IDLE_AFTER_MS = 10000;   // 多久没互动算冷场
export const TIP_EVERY_MS = 10000;    // 冷场期间画面提示多久换一条
export const VOICE_EVERY_MS = 60000;  // 语音提示最小间隔，避免一直念

// state: { idleMs, queue, busy, energyLeft, energyPct }
// 返回 {text, voice, key}；按场面优先级组出候选，再用 round 轮换。
export function idlePrompts(state = {}) {
  const s = { queue: 0, busy: false, energyLeft: 0, energyPct: 0, ...state };
  const out = [];
  if (s.energyLeft > 0 && s.energyPct >= 0.6)
    out.push({ key: 'energy-near', text: `⚡ 点赞能量快满了！再点 ${s.energyLeft} 个赞`, voice: `点赞能量快满啦，再点${s.energyLeft}个赞，点赞最多的三位送能量款大头像！` });
  if (!s.busy && s.queue === 0)
    out.push({ key: 'idle', text: '🖨️ 机器空着！评论 666 马上打印你的头像', voice: '机器现在空着，评论666，马上打印你的头像！' });
  out.push({ key: 'fortune', text: '🍀 报个 1-99 的数字 · 抽你的今日幸运卡', voice: '随便报一个1到99的数字，帮你抽一张今日幸运卡，看看今天的小建议！' });
  out.push({ key: 'wall', text: '⭐ 点关注 · 头像永久挂上粉丝墙 · 下次来自动点亮', voice: '点个关注，你的头像就永久挂在粉丝墙上，下次再来自动点亮！' });
  out.push({ key: 'follow', text: '⭐ 点个关注 · 打印金色大头像 · 插队', voice: '点个关注，直接插队打印金色大头像！' });
  out.push({ key: 'energy', text: s.energyLeft ? `⚡ 双击点赞攒能量 · 再点 ${s.energyLeft} 个满格` : '⚡ 双击点赞攒能量 · 满格送能量款大头像', voice: '大家双击屏幕点点赞，能量满格的时候，点赞最多的三位送能量款大头像！' });
  out.push({ key: 'gift', text: '💗 送小心心 · 打印大头像', voice: '送个小心心，就能打印大头像哦！' });
  return out;
}

export function pickIdlePrompt(state, round = 0) {
  const list = idlePrompts(state);
  // 能量快满 / 机器空着 时优先出现，偶数轮固定给它们，奇数轮轮换其余玩法。
  const urgent = list.filter(p => p.key === 'energy-near' || p.key === 'idle');
  if (urgent.length && round % 2 === 0) return urgent[(round / 2) % urgent.length];
  return list[round % list.length];
}
