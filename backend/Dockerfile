# Stage 1: Build NestJS Backend
FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY db ./db

RUN npm run build && npm prune --omit=dev

# Stage 2: Production Runner
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/db ./db

RUN mkdir -p /app/uploads && chown -R node:node /app

USER node
EXPOSE 4000

CMD ["node", "dist/main.js"]

