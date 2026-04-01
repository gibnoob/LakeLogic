#!/usr/bin/env node
/**
 * LakeLogic — Local Data Download Script
 *
 * Usage:
 *   node scripts/download.js                  Full download (stocking and surveys for all lakes)
 *   node scripts/download.js --surveys-only   Download only surveys
 *   node scripts/download.js --stocking-only  Download only stocking
 */

'use strict';

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// ── Paths ──────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '..', 'data');
const STOCKING_DIR = path.join(DATA_DIR, 'stocking');
const SURVEYS_DIR = path.join(DATA_DIR, 'surveys');
const LAKES_FILE = path.join(DATA_DIR, 'lakes.json');
const META_FILE = path.join(DATA_DIR, 'meta.json');

// ── Config ─────────────────────────────────────────────────────────────────
const CONCURRENCY = 15;   // Concurrent lake fetches per batch
const DELAY_MS = 100;    // Between batches
const USER_AGENT = 'LakeLogicLocalTool/1.0 (personal-use data download)';

// ── Args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const surveysOnly = args.includes('--surveys-only');
const stockingOnly = args.includes('--stocking-only');
const doSurveys = !stockingOnly;
const doStocking = !surveysOnly;

// ── Init dirs ──────────────────────────────────────────────────────────────
[DATA_DIR, STOCKING_DIR, SURVEYS_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Helpers ────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function dnrFetch(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT },
                timeout: 30000,
            });
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
    if (s.startsWith('fry')) return 'fry';
    if (s.startsWith('finger')) return 'fingerling';
    if (s.startsWith('year')) return 'yearling';
    if (s.startsWith('adult')) return 'adult';
    return s.replace(/s$/, '');
}

function cleanSpecies(raw) {
    // Remove trailing numbers (e.g. Muskellunge1 -> Muskellunge)
    return raw.replace(/\d+$/, '').trim();
}

// ── Fetchers ───────────────────────────────────────────────────────────────

async function fetchSurvey(dowId) {
    const url = `https://maps.dnr.state.mn.us/cgi-bin/lakefinder/detail.cgi?type=lake_survey&id=${dowId}`;
    try {
        const r = await dnrFetch(url);
        const data = await r.json();
        // Extract surveys directly
        if (data && data.status === 'SUCCESS' && data.result) {
            const outFile = path.join(SURVEYS_DIR, `${dowId}.json`);
            fs.writeFileSync(outFile, JSON.stringify(data.result, null, 0));
            return true;
        }
    } catch { }
    return false;
}

async function fetchStocking(dowId) {
    const url = `https://maps.dnr.state.mn.us/cgi-bin/lakefinder/fish_stocking.cgi?downum=${dowId}`;
    try {
        const r = await dnrFetch(url);
        const html = await r.text();
        const $ = cheerio.load(html);
        const events = [];

        // DNR CGI results now use class="table" and have a slightly different structure
        const rows = $('table.table tr, table.alternatecolor tr');
        rows.each((i, row) => {
            if (i === 0) return; // Skip headers: Year, Species, Size, Number, Pounds
            const cells = $(row).find('td');
            if (cells.length >= 4) {
                const year = parseInt($(cells[0]).text().trim());
                if (!year || isNaN(year)) return;

                const rawSpecies = $(cells[1]).text().trim();
                const species = cleanSpecies(rawSpecies);

                const quantity = parseInt($(cells[2]).text().replace(/,/g, '')) || 
                                 parseInt($(cells[3]).text().replace(/,/g, '')) || 0;

                // Typical row: | 2024 | Walleye | fry | 43,000 | 0.4 |
                const fishType = normFishType($(cells[2]).text().trim());
                let weightLbs = 0;
                
                // If 5th cell exists, it's usually weight
                if (cells.length >= 5) {
                    const wtText = $(cells[4]).text().trim();
                    const wtMatch = wtText.match(/([\d.]+)/);
                    if (wtMatch) weightLbs = parseFloat(wtMatch[1]);
                }

                events.push({ year, species, quantity, fishType, weightLbs });
            }
        });

        if (events.length > 0) {
            // Sort history ascending
            events.sort((a, b) => a.year - b.year);
            const outFile = path.join(STOCKING_DIR, `${dowId}.json`);
            fs.writeFileSync(outFile, JSON.stringify({ dowId, events }, null, 0));
            return true;
        }
    } catch { }
    return false;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n🎣 LakeLogic — Full Offline Data Download\n');
    const t0 = Date.now();

    if (!fs.existsSync(LAKES_FILE)) {
        console.error('❌ Error: lakes.json not found!');
        console.error('Because the per-lake CGI endpoints require a DOW ID,');
        console.error('you must have lakes.json generated from the previous method first.');
        process.exit(1);
    }

    const lakesMap = JSON.parse(fs.readFileSync(LAKES_FILE, 'utf8'));
    const allDowIds = Object.keys(lakesMap);

    console.log(`🗺  Found ${allDowIds.length} lakes in lakes.json.`);

    let surveysDone = 0, stockingDone = 0;

    for (let i = 0; i < allDowIds.length; i += CONCURRENCY) {
        const batchIds = allDowIds.slice(i, i + CONCURRENCY);

        const tasks = [];
        for (const dowId of batchIds) {
            if (doSurveys) tasks.push(fetchSurvey(dowId).then(success => success && surveysDone++));
            if (doStocking) tasks.push(fetchStocking(dowId).then(success => success && stockingDone++));
        }

        await Promise.all(tasks);

        process.stdout.write(`\r  Progress: ${Math.min(i + CONCURRENCY, allDowIds.length)}/${allDowIds.length} lakes processed... `);
        await sleep(DELAY_MS);
    }

    console.log('\n');
    console.log(`✅ Download complete!`);
    console.log(`   - Survey files generated: ${surveysDone}`);
    console.log(`   - Stocking files generated: ${stockingDone}`);

    // Update meta file
    fs.writeFileSync(META_FILE, JSON.stringify({
        lastUpdated: new Date().toISOString(),
        lakeCount: allDowIds.length,
        offlineSurveys: surveysDone,
        offlineStockings: stockingDone
    }, null, 2));

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n⏳ Done in ${elapsed}s.\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
