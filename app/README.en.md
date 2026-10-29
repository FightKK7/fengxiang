# Fengxiang Application

[简体中文](README.md) | English

> Status: current · Last reviewed: October 29, 2026

This directory contains Fengxiang's website, admin console, API, content collection, model processing and scheduled publishing jobs. See the [repository overview](../README.en.md) for a product introduction and screenshots.

The current configuration covers enterprise software, services and AI products worldwide. It turns source content into Chinese headlines, summaries, a chronological feed and daily editions. The website, RSS, public API, MCP and Agent Markdown share the same publication data. Browsing the website does not trigger model calls.

## Run the application

Requirements: Node.js 24.11 or a later 24.x release, and Docker with Compose. Automatic content generation also needs an OpenAI-compatible model service.

Run the following commands from the repository's `app/` directory:

```bash
node scripts/init-env.ts
```

The script generates `.env` with random secrets and an administrator password. Then edit `.env`:

- Set `LLM_API_KEY`, and check `LLM_BASE_URL` and `LLM_MODEL`. The example uses DeepSeek.
- Keep `SITE_URL=http://localhost:3000` for local use. For a server deployment, set it to the address readers will use.
- The example sets both `COLLECT_ENABLED` and `MODEL_CALLS_ENABLED` to `true`. Starting the services enables collection and model calls, billed according to your provider's terms. Set both to `false` when working only on the interface.

Start the services after configuration:

```bash
docker compose up -d --build
```

Open [http://localhost:3000](http://localhost:3000). The admin console is at `/admin`; sign in with `ADMIN_PASSWORD` from `.env`. The first startup imports the bundled source configuration. Articles and past editions are not included in the repository.

See the [deployment guide](docs/deploy.md) for other deployment options, domains, HTTPS, updates and backups.

## Stack and layout

Node.js 24, TypeScript, React Router with server-side rendering, Fastify, PostgreSQL 17, pg-boss, Tailwind CSS and Docker Compose.

| Directory | Purpose |
|---|---|
| `site/` | Site identity and copy, navigation, publication times, model configuration and branding |
| `industry/` | Sources, categories, tags, topics, prompts and selection thresholds |
| `apps/web/` | Reader pages and admin console |
| `apps/api/` | Website endpoints, public API and MCP |
| `apps/worker/` | Collection, model processing and scheduled jobs |
| `packages/` | Backend logic, publication data access, interface contracts and configuration types |
| `modules/` | Optional extensions |
| `scripts/` | Setup, data operations, font builds and validation scripts |
| `docs/` | Architecture, deployment, customization and feature documentation |

## Customization and administration

To adapt the site to another industry, start with `site/site.ts` and `industry/`. Update the site name, sources, categories, topics and prompts. See the [customization guide](docs/customize.md) for the full process.

The admin console supports source and article management, edition drafts, selection and ordering, publication and rollback. It also provides model usage, job status and operation history.

- [Source configuration and collection](docs/sources.md)
- [Selection rules and calibration](docs/selection.md)
- [Event grouping](docs/grouping.md)
- [Admin interface guidelines](docs/admin-ui.md)

## Development and validation

Run these commands from `app/` using the Node.js version listed above. Install dependencies first:

```bash
npm ci
npm run typecheck
npm run build -w @aihot/web
node --test apps/web/tests/*.test.ts
npm run test:standalone
```

Backend integration tests require a local PostgreSQL instance. Use a dedicated database whose name ends in `_test` or `_ci`; the database account needs permission to create databases:

```bash
DATABASE_URL=postgres://127.0.0.1:5432/fengxiang_test npm test
```

Tests require no model key and do not call real collection or model services. With the site running, check its main pages and endpoints:

```bash
node scripts/smoke.ts --base http://localhost:3000
```

Read the [architecture guide](docs/architecture.md) and relevant feature documentation before making changes, then update the matching documentation. See the [contributing guide](../CONTRIBUTING.md) for repository-wide procedures. Never commit `.env`, credentials or `.data/`.

Most detailed documentation is in Chinese.

## Feedback and content corrections

Use the site's feedback page for product suggestions, content corrections, and source requests to remove content or adjust its display. See [SECURITY.md](../SECURITY.md) to report a security issue.

## License and attribution

The code is released under the repository's [MIT License](../LICENSE). A copy of the upstream AIHOT license is retained in [LICENSE](LICENSE). See [NOTICE](../NOTICE) for copyright and third-party materials. The Fengxiang name, site content and brand assets are outside the MIT license.
