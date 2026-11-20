import assert from 'node:assert/strict';
import { openDemoDatabase } from './standalone-db.mjs';
import worker from './dist/server/index.js';
const database = openDemoDatabase(':memory:');
const db = database.DB;
const get = path => worker.fetch(new Request('http://localhost'+path),{DB:db,LOCAL_INSTANCE:true});
const run = (sql,...args) => db.prepare(sql).bind(...args).run();
const day = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
try {
  let response = await get('/');
  assert.equal(response.status,200);
  let html = await response.text();
  assert.match(html,/id="fresh-food"/);
  assert.match(html,/stroke-width="1.7"/);
  assert.match(html,/class="home-icon-title icon-fresh-food"/);
  assert.match(html,/class="home-icon-title icon-subscription"/);
  assert.doesNotMatch(html,/☰|⌂|◈|✚|▣/);

  assert.doesNotMatch(html,/全部模块|id="categories"|class="dashboard-column"/);
  assert.ok(html.indexOf('id="fresh-food"')<html.indexOf('id="current-medication"'));
  assert.ok(html.indexOf('id="current-medication"')<html.indexOf('id="active-subscriptions"'));
  for (const module of ['food','medicine','clothing','device','subscription']) assert.ok(html.includes('href="/items/'+module+'"'));

  assert.match(html,/今天没有进行中的用药计划/);
  for (const [id,name,category] of [['fresh','生鲜测试','food'],['dry','干货测试','food'],['early','较早订阅','subscription'],['late','较晚订阅','subscription'],['removed','已删订阅','subscription']]) {
    run('INSERT INTO Item(id,name,category,updatedAt) VALUES(?,?,?,?)',id,name,category,new Date().toISOString());
  }
  for (const [id,category] of [['fresh','produce'],['dry','dry']]) {
    run('INSERT INTO FoodItem(id,name,categoryId) VALUES(?,?,?)',id,id==='fresh'?'生鲜测试':'干货测试',category);
    run('INSERT INTO FoodDetail(itemId,foodId,remainingAmount,stockUnit) VALUES(?,?,?,?)',id,id,2,'个');
  }
  run("INSERT INTO SubscriptionDetail(itemId,nextChargeOn) VALUES('late','2099-12-01'),('early','2000-01-01'),('removed','1999-01-01')");
  run("UPDATE Item SET deletedAt='2020-01-01' WHERE id='removed'");
  run("INSERT INTO DrugItem(id,userId,ownerId,name) VALUES('drug','local-device','local-device','计划药品')");
  for (const [id,status,start,end] of [['current','active',day,day],['future','active','2999-01-01',null],['ended','active','2000-01-01','2000-01-02'],['paused','paused',day,null]]) {
    run('INSERT INTO MedicationPlan(id,userId,drugId,startOn,endOn,timeZone,source,status,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?)',id,'local-device','drug',start,end,'Asia/Shanghai','user',status,day,day);
  }
  for (let n=1;n<=3;n++) {
    const id='expiry-'+n,expiry=new Date(Date.parse(day)+n*86400000).toISOString().slice(0,10);
    run("INSERT INTO Item(id,name,category,updatedAt) VALUES(?,?,'food',?)",id,id,day);
    run("INSERT INTO FoodDetail(itemId,foodId,expiresOn,remainingAmount,stockUnit) VALUES(?,'dry',?,1,'袋')",id,expiry);
  }
  run("UPDATE MedicationPlan SET timesJson='[\"08:00\"]',dose=1,unit='包' WHERE id='current'");
  run(`INSERT INTO MedicationLog(id,userId,drugId,planId,scheduledAtLocal,timeZone,status,requestKey,revision,createdAt,updatedAt)
    VALUES('taken','local-device','drug','current',?,'Asia/Shanghai','taken','home-ui','1',?,?)`,day+'T08:00',day,day);
  for(let n=0;n<7;n++) {
    run("INSERT INTO Item(id,name,category,updatedAt) VALUES(?,?,'food',?)",'extra-'+n,'更多生鲜'+n,day);
    run("INSERT INTO FoodDetail(itemId,foodId,remainingAmount,stockUnit) VALUES(?,'fresh',1,'个')",'extra-'+n);
  }
  const notificationsBefore=await db.prepare('SELECT COUNT(*) AS n FROM Notification').first();
  const before = await db.prepare('SELECT COUNT(*) AS n FROM Item').first();
  html = await (await get('/')).text();
  const fresh = html.split('id="fresh-food"')[1].split('id="current-medication"')[0];
  assert.match(fresh,/生鲜测试/);
  assert.equal((fresh.split('<details class="home-more">')[0].match(/href="\/items\/food\//g)||[]).length,6);
  assert.match(fresh,/查看更多食品/);
  assert.match(html,/id="recent-reminders"/);
  assert.ok(html.indexOf('id="recent-reminders"')>html.indexOf('id="active-subscriptions"'));
  assert.match(html,/href="#recent-reminders"/);
  assert.deepEqual(await db.prepare('SELECT COUNT(*) AS n FROM Notification').first(),notificationsBefore);

  for (const cls of ['urgent','soon','watch']) assert.ok(fresh.includes('expiry-'+cls));
  const plans = html.split('id="current-medication"')[1].split('id="active-subscriptions"')[0];
  assert.match(plans,/08:00 · 已服用/);
  assert.match(plans,/plans\?id=current/);for(const id of ['future','ended','paused']) assert.ok(!plans.includes('plans?id='+id));
  assert.equal((html.match(/data-quick-open/g)||[]).length,1);
  const picker=html.split('<dialog id="quick-entry"')[1].split('</dialog>')[0];
  assert.match(picker,/食品/);assert.match(picker,/药品/);assert.match(picker,/衣物/);
  assert.doesNotMatch(picker,/设备|订阅/);
  assert.match(html,/<table class="subscription-table">/);
  assert.match(html,/class="subscription-due"/);
  assert.ok(html.indexOf('较早订阅')<html.indexOf('较晚订阅'));assert.doesNotMatch(html,/已删订阅/);
  assert.deepEqual(await db.prepare('SELECT COUNT(*) AS n FROM Item').first(),before);
  for(const path of ['/items/clothing/new?mode=quick','/items/food/intake','/items/medicine/intake','/items/medicine/plans?id=current','/items/subscription/early','/items/device/new','/items/subscription/new']) assert.equal((await get(path)).status,200,path);
  console.log('PASS homepage empty states, fresh inventory, current plans, subscription order, deleted records, entry links and read-only item counts');
} finally { database.close(); }
