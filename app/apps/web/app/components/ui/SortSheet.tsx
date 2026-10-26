// 排序面板：点「排序」后专门用来调顺序的列表——整行拖动，或点右侧 ↑ ↓ 移动；「完成」关闭，顺序实时保存。
// 桌面是居中对话框、手机是底部弹层（复用 Sheet：焦点锁定、Esc、遮罩关闭都在那里）。
// 设计系统：零圆角零阴影、6 色、7 级字阶，列表用细线分行，不加装饰。
import { useState } from "react";
import { Sheet } from "./Sheet";

export interface SortItem {
  id: string;
  label: string;
  /** 行尾的计数（如厂商条数）；不传就不显示。 */
  count?: number;
}

export function SortSheet({ open, onClose, title, items, onChange, onReset }: {
  open: boolean;
  onClose: () => void;
  title: string;
  items: SortItem[];
  /** 每次移动就回调新顺序（由调用方落盘），不等「完成」。 */
  onChange: (ids: string[]) => void;
  /** 「恢复默认」；不传就不显示这个按钮。 */
  onReset?: () => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    const ids = items.map((item) => item.id);
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    onChange(ids);
  };

  return (
    <Sheet open={open} onClose={onClose} title={title} centered>
      <p className="px-5 pb-1 text-[12.5px] text-ink-4">拖动整行换位置，或用右侧 ↑ ↓ 按钮</p>
      <ol className="px-3">
        {items.map((item, index) => (
          <li
            key={item.id}
            draggable
            onDragStart={(event) => {
              setDragging(item.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", item.id);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (dragging) move(items.findIndex((row) => row.id === dragging), index);
            }}
            onDragEnd={() => setDragging(null)}
            className={`flex min-h-12 cursor-grab items-center gap-3 border-t border-line-soft px-2 py-2 active:cursor-grabbing ${index === 0 ? "border-t-0" : ""} ${dragging === item.id ? "opacity-35" : ""}`}
          >
            <span className="mono w-5 shrink-0 text-[12.5px] text-ink-4">{String(index + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1 truncate text-[16px] text-ink">{item.label}</span>
            {item.count !== undefined && <span className="num shrink-0 text-[11px] text-ink-4">{item.count}</span>}
            <span className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => move(index, index - 1)}
                disabled={index === 0}
                aria-label={`把 ${item.label} 上移`}
                className="grid size-9 place-items-center text-[14px] text-ink-3 disabled:opacity-25"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, index + 1)}
                disabled={index === items.length - 1}
                aria-label={`把 ${item.label} 下移`}
                className="grid size-9 place-items-center text-[14px] text-ink-3 disabled:opacity-25"
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex items-center justify-end gap-5 border-t border-line px-5 py-4">
        {onReset && (
          <button type="button" onClick={onReset} className="text-[12.5px] text-ink-4 hover:text-ink">
            恢复默认
          </button>
        )}
        <button type="button" onClick={onClose} className="text-[12.5px] font-semibold text-ink">
          完成
        </button>
      </div>
    </Sheet>
  );
}
