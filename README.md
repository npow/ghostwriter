# Quill

Autonomous AI content engine with anti-slop quality gates.

Quill turns a natural-language description into a fully configured content channel — ingests data sources, fingerprints your writing style, generates articles through a multi-stage LLM pipeline with quality review, and publishes to WordPress, Ghost, Twitter, and podcasts. All from one command.

```
quill create "a weekly tech blog about AI safety, published to my WordPress site"
```

## Architecture

Monorepo with 10 packages, orchestrated by [Turborepo](https://turbo.build/) and [Temporal](https://temporal.io/).

```
packages/
  core/                 # Schemas, config, logger, anti-slop blacklist, connections store
  cli/                  # Commander-based CLI (quill create, connect, run, fingerprint, ...)
  data-ingestion/       # RSS feeds, APIs (Polygon, Spoonacular, Etsy), caching & dedup
  style-fingerprint/    # Analyze writing style from URLs — pure computation, no LLM
  content-pipeline/     # Multi-stage LLM pipeline: research → outline → draft → review
  publishing/           # Platform adapters: WordPress, Ghost, Twitter, Buzzsprout podcasts
  site-setup/           # WordPress.com site provisioning (categories, tags, pages, menus, OAuth)
  database/             # Drizzle ORM + PostgreSQL schema (channels, runs, artifacts, publications)
  orchestrator/         # Temporal workflows for scheduled content generation
  monitoring/           # Channel metrics, analytics sync, performance insights
```

## Quick Start

**Prerequisites:** Node.js >= 22, pnpm, Docker (for Postgres + Redis + Temporal)

```bash
# Clone and install
git clone <repo-url> && cd quill
pnpm install

# Start infrastructure
docker compose up -d

# Configure
cp .env.example .env
# Edit .env with your API keys (at minimum: ANTHROPIC_API_KEY)

# Build
pnpm turbo build

# Connect a publishing platform
quill connect wordpress-com   # OAuth flow — opens browser
quill connect wordpress       # Self-hosted — Application Passwords
quill connect ghost
quill connect twitter

# Create a channel from a description
quill create "a daily recipe blog with Mediterranean focus"

# Or scaffold manually
quill init my-channel
quill validate my-channel
quill run my-channel
```

## Key Features

### Anti-Slop Quality Gates

Every generated article passes through review agents that reject AI-typical phrases ("delve into", "it's important to note", "in today's rapidly evolving landscape", etc.) and check for factual grounding, style consistency, and originality.

### Style Fingerprinting

Point Quill at any URL and it extracts the writing style — tone, sentence structure, vocabulary patterns, formatting conventions. The fingerprint is injected into the content pipeline so generated articles match your voice.

```bash
quill fingerprint https://your-blog.com/best-post
```

### WordPress.com OAuth

Connect a WordPress.com site with a single browser authorization — no Application Passwords, no wp-admin, no plugins:

```bash
export WPCOM_CLIENT_ID=...
export WPCOM_CLIENT_SECRET=...
quill connect wordpress-com
```

### Multi-Platform Publishing

Publish the same content adapted for different platforms. Each channel config can target multiple outputs:

```yaml
publishTargets:
  - platform: wordpress
    id: my-blog
  - platform: twitter
    id: my-twitter
  - platform: ghost
    id: newsletter
```

### Temporal Orchestration

Scheduled pipelines run as durable Temporal workflows with automatic retries, observability, and the ability to pause/resume.

```bash
docker compose up -d   # Includes Temporal + UI
quill dashboard        # Opens Temporal UI at localhost:8233
```

## Environment Variables

See [`.env.example`](.env.example) for the full list. The only required key to get started is `ANTHROPIC_API_KEY`.

## Development

```bash
pnpm turbo build       # Build all packages
pnpm turbo test        # Run tests
pnpm turbo dev         # Watch mode
```

## License

MIT
