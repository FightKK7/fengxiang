# 风向 · 全球企业服务资讯

> 可自定义的信息聚合平台：换信源、换行业、换主题，DIY 成你自己的资讯站；默认示例是「全球企业服务资讯」。
>
> **在线预览（静态演示，非实时）：** https://fightkk7.github.io/fengxiang/

![风向首页](assets/readme/hero.png)

*首页：时间线在左，推荐阅读和订阅在右。*

## 这是什么

OpenAI、Google Workspace、Salesforce、微软、飞书、Notion、Slack……这些公司每天都会发博客、公告、更新日志、价格页。风向把这些官方内容收进来，整理成中文标题和摘要，按时间排到首页；每天再挑几条值得看的，编成「每日精选」。

内容只收官方一手，不转媒体和二手分析。判断也不是每条都有——少数条目会附一句「风向观察」，没有就不写。

同一份数据还有三个出口：RSS、公开 API、MCP。不用注册，也不用 API Key。

信源、分类、提示词和站点文案都在仓库里。换一批信息源、改一下行业包，就能把它变成另一个行业的资讯站，做法见 [app/docs/customize.md](app/docs/customize.md)。

## 界面

### 每天一期「每日精选」

![每日精选](assets/readme/daily.png)

北京时间每天 08:00 出刊。当天没有值得单独挑出来的变化，页面会直说，不硬凑。

### 点开一条看全文

![条目页](assets/readme/item.png)

标题和摘要先给中文，正文保留原文，带中文对照。右侧是收藏、字号、译文三个按钮，阅读时用得上。

### 按公司找

![企业厂商目录](assets/readme/topics.png)

首页顶部可以按公司筛选；「企业厂商」目录里，每家公司有自己的介绍、近 30 天条数和最近更新。

### 手机上

<p align="center">
  <img src="assets/readme/mobile.png" width="300" alt="手机端首页">
</p>

*动态、每日精选、我的，三个入口。*

### 接给 Agent

![Agent 接入页](assets/readme/agent.png)

- MCP：给 Claude Code、Codex、Cursor 这类支持 MCP 的客户端，填个地址就有 7 个工具。
- RSS：丢进阅读器订阅。
- REST API：给程序读，带 OpenAPI 3.1 定义。

截图来自 2026-10-26 的本地实例，内容是真实抓取的公开信息。

## 自己部署

需要 Docker、Node.js 24，和一个 OpenAI 兼容的模型 API Key（DeepSeek、千问、智谱都行）。

```bash
git clone https://github.com/FightKK7/fengxiang.git
cd fengxiang/app
node scripts/init-env.ts --llm-key <你的模型 API Key>
docker compose up -d --build
```

打开 <http://localhost:3000>，后台在 `/admin`。

新库是空的，只有信源配置。想让它开始采集和生成内容，就把 `.env` 里的 `COLLECT_ENABLED`、`MODEL_CALLS_ENABLED` 打开，重启 worker。内容会慢慢出来。只想看界面的话，上面的截图就够了。

部署、备份、域名这些，见 [app/docs/deploy.md](app/docs/deploy.md)。

## 技术栈与开发

React Router（SSR）+ Fastify + PostgreSQL 17 + pg-boss，Docker Compose 部署。

- 应用代码和开发说明：[`app/`](app/)、[`app/README.md`](app/README.md)
- 架构与迁移：[`app/docs/architecture.md`](app/docs/architecture.md)
- 信源与抓取：[`app/docs/sources.md`](app/docs/sources.md)
- CI：[`.github/workflows/check.yml`](.github/workflows/check.yml)

## 许可

代码使用 [MIT 许可证](LICENSE)。本项目基于 MIT 许可的 AIHOT 框架二次开发，原始版权与第三方素材说明见 [NOTICE](NOTICE)。「风向」名称、站点内容和品牌素材不在 MIT 许可范围内。

安全问题按 [SECURITY.md](SECURITY.md) 处理；开发流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。
