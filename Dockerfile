FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN apt-get update && apt-get install -y git openssh-client && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /root/.ssh && ssh-keyscan github.com >> /root/.ssh/known_hosts
WORKDIR /app

# Install deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/cli/package.json packages/cli/
COPY packages/content-pipeline/package.json packages/content-pipeline/
COPY packages/core/package.json packages/core/
COPY packages/data-ingestion/package.json packages/data-ingestion/
COPY packages/database/package.json packages/database/
COPY packages/monitoring/package.json packages/monitoring/
COPY packages/orchestrator/package.json packages/orchestrator/
COPY packages/publishing/package.json packages/publishing/
COPY packages/site-setup/package.json packages/site-setup/
COPY packages/style-fingerprint/package.json packages/style-fingerprint/
RUN pnpm install --frozen-lockfile

# Build
COPY . .
RUN pnpm --filter @ghostwriter/core build && pnpm build

ENTRYPOINT ["node", "packages/cli/dist/index.js"]
