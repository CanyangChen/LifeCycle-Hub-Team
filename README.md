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

## 已有组员更新到最新 main

原有 Windows 本地启动方式保持不变，不需要迁移到云端，也无需重新注册账号。

1. 先在原启动窗口按 Ctrl+C，等待进程结束，再备份自己的 `%LOCALAPPDATA%\LifeCycleHub-Team` 目录。
2. Git 用户在项目工作区干净时执行：

```powershell
git status --short
git switch main
git pull --ff-only origin main
.\start-local.cmd
```

出现未提交修改或无法快进时停止，请负责人协助；不要 reset、force push 或删除数据。ZIP 用户可将新版本解压到新目录，再双击 `start-local.cmd`；默认数据在用户目录中，换代码目录不应丢失数据。自定义过 `LIFECYCLE_TEAM_DATA_DIR` 的用户应继续使用原绝对路径。

启动时自动应用尚未执行的迁移，包括设备 `0014` 和订阅 `0015`；旧数据库迁移前自动生成 `.before-migration-时间戳.sqlite` 快照。不要复制组员的数据库，或把个人版数据库指向团队环境。发生迁移错误保留原库、快照与错误信息，不删除重建。回退旧代码不等于回退数据库。

新版本包含设备购买/保修/维护、订阅状态/日期提醒，以及五模块文字规则录入与统一取消按钮。更新后须重启原服务，重复点击启动脚本只复用服务，不热更新正在运行的代码。

本地服务只监听本机。每位组员在自己的电脑上打开启动窗口显示的地址；`127.0.0.1` 不会访问负责人电脑，设备之间也不会自动同步数据。

## 关闭、重启与恢复

关闭浏览器后服务仍运行。停止请在启动窗口按 Ctrl+C。电脑关机后，下次开机重新双击 `start-local.cmd`，本项目不配置开机自启动。团队版目前没有独立停止脚本。

恢复备份前先停止服务并另存当前目录，优先在新测试目录恢复。设置 `LIFECYCLE_TEAM_DATA_DIR` 为该目录后启动，检查食品、药品、设备、订阅和维护记录，再决定是否用于日常使用。不要覆盖正在运行的 SQLite 文件。

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
完整分步检查如下（测试使用隔离数据库，不使用组员的日常库）：

```powershell
node build.mjs --test-legacy
node --test smoke.test.mjs home-ui.test.mjs browser-filter.test.mjs device.test.mjs subscription.test.mjs
```

`node start-team.mjs --no-browser` 可验证启动而不自动弹出浏览器，仍需手动打开输出的地址。最近在 Windows 临时目录验证了启动器、五模块 HTTP 访问、重复启动复用、写入后结束测试进程并重启的数据保留；真实 Windows 重启和浏览器视觉验收仍需各成员实际确认。

## 课堂演示操作

1. 打开「食品」→「快速记录」，输入「刚才买了两桶方便面，放在柜子里了」。核对名称、2 桶和厨房储物柜，再确认保存。
2. 在食品批次详情修改数量或记录消耗，刷新确认已保存。再退出服务并重新启动，确认记录仍在。
3. 到「药品」新建虚构档案和批次，登记一次实际服用，检查库存扣减及服用历史。
4. 衣物、电子设备和会员订阅可分别新建、编辑或删除虚构档案。

如需演练而不影响日常库存，先关闭正在运行的团队版，然后在 PowerShell 中执行：

```powershell
$env:LIFECYCLE_TEAM_DATA_DIR = Join-Path $env:LOCALAPPDATA 'LifeCycleHub-Team-Test'
$env:PORT = '8090'
.\start-local.cmd
```

打开 http://127.0.0.1:8090/。测试库会自动初始化。关闭该 PowerShell 后，常规启动仍使用默认目录。

## 测试账号汇总

| 环境 | 测试身份 | 使用方法 |
|---|---|---|
| 团队本地 Web | 无需账号 | 每位组员直接启动。使用各自机器和 Windows 用户目录中的数据。 |
| 独立测试库 | 无需账号 | 使用上面的测试目录和独立端口，验证初始化、写入、重启和恢复。 |
| 线上课程演示站 | course_test_a / course_test_b | 这是预留的验收用户名。首次使用由负责人私下提供各自的一次性邀请码，测试人员自行设置密码。若尚未开户，用户名无法直接登录。 |
| 自动化回归 | course-check / visitor-check，drug-smoke-a / drug-smoke-b | 测试脚本在内存 SQLite 中创建的虚构身份，供隔离测试使用。 |

两位线上测试人员可分别创建虚构食品批次，刷新页面确认自己的记录保留，再尝试打开另一位的批次链接，确认无法查看。线上入口受托管平台网络可用性影响，课堂首选团队本地版。个人站账号不用于团队验收。

## 更多说明

- [团队贡献规范](CONTRIBUTING.md)
- [开发环境](docs/development-guide.md)
- [项目架构](docs/architecture.md)
- [数据库与恢复](docs/database-design.md)
- [测试与验收](docs/testing-guide.md)
- [版本更新](CHANGELOG.md)
