import { Fragment, useState } from "react";
import { BackLink } from "../components/ui/BackLink";
import { Link, useLoaderData } from "react-router";
import type { SiteContact, SiteStats } from "@aihot/contracts/site";
import { ABOUT, SITE } from "@aihot/site";
import { apiGet, cachedPage } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { organizationLd, pageMeta } from "../lib/seo";
import { IntentLink } from "../components/ui/IntentLink";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";
import "../fx-pages-content.css";

export const handle: Screen = { tab: "me", name: "关于" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  const [contact, stats] = await Promise.all([
    apiGet<SiteContact>("/api/site/contact", { signal: request.signal }).catch(() => null),
    apiGet<SiteStats>("/api/site/stats", { signal: request.signal }).catch(() => null),
  ]);
  return cachedPage(300, { contact, stats });
}

export function meta() {
  return pageMeta({ title: "关于", description: ABOUT.description, path: "/about", image: "/og/pages/about.png", jsonLd: organizationLd() });
}

interface Step {
  no: string;
  name: string;
  text: string;
  /** 这一步的规模，用站内实时统计；统计没取到就不写。 */
  meta: string | null;
}

/** 四个环节：采集、归并、筛选、出刊。 */
function stepsOf(stats: SiteStats | null): Step[] {
  return [
    { no: "01", name: "采集", text: ABOUT.steps.collect, meta: stats ? `${stats.sources} 个信源` : null },
    { no: "02", name: "归并", text: ABOUT.steps.store, meta: stats ? `${stats.items} 条动态` : null },
    { no: "03", name: "筛选", text: ABOUT.steps.select, meta: stats ? `${stats.selected} 条精选` : null },
    { no: "04", name: "出刊", text: ABOUT.steps.publish, meta: stats ? `${stats.dailies} 期每日精选` : null },
  ];
}

/** 关于页正文里 {sources} 换成实时信源数；统计没取到时用 fallback 那句话。 */
function Lead({ stats }: { stats: SiteStats | null }) {
  return (
    <p className="fxc-about-lead">
      {ABOUT.lead.split("{sources}").map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (stats ? <b>{stats.sources}</b> : ABOUT.sourcesFallback)}
          {part}
        </Fragment>
      ))}
    </p>
  );
}

/** 做这个站的人（ABOUT.maker，选填）：一段话，有二维码就排成一组方图。 */
function Maker({ maker, contact }: { maker: NonNullable<typeof ABOUT.maker>; contact: SiteContact | null }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const codes = [
    contact?.wechatQr && maker.wechat ? { src: contact.wechatQr, kind: maker.wechat.kind, title: maker.wechat.title, note: maker.wechat.note } : null,
    contact?.feishuQr && maker.feishu ? { src: contact.feishuQr, kind: maker.feishu.kind, title: maker.feishu.title, note: maker.feishu.note } : null,
  ].filter((code): code is NonNullable<typeof code> => !!code);
  return (
    <section className="fxc-maker" aria-labelledby="about-maker">
      <h2 id="about-maker">做这个站的人</h2>
      <p>
        {contact?.makerAvatar && !avatarFailed ? <img src={contact.makerAvatar} alt="" width={44} height={44} onError={() => setAvatarFailed(true)} className="mr-3 inline-block size-11 align-middle object-cover" /> : null}
        {maker.greeting.join(" ")}
      </p>
      {codes.map((code) => (
        <div key={code.kind} className="fxc-qr">
          <img src={code.src} alt={`${code.kind}二维码`} width={104} height={104} loading="lazy" />
          <div>
            <p className="fxc-qr-title">{code.title}</p>
            <p className="fxc-qr-note">{code.note}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

export default function AboutPage() {
  const { contact, stats } = useLoaderData<typeof loader>();
  const steps = stepsOf(stats);
  const latest = stats?.latest.slice(0, 3) ?? [];
  return (
    <div className="fxc-page">
      <PhoneBar back={{ to: "/more", label: "我的" }} title={`关于${SITE.name}`} />
      <div className="fxc-col">
        <BackLink to="/more" />
        <header>
          <h1 data-page-title="" className="fxc-about-title">
            <span>{ABOUT.headline[0]}</span>
            <span>{ABOUT.headline[1]}</span>
          </h1>
          <Lead stats={stats} />
        </header>

        <section className="fxc-steps" aria-labelledby="about-how">
          <div className="fxc-sub-head">
            <h2 id="about-how" className="fxc-sub-title">
              怎么工作
            </h2>
          </div>
          <ol className="fxc-steps-list">
            {steps.map((step) => (
              <li key={step.no} className="fxc-step">
                <span className="fxc-step-no">{step.no}</span>
                <div>
                  <h3 className="fxc-step-name">{step.name}</h3>
                  <p className="fxc-step-text">{step.text}</p>
                </div>
                {step.meta && <span className="fxc-step-meta">{step.meta}</span>}
              </li>
            ))}
          </ol>
        </section>

        {latest.length > 0 && (
          <section className="fxc-latest" aria-labelledby="about-latest">
            <div className="fxc-sub-head">
              <h2 id="about-latest" className="fxc-sub-title">
                最新动态
              </h2>
            </div>
            <ul className="fxc-latest-list">
              {latest.map((item) => (
                <li key={item.id}>
                  <IntentLink viewTransition to={`/items/${item.id}`} className="fxc-latest-row">
                    <span className="fxc-latest-title">{item.title}</span>
                    <span className="fxc-latest-src">{item.source}</span>
                  </IntentLink>
                </li>
              ))}
            </ul>
          </section>
        )}

        {ABOUT.maker && <Maker maker={ABOUT.maker} contact={contact} />}

        <p className="fxc-copyright">
          {ABOUT.copyright[0]}
          <Link to="/feedback">反馈页</Link>
          {ABOUT.copyright[1]}
        </p>

        <footer className="fxc-about-foot">
          <span>{SITE.footerNote}</span>
        </footer>
      </div>
    </div>
  );
}
