// Local deterministic extraction. Only explicit text becomes structured device data.
function deviceExtract(text,day) {
  const source=String(text||'').normalize('NFKC').trim();
  if(!source||source.length>2000)throw Error('请输入 1 至 2000 个字符的设备描述');
  const detail={};
  const types=['笔记本电脑','台式电脑','平板电脑','显示器','笔记本','手机','耳机','键盘','鼠标','路由器','相机'];
  detail.deviceType=types.find(type=>source.includes(type))||'';
  const name=source.match(/(?:买了?|入手了?|购入了?|购买了?)\s*(?:[一两二三\d]+(?:台|部|个|副))?\s*([^，,。；;]+)/);
  const item={name:(name?.[1]||detail.deviceType).replace(/(?:花了?|花费|价格|售价|保修|配置).*$/,'').trim().slice(0,120),notes:source};
  const price=source.match(/(?:花了?|花费|价格|售价|买成|一共)\s*(\d+(?:\.\d{1,2})?)\s*(万元|万|元|块钱|块)?(?=[，,。；;\s]|$)/);
  if(price){const amount=Number(price[1])*(price[2]?.startsWith('万')?10000:1);if(amount<=9999999.99)detail.purchasePrice=String(Math.round(amount*100)/100);}
  for(const [key,label] of [['brand','品牌'],['model','型号'],['configuration','配置'],['serialNumber','序列号'],['purchaseChannel','购买渠道']]) {
    const match=source.match(new RegExp(label+'(?:是|为)?[：:\\s]*([^，,。；;]+)'));
    if(match)detail[key]=match[1].trim().slice(0,240);
  }
  const time=source.match(/(今天|昨天|前天|刚才|刚刚)[^，,。；;]{0,8}(?:买|购入|入手)/);
  if(time)detail.purchasedOn=foodAddDays(day,{今天:0,昨天:-1,前天:-2,刚才:0,刚刚:0}[time[1]]);
  const explicit=source.match(/(?:(?:购买日期|购入日期)(?:是|为)?[：:\s]*)?(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?(?:[^，,。；;]{0,8}(?:买|购入|入手)|(?=[，,。；;]|$))/);
  if(explicit&&!/保修[^，,。；;]*$/.test(source.slice(0,explicit.index))){const date=explicit[1]+'-'+explicit[2].padStart(2,'0')+'-'+explicit[3].padStart(2,'0');if(foodDate(date))detail.purchasedOn=date;}
  const warranty=source.match(/保修(?:到|至|截止)[：:\s]*(\d{4})[年-](\d{1,2})[月-](\d{1,2})日?/);
  if(warranty){const date=warranty[1]+'-'+warranty[2].padStart(2,'0')+'-'+warranty[3].padStart(2,'0');if(foodDate(date))detail.warrantyUntil=date;}
  detail.usageStatus=source.includes('维修中')?'repair':source.includes('闲置')?'idle':source.includes('已停用')?'retired':source.includes('使用中')?'using':'';
  return {item,detail};
}
