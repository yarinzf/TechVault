# ── TechVault Backend ─────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server/ ./server/

EXPOSE 5000

CMD ["node", "server/server.js"]
