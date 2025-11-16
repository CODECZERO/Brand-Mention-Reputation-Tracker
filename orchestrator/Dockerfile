# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app

ENV NODE_ENV=development

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY tests ./tests

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --legacy-peer-deps

COPY --from=builder /app/dist ./dist
COPY .env.example ./

USER node

EXPOSE 9000
EXPOSE 9001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:9000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
