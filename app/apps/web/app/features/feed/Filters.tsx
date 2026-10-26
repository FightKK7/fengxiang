// Feed filters in the paper's language: one row of 11px tabs under the page's 1px rule (全部 and the
// four categories with their counts, then 一手), a square search field, and the phone's bar, sheet,
// tags and search box. The URL parameters are the same as before: one choice at a time, selecting a
// category clears 一手 and selecting 一手 clears the category.
import { useEffect, useRef, useState } from "react";
import { Form, Link, useNavigation, useSearchParams } from "react-router";
import { CATEGORY_KEYS, CATEGORY_LABELS, CHANNEL_LABELS, type CategoryKey, type ChannelKey } from "@aihot/contracts/taxonomy";
import { CHANGE_KINDS, CHANGE_KIND_LABELS, type ChangeKind } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { IconClose, IconFilter, IconSearch } from "../../components/icons";
import { Sheet, sheetChoice, ChoiceTick } from "../../components/ui/Sheet";
import { IntentLink } from "../../components/ui/IntentLink";
import { BarButton, PhoneBar } from "../../components/shell/PhoneBar";
import { openSearch } from "../search/SearchOverlay";
import { useSearchShortcut } from "../search/shortcut";
import { FxMark } from "../../components/shell/FxMark";

/** Same page with some query parameters changed (paging state dropped). */
function hrefWith(base: string, params: URLSearchParams, patch: Record<string, string | null>) {
  const sp = new URLSearchParams(params);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "") sp.delete(k);
    else sp.set(k, v);
  }
  sp.delete("page");
  sp.delete("cursor");
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * The feed's one filter (全部 and the whole feed alike): none, 一手, or a category. One choice at a time.
 * Older 资讯 / X links still filter; the choice then shows as none.
 */
function filterOptions(base: string, params: URLSearchParams, noneLabel: string) {
  return [
    { key: "all", label: noneLabel, to: hrefWith(base, params, { category: null, channel: null, uncat: null }) },
    { key: "firstParty", label: CHANNEL_LABELS.firstParty, to: hrefWith(base, params, { category: null, channel: "firstParty", uncat: null }) },
    ...CATEGORY_KEYS.map((k) => ({ key: k as string, label: CATEGORY_LABELS[k], to: hrefWith(base, params, { category: k, channel: null, uncat: null }) })),
    // 未分类是分类口径的一部分：分类 tab 的条数加上它，正好是全部（无分类的条目不再隐形）。
    { key: "uncategorized", label: "未分类", to: hrefWith(base, params, { category: null, channel: null, uncat: "1" }) },
  ];
}

function filterKey(category: CategoryKey | null, channel: ChannelKey, uncategorized = false): string {
  return uncategorized ? "uncategorized" : channel === "firstParty" ? "firstParty" : (category ?? "all");
}

/** The paper's tab order, as the front page prints it: 全部, the four categories, 未分类, then 一手. */
const TAB_ORDER = ["all", "product", "commercial", "channel", "gtm", "uncategorized", "firstParty"];
const tabRank = (key: string) => (TAB_ORDER.indexOf(key) < 0 ? TAB_ORDER.length : TAB_ORDER.indexOf(key));

/**
 * The filter row under the page's rule: 11px letterspaced labels, the choice underlined in 2px red, its
 * count after it. Counts are the entries on this page (the front page counts its issue the same way);
 * a count that is not known is left out. 一手 is a channel, not a category, so it has no count.
 */
export function CategoryTabs({ base, category, channel = "all", uncategorized = false, counts, className = "" }: {
  base: string;
  category: CategoryKey | null;
  channel?: ChannelKey;
  uncategorized?: boolean;
  counts?: Record<string, number | null>;
  className?: string;
}) {
  const [params] = useSearchParams();
  const options = filterOptions(base, params, "全部").sort((a, b) => tabRank(a.key) - tabRank(b.key));
  const active = filterKey(category, channel, uncategorized);
  return (
    <nav className={`fx-afilters ${className}`} aria-label="筛选">
      {options.map((o) => {
        const n = counts?.[o.key];
        const on = o.key === active;
        return (
          <IntentLink
            key={o.key}
            to={o.to}
            aria-current={on ? "page" : undefined}
            title={n != null ? `本页 ${n} 条` : undefined}
            className={`fx-afilter${on ? " fx-afilter-on" : ""}`}
          >
            {o.label}
            {n != null && <span className="fx-afilter-count">{n}</span>}
          </IntentLink>
        );
      })}
    </nav>
  );
}

/**
 * 变更类型的一行 tab（沿用分类 tab 的机制：一次只选一个，再点一次取消）。只有源声明的类型才可能
 * 有内容，所以这一行读的是全部类型；条数来自同一个 pool 读数的 total。
 */
export function ChangeKindTabs({ base, changeKind, counts, className = "" }: {
  base: string;
  changeKind: ChangeKind | null;
  counts?: Record<string, number | null>;
  className?: string;
}) {
  const [params] = useSearchParams();
  return (
    <nav className={`fx-afilters ${className}`} aria-label="变更类型">
      {CHANGE_KINDS.map((kind) => {
        const n = counts?.[kind];
        const on = kind === changeKind;
        return (
          <IntentLink
            key={kind}
            to={hrefWith(base, params, { kind: on ? null : kind })}
            aria-current={on ? "page" : undefined}
            title={n != null ? `本页 ${n} 条` : undefined}
            className={`fx-afilter${on ? " fx-afilter-on" : ""}`}
          >
            {CHANGE_KIND_LABELS[kind]}
            {n != null && <span className="fx-afilter-count">{n}</span>}
          </IntentLink>
        );
      })}
    </nav>
  );
}

/**
 * The phone bar of the timeline: the paper's name, the 动态 | 每日精选 switch (filters carry over to 动态),
 * and buttons for the filter sheet and search. 全部动态 is the deep pages of the same timeline, so it
 * sits under 动态 here. 首页不再提供筛选（列表就是全部收录），筛选只在 /all。
 */
export function FeedBar({ base, category, channel, uncategorized = false, changeKind = null, withFilter = true }: {
  base: "/" | "/all" | "/daily"; category: CategoryKey | null; channel: ChannelKey; uncategorized?: boolean; changeKind?: ChangeKind | null;
  /** 首页没有筛选：不渲染筛选按钮，筛选面板也就不用挂。 */
  withFilter?: boolean;
}) {
  const [params] = useSearchParams();
  const [sheet, setSheet] = useState(false);
  const scope = (to: string) => hrefWith(to, params, { q: null, tab: null, search: null });
  const filtered = filterKey(category, channel, uncategorized) !== "all";
  const onTimeline = base === "/" || base === "/all";
  return (
    <>
      <PhoneBar
        leading={
          <Link to="/" aria-label={`${SITE.name} 首页`} className="fx-wordmark-mini flex h-11 items-center pl-2.5 pr-2">
            <FxMark small className="fx-wordmark-mini-mark" />
            风向
          </Link>
        }
        center={
          <nav className="fx-switch" aria-label="看动态或每日精选">
            <IntentLink to={scope("/")} aria-current={onTimeline ? "page" : undefined} className={`fx-switch-link${onTimeline ? " fx-switch-on" : ""}`}>
              动态
            </IntentLink>
            <IntentLink to="/daily" aria-current={base === "/daily" ? "page" : undefined} className={`fx-switch-link${base === "/daily" ? " fx-switch-on" : ""}`}>
              每日精选
            </IntentLink>
          </nav>
        }
        actions={
          <>
            {withFilter && (
              <BarButton label={filtered ? "筛选（已选）" : "筛选"} on={filtered} onClick={() => setSheet(true)}>
                <IconFilter size={21} />
              </BarButton>
            )}
            <SearchButton />
          </>
        }
      />
      {withFilter && <FilterSheet open={sheet} onClose={() => setSheet(false)} base={base} active={filterKey(category, channel, uncategorized)} changeKind={changeKind} />}
    </>
  );
}

/** Phones: the filter as a sheet of options, the one in use ticked; choosing one applies it. */
function FilterSheet({ open, onClose, base, active, changeKind }: { open: boolean; onClose: () => void; base: string; active: string; changeKind: ChangeKind | null }) {
  const [params] = useSearchParams();
  return (
    <Sheet open={open} onClose={onClose} title="筛选">
      <ul className="mx-4 divide-y divide-line">
        {filterOptions(base, params, "不限").map((o) => {
          const on = o.key === active;
          return (
            <li key={o.key}>
              <Link
                to={o.to}
                onClick={onClose}
                aria-current={on ? "true" : undefined}
                className={`-mx-2 px-2 ${sheetChoice(on)}`}
              >
                {o.label}
                {on && <ChoiceTick />}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mx-4 mt-4 mb-1 text-[12px] text-ink-4">变更类型</p>
      <ul className="mx-4 divide-y divide-line">
        {CHANGE_KINDS.map((kind) => {
          const on = kind === changeKind;
          return (
            <li key={kind}>
              <Link
                to={hrefWith(base, params, { kind: on ? null : kind })}
                onClick={onClose}
                aria-current={on ? "true" : undefined}
                className={`-mx-2 px-2 ${sheetChoice(on)}`}
              >
                {CHANGE_KIND_LABELS[kind]}
                {on && <ChoiceTick />}
              </Link>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

/** Phones: the filter and tag in use as square tags under the bar; each one clears itself when tapped. */
export function ActiveFilters({ base, category, channel, uncategorized = false, changeKind = null, tag }: {
  base: string; category: CategoryKey | null; channel: ChannelKey; uncategorized?: boolean; changeKind?: ChangeKind | null; tag: string | null;
}) {
  const [params] = useSearchParams();
  const label = uncategorized ? "未分类" : channel === "firstParty" ? CHANNEL_LABELS.firstParty : category ? CATEGORY_LABELS[category] : null;
  const kindLabel = changeKind ? CHANGE_KIND_LABELS[changeKind] : null;
  if (!label && !kindLabel && !tag) return null;
  return (
    <div className="fx-chips lg:hidden">
      {label && (
        <Link to={hrefWith(base, params, { category: null, channel: null, uncat: null })} aria-label={`取消筛选：${label}`} className="fx-chip">
          只看{label}
          <IconClose size={12} strokeWidth={2} />
        </Link>
      )}
      {kindLabel && (
        <Link to={hrefWith(base, params, { kind: null })} aria-label={`取消筛选：${kindLabel}`} className="fx-chip">
          只看{kindLabel}
          <IconClose size={12} strokeWidth={2} />
        </Link>
      )}
      {tag && (
        <Link to={hrefWith(base, params, { tag: null })} aria-label={`取消标签：${tag}`} className="fx-chip">
          <span className="truncate">#{tag}</span>
          <IconClose size={12} strokeWidth={2} className="shrink-0" />
        </Link>
      )}
    </div>
  );
}

/** Phones: the magnifier in a bar; the search opens over the page with the keyboard up. */
function SearchButton() {
  return (
    <BarButton label="搜索" onClick={(event) => openSearch("", event.currentTarget)}>
      <IconSearch size={21} />
    </BarButton>
  );
}

function useSlashFocus(ref: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref]);
}

/**
 * Desktop search field (GET /all?q=…): a square 1px box at the end of the filter row, with a "/" hint.
 * Zero radius, zero shadow, zero fill; focus darkens the same line.
 */
export function SearchField({ defaultValue = "", keep = {} }: { defaultValue?: string; keep?: Record<string, string | null> }) {
  const shortcut = useSearchShortcut();
  const [value, setValue] = useState(defaultValue);
  const navigation = useNavigation();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setValue(defaultValue), [defaultValue]);
  useSlashFocus(inputRef);
  const searching = navigation.state === "loading" && navigation.location?.pathname === "/all" && !!new URLSearchParams(navigation.location.search).get("q");
  const hidden = Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null));

  return (
    <Form method="get" action="/all" role="search" className="fx-asearch">
      {hidden}
      <label htmlFor="site-search" className="sr-only">
        搜索标题、摘要与正文
      </label>
      <IconSearch size={14} className={`fx-asearch-icon${searching ? " text-ink" : ""}`} />
      <input
        ref={inputRef}
        id="site-search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="搜索标题、摘要…"
        maxLength={200}
        autoComplete="off"
        className="fx-asearch-input"
      />
      {value ? (
        <button
          type="button"
          aria-label="清空"
          onClick={() => {
            setValue("");
            inputRef.current?.focus();
          }}
          className="fx-asearch-clear"
        >
          <IconClose size={12} />
        </button>
      ) : (
        <kbd className="fx-asearch-kbd">{shortcut}</kbd>
      )}
    </Form>
  );
}
