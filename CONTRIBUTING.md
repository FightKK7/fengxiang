# 参与贡献

> 状态：当前有效 · 最后核对：2026-10-26

本仓库是「风向」的开源应用仓库，只包含可部署的应用代码与开发文档。产品规划、运营、内部验收与历史资料不在仓库里。

## 仓库结构

- `app/`：应用（npm workspaces：`apps/web`、`apps/api`、`apps/worker`、`packages/*`、`modules/*`、`site`、`industry`）
- `app/docs/`：应用开发文档：架构、部署、信源、精选、归组、后台、定制
- `assets/readme/`：README 产品截图
- `.github/`：CI 与 Issue / PR 模板

## 开发环境

1. 安装 Docker 与 Node.js 24。
2. 在 `app/` 目录执行 `node scripts/init-env.ts --llm-key <你的模型 API Key>` 生成 `.env`。
3. 在同一目录执行 `docker compose up -d --build`，打开 <http://localhost:3000>，后台在 `/admin`。
4. 开发调试时把 `.env` 里的 `COLLECT_ENABLED`、`MODEL_CALLS_ENABLED` 保持 `false`；需要真实采集 / 模型调用时再打开并重启 worker。
5. 不要提交 `.env`、密钥、`.data/` 或用户反馈中的真实个人信息。

## 改哪里

| 想改什么 | 位置 |
|---|---|
| 站名、全站文案、条款/隐私、品牌、固定文件 | `app/site/` |
| 分类、标签、主题、示范信源、提示词、门槛 | `app/industry/` |
| 读者面与后台页面 | `app/apps/web/` |
| 公开 API、MCP、采集与模型任务 | `app/apps/api/`、`app/apps/worker/` |
| 公开读取层与领域逻辑 | `app/packages/backend/` |
| 契约与站点配置类型 | `app/packages/contracts/` |
| 仓库级 CI、Issue / PR 模板 | `.github/` |

应用结构与命令见 [`app/README.md`](app/README.md)，架构见 [`app/docs/architecture.md`](app/docs/architecture.md)。

## 提交前检查

```bash
cd app
npm run typecheck
DATABASE_URL=postgres://127.0.0.1:5432/<名字>_test npm test
npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts
node scripts/smoke.ts --base http://localhost:3000   # 站点跑起来后
```

测试库名必须以 `_test` 或 `_ci` 结尾；测试不访问生产数据、不调用外部付费服务。数据库迁移规则见 [`app/docs/architecture.md`](app/docs/architecture.md)。

## 提交约定

- 从仓库根提交；一次提交解决一个清楚的问题，不夹带无关重构；提交说明写清「改了什么、为什么、怎么验证」。
- 不提交依赖锁文件的无关变更、二进制文件、密钥或未授权素材。
- 代码使用 MIT 许可（根 [LICENSE](LICENSE)；上游 AIHOT 副本见 [app/LICENSE](app/LICENSE)）。上游 AIHOT 的名称与 Logo 不在 MIT 许可范围内，本站使用自己的名称与品牌。

## 对外贡献

欢迎通过 Issue 报告问题和提出使用场景；较大的改动请先开 Issue 说明背景，避免直接提交大范围重构。整个仓库的维护者保留合并与取舍决定权。
