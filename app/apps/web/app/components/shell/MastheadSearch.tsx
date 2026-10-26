// 报头导航行右端的搜索：一个可见的方框（不是「搜索 ／」的文字暗号），点开全站搜索浮层；
// 框里直接写搜索什么，右侧标出平台快捷键（Mac ⌘K / Windows、Linux Ctrl K）。
// 全站刊头（首页与每日精选存档面）共用这一个组件，入口长得一样。
import { openSearch } from "../../features/search/SearchOverlay";
import { searchShortcutLabel, useSearchShortcut } from "../../features/search/shortcut";
import { IconSearch } from "../icons";

export function MastheadSearch() {
  const shortcut = useSearchShortcut();
  return (
    <button
      type="button"
      className="fx-mast-search"
      aria-label={searchShortcutLabel(shortcut)}
      aria-haspopup="dialog"
      onClick={(event) => openSearch("", event.currentTarget)}
    >
      <IconSearch size={12} className="fx-mast-search-icon" />
      <span className="fx-mast-search-text">搜索标题、摘要…</span>
      <kbd className="fx-mast-search-kbd" aria-hidden="true">
        {shortcut}
      </kbd>
    </button>
  );
}
