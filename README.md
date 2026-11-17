# LifeCycle Hub 团队本地版

这是课程团队的 Windows 本地 Web 项目，用来管理食品、药品、衣物、电子设备及会员订阅。
每位组员运行自己的程序，数据只保存在自己的 Windows 用户目录。启动和使用无需 GitHub、
ChatGPT、邀请码或网络连接。文字规则提取和手动录入可离线使用。

## 第一次使用

1. 从 https://nodejs.org/ 安装 Node.js 24 LTS。安装后重新打开终端。
2. 在团队仓库页面点 Code → Download ZIP，解压到自己的文件夹。也可以用 Git 克隆。
3. 项目没有第三方运行依赖，双击启动脚本前无需安装依赖。若需要验证锁文件，
   在项目目录运行 npm ci --ignore-scripts。
4. 双击 start-local.cmd，按窗口提示打开 http://127.0.0.1:8080/ 或 8081。
   第一次打开会建库并添加虚构样例。每位组员都可自行编辑样例和创建记录。
5. 关闭浏览器不会停止服务。需要停止时，在启动窗口按 Ctrl+C。关闭后可双击重新启动。

## 数据与备份

- 数据库：%LOCALAPPDATA%\LifeCycleHub-Team\data\team.sqlite。
- 文件目录：%LOCALAPPDATA%\LifeCycleHub-Team\uploads。此目录已预留并自动创建。
  当前本地版未提供附件上传管理，在线 AI 图片及语音识别也不属于本地运行要求。
- 备份：先停止服务，再把整个 LifeCycleHub-Team 数据目录复制到个人备份位置。
  恢复前先备份当前目录，在服务停止时使用自己的备份。更新代码时保留用户数据目录。
- 测试人员可在 PowerShell 设置 LIFECYCLE_TEAM_DATA_DIR 指向新的空目录来试用独立测试库。
  项目文件夹、个人版数据目录和测试目录请分别保留，不要把任何数据目录提交到 GitHub。

## 常见问题

- 地址打不开：保持启动窗口运行，使用窗口显示的地址。双击启动脚本会复用已在运行的团队服务。
- 8080 已占用：启动器会尝试 8081。两个端口都占用时，可在 PowerShell 设置
  $env:PORT='8090'，再运行 .\start-local.cmd。
- 提示找不到 Node：运行 node -v，确认终端可见 Node.js 24，再重新打开脚本。
- 数据库启动失败：检查报错和用户目录写权限；保留原文件及备份，可用单独测试目录重试。
  如需请组员协助，只共享错误信息，不发送个人数据库。

## 开发与协作

main 为稳定分支。每项任务使用功能分支，测试通过后发起 Pull Request。
运行 node build.mjs 构建，运行 npm test 执行冒烟和权限回归。
也可用 node build.mjs --test-legacy 和 node --test smoke.test.mjs 分步执行。
