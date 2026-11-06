// 自然人声播报：打印页面请求 http://127.0.0.1:8765/tts?text=...&voice=...&rate=...，
// 数据桥调用 edge-tts（微软神经网络语音，免费、需联网）生成 mp3，缓存在 .tts-cache/，同一句第二次直接秒回。
// 失败（没装 edge-tts / 断网 / 超时）返回 503，打印页面自动退回浏览器自带语音。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

export const TTS_VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓 · 温暖女声（推荐）' },
  { id: 'zh-CN-XiaoyiNeural', label: '晓伊 · 活泼女声' },
  { id: 'zh-CN-YunxiNeural', label: '云希 · 阳光男声' },
  { id: 'zh-CN-YunxiaNeural', label: '云夏 · 可爱少年' },
  { id: 'zh-CN-liaoning-XiaobeiNeural', label: '晓北 · 东北话（幽默）' },
  { id: 'zh-CN-shaanxi-XiaoniNeural', label: '晓妮 · 陕西话' },
  { id: 'zh-TW-HsiaoChenNeural', label: '曉臻 · 台湾腔女声' },
];
export const DEFAULT_TTS_VOICE = TTS_VOICES[0].id;
export const TTS_TIMEOUT_MS = 20000; // 微软接口偶尔要 10 秒以上，生成完就进缓存，下次秒回
export const TTS_MAX_CHARS = 160;
export const TTS_CACHE_MAX = 400;

const VOICE_RE = /^[a-z]{2}-[A-Z]{2}(-[a-z]+)?-[A-Za-z]+Neural$/;
export function ttsParams(searchParams) {
  const text = String(searchParams.get('text') || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, TTS_MAX_CHARS);
  let voice = String(searchParams.get('voice') || DEFAULT_TTS_VOICE);
  if (!VOICE_RE.test(voice)) voice = DEFAULT_TTS_VOICE;
  const rateN = Math.max(-30, Math.min(40, Math.round(Number(searchParams.get('rate')) || 0)));
  const pitchN = Math.max(-20, Math.min(20, Math.round(Number(searchParams.get('pitch')) || 0)));
  return { text, voice, rate: (rateN >= 0 ? '+' : '') + rateN + '%', pitch: (pitchN >= 0 ? '+' : '') + pitchN + 'Hz' };
}
export function ttsCacheKey(p) {
  return crypto.createHash('sha1').update([p.voice, p.rate, p.pitch, p.text].join('|')).digest('hex').slice(0, 24);
}

function pruneCache(dir) {
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.mp3')).map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }));
    if (files.length <= TTS_CACHE_MAX) return;
    files.sort((a, b) => a.t - b.t);
    for (const x of files.slice(0, files.length - TTS_CACHE_MAX)) fs.rmSync(path.join(dir, x.f), { force: true });
  } catch { }
}

const inflight = new Map();
export function synthesize(p, dir, { bin = process.env.EDGE_TTS_BIN || 'edge-tts', timeoutMs = TTS_TIMEOUT_MS, spawnFn = spawn } = {}) {
  const key = ttsCacheKey(p);
  const file = path.join(dir, key + '.mp3');
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return Promise.resolve({ file, cached: true });
  if (inflight.has(key)) return inflight.get(key);
  const job = new Promise((resolve, reject) => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file + '.' + process.pid + '.tmp';
    let done = false;
    const finish = err => {
      if (done) return; done = true; clearTimeout(timer);
      if (err) { fs.rmSync(tmp, { force: true }); reject(err); return; }
      try {
        if (!fs.existsSync(tmp) || !fs.statSync(tmp).size) throw new Error('edge-tts 没有生成音频');
        fs.renameSync(tmp, file); pruneCache(dir); resolve({ file, cached: false });
      } catch (e) { fs.rmSync(tmp, { force: true }); reject(e); }
    };
    let child;
    try {
      child = spawnFn(bin, ['--voice', p.voice, '--rate=' + p.rate, '--pitch=' + p.pitch, '--text', p.text, '--write-media', tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) { finish(e); return; }
    let errText = '';
    child.stderr?.on('data', d => { errText = (errText + d).slice(-300); });
    child.on('error', e => finish(e));
    child.on('close', code => finish(code === 0 ? null : new Error('edge-tts 退出码 ' + code + ' ' + errText.trim())));
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch { } finish(new Error('edge-tts 超时')); }, timeoutMs);
  }).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

let lastErrLog = 0;
// 返回 true 表示请求已处理
export function handleTtsRequest(req, res, dir, opts = {}) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname !== '/tts' && url.pathname !== '/tts/voices') return false;
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return true; }
  if (url.pathname === '/tts/voices') {
    res.writeHead(200, { ...cors, 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ voices: TTS_VOICES, default: DEFAULT_TTS_VOICE }));
    return true;
  }
  const p = ttsParams(url.searchParams);
  if (!p.text) { res.writeHead(400, cors); res.end('empty text'); return true; }
  synthesize(p, dir, opts).then(({ file, cached }) => {
    const body = fs.readFileSync(file);
    res.writeHead(200, { ...cors, 'content-type': 'audio/mpeg', 'content-length': body.length, 'cache-control': 'max-age=86400', 'x-tts-cache': cached ? 'hit' : 'miss' });
    res.end(body);
  }).catch(e => {
    if (Date.now() - lastErrLog > 60000) { lastErrLog = Date.now(); (opts.log || console.error)('⚠️ 自然人声生成失败（' + (e.message || e) + '），打印页面会改用浏览器语音'); }
    if (!res.headersSent) { res.writeHead(503, cors); res.end('tts unavailable'); }
  });
  return true;
}
