#!/usr/bin/env node
/**
 * LakeLogic — Cloud Run Job Entrypoint
 *
 * This script is the entry point for the automated monthly data refresh.
 * It runs the full download (MN DNR → local temp) then upload (temp → GCS).
 *
 * It is designed to run as a Google Cloud Run Job triggered by Cloud Scheduler
 * on the 1st of every month. It spins up, refreshes data, and shuts down.
 *
 * Environment variables (set in Cloud Run Job config):
 *   GCS_BUCKET   — name of your GCS bucket (e.g. lakelogic_bucket)
 */

'use strict';

const { Storage } = require('@google-cloud/storage');
const fetch   = require('node-fetch');
const cheerio = require('cheerio');
const fs      = require('fs');
const path    = require('path');

const BUCKET_NAME = process.env.GCS_BUCKET;
if (!BUCKET_NAME) { console.error('[job] GCS_BUCKET not set'); process.exit(1); }

const storage       = new Storage();
const bucket        = storage.bucket(BUCKET_NAME);
const CONCURRENCY   = 15;
const DELAY_MS      = 100;
const USER_AGENT    = 'LakeLogicCloudJob/1.0';
const TMP_DIR       = path.join('/tmp', 'lakelogic-data');
const STOCKING_DIR  = path.join(TMP_DIR, 'stocking');
const SURVEYS_DIR   = path.join(TMP_DIR, 'surveys');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function dnrFetch(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 30000 });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
        } catch (e) {
            if (i === retries - 1) throw e;
            await sleep(500 * (i + 1));
        }
    }
}

function normFishType(raw) {
    const s = (raw || '').toLowerCase();
    if (s.startsWith('fry'))    return 'fry';
    if (s.startsWith('finger')) return 'fingerling';
    if (s.startsWith('year'))   return 'yearling';
    if (s.startsWith('adult'))  return 'adult';
    return s.replace(/s$/, '');
}

// ── Download lakes.json from GCS (it's the master DOW ID list) ───────────────
async function getLakesFromGCS() {
    console.log('[job] Fetching lakes.json from GCS...');
    const [content] = await bucket.file('lakes.json').download();
    const lakes = JSON.parse(content.toString('utf8'));
    console.log(`[job] ${Object.keys(lakes).length} lakes loaded`);
    return lakes;
}

// ── Download survey for one lake ──────────────────────────────────────────────
async function fetchAndUploadSurvey(dowId) {
    const url = `https://maps.dnr.state.mn.us/cgi-bin/lakefinder/detail.cgi?type=lake_survey&id=${dowId}`;
    try {
        const r    = await dnrFetch(url);
        const data = await r.json();
        if (data?.status === 'SUCCESS' && data.result) {
            const json = JSON.stringify(data.result);
            await bucket.file(`surveys/${dowId}.json`).save(json, { contentType: 'application/json' });
            return true;
        }
    } catch { /* non-fatal — skip this lake */ }
    return false;
}

// ── Download stocking for one lake ───────────────────────────────────────────
async function fetchAndUploadStocking(dowId) {
    const url = `https://maps.dnr.state.mn.us/cgi-bin/lakefinder/fish_stocking.cgi?downum=${dowId}`;
    try {
        const r      = await dnrFetch(url);
        const html   = await r.text();
        const $      = cheerio.load(html);
        const events = [];

        let currentYear = null;
        $('table.table tbody tr').each((_, tr) => {
            const cells = $(tr).find('td');
            if (cells.length < 4) return;
            const parsedYear = parseInt($(cells[0]).text().trim());
            if (!isNaN(parsedYear) && parsedYear >= 1980 && parsedYear <= 2030) currentYear = parsedYear;
            if (!currentYear) return;
            const species = $(cells[1]).text().trim().replace(/\d+$/, '').trim();
            const qty     = parseInt($(cells[3]).text().replace(/,/g, '')) || 0;
            const lbs     = parseFloat($(cells[4])?.text().replace(/,/g, '')) || 0;
            const size    = normFishType($(cells[2]).text().trim());
            if (species) events.push({ year: currentYear, species, quantity: qty, fishType: size, weightLbs: lbs });
        });

        if (events.length > 0) {
            events.sort((a, b) => a.year - b.year);
            const json = JSON.stringify({ dowId, events });
            await bucket.file(`stocking/${dowId}.json`).save(json, { contentType: 'application/json' });
            return true;
        }
    } catch { /* non-fatal */ }
    return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n🎣 LakeLogic Cloud Job — Monthly Data Refresh');
    console.log(`   Bucket: ${BUCKET_NAME}`);
    console.log(`   Started: ${new Date().toISOString()}\n`);

    const lakes     = await getLakesFromGCS();
    const allDowIds = Object.keys(lakes);
    let surveys = 0, stockings = 0;

    for (let i = 0; i < allDowIds.length; i += CONCURRENCY) {
        const batch = allDowIds.slice(i, i + CONCURRENCY);
        const tasks = batch.flatMap(id => [
            fetchAndUploadSurvey(id).then(ok  => ok && surveys++),
            fetchAndUploadStocking(id).then(ok => ok && stockings++),
        ]);
        await Promise.all(tasks);
        if (i % 150 === 0) console.log(`[job] Progress: ${Math.min(i + CONCURRENCY, allDowIds.length)}/${allDowIds.length} lakes...`);
        await sleep(DELAY_MS);
    }

    // Write an updated meta.json to GCS
    const meta = {
        lastUpdated: new Date().toISOString(),
        lakeCount: allDowIds.length,
        surveysRefreshed: surveys,
        stockingsRefreshed: stockings,
        source: 'cloud-run-job',
    };
    await bucket.file('meta.json').save(JSON.stringify(meta, null, 2), { contentType: 'application/json' });

    console.log('\n✅ Refresh complete!');
    console.log(`   Surveys uploaded:   ${surveys}`);
    console.log(`   Stockings uploaded: ${stockings}`);
    console.log(`   Finished: ${new Date().toISOString()}\n`);
}

main().catch(e => { console.error('[job] Fatal:', e); process.exit(1); });
