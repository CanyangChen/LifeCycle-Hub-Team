const wardrobeFields = {kind:"类别",brand:"品牌",size:"尺码",color:"颜色",material:"材质（逗号分隔）",frequency:"穿着频率",weather:"适用天气（逗号分隔）",care:"洗护标签（逗号分隔）",location:"存放位置"};
function wardrobeDate(raw, reference) {
  const text = raw.trim();
  if (!text) return null;
  const result = (value,precision,estimated=false) => ({raw:text,value,precision,estimated,reference});
  const exact=text.match(/^(\d{4})(?:年|-)(\d{1,2})(?:月|-)(\d{1,2})日?(?:购买)?$/);
  if(exact) {
    const value=exact[1]+"-"+exact[2].padStart(2,"0")+"-"+exact[3].padStart(2,"0");
    if(new Date(value).toISOString().slice(0,10)!==value)throw Error("购买日期无效");
    return result(value,"day");
  }
  const month=text.match(/^(\d{4})(?:年|-)(\d{1,2})月?(?:购买)?$/);
  if(month&&Number(month[2])>=1&&Number(month[2])<=12)return result(month[1]+"-"+month[2].padStart(2,"0"),"month");
  const year=text.match(/^(\d{4})年?(?:购买)?$/);
  if(year)return result(year[1],"year");
  const numbers={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
  const count=s=>/^\d/.test(s)?Number(s):numbers[s];
  const relative=text.match(/^(?:买了)?([一二两三四五六七八九十\d]+)(年半|年|个月|月)(?:前)?(?:买的|买了|购买)?$/);
  const range=text.match(/^([一二两三四五六七八九十\d]+)([一二两三四五六七八九十])年(?:前)?(?:买的|买了)?$/);
  let months;
  if(range)months=(count(range[1])+count(range[2]))*6;
  else if(relative)months=count(relative[1])*(relative[2].startsWith("年")?12:1)+(relative[2]==="年半"?6:0);
  if(!Number.isFinite(months))throw Error("请确认购买时间，可填具体日期、年月、年份或两年前等描述");
  const date=new Date(reference+"T12:00:00Z");
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth()-months);
  return result(date.toISOString().slice(0,7),"estimate",true);
}
function wardrobeAge(date) {
  if(!date?.value)return "购买时间未填写";
  const months=(new Date().getFullYear()-Number(date.value.slice(0,4)))*12+new Date().getMonth()-(Number(date.value.slice(5,7)||1)-1);
  return date.raw+" · "+(date.precision==="day"?"":"约 ")+Math.max(0,Math.floor(months/12))+" 年 "+Math.max(0,months%12)+" 个月";
}
function wardrobeData(row) {
  try{return {...JSON.parse(row.wardrobe||"{}"),material:JSON.parse(row.wardrobe||"{}").material??row.material,frequency:JSON.parse(row.wardrobe||"{}").frequency??row.frequency,purchase:JSON.parse(row.wardrobe||"{}").purchase??(row.purchasedOn?{raw:row.purchasedOn,value:row.purchasedOn,precision:"day"}:null)};}
  catch{return {material:row.material,frequency:row.frequency};}
}
async function wardrobeRoute(request,db,url) {
  const root="/items/clothing";
  const part=url.pathname.slice(root.length).split("/").filter(Boolean);
  if(part.length>1)return render(hero("找不到档案",link(root,"返回衣橱")),404);
  const id=part[0];
  const all=(await db.prepare("SELECT i.*,c.* FROM Item i JOIN ClothingDetail c ON c.itemId=i.id WHERE i.category='clothing' AND i.deletedAt IS NULL").all()).results;
  const row=all.find(r=>r.id===id);
  const input=(name,label,value="",type="text")=>'<label>'+label+'<input name="'+name+'" type="'+type+'" maxlength="240" value="'+escape(value)+'"></label>';
  function page(item={},data={},message="") {
    return render(hero(item.name?escape(item.name):"新增衣物",link(root,"返回衣橱"))+
      (message?'<p role="alert">'+escape(message)+'</p>':"")+
      (item.id?'<p>'+escape(wardrobeAge(data.purchase))+'</p>':"")+
      '<form method="post" class="panel editor"><fieldset>'+input("name","名称",item.name)+input("purchase","购买时间（日期、年月、年份或两年前）",data.purchase?.raw)+
      Object.entries(wardrobeFields).map(([key,label])=>input(key,label,data[key])).join("")+
      input("minTemp","最低适用温度 °C",data.minTemp,"number")+input("maxTemp","最高适用温度 °C",data.maxTemp,"number")+
      '<label>备注<textarea name="notes" maxlength="2000">'+escape(item.notes)+'</textarea></label></fieldset><button class="button">保存档案</button></form>'+
      (item.id?'<form method="post"><button class="button secondary" name="operation" value="'+(item.archivedAt?'restore':'archive')+'">'+(item.archivedAt?'恢复归档':'归档')+'</button></form>'+deleteControl("档案",item.name):""),message?400:200);
  }
  if(id&&id!=="new"&&!row)return render(hero("找不到档案",link(root,"返回衣橱")),404);
  if(request.method==="POST"){
    if(request.headers.get("origin")!==url.origin)return new Response("请求来源无效",{status:403});
    if(!id)return new Response(null,{status:405});
    const form=await request.formData(),get=k=>String(form.get(k)||"").trim();
    const now=new Date().toISOString(),operation=get("operation");
    if(row&&operation==="delete"){await deleteItem(db,id,"clothing");return foodRedirect(root);}
    if(row&&["archive","restore"].includes(operation)){
      await db.batch([db.prepare("UPDATE Item SET archivedAt=?,updatedAt=? WHERE id=?").bind(operation==="archive"?now:null,now,id),
        foodEvent(db,id,operation,now)]);
      return foodRedirect(root);
    }
    const data=Object.fromEntries(Object.keys(wardrobeFields).map(k=>[k,get(k)]));
    const item={...row,name:get("name"),notes:get("notes")};
    try{
      const prior=row?wardrobeData(row):{};
      data.purchase=prior.purchase?.raw===get("purchase")?prior.purchase:wardrobeDate(get("purchase"),new Date().toISOString().slice(0,10));
      for(const key of ["minTemp","maxTemp"]) {
        data[key]=get(key)===""?null:Number(get(key));
        if(data[key]!==null&&(!Number.isFinite(data[key])||data[key]<-100||data[key]>100))throw Error("温度应在 -100 至 100 之间");
      }
      if(data.minTemp!==null&&data.maxTemp!==null&&data.minTemp>data.maxTemp)throw Error("最低温度不能大于最高温度");
      if(!item.name||item.name.length>120||item.notes.length>2000||Object.keys(wardrobeFields).some(k=>data[k].length>240))throw Error("请检查名称和字段长度");
      const recordId=row?id:crypto.randomUUID();
      await db.batch([
        row?db.prepare("UPDATE Item SET name=?,notes=?,updatedAt=? WHERE id=?").bind(item.name,item.notes,now,id):
          db.prepare("INSERT INTO Item(id,name,category,notes,updatedAt) VALUES(?,?,'clothing',?,?)").bind(recordId,item.name,item.notes,now),
        db.prepare("INSERT INTO ClothingDetail(itemId,material,frequency,wardrobe) VALUES(?,?,?,?) ON CONFLICT(itemId) DO UPDATE SET material=excluded.material,frequency=excluded.frequency,wardrobe=excluded.wardrobe").bind(recordId,data.material,data.frequency,JSON.stringify(data))
      ]);
      return foodRedirect(root+"/"+recordId);
    }catch(error){return page(item,{...data,purchase:{raw:get("purchase")}},error.message);}
  }
  if(id)return page(row||{},row?wardrobeData(row):{});
  const q=url.searchParams.get("q")||"",archived=url.searchParams.get("status")==="archived";
  const rows=all.filter(r=>{
    if(Boolean(r.archivedAt)!==archived||!r.name.toLowerCase().includes(q.toLowerCase()))return false;
    const d=wardrobeData(r);
    return ["kind","material","frequency","weather","care"].every(k=>!url.searchParams.get(k)||String(d[k]||"").split(/[,，、]/).map(s=>s.trim()).includes(url.searchParams.get(k)))&&
      (!url.searchParams.get("temperature") || (d.minTemp!=null||d.maxTemp!=null)&&Number(url.searchParams.get("temperature"))>=(d.minTemp??-Infinity)&&Number(url.searchParams.get("temperature"))<=(d.maxTemp??Infinity));
  });
  if(url.searchParams.get("sort")==="purchase")rows.sort((a,b)=>(wardrobeData(b).purchase?.value||"").localeCompare(wardrobeData(a).purchase?.value||""));
  else rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return render(hero("我的衣橱","衣物、购买时长与洗护标签",link(root+"/new","新增衣物","button"))+
    '<form class="panel editor"><fieldset>'+input("q","名称搜索",q)+["kind","material","frequency","weather","care"].map(k=>input(k,wardrobeFields[k],url.searchParams.get(k))).join("")+input("temperature","适用温度 °C",url.searchParams.get("temperature"),"number")+
    '<label>状态<select name="status"><option value="active">在用</option><option value="archived" '+(archived?"selected":"")+'>已归档</option></select></label><label>排序<select name="sort"><option value="updated">最近更新</option><option value="purchase" '+(url.searchParams.get("sort")==="purchase"?"selected":"")+'>购买时间</option></select></label></fieldset><button class="button">筛选</button></form>'+
    '<div class="intake-grid">'+rows.map(r=>{const d=wardrobeData(r);return link(root+"/"+r.id,'<span aria-label="衣物占位图">◇</span><h2>'+escape(r.name)+'</h2><p>'+escape(wardrobeAge(d.purchase))+'</p><p>'+escape([d.kind,d.material,d.frequency,d.care].filter(Boolean).join(" · "))+'</p><p>温度 '+escape(d.minTemp??"未标记")+" ～ "+escape(d.maxTemp??"未标记")+' °C · '+escape(d.weather||"天气未标记")+'</p>',"panel");}).join("")+'</div>');
}
