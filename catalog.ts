export const categories = {
  food: { title: "食品", icon: "◈", description: "批次、开封和有效期", fields: { batch: "批次", expiresOn: "有效期", openedOn: "开封日期", storage: "储存方式", quantity: "数量" } },
  medicine: { title: "药品", icon: "✚", description: "成分、规格和有效期", fields: { purpose: "用途", ingredient: "有效成分", strength: "规格", batch: "批次", expiresOn: "有效期" } },
  clothing: { title: "衣物", icon: "◇", description: "材质、购入日期和频率", fields: { material: "材质", purchasedOn: "购买日期", frequency: "使用频率" } },
  device: { title: "电子设备", icon: "▣", description: "型号、配置和保修", fields: { brand: "品牌", model: "标准型号", purchasedOn: "购买日期", warrantyUntil: "保修截止日", configuration: "实际配置", deviceType: "设备类别", serialNumber: "序列号（选填）", purchaseChannel: "购买渠道", proofReference: "购买凭证说明（选填）", usageStatus: "使用状态" } },
  subscription: { title: "会员订阅", icon: "↻", description: "扣款、续费和取消期限", fields: { provider: "服务商", subscriptionCategory: "订阅类别", startsOn: "开始日期", lifecycleStatus: "使用状态", billingInterval: "账单周期", nextChargeOn: "下次扣款日", endsOn: "合约结束日", cancelBy: "取消通知截止日", cancelStatus: "取消状态" } },
} as const;

export type Category = keyof typeof categories;
export function isCategory(value: string): value is Category {
  return Object.hasOwn(categories, value);
}
export function isDateField(key: string) {
  return /On$|Until$|By$/.test(key);
}
