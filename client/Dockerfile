# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Bake env vars at build time via ARG→ENV.
# VITE_API_URL defaults to a relative path so nginx can proxy /api → backend.
ARG VITE_API_URL=/api/v1
ARG VITE_STRIPE_PUBLIC_KEY=pk_test_stub
ARG VITE_GOOGLE_CLIENT_ID=

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_STRIPE_PUBLIC_KEY=$VITE_STRIPE_PUBLIC_KEY
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
