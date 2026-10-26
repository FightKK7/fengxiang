// Search over the page: a full paper sheet — white, one hairline per row, a serif title row, zero
// radius and zero shadow. Opens from any bar's magnifier, from the masthead's 搜索, or with ⌘K / Ctrl-K,
// with the keyboard already up (the field is focused inside the same tap, which iOS requires). Searches
// 全部动态 (/all?q=…); below the field: this browser's recent searches, themes to browse, what is hot now.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Form, Link, useLocation, useNavigation } from "react-router";
import type { SearchSuggestions } from "@aihot/contracts/site";
import { IconClose } from "../../components/icons";
import { inNav } from "../../components/shell/nav";
import { addRecentSearch, clearRecentSearches, useRecentSearches } from "../../lib/local-state";
import { useModal } from "../../components/ui/modal";
import { useSearchShortcut } from "./shortcut";

// One overlay for the whole site, opened from any bar.
let overlay: HTMLDivElement | null = null;
let field: HTMLInputElement | null = null;
const opener: { current: HTMLElement | null } = { current: null };
let open = false;
let openedAt = "default";
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
function setOpen(next: boolean) {
  open = next;
  for (const l of listeners) l();
}

/** Opens the search over the page; call it from the tap itself so the keyboard comes up. */
export function openSearch(query = "", trigger?: HTMLElement) {
  if (!open) opener.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  openedAt = (window.history.state as { key?: string } | null)?.key ?? "default";
  if (overlay && field) {
    overlay.inert = false; // closed, it is inert, and nothing inside an inert overlay takes focus
    field.value = query;
    field.focus({ preventScroll: true });
  }
  setOpen(true);
}

let suggestions: Promise<SearchSuggestions> | null = null;

/** Share only an ongoing read; the HTTP cache owns freshness and failed reads can be retried. */
function loadSuggestions() {
  suggestions ??= fetch("/api/site/search/suggestions")
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<SearchSuggestions>;
    })
    .finally(() => {
      suggestions = null;
    });
  return suggestions;
}

export function SearchOverlay() {
  const shown = useSyncExternalStore(subscribe, () => open, () => false);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // The field is uncontrolled: openSearch() fills and focuses it inside the tap, before React renders.
  const [hasText, setHasText] = useState(false);
  const recent = useRecentSearches();
  const navigation = useNavigation();
  const { key } = useLocation();
  const [more, setMore] = useState<Awaited<ReturnType<typeof loadSuggestions>> | null>(null);
  // 底部的「随时打开」按平台写：Mac ⌘K，Windows/Linux Ctrl K。
  const shortcut = useSearchShortcut();

  useModal({ open: shown, panel, initialFocus: input, returnFocus: opener, onClose: close });

  useEffect(() => {
    overlay = panel.current;
    field = input.current;
    return () => {
      overlay = null;
      field = null;
      setOpen(false);
    };
  }, []);

  // ⌘K / Ctrl-K opens it from anywhere; a second press closes it. Esc closes through useModal.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      if (open) close();
      else openSearch("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!shown) return;
    let active = true;
    setHasText(!!input.current?.value);
    setMore(null);
    void loadSuggestions()
      .then((value) => {
        if (active) setMore(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [shown]);

  // Legacy links that ask for the search field (/all?search=1) open it once on arrival, with the query
  // they carry. Opened here rather than in the page: this component's store subscription is already in
  // place, so the page it opens over is the one that asked for it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("search") !== "1") return;
    openSearch(params.get("q") ?? "");
  }, []);

  // Leaving for the results (or anywhere) closes the search.
  useEffect(() => {
    if (navigation.state === "loading" && open) close();
  }, [navigation.state]);
  useEffect(() => {
    if (openedAt !== key && open) close();
  }, [key]);

  function close() {
    input.current?.blur();
    setOpen(false);
  }

  const companies = (more?.topics ?? []).filter((t) => t.group === "company").slice(0, 6);
  const hot = more?.hot ?? [];

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label="搜索"
      tabIndex={-1}
      inert={!shown}
      className={`fx-search transition-opacity duration-[250ms] ease-[var(--ease-out)] ${shown ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <div className="fx-search-inner">
        <header className="fx-search-head">
          <h2 className="fx-search-title">搜索风向</h2>
          <button type="button" className="fx-search-close" onClick={close}>
            关闭 Esc
          </button>
        </header>

        <Form
          method="get"
          action="/all"
          role="search"
          onSubmit={(e) => {
            const q = input.current?.value.trim() ?? "";
            if (!q) {
              e.preventDefault();
              return;
            }
            addRecentSearch(q);
          }}
          className="fx-search-form"
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">搜索公司、产品或主题</span>
            <input
              ref={input}
              name="q"
              type="search"
              onInput={(e) => setHasText(!!e.currentTarget.value)}
              tabIndex={shown ? 0 : -1}
              placeholder="搜索公司、产品或主题"
              maxLength={200}
              autoComplete="off"
              enterKeyHint="search"
              className="fx-search-input w-full"
            />
          </label>
          {hasText && (
            <button
              type="button"
              aria-label="清空"
              tabIndex={shown ? 0 : -1}
              onClick={() => {
                if (input.current) input.current.value = "";
                setHasText(false);
                input.current?.focus();
              }}
              className="fx-search-clear"
            >
              清空
            </button>
          )}
          <button type="submit" tabIndex={shown ? 0 : -1} className="fx-search-submit">
            搜索
          </button>
        </Form>
        {recent.length > 0 && (
          <section className="fx-search-sec" aria-label="最近搜索">
            <div className="fx-search-sec-head">
              <h3 className="fx-search-sec-title">最近搜索</h3>
              <button type="button" onClick={clearRecentSearches} className="fx-search-sec-more">
                清除
              </button>
            </div>
            <div>
              {recent.map((q) => (
                <Link key={q} to={`/all?q=${encodeURIComponent(q)}`} onClick={() => addRecentSearch(q)} className="fx-search-row">
                  <span className="fx-search-row-trunc">{q}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {companies.length > 0 && (
          <section className="fx-search-sec" aria-label="按主题找">
            <div className="fx-search-sec-head">
              <h3 className="fx-search-sec-title">按主题找</h3>
            </div>
            <div>
              {companies.map((t) => (
                <Link key={t.slug} viewTransition to={`/topics/${t.slug}`} className="fx-search-row">
                  <span className="fx-search-row-trunc">{t.name}</span>
                </Link>
              ))}
              {inNav("/topics") && (
                <Link viewTransition to="/topics" className="fx-search-row">
                  <span className="fx-search-row-trunc">全部 {more!.topics.length} 个主题 →</span>
                </Link>
              )}
            </div>
          </section>
        )}

        {hot.length > 0 && (
          <section className="fx-search-sec" aria-label="正在热议">
            <div className="fx-search-sec-head">
              <h3 className="fx-search-sec-title">正在热议</h3>
            </div>
            <div>
              {hot.map((h) => (
                <Link key={h.to} viewTransition to={h.to} className="fx-search-row">
                  <span className={`fx-search-row-n${h.rank === 1 ? " fx-search-row-n1" : ""}`}>{h.rank}</span>
                  <span className="fx-search-row-trunc">{h.title}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="fx-search-foot">
          <span>
            <kbd className="fx-kbd">↵</kbd> 搜索
          </span>
          <span>
            <kbd className="fx-kbd">Esc</kbd> 关闭
          </span>
          <span>
            <kbd className="fx-kbd">{shortcut}</kbd> 随时打开
          </span>
        </div>
      </div>
    </div>
  );
}
