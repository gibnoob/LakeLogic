# LakeLogic — Cloud Run Deployment
# This is the root Dockerfile used by  gcloud run deploy --source .
# It builds the cloud server using the shared public/ directory.

FROM node:20-alpine

WORKDIR /app

COPY cloud/package*.json ./
RUN npm install --omit=dev

COPY cloud/server.js .
COPY public/ ./public/

EXPOSE 8080
CMD ["node", "server.js"]
