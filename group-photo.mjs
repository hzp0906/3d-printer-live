// 全场合影（直播间全家福）：每 10 分钟把这段时间进场/互动过的观众拼成一张圆形合影，打印出来。
// 进场就自动入镜，不用打字；关注过的粉丝放在中间、放大、加金框。
export const GROUP = { everyMs: 10 * 60 * 1000, minPeople: 3, maxPeople: 30 };

export class GroupPhoto {
  constructor(opts = {}, now = () => Date.now()) {
    this.opts = { ...GROUP, ...opts };
    this.now = now;
    this.round = 0;
    this.reset();
  }
  reset() {
    this.people = new Map(); // name -> {name, avatar, at}
    this.since = this.now();
  }
  add(name, avatar = '') {
    if (!name || name === '直播观众') return;
    const p = this.people.get(name) || { name, avatar: '', at: this.now() };
    if (avatar) p.avatar = avatar;
    this.people.delete(name); this.people.set(name, p); // 最近活跃的排后面，超上限时先丢最早的
    if (this.people.size > this.opts.maxPeople * 3) this.people.delete(this.people.keys().next().value);
  }
  get count() { return this.people.size; }
  msLeft() { return Math.max(0, this.opts.everyMs - (this.now() - this.since)); }
  // 时间到且人够 → 可以拍。人不够就继续攒（不清零），避免冷场时拍出 1 个人的“全家福”。
  due() { return this.msLeft() === 0 && this.count >= this.opts.minPeople; }
  // 拍一张：粉丝排前面（放中间），其余按最近活跃；返回 {round, people:[{name,avatar,fan}], total}
  take(isFan = () => false, force = false) {
    if (!force && !this.due()) return null;
    if (!this.count) return null;
    const all = [...this.people.values()].reverse().map(p => ({ ...p, fan: !!isFan(p.name) }));
    const people = [...all.filter(p => p.fan), ...all.filter(p => !p.fan)].slice(0, this.opts.maxPeople);
    this.round++;
    const shot = { round: this.round, people, total: all.length };
    this.reset();
    return shot;
  }
}

// 在半径 R 的圆里排 n 个头像格子：从大到小试格子尺寸，直到装得下；返回按离圆心由近到远排序的格子，
// 这样前面的人（粉丝）自然排在中间。每个格子 {x, y, r}，坐标以圆心为原点。
export function circleGrid(n, R = 236) {
  if (n <= 0) return [];
  if (n === 1) return [{ x: 0, y: 0, r: R * 0.6 }];
  for (let s = R; s > 8; s *= 0.94) {
    const cells = [], r = s * 0.44;
    for (let y = -R + s / 2; y <= R - s / 2 + 1e-6; y += s) {
      const half = Math.sqrt(Math.max(0, R * R - Math.max((Math.abs(y) + s / 2) ** 2 - 0, 0)));
      const fit = Math.floor((2 * half) / s);
      for (let i = 0; i < fit; i++) cells.push({ x: (i - (fit - 1) / 2) * s, y, r });
    }
    if (cells.length >= n) return cells.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y)).slice(0, n);
  }
  return [];
}

export function groupBanner(shot) {
  const fans = shot.people.filter(p => p.fan).length;
  return `📸 第 ${shot.round} 张直播间全家福 · ${shot.total} 人入镜` + (fans ? `\n其中 ${fans} 位粉丝放大加金框` : '\n点关注的朋友下一张放大加金框');
}
export function groupSpeech(shot) {
  return `全家福来啦！这十分钟来过的${shot.total}位朋友都在照片里，马上打印！点了关注的朋友会放大、加金框哦！`;
}
