// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉结构抽取模型这一类收什么、
 * 和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出评论类（教程、观点）：日报写过的事又有评论类的后续报道，只占一行快讯（报道它的信源够多时除外）。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 * tagColor 是飞书推送卡片里跟在标题后面的这一类小标签的颜色（飞书 text_tag 的颜色名）。
 * feedLabel 是分类 RSS 标题里的名字（不写就用 label）。公开接口、RSS 和 MCP 里要把一类并进另一类发布，写在站点设置里（site/site.ts 的 PUBLIC_CATEGORIES）。
 */
export const CATEGORIES = [
  {
    key: "commercial",
    tagColor: "orange",
    label: "商业与资本",
    feedLabel: "商业与资本",
    section: "商业与资本",
    guide: "钱怎么收与公司经营：定价、套餐与计费方式的变化（涨价降价、按量计费、免费额度、打包拆分），以及财报、并购、融资、IPO、裁员与高管任免。2026-10-22 新定位下，这些按「商业动作」收录——官方公告、财报稿就收；定价页 diff、价格监控不进内容源。边界：功能与能力本身的变化归产品与能力；生态与伙伴政策归生态与集成；新地区/新行业方案、销售组织、品牌战役归市场与地区。",
  },
  {
    key: "product",
    tagColor: "indigo",
    label: "产品与能力",
    feedLabel: "产品与能力",
    section: "产品与能力",
    guide: "AI 与企业软件的产品形态变化：AI 产品与能力（Agent、Copilot、AI 原生应用、AI 办公）、模型接入、可用范围与限制，以及企业软件的功能、版本、集成、API 与开放范围。AI 是主线；传统企业软件的变化照收但同样具体程度下降一档。边界：定价与套餐归商业与资本；伙伴、集成生态与应用市场上架归生态与集成；发布会与市场动作归市场与地区；常规小版本、UI、文案、修复不收进精选（留在信息流）。",
  },
  {
    key: "channel",
    tagColor: "turquoise",
    label: "生态与集成",
    feedLabel: "生态与集成",
    section: "生态与市场",
    guide: "生态、集成与伙伴：伙伴计划、生态合作、集成与 API、应用市场上架/下架、OEM/白标、伙伴与分销机制、分成/返点/认证门槛。边界：厂商自己的功能归产品与能力；面向终端客户的销售与市场动作归市场与地区；只有『达成合作』而没有生态或伙伴机制的，按商业与资本或市场与地区判断。",
  },
  {
    key: "gtm",
    tagColor: "violet",
    label: "市场与地区",
    feedLabel: "市场与地区",
    section: "生态与市场",
    guide: "市场与组织：新地区/新行业进入、行业方案与打包、客户大会与市场发布、销售组织与人员调整、标杆客户与案例。边界：生态与伙伴机制归生态与集成；定价与计费归商业与资本；产品本身变化归产品与能力。",
  },
] as const satisfies ReadonlyArray<{ key: string; tagColor: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * 这个行业最受关注的一类发布（AI 行业是「新模型」，每日精选报头的「N 个新模型」按它数）。
 * 新分类下没有单一发布类型：产品能力、定价打包、生态集成、资本组织各有边界，权重也不同，
 * 所以设成 null，每日精选报头就不显示这个数。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = null;

/** 周报月报的总述可以直接写、不必在报道里找到出处的行业通用词（小写）。站名会自动算进去。 */
export const PLAIN_TERMS: readonly string[] = [
  "ai", "agent", "agents", "copilot", "llm", "sdk", "saas", "api", "crm", "erp", "hcm", "bi", "gtm", "plg", "arr", "mrr", "nrr", "acv", "cac", "ltv", "ceo", "cfo", "ipo", "sso", "sla",
];

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = [
  "ai_product", // AI 产品、能力、Agent/Copilot、AI 原生应用与 AI 办公
  "enterprise_software", // 传统企业软件的产品、功能、版本、集成、API 与可用范围
  "pricing_packaging", // 定价、套餐、计费、免费额度、增购项
  "capital", // 融资、并购、财报、IPO、重大合同
  "org_people", // 高管任免、裁员、组织调整
  "market_expansion", // 新地区/新行业进入、生态合作、伙伴机制、应用市场上架
  "case_landing", // 有具体规模/成本/做法/结果的行业落地与客户案例
  "routine_update", // 常规功能上新、小版本、UI、文案、多语言、修复
  "marketing_or_opinion", // 营销活动、大会预告、白皮书、无事实的观点/预测/榜单
] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。最后一个“其他”是没有合适标签时的兜底。 */
export const CATEGORY_TAGS = [
  "产品与能力", "定价与打包", "资本与财报", "生态与集成", "市场与地区", "组织与人事", "落地案例", "其他",
] as const;

/** 可选的主题标签（与 topics.json 里 field 组的方向一一对应）。 */
export const TOPIC_TAGS = [
  "定价与打包", "生态与伙伴", "AI 产品与 Agent", "资本与并购", "财报与经营", "生态与集成", "市场与地区", "区域与行业化",
] as const;

/** 可选的实体标签（公司、平台）。 */
export const ENTITY_TAGS = [
  "飞书", "企业微信", "钉钉", "金山办公", "用友", "金蝶", "Slack", "Notion",
  "Salesforce", "Microsoft 365", "Google Workspace", "Monday.com", "Asana", "Atlassian", "Zoom", "HubSpot",
  "Cursor", "Replit", "Vercel", "Zapier", "Anthropic", "OpenAI", "Google AI", "DSH", "DeepSeek",
] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  // 分类标签的近义写法（模型写近义词时归一）
  定价: "定价与打包", 价格: "定价与打包", 涨价: "定价与打包", 降价: "定价与打包", 调价: "定价与打包", 计费: "定价与打包",
  套餐: "定价与打包", 商业化: "定价与打包", 收费: "定价与打包", 免费额度: "定价与打包",
  财报: "资本与财报", 融资: "资本与财报", 并购: "资本与财报", 收购: "资本与财报", 营收: "资本与财报", 资本: "资本与财报", 上市: "资本与财报",
  功能: "产品与能力", 版本: "产品与能力", 发布: "产品与能力", 产品: "产品与能力", 更新: "产品与能力", 上线: "产品与能力",
  渠道: "生态与集成", 代理: "生态与集成", 经销: "生态与集成", 分销: "生态与集成", 伙伴: "生态与集成", 生态: "生态与集成", 合作: "生态与集成",
  
  集成: "生态与集成", 上架: "生态与集成", 应用市场: "生态与集成", ISV: "生态与集成", isv: "生态与集成", API: "生态与集成", api: "生态与集成",
  GTM: "市场与地区", gtm: "市场与地区", 市场: "市场与地区", 销售: "市场与地区", 营销: "市场与地区", 市场进入: "市场与地区", 出海: "市场与地区",
  人事: "组织与人事", 高管: "组织与人事", 裁员: "组织与人事", 组织: "组织与人事", 任命: "组织与人事",
  落地: "落地案例", 案例: "落地案例",
  // 主题标签的近义写法
  "AI商业化": "AI 产品与 Agent", "AI 商业化": "AI 产品与 Agent", "AI功能商业化": "AI 产品与 Agent", AI功能: "AI 产品与 Agent",
  "AI 功能": "AI 产品与 Agent", "AI 定价": "定价与打包", "AI 计费": "定价与打包",
  价格与打包: "定价与打包", 打包: "定价与打包", 定价策略: "定价与打包", 定价与打包: "定价与打包",
  渠道与生态: "生态与伙伴", 代理政策: "生态与伙伴", 渠道政策: "生态与伙伴", 经销商: "生态与伙伴",
  生态与伙伴: "生态与伙伴",
  并购与收购: "资本与并购", 资本与并购: "资本与并购",
  财报与资本: "财报与经营", 财报季: "财报与经营", 经营: "财报与经营", 财报与经营: "财报与经营",
  集成与生态: "生态与集成", 生态与集成: "生态与集成", 集成生态: "生态与集成", 平台生态: "生态与集成",
  销售与GTM: "市场与地区", GTM与销售: "市场与地区", 销售组织: "市场与地区", 
  区域扩张: "区域与行业化", 行业化: "区域与行业化", 垂直行业: "区域与行业化", 本地化: "区域与行业化", 区域与行业化: "区域与行业化",
  市场与地区: "市场与地区",
};

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * aliases 给结构抽取模型看；orgNames 是这家公司发消息时开头用的组织名（公司、母公司、团队），
 * 在它自己的主题页上读者知道说的是谁，可以省去；otherNames 是公司的其他称呼（官方账号名、子品牌、产品名）。
 * 所有这些名字都用来认出说的是哪家公司，比如把事实的主体对到发布方。
 *
 * 词典不变量（别名只能「多认」，不能「抢」）：任何实体的 id、name 都不可以出现在另一个实体的
 * aliases / orgNames / otherNames 里；同一个写法也不可以同时属于两家公司。否则 entityIdentity()
 * 会因为匹配到多家而返回 null（Slack 与 Salesforce 曾经互相把对方写进 orgNames/otherNames）。
 * 新增公司或别名后跑 `node industry/check-entities.ts` 自检。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; orgNames?: string[]; otherNames?: string[] }> = {
  feishu: { name: "飞书", displayTag: "飞书", aliases: ["飞书", "Feishu", "Lark"], orgNames: ["飞书", "字节跳动", "ByteDance"], otherNames: ["Lark Suite", "飞书开放平台"] },
  wecom: { name: "企业微信", displayTag: "企业微信", aliases: ["企业微信", "WeCom", "WeChat Work"], orgNames: ["企业微信", "腾讯", "Tencent"], otherNames: ["企业微信团队"] },
  dingtalk: { name: "钉钉", displayTag: "钉钉", aliases: ["钉钉", "DingTalk"], orgNames: ["钉钉", "阿里巴巴", "Alibaba", "阿里云"], otherNames: ["DingTalk"] },
  wps: { name: "金山办公", displayTag: "金山办公", aliases: ["金山办公", "WPS", "Kingsoft Office"], orgNames: ["金山办公", "WPS", "金山软件", "Kingsoft"], otherNames: ["WPS Office", "WPS 365", "WPS AI"] },
  yonyou: { name: "用友", displayTag: "用友", aliases: ["用友", "Yonyou"], orgNames: ["用友", "用友网络", "Yonyou"], otherNames: ["YonBIP", "YonSuite"] },
  kingdee: { name: "金蝶", displayTag: "金蝶", aliases: ["金蝶", "Kingdee"], orgNames: ["金蝶", "金蝶国际", "Kingdee"], otherNames: ["金蝶云", "苍穹"] },
  // Slack 的母公司是 Salesforce，但 "Salesforce" 是另一家的 id/name，不能放进这里「抢」身份。
  slack: { name: "Slack", displayTag: "Slack", aliases: ["Slack"], orgNames: ["Slack"], otherNames: ["Slack HQ", "Slackbot"] },
  notion: { name: "Notion", displayTag: "Notion", aliases: ["Notion"], orgNames: ["Notion", "Notion Labs"], otherNames: ["Notion AI"] },
  // 同理：Salesforce 的产品矩阵里有 Slack，但 "Slack" 属于 slack 这家，不能写进这里。
  salesforce: { name: "Salesforce", displayTag: "Salesforce", aliases: ["Salesforce", "Agentforce"], orgNames: ["Salesforce"], otherNames: ["Sales Cloud", "Service Cloud"] },
  "microsoft-365": { name: "Microsoft 365", displayTag: "Microsoft 365", aliases: ["Microsoft 365", "M365", "Office 365", "Copilot", "Microsoft Teams"], orgNames: ["Microsoft", "微软"], otherNames: ["Office", "Outlook", "Teams"] },
  "google-workspace": { name: "Google Workspace", displayTag: "Google Workspace", aliases: ["Google Workspace", "G Suite", "Google Docs", "Gmail"], orgNames: ["Google", "谷歌"], otherNames: ["Google Meet", "Google Chat"] },
  monday: { name: "Monday.com", displayTag: "Monday.com", aliases: ["Monday.com", "monday.com", "monday"], orgNames: ["Monday.com"], otherNames: ["monday work management"] },
  asana: { name: "Asana", displayTag: "Asana", aliases: ["Asana"], orgNames: ["Asana"], otherNames: ["Asana AI"] },
  atlassian: { name: "Atlassian", displayTag: "Atlassian", aliases: ["Atlassian", "Jira", "Confluence"], orgNames: ["Atlassian"], otherNames: ["Jira", "Confluence", "Atlassian Intelligence"] },
  zoom: { name: "Zoom", displayTag: "Zoom", aliases: ["Zoom"], orgNames: ["Zoom"], otherNames: ["Zoom Workplace", "Zoom AI Companion"] },
  hubspot: { name: "HubSpot", displayTag: "HubSpot", aliases: ["HubSpot"], orgNames: ["HubSpot"], otherNames: ["Breeze"] },
  // 2026-10-22 起采集池里已经有一批 AI 原生公司的官方源（Cursor / Replit / Vercel / Zapier / Anthropic /
  // OpenAI / Google AI），首页厂商筛选按这里的 id 认主体。别名只写不会与上面 16 家互相抢的写法。
  cursor: { name: "Cursor", displayTag: "Cursor", aliases: ["Cursor"], otherNames: ["Cursor AI"] },
  replit: { name: "Replit", displayTag: "Replit", aliases: ["Replit"] },
  vercel: { name: "Vercel", displayTag: "Vercel", aliases: ["Vercel"] },
  zapier: { name: "Zapier", displayTag: "Zapier", aliases: ["Zapier"] },
  anthropic: { name: "Anthropic", displayTag: "Anthropic", aliases: ["Anthropic", "Claude"], otherNames: ["Claude Code"] },
  openai: { name: "OpenAI", displayTag: "OpenAI", aliases: ["OpenAI", "ChatGPT"] },
  // Google 的两条线分开：办公套件是 google-workspace，模型/研究是 google-ai（orgNames 不写 Google，
  // 那个写法属于 google-workspace）。
  "google-ai": { name: "Google AI", displayTag: "Google AI", aliases: ["Google AI", "Gemini", "DeepMind"], otherNames: ["Google DeepMind"] },
  // DSH 是 DeepSeek 的 Agent 产品（DeepSeek Harness）。它不写 orgNames：组织名「DeepSeek」属于
  // deepseek 这家，写进来会违反别名唯一，entityIdentity() 会把两家都认成 null。
  dsh: { name: "DSH", displayTag: "DSH", aliases: ["DSH"], otherNames: ["DeepSeek Harness"] },
  deepseek: { name: "DeepSeek", displayTag: "DeepSeek", aliases: ["DeepSeek", "深度求索"], orgNames: ["DeepSeek"], otherNames: ["DeepSeek-V3", "DeepSeek-R1", "DeepSeek-V4"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。这里同时收产品名和母公司名：企服摘要最容易张冠李戴的地方，
 * 是把微软、谷歌、Salesforce 的天气都算到某个具体产品上。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "feishu", name: "飞书", patterns: [/飞书|feishu|\blark\b/i] },
  { id: "wecom", name: "企业微信", patterns: [/企业微信|wecom|wechat\s?work/i] },
  { id: "dingtalk", name: "钉钉", patterns: [/钉钉|dingtalk/i] },
  { id: "wps", name: "金山办公 / WPS", patterns: [/金山办公|金山软件|\bwps\b|kingsoft/i] },
  { id: "yonyou", name: "用友", patterns: [/用友|yonyou/i] },
  { id: "kingdee", name: "金蝶", patterns: [/金蝶|kingdee/i] },
  { id: "slack", name: "Slack", patterns: [/\bslack\b/i] },
  { id: "notion", name: "Notion", patterns: [/\bnotion\b/i] },
  { id: "salesforce", name: "Salesforce", patterns: [/salesforce|agentforce|\bsfdc\b/i] },
  { id: "microsoft-365", name: "Microsoft 365", patterns: [/microsoft\s?365|\bm365\b|office\s?365|\bcopilot\b|microsoft\s?teams|微软|microsoft/i] },
  { id: "google-workspace", name: "Google Workspace", patterns: [/google\s?workspace|g\s?suite|google\s?docs|gmail|google\s?meet|谷歌|google/i] },
  { id: "monday", name: "Monday.com", patterns: [/monday\.com|\bmonday\s+work\s+management\b/i] },
  { id: "asana", name: "Asana", patterns: [/\basana\b/i] },
  { id: "atlassian", name: "Atlassian", patterns: [/atlassian|\bjira\b|confluence/i] },
  { id: "zoom", name: "Zoom", patterns: [/\bzoom\b/i] },
  { id: "hubspot", name: "HubSpot", patterns: [/hubspot/i] },
  { id: "cursor", name: "Cursor", patterns: [/\bcursor\b/i] },
  { id: "replit", name: "Replit", patterns: [/\breplit\b/i] },
  { id: "vercel", name: "Vercel", patterns: [/\bvercel\b/i] },
  { id: "zapier", name: "Zapier", patterns: [/\bzapier\b/i] },
  { id: "anthropic", name: "Anthropic", patterns: [/anthropic|\bclaude\b/i] },
  { id: "openai", name: "OpenAI", patterns: [/openai|chatgpt/i] },
  { id: "google-ai", name: "Google AI", patterns: [/deepmind|\bgemini\b|google\s?ai/i] },
  // DSH 放在 DeepSeek 前面：先认产品名（deepseek harness / dsh），剩下的 DeepSeek 才算到公司头上。
  { id: "dsh", name: "DSH", patterns: [/\bdsh\b|deepseek\s+harness/i] },
  { id: "deepseek", name: "DeepSeek", patterns: [/deepseek|深度求索/i] },
];

/** 这些域名上的文章，发布方就是对应的公司（帮助中心、社区等托管平台不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "feishu", domains: ["feishu.cn", "larksuite.com"] },
  { entityId: "wecom", domains: ["work.weixin.qq.com", "wecom.qq.com"] },
  { entityId: "dingtalk", domains: ["dingtalk.com", "dingtalk.cn"] },
  { entityId: "wps", domains: ["wps.cn", "kingsoft.com", "wps.com"] },
  { entityId: "yonyou", domains: ["yonyou.com", "yonyoucloud.com"] },
  { entityId: "kingdee", domains: ["kingdee.com"] },
  { entityId: "slack", domains: ["slack.com", "slackhq.com"] },
  { entityId: "notion", domains: ["notion.com", "notion.so"] },
  { entityId: "salesforce", domains: ["salesforce.com", "developer.salesforce.com", "ideas.salesforce.com"] },
  { entityId: "microsoft-365", domains: ["microsoft.com", "office.com", "techcommunity.microsoft.com"] },
  // 只认 Google Workspace 自己的更新博客与产品站，不把整个 blog.google 算成 Workspace 发布方。
  { entityId: "google-workspace", domains: ["workspaceupdates.googleblog.com", "workspace.google.com"] },
  { entityId: "monday", domains: ["monday.com"] },
  { entityId: "asana", domains: ["asana.com"] },
  { entityId: "atlassian", domains: ["atlassian.com"] },
  { entityId: "zoom", domains: ["zoom.com", "zoom.us", "support.zoom.com"] },
  { entityId: "hubspot", domains: ["hubspot.com"] },
  { entityId: "cursor", domains: ["cursor.com"] },
  { entityId: "replit", domains: ["replit.com", "blog.replit.com"] },
  { entityId: "vercel", domains: ["vercel.com"] },
  { entityId: "zapier", domains: ["zapier.com"] },
  { entityId: "anthropic", domains: ["anthropic.com"] },
  { entityId: "openai", domains: ["openai.com"] },
  { entityId: "google-ai", domains: ["blog.google", "deepmind.google"] },
  { entityId: "deepseek", domains: ["deepseek.com"] },
];

/** 原文里的这些写法也算提到了对应公司。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "microsoft-365", pattern: /@Microsoft365\b/i },
  { entityId: "wecom", pattern: /@企业微信(?:团队|小助手)?\b/ },
];
