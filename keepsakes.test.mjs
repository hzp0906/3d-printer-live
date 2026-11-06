import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseKeepsake, keepsakeTag, keepsakeReceipt, LikeKing, likeKingHint, TEXT_MAX } from './keepsakes.mjs';

test('打字 + 内容 → 立体字，最多 6 个字，敏感内容拒绝', () => {
  assert.deepEqual(parseKeepsake('打字 早安'), { kind: 'text', text: '早安', label: '✍️ 立体字' });
  assert.equal(parseKeepsake('打字：发财发财！').text, '发财发财');
  assert.equal(parseKeepsake('刻字恭喜发财万事如意').text.length, TEXT_MAX);
  assert.equal(parseKeepsake('打字 加我微信').rejected, true);
  assert.equal(parseKeepsake('打字 '), null);
  assert.equal(parseKeepsake('我想打字'), null, '必须以「打字」开头');
});

test('生肖 / 星座', () => {
  assert.equal(parseKeepsake('属龙').label, '属龙');
  assert.equal(parseKeepsake('我属兔的').id, '兔');
  assert.equal(parseKeepsake('生肖 虎').id, '虎');
  assert.equal(parseKeepsake('天蝎座').kind, 'star');
  assert.equal(parseKeepsake('我是天平座').id, '天秤');
  assert.equal(parseKeepsake('双鱼').label, '双鱼座');
  assert.equal(parseKeepsake('666'), null);
  assert.equal(parseKeepsake('哈哈'), null);
  assert.ok(keepsakeTag(parseKeepsake('属龙')).includes('生肖摆件'));
  assert.ok(keepsakeReceipt('小明', parseKeepsake('打字 早安'), 2).includes('「早安」'));
});

test('点赞王：10 分钟一轮，最多者且 ≥30 赞得奖杯', () => {
  const k = new LikeKing({ now: 0 });
  for (let i = 0; i < 12; i++) k.add('王者', 'a.png', 3, i * 1000);
  k.add('路人', '', 5, 100);
  k.add('直播观众', '', 999, 100);
  assert.equal(k.leader().name, '王者');
  assert.equal(k.tick(9 * 60000), undefined);
  assert.ok(likeKingHint(k, 9 * 60000).includes('领先 王者 36赞'));
  const w = k.tick(10 * 60000);
  assert.equal(w.name, '王者'); assert.equal(w.likes, 36); assert.equal(w.avatar, 'a.png');
  assert.equal(k.round, 2); assert.equal(k.leader(), null);
  k.add('小李', '', 9, 10 * 60000 + 1);
  assert.equal(k.tick(20 * 60000), null, '不够 30 赞不发');
});

test('页面接好了：评论优先摆件、点赞计入点赞王、规则牌有说明', () => {
  const s = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.ok(s.includes("const ks=parseKeepsake(v.text)"));
  assert.ok(s.includes('likeKing.add(name,avatar,n)'));
  assert.ok(s.includes("'🏆点赞王',true,{trophy:true"));
  assert.ok(s.includes('打立体字摆件'));
  const l = fs.readFileSync(new URL('./live.html', import.meta.url), 'utf8');
  assert.ok(l.includes('金色点赞王奖杯'));
});
