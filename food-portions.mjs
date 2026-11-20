const foodStatsPath=foodRoot+"/stats";
const foodPortionPath=(row)=>foodHref(row)+"/portion";
const foodCanPortion=(row)=>foodActive(row)&&Number.isFinite(row.remainingAmount)&&row.remainingAmount>0&&row.stockUnit&&!row.amountNote;
const foodPrecision=1_000_000;
const foodScaled=(value)=>{
  const scaled=Math.round(value*foodPrecision);
  return Number.isSafeInteger(scaled)&&Math.abs(scaled/foodPrecision-value)<1e-10?scaled:null;
};
const foodMovement=(db,row,kind,amount,unit,now,guard="1=1",guardArgs=[])=>foodRead(db,
  `INSERT INTO FoodStockMovement(id,itemId,foodId,kind,amount,unit,occurredOn,createdAt)
    SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`,crypto.randomUUID(),row.id,row.foodId,kind,
  Number.isFinite(amount)&&amount>0&&unit?amount:null,unit||null,todayFood(),now,...guardArgs);

async function foodPortionPage(db,row,form) {
  const path=foodPortionPath(row);
  const back=foodHref(row);
  if (!foodCanPortion(row)) return foodError("分装需要明确的在库数量和单位。请先在批次详情中核对数量。",back,409);
  const locations=await foodAll(db,"SELECT id,name FROM StorageLocation WHERE retired=0 ORDER BY builtIn DESC,rowid");
  if (form) {
    if (foodValue(form,"version")!==row.updatedAt) return foodError("库存已变化，请重新打开分装页面。",path,409);
    const values=Array.from({length:3},(_,index)=>{
      const locationId=foodValue(form,"location-"+index);
      const quantity=foodValue(form,"quantity-"+index);
      const storage=foodValue(form,"storage-"+index);
      const freeze=foodValue(form,"freeze-"+index)==="yes";
      return {locationId,quantity,storage,freeze,scaled:quantity?foodScaled(Number(quantity)):null};
    });
    const portions=values.filter((value)=>value.quantity||value.locationId||value.storage||value.freeze);
    const total=portions.reduce((sum,value)=>sum+(value.scaled??0),0);
    const stock=foodScaled(row.remainingAmount);
    if (!portions.length||stock===null||total>stock||portions.some((value)=>
      !value.scaled||value.scaled<0||value.storage.length>240||!locations.some((location)=>location.id===value.locationId))) {
      return foodError("请填写有效的位置和分装量。分装量为正数，最多六位小数，总量不能超过当前库存。",path);
    }
    const remaining=(stock-total)/foodPrecision;
    const now=new Date(Math.max(Date.now(),(Date.parse(row.updatedAt)||0)+1)).toISOString();
    const day=todayFood(),guard=`EXISTS(SELECT 1 FROM Item i JOIN FoodDetail f ON f.itemId=i.id
      WHERE i.id=? AND i.updatedAt=? AND i.archivedAt IS NULL AND f.disposition='active' AND f.remainingAmount IS ? AND f.stockUnit=?)`;
    const args=[row.id,row.updatedAt,row.remainingAmount,row.stockUnit];
    const events=(id,kind,notes)=>foodRead(db,`INSERT INTO LifecycleEvent(id,itemId,kind,occurredAt,notes)
      SELECT ?,?,?,?,? WHERE ${guard}`,crypto.randomUUID(),id,kind,now,notes,...args);
    const writes=[];
    for (const value of portions) {
      const id=crypto.randomUUID();
      const quantity=value.scaled/foodPrecision;
      const location=locations.find((r)=>r.id===value.locationId);
      const child={
        itemId:id,foodId:row.foodId,locationId:value.locationId,portionParentId:row.id,
        portionCheckAnchor:row.checkedOn,remainingAmount:quantity,stockUnit:row.stockUnit,packaging:"portioned",disposition:"active",
        batch:row.batch,quantity:row.quantity,storage:value.storage||row.storage,openedOn:row.openedOn,
        purchasedOn:row.purchasedOn,purchasedAtLocal:row.purchasedAtLocal,purchaseTimeZone:row.purchaseTimeZone,
        producedOn:row.producedOn,expiresOn:row.expiresOn,expirySource:row.expirySource,
        shelfLifeDays:row.shelfLifeDays,shelfLifeBase:row.shelfLifeBase,
        frozenOn:value.freeze?day:row.frozenOn,expiryLead:row.expiryLead,checkDays:row.checkDays,
        sourceJson:JSON.stringify({method:"portion",parentId:row.id}),
      };
      if (!child.portionCheckAnchor&&!row.purchasedOn&&row.checkDays) child.portionCheckAnchor=row.createdAt.slice(0,10);
      writes.push(
        foodRead(db,`INSERT INTO Item(id,name,category,notes,updatedAt) SELECT ?,?,'food',?,? WHERE ${guard}`,
          id,foodTitle(row),row.notes,now,...args),
        foodRead(db,`INSERT INTO FoodDetail(${Object.keys(child).join(",")}) SELECT ${Object.keys(child).map(()=>"?").join(",")} WHERE ${guard}`,
          ...Object.values(child),...args),
        events(id,"portion",`来自批次 ${row.batch||row.id} · ${quantity} ${row.stockUnit} · ${location.name}`),
        events(row.id,"portion",`分出 ${quantity} ${row.stockUnit} 至 ${location.name}`));
      if (value.freeze) writes.push(events(id,"freeze",location.name));
    }
    // Advance the original version last, after all dependent writes used the same snapshot.
    writes.push(foodRead(db,`UPDATE FoodDetail SET remainingAmount=?,packaging='portioned',disposition=?
      WHERE itemId=? AND ${guard}`,remaining,remaining===0?"portioned":"active",row.id,...args));
    // The last update uses the Item version only because the prior statement updates the stock guard.
    writes.push(foodRead(db,"UPDATE Item SET updatedAt=? WHERE id=? AND updatedAt=? AND archivedAt IS NULL",
      now,row.id,row.updatedAt));
    const result=await db.batch(writes);
    if (!result.at(-2).meta.changes) return foodError("库存已变化，请刷新后重新分装。",path,409);
    return foodRedirect(back+"?saved=1");
  }
  const fields=Array.from({length:3},(_,index)=>`<div class="wide food-subhead"><h2>分装 ${index+1}${index?"（选填）":""}</h2></div>`+
    foodDropdown("location-"+index,"储存位置",foodOption("","选择位置","")+foodOptions(locations,""),index?"":"required")+
    foodInput("quantity-"+index,"分装数量（"+escape(row.stockUnit)+"）","",'type="number" min="0.000001" step="0.000001"'+(index?"":" required"))+
    foodInput("storage-"+index,"储存条件","",'maxlength="240" placeholder="留空沿用来源批次"')+
    `<label><span><input type="checkbox" name="freeze-${index}" value="yes"> 本份同时记录冷冻</span></label>`).join("");
  return render(foodBack("分装库存批次",escape(foodTitle(row)),backLink(back,"返回批次"))+
    `<p class="notice">可分装 ${escape(foodAmount(row))}。每份会成为独立批次，沿用来源的日期和提醒设置。</p>`+
    foodModuleForm(intakeHidden("version",row.updatedAt)+fields,"保存分装"));
}

async function foodPortionLinks(db,row) {
  const [parent,children]=await Promise.all([
    row.portionParentId?foodRow(db,row.portionParentId):null,
    foodAll(db,foodRowsSql+" WHERE f.portionParentId=? AND i.deletedAt IS NULL ORDER BY i.createdAt,i.rowid",row.id),
  ]);
  return (parent?`<p class="notice">来源批次：${link(foodHref(parent),escape(foodTitle(parent))+(parent.batch?" · "+escape(parent.batch):""))}</p>`:"")+
    (children.length?`<section><div class="section-heading"><h2>分装子批次</h2></div><div class="panel food-list">${children.map((child)=>
      link(foodHref(child),`<span><strong>${escape(child.locationName)}</strong><small>${escape(child.archivedAt?"已归档":foodDispositions[child.disposition])}</small></span>
      <strong>${escape(foodAmount(child))}</strong>`)).join("")}</div></section>`:"");
}

async function foodStatsPage(db,url) {
  const until=url.searchParams.get("until")||todayFood();
  const since=url.searchParams.get("since")||foodAddDays(todayFood(),-29);
  if (!foodDate(since)||!foodDate(until)||since>until) return foodError("请选择有效的日期范围。",foodStatsPath);
  const rows=await foodAll(db,`SELECT s.foodId,coalesce(p.name,i.name) AS name,s.unit,s.kind,
    sum(s.amount) AS amount,count(*) AS events,sum(CASE WHEN s.amount IS NULL THEN 1 ELSE 0 END) AS unknown
    FROM FoodStockMovement s JOIN Item i ON i.id=s.itemId LEFT JOIN FoodItem p ON p.id=s.foodId
    WHERE s.occurredOn BETWEEN ? AND ? GROUP BY s.foodId,coalesce(p.name,i.name),s.unit,s.kind ORDER BY name,s.unit,s.kind`,since,until);
  const panel=(kind,label)=>`<section><div class="section-heading"><h2>${label}</h2></div><div class="panel food-list">
    ${rows.filter((row)=>row.kind===kind).map((row)=>`<div><span><strong>${escape(row.name)}</strong>
      <small>${row.events} 条记录${row.unknown?" · "+row.unknown+" 条数量不明":""}</small></span>
      <strong>${row.amount==null?"数量未确认":escape(Number(row.amount.toFixed(6))+" "+row.unit)}</strong></div>`).join("")||
      '<p class="empty">所选日期内暂无记录。</p>'}</div></section>`;
  return render(foodBack("食品消耗统计","按食品和原单位汇总已记录的消耗和丢弃。")+
    `<form class="filters">${foodInput("since","开始日期",since,'type="date" required')}${foodInput("until","结束日期",until,'type="date" required')}
    <button class="button secondary">查看统计</button></form>
    ${panel("consume","已消耗")}${panel("discard","已丢弃")}
    <p class="food-muted">统计从本次升级后的操作开始。更早的事件仍可在批次历史中查看。</p>`);
}
