import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const liveHtml = readFileSync(new URL('./live.html', import.meta.url), 'utf8');
const popupStart = source.indexOf('liveButton.onclick=');
const popup = source.slice(popupStart, source.indexOf('setInterval(()=>{if(liveSaved', popupStart));
const restoreStart = source.indexOf('function restoreLive(){');
const restore = source.slice(restoreStart, source.indexOf('liveButton.onclick=', restoreStart));

test('竖屏弹窗使用视频流镜像，不跨窗口移动WebGL画布', () => {
  assert.ok(popup.includes('renderer.domElement.captureStream(30)'));
  assert.ok(popup.includes('liveVideo.srcObject=liveStream'));
  assert.ok(popup.includes('replaceChildren(liveVideo)'));
  assert.ok(!popup.includes('replaceChildren(renderer.domElement)'));
  assert.ok(liveHtml.includes('#scene video{'));
});

test('关闭弹窗停止视频轨道并恢复主页面', () => {
  assert.ok(restore.includes('stopLiveMirror()'));
  assert.ok(restore.includes('liveNotice.remove()'));
  assert.ok(restore.includes('camera.position.copy(liveSaved.position)'));
  const stopStart = source.indexOf('function stopLiveMirror(){');
  const stop = source.slice(stopStart, restoreStart);
  assert.ok(stop.includes('liveVideo.srcObject=null'));
  assert.ok(stop.includes('track.stop()'));
});

test('弹窗限制1倍渲染且可见时避免重复隐藏帧循环', () => {
  const resizeStart = source.indexOf('function resize(){');
  const resize = source.slice(resizeStart, source.indexOf("window.addEventListener('resize'", resizeStart));
  assert.ok(resize.includes('renderer.setPixelRatio(live?1:'));
  assert.ok(resize.includes('renderer.setSize(w,h,false)'));

  const match = source.match(/setInterval\(\(\)=>\{const liveVisible=([^;]+);if\((document\.hidden&&!liveVisible&&!paused)\)animate\(performance\.now\(\)\)\},250\)/);
  assert.ok(match, '应使用弹窗可见性保护隐藏帧循环');
  const shouldDrive = new Function('document', 'liveWindow', 'paused',
    `const liveVisible=${match[1]};return ${match[2]};`);
  assert.equal(shouldDrive({ hidden: true }, { closed: false, document: { hidden: false } }, false), false);
  assert.equal(shouldDrive({ hidden: true }, { closed: false, document: { hidden: true } }, false), true);
  assert.equal(shouldDrive({ hidden: true }, null, false), true);
});

test('弹窗模式使用主窗口30FPS定时器并可在关闭后恢复rAF', () => {
  const schedulerStart = source.indexOf('let animScheduled=false');
  const schedulerCode = source.slice(schedulerStart, source.indexOf('function animate(', schedulerStart));
  const code = `let liveWindow=null;${schedulerCode}
    return {setLive:value=>{liveWindow=value},requestAnimate,refreshAnimationHost};`;
  const main = {
    document: { hidden: false }, requests: 0, cancels: 0, timeouts: 0, clearTimeouts: 0,
    callback: null, timerCallback: null, delay: 0,
    requestAnimationFrame(callback) { this.requests++; this.callback = callback; return this.requests; },
    cancelAnimationFrame() { this.cancels++; },
    setTimeout(callback, delay) { this.timeouts++; this.timerCallback = callback; this.delay = delay; return this.timeouts; },
    clearTimeout() { this.clearTimeouts++; }
  };
  let animateCalls = 0;
  const api = new Function('window', 'document', 'animate', code)(main, { addEventListener() {} }, () => { animateCalls++; });

  api.requestAnimate();
  assert.equal(main.requests, 1);
  api.setLive({ closed: false });
  api.refreshAnimationHost();
  assert.equal(main.cancels, 1, '应取消主窗口滞留rAF');
  assert.equal(main.timeouts, 1, '弹窗模式应使用主窗口定时器');
  assert.equal(main.delay, 1000 / 30);
  main.timerCallback();
  assert.equal(animateCalls, 1);
  api.setLive(null);
  api.refreshAnimationHost();
  assert.equal(main.clearTimeouts, 1, '关闭弹窗应清理定时器');
  assert.equal(main.requests, 2, '关闭弹窗后应恢复rAF');
});

test('弹窗模式同时挂弹窗 rAF，主窗口被遮挡时也能出帧；并上报帧率', () => {
  assert.match(source, /popRaf=liveWindow\.requestAnimationFrame/);
  assert.match(source, /type:'perf',fps:/);
});
