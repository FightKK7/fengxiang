// 条目详情页 · 杂志文章版式：单栏 760px、无评分、无右轨、无工具条。
// 阅读顺序：公司 · 分类 · 事件时间（右端「阅读原文」）→ 宋体标题 → 摘要 → 2px 黑线 → 判断 → 原文 → 上一篇/下一篇。
// 判断排在原文前面：全文可能很长，读者先看「这对谁意味着什么」，再回原文核对。
// 来源只说一次：出处就是右上角的「阅读原文」（带一次域名）；不再另排「来源 / 引用这条 / 收藏」。
import { useEffect, useState } from "react";
import { BackLink } from "../../components/ui/BackLink";
import { Link, useNavigate } from "react-router";
import { type ItemSummary, type Pricing, type SiteItemDetail, type StoryFollowupsResponse, type StoryRef } from "@aihot/contracts/site";
import { CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import { ITEM_COPY } from "@aihot/site";
import { getTranslationEnabled, markRead, setTranslationEnabled, useTranslationEnabled } from "../../lib/local-state";
import { StarButton } from "../../components/ui/StarButton";
import { ReaderRail } from "../../components/ui/ReaderRail";
import { eventTimeLabel, relativeTime } from "../../lib/format";
import { ArticleBody } from "./ArticleBody";
import "./item.css";
import "../pricing.css";

type Neighbor = Pick<ItemSummary, "id" | "title">;

/** G2 定价对照表：与首页同一个版式（样式在 features/pricing.css）。 */
function PricingBlock({ pricing }: { pricing: Pricing }) {
  return (
    <section className="fx-pricing mt-8" aria-label="定价变化">
      <div className="fx-pricing-head">
        <span className="fx-pricing-tag">计费变化</span>
        {pricing.effectiveAt && <span className="fx-pricing-when">{`自 ${pricing.effectiveAt} 起`}</span>}
      </div>
      <div className="fx-pricing-table" role="table" aria-label="旧价与新价对照">
        {pricing.rows.map((row, index) => (
          <div className="fx-pricing-row" role="row" key={`${row.label}-${index}`}>
            <span className="fx-pricing-lab" role="rowheader">
              {row.label}
            </span>
            <span className="fx-pricing-old" role="cell">
              {row.before}
            </span>
            <span className="fx-pricing-arrow" aria-hidden="true">
              →
            </span>
            <span className="fx-pricing-new" role="cell">
              {row.after}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** 相对时间只在客户端算：页面有服务端缓存，水合时差会让服务端写下的「3 小时前」当场过期。 */
function RelativeTime({ at }: { at: string }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    setLabel(relativeTime(at));
  }, [at]);
  // 超过 30 天时 relativeTime 只能退回日期，和前面的主时间重复，就不再显示。
  return label && !/^\d{4}-\d{2}-\d{2}$/.test(label) ? <span className="fx-meta-rel">{label}</span> : null;
}

/**
 * 事件时间：这条信息发生（源发布）的时间；源没给或不可信时，读取层已退回首次发现时间。
 * 全页只出现这一个时钟，不写「北京时间 / 本站收录」这类名字；源只标日期时就只显示日期。
 */
function EventTime({ item }: { item: SiteItemDetail }) {
  return (
    <span className="fx-meta-time">
      <time dateTime={item.timelineAt}>{eventTimeLabel(item)}</time>
      {item.timelineAtPrecision !== "date" && <RelativeTime at={item.timelineAt} />}
    </span>
  );
}

/** 译文开关：正文是预生成的逐块对照时才出现；关掉只隐藏 .fx-tr，正文仍是同一份 HTML。 */
function TranslationSwitch({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={enabled} aria-label="显示中文译文" className="fx-tr-toggle" onClick={onToggle}>
      <span className="fx-tr-toggle-text">译文</span>
      <span className="fx-tr-toggle-track" aria-hidden="true">
        <span className="fx-tr-toggle-thumb" />
      </span>
    </button>
  );
}

export function ItemArticle({ item, newer, older }: { item: SiteItemDetail; newer: Neighbor | null; older: Neighbor | null }) {
  useEffect(() => {
    markRead(item.id);
  }, [item.id]);

  // 预生成的原文／译文对照由后端拼好，前端只决定显示或隐藏 .fx-tr，不在这里翻译。
  const translationEnabled = useTranslationEnabled();
  // 首帧由 head 里的内联脚本按存储值先标好；之后（含另一个标签页改过偏好）跟着开关同步。
  useEffect(() => {
    document.documentElement.setAttribute("data-fx-translation", getTranslationEnabled() ? "on" : "off");
  }, [translationEnabled]);
  const bodyHtml = item.bodyLanguage === "zh" ? (item.body?.zh ?? item.body?.original) : (item.body?.original ?? item.body?.zh);
  const category = item.category ? CATEGORY_LABELS[item.category] : null;
  const vendor = item.channel === "x" && item.x ? item.x.authorName : vendorOf(item);
  const host = hostOf(item.links.original);
  // 没有站内正文时的说法按原因分三种：来源只授权摘要、定价页变更（变化已在上面列出）、其余外部页面。
  const bodyFallback =
    item.readingMode === "summary-only"
      ? "应来源方要求，站内只保留摘要与原文出处。"
      : item.pricing
        ? "这条来自定价页：上面是页面上的旧价与现价。"
        : "本条消息暂未获取原文，暂只提供摘要与来源。";

  return (
    <article className="fx-reading">
      {/* 桌面右缘的阅读工具（收藏 / 字号 / 译文）；手机不显示这条轨，收藏回标题行、译文开关在正文上方。 */}
      <ReaderRail
        item={item}
        bilingual={!!item.bilingual}
        translationEnabled={translationEnabled}
        onToggleTranslation={() => setTranslationEnabled(!translationEnabled)}
      />
      <BackLink to={item.selected ? "/" : "/all"} phone />

      <header className="mt-7">
        {/* 一行说清：谁（公司）· 什么事（分类）· 什么时候（事件时间）；右端是唯一的原文出口。 */}
        <div className="fx-meta">
          <span className="fx-meta-left">
            {vendor && <span className="fx-meta-org">{vendor}</span>}
            {category && <span className="fx-meta-cat">{category}</span>}
            <EventTime item={item} />
          </span>
          <a href={item.links.original} target="_blank" rel="noopener noreferrer" className="fx-meta-link">
            阅读原文{host && <span className="fx-meta-host">（{host}）</span>} ↗
          </a>
        </div>

        <div className="fx-h1-row mt-4">
          <h1 data-page-title="" className="serif text-balance text-[26px] font-semibold leading-[1.5] tracking-[0.01em] text-ink">
          {item.title}
          </h1>
          <StarButton item={item} size={17} className="fx-star-title" />
        </div>

        {item.summary && item.summary.replace(/\s+/g, " ").trim() !== item.title.trim() && (
          <p className="serif fx-lede mt-6 max-w-[680px] text-balance leading-[1.9] text-ink-3">{item.summary}</p>
        )}

        {item.pricing && <PricingBlock pricing={item.pricing} />}
      </header>

      {/* 标题区与正文之间：一条 2px 墨线。 */}
      <div className="mt-8 border-t-2 border-ink" />

      {/* 判断在前：全文可能很长，读者先看到「这对谁意味着什么」，再往原文核对。 */}
      {item.reason && (
        <section aria-labelledby="fx-verdict" className="mt-7 max-w-[680px] border-t-[0.5px] border-line pt-4">
          <h2 id="fx-verdict" className="fx-verdict-label">
            {ITEM_COPY.reasonLabel}
          </h2>
          <p className="serif fx-verdict-body mt-2 leading-[1.9] text-ink">{item.reason}</p>
        </section>
      )}

      {/* 原文：能站内展示就整篇排在这里；不能时只说明原因，原文入口已在标题行右上。 */}
      {item.bilingual ? (
        <section className={item.reason ? "fx-body mt-10" : "fx-body mt-7"} aria-label="原文">
          <div className="fx-body-tools">
            <TranslationSwitch enabled={translationEnabled} onToggle={() => setTranslationEnabled(!translationEnabled)} />
          </div>
          {/* 同一份预拼 HTML：关译文只是让 .fx-tr 不显示，不重新请求、不换一份正文。 */}
          <div className={translationEnabled ? "mt-5" : "mt-5 fx-tr-off"}>
            <ArticleBody html={item.bilingual.html} />
          </div>
          {!item.bilingual.complete && <p className="fx-body-note">译文尚未完整，未译段落保留原文。</p>}
          <p className="fx-body-note">原文版权归原作者所有；摘要、译文与「风向观察」由风向整理，引用请注明出处。</p>
        </section>
      ) : bodyHtml ? (
        <section className={item.reason ? "fx-body mt-10" : "fx-body mt-7"} aria-label="原文">
          <div className="mt-5">
            <ArticleBody html={bodyHtml} />
          </div>
          <p className="fx-body-note">原文版权归原作者所有；摘要、译文与「风向观察」由风向整理，引用请注明出处。</p>
        </section>
      ) : (
        <p className={item.reason ? "fx-body-fallback mt-10" : "fx-body-fallback mt-7"}>{bodyFallback}</p>
      )}

      {item.story && <FollowupLine story={item.story} currentId={item.id} />}

      <Pager newer={newer} older={older} />
    </article>
  );
}

/** 返回：有站内历史就后退，直接打开则回精选/全部。 */

/** 厂商：条目主题里能对上标题/来源的那个（公司主题），否则取第一个主题；没有主题时退回来源名。 */
function vendorOf(item: SiteItemDetail): string | null {
  const names = item.topics.map((topic) => topic.name).filter(Boolean);
  if (names.length === 0) return item.source.name;
  const haystack = `${item.title} ${item.summary ?? ""} ${item.source.name} ${item.links.original}`.toLowerCase();
  const matched = names.find((name) => haystack.includes(name.toLowerCase()));
  return matched ?? names[0] ?? null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * 同一事件的其它进展：只在真有后续时排一行入口，没有就整行不排。
 * 「事件」是框架里的归组概念，读者看不懂，所以文案直接说「同一件事还有 N 条进展」。
 */
function FollowupLine({ story, currentId }: { story: StoryRef; currentId: string }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setCount(null);
    fetch(`/api/site/stories/${encodeURIComponent(story.publicId)}/followups`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: StoryFollowupsResponse | null) => {
        if (!body || controller.signal.aborted) return;
        const items = body.items.filter((entry) => entry.representative.id !== currentId);
        setCount(items.length + (body.more ? 1 : 0));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [story.publicId, currentId]);

  // 加载中与「没有后续」都不排：单篇报道的事件不该出现一个点进去只有它自己的入口。
  if (!count) return null;
  return (
    <p className="mt-5 text-[12.5px] leading-[1.7]">
      <Link
        to={`/story/${story.publicId}`}
        viewTransition
        className="text-ink-3 underline decoration-line underline-offset-2 transition-colors hover:text-ink hover:decoration-ink"
      >
        {`同一件事还有 ${count} 条进展 →`}
      </Link>
    </p>
  );
}

function Pager({ newer, older }: { newer: Neighbor | null; older: Neighbor | null }) {
  if (!newer && !older) return null;
  return (
    <nav aria-label="上一篇与下一篇" className="mt-12 grid grid-cols-2 gap-6 border-t-2 border-ink pt-5">
      <div className="min-w-0">
        {newer && (
          <>
            <div className="text-[11px] leading-[1.6] text-ink-4">上一篇</div>
            <Link
              to={`/items/${newer.id}`}
              viewTransition
              className="serif mt-1.5 block text-balance text-[16px] font-semibold leading-[1.5] text-ink transition-colors hover:text-ink-3"
            >
              {newer.title}
            </Link>
          </>
        )}
      </div>
      <div className="min-w-0 text-right">
        {older && (
          <>
            <div className="text-[11px] leading-[1.6] text-ink-4">下一篇</div>
            <Link
              to={`/items/${older.id}`}
              viewTransition
              className="serif mt-1.5 block text-balance text-[16px] font-semibold leading-[1.5] text-ink transition-colors hover:text-ink-3"
            >
              {older.title}
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
