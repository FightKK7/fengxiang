import { useState } from "react";
import { copyText } from "../../lib/clipboard";
import { IconCheck, IconCopy } from "../../components/icons";

export function CopyButton({ text, label = "复制", className = "" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await copyText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={`fxp-copy ${copied ? "fxp-copy-on" : ""} ${className}`}
      aria-label={copied ? "已复制" : label}
    >
      <span key={copied ? "ok" : "copy"} className={copied ? "anim-swap-in" : ""}>
        {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
      </span>
      {copied ? "已复制" : label}
    </button>
  );
}

/** Code panel: a hairline box, a 1px head, and the code on the quiet paper; `lang` is only a label. */
export function CodeBlock({ code, lang, title, wrap = false, className = "" }: { code: string; lang?: string; title?: string; wrap?: boolean; className?: string }) {
  return (
    <div className={`fxp-code ${className}`}>
      <div className="fxp-code-head">
        <span>{title ?? lang ?? ""}</span>
        <CopyButton text={code} />
      </div>
      <pre className={wrap ? "fxp-code-wrap" : undefined}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
