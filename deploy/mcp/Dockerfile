FROM node:24.20.0-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm exec turbo run build --filter=@marionette/mcp-server...

FROM node:24.20.0-bookworm-slim
ENV NODE_ENV=production PORT=8080 ARMATURE_DATA_ROOT=/data
WORKDIR /app
RUN mkdir /data && chown node:node /data
COPY --from=build --chown=node:node /app/packages/mcp-server/dist/http.js /app/http.mjs
COPY --from=build --chown=node:node /app/LICENSE /app/LICENSE
COPY --chown=node:node deploy/mcp/entrypoint.mjs /app/entrypoint.mjs
USER node
EXPOSE 8080
CMD ["node", "--max-old-space-size=512", "/app/entrypoint.mjs"]
