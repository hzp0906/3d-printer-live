import test from 'node:test';
import assert from 'node:assert/strict';
import { GiftSpeech } from './gift-speech.mjs';

test('播报卡住时看门狗自动重置并继续下一句', async () => {
  const spoken = []; let cancels = 0;
  globalThis.SpeechSynthesisUtterance = function (t) { this.text = t };
  globalThis.speechSynthesis = { speaking: false, pending: false, getVoices: () => [], cancel() { cancels++ }, speak(u) { spoken.push(u.text); this.speaking = true } }; // 永远不触发 onend
  const old = GiftSpeech.GUARD_MIN_MS; GiftSpeech.GUARD_MIN_MS = 30;
  try {
    const s = new GiftSpeech(() => { }); s.engine = 'system'; s.unlocked = true;
    s.enqueue('第一句'); s.enqueue('第二句');
    assert.deepEqual(spoken, ['第一句']);
    await new Promise(r => setTimeout(r, 1500));
    assert.equal(spoken[1], '第二句');
    assert.ok(cancels >= 1);
    s.stop();
  } finally { GiftSpeech.GUARD_MIN_MS = old; delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance }
});
