FROM node:22-alpine AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @year95/api build
RUN pnpm install --prod --frozen-lockfile

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist

COPY --from=build --chown=node:node /app/packages/config/package.json ./packages/config/package.json
COPY --from=build --chown=node:node /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=build --chown=node:node /app/packages/config/dist ./packages/config/dist

COPY --from=build --chown=node:node /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=node:node /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=build --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist

COPY --from=build --chown=node:node /app/packages/market-data/package.json ./packages/market-data/package.json
COPY --from=build --chown=node:node /app/packages/market-data/dist ./packages/market-data/dist

COPY --from=build --chown=node:node /app/packages/persistence/package.json ./packages/persistence/package.json
COPY --from=build --chown=node:node /app/packages/persistence/node_modules ./packages/persistence/node_modules
COPY --from=build --chown=node:node /app/packages/persistence/dist ./packages/persistence/dist

USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
