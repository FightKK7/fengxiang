import { useEffect, useState, type ReactNode } from "react";
import { IconMonitor, IconMoon, IconSun } from "../icons";
import { applyThemeWithFade, resolvedTheme, setThemePreference, useThemePreference, type ThemePreference } from "../../lib/local-state";

type Choice = "dark" | "system" | "light";

const OPTIONS: Array<{ key: Choice; label: string; icon: ReactNode }> = [
  { key: "dark", label: "深色", icon: <IconMoon size={14} /> },
  { key: "system", label: "跟随系统", icon: <IconMonitor size={14} /> },
  { key: "light", label: "浅色", icon: <IconSun size={14} /> },
];

/** Three-way appearance switch (dark / follow the system / light): paper style, a 2px ink underline
 *  under the one in use — no pill thumb, no shadow, no sliding transform (interaction budget). */
export function ThemeSwitch({ className = "" }: { className?: string }) {
  const pref = useThemePreference();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current: Choice = !mounted ? "system" : (pref ?? "system");

  const choose = (key: Choice) => {
    const nextPref: ThemePreference = key === "system" ? null : key;
    setThemePreference(nextPref);
    // 整页颜色 token 用 ~1s 渐变过去；壳层图标另做 250ms 交叉淡出。
    applyThemeWithFade(resolvedTheme(nextPref), nextPref === null);
  };

  return (
    <div role="radiogroup" aria-label="外观" className={`fx-theme ${className}`}>
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={current === o.key}
          title={o.label}
          onClick={() => choose(o.key)}
          className={`fx-theme-opt${current === o.key ? " fx-theme-on" : ""}`}
        >
          {o.icon}
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
