import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const css=readFileSync('ui-home-colors.css','utf8');
const tokens=Object.fromEntries([...css.matchAll(/(--home-[\w-]+):\s*(#[\da-f]{6})/gi)].map(([,key,value])=>[key,value.toUpperCase()]));
const expected={background:'#F0F1F8',surface:'#FFFFFF','surface-alt':'#EAEBF4',border:'#D8DCEE',divider:'#DDE0EC','blue-soft':'#E8EEFC','purple-soft':'#EEE9FA','pink-soft':'#F9EAF2','lavender-soft':'#E9EBF6','brand-blue':'#8299D6','brand-purple':'#AC9BDE','brand-pink':'#EFA9C9',action:'#4967AE','text-primary':'#30354C','text-secondary':'#626B80','text-muted':'#7A8296'};
for(const [key,value] of Object.entries(expected))assert.equal(tokens['--home-'+key],value,key);
// This stylesheet must stay color-only and scoped to home.
const clean=css.replace(/\/\*[\s\S]*?\*\//g,'');
const selectors=text=>{let depth=0,start=0;const result=[];for(let i=0;i<text.length;i++){if(text[i]==='(')depth++;if(text[i]===')')depth--;if(text[i]===','&&depth===0){result.push(text.slice(start,i));start=i+1;}}return [...result,text.slice(start)];};
for(const block of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
 for(const selector of selectors(block[1].trim()))assert.ok(selector.trim().startsWith('.personal-ui .dashboard')||selector.trim()==='body.personal-ui:has(.dashboard)',selector);
 for(const declaration of block[2].split(';').map(s=>s.trim()).filter(Boolean)) {
  const property=declaration.split(':')[0].trim();assert.ok(property.startsWith('--home-')||['background','color','border-color','outline-color'].includes(property),property+' would change geometry or interaction');
 }
}
const luminance=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const ratio=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
const pairs=[];const check=(label,fg,bg,minimum=4.5)=>{const value=ratio(fg,bg);assert.ok(value>=minimum,label+': '+value);pairs.push({label,foreground:fg,background:bg,ratio:value,minimum});};
for(const bg of ['surface','background','blue-soft','purple-soft','pink-soft','lavender-soft','surface-alt'])check('Primary text on '+bg,expected['text-primary'],expected[bg]);
for(const bg of ['surface','background','blue-soft'])check('Secondary text on '+bg,expected['text-secondary'],expected[bg]);
for(const bg of ['surface','blue-soft','purple-soft','lavender-soft'])check('Action/focus on '+bg,expected.action,expected[bg]);
for(const color of ['#4967AE','#405D9F','#354F91'])check('Primary button text '+color,'#FFFFFF',color);
check('Taken status','#7154AC',expected['purple-soft']);check('Subscription link','#A74776',expected.surface);
check('Pending status','#8B4D20','#FFF0DC');check('Urgent food','#963A40','#FBE7E8');check('Soon food','#85560D','#FFF0D7');check('Watch food','#4967AE','#EBF0FC');
const caveats={secondaryOnPurple:ratio(expected['text-secondary'],expected['purple-soft']),mutedOnWhite:ratio(expected['text-muted'],expected.surface),cardBorderOnWhite:ratio(expected.border,expected.surface)};
assert.ok(caveats.secondaryOnPurple<4.5);assert.ok(caveats.mutedOnWhite<4.5);
mkdirSync('test-results/home-v25',{recursive:true});writeFileSync('test-results/home-v25/contrast.json',JSON.stringify({tokens,pairs,caveats,limitations:['Source-level intended color pairs; not computed browser styles.','Decorative borders and labeled icons do not establish full UI WCAG compliance.','Physical high-brightness and mobile screens not verified.']},null,2));
console.log('PASS home V2.5: scoped color-only stylesheet, unchanged brand/text tokens, '+pairs.length+' intended foreground/background pairs meet AA thresholds; low-contrast candidates reported separately.');
