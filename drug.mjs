const drugRoot="/items/medicine";
const drugTypes={rx:"处方药",otc:"非处方药",other:"其他",unconfirmed:"尚未确认"};
const drugStatuses={sealed:"未开封",open:"已开封",using:"使用中",stopped:"已停止使用",finished:"已用完",discarded:"已丢弃",expired:"已过期"};
const drugGroups=[
  ["感冒及呼吸系统用药","感冒药","止咳药","祛痰药","鼻炎药","其他呼吸系统药品"],
  ["解热镇痛类","退烧药","止痛药","抗炎镇痛药"],["消化系统用药","胃肠道用药","助消化药","止泻药","缓解便秘药物"],
  ["抗感染类","抗菌药物","抗病毒药物","抗真菌药物"],["皮肤外用药","外用药膏","外用喷雾","皮肤抗感染药物"],
  ["眼耳鼻用药","眼药水","眼膏","滴耳液","鼻喷剂"],["心血管系统用药","降压药","调脂药"],
  ["内分泌及代谢类","降糖药","甲状腺相关药物"],["神经系统用药","神经系统相关药品"],
  ["维生素及矿物质","维生素","钙剂","矿物质补充剂"],["中成药及中药","中成药","中药饮片","中药颗粒"],["其他药品"],
];
const drugLive=(b)=>!b.archivedAt&&["sealed","open","using"].includes(b.status);
const drugHref=(b)=>drugRoot+"/"+encodeURIComponent(b.itemId);
const drugTitle=(b)=>b.tradeName?b.name+" · "+b.tradeName:b.name;
const drugQuantity=(b)=>b.remainingAmount==null?"数量未填写":[b.remainingAmount,b.unit].join(" ");
function drugStockSummary(batches) {
  const totals=new Map();
  let unknown=0;
  for (const batch of batches.filter(drugLive)) {
    if (batch.remainingAmount==null||!batch.unit) unknown++;
    else totals.set(batch.unit,(totals.get(batch.unit)||0)+batch.remainingAmount);
  }
  return [...[...totals].map(([unit,total])=>Number(total.toFixed(6))+" "+unit),
    ...(unknown?[unknown+" 个批次数量待核对"]:[])].join(" · ")||"暂无在库数量";
}
const drugBack=(title,description="",button="")=>hero(title,link(drugRoot,"‹ 药品总览")+(description?" · "+escape(description):""),button);
const drugError=(message,path=drugRoot,status=400)=>render(drugBack("请检查输入",message,foodButton(path,"返回")),status);
const drugTypesOptions=(values,current)=>Object.entries(values).map(([key,label])=>foodOption(key,label,current)).join("");
const drugDateInput=(name,label,value)=>foodInput(name,label,value,'type="date"');
const drugNumber=(name,label,value)=>foodInput(name,label,value,foodNumberAttrs);
const drugLocalClock=(form)=>intakeClock(intakeZone(foodValue(form,"timeZone")));

async function ensureDrugData(db,user) {
  if (!await foodOne(db,"SELECT id FROM DrugCategory WHERE id='drugcat-0'")) {
    const seed=drugGroups.flatMap(([name,...children],i)=>{
      const id="drugcat-"+i;
      return [foodRead(db,"INSERT OR IGNORE INTO DrugCategory(id,name) VALUES (?,?)",id,name),
        ...children.map((label,j)=>foodRead(db,"INSERT OR IGNORE INTO DrugCategory(id,name,parentId) VALUES (?,?,?)",id+"-"+j,label,id))];
    });
    await db.batch(seed);
  }
  const locationNames=["家庭药箱","卧室抽屉","客厅储物柜","冰箱冷藏室"];
  const parent=user+":drugloc:";
  if (!await foodOne(db,"SELECT id FROM DrugStorageLocation WHERE id=? AND userId=?",parent+0,user)) {
    await db.batch(locationNames.map((name,i)=>foodRead(db,"INSERT OR IGNORE INTO DrugStorageLocation(id,userId,name,builtIn) VALUES (?,?,?,1)",parent+i,user,name)));
  }
  let owner=await foodOne(db,"SELECT userId FROM DrugLegacyOwner WHERE singleton=1");
  if (!owner) {
    // Sites is owner-private for this migration. Claim once before any cross-user sharing.
    await foodRead(db,"INSERT OR IGNORE INTO DrugLegacyOwner(singleton,userId) VALUES (1,?)",user).run();
    owner=await foodOne(db,"SELECT userId FROM DrugLegacyOwner WHERE singleton=1");
  }
  if (owner?.userId!==user) return;
  const legacy=await foodAll(db,`SELECT i.id,i.name,m.purpose,m.ingredient,m.strength,m.batch,m.expiresOn FROM Item i
    JOIN MedicineDetail m ON m.itemId=i.id LEFT JOIN DrugBatch b ON b.itemId=i.id WHERE b.itemId IS NULL LIMIT 25`);
  if (legacy.length) await db.batch(legacy.flatMap((r)=>{
    const id="legacy-drug-"+r.id;
    const notes=[r.purpose,r.ingredient?"旧档成分（待核对）："+r.ingredient:""].filter(Boolean).join(" · ");
    return [
      foodRead(db,"INSERT OR IGNORE INTO DrugItem(id,userId,ownerId,name,specification,notes) VALUES (?,?,?,?,?,?)",id,user,user,r.name,r.strength,notes),
      foodRead(db,`INSERT OR IGNORE INTO DrugBatch(itemId,drugId,userId,locationId,lot,expiresOn,expiryLead,source)
        VALUES (?,?,?,?,?,?,30,'legacy')`,r.id,id,user,parent+0,r.batch,r.expiresOn),
    ];
  }));
}

const drugSelect=`SELECT b.*,p.name,p.tradeName,p.specification,p.form,p.drugType,p.categoryId,
  i.notes,i.createdAt,i.updatedAt,i.archivedAt,l.name AS locationName FROM DrugBatch b
  JOIN DrugItem p ON p.id=b.drugId AND p.userId=b.userId JOIN Item i ON i.id=b.itemId
  JOIN DrugStorageLocation l ON l.id=b.locationId AND l.userId=b.userId WHERE b.userId=? AND i.deletedAt IS NULL`;
const drugReadBatch=(db,user,id)=>foodOne(db,drugSelect+" AND b.itemId=?",user,id);
const drugBatches=(db,user)=>foodAll(db,drugSelect,user);
const drugProfiles=(db,user)=>foodAll(db,"SELECT * FROM DrugItem WHERE userId=? AND deletedAt IS NULL ORDER BY name,tradeName",user);
const drugLocations=(db,user)=>foodAll(db,"SELECT * FROM DrugStorageLocation WHERE userId=? AND retired=0 ORDER BY builtIn DESC,rowid",user);
const drugCategories=(db,user)=>foodAll(db,"SELECT * FROM DrugCategory WHERE userId IS NULL OR userId=? ORDER BY rowid",user);
const drugParts=(db,user,id)=>foodAll(db,`SELECT g.*,a.normalizedName FROM DrugIngredient g
  JOIN DrugItem p ON p.id=g.drugId JOIN ActiveIngredient a ON a.id=g.ingredientId AND a.userId=p.userId
  WHERE p.userId=? AND p.id=? ORDER BY g.rowid`,user,id);

function drugTasks(rows,today=todayFood()) {
  return rows.filter(drugLive).flatMap((r)=>{
    const dates=[[r.expiresOn,"包装标注有效期"],[r.openUseUntil,"开封后使用期限"]];
    const due=dates.flatMap(([date,label])=>{
      if (!foodDate(date)||((r.expiryLead==null||date>foodAddDays(today,r.expiryLead))&&date>=today)) return [];
      return [{id:r.itemId,category:"medicine",name:drugTitle(r),title:date<today?"已超过"+label:label+"临近",dueOn:date}];
    });
    if (r.lowStock!=null&&r.remainingAmount!=null&&r.remainingAmount<=r.lowStock) {
      due.push({id:r.itemId,category:"medicine",name:drugTitle(r),title:"达到设置的库存阈值",dueOn:today});
    }
    return due;
  }).sort((a,b)=>a.dueOn.localeCompare(b.dueOn));
}
async function drugHomeData(db,user) {
  if (!user) return {rows:[],tasks:[]};
  await ensureDrugData(db,user);
  const rows=await drugBatches(db,user);
  return {rows:rows.filter(drugLive),tasks:[...drugTasks(rows),...await drugPlanTasks(db,user)]};
}
async function drugOverlaps(db,user) {
  const rows=await foodAll(db,`SELECT DISTINCT a.normalizedName,g.originalName,p.id,p.name,p.tradeName
    FROM DrugIngredient g JOIN DrugItem p ON p.id=g.drugId
    JOIN ActiveIngredient a ON a.id=g.ingredientId AND a.userId=p.userId
    WHERE p.userId=? AND EXISTS(SELECT 1 FROM DrugBatch b JOIN Item i ON i.id=b.itemId
      WHERE b.drugId=p.id AND b.userId=p.userId AND b.status IN ('sealed','open','using') AND i.archivedAt IS NULL)
    ORDER BY a.normalizedName,p.name`,user);
  const groups=new Map();
  for (const row of rows) {
    if (!groups.has(row.normalizedName)) groups.set(row.normalizedName,new Map());
    groups.get(row.normalizedName).set(row.id,row);
  }
  return [...groups.values()].filter((group)=>group.size>1).map((group)=>[...group.values()]);
}
const drugLocationOptions=(locations,id)=>foodOptions(locations,id||locations[0]?.id);
const drugProfileTitle=(r)=>[r.name,r.tradeName,r.form,r.specification].filter(Boolean).join(" · ");
const drugNumberValue=(value)=>value===""?null:Number(value);
const drugValidNumber=(value)=>value==null||(Number.isFinite(value)&&value>=0&&value<=1000000);
const drugText=(form,key,max=240)=>foodValue(form,key).length<=max;
const drugNormalizeIngredient=(name)=>name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g," ");
function drugParseParts(text) {
  const lines=text.split(/\r?\n/).map((line)=>line.trim()).filter(Boolean);
  if (lines.length>16) return null;
  const parts=lines.map((line)=>line.split(/[|｜]/).map((s)=>s.trim()));
  if (parts.some((p)=>!p[0]||p.length>5||p.some((value,index)=>value.length>(index===4?240:100)))) return null;
  return [...new Map(parts.map((p)=>[drugNormalizeIngredient(p[0]),p])).values()];
}
function drugPartWrites(db,user,id,parts) {
  return [foodRead(db,"DELETE FROM DrugIngredient WHERE drugId=? AND EXISTS(SELECT 1 FROM DrugItem WHERE id=? AND userId=?)",id,id,user),
    ...parts.flatMap(([name,amount="",unit="",perUnit="",source=""])=>{
      const normalized=drugNormalizeIngredient(name);
      return [
        foodRead(db,"INSERT OR IGNORE INTO ActiveIngredient(id,userId,normalizedName) VALUES (?,?,?)",crypto.randomUUID(),user,normalized),
        foodRead(db,`INSERT INTO DrugIngredient(drugId,ingredientId,originalName,amount,unit,perUnit,source)
          SELECT ?,id,?,?,?,?,? FROM ActiveIngredient WHERE userId=? AND normalizedName=?`,id,name,amount||null,unit||null,perUnit||null,source||null,user,normalized),
      ];
    })];
}

async function drugReadProfileInput(db,user,form) {
  const keys=["name","tradeName","manufacturer","categoryId","drugType","form","specification","route","imageUrl","leaflet","profileNotes"];
  const values=Object.fromEntries(keys.map((key)=>[key,foodValue(form,key)]));
  values.drugType ||= "unconfirmed";
  const parts=drugParseParts(foodValue(form,"ingredients"));
  if (!values.name||!Object.hasOwn(drugTypes,values.drugType)||parts===null||
      keys.some((key)=>!drugText(form,key,["leaflet","profileNotes"].includes(key)?1600:240))||
      (values.imageUrl&&!/^https:\/\/[^\s]+$/.test(values.imageUrl))||
      (values.categoryId&&!await foodOne(db,"SELECT id FROM DrugCategory WHERE id=? AND (userId IS NULL OR userId=?)",values.categoryId,user))) return null;
  const {profileNotes,...profile}=values;
  return {profile:{...profile,categoryId:profile.categoryId||null,notes:profileNotes},parts};
}
function drugWriteProfile(db,user,id,data,edit=false) {
  const {profile,parts}=data, fields=Object.keys(profile);
  const write=edit
    ? foodRead(db,`UPDATE DrugItem SET ${fields.map((key)=>key+"=?").join(",")} WHERE id=? AND userId=?`,...Object.values(profile),id,user)
    : foodRead(db,`INSERT INTO DrugItem(id,userId,ownerId,${fields.join(",")}) VALUES (${["id","userId","ownerId",...fields].map(()=>"?")})`,id,user,user,...Object.values(profile));
  return [write,...drugPartWrites(db,user,id,parts)];
}

function drugProfileFields(profile={},categories=[],parts=[],required=true) {
  return foodInput("name","药品通用名称",profile.name,'maxlength="240"'+(required?" required":""))+
    foodInput("tradeName","商品名或品牌",profile.tradeName,'maxlength="240"')+
    foodInput("manufacturer","生产企业",profile.manufacturer,'maxlength="240"')+
    foodDropdown("categoryId","药品分类",foodCategoryOptions(categories,profile.categoryId||"").replace("暂未分类","尚未分类"))+
    foodDropdown("drugType","药品属性",drugTypesOptions(drugTypes,profile.drugType||"unconfirmed"))+
    foodInput("form","剂型",profile.form,'placeholder="如片剂、滴眼液" maxlength="240"')+
    foodInput("specification","默认规格",profile.specification,'maxlength="240"')+
    foodInput("route","给药途径",profile.route,'maxlength="240"')+
    foodInput("imageUrl","包装图片链接",profile.imageUrl,'type="url" maxlength="240"')+
    `<label class="wide">说明书文本或资料来源<textarea name="leaflet" maxlength="1600" rows="2">${escape(profile.leaflet)}</textarea></label>
    <label class="wide">已核对的有效成分<textarea name="ingredients" rows="3" maxlength="3000"
      placeholder="每行一种：包装原名 | 含量 | 单位 | 计量基准 | 来源">${escape(Array.isArray(parts)?parts.map((p)=>[p.originalName,p.amount,p.unit,p.perUnit,p.source].map((v)=>v||"").join(" | ")).join("\n"):parts)}</textarea>
    <small>只填写已核对的成分，未知可留空。不同盐型应保留原名。</small></label>`+
    foodInput("profileNotes","档案备注",profile.notes,'maxlength="1600"');
}
function drugBatchFields(row,locations,editing=false) {
  return foodDropdown("locationId","储存位置",drugLocationOptions(locations,row.locationId),"required")+
    foodInput("storage","包装标注储存条件",row.storage,'maxlength="240"')+
    foodInput("purchasedOn","购买日期",row.purchasedAtLocal?.slice(0,10),'type="date"'+(editing?"":" data-purchase-date"))+
    foodInput("purchaseTime","购买时间",row.purchasedAtLocal?.slice(11),'type="time"'+(editing?"":" data-purchase-time"))+
    `<input type="hidden" name="timeZone" value="${escape(row.purchaseTimeZone||"Asia/Shanghai")}" ${editing?"":"data-intake-zone"}>`+
    drugDateInput("producedOn","生产日期",row.producedOn)+foodInput("lot","生产批号",row.lot,'maxlength="240"')+
    drugDateInput("expiresOn","包装有效期",row.expiresOn)+drugDateInput("openedOn","开封日期",row.openedOn)+
    drugDateInput("openUseUntil","开封后使用期限（按说明书填写）",row.openUseUntil)+
    foodInput("packageSpec","包装规格",row.packageSpec,'maxlength="240"')+
    drugNumber("purchasedAmount","购买数量",row.purchasedAmount)+drugNumber("remainingAmount","当前剩余量",row.remainingAmount)+
    foodInput("unit","库存单位",row.unit,'maxlength="20" placeholder="片、粒、毫升等"')+
    foodDropdown("status","使用状态",drugTypesOptions(drugStatuses,row.status||"sealed"))+
    foodInput("expiryLead","有效期提前提醒（天）",row.expiryLead,'type="number" min="0" max="3650"')+
    drugNumber("lowStock","低库存提醒阈值",row.lowStock)+foodInput("notes","批次备注",row.notes,'maxlength="1600"');
}
async function drugReadBatchInput(db,user,form,prior=null,source="manual") {
  const v=(key)=>foodValue(form,key);
  const locationId=v("locationId")||prior?.locationId||(await drugLocations(db,user))[0]?.id;
  const location=await foodOne(db,"SELECT id,name FROM DrugStorageLocation WHERE id=? AND userId=? AND (retired=0 OR id=?)",locationId,user,prior?.locationId||"");
  const dates=["purchasedOn","producedOn","expiresOn","openedOn","openUseUntil"];
  const time=v("purchaseTime");
  const unit=v("unit");
  const amount=drugNumberValue(v("purchasedAmount"));
  const remaining=v("remainingAmount")===""&&!prior&&v("keepRemainingUnknown")!=="yes"?amount:drugNumberValue(v("remainingAmount"));
  const lowStock=drugNumberValue(v("lowStock"));
  const lead=drugNumberValue(v("expiryLead"));
  const status=v("status") || (v("openedOn")?"open":"sealed");
  if (!location||!["storage","lot","packageSpec"].every((key)=>drugText(form,key))||!drugText(form,"notes",1600)||unit.length>20||
      [amount,remaining,lowStock].some((n)=>!drugValidNumber(n))||((amount!=null||remaining!=null||lowStock!=null)&&!unit)||
      !Object.hasOwn(drugStatuses,status)||dates.some((key)=>v(key)&&!foodDate(v(key)))||
      (time&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))||(lead!=null&&(!Number.isInteger(lead)||lead<0||lead>3650))||
      (v("openUseUntil")&&(!v("openedOn")||v("openUseUntil")<v("openedOn")))) return null;
  const tz=intakeZone(v("timeZone")||prior?.purchaseTimeZone);
  const clock=drugLocalClock(form);
  const day=v("purchasedOn")||(!prior?clock.day:"");
  return {name:location.name,notes:v("notes"),fields:{locationId,purchasedAtLocal:day?day+(time?"T"+time:!prior&&!v("purchasedOn")?"T"+clock.time:""):null,
    purchaseTimeZone:day?tz:null,producedOn:v("producedOn")||null,lot:v("lot")||null,expiresOn:v("expiresOn")||null,purchasedAmount:amount,
    remainingAmount:["finished","discarded"].includes(status)?0:remaining,unit:unit||null,packageSpec:v("packageSpec")||null,
    openedOn:v("openedOn")||null,openUseUntil:v("openUseUntil")||null,storage:v("storage")||null,
    status:remaining===0&&["sealed","open","using"].includes(status)?"finished":status==="sealed"&&v("openedOn")?"open":status,
    expiryLead:lead??(!prior?30:null),lowStock,source:prior?.source||source}};
}
function drugInsertBatch(db,user,id,drugId,name,data,now) {
  const fields={...data.fields,itemId:id,drugId,userId:user};
  const keys=Object.keys(fields);
  return [
    foodRead(db,"INSERT INTO Item (id,name,category,notes,updatedAt) VALUES (?,?,'medicine',?,?)",id,name,data.notes,now),
    foodRead(db,`INSERT INTO DrugBatch(${keys.join(",")}) VALUES (${keys.map(()=>"?").join(",")})`,...Object.values(fields)),
    foodEvent(db,id,"purchase",now,fields.purchasedAtLocal),foodEvent(db,id,"intake",now,data.name),
    ...(fields.openedOn?[foodEvent(db,id,"open",now,fields.openedOn)]:[]),
  ];
}
async function drugCreate(db,user,form,source="manual") {
  const profileId=foodValue(form,"drugId");
  const existing=profileId&&profileId!=="new"?await foodOne(db,"SELECT * FROM DrugItem WHERE userId=? AND id=? AND deletedAt IS NULL",user,profileId):null;
  if (profileId&&profileId!=="new"&&!existing) return null;
  const data=existing?null:await drugReadProfileInput(db,user,form);
  const batch=await drugReadBatchInput(db,user,form,null,source);
  if ((!existing&&!data)||!batch) return null;
  const id=crypto.randomUUID(),drugId=existing?.id||crypto.randomUUID(),now=new Date().toISOString();
  return {id,drugId,writes:[...(data?drugWriteProfile(db,user,drugId,data):[]),
    ...drugInsertBatch(db,user,id,drugId,existing?.name||data.profile.name,batch,now)]};
}
async function drugNewPage(db,user,form,url) {
  if (form) {
    const created=await drugCreate(db,user,form);
    if (!created) return drugError("检查药品档案、位置、数量单位及日期。",drugRoot+"/new");
    await db.batch(created.writes);
    return foodRedirect(drugRoot+"/"+created.id+"?saved=1");
  }
  const [profiles,locations,categories]=await Promise.all([drugProfiles(db,user),drugLocations(db,user),drugCategories(db,user)]);
  const requested=url.searchParams.get("drug")||"";
  const options=foodOption("","选择已有档案",requested)+profiles.map((r)=>foodOption(r.id,drugProfileTitle(r),requested)).join("")+
    foodOption("new","＋ 新建药品档案",requested);
  const clock=intakeClock("Asia/Shanghai");
  return render(drugBack("新增药品批次","每次购买新建独立批次。",foodButton(drugRoot+"/intake","快速录入"))+
    foodForm('<div class="wide food-subhead"><h2>药品档案</h2></div>'+
      foodDropdown("drugId","选择药品",options,"required data-profile-picker")+
      `<fieldset class="wide intake-fields" data-new-profile hidden disabled>${drugProfileFields({},categories,[])}</fieldset>
      <div class="wide food-subhead"><h2>本次库存批次</h2></div>`+
      drugBatchFields({purchasedAtLocal:clock.day+"T"+clock.time,expiryLead:30},locations),"保存批次"));
}
async function drugProfilePage(db,user,form,url) {
  const profiles=await drugProfiles(db,user);
  const categories=await drugCategories(db,user);
  if (form) {
    if (foodValue(form,"operation")==="subcategory") {
      const parent=foodValue(form,"parent"),name=foodValue(form,"categoryName");
      if (!categories.some((r)=>!r.parentId&&r.id===parent)||!name||name.length>80||
        categories.some((r)=>r.parentId===parent&&r.name===name)) return drugError("请检查子分类和名称。",drugRoot+"/profiles");
      await foodRead(db,"INSERT INTO DrugCategory(id,userId,parentId,name) VALUES (?,?,?,?)",crypto.randomUUID(),user,parent,name).run();
      return foodRedirect(drugRoot+"/profiles");
    }
    const id=foodValue(form,"id");
    if (foodValue(form,"operation")==="delete") {
      const result=await foodRead(db,`UPDATE DrugItem SET deletedAt=? WHERE id=? AND userId=? AND deletedAt IS NULL
        AND NOT EXISTS(SELECT 1 FROM DrugBatch b JOIN Item i ON i.id=b.itemId WHERE b.drugId=DrugItem.id AND i.deletedAt IS NULL)
        AND NOT EXISTS(SELECT 1 FROM MedicationPlan p WHERE p.drugId=DrugItem.id AND p.status IN ('active','paused'))`,
        new Date().toISOString(),id,user).run();
      return result.meta.changes?foodRedirect(drugRoot+"/profiles?deleted=1"):
        drugError("请先删除关联批次、结束相关用药计划，或确认档案仍存在。",drugRoot+"/profiles",409);
    }
    const data=await drugReadProfileInput(db,user,form);
    if (!data||(id&&!profiles.some((p)=>p.id===id))) return drugError("请核对药品档案及有效成分。",drugRoot+"/profiles");
    const saved=id||crypto.randomUUID();
    const writes=drugWriteProfile(db,user,saved,data,Boolean(id));
    if (id) {
      writes.push(foodRead(db,`UPDATE Item SET name=? WHERE id IN(SELECT itemId FROM DrugBatch WHERE userId=? AND drugId=?)`,data.profile.name,user,id));
      const previous=profiles.find((profile)=>profile.id===id);
      const identityFields=["name","tradeName","manufacturer","drugType","form","specification","route"];
      const signature=(parts)=>JSON.stringify(parts.map(([name,amount,unit,perUnit])=>
        [drugNormalizeIngredient(name),amount||"",unit||"",perUnit||""].join("|")).sort());
      const oldParts=(await drugParts(db,user,id)).map((part)=>[part.originalName,part.amount,part.unit,part.perUnit]);
      if (identityFields.some((key)=>(previous[key]||"")!==(data.profile[key]||""))||signature(oldParts)!==signature(data.parts)) {
        writes.push(foodRead(db,"UPDATE MedicationSafetyRule SET active=0,revision=? WHERE userId=? AND drugId=? AND active=1",
          crypto.randomUUID(),user,id));
      }
    }
    await db.batch(writes);
    return foodRedirect(drugRoot+"/profiles?id="+saved);
  }
  const requested=url.searchParams.get("id");
  const current=profiles.find((r)=>r.id===requested);
  if (requested&&!current) return drugError("找不到该药品档案。",drugRoot+"/profiles",404);
  const q=(url.searchParams.get("q")||"").trim().toLowerCase();
  const category=url.searchParams.get("category")||"";
  const parts=current?await drugParts(db,user,current.id):[];
  const batches=current?(await drugBatches(db,user)).filter((b)=>b.drugId===current.id):[];
  return render(drugBack("药品档案","药品名称、规格与成分按档案管理。",foodButton(drugRoot+"/profiles","新建档案"))+
    (url.searchParams.has("deleted")?'<p class="notice" role="status">药品档案已删除。</p>':"")+
    `<form class="filters"><input name="q" aria-label="搜索药品档案" placeholder="搜索药品或品牌" value="${escape(q)}">
    ${foodDropdown("category","药品分类",foodOption("","全部分类",category)+foodOptions(categories,category))}<button class="button secondary">筛选</button></form>
    <div class="panel food-list">${profiles.filter((r)=>drugProfileTitle(r).toLowerCase().includes(q)&&(!category||r.categoryId===category||
      categories.find((c)=>c.id===r.categoryId)?.parentId===category)).map((r)=>link(drugRoot+"/profiles?id="+encodeURIComponent(r.id),escape(drugProfileTitle(r)))).join("")||'<p class="empty">暂无匹配档案。</p>'}</div>`+
    foodForm(intakeHidden("id",current?.id||"")+drugProfileFields(current||{},categories,parts),current?"保存档案":"创建档案")+
    (current?`<section><div class="section-heading"><h2>关联批次</h2>${foodButton(drugRoot+"/new?drug="+current.id,"新增批次")}</div>
      <p class="notice">当前库存合计：${escape(drugStockSummary(batches))}</p><div class="panel food-list">${batches.map((b)=>link(drugHref(b),escape(b.lot||b.purchasedAtLocal||"库存批次")+" · "+escape(drugQuantity(b)))).join("")||'<p class="empty">暂无库存批次。</p>'}</div></section>`:"")+
    (current?deleteControl("药品档案",drugProfileTitle(current),intakeHidden("id",current.id)):"")+
    '<section><div class="section-heading"><h2>自定义子分类</h2></div>'+foodForm(intakeHidden("operation","subcategory")+
      foodDropdown("parent","一级分类",foodOptions(categories.filter((r)=>!r.parentId),""))+
      foodInput("categoryName","子分类名称","",'required maxlength="80"'),"添加子分类")+"</section>");
}

async function drugLocationPage(db,user,form) {
  const locations=await drugLocations(db,user);
  if (form) {
    const id=foodValue(form,"id");
    const old=locations.find((r)=>r.id===id);
    if (id&&!old) return drugError("位置不存在。",drugRoot+"/locations",404);
    if (foodValue(form,"operation")==="remove") {
      const result=await foodRead(db,`UPDATE DrugStorageLocation SET retired=1 WHERE id=? AND userId=? AND builtIn=0 AND retired=0
        AND NOT EXISTS(SELECT 1 FROM DrugBatch b JOIN Item i ON i.id=b.itemId WHERE b.locationId=? AND b.userId=?
        AND b.status IN ('sealed','open','using') AND i.archivedAt IS NULL)`,id,user,id,user).run();
      return result.meta.changes?foodRedirect(drugRoot+"/locations"):drugError("请先转移在库批次。默认位置保留。",drugRoot+"/locations",409);
    }
    const name=foodValue(form,"name"),notes=foodValue(form,"notes");
    if (!name||name.length>80||notes.length>500||await foodOne(db,"SELECT id FROM DrugStorageLocation WHERE userId=? AND name=? AND id<>?",user,name,id)) {
      return drugError("位置名称无效或已存在。",drugRoot+"/locations");
    }
    if (old) await foodRead(db,"UPDATE DrugStorageLocation SET name=?,notes=? WHERE userId=? AND id=?",name,notes,user,id).run();
    else await foodRead(db,"INSERT INTO DrugStorageLocation(id,userId,name,notes) VALUES (?,?,?,?)",crypto.randomUUID(),user,name,notes).run();
    return foodRedirect(drugRoot+"/locations");
  }
  const fields=(r={})=>intakeHidden("id",r.id||"")+foodInput("name","位置名称",r.name,'required maxlength="80"')+
    foodInput("notes","位置说明",r.notes,'maxlength="500"');
  return render(drugBack("药品储存位置","位置和包装标注的保存条件分别记录。")+foodForm(fields(),"新增位置")+
    locations.map((r)=>`<section><div class="section-heading"><h2>${escape(r.name)}</h2>
      ${link(drugRoot+"?location="+encodeURIComponent(r.id)+"#inventory","查看批次")}</div>${foodForm(fields(r),"保存位置")}
      ${r.builtIn?"":`<form class="food-toolbar" method="post">${intakeHidden("id",r.id)}
      <button class="button secondary" name="operation" value="remove">删除自定义位置</button></form>`}</section>`).join(""));
}
async function drugDashboard(db,user,url) {
  const [rows,profiles,locations,overlaps,planTasks]=await Promise.all([
    drugBatches(db,user),drugProfiles(db,user),drugLocations(db,user),drugOverlaps(db,user),drugPlanTasks(db,user),
  ]);
  const q=url.searchParams;
  const search=(q.get("q")||"").trim().toLowerCase();
  const location=q.get("location")||"";
  const sort=q.get("sort")||"expiry";
  const history=q.get("status")==="history"||q.get("status")==="archived";
  const today=todayFood();
  const live=rows.filter(drugLive),inventoryTasks=drugTasks(live,today);
  const tasks=[...inventoryTasks,...planTasks].sort((a,b)=>a.dueOn.localeCompare(b.dueOn));
  const records=rows.filter((r)=>drugLive(r)!==history&&(!location||r.locationId===location)&&
    [drugTitle(r),r.lot,r.notes].filter(Boolean).join(" ").toLowerCase().includes(search));
  records.sort((a,b)=>sort==="purchase"?(b.purchasedAtLocal||"").localeCompare(a.purchasedAtLocal||""):
    (a.expiresOn||"9999").localeCompare(b.expiresOn||"9999"));
  const metrics=[["药品档案",profiles.length],["当前库存批次",live.length],
    ["临近或超过期限",new Set(inventoryTasks.filter((t)=>t.title!=="达到设置的库存阈值").map((t)=>t.id)).size],
    ["已开封批次",live.filter((r)=>r.openedOn||r.status==="open").length]];
  return render(hero("药品库存","管理包装有效期、批次和已核对的有效成分。",moduleEntry(drugRoot+"/intake",drugRoot+"/new"))+
    (q.has("deleted")?'<p class="notice" role="status">药品批次已删除。</p>':"")+
    `<div class="food-toolbar">${link(drugRoot+"/profiles","药品档案与分类","button secondary")}
    ${link(drugRoot+"/locations","储存位置","button secondary")}${link(planRoot,"用药计划","button secondary")}${link(logRoot,"服用记录","button secondary")}
    ${link(safetyRoot,"药品安全提示","button secondary")}</div>
    <section class="food-metrics">${metrics.map(([label,n])=>`<div class="panel"><small>${label}</small><strong>${n}</strong></div>`).join("")}</section>
    <section><div class="section-heading"><h2>待处理药品</h2></div><div class="panel food-list">${tasks.map((t)=>link(t.href||drugRoot+"/"+t.id,
      `<span><strong>${escape(t.name)}</strong><small>${escape(t.title)}</small></span><time>${escape(t.dueOn)}</time>`)).join("")||'<p class="empty">暂无药品提醒。</p>'}</div></section>
    <section id="inventory"><div class="section-heading"><h2>库存批次</h2></div><form class="filters">
    <input name="q" aria-label="搜索药品" placeholder="药品、商品名或批号" value="${escape(search)}">
    ${foodDropdown("location","位置",foodOption("","全部位置",location)+foodOptions(locations,location))}
    ${foodDropdown("sort","排序",foodOption("expiry","按有效期",sort)+foodOption("purchase","按购买日期",sort))}
    ${foodDropdown("status","状态",foodOption("active","当前库存",history?"history":"active")+foodOption("history","历史批次",history?"history":"active"))}
    <button class="button secondary">筛选</button></form>
    <div class="panel food-list">${records.map((r)=>link(drugHref(r),`<span><strong>${escape(drugTitle(r))}</strong>
    <small>${escape(r.locationName)} · ${escape(r.archivedAt?"已归档":drugStatuses[r.status])}${r.expiresOn?" · 包装有效期 "+escape(r.expiresOn):""}</small></span>
    <strong>${escape(drugQuantity(r))}</strong>`)).join("")||'<p class="empty">暂无匹配批次。</p>'}</div></section>
    <section><div class="section-heading"><h2>同成分库存</h2></div><div class="panel food-list">${overlaps.map((group)=>`<div><span><strong>${escape(group[0].originalName)}</strong>
      <small>${escape(group.map(drugTitle).join("、"))}</small></span></div>`).join("")||'<p class="empty">暂无已核对的重复成分。</p>'}</div>
      <p class="food-muted">库存中出现相同成分时，请核对包装或说明书。这里显示已录入的成分名称。</p></section>`);
}

const drugEventLabels={...foodEventLabels,drugEdit:"编辑批次",drugStart:"开始使用",drugStop:"停止使用",drugExpired:"标记过期",drugStatus:"更新状态",
  medicationTaken:"记录实际服用",medicationCorrected:"校正服用记录"};
function drugQuick(operation,label) {
  return `<form method="post"><button class="button secondary" name="operation" value="${operation}">${label}</button></form>`;
}
async function drugDetail(db,user,row,url,editing=false) {
  if (editing) {
    const locations=await foodAll(db,"SELECT * FROM DrugStorageLocation WHERE userId=? AND (retired=0 OR id=?) ORDER BY builtIn DESC,rowid",user,row.locationId);
    return render(drugBack("编辑药品批次",drugTitle(row),link(drugHref(row),"取消","button secondary"))+
      foodForm(intakeHidden("operation","edit")+intakeHidden("version",row.updatedAt)+drugBatchFields(row,locations,true),"保存批次"));
  }
  const [parts,events]=await Promise.all([drugParts(db,user,row.drugId),
    foodAll(db,"SELECT kind,occurredAt,notes FROM LifecycleEvent WHERE itemId=? ORDER BY occurredAt DESC,rowid DESC LIMIT 40",row.itemId)]);
  const metric=(label,value)=>`<div><dt>${label}</dt><dd>${escape(value??"—")}</dd></div>`;
  return render(drugBack(escape(drugTitle(row)),row.archivedAt?"已归档":drugStatuses[row.status],
    foodButton(drugHref(row)+"/edit","编辑批次"))+
    (url.searchParams.has("saved")?'<p class="notice" role="status">批次已保存。</p>':"")+
    `<div class="food-toolbar">${link(drugRoot+"/profiles?id="+row.drugId,"查看药品档案")}
    ${link(planRoot+"?drug="+row.drugId,"建立用药计划","button secondary")}${link(logRoot+"?drug="+row.drugId+"&batch="+row.itemId,"记录实际服用","button secondary")}
    ${link(safetyRoot+"?drug="+row.drugId,"药品安全提示","button secondary")}</div><dl class="panel food-details">
    ${metric("当前库存",drugQuantity(row))}${metric("购买数量",row.purchasedAmount==null?null:row.purchasedAmount+" "+row.unit)}
    ${metric("包装规格",row.packageSpec||row.specification)}${metric("生产批号",row.lot)}${metric("生产日期",row.producedOn)}
    ${metric("包装有效期",row.expiresOn)}${metric("开封日期",row.openedOn)}${metric("开封后使用期限",row.openUseUntil)}
    ${metric("储存位置",row.locationName)}${metric("包装标注储存条件",row.storage)}
    ${metric("购买时间",row.purchasedAtLocal?.replace("T"," "))}${metric("记录创建时间",row.createdAt+" UTC")}${metric("备注",row.notes)}</dl>`+
    (drugLive(row)?`<div class="food-toolbar">${row.status==="sealed"?drugQuick("open","标记开封"):""}${drugQuick("using","开始使用")}
      ${drugQuick("stopped","停止使用")}${drugQuick("finished","标记用完")}${drugQuick("discarded","标记丢弃")}${drugQuick("expired","标记过期")}${drugQuick("archive","归档")}</div>
      <section><div class="section-heading"><h2>库存操作</h2></div>${foodForm(
        drugNumber("amount","数量","")+foodDropdown("operation","操作",foodOption("adjust","设置剩余量","adjust")+foodOption("consume","记录部分消耗","adjust"))+
        `<p class="wide food-muted">库存单位：${escape(row.unit||"尚未填写")}。</p>`,"保存库存操作")}</section>`:"")+
    deleteControl("药品批次",drugTitle(row)+(row.lot?" · "+row.lot:""))+
    `<section><div class="section-heading"><h2>已核对的有效成分</h2></div><div class="panel food-list">${parts.map((p)=>`<div><span><strong>${escape(p.originalName)}</strong>
     <small>${escape([p.amount,p.unit,p.perUnit,p.source].filter(Boolean).join(" · "))}</small></span></div>`).join("")||'<p class="empty">尚未填写或核对有效成分。</p>'}</div></section>
     <section><div class="section-heading"><h2>批次历史</h2></div><div class="panel food-list">${events.map((event)=>`<div><span><strong>${escape(drugEventLabels[event.kind]||event.kind)}</strong>
     <small>${escape(event.notes)}</small></span><time>${escape(event.occurredAt.slice(0,10))}</time></div>`).join("")||'<p class="empty">暂无批次事件。</p>'}</div></section>`);
}
async function drugUpdate(db,user,row,form,claim=null) {
  const operation=foodValue(form,"operation");
  const path=drugHref(row);
  if (operation==="delete") {
    await deleteItem(db,row.itemId,"medicine",user);
    return foodRedirect(drugRoot+"?deleted=1");
  }
  if (operation!=="edit"&&!drugLive(row)) return drugError("该批次当前无法执行此库存操作。",path,409);
  const timestamp=new Date().toISOString();
  let fields={},notes=row.notes,events=[];
  if (operation==="edit") {
    if (foodValue(form,"version")!==row.updatedAt) return drugError("此批次已被修改，请重新打开编辑页面。",path+"/edit",409);
    const result=await drugReadBatchInput(db,user,form,row);
    if (!result) return drugError("检查数量、日期、单位和位置。开封后使用期限需要开封日期。",path+"/edit");
    ({fields,notes}=result);
    events.push(["drugEdit",row.expiresOn!==fields.expiresOn?`包装有效期：${row.expiresOn||"未填"} → ${fields.expiresOn||"未填"}`:null]);
    if (fields.locationId!==row.locationId) events.push(["move",row.locationName+" → "+result.name]);
    if (fields.openedOn&&fields.openedOn!==row.openedOn) events.push(["open",fields.openedOn]);
    if (fields.remainingAmount!==row.remainingAmount||fields.unit!==row.unit) events.push(["adjust",drugQuantity(row)+" → "+drugQuantity(fields)]);
  } else if (operation==="adjust"||operation==="consume") {
    const amount=drugNumberValue(foodValue(form,"amount"));
    if (amount==null||!drugValidNumber(amount)||!row.unit||(operation==="consume"&&(!amount||row.remainingAmount==null||amount>row.remainingAmount))) {
      return drugError("请输入有效的库存数量。消耗量须使用当前库存单位，并且不能超过剩余量。",path);
    }
    fields.remainingAmount=operation==="adjust"?amount:Number((row.remainingAmount-amount).toFixed(6));
    events.push([operation,operation==="adjust"?drugQuantity(row)+" → "+fields.remainingAmount+" "+row.unit:amount+" "+row.unit]);
    if (!fields.remainingAmount) fields.status="finished";
  } else if (operation==="archive") {
    fields.status=row.status;
    events.push(["archive",null]);
  } else if (Object.hasOwn(drugStatuses,operation)&&operation!=="sealed") {
    fields.status=operation;
    if (operation==="open") fields.openedOn=row.openedOn||todayFood();
    if (["finished","discarded"].includes(operation)) fields.remainingAmount=0;
  } else return drugError("操作无效。",path);
  if (fields.status&&fields.status!==row.status) {
    const event={open:"open",using:"drugStart",stopped:"drugStop",finished:"consumeAll",discarded:"discard",expired:"drugExpired"}[fields.status]||"drugStatus";
    if (!events.some(([kind])=>kind===event)) events.push([event,drugStatuses[fields.status]]);
  }
  const guard="EXISTS(SELECT 1 FROM Item WHERE id=? AND updatedAt=? AND archivedAt IS ? AND deletedAt IS NULL)";
  const version=[row.itemId,row.updatedAt,row.archivedAt];
  const result=await db.batch([
    ...(claim?[intakeClaim(db,claim.draft,claim.index,timestamp,guard,version)]:[]),
    ...events.map(([event,detail])=>foodRead(db,`INSERT INTO LifecycleEvent(id,itemId,kind,occurredAt,notes)
      SELECT ?,?,?,?,? WHERE ${guard}`,crypto.randomUUID(),row.itemId,event,timestamp,detail,...version)),
    foodRead(db,`UPDATE DrugBatch SET ${Object.keys(fields).map((key)=>key+"=?").join(",")} WHERE itemId=? AND userId=? AND ${guard}`,
      ...Object.values(fields),row.itemId,user,...version),
    foodRead(db,`UPDATE Item SET updatedAt=?,notes=?,archivedAt=? WHERE id=? AND updatedAt=? AND archivedAt IS ? AND deletedAt IS NULL`,
      timestamp,notes,operation==="archive"?timestamp:row.archivedAt,...version),
  ]);
  return result.at(-1).meta.changes?foodRedirect(path+"?saved=1"):drugError("批次已有新变化，请刷新。",path,409);
}

async function drugRoute(request,env,url) {
  const user=request.headers.get("oai-authenticated-user-id");
  if (!user) return render(drugBack("请登录","药品库存需要登录后访问。"),401);
  const db=env.DB;
  if (request.method==="POST"&&request.headers.get("origin")!==url.origin) return new Response("请求来源无效",{status:403});
  await ensureDrugData(db,user);
  const parts=url.pathname.slice(drugRoot.length).split("/").filter(Boolean);
  const [part,sub]=parts;
  if (parts.length>2||(sub&&sub!=="edit")) return drugError("找不到页面。",drugRoot,404);
  const form=request.method==="POST"?await request.formData():null;
  if (!part) return form?new Response(null,{status:405}):drugDashboard(db,user,url);
  if (!sub&&part==="new") return drugNewPage(db,user,form,url);
  if (!sub&&part==="profiles") return drugProfilePage(db,user,form,url);
  if (!sub&&part==="locations") return drugLocationPage(db,user,form);
  if (!sub&&part==="intake") return drugIntake(request,env,user,form);
  if (!sub&&part==="plans") return drugPlanPage(db,user,form,url);
  if (!sub&&part==="logs") return drugLogPage(db,user,form,url);
  if (!sub&&part==="safety") return drugSafetyPage(db,user,form,url);
  const row=await drugReadBatch(db,user,part);
  if (!row) return drugError("找不到该批次。",drugRoot,404);
  if (form&&sub==="edit") form.set("operation","edit");
  return form?drugUpdate(db,user,row,form):drugDetail(db,user,row,url,sub==="edit");
}
