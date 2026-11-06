import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDLE_AFTER_MS, TIP_EVERY_MS, VOICE_EVERY_MS, idlePrompts, pickIdlePrompt } from './idle-prompts.mjs';
import { GiftSpeech } from './gift-speech.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('冷场阈值：10 秒出提示，10 秒换一条，语音至少隔 30 秒', () => {
  assert.equal(IDLE_AFTER_MS, 10000); assert.equal(TIP_EVERY_MS, 10000); assert.equal(VOICE_EVERY_MS, 60000);
});

test('提示按场面挑选：能量快满优先喊点赞，机器空着喊 666', () => {
  const tilt = idlePrompts({ energyLeft: 40, energyPct: 0.8, busy: true, queue: 3 });
  assert.equal(tilt[0].key, 'energy-near');
  assert.ok(tilt[0].text.includes('40'));
  assert.ok(!idlePrompts({}).some(p => /塔/.test(p.text)));
  assert.ok(!tilt.some(p => p.key === 'idle'));
  const empty = idlePrompts({ busy: false, queue: 0 });
  assert.equal(empty[0].key, 'idle');
  assert.ok(empty.some(p => p.key === 'fortune') && empty.some(p => p.key === 'follow'));
  assert.equal(pickIdlePrompt({ busy: false, queue: 0 }, 0).key, 'idle');
});

test('连续轮换不会一直重复同一句', () => {
  const keys = new Set(); for (let r = 0; r < 12; r++) keys.add(pickIdlePrompt({ busy: true, queue: 2, energyLeft: 200, energyPct: 0.3 }, r).key);
  assert.ok(keys.size >= 4, [...keys].join());
  for (let r = 0; r < 12; r++) { const p = pickIdlePrompt({ busy: true, queue: 2 }, r); assert.ok(p.text && p.voice); }
});

test('打印页：冷场提示卡接入、直播窗口同步、一有互动就收起', () => {
  assert.ok(html.includes("from './idle-prompts.mjs'"));
  assert.ok(html.includes("'energy-hud','fan-wall','idle-tip']"));
  assert.ok(html.includes('setInterval(()=>idleTipTick(),1000)'));
  assert.ok(html.includes('const idle=liveMode&&now-lastLiveMsgAt>=IDLE_AFTER_MS'));
  assert.ok(html.includes("if(!idle){if(idleTipShown){idleTipShown=false;el.style.opacity='0'"));
});

test('语音提示在播报忙时不插话', () => {
  const s = new GiftSpeech(); const out = []; s.enqueue = t => out.push(t);
  s.unlocked = true; s.enabled = true;
  assert.equal(s.idleTip('评论抽签'), true); assert.deepEqual(out, ['评论抽签']);
  s.speaking = true; assert.equal(s.idleTip('x'), false);
});
