import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('直播窗口有主播摄像头小窗，默认关闭，可调大小和镜像', () => {
  const live = fs.readFileSync('live.html', 'utf8');
  assert.ok(live.includes('<div id="host-cam" hidden>'));
  assert.ok(live.includes("const HC_KEY='host-cam'"));
  assert.ok(live.includes('getUserMedia'));
  assert.ok(live.includes('#host-cam[data-size=s]') && live.includes('#host-cam.mirror video'));
  assert.ok(live.includes('window.__hostCam=hostCam'));
  assert.ok(live.includes("e.key===HC_KEY"), '打印页改设置，弹窗即时生效');
});

test('打印页控制栏有主播小窗开关', () => {
  const s = fs.readFileSync('index.html', 'utf8');
  assert.ok(s.includes("const d={on:false,size:'m',mirror:true,kind:'toon'}"), '默认关，默认卡通主播');
  assert.ok(s.includes("['toon','🤖 卡通主播'],['cam','📷 摄像头']"));
  assert.ok(s.includes('liveWindow.__toonSpeech(ev)'), '语音播报事件转给直播窗口');
  assert.ok(s.includes("'🎙️ 主播小窗：'+(c.on?'开':'关')"));
  assert.ok(s.includes('liveWindow.__hostCam()'));
});

import { moodOf, mouthOpen, createToonState, toonSpeech } from './host-toon.mjs';
import { GiftSpeech } from './gift-speech.mjs';

test('卡通主播按播报内容换表情', () => {
  assert.equal(moodOf('头像塔快要倒啦，评论一个稳'), 'worried');
  assert.equal(moodOf('感谢小明点关注，直接插队打印金色大头像'), 'excited');
  assert.equal(moodOf('欢迎小红来到直播间'), 'happy');
  assert.equal(moodOf('机器准备好了'), 'calm');
});

test('卡通主播播报时张嘴，播完闭嘴', () => {
  const st = createToonState();
  assert.equal(mouthOpen(st, 0), 0);
  toonSpeech(st, { state: 'start', text: '欢迎小红' }, 1000);
  assert.ok(st.speaking && st.mood === 'happy');
  const vals = [1100, 1150, 1230, 1310, 1400].map(t => mouthOpen(st, t));
  assert.ok(Math.max(...vals) > .5 && Math.min(...vals) < Math.max(...vals), '嘴巴有开合');
  toonSpeech(st, { state: 'end' }, 2000);
  assert.equal(mouthOpen(st, 2100), 0);
});

test('语音播报会发出 start/boundary/end 事件', () => {
  const events = [];
  const utters = [];
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; utters.push(this); } };
  globalThis.speechSynthesis = { getVoices: () => [], speak() {}, cancel() {} };
  const g = new GiftSpeech();
  g.onSpeech = e => events.push(e.state + ':' + e.text);
  g.enqueue('欢迎小红');
  const u = utters[0];
  u.onstart(); u.onboundary(); u.onend();
  assert.deepEqual(events, ['start:欢迎小红', 'boundary:欢迎小红', 'end:欢迎小红']);
  delete globalThis.SpeechSynthesisUtterance; delete globalThis.speechSynthesis;
});
