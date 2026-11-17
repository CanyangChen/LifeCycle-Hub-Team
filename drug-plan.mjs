const planRoot=drugRoot+"/plans";
const logRoot=drugRoot+"/logs";
const planSources={prescription:"医生处方",leaflet:"药品说明书",user:"用户录入",unconfirmed:"尚未确认"};
const planStatuses={active:"进行中",paused:"已暂停",ended:"已结束",deleted:"已删除"};
const logStatuses={taken:"已服用",skipped:"跳过",missed:"漏服",pending:"待确认"};
const drugTime=(value)=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const drugDateTime=(value)=>value.length===16&&value[10]==="T"&&foodDate(value.slice(0,10))&&drugTime(value.slice(11));
const drugNowLocal=(zone)=>{const c=intakeClock(zone);return c.day+"T"+c.time;};
const planFormField=(form,prefix,name)=>foodValue(form,prefix+name);

function drugPlanFields(plan={},prefix="") {
  const key=(name)=>prefix+name;
  const options=(choices,value)=>drugTypesOptions(choices,value);
  return drugNumber(key("dose"),"单次剂量",plan.dose)+foodInput(key("unit"),"剂量单位",plan.unit,'maxlength="20"')+
    foodInput(key("frequency"),"每日次数",plan.frequency,'type="number" min="1" max="24"')+
    foodInput(key("times"),"提醒时间",plan.times||"", 'placeholder="例如 08:00,13:00,19:00" maxlength="180"')+
    foodInput(key("mealTiming"),"与进餐的关系",plan.mealTiming,'placeholder="按原说明填写，例如饭后" maxlength="80"')+
    drugDateInput(key("startOn"),"开始日期",plan.startOn)+drugDateInput(key("endOn"),"结束日期（可选）",plan.endOn)+
    foodDropdown(key("source"),"计划来源",options(planSources,plan.source||"user"))+
    foodInput(key("timeZone"),"计划时区",plan.timeZone||"Asia/Shanghai",'maxlength="80"')+
    foodInput(key("notes"),"计划备注",plan.notes,'maxlength="1600"');
}
function drugPlanValues(form,prefix="",prior=null) {
  const v=(key)=>planFormField(form,prefix,key);
  const timeZone=intakeZone(v("timeZone")||prior?.timeZone);
  const dose=drugNumberValue(v("dose")),frequency=drugNumberValue(v("frequency"));
  const unit=v("unit"),source=v("source")||"user";
  const startOn=v("startOn")||intakeClock(timeZone).day,endOn=v("endOn");
  const rawTimes=v("times").split(/[\s,，、；;]+/).filter(Boolean);
  const times=[...new Set(rawTimes)].sort();
  if ((!drugValidNumber(dose)||dose===0||(dose!=null&&!unit))||unit.length>20||v("mealTiming").length>80||
    (frequency!=null&&(!Number.isInteger(frequency)||frequency<1||frequency>24))||
    times.length>24||times.length!==rawTimes.length||times.some((time)=>!drugTime(time))||
    (frequency!=null&&times.length>0&&times.length!==frequency)||
    !foodDate(startOn)||(endOn&&(!foodDate(endOn)||endOn<startOn))||
    !Object.hasOwn(planSources,source)||v("notes").length>1600) return null;
  return {dose,unit:unit||null,frequency:frequency??(times.length||null),timesJson:JSON.stringify(times),
    mealTiming:v("mealTiming")||null,startOn,endOn:endOn||null,timeZone,source,notes:v("notes")||null};
}
function drugInsertPlan(db,user,drugId,batchId,values,now=new Date().toISOString()) {
  const row={id:crypto.randomUUID(),userId:user,drugId,batchId,...values,status:"active",createdAt:now,updatedAt:now};
  return foodRead(db,`INSERT INTO MedicationPlan(${Object.keys(row).join(",")}) VALUES (${Object.keys(row).map(()=>"?").join(",")})`,...Object.values(row));
}
const drugPlanSql=`SELECT p.*,d.name,d.tradeName FROM MedicationPlan p
  JOIN DrugItem d ON d.id=p.drugId AND d.userId=p.userId WHERE p.userId=?`;
const drugPlans=(db,user)=>foodAll(db,drugPlanSql+" ORDER BY p.createdAt DESC",user);
const drugPlan=(db,user,id)=>foodOne(db,drugPlanSql+" AND p.id=?",user,id);
const planEffective=(p,day)=>p.status==="active"&&day>=p.startOn&&(!p.endOn||day<=p.endOn);
const planStatusLabel=(p)=>p.status==="active"&&p.endOn&&p.endOn<intakeClock(p.timeZone).day?"已到结束日期":planStatuses[p.status];
const planTimes=(p)=>JSON.parse(p.timesJson);
const planOccurrence=(p,local)=>drugDateTime(local)&&local.slice(0,10)>=p.startOn&&
  (!p.endOn||local.slice(0,10)<=p.endOn)&&planTimes(p).includes(local.slice(11));

async function drugSchedule(db,user,plans,{includeUntimed=false}={}) {
  const live=plans.filter((p)=>p.status==="active");
  if (!live.length) return [];
  const byPlan=new Map(live.map((p)=>[p.id,intakeClock(p.timeZone).day]));
  const days=[...new Set(byPlan.values())];
  const read=await foodAll(db,`SELECT planId,scheduledAtLocal,status FROM MedicationLog
    WHERE userId=? AND substr(scheduledAtLocal,1,10) IN (${days.map(()=>"?").join(",")})`,user,...days);
  const entries=new Map(read.map((row)=>[row.planId+"|"+row.scheduledAtLocal,row.status]));
  return live.flatMap((p)=>{
    const day=byPlan.get(p.id);
    if (!planEffective(p,day)) return [];
    const times=planTimes(p);
    if (includeUntimed&&!times.length) return [{p,time:null,day,local:"",state:null}];
    return times.map((time)=>{
      const local=day+"T"+time;
      return {p,time,day,local,state:entries.get(p.id+"|"+local)||"pending"};
    });
  }).sort((a,b)=>(a.local||"~").localeCompare(b.local||"~")||drugTitle(a.p).localeCompare(drugTitle(b.p)));
}
async function drugPlanTasks(db,user) {
  const plans=await drugPlans(db,user);
  const schedule=await drugSchedule(db,user,plans);
  return [
    ...schedule.filter((x)=>x.state==="pending").map(({p,local})=>({id:p.id,category:"medicine",name:"用药计划",
      title:"计划时间待确认",dueOn:local.replace("T"," "),href:logRoot+"?plan="+p.id+"&scheduled="+encodeURIComponent(local)})),
    ...plans.filter((p)=>p.status==="active"&&p.endOn===intakeClock(p.timeZone).day).map((p)=>({id:p.id,
      category:"medicine",name:"用药计划",title:"计划今日结束",dueOn:p.endOn,href:planRoot+"?id="+p.id})),
  ];
}
async function drugPlanPage(db,user,form,url) {
  const [plans,profiles,batches]=await Promise.all([drugPlans(db,user),drugProfiles(db,user),drugBatches(db,user)]);
  if (form) {
    const id=foodValue(form,"id"),requested=foodValue(form,"operation");
    const operation=requested==="delete"?"deleted":requested;
    const current=plans.find((p)=>p.id===id);
    if (id&&(!current||current.status==="deleted")) return drugError("找不到可编辑的用药计划。",planRoot,404);
    if (["paused","active","ended","deleted"].includes(operation)&&current) {
      if (operation==="active"&&current.status==="ended") return drugError("已结束的计划可查看历史，也可以创建新计划。",planRoot,409);
      await foodRead(db,"UPDATE MedicationPlan SET status=?,updatedAt=? WHERE userId=? AND id=? AND status<>'deleted'",
        operation,new Date().toISOString(),user,id).run();
      return foodRedirect(planRoot+(operation==="deleted"?"?deleted=1":""));
    }
    const drugId=current?.drugId||foodValue(form,"drugId");
    const batchId=foodValue(form,"batchId")||null;
    const values=drugPlanValues(form,"",current);
    if (!profiles.some((r)=>r.id===drugId)||!values||
      (batchId&&!batches.some((r)=>r.drugId===drugId&&r.itemId===batchId&&!r.archivedAt))) {
      return drugError("检查药品、批次、日期和提醒时间。已填写提醒时间时，其数量须与每日次数一致。",planRoot);
    }
    const now=new Date().toISOString();
    if (current) {
      const result=await foodRead(db,`UPDATE MedicationPlan SET batchId=?,${Object.keys(values).map((key)=>key+"=?").join(",")},updatedAt=?
        WHERE userId=? AND id=? AND updatedAt=?`,batchId,...Object.values(values),now,user,id,foodValue(form,"version")).run();
      if (!result.meta.changes) return drugError("计划已有新变化，请刷新。",planRoot+"?id="+id,409);
    } else await drugInsertPlan(db,user,drugId,batchId,values,now).run();
    return foodRedirect(planRoot);
  }
  const current=plans.find((p)=>p.id===url.searchParams.get("id")&&p.status!=="deleted");
  if (url.searchParams.has("id")&&!current) return drugError("找不到该用药计划。",planRoot,404);
  const selected=current?.drugId||url.searchParams.get("drug")||"";
  const core=current?intakeHidden("id",current.id)+intakeHidden("version",current.updatedAt)+`<p class="wide"><strong>${escape(drugTitle(current))}</strong></p>`:
    foodDropdown("drugId","关联药品",foodOption("","选择药品",selected)+profiles.map((p)=>foodOption(p.id,drugProfileTitle(p),selected)).join(""),"required");
  const batchOptions=batches.filter((b)=>!b.archivedAt&&(!current||b.drugId===current.drugId))
    .map((b)=>foodOption(b.itemId,[drugTitle(b),b.lot,b.locationName].filter(Boolean).join(" · "),current?.batchId)).join("");
  const input=foodForm(core+foodDropdown("batchId","指定批次（可选）",foodOption("","确认服用时选择","")+batchOptions)+
    drugPlanFields(current?{...current,times:planTimes(current).join(", ")}:{startOn:todayFood()}),current?"保存用药计划":"新建用药计划");
  const stateButtons=(p)=>`<form class="food-toolbar" method="post">${intakeHidden("id",p.id)}
    ${p.status==="active"?'<button class="button secondary" name="operation" value="paused">暂停</button>':""}
    ${p.status==="paused"?'<button class="button secondary" name="operation" value="active">恢复</button>':""}
    ${["active","paused"].includes(p.status)?'<button class="button secondary" name="operation" value="ended">结束</button>':""}</form>`;
  const schedule=await drugSchedule(db,user,plans,{includeUntimed:true});
  const logLink=({p,local})=>logRoot+"?plan="+p.id+(local?"&scheduled="+encodeURIComponent(local):"");
  return render(drugBack("用药计划","按处方或说明书自行填写。时间与剂量可以留待确认。",foodButton(logRoot,"服用记录"))+
    `<div class="food-toolbar">${link(safetyRoot,"查看安全提示","button secondary")}</div>`+
    (url.searchParams.has("deleted")?'<p class="notice" role="status">用药计划已删除，已有服用记录可继续查看。</p>':"")+
    `<section><div class="section-heading"><h2>今日计划</h2></div><div class="panel food-list">${schedule.map((entry)=>link(logLink(entry),
      `<span><strong>${escape(drugTitle(entry.p))}</strong><small>${entry.time?escape(entry.time)+" · "+logStatuses[entry.state]:
        escape(["未设置时刻",entry.p.frequency?"每日 "+entry.p.frequency+" 次":"",entry.p.mealTiming].filter(Boolean).join(" · "))}</small></span>
        <span>${entry.time?"查看记录":"记录服用"}</span>`)).join("")||'<p class="empty">今天暂无进行中的用药计划。</p>'}</div></section>
    <section><div class="section-heading"><h2>当前及历史计划</h2></div>${plans.map((p)=>`<article class="panel editor"><h3>${escape(drugTitle(p))} · ${planStatusLabel(p)}</h3><p>${escape([
      p.frequency?"每日 "+p.frequency+" 次":null,p.mealTiming,planTimes(p).join("、"),p.startOn,p.endOn].filter(Boolean).join(" · "))}</p>
      ${p.status==="deleted"?"":foodButton(planRoot+"?id="+p.id,"编辑计划")+stateButtons(p)+deleteControl("计划",drugTitle(p),intakeHidden("id",p.id))}</article>`).join("")||'<div class="panel empty">暂无用药计划。</div>'}</section>
    <section><div class="section-heading"><h2>${current?"编辑计划":"新增计划"}</h2></div>${input}</section>`);
}

const drugLogSql=`SELECT l.*,d.name,d.tradeName,b.lot FROM MedicationLog l
  JOIN DrugItem d ON d.id=l.drugId AND d.userId=l.userId
  LEFT JOIN DrugBatch b ON b.itemId=l.batchId AND b.userId=l.userId WHERE l.userId=?`;
const drugLog=(db,user,id)=>foodOne(db,drugLogSql+" AND l.id=?",user,id);
const drugLogs=(db,user,day)=>day?foodAll(db,drugLogSql+" AND substr(coalesce(l.occurredAtLocal,l.scheduledAtLocal,l.createdAt),1,10)=? ORDER BY l.updatedAt DESC",user,day):
  foodAll(db,drugLogSql+" ORDER BY coalesce(l.occurredAtLocal,l.scheduledAtLocal,l.createdAt) DESC LIMIT 100",user);

async function drugSaveLog(db,user,form) {
  const v=(key)=>foodValue(form,key);
  const id=v("id");
  const prior=id?await drugLog(db,user,id):null;
  if (id&&(!prior||prior.revision!==v("version"))) return drugError("记录已被修改或不存在，请重新打开。",logRoot,409);
  const planId=prior?prior.planId:v("planId")||null;
  const plan=planId?await drugPlan(db,user,planId):null;
  const drugId=prior?.drugId||plan?.drugId||v("drugId");
  let batchId=prior?.batchId||(!prior?v("batchId")||plan?.batchId:null)||null;
  const scheduled=prior?prior.scheduledAtLocal:v("scheduledAtLocal")||null;
  const status=v("status");
  const taken=status==="taken";
  const amount=taken?drugNumberValue(v("amount")):null;
  const unit=taken?v("unit"):null;
  const zone=prior?.timeZone||plan?.timeZone||intakeZone(v("timeZone"));
  const occurred=taken?v("occurredAtLocal"):null;
  if (!drugId||!await foodOne(db,"SELECT id FROM DrugItem WHERE userId=? AND id=? AND (deletedAt IS NULL OR ?=1)",user,drugId,prior?1:0)||
    (planId&&!plan)||(!prior&&scheduled&&(!plan||!planOccurrence(plan,scheduled)))||
    !Object.hasOwn(logStatuses,status)||v("notes").length>1600||
    (taken&&(!amount||!drugValidNumber(amount)||!unit||unit.length>20||!drugDateTime(occurred)))) {
    return drugError("检查关联药品、状态、实际时间及剂量。确认已服用时需要实际剂量和单位。",logRoot);
  }
  const apply=taken&&v("recordOnly")!=="yes";
  let batch=batchId?await drugReadBatch(db,user,batchId):null;
  if (batchId&&(!batch||batch.drugId!==drugId)) return drugError("所选批次与药品不匹配。",logRoot);
  if (apply&&!batch) {
    const eligible=(await foodAll(db,drugSelect+" AND b.drugId=?",user,drugId))
      .filter((row)=>drugLive(row)&&row.unit===unit&&row.remainingAmount!=null&&row.remainingAmount>=amount);
    if (eligible.length>1) return drugError("有多个单位一致且数量足够的批次，请选择本次使用的批次。",logRoot);
    if (eligible.length===1) {
      batch=eligible[0];
      batchId=batch.itemId;
    }
  }
  if (apply&&(!batch||unit!==batch.unit)) return drugError("库存单位不一致或未选择批次。可按原单位填写，或选择仅记录服用。",logRoot);
  if (apply&&Number(amount.toFixed(6))!==amount) return drugError("扣减库存时，数量最多支持六位小数。",logRoot);
  const applied=apply?amount:0;
  const previous=prior?.stockApplied||0;
  const delta=Number((applied-previous).toFixed(6));
  if (delta && (!batch||batch.archivedAt||["discarded","expired"].includes(batch.status)||
    batch.remainingAmount==null||batch.remainingAmount<delta||
    (previous&&prior.unit!==batch.unit)||(delta>0&&!drugLive(batch)))) {
    return drugError("库存当前无法完成这次扣减或校正。请核对原批次状态、剩余量和单位。",logRoot,409);
  }
  const now=new Date().toISOString(),revision=crypto.randomUUID(),rid=prior?.id||crypto.randomUUID();
  const requestKey=prior?.requestKey||v("requestKey");
  if (!/^[0-9a-f-]{36}$/.test(requestKey)) return drugError("请刷新后重新打开记录表单。",logRoot);
  // Preserve the ingredients confirmed at recording time when the product
  // profile is edited later. Legacy taken records remain explicitly unknown.
  const ingredientsSnapshot=prior?.ingredientsSnapshot??(taken&&prior?.status!=="taken"?
    JSON.stringify((await drugParts(db,user,drugId)).map(({normalizedName,originalName,amount,unit,perUnit,source})=>
      ({normalizedName,originalName,amount,unit,perUnit,source}))) : null);
  const row={planId,batchId,scheduledAtLocal:scheduled,occurredAtLocal:occurred,timeZone:zone,amount,unit,status,
    notes:v("notes")||null,stockApplied:applied,ingredientsSnapshot,revision,updatedAt:now};
  const guard=delta?`EXISTS(SELECT 1 FROM DrugBatch b JOIN Item i ON i.id=b.itemId
    WHERE b.itemId=? AND b.userId=? AND i.updatedAt=? AND i.archivedAt IS NULL
    AND b.remainingAmount IS ? AND b.unit IS ? AND b.status=?)`:"1=1";
  const guardArgs=delta?[batchId,user,batch.updatedAt,batch.remainingAmount,batch.unit,batch.status]:[];
  const keys=Object.keys(row);
  const start=prior
    ? foodRead(db,`UPDATE MedicationLog SET ${keys.map((key)=>key+"=?").join(",")} WHERE id=? AND userId=? AND revision=? AND ${guard}`,
      ...Object.values(row),rid,user,prior.revision,...guardArgs)
    : foodRead(db,`INSERT INTO MedicationLog(id,userId,drugId,requestKey,createdAt,${keys.join(",")})
      SELECT ${["id","userId","drugId","requestKey","createdAt",...keys].map(()=>"?").join(",")} WHERE ${guard}`,
      rid,user,drugId,requestKey,now,...Object.values(row),...guardArgs);
  const writes=[start];
  const logged="EXISTS(SELECT 1 FROM MedicationLog WHERE id=? AND userId=? AND revision=?)";
  const loggedArgs=[rid,user,revision];
  if (delta) {
    const remaining=Number((batch.remainingAmount-delta).toFixed(6));
    const status=remaining===0?"finished":batch.status==="finished"?"using":batch.status;
    writes.push(
      foodRead(db,`UPDATE DrugBatch SET remainingAmount=?,status=? WHERE itemId=? AND userId=? AND ${logged}`,remaining,status,batchId,user,...loggedArgs),
      foodRead(db,`UPDATE Item SET updatedAt=? WHERE id=? AND ${logged}`,now,batchId,...loggedArgs));
  }
  if (batchId&&(taken||prior?.status==="taken")) {
    writes.push(foodRead(db,`INSERT INTO LifecycleEvent(id,itemId,kind,occurredAt,notes) SELECT ?,?,?,?,? WHERE ${logged}`,
      crypto.randomUUID(),batchId,prior?"medicationCorrected":"medicationTaken",now,
      delta>0?`扣减 ${delta} ${batch.unit}`:delta<0?`退回 ${-delta} ${batch.unit}`:"仅记录服用状态",...loggedArgs));
  }
  let result;
  try { result=await db.batch(writes); }
  catch { return drugError("这条计划时间或提交已经有记录，请打开原记录修改。",logRoot,409); }
  if (!result[0].meta.changes) return drugError("库存或记录已有新变化，请刷新后核对。",logRoot,409);
  return foodRedirect(logRoot+"?id="+rid+"&saved=1");
}
async function drugLogPage(db,user,form,url) {
  if (form) return drugSaveLog(db,user,form);
  const day=url.searchParams.get("date")||"";
  const requested=url.searchParams.get("id");
  const planId=url.searchParams.get("plan");
  const scheduled=url.searchParams.get("scheduled")||"";
  let current=requested?await drugLog(db,user,requested):null;
  if (requested&&!current) return drugError("找不到服用记录。",logRoot,404);
  if (planId&&scheduled&&!current) {
    const existing=await foodOne(db,drugLogSql+" AND l.planId=? AND l.scheduledAtLocal=?",user,planId,scheduled);
    if (existing) return foodRedirect(logRoot+"?id="+existing.id);
  }
  const planIdToRead=current?.planId||planId;
  const plan=planIdToRead?await drugPlan(db,user,planIdToRead):null;
  if ((planIdToRead&&!plan)||(scheduled&&(!plan||!planOccurrence(plan,scheduled)))) return drugError("计划或计划时间已发生变化。",planRoot,404);
  const [rows,batches,profiles]=await Promise.all([drugLogs(db,user,foodDate(day)?day:""),drugBatches(db,user),drugProfiles(db,user)]);
  const zone=current?.timeZone||plan?.timeZone||"Asia/Shanghai";
  const selectedDrug=current?.drugId||plan?.drugId||url.searchParams.get("drug")||"";
  const selectedBatch=current?.batchId||plan?.batchId||url.searchParams.get("batch")||"";
  const formDrug=current||plan?`<p class="wide"><strong>${escape(drugTitle(current||plan))}</strong>
    ${scheduled||current?.scheduledAtLocal?" · 计划 "+escape(scheduled||current.scheduledAtLocal):""}</p>`+
    intakeHidden("drugId",selectedDrug):
    foodDropdown("drugId","药品",foodOption("","请选择药品",selectedDrug)+profiles.map((p)=>foodOption(p.id,drugProfileTitle(p),selectedDrug)).join(""),"required");
  const batchOpts=batches.filter((b)=>!b.archivedAt&&(!selectedDrug||b.drugId===selectedDrug))
    .map((b)=>foodOption(b.itemId,[drugTitle(b),b.locationName,drugQuantity(b)].join(" · "),selectedBatch)).join("");
  const batchField=current?intakeHidden("batchId",current.batchId||"")+
      `<p class="wide food-muted">关联批次：${escape(current.lot||batches.find((b)=>b.itemId===current.batchId)?.locationName||"未关联")}</p>`:
    foodDropdown("batchId","库存批次",foodOption("","可选，扣减时必须关联","")+batchOpts);
  const requestKey=crypto.randomUUID();
  const statuses=drugTypesOptions(logStatuses,current?.status||"pending");
  const actual=current?.occurredAtLocal||drugNowLocal(zone);
  const currentBatches=current?batches.filter((b)=>b.drugId===current.drugId):[];
  const savedStock=current&&url.searchParams.has("saved")?`<p class="notice" role="status">库存合计：${escape(drugStockSummary(currentBatches))}
    · ${link(drugRoot+"/profiles?id="+encodeURIComponent(current.drugId),"查看库存批次")}</p>`:"";
  const formContent=formDrug+batchField+intakeHidden("id",current?.id||"")+intakeHidden("version",current?.revision||"")+
    intakeHidden("planId",plan?.id||"")+intakeHidden("scheduledAtLocal",current?.scheduledAtLocal||scheduled)+
    intakeHidden("requestKey",requestKey)+intakeHidden("timeZone",zone)+foodDropdown("status","实际状态",statuses)+
    foodInput("occurredAtLocal","实际服用时间",actual,'type="datetime-local"')+
    drugNumber("amount","实际剂量",current?current.amount:plan?.dose)+foodInput("unit","实际剂量单位",current?current.unit:plan?.unit,'maxlength="20"')+
    foodInput("notes","记录备注",current?.notes,'maxlength="1600"')+
    `<label class="wide"><span><input type="checkbox" name="recordOnly" value="yes" ${current?.status==="taken"&&!current.stockApplied?"checked":""}> 仅记录服用，库存另行核对</span></label>
      <p class="wide food-muted">确认已服用后按实际剂量扣减。未指定批次时，仅有一个可用批次才会自动选择。跳过、漏服及待确认不扣减。漏服时请按说明书或向医生、药师核对。</p>`;
  return render(drugBack("实际服用记录","记录实际发生的服用情况。",foodButton(planRoot,"用药计划"))+
    `<div class="food-toolbar">${link(safetyRoot+(current?.occurredAtLocal?"?date="+current.occurredAtLocal.slice(0,10):""),"查看安全提示","button secondary")}</div>`+
    (url.searchParams.has("saved")?'<p class="notice" role="status">记录已保存。</p>':"")+savedStock+
    `<section><div class="section-heading"><h2>${current?"校正记录":"新增或确认服用记录"}</h2>${current?link(logRoot,"新建记录"):""}</div>${foodForm(formContent,"保存服用记录")}</section>
    <section><div class="section-heading"><h2>服用历史</h2></div><form class="filters">${drugDateInput("date","按日期查看",day)}
    <button class="button secondary">筛选</button></form><div class="panel food-list">${rows.map((r)=>link(logRoot+"?id="+r.id,
      `<span><strong>${escape(drugTitle(r))}</strong><small>${escape((r.occurredAtLocal||r.scheduledAtLocal||r.createdAt.slice(0,16)).replace("T"," "))} · ${logStatuses[r.status]}</small></span>
      <span>${r.amount?escape(r.amount+" "+r.unit):""}</span>`)).join("")||'<p class="empty">暂无服用记录。</p>'}</div></section>`);
}
