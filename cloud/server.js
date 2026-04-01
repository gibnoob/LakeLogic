'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { Storage } = require('@google-cloud/storage');

// ─── Config ──────────────────────────────────────────────────────────────────
const PORT           = process.env.PORT           || 8080;
const BUCKET_NAME    = process.env.GCS_BUCKET;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

if (!BUCKET_NAME) {
    console.error('[startup] ERROR: GCS_BUCKET environment variable is not set.');
    process.exit(1);
}

const storage = new Storage();
const bucket  = bucket_ref();
function bucket_ref() { return storage.bucket(BUCKET_NAME); }

// ─── App setup ───────────────────────────────────────────────────────────────
const app = express();

app.use(cors({
    origin: ALLOWED_ORIGIN,
    methods: ['GET', 'POST'],
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Species name map ─────────────────────────────────────────────────────────
const SPECIES_NAMES = {
    WAE: 'Walleye', NOP: 'Northern Pike', MUE: 'Muskellunge', LMB: 'Largemouth Bass',
    SMB: 'Smallmouth Bass', BLG: 'Bluegill Sunfish', YEP: 'Yellow Perch', BLC: 'Black Crappie',
    WHC: 'White Crappie', RKB: 'Rock Bass', TLC: 'Tullibee (Cisco)', LKT: 'Lake Trout', LAT: 'Lake Trout',
    BRB: 'Brown Bullhead', BKB: 'Black Bullhead', YEB: 'Yellow Bullhead', CCF: 'Channel Catfish',
    FHC: 'Flathead Catfish', LKS: 'Lake Sturgeon', BUR: 'Burbot', PKS: 'Pumpkinseed Sunfish',
    HSF: 'Hybrid Sunfish', GSF: 'Green Sunfish', BKT: 'Brook Trout', BNT: 'Brown Trout',
    RBT: 'Rainbow Trout', SPK: 'Splake', PSH: 'Paddlefish', COC: 'Common Carp',
    FHM: 'Fathead Minnow', GZS: 'Gizzard Shad', SAR: 'Sauger', WTS: 'White Sucker',
    SXS: 'Saugeye', WON: 'White Bass', PMK: 'Pumpkinseed Sunfish', BOG: 'Bluegill Sunfish',
    BOF: 'Bowfin (Dogfish)', QIL: 'Quillback', GOS: 'Golden Shiner', WHS: 'White Sucker',
    JND: 'Johnny Darter', IOD: 'Iowa Darter', TPM: 'Tadpole Madtom', BNM: 'Bluntnose Minnow',
    BLB: 'Black Bullhead', CAP: 'Common Carp', CSH: 'Common Shiner', BNS: 'Blacknose Shiner',
    SPO: 'Spottail Shiner', SFS: 'Spotfin Shiner', CNM: 'Central Mudminnow', BND: 'Blacknose Dace',
    LND: 'Longnose Dace', CRC: 'Creek Chub', BKF: 'Blackfish', BKS: 'Blackchin Shiner',
    BST: 'Brook Stickleback', FTD: 'Finescale Dace', LED: 'Least Darter', PGS: 'Pugnose Shiner',
    BCS: 'Black Crappie',
};

// ─── In-memory stores ─────────────────────────────────────────────────────────
let localLakes    = {};   // dowId -> lake metadata
let localStocking = {};   // dowId -> [events]
let localSurveys  = {};   // dowId -> survey JSON

// ─── GCS helpers ─────────────────────────────────────────────────────────────
async function gcsReadJson(gcsPath) {
    const [content] = await storage.bucket(BUCKET_NAME).file(gcsPath).download();
    return JSON.parse(content.toString('utf8'));
}

async function gcsListFiles(prefix) {
    const [files] = await storage.bucket(BUCKET_NAME).getFiles({ prefix });
    return files;
}

/** Download GCS files in parallel, CONCURRENCY at a time */
async function parallelDownload(files, handler, concurrency = 40) {
    for (let i = 0; i < files.length; i += concurrency) {
        await Promise.all(files.slice(i, i + concurrency).map(handler));
    }
}

// ─── Startup: load everything from GCS into memory ───────────────────────────
async function loadFromGCS() {
    const t0 = Date.now();
    console.log('[startup] Loading data from GCS bucket:', BUCKET_NAME);

    // 1. Lake metadata ─────────────────────────────────────────────────────────
    try {
        localLakes = await gcsReadJson('lakes.json');
        console.log(`[startup] Loaded ${Object.keys(localLakes).length} lakes`);
    } catch (e) {
        console.error('[startup] Could not load lakes.json from GCS:', e.message);
        console.error('[startup] Run  npm run upload  to seed the bucket first.');
        process.exit(1);
    }

    // 2. Stocking data (parallel) ──────────────────────────────────────────────
    //    Files may be per-year (2024.json → { dowId: [events], ... })
    //    OR per-lake (03060200.json → { events: [...] }).
    //    Detect format by filename and handle both.
    const stockingFiles = await gcsListFiles('stocking/');
    let scount = 0;
    await parallelDownload(stockingFiles, async (file) => {
        if (!file.name.endsWith('.json')) return;
        const baseName = path.basename(file.name, '.json');
        try {
            const [content] = await file.download();
            const data = JSON.parse(content.toString('utf8'));

            // Detect format: year-based files have numeric 4-digit names (2000-2099)
            const isYearFile = /^\d{4}$/.test(baseName) && parseInt(baseName) >= 2000 && parseInt(baseName) <= 2099;

            if (isYearFile) {
                // Year-based: { "dowId": [events], "dowId2": [events], ... }
                const year = parseInt(baseName);
                Object.entries(data).forEach(([dowId, events]) => {
                    if (!Array.isArray(events)) return;
                    const normalized = dowId.padStart(8, '0');
                    if (!localStocking[normalized]) localStocking[normalized] = [];
                    events.forEach(e => {
                        if (e.species) e.species = e.species.replace(/\d+$/, '').trim();
                        localStocking[normalized].push({ ...e, year });
                    });
                });
                scount++;
            } else {
                // Per-lake format: { events: [...] }
                const dowId = baseName.padStart(8, '0');
                const events = data.events || [];
                events.forEach(e => { if (e.species) e.species = e.species.replace(/\d+$/, '').trim(); });
                localStocking[dowId] = events;
                scount++;
            }
        } catch { /* skip corrupt file */ }
    });
    // Sort each lake's stocking events by year
    Object.keys(localStocking).forEach(dowId => {
        localStocking[dowId].sort((a, b) => (a.year || 0) - (b.year || 0));
    });
    console.log(`[startup] Loaded stocking data for ${Object.keys(localStocking).length} lakes from ${scount} files`);

    // 3. Survey data (parallel) ────────────────────────────────────────────────
    const surveyFiles = await gcsListFiles('surveys/');
    let svcount = 0;
    await parallelDownload(surveyFiles, async (file) => {
        const base = path.basename(file.name);
        if (!base.endsWith('.json') || base.startsWith('stocking_')) return;
        const dowId = base.replace('.json', '');
        try {
            const [content] = await file.download();
            localSurveys[dowId] = JSON.parse(content.toString('utf8'));
            svcount++;
        } catch { /* skip corrupt file */ }
    });
    console.log(`[startup] Loaded surveys for ${svcount} lakes`);

    // 4. Rebuild accurate fishSpecies from stocking + survey data ─────────────
    console.log('[startup] Rebuilding fish species presence...');
    Object.keys(localLakes).forEach(dowId => {
        const speciesSet = new Set();

        const sData = localSurveys[dowId];
        if (sData) {
            if (sData.surveys) {
                sData.surveys.forEach(s => {
                    (s.fishCatchSummaries || []).forEach(fc => {
                        const name = SPECIES_NAMES[fc.species] || fc.species;
                        if (name && name.length > 3) speciesSet.add(name);
                    });
                    if (s.lengths) {
                        Object.keys(s.lengths).forEach(c => {
                            const name = SPECIES_NAMES[c] || c;
                            if (name && name.length > 3) speciesSet.add(name);
                        });
                    }
                });
            }
            if (sData.fish) {
                sData.fish.forEach(f => {
                    let name = SPECIES_NAMES[f.code];
                    if (!name && f.name && f.name.length > 3 && f.name.toLowerCase() !== f.code.toLowerCase()) name = f.name;
                    if (name && name.length > 3) speciesSet.add(name);
                });
            }
        }

        (localStocking[dowId] || []).forEach(e => {
            const s = e.species ? e.species.replace(/\d+$/, '').trim() : '';
            if (s.length > 3) speciesSet.add(s.replace(/\b\w/g, c => c.toUpperCase()));
        });

        localLakes[dowId].fishSpecies = Array.from(speciesSet).sort();
    });

    console.log(`[startup] Ready — ${Object.keys(localLakes).length} lakes in memory (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function localLakeToApiShape(lake) {
    return {
        id: lake.id,
        name: lake.name,
        county: lake.county,
        county_id: lake.county_id,
        nearest_town: lake.nearest_town,
        point: lake.lat != null ? { 'epsg:4326': [lake.lon, lake.lat] } : null,
        morphology: lake.morphology,
        fishSpecies: lake.fishSpecies,
        invasiveSpecies: lake.invasiveSpecies,
        specialFishingRegs: lake.specialFishingRegs,
        resources: lake.resources,
        bbox: lake.bbox,
    };
}

const WATER_BODY_WORDS = /\b(river|creek|lake|brook|pond|stream|fork|branch|run|spring|slough|canal|channel|falls|rapids|reservoir|north|south|east|west|upper|lower|middle|little|big|great|main|unnamed|tributary|drain)\b/i;
function isCleanSpecies(s) {
    const str = s.trim();
    if (!str || str.length < 3) return false;
    if (/^[A-Z]{2,4}$/.test(str)) return false;
    if (WATER_BODY_WORDS.test(str)) return false;
    if (/\d/.test(str)) return false;
    if (str.split(' ').length > 4) return false;
    return true;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// 1. Lake by DOW ID
app.get('/api/lake-by-id', (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const normalized = id.padStart(8, '0');
    const lake = localLakes[normalized];
    if (lake) return res.json({ status: 'OK', results: [localLakeToApiShape(lake)] });
    res.status(404).json({ status: 'NOT_FOUND', results: [] });
});

// 2. Lakes by Point
app.get('/api/lakes-by-point', (req, res) => {
    const { lat, lon, radius } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

    const radiusM  = radius === 'all' ? Infinity : parseFloat(radius || 8046);
    const radiusKm = radiusM === Infinity ? Infinity : radiusM / 1000;
    const latF = parseFloat(lat);
    const lonF = parseFloat(lon);

    const lakes = [];
    Object.values(localLakes).forEach(lake => {
        if (lake.lat == null) return;
        const dist = haversineKm(latF, lonF, lake.lat, lake.lon);
        if (dist <= radiusKm) lakes.push({ ...localLakeToApiShape(lake), _distKm: dist });
    });
    lakes.sort((a, b) => a._distKm - b._distKm);
    const capped = lakes.slice(0, radiusM === Infinity ? 500 : 200);
    res.json({ results: capped, status: 'OK', total: Object.keys(localLakes).length });
});

// 2b. Species List
app.get('/api/species-list', (req, res) => {
    const speciesSet = new Set();
    Object.values(localLakes).forEach(lake => {
        const raw  = lake.fishSpecies || [];
        const list = raw.length && typeof raw[0] === 'string' && raw[0].includes(',') ? raw[0].split(',') : raw;
        list.forEach(s => {
            const trimmed = s.trim().replace(/\b\w/g, c => c.toUpperCase());
            if (isCleanSpecies(trimmed)) speciesSet.add(trimmed);
        });
    });
    Object.values(localStocking).forEach(entries => {
        entries.forEach(e => { if (e.species && isCleanSpecies(e.species)) speciesSet.add(e.species); });
    });
    if (speciesSet.size === 0) {
        ['Walleye','Northern Pike','Muskellunge','Largemouth Bass','Smallmouth Bass','Bluegill Sunfish',
         'Black Crappie','White Crappie','Yellow Perch','Channel Catfish','Rainbow Trout','Brown Trout',
         'Brook Trout','Lake Trout','Tullibee (Cisco)','Sauger','Rock Bass','White Bass','Lake Sturgeon',
         'Burbot','Bowfin','Paddlefish','Flathead Catfish'].forEach(s => speciesSet.add(s));
    }
    res.json({ species: [...speciesSet].sort(), count: speciesSet.size });
});

// 3. Lake Name Search
app.get('/api/lake-search', (req, res) => {
    const { name, lat, lon, radius } = req.query;
    if (!name) return res.status(400).json({ error: 'name required' });

    const radiusM  = radius === 'all' ? Infinity : parseFloat(radius || Infinity);
    const radiusKm = radiusM === Infinity ? Infinity : radiusM / 1000;
    const latF = lat ? parseFloat(lat) : null;
    const lonF = lon ? parseFloat(lon) : null;
    const q    = name.toLowerCase();

    let matches = Object.values(localLakes).filter(l => l.name && l.name.toLowerCase().includes(q));
    if (latF && lonF && radiusKm !== Infinity) {
        matches = matches.filter(l => {
            if (l.lat == null) return false;
            return haversineKm(latF, lonF, l.lat, l.lon) <= radiusKm;
        });
    }
    res.json({ status: 'OK', results: matches.slice(0, 30).map(l => ({ id: l.id, name: l.name, county: l.county, type: 'lake' })) });
});

// 4. Geocode (Nominatim — fine to call live, it's a map utility not DNR data)
const fetch = require('node-fetch');
const USER_AGENT = 'LakeLogicCloud/1.0';
app.get('/api/geocode', async (req, res) => {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'address required' });
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ', Minnesota')}&format=json&limit=1&countrycodes=us`;
        const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        res.json(await r.json());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. Fish Stocking
app.get('/api/fish-stocking', (req, res) => {
    const dowId = req.query.id ? req.query.id.padStart(8, '0') : null;
    if (!dowId) return res.status(400).json({ error: 'id required' });
    const stocking = localStocking[dowId];
    if (stocking) return res.json({ id: dowId, stocking });
    res.json({ id: dowId, stocking: [] });
});

// 6. Fish Stocking History
app.get('/api/fish-stocking-history', (req, res) => {
    const { id, all, years } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const normalized = id.padStart(8, '0');
    const events     = localStocking[normalized] || [];
    const history    = {};

    if (all === 'true') {
        events.forEach(e => {
            const yr = String(e.year);
            if (!history[yr]) history[yr] = [];
            history[yr].push(e);
        });
    } else {
        const yearsBack = parseInt(years) || 10;
        const latest    = Math.min(2024, new Date().getFullYear() - 1);
        const cutoff    = latest - yearsBack;
        events.forEach(e => {
            if (parseInt(e.year) >= cutoff) {
                const yr = String(e.year);
                if (!history[yr]) history[yr] = [];
                history[yr].push(e);
            }
        });
    }
    res.json({ id: normalized, history });
});

// 7. Fish Survey
app.get('/api/fish-survey', (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const normalized = id.padStart(8, '0');
    const survey = localSurveys[normalized];
    if (survey) return res.json(survey);
    res.status(404).json({ error: 'No survey data for this lake' });
});

// 8. Species Search
app.get('/api/species-search', (req, res) => {
    const { species, sort = 'recent', limit = 100, lat, lon, radius } = req.query;
    if (!species) return res.status(400).json({ error: 'species required' });

    const q          = species.toLowerCase().trim();
    const radiusM    = radius === 'all' ? Infinity : parseFloat(radius || Infinity);
    const radiusKm   = radiusM === Infinity ? Infinity : radiusM / 1000;
    const latF       = lat ? parseFloat(lat) : null;
    const lonF       = lon ? parseFloat(lon) : null;
    const yearCutoff = new Date().getFullYear() - 10;

    const matches = [];
    Object.values(localLakes).forEach(lake => {
        if (latF && lonF && radiusKm !== Infinity) {
            if (lake.lat == null) return;
            if (haversineKm(latF, lonF, lake.lat, lake.lon) > radiusKm) return;
        }

        let totalStocked = 0, latestStockYear = null, latestStockQty = 0, latestStockLbs = 0, hasValidStocking = false;
        (localStocking[lake.id] || []).forEach(e => {
            if (e.species.toLowerCase().includes(q)) {
                const intYr = parseInt(e.year);
                if (intYr >= yearCutoff) hasValidStocking = true;
                totalStocked += e.quantity;
                if (!latestStockYear || intYr > latestStockYear) {
                    latestStockYear = intYr; latestStockQty = e.quantity; latestStockLbs = e.weightLbs;
                }
            }
        });

        let highestCpue = 0, totalSurveyed = 0, largestSurveyed = 0, latestSurveyDate = null, hasValidSurvey = false;
        if (localSurveys[lake.id]?.surveys) {
            localSurveys[lake.id].surveys.forEach(survey => {
                let foundInSurvey = false, surveyMaxCpue = 0;
                (survey.fishCatchSummaries || []).forEach(fc => {
                    const speciesName = SPECIES_NAMES[fc.species] || fc.species;
                    if (speciesName.toLowerCase().includes(q) || fc.species.toLowerCase() === q) {
                        foundInSurvey = true; hasValidSurvey = true;
                        totalSurveyed += fc.totalCatch || 0;
                        const cpue = parseFloat(fc.CPUE) || 0;
                        if (cpue > surveyMaxCpue) surveyMaxCpue = cpue;
                    }
                });
                if (survey.lengths) {
                    Object.entries(survey.lengths).forEach(([code, lengthData]) => {
                        const speciesName = SPECIES_NAMES[code] || code;
                        if (speciesName.toLowerCase().includes(q) || code.toLowerCase() === q) {
                            foundInSurvey = true; hasValidSurvey = true;
                            if (lengthData.maximum_length > largestSurveyed) largestSurveyed = lengthData.maximum_length;
                        }
                    });
                }
                if (foundInSurvey) {
                    const sDate = new Date(survey.surveyDate);
                    if (!latestSurveyDate || sDate > new Date(latestSurveyDate)) {
                        latestSurveyDate = survey.surveyDate; highestCpue = surveyMaxCpue;
                    }
                }
            });
        }

        if (hasValidStocking || hasValidSurvey) {
            matches.push({ ...localLakeToApiShape(lake), speciesMatch: true, totalStocked, latestStockYear, latestStockQty, latestStockLbs, highestCpue, totalSurveyed, largestSurveyed, latestSurveyDate });
        }
    });

    if (sort === 'cpue')           matches.sort((a, b) => (b.highestCpue || 0) - (a.highestCpue || 0));
    else if (sort === 'survey_count') matches.sort((a, b) => (b.totalSurveyed || 0) - (a.totalSurveyed || 0));
    else if (sort === 'largest')   matches.sort((a, b) => (b.largestSurveyed || 0) - (a.largestSurveyed || 0));
    else if (sort === 'survey_date') matches.sort((a, b) => new Date(b.latestSurveyDate || 0) - new Date(a.latestSurveyDate || 0));
    else if (sort === 'recent_stocked') matches.sort((a, b) => (b.latestStockYear || 0) - (a.latestStockYear || 0));
    else if (sort === 'quantity')  matches.sort((a, b) => (b.totalStocked || 0) - (a.totalStocked || 0));
    else if (sort === 'area')      matches.sort((a, b) => (b.morphology?.area || 0) - (a.morphology?.area || 0));
    else if (sort === 'name')      matches.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    res.json({ results: matches.slice(0, parseInt(limit)), total: matches.length, species });
});

// 9. Data status
app.get('/api/data-status', (req, res) => {
    // Build stockingYears from the stocking data in memory
    const yearSet = new Set();
    Object.values(localStocking).forEach(events => {
        events.forEach(e => { if (e.year) yearSet.add(Number(e.year)); });
    });
    const stockingYears = [...yearSet].sort((a, b) => a - b);

    res.json({
        hasLocalData: Object.keys(localLakes).length > 0,
        lakeCount: Object.keys(localLakes).length,
        stockingCount: Object.keys(localStocking).length,
        stockingYears,
        surveyCount: Object.keys(localSurveys).length,
        cachedSurveys: Object.keys(localSurveys).length,
        meta: { lastUpdated: new Date().toISOString(), source: 'gcs' },
        source: 'gcs',
        bucket: BUCKET_NAME,
    });
});

// 10. Health check
app.get('/api/health', (req, res) => {
    res.json({ ok: true, lakeCount: Object.keys(localLakes).length, source: 'gcs' });
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
loadFromGCS().then(() => {
    app.listen(PORT, () => {
        console.log(`\n🎣 LakeLogic (Cloud) running on port ${PORT}`);
        console.log(`   CORS allowed origin: ${ALLOWED_ORIGIN}\n`);
    });
}).catch(e => {
    console.error('[fatal] Failed to load data from GCS:', e);
    process.exit(1);
});
