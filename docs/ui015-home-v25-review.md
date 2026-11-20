# UI-015：首页 V2.5 颜色检查记录

本轮仅修改首页作用域颜色，不修改布局、业务逻辑、数据库、其他模块颜色或交互规范。

## 样式来源与范围

`ui-home-colors.css` 管理首页专属 Token，通过 `body.personal-ui:has(.dashboard)` 限定变量，通过 `.personal-ui .dashboard` 限定覆盖规则。导航、按钮状态和共享组件继续使用原有样式。新增分割线 Token，未改写全局品牌变量。

| Token | V2.5 |
| --- | --- |
| home-background | #F0F1F8 |
| home-surface | #FFFFFF |
| home-surface-alt | #EAEBF4 |
| home-border | #D8DCEE |
| home-divider | #DDE0EC |
| home-blue-soft | #E8EEFC |
| home-purple-soft | #EEE9FA |
| home-pink-soft | #F9EAF2 |
| home-lavender-soft | #E9EBF6 |
| home-brand-blue / purple / pink | #8299D6 / #AC9BDE / #EFA9C9（不变） |
| home-action | #4967AE（不变） |
| home-text-primary / secondary / muted | #30354C / #626B80 / #7A8296（不变） |

食品、药品仅标题区域分别为浅蓝、浅紫；订阅仅表头为浅粉，数据区仍为白色。近期提醒使用淡蓝紫。原有 Hover、Active、Selected、Focus、Disabled 规范未修改。

## 可读性检查

依据 W3C 相对亮度计算，普通文字阈值 4.5:1、大号文字 3:1。测试直接使用原始数值比较，不先四舍五入。

- 主要文字在全部七种指定表面上最低约 10.16:1。
- 次要文字在白色、页面背景、浅蓝表面上最低约 4.59:1。
- 次要文字在浅紫和提醒表面上约 4.49:1，因此相关说明、时间及空状态改用既有主要文字颜色。
- muted Token 在白底仅约 3.85:1，不作为已通过的普通正文配色；本轮未将其用于新增正文规则。
- 操作蓝在白色及模块辅助表面上最低约 4.61:1；主按钮白字与默认、Hover、Active 背景均通过。
- 已服用、待服用、临期等级及订阅链接的预期颜色组合纳入检查，共 23 组组合通过。
- 浅边框与白底不足 3:1，属于装饰分隔，不能作为控件识别或状态提示的唯一依据。品牌图标有文字标签，颜色不承担唯一信息表达。

本检查是源码指定颜色组合检查，不是浏览器 computed styles 全量审计，也不代表整站已达到 WCAG AA。实际文字、焦点和不同设备显示仍需检查。

参考：
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html

## 已执行验证

- 构建通过；现有七个自动化测试文件通过。
- 新增 `home-colors.test.mjs`：Token、作用域、仅颜色属性与 23 组对比度检查通过。测试中选择器拆分问题已修正。
- 原 8080 服务安全停止并重新启动，继续使用原个人数据库。
- 首页及五模块首页更新前后去除内嵌样式后的 HTML 哈希一致，页面结构未变。
- 五模块 15 个页面可访问，入口模式及共享表单检查通过。
- 31 张本地数据库表内容哈希未变，完整性检查通过。

## 尚未完成的验收

浏览器无头截图尝试未产生图片；未生成修改前后 PC 和移动端截图。未进行真实高亮度 PC 屏幕、普通亮度 PC、Android/iOS 手机或窄窗口的视觉与点击验收。不能将这些项目标记通过。

建议在 http://127.0.0.1:8080/ 分别以 1440px、1024px、390px、360px 窗口检查：卡片层次、白色数据区域、文字、横向溢出、侧边栏遮罩与 Esc、快速录入弹窗、键盘焦点。高亮度必须调节真实显示器检查，不能把截图曝光模拟当作实屏结果。

状态：实现及自动化检查通过，真实视觉验收待完成。未推送、未合并 main、未修改团队仓库。
