import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {DatabaseSync} from 'node:sqlite';
import {openDemoDatabase} from './standalone-db.mjs';import worker from './dist/server/index.js';
const dir=mkdtempSync(join(tmpdir(),'lifecycle-device-test-')),file=join(dir,'device.sqlite');
// Construct the prior schema and a legacy device, then let the real migrator upgrade a copy.
const old=new DatabaseSync(file);const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
old.exec('CREATE TABLE StandaloneMigration(tag TEXT PRIMARY KEY)');
for(const {tag} of journal.entries.filter(x=>x.tag!=='0014_device_lifecycle')) {old.exec(readFileSync('drizzle/'+tag+'.sql','utf8'));old.prepare('INSERT INTO StandaloneMigration(tag) VALUES(?)').run(tag);}
old.exec("INSERT INTO Item(id,name,category,updatedAt) VALUES('legacy','旧设备','device','2020-01-01');INSERT INTO DeviceDetail(itemId,configuration) VALUES('legacy','原配置')");old.close();
let db=openDemoDatabase(file);const origin='http://localhost';
const post=(path,data)=>worker.fetch(new Request(origin+path,{method:'POST',headers:{origin},body:new URLSearchParams(data.operation==='deviceMaintenance'?{eventId:randomUUID(),...data}:data)}),{DB:db.DB,LOCAL_INSTANCE:true});
try {
 assert.ok(readdirSync(dir).some(x=>x.includes('before-migration')));
 assert.equal((await db.DB.prepare("SELECT configuration FROM DeviceDetail WHERE itemId='legacy'").first()).configuration,'原配置');
 const countBefore=await db.DB.prepare("SELECT count(*) AS n FROM Item WHERE category='device'").first();
 const review=await post('/items/device/new',{operation:'deviceExtract',text:'昨天买了一台笔记本，花了4999元，型号是A1，配置16GB，购买渠道是官方商城，保修两年。',timeZone:'Asia/Shanghai'});
 assert.equal(review.status,200);const reviewHtml=await review.text();
 assert.ok(reviewHtml.includes('文字规则提取结果'));assert.ok(reviewHtml.includes('value="4999"'));assert.ok(reviewHtml.includes('value="A1"'));assert.ok(reviewHtml.includes('value="16GB"'));
 assert.ok(reviewHtml.includes('name="warrantyUntil" value=""'));assert.ok(reviewHtml.includes('确认保存设备'));
 assert.deepEqual(await db.DB.prepare("SELECT count(*) AS n FROM Item WHERE category='device'").first(),countBefore);
 for(const [text,expected] of [
   ['刚才买了一台电脑，花了1.2万元，保修两年。','value="12000"'],
   ['2024-5-6买了一台显示器，花了899块钱。','name="purchasedOn" value="2024-05-06"'],
   ['买了一部手机，保修至2028-01-01。','name="purchasedOn" value=""'],
   ['今天送修，昨天买了一副耳机，花了99元。','value="99"']
 ]) {const r=await post('/items/device/new',{operation:'deviceExtract',text,timeZone:'Asia/Shanghai'});assert.equal(r.status,200);assert.ok((await r.text()).includes(expected),text);}
 const draft=await post('/items/device/new',{operation:'deviceExtract',text:'刚才买了一台显示器，花了899元。'});
 const draftHtml=await draft.text();assert.ok(draftHtml.includes('name="purchasePrice" value="899"'));
 const savedDraft=await post('/items/device/new',{name:'核对后显示器',deviceType:'显示器',purchasePrice:'850',usageStatus:'using'});assert.equal(savedDraft.status,303);
 const savedId=savedDraft.headers.get('location').split('?')[0].split('/').at(-1);
 assert.equal((await db.DB.prepare('SELECT purchasePriceCents FROM DeviceDetail WHERE itemId=?').bind(savedId).first()).purchasePriceCents,85000);
 const invalidQuick=await post('/items/device/new',{operation:'deviceExtract',text:''});assert.equal(invalidQuick.status,400);
 const fields={name:'测试电脑',brand:'测试品牌',model:'A1',configuration:'16GB',deviceType:'笔记本',serialNumber:'TEST-001',purchasedOn:'2024-01-02',purchaseChannel:'测试渠道',proofReference:'纸质凭证',purchasePrice:'1234.56',usageStatus:'using'};
 let response=await post('/items/device/new',fields);assert.equal(response.status,303);const path=response.headers.get('location').split('?')[0],id=path.split('/').at(-1);
 let row=await db.DB.prepare('SELECT * FROM DeviceDetail WHERE itemId=?').bind(id).first();assert.equal(row.purchasePriceCents,123456);assert.equal(row.purchaseChannel,'测试渠道');
 assert.equal((await post(path,{...fields,purchasePrice:'-1'})).status,400);
 assert.equal((await post(path,{...fields,usageStatus:'invalid'})).status,400);
 assert.equal((await post(path,{operation:'deviceMaintenance',kind:'deviceRepair',occurredOn:'2020-01-01',maintenanceNotes:'更换风扇'})).status,303);
 const repeat={eventId:randomUUID(),operation:'deviceMaintenance',kind:'deviceMaintenance',occurredOn:'2020-02-01',maintenanceNotes:'清洁设备'};
 assert.equal((await post(path,repeat)).status,303);assert.equal((await post(path,repeat)).status,303);
 assert.equal((await db.DB.prepare('SELECT count(*) AS n FROM LifecycleEvent WHERE id=?').bind(repeat.eventId).first()).n,1);
 assert.equal((await post(path,{...repeat,maintenanceNotes:'修改请求内容'})).status,409);
 assert.equal((await post(path,{...fields,usageStatus:'idle',purchasePrice:''})).status,303);
 db.close();db=openDemoDatabase(file);row=await db.DB.prepare('SELECT * FROM DeviceDetail WHERE itemId=?').bind(id).first();assert.equal(row.usageStatus,'idle');assert.equal(row.purchasePriceCents,null);
 assert.equal((await db.DB.prepare("SELECT count(*) AS n FROM LifecycleEvent WHERE itemId=? AND kind='deviceRepair'").bind(id).first()).n,1);
 const get=async suffix=>(await worker.fetch(new Request(origin+suffix),{DB:db.DB,LOCAL_INSTANCE:true})).text();
 assert.ok((await get('/items/device?usage=idle&warranty=unknown&q=测试')).includes('测试电脑'));
 assert.ok(!(await get('/items/device?usage=repair')).includes('测试电脑'));
 assert.ok(!(await get('/items/device?usage=idle&warranty=valid')).includes('测试电脑'));
 assert.ok((await get(path)).includes('保修日期未记录'));
 assert.equal((await post(path,{operation:'archive'})).status,303);
 const archived=await get(path);assert.ok(archived.includes('更换风扇'));assert.ok(!archived.includes('value="deviceMaintenance"'));
 assert.equal((await post(path,{operation:'deviceMaintenance',kind:'deviceRepair',occurredOn:'2020-01-01',maintenanceNotes:'不允许'})).status,409);
 const invalidArchived=await post(path,{...fields,purchasePrice:'-1'});assert.equal(invalidArchived.status,400);
 const invalidHtml=await invalidArchived.text();assert.ok(invalidHtml.includes('更换风扇'));assert.ok(!invalidHtml.includes('value="deviceMaintenance"'));
 assert.equal((await post(path,{operation:'restore'})).status,303);
 assert.ok((await get('/items/device?usage=idle')).includes('测试电脑'));
 assert.ok((await get(path)).includes('value="deviceMaintenance"'));
 await post(path,{operation:'restore'});
 assert.equal((await db.DB.prepare("SELECT count(*) AS n FROM LifecycleEvent WHERE itemId=? AND kind='restore'").bind(id).first()).n,1);
 assert.equal((await post(path,{operation:'delete'})).status,303);
 assert.equal((await db.DB.prepare("SELECT count(*) AS n FROM LifecycleEvent WHERE itemId=? AND kind='deviceRepair'").bind(id).first()).n,1);
 console.log('PASS legacy migration backup, preserved configuration, purchase fields, cents, invalid values, maintenance retention and database reopen');
} finally {db.close();}
