// Building blocks of the Agent page: panel heads, numbered steps, copyable asks and addresses,
// quiet tip rules, callouts, hairline tables and the fold-away details under each panel.
import type { ReactNode } from "react";
import { CopyButton } from "./CodeBlock";
import { IconChevronDown } from "../../components/icons";

/** A panel's head: the track and version as an 11px eyebrow, the promise, and one line of context. */
export function PanelHead({ label, title, children }: { label: string; title: string; children?: ReactNode }) {
  return (
    <header className="fxp-panel-head">
      <div className="fxp-eyebrow">{label}</div>
      <h2 className="fxp-panel-title">{title}</h2>
      {children && <p className="fxp-panel-lead">{children}</p>}
    </header>
  );
}

/** Numbered steps joined by a hairline. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="fxp-steps">{children}</ol>;
}

export function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <li className="fxp-step">
      <span className="fxp-step-n">{n}</span>
      <div className="min-w-0">
        <h3 className="fxp-step-title">{title}</h3>
        {children && <div className="fxp-step-body">{children}</div>}
      </div>
    </li>
  );
}

/** A section inside a panel, under a 1px ink rule. */
export function Block({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="fxp-block scroll-mt-24">
      <h3 className="fxp-block-title">{title}</h3>
      <div className="fxp-block-body">{children}</div>
    </section>
  );
}

/** A question or instruction to paste into an Agent, with its copy button. */
export function Ask({ text }: { text: string }) {
  return (
    <div className="fxp-ask">
      <span className="min-w-0 flex-1">{text}</span>
      <CopyButton text={text} className="shrink-0" />
    </div>
  );
}

/** One address to copy: the MCP server, a feed. */
export function Address({ url, label = "复制" }: { url: string; label?: string }) {
  return (
    <div className="fxp-copybar">
      <code className="fxp-copybar-code">{url}</code>
      <CopyButton text={url} label={label} className="shrink-0" />
    </div>
  );
}

/** Rules of thumb as a hairline three-column grid. */
export function Tips({ items }: { items: Array<{ title: string; text: ReactNode }> }) {
  return (
    <ol className="fxp-tipgrid">
      {items.map((t, i) => (
        <li key={t.title}>
          <div className="fxp-tip-n">0{i + 1}</div>
          <div className="fxp-tip-title">{t.title}</div>
          <p className="fxp-tip-text">{t.text}</p>
        </li>
      ))}
    </ol>
  );
}

/** A note marked by a 2px ink left rule: an upgrade to make, a deadline. */
export function Callout({ title, children, action }: { title: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="fxp-callout">
      <div className="fxp-callout-main">
        <div className="fxp-callout-title">{title}</div>
        <div className="fxp-callout-body">{children}</div>
      </div>
      {action && <div className="fxp-callout-action">{action}</div>}
    </div>
  );
}

/** Fold-away details under a panel: one hairline per row, open with the chevron. */
export function Details({ items }: { items: Array<{ title: string; body: ReactNode }> }) {
  return (
    <div className="fxp-details">
      {items.map((it) => (
        <details key={it.title}>
          <summary>
            {it.title}
            <IconChevronDown size={14} />
          </summary>
          <div className="fxp-details-body">{it.body}</div>
        </details>
      ))}
    </div>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="fxp-bullets">
      {items.map((it, i) => (
        <li key={i}>
          <span className="min-w-0">{it}</span>
        </li>
      ))}
    </ul>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <code className="fxp-mono">{children}</code>;
}

/** A hairline table; long rows scroll sideways on phones. Group rows name a block of rows. */
export function Table({ head, rows, minWidth = 560 }: { head: string[]; rows: Array<{ group: string } | ReactNode[]>; minWidth?: number }) {
  return (
    <div className="fxp-table-wrap">
      <table className="fxp-table" style={{ minWidth }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) =>
            "group" in r ? (
              <tr key={`g${i}`} className="fxp-rowgroup">
                <td colSpan={head.length}>{r.group}</td>
              </tr>
            ) : (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
