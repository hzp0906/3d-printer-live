// 点赞能量条：全场点赞一起攒能量，满了触发一次「全场福利」——
// 给这一轮点赞最多的前几位各打印一个「⚡能量款」大头像（插队）。然后进入下一轮，目标略微变大。
export const ENERGY = { goal: 300, step: 100, maxGoal: 1000, rewardTop: 3 };

export class LikeEnergy {
  constructor(opts = {}) {
    this.opts = { ...ENERGY, ...opts };
    this.reset();
  }
  reset() {
    this.goal = this.opts.goal;
    this.value = 0;
    this.round = 1;
    this.fills = 0;
    this.contrib = new Map(); // name -> {name, avatar, likes, at}
  }
  get pct() { return Math.min(1, this.value / this.goal); }
  get left() { return Math.max(0, this.goal - this.value); }

  // 加点赞。满了返回 {full:true, round, winners, goal} 并开启下一轮；否则返回 null。
  add(n = 1, name = '', avatar = '') {
    n = Math.max(1, Math.min(100, Math.floor(Number(n) || 1)));
    this.value += n;
    if (name && name !== '直播观众') {
      const c = this.contrib.get(name) || { name, avatar: '', likes: 0, at: 0 };
      c.likes += n; c.at = Date.now(); if (avatar) c.avatar = avatar;
      this.contrib.set(name, c);
    }
    if (this.value < this.goal) return null;
    const winners = this.top(this.opts.rewardTop);
    const done = { full: true, round: this.round, goal: this.goal, winners };
    this.fills++;
    this.round++;
    this.value = 0; // 溢出不结转，每轮都从零开始，观众更容易看懂
    this.goal = Math.min(this.opts.maxGoal, this.goal + this.opts.step);
    this.contrib.clear();
    return done;
  }
  top(k = 3) {
    return [...this.contrib.values()].sort((a, b) => b.likes - a.likes || a.at - b.at).slice(0, k);
  }
  // 进度里程碑（50%、80%）只提示一次：返回 0.5 / 0.8 / null
  milestone() {
    const p = this.pct;
    this._ms = this._ms || {};
    const key = this.round + ':';
    for (const m of [0.8, 0.5]) {
      if (p >= m && !this._ms[key + m]) { this._ms[key + m] = true; if (m === 0.8) this._ms[key + 0.5] = true; return m; }
    }
    return null;
  }
}

export function energyBanner(r) {
  const names = r.winners.map(w => String(w.name).slice(0, 8)).join('、');
  return names
    ? `⚡ 点赞能量满格！第 ${r.round} 轮福利：${names} 获得能量款大头像`
    : `⚡ 点赞能量满格！第 ${r.round} 轮完成`;
}
export function energySpeech(r) {
  const names = r.winners.map(w => String(w.name).replace(/[<>\n\r]/g, '').slice(0, 8)).join('、');
  return names
    ? `点赞能量满格啦！感谢大家！点赞最多的${names}，送你们能量款大头像，马上插队打印！`
    : '点赞能量满格啦！感谢大家！';
}
export function energyHint(e) {
  return `再点 ${e.left} 个赞 · 能量满格打印能量款`;
}
