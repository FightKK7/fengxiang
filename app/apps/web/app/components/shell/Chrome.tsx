import { useEffect, useRef, useState } from "react";
import { IconArrowUp } from "../icons";
import { scrollBehavior } from "../../lib/motion";

/**
 * A thin ink line while a navigation is in flight (shown only if it takes a moment). Only opacity moves,
 * 250ms ease-out: the line is placed at 85% at once and fades in/out; no width or transform animation.
 */
export function NavigationProgress({ active }: { active: boolean }) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (active) timer.current = setTimeout(() => setVisible(true), 150);
    else {
      if (timer.current) clearTimeout(timer.current);
      setVisible(false);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active]);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] overflow-hidden" aria-hidden="true">
      <div
        className="h-full bg-ink"
        style={{
          width: visible ? "85%" : active ? "0%" : "100%",
          opacity: visible ? 1 : 0,
          transition: "opacity 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
    </div>
  );
}

/** Square "back to top" button once the reader has scrolled a screen or so (desktop; on phones the tab bar does it). */
export function BackToTop() {
  const [shown, setShown] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > window.innerHeight * 1.2);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // Scrolling up takes the button away while it may still have the focus: drop it so the reader never
  // keeps the keyboard on something they can no longer see.
  useEffect(() => {
    if (!shown && document.activeElement === button.current) button.current?.blur();
  }, [shown]);
  return (
    <button
      ref={button}
      type="button"
      aria-label="回到顶部"
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
      className={`fixed bottom-6 right-6 z-30 hidden size-11 items-center justify-center border-[0.5px] border-line bg-surface text-[11px] text-ink-4 transition-opacity duration-[250ms] ease-out hover:border-ink hover:text-ink lg:flex ${
        shown ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <IconArrowUp size={16} />
    </button>
  );
}
