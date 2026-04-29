# Build context must be repo root: docker build -f backend/Dockerfile .
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

FROM base AS deps
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
WORKDIR /app/backend
RUN npm install --frozen-lockfile

FROM base AS builder
COPY shared ./shared
COPY backend ./backend
COPY --from=deps /app/backend/node_modules ./backend/node_modules
WORKDIR /app/backend
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app/backend
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/prisma ./prisma
COPY backend/package.json ./

EXPOSE 3000
CMD ["node", "dist/index.js"]
