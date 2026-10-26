# 风向 · Global Enterprise-Service News

> Status: current · last reviewed 2026-10-26

**Official first-party updates from global enterprise services, in Chinese.**

风向 collects first-party official updates from companies and products in global enterprise services, turns them into Chinese headlines, summaries and a timeline, and publishes a curated daily issue (每日精选). Readers can browse by company, direction and content type, or feed the same data to agents via RSS, the public API or MCP.

## What it is

- **First-party sources only**: company blogs, official announcements, product and ecosystem news. No media, analysis or marketing content in this version.
- **The feed is the main entry**: all updates in chronological order with company filters; the daily issue is a second layer and does not make decisions for readers.
- **AI-first**: AI products, agents, Copilot, AI-native apps and AI-powered office software, alongside traditional enterprise-software changes.
- **Observation is optional**: selected items may carry a short "风向观察"; it is not promised on every item.
- **One dataset, many exits**: website, RSS, public API, MCP, agent Markdown and `llms.txt` all read from the same publication layer.

## Stack

Node.js 24 · TypeScript · React Router (SSR) · Fastify · PostgreSQL · pg-boss · Tailwind CSS · Docker Compose

## Run locally

Requirements: Docker, Node.js 24, and an OpenAI-compatible model API key (DeepSeek, Qwen, Zhipu, etc.).

```bash
# from the app/ directory
node scripts/init-env.ts --llm-key <your model API key>
docker compose up -d --build
```

Open <http://localhost:3000>. The admin console is at `/admin`; the admin password is in `.env` (`ADMIN_PASSWORD`).

- Real collection and model calls require `COLLECT_ENABLED=true` and `MODEL_CALLS_ENABLED=true` in `.env`; keep both `false` while developing.
- Database, migrations, domain/HTTPS, deployment in mainland China, costs and backups: see [deploy](docs/deploy.md).
- Tests do not need a model key; test database names must end with `_test` or `_ci`.

## Layout

| Directory | Contents |
|---|---|
| `site/` | Site name and copy (`site.ts`), brand assets, root-level static files, changelog |
| `industry/` | Categories and tags (`taxonomy.ts`), topics (`topics.json`), demo sources (`sources.json`), prompts, selection thresholds (`selection.ts`) |
| `apps/` | `web` (reader UI and admin), `api` (public API and MCP), `worker` (collection and model jobs) |
| `packages/` | Backend domain code, public read layer, contracts and site config |
| `scripts/` | Setup, ops, fonts, audit and self-check scripts |
| `docs/` | Framework docs: architecture, deployment, sources, selection, grouping, admin |
| `modules/` | Optional modules enabled by this repository |

## Documentation

- **Repository overview & screenshots**: [`../README.md`](../README.md)
- **App docs**: [`docs/`](docs/) (`admin-ui.md` and `sources.md` are maintained here)
- **Framework docs**: [architecture](docs/architecture.md), [deploy](docs/deploy.md), [sources](docs/sources.md), [selection](docs/selection.md), [grouping](docs/grouping.md), [admin](docs/admin-ui.md), [customize](docs/customize.md)

## Development checks

```bash
npm run typecheck
DATABASE_URL=postgres://127.0.0.1:5432/<name>_test npm test
npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts
node scripts/smoke.ts --base http://localhost:3000   # with the site running
```

Read `docs/architecture.md` and the relevant docs before changing categories, tags, prompts or public output; update the matching docs afterwards. Never commit `.env`, keys or `.data/`.

## Feedback and source requests

Use the site's feedback page for product suggestions, content corrections, and source correction/takedown requests. Security reports: see [SECURITY.md](../SECURITY.md).

## License

The original parts of this repository are source-available under the repository-root [learning-use license](../LICENSE): personal study and research only, no commercial use. The upstream AIHOT framework code remains under the [MIT License](LICENSE). See [NOTICE](NOTICE) for copyright and third-party notices; the upstream name and logo are not covered by the license.
