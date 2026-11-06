// 玩法轮换：头像打印机 → 今日能量卡 → 互动鱼塘 → 钓鱼大赛 → 头像迷宫，每段默认 60 分钟，切换前 2 分钟预告。
export const MODES = {
  printer: { id: 'printer', label: '头像打印机', icon: '🖨️' },
  tarot: { id: 'tarot', label: '今日能量卡', icon: '✨' },
  pond: { id: 'pond', label: '互动鱼塘', icon: '🐟' },
  fishing: { id: 'fishing', label: '钓鱼大赛', icon: '🎣' },
  maze: { id: 'maze', label: '头像迷宫', icon: '🏃' },
};
export const ORDER = ['printer', 'maze', 'tarot', 'pond', 'fishing'];
export const DEFAULT_MINUTES = 60;
export const WARN_MS = 120000;
// 能量卡只做限时小活动：每轮最多 10 分钟，打印机做主场。
export const MODE_CAP_MINUTES = { tarot: 10 };

export function modeName(id) { const m = MODES[id] || MODES.printer; return m.icon + ' ' + m.label; }

export function formatLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

export class ModeCycle {
  constructor({ minutes = DEFAULT_MINUTES, order = ORDER, now = Date.now(), state = null } = {}) {
    this.order = order.filter(id => MODES[id]);
    if (!this.order.length) this.order = ['printer'];
    this.durationMs = Math.max(1, Number(minutes) || DEFAULT_MINUTES) * 60000;
    this.mode = this.order[0]; this.startedAt = now; this.locked = false; this.warned = false;
    // 页面刷新后恢复上次的玩法和计时，避免一刷新就回到打印机。
    if (state && MODES[state.mode] && this.order.includes(state.mode) && Number.isFinite(state.startedAt) && state.startedAt <= now) {
      this.mode = state.mode; this.startedAt = state.startedAt; this.locked = !!state.locked;
      this.warned = this.remaining(now) <= WARN_MS;
    }
  }
  nextMode() { const i = this.order.indexOf(this.mode); return this.order[(i + 1) % this.order.length]; }
  durationFor(mode = this.mode) {
    const cap = MODE_CAP_MINUTES[mode];
    return cap ? Math.min(this.durationMs, cap * 60000) : this.durationMs;
  }
  remaining(now = Date.now()) { return Math.max(0, this.startedAt + this.durationFor() - now); }
  switchTo(mode = this.nextMode(), now = Date.now()) {
    if (!MODES[mode]) return null;
    this.mode = mode; this.startedAt = now; this.warned = false;
    return { type: 'switch', mode };
  }
  setLocked(v, now = Date.now()) {
    this.locked = !!v;
    // 解锁时重新开始计时，不会一解锁就立刻切走。
    if (!this.locked) { this.startedAt = now; this.warned = false; }
  }
  tick(now = Date.now()) {
    if (this.locked || this.order.length < 2) return null;
    const left = this.remaining(now);
    if (left <= 0) {
      // 长时间后台/休眠后只切一次，并从现在重新计时。
      return this.switchTo(this.nextMode(), now);
    }
    if (!this.warned && left <= WARN_MS) { this.warned = true; return { type: 'warn', next: this.nextMode(), leftMs: left }; }
    return null;
  }
  toJSON() { return { mode: this.mode, startedAt: this.startedAt, locked: this.locked }; }
}
