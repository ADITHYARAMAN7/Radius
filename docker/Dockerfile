# =============================================================================
# Radius — single Cloud Run service
#
# One container serves the API and the built React SPA. That is deliberate: it
# means one deploy, one URL, no CORS between the two halves, and a shared event
# link works the moment it is pasted.
#
# Build from the REPOSITORY ROOT, not from this directory:
#   docker build -f docker/Dockerfile -t radius .
#
# The VITE_* values are build arguments, not runtime env vars, because Vite
# inlines them into the bundle at build time. They are public by design — the
# Firebase web config is meant to ship to browsers, and security comes from
# Firestore rules and the API, never from hiding them.
# =============================================================================

# ----------------------------------------------------------------- frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

# Copy manifests first so `npm ci` is cached until dependencies actually change.
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

COPY frontend/ ./

# Leave VITE_API_BASE_URL empty: the API serves this bundle, so /api is same-origin.
ARG VITE_API_BASE_URL=""
ARG VITE_FIREBASE_API_KEY=""
ARG VITE_FIREBASE_AUTH_DOMAIN=""
ARG VITE_FIREBASE_PROJECT_ID=""
ARG VITE_FIREBASE_STORAGE_BUCKET=""
ARG VITE_FIREBASE_MESSAGING_SENDER_ID=""
ARG VITE_FIREBASE_APP_ID=""
ARG VITE_GOOGLE_MAPS_API_KEY=""

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY

RUN npm run build

# ------------------------------------------------------------------ backend
FROM node:20-alpine AS backend-build

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json* ./
RUN npm install

COPY backend/ ./
RUN npm run build

# Drop dev dependencies so only what the server actually needs is copied forward.
RUN npm prune --omit=dev

# ------------------------------------------------------------------ runtime
FROM node:20-alpine AS runtime

# dumb-init gives PID 1 correct signal handling, so Cloud Run's SIGTERM reaches
# Node and in-flight requests finish during a deploy instead of being cut off.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production \
    PORT=8080 \
    SERVE_STATIC=true

WORKDIR /app

# The server resolves the SPA at ../../frontend/dist relative to backend/dist,
# so this layout has to match what index.ts expects.
COPY --from=backend-build --chown=node:node /app/backend/dist ./backend/dist
COPY --from=backend-build --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --from=backend-build --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=frontend-build --chown=node:node /app/frontend/dist ./frontend/dist

# Never run as root.
USER node

EXPOSE 8080

# Cloud Run sets PORT itself; this only matters for a plain `docker run`.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "backend/dist/index.js"]
