const wardrobeLocalDay = () => intakeClock(Intl.DateTimeFormat().resolvedOptions().timeZone).day;
function wardrobeTimeEditor(purchase, quick = false) {
  const day = wardrobeLocalDay();
  const exact = purchase?.precision === "day" ? purchase.value : "";
  const recognized = quick && purchase?.raw && purchase.precision !== "day";
  return '<fieldset class="wide wardrobe-time"><legend>购买日期</legend>'+
    (recognized ? '<p>识别时间：'+escape(purchase.raw)+'（约）</p><input type="hidden" name="purchaseOriginal" value="'+escape(purchase.raw)+'">' : "")+
    '<label>选择年月日<input type="date" name="purchaseDay" max="'+day+'" value="'+escape(exact)+'"></label>'+
    '<input type="hidden" name="purchaseMode" value="'+(recognized?"quick":"manual")+'"></fieldset>';
}
function wardrobeTimeFromForm(form) {
  const get = key => String(form.get(key)||"").trim();
  switch(get("purchaseMode")) {
    case "manual": return get("purchaseDay");
    case "quick": return get("purchaseDay") || get("purchaseOriginal");
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
