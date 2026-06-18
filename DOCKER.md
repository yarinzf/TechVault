# TechVault — Docker

Three-service stack: **MongoDB 7**, **Express backend**, **React/Nginx frontend**.

```
Browser → http://localhost:3000
            │
        [Nginx :80]
            ├─ /api/*       → backend:5000  (proxy)
            ├─ /socket.io/* → backend:5000  (WebSocket upgrade)
            └─ /*           → /usr/share/nginx/html (SPA)

        [Express :5000]
            └─ mongodb://mongodb:27017/techvault
```

---

## First-time setup

```bash
cp .env.docker.example .env.docker
# Open .env.docker and replace the three placeholder secrets:
#   JWT_ACCESS_SECRET  (min 32 chars)
#   JWT_REFRESH_SECRET (min 32 chars)
#   COOKIE_SECRET      (min 32 chars)
```

---

## Run

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- API:       http://localhost:5000/api/v1
- API docs:  http://localhost:5000/api-docs

---

## Stop

```bash
docker compose down
```

MongoDB data is preserved in the `mongodb_data` volume.
To also remove the volume (wipes database):

```bash
docker compose down -v
```

---

## Rebuild after code changes

```bash
docker compose up --build
```

Only the changed service is rebuilt. Add `--no-cache` to force a full rebuild:

```bash
docker compose build --no-cache
docker compose up
```

---

## View logs

```bash
# All services
docker compose logs -f

# Single service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mongodb
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `backend` exits immediately | Missing or invalid `.env.docker` secrets | Check secret length ≥ 32 chars |
| `frontend depends on backend (healthy)` waits forever | Backend health check failing | `docker compose logs backend` |
| `CORS error` in browser | `ALLOWED_ORIGINS` mismatch | Ensure `.env.docker` has `ALLOWED_ORIGINS=http://localhost:3000` |
| MongoDB connection refused | Mongo not ready yet | Backend retries 5×; wait or check `docker compose logs mongodb` |
| Frontend shows stale build | Vite bakes env at build time | Rebuild: `docker compose build frontend` |

---

## Local development (without Docker)

Local dev is unchanged — use your `.env` file and run:

```bash
npm run dev          # backend (nodemon)
cd client && npm run dev   # frontend (Vite)
```

---

## Running tests

Tests use `mongodb-memory-server` and are always run outside Docker:

```bash
npm test
```
