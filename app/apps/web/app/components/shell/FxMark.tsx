/**
 * 「风向」的标志：三条信息流。
 * regular 用于报头（42px 字标尺度）；small 用于手机顶栏 / 16px 级别——
 * 同一剪影，但条加粗（2 → 2.4）、缝收窄（2 → 1.4）、斜切同步（1 → 1.2），
 * 否则小尺寸下三条细杠会糊成一片。
 */
const PATHS = {
  regular: "M0 0 H19 V2 H1 Z M4 4 H18 V6 H5 Z M8 8 H15 V10 H9 Z",
  small: "M0 0 H19 V2.4 H1.2 Z M4 3.8 H18 V6.2 H5.2 Z M8 7.6 H15 V10 H9.2 Z",
};

export function FxMark({ small = false, className = "" }: { small?: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 19 10" aria-hidden="true" focusable="false">
      <path d={small ? PATHS.small : PATHS.regular} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
