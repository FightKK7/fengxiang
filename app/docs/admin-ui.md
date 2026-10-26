# 后台版式层（admin UI）

> 状态：当前有效 · 最后核对：2026-10-26（对照 `app/apps/web/app/features/admin/{ui.tsx,admin.css,format.ts}`、`app/apps/web/app/routes/admin/*`）
>
> 本文是后台页面改写的契约：页面只允许用这里的组件与 `.adm-*` 类，不允许再写颜色、字号、圆角、阴影。
> 设计真源：现行站点 `apps/web/app/fengxiang.css` 与后台实现 `apps/web/app/features/admin/admin.css`。

---

## 一、五条硬规则

1. **只有 6 个色值**：纸 `#ffffff`、墨 `#111110`、正文 `#4e4e47`、元信息 `#6b6b63`、细线 `#e2e0da`、绛红 `#c8102e`。
   后台另有状态色 `--amber`（`#8a6a35`，不稳/降级）与 `--ok`（`#2f5d47`，正常），**只用于状态文字与状态点**，不进入正文、标题、链接；审计按契约放行并单独统计（`--strict-palette` 可退回严格 6 色）。`admin.css` 里只出现这 6 个 hex，其余全部走 `var(--ink)` 一类 token；页面不写 `text-[#xxx]`、`bg-white/50`。
2. **七级字阶**：`38 / 26 / 19 / 16 / 14 / 12.5 / 11`。没有第八级（12、13、13.5、15、20、22、24 一律改掉）。`admin.css` 当前实际用到 11 / 12.5 / 14 / 16 / 19 / 26（38 只留给读者面报头）。
3. **零圆角、零阴影**：不允许 `rounded-*`、`ring-*`、`shadow-*`、渐变（`admin.css` 无任何 `box-shadow`；`border-radius` 只有 `0` 和按钮 spinner 的 `9999px`——架构测试白名单要求圆形用 `9999px`，不用 `50%`）。分区只用 1px 细线（`var(--line)`）与 2px 黑线（区块 `.adm-sec` 的上框）。
4. **红色只标编辑判断与告警**：草稿/未发刊、下架、失败、需要处理、删除。链接、导航、普通按钮、选中态一律墨色（选中用墨色加粗 + 2px 绛红下划线，见 `.adm-tab-on::after`）。
5. **文案纯中文、字距归零**：中文标签 `letter-spacing: 0`；报头「风向」的 `.16em` 是唯一例外。技术专名（RSS / JSON / token / Tier / CSV）保留原样；不出现 worker、compose、service_prices、payload、`content.sweep` 之类框架黑话。

---

## 二、路由与命名（14 个页面）

| 路径 | 导航/页面名 | 说明 |
|---|---|---|
| `/admin` | — | 302 → `/admin/sources` |
| `/admin/reports` | **出刊台** | 期列表 + 详情：今日判断 / 选稿排序 / 风向观察（可选） / 排序依据 / 保存草稿 / 丢弃草稿 / 发刊 / 重新生成 / 回滚 / 版本历史 / 操作记录 / 本期成本 |
| `/admin/content` | **条目** | 条目搜索 |
| `/admin/sources` | **信源** | 列表 / 搜索 / 类型 / 健康 / 启用筛选 / 批量暂停启用删除 / 行内暂停恢复 |
| `/admin/feedback` | **反馈** | 读者反馈 |
| `/admin/runs` | **运行** | 进程心跳 / 队列 / 定时任务 / 失败分组重试 / 回执送达 / 任务时间线；每 20 秒刷新 |
| `/admin/models` | **模型** | 模型切换 / 用量费用 / 历史 |
| `/admin/selectbench` | **精选对照** | 选稿基准评测（原 SelectBench） |
| `/admin/settings` | **设置** | 关于页二维码 / 推送目标 / 付费上限 |
| `/admin/audit` | **审计记录** | 操作记录，按操作前缀 / 对象筛选 |
| `/admin/content/:id` | 条目详情 | 完整链路：来源 / 发现 / 修订 / 模型回执与费用 / 发布 / 人工覆盖 / 归组 / 投递 / 操作记录 |
| `/admin/sources/new` | 新建信源 | 类型 + 采集配置 JSON + 预览抓取 |
| `/admin/sources/:id` | 信源详情 | 配置编辑 / 预览抓取 / 立即采集 / 暂停恢复 / 最近抓取与条目 / 重发布状态 |
| `/admin/selectbench/:runId` | 精选对照 · 单次运行 | 模型 × 用例逐条对比 |
| `/admin/crawlers` | 专用抓取 | 模块页（`modules/crawlers`），模板（代码）+ 实例（数据库）；当前不在主导航，直达 URL |

命名口径：**出刊台 / 条目 / 精选对照 / 模型**（旧名「内容诊断」「SelectBench」「模型与评测」不再出现在界面上）。导航分组：内容组（出刊台、条目、信源、反馈）在前，系统组（运行、模型、精选对照、设置、审计记录）在后，用 1px 竖线分隔；不再显示分组名。

---

## 三、组件（`features/admin/ui.tsx`）

页面组件名与 props 保持原样，只是外观换成了新风向版式；**优先用组件，不要自己拼 div**。

| 组件 | 用法 | 外观 |
|---|---|---|
| `<AdminPage title meta actions>` | 每页一个；`title` 宋体 26；`meta` 只放标题下的一行**数据**（ID/来源/时间/窗口），不是导语；`actions` 右侧按钮组 | 标题 + 数据副行 + 1px 收底；**没有眉线、没有导语** |
| `<Card title right pad scrollable>` | 页面里每个 2px 黑线区块；`right` 放 11px 元信息；表格区块 `pad={false}`；长列表 `scrollable`（表头吸顶，max-height 480） | 2px 上框 + 12.5px 粗标题 |
| `<Stats><Stat label value hint tone /></Stats>` | 一条数据带（4 个指标并排），不要再用 grid 包 Stat；`tone` 只有 ok/warn/bad | 1px 上下框 + 竖细分隔 |
| `<DataTable rows columns rowKey empty onRowClick dense />` | 所有表格；`columns[].align="right"` 数字右对齐；行可点传 `onRowClick` | 11px 表头 + 1px 墨色表头线 + 细线行 |
| `<Badge tone>` | `ok / warn / bad / muted / accent / info`；11px 方角描边标签 | 不用药丸 |
| `<Dot tone>` | 5×5 方块状态点 | 和刊头朱点同一种标记 |
| `<Button tone size busy />` / `<ButtonLink>` | `tone`: primary（墨底）/ secondary（墨线）/ danger（红）/ ghost；`size`: sm/md；`busy` 时禁用并转圈；原生 `disabled` 生效 | 方角、30px 高 |
| `<Field label hint>` + `<Input>` / `<Textarea>` / `<Select>` | 表单；`Select` 默认全宽，内联筛选可加 `className="adm-select--auto"` | 1px 方角输入框 |
| `<Checkbox indeterminate>` | 批量选择；表头用 `indeterminate` 表达「本页半选」；勾选列加 `className="adm-pick"` | 14px 方框，选中墨底白勾 |
| `<FilterChips param options>` | 页签式筛选（当前项粗体 + 绛红 2px 下划线 + 11px 计数），不是药丸 | 和读者面筛选一致 |
| `<Pager page hasMore>` | 列表分页 | 上下页按钮 + 「第 N 页」 |
| `<Empty>` | 空态 | 14px 元信息、居中 |
| `<KV items={[[k,v],…]}>` | 详情键值 | 11px 标签 / 14px 值 |
| `<Json value label collapsed>` | 原始数据折叠块 | 1px 线 + 11px mono |
| `<ReasonDialog open title description confirmLabel danger requireReason busy onClose onSubmit>` | 所有人工写操作前的原因弹窗；`onSubmit(reason)` 返回 false 不关闭；可传 `children` 放额外控件 | 2px 上框方窗 |
| `<Time at>` / `healthTone(h)` / `num/money/pct/bj/ago`（`features/admin/format.ts`） | 时间、健康度、格式化 | 时间 tabular；**`money(n, currency)` 按币种给 `$` / `¥`**：费用调用必须传币种（见 §五） |

**页内布局**：只用 Tailwind 的布局类（`flex`、`grid`、`gap-*`、`mt-*`、`max-w-*`、`hidden lg:block`），不要用它的颜色/字号/圆角类。

`.adm-*` 类分两类（页面只读、不改）：

- **页面会直接用的**：`.adm-toolbar` / `.adm-toolbar-grow` / `.adm-toolbar-side` / `.adm-mono` / `.adm-num` / `.adm-nowrap` / `.adm-link` / `.adm-link-muted` / `.adm-pre-wrap` / `.adm-select--auto` / `.adm-pick` / `.adm-table`（手写 `<table>` 可用）。
- **壳层与共用件（`layout.tsx` / `ui.tsx` / 登录页归 Lead）**：`.adm-shell` / `.adm-wrap` / `.adm-mast` / `.adm-mast-links` / `.adm-mast-meta` / `.adm-wordmark` / `.adm-wordmark-sub` / `.adm-rules` / `.adm-navbar` / `.adm-nav` / `.adm-nav-link` / `.adm-nav-on` / `.adm-nav-count` / `.adm-nav-count--bad` / `.adm-nav-sep` / `.adm-page` / `.adm-head` / `.adm-head-row` / `.adm-head-main` / `.adm-title` / `.adm-page-meta` / `.adm-actions` / `.adm-body` / `.adm-sec*` / `.adm-figs` / `.adm-fig*` / `.adm-table*` / `.adm-tag*` / `.adm-dot*` / `.adm-btn*` / `.adm-field` / `.adm-label` / `.adm-hint` / `.adm-input` / `.adm-textarea` / `.adm-select` / `.adm-checkbox` / `.adm-tabs` / `.adm-tab*` / `.adm-pager` / `.adm-empty` / `.adm-kv` / `.adm-json` / `.adm-overlay*` / `.adm-dialog*` / `.adm-toast*` / `.adm-login*` / `.adm-tone-ok|warn|bad`。

---

## 四、字号映射（旧 → 新）

| 旧写法 | 新写法 |
|---|---|
| `text-[38px]` | 不用（只有读者面报头） |
| `text-[22px] text-[24px] text-[26px]`（页面标题） | 交给 `<AdminPage>`（26 / 手机 19） |
| `text-[19px] text-[20px]`（区块大标题/大数字） | `text-[19px]`（宋体标题由 `h2/h3` 自带） |
| `text-[16px] text-[15px]` | `text-[16px]`（正文强调；标题下的导语已取消） |
| `text-[13px] text-[13.5px] text-sm`（正文、表格单元格） | `text-[14px]` |
| `text-[12.5px] text-xs`（次级：说明、表头旁注） | `text-[12.5px]` |
| `text-[12px] text-[11.5px] text-[11px]`（元信息、标签、表头） | `text-[11px]` |
| `font-mono text-[11.5px]`（ID/代码） | 直接 `<span className="adm-mono">` |
| `text-accent` 做链接 | `.adm-link`（墨色 + hover 下划线）；红色只给告警与编辑判断 |
| `bg-hot-soft text-hot`（告警底） | 改成 `<Badge tone="bad">` 或 `text-[color:var(--hot)]` 纯文字 |
| `rounded-* / ring-* / shadow-* / bg-surface / bg-bg-sunk` | 删除；区块用 `<Card>`，行悬停由 `.adm-table` 负责 |

数字（金额、计数、耗时、日期）一律 `adm-num` / `<Time>`，保证 tabular 对齐。

---

## 五、2026-10-22 晚批次对契约的影响（提交 `ebe9605`）

| 变化 | 契约含义 | 代码位置 |
|---|---|---|
| **费用按币种显示** | 金额不再默认人民币：`money(n, currency)` 按币种给 `$` / `¥`；后台的模型用量与回执费用调用一律传 `currency ?? "USD"`（服务单价与回执以 USD 计）；**不要**再在金额后面拼 ` USD` 文本 | `features/admin/format.ts`、`routes/admin/models.tsx`、`routes/admin/content-item.tsx`、`backend/src/admin/content.ts`、`contracts/src/admin.ts` |
| **运行页任务中文名** | 「队列」「任务」列显示中文名：`TASK_LABEL`（20 项）/`QUEUE_LABEL`（11 项）；认不出的保留原名，`title` 悬停显示内部代号；页面不直接暴露 `content.sweep`/`reports.compose` 一类代号 | `routes/admin/runs.tsx` |
| **出刊台期号补零** | 期号统一三位：第 001 期（`padStart(3, "0")`），与读者面/导航一致 | `routes/admin/reports.tsx:282` |
| **暂停源「立即采集」禁用** | 按钮 `disabled={!s.enabled}` + 说明 title；后端 `fetchNow()` 对 `enabled=false` 返回 409「信源已暂停：恢复后才能采集。」，前端禁用只是第一层 | `routes/admin/source.tsx`、`backend/src/admin/sources.ts` |
| **审计页筛选空串** | 筛选表单未填字段提交为空串 = 不筛选（后端 `trim()` 后转 `null`），不再出现「只填操作前缀返回 0 行」 | `backend/src/audit.ts` `listAudit()` |
| **信源「暂停」筛选口径** | 「暂停」按启用状态筛：`health=paused` → `NOT enabled`（2026-10-23 库内 59 个源、启用 20，暂停 39 条）；其余健康值仍按 `health` 列。健康度（ok/degraded/failing）与启用状态是两列，不要混用 | `backend/src/admin/sources.ts` `listSources()` |
| 事件后续空列表 | 已知事件没有精选后续时接口返回 200 空列表（`{items:[],more:false}`），页面不再出 404 console 错 | `backend/src/publication/followups.ts` |

---

## 六、文案口径（改成「我们自己的内容」）

| 位置 | 旧 | 新 |
|---|---|---|
| 导航/页面 | 内容诊断 | **条目** |
| 导航/页面 | SelectBench | **精选对照** |
| 导航/页面 | 模型与评测 | **模型** |
| 导航 | 内容（分组名） | 不再显示分组名；内容组在前，系统组在后，用 1px 竖线分隔 |

框架黑话改成人话（保留真正的技术专名）：

| 旧 | 新 |
|---|---|
| `worker` / `compose` | 出刊任务 / 生成报告 |
| `service_prices` | 单价表 |
| `tokens` | token（技术专名保留，输入 / 输出 token） |
| `payload` / `jsonb` | 原始数据 / 字段 |
| `scripts/eval-selection.ts` | 评估脚本（精选对照自动导入） |
| `cron` / `job` | 定时任务（运行页列头「任务」；具体任务名用中文，见 §五） |
| `report_drafts` | 草稿 |
| `nav-counts` 等接口名 | 不出现在界面上 |
| `content.sweep` / `reports.compose` / `sources.fetch` 等队列/任务代号 | 中文名（认不出的保留原名，悬停看代号） |

页面不写导语。标题 + 数据 + 结构要能自己解释这页；确实解释不了的，按下方「说明预算」放进允许的位置。

### 说明预算（2026-10-22 起执行）

> 原则：**Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.**
> 能靠位置、分组、顺序、状态、数据本身表达清楚的，不用第二行小字再说一遍。

- **页面级导语一律不写**（`AdminPage` 已没有 subtitle/kicker）。标题下最多一行数据（ID、来源、时间、窗口、最近检查），不是句子。
- **区块右上角只放三类**：状态（草稿/已发刊/失败计数）、钱的口径（估算/账单）、动作链接（全部失败信源）。其余说明性文案删掉。
- **字段 hint 只放两类**：看不见的约束（1–1440、≤200 字、创建后不可改）、看不见的副作用（修改会重新发布、留空=沿用）。复述 label 的 hint 一律删。
- **空态一句话 + 一个动作**，不解释背景。
- **允许且必须保留说明的位置**：危险/不可逆确认弹窗（删除、下架、发刊、回滚）、金额口径（含币种）、上限/格式约束、空态的下一步、编辑判断与品牌文案（读者面）。
- **删之前自检**：删掉这句，用户还知道这页干什么 / 现在什么状态 / 下一步点哪里吗？三个都“是”才删。
- 新增页面/区块的 review 清单：`kicker` 0、导语 0、区块右上说明句 0、字段 hint 只留约束/副作用。

## 七、自检（每个页面 Agent 都要做）

dev stack 已在跑：web `http://localhost:3000`、api `:3001`。管理员密码在 `app/.env` 的 `ADMIN_PASSWORD`。用 Playwright 在 1440 / 1166 / 390 三档打开后台页面并截图，按下面的清单人工检查。

检查清单：

- [ ] 1440 / 1166 / 390 三个宽度都看过截图，页面不横向溢出，表格能滚。
- [ ] 页面里搜不到：`rounded-`、`ring-`、`shadow-`、`text-[1` 后跟非法字号、`text-accent`、`bg-surface`、`bg-bg-sunk`。
- [ ] 中文字距为 0；标题是宋体；所有数字 `tabular-nums`。
- [ ] 红色只出现在：草稿/未发刊、下架、失败、降级、删除、编辑判断。
- [ ] 金额带对币种（USD `$` / 人民币 `¥`），不出现 ` USD` 后缀。
- [ ] 点击自己负责页面上的主要按钮/筛选/弹窗，console 无 error、接口无 4xx/5xx（dev 库操作可回滚：草稿可丢弃，别发刊真实内容；暂停源的「立即采集」应禁用）。
- [ ] 页面文案无 worker/compose/service_prices/SelectBench/内容诊断/队列代号。
- [ ] 期号显示为三位（第 001 期）。
- [ ] 当前验收基线：1440 / 1166 / 390 三档截图均通过上面的检查。

---

## 八、写权限

- 每个页面 Agent 只改自己任务里列出的路由文件；`features/admin/ui.tsx`、`admin.css`、`routes/admin/layout.tsx`、`admin-login.tsx`、`toast.tsx` 归 Lead。
- 需要新组件/新类，先 `send_message` 给 lead，不要自己加 CSS、不要改共享组件。
- `app/` 里有并行会话的未提交改动（读者面/流水线/采集），不要 git add/commit。
