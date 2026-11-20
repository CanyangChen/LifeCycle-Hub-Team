// Optional local rule parser: no model calls and no inferred contract deadlines.
function subscriptionExtract(text,day) {
  const source=String(text||'').normalize('NFKC').trim();
  if(!source||source.length>2000)throw Error('请输入 1 至 2000 个字符的订阅描述');
  const detail={};
  const match=source.match(/(?:开通了?|订阅了?|办理了?|续费了?)\s*([^，,。；;]+)/);
  const item={name:(match?.[1]||'').replace(/(?:每月|每年|每季度|月付|年付|季付|花了|费用|价格).*$/,'').trim().slice(0,120),notes:source};
  const cycle=source.match(/每月|月付|每季度|季付|每年|年付/);
  if(cycle)detail.billingInterval=/年/.test(cycle[0])?'年':/季/.test(cycle[0])?'季度':'月';
  const fee=source.match(/(?:每月|每年|每季度|月付|年付|季付|费用(?:是|为)?|价格(?:是|为)?|花了?)\s*[：:]?\s*(\d+(?:\.\d{1,2})?)\s*(?:元|块钱|块)(?=[，,。；;\s]|$)/);
  if(fee)detail.fee=fee[1];
  for(const [key,label] of [['provider','服务商'],['subscriptionCategory','类别']]){const m=source.match(new RegExp(label+'(?:是|为)?[：:\\s]*([^，,。；;]+)'));if(m)detail[key]=m[1].trim().slice(0,240);}
  for(const [key,label] of [['startsOn','开始日期'],['nextChargeOn','(?:下次(?:续费|扣费|扣款)(?:日期)?|续费日期)'],['cancelBy','(?:取消截止(?:日期)?|取消通知截止(?:日期)?)'],['endsOn','(?:到期日期|合同结束日期)']]) {
    const m=source.match(new RegExp(label+'(?:是|为)?[：:\\s]*(\\d{4})[年/-](\\d{1,2})[月/-](\\d{1,2})日?'));
    if(m){const date=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');if(foodDate(date))detail[key]=date;}
  }
  if(!detail.startsOn&&/(今天|昨天|前天)(?:刚)?(?:开通|订阅|办理)/.test(source)){const t=source.match(/(今天|昨天|前天)(?:刚)?(?:开通|订阅|办理)/)[1];detail.startsOn=foodAddDays(day,{今天:0,昨天:-1,前天:-2}[t]);}
  detail.autoRenew=/(?:不自动续费|关闭自动续费|未开启自动续费)/.test(source)?0:/(?:自动续费|自动扣费)/.test(source)?1:null;
  detail.lifecycleStatus=/(?:已取消|取消了订阅)/.test(source)?'cancelled':/(?:已暂停|暂停中)/.test(source)?'paused':'active';
  return {item,detail};
}
