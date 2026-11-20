const safetyRoot=drugRoot+"/safety";
const safetySources={prescription:"医生处方",leaflet:"正式药品说明书"};
const safetyEvidence=[
  {
    kind:"有来源的相互作用",
    name:"西地那非与硝酸甘油",
    left:["sildenafil","sildenafil citrate","西地那非","枸橼酸西地那非"],
    right:["nitroglycerin","硝酸甘油"],
    detail:"西地那非说明书将与有机硝酸酯合用列为禁忌，并在患者说明中列出硝酸甘油。请核对用药安排。",
    label:"DailyMed · VIAGRA 说明书 §4.1、§7.1 和患者用药信息",
    url:"https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d905dc8d-917f-4ea3-a4ee-a1ecf6967d4e",
  },
  {
    kind:"潜在同类治疗重复",
    name:"他达拉非与西地那非",
    left:["tadalafil","他达拉非"],
    right:["sildenafil","sildenafil citrate","西地那非","枸橼酸西地那非"],
    detail:"他达拉非说明书 §5.11 说明与其他 PDE5 抑制剂组合的安全性与有效性尚未研究。",
    label:"DailyMed · CIALIS 说明书 §5.11",
    url:"https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=bcd8f8ab-81a2-4891-83db-24a0b0e25895",
    companionLabel:"DailyMed · VIAGRA 说明书 §12.1",
    companionUrl:"https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d905dc8d-917f-4ea3-a4ee-a1ecf6967d4e",
  },
];
const safetyAmount=(n)=>Number(n.toFixed(9));
const safetyNames=(rows)=>[...new Set(rows.map(drugTitle))].join("、");
const safetyIngredients=(r)=>{
  if (!r.ingredientsSnapshot) return [];
  try {
    const value=JSON.parse(r.ingredientsSnapshot);
    return Array.isArray(value)?value.filter((p)=>typeof p?.normalizedName==="string"):[];
  } catch {return [];}
};
const safetyHas=(row,names)=>safetyIngredients(row).some((p)=>names.includes(p.normalizedName));
const safetyLink=(href,label)=>`<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`;
const safetyBatchRules=(db,user)=>foodAll(db,`SELECT r.*,d.name,d.tradeName FROM MedicationSafetyRule r
  JOIN DrugItem d ON d.id=r.drugId AND d.userId=r.userId WHERE r.userId=? AND d.deletedAt IS NULL ORDER BY d.name`,user);

function safetyCompoundFindings(rows,planned=false) {
  const groups=new Map();
  for (const row of rows) {
    for (const ingredient of safetyIngredients(row)) {
      const key=row.timeZone+"|"+ingredient.normalizedName;
      if (!groups.has(key)) groups.set(key,{name:ingredient.originalName,products:new Map(),sources:new Set()});
      const group=groups.get(key);
      group.products.set(row.drugId,row);
      if (ingredient.source) group.sources.add(ingredient.source);
    }
  }
  const repeats=[...groups.values()].filter((g)=>g.products.size>1).map((g)=>({
    kind:planned?"计划涉及重复成分":"实际服用记录存在重复成分",name:g.name,detail:safetyNames([...g.products.values()])+
      (g.sources.size?"。成分记录来源："+[...g.sources].join("、"):""),
  }));
  const byZone=new Map();
  for (const row of rows) {
    if (!byZone.has(row.timeZone)) byZone.set(row.timeZone,[]);
    byZone.get(row.timeZone).push(row);
  }
  const matches=safetyEvidence.flatMap((evidence)=>{
    for (const logs of byZone.values()) {
      const a=logs.find((r)=>safetyHas(r,evidence.left));
      const b=a&&logs.find((r)=>safetyHas(r,evidence.right));
      if (a&&b) return [{...evidence,detail:evidence.detail+(planned?" 同日计划：":" 同日记录：")+
        safetyNames([a,b])+"。实际服用间隔需要核对。"}];
    }
    return [];
  });
  return [...repeats,...matches];
}

// Only exact and unambiguous wall times are converted for intervals.
function safetyInstant(local,zone) {
  if (!drugDateTime(local)) return null;
  try {
    const utc=Date.parse(local+"Z");
    const format=new Intl.DateTimeFormat("sv-SE",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
    const wall=(time)=>format.format(new Date(time)).replace(" ","T");
    const samples=[utc-129600000,utc,utc+129600000];
    const offsets=new Set(samples.map((t)=>Date.parse(wall(t)+"Z")-t));
    const matches=[...offsets].map((offset)=>utc-offset).filter((time)=>wall(time)===local);
    return matches.length===1?matches[0]:null;
  } catch {return null;}
}
function safetyRuleFindings(rule,day,plans,logs) {
  if (!rule.active||day<rule.effectiveOn) return [];
  const findings=[];
  const push=(kind,detail)=>findings.push({kind,name:drugTitle(rule),detail,label:safetySources[rule.sourceType]+" · "+rule.sourceRef,
    url:rule.sourceUrl,appliesTo:rule.appliesTo});
  const relevant=logs.filter((l)=>l.drugId===rule.drugId&&l.occurredAtLocal.slice(0,10)>=rule.effectiveOn);
  const onDay=relevant.filter((l)=>l.occurredAtLocal.startsWith(day));
  const comparable=onDay.filter((l)=>l.timeZone===rule.timeZone);
  const exact=comparable.filter((l)=>l.unit===rule.unit&&Number.isFinite(l.amount));
  if (onDay.length!==comparable.length) push("信息不足","部分服用记录的时区与规则不一致。");
  if (onDay.length && (rule.maxSingle!=null||rule.maxDaily!=null) && exact.length!==comparable.length) {
    push("信息不足","部分剂量单位或数量无法按此规则比较。");
  }
  if (rule.maxSingle!=null) for (const l of exact.filter((l)=>l.amount>rule.maxSingle)) {
    push("实际服用超过核对值",`${l.occurredAtLocal.slice(11)} 记录 ${l.amount} ${rule.unit}；单次上限 ${rule.maxSingle} ${rule.unit}。`);
  }
  if (rule.maxDaily!=null&&exact.length&&exact.length===onDay.length) {
    const total=safetyAmount(exact.reduce((sum,l)=>sum+l.amount,0));
    if (total>rule.maxDaily) push("实际服用超过核对值",`当天记录合计 ${total} ${rule.unit}；日总量上限 ${rule.maxDaily} ${rule.unit}。`);
  }
  if (rule.maxCount!=null&&comparable.length>rule.maxCount) {
    push("实际服用超过核对值",`当天有 ${comparable.length} 次服用记录；次数上限 ${rule.maxCount}。`);
  }
  if (rule.minIntervalMinutes!=null&&comparable.length) {
    const history=relevant.filter((l)=>l.timeZone===rule.timeZone).map((row)=>({row,instant:safetyInstant(row.occurredAtLocal,row.timeZone)}));
    if (history.some((x)=>x.instant===null)||relevant.length!==history.length) {
      push("信息不足","时区不一致或时间存在歧义，未计算实际服用间隔。");
    } else {
      history.sort((a,b)=>a.instant-b.instant);
      for (let i=1;i<history.length;i++) {
        if (!history[i].row.occurredAtLocal.startsWith(day)) continue;
        const gap=(history[i].instant-history[i-1].instant)/60000;
        if (gap<rule.minIntervalMinutes) push("实际服用间隔低于核对值",`记录间隔 ${gap} 分钟；所录最短间隔 ${rule.minIntervalMinutes} 分钟。`);
      }
    }
  }
  for (const plan of plans.filter((p)=>p.drugId===rule.drugId&&planEffective(p,day))) {
    if (plan.timeZone!==rule.timeZone) {push("信息不足","计划时区与规则时区不一致。");continue;}
    if (rule.maxCount!=null) {
      if (plan.frequency==null) push("信息不足","计划尚未填写每日次数。");
      else if (plan.frequency>rule.maxCount) push("计划超过核对值",`计划每日 ${plan.frequency} 次；次数上限 ${rule.maxCount}。`);
    }
    if (rule.maxSingle!=null||rule.maxDaily!=null) {
      if (plan.dose==null||plan.unit!==rule.unit) push("信息不足","计划剂量或单位无法按此规则比较。");
      else {
        if (rule.maxSingle!=null&&plan.dose>rule.maxSingle) push("计划超过核对值",`计划单次 ${plan.dose} ${rule.unit}；单次上限 ${rule.maxSingle} ${rule.unit}。`);
        if (rule.maxDaily!=null&&plan.frequency==null) push("信息不足","计划尚未填写每日次数，无法核对计划日总量。");
        if (rule.maxDaily!=null&&plan.frequency!=null) {
          const total=safetyAmount(plan.dose*plan.frequency);
          if (total>rule.maxDaily) push("计划超过核对值",`计划日总量 ${total} ${rule.unit}；日总量上限 ${rule.maxDaily} ${rule.unit}。`);
        }
      }
    }
    if (rule.minIntervalMinutes!=null) {
      const times=planTimes(plan);
      const starts=times.map((time)=>safetyInstant(day+"T"+time,plan.timeZone));
      if (times.length&&(!plan.endOn||day<plan.endOn)) starts.push(safetyInstant(foodAddDays(day,1)+"T"+times[0],plan.timeZone));
      if (!times.length||starts.some((time)=>time===null)) push("信息不足","计划时刻不完整或存在歧义，未计算计划间隔。");
      else if (starts.some((time,i)=>i&&(time-starts[i-1])/60000<rule.minIntervalMinutes)) {
        push("计划间隔低于核对值",`部分计划间隔短于所录 ${rule.minIntervalMinutes} 分钟。`);
      }
    }
  }
  return findings;
}

async function safetyWriteRule(db,user,form) {
  const get=(name)=>foodValue(form,name);
  const id=get("drugId");
  const prior=await foodOne(db,"SELECT * FROM MedicationSafetyRule WHERE userId=? AND drugId=?",user,id);
  if (!await foodOne(db,"SELECT id FROM DrugItem WHERE userId=? AND id=? AND deletedAt IS NULL",user,id)) return drugError("找不到该药品。",safetyRoot,404);
  if (get("operation")==="disable") {
    const result=await foodRead(db,"UPDATE MedicationSafetyRule SET active=0,revision=? WHERE userId=? AND drugId=? AND revision=?",
      crypto.randomUUID(),user,id,get("revision")).run();
    return result.meta.changes?foodRedirect(safetyRoot+"?drug="+encodeURIComponent(id)):
      drugError("规则已有新变化，或不存在。",safetyRoot,409);
  }
  const limit=(key)=>drugNumberValue(get(key));
  const maxSingle=limit("maxSingle"),maxDaily=limit("maxDaily"),maxCount=limit("maxCount"),minIntervalMinutes=limit("minIntervalMinutes");
  const values=[maxSingle,maxDaily,maxCount,minIntervalMinutes];
  const valid=(n)=>n===null||(Number.isFinite(n)&&n>0&&n<=1000000);
  const unit=get("unit"),sourceRef=get("sourceRef"),sourceType=get("sourceType"),sourceUrl=get("sourceUrl");
  const effectiveOn=get("effectiveOn"),appliesTo=get("appliesTo");
  let timeZone="";
  if (get("timeZone")) {
    try {timeZone=new Intl.DateTimeFormat("en",{timeZone:get("timeZone")}).resolvedOptions().timeZone;} catch {}
  }
  if (get("verified")!=="yes"||!Object.hasOwn(safetySources,sourceType)||!sourceRef||sourceRef.length>320||
    !appliesTo||appliesTo.length>400||!foodDate(effectiveOn)||!timeZone||
    (sourceUrl&&(sourceUrl.length>600||!/^https:\/\/[^\s]+$/.test(sourceUrl)))||
    values.every((v)=>v===null)||values.some((v)=>!valid(v))||
    (maxCount!=null&&(!Number.isInteger(maxCount)||maxCount>100))||
    (minIntervalMinutes!=null&&(!Number.isInteger(minIntervalMinutes)||minIntervalMinutes>10080))||
    ((maxSingle!=null||maxDaily!=null)&&!unit)||unit.length>20) {
    return drugError("请填写适用条件、可核对的处方或说明书来源，以及至少一项适用限制。剂量限制需要单位。",safetyRoot);
  }
  const fields={sourceType,sourceRef,sourceUrl:sourceUrl||null,appliesTo,effectiveOn,timeZone,unit:unit||null,
    maxSingle,maxDaily,maxCount,minIntervalMinutes,active:1,confirmedAt:new Date().toISOString(),revision:crypto.randomUUID()};
  const names=Object.keys(fields);
  if (prior) {
    const result=await foodRead(db,`UPDATE MedicationSafetyRule SET ${names.map((key)=>key+"=?").join(",")} WHERE id=? AND userId=? AND revision=?`,
      ...Object.values(fields),prior.id,user,get("revision")).run();
    if (!result.meta.changes) return drugError("规则已有新变化，请刷新。",safetyRoot,409);
  } else {
    const values=[crypto.randomUUID(),user,id,...Object.values(fields)];
    await foodRead(db,`INSERT INTO MedicationSafetyRule (id,userId,drugId,${names.join(",")}) VALUES (${values.map(()=>"?").join(",")})`,...values).run();
  }
  return foodRedirect(safetyRoot+"?drug="+encodeURIComponent(id)+"&saved=1");
}
function safetyRuleForm(current,selected,profiles) {
  return drugModuleForm(intakeHidden("revision",current?.revision||"")+
    (current?intakeHidden("drugId",selected)+`<p class="wide"><strong>${escape(drugTitle(current))}</strong></p>`:
      foodDropdown("drugId","适用药品档案",foodOption("","选择药品档案",selected)+profiles.map((r)=>foodOption(r.id,drugProfileTitle(r),selected)).join(""),"required"))+
    foodDropdown("sourceType","来源类型",drugTypesOptions(safetySources,current?.sourceType||"prescription"))+
    foodInput("sourceRef","可核对的来源与章节",current?.sourceRef,'required maxlength="320"')+
    foodInput("sourceUrl","来源链接（选填）",current?.sourceUrl,'type="url" maxlength="600"')+
    foodInput("appliesTo","处方适用人或说明书适用条件",current?.appliesTo,'required maxlength="400"')+
    drugDateInput("effectiveOn","规则生效日期",current?.effectiveOn||todayFood())+
    foodInput("timeZone","核对时区",current?.timeZone||"Asia/Shanghai",'required maxlength="80"')+
    foodInput("unit","剂量单位",current?.unit,'maxlength="20"')+
    drugNumber("maxSingle","单次剂量上限",current?.maxSingle)+drugNumber("maxDaily","每日总量上限",current?.maxDaily)+
    foodInput("maxCount","每日次数上限",current?.maxCount,'type="number" min="1" max="100"')+
    foodInput("minIntervalMinutes","最短服用间隔（分钟）",current?.minIntervalMinutes,'type="number" min="1" max="10080"')+
    '<label class="wide"><span><input type="checkbox" name="verified" value="yes" required> 已核对来源和适用条件</span></label>',
    "保存并启用");
}
function safetyFindingList(findings,empty) {
  return `<div class="panel food-list">${findings.map((f)=>`<div><span><strong>${escape(f.kind)} · ${escape(f.name)}</strong>
    <small>${escape(f.detail)}</small>${f.label?`<small>来源：${f.url?safetyLink(f.url,f.label):escape(f.label)}${f.companionUrl?" · "+safetyLink(f.companionUrl,f.companionLabel):""}</small>`:""}
    ${f.appliesTo?`<small>适用条件：${escape(f.appliesTo)}</small>`:""}</span></div>`).join("")||'<p class="empty">'+escape(empty)+'</p>'}</div>`;
}
async function drugSafetyPage(db,user,form,url) {
  if (form) return safetyWriteRule(db,user,form);
  const chosen=url.searchParams.get("date");
  const day=foodDate(chosen)?chosen:todayFood();
  const [profiles,rules,logs,plans,overlaps,ingredients]=await Promise.all([
    drugProfiles(db,user),safetyBatchRules(db,user),
    foodAll(db,drugLogSql+` AND l.status='taken' AND substr(l.occurredAtLocal,1,10) BETWEEN ? AND ?`,user,foodAddDays(day,-7),day),
    drugPlans(db,user),drugOverlaps(db,user),foodAll(db,`SELECT g.drugId,g.originalName,g.source,a.normalizedName FROM DrugIngredient g
      JOIN DrugItem d ON d.id=g.drugId JOIN ActiveIngredient a ON a.id=g.ingredientId AND a.userId=d.userId WHERE d.userId=?`,user),
  ]);
  const currentLogs=logs.filter((l)=>l.occurredAtLocal.startsWith(day));
  const results=safetyCompoundFindings(currentLogs);
  const activePlans=plans.filter((p)=>planEffective(p,day)).map((p)=>({...p,
    ingredientsSnapshot:JSON.stringify(ingredients.filter((ingredient)=>ingredient.drugId===p.drugId))}));
  const planned=safetyCompoundFindings(activePlans,true);
  const dose=rules.flatMap((r)=>safetyRuleFindings(r,day,plans,logs));
  const noIngredients=currentLogs.filter((r)=>safetyIngredients(r).length===0);
  const checkedProducts=new Set(rules.filter((r)=>r.active&&r.effectiveOn<=day).map((r)=>r.drugId));
  const missingRules=[...new Map([...currentLogs,...activePlans].filter((r)=>!checkedProducts.has(r.drugId)).map((r)=>[r.drugId,r])).values()];
  const selected=url.searchParams.get("drug")||"";
  if (selected&&!profiles.some((r)=>r.id===selected)) return drugError("找不到该药品。",safetyRoot,404);
  const current=rules.find((r)=>r.drugId===selected);
  const inventory=overlaps.map((group)=>({kind:"库存同名成分",name:group[0].originalName,detail:safetyNames(group)}));
  return render(drugBack("药品安全提示","查看成分重叠和有来源的规则核对。",foodButton(logRoot,"实际服用记录"))+
    (url.searchParams.has("saved")?'<p class="notice" role="status">规则已保存。</p>':"")+
    `<form class="filters">${drugDateInput("date","核对日期",day)}${selected?intakeHidden("drug",selected):""}<button class="button secondary">查看</button></form>
    <section><div class="section-heading"><h2>实际服用成分与组合</h2></div>
    <p class="food-muted">比较同一时区当天的已服用记录。相互作用只覆盖下方列明来源的组合。</p>
    ${safetyFindingList(results,"该日没有落入当前规则的组合或重复成分。")}
    ${noIngredients.length?`<p class="notice">信息不足：${escape(safetyNames(noIngredients))} 的部分记录缺少已确认成分快照。</p>`:""}</section>
    <section><div class="section-heading"><h2>当前用药计划组合</h2></div>
    <p class="food-muted">依据当天适用的现行计划和当前已核对成分。</p>
    ${safetyFindingList(planned,"当前计划没有落入此处覆盖的组合。")}</section>
    <section><div class="section-heading"><h2>库存成分重叠</h2></div>${safetyFindingList(inventory,"暂无已录入成分重叠的在库药品。")}</section>
    <section><div class="section-heading"><h2>计划与实际剂量、次数和间隔</h2></div>
    ${safetyFindingList(dose,"当前已启用的规则没有可报告项。")}
    ${missingRules.length?`<p class="notice">信息不足：${escape(safetyNames(missingRules))} 尚无适用且已核对的剂量规则。</p>`:""}
    <p class="food-muted">核对值由你从适用的处方或说明书录入。单位不一致时不会自动换算。</p></section>
    <section><div class="section-heading"><h2>来源和核对规则</h2>${current?link(safetyRoot,"新建规则"):""}</div>
    <div class="panel food-list">${rules.map((r)=>link(safetyRoot+"?drug="+encodeURIComponent(r.drugId),
      `<span><strong>${escape(drugTitle(r))}</strong><small>${r.active?"启用":"停用"} · ${escape(safetySources[r.sourceType])} · ${escape(r.sourceRef)}</small></span>`)).join("")||
      '<p class="empty">暂无个人核对规则。</p>'}</div>
    ${safetyRuleForm(current,selected,profiles)}
    ${current?.active?`<form method="post" class="food-toolbar">${intakeHidden("drugId",current.drugId)}${intakeHidden("revision",current.revision)}
      <button class="button secondary" name="operation" value="disable">停用规则</button></form>`:""}
    <details class="archive"><summary>查看组合规则来源</summary>${safetyEvidence.map((e)=>`<p>${escape(e.name)} · ${safetyLink(e.url,e.label)}
      ${e.companionUrl?" · "+safetyLink(e.companionUrl,e.companionLabel):""}</p>`).join("")}</details></section>`);
}
