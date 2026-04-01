'use strict';

const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// When running as a pkg executable, __dirname points inside the virtual snapshot.
// Use process.execDir (the folder containing the .exe) for real disk file access.
const RUNTIME_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(RUNTIME_DIR, 'public')));

// ─── Local data paths ────────────────────────────────────────────────────────
const DATA_DIR = path.join(RUNTIME_DIR, 'data');
const STOCKING_DIR = path.join(DATA_DIR, 'stocking');
const SURVEYS_DIR = path.join(DATA_DIR, 'surveys');
const LAKES_FILE = path.join(DATA_DIR, 'lakes.json');
const META_FILE = path.join(DATA_DIR, 'meta.json');

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
    BCS: 'Black Crappie'
};

// ─── In-memory stores ─────────────────────────────────────────────────────────
let localLakes = {};  // dowId -> lake metadata
let localStocking = {};  // dowId -> [events]
let localSurveys = {};   // dowId -> survey JSON from detail.cgi
let stockingCache = {};  // live scrape fallback cache

// ─── Load local data on startup ───────────────────────────────────────────────
function loadLocalData() {
    // Lake metadata
    if (fs.existsSync(LAKES_FILE)) {
        try {
            localLakes = JSON.parse(fs.readFileSync(LAKES_FILE));
            console.log(`[startup] Loaded ${Object.keys(localLakes).length} lakes from lakes.json`);
        } catch (e) { console.warn('[startup] Could not load lakes.json:', e.message); }
    }

    // Stocking data (per lake or per year)
    if (fs.existsSync(STOCKING_DIR)) {
        let scount = 0;
        fs.readdirSync(STOCKING_DIR).forEach(f => {
            if (!f.endsWith('.json')) return;
            const baseName = f.replace('.json', '');
            try {
                const raw = JSON.parse(fs.readFileSync(path.join(STOCKING_DIR, f)));

                // Detect format: year-based files have numeric 4-digit names (2000-2099)
                const isYearFile = /^\d{4}$/.test(baseName) && parseInt(baseName) >= 2000 && parseInt(baseName) <= 2099;

                if (isYearFile) {
                    // Year-based: { "dowId": [events], "dowId2": [events], ... }
                    const year = parseInt(baseName);
                    Object.entries(raw).forEach(([dowId, events]) => {
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
                    const dowId = baseName;
                    const events = raw.events || [];
                    events.forEach(e => {
                        if (e.species) e.species = e.species.replace(/\d+$/, '').trim();
                    });
                    localStocking[dowId] = events;
                    scount++;
                }
            } catch (e) { console.warn(`[startup] Could not load stocking/${f}:`, e.message); }
        });
        // Sort each lake's stocking events by year
        Object.keys(localStocking).forEach(dowId => {
            localStocking[dowId].sort((a, b) => (a.year || 0) - (b.year || 0));
        });
        console.log(`[startup] Loaded stocking data for ${Object.keys(localStocking).length} lakes from ${scount} files`);
    }

    // Surveys data (per lake)
    if (fs.existsSync(SURVEYS_DIR)) {
        let scount = 0;
        fs.readdirSync(SURVEYS_DIR).forEach(f => {
            if (!f.endsWith('.json') || f.startsWith('stocking_')) return;
            const dowId = f.replace('.json', '');
            try {
                localSurveys[dowId] = JSON.parse(fs.readFileSync(path.join(SURVEYS_DIR, f)));
                scount++;
            } catch (e) { console.warn(`[startup] Could not load surveys/${f}:`, e.message); }
        });
        console.log(`[startup] Loaded survey JSON maps for ${scount} lakes`);
    }

    if (Object.keys(localLakes).length === 0) {
        console.log('[startup] No local data found — run "npm run download" to build the local dataset');
        console.log('[startup] Falling back to live API scraping for all requests');
    } else {
        console.log('[startup] Rebuilding accurate fish species presence from local files...');
        Object.keys(localLakes).forEach(dowId => {
            const speciesSet = new Set();

            // From Surveys
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
                        if (!name && f.name && f.name.length > 3 && f.name.toLowerCase() !== f.code.toLowerCase()) {
                            name = f.name;
                        }
                        if (name && name.length > 3) speciesSet.add(name);
                    });
                }
            }

            // From Stocking
            const stData = localStocking[dowId] || [];
            stData.forEach(e => {
                const speciesName = e.species ? e.species.replace(/\d+$/, '').trim() : '';
                if (speciesName.length > 3) {
                    const sName = speciesName.replace(/\b\w/g, c => c.toUpperCase());
                    speciesSet.add(sName);
                }
            });

            localLakes[dowId].fishSpecies = Array.from(speciesSet).sort();
        });
    }
}

loadLocalData();

// ─── Helpers ─────────────────────────────────────────────────────────────────
const USER_AGENT = 'LakeLogicLocalTool/1.0 (personal use)';

async function dnrFetch(url) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 20000 });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res;
}

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Convert local lake record to the shape the frontend expects (same as by_id API)
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

// ─── 1. Lake by DOW ID ────────────────────────────────────────────────────────
app.get('/api/lake-by-id', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const normalized = id.padStart(8, '0');

    // Try local first
    if (localLakes[normalized]) {
        return res.json({ status: 'OK', results: [localLakeToApiShape(localLakes[normalized])] });
    }
    try {
        const r = await dnrFetch(`http://services.dnr.state.mn.us/api/lakefinder/by_id/v1?id=${id}`);
        const data = await r.json();
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── 2. Lakes by Point ────────────────────────────────────────────────────────
app.get('/api/lakes-by-point', async (req, res) => {
    const { lat, lon, radius, year } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

    const radiusM = radius === 'all' ? Infinity : parseFloat(radius || 8046);
    const stockYear = parseInt(year) || 2024;
    const latF = parseFloat(lat);
    const lonF = parseFloat(lon);
    const radiusKm = radiusM === Infinity ? Infinity : radiusM / 1000;
    const hasLocal = Object.keys(localLakes).length > 0;

    // ── Small radius (≤10 miles): always use the fast DNR by_point API ────────
    if (radiusM <= 16093) {
        try {
            const url = `http://services.dnr.state.mn.us/api/lakefinder/by_point/v1?lat=${lat}&lon=${lon}&radius=${radiusM}`;
            const resp = await dnrFetch(url);
            return res.json(await resp.json());
        } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    // ── Large radius with local data: pure in-memory haversine filter ─────────
    if (hasLocal) {
        const hasStocking = Object.keys(localStocking).length > 0;
        const candidateIds = Object.keys(localLakes);

        const Lakes = [];
        candidateIds.forEach(dowId => {
            const lake = localLakes[dowId];
            if (!lake || lake.lat == null) return;
            const dist = haversineKm(latF, lonF, lake.lat, lake.lon);
            if (dist <= radiusKm) Lakes.push({ ...localLakeToApiShape(lake), _distKm: dist });
        });
        Lakes.sort((a, b) => (a._distKm || 0) - (b._distKm || 0));
        const capped = Lakes.slice(0, radiusM === Infinity ? 500 : 200);
        return res.json({ results: capped, status: 'OK', total: candidateIds.length });
    }

    // ── Large radius WITHOUT local data: live scrape + batch coordinate fetch ──
    // This is slow (~30-60s) but works before the download completes.
    console.log(`[by-point] No local data — live large-radius search for year ${stockYear}, radius ${(radiusKm).toFixed(0)}km`);
    try {
        if (!stockingCache[stockYear]) {
            console.log(`[by-point] Scraping stocking year ${stockYear}...`);
            stockingCache[stockYear] = await scrapeStockingYear(stockYear);
        }
        const yearData = stockingCache[stockYear];
        const allDowIds = Object.keys(yearData);
        console.log(`[by-point] ${allDowIds.length} stocked lakes — fetching coordinates...`);

        // Batch-fetch coordinates (15 at a time, 80ms between batches)
        const CHUNK = 15;
        const lakes = [];
        for (let i = 0; i < allDowIds.length; i += CHUNK) {
            const batch = allDowIds.slice(i, i + CHUNK);
            const results = await Promise.all(batch.map(async id => {
                try {
                    const r = await dnrFetch(`http://services.dnr.state.mn.us/api/lakefinder/by_id/v1?id=${id}`);
                    const data = await r.json();
                    return data.results?.[0] || null;
                } catch { return null; }
            }));
            results.forEach((lake, j) => {
                if (!lake) return;
                const coords = lake.point?.['epsg:4326'];
                if (!coords) return;
                const [lkLon, lkLat] = coords;
                const dist = haversineKm(latF, lonF, lkLat, lkLon);
                if (dist <= radiusKm) lakes.push({ ...lake, _distKm: dist });
            });
            // cache it for next time
            results.forEach((lake, j) => {
                if (lake?.id && !localLakes[lake.id]) {
                    const coords = lake.point?.['epsg:4326'];
                    if (coords) {
                        localLakes[lake.id] = {
                            id: lake.id, name: lake.name, county: lake.county,
                            lat: coords[1], lon: coords[0],
                            morphology: lake.morphology || {},
                            fishSpecies: lake.fishSpecies || [],
                            invasiveSpecies: lake.invasiveSpecies || [],
                            specialFishingRegs: lake.specialFishingRegs || [],
                            resources: lake.resources || {},
                        };
                    }
                }
            });
            if (i + CHUNK < allDowIds.length) await new Promise(r => setTimeout(r, 80));
        }

        lakes.sort((a, b) => (a._distKm || 0) - (b._distKm || 0));
        const capped = lakes.slice(0, radiusM === Infinity ? 500 : 200);
        return res.json({ results: capped, status: 'OK', total: allDowIds.length, live: true });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// ─── 2b. Species List ─────────────────────────────────────────────────────────
// Location/water-body words that should NOT appear in a species name
const WATER_BODY_WORDS = /\b(river|creek|lake|brook|pond|stream|fork|branch|run|spring|slough|canal|channel|falls|rapids|reservoir|north|south|east|west|upper|lower|middle|little|big|great|main|unnamed|tributary|drain)\b/i;

function isCleanSpecies(s) {
    const str = s.trim();
    if (!str || str.length < 3) return false;          // too short
    if (/^[A-Z]{2,4}$/.test(str)) return false;        // acronyms like BCS, IOD, NRD
    if (WATER_BODY_WORDS.test(str)) return false;       // has water body word → location-prefixed
    if (/\d/.test(str)) return false;                   // has numbers
    if (str.split(' ').length > 4) return false;        // more than 4 words is usually a full site name
    return true;
}

app.get('/api/species-list', (req, res) => {
    const speciesSet = new Set();

    // From lake fishSpecies field (usually clean short names)
    Object.values(localLakes).forEach(lake => {
        const raw = lake.fishSpecies || [];
        const list = raw.length && typeof raw[0] === 'string' && raw[0].includes(',')
            ? raw[0].split(',')
            : raw;
        list.forEach(s => {
            const trimmed = s.trim().replace(/\b\w/g, c => c.toUpperCase());
            if (isCleanSpecies(trimmed)) speciesSet.add(trimmed);
        });
    });

    // From stocking data — also filter out location-prefixed entries
    Object.values(localStocking).forEach(entries => {
        entries.forEach(e => {
            if (e.species && isCleanSpecies(e.species)) speciesSet.add(e.species);
        });
    });

    // Fallback common species if no local data yet
    if (speciesSet.size === 0) {
        const common = ['Walleye', 'Northern Pike', 'Muskellunge', 'Tiger Muskellunge', 'Largemouth Bass',
            'Smallmouth Bass', 'Bluegill Sunfish', 'Black Crappie', 'White Crappie',
            'Yellow Perch', 'Channel Catfish', 'Rainbow Trout', 'Brown Trout', 'Brook Trout',
            'Lake Trout', 'Cisco', 'Tullibee (Cisco)', 'Whitefish', 'Sauger', 'Rock Bass',
            'White Bass', 'Lake Sturgeon', 'Burbot', 'Bowfin', 'Paddlefish', 'Flathead Catfish'];
        common.forEach(s => speciesSet.add(s));
    }

    res.json({ species: [...speciesSet].sort(), count: speciesSet.size });
});


// ─── 3. Lake Name Search (Gazetteer) ─────────────────────────────────────────
app.get('/api/lake-search', async (req, res) => {
    const { name, lat, lon, radius } = req.query;
    if (!name) return res.status(400).json({ error: 'name required' });

    const radiusM = radius === 'all' ? Infinity : parseFloat(radius || Infinity);
    const latF = lat ? parseFloat(lat) : null;
    const lonF = lon ? parseFloat(lon) : null;
    const radiusKm = radiusM === Infinity ? Infinity : radiusM / 1000;

    // Try local lakes first for instant results
    if (Object.keys(localLakes).length > 0) {
        const q = name.toLowerCase();
        let matches = Object.values(localLakes)
            .filter(l => l.name && l.name.toLowerCase().includes(q));

        if (latF && lonF && radiusKm !== Infinity) {
            matches = matches.filter(l => {
                if (l.lat == null) return false;
                const dist = haversineKm(latF, lonF, l.lat, l.lon);
                return dist <= radiusKm;
            });
        }

        matches = matches.slice(0, 30);

        if (matches.length > 0) {
            return res.json({ status: 'OK', results: matches.map(l => ({ id: l.id, name: l.name, county: l.county, type: 'lake' })) });
        }
    }

    // Fallback: DNR Gazetteer API
    try {
        const url = `http://services.dnr.state.mn.us/api/gazetteer/v1?name=${encodeURIComponent(name)}&type=lake`;
        const r = await dnrFetch(url);
        res.json(await r.json());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── 4. Geocode Address (Nominatim) ──────────────────────────────────────────
app.get('/api/geocode', async (req, res) => {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'address required' });
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ', Minnesota')}&format=json&limit=1&countrycodes=us`;
        const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        res.json(await r.json());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── 5. Fish Stocking ─────────────────────────────────────────────────────────
app.get('/api/fish-stocking', async (req, res) => {
    const dowId = req.query.id ? req.query.id.padStart(8, '0') : null;
    if (!dowId) return res.status(400).json({ error: 'id required' });

    if (localStocking[dowId]) {
        return res.json({ id: dowId, stocking: localStocking[dowId] });
    }

    // Live scrape fallback if not stored
    try {
        const history = await scrapePerLakeStocking(dowId);
        // scrapePerLakeStocking returns { YYYY: [entries] }, flatten it:
        const merged = [];
        Object.entries(history).forEach(([yr, entries]) => {
            entries.forEach(e => merged.push({ ...e, year: parseInt(yr) }));
        });
        merged.sort((a, b) => a.year - b.year);
        res.json({ id: dowId, stocking: merged });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── 6. Fish Stocking History (using DNR mobile CGI) ─────────────────────────
// Scrapes per-lake stocking table from the real CGI endpoint — 100% accurate
async function scrapePerLakeStocking(dowId) {
    const cacheFile = path.join(SURVEYS_DIR, `stocking_${dowId}.json`);
    if (fs.existsSync(cacheFile)) {
        const age = Date.now() - fs.statSync(cacheFile).mtimeMs;
        if (age < 7 * 24 * 3600 * 1000) { // cache 7 days
            const history = JSON.parse(fs.readFileSync(cacheFile));
            Object.values(history).forEach(entries => {
                entries.forEach(e => {
                    if (e.species) e.species = e.species.replace(/\d+$/, '').trim();
                });
            });
            return history;
        }
    }
    const url = `https://maps.dnr.state.mn.us/cgi-bin/lakefinder/fish_stocking.cgi?downum=${dowId}`;
    const html = await dnrFetch(url).then(r => r.text());
    const $ = cheerio.load(html);
    const history = {};
    // Table: Year | Species | Size | Number | Pounds
    let currentYear = null;
    $('table.table tbody tr').each((_, tr) => {
        const cells = $(tr).find('td');
        if (cells.length < 4) return;

        const parsedYear = parseInt($(cells[0]).text().trim());
        if (!isNaN(parsedYear) && parsedYear >= 1980 && parsedYear <= 2030) {
            currentYear = parsedYear;
        }
        if (!currentYear) return;

        const species = $(cells[1]).text().trim().replace(/\d+$/, '').trim();
        const size = $(cells[2]).text().trim();
        const qty = parseInt($(cells[3]).text().replace(/,/g, '')) || 0;
        const lbs = parseFloat($(cells[4])?.text().replace(/,/g, '')) || 0;

        if (!species) return;
        if (!history[currentYear]) history[currentYear] = [];
        history[currentYear].push({ species, fishType: size, quantity: qty, weightLbs: lbs });
    });
    try { fs.writeFileSync(cacheFile, JSON.stringify(history)); } catch { }
    return history;
}

app.get('/api/fish-stocking-history', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const normalized = id.padStart(8, '0');
    const useAll = req.query.all === 'true';
    const yearsBack = parseInt(req.query.years) || 10;
    try {
        // Always use per-lake CGI — it's accurate and caches locally
        const allHistory = await scrapePerLakeStocking(normalized);
        let history = {};
        if (useAll) {
            history = allHistory;
        } else {
            const latest = Math.min(2024, new Date().getFullYear() - 1);
            const cutoff = latest - yearsBack;
            Object.entries(allHistory).forEach(([yr, entries]) => {
                if (parseInt(yr) >= cutoff) history[yr] = entries.map(e => ({ ...e, year: parseInt(yr) }));
            });
        }
        res.json({ id: normalized, history });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── 7. Fish Survey ────────────────────────────────────
app.get('/api/fish-survey', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const normalized = id.padStart(8, '0');

    // Always prefer the rich detail.cgi JSON if we downloaded it
    if (localSurveys[normalized]) {
        return res.json(localSurveys[normalized]);
    }

    const cacheFile = path.join(SURVEYS_DIR, `${normalized}.json`);
    if (fs.existsSync(cacheFile)) {
        try { return res.json(JSON.parse(fs.readFileSync(cacheFile))); } catch { }
    }
    try {
        const url = `https://maps.dnr.state.mn.us/cgi-bin/lakefinder/detail.cgi?type=lake_survey&id=${normalized}`;
        const data = await dnrFetch(url).then(r => r.json());
        if (data && data.result) {
            try { fs.writeFileSync(cacheFile, JSON.stringify(data.result)); } catch { }
            return res.json(data.result);
        }
        res.status(404).json({ error: 'No survey data' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── 8. Species Search ────────────────────────────────────────────────────────
app.get('/api/species-search', async (req, res) => {
    const { species, sort = 'recent', limit = 100, lat, lon, radius } = req.query;
    if (!species) return res.status(400).json({ error: 'species required' });

    const q = species.toLowerCase().trim();
    const radiusM = radius === 'all' ? Infinity : parseFloat(radius || Infinity);
    const latF = lat ? parseFloat(lat) : null;
    const lonF = lon ? parseFloat(lon) : null;
    const radiusKm = radiusM === Infinity ? Infinity : radiusM / 1000;
    const yearCutoff = new Date().getFullYear() - 10;

    const matches = [];
    Object.values(localLakes).forEach(lake => {
        if (latF && lonF && radiusKm !== Infinity) {
            if (lake.lat == null) return;
            const dist = haversineKm(latF, lonF, lake.lat, lake.lon);
            if (dist > radiusKm) return;
        }
        let totalStocked = 0, latestStockYear = null, latestStockQty = 0, latestStockLbs = 0;
        let hasValidStocking = false;

        const entries = localStocking[lake.id] || [];
        entries.forEach(e => {
            if (e.species.toLowerCase().includes(q)) {
                const intYr = parseInt(e.year);
                if (intYr >= yearCutoff) {
                    hasValidStocking = true;
                }
                totalStocked += e.quantity;
                if (!latestStockYear || intYr > latestStockYear) {
                    latestStockYear = intYr;
                    latestStockQty = e.quantity;
                    latestStockLbs = e.weightLbs;
                }
            }
        });

        let highestCpue = 0, totalSurveyed = 0, largestSurveyed = 0, latestSurveyDate = null;
        let hasValidSurvey = false;

        if (localSurveys[lake.id] && localSurveys[lake.id].surveys) {
            localSurveys[lake.id].surveys.forEach(survey => {
                let foundInSurvey = false;
                let surveyMaxCpue = 0;
                if (survey.fishCatchSummaries) {
                    survey.fishCatchSummaries.forEach(fc => {
                        const speciesName = SPECIES_NAMES[fc.species] || fc.species;
                        if (speciesName.toLowerCase().includes(q) || fc.species.toLowerCase() === q) {
                            foundInSurvey = true;
                            hasValidSurvey = true;
                            totalSurveyed += fc.totalCatch || 0;
                            const cpue = parseFloat(fc.CPUE) || 0;
                            if (cpue > surveyMaxCpue) surveyMaxCpue = cpue;
                        }
                    });
                }

                if (survey.lengths) {
                    Object.entries(survey.lengths).forEach(([speciesCode, lengthData]) => {
                        const speciesName = SPECIES_NAMES[speciesCode] || speciesCode;
                        if (speciesName.toLowerCase().includes(q) || speciesCode.toLowerCase() === q) {
                            foundInSurvey = true;
                            hasValidSurvey = true;
                            if (lengthData.maximum_length > largestSurveyed) {
                                largestSurveyed = lengthData.maximum_length;
                            }
                        }
                    });
                }

                if (foundInSurvey) {
                    const sDate = new Date(survey.surveyDate);
                    if (!latestSurveyDate || sDate > new Date(latestSurveyDate)) {
                        latestSurveyDate = survey.surveyDate;
                        highestCpue = surveyMaxCpue;
                    }
                }
            });
        }

        if (hasValidStocking || hasValidSurvey) {
            matches.push({
                ...localLakeToApiShape(lake),
                speciesMatch: true,
                totalStocked,
                latestStockYear,
                latestStockQty,
                latestStockLbs,
                highestCpue,
                totalSurveyed,
                largestSurveyed,
                latestSurveyDate
            });
        }
    });

    // Sort
    if (sort === 'cpue') matches.sort((a, b) => (b.highestCpue || 0) - (a.highestCpue || 0));
    else if (sort === 'survey_count') matches.sort((a, b) => (b.totalSurveyed || 0) - (a.totalSurveyed || 0));
    else if (sort === 'largest') matches.sort((a, b) => (b.largestSurveyed || 0) - (a.largestSurveyed || 0));
    else if (sort === 'survey_date') matches.sort((a, b) => new Date(b.latestSurveyDate || 0) - new Date(a.latestSurveyDate || 0));
    else if (sort === 'recent_stocked') matches.sort((a, b) => (b.latestStockYear || 0) - (a.latestStockYear || 0));
    else if (sort === 'quantity') matches.sort((a, b) => (b.totalStocked || 0) - (a.totalStocked || 0));
    else if (sort === 'area') matches.sort((a, b) => (b.morphology?.area || 0) - (a.morphology?.area || 0));
    else if (sort === 'name') matches.sort((a, b) => (a.name || '').localeCompare(b.name || ''));


    res.json({ results: matches.slice(0, parseInt(limit)), total: matches.length, species });
});

// ─── 9. Local data status ─────────────────────────────────────────────────────
app.get('/api/data-status', (req, res) => {
    const meta = fs.existsSync(META_FILE) ? JSON.parse(fs.readFileSync(META_FILE)) : null;
    // Build actual stocking years from event data
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
        cachedSurveys: fs.existsSync(SURVEYS_DIR) ? fs.readdirSync(SURVEYS_DIR).length : 0,
        meta,
    });
});

// ─── Clear caches ─────────────────────────────────────────────────────────────
app.post('/api/clear-cache', (req, res) => {
    stockingCache = {};
    res.json({ ok: true, message: 'Live scrape cache cleared' });
});

// ─── Reload local data ────────────────────────────────────────────────────────
app.post('/api/reload-data', (req, res) => {
    try { loadLocalData(); res.json({ ok: true, lakeCount: Object.keys(localLakes).length }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ ok: true, lakeCount: Object.keys(localLakes).length, stockingYears: Object.keys(localStocking).length });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCRAPERS (used as live fallback when local data is missing)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Stocking scraper ─────────────────────────────────────────────────────────
function normFishType(raw) {
    const s = (raw || '').toLowerCase();
    if (s.startsWith('fry')) return 'fry';
    if (s.startsWith('finger')) return 'fingerling';
    if (s.startsWith('year')) return 'yearling';
    if (s.startsWith('adult')) return 'adult';
    return s.replace(/s$/, '');
}

async function scrapeStockingYear(year) {
    const url = `https://www.dnr.state.mn.us/lakefind/showstocking.html?year=${year}&county=&species=`;
    const r = await dnrFetch(url);
    const html = await r.text();
    const $ = cheerio.load(html);
    const result = {};

    let currentDow = null;
    let currentName = null;

    // DNR changed their HTML layout! It's no longer <dl><dt><dd>.
    // It's now in <div class="col-sm-8"><p>...<br>...</p></div>
    const container = $('.col-sm-8').first();
    if (container.length) {
        // Replace <br> tags with \n so we can split cleanly
        container.find('br').replaceWith('\n');
        const lines = container.text().split('\n');

        for (let line of lines) {
            line = line.replace(/\u00A0/g, ' ').trim(); // exact non-breaking space replacement
            if (!line) continue;

            // Check if this line introduces a new lake, e.g., "Big Pine - 01015700"
            const lakeMatch = line.match(/^(.+?)\s*[-–]\s*(\d{7,8})$/);
            if (lakeMatch) {
                currentName = lakeMatch[1].trim();
                currentDow = lakeMatch[2].padStart(8, '0');
                continue;
            }

            // If we have a current lake, check if this line is a stocking event
            if (currentDow) {
                // e.g., "Walleye - 5,161 yearlings weighing 258.9 lbs."
                // Text might have trailing superscripts like 2: "lbs.2"
                const eventMatch = line.match(/^(.+?)\s*[-–]\s*([\d,]+)\s+(fry|fingerlings?|yearlings?|adults?)\s+weighing\s+([\d,.]+)\s*lbs?/i);
                if (eventMatch) {
                    const species = eventMatch[1].trim().replace(/\s+/g, ' ');
                    const quantity = parseInt(eventMatch[2].replace(/,/g, ''));
                    const fishType = normFishType(eventMatch[3]);
                    const weightLbs = parseFloat(eventMatch[4].replace(/,/g, ''));

                    if (quantity > 0 && species.length > 1 && species.length < 80) {
                        if (!result[currentDow]) result[currentDow] = [];
                        result[currentDow].push({ lakeName: currentName, species, quantity, fishType, weightLbs });
                    }
                }
            }
        }
    }

    console.log(`[scrape] Year ${year}: ${Object.keys(result).length} lakes`);
    return result;
}

// \u2500\u2500\u2500 Survey scraper \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Parse a single cdata entry string like:
//   "Gear: <i>Standard gill nets</i><br/> CPUE: 5.00 (4.0-9.6)*<br/> Avg Weight: 1.29 lbs (1.1-1.9)*<br/>"
function parseCdataEntry(html) {
    const $ = cheerio.load(html);
    const text = $.text().replace(/\s+/g, ' ').trim();
    const gear = (text.match(/Gear:\s*(.+?)(?=CPUE:|$)/i) || [])[1]?.trim() || '';
    const cpueM = text.match(/CPUE:\s*([\d.]+)\s*\(([^)]*)\)/i);
    const weightM = text.match(/Avg Weight:\s*([\d.]+)\s*lbs\s*\(([^)]*)\)/i);
    const countM = text.match(/Count:\s*([\d,]+)/i);
    return {
        gear,
        cpue: cpueM ? parseFloat(cpueM[1]) : null,
        cpueRange: cpueM ? cpueM[2].trim() : null,
        avgWeight: weightM ? parseFloat(weightM[1]) : null,
        weightRange: weightM ? weightM[2].trim() : null,
        count: countM ? parseInt(countM[1].replace(/,/g, '')) : null,
    };
}

// Parse access HTML table rows
function parseAccessTable(html) {
    const $ = cheerio.load(html);
    const accesses = [];
    $('table#accesses tbody tr, table[cellpadding="1"] tbody tr').each((_, tr) => {
        const cells = $(tr).find('td');
        if (cells.length < 2) return;
        const admin = $(cells[0]).text().trim();
        const type = $(cells[1]).text().trim();
        const lake = $(cells[2])?.text().trim() || '';
        const parking = $(cells[3])?.text().trim() || '';
        const notes = $(cells[4])?.text().trim() || '';
        if (admin || type) accesses.push({ admin, type, lake, parking, notes });
    });
    return accesses;
}

async function scrapeSurveyMobile(dowId) {
    const url = `https://maps.dnr.state.mn.us/cgi-bin/lakefinder/lk_survey_mobile.cgi?downum=${dowId}`;
    const html = await dnrFetch(url).then(r => r.text());

    // --- Survey date and lake info ---
    const dateM = html.match(/Survey Date:\s*<b>([\d\-]+)<\/b>/i);
    const nameM = html.match(/Name:\s*([^\n<]+)<br/i);
    const surveyDate = dateM?.[1]?.trim() || null;
    const lakeName = nameM?.[1]?.trim() || null;

    // --- Lake characteristics ---
    const areaM = html.match(/Lake Area \(acres\):\s*([\d.,]+)/i);
    const depthM = html.match(/Maximum Depth \(ft\):\s*([\d.]+)/i);
    const clarityM = html.match(/Water Clarity \(ft\):\s*([\d.]+)/i);
    const littoralM = html.match(/Littoral Area \(acres\):\s*([\d.,]+)/i);
    const characteristics = {
        areaAcres: areaM ? parseFloat(areaM[1].replace(/,/g, '')) : null,
        maxDepthFt: depthM ? parseFloat(depthM[1]) : null,
        clarityFt: clarityM ? parseFloat(clarityM[1]) : null,
        littoralAcres: littoralM ? parseFloat(littoralM[1].replace(/,/g, '')) : null,
    };

    // --- Parse cdata JS arrays: split across TWO <script> blocks ---
    // 1st script: defines cdata/ldata vars + helpers
    // 2nd script: hasCatchData=true; cdata['WAE'].push('...');
    // Must search all script tags combined.
    const allScripts = [];
    const scriptTagRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let sm2;
    while ((sm2 = scriptTagRe.exec(html)) !== null) allScripts.push(sm2[1]);
    const allJS = allScripts.join('\n');

    const speciesCatch = {};
    const pushRe = /cdata\['([A-Z]{2,4})'\]\.push\('([\s\S]*?)'\);/g;
    let m;
    while ((m = pushRe.exec(allJS)) !== null) {
        const code = m[1];
        const entry = parseCdataEntry(m[2].replace(/\\'/g, "'").replace(/\\n/g, '\n'));
        if (!speciesCatch[code]) speciesCatch[code] = [];
        speciesCatch[code].push(entry);
    }

    // Build structured fish array
    const fish = Object.entries(speciesCatch).map(([code, entries]) => ({
        code,
        name: SPECIES_NAMES[code] || code,
        gearSamples: entries,
    })).sort((a, b) => a.name.localeCompare(b.name));

    // --- Access table ---
    const accesses = parseAccessTable(html);

    // Survey type from URL or page text
    const typeM = html.match(/Survey Type:\s*([^\n<]+)<br/i) ||
        html.match(/(Standard Survey|Targeted Survey|Type 1|Type 2)/i);
    const surveyType = typeM?.[1]?.trim() || 'Standard Survey';

    return {
        id: dowId,
        surveyDate,
        surveyType,
        lakeName,
        characteristics,
        fish,
        accesses,
        parsedAt: new Date().toISOString(),
        sourceUrl: `https://www.dnr.state.mn.us/lakefind/showreport.html?downum=${dowId}`,
    };
}

// Keep old scrapeSurvey name as alias for backward compat
const scrapeSurvey = scrapeSurveyMobile;


// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🎣 LakeLogic running at http://localhost:${PORT}\n`);
});
