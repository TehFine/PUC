# Stage 1: Build Next.js Frontend
FROM node:22.23.5-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG API_URL=http://backend:4000
ENV API_URL=${API_URL}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Stage 2: Production Runner
FROM node:22.23.5-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get upgrade -y --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NODE_OPTIONS="--disable-proto=delete"
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV API_URL=http://backend:4000
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next

RUN chown -R node:node /app/.next

USER node
EXPOSE 3000

CMD ["npm", "run", "start"]

