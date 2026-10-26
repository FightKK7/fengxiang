// 子页面顶部的统一返回：有浏览历史就退回上一页，否则回到指定的上级页。
// 桌面与详情页共用这一枚；样式与条目页原来的「← 返回」一致（12.5px、--ink-4）。
// 手机上各页已有 PhoneBar 的返回，这里的 `phone` 默认 false 表示手机不显示，避免两个返回。
import { useNavigate } from "react-router";

export function BackLink({ to, label = "返回", phone = false }: { to: string; label?: string; phone?: boolean }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={`fx-back${phone ? "" : " fx-back-phone-off"}`}
      onClick={() => {
        const idx = (window.history.state as { idx?: unknown } | null)?.idx;
        if (typeof idx === "number" && idx > 0) navigate(-1);
        else void navigate(to);
      }}
    >
      ← {label}
    </button>
  );
}
