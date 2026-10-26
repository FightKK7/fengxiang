import { redirect } from "react-router";
import { webModules } from "../../site-modules";

/** 后台默认落在出刊台：每天第一件事是选稿发刊；接入新站时才先去信源。模块声明了落地页则优先。 */
export function loader() {
  throw redirect(webModules().find((m) => m.admin?.landing)?.admin?.landing ?? "/admin/reports");
}

export default function AdminIndex() {
  return null;
}
