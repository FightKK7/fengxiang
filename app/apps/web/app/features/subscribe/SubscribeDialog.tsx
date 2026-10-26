// 订阅弹层：全站唯一的一份纸面（同搜索浮层的做法），把四个 RSS 源摆出来 —— 名称、说明、地址、复制。
// 不做邮箱表单：站上还没有发信服务，填了也发不出去。零圆角、零阴影、细线；只在打开时做 opacity 过渡。
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";
import { EDITION_WHEN } from "@aihot/site";
import { copyText } from "../../lib/clipboard";
import { useModal } from "../../components/ui/modal";
import { closeSubscribe, subscribeOpener, useSubscribeOpen } from "./store";
import "./subscribe.css";

/** One RSS source the sheet offers: what it is, where it lives, and the words the row prints. */
interface Feed {
  path: string;
  name: string;
  desc: string;
}

const FEEDS: readonly Feed[] = [
  { path: "/feed.xml", name: "精选动态", desc: "最近 50 条精选" },
  { path: "/feed/all.xml", name: "全部动态", desc: "近 7 天全部公开动态" },
  { path: "/feed/daily.xml", name: "每日精选", desc: "每天一期，按期归档" },
  { path: "/feed/weekly.xml", name: "周报", desc: "每周更新，汇总上周" },
];

/** 2.4s：够读完「已复制」，又不让状态一直挂着。 */
const COPIED_MS = 2400;

export function SubscribeDialog() {
  const shown = useSubscribeOpen();
  const { pathname } = useLocation();
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useModal({ open: shown, panel, initialFocus: closeButton, returnFocus: subscribeOpener, onClose: closeSubscribe });

  // A route change under the sheet (the reader went back) closes it, like the search overlay does.
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    if (shown) closeSubscribe();
  }, [pathname, shown]);

  // Portalled to the body: the shell's masthead is display:none on phones and on report pages, and the
  // sheet must open from anywhere. Nothing is rendered on the server — the sheet only exists client side.
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!shown) {
      setCopied(null);
      setFailed(null);
      if (resetTimer.current) clearTimeout(resetTimer.current);
    }
  }, [shown]);
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  if (!mounted) return null;

  async function copy(feed: Feed) {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      // The whole URL, not the path: readers paste it into another app.
      await copyText(new URL(feed.path, window.location.origin).href);
      setCopied(feed.path);
      setFailed(null);
      resetTimer.current = setTimeout(() => setCopied(null), COPIED_MS);
    } catch {
      // 失败态是一行文字，不是红色 toast。
      setCopied(null);
      setFailed(feed.path);
    }
  }

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fx-subscribe-title"
      aria-describedby="fx-subscribe-intro"
      tabIndex={-1}
      inert={!shown}
      className={`fx-subscribe${shown ? " fx-subscribe-open" : ""}`}
    >
      <div className="fx-subscribe-inner">
        <header className="fx-subscribe-head">
          <h2 id="fx-subscribe-title" className="fx-subscribe-title">
            订阅风向
          </h2>
          <button ref={closeButton} type="button" className="fx-subscribe-close" onClick={closeSubscribe}>
            关闭 Esc
          </button>
        </header>

        <p id="fx-subscribe-intro" className="fx-subscribe-intro">
          官方一手动态每天更新；{EDITION_WHEN.daily} 发布一期每日精选。RSS 免费、不用注册，复制地址即可订阅。
        </p>

        <ul className="fx-subscribe-list" aria-label="RSS 源">
          {FEEDS.map((feed) => {
            const isCopied = copied === feed.path;
            const didFail = failed === feed.path;
            return (
              <li key={feed.path} className="fx-subscribe-row">
                <div className="fx-subscribe-what">
                  <div className="fx-subscribe-names">
                    <span className="fx-subscribe-name">{feed.name}</span>
                    <span className="fx-subscribe-path">{feed.path}</span>
                  </div>
                  <p className="fx-subscribe-desc">{feed.desc}</p>
                  {didFail && (
                    <p className="fx-subscribe-fail" role="status">
                      复制失败，请手动选中地址复制。
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className={`fx-subscribe-copy${isCopied ? " fx-subscribe-copy-on" : ""}`}
                  data-copied={isCopied ? "true" : undefined}
                  onClick={() => void copy(feed)}
                >
                  {isCopied ? "已复制" : "复制地址"}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="fx-subscribe-foot">
          <span>
            <kbd className="fx-subscribe-kbd">Esc</kbd> 关闭
          </span>
        </p>

        {/* 复制结果对读屏器可见；视觉上的反馈在按钮文字里。 */}
        <span className="sr-only" role="status">
          {copied ? "订阅地址已复制" : failed ? "复制失败，请手动选中地址复制" : ""}
        </span>
      </div>
    </div>,
    document.body,
  );
}
