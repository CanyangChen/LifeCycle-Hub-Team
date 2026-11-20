import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const code=readFileSync('date-picker-only.mjs','utf8');
function setup(fail=false){const events={};let opened=0;const field={value:'2026-11-20',disabled:false,showPicker(){if(fail)throw Error('unsupported');opened++},addEventListener(k,f){events[k]=f},setAttribute(){}};vm.runInNewContext(code,{document:{querySelectorAll:s=>{assert.equal(s,'input[type="date"]');return[field]}}});return{field,events,get opened(){return opened}};}
const x=setup();let prevented=false;const event=key=>({key,preventDefault(){prevented=true}});
x.events.click();assert.equal(x.opened,1);x.events.keydown(event('Enter'));assert.equal(x.opened,2);assert.ok(prevented);
for(const key of ['2','Backspace','Delete']){prevented=false;x.events.keydown(event(key));assert.ok(prevented)}
for(const key of ['Tab','ArrowLeft','ArrowRight','Escape']){prevented=false;x.events.keydown(event(key));assert.ok(!prevented)}
for(const name of ['paste','cut','drop','beforeinput']){prevented=false;x.events[name](event(''));assert.ok(prevented)}
assert.equal(x.field.value,'2026-11-20');const fallback=setup(true);prevented=false;fallback.events.keydown(event('Enter'));assert.ok(!prevented);
x.field.disabled=true;x.events.click();assert.equal(x.opened,2);
console.log('PASS shared date selection: input blocking, keyboard navigation, unchanged values, disabled and native fallback');
