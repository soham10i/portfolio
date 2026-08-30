# Portfolio: one image serving the built frontend and the API.
#
#   docker build -f backend/Dockerfile -t portfolio .
#   docker run -p 3001:3001 -e LLM_API_BASE=... -e ADMIN_TOKEN=... portfolio
#
# Secrets are passed at RUN time, never baked in. The previous version had
# `COPY backend/.env ./`, which writes the API key and admin token into an
# image layer where anyone who can pull the image can read them back out with
# `docker history`. That line is gone and must not come back.

# ── build ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /build/app
COPY app/package*.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

# ── runtime ──────────────────────────────────────────────────────────────
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /build/backend/node_modules ./node_modules
COPY --from=builder /build/backend/package*.json ./
COPY backend/server.js ./
COPY backend/src ./src
# Study notes are content the API serves; without this the notes list is empty
# in production, which is exactly the kind of bug that only shows up on deploy.
COPY backend/notes ./notes
# MedQA RAG index and seed data — without this the MedQA endpoint returns 503
# "index not found" in production. The files are ~1 MB total and read-only.
COPY backend/data ./data

# server.js resolves the frontend as path.join(__dirname, '../app/dist').
# With server.js at /app/server.js that normalises to /app/dist, so this is
# the right destination despite how the path in the source reads.
COPY --from=builder /build/app/dist ./dist

# The contact mailbox is the only path the process writes to at runtime.
RUN chown -R node:node /app

# Never run as root. The base image ships an unprivileged `node` user.
USER node

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
