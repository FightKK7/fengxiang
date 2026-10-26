// 首页：一条时间线，按收录时间倒序、按北京日分组，就是「全部动态」本身。
// 主栏只有时间线；右栏是「推荐阅读」与订阅。时间线之上是厂商筛选（?brand=<id>）：常驻一行、单选、带条数，
// 名册与条数来自 /api/site/brands（所有有内容的主体），超过上限折起。分类与变更类型的完整筛只在 /all。
// 时间线是一条滚动到底的流（StreamDayList）：没有页码，读到底自动接下一页，直到更早的内容读完。
// No cards, no shadows: one hairline between entries, the 2px black rule between modules.
import { Link } from "react-router";
import type { BrandsResponse, PoolResponse } from "@aihot/contracts/site";
import { EDITION_WHEN, SITE } from "@aihot/site";
import { openSubscribe } from "../subscribe/store";
import { BrandBar } from "./BrandBar";
import { EntryKeys } from "./EntryKeys";
import { StreamDayList } from "./StreamDayList";
import { FeedBar } from "./Filters";

/** 推荐阅读的一条：标题 +「为什么读」（判断或摘要）；人工榜单没有推荐语时为 null。 */
export interface FrontReading {
  title: string;
  to: string;
  external: boolean;
  why: string | null;
}

/** 本周风向榜的一行（人工推荐来源，loader 里从周报取）。 */
export interface FrontRank {
  title: string;
  to: string;
  external: boolean;
}

/** 右栏推荐阅读：人工风向榜优先，没有就是最近入选条目；整块无内容时不渲染。 */
function RailReading({ reading }: { reading: FrontReading[] }) {
  if (reading.length === 0) return null;
  return (
    <section className="fx-rail-block" aria-labelledby="fx-rail-reading">
      <h2 id="fx-rail-reading" className="fx-rail-title">
        推荐阅读
      </h2>
      <ol className="fx-reading">
        {reading.map((item, i) => (
          <li key={`${item.to}-${i}`} className={`fx-reading-item${i === 0 ? " fx-reading-1" : ""}`}>
            <span className="fx-reading-n">{String(i + 1).padStart(2, "0")}</span>
            <div className="fx-reading-body">
              {item.external ? (
                <a href={item.to} target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>
              ) : (
                <Link to={item.to}>{item.title}</Link>
              )}
              {item.why && <p className="fx-reading-why">{item.why}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** 订阅黑块：全站唯一一块反白，位置在右栏末尾。 */
function RailSubscribe() {
  return (
    <div className="fx-sub">
      <b>{EDITION_WHEN.daily}，一期每日精选</b>
      <button type="button" className="fx-sub-btn" aria-haspopup="dialog" onClick={(event) => openSubscribe(event.currentTarget)}>
        订阅
      </button>
    </div>
  );
}

export function FrontPage({ data, reading, brand = null, brands = null }: { data: PoolResponse; reading: FrontReading[]; brand?: string | null; brands?: BrandsResponse | null }) {
  const f = data.filters;
  return (
    <div className="fx-front fx-stream">
      <EntryKeys />
      <h1 className="sr-only">{SITE.subject}动态</h1>
      <FeedBar base="/" category={f.category} channel={f.channel} uncategorized={f.uncategorized} changeKind={f.changeKind} withFilter={false} />
      {/* 厂商筛选：常驻一行，点一家只看这家；名册按条数排序，超过上限折起。 */}
      <BrandBar active={brand} brands={brands?.brands} total={brands?.total} />

      <div className="fx-cols">
        <div className="fx-main">
          {data.items.length === 0 ? (
            <div className="fx-empty">
              {brand ? (
                <>
                  <p>这家厂商下暂时没有动态。</p>
                  <p>
                    <Link to="/" className="fx-link">
                      看全部动态
                    </Link>
                  </p>
                </>
              ) : (
                <>
                  <p>今天还没有新的收录。</p>
                  <p>
                    <Link to="/daily" className="fx-link">
                      先看每日精选
                    </Link>
                  </p>
                </>
              )}
            </div>
          ) : (
            <StreamDayList initial={data} />
          )}
        </div>

        <aside className="fx-rail" aria-label="辅助信息">
          <RailReading reading={reading} />
          <RailSubscribe />
        </aside>
      </div>

      <footer className="fx-footer">
        <div>
          <b>{SITE.name}</b>
          <span className="fx-footer-tag">{SITE.tagline}</span>
        </div>
      </footer>
    </div>
  );
}
