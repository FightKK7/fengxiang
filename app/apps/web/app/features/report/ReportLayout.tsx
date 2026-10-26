// 每日精选页的版式：全站报头（桌面壳刊头 / 手机那条时间线切换栏或带返回的 PhoneBar）之后，
// 760 单栏读一期。不再自绘报头、不再有右轨：期号收在正文报眼，往期/合订本收在页脚。
import type { ReactNode } from "react";
import { REPORT_NAMES, type ReportKind } from "@aihot/contracts/site";
import { PhoneBar } from "../../components/shell/PhoneBar";
import { FeedBar } from "../feed/Filters";

/** 手机上每日精选页的顶栏：daily 用时间线那条「动态 | 每日精选」切换栏，周报/月报用带返回的普通栏。 */
export function ReportPhoneBar({ kind }: { kind: ReportKind }) {
  if (kind === "daily") return <FeedBar base="/daily" category={null} channel="all" withFilter={false} />;
  return <PhoneBar back={{ to: "/", label: "动态" }} title={REPORT_NAMES[kind]} />;
}

export function ReportLayout({ phone, children }: { phone: ReactNode; children: ReactNode }) {
  return (
    <div className="fx-report">
      {phone}
      <div className="fx-report-main">{children}</div>
    </div>
  );
}
