import { wardrobeRoute } from "./wardrobe.mjs";
import { demoAuthRoute } from "./demo-auth.mjs";
import { catalog, styles, browser } from "./generated.mjs";
import { parseQuantity } from "./quantity.mjs";
import { allFoodRows, ensureFoodData, foodActive, foodTasks, foodTitle, foodRoute } from "./food.mjs";
import { drugHomeData, drugRoute } from "./drug.mjs";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
const tables = { food: "FoodDetail", medicine: "MedicineDetail", clothing: "ClothingDetail", device: "DeviceDetail", subscription: "SubscriptionDetail" };
const dateField = (key) => /On$|Until$|By$/.test(key);
const cycles = { 年: "年", 季度: "季度", 月: "月" };
const legacyCycle = { 每年: "年", 每季度: "季度", 季: "季度", 每季: "季度", 每月: "月" };
const stockOf = (detail) => detail?.stockCount == null
  ? parseQuantity(detail?.quantity)
  : { amount: detail.stockCount, unit: detail.stockUnit };
const link = (href, title, cls = "") => `<a class="${cls}" href="${href}">${title}</a>`;
const moduleIcons = {food:"refrigerator",medicine:"pill",clothing:"shirt",device:"laptop",subscription:"credit-card"};
const uiIcon = (name) => uiIcons[name] || uiIcons.house;
const hero = (title, description, action = "") => `<header class="hero"><div><h1>${title}</h1><p>${description}</p></div>${action}</header>`;
const moduleEntry = (quick,manual) => `<div class="module-entry" role="group" aria-label="选择录入方式">${link(quick,"＋ 快速录入","button")}${link(manual,"手动录入","button secondary")}</div>`;
function deleteControl(label,name,fields="") {
  return `<details class="archive"><summary>删除${label}</summary><form method="post">${fields}
    <p>确认删除「${escape(name)}」？删除后将从相应列表中移除。</p>
    <button class="button secondary" name="operation" value="delete">确认删除${label}</button></form></details>`;
}
async function deleteItem(db,id,category,user=null) {
  const now=new Date().toISOString();
  const owner=user?" AND EXISTS(SELECT 1 FROM DrugBatch b WHERE b.itemId=Item.id AND b.userId=?)":"";
  const where="id=? AND category=? AND deletedAt IS NULL"+owner;
  const keys=user?[id,category,user]:[id,category];
  const statements=[
    foodRead(db,`INSERT INTO LifecycleEvent (id,itemId,kind,occurredAt)
      SELECT ?,id,'delete',? FROM Item WHERE ${where}`,crypto.randomUUID(),now,...keys),
    foodRead(db,`UPDATE Item SET deletedAt=?,archivedAt=coalesce(archivedAt,?),updatedAt=? WHERE ${where}`,now,now,now,...keys),
  ];
  if (user) statements.push(foodRead(db,`UPDATE MedicationPlan SET batchId=NULL,updatedAt=? WHERE userId=? AND batchId=?
    AND EXISTS(SELECT 1 FROM Item WHERE id=? AND deletedAt=?)`,now,user,id,id,now));
  return (await db.batch(statements))[1].meta.changes>0;
}

function render(content, status = 200) {
  const nav = Object.entries(catalog).map(([key, meta]) => link("/items/" + key, uiIcon(moduleIcons[key]) + " " + meta.title)).join("");
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>LifeCycle Hub · 团队本地版</title><style>${styles}</style><script type="module" src="/assets/forms.js"></script><body class="personal-ui"><a class="skip-link" href="#main-content">跳到主要内容</a><header class="app-topbar"><button class="button secondary menu-button" type="button" data-nav-open aria-controls="app-navigation" aria-expanded="false">${uiIcon("menu")} 菜单</button>${link("/","LifeCycle Hub","brand")}</header><dialog id="app-navigation" class="app-drawer" aria-label="导航菜单"><div class="drawer-heading"><strong>LifeCycle Hub</strong><button class="button secondary" type="button" data-nav-close aria-label="关闭导航">${uiIcon("x")} 关闭</button></div><nav aria-label="主导航">${link("/",uiIcon("house")+" 总览")}${nav}</nav></dialog><main id="main-content" tabindex="-1">${content}</main></body></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; form-action 'self'; base-uri 'none'" },
  });
}

async function seed(db) {
  if (await db.prepare("SELECT id FROM Item WHERE id = 'demo-milk'").first()) return;
  const now = new Date();
  const day = (offset) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date(+now + offset * 86400000));
  const examples = [
    ["milk", "鲜牛奶", "food", { batch: "M-021", expiresOn: day(4), storage: "冷藏", quantity: "1 箱 × 12 瓶", stockCount: 12, stockUnit: "瓶" }],
    ["rice", "东北大米", "food", { batch: "R-008", storage: "密封，置于阴凉干燥处" }],
    ["medicine", "演示药品 A", "medicine", { ingredient: "示例成分", expiresOn: day(90) }],
    ["coat", "羊毛大衣", "clothing", { material: "羊毛", frequency: "冬季每周两次" }],
    ["laptop", "日常笔记本", "device", { brand: "示例品牌", model: "L14", configuration: "16 GB 内存 / 512 GB SSD" }],
    ["stream", "影音会员", "subscription", { billingInterval: "每月", feeCents: 2500, autoRenew: 1, nextChargeOn: day(10), cancelBy: day(8) }],
  ];
  const queries = examples.flatMap(([key, name, category, fields]) => {
    const id = "demo-" + key;
    return [
      db.prepare("INSERT OR IGNORE INTO Item (id,name,category,updatedAt) VALUES (?,?,?,?)").bind(id, name, category, now.toISOString()),
      writeDetail(db, category, id, fields, true),
    ];
  });
  for (const [key, title, kind, offset] of [
    ["milk", "检查牛奶有效期", "expiry", 2],
    ["rice", "检查干货储存", "inspection", 7],
    ["stream", "确认是否继续订阅", "cancel-notice", 7],
  ]) {
    queries.push(db.prepare("INSERT OR IGNORE INTO ReminderRule (id,itemId,kind,title) VALUES (?,?,?,?)")
      .bind("rule-" + key, "demo-" + key, kind, title));
    queries.push(db.prepare("INSERT OR IGNORE INTO Notification (id,ruleId,dueOn) VALUES (?,?,?)")
      .bind("reminder-" + key, "rule-" + key, day(offset)));
  }
  await db.batch(queries);
}

function writeDetail(db, category, id, fields, insertOnly = false) {
  const keys = Object.keys(fields);
  const updates = keys.map((key) => `${key}=excluded.${key}`).join(",");
  return db.prepare(`INSERT ${insertOnly ? "OR IGNORE " : ""}INTO ${tables[category]} (itemId,${keys.join(",")})
    VALUES (${["itemId", ...keys].map(() => "?").join(",")})${insertOnly ? "" :
      " ON CONFLICT(itemId) DO UPDATE SET " + updates + " WHERE EXISTS (SELECT 1 FROM Item WHERE id=excluded.itemId AND deletedAt IS NULL)"}`)
    .bind(id, ...Object.values(fields));
}

async function home(db,user) {
  const [counts, reminders, subscriptions] = await db.batch([
    db.prepare("SELECT category, count(*) AS count FROM Item WHERE archivedAt IS NULL AND deletedAt IS NULL AND category<>'medicine' GROUP BY category"),
    db.prepare(`SELECT i.id, i.category, i.name, r.title, n.dueOn FROM Notification n
      JOIN ReminderRule r ON r.id=n.ruleId JOIN Item i ON i.id=r.itemId
      WHERE n.status='pending' AND i.archivedAt IS NULL AND i.deletedAt IS NULL AND i.category NOT IN ('food','medicine') ORDER BY n.dueOn`),
    db.prepare(`SELECT i.id,i.name,s.* FROM Item i JOIN SubscriptionDetail s ON s.itemId=i.id
      WHERE i.category='subscription' AND i.archivedAt IS NULL AND i.deletedAt IS NULL`),
  ]);
  const foods = await allFoodRows(db);
  const drugs = await drugHomeData(db,user);
  const today = todayFood();
  const activeFoods = foods.filter(foodActive);
  const subscriptionTasks=subscriptions.results.flatMap(r=>{
    const dates=[r.cancelBy,r.nextChargeOn,r.endsOn].filter(foodDate).sort();
    return dates.length?[{id:r.id,category:"subscription",name:r.name,title:dates[0]===r.cancelBy?"确认是否取消订阅":dates[0]===r.nextChargeOn?"订阅即将扣费":"订阅到期",dueOn:dates[0]}]:[];
  });
  const taskMap=new Map();
  for (const task of [...reminders.results,...drugs.tasks,...foodTasks(foods).map(({r,day,text})=>({id:r.id,category:"food",name:foodTitle(r),title:text,dueOn:day})),...subscriptionTasks]) {
    const key=[task.category,task.href||task.id,task.dueOn.slice(0,10)].join("|");
    if (!taskMap.has(key)) taskMap.set(key,task);
  }
  const tasks=[...taskMap.values()].sort((a,b)=>a.dueOn.localeCompare(b.dueOn));
  const recent=tasks.filter(t=>t.dueOn.slice(0,10)<=foodAddDays(today,7));
  const later=tasks.filter(t=>t.dueOn.slice(0,10)>foodAddDays(today,7));
  const timelineRows=rows=>rows.map((r,index)=>{
    const date=r.dueOn.slice(0,10),overdue=date<today;
    const heading=index===0||rows[index-1].dueOn.slice(0,10)!==date?`<h3 class="timeline-date">${escape(date)}</h3>`:"";
    return heading+link(r.href||`/items/${r.category}/${encodeURIComponent(r.id)}`,`<time>${escape(r.dueOn.slice(11)||"全天")}</time><span><strong>${escape(r.name)}</strong><small>${escape(catalog[r.category]?.title||"其他")} · ${escape(r.title)}</small></span><span class="reminder-state${overdue?" overdue":""}">${overdue?"已逾期":"待处理"}</span>`,"timeline-entry");
  }).join("");
  const timeline=timelineRows(recent.slice(0,8))+(recent.length>8||later.length?`<details class="home-more"><summary>展开更多事项（${Math.max(0,recent.length-8)+later.length}）</summary>${timelineRows([...recent.slice(8),...later])}</details>`:"");
  // Home is a read-only projection of existing records and plan date rules.
  const plans = user ? (await drugPlans(db,user)).filter(p=>planEffective(p,intakeClock(p.timeZone).day)) : [];
  const fresh = activeFoods.filter(r => (foodDate(r.expiresOn) && r.expiresOn <= foodAddDays(today,3)) || ["produce","meat","dairy","prepared"].includes(r.parentId||r.categoryId) ||
    (foodDate(r.producedOn)&&foodDate(r.expiresOn)&&r.expiresOn>=r.producedOn&&r.expiresOn<=foodAddDays(r.producedOn,7)))
    .sort((a,b)=>(a.expiresOn||"9999").localeCompare(b.expiresOn||"9999"));
  const freshRows = fresh.map(r=>{
    const days=foodDate(r.expiresOn)?Math.round((Date.parse(r.expiresOn)-Date.parse(today))/86400000):null;
    const urgency=days==null?"none":days<=1?"urgent":days===2?"soon":days===3?"watch":"none";
    const label=days==null?"日期未记录":days<0?"已过期 "+(-days)+" 天":days===0?"今天到期":days+" 天后到期";
    return link(foodHref(r),`<span><strong>${escape(foodTitle(r))}</strong><small>${escape(r.locationName||"位置未记录")}${r.packaging==="opened"?" · 已开封":""}</small></span><span class="dashboard-row-end"><strong>${escape(foodAmount(r))}</strong><small class="expiry-badge expiry-${urgency}">${escape(label)}</small>${r.expiresOn?`<small>${escape(r.expiresOn)}</small>`:""}</span>`);
  });
  const foodRows=freshRows.slice(0,6).join("")+(freshRows.length>6?`<details class="home-more"><summary>查看更多食品（${freshRows.length-6}）</summary><div class="dashboard-list">${freshRows.slice(6).join("")}</div></details>`:"");
  const schedule=user?await drugSchedule(db,user,plans,{includeUntimed:true}):[];
  const planRows = schedule.map(({p,time,state})=>{
    const status=state?logStatuses[state]||"待确认":"时间未设置";
    return link("/items/medicine/plans?id="+encodeURIComponent(p.id),`<time class="plan-time">${escape(time||"未定时")}</time><span><strong>${escape([p.name,p.tradeName].filter(Boolean).join(" · "))}</strong><small>${escape(p.dose==null?"剂量未记录":p.dose+" "+(p.unit||""))}${p.mealTiming?" · "+escape(p.mealTiming):""}</small><small>${escape(time||"未定时")} · ${escape(status)}</small></span><span class="plan-state plan-state-${escape(state||"unset")}">${escape(status)}</span>`,"home-plan-row");
  }).join("");
  const subscriptionDate = r => [r.cancelBy,r.nextChargeOn,r.endsOn].filter(foodDate).sort()[0]||"";
  const subscriptionRows = subscriptions.results.sort((a,b)=>(subscriptionDate(a)||"9999").localeCompare(subscriptionDate(b)||"9999")).map(r=>{
    const date=subscriptionDate(r),near=date&&date<=foodAddDays(today,7);
    const status=r.cancelStatus|| (r.endsOn&&r.endsOn<today?"已到期":r.autoRenew?"自动续费":"在用");
    return `<tr${near?' class="subscription-due"':""}><th scope="row">${link("/items/subscription/"+encodeURIComponent(r.id),escape(r.name))}</th><td>${r.feeCents!=null?"¥"+(r.feeCents/100).toFixed(2):"未记录"}<small>${escape(r.billingInterval||"周期未设置")}</small></td><td>${escape(date||"未设置")}<small>${date&&date===r.cancelBy?"取消提醒":date&&date===r.nextChargeOn?"下次扣费":"到期日期"}${near?" · 需关注":""}</small></td><td>${escape(status)}</td></tr>`;
  }).join("");
  const section = (id,title,description,href,rows,empty,action="查看全部 →") => `<section class="panel dashboard-section" id="${id}"><div class="dashboard-section-heading"><div><h2 class="home-icon-title icon-${id}">${uiIcon(id==="fresh-food"?"refrigerator":"pill")}${title}</h2><p class="muted">${description}</p></div>${link(href,action,"dashboard-text-link")}</div><div class="dashboard-list">${rows||`<p class="empty">${empty}</p>`}</div></section>`;
  return render(`<div class="dashboard">`+hero("生活总览", "关注今天需要处理的事，让手头的物品有条不紊。", `<button class="button" type="button" data-quick-open aria-haspopup="dialog">${uiIcon("plus")}快速录入</button>`)+
    `<div class="dashboard-metrics" aria-label="库存与计划概览">${[["在库食品",activeFoods.length,"/items/food"],["已开封食品",activeFoods.filter(r=>r.packaging==="opened").length,"/items/food?packaging=opened"],["当前用药计划",plans.length,"/items/medicine/plans"],["在用订阅",subscriptions.results.length,"/items/subscription"]].map(([label,count,href],index)=>link(href,`<span class="stat-icon-label">${uiIcon(["refrigerator","package-open","pill","credit-card"][index])}${label}</span><strong>${count}</strong>`,"panel dashboard-metric")).join("")}</div>
    <a class="dashboard-reminder-summary" id="pending-reminders" href="#recent-reminders">待处理提醒 · ${tasks.length} 项<span>未来 7 天及逾期 ${recent.length} 项 · 查看近期事项 ↓</span></a>
    <dialog id="quick-entry" class="quick-entry-dialog" aria-labelledby="quick-entry-title"><div class="drawer-heading"><div><h2 id="quick-entry-title">快速录入</h2><p class="muted">选择要记录的模块</p></div><button class="button secondary" type="button" data-quick-close aria-label="关闭快速录入">${uiIcon("x")} 关闭</button></div><div class="quick-module-options">${link("/items/food/intake","<strong>食品</strong><small>采购、消耗与储存</small>")}${link("/items/medicine/intake","<strong>药品</strong><small>购买、库存与用药信息</small>")}${link("/items/clothing/new?mode=quick","<strong>衣物</strong><small>购买时间与衣物标签</small>")}</div></dialog>
    <div class="dashboard-columns">
    ${section("fresh-food","短保与生鲜","生鲜、乳制品、熟食及已记录 7 天内保质期的食品。","/items/food",foodRows,"暂无短保或生鲜库存，添加后会显示在这里。")}
    ${section("current-medication","当前用药计划","仅展示各计划时区内日期覆盖今天的进行中计划。","/items/medicine/plans",planRows,"今天没有进行中的用药计划。")}
    <section class="panel dashboard-section" id="active-subscriptions"><div class="dashboard-section-heading"><h2 class="home-icon-title icon-subscription">${uiIcon("credit-card")}会员与订阅 <small>${subscriptions.results.length}</small></h2>${link("/items/subscription","管理订阅 →","dashboard-text-link")}</div><div class="subscription-table-wrap"><table class="subscription-table"><thead><tr><th>订阅</th><th>费用 / 周期</th><th>提醒日期</th><th>状态</th></tr></thead><tbody>${subscriptionRows||'<tr><td colspan="4" class="empty">暂无在用订阅。</td></tr>'}</tbody></table></div></section>
    </div><section class="panel home-timeline" id="recent-reminders"><div class="dashboard-section-heading"><div><h2 class="home-icon-title icon-reminder">${uiIcon("calendar-clock")}近期提醒</h2><p class="muted">逾期及未来 7 天事项，按日期排列。</p></div></div>${timeline||'<p class="empty">近期暂无待处理事项。</p>'}</section></div>`);
}

async function list(db, category, url) {
  const meta = catalog[category];
  const base = "/items/" + category;
  const archived = url.searchParams.get("status") === "archived";
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const { results } = await db.prepare(`SELECT id,name,notes FROM Item WHERE category=? AND deletedAt IS NULL AND
    archivedAt IS ${archived ? "NOT " : ""}NULL AND instr(lower(name), lower(?)) > 0 ORDER BY updatedAt DESC`).bind(category, query).all();
  const records = results.map((item) => {
    return link(`${base}/${escape(item.id)}`,
      `<span class="category-icon">${meta.icon}</span><span><strong>${escape(item.name)}</strong><small>${escape(item.notes)}</small></span><span>›</span>`);
  }).join("");
  return render(hero(meta.title, meta.description, link(base + "/new", "＋ 新增档案", "button")) +
    (url.searchParams.has("deleted") ? '<p class="notice" role="status">档案已删除。</p>' : "") +
    (url.searchParams.has("archived") ? '<p class="notice" role="status">档案已归档。</p>' : "") +
    `<form class="filters"><input name="q" aria-label="按名称搜索" placeholder="按名称搜索" value="${escape(query)}"><select name="status" aria-label="档案状态"><option value="active">在用档案</option><option value="archived" ${archived ? "selected" : ""}>已归档</option></select><button class="button secondary">筛选</button></form>
    <div class="panel reminder-list">${records || '<p class="empty">暂无匹配档案。</p>'}</div>`);
}

function editor(category, id, item, detail, flags = {}) {
  const base = "/items/" + category;
  const meta = catalog[category];
  const input = (key, label, value = "", kind = "text", opts = "") =>
    `<label>${label}<input name="${key}" value="${escape(value)}" type="${kind}" ${opts}></label>`;
  const inputs = Object.entries(meta.fields).filter(([key]) => !["quantity", "billingInterval"].includes(key))
    .map(([key, label]) => input(key, label, detail[key], dateField(key) ? "date" : "text", 'maxlength="240"')).join("");
  const savedCycle = detail.billingInterval ?? "";
  const cycle = Object.hasOwn(legacyCycle, savedCycle) ? legacyCycle[savedCycle] : savedCycle;
  const custom = flags.customCycle ? savedCycle : Object.hasOwn(cycles, cycle) ? "" : cycle;
  const showCustom = Boolean(custom) || flags.customCycle;
  const subscription = category === "subscription" ? `<label>账单周期<select name="billingInterval" data-billing-cycle>
    <option value="">请选择</option>${Object.keys(cycles).map((option) => `<option ${cycle === option ? "selected" : ""}>${option}</option>`).join("")}
    <option value="custom" ${showCustom ? "selected" : ""}>其他</option></select></label>
    <label data-custom-cycle ${showCustom ? "" : "hidden"}>自定义周期<input name="customCycle" maxlength="80" value="${escape(custom)}" placeholder="例如：每两周" ${showCustom ? "required" : "disabled"}></label>`
    + input("fee", "周期费用（元）", detail.fee ?? (detail.feeCents == null ? "" : detail.feeCents / 100), "number", 'min="0" max="9999999.99" step="0.01"') +
    `<label>自动续费<select name="autoRenew"><option value="">未知</option><option value="yes" ${detail.autoRenew === 1 ? "selected" : ""}>开启</option><option value="no" ${detail.autoRenew === 0 ? "selected" : ""}>关闭</option></select></label>` : "";
  const archived = Boolean(item.archivedAt);
  const notice = flags.invalid ? '<p class="notice error" role="alert">请检查名称、日期、费用和周期格式后重试。</p>'
    : flags.saved ? '<p class="notice" role="status">档案已保存。</p>' : "";
  return render(hero(item.name ? escape(item.name) : "新增" + meta.title + "档案", link(base, "‹ " + meta.title, "muted") + (archived ? " · 已归档" : "")) +
    notice +
    `<form class="panel editor" method="post"><fieldset>${input("name","名称",item.name,"text",'required maxlength="120"')}${inputs}${subscription}
    <label class="wide">备注<textarea name="notes" rows="4" maxlength="2000">${escape(item.notes)}</textarea></label></fieldset><button class="button">保存档案</button></form>` +
    (id !== "new" && !archived ? '<details class="archive"><summary>归档档案</summary><form method="post"><p>归档后可在分类页查看。</p><button class="button secondary" name="operation" value="archive">确认归档</button></form></details>' : "") + (id!=="new"?deleteControl("档案",item.name):""), flags.invalid ? 400 : 200);
}

async function record(request, db, category, id, url) {
  const base = "/items/" + category;
  const existing = id === "new" ? null : await db.prepare("SELECT * FROM Item WHERE id=? AND category=? AND deletedAt IS NULL").bind(id, category).first();
  if (id !== "new" && !existing) return render(hero("找不到档案", link(base, "返回分类")), 404);
  const details = existing && await db.prepare(`SELECT * FROM ${tables[category]} WHERE itemId=?`).bind(id).first();
  if (request.method === "GET") {
    return editor(category, id, existing ?? {}, details ?? {}, {
      saved: url.searchParams.has("saved"),
    });
  }
  if (request.headers.get("origin") !== url.origin) return new Response("请求来源无效", { status: 403 });
  const form = await request.formData();
  const value = (key) => String(form.get(key) ?? "").trim();
  const operation = value("operation");
  const now = new Date().toISOString();
  if (existing && operation === "delete") {
    await deleteItem(db,id,category);
    return foodRedirect(base+"?deleted=1");
  }
  if (existing && operation === "archive") {
    await db.batch([
      db.prepare("INSERT INTO LifecycleEvent (id,itemId,kind,occurredAt) SELECT ?,id,'archive',? FROM Item WHERE id=? AND archivedAt IS NULL").bind(crypto.randomUUID(), now, id),
      db.prepare("UPDATE Item SET archivedAt=?,updatedAt=? WHERE id=? AND archivedAt IS NULL").bind(now, now, id),
    ]);
    return new Response(null, {status:303,headers:{location:base + "?archived=1"}});
  }
  const item = { name: value("name"), notes: value("notes") };
  const detail = Object.fromEntries(Object.keys(catalog[category].fields).map((key) => [key, value(key) || null]));
  const fee = value("fee");
  const selectedCycle = value("billingInterval");
  const customCycle = selectedCycle === "custom";
  const invalidCycle = category === "subscription" && (customCycle
    ? !value("customCycle") || value("customCycle").length > 80
    : selectedCycle && !Object.hasOwn(cycles, selectedCycle));
  if (category === "subscription" && customCycle) detail.billingInterval = value("customCycle");
  const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !v.startsWith("0000") &&
    Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  if (!item.name || item.name.length > 120 || item.notes.length > 2000 ||
      Object.entries(detail).some(([k, v]) => v && (v.length > 240 || (dateField(k) && !validDate(v)))) ||
      invalidCycle || (category === "subscription" && fee && !/^\d{1,7}(\.\d{1,2})?$/.test(fee))) {
    return editor(category, id, item, { ...detail, fee }, { invalid: true, customCycle });
  }
  if (category === "subscription") {
    detail.feeCents = fee ? Math.round(Number(fee) * 100) : null;
    detail.autoRenew = value("autoRenew") === "yes" ? 1 : value("autoRenew") === "no" ? 0 : null;
  }
  const recordId = existing ? id : crypto.randomUUID();
  const writeItem = existing
    ? db.prepare("UPDATE Item SET name=?,notes=?,updatedAt=? WHERE id=? AND deletedAt IS NULL").bind(item.name,item.notes,now,id)
    : db.prepare("INSERT INTO Item (id,name,category,notes,updatedAt) VALUES (?,?,?,?,?)").bind(recordId,item.name,category,item.notes,now);
  const [saved] = await db.batch([writeItem, writeDetail(db, category, recordId, detail)]);
  if (!saved.meta.changes) return new Response("档案已归档", { status: 409 });
  return new Response(null, {status:303,headers:{location:`${base}/${recordId}?saved=1`}});
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (!["GET", "POST"].includes(request.method)) return new Response(null, {status:405});
      if (url.pathname === "/assets/forms.js" && request.method === "GET") {
        return new Response(browser, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" } });
      }
      if (env.LOCAL_INSTANCE === true) {
        const headers = new Headers(request.headers);
        headers.set("oai-authenticated-user-id", "local-device");
        return await businessRoute(new Request(request, {headers}), env, url, "local-device");
      }
      if (requireDemoAuth && (env.DEMO_ACCOUNT_MODE !== "enabled" || !env.DEMO_PUBLIC_ORIGIN)) {
        return new Response("演示站登录暂不可用", {status:503, headers:{"cache-control":"no-store"}});
      }
      if (env.DEMO_ACCOUNT_MODE === "enabled") return await demoAuthRoute(request, env, url);
      return await businessRoute(request, env, url, request.headers.get("oai-authenticated-user-id"));
    } catch (error) {
      console.error(error instanceof Error ? error.name : "Worker error");
      return render(hero("暂时无法读取或保存档案", link("/", "返回总览")), 500);
    }
  },
};


async function businessRoute(request, env, url, identity) {
  const seedDemo = () => env.LOCAL_INSTANCE === true && env.LOCAL_DEMO_SEED !== true ? undefined : seed(env.DB);
  if (url.pathname === "/" && request.method === "GET") {
    await seedDemo();
    await ensureFoodData(env.DB);
    return await home(env.DB,identity);
  }
  if (url.pathname === "/items/food" || url.pathname.startsWith("/items/food/")) {
    await seedDemo();
    await ensureFoodData(env.DB);
    return await foodRoute(request,env,url);
  }
  if (url.pathname === "/items/medicine" || url.pathname.startsWith("/items/medicine/")) {
    if (identity) await seedDemo();
    return await drugRoute(request,env,url);
  }
  if (url.pathname === "/items/clothing" || url.pathname.startsWith("/items/clothing/")) {
    await seedDemo();
    return wardrobeRoute(request,env.DB,url);
  }
  const [, category, id] = url.pathname.match(/^\/items\/([a-z]+)(?:\/([a-z0-9-]+))?\/?$/) ?? [];
  if (category && Object.hasOwn(catalog, category)) {
    await seedDemo();
    if (id) return await record(request, env.DB, category, id, url);
    if (request.method === "GET") return await list(env.DB, category, url);
  }
  return render(hero("找不到这个页面", link("/", "返回总览")), 404);
}
