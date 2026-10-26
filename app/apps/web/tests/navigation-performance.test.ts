// Failure modes, fixed before changing public loaders or prefetch:
// - returning to a page that was already open still needs the network;
// - query variants mix content/SEO, or restores lose their anchor;
// - hovering downloads pages, a press no longer loads data or its click asks again, scroll-through touches
//   download it, or a failed prefetch breaks the current page;
// - visits renew deadlines, expired/errors stay cached, or refresh stops working;
// - Agent tabs choose an invalid panel or leave canonical/history behind;
// - search downloads two whole pages, requests before opening, or never retries/updates suggestions.
// Reader work failures fixed before changing enhancement and return-position code:
// - offscreen code downloads/runs immediately, visible code stays plain, or raw copying changes;
// - tiny/linked pictures become zoom buttons, or language changes keep old handlers;
// - a deep return loses its anchor, or folded dates confuse the anchor search.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium, webkit, expect, type Browser } from "@playwright/test";
import type { ReportDetail } from "@aihot/contracts/site";
import { FIXTURE_AT as at, fakeApi, feedItem, itemDetail, startWebServer, visit, type WebServer } from "./web-server.ts";

const item = feedItem({id:'navigation-fixture',title:'性能检查文章'});
const detail = itemDetail({id:item.id,title:item.title,originalTitle:'Fixture article'});
const codeSource='import json\n\nwith open("data.json") as file:\n    data = json.load(file)\n\nfor record in data:\n    print(record["title"])\n';
const readerBody=Array.from({length:30},(_,i)=>`<p>阅读段落 ${i}：先阅读文章，再查看后面的代码和图片。正文保持可读，图片和代码在需要时增强。</p>`).join('')
  +`<pre><code>${codeSource}</code></pre><pre><code>x = 1</code></pre>`
  +Array.from({length:12},(_,i)=>`<img src="/reader-image/${i}.svg" alt="正文配图 ${i}" width="640" height="360" loading="lazy">`).join('')
  +'<img src="/reader-image/tiny.svg" alt="小图标" width="16" height="16" loading="lazy"><a href="https://example.org"><img src="/reader-image/linked.svg" alt="链接图片" width="640" height="360" loading="lazy"></a>';
const report = (kind:'daily'|'weekly'|'monthly'): ReportDetail => ({kind,key:kind==='daily'?'2026-10-04':kind==='weekly'?'2026-W40':'2026-10',issueNumber:1,title:'Fixture '+kind,generatedAt:at,lead:{title:'Fixture '+kind,leadParagraph:'Fixture report'},leadItemId:null,overview:null,highlights:[],sections:[],flashes:[],cover:null,metrics:{},readingMinutes:1,prev:null,next:null});
const hits: string[] = [];
let suggestionsVersion=1;
let failing='';
let web:WebServer;
let origin:string;
let chrome:Browser;
let safari:Browser;
const api=fakeApi((url,res,req)=>{
  const p=url.pathname;
  if(p==='/api/site/meta'||p==='/api/site/track')return;
  hits.push(req.url!);
  if(p===failing){res.statusCode=503;return {code:'unavailable'};}
  if(p==='/api/site/search/suggestions')return {topics:[{slug:'openai',name:'OpenAI',group:'company'}],hot:[{rank:1,title:'建议版本 '+suggestionsVersion,to:'/story/fixture'}]};
  if(p==='/api/site/topics')return {groups:[],topics:[{slug:'openai',name:'OpenAI',group:'company',definition:'Fixture',brand:null,total:0,recent:0,indexable:false,latest:null}]};
  if(p==='/api/site/hot')return {computedAt:at,windowHours:48,entries:[{rank:1,story:{publicId:'fixture',title:'建议版本 '+suggestionsVersion},heat:10,trend:'flat',trendPct:0,badges:[],participantCount:0,sourceCount:0,sourceNames:[],participants:[],spark:[],summary:null,latest:null,cover:null}]};
  if(p==='/api/site/timeline'){
    const category=url.searchParams.get('category');
    const shown={...item,title:category?'分类 '+category:'性能检查文章'};
    if(url.searchParams.get('tag')==='long-reading'){
      const cards=Array.from({length:180},(_,i)=>({key:'long-'+i,anchorAt:i<60?at:'2026-10-03T08:00:00.000Z',item:{...item,id:'long-'+i,title:'长列表文章 '+i,summary:'用于核实深处阅读返回的固定摘要。'.repeat(3)},group:null}));
      return {filters:{channel:'all',category:null,tag:'long-reading'},cards,nextCursor:null,hot:null,dayCounts:{'2026-10-04':60,'2026-10-03':120}};
    }
    return {filters:{channel:'all',category,tag:null},cards:[{key:shown.id,anchorAt:at,item:shown,group:null}],nextCursor:null,hot:null,dayCounts:{'2026-10-04':1}};
  }
  if(p==='/api/site/pool'){
    const page=Number(url.searchParams.get('page')||1);
    const per=10;
    // 第一页第一条是下面各处要点的文章；其余每条有自己的 id（流式列表按 id 去重）。
    const items=page===1
      ? [item,...Array.from({length:per-1},(_,i)=>({...item,id:`entry-1-${i}`,title:`条目 ${i+1}`}))]
      : Array.from({length:per},(_,i)=>({...item,id:`entry-${page}-${i}`,title:`条目 ${(page-1)*per+i+1}`}));
    const tag=url.searchParams.get('tag'),q=url.searchParams.get('q'),kind=url.searchParams.get('kind');
    return {filters:{channel:'all',category:null,tag,q,tab:'time',changeKind:kind,uncategorized:false},items,page,pageCount:12,total:per*12,todayCount:1,freshness:at};
  }
  if(p==='/api/site/brands')return {brands:[{id:'slack',name:'Slack',count:20},{id:'salesforce',name:'Salesforce',count:15},{id:'cursor',name:'Cursor',count:12},{id:'openai',name:'OpenAI',count:11}],total:120};
  if(p.startsWith('/api/site/items/entry-'))return {...detail,id:p.split('/').at(-1),title:'条目详情'};
  if(p==='/api/site/items/navigation-fixture')return detail;
  if(p==='/api/site/items/navigation-fixture/original')return {...detail,body:{zh:null,original:'<p>Original fixture</p>',zhKind:null,complete:true},bodyLanguage:'original'};
  if(p==='/api/site/items/reader-fixture')return {...detail,id:'reader-fixture',title:'阅读增强检查',body:{...detail.body,zh:readerBody}};
  if(p==='/api/site/items/reader-fixture/original')return {...detail,id:'reader-fixture',title:'阅读增强检查',body:{...detail.body,zh:null,original:'<p>Original reader text</p>'},bodyLanguage:'original'};
  if(p.startsWith('/api/site/items/long-'))return {...detail,id:p.split('/').at(-1),title:'长列表详情'};
  const kind=p.match(/^\/api\/site\/reports\/(daily|weekly|monthly)\/latest-page$/)?.[1] as 'daily'|'weekly'|'monthly'|undefined;
  if(kind){const r=report(kind);return {report:r,index:[{key:r.key,issueNumber:1,title:r.title,count:0}]};}
});

before(async()=>{
  // Started together; whatever started is stopped in after() even when another one failed.
  const started=await Promise.allSettled([
    startWebServer(api).then(w=>{web=w;origin=w.origin;}),
    chromium.launch({channel:'chromium'}).then(b=>{chrome=b;}),
    webkit.launch().then(b=>{safari=b;}),
  ]);
  for(const result of started)if(result.status==='rejected')throw result.reason;
});
after(async()=>{
  await chrome?.close();await safari?.close();
  await web?.stop();
});

// One engine per behaviour: WebKit for what phone readers do (iPhone Safari), Chromium for desktop-only
// pointer behaviour such as hover and mouse presses. The router and caches are the same code in both.
test('SSR list and visited query variants return offline without another read',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  try{
    await visit(page,origin+'/');
    await expect(page.locator('.fx-item').first()).toBeVisible();
    const poolReads=hits.filter(x=>x.startsWith('/api/site/pool')).length;
    await page.locator('.fx-item a[href="/items/navigation-fixture"]').first().click();
    await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    await context.setOffline(true);
    await page.goBack();
    await expect(page.locator('.fx-item').first()).toBeVisible({timeout:1500});
    assert.equal(hits.filter(x=>x.startsWith('/api/site/pool')).length,poolReads,'returning to the list reuses its cached read');
    await context.setOffline(false);
    // 厂商筛选是首页的查询变体：看过的筛选同样断网可回。
    await page.getByRole('link',{name:/^Slack/}).click();
    await expect(page).toHaveURL(origin+'/?brand=slack');
    await expect(page.locator('.fx-item').first()).toBeVisible();
    await page.locator('.fx-item a[href^="/items/"]').first().click();
    await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    await context.setOffline(true);
    await page.goBack();
    await expect(page).toHaveURL(origin+'/?brand=slack');
    await expect(page.locator('.fx-item').first()).toBeVisible({timeout:1500});
  }finally{await context.close();}
});

test('hovering the timeline downloads no article data and the click reads it once',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await visit(page,origin+'/');
    const link=page.locator('.fx-item a[href="/items/navigation-fixture"]').first();
    const start=hits.length;
    await link.hover();await page.waitForTimeout(300);
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/items/')).length,0,'hover downloads no article');
    await link.click();await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/items/')).length,1,'the click reads the article once');
  }finally{await context.close();}
});

test('the old all-page address returns to the timeline, which loads its next batch on scroll',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    // /all 是旧的全部动态列表地址：没有搜索时回首页的时间线，页码由滚动接续。
    await visit(page,origin+'/all');
    await expect(page).toHaveURL(origin+'/');
    await expect(page.locator('.fx-item').first()).toBeVisible();
    const first=await page.locator('.fx-item').count();
    for(let i=0;i<2;i++){await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(800);}
    assert.ok(await page.locator('.fx-item').count()>first,'滚动自动接下一批');
    await expect(page.locator('.fx-pager')).toHaveCount(0);
  }finally{await context.close();}
});

// A prefetch of the newly selected link must not be mistaken for an explicit refresh of that page.
// Disable HTTP reuse here: otherwise the browser cache can hide a lost document-level result.
test('a press on a selected brand link preserves visited data and the next revisit starts no data request',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  const requests:string[]=[];
  await context.route('**/*.data*',route=>route.continue());
  page.on('request',request=>{if(request.url().includes('.data'))requests.push(request.url());});
  const press={button:0,pointerType:'mouse',isPrimary:true};
  try{
    await visit(page,origin+'/');
    await page.getByRole('link',{name:/^Slack/}).click();
    await expect(page).toHaveURL(origin+'/?brand=slack');
    await expect(page.locator('.fx-item').first()).toBeVisible();
    await page.getByRole('link',{name:/^Slack/}).dispatchEvent('pointerdown',press);
    await page.waitForTimeout(150);
    await page.getByRole('link',{name:/^Salesforce/}).click();
    await expect(page).toHaveURL(origin+'/?brand=salesforce');
    await expect(page.locator('.fx-item').first()).toBeVisible();
    await page.getByRole('link',{name:/^Salesforce/}).dispatchEvent('pointerdown',press);
    await page.waitForTimeout(150);
    const before=requests.length;
    await page.getByRole('link',{name:/^Slack/}).click();
    await expect(page).toHaveURL(origin+'/?brand=slack');
    assert.deepEqual(requests.slice(before),[],'neither prefetch nor navigation may evict and reload a still-valid visited page');
  }finally{await context.close();}
});

test('a revisit never renews the original deadline: an expired read asks the server again and a reload recovers',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await page.clock.install();
    await visit(page,origin+'/');
    await page.locator('.fx-item a[href="/items/navigation-fixture"]').first().click();
    await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    failing='/api/site/pool';
    // 列表结果只活 60 秒：过了期限再返回必须重新读；读不到时按容量策略落到「搜索有点忙」，证明没有吃旧缓存。
    await page.clock.runFor(61_000);
    await page.goBack();await expect(page.getByRole('heading',{name:'搜索有点忙',exact:true})).toBeVisible();
    failing='';
    // 回到首页重新读一次（此时页面停在 /search-busy，重新加载不会自己回家）。
    await page.goto(origin+'/');
    await expect(page.locator('.fx-item').first()).toBeVisible();
  }finally{failing='';await context.close();}
});

test('Agent tabs finish offline with matching canonical; invalid direct tabs and anchored links keep a panel',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await visit(page,origin+'/agent');
    await context.setOffline(true);
    await page.getByRole('tablist',{name:'接入方式'}).getByRole('tab',{selected:true}).click();
    await expect(page.locator('#agent-panel')).not.toBeEmpty();
    for(const [tab,name] of [['mcp',/^MCP/],['rss',/^RSS/],['api',/^REST API/]] as const){
      const choice=page.getByRole('tab',{name});
      // The active track was exercised above; compare navigation through every remaining track.
      if(await choice.getAttribute('aria-selected')==='true')continue;
      const target=await choice.getAttribute('href');
      await choice.click();
      await expect(page).toHaveURL(origin+target,{timeout:1500});
      await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href',origin+target);
      await expect(page.locator('#agent-panel')).toHaveAttribute('aria-labelledby','agent-tab-'+tab);
      await expect(page.locator('#agent-panel')).not.toBeEmpty();
    }
    await context.setOffline(false);
    await visit(page,origin+'/agent?tab=unknown');
    await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected','true');
    await expect(page.locator('#agent-panel')).not.toBeEmpty();
    await visit(page,origin+'/agent#agent-api-recovery');
    await expect(page.locator('#agent-api-recovery')).toBeVisible();
  }finally{await context.close();}
});

test('phone suggestions load only on opening, use one small read, retry failures and update on reopening',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
  try{
    suggestionsVersion=1;await visit(page,origin+'/');
    assert.equal(hits.filter(x=>x==='/api/site/search/suggestions').length,0);
    let start=hits.length;
    await page.locator('button[aria-label="搜索"]').click();
    await expect(page.getByRole('link',{name:'1 建议版本 1',exact:true})).toBeVisible();
    assert.deepEqual(hits.slice(start),['/api/site/search/suggestions']);
    await page.locator('.fx-search-close').click();
    suggestionsVersion=2;start=hits.length;
    await page.locator('button[aria-label="搜索"]').click();
    await expect(page.getByRole('link',{name:'1 建议版本 2',exact:true})).toBeVisible();
    assert.deepEqual(hits.slice(start),['/api/site/search/suggestions']);
    await page.locator('.fx-search-close').click();
    failing='/api/site/search/suggestions';await page.locator('button[aria-label="搜索"]').click();
    await expect(page.getByRole('link',{name:'1 建议版本 2',exact:true})).not.toBeVisible();
    await page.locator('.fx-search-close').click();failing='';suggestionsVersion=3;
    await page.locator('button[aria-label="搜索"]').click();
    await expect(page.getByRole('link',{name:'1 建议版本 3',exact:true})).toBeVisible();
  }finally{failing='';await context.close();}
});

test('reader enhancements wait for visible code and update only the picture that loaded',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const scripts:string[]=[];page.on('request',r=>{if(r.url().includes('/assets/')&&r.url().includes('highlight-'))scripts.push(r.url());});
  await page.route('**/reader-image/*.svg',route=>route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${route.request().url().endsWith('/tiny.svg')?16:640}" height="360"><rect width="640" height="360" fill="red"/></svg>`}));
  try{
    await visit(page,origin+'/items/reader-fixture');
    await expect(page.getByRole('heading',{name:'阅读增强检查',exact:true})).toBeVisible();
    await expect(page.locator('.code-block-copy')).toHaveCount(2);
    assert.deepEqual(scripts,[],'reading the introduction must not download the offscreen highlighter');
    const source=page.locator('.prose pre code').first();
    assert.equal(await source.textContent(),codeSource);
    await source.scrollIntoViewIfNeeded();
    await expect(source).toHaveClass(/hljs/);
    assert.equal(await source.textContent(),codeSource,'colouring preserves the copyable text');
    assert.equal(scripts.length,1);
    await page.locator('.code-block-copy').first().click();
    await expect(page.locator('.code-block-copy').first()).toHaveText('已复制');
    assert.equal(await page.locator('.prose pre code').nth(1).textContent(),'x = 1');
    for(let i=0;i<12;i++){
      const picture=page.locator(`.prose img[alt="正文配图 ${i}"]`);
      await picture.scrollIntoViewIfNeeded();
      await expect(picture).toHaveAttribute('role','button');
    }
    const tiny=page.locator('.prose img[alt="小图标"]');await tiny.scrollIntoViewIfNeeded();
    await expect(tiny).not.toHaveAttribute('role','button');
    await expect(page.locator('.prose a img')).not.toHaveAttribute('role','button');
    // 原文视图是独立页面：它不挂代码/图片增强。
    await visit(page,origin+'/items/reader-fixture/original');
    await expect(page.getByText('Original reader text',{exact:true})).toBeVisible();
    assert.equal(await page.locator('.code-block-copy').count(),0);
  }finally{await context.close();}
});

test('returning from a deep article restores the loaded batches and the reading position',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  try{
    await visit(page,origin+'/');
    await expect(page.locator('.fx-item').first()).toBeVisible();
    // 滚到底三批：每批 10 条，无限滚动自动接页。
    for(let i=0;i<3;i++){await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(900);}
    // 等这一轮自动接页落定，避免在列表还在插入时点链接（元素会被顶走）。
    await page.waitForFunction(()=>!document.querySelector('.fx-stream-end')?.textContent?.includes('正在加载'));
    const loaded=await page.locator('[data-card-key]').count();
    assert.ok(loaded>=30,'滚动至少读出三批');
    const lastKey=await page.locator('[data-card-key]').last().getAttribute('data-card-key');
    const link=page.locator('.fx-item a[href^="/items/entry-"]').last();
    await link.scrollIntoViewIfNeeded();
    const before=await page.evaluate(()=>{
      const first=[...document.querySelectorAll<HTMLElement>('[data-card-key]')].find(e=>e.getBoundingClientRect().bottom>72)!;
      return {key:first.dataset.cardKey!,top:first.getBoundingClientRect().top};
    });
    await link.click();
    await expect(page).toHaveURL(/\/items\/entry-/,{timeout:10000});
    await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    await page.goBack();
    // 返回先恢复已读出的页；滚动位置到底时哨兵会继续接下一页，所以只要求不丢已读出的条目。
    await expect(page.locator(`[data-card-key="${lastKey}"]`)).toHaveCount(1);
    await expect.poll(()=>page.locator('[data-card-key]').count()).toBeGreaterThanOrEqual(loaded);
    await expect.poll(()=>page.locator(`[data-card-key="${before.key}"]`).evaluate((e,top)=>Math.abs(e.getBoundingClientRect().top-top),before.top)).toBeLessThan(4);
  }finally{await context.close();}
});
