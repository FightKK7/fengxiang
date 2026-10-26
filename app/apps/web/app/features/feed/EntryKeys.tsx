// The issue's entries walked from the keyboard: j goes to the next one, k to the previous, Enter opens
// the entry's own page, Esc drops the focus. Mounted by the front page (task-4); it only listens while
// mounted, and never while a text field or an open dialog has the keyboard.
//
// The entry itself is the focus target: the front page tags every <article> with data-fx-entry and
// tabindex={-1}, so the browser keeps the in-page link's own behaviour and this protocol only moves focus.
import { useEffect } from "react";
import { reducedMotion } from "../../lib/motion";
import "./keys.css";

/** The entries the protocol walks; the front page tags each of its <article>s with this. */
const ENTRY = "[data-fx-entry]";

/** Fields that own the keys while they have focus. */
const FIELD = "input, textarea, select, [contenteditable='true']";

/** An open dialog owns the keyboard: the search overlay and the subscribe sheet both mark themselves. */
function inOpenDialog(): boolean {
  return !!document.querySelector("[role='dialog']:not([inert]), [aria-modal='true']:not([inert])");
}

function focusEntry(entry: HTMLElement) {
  entry.focus({ preventScroll: true });
  entry.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
}

function openEntry(entry: HTMLElement) {
  // Only the entry's own page: the source link at the bottom points off site and is not what Enter means.
  const link = entry.querySelector<HTMLAnchorElement>('a[href^="/items/"]') ?? entry.querySelector<HTMLAnchorElement>('a[href^="/"]');
  if (link) {
    link.click();
    return true;
  }
  // 同源批次组没有自己的条目页：Enter 展开它，和点击标题一致。
  const expand = entry.querySelector<HTMLButtonElement>("button[aria-expanded]");
  if (expand) {
    expand.click();
    return true;
  }
  return false;
}

export function EntryKeys() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof HTMLElement && event.target.closest(FIELD)) return;
      if (inOpenDialog()) return;

      const entries = [...document.querySelectorAll<HTMLElement>(ENTRY)];
      if (!entries.length) return;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const current = active?.closest<HTMLElement>(ENTRY) ?? null;
      const at = current ? entries.indexOf(current) : -1;
      const key = event.key.toLowerCase();

      if (key === "j" || key === "k") {
        event.preventDefault();
        // From no entry yet: j starts at the first, k at the last.
        const next = key === "j" ? entries[at < 0 ? 0 : Math.min(at + 1, entries.length - 1)] : entries[at < 0 ? entries.length - 1 : Math.max(at - 1, 0)];
        focusEntry(next);
        return;
      }
      if (!current) return;
      if (event.key === "Enter" && !event.repeat && current === active) {
        if (openEntry(current)) event.preventDefault();
        return;
      }
      if (event.key === "Escape" && current === active && !event.repeat) {
        event.preventDefault();
        active.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
