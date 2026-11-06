import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FanStore, mergeFans } from './fan-store.mjs';
import { FanBook } from './fan-book.mjs';
import { handleFanBookMessage, FAN_BOOK_FILE } from './douyin-bridge.mjs';
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fanbook-')), 'fan-book.json');
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('合并取大值不丢数据，脏数据被过滤', () => {
  const a = { 小A: { visits: 3, day: '2026-11-1', first: 100, last: 300, cards: { wood: 2 }, diamonds: 0 } };
  const b = { 小A: { visits: 2, day: '2026-11-3', first: 50, last: 500, cards: { wood: 1, gold: 1 }, diamonds: 1, diamondReady: true }, '': { visits: 1 }, 坏: 'x', 脏卡: { visits: 1, cards: { 'bad key!': 9, silver: -3 } } };
  const m = mergeFans(a, b);
  assert.deepEqual(m.小A.cards, { wood: 2, gold: 1 });
  assert.equal(m.小A.visits, 3); assert.equal(m.小A.first, 50); assert.equal(m.小A.last, 500);
  assert.equal(m.小A.day, '2026-11-3'); assert.equal(m.小A.diamondReady, true); assert.equal(m.小A.diamonds, 1);
  assert.equal(m[''], undefined); assert.equal(m.坏, undefined); assert.deepEqual(m.脏卡.cards, {});
});

test('写文件原子且保留备份，重启后能读回，主文件损坏时用备份', () => {
  const file = tmp();
  const s = new FanStore(file, { delay: 10 });
  s.update({ 甲: { visits: 1, last: 1, cards: { wood: 1 } } }); assert.equal(s.flush(), true);
  s.update({ 乙: { visits: 2, last: 2, cards: {} } }); s.flush();
  assert.ok(fs.existsSync(file + '.bak')); assert.ok(!fs.existsSync(file + '.tmp'));
  assert.deepEqual(Object.keys(new FanStore(file).fans).sort(), ['乙', '甲']);
  fs.writeFileSync(file, '{broken');
  assert.deepEqual(Object.keys(new FanStore(file).fans), ['甲'], '主文件坏了读上一版备份');
  s.reset(); s.flush(); assert.deepEqual(new FanStore(file).fans, {});
});

test('数据桥消息：读取、保存、清空', () => {
  const file = tmp(); const store = new FanStore(file, { delay: 10 }); const sent = [];
  const hub = { broadcast: e => sent.push(e) };
  const log = console.log; console.log = () => { };
  try {
    assert.equal(handleFanBookMessage({ type: 'fan-book-save', fans: { 丙: { visits: 4, last: 9, cards: { black: 1 } } } }, store, hub), true);
    assert.equal(handleFanBookMessage({ type: 'fan-book-get' }, store, hub), true);
    assert.equal(sent[0].type, 'fan-book'); assert.equal(sent[0].fans.丙.visits, 4);
    handleFanBookMessage({ type: 'fan-book-clear' }, store, hub); assert.equal(sent[1].cleared, true); assert.deepEqual(store.fans, {});
    assert.equal(handleFanBookMessage({ type: 'set-room', room: '1' }, store, hub), false);
  } finally { console.log = log; clearTimeout(store.timer); }
  assert.ok(FAN_BOOK_FILE.endsWith('fan-book.json'));
  assert.ok(fs.readFileSync(new URL('./.gitignore', import.meta.url), 'utf8').includes('fan-book.json'), '含昵称，不应入库');
});

test('浏览器端：变更触发同步回调，文件记录合并进来', () => {
  const b = new FanBook(mem()); const pushed = []; b.onChange = f => pushed.push(Object.keys(f).length);
  b.visit('本地人'); assert.equal(pushed.at(-1), 1);
  const all = b.absorb({ 文件人: { visits: 5, last: 1, cards: { gold: 1 } } });
  assert.deepEqual(Object.keys(all).sort(), ['文件人', '本地人']); assert.equal(b.owned('文件人'), 1);
});

test('打印页：连上即拉取、变更推送、离线清空在重连后补发', () => {
  const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.ok(html.includes("socket.send(JSON.stringify({type:'fan-book-get'}))"));
  assert.ok(html.includes("if(type==='fan-book'){receiveFans(v);return}"));
  assert.ok(html.includes("type:'fan-book-save',fans:fanBook.fans"));
  assert.ok(html.includes("localStorage.setItem('printer-fan-book-clear-pending','1')"));
});
