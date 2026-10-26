// 后台命令结果的小提示：白纸方框 + 1px 线（错误用绛红底），没有圆角与阴影。
// 只由 admin layout 挂一次。
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

type Tone = "ok" | "error" | "info";
interface Item {
  id: number;
  text: string;
  tone: Tone;
}

let listeners: Array<(items: Item[]) => void> = [];
let items: Item[] = [];
let seq = 0;

function emit() {
  for (const l of listeners) l(items);
}

export function toast(text: string, tone: Tone = "info") {
  const id = ++seq;
  items = [...items, { id, text, tone }].slice(-4);
  emit();
  setTimeout(() => {
    items = items.filter((i) => i.id !== id);
    emit();
  }, tone === "error" ? 6500 : 3200);
}

export function Toaster() {
  const [list, setList] = useState<Item[]>([]);
  useEffect(() => {
    listeners.push(setList);
    return () => {
      listeners = listeners.filter((l) => l !== setList);
    };
  }, []);
  return (
    <div className="adm-toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
            className={`adm-toast${t.tone === "error" ? " adm-toast--error" : t.tone === "ok" ? " adm-toast--ok" : ""}`}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
