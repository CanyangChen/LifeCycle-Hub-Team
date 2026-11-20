import assert from 'node:assert/strict';
import worker from './dist/server/index.js';import {openDemoDatabase} from './standalone-db.mjs';
const d=openDemoDatabase(':memory:');
try{
 for(const module of ['food','medicine','clothing','device','subscription']){
  for(const mode of ['default','quick','manual']){
   const suffix=mode==='default'?'':mode==='quick'?(['food','medicine'].includes(module)?'/intake':'/new?mode=quick'):(['food','medicine'].includes(module)?'/new':'/new?mode=manual');
   const r=await worker.fetch(new Request('http://localhost/items/'+module+suffix),{DB:d.DB,LOCAL_INSTANCE:true});assert.equal(r.status,200,module+mode);
   const html=await r.text();const group=html.match(/<div class="module-entry mode-switch(?: entry-actions)?"[^>]*>([\s\S]*?)<\/div>/)?.[1];assert.ok(group,module+mode);
   assert.equal((group.match(/<a /g)||[]).length,mode==='default'?2:1,module+mode);
   if(mode==='quick')assert.ok(group.includes('手动录入'));
   if(mode==='manual')assert.ok(group.includes('快速录入'));
  }
 }
 d.DB.prepare("INSERT INTO DrugItem(id,userId,ownerId,name) VALUES('v32-own','local-device','local-device','补货测试药品'),('v32-other','other-user','other-user','其他用户药品')").run();
 const request=async id=>worker.fetch(new Request('http://localhost/items/medicine/new?drug='+id),{DB:d.DB,LOCAL_INSTANCE:true});
 const own=await request('v32-own');assert.equal(own.status,200);const ownHtml=await own.text();assert.ok(ownHtml.includes('确认补充库存'));assert.ok(ownHtml.includes('data-new-profile hidden disabled'));assert.ok(ownHtml.includes('不同请添加另一种药品'));
 assert.equal((await request('v32-other')).status,404);assert.equal((await request('missing')).status,404);
 const initial=await worker.fetch(new Request('http://localhost/items/medicine/new'),{DB:d.DB,LOCAL_INSTANCE:true});assert.ok(!(await initial.text()).includes('data-new-profile hidden disabled'));
 for(const module of ['food','medicine','clothing','device','subscription']) {
  const response=await worker.fetch(new Request('http://localhost/items/'+module+'?q=V32NoMatchingRecordXYZ'),{DB:d.DB,LOCAL_INSTANCE:true});
  assert.equal(response.status,200);const text=await response.text();assert.ok(text.includes('找到 <strong>0</strong> 条结果'),module);assert.ok(text.includes('清除筛选'),module);
  assert.ok(text.includes('guided-empty'),module);assert.ok(text.includes('href="/items/'+module+'/new"'),module);
 }
 const selectedLocation=await worker.fetch(new Request('http://localhost/items/food?location=fridge'),{DB:d.DB,LOCAL_INSTANCE:true});
 const selectedHtml=await selectedLocation.text();assert.ok(selectedHtml.includes('href="/items/food?location=fridge#inventory" aria-current="true"'));assert.equal((selectedHtml.match(/aria-current="true"/g)||[]).length,1);assert.ok(selectedHtml.includes('已选择'));
 const getPage=async path=>(await(await worker.fetch(new Request('http://localhost'+path),{DB:d.DB,LOCAL_INSTANCE:true})).text());
 assert.ok((await getPage('/items/food')).includes('暂无库存记录。'));
 assert.ok((await getPage('/items/medicine')).includes('暂无药品库存记录。'));
 assert.ok((await getPage('/items/medicine?status=history')).includes('暂无历史药品批次。'));
 for(const [module,label] of [['device','暂无设备记录。'],['subscription','暂无订阅记录。']]) {
  assert.ok((await getPage('/items/'+module)).includes(label));
  assert.ok((await getPage('/items/'+module+'?status=archived')).includes('暂无已归档记录。'));
  d.DB.prepare("INSERT INTO Item(id,name,category,updatedAt) VALUES(?,?,?,'2026-11-20')").bind('ui013-'+module,'测试记录',module).run();
  assert.ok((await getPage('/items/'+module+'?q=MissingUI013')).includes('无匹配结果。'));
  assert.ok((await getPage('/items/'+module+'?status=archived')).includes('暂无已归档记录。'));
 }

 assert.ok((await getPage('/items/food/new')).includes('food-form component-form'));
 assert.ok((await getPage('/items/medicine/new')).includes('food-form component-form'));
 d.DB.prepare("INSERT INTO Item(id,name,category,updatedAt) VALUES('ui012-food','样板食品','food','2026-11-20')").run();
 d.DB.prepare("INSERT INTO FoodDetail(itemId,remainingAmount) VALUES('ui012-food',1)").run();
 assert.ok((await getPage('/items/food?q=MissingUI012')).includes('无匹配结果。'));
 for(const path of ['/items/food/new','/items/food/profiles','/items/food/locations']) {
  const sample=await getPage(path);assert.ok(sample.includes('food-form component-form'),path);assert.ok(sample.includes('class="btn btn-primary"'),path);
 }
 assert.ok((await getPage('/items/medicine/profiles')).includes('food-form component-form'));
 assert.ok((await getPage('/items/medicine/plans')).includes('单次用药剂量'));
 assert.ok((await getPage('/items/medicine/new')).includes('返回药品库存'));
 const clothingManual=await getPage('/items/clothing/new?mode=manual');assert.ok(clothingManual.includes('wardrobe-editor component-form'));assert.ok(clothingManual.includes('衣物名称'));assert.ok(clothingManual.includes('返回衣橱'));
 const clothingQuick=await getPage('/items/clothing/new?mode=quick');assert.ok(clothingQuick.includes('class="btn btn-primary"'));assert.ok(clothingQuick.includes('btn btn-secondary'));
 const deviceManual=await getPage('/items/device/new?mode=manual');assert.ok(deviceManual.includes('panel editor component-form'));assert.ok(deviceManual.includes('设备名称'));assert.ok(deviceManual.includes('返回电子设备'));assert.ok(deviceManual.includes('购入日期'));
 const deviceQuick=await getPage('/items/device/new?mode=quick');assert.ok(deviceQuick.includes('panel editor component-form'));assert.ok(deviceQuick.includes('class="btn btn-primary"'));assert.ok(deviceQuick.includes('btn btn-secondary'));
 const subscriptionManual=await getPage('/items/subscription/new?mode=manual');assert.ok(subscriptionManual.includes('panel editor component-form'));assert.ok(subscriptionManual.includes('订阅名称'));assert.ok(subscriptionManual.includes('返回会员订阅'));assert.ok(subscriptionManual.includes('周期费用（元）'));assert.ok(subscriptionManual.includes('data-billing-cycle'));assert.ok(subscriptionManual.includes('data-custom-cycle'));
 const subscriptionQuick=await getPage('/items/subscription/new?mode=quick');assert.ok(subscriptionQuick.includes('panel editor component-form'));assert.ok(subscriptionQuick.includes('class="btn btn-primary"'));assert.ok(subscriptionQuick.includes('btn btn-secondary'));
 console.log('PASS five modules: default shows both modes; quick/manual pages show only alternative mode');
}finally{d.close()}
