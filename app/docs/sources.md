# 信源

> 状态：当前有效 · 最后核对：2026-10-26（对照 `app/packages/backend/src/sources/config-keys.ts`、`collect.ts`、`json-list.ts`、`web-list.ts`、`filters.ts`）
>
> 信源在后台「信源」页管理：新建、试抓一次看看抓到什么、改频率、启停、看失败原因和最近的条目。首次启动时，`industry/sources.json` 里的示范信源（当前 10 个官方内容源）会被导入。

## 六种信源

| 类型 | 适合 | 需要 |
|---|---|---|
| `rss` | 有 RSS / Atom 的博客、媒体、Substack、公众号转 RSS 服务 | 无 |
| `web_list` | 没有 RSS 的网页列表（新闻页、博客列表、更新日志） | 写选择器；按需配置 Jina Reader 渲染（按次计费） |
| `json_list` | 返回 JSON 的接口、或 HTML 里嵌 JSON 的页面（GitHub Releases 等） | 写字段路径 |
| `x_search` | X（推特）账号 | SocialData 的 key，按请求计费 |
| `mp_account` | 微信公众号 | 极致了（Dajiala）的 key，按请求计费 |
| `external` | 你自己的脚本推送进来的内容（或「专用抓取」模块） | `INGEST_TOKEN` / 专用抓取实例，见下文 |

`json_list` 的地址或配置可能携带凭据，只跟随同源重定向（协议、主机和端口都相同）。若接口搬到另一个来源，请直接更新信源地址；不要依赖跨源跳转传递认证信息。

抓取默认不连内网地址。订阅或列表地址指向自建在内网的服务时（比如同一 Docker 网络里的 RSSHub，地址写 `http://rsshub:1200/...`），在 `.env` 里设 `PRIVATE_FEED_HOSTS=rsshub`（逗号分隔的完整主机名，不区分大小写），重启 API 和 worker。放行只对 `rss` 的 `feedUrl`、`web_list` 与 `json_list` 的 `url` 本身生效，这些主机直连、不走 `EGRESS_PROXY_URL`；跳转到别的主机、文章正文、详情页、图片和图标仍按原规则拒绝内网地址，链路本地和云元数据地址（`169.254.0.0/16`、`100.100.100.200` 等）任何时候都拒绝。

每种信源认哪些配置项写在 [`config-keys.ts`](../packages/backend/src/sources/config-keys.ts)。填了不认识的配置项（或嵌套对象里不认识的子键、不合法的取值），**创建/编辑/预览都会被拒绝**：后台返回 400「不支持的配置项：…」，不会悄悄退回通用解析。

## 配置键总表（按 kind）

### 共用键：`rss` / `web_list` / `json_list`

| 键 | 作用 |
|---|---|
| `allowUrlPrefixes` / `denyUrlPrefixes` | 只收 / 排除某些路径前缀下的文章 |
| `publisherRole` / `publisherUrlPrefixes` / `publisherRequiresDiscovery` | 发布方归属（见「分级、参与方式与全文」）；`publisherRequiresDiscovery: true` 要求该文章在发布方自己的列表里出现过 |
| `publishedAtAuthoritative` | 源的逐条日期是否是**事件时间**。`false` 表示整页/整批共用一个时间戳（如 JSON 列表整批共用的 `created`），此时日期只用于发现排序（同源批次折叠已于 2026-10-23 移除）；不写默认按 `true` 处理 |
| `changeKind` | 变更类型，六选一：`announcement` 公告 / `roadmap` 路线图 / `diff` 功能变化 / `ga` 正式可用 / `hiring` 招聘 / `tender` 招标（当前内容以官方一手内容源为主；`roadmap`/`hiring`/`tender` 这类变更监控本期不新增） |
| `displayTimeZone` | 源站时区（IANA，如 `America/Los_Angeles`），只影响读者面展示的时间口径 |
| `publishedAfter` | 只收**严格晚于**该 UTC 时刻且发布日期可信的条目；必须是完整 UTC 时间（`2026-10-01T00:00:00.000Z`，毫秒可省）；预览、首次和后续采集都生效，未知日期也排除 |
| `_aihot.initialBackfillLimit` / `_aihot.initialBackfillMonths` | 首次导入的上限条数（默认 30）/ 回溯月数（默认 12） |
| `detail` | 详情页补全规则，见下方嵌套键 |
| `sortByPublishedAt` | 列表条目按发布时间倒序（默认按列表顺序） |
| `fetchPublicContent` | 显式要求抓文章正文（`detail`、`web_list` 默认已抓；字段用于声明意图/预算判断） |
| `bodyFromMarkdown` | 正文改从来源自己的 Markdown 导出取：请求 `<条目地址>/markdown`，解析 `## 正文 · 中文译文` / `## 正文 · 原文` 两节（优先用来源已翻好的中文）；取不到时回退抓 HTML。AIHOT 一类建了 Markdown 导出的源用它正文最干净，也省一次翻译 |
| `requireEntityMatch` | 媒体源只收提到受监控实体（`industry/taxonomy` 的 `ENTITIES`）的条目；官方源不用 |
| `acceptLanguage` | 抓取时的 `Accept-Language`（如 `en-US,en;q=0.9`） |
| `ingestNoiseFilter` | 入库噪声过滤：`dropMarkers` 标题/正文命中词、`dropMarkersTitleOnly` 只查标题、`keepIfMatches` 命中则豁免 |
| `itemUrlPrefixRewrite` | 把条目地址前缀 `from` 改写成 `to`（取不到规范地址时用） |

### 各 kind 额外键

- **`rss`**：`feedUrl`（必填）、`summaryIsBody`、`preserveUrlFragment`、`allowCategories` / `denyCategories`、`publishedAtUtcOffset`、`publishedAtFromUpdated`（Atom 只给 `<updated>` 的源把 updated 当发布时间，GitHub Releases / Vercel Atom 一类）。
- **`web_list`**：`url`（必填）、`baseUrl`、`parseMode`（`html` / `markdown` / `docusaurus_changelog` / `intercom_changelog`）、`adapter`（目前仅 `mimo_home`）、`cacheToleranceSeconds`（Jina 缓存容忍）、`linksStartLine`（Markdown 只取行首链接）、`preserveUrlFragment`、`itemSelector`、`linkSelector`、`titleSelector`、`publishedAtSelector`、`publishedAtRegex`、`publishedAtUtcOffset`。
- **`json_list`**：`url`（必填）、`mode`（`json_api`，或 `html_json_key` / `html_window_var` 从 HTML 里取 JSON）、`method`、`headers`、`bodyJson`（请求数据，自由 JSON）、`jsonKey`（`html_json_key` 的键名）、`windowVar`（`html_window_var` 的变量名）、`itemsPath`、`itemsObjectValues`、`titlePaths`、`summaryPaths`、`summaryIsBody`、`authorPaths`、`publishedAtPath`、`publishedAtUnit`（`epoch_s` / `epoch_ms` / `yyyymmdd`）、`publishedAtUtcOffset`、`externalIdPath`、`urlTemplate`、`urlTemplateFallback`、`rawDropKeys`、`requireBoolean`、`minNumeric`。
- **`x_search`**：`query`（如 `from:SomeAccount -filter:replies`）、`searchType`（`Latest` / `Top`）、`publisherRole` / `publisherUrlPrefixes` / `publisherRequiresDiscovery`、`_aihot`、`ingestNoiseFilter`、`itemUrlPrefixRewrite`。
- **`mp_account`**：`ghid`（原始 ID，推荐）、`wxid`（同义，旧配置）、`nickname`、`publisherRole` / `publisherUrlPrefixes` / `publisherRequiresDiscovery`。
- **`external`**：只接受 `publisherRole` / `publisherUrlPrefixes` / `publisherRequiresDiscovery`；内容由推送接口或专用抓取写入，不主动抓列表。

### 嵌套对象与取值

| 键 | 允许的子键 / 取值 |
|---|---|
| `_aihot` | `initialBackfillLimit`、`initialBackfillMonths` |
| `ingestNoiseFilter` | `dropMarkers`（数组）、`dropMarkersTitleOnly`（布尔）、`keepIfMatches`（数组） |
| `itemUrlPrefixRewrite` | `from`、`to` |
| `requireBoolean` | `path`、`equals`（按条目过滤：字段值必须等于 equals） |
| `minNumeric` | `path`、`min`（按条目过滤：数值字段 ≥ min） |
| `detail` | `maxFetches`（本轮最多补几条）、`publishedAtSelector` / `publishedAtRegex` / `publishedAtUtcOffset`、`publishedAtAuthoritative`（详情页日期是否事件时间）、`upgradeDatePrecision`（详情页读到更精确日期时升级）、`titleSelector` / `titleRegex` / `titleAuthoritative`、`summarySelector`、`preserve`（保留文章部件：`{ selector, as: "pre" }` 里可再带 `code` / `caption`，或 `{ selector, as: "table" }`） |
| `parseMode` 取值 | `html`、`markdown`、`docusaurus_changelog`、`intercom_changelog` |
| `adapter` 取值 | `mimo_home` |
| `publisherRole` 取值 | `organization`（机构官方账号）、`person`（官方人员） |

校验细节：`publishedAfter` 必须是完整 UTC 时刻；`publishedAtAuthoritative` / `publishedAtFromUpdated` / `requireBoolean.equals` 等必须是布尔/正确类型；`publisherUrlPrefixes` 必须是 http(s)、无账号密码/查询串/锚点的绝对地址；`acceptLanguage` 按语言列表语法校验。

> 已知情况：`json_list` 的 `rawDropKeys` 在允许清单里，但当前 backend 代码里没有读取它的实现（允许写入、暂不生效）。用不到就别写；是否需要补实现未知，按「允许但未接」记录。

## 本站当前配置（2026-10-23 17:2x）

库内信源以部署时数据库为准；首次启动导入 `industry/sources.json` 里的 10 个官方内容源。逐源配置见下方。

**数据快照（2026-10-23 17:2x）**：文章 96 条、公开+合格 85 条、精选 14 条；每日精选已出 2 期（第 001 期人工补录 7 条、第 002 期人工补录 5 条，`origin=manual`）。

启用源（20 个，按 2026-10-23 的信源政策归类；kind / tier / 抓取间隔分钟）：

| 归类 | 源 id | kind / tier / 间隔 |
|---|---|---|
| 内容源 | `rss-google-workspace-updates` | `rss` / T1 / 60 |
| 内容源 | `rss-microsoft-365-blog` | `rss` / T1 / 60 |
| 内容源 | `rss-salesforce-news` | `rss` / T1 / 60 |
| 内容源 | `web-cursor-blog` | `web_list` / T1 / 60 |
| 内容源 | `web-deepseek-news` | `web_list` / T1 / 60 |
| 内容源 | `rss-openai-news` | `rss` / T1 / 120 |
| 内容源 | `rss-salesforce-blog` | `rss` / T1 / 180 |
| 内容源 | `rss-slack-blog` | `rss` / T1 / 180 |
| 内容源 | `rss-hubspot-blog` | `rss` / T1 / 180 |
| 内容源 | `web-anthropic-engineering` | `web_list` / T1 / 180 |
| 内容源 | `rss-zapier-blog` | `rss` / T1 / 240 |
| 监控 | `web-slack-changelog` | `web_list` / T1 / 60 |
| 监控 | `web-deepseek-api-updates` | `web_list` / T1 / 60 |
| 监控 | `rss-dsh-harness-releases` | `rss` / T1 / 60 |
| 监控 | `rss-feishu-cli-releases` | `rss` / T1 / 120 |
| 监控 | `rss-feishu-mcp-releases` | `rss` / T1 / 180 |
| 监控 | `rss-dsh-desktop-releases` | `rss` / T2 / 240 |
| 监控 | `rss-dsh-desktop-dataelement` | `rss` / T2 / 240 |
| 媒体 | `rss-aihot-selected` | `rss` / T2 / 180 |
| 媒体 | `rss-mit-tech-review-ai` | `rss` / T2 / 120 |

> 处置状态：内容源保留；监控 7 个本期暂保持启用；媒体 2 个按 2026-10-23 的决定先保留、不停用。

各源里需要特别注意的配置：

| 源 id | 关键配置 |
|---|---|
| `rss-google-workspace-updates` | `changeKind: "diff"`、`displayTimeZone: "America/Los_Angeles"`、回填上限 8 |
| `rss-microsoft-365-blog` | 官方博客 feed |
| `rss-salesforce-news` | `changeKind: "announcement"`、`displayTimeZone: "America/New_York"`、回填上限 8 |
| `web-cursor-blog` | `itemSelector: "article"`、`linkSelector: "a[href]"`、`titleSelector: "p"`、`publishedAtSelector: "time"` |
| `web-deepseek-news` | `itemSelector: "a.ds-news-list-item"`、`titleSelector: "h3"`、`publishedAtSelector: "span.text-ds-description"` |
| `web-deepseek-api-updates` | `parseMode: "docusaurus_changelog"`、`publishedAtUtcOffset: "+08:00"` |
| `rss-dsh-harness-releases` | `publishedAtFromUpdated: true` + `detail.publishedAtSelector: "relative-time"`（GitHub Releases Atom 只给 updated） |

停用的 39 个里多数是媒体、研究与早期示范源；`industry/sources.json` 现在只列 **10 个官方内容源**，新库启动不会再导入监控或媒体源。`feishu-changelog` 是 `external` 源（当前停用），它的内容由「专用抓取」模块的实例推送。

### 历史示例：M365 Roadmap 的 JSON API 配置（该源已于 2026-10-23 15:22 删除）

> 这一段只作为 `json_list` 写法的历史示例保留：源与数据已从库中删除，不再启用；新站不要照抄成默认内容源。

```json
{
  "url": "https://www.microsoft.com/releasecommunications/api/v2/m365",
  "mode": "json_api",
  "itemsPath": "value",
  "titlePaths": ["title"],
  "urlTemplate": "https://www.microsoft.com/en-us/microsoft-365/roadmap?id={raw:id}",
  "summaryPaths": ["description"],
  "publishedAtPath": "created",
  "externalIdPath": "id",
  "summaryIsBody": true,
  "publishedAtAuthoritative": false,
  "changeKind": "roadmap",
  "displayTimeZone": "America/Los_Angeles",
  "_aihot": { "initialBackfillLimit": 5 }
}
```

要点：

- Roadmap 页面 HTML 里没有稳定条目节点（前端渲染），官方 JSON 在 `value` 数组（2000+ 条），字段是 `title` / `description` / `created` / `id`；
- `publishedAtAuthoritative: false`：`created` 是整批共用的时间戳，不是每条的事件时间；因此它只用于发现排序，不能当「事件时间」用（口径见 [`docs/time-and-change-kind.md`](../../docs/time-and-change-kind.md)）；
- `summaryIsBody: true`：正文就用 `description`，**不要**再对 roadmap 页面做 HTML 正文抽取（页面能抽到的只是样板，25 条里 24 条相同）；
- `site_fulltext` 开、`syndicate_fulltext` 关（站内全文、对外仍只给摘要）。

## 先预览，再创建

进入 `/admin/sources/new`，填写 ID、名称，选择类型，再把[下一节](#每种信源怎么配置)对应的 JSON 填入「采集配置（JSON）」。这里填的是配置对象，不要包上 `kind` 或 `config`。切换类型会重置配置，先选类型再粘贴。

名称里全角括号中的备注（比如“某媒体（热点 RSS）”）只给后台看，读者在网页、RSS、Agent Markdown、MCP 和搜索里看到的是去掉备注的名字；X 账号写成 `X：显示名 (@handle)` 的，读者只看到显示名。公开 API 的 JSON 里仍是完整的名字。

`rss`、`web_list`、`json_list`、`x_search` 可以点「预览抓取」：显示条目总数和前 20 条的标题、原文链接、发布时间、摘要，不把条目存入文章库。`external` 与 `mp_account` 不渲染「预览抓取」按钮（由来源方推送 / 按公众号接口读，无法主动试抓）。检查抓到的是文章而不是导航，日期与原文一致，再点「创建」。预览和正式采集套用同一组过滤（地址前缀、分类、噪声词、地址改写、`publishedAfter`），看到的就是正式采集会收的条目；但它不等于完成生产采集，也不经过后续详情补齐、精选和公开发布流程。

预览仍会发出抓取请求；X 和 Jina 预览也可能产生费用，经过付费回执和预算。`COLLECT_ENABLED=true` 只是总阀；关掉它也不能保证手动预览不访问外部服务。下面的本地 HTML/JSON 示例不需要任何 API key。

## 每种信源怎么配置

### rss

```json
{ "feedUrl": "https://example.com/feed.xml" }
```

可选：`summaryIsBody`（确认文字订阅里的摘要就是全文时，将 RSS 的 `description`、Atom 的 `summary` 当正文，不再去抓原文页）、`allowCategories` / `denyCategories`（按订阅里的分类过滤）。

只给 `<updated>`、不给 `<published>` 的 Atom 源（GitHub Releases、Vercel Atom 一类），条目没有发布时间就会按「无发布时间」规则暂不公开。两种补法：设 `publishedAtFromUpdated: true` 把 `<updated>` 当条目时间（发布/更新日志类源适用；普通博客的 `<updated>` 可能是修订时间，不要开）；或者在 `detail` 里写 `publishedAtSelector` + `maxFetches`，从详情页读日期（GitHub 发布页用 `relative-time`）。两者可以同时用（先取更新时间，详情页能读到时再升级精度）。

所有信源的 YouTube、Vimeo 视频播放页都不作为文章正文提取。Media RSS 的视频描述保留为摘要，即使设置了 `summaryIsBody` 也不会把描述当成视频字幕；订阅通过 `content` / `content:encoded` 提供的真实文字仍可使用。其他文章中嵌入视频，不影响文章本身的正文读取。

文章正文中的原生视频保留安全的媒体地址和候选格式，使用浏览器控件手动播放。视频文件由浏览器直连原站，封面沿用图片代理；不自动播放、不循环，预加载提示设为 `none`，但浏览器不保证交互前完全没有请求。没有媒体地址和可用封面的播放器只保留后备文字。Markdown 和允许再分发的全文 RSS 保留视频结构，能否播放取决于阅读器；动态平台播放器和 iframe 不在此范围。

文章插图里内嵌的 SVG 图不保留图形本身（颜色和字体依赖原站样式表），换成原站给这张图写的无障碍文字说明（`aria-label`、`aria-labelledby` 指向的文字，或图里的 `<title>`、`<desc>`），作为纯文字放在图原来的位置；同一张图的宽窄两版只留一份，插图里已经显示的文字（图注、小标题）不重复。没有文字说明的图和插图之外的 SVG 图标照旧去掉。

没有网页的播客单集（没有 `<link>`、`guid` 也不是网址），原文链接用它的音频或视频文件，浏览器可以直接播放；这类单集不抓网页，按订阅里的文字处理。

### web_list

支持普通 CSS 选择器，`div` 列表也能采集。关键是 `itemSelector` 要选中**每条新闻**，而不是包住所有新闻的容器。例如：

```html
<div class="news-list">
  <div class="news-item">
    <h2><a href="/posts/first">第一条示例新闻</a></h2>
    <time datetime="2026-10-01T09:00:00+08:00">10 月 1 日</time>
  </div>
  <div class="news-item">
    <h2><a href="/posts/second">第二条示例新闻</a></h2>
    <time datetime="2026-10-01T10:00:00+08:00">10 月 1 日</time>
  </div>
</div>
```

对应配置（`example.com` 是占位地址，换成目标网页；可运行版本见[本地示例](#本地跑通-htmljson-示例)）：

```json
{
  "url": "https://example.com/news",
  "parseMode": "html",
  "itemSelector": ".news-list > .news-item",
  "linkSelector": "h2 a",
  "titleSelector": "h2 a",
  "publishedAtSelector": "time",
  "allowUrlPrefixes": ["https://example.com/posts/"]
}
```

- `itemSelector` 在整个页面找条目；`linkSelector`、`titleSelector` 在每个条目内取第一个匹配节点，也可以匹配条目自身。选 `.news-list` 只会得到一个容器，通常只取到第一条新闻；只写 `div` 又会混入嵌套容器。要选重复出现的新闻节点。
- 链接取自 `href`；`/posts/first` 等相对链接按列表重定向后的最终地址解析，也可用 `baseUrl` 指定基准地址。标题取节点文字。重复链接会合并；Markdown 列表先出现“Read more”等按钮、后出现真实标题时，使用真实标题。指向列表自身的链接通常会跳过。
- 日期在条目内查找 `publishedAtSelector`，依次尝试 `datetime`、`content`、`title` 属性和文字，无法解析的提示文字不会遮住同一节点的有效日期。没有时区的日期时间可用 `publishedAtUtcOffset`（默认 `+08:00`）；自带时区的时间保留原时区语义，纯 `YYYY-MM-DD` 按 UTC 零点读。不完整的月份、产品版本号和不存在的日历日期不作为发布日期。
- `parseMode`：普通网页默认 `html`；`markdown` 按 Markdown 链接读；`docusaurus_changelog` 读更新日志标题；`intercom_changelog` 按 Intercom 帮助中心的日期章节读取标题和正文，每节保留自己的网址锚点，默认按 UTC 日历日读取，也可指定 `publishedAtUtcOffset`。需要 Jina 时，显式把 `url` 写成 `https://r.jina.ai/https://目标站/路径` 并配置 `JINA_API_KEY`，不是抓不到就自动切换。Jina 默认返回 Markdown；要继续使用 CSS 选择器，显式设 `parseMode: "html"`。
- `linksStartLine: true`：Markdown 列表只认行首链接（跳过正文里的行内链接）；`preserveUrlFragment: true`：保留链接锚点，用于一个页面多个更新章节的更新日志。
- `detail`：列表缺日期、标题或摘要时抓详情页补齐（`publishedAtSelector`、`titleSelector`、`summarySelector` 等）。读取失败或本轮 `maxFetches` 用完的条目，后续抓取继续补全；补元数据时保留已确认的正文。已有真实标题不会因为列表仍写“Read the Blog”而被换回按钮文字，也不会仅因标题较长再次读取详情。需要强制使用详情标题时设置 `titleAuthoritative: true`。详情页和正文提取读到不带时区的时间时，先用 `detail.publishedAtUtcOffset`，未设则继承信源的 `publishedAtUtcOffset`，两处都未设时默认 `+08:00`。RSS、JSON 列表也可以用 `detail`。
- Jina 列表的 `detail.titleRegex`、`publishedAtRegex` 匹配 Jina 文本，可共用同一次详情响应；CSS 选择器读取原站 HTML。应按实际可读取的页面选择规则。
- `allowUrlPrefixes` / `denyUrlPrefixes`：只收某些路径下的文章。

### json_list

假设接口返回下面的结构，`itemsPath` 指向数组，其他字段路径相对**每个数组元素**填写。路径用点分隔，不是 JSONPath，不写 `$` 或 `[*]`。

```json
{
  "data": {
    "items": [
      {
        "id": "first",
        "title": "第一条示例新闻",
        "url": "https://example.com/posts/first",
        "summary": "第一条新闻的摘要。",
        "published_at": "2026-10-01T09:00:00+08:00"
      }
    ]
  }
}
```

对应配置：

```json
{
  "url": "https://example.com/api/news",
  "mode": "json_api",
  "itemsPath": "data.items",
  "titlePaths": ["title"],
  "urlTemplate": "{raw:url}",
  "summaryPaths": ["summary"],
  "publishedAtPath": "published_at",
  "externalIdPath": "id"
}
```

- 接口本身返回数组时，省略 `itemsPath`。`titlePaths`、`summaryPaths`、`authorPaths` 是候选路径数组，按顺序取第一个非空值，例如 `["title", "name"]`。
- 已有完整网址时用 `{raw:url}`；只有 slug 时可用 `https://example.com/posts/{slug}`。`{字段路径}` 会编码字段值，`{raw:字段路径}` 原样插入。JSON 列表不会自动把相对网址补成绝对网址，模板应产出完整的 HTTP(S) 地址。`urlTemplateFallback` 在主模板产不出地址时兜底。
- `summaryIsBody`：确认接口里的摘要就是全文时设为 `true`，把 `summaryPaths` 取到的文字当正文，不再去抓原文页。
- 日期建议返回带时区的 ISO 字符串；`2026-09-30 17:43:58` 这类不带时区的时间，与网页列表一样按 `publishedAtUtcOffset` 读（默认 `+08:00`）；数字时间戳分别设 `publishedAtUnit: "epoch_s"`（秒）或 `"epoch_ms"`（毫秒），`20261001` 这类日期设 `"yyyymmdd"`。
- 从 HTML 页面的脚本里取 JSON：`mode: "html_json_key"` + `jsonKey`（扫描 script 块，如 `__NEXT_DATA__`）；`mode: "html_window_var"` + `windowVar`（扫 `window.xxx = {...}`）。`itemsObjectValues: true` 把对象值当条目数组（接口返回 `{ "1": {...}, "2": {...} }` 时）。
- 需要请求头/请求体时用 `headers` / `bodyJson`（`method` 默认 GET）；GitHub API 会自动带 `GITHUB_TOKEN`（若配置）。
- 按条目过滤：`requireBoolean: { path, equals }`、`minNumeric: { path, min }`；例如只收 `"type": "roadmap"` 的条目。
- 缺少标题或无法生成链接的条目会跳过。非空数组全部映射失败时，会报 `no items mapped (check title/url paths)`（用了 `requireBoolean`/`minNumeric` 时不会误报，只表示全部被过滤）；路径不是数组时，会报 `items path did not resolve to an array`。

### 本地跑通 HTML/JSON 示例

仓库提供两份虚构示例：[news.html](examples/sources/news.html) 和 [news.json](examples/sources/news.json)，各有两条新闻。它们用于核对选择器和字段映射，不是运营信源；示例文章链接不提供正文。

在仓库根目录、Node.js 24.11 以上运行以下命令。服务只监听本机，只提供这两份文件；用 `Ctrl+C` 停止。

```bash
node --input-type=module -e '
import http from "node:http";
import { readFileSync } from "node:fs";
const files = {
  "/news.html": ["text/html; charset=utf-8", readFileSync("docs/examples/sources/news.html")],
  "/news.json": ["application/json", readFileSync("docs/examples/sources/news.json")]
};
http.createServer((req, res) => {
  const file = files[req.url];
  res.writeHead(file ? 200 : 404, { "content-type": file ? file[0] : "text/plain" });
  res.end(file ? file[1] : "Not found");
}).listen(8787, "127.0.0.1");'
```

在同一台机器上，按[非 Docker 部署方式](deploy.md#不用-docker)准备好数据库，用 `npm run dev:api`、`npm run dev:web` 运行开发 API 和网页，保持采集、模型、飞书和 IndexNow 开关关闭，不启动 worker。仅为此次本机示例，在开发 API 进程设置 `ALLOW_PRIVATE_NETWORK_FETCH=true` 后重启；默认禁止抓内网地址，生产环境拒绝启用此项，验证后移除。若 API 在容器或另一台服务器，`127.0.0.1` 指向它自己，此命令的地址不能直接用于该部署。

分别选择 `web_list`、`json_list`，粘贴配置并点“预览抓取”，无需创建信源：

```json
{
  "url": "http://127.0.0.1:8787/news.html",
  "parseMode": "html",
  "itemSelector": ".news-list > .news-item",
  "linkSelector": "h2 a",
  "titleSelector": "h2 a",
  "publishedAtSelector": "time",
  "allowUrlPrefixes": ["http://127.0.0.1:8787/posts/"]
}
```

```json
{
  "url": "http://127.0.0.1:8787/news.json",
  "mode": "json_api",
  "itemsPath": "data.items",
  "titlePaths": ["title"],
  "urlTemplate": "http://127.0.0.1:8787/posts/{id}",
  "summaryPaths": ["summary"],
  "publishedAtPath": "published_at",
  "externalIdPath": "id"
}
```

两次都应显示 **2 条**，依次为下表内容。JSON 示例还显示对应摘要，HTML 示例没有配置摘要提取。预览 API 的日期是 UTC，后台界面按 `+08:00` 显示为 09:00 和 10:00。

| 标题 | 原文链接 | 预览 API 的 publishedAt |
|---|---|---|
| 第一条示例新闻 | `http://127.0.0.1:8787/posts/first` | `2026-10-01T01:00:00.000Z` |
| 第二条示例新闻 | `http://127.0.0.1:8787/posts/second` | `2026-10-01T02:00:00.000Z` |

可以把 HTML 的 `itemSelector` 暂改成 `.news-list` 对照：只会返回第一条。改回 `.news-list > .news-item` 后恢复两条，这就是“列表容器”和“每条新闻”的区别。

抓真实网页时先看原始 HTTP 响应中有没有新闻节点。普通 HTML 模式不执行 JavaScript；浏览器里看得到、响应里没有的内容，不能靠换一个 CSS 选择器生成。优先找 RSS 或 JSON 接口，或按需配置 Jina / 自己维护的外部采集。`no items matched (html)` 还可能是选择器不匹配、没有 `href` 或标题、链接被前缀规则过滤；先核对响应与配置，不必先更换采集器。

### x_search

这类信源使用 SocialData 搜索，不是把 X 个人主页 URL 填入网页列表。以 `https://x.com/SomeAccount` 为例，取用户名 `SomeAccount`，不要包含 `@` 或整段 URL：

```json
{ "query": "from:SomeAccount -filter:replies", "searchType": "Latest" }
```

`SomeAccount` 是占位用户名，换成你要关注的真实账号。`-filter:replies` 排除回复；`Latest` 按最新内容查找（`Top` 按热度）。

在后端运行环境的 `.env` 配置 `SOCIALDATA_API_KEY`，重启 API（预览）和 worker（定时采集）后生效；不要把 key 写进信源 JSON 或提交到仓库。先在后台「设置 → 付费请求上限」检查 SocialData 额度，再按需预览。未配置 key 会报 `SOCIALDATA_API_KEY is not configured`；服务拒绝请求或预算熔断时看后台错误原因。预览可能有付费请求，本文不要求用真实服务验证，结果取决于账号和服务当时的返回。

生产自动采集时，普通账号会被自动合并成一次搜索（每次最多二十几个账号），省请求数；单个信源的手动预览不是合并采集。

### mp_account

```json
{ "ghid": "gh_xxxxxxxx", "nickname": "公众号名称" }
```

每个公众号按它的抓取间隔检查一次（查列表按次计费），新文章的正文一并取回。`ghid` 是公众号原始 ID（推荐）；旧配置里的 `wxid` 仍兼容，两者都有时优先 `ghid`。

需要在后端 `.env` 配置 `DAJIALA_KEY`。当前 `mp_account` 不支持「预览抓取」；`external` 也不支持主动试抓，按下方推送接口接入（或走专用抓取模块）。

## 分级、参与方式与全文

- **分级** `tier`：`T1` 官方一手（官网、官方博客、机构）、`T1_5` 官方账号与准官方创作者、`T2` 媒体与个人、`EXCLUDE_MP` 不参与精选。入选门槛按分级不同（`industry/selection.ts`）。
- **参与方式** `participation_mode`：`editorial` 进精选和全部动态；`hot_signal` 不单独展示，只作为“大家在讨论什么”的热度证据；`isolated` 不进任何公开页面。
- **一手**：只有 `T1` 算一手，不单独设置。同一条新闻有几篇报道时，代表报道优先选一手的，事件页也优先展示一手报道。
- **发布方**（可选，写在 `config` 里）：
  - `publisherUrlPrefixes`：`T1` 信源自己文章网址的前缀，比如 `["https://example.com/blog/"]`。别的信源（聚合站、转帖）带来的这些网址的文章，只要能认定是唯一一个官方信源的，就改记到它名下。网页列表信源不写时，认它自己列表所在的路径（这篇也要在它的列表里出现过）。
  - `publisherRole`：`T1_5` 账号的身份，`organization`（机构官方账号）或 `person`（官方人员）。再填上信源的 `owner_entity_id`（`industry/taxonomy.ts` 的 `ENTITIES` id），这个账号发的、主体正是这家公司的新闻，就能当代表报道（排在 `T1` 之后）。
- **全文**：`site_fulltext` 决定站内能不能显示全文，`syndicate_fulltext` 决定全文 RSS 能不能带正文。两者**默认都关**，只显示摘要和原文链接；来源明确允许时再打开。公众号、付费墙内容不会因为技术上抓得到就获得全文展示。
- **变更类型** `changeKind`：六类，只影响读者面筛选口径（列表页的第二行 tab；同源批次折叠已于 2026-10-23 移除）（`announcement` 公告 / `roadmap` 路线图 / `diff` 功能变化 / `ga` 正式可用 / `hiring` 招聘 / `tender` 招标）；不写时按普通变化处理。当前内容以官方一手内容源为主，媒体/监控存量待处置；`roadmap`/`hiring`/`tender` 这类监控源本期不新增。口径见 [`docs/time-and-change-kind.md`](../../docs/time-and-change-kind.md)。

## 抓取频率

每个信源有自己的抓取间隔。每天 **04:20**（`sources.adapt-intervals`）会按近 7 天的产出自动调整：产出多的抓得勤，最短 15 分钟（经 Jina 读的网页列表最短 60 分钟）；最长的，一般信源 60 分钟，X 账号和经 Jina 读的网页列表 120 分钟，只作热度证据的 180 分钟。合并搜索的 X 账号跟着合并后的节奏：进精选的半小时一次，只作热度证据的一小时一次。本站当前 20 个启用源的间隔分布（2026-10-23 17:2x 库内快照）：60 分钟 8 个、120 分钟 3 个、180 分钟 6 个、240 分钟 3 个；清库后供给少，自适应会按规则保持上限。

抓取失败不推进位置，下次从同一处继续；连续失败的信源在后台标红，每周一会在运营群发一份信源周报（配置了飞书内部群时）。

「7 天没有新内容」按**信源自己的节奏**判断，而不是一个固定的窗口：每日精选和周报里分两类。**超出自身更新节奏**的排在前面，先对照原站（把最近 90 天的**产出日**去重到「天」，相邻两天的间隔取中位数当它的节奏；至少有 4 个这样的日子才算有节奏，静默时长要超过中位间隔的 4 倍才算超）。产出日取该条内容的发布时间，页面没给时间就用我们发现它的那天；**一次首次导入算一天**——它是一次交付，发布时间往回铺多远都不算多次产出（否则一个从没产出过的源会显得很准时，跨月的首次导入还会把中位间隔撑大，把一个已经安静的源藏起来）。窗口只算这 90 天里的产出日，更早的历史说明不了它现在多久发一次；发现时间与发布时间没有固定先后，任一个落在窗口内就读，产出日再按窗口夹一次。**判断不了节奏的仍然列出**，但不当作故障，分两种：窗口内没有可比较的产出（它产出过，只是都在窗口外），以及从未收到过内容（那是采集问题）；在自身节奏内的不再列出。抓取间隔 `interval_minutes` 不参与判断——它表示我们多久看一次，不是它多久发一次。

## 采集窗口：首次导入与 48 小时

规则实现在 `sources/collect.ts` 的 `admission()` / `materials.ts` 的 `STALE_ON_DISCOVERY_MS`：

- **首次导入**（信源第一次抓取）：只取列表里前 `_aihot.initialBackfillLimit` 条（默认 **30**）、发布时间在 `_aihot.initialBackfillMonths` 个月以内（默认 **12**）的条目；这批按原文时间归档，不进入「今天」、不推送。
- **之后每次抓取**：只收发布时间在「信源初始化时间 − **48 小时**」之后的条目；列表里更早的存量不再进来（避免为整个订阅存档付费）。已经入库的条目仍接受时间修正（同 identity 的更新会覆盖）。
- `publishedAfter` 是另一层固定边界：在首次和后续采集中都生效，**严格大于**该时刻、且必须有可信发布时间。
- X 账号按抓取位置（watermark）往后读，不受 48 小时窗口限制。
- 48 小时窗口是「旧文不刷屏」的数据层实现，所有公开入口（时间线、精选、报告、热点、推送）共用；更早的内容只能通过首次导入的回填进入，且按回填归档。

## 规则：旧文不刷屏

首次发现时原文已经发布超过 48 小时的资料、新信源第一次导入的存量条目、标记为回灌的推送，都按原文时间归档：不进入“今天”，也不推送。没有可信发布时间的资料先不公开（不进公开列表、精选、报告、热点和推送），从原信源或原文页读到日期后再判断新旧。这条规则所有入口共用，防止一次性导入历史内容刷屏。`publishedAfter` 与首次导入上限见上一节。

如果只想从一个固定时间之后开始监控，可在 RSS、网页列表、JSON 配置中设置 `publishedAfter`，例如 `"2026-10-01T00:00:00.000Z"`。必须是完整的 UTC 时间，可省略毫秒；预览、首次和后续采集都只接受**严格晚于**它且发布日期可信的条目，未知日期也会排除。起点当天的单页更新章节若仍使用同一发布日期，之后追加的内容也不会被纳入；选择起点时要把这个限制考虑进去（这类页面用 `preserveUrlFragment: true` 保留章节锚点，或用 `detail` 补日期）。

## 外部推送接口

自己写脚本抓的内容，可以推进站里，走和普通采集一样的判重、精选和归组。

```
POST /api/ingest/items
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json

{
  "sourceId": "my-crawler",
  "sourceName": "我的抓取脚本",
  "items": [
    { "title": "必填", "url": "必填", "publishedAt": "2026-10-01T08:00:00+08:00", "author": "可选" }
  ]
}
```

- `INGEST_TOKEN` 在 `.env` 里设置，至少 16 位；不设置时接口一律返回 401。
- 每次最多 50 条，超过返回 413。每个客户端每分钟能推几次由 `INGEST_RATE_LIMIT` 决定：`docker compose` 默认 10，超过返回 429（带 `Retry-After: 60`）；不用 Docker 时默认不限，前面没有反向代理限流的话在 `.env` 里设上，设成 0 表示不限。
- 返回 `{"ok": true, "created": <新建条数>}`。不是 JSON 对象的条目、缺标题或网址的条目会被跳过，同一请求里重复的网址只取第一条。
- `sourceId` 不存在时会自动建一个 `external` 信源，默认不进公开页面：到后台把它的参与方式改成 `editorial` 才会出现在站上。
- 在后台暂停信源后，推送接口返回 409，不再接收新文章；恢复信源后可以继续推送。
- 条目的 `raw._aihot.backfill` 为 `true` 时按历史回灌处理（不进入“今天”、不推送）。
