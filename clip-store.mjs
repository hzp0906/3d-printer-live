// 短视频素材保存：打印页面把录好的视频 POST 到数据桥（http://127.0.0.1:8765/clip?name=...），存进项目目录 clips/。
import fs from 'node:fs';
import path from 'node:path';

export const CLIP_MAX_BYTES = 200 * 1024 * 1024;

export function safeClipName(raw) {
  let n = String(raw || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').replace(/^\.+/, '').trim().slice(0, 80);
  if (!/\.(mp4|webm)$/i.test(n)) n = (n || 'clip') + '.webm';
  return n;
}

// 返回 true 表示请求已处理
export function handleClipRequest(req, res, dir) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname !== '/clip') return false;
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return true; }
  if (req.method !== 'POST') { res.writeHead(405, cors); res.end(); return true; }
  const name = safeClipName(url.searchParams.get('name'));
  const chunks = []; let size = 0, dead = false;
  req.on('data', d => {
    if (dead) return;
    size += d.length;
    if (size > CLIP_MAX_BYTES) { dead = true; res.writeHead(413, cors); res.end('too large'); req.destroy(); return; }
    chunks.push(d);
  });
  req.on('end', () => {
    if (dead) return;
    try {
      fs.mkdirSync(dir, { recursive: true });
      let file = path.join(dir, name);
      for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, name.replace(/(\.\w+)$/, `-${i}$1`));
      fs.writeFileSync(file, Buffer.concat(chunks));
      res.writeHead(200, { ...cors, 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, file, bytes: size }));
    } catch (e) {
      res.writeHead(500, cors); res.end(String(e && e.message || e));
    }
  });
  return true;
}
