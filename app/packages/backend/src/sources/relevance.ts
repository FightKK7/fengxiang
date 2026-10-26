// 媒体信息的准入：只留提到受监控实体的条目。
// 官方源不需要（内容天然是自家的）；媒体源（量子位、雷锋网、ZDNet 等）什么行业都发，
// 所以用行业包的实体表（公司 / 产品 / 别名 / 母公司）做一道白名单，命中才进入采集池。
import { ENTITIES } from "@aihot/industry/taxonomy";

/**
 * 受监控实体的全部写法：公司名、产品名、别名、母公司名。小写去重，长词优先（`deepseek harness`
 * 先于 `deepseek`），用于标题与摘要的包含匹配。
 */
const TERMS: readonly string[] = (() => {
  const set = new Set<string>();
  for (const entity of Object.values(ENTITIES)) {
    for (const value of [entity.name, ...entity.aliases, ...(entity.orgNames ?? []), ...(entity.otherNames ?? [])]) {
      const term = value.trim().toLowerCase();
      if (term) set.add(term);
    }
  }
  return [...set].sort((a, b) => b.length - a.length);
})();

/** 标题或摘要提到任意受监控实体，就是与本站主题相关的媒体信息。 */
export function mentionsTrackedEntity(text: string): boolean {
  const hay = text.toLowerCase();
  return TERMS.some((term) => hay.includes(term));
}
