import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";
import { titled } from "../lib/seo";

export const handle: Screen = { tab: "featured" };

export function meta() {
  return [{ title: titled("搜索繁忙") }, { name: "robots", content: "noindex, follow" }];
}
export function headers() {
  return { "Cache-Control": "no-store" };
}

const RETRY_AFTER_SECONDS = 5;
const SEARCH_PARAMS = ["q", "tag", "channel", "category", "page", "tab"];

/** The busy page after an overloaded search: the same paper, the same search can be tried again shortly. */
export default function SearchBusy() {
  const { pathname, search } = useLocation();
  const [wait, setWait] = useState(RETRY_AFTER_SECONDS);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const kept = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(search)) if (SEARCH_PARAMS.includes(k)) kept.append(k, v);
  const base = pathname.startsWith("/all") ? "/all" : "/";
  const retry = kept.toString() ? `${base}?${kept}` : base;
  const hasSearch = kept.has("q");
  return (
    <>
      <PhoneBar back={{ to: base, label: "全部动态" }} />
      <div className="fx-busy" aria-live="polite">
        <div className="fx-search-kicker">搜索</div>
        <h1 className="fx-busy-title mt-2">搜索有点忙</h1>
        <p className="fx-busy-p">现在搜索的人比较多，请 {RETRY_AFTER_SECONDS} 秒以后重试。列表浏览不受影响。</p>
        <div className="fx-busy-links">
          {hasSearch &&
            (wait > 0 ? (
              <span>{wait} 秒后可重试</span>
            ) : (
              <Link to={retry} className="fx-link">
                重试这次搜索
              </Link>
            ))}
          <Link to="/all" className="fx-link">
            浏览全部动态
          </Link>
          <Link to="/" className="fx-link">
            回到首页
          </Link>
        </div>
      </div>
    </>
  );
}
