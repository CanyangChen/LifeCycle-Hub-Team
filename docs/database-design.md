# 数据库设计与迁移

## 核心数据模型

| 模块 | 主要表与关系 |
|---|---|
| 通用档案 | `Item` 连接各分类详情、`LifecycleEvent` 和提醒记录。 |
| 食品 | `FoodItem` 保存档案，`FoodDetail` 保存对应批次，关联分类、位置、检查和库存流水。 |
| 药品 | `DrugItem`、`DrugBatch` 和成分表保存档案、库存和成分；`MedicationPlan` 与 `MedicationLog` 管理计划及实际服用。 |
| 演示账号 | `DemoAccount` 与 `DemoSession` 属于联网演示模式。本地模式使用本地实例身份。 |

SQL 定义及历史迁移位于 [drizzle](../drizzle/)，执行顺序由 `drizzle/meta/_journal.json` 管理。本地迁移已执行项记录在 `StandaloneMigration` 表，首次启动时由 `standalone-db.mjs` 初始化。

## 变更流程

由项目负责人确认 Schema 设计。使用新的顺序迁移文件并更新迁移清单，已部署的历史迁移保留原样。迁移 PR 需说明兼容性、影响的表、关键数据保护及恢复方法。先备份，再用空库、旧版库副本和重复启动验证。检查外键、记录数量和库存事务后才应用到使用中的库。

## 本地存储与恢复

SQLite 默认位于 `%LOCALAPPDATA%\LifeCycleHub-Team\data\team.sqlite`，预留的文件目录为同级项目数据目录下的 `uploads`。不要共享正在写入的 SQLite 文件。备份时停止服务后复制整个数据目录，并标注时间和版本；恢复先指向单独目录打开副本验证。源文件、备份及秘密留在本机。
