const wardrobeLocalDay = () => intakeClock(Intl.DateTimeFormat().resolvedOptions().timeZone).day;
function wardrobeTimeEditor(purchase) {
  const day = wardrobeLocalDay();
  const currentYear = Number(day.slice(0,4));
  const kind = purchase?.precision === "estimate" ? "original" : purchase?.precision || "unknown";
  const option = (value,label) => '<option value="'+value+'" '+(kind===value?"selected":"")+'>'+label+'</option>';
  return '<fieldset class="wide wardrobe-time"><legend>购买时间</legend><label>记得多准确？<select name="purchaseMode" data-wardrobe-time>'+
    option("unknown","暂时不记得")+option("day","具体日期")+option("month","只记得年月")+option("year","只记得年份")+option("relative","大概几年前")+
    (purchase?.raw?option("original","保留本次识别时间"):"")+'</select></label>'+
    '<label data-wardrobe-time-field="day">选择日期<input type="date" name="purchaseDay" max="'+day+'" value="'+escape(purchase?.precision==="day"?purchase.value:day)+'"></label>'+
    '<label data-wardrobe-time-field="month">选择年月<input type="month" name="purchaseMonth" max="'+day.slice(0,7)+'" value="'+escape(purchase?.precision==="month"?purchase.value:day.slice(0,7))+'"></label>'+
    '<label data-wardrobe-time-field="year">选择年份<select name="purchaseYear">'+Array.from({length:101},(_,i)=>String(currentYear-i)).map(year=>'<option '+(purchase?.value===year?"selected":"")+'>'+year+'</option>').join("")+'</select></label>'+
    '<label data-wardrobe-time-field="relative">大概多久以前<select name="purchaseRelative">'+["六个月前","一年前","一年半前","两年前","两三年前","三年前","五年前","十年前"].map(value=>'<option>'+value+'</option>').join("")+'</select></label>'+
    '<div data-wardrobe-time-field="original"><p>'+escape(purchase?.raw||"")+'</p><input type="hidden" name="purchaseOriginal" value="'+escape(purchase?.raw||"")+'"></div></fieldset>';
}
function wardrobeTimeFromForm(form) {
  const get = key => String(form.get(key)||"").trim();
  switch(get("purchaseMode")) {
    case "unknown": return "";
    case "day": if(!get("purchaseDay"))throw Error("请选择购买日期"); return get("purchaseDay");
    case "month": if(!get("purchaseMonth"))throw Error("请选择购买年月"); return get("purchaseMonth");
    case "year": return get("purchaseYear");
    case "relative": return get("purchaseRelative");
    case "original": return get("purchaseOriginal");
    case "": return get("purchase");
    default: throw Error("请选择购买时间");
  }
}
function wardrobeExtract(text) {
  const source=text.trim().normalize("NFKC");
  if(!source||source.length>2000)throw Error("请输入 1 至 2000 个字符的衣物描述");
  const data={};
  for(const [key,options] of Object.entries(wardrobeTags))data[key]=options.filter(tag=>source.includes(tag)).join("，");
  const categories=["羽绒服","连衣裙","衬衫","毛衣","外套","卫衣","短袖","T恤","裤子","半身裙","裙子","鞋子","运动鞋","靴子","围巾","帽子","袜子"];
  data.kind=categories.find(word=>source.includes(word))||"";
  const time=source.match(/\d{4}(?:年|-)\d{1,2}(?:月|-)\d{1,2}日?|\d{4}(?:年|-)\d{1,2}月?|\d{4}年|[一二两三四五六七八九十\d]+(?:年半|年|个月|月)前|(?:今天|昨天|前天)/);
  if(time){
    const offsets={今天:0,昨天:-1,前天:-2};
    const raw=Object.hasOwn(offsets,time[0])?foodAddDays(wardrobeLocalDay(),offsets[time[0]]):time[0];
    try{data.purchase=wardrobeDate(raw,wardrobeLocalDay());}catch{}
  }
  const name=source.match(/(?:买了?|购入了?|购买了?)\s*(?:[一二两三四五六七八九十\d]+(?:件|条|双|顶|套))?\s*([^，,。；;]+)/);
  data.name=name?name[1].replace(/(?:花了?|价格|用了|已经|适合|平时|经常|偶尔|穿了|买了).*$/,"").trim():data.kind;
  if(data.name.length>120)data.name=data.name.slice(0,120);
  const amount=source.match(/(?:花了?|价格|买成|售价)\s*([0-9]+(?:\.[0-9]{1,2})?)\s*元?/);
  if(amount)data.price=amount[1];
  data.frequency=["经常穿","偶尔穿","很少穿","未穿过"].find(value=>source.includes(value))||"";
  const location=source.match(/(?:放在|放进|放到)\s*([^，,。；;]+?)(?:里了?|了|$)/);
  if(location)data.location=location[1];
  return {item:{name:data.name,notes:"录入原文："+source},data};
}
