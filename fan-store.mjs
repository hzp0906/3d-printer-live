// 老粉记录的本地文件存储（数据桥进程使用）。打印页通过 ws 读写：
//   页面 → {type:'fan-book-get'}            数据桥 → {type:'fan-book', fans}
//   页面 → {type:'fan-book-save', fans}     数据桥合并后原子写入文件
// 文件含观众昵称，已加入 .gitignore。
import fs from 'node:fs';
import path from 'node:path';

import { mergeFans } from './fan-book.mjs';
export { mergeFans };

export class FanStore {
  constructor(file, { delay = 1000 } = {}) { this.file = file; this.delay = delay; this.fans = this.load(); this.timer = null; }
  load() {
    for (const f of [this.file, this.file + '.bak']) {
      try { const data = JSON.parse(fs.readFileSync(f, 'utf8')); return mergeFans({}, data.fans || data); } catch { }
    }
    return {};
  }
  update(incoming) { this.fans = mergeFans(this.fans, incoming); this.schedule(); return this.fans; }
  // 手动清空：页面点“清空观众记录”时用，直接覆盖。
  reset() { this.fans = {}; this.schedule(); }
  schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), this.delay); this.timer.unref?.(); }
  // 原子写入：先写临时文件再改名，并保留上一版为 .bak，断电或崩溃时不会写坏。
  flush() {
    clearTimeout(this.timer); this.timer = null;
    const tmp = this.file + '.tmp';
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), fans: this.fans }, null, 1));
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.bak');
      fs.renameSync(tmp, this.file);
      return true;
    } catch (e) { console.error('老粉记录写入失败：', e.message); return false; }
  }
}
