import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FORTUNES, isFortuneComment, parseFortune, drawFortune, fortuneBanner, fortuneSpeech } from './fortune.mjs';
import { GiftSpeech } from './gift-speech.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const live = readFileSync(new URL('./live.html', import.meta.url), 'utf8');

test('抽签评论识别：抽签/求签/单字签，排除签到签名', () => {
  for (const t of ['抽签', '我要抽签', '求签', '签', ' 抽个签 ']) assert.ok(isFortuneComment(t), t);
  for (const t of ['6666x', '签到', '抽签签到', '签名', '', null]) assert.ok(!isFortuneComment(t), String(t));
});

test('drawFortune 覆盖所有幸运卡且按权重抽取', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(drawFortune(() => i / 200).level);
  assert.deepEqual([...seen].sort(), FORTUNES.map(f => f.level).sort());
  assert.equal(drawFortune(() => 0).level, '满分卡');
  assert.equal(drawFortune(() => 0).great, true);
  assert.equal(drawFortune(() => 0.9999).level, '休息卡');
});

test('进场卡片：显示排位并引导评论 666 / 幸运卡', () => {
  assert.ok(html.includes('function showJoinCard(name,pos)'));
  assert.ok(html.includes("评论 皇冠/猫耳/像素 定制款式 · 报个 1-99 数字抽幸运卡"));
  assert.ok(html.includes('showJoinCard(name,jj?queue.indexOf(jj)+1+(busy?1:0):0)'));
});

test('进场后评论只升级原任务，不重复打印', () => {
  assert.ok(html.includes("function upgradeJoinJob(name,avatar,wantFortune,style)"));
  assert.ok(html.includes("const ft=parseFortune(v.text),wantFortune=ft?drawFortune(Math.random,{num:ft.num,name,lucky:ft.lucky}):null;let style=makeStyle(v.text);if(wantFortune&&!hasKeywords(style))style=randomStyle(style);if(wantFortune&&wantFortune.lucky&&style.rarity==='normal')style.rarity='shiny';if(!upgradeJoinJob(name,avatar,wantFortune,style))liveEvent('like',{name,avatar},1,null,'评论',true,wantFortune?{fortune:wantFortune,style}:{style})"));
  assert.ok(html.includes("j.source='评论';j.fromLike=false;j.filler=false"));
});

test('幸运卡头像：铭牌印卡名和小建议，打完横幅+语音揭晓', () => {
  assert.ok(html.includes("import {parseFortune,drawFortune,fortuneBanner,fortuneSpeech} from './fortune.mjs'"));
  assert.ok(html.includes("c.fillText('🍀 第'+fortune.no+'号 '+fortune.level") && html.includes("'小建议：'+fortune.tip"));
  assert.ok(html.includes('showBanner(fortuneBanner(nm,f)+'));
  assert.ok(html.includes("revealStyle(active);revealKeepsake(active);if(!active.keepsake&&!active.trophy&&!revealFortune(active)&&!(active.style&&active.style.rarity==='legend'))giftSpeech.printing("));
  assert.ok(live.includes('报数字 1-99'));
});

test('欢迎语音可附带幸运卡/666 引导', () => {
  const s = new GiftSpeech(); const out = []; s.enqueue = t => out.push(t); s.inviteReady = () => false;
  for (let i = 0; i < 80; i++) s.welcome('小明' + i, true);
  assert.ok(out.some(t => t.includes('幸运卡'))); assert.ok(out.every(t => !t.includes('运势')));
  assert.ok(out.every(t => t.includes('小明')));
});

test('抽签任务即使立刻开打也带着签（签在入队时写入，不靠事后查找队列）', () => {
  assert.ok(html.includes('for(const j of added){if(extra)Object.assign(j,extra);'));
  assert.ok(!html.includes("queue.find(j=>!before.has(j)&&j.name===name);if(j){j.fortune"));
});

test('抽签揭晓横幅不被图鉴新卡横幅立刻盖掉', () => {
  assert.ok(html.includes('showBanner=(t,g)=>job.fortune||job.gift?setTimeout(()=>window.__showBanner(t,g),3800):window.__showBanner(t,g)'));
});

test('关注提示牌只讲关注，评论玩法只在规则牌出现一次', () => {
  const cta = html.slice(html.indexOf('<div id="follow-cta"'), html.indexOf('</div>', html.indexOf('<div id="follow-cta"')));
  assert.ok(!cta.includes('<small>'));
  assert.ok(!live.includes('follow-rule'));
  assert.equal(live.split('报数字 1-99').length - 1, 1);
});

test('报数字抽签：1-99 纯数字/抽签27/27号签 都算，666、签到不算', () => {
  for (const [t, n] of [['27', 27], ['1', 1], ['99', 99], ['抽签27', 27], ['抽 8', 8], ['求签 13', 13], ['5号签', 5], ['抽签', 0], ['签', 0]]) assert.deepEqual(parseFortune(t), { num: n }, t);
  for (const t of ['66666x', '0', '100', '签到', '签名', '稳', '哈哈', '2026年']) assert.equal(parseFortune(t), null, t);
});

test('同一人同一天报同一数字结果一致，只有卡名/鼓励/小建议，不含占卜用语', () => {
  const a = drawFortune(Math.random, { num: 27, name: '小明', day: '2026-11-3' });
  const b = drawFortune(Math.random, { num: 27, name: '小明', day: '2026-11-3' });
  assert.deepEqual(a, b); assert.equal(a.no, 27);
  for (const k of ['level', 'poem', 'text', 'tip']) assert.ok(a[k], k);
  for (const k of ['yi', 'ji', 'color', 'dir', 'wuxing']) assert.equal(a[k], undefined, k);
  const c = drawFortune(Math.random, { num: 27, name: '小明', day: '2026-11-4' });
  const levels = new Set(); for (let n = 1; n <= 99; n++) levels.add(drawFortune(Math.random, { num: n, name: '小明', day: '2026-11-3' }).level);
  assert.ok(levels.size >= 6, [...levels].join()); assert.ok(c.no === 27);
  const r = drawFortune(() => 0.5); assert.ok(r.no >= 1 && r.no <= 99);
  assert.ok(fortuneBanner('小明', a).includes('第27号') && fortuneBanner('小明', a).includes('小建议'));
  assert.ok(fortuneSpeech('小明', a).includes('小建议'));
  const all = [...FORTUNES.map(x => x.level + x.text + x.poem), fortuneBanner('小明', a), fortuneSpeech('小明', a)].join('');
  assert.ok(!/签|运势|吉|凶|宜|忌|五行|方位|贵人/.test(all), '不出现占卜用语');
});

test('礼物款：粉金材质+铭牌写礼物名，到达/出炉横幅，打完在台上停留展示', () => {
  assert.ok(html.includes("liveEvent(kind,{name,avatar},n,v.raw,'礼物·'+gname,true,{gift:true,giftName:gname});celebrateGift(name,gname,n)"));
  assert.ok(html.includes("v.gift?'🎁 '+(v.giftName||'礼物')+'款'"));
  assert.ok(html.includes('porcelain.color.set(0xf2a3bd)'));
  assert.ok(html.includes('if(elapsed>.55&&held>=showcaseMs)'));
  const src = html.slice(html.indexOf('function showcaseHold'), html.indexOf('function giftFlash'));
  const showcaseHold = new Function(src + ';return showcaseHold')();
  assert.equal(showcaseHold({ name: 'a' }), 0, '普通评论不停留');
  assert.equal(showcaseHold({ gift: true, filler: true }), 0);
  assert.equal(showcaseHold({ gift: true, copy: 1, total: 1 }), 6500, '单份礼物停留 6.5 秒');
  assert.equal(showcaseHold({ gift: true, copy: 1, total: 3 }), 2500, '多份中间那几张短停');
  assert.equal(showcaseHold({ gift: true, copy: 3, total: 3 }, 12), 3000, '排队多时缩短');
});

test('自动镜头：只有真实观众的礼物/关注/钻石款切近景，打完回全景；可关闭', () => {
  const src = html.slice(html.indexOf('function isCloseupJob'), html.indexOf('function camGo'));
  const isCloseupJob = new Function(src + ';return isCloseupJob')();
  assert.ok(isCloseupJob({ live: true, gift: true }));
  assert.ok(isCloseupJob({ live: true, gold: true }));
  assert.ok(isCloseupJob({ live: true, diamond: true }));
  assert.ok(!isCloseupJob({ live: true }), '评论/点赞全景');
  assert.ok(!isCloseupJob({ live: true, gift: true, filler: true }), '填充不切');
  assert.ok(!isCloseupJob({ gold: true }), '演示不切');
  assert.ok(html.includes('if(isCloseupJob(active))camEnterClose(active);else camReturnHome();'));
  assert.ok(html.includes("beginTransfer();if(!(queue[0]&&isCloseupJob(queue[0])))camReturnHome()"));
  assert.ok(html.includes("controls.addEventListener('start',()=>{camTween=null})"), '手动拖动立即接管');
  assert.ok(html.includes("localStorage.setItem('printer-auto-cam'"));
});

test('关注/送礼后不再重复打普通头像：撤掉排队中的普通款，2 分钟内进场/点赞/普通评论不再入队，抽签保留', () => {
  const src = html.slice(html.indexOf('const SPECIAL_SKIP_MS'), html.indexOf('// 队列保鲜：'));
  const mk = new Function('queue', src + ';return {specialAt,recentSpecial,dropPlainJobs,SPECIAL_SKIP_MS}');
  const queue = [{ name: 'A', source: '进场' }, { name: 'A', priority: true, gold: true }, { name: 'B' }, { name: 'A', fortune: { no: 1 } }, { name: 'A', source: '点赞', fromLike: true }];
  const h = mk(queue);
  assert.equal(h.dropPlainJobs('A'), 2);
  assert.deepEqual(queue.map(j => j.name + (j.gold ? 'G' : j.fortune ? 'F' : '')), ['AG', 'B', 'AF']);
  const now = 1e6; h.specialAt.set('A', now);
  assert.ok(h.recentSpecial('A', now + 1000)); assert.ok(!h.recentSpecial('A', now + h.SPECIAL_SKIP_MS + 1)); assert.ok(!h.recentSpecial('B', now));
  assert.ok(html.includes("if(!filler&&RULES[type].priority&&added.length){specialAt.set(user.name,nowMs);dropPlainJobs(user.name)}"));
  assert.ok(html.includes("if(markLive&&type==='like'&&recentSpecial(user&&user.name)){if(sourceTag!=='评论')return;if(!(extra&&(extra.fortune||extra.keepsake))&&goldPending(user.name))"));
});

test('刚关注的人：金色款还在排队/打印时普通评论只给回执，打完后评论照常排队', () => {
  const src = html.slice(html.indexOf('const SPECIAL_SKIP_MS'), html.indexOf('// 队列保鲜：'));
  const queue = [];
  const h = new Function('queue', 'let active=null;' + src + ';return {goldPending,setActive:a=>{active=a}}')(queue);
  assert.equal(h.goldPending('A'), false);
  queue.push({ name: 'A', priority: true, gold: true });
  assert.equal(h.goldPending('A'), true);
  queue.length = 0; h.setActive({ name: 'A', priority: true });
  assert.equal(h.goldPending('A'), true, '正在打印金色款');
  h.setActive({ name: 'B' });
  assert.equal(h.goldPending('A'), false, '打完了');
});

test('吉利数 666/888/999/520/1314 打特殊款，三位以上普通数字不算', () => {
  assert.deepEqual(parseFortune('666'), { num: 0, lucky: '666' });
  assert.deepEqual(parseFortune('6666666'), { num: 0, lucky: '666' });
  assert.deepEqual(parseFortune('888'), { num: 0, lucky: '888' });
  assert.deepEqual(parseFortune('520'), { num: 0, lucky: '520' });
  assert.deepEqual(parseFortune('1314'), { num: 0, lucky: '1314' });
  assert.equal(parseFortune('100'), null);
  assert.deepEqual(parseFortune('66'), { num: 66 });
  const f = drawFortune(Math.random, { num: 0, name: 'A', lucky: '666' });
  assert.equal(f.level, '六六大顺卡'); assert.equal(f.no, '666'); assert.ok(f.lucky && f.great);
  assert.ok(fortuneSpeech('A', f).includes('六六大顺'));
});
