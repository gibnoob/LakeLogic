#!/usr/bin/env node
/**
 * LakeLogic — Upload local data/ folder to Google Cloud Storage
 *
 * Run this once after  npm run download  to seed your GCS bucket,
 * then re-run monthly to keep the cloud data fresh.
 *
 * Usage:
 *   node scripts/upload-to-gcs.js
 *
 * Environment:
 *   GCS_BUCKET   - name of your GCS bucket (required)
 *
 * Authentication:
 *   Run  gcloud auth application-default login  once before using this.
 */

'use strict';

const { Storage } = require('@google-cloud/storage');
const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const BUCKET_NAME = process.env.GCS_BUCKET;
if (!BUCKET_NAME) {
    console.error('\n❌  GCS_BUCKET environment variable is not set.');
    console.error('    Example: set GCS_BUCKET=lakelogic-data && node scripts/upload-to-gcs.js\n');
    process.exit(1);
}

const DATA_DIR    = path.join(__dirname, '..', 'data');
const CONCURRENCY = 20;  // parallel uploads at a time

const storage = new Storage();
const bucket  = storage.bucket(BUCKET_NAME);

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function uploadFile(localPath, gcsPath) {
    await bucket.upload(localPath, { destination: gcsPath, resumable: false });
}

async function uploadDir(localDir, gcsPrefix) {
    if (!fs.existsSync(localDir)) {
        console.warn(`  ⚠  Skipping ${localDir} — directory not found`);
        return 0;
    }
    const files = fs.readdirSync(localDir).filter(f => f.endsWith('.json'));
    let done = 0;

    for (let i = 0; i < files.length; i += CONCURRENCY) {
        const batch = files.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async f => {
            await uploadFile(path.join(localDir, f), `${gcsPrefix}/${f}`);
            done++;
        }));
        process.stdout.write(`\r  Progress: ${Math.min(i + CONCURRENCY, files.length)}/${files.length} files...`);
    }
    process.stdout.write('\n');
    return done;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    const t0 = Date.now();
    console.log(`\n🪣  LakeLogic — Uploading data to GCS bucket: ${BUCKET_NAME}\n`);

    // Verify bucket is accessible
    try {
        await bucket.exists();
    } catch (e) {
        console.error(`\n❌  Cannot access bucket "${BUCKET_NAME}".`);
        console.error('    Make sure you have run:  gcloud auth application-default login');
        console.error('    And that the bucket exists in your Google Cloud project.\n');
        process.exit(1);
    }

    // 1. lakes.json
    const lakesFile = path.join(DATA_DIR, 'lakes.json');
    if (fs.existsSync(lakesFile)) {
        process.stdout.write('  Uploading lakes.json...');
        await uploadFile(lakesFile, 'lakes.json');
        const lakeCount = Object.keys(JSON.parse(fs.readFileSync(lakesFile))).length;
        console.log(` ✅  (${lakeCount.toLocaleString()} lakes)`);
    } else {
        console.warn('  ⚠  lakes.json not found — run npm run download first');
    }

    // 2. meta.json
    const metaFile = path.join(DATA_DIR, 'meta.json');
    if (fs.existsSync(metaFile)) {
        process.stdout.write('  Uploading meta.json...');
        await uploadFile(metaFile, 'meta.json');
        console.log(' ✅');
    }

    // 3. Stocking data
    console.log('\n  Uploading stocking data...');
    const stockingCount = await uploadDir(path.join(DATA_DIR, 'stocking'), 'stocking');
    console.log(`  ✅  ${stockingCount.toLocaleString()} stocking files uploaded`);

    // 4. Survey data
    console.log('\n  Uploading survey data...');
    const surveyCount = await uploadDir(path.join(DATA_DIR, 'surveys'), 'surveys');
    console.log(`  ✅  ${surveyCount.toLocaleString()} survey files uploaded`);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n🎉  Upload complete in ${elapsed}s`);
    console.log('    Your cloud server will use this fresh data on its next cold start.');
    console.log('    To force an immediate refresh: restart the Cloud Run service in the Google Cloud Console.\n');
}

main().catch(e => { console.error('\n❌ Fatal error:', e.message); process.exit(1); });
