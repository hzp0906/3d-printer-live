import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('所有自动头像填充入口都受自动演示开关控制', () => {
  assert.ok(source.includes('function idleTestFill(){if(!autoDemo||paused'), '30秒冷场补单应受开关控制');
  assert.ok(source.includes('setTimeout(()=>{if(liveEverConnected||!autoDemo)return;'), '启动演示应受开关控制');
  assert.ok(source.includes('if(autoDemo&&!queue.length&&!busy)lastSnapshotPeople.slice(0,4)'), ' hello观众填充应受开关控制');
  assert.ok(source.includes('if(liveMode&&autoDemo&&!paused&&!busy&&!queue.length'), '定时观众填充应受开关控制');
  assert.ok(source.includes('if(!liveMode&&autoDemo){shuffled.slice(0,6)'), '预置头像填充应受开关控制');
});

test('点赞和进场各打印一张小头像，关注打印金色大头像', () => {
  assert.ok(source.includes("else if(type==='like'){const n=Math.max(1,Math.min(100,Number(v.count)||1));liveStats.like+=n;liveRoom=liveRoom||v.room||'';updateLiveStats();if(likePrintReady()){const lb=queue.length;liveEvent('like',{name,avatar},1,null,'点赞');if(queue.length>lb)lastLikePrintAt=Date.now()}energyLike(name,avatar,n);if(gameMode==='printer')likeKing.add(name,avatar,n)}"));
  assert.ok(source.includes('const LIKE_PRINT_MS=5000;'), '点赞全场每 5 秒最多排一张');
  assert.ok(source.includes("else if(type==='follow'){if(fanBook.markFan(name,avatar))wallFlash(name);giftSpeech.thankFollow(name);liveEvent('follow',{name,avatar},1,null,'关注');celebrateFollow(name)}"));
  assert.ok(source.includes("else if(type==='join'){if(fv&&fv.returning)greetReturning(name,fv);else giftSpeech.welcome(name,true);const before=new Set(queue);liveEvent('like',{name,avatar},1,null,'进场');"));
});

test('关闭选择会保存，数据桥状态变化不会篡改用户偏好', () => {
  assert.ok(source.includes('socket.onclose='), '应处理数据桥断连');
  assert.ok(source.includes('setAutoDemo(autoDemoPreference);clearTimeout(timer)'), '断连后应恢复用户选择而非强制开启');
  assert.ok(source.includes('updateScreen();setAutoDemo(false)'), '连接后临时关闭自动演示');

  const start = source.indexOf('function setAutoDemo(on,persist=false){');
  const code = source.slice(start, source.indexOf('autoButton.onclick=', start)) + 'return setAutoDemo;';
  const stored = new Map();
  const localStorage = { setItem: (key, value) => stored.set(key, value) };
  const autoButton = { textContent: '', attrs: {}, setAttribute(key, value) { this.attrs[key] = value; } };
  const setAutoDemo = new Function('autoDemo', 'autoDemoPreference', 'autoButton', 'localStorage', code)(true, true, autoButton, localStorage);

  setAutoDemo(false, true);
  assert.equal(autoButton.textContent, '自动演示：关');
  assert.equal(stored.get('printer-auto-demo'), 'off');
  setAutoDemo(true, false);
  assert.equal(autoButton.textContent, '自动演示：开');
  assert.equal(stored.get('printer-auto-demo'), 'off', '临时状态变化不应覆盖关闭偏好');
});
