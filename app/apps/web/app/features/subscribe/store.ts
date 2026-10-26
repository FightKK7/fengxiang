// The site's one subscribe sheet, opened from the masthead's 订阅 (and, later, the rail's button).
// Module level like openSearch: the trigger is captured at the tap so closing can return focus to it.
import { useSyncExternalStore } from "react";

let open = false;
/** The element that opened the sheet; useModal focuses it again when the sheet closes. */
export const subscribeOpener: { current: HTMLElement | null } = { current: null };

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function setOpen(next: boolean) {
  open = next;
  for (const listener of listeners) listener();
}

/** Opens the subscribe sheet; call it from the tap itself so the trigger can take focus back on close. */
export function openSubscribe(trigger?: HTMLElement) {
  if (!open) {
    subscribeOpener.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  }
  setOpen(true);
}

export function closeSubscribe() {
  setOpen(false);
}

export function useSubscribeOpen() {
  return useSyncExternalStore(subscribe, () => open, () => false);
}
