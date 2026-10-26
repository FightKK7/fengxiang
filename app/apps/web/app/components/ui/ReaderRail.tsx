// 条目页右缘的阅读工具：收藏 / 字号 / 译文三枚同尺寸方角按钮竖排成一轨，右缘与报头对齐。
// 字号点开左侧的滑动条面板（80%–130% 连续 1%）；收藏与译文是读者行为，只用墨色变化，不用红。
// 规格同右下角「回到顶部」：44px、1px 细线、零圆角、零阴影。只在桌面（≥961px）出现；
// 手机上收藏回标题行、译文开关留在正文上方，字号用双指缩放。
import { useEffect, useId, useRef, useState } from "react";
import { IconBookmark } from "../icons";
import {
  DEFAULT_READING_SCALE,
  READING_SCALE_MAX,
  READING_SCALE_MIN,
  READING_SCALE_TICKS,
  applyReadingScale,
  setReadingScale,
  useIsStarred,
  useReadingScale,
} from "../../lib/local-state";
import { toggleStarTarget, type StarTarget } from "./StarButton";

/** 80%–130% 在滑条上的位置。 */
const at = (percent: number) => `${((percent - READING_SCALE_MIN) / (READING_SCALE_MAX - READING_SCALE_MIN)) * 100}%`;

export function ReaderRail({
  item,
  bilingual,
  translationEnabled,
  onToggleTranslation,
}: {
  item: StarTarget;
  bilingual: boolean;
  translationEnabled: boolean;
  onToggleTranslation: () => void;
}) {
  const percent = useReadingScale();
  const starred = useIsStarred(item.id);
  const [open, setOpen] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // 首帧由 head 里的内联脚本先写好 CSS 变量；这里同步之后的选择（含另一个标签页改过字号）。
  useEffect(() => {
    applyReadingScale(percent);
  }, [percent]);

  // 字号面板：点外面或 Esc 收起；Esc 把焦点还给「Aa」。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rail.current && !rail.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="fx-reader-rail" ref={rail} role="group" aria-label="阅读工具">
      <div className="fx-reader-cell">
        <button
          type="button"
          className="fx-reader-action"
          aria-pressed={starred}
          aria-label={starred ? `取消收藏：${item.title}` : `收藏：${item.title}`}
          title={starred ? "取消收藏" : "收藏"}
          onClick={() => {
            setOpen(false);
            toggleStarTarget(item);
          }}
        >
          <IconBookmark size={17} filled={starred} />
        </button>
      </div>

      <div className="fx-reader-cell">
        <button
          ref={trigger}
          type="button"
          className="fx-reader-action"
          aria-label="调整字号"
          title="调整字号"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="fx-reader-aa" aria-hidden="true">
            Aa
          </span>
        </button>
        {open && (
          <div className="fx-readsize-panel" id={panelId} role="group" aria-label="字号">
            <div className="fx-readsize-head">
              <span>字号</span>
              <button
                type="button"
                className="fx-readsize-reset"
                title="回到标准字号"
                aria-label={`回到标准字号，当前 ${percent}%`}
                onClick={() => setReadingScale(DEFAULT_READING_SCALE)}
              >
                {percent}%
              </button>
            </div>
            <div className="fx-readsize-slider">
              <span className="fx-readsize-end" aria-hidden="true">
                A
              </span>
              <span className="fx-readsize-track">
                <span className="fx-readsize-fill" style={{ width: at(percent) }} aria-hidden="true" />
                {READING_SCALE_TICKS.map((tick) => (
                  <span key={tick} className="fx-readsize-tick" style={{ left: at(tick) }} aria-hidden="true" />
                ))}
                <input
                  className="fx-readsize-range"
                  type="range"
                  min={READING_SCALE_MIN}
                  max={READING_SCALE_MAX}
                  step={1}
                  value={percent}
                  aria-label="字号"
                  aria-valuetext={`${percent}%`}
                  onChange={(event) => setReadingScale(Number(event.currentTarget.value))}
                />
              </span>
              <span className="fx-readsize-end fx-readsize-end-big" aria-hidden="true">
                A
              </span>
            </div>
          </div>
        )}
      </div>

      {bilingual && (
        <div className="fx-reader-cell">
          <button
            type="button"
            className="fx-reader-action"
            aria-pressed={translationEnabled}
            aria-label={translationEnabled ? "隐藏中文译文" : "显示中文译文"}
            title={translationEnabled ? "隐藏中文译文" : "显示中文译文"}
            onClick={() => {
              setOpen(false);
              onToggleTranslation();
            }}
          >
            <span className="fx-reader-yi" aria-hidden="true">
              译
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
