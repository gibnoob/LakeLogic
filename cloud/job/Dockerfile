# ──────────────────────────────────────────────────────────────────────────────
# LakeLogic — Cloud Run Job Dockerfile
#
# This container runs once a month (triggered by Cloud Scheduler),
# downloads fresh data from MN DNR, and writes it to GCS.
# It then exits cleanly — Cloud Run Jobs are billed only for execution time.
#
# Build command (run from repo root):
#   docker build -f cloud/job/Dockerfile -t lakelogic-job .
#
# Deploy as a Cloud Run Job:
#   gcloud run jobs create lakelogic-refresh \
#     --image gcr.io/YOUR_PROJECT_ID/lakelogic-job \
#     --region us-central1 \
#     --set-env-vars GCS_BUCKET=lakelogic_bucket \
#     --memory 1Gi \
#     --task-timeout 3600
#
# Schedule monthly with Cloud Scheduler:
#   gcloud scheduler jobs create http lakelogic-monthly-refresh \
#     --schedule "0 3 1 * *" \
#     --uri "https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/YOUR_PROJECT_ID/jobs/lakelogic-refresh:run" \
#     --message-body "{}" \
#     --oauth-service-account-email YOUR_SERVICE_ACCOUNT@YOUR_PROJECT_ID.iam.gserviceaccount.com \
#     --location us-central1
# ──────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

WORKDIR /app

COPY cloud/job/package*.json ./
RUN npm ci --omit=dev

COPY cloud/job/refresh.js .

CMD ["node", "refresh.js"]
