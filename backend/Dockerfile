# Dockerfile for portfolio backend + frontend
# Build: docker build -f backend/Dockerfile -t portfolio .
# Run: docker run -p 3001:3001 --env-file backend/.env portfolio

FROM node:20-alpine AS builder

# Build frontend
WORKDIR /app/frontend
COPY app/package*.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

# Build backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --production

# Final image
FROM node:20-alpine
WORKDIR /app

# Copy backend deps
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/package*.json ./
COPY backend/server.js ./
COPY backend/.env ./

# Copy built frontend
COPY --from=builder /app/frontend/dist ./dist

EXPOSE 3001

CMD ["node", "server.js"]
