import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BackLink } from "../components/ui/BackLink";
import { Link, useLocation } from "react-router";
import type { ItemAvailability } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { Presence } from "../components/ui/Presence";
import { edgeTtl } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { exportBundle, importBundle, removeStar, useStarred, type ImportReport } from "../lib/local-state";
import { beijingDate } from "@aihot/contracts/time";
import { fullDateTime } from "../lib/format";
import { IconBookmark, IconDownload, IconUpload, IconClose } from "../components/icons";
import { readSnapshot, restoreAnchor, useSaveOnLeave } from "../lib/restore";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";
import { webModules } from "../site-modules";
import "../fx-pages-tools.css";

export const handle: Screen = { tab: "me", name: "收藏" };

export function headers() {
  return edgeTtl(300);
}

export function meta() {
  return pageMeta({ title: "我的收藏", description: "保存在这台设备上的阅读清单。", path: "/starred", noindex: true });
}

function reportText(r: ImportReport): string {
  const parts = [`新增收藏 ${r.starredAdded} 条`, `已读记录 ${r.readAdded} 条`];
  if (r.starredSkipped || r.readSkipped) parts.push(`有 ${r.starredSkipped + r.readSkipped} 条没导入（超出数量上限或格式不对）`);
  if (r.themeApplied) parts.push("已沿用导入的深浅色设置");
  if (r.fontApplied) parts.push("已沿用导入的字体设置");
  if (r.readFailed) parts.push("已读记录没能保存（浏览器存储已满或不可用）");
  return parts.join("，");
}

export default function StarredPage() {
  const starred = useStarred();
  const [mounted, setMounted] = useState(false);
  const [availability, setAvailability] = useState<Record<string, ItemAvailability>>({});
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setMounted(true), []);

  const starredIds = starred.map((s) => s.id).join(",");
  useEffect(() => {
    if (!mounted || !starredIds) return;
    const controller = new AbortController();
    // Batches of 100: a request line with all 500 ids is longer than the front servers accept.
    const ids = starredIds.split(",");
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));
    Promise.all(
      batches.map((batch) =>
        fetch(`/api/site/items/availability?ids=${encodeURIComponent(batch.join(","))}`, { signal: controller.signal })
          .then((r) => (r.ok ? (r.json() as Promise<Record<string, ItemAvailability>>) : {}))
          .catch(() => ({})),
      ),
    ).then((parts) => {
      if (!controller.signal.aborted) setAvailability(Object.assign({}, ...parts));
    });
    return () => controller.abort();
  }, [mounted, starredIds]);

  // Back from an item: the list renders only after mounting (it lives in this browser), so the
  // position comes back once it is there, by the same card anchor the other lists use.
  const historyKey = useLocation().key;
  useLayoutEffect(() => {
    if (!mounted || starred.length === 0) return;
    const snap = readSnapshot<null>(historyKey);
    if (snap) restoreAnchor(snap.anchor, snap.scrollY);
  }, [mounted, historyKey]);
  useSaveOnLeave(historyKey, () => null);

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportBundle(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${SITE.mcpPrefix}-local-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const report = importBundle(await file.text());
      setNotice({ kind: report.readFailed ? "error" : "ok", text: `导入完成：${reportText(report)}` });
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "导入失败" });
    }
  };

  // Imports from elsewhere that the site's modules offer.
  const importFrom = (run: () => Promise<{ ok: boolean; text: string }>) =>
    run().then(
      (r) => setNotice({ kind: r.ok ? "ok" : "error", text: r.text }),
      (err: Error) => setNotice({ kind: "error", text: err.message }),
    );

  return (
    <div className="fxp-page fxp-starred">
      <PhoneBar back={{ to: "/more", label: "我的" }} title="收藏" />
      <div className="fxp-list-wide">
        <BackLink to="/more" />
        <header className="fxp-star-head">
          <div>
            <h1 data-page-title="" className="fxp-title">收藏</h1>
          </div>
          <div className="fxp-star-actions">
            {webModules().flatMap((m) => m.starredImports ?? []).map((i) => (
              <button key={i.label} type="button" onClick={() => importFrom(i.run)} className="fxp-action">
                {i.label}
              </button>
            ))}
            <button type="button" onClick={() => fileRef.current?.click()} className="fxp-action">
              <IconUpload size={12} /> 导入
            </button>
            {mounted && starred.length > 0 && (
              <button type="button" onClick={doExport} className="fxp-action">
                <IconDownload size={12} /> 导出
              </button>
            )}
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => doImport(e.target.files?.[0])} />
          </div>
        </header>
        <Presence show={!!notice} enter="anim-notice-in" exit="anim-fade-out" duration={160}>
          <div role="status" className={`fxp-notice ${notice?.kind === "error" ? "fxp-notice-error" : ""}`}>
            {notice?.text}
            <button type="button" aria-label="关闭" onClick={() => setNotice(null)} className="fxp-x">
              <IconClose size={12} />
            </button>
          </div>
        </Presence>
        {!mounted ? null : starred.length === 0 ? (
          <div className="fxp-empty">
            <IconBookmark size={20} className="text-ink-4" />
            <p>还没有收藏。点任意一条动态上的收藏，就会出现在这里。</p>
            <Link to="/" className="fxp-link">去看全部动态 →</Link>
          </div>
        ) : (
          <ul className="fxp-star-list">
            {starred.map((s) => {
              const current = availability[s.id];
              const status = current?.status;
              const unavailable = status === "unavailable";
              return (
                <li key={s.id} data-card-key={s.id} className={`fxp-star ${unavailable ? "fxp-star-off" : ""}`}>
                  <div className="fxp-star-meta">
                    <span>{current?.sourceName ?? s.sourceName}</span>
                    {s.publishedAt && <span>{s.publishedAtPrecision === "date" ? beijingDate(s.publishedAt) : fullDateTime(s.publishedAt)}</span>}
                    <span className="fxp-star-saved">
                      收藏于 {fullDateTime(s.savedAt)}
                    </span>
                    <button type="button" aria-label="取消收藏" title="取消收藏" onClick={() => removeStar(s.id)} className="fxp-x">
                      移除
                    </button>
                  </div>
                  <h2 className="fxp-star-title">
                    {unavailable ? s.title : (
                      <Link viewTransition to={`/items/${s.id}`}>{s.title}</Link>
                    )}
                  </h2>
                  {s.summary && <p className="fxp-star-sum">{s.summary}</p>}
                  {unavailable && <p className="fxp-star-note">这条内容已下架；收藏会保留，直到你移除。</p>}
                  {status === "summary-only" && <p className="fxp-star-note fxp-star-note-muted">应来源方要求，这条内容现在只提供摘要。</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
