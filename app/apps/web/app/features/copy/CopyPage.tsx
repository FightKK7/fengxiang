import type { ReactNode } from "react";
import { BackLink } from "../../components/ui/BackLink";
import { Link } from "react-router";
import type { CopyDocument, RenderedCopy } from "../../lib/markdown";
import { PhoneBar } from "../../components/shell/PhoneBar";

/**
 * Legal and policy pages, read like a magazine article: the copy in one 720px column, its facts as an
 * 11px line under the title, and the outline in a hairline rail on the right (phones read one column).
 */
export function CopyPage({ doc, rendered, eyebrow, footer }: { doc: CopyDocument; rendered: RenderedCopy; eyebrow?: ReactNode; footer?: ReactNode }) {
  const facts = (["版本", "生效日期", "运营主体", "联系方式", "备案号"] as const).filter((k) => doc.meta[k]);
  const outline = rendered.outline.length > 2 && (
    <aside className="fxp-read-aside">
      <h2 className="fxp-aside-title">目录</h2>
      <nav aria-label="目录">
        <ol className="fxp-aside-nav">
          {rendered.outline.map((o) => (
            <li key={o.id}>
              <a href={`#${o.id}`}>{o.text}</a>
            </li>
          ))}
        </ol>
      </nav>
    </aside>
  );
  return (
    <>
      <PhoneBar back={{ to: "/more", label: "我的" }} title={doc.title} />
      <div className="fxp-page fxp-read-page">
        <div className="fxp-read">
          <article className="fxp-read-main">
            <BackLink to="/more" />
            <header className="fxp-head">
              {eyebrow && <div className="fxp-eyebrow">{eyebrow}</div>}
              <h1 data-page-title="" className="fxp-title">{doc.title}</h1>
              {doc.intro && <p className="fxp-lead">{doc.intro}</p>}
              {facts.length > 0 && (
                <dl className="fxp-facts">
                  {facts.map((k) => (
                    <div key={k} className="fxp-fact">
                      <dt>{k}</dt>
                      <dd>{doc.meta[k]}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="fxp-head-rule" />
            </header>
            <div className="fxp-prose" dangerouslySetInnerHTML={{ __html: rendered.html }} />
            {footer && <div className="fxp-footlinks">{footer}</div>}
          </article>
          {outline}
        </div>
      </div>
    </>
  );
}

export function LegalFooterLinks({ links, note }: { links: Array<{ to: string; label: string; id?: string }>; note?: string }) {
  return (
    <>
      {links.map((l) => (
        <Link key={l.to} id={l.id} to={l.to} className="fxp-link">{l.label}</Link>
      ))}
      {note && <span className="fxp-foot-note">{note}</span>}
    </>
  );
}
