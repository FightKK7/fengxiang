import { useEffect, useRef, useState } from "react";
import { BackLink } from "../components/ui/BackLink";
import { Link, useSearchParams } from "react-router";
import { SITE } from "@aihot/site";
import { Presence } from "../components/ui/Presence";
import { edgeTtl } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { KEYS, lastPage, readJson, writeRaw } from "../lib/local-state";
import { IconCheck, IconClose, IconImage } from "../components/icons";
import { RingMark } from "@aihot/site/brand/Logo.tsx";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";
import { webModules } from "../site-modules";
import "../fx-pages-tools.css";

export const handle: Screen = { tab: "me", name: "反馈" };

export function headers() {
  return edgeTtl(300);
}

export function meta() {
  return pageMeta({ title: "反馈", description: `告诉 ${SITE.name} 哪里可以做得更好：内容、功能、接入或来源方的更正与下架请求。`, path: "/feedback", image: "/og/pages/feedback.png", noindex: true });
}

interface Draft {
  content: string;
  email: string;
  pageUrl: string;
}

function parseDraft(value: unknown): Draft | null {
  if (!value || typeof value !== "object") return null;
  const d = value as Record<string, unknown>;
  return { content: String(d.content ?? ""), email: String(d.email ?? ""), pageUrl: String(d.pageUrl ?? "") };
}

/** Drafts the site's modules keep elsewhere in this browser. */
const otherDrafts = () => webModules().flatMap((m) => (m.feedbackDraft ? [m.feedbackDraft] : []));

function readDraft(): Draft | null {
  let draft = parseDraft(readJson(KEYS.feedbackDraft));
  for (const other of otherDrafts()) draft ??= parseDraft(other.read());
  return draft;
}

/** Saves the draft in this browser, or clears it (null); false when the browser refused. */
function writeDraft(d: Draft | null): boolean {
  const saved = writeRaw(KEYS.feedbackDraft, d && JSON.stringify({ ...d, savedAt: new Date().toISOString() }));
  // Another draft is kept until this one is saved; a submitted draft clears them all.
  if (saved || d === null) for (const other of otherDrafts()) other.clear();
  return saved;
}

const TIPS = ["出问题的页面链接", "你看到什么、想做什么", "截图（请先遮盖）"];

function FeedbackAside() {
  return (
    <>
      <section className="fxp-aside-sec">
        <h2 className="fxp-aside-title">写清楚这几点</h2>
        <ol className="fxp-tips">
          {TIPS.map((t, i) => (
            <li key={t}>
              <span className="fxp-tip-n">{String(i + 1).padStart(2, "0")}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
      </section>
      <section className="fxp-aside-sec">
        <h2 className="fxp-aside-title">来源方</h2>
        <p className="fxp-aside-more">来源方要更正、下架或调整展示，写明文章链接和诉求即可。</p>
      </section>
    </>
  );
}

/**
 * Some phones report a JPEG as image/jpg, or give no type at all: the file name decides then. The
 * server checks the picture's real bytes either way.
 */
function screenshotType(file: File): string {
  const type = file.type.trim().toLowerCase();
  if (type === "image/jpg") return "image/jpeg";
  if (type && type !== "application/octet-stream") return type;
  if (/\.png$/i.test(file.name)) return "image/png";
  if (/\.jpe?g$/i.test(file.name)) return "image/jpeg";
  if (/\.webp$/i.test(file.name)) return "image/webp";
  return type;
}

const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_TEXT = 2000;

export default function FeedbackPage() {
  const [params] = useSearchParams();
  const [draft, setDraft] = useState<Draft>({ content: "", email: "", pageUrl: params.get("from") ?? "" });
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);
  const [state, setState] = useState<{ kind: "idle" | "sending" | "done" | "error"; message?: string; id?: number }>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = readDraft();
    // The page the reader was on before coming here (tracked across in-site navigation, "更多" skipped);
    // a document the browser opened fresh falls back to its referrer.
    const before = params.get("from") ? null : (lastPage() ?? (document.referrer.startsWith(location.origin) ? document.referrer : null));
    const from = before ? new URL(before, location.origin).href : null;
    if (saved) setDraft((d) => ({ ...saved, pageUrl: d.pageUrl || from || saved.pageUrl }));
    else if (from) setDraft((d) => ({ ...d, pageUrl: from }));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => writeDraft(draft.content || draft.email ? draft : null), 400);
    return () => clearTimeout(t);
  }, [draft]);

  useEffect(() => {
    if (!shot) return;
    return () => URL.revokeObjectURL(shot.url);
  }, [shot]);

  const pick = (picked: File | null | undefined) => {
    if (!picked) return;
    const type = screenshotType(picked);
    if (!/^image\/(png|jpeg|webp)$/.test(type)) return setState({ kind: "error", message: "截图需要是 PNG、JPEG 或 WebP。" });
    const file = type === picked.type ? picked : new File([picked], picked.name, { type });
    if (file.size > MAX_IMAGE) return setState({ kind: "error", message: "截图原图不超过 5 MB。" });
    setShot({ file, url: URL.createObjectURL(file) });
    setState({ kind: "idle" });
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) pick(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.content.trim().length < 2) return setState({ kind: "error", message: "请写下反馈内容。" });
    setState({ kind: "sending" });
    try {
      const form = new FormData();
      form.set("content", draft.content);
      form.set("email", draft.email);
      form.set("pageUrl", draft.pageUrl);
      if (shot) form.set("screenshot", shot.file);
      const res = await fetch("/api/site/feedback", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setState({ kind: "error", message: body.detail ?? "提交失败，请稍后再试。" });
      writeDraft(null);
      setState({ kind: "done", id: body.id });
      setDraft({ content: "", email: "", pageUrl: "" });
      setShot(null);
    } catch {
      setState({ kind: "error", message: "网络不太顺，草稿已保存在本机，稍后再提交。" });
    }
  };

  if (state.kind === "done") {
    return (
      <>
        <PhoneBar back={{ to: "/more", label: "我的" }} title="意见反馈" />
        <div className="fxp-page fxp-feedback">
          <div className="fxp-done">
            <span className="fxp-done-icon">
              <IconCheck size={22} />
            </span>
            <h1>收到了，谢谢</h1>
            <p>
              反馈编号 <span className="fxp-mono">#{state.id}</span>，回复时会引用它。
            </p>
            <Link to="/" className="fxp-btn">
              回到全部动态
            </Link>
          </div>
        </div>
      </>
    );
  }

  const canSend = draft.content.trim().length >= 2 && state.kind !== "sending";
  return (
    <>
    <PhoneBar back={{ to: "/more", label: "我的" }} title="意见反馈" />
    <div className="fxp-page fxp-feedback">
      <div className="fxp-read">
        <div className="fxp-read-main">
          <BackLink to="/more" />
          <header className="fxp-head">
            <h1 data-page-title="" className="fxp-title">意见反馈</h1>
            <p className="fxp-lead">{SITE.feedbackLead}</p>
            <div className="fxp-head-rule" />
          </header>

          <form
            onSubmit={submit}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files[0]);
            }}
            className="fxp-form"
          >
            <div className="fxp-sec">
              <label htmlFor="fb-content" className="fxp-label">
                想说点什么？
              </label>
              <div className="fxp-field-wrap">
                <textarea
                  id="fb-content"
                  required
                  rows={9}
                  maxLength={MAX_TEXT}
                  value={draft.content}
                  onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                  placeholder={SITE.feedbackExample}
                  className="fxp-field"
                />
                <span className="fxp-counter">
                  {draft.content.length} / {MAX_TEXT}
                </span>
              </div>
            </div>

            <div className="fxp-sec">
              <label htmlFor="fb-email" className="fxp-label">
                邮箱 <span className="fxp-label-note">（选填）</span>
              </label>
              <input id="fb-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder={SITE.feedbackEmailHint} className="fxp-field" />
            </div>

            <div className="fxp-sec">
              <span className="fxp-label">
                截图 <span className="fxp-label-note">（选填）</span>
              </span>
              {shot ? (
                <div className="fxp-shot">
                  <img src={shot.url} alt="截图预览" />
                  <div className="fxp-shot-meta">
                    <div className="fxp-shot-name">{shot.file.name}</div>
                    <div className="fxp-shot-size">{(shot.file.size / 1024 / 1024).toFixed(2)} MB</div>
                  </div>
                  <button type="button" onClick={() => setShot(null)} className="fxp-x">
                    <IconClose size={12} /> 移除
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} className={`fxp-drop ${dragging ? "fxp-drop-on" : ""}`}>
                  <span className="fxp-drop-icon">
                    <IconImage size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="fxp-drop-title">添加一张问题截图</span>
                    <span className="fxp-drop-hint">粘贴或拖到这里；请先遮盖敏感信息，PNG、JPEG 或 WebP 原图不超过 5 MB</span>
                  </span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            </div>

            <Presence show={state.kind === "error"} enter="anim-notice-in" exit="anim-fade-out" duration={160}>
              <p role="alert" className="fxp-error">
                {state.kind === "error" ? state.message : ""}
              </p>
            </Presence>

            <div className="fxp-form-foot">
              <p className="fxp-form-note">
                请勿提交密钥、证件或无关的敏感信息；提交的内容、邮箱、页面信息和截图会保存在服务器上，仅用于处理反馈。
              </p>
              <button type="submit" disabled={!canSend} className="fxp-btn">
                {state.kind === "sending" && <RingMark className="size-4" spinning />}
                发送反馈
              </button>
            </div>
          </form>
        </div>
        <aside className="fxp-read-aside">
          <FeedbackAside />
        </aside>
      </div>
    </div>
    </>
  );
}
