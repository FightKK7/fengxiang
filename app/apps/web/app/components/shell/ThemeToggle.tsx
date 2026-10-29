// 顶栏的深浅色开关：点一下就在浅色 / 深色之间切（当前是浅色就显示月亮，是深色就显示太阳）。
// 「跟随系统」仍然只在「我的」页的三态开关里选；这里只做最高频的那个动作。
import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "../icons";
import { applyThemeWithFade, resolvedTheme, setThemePreference, useThemePreference } from "../../lib/local-state";

export function ThemeToggle() {
  const pref = useThemePreference();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme(pref) === "dark";
  const label = dark ? "切到浅色" : "切到深色";
  return (
    <button
      type="button"
      className="fx-theme-toggle"
      onClick={() => {
        const next = dark ? "light" : "dark";
        setThemePreference(next);
        applyThemeWithFade(next, false);
      }}
      aria-label={label}
      title={label}
    >
      {/* 两个图标叠在一起，由 data-theme 决定谁可见（250ms 交叉淡出，见 fengxiang.css）。 */}
      <span className="fx-theme-icon fx-theme-icon-moon" aria-hidden="true">
        <IconMoon size={18} />
      </span>
      <span className="fx-theme-icon fx-theme-icon-sun" aria-hidden="true">
        <IconSun size={18} />
      </span>
    </button>
  );
}
