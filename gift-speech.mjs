// 互动播报：默认用数据桥的「自然人声」（edge-tts 微软神经网络语音，http://127.0.0.1:8765/tts），
// 生成失败或没有数据桥时自动退回浏览器自带语音。台词口语化、随机挑选，昵称里的表情符号不念。
export function spokenName(name, max = 8) {
  let s = String(name || '').replace(/[<>\n\r]/g, '');
  if (/^用户\d{6,}$/.test(s) || /^\d{6,}$/.test(s)) return '新朋友';
  s = s.replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, '');
  if (!s) return '这位朋友';
  return [...s].slice(0, max).join('');
}
// 念出来之前整句再洗一遍：去掉表情和装饰符号、长串数字，避免合成语音硬读。
export function speakable(text) {
  return String(text || '')
    .replace(/用户\d{6,}/g, '新朋友')
    .replace(/\d{7,}/g, '')
    .replace(/[^\p{Script=Han}\p{L}\p{N}\s，。！？、,.!?~～：:；;“”"'（）()%+\-·]+/gu, '')
    .replace(/～/g, '，')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
const pickFrom = (list, rand = Math.random) => list[Math.floor(rand() * list.length)];

export class GiftSpeech {
  constructor(onStatus = () => { }) {
    this.enabled = true; this.volume = .85; this.rate = 1.08; this.voiceURI = ''; this.onStatus = onStatus;
    this.unlocked = false; this.previous = -1; this.queue = []; this.speaking = false; this.generation = 0;
    this.onSpeech = () => { }; this.greeted = new Map(); this.thanked = new Map(); this.now = () => Date.now();
    // 自然人声：engine 'natural' 走数据桥 edge-tts；'system' 只用浏览器语音。
    this.engine = 'natural'; this.ttsBase = 'http://127.0.0.1:8765'; this.ttsVoice = 'zh-CN-XiaoxiaoNeural';
    this.naturalDownUntil = 0; this.audio = null;
  }
  // 人多时防重复：同一个人 10 分钟内只欢迎一次、30 分钟内只谢一次关注；排队超过 3 条时，新进场合并成一句「欢迎A、B等N位朋友」。
  static GREET_MS = 600000; static THANK_MS = 1800000; static CROWD = 3; static NATURAL_RETRY_MS = 60000; static NATURAL_WAIT_MS = 4000; static GUARD_MIN_MS = 12000
  key(name) { return String(name).replace(/[<>\n\r]/g, '').slice(0, 24) }
  seen(map, name, ms) { const k = this.key(name), t = map.get(k); if (t != null && this.now() - t < ms) return true; map.set(k, this.now()); if (map.size > 500) for (const [kk, tt] of map) if (this.now() - tt > ms) map.delete(kk); return false }
  drop(name) { const k = this.key(name); this.queue = this.queue.filter(q => !(q.who === k && q.kind === 'welcome')); for (const q of this.queue) if (q.kind === 'crowd' && q.names.includes(k)) { q.names = q.names.filter(n => n !== k); q.text = this.crowdText(q.names) } this.queue = this.queue.filter(q => q.kind !== 'crowd' || q.names.length) }
  crowdText(names) { const shown = names.slice(0, 3).map(n => spokenName(n, 6)).join('、'); return names.length > 3 ? this.pick([`欢迎${shown}等${names.length}位朋友！评论666打头像，点关注打金色大图！`, `哇，一下来了好多人，欢迎${shown}等${names.length}位朋友！发个弹幕就给你打头像！`]) : this.pick([`欢迎${shown}！评论666，就能打你的头像！`, `${shown}，欢迎欢迎！发个弹幕，头像给你安排上！`]) }
  voices() { return globalThis.speechSynthesis?.getVoices() || [] }
  preferred() { const voices = this.voices(); return voices.find(v => v.voiceURI === this.voiceURI) || voices.find(v => /zh|cmn/i.test(v.lang) && /xiaoxiao|xiaoyi|huihui|yaoyao|female|女/i.test(v.name)) || voices.find(v => /zh-CN/i.test(v.lang)) || voices.find(v => /^zh/i.test(v.lang)) }
  text(name, gift, amount) {
    const n = spokenName(name), a = amount, g = gift;
    const phrases = [`哇，谢谢${n}的${a}个${g}！`, `${n}送了${a}个${g}，谢谢宝！`, `感谢${n}的${a}个${g}，爱了爱了！`, `${n}的${a}个${g}收到啦，比心！`, `哎呀${n}破费啦，${a}个${g}，谢谢谢谢！`, `谢谢${n}的${a}个${g}，今天你必须好运！`, `${n}，${a}个${g}收到，你最棒！`, `来来来，感谢${n}送的${a}个${g}！`, `${n}的${a}个${g}到了，谢谢你呀！`, `收到${n}的${a}个${g}，开心！`];
    let i = Math.floor(Math.random() * phrases.length); if (i === this.previous) i = (i + 1) % phrases.length; this.previous = i; return phrases[i]
  }
  printing(name, finished = false, invite = false) {
    if (!this.unlocked || !this.enabled) return; const n = spokenName(name);
    const options = finished ? [`${n}，打好啦，快看！`, `${n}的头像出炉了，好看吧？`, `叮，${n}的打好了！`, `${n}，你的做好了，看看满不满意。`, `好啦${n}，新鲜出炉！`] : [`${n}，到你啦！`, `轮到${n}了，开打！`, `${n}的头像，安排上！`, `好嘞，开始给${n}打印！`, `${n}，机器动起来了，稍等一下下。`];
    if (this.speaking || this.queue.length) return; let text = this.pick(options);
    if (finished && invite && this.inviteReady()) text += this.pick(['喜欢就点个关注，下次给你打金色的！', '点个关注呗，下回直接升级金色大图！']);
    this.enqueue(text)
  }
  // 关注邀请统一限频（默认 45 秒一次），避免每个进场/成品都念一遍。
  inviteReady(now = Date.now(), gap = 45000) { if (now - (this.lastInvite || 0) < gap) return false; this.lastInvite = now; return true }
  pick(list) { return pickFrom(list) }
  thankFollow(name) { this.unlocked = true; const safe = this.key(name), n = spokenName(name); if (this.seen(this.thanked, name, GiftSpeech.THANK_MS)) return; this.greeted.set(safe, this.now()); this.drop(name); this.enqueue(this.pick([`谢谢${n}的关注！金色大头像，马上插队给你打！`, `哇，${n}关注啦！走，金色大图安排！`, `欢迎${n}成为新粉丝！金色头像插个队，马上就好。`]), { who: safe, kind: 'follow' }) }
  welcomeBack(name, visits, owned, total = 5) { this.unlocked = true; const safe = this.key(name), n = spokenName(name); if (this.seen(this.greeted, name, GiftSpeech.GREET_MS)) return; const left = total - owned; const tail = owned >= total ? '图鉴都集齐啦，钻石款等着你！' : owned > 0 ? `图鉴集了${owned}种，再集${left}种就有钻石款！` : '今天再来抽张材质卡吧！'; this.enqueue(this.pick([`哎，${n}又来啦！第${visits}天了。`, `老朋友${n}来啦，第${visits}天打卡！`, `欢迎回来${n}，第${visits}天见到你啦！`]) + tail, { who: safe, kind: 'welcome' }) }
  cardDone(name, diamond = false) { this.unlocked = true; const n = spokenName(name); this.enqueue(diamond ? `${n}的钻石款出炉啦，全场最闪！` : `恭喜${n}集齐五种材质！下一张直接钻石款！`) }
  idleTip(text) { if (!this.unlocked || !this.enabled || this.speaking || this.queue.length || !text) return false; this.enqueue(String(text)); return true }
  idleInvite() { if (!this.unlocked || !this.enabled || this.speaking || this.queue.length) return false; this.enqueue(this.pick(['刚进来的朋友，随便发个弹幕，就给你打头像；点个关注，直接金色大图！', '新来的朋友，评论666打小图，点关注打金色大图，试试呗！', '想要自己的头像吗？发个弹幕就行，点关注还能打金色的！'])); return true }
  welcome(name, invite = false) {
    this.unlocked = true; const safe = this.key(name); if (!safe || this.seen(this.greeted, name, GiftSpeech.GREET_MS)) return;
    const crowd = this.queue.find(q => q.kind === 'crowd'); if (crowd) { if (!crowd.names.includes(safe)) { crowd.names.push(safe); crowd.text = this.crowdText(crowd.names) } return }
    const waiting = this.queue.filter(q => q.kind === 'welcome'); if (this.queue.length >= GiftSpeech.CROWD && waiting.length) { const names = waiting.map(q => q.who).concat(safe); this.queue = this.queue.filter(q => q.kind !== 'welcome'); this.enqueue(this.crowdText(names), { kind: 'crowd', names }); return }
    const n = spokenName(name);
    const lines = [`欢迎${n}！`, `哎，${n}来啦！`, `${n}你好呀！`, `欢迎欢迎，${n}！`, `${n}来啦，坐坐坐！`, `嗨，${n}！`, `欢迎${n}进来玩！`, `来啦${n}，欢迎！`, `${n}来了，欢迎呀！`, `哟，${n}来啦！`];
    let i = Math.floor(Math.random() * lines.length); if (i === this.lastWelcome) i = (i + 1) % lines.length; this.lastWelcome = i; let text = lines[i];
    if (invite && this.inviteReady()) text += this.pick(['点个关注，给你打金色大头像！', '关注一下，金色大图马上插队！']);
    else if (invite) text += this.pick(['报个1到99的数字，帮你抽张幸运卡！', '评论666，马上打你的头像！']);
    else text += this.pick(['随便看看，喜欢就留下。', '今天开开心心的！', '']);
    this.enqueue(text, { who: safe, kind: 'welcome' })
  }
  naturalOn() { return this.engine === 'natural' && typeof globalThis.Audio === 'function' && typeof globalThis.fetch === 'function' && this.now() >= this.naturalDownUntil }
  ttsUrl(text) { const rate = Math.round((Number(this.rate) - 1) * 100); return String(this.ttsBase).replace(/\/+$/, '') + '/tts?voice=' + encodeURIComponent(this.ttsVoice) + '&rate=' + rate + '&text=' + encodeURIComponent(text) }
  // 进队就开始预取音频，轮到它时基本已经生成好了。
  prefetch(item) { if (item.ready || !this.naturalOn()) return; const text = speakable(item.text); if (!text) return; item.ready = fetch(this.ttsUrl(text)).then(r => r.ok ? r.blob() : Promise.reject(new Error('tts ' + r.status))); item.ready.catch(() => { }) }
  enqueue(text, meta = {}) {
    if (!this.enabled) return; text = String(text); if (this.queue.some(q => q.text === text)) return;
    if (!globalThis.speechSynthesis && !this.naturalOn()) { this.onStatus('当前浏览器不支持语音播报'); return }
    const first = meta.kind === 'follow';
    if (this.queue.length >= 12) { let i = -1; if (first) for (let k = this.queue.length - 1; k >= 0; k--) if (this.queue[k].kind !== 'follow') { i = k; break } if (i < 0) { this.onStatus('播报队列已满，本次仅显示字幕：' + text); return } this.queue.splice(i, 1) }
    const item = { text, ...meta }; if (first) { let at = this.queue.findIndex(q => q.kind !== 'follow'); if (at < 0) at = this.queue.length; this.queue.splice(at, 0, item) } else this.queue.push(item);
    // 关注感谢插到队首（排在更早的关注感谢之后），队列满时挤掉最后一条普通播报。
    if (this.queue.indexOf(item) < 3) this.prefetch(item);
    this.pump()
  }
  say(name, gift, amount = 1) { this.unlocked = true; this.enqueue(this.text(name, gift, amount)) }
  // 看门狗：Chrome 的语音引擎/音频偶尔会“卡住”（speaking 一直为真或无声播完），手动切换一下才恢复。
  // 每句设上限时长，超时就重置引擎并继续下一句，不用人去点。
  guard(text, token) { clearTimeout(this.guardTimer); const ms = Math.max(GiftSpeech.GUARD_MIN_MS, String(text).length * 450); this.guardTimer = setTimeout(() => { if (token !== this.generation || !this.speaking) return; this.onStatus('播报卡住了，已自动重置语音引擎'); this.reset(); this.done(token) }, ms) }
  reset() { this.utterance = null; try { if (this.audio) { this.audio.onended = this.audio.onerror = null; this.audio.pause(); this.audio = null } } catch (e) { } try { globalThis.speechSynthesis?.cancel() } catch (e) { } }
  done(token) { if (token !== this.generation) return; clearTimeout(this.guardTimer); this.speaking = false; this.audio = null; this.pump() }
  pump() {
    if (!this.enabled || this.speaking || !this.queue.length) return;
    const item = this.queue.shift(), token = this.generation; this.speaking = true; this.onStatus(item.text); this.guard(item.text, token);
    for (const q of this.queue.slice(0, 2)) this.prefetch(q);
    if (this.naturalOn() || item.ready) { this.playNatural(item, token); return }
    this.playSystem(item.text, token)
  }
  emit(state, text) { try { this.onSpeech({ state, text }) } catch (e) { } }
  playNatural(item, token) {
    this.prefetch(item);
    const fallback = err => { if (token !== this.generation) return; this.naturalDownUntil = this.now() + GiftSpeech.NATURAL_RETRY_MS; this.onStatus('自然人声暂不可用（' + (err && err.message || err) + '），先用浏览器语音：' + item.text); this.playSystem(item.text, token) };
    if (!item.ready) { fallback(new Error('无可读文字')); return }
    // 轮到这句时最多等 4 秒；还没生成好就这句先用浏览器语音（不判定故障，音频照样进缓存）。
    let late = false; const wait = setTimeout(() => { late = true; if (token === this.generation) this.playSystem(item.text, token) }, GiftSpeech.NATURAL_WAIT_MS);
    item.ready.finally(() => clearTimeout(wait)).catch(() => { });
    item.ready.then(blob => {
      if (late) return;
      if (token !== this.generation) return;
      const url = URL.createObjectURL(blob), a = new Audio(url); this.audio = a; a.volume = this.volume;
      let tick = null, ended = false;
      const end = () => { if (ended) return; ended = true; clearInterval(tick); URL.revokeObjectURL(url); this.emit('end', item.text); this.done(token) };
      a.onplay = () => { this.emit('start', item.text); tick = setInterval(() => this.emit('boundary', item.text), 200) };
      a.onended = end; a.onerror = () => { if (ended) return; ended = true; clearInterval(tick); URL.revokeObjectURL(url); fallback(new Error('音频播放失败')) };
      const p = a.play(); if (p && p.catch) p.catch(e => { if (ended) return; ended = true; clearInterval(tick); URL.revokeObjectURL(url); fallback(e) });
    }, e => { if (!late) fallback(e) })
  }
  playSystem(text, token) {
    if (!globalThis.speechSynthesis || typeof globalThis.SpeechSynthesisUtterance !== 'function') { this.speaking = false; this.onStatus('当前浏览器不支持语音播报'); return }
    // 说新一句前先清掉引擎里残留的状态，避免“卡住不出声”。
    try { if (speechSynthesis.speaking || speechSynthesis.pending) { this.utterance = null; speechSynthesis.cancel() } } catch (e) { }
    const u = new SpeechSynthesisUtterance(speakable(text) || text); const voice = this.preferred(); if (voice) u.voice = voice;
    u.lang = voice?.lang || 'zh-CN'; u.rate = this.rate; u.pitch = 1; u.volume = this.volume;
    u.onstart = () => this.emit('start', text); u.onboundary = () => this.emit('boundary', text);
    this.utterance = u; const stale = () => this.utterance !== u;
    u.onend = () => { if (stale()) return; this.emit('end', text); this.done(token) };
    u.onerror = e => { if (stale()) return; this.emit('end', text); if (token !== this.generation) return; this.speaking = false; this.onStatus('语音播放失败：' + e.error + '，请点击试听或更换语音'); this.queue = [] };
    speechSynthesis.speak(u)
  }
  stop() { this.emit('end', ''); this.generation++; this.queue = []; this.speaking = false; try { if (this.audio) { this.audio.pause(); this.audio = null } } catch (e) { } globalThis.speechSynthesis?.cancel() }
}
