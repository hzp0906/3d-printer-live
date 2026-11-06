import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeStyle, rollRarity, cleanQuote, styleTag, styleReceipt, hasKeywords, StyleStats, legendBanner } from './comment-style.mjs';

test('关键词点单：贴纸可叠加最多 2 个，滤镜/主题取第一个', () => {
  const st = makeStyle('我要皇冠加猫耳再加墨镜，像素风素描', () => 0.9);
  assert.deepEqual(st.deco, ['crown', 'ears']);
  assert.equal(st.filter, 'pixel');
  assert.equal(st.theme, '');
  assert.equal(st.rarity, 'normal');
  assert.equal(makeStyle('今天我生日', () => .9).theme, 'birthday');
  assert.equal(makeStyle('锦鲤附体', () => .9).theme, 'koi');
  assert.ok(!hasKeywords(makeStyle('666', () => .9)));
  assert.equal(styleReceipt(makeStyle('666', () => .9)), '');
  assert.match(styleReceipt(makeStyle('皇冠', () => 0)), /已点单 👑 皇冠/);
});

test('稀有度：5% 传说 / 15% 闪光 / 80% 普通，分布大致正确', () => {
  assert.equal(rollRarity(() => 0.01), 'legend');
  assert.equal(rollRarity(() => 0.1), 'shiny');
  assert.equal(rollRarity(() => 0.5), 'normal');
  let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const n = { legend: 0, shiny: 0, normal: 0 };
  for (let i = 0; i < 20000; i++) n[rollRarity(rand)]++;
  assert.ok(n.legend > 800 && n.legend < 1200, 'legend ' + n.legend);
  assert.ok(n.shiny > 2600 && n.shiny < 3400, 'shiny ' + n.shiny);
});

test('铭牌评论原文：截断、过滤联系方式/链接/脏话', () => {
  assert.equal(cleanQuote('今晚吃火锅'), '今晚吃火锅');
  assert.equal(cleanQuote('一二三四五六七八九十一二三四五六'), '一二三四五六七八九十一二三四…');
  assert.equal(cleanQuote('加我微信 abc'), '');
  assert.equal(cleanQuote('v 信 123'), '');
  assert.equal(cleanQuote('看 www.x.com'), '');
  assert.equal(cleanQuote('13800138000'), '');
  assert.equal(cleanQuote('主播 s b'), '');
  assert.equal(cleanQuote('<b>hi</b>'), 'bhi/b');
});

test('款式说明与本场统计', () => {
  assert.equal(styleTag({ deco: ['crown'], filter: 'retro', theme: '', rarity: 'legend' }), '🌈 传说款 · 👑 皇冠 · 📷 复古');
  assert.equal(styleTag({ deco: [], filter: '', theme: '', rarity: 'normal' }), '💬 评论款');
  const s = new StyleStats(); s.note({ deco: ['crown'], filter: '', theme: '', rarity: 'legend' }); s.note({ deco: ['crown'], filter: '', theme: '', rarity: 'shiny' });
  assert.equal(s.legend, 1); assert.equal(s.shiny, 1); assert.equal(s.keywords.crown, 2);
  assert.match(legendBanner('小明'), /传说款/);
});

test('页面接线：评论带款式、头像合成、铭牌原文、传说横幅、规则牌', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const live = readFileSync(new URL('./live.html', import.meta.url), 'utf8');
  assert.ok(html.includes("from './comment-style.mjs'"));
  assert.ok(html.includes('tex=styledTex(tex,v);avatarMat.map=tex'));
  assert.ok(html.includes('tex=styledTex(tex,active);'));
  assert.ok(html.includes("}else if(v.style&&!special){"));
  assert.ok(html.includes('function revealStyle(job)'));
  assert.ok(html.includes("if(style&&!j.style)j.style=style;"));
  for (const s of [html, live]) assert.ok(s.includes('<b>💬 评论点单</b><span>定制头像 · 随机开🌈传说款</span>'));
  for (const s of [html, live]) assert.ok(s.includes('贴纸：皇冠 猫耳 墨镜 光环 恶魔<br>画风：像素 素描 复古<br>主题：生日 锦鲤'));
  for (const s of [html, live]) assert.ok(s.includes('贴纸：皇冠 猫耳 墨镜 光环 恶魔<br>画风：像素 素描 复古<br>主题：生日 锦鲤'));
  // 稀有度不和送礼挂钩：只有评论路径生成 style
  assert.equal((html.match(/makeStyle\(/g) || []).length, 1);
});

test('数字幸运卡：没点关键词时随机配款式，点了关键词就按点的来', async () => {
  const { randomStyle } = await import('./comment-style.mjs');
  const seen = new Set();
  let seed = 3; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 200; i++) { const st = randomStyle(makeStyle('23', () => .9), rand); assert.equal(st.deco.length, 1); assert.ok(st.random); assert.equal(st.rarity, 'normal'); seen.add(st.deco[0]); }
  assert.equal(seen.size, 5);
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('if(wantFortune&&!hasKeywords(style))style=randomStyle(style);'));
  assert.ok(html.includes("if(!hasKeywords(queued.style))queued.style=randomStyle(queued.style);"));
  assert.ok(html.includes("'\\n随机款式：'+styleTag(job.style)"));
});
