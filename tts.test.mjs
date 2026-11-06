import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { ttsParams, ttsCacheKey, synthesize, DEFAULT_TTS_VOICE } from './tts-server.mjs';
import { GiftSpeech, spokenName, speakable } from './gift-speech.mjs';

test('ttsParams 限制文字、语音、语速', () => {
  const p = ttsParams(new URLSearchParams({ text: 'x'.repeat(300), voice: 'bad;rm -rf', rate: '99' }));
  assert.equal(p.text.length, 160);
  assert.equal(p.voice, DEFAULT_TTS_VOICE);
  assert.equal(p.rate, '+40%');
  assert.equal(ttsParams(new URLSearchParams({ text: 'a', voice: 'zh-CN-liaoning-XiaobeiNeural', rate: '-5' })).rate, '-5%');
  assert.notEqual(ttsCacheKey({ ...p, text: 'a' }), ttsCacheKey({ ...p, text: 'b' }));
});

test('synthesize 生成后缓存，失败时抛错', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
  let calls = 0;
  const fake = (bin, args) => {
    calls++; const child = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => { };
    const out = args[args.indexOf('--write-media') + 1];
    setTimeout(() => { fs.writeFileSync(out, 'mp3'); child.emit('close', 0) }, 5);
    return child;
  };
  const p = ttsParams(new URLSearchParams({ text: '你好' }));
  const a = await synthesize(p, dir, { spawnFn: fake });
  assert.equal(a.cached, false);
  const b = await synthesize(p, dir, { spawnFn: fake });
  assert.equal(b.cached, true);
  assert.equal(calls, 1);
  const bad = () => { const c = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => { }; setTimeout(() => c.emit('close', 1), 5); return c };
  await assert.rejects(synthesize(ttsParams(new URLSearchParams({ text: '失败' })), dir, { spawnFn: bad }));
});

test('昵称念法：去表情、长数字换成新朋友', () => {
  assert.equal(spokenName('🌸小美✨'), '小美');
  assert.equal(spokenName('用户8723461'), '新朋友');
  assert.equal(spokenName('💖💖'), '这位朋友');
  assert.equal(spokenName('一二三四五六七八九十'), '一二三四五六七八');
  assert.equal(speakable('谢谢🎉小美～'), '谢谢小美，');
});

test('自然人声失败自动退回浏览器语音', async () => {
  const spoken = [];
  const saved = { Audio: globalThis.Audio, fetch: globalThis.fetch, s: globalThis.speechSynthesis, U: globalThis.SpeechSynthesisUtterance };
  globalThis.Audio = function () { };
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  globalThis.SpeechSynthesisUtterance = function (t) { this.text = t };
  globalThis.speechSynthesis = { speak: u => { spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 1) }, cancel() { }, getVoices: () => [] };
  try {
    const s = new GiftSpeech();
    s.enqueue('欢迎小美！');
    await new Promise(r => setTimeout(r, 30));
    assert.deepEqual(spoken, ['欢迎小美！']);
    assert.ok(s.naturalDownUntil > Date.now(), '失败后一分钟内不再请求自然人声');
    assert.ok(s.ttsUrl('你好').includes('/tts?voice=zh-CN-XiaoxiaoNeural'));
  } finally {
    globalThis.Audio = saved.Audio; globalThis.fetch = saved.fetch; globalThis.speechSynthesis = saved.s; globalThis.SpeechSynthesisUtterance = saved.U;
  }
});

test('台词口语化：欢迎和打印都短', () => {
  const s = new GiftSpeech(); const lines = [];
  s.enqueue = t => lines.push(t); s.unlocked = true;
  for (let i = 0; i < 20; i++) { s.greeted.clear(); s.welcome('小美' + i) }
  s.printing('小美'); s.printing('小美', true);
  for (const l of lines) assert.ok([...l].length <= 40, l);
  assert.ok(lines.every(l => !/祝你|万事如意|心想事成/.test(l)));
});
