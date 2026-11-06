import {test} from 'node:test';import assert from 'node:assert/strict';import {DemoRules} from './demo-rules.mjs';
for(const [type,count,size] of [['like',1,'small'],['heart',1,'large'],['beer',2,'large'],['lollipop',3,'large']])test(type+'数量与尺寸',()=>{let r=new DemoRules();r.event(type,{name:'测试'},'1');assert.equal(r.queue.length,count);assert.ok(r.queue.every(x=>x.size===size))});
test('事件去重',()=>{let r=new DemoRules();for(let i=0;i<2;i++)r.event('beer',{name:'测试'},'same');assert.equal(r.queue.length,2)});
test('拒绝旧规则',()=>{let r=new DemoRules();assert.throws(()=>r.event('small66',{name:'测试'},'1'))});
test('关注：金色大图插队，排在普通任务前',()=>{let r=new DemoRules();r.event('like',{name:'甲'},'a');r.event('follow',{name:'粉丝'},'b');assert.equal(r.queue[0].name,'粉丝');assert.equal(r.queue[0].gold,true);assert.equal(r.queue[0].size,'large');assert.equal(r.queue[0].priority,true);assert.equal(r.queue[1].gold,undefined)});
