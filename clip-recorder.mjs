// 短视频素材：一直在后台滚动录直播画面，点「保存最近 20 秒」就导出一段视频文件。
// MediaRecorder 不能从中间截一段，所以用两路录像错开半个周期轮流重启：
// 任何时刻总有一路已经录了 segMs/2 ~ segMs，保存时取录得更久的那一路。
export const CLIP = { segMs: 20000, fps: 30, bitrate: 6_000_000 };

export function pickMime(MR = globalThis.MediaRecorder) {
  const list = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  if (!MR || typeof MR.isTypeSupported !== 'function') return '';
  return list.find(t => { try { return MR.isTypeSupported(t); } catch { return false; } }) || '';
}
export const extOf = mime => (/mp4/.test(mime) ? 'mp4' : 'webm');

export function clipName(label = '', t = new Date()) {
  const p = n => String(n).padStart(2, '0');
  const safe = String(label).replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 16);
  return `头像打印-${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}${safe ? '-' + safe : ''}`;
}

export class ClipRecorder {
  // getCanvas(): 当前直播画面 canvas；onClip(blob, name, mime)：保存回调
  constructor({ getCanvas, onClip, MediaRecorder: MR = globalThis.MediaRecorder, now = () => Date.now(), setTimer = (f, ms) => setTimeout(f, ms), clearTimer = id => clearTimeout(id), opts = {} } = {}) {
    Object.assign(this, { getCanvas, onClip, MR, now, setTimer, clearTimer });
    this.opts = { ...CLIP, ...opts };
    this.mime = pickMime(MR);
    this.slots = [null, null];
    this.on = false;
    this.timers = [];
  }
  get supported() { return !!this.MR && !!this.mime; }
  start() {
    if (this.on || !this.supported) return this.on;
    this.on = true;
    this.startSlot(0);
    this.timers.push(this.setTimer(() => this.on && this.startSlot(1), this.opts.segMs / 2));
    return true;
  }
  stop() {
    this.on = false;
    this.timers.forEach(t => this.clearTimer(t)); this.timers = [];
    this.slots.forEach((s, i) => this.endSlot(i, false));
  }
  // 画面源换了（玩法切换 / 直播窗口开关）：重新开录
  restart() { if (!this.on) return; this.stop(); this.start(); }

  startSlot(i) {
    this.endSlot(i, false);
    const canvas = this.getCanvas?.();
    if (!canvas || typeof canvas.captureStream !== 'function') return;
    let stream, rec;
    try {
      stream = canvas.captureStream(this.opts.fps);
      rec = new this.MR(stream, { mimeType: this.mime, videoBitsPerSecond: this.opts.bitrate });
    } catch (e) { try { stream?.getTracks().forEach(t => t.stop()); } catch { } return; }
    const slot = { rec, stream, chunks: [], at: this.now(), save: null, timer: null };
    rec.ondataavailable = e => { if (e.data && e.data.size) slot.chunks.push(e.data); };
    rec.onstop = () => {
      try { stream.getTracks().forEach(t => t.stop()); } catch { }
      if (slot.save && slot.chunks.length) {
        const blob = new Blob(slot.chunks, { type: this.mime.split(';')[0] });
        try { this.onClip?.(blob, slot.save + '.' + extOf(this.mime), this.mime); } catch { }
      }
    };
    try { rec.start(1000); } catch { return; }
    // 录满一个周期就丢掉重来，避免越录越大
    slot.timer = this.setTimer(() => { if (this.on && this.slots[i] === slot) this.startSlot(i); }, this.opts.segMs);
    this.slots[i] = slot;
  }
  endSlot(i, save, label) {
    const s = this.slots[i]; if (!s) return;
    this.slots[i] = null;
    this.clearTimer(s.timer);
    if (save) s.save = clipName(label, new Date(this.now()));
    try { if (s.rec.state !== 'inactive') s.rec.stop(); } catch { }
  }
  // 保存最近一段：取录得更久的那一路导出，然后立刻重开这一路。返回秒数（0 = 没在录）。
  save(label = '') {
    if (!this.on) return 0;
    const live = this.slots.map((s, i) => [s, i]).filter(([s]) => s);
    if (!live.length) return 0;
    const [s, i] = live.sort((a, b) => a[0].at - b[0].at)[0];
    const secs = Math.round((this.now() - s.at) / 1000);
    this.endSlot(i, true, label);
    this.startSlot(i);
    return secs;
  }
}
