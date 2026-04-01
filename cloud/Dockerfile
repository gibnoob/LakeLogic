# ──────────────────────────────────────────────────────────────────────────────
# LakeLogic Cloud Dockerfile
#
# Build context must be the REPO ROOT (not the cloud/ subfolder) so Docker
# can access the shared public/ directory.
#
# Build command (run from repo root):
#   docker build -f cloud/Dockerfile -t lakelogic-cloud .
#
# Run locally for testing:
#   docker run -p 3000:8080 --env-file cloud/.env lakelogic-cloud
# ──────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

WORKDIR /app

# Install production dependencies first (layer-cached unless package.json changes)
COPY cloud/package*.json ./
RUN npm ci --omit=dev

# Copy the cloud server
COPY cloud/server.js .

# Copy the shared frontend assets (HTML, CSS, JS, logos)
COPY public/ ./public/

# Cloud Run always injects PORT — default 8080
EXPOSE 8080

CMD ["node", "server.js"]
