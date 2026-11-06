import test from 'node:test';
import assert from 'node:assert/strict';
import { reopenPolicy, REOPEN_WINDOW_MS, ENDED_EXIT_MS } from './douyin-bridge.mjs';

const now = 10_000_000_000;

test('直播中窗口第一次被关：自动重开', () => {
  assert.equal(reopenPolicy({ ended: false, endedAt: 0, now, reopenTimes: [] }), 'reopen');
});

test('10 分钟内已经重开过一次：不再弹出，等用户手动打开', () => {
  assert.equal(reopenPolicy({ ended: false, endedAt: 0, now, reopenTimes: [now - 60000] }), 'wait');
  assert.equal(reopenPolicy({ ended: false, endedAt: 0, now, reopenTimes: [now - REOPEN_WINDOW_MS - 1] }), 'reopen');
});

test('已下播：窗口关闭后不重开', () => {
  assert.equal(reopenPolicy({ ended: true, endedAt: now - 60000, now, reopenTimes: [] }), 'wait');
});

test('下播超过 30 分钟 / 等窗口超过 30 分钟：自动退出', () => {
  assert.equal(ENDED_EXIT_MS, 30 * 60000);
  assert.equal(reopenPolicy({ ended: true, endedAt: now - ENDED_EXIT_MS, now, reopenTimes: [] }), 'exit');
  assert.equal(reopenPolicy({ ended: false, endedAt: 0, now, reopenTimes: [now - 1000], waitSince: now - ENDED_EXIT_MS }), 'exit');
  assert.equal(reopenPolicy({ ended: true, endedAt: now - ENDED_EXIT_MS, now, reopenTimes: [], exitMs: 0 }), 'wait');
});
