import {test} from 'node:test';import {gzipSync} from 'node:zlib';import assert from 'node:assert/strict';
import {parseChatLine,mapGift,parseLike,diffNew,allocateLikes,normKey,pbDecode,extractUser,isJunkName,chromeCandidates,emitLike,emitFollow,emitJoinWS,allowPersonEvent,_injectHubForTest,decodeChat,decodeGift,giftDelta,dedupeCross,commentKey,emitComment,handleWSFrame,enqueueHover,hoverPending,collectInterval,isUsefulCdpMessage} from './douyin-bridge.mjs';

test('评论解析',()=>{assert.deepEqual(parseChatLine('天观星系：打印了'),{kind:'comment',name:'天观星系',text:'打印了'});assert.deepEqual(parseChatLine('马达研究者：666'),{kind:'comment',name:'马达研究者',text:'666'})});
test('礼物解析(空格形态)',()=>{const r=parseChatLine('蛋小黑 送出 大啤酒 x2');assert.equal(r.kind,'gift');assert.equal(r.name,'蛋小黑');assert.equal(r.gift,'大啤酒');assert.equal(r.count,2)});
test('礼物解析(冒号形态与默认数量)',()=>{const a=parseChatLine('蛋小黑：送出 棒棒糖 x3');assert.equal(a.kind,'gift');assert.equal(a.gift,'棒棒糖');assert.equal(a.count,3);const b=parseChatLine('蛋小黑 送出了 爱心');assert.equal(b.kind,'gift');assert.equal(b.gift,'爱心');assert.equal(b.count,1)});
test('礼物映射四类',()=>{assert.equal(mapGift('大啤酒'),'beer');assert.equal(mapGift('小心心'),'heart');assert.equal(mapGift('红心'),'heart');assert.equal(mapGift('棒棒糖'),'lollipop');assert.equal(mapGift('嘉年华'),'other')});
test('进场与系统消息',()=>{assert.deepEqual(parseChatLine('小小水晶球 来了'),{kind:'join',name:'小小水晶球'});assert.equal(parseChatLine('欢迎来到直播间！抖音严禁未成年人直播或礼物消费。').kind,'system');assert.equal(parseChatLine(''),null);assert.equal(parseChatLine(null),null)});
test('真实点赞文案识别',()=>{assert.deepEqual(parseChatLine('来来💫：为主播点赞了'),{kind:'like',name:'来来💫'});assert.deepEqual(parseChatLine('梦溪清夏 为主播点赞了'),{kind:'like',name:'梦溪清夏'})});
test('多种真实进场文案识别',()=>{for(const text of ['拾光者：进入直播间','笑着藏着哭 进来了','小茄子🍆 进入了直播间','水门 来了']){const r=parseChatLine(text);assert.equal(r.kind,'join',text);assert.ok(r.name)}});
test('评论与进场先发后补：不再排队等待资料卡补取',async()=>{const {readFileSync}=await import('node:fs');const src=readFileSync(new URL('./douyin-bridge.mjs',import.meta.url),'utf8');assert.ok(!src.includes('commentResolution'),'不应再有串行等待头像的评论链');const start=src.indexOf('function handle(s)');const block=src.slice(start,src.indexOf('pollFollowers();',start));assert.ok(block.includes("emitJoinWS({ name: ev.name, avatar })"));assert.ok(block.includes("emitComment({ name: ev.name, avatar }, ev.text, 'dom')"));assert.ok(block.includes('lastWsChatAt > 30000'),'协议评论工作时页面不重复发送');});
test('不同用户连续进场不被拦截，同一用户短时间去重',()=>{assert.equal(allowPersonEvent('join','用户甲',10000,100000),true);assert.equal(allowPersonEvent('join','用户乙',10000,100001),true);assert.equal(allowPersonEvent('join','用户甲',10000,100002),false);assert.equal(allowPersonEvent('join','用户甲',10000,110001),true)});
test('同一观众点赞每10秒最多打印1次',()=>{assert.equal(allowPersonEvent('like','点赞用户甲',10000,200000),true);assert.equal(allowPersonEvent('like','点赞用户甲',10000,200001),false);assert.equal(allowPersonEvent('like','点赞用户乙',10000,200002),true);assert.equal(allowPersonEvent('like','点赞用户甲',10000,210000),true)});
test('协议点赞关注进场均能向打印页面发送',()=>{
  const sent=[];_injectHubForTest({broadcast:e=>sent.push(e)});
  try{
    emitLike({name:'协议点赞用户',avatar:'a'},1);
    emitLike({name:'协议点赞用户',avatar:'a'},1);
    emitFollow({name:'协议关注用户',avatar:'f'});
    emitJoinWS({name:'协议进场用户',avatar:'j'});
    assert.deepEqual(sent.map(e=>e.type),['like','follow','join']);
    assert.equal(sent[0].count,1);assert.equal(sent[0].name,'协议点赞用户');assert.equal(sent[2].name,'协议进场用户');
  }finally{_injectHubForTest(null)}
});
test('点赞计数解析',()=>{assert.equal(parseLike('100本场点赞'),100);assert.equal(parseLike('8 本场点赞'),8);assert.equal(parseLike('70.1万本场点赞'),701000);assert.equal(parseLike('71.1万本场点赞'),711000);assert.equal(parseLike('人气榜100+'),null)});
test('增量弹幕去重与顶端裁剪',()=>{const seen=new Set();assert.equal(diffNew(['天观星系：11111','马达研究者：打印'],seen).length,2);assert.equal(diffNew(['天观星系：11111','马达研究者：打印'],seen).length,0);assert.deepEqual(diffNew(['天观星系：11111','马达研究者：打印','蛋小黑：为啥没我?'],seen),['蛋小黑：为啥没我?']);assert.equal(diffNew(['马达研究者：打印','蛋小黑：为啥没我?'],seen).length,0)});
test('同文连发不去重',()=>{const seen=new Set();assert.equal(diffNew(['天观星系：999','天观星系：999'],seen).length,2);assert.equal(diffNew(['天观星系：999','天观星系：999'],seen).length,0)});
test('未知行不产生事件',()=>{assert.equal(parseChatLine('小时榜100+'),null);assert.equal(parseChatLine('原画可试看25s'),null)});
test('昵称归一化匹配头像',()=>{assert.equal(normKey('小 明 🌸'),'小明');assert.equal(normKey('  花火 '),'花火');assert.equal(normKey('😭👍豆豆'),'豆豆')});
test('macOS 浏览器路径与自定义路径',()=>{
  const paths=chromeCandidates('darwin',{HOME:'/Users/test'});
  assert.ok(paths.includes('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));
  assert.ok(paths.includes('/Users/test/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));
  assert.equal(chromeCandidates('darwin',{CHROME_PATH:'/custom/Chrome'})[0],'/custom/Chrome');
  assert.ok(chromeCandidates('win32',{}).some(p=>p.endsWith('chrome.exe')),'保留 Windows 浏览器路径');
});
test('protobuf解码：从协议消息提取昵称和头像',()=>{
  const fld=(n,payload)=>{const out=[(n<<3)|2];let l=payload.length;do{let b=l&0x7f;l>>>=7;if(l)b|=0x80;out.push(b)}while(l);return Buffer.concat([Buffer.from(out),payload])};
  const avatar='https://p3.douyinpic.com/aweme-avatar/testABC~tplv-obj.image';
  const user=Buffer.concat([fld(3,Buffer.from('小明','utf8')),fld(6,Buffer.from(avatar,'utf8'))]);
  const chat=Buffer.concat([fld(4,Buffer.from('666','utf8')),fld(7,user)]);
  const u=extractUser(chat);assert.equal(u.name,'小明');assert.equal(u.avatar,avatar);
  const nested=Buffer.concat([fld(1,Buffer.from([0x08,0x01])),fld(2,user)]);
  const u2=extractUser(nested);assert.equal(u2.name,'小明');
});
test('关注消息解析',()=>{assert.deepEqual(parseChatLine('小团 关注了主播'),{kind:'follow',name:'小团'});assert.deepEqual(parseChatLine('小团：关注了主播'),{kind:'follow',name:'小团'})});
test('垃圾名过滤',()=>{assert.equal(isJunkName('送出了'),true);assert.equal(isJunkName('远山观势前天分享[视频]'),true);assert.equal(isJunkName('小时榜'),true);assert.equal(isJunkName('冰雨格格'),false);assert.equal(parseChatLine('送出了 大啤酒 x1'),null);assert.equal(parseChatLine('远山观势前天分享[视频]：好看'),null)});
test('群聊私聊昵称过滤与直播结束保护',async()=>{
  for(const name of ['粉丝2群19','粉丝49群','陌生人消息','群聊邀请','某某的AI分身'])assert.equal(isJunkName(name),true,name);
  const {readFileSync}=await import('node:fs');const src=readFileSync(new URL('./douyin-bridge.mjs',import.meta.url),'utf8');
  assert.ok(src.includes("window.__ended = bodyText.includes('直播已结束')"),'采集结果应包含直播结束状态');
  assert.ok(src.includes('if (!visible(c) || /陌生人消息|群聊邀请|加入了群聊/'),'应排除不可见和群聊容器');
  assert.ok(src.includes('if (s.ended || (roomEnded && !looksLive)) {'),'直播结束应暂停处理');
  assert.ok(src.includes('export function handleWSFrame(buf) {\n  if (roomEnded) return;'),'直播结束后协议帧不再出事件');
  assert.ok(src.includes('if (!cdpRef || roomEnded || !hub.clientCount()) return;'),'结束后应停止空闲头像补取');
});
test('点赞轮换：交错进行，同一人每轮最多3次，绝不匿名',()=>{const roster=[['甲','a'],['乙','b'],['丙','c']];const st={idx:0,used:new Map()};const e1=allocateLikes(10,roster,st);assert.deepEqual(e1.map(e=>e.name+e.count),['甲1','乙1','丙1','甲1','乙1','丙1','甲1','乙1','丙1','甲1']);assert.ok(e1.every(e=>e.avatar));for(let i=0;i<e1.length-3;i++)assert.notEqual(e1[i].name,e1[i+1].name,'连续同一人');const e2=allocateLikes(3,roster,st);assert.deepEqual(e2.map(e=>e.name+e.count),['乙1','丙1','甲1']);const e3=allocateLikes(2,roster,st);assert.deepEqual(e3.map(e=>e.name+e.count),['乙1','丙1']);assert.deepEqual(allocateLikes(5,[],{idx:0,used:new Map()}),[])});
test('无真头像观众每轮只排1次，有头像者优先',()=>{const roster=[['甲','av'],['乙','']];const st={idx:0,used:new Map()};const e=allocateLikes(4,roster,st);assert.deepEqual(e.map(x=>x.name+x.count),['甲1','乙1','甲2']);const roster2=[['乙',''],['甲','av'],['丙','c']].sort((x,y)=>(Number(!!y[1])-Number(!!x[1])));const st2={idx:0,used:new Map()};const e2=allocateLikes(2,roster2,st2);assert.equal(e2[0].name,'甲','有头像者排前')});

test('悬停头像脚本可以编译，头像缓存供后续事件复用', async()=>{
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('./douyin-bridge.mjs',import.meta.url),'utf8');
  const section=source.slice(source.indexOf('async function resolveHoverBatch'),source.indexOf('async function run(hub)'));
  const expressions=[...section.matchAll(/expression: `([\s\S]*?)`,/g)];
  assert.equal(expressions.length,2);
  for(const [,template] of expressions){
    const expression=new Function('name','return `'+template+'`;')('测试');
    assert.doesNotThrow(()=>new Function(expression));
  }
  assert.ok(source.includes('feedAvatar(n, a)'));
  assert.ok(source.includes('normMap.get(key) || normAvatars[key]'));
});

test('任意普通评论均触发，无关键词限制，包括数字表情和重复内容',()=>{
 for(const text of ['你好','123','😀','随便说点什么','打印'])assert.deepEqual(parseChatLine('小明：'+text),{kind:'comment',name:'小明',text});
 const seen=new Set();assert.equal(diffNew(['小明：😀','小明：😀'],seen).length,2);
});

test('嵌套Image.url_list与昵称同属User时可获取头像',()=>{
 const fld=(n,p)=>{const bytes=[n*8+2];let size=p.length;do{let b=size&127;size>>>=7;if(size)b|=128;bytes.push(b)}while(size);return Buffer.concat([Buffer.from(bytes),p])};
 const avatar='https://p3.douyinpic.com/aweme-avatar/test.jpeg?signature='+ 'a'.repeat(400);
 const user=Buffer.concat([fld(3,Buffer.from('炫 丽')),fld(9,fld(1,Buffer.from(avatar)))]);
 assert.deepEqual(extractUser(fld(2,user)),{name:'炫 丽',avatar});
});

test('悬停可定位单独昵称、冒号昵称，并给出多个点击位置',async()=>{
 const {readFileSync}=await import('node:fs');
 const src=readFileSync(new URL('./douyin-bridge.mjs',import.meta.url),'utf8');
 const section=src.slice(src.indexOf('async function resolveHoverBatch'));
 const template=section.match(/expression: `([\s\S]*?)`,/)[1];
 const expression=new Function('name','return `'+template+'`;')('小明');
 for(const text of ['小明','小明：','小明:','小明：你好']){
   const el={textContent:text,children:[],getBoundingClientRect:()=>({left:100,top:100,bottom:120,width:60,height:20})};
   const doc={querySelectorAll:()=>[el],elementFromPoint:()=>el};
   const result=new Function('document','window','innerWidth','innerHeight','return '+expression)(doc,{__chatRoot:{isConnected:true,querySelectorAll:()=>[el]}},800,600);
   const pts=JSON.parse(result);
   assert.ok(Array.isArray(pts)&&pts.length>=2,'昵称上应给出多个候选点击位置');
   assert.deepEqual({x:pts[0].x,y:pts[0].y},{x:130,y:110},'首选位置保持原靠左偏移');
   assert.ok(pts.every(p=>p.y===110&&p.x>=100&&p.x<160&&p.label));
   assert.equal(new Set(pts.map(p=>p.x+','+p.y)).size,pts.length,'点击位置不重复');
 }
});

test('头像补取多轮换位置点击，等待头像读取，失败后点评论区',async()=>{
 const {resolveHoverBatch,_injectCdpForTest}=await import('./douyin-bridge.mjs');
 async function drive(name,reads,points){
  const calls=[];let readerReads=0;const logs=[];const origLog=console.log,origWarn=console.warn;
  console.log=(...a)=>logs.push(a.join(' '));console.warn=(...a)=>logs.push(a.join(' '));
  try{
   _injectCdpForTest({ rpc: async(method,params)=>{
    if(method!=='Runtime.evaluate'){calls.push({type:params.type,x:params.x,y:params.y});return {result:{value:1}}}
    const ex=params.expression;
    if(ex.includes('.find(e => { const r=e.getBoundingClientRect()'))return {result:{value:false}};
    if(ex.includes('contenteditable'))return {result:{value:{x:5,y:5}}};
    if(ex.includes('__chatRoot'))return {result:{value:JSON.stringify(points)}};
    const v=reads[Math.min(readerReads,reads.length-1)];readerReads++;
    return {result:{value:JSON.stringify(v)}};
   }});
   await resolveHoverBatch([name]);
  }finally{console.log=origLog;console.warn=origWarn;_injectCdpForTest(null)}
  return {calls,readerReads,logs};
 }
 const pts=[{x:130,y:110,label:'左'},{x:112,y:110,label:'靠左'},{x:146,y:110,label:'右'}];
 const a=await drive('测试甲',[{card:false,avatar:''},{card:false,avatar:''},{card:false,avatar:''},{card:true,avatar:''},{card:true,avatar:'https://p3.douyinpic.com/aweme-avatar/ming.jpeg'}],pts);
 assert.deepEqual(a.calls.filter(c=>c.type==='mouseReleased').map(c=>c.x),[130,5,112],'第1轮点靠左，失败后点评论区，第2轮换位置');
 assert.equal(a.readerReads,5,'第1轮快速判3次，第2轮等头像加载2次');
 assert.ok(a.logs.some(l=>l.includes('点击资料卡获取到头像：测试甲')&&l.includes('第2次点击·靠左')));
 const b=await drive('测试乙',[{card:false,avatar:''}],pts);
 assert.deepEqual(b.calls.filter(c=>c.type==='mouseReleased').map(c=>c.x),[130,5,112,5,146,5],'3轮点击轮流换位置，每轮后点一次评论区');
 assert.equal(b.readerReads,9,'每轮快速判3次');
 assert.ok(b.logs.some(l=>l.includes('第1次点击（左）资料卡未出现 测试乙')));
 assert.ok(b.logs.some(l=>l.includes('第3次点击（右）资料卡未出现 测试乙')));
});

test('界面提示不能当作观众昵称',()=>{
 for(const name of ['充钻石客户端壁纸通知消息投稿','互相关注','粉丝团','账号已在其他地方进入直播间'])assert.equal(isJunkName(name),true);
 assert.equal(isJunkName('雅俗'),false);
});

test('资料卡补取发送完整单击事件',async()=>{
 const {clickNickname}=await import('./douyin-bridge.mjs');const calls=[];
 await clickNickname(async(method,params)=>calls.push({method,...params}),120,240);
 assert.deepEqual(calls.map(c=>c.type),['mouseMoved','mousePressed','mouseReleased']);
 assert.ok(calls.every(c=>c.x===120&&c.y===240));assert.equal(calls[1].button,'left');assert.equal(calls[2].clickCount,1);
});

// —— 协议帧直出评论/礼物 ——
const vint=n=>{const o=[];let v=BigInt(n);do{let b=Number(v&127n);v>>=7n;if(v)b|=128;o.push(b)}while(v);return Buffer.from(o)};
const pf=(n,p)=>{const b=Buffer.isBuffer(p)?p:Buffer.from(p);return Buffer.concat([vint(n*8+2),vint(b.length),b])};
const pv=(n,v)=>Buffer.concat([vint(n*8),vint(v)]);
const AV='https://p3.douyinpic.com/aweme-avatar/x.jpeg';
const userPb=name=>Buffer.concat([pv(1,123),pf(3,name),pf(9,pf(1,AV))]);
const common=(id,t)=>Buffer.concat([pf(1,'WebcastChatMessage'),pv(2,id),pv(3,7),pv(4,t)]);
const chatPb=(name,text,id)=>Buffer.concat([pf(1,common(id,Date.now())),pf(2,userPb(name)),pf(3,text)]);
const giftPb=(name,gift,repeat,id,end=0)=>Buffer.concat([pf(1,common(id,Date.now())),pv(2,463),pv(4,1),pv(5,repeat),pf(7,userPb(name)),pv(9,end),pf(15,Buffer.concat([pf(2,'送出了'+gift),pv(5,463),pf(16,gift)]))]);
// PushFrame{seqId=1,payloadEncoding=6,payload=8(gzip Response{messages=1:Message{method=1,payload=2,msgId=3}})}
const frame=(method,body)=>Buffer.concat([pv(1,1),pf(6,'gzip'),pf(8,gzipSync(pf(1,Buffer.concat([pf(1,method),pf(2,body),pv(3,1)]))))]);

test('协议评论解码：昵称、头像、内容、msgId',()=>{const c=decodeChat(chatPb('协议小明','打印我',9001));assert.equal(c.user.name,'协议小明');assert.equal(c.user.avatar,AV);assert.equal(c.content,'打印我');assert.equal(c.msgId,'9001');assert.ok(c.createTime>1e12)});
test('协议礼物解码：礼物名与连击数',()=>{const g=decodeGift(giftPb('送礼人','棒棒糖',3,9101));assert.equal(g.user.name,'送礼人');assert.equal(g.giftName,'棒棒糖');assert.equal(g.repeat,3);assert.equal(g.giftId,'463')});
test('礼物连击只放行增量',()=>{assert.equal(giftDelta('k',1,false,1000),1);assert.equal(giftDelta('k',3,false,1500),2);assert.equal(giftDelta('k',3,false,1600),0);assert.equal(giftDelta('k',4,true,1700),1);assert.equal(giftDelta('k',1,false,1800),1)});
test('协议与页面评论交叉去重，同文连发按次数计',()=>{const k=commentKey('去重甲','666');assert.equal(dedupeCross(k,'ws',0),true);assert.equal(dedupeCross(k,'ws',1),true,'协议连发两次都放行');assert.equal(dedupeCross(k,'dom',2),false);assert.equal(dedupeCross(k,'dom',3),false);assert.equal(dedupeCross(k,'dom',4),true,'第三条只在页面出现，兜底放行');assert.equal(dedupeCross(commentKey('去重乙','a'),'dom',0),true);assert.equal(dedupeCross(commentKey('去重乙','a'),'dom',30000),true,'超出窗口不抵消')});
test('协议帧立即发出评论与礼物，重复帧按 msgId 去重',()=>{const sent=[];_injectHubForTest({broadcast:e=>sent.push(e)});const log=console.log;console.log=()=>{};try{const c=frame('WebcastChatMessage',chatPb('帧评论人','你好',777));handleWSFrame(c);handleWSFrame(c);handleWSFrame(frame('WebcastGiftMessage',giftPb('帧送礼人','啤酒',1,888)));handleWSFrame(frame('WebcastGiftMessage',giftPb('帧送礼人','啤酒',2,889)));assert.deepEqual(sent.map(e=>e.type),['comment','gift','gift']);assert.equal(sent[0].name,'帧评论人');assert.equal(sent[0].text,'你好');assert.equal(sent[0].avatar,AV);assert.equal(sent[1].gift,'beer');assert.equal(sent[1].count,1);assert.equal(sent[2].count,1);assert.equal(emitComment({name:'帧评论人',avatar:''},'你好','dom'),false,'页面随后读到同一条不再重复')}finally{console.log=log;_injectHubForTest(null)}});
test('无头像评论先发出，补到头像后推送 avatar 更新',async()=>{const {_feedAvatarForTest}=await import('./douyin-bridge.mjs');const sent=[];_injectHubForTest({broadcast:e=>sent.push(e)});const log=console.log;console.log=()=>{};try{assert.equal(emitComment({name:'后补头像人',avatar:''},'在吗','dom'),true);assert.equal(sent[0].avatar,'');_feedAvatarForTest('后补头像人',AV);_feedAvatarForTest('后补头像人',AV+'?2');assert.deepEqual(sent.slice(1),[{type:'avatar',name:'后补头像人',avatar:AV}],'只补发一次')}finally{console.log=log;_injectHubForTest(null)}});

test('头像补取队列有界：同名不重复，超上限丢最旧',()=>{hoverPending.length=0;enqueueHover(['a','b','a','c'],3);assert.deepEqual(hoverPending,['a','b','c']);enqueueHover(['d','e'],3);assert.deepEqual(hoverPending,['c','d','e']);hoverPending.length=0});
test('协议活跃时页面轮询降到1秒，否则0.3秒',()=>{assert.equal(collectInterval(100000,95000,0),1000);assert.equal(collectInterval(100000,0,80000),1000);assert.equal(collectInterval(100000,60000,60000),300)});
test('CDP 事件过滤只保留 WebSocket 帧与非 Network 事件',()=>{assert.equal(isUsefulCdpMessage('{"id":3,"result":{}}'),true);assert.equal(isUsefulCdpMessage('{"method":"Network.webSocketFrameReceived","params":{}}'),true);assert.equal(isUsefulCdpMessage('{"method":"Network.requestWillBeSent","params":{}}'),false);assert.equal(isUsefulCdpMessage('{"method":"Network.dataReceived","params":{}}'),false);assert.equal(isUsefulCdpMessage('{"method":"Target.attachedToTarget","params":{}}'),true);assert.equal(isUsefulCdpMessage('{"method":"Runtime.consoleAPICalled"}'),true)});
test('页面采集脚本可编译、防重入、挂接后防后台降频',async()=>{const {readFileSync}=await import('node:fs');const src=readFileSync(new URL('./douyin-bridge.mjs',import.meta.url),'utf8');const body=src.slice(src.indexOf('const COLLECT = String.raw`')+27,src.indexOf('})()`;')+4);assert.doesNotThrow(()=>new Function('return '+body.slice(0,-2)));assert.ok(!/document\.body\.innerText/.test(body),'不应每轮读整页 innerText');assert.ok(src.includes('if (ws.readyState !== 1 || collecting) return;'));assert.ok(src.includes("Emulation.setFocusEmulationEnabled"))});
test('评论与礼物事件携带延迟时间戳',()=>{const sent=[];_injectHubForTest({broadcast:e=>sent.push(e)});const log=console.log;console.log=()=>{};try{emitComment({name:'时间戳人',avatar:'x'},'hi','ws',5000,120);assert.equal(sent[0].ts,5000);assert.equal(sent[0].lag,120);assert.equal(sent[0].via,'ws')}finally{console.log=log;_injectHubForTest(null)}});

test('直播结束后定时刷新页面，重新开播能自动接上新场次', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./douyin-bridge.mjs', import.meta.url), 'utf8');
  const { ENDED_RELOAD_MS } = await import('./douyin-bridge.mjs');
  assert.ok(ENDED_RELOAD_MS >= 10000 && ENDED_RELOAD_MS <= 60000);
  const block = src.slice(src.indexOf('if (s.ended || (roomEnded'), src.indexOf('直播已恢复'));
  assert.ok(block.includes("rpc('Page.reload'"), '结束页不会自己变回直播，必须刷新');
});

test('读弹幕页面暂停视频：暂停并静音，播放器恢复播放时立刻再暂停', async () => {
  const { PAUSE_MEDIA, PAUSE_MEDIA_MS } = await import('./douyin-bridge.mjs');
  assert.equal(PAUSE_MEDIA_MS, 5000);
  const listeners = [];
  const vids = [{ paused: false, muted: false, pause() { this.paused = true; } }, { paused: true, muted: false, pause() { this.paused = true; } }];
  const window = {}, document = { addEventListener: (t, f, c) => listeners.push([t, f, c]), querySelectorAll: () => vids };
  const n = new Function('window', 'document', 'return ' + PAUSE_MEDIA)(window, document);
  assert.equal(n, 1); assert.ok(vids.every(v => v.paused && v.muted));
  assert.equal(listeners.length, 1); assert.equal(listeners[0][0], 'play'); assert.equal(listeners[0][2], true);
  vids[0].paused = false; listeners[0][1]({ target: vids[0] }); assert.equal(vids[0].paused, true);
  new Function('window', 'document', 'return ' + PAUSE_MEDIA)(window, document);
  assert.equal(listeners.length, 1);
});

test('头像补取同一昵称最多 3 次；启动时历史弹幕不重复打印', async () => {
  const b = await import('./douyin-bridge.mjs');
  assert.equal(b.HOVER_MAX_TRIES, 3);
  const src = (await import('node:fs')).readFileSync(new URL('./douyin-bridge.mjs', import.meta.url), 'utf8');
  assert.match(src, /if \(priming\) continue;/);
});
