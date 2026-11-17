# 团队协作规范

- `main` 是稳定分支。每项功能从最新 `main` 创建 `feature/<主题>`，修复使用 `fix/<主题>`。
- 每个提交说明一个目的，建议用 `feat(food): 支持批次搜索`、`fix(medicine): 修正库存扣减`、`docs: 更新启动指南` 等格式。
- 将分支推到团队仓库，向 `main` 发起 Pull Request。由至少一位其他成员审核，解决讨论并通过构建及回归后合并。多人修改时优先使用 Squash merge。禁止直接推送、强制推送或删除 `main`。
- 数据库 Schema 由项目负责人统一管理。任何结构变更均附新迁移、数据影响说明和升级测试，并由负责人审核。
- 每位组员使用自己的 SQLite 库。提交前用 `git status --short` 和 `git diff --cached` 检查内容。数据库、备份、个人记录、真实环境变量和密钥均禁止提交。测试只用虚构数据。
- 提交面向用户的变更时更新 [CHANGELOG.md](CHANGELOG.md) 的「未发布」部分。

## 本地检查

运行 `npm ci --ignore-scripts`、`npm run build` 和 `npm test`。修改启动、交互或迁移时，还需按[测试指南](docs/testing-guide.md)实测受影响流程。

## GitHub 维护者设置

在 Settings → Rules → Rulesets 创建 Branch ruleset，设为 Active，目标为默认分支。启用 Require a pull request before merging、至少 1 位审核者、Require review from Code Owners 和 Require conversation resolution。启用 Block force pushes 和 Restrict deletions，保持绕过列表为空。项目负责人拥有团队仓库写权限时，`.github/CODEOWNERS` 将为数据库相关改动请求其审核。

待首个 PR 的 Actions 检查出现后，在同一规则中启用 Require status checks to pass before merging，选择 `Team CI / Build and regression` 对应的实际检查项。规则是否生效以仓库设置和一次 PR 验证为准。 [GitHub Rulesets 文档](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
