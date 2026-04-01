/* ============================================================
   LakeLogic — Frontend Application Logic
   ============================================================ */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let map = null;
let markers = {};
let searchOrigin = null;
let allResults = [];
let filteredResults = [];
let currentLakeId = null;
let stockingChartInstance = null;
let activeDetailTab = 'stocking';
let currentStockingHistory = {};   // { year: [entries] } for current lake
let currentChartMetric = 'quantity';
let currentSurveys = [];           // Array of survey objects for current lake

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

function capitalizeWords(str) {
    if (!str) return '';
    return str.replace(/\b\w/g, c => c.toUpperCase());
}

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupKeyboardShortcuts();
    checkDataStatus();
    loadSpeciesList();
});

// ── Map Init ───────────────────────────────────────────────────────────────
function initMap() {
    map = L.map('map', { center: [46.7, -93.5], zoom: 7, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors', maxZoom: 18,
    }).addTo(map);
    map.on('click', (e) => {
        document.getElementById('address-input').value = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
        const body = document.getElementById('location-body');
        const icon = document.getElementById('location-icon');
        if (body && body.classList.contains('hidden')) {
            body.classList.remove('hidden');
            if (icon) icon.style.transform = 'rotate(0deg)';
        }
    });
}

// ── Species Datalist ────────────────────────────────────────────────
async function loadSpeciesList() {
    try {
        const res = await api('/api/species-list');
        const datalist = document.getElementById('species-datalist');
        if (!datalist) return;
        datalist.innerHTML = '';
        (res.species || []).forEach(sp => {
            const opt = document.createElement('option');
            opt.value = sp;
            datalist.appendChild(opt);
        });
    } catch { }
}



// ── Data Status ─────────────────────────────────────────────────────────────
async function checkDataStatus() {
    try {
        const status = await api('/api/data-status');
        const badge = document.getElementById('data-status-badge');
        if (status.hasLocalData) {
            // Support both local (stockingYears array) and cloud (stockingCount number) formats
            const stockingYears = status.stockingYears || [];
            const yearCount = stockingYears.length || status.stockingCount || 0;
            const surveyCount = status.cachedSurveys || status.surveyCount || 0;
            const yearRange = stockingYears.length >= 2
                ? `${stockingYears[0]}–${stockingYears[stockingYears.length - 1]}`
                : `${yearCount} lakes`;

            badge.textContent = `✅ ${status.lakeCount.toLocaleString()} lakes · ${yearCount} yrs stocking`;
            badge.title = `Data: ${yearRange} · ${surveyCount} surveys cached\nSource: ${status.source || 'local'}\nLast updated: ${status.meta?.lastUpdated?.slice(0, 10) || 'unknown'}`;
            badge.className = 'data-badge has-data';
        } else {
            badge.textContent = '⚠️ No local data — run: npm run download';
            badge.className = 'data-badge no-data';
        }
    } catch { }
}

// ── Search Mode Tabs ───────────────────────────────────────────────────────
function switchSearchTab(mode) {
    ['name', 'species'].forEach(m => {
        const p = document.getElementById(`panel-${m}`);
        const t = document.getElementById(`tab-${m}`);
        if (p) p.classList.toggle('hidden', m !== mode);
        if (t) t.classList.toggle('active', m === mode);
    });
}

async function executeLocationGeocode(address, radiusVal, isAll) {
    if (!address) return { lat: null, lon: null };

    let lat, lon;
    const coordMatch = address.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
        lat = parseFloat(coordMatch[1]); lon = parseFloat(coordMatch[2]);
    } else {
        showLoader('Geocoding address...');
        const geoRes = await api('/api/geocode', { address });
        if (!geoRes || geoRes.length === 0) throw new Error('Address not found. Please try a different location.');
        lat = parseFloat(geoRes[0].lat); lon = parseFloat(geoRes[0].lon);
    }

    searchOrigin = { lat, lon };
    map.setView([lat, lon], isAll ? 6 : 11);

    if (window._originMarker) map.removeLayer(window._originMarker);
    window._originMarker = L.circleMarker([lat, lon], {
        radius: 8, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.8, weight: 2,
    }).addTo(map).bindPopup('📍 Search origin');

    if (window._radiusCircle) map.removeLayer(window._radiusCircle);
    const radiusM = isAll ? Infinity : parseInt(radiusVal);
    if (!isAll && radiusM <= 241401) {
        window._radiusCircle = L.circle([lat, lon], {
            radius: radiusM, color: 'rgba(62,168,255,0.6)',
            fillColor: 'rgba(62,168,255,0.08)', fillOpacity: 1, weight: 1.5, dashArray: '6,4',
        }).addTo(map);
    }
    return { lat, lon };
}

// ── Search by Lake Name ────────────────────────────────────────────────────
async function searchByName() {
    const name = document.getElementById('lake-name-input').value.trim();
    const address = document.getElementById('address-input').value.trim();
    const radiusVal = document.getElementById('radius-input').value;
    const isAll = radiusVal === 'all';

    if (!name && !address) return;

    try {
        let lat = null, lon = null;
        if (address) {
            const coords = await executeLocationGeocode(address, radiusVal, isAll);
            lat = coords.lat; lon = coords.lon;
        }

        showLoader(`Searching...`);
        setStatus('loading', 'Searching...');

        if (!name && lat && lon) {
            const res = await api('/api/lakes-by-point', { lat, lon, radius: radiusVal });
            if (!res.results || res.results.length === 0) {
                showNoResults(`No stocked lakes found near that location.`); return;
            }
            const radiusMiles = isAll ? null : (parseInt(radiusVal) / 1609.34);
            const radiusLabel = isAll ? 'Anywhere in MN' : `${radiusMiles < 10 ? radiusMiles.toFixed(1) : Math.round(radiusMiles)} miles`;
            let titleStr = `${radiusLabel} from location — ${res.results.length} stocked lakes`;
            if (res.live) titleStr += ' ⚠️ live scrape';

            displayResults(res.results, titleStr, lat, lon);
            return;
        }

        const gazRes = await api('/api/lake-search', { name, lat, lon, radius: radiusVal });
        if (!gazRes.results || gazRes.results.length === 0) {
            showNoResults(`No lakes found matching "${name}".`); return;
        }
        setStatus('loading', `Loading ${gazRes.results.length} lake(s)...`);
        const lakes = await Promise.all(gazRes.results.slice(0, 30).map(r => fetchLakeById(r.id)));

        displayResults(lakes.filter(Boolean), `Search: "${name}"`, lat, lon);
    } catch (e) {
        showError(e.message);
    } finally { hideLoader(); setStatus('ready'); }
}



// ── Search by Species ──────────────────────────────────────────────────────
async function searchBySpecies() {
    const species = document.getElementById('species-search-input').value.trim();
    const sort = document.getElementById('sort-by').value;
    const address = document.getElementById('address-input').value.trim();
    const radiusVal = document.getElementById('radius-input').value;
    const isAll = radiusVal === 'all';

    if (!species) return;

    try {
        let lat = null, lon = null;
        if (address) {
            const coords = await executeLocationGeocode(address, radiusVal, isAll);
            lat = coords.lat; lon = coords.lon;
        }

        showLoader(`Searching lakes with "${species}"...`);
        setStatus('loading', 'Species search...');

        const res = await api('/api/species-search', { species, sort, limit: 5000, lat, lon, radius: radiusVal });
        if (!res.results || res.results.length === 0) {
            showNoResults(`No lakes found with species matching "${species}".`); return;
        }
        displayResults(res.results, `${res.total.toLocaleString()} lakes with "${species}" · showing ${res.results.length}`, lat, lon, species);
    } catch (e) {
        showError(e.message);
    } finally { hideLoader(); setStatus('ready'); }
}



// ── Toggle Location Filter ───────────────────────────────────────────────────
function toggleLocationFilter() {
    const body = document.getElementById('location-body');
    const icon = document.getElementById('location-icon');
    if (!body) return;
    if (body.classList.contains('hidden')) {
        body.classList.remove('hidden');
        if (icon) icon.style.transform = 'rotate(0deg)';
    } else {
        body.classList.add('hidden');
        if (icon) icon.style.transform = 'rotate(-90deg)';
    }
}
function clearLocationFilter() {
    document.getElementById('address-input').value = '';
    document.getElementById('radius-input').value = 'all';
    if (window._originMarker) map.removeLayer(window._originMarker);
    if (window._radiusCircle) map.removeLayer(window._radiusCircle);
    const name = document.getElementById('lake-name-input').value.trim();
    const species = document.getElementById('species-search-input').value.trim();
    if (name) searchByName();
    else if (species) searchBySpecies();
}

// ── Toggle Filters Sidebar ───────────────────────────────────────────────────
function toggleFilters() {
    const body = document.getElementById('filters-body');
    const icon = document.getElementById('filters-icon');
    if (!body) return;
    if (body.classList.contains('hidden')) {
        body.classList.remove('hidden');
        if (icon) icon.style.transform = 'rotate(0deg)';
    } else {
        body.classList.add('hidden');
        if (icon) icon.style.transform = 'rotate(-90deg)';
    }
}

// ── Fetch single lake by ID ────────────────────────────────────────────────
async function fetchLakeById(id) {
    try { const res = await api('/api/lake-by-id', { id }); return res.results?.[0] || null; }
    catch { return null; }
}

// ── Display Results ────────────────────────────────────────────────────────
function displayResults(lakes, title, originLat = null, originLon = null, isSpeciesResult = false) {
    allResults = lakes.map(lake => ({
        ...lake,
        distance: originLat != null
            ? haversineKm(originLat, originLon, lake.point?.['epsg:4326']?.[1], lake.point?.['epsg:4326']?.[0])
            : null,
        _isSpeciesResult: isSpeciesResult,
    }));
    applyFilters(title);
}

// ── Apply Filters ──────────────────────────────────────────────────────────
function applyFilters(titleOverride = null) {
    const accessFilter = document.getElementById('access-filter').value;
    const areaMin = parseFloat(document.getElementById('area-min').value) || 0;
    const areaMax = parseFloat(document.getElementById('area-max').value) || Infinity;

    filteredResults = allResults.filter(lake => {
        const area = lake.morphology?.area || 0;
        if (area > 0 && (area < areaMin || area > areaMax)) return false;
        if (accessFilter === 'access' && !lake.resources?.waterAccess) return false;
        return true;
    });
    sortResults(titleOverride);
}

// ── Sort Results ───────────────────────────────────────────────────────────
function sortResults(titleOverride = null) {
    const sortBy = document.getElementById('sort-by').value;
    filteredResults.sort((a, b) => {
        if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
        if (sortBy === 'area') return (b.morphology?.area || 0) - (a.morphology?.area || 0);
        if (sortBy === 'distance') return (a.distance ?? 9999) - (b.distance ?? 9999);
        if (sortBy === 'recent') return (b.latestStockYear || 0) - (a.latestStockYear || 0);
        if (sortBy === 'cpue') return (b.highestCpue || 0) - (a.highestCpue || 0);
        if (sortBy === 'quantity') return (b.totalStocked || 0) - (a.totalStocked || 0);
        return (a.distance ?? 9999) - (b.distance ?? 9999);
    });
    renderResults(filteredResults, titleOverride);
}

// ── Render Results ─────────────────────────────────────────────────────────
function renderResults(lakes, titleOverride = null) {
    const listEl = document.getElementById('results-list');
    const titleEl = document.getElementById('results-title');
    const countEl = document.getElementById('results-count');

    if (titleOverride) titleEl.textContent = titleOverride;
    countEl.textContent = `${lakes.length} lake${lakes.length !== 1 ? 's' : ''} found`;

    clearMarkers();
    if (lakes.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><img src="logo_notext.png" class="empty-icon-img" alt="Search" /><p>No lakes match the current filters.</p></div>';
        return;
    }
    document.getElementById('map-overlay').classList.add('hidden');
    listEl.innerHTML = '';
    lakes.forEach((lake, idx) => {
        const card = buildLakeCard(lake);
        card.style.animationDelay = `${idx * 0.025}s`;
        listEl.appendChild(card);
        addMarker(lake);
    });
    if (lakes.length > 0) {
        const latlngs = lakes.filter(l => l.point?.['epsg:4326'])
            .map(l => [l.point['epsg:4326'][1], l.point['epsg:4326'][0]]);
        if (latlngs.length === 1) map.setView(latlngs[0], 13);
        else if (latlngs.length > 1) map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30], maxZoom: 14 });
    }
}

// ── Build Lake Card ────────────────────────────────────────────────────────
function buildLakeCard(lake) {
    const card = document.createElement('div');
    card.className = 'lake-card';
    card.id = `card-${lake.id}`;
    card.onclick = () => selectLake(lake);

    const area = lake.morphology?.area;
    const depth = lake.morphology?.max_depth;
    const species = lake.fishSpecies?.[0] ? lake.fishSpecies[0].split(',').map(s => s.trim())
        : (lake.fishSpecies || []);
    const invasive = lake.invasiveSpecies || [];
    const distStr = lake.distance != null ? `📍 ${(lake.distance * 0.621371).toFixed(1)} mi` : '';

    const badges = [
        lake.resources?.fishStocking ? `<span class="badge badge-green">📦 Stocked</span>` : '',
        lake.resources?.lakeSurvey ? `<span class="badge badge-blue">📊 Surveyed</span>` : '',
        lake.resources?.waterAccess ? `<span class="badge badge-teal">🚤 Boat Access</span>` : '',
        invasive.length > 0 ? `<span class="badge badge-red">⚠️ Invasive</span>` : '',
        lake.resources?.specialFishingRegs ? `<span class="badge badge-amber">⚖️ Special Regs</span>` : '',
    ].filter(Boolean).join('');

    let speciesExtra = '';
    if (typeof lake._isSpeciesResult === 'string') {
        const qCap = capitalize(lake._isSpeciesResult);
        const sortBy = document.getElementById('sort-by')?.value || '';

        if (sortBy === 'cpue' && lake.highestCpue > 0) {
            speciesExtra = `<div class="species-stock-info"><strong>${qCap}</strong> CPUE: <strong>${lake.highestCpue.toFixed(2)}</strong></div>`;
        } else if (lake.latestStockYear) {
            speciesExtra = `<div class="species-stock-info">Last <strong>${qCap}</strong> Stocked: <strong>${lake.latestStockYear}</strong> · ${(lake.latestStockQty || 0).toLocaleString()} fish</div>`;
        } else if (lake.highestCpue > 0) {
            speciesExtra = `<div class="species-stock-info"><strong>${qCap}</strong> CPUE: <strong>${lake.highestCpue.toFixed(2)}</strong></div>`;
        } else {
            speciesExtra = `<div class="species-stock-info">Species Found: <strong>${qCap}</strong></div>`;
        }
    }

    card.innerHTML = `
    <div class="lake-card-header">
      <div class="lake-card-name">${lake.name || 'Unknown'}</div>
      <div class="lake-card-county">${lake.county || ''}</div>
    </div>
    <div class="lake-card-badges">${badges}</div>
    ${speciesExtra}
    <div class="lake-card-stats mt-4">
      ${area ? `<span>📐 ${area.toFixed(0)} acres</span>` : ''}
      ${depth ? `<span>🌊 ${depth}ft deep</span>` : ''}
      ${distStr ? `<span>${distStr}</span>` : ''}
      <span>🔑 ${lake.id}</span>
    </div>
  `;
    return card;
}

// ── Map Markers ────────────────────────────────────────────────────────────
function addMarker(lake) {
    const coords = lake.point?.['epsg:4326'];
    if (!coords) return;
    const [lon, lat] = coords;
    const hasStocking = lake.resources?.fishStocking;
    const markerEl = document.createElement('div');
    markerEl.className = 'lake-marker';
    markerEl.style.cssText = 'width:22px;height:22px;font-size:12px;display:flex;align-items:center;justify-content:center';
    markerEl.textContent = hasStocking ? '🐟' : '🏞️';
    const icon = L.divIcon({ html: markerEl, className: '', iconSize: [22, 22], iconAnchor: [11, 11] });
    const marker = L.marker([lat, lon], { icon }).addTo(map).bindPopup(
        `<b>${lake.name}</b><br>${lake.county} County<br>
        ${lake.morphology?.area ? `${lake.morphology.area.toFixed(0)} acres · ` : ''}
        ${lake.morphology?.max_depth ? `${lake.morphology.max_depth}ft max depth<br>` : ''}
        ${lake.resources?.waterAccess ? '🚤 Boat Access<br>' : ''}
        <small>DOW: ${lake.id}</small>`
    );
    marker.on('click', () => selectLake(lake));
    markers[lake.id] = { marker, el: markerEl };
}

function clearMarkers() {
    Object.values(markers).forEach(({ marker }) => map.removeLayer(marker));
    markers = {};
}

// ── Select Lake ────────────────────────────────────────────────────────────
async function selectLake(lake) {
    currentLakeId = lake.id;

    document.querySelectorAll('.lake-card').forEach(c => c.classList.remove('active'));
    const card = document.getElementById(`card-${lake.id}`);
    if (card) { card.classList.add('active'); card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }

    Object.values(markers).forEach(({ el }) => el.classList.remove('active'));
    if (markers[lake.id]) markers[lake.id].el.classList.add('active');

    const coords = lake.point?.['epsg:4326'];
    if (coords) map.panTo([coords[1], coords[0]]);

    document.getElementById('detail-empty').classList.add('hidden');
    document.getElementById('detail-content').classList.remove('hidden');

    document.getElementById('detail-lake-name').textContent = lake.name;
    const m = lake.morphology || {};
    document.getElementById('detail-meta').innerHTML = `
    ${lake.county ? `<span>📍 ${lake.county} County</span>` : ''}
    ${lake.nearest_town ? `<span>🏘️ Near ${lake.nearest_town}</span>` : ''}
    ${m.area ? `<span>📐 ${m.area.toFixed(1)} acres</span>` : ''}
    ${m.max_depth ? `<span>🌊 ${m.max_depth}ft max depth</span>` : ''}
  `;

    const invasive = lake.invasiveSpecies || [];
    const tags = [
        lake.resources?.fishStocking ? '<span class="badge badge-green">📦 Fish Stocking</span>' : '',
        lake.resources?.lakeSurvey ? '<span class="badge badge-blue">📊 Surveys</span>' : '',
        lake.resources?.waterAccess ? '<span class="badge badge-teal">🚤 Boat / Public Access</span>' : '',
        invasive.length > 0 ? invasive.map(i => `<span class="badge badge-red">⚠️ ${capitalize(i)}</span>`).join('') : '',
    ].filter(Boolean).join('');
    document.getElementById('detail-tags').innerHTML = tags;

    populateInfoTab(lake);
    await loadActiveDetailTab(lake);
}

// ── Detail Tab Switching ───────────────────────────────────────────────────
function switchDetailTab(tab, btn) {
    activeDetailTab = tab;
    document.querySelectorAll('.detail-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    ['stocking', 'survey', 'info'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
    });
    if (currentLakeId) {
        const lake = allResults.find(l => l.id === currentLakeId);
        if (lake) loadActiveDetailTab(lake);
    }
}

async function loadActiveDetailTab(lake) {
    if (activeDetailTab === 'stocking') await loadStockingHistory(lake.id);
    else if (activeDetailTab === 'survey') await loadSurveyData(lake.id);
}

// ── Stocking History ───────────────────────────────────────────────────────
async function loadStockingHistory(id) {
    const yearsVal = document.getElementById('history-years').value;
    const useAll = yearsVal === 'all';
    const yearsBack = useAll ? 999 : parseInt(yearsVal) || 10;
    const loading = document.getElementById('stocking-loading');
    const content = document.getElementById('stocking-content');

    loading.classList.remove('hidden');
    content.innerHTML = '';
    document.getElementById('chart-metric-row').style.display = 'none';

    try {
        const params = { id, years: yearsBack };
        if (useAll) params.all = 'true';
        else { const latest = Math.min(2024, new Date().getFullYear() - 1); params.years = yearsBack; }

        const res = await api('/api/fish-stocking-history', params);
        currentStockingHistory = res.history || {};
        renderStockingHistory(currentStockingHistory, content);
    } catch (e) {
        content.innerHTML = `<div class="no-stocking">Error loading stocking data: ${e.message}</div>`;
    } finally {
        loading.classList.add('hidden');
    }
}

function onChartMetricChange() {
    currentChartMetric = document.querySelector('input[name="chart-metric"]:checked')?.value || 'quantity';
    if (Object.keys(currentStockingHistory).length > 0) renderStockingChart(currentStockingHistory);
}

function renderStockingHistory(history, container) {
    const years = Object.keys(history).map(Number).sort((a, b) => b - a);
    if (years.length === 0) {
        container.innerHTML = '<div class="no-stocking">No stocking records found for this lake in the selected date range.</div>';
        return;
    }

    renderStockingChart(history);
    document.getElementById('chart-metric-row').style.display = 'flex';

    years.forEach(year => {
        const entries = history[year];
        const group = document.createElement('div');
        group.className = 'stocking-year-group';
        group.id = `stock-year-${year}`;

        const totalQty = entries.reduce((s, e) => s + (e.quantity || 0), 0);
        const totalLbs = entries.reduce((s, e) => s + (e.weightLbs || 0), 0);
        const isOpen = year === years[0]; // First year open by default

        group.innerHTML = `
      <div class="stocking-year-header collapsible-header" onclick="toggleYearGroup(${year})" aria-expanded="${isOpen}">
        <span class="year-label">${year}</span>
        <span class="year-stats">${entries.length} event${entries.length !== 1 ? 's' : ''} · ${totalQty.toLocaleString()} fish · ${totalLbs.toFixed(0)} lbs</span>
        <span class="collapse-icon">${isOpen ? '▲' : '▼'}</span>
      </div>
      <div class="stocking-year-body ${isOpen ? '' : 'collapsed'}">
        <table class="stocking-table">
          <thead><tr><th>Species</th><th>Quantity</th><th>Type</th><th>Weight (lbs)</th></tr></thead>
          <tbody>
            ${entries.map(e => `
              <tr>
                <td>${e.species}</td>
                <td>${(e.quantity || 0).toLocaleString()}</td>
                <td><span class="fish-type-badge fish-type-${e.fishType}">${e.fishType}</span></td>
                <td>${e.weightLbs > 0 ? e.weightLbs.toFixed(1) : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
        container.appendChild(group);
    });
}

function toggleYearGroup(year) {
    const group = document.getElementById(`stock-year-${year}`);
    if (!group) return;
    const header = group.querySelector('.collapsible-header');
    const body = group.querySelector('.stocking-year-body');
    const icon = group.querySelector('.collapse-icon');
    const isOpen = !body.classList.contains('collapsed');
    body.classList.toggle('collapsed', isOpen);
    icon.textContent = isOpen ? '▼' : '▲';
    header.setAttribute('aria-expanded', !isOpen);
}

function renderStockingChart(history) {
    const existing = document.getElementById('stocking-chart-container');
    if (existing) existing.remove();

    const speciesYearMap = {};
    const allYears = Object.keys(history).map(Number).sort();

    Object.entries(history).forEach(([year, entries]) => {
        entries.forEach(e => {
            if (!speciesYearMap[e.species]) speciesYearMap[e.species] = {};
            const val = currentChartMetric === 'weight' ? (e.weightLbs || 0) : (e.quantity || 0);
            speciesYearMap[e.species][year] = (speciesYearMap[e.species][year] || 0) + val;
        });
    });

    const speciesList = Object.keys(speciesYearMap);
    if (speciesList.length === 0 || allYears.length < 1) return;

    const colors = ['#3ea8ff', '#2dd4bf', '#f59e0b', '#a78bfa', '#f87171', '#4ade80', '#fb923c', '#e879f9', '#60a5fa', '#34d399'];
    const metricLabel = currentChartMetric === 'weight' ? 'Pounds' : 'Fish Count';

    const datasets = speciesList.map((sp, i) => ({
        label: sp,
        data: allYears.map(y => speciesYearMap[sp][y] || 0),
        backgroundColor: colors[i % colors.length] + 'aa',
        borderColor: colors[i % colors.length],
        borderWidth: 1.5, borderRadius: 4,
    }));

    const container = document.createElement('div');
    container.id = 'stocking-chart-container';
    container.className = 'chart-container';
    container.innerHTML = `<h4>Stocking History by Species (${metricLabel})</h4><canvas id="stocking-chart"></canvas>`;
    document.getElementById('stocking-content').prepend(container);

    if (stockingChartInstance) stockingChartInstance.destroy();
    stockingChartInstance = new Chart(document.getElementById('stocking-chart').getContext('2d'), {
        type: 'bar',
        data: { labels: allYears, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#7a95b8', font: { size: 11 }, boxWidth: 12 } },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()} ${currentChartMetric === 'weight' ? 'lbs' : 'fish'}`
                    }
                }
            },
            scales: {
                x: { stacked: true, ticks: { color: '#7a95b8' }, grid: { color: 'rgba(62,130,220,.07)' } },
                y: { stacked: true, ticks: { color: '#7a95b8' }, grid: { color: 'rgba(62,130,220,.07)' } },
            },
        },
    });
}

// ── Survey Data ────────────────────────────────────────────────────────────
async function loadSurveyData(id) {
    const loading = document.getElementById('survey-loading');
    const content = document.getElementById('survey-content');
    loading.classList.remove('hidden');
    content.innerHTML = '';
    try {
        const data = await api('/api/fish-survey', { id });
        if (data.surveys && data.surveys.length > 0) {
            currentSurveys = data.surveys;
            currentSurveys.sort((a, b) => new Date(b.surveyDate) - new Date(a.surveyDate));
            renderSurveySelect(currentSurveys, content, id);
        } else {
            renderLegacySurveyData(data, content, id);
        }
    } catch (e) {
        content.innerHTML = `<div class="no-stocking">Error loading survey data: ${e.message}</div>`;
    } finally { loading.classList.add('hidden'); }
}

function renderSurveySelect(surveys, container, id) {
    const dnrLinks = `
      <div style="margin-top:12px;margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap">
        <a href="https://www.dnr.state.mn.us/lakefind/showreport.html?downum=${id}" target="_blank" class="dnr-link">📄 Full Survey Report on DNR ↗</a>
        <a href="https://www.dnr.state.mn.us/lakefind/lake.html?id=${id}" target="_blank" class="dnr-link">🌐 DNR Lake Page ↗</a>
      </div>`;

    container.insertAdjacentHTML('beforeend', dnrLinks);

    const meta = document.createElement('div');
    meta.className = 'survey-meta-banner';
    meta.style.display = 'flex';
    meta.style.flexDirection = 'row';
    meta.style.justifyContent = 'space-between';
    meta.style.alignItems = 'center';

    const selectHtml = `
      <select id="survey-date-select" style="padding: 6px; border-radius: 6px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff;">
        ${surveys.map((s, i) => `<option value="${i}">${s.surveyDate} — ${s.surveyType || 'Survey'}</option>`).join('')}
      </select>
    `;
    meta.innerHTML = `<div style="display:flex; align-items:center; gap:8px;">📅 <strong>Select Survey:</strong> ${selectHtml}</div>`;
    container.appendChild(meta);

    const detailContainer = document.createElement('div');
    detailContainer.id = 'survey-detail-container';
    container.appendChild(detailContainer);

    document.getElementById('survey-date-select').addEventListener('change', (e) => {
        renderSurveyDetail(surveys[e.target.value], detailContainer, id);
    });

    // Render first (latest) survey by default
    renderSurveyDetail(surveys[0], detailContainer, id);
}

const LENGTH_BUCKETS = [
    { label: '0-5', min: 0, max: 5 }, { label: '6-7', min: 6, max: 7 }, { label: '8-9', min: 8, max: 9 },
    { label: '10-11', min: 10, max: 11 }, { label: '12-14', min: 12, max: 14 }, { label: '15-19', min: 15, max: 19 },
    { label: '20-24', min: 20, max: 24 }, { label: '25-29', min: 25, max: 29 }, { label: '30-34', min: 30, max: 34 },
    { label: '35-39', min: 35, max: 39 }, { label: '40-44', min: 40, max: 44 }, { label: '45-49', min: 45, max: 49 },
    { label: '50+', min: 50, max: 200 }
];

function renderLengthTable(lengths) {
    const speciesCodes = Object.keys(lengths).sort((a, b) => (SPECIES_NAMES[a] || a).localeCompare(SPECIES_NAMES[b] || b));
    let rowsHtml = '';
    speciesCodes.forEach(code => {
        const name = capitalizeWords(SPECIES_NAMES[code] || code);
        const ldata = lengths[code].fishCount || [];
        let bucketCounts = LENGTH_BUCKETS.map(() => 0);
        let total = 0;

        ldata.forEach(([inch, count]) => {
            total += count;
            for (let i = 0; i < LENGTH_BUCKETS.length; i++) {
                if (inch >= LENGTH_BUCKETS[i].min && inch <= LENGTH_BUCKETS[i].max) {
                    bucketCounts[i] += count; break;
                }
            }
        });

        rowsHtml += `<tr>
            <td><strong>${name}</strong></td>
            ${bucketCounts.map(c => `<td style="text-align:center">${c || '-'}</td>`).join('')}
            <td style="text-align:center; color:#fff;"><strong>${total}</strong></td>
        </tr>`;
    });

    return `
        <div class="survey-section" style="margin-top: 24px;">
            <h4>Length of Select Species Sampled — All Gear Combined</h4>
            <div class="table-scroll">
                <table class="survey-table">
                    <thead>
                        <tr>
                            <th>Species</th>
                            ${LENGTH_BUCKETS.map(b => `<th style="text-align:center">${b.label}</th>`).join('')}
                            <th style="text-align:center">Total</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
            <p style="font-size:0.8rem; color:#7a95b8; margin-top:8px;">Measurements indicate number of fish caught in each inch category.</p>
        </div>
    `;
}

function renderSurveyDetail(survey, container, id) {
    container.innerHTML = '';
    const fcs = survey.fishCatchSummaries || [];

    if (fcs.length > 0) {
        const section = document.createElement('div');
        section.className = 'survey-section';
        section.innerHTML = `<h4>Fish Sampled</h4>`;

        // Clone and sort
        const rows = [...fcs].sort((a, b) => {
            const na = SPECIES_NAMES[a.species] || a.species;
            const nb = SPECIES_NAMES[b.species] || b.species;
            return na.localeCompare(nb) || (a.gear || '').localeCompare(b.gear || '');
        });

        const tableHtml = `
          <div class="table-scroll">
            <table class="survey-table">
              <thead><tr>
                <th>Species</th>
                <th>Gear</th>
                <th>Count</th>
                <th>CPUE</th>
                <th>Normal Range</th>
                <th>Avg Weight (lbs)</th>
                <th>Normal Range</th>
              </tr></thead>
              <tbody>
                ${rows.map(r => {
            const name = capitalizeWords(SPECIES_NAMES[r.species] || r.species);
            const cpue = parseFloat(r.CPUE);
            const cpueCls = r.quartileCount && r.quartileCount !== 'N/A' && r.quartileCount.includes('-') ?
                (parseFloat(r.quartileCount.split('-')[1]) < cpue ? 'above-range' : parseFloat(r.quartileCount.split('-')[0]) > cpue ? 'below-range' : '') : '';
            const wt = parseFloat(r.averageWeight);
            const wtCls = r.quartileWeight && r.quartileWeight !== 'N/A' && r.quartileWeight.includes('-') ?
                (parseFloat(r.quartileWeight.split('-')[1]) < wt ? 'above-range' : parseFloat(r.quartileWeight.split('-')[0]) > wt ? 'below-range' : '') : '';
            return `<tr>
                      <td><strong>${name}</strong></td>
                      <td>${r.gear || '—'}</td>
                      <td>${r.totalCatch || '—'}</td>
                      <td class="${cpueCls}">${!isNaN(cpue) ? cpue.toFixed(2) : '—'}</td>
                      <td>${r.quartileCount || '—'}</td>
                      <td class="${wtCls}">${!isNaN(wt) ? wt.toFixed(2) : '—'}</td>
                      <td>${r.quartileWeight || '—'}</td>
                    </tr>`;
        }).join('')}
              </tbody>
            </table>
          </div>
          <div class="survey-range-legend">
            <span class="above-range-swatch"></span> Above normal range &nbsp;
            <span class="below-range-swatch"></span> Below normal range &nbsp;
            <span>• Normal range is the middle 50% of sampled lakes</span>
          </div>`;
        section.innerHTML += tableHtml;
        container.appendChild(section);
    }

    if (survey.lengths && Object.keys(survey.lengths).length > 0) {
        container.insertAdjacentHTML('beforeend', renderLengthTable(survey.lengths));
    }
}

// ── Legacy Survey Data ──────────────────────────────────────────────────
function renderLegacySurveyData(data, container, id) {
    const fish = data.fish || [];
    const surveys = (data.surveys || []).filter(s => s.rows?.length >= 2 && s.headers?.length >= 2);

    const dnrLinks = `
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <a href="${data.sourceUrl || data.reportUrl || `https://www.dnr.state.mn.us/lakefind/showreport.html?downum=${id}`}" target="_blank" class="dnr-link">📄 Full Survey Report on DNR ↗</a>
        <a href="https://www.dnr.state.mn.us/lakefind/lake.html?id=${id}" target="_blank" class="dnr-link">🌐 DNR Lake Page ↗</a>
      </div>`;

    if (fish.length === 0 && surveys.length === 0) {
        container.innerHTML = `<div class="no-stocking">No survey data available for this lake.${dnrLinks}</div>`;
        return;
    }

    // Survey date + type banner
    if (data.surveyDate) {
        const meta = document.createElement('div');
        meta.className = 'survey-meta-banner';
        const typeStr = data.surveyType ? ` — ${data.surveyType}` : '';
        meta.innerHTML = `📅 Survey Date: <strong>${data.surveyDate}</strong>${typeStr}`;
        container.appendChild(meta);
    }

    // Lake characteristics
    const ch = data.characteristics || {};
    if (ch.areaAcres || ch.maxDepthFt) {
        const charDiv = document.createElement('div');
        charDiv.className = 'survey-characteristics';
        charDiv.innerHTML = [
            ch.areaAcres ? `<span>🏞 ${ch.areaAcres.toLocaleString()} acres</span>` : '',
            ch.littoralAcres ? `<span>🌿 ${ch.littoralAcres.toLocaleString()} littoral acres</span>` : '',
            ch.maxDepthFt ? `<span>📏 ${ch.maxDepthFt} ft max depth</span>` : '',
            ch.clarityFt ? `<span>👁 ${ch.clarityFt} ft clarity</span>` : '',
        ].filter(Boolean).join('');
        container.appendChild(charDiv);
    }

    if (fish.length > 0) {
        const section = document.createElement('div');
        section.className = 'survey-section';
        section.innerHTML = `<h4>Fish Sampled</h4>`;
        const rows = [];
        fish.forEach(f => {
            (f.gearSamples || []).forEach(g => {
                rows.push({ name: capitalizeWords(SPECIES_NAMES[f.code] || f.name), ...g });
            });
        });
        rows.sort((a, b) => a.name.localeCompare(b.name) || (a.gear || '').localeCompare(b.gear || ''));

        const tableHtml = `
          <div class="table-scroll">
            <table class="survey-table">
              <thead><tr><th>Species</th><th>Gear</th><th>CPUE</th><th>Normal Range</th><th>Avg Weight (lbs)</th><th>Normal Range</th></tr></thead>
              <tbody>
                ${rows.map(r => {
            const cpueCls = r.cpue != null && r.cpueRange && r.cpueRange !== 'N/A'
                ? (parseFloat(r.cpueRange.split('-')[1]) < r.cpue ? 'above-range' : parseFloat(r.cpueRange.split('-')[0]) > r.cpue ? 'below-range' : '') : '';
            const wtCls = r.avgWeight != null && r.weightRange && r.weightRange !== 'N/A'
                ? (parseFloat(r.weightRange.split('-')[1]) < r.avgWeight ? 'above-range' : parseFloat(r.weightRange.split('-')[0]) > r.avgWeight ? 'below-range' : '') : '';
            return `<tr><td><strong>${r.name}</strong></td><td>${r.gear || '—'}</td><td class="${cpueCls}">${r.cpue != null ? r.cpue.toFixed(2) : '—'}</td><td>${r.cpueRange || '—'}</td><td class="${wtCls}">${r.avgWeight != null ? r.avgWeight.toFixed(2) : '—'}</td><td>${r.weightRange || '—'}</td></tr>`;
        }).join('')}
              </tbody>
            </table>
          </div><div class="survey-range-legend">...</div>`;
        section.innerHTML += tableHtml;
        container.appendChild(section);
    }

    surveys.forEach((survey, i) => {
        const section = document.createElement('div');
        section.className = 'survey-section';
        section.innerHTML = `<h4>${survey.title || `Survey Table ${i + 1}`}</h4><div class="table-scroll"><table class="survey-table"><thead><tr>${survey.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${survey.rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        container.appendChild(section);
    });

    container.insertAdjacentHTML('beforeend', dnrLinks);
}

// ── Info Tab ───────────────────────────────────────────────────────────────
function populateInfoTab(lake) {
    const container = document.getElementById('info-content');
    const m = lake.morphology || {};
    const regs = lake.specialFishingRegs || [];
    const invasive = lake.invasiveSpecies || [];
    const species = Array.isArray(lake.fishSpecies)
        ? (lake.fishSpecies.length > 0 && typeof lake.fishSpecies[0] === 'string' && lake.fishSpecies[0].includes(',')
            ? lake.fishSpecies[0].split(',').map(s => s.trim())
            : lake.fishSpecies)
        : [];

    container.innerHTML = `
    <div class="info-grid">
      <div class="info-card"><div class="info-card-label">Lake Area</div><div class="info-card-value">${m.area ? m.area.toFixed(0) : '—'}<span class="info-card-unit">acres</span></div></div>
      <div class="info-card"><div class="info-card-label">Max Depth</div><div class="info-card-value">${m.max_depth || '—'}<span class="info-card-unit">ft</span></div></div>
      <div class="info-card"><div class="info-card-label">Mean Depth</div><div class="info-card-value">${m.mean_depth || '—'}<span class="info-card-unit">ft</span></div></div>
      <div class="info-card"><div class="info-card-label">Shoreline</div><div class="info-card-value">${m.shore_length ? m.shore_length.toFixed(1) : '—'}<span class="info-card-unit">mi</span></div></div>
      <div class="info-card"><div class="info-card-label">Littoral Area</div><div class="info-card-value">${m.littoral_area || '—'}<span class="info-card-unit">acres</span></div></div>
      <div class="info-card"><div class="info-card-label">DOW Number</div><div class="info-card-value" style="font-size:.85rem">${lake.id}</div></div>
    </div>`;

    // Access info — loaded lazily from survey endpoint
    const accessSection = document.createElement('div');
    accessSection.id = 'access-info-section';
    if (lake.resources?.waterAccess) {
        accessSection.innerHTML = `<div class="access-banner">🚤 Public Boat/Water Access — Loading details...</div>`;
        // Asynchronously load access details from survey endpoint
        api('/api/fish-survey', { id: lake.id }).then(surveyData => {
            const accesses = surveyData.accesses || [];
            if (accesses.length > 0) {
                accessSection.innerHTML = `
                <div class="info-section">
                  <h4>🚤 Water Access Information</h4>
                  <div class="table-scroll">
                    <table class="survey-table access-table">
                      <thead><tr><th>Admin</th><th>Access Type</th><th>Lake/Body</th><th>Parking</th><th>Notes</th></tr></thead>
                      <tbody>${accesses.map(a => `
                        <tr>
                          <td>${a.admin || a.ownerTypeId || '—'}</td>
                          <td>${a.type || a.accessTypeId || '—'}</td>
                          <td>${a.lake || a.location || '—'}</td>
                          <td>${a.parking || a.publicUseAuthCode || '—'}</td>
                          <td class="access-notes">${a.notes || a.lakeAccessComments || '—'}</td>
                        </tr>`).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>`;
            } else {
                accessSection.innerHTML = `<div class="access-banner">🚤 Public Boat/Water Access Available</div>`;
            }
        }).catch(() => {
            accessSection.innerHTML = `<div class="access-banner">🚤 Public Boat/Water Access Available</div>`;
        });
    }
    container.appendChild(accessSection);

    container.insertAdjacentHTML('beforeend', `
    ${species.length ? `
    <div class="info-section">
      <h4>Fish Species Present</h4>
      <div class="species-list">${species.map(s => `<span class="species-pill">${capitalize(s)}</span>`).join('')}</div>
    </div>` : ''}

    ${invasive.length ? `
    <div class="info-section">
      <h4>Invasive Species</h4>
      ${invasive.map(s => `<div class="invasive-card">⚠️ ${capitalize(s)}</div>`).join('')}
    </div>` : ''}

    ${regs.length ? `
    <div class="info-section">
      <h4>Special Fishing Regulations</h4>
      ${regs.map(reg => `
        <div class="reg-card">
          ${reg.regs?.map(r => `
            <div class="reg-species">${r.species?.join(', ') || 'All Species'}</div>
            <div>${r.text}</div>
          `).join('') || ''}
          ${reg.location ? `<div class="text-muted mt-4" style="font-size:.73rem">📍 ${reg.location}</div>` : ''}
        </div>`).join('')}
    </div>` : ''}

    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <a href="https://www.dnr.state.mn.us/lakefind/lake.html?id=${lake.id}" target="_blank" class="dnr-link">🌐 Open in DNR LakeFinder ↗</a>
      <a href="https://www.dnr.state.mn.us/lakefind/showreport.html?downum=${lake.id}" target="_blank" class="dnr-link">📄 Survey Report on DNR ↗</a>
      <a href="https://www.dnr.state.mn.us/lakefind/showstocking.html?downum=${lake.id}&context=desktop" target="_blank" class="dnr-link">📦 Stocking Report on DNR ↗</a>
    </div>`);
}

function closeDetail() {
    document.getElementById('detail-empty').classList.remove('hidden');
    document.getElementById('detail-content').classList.add('hidden');
    document.querySelectorAll('.lake-card').forEach(c => c.classList.remove('active'));
    Object.values(markers).forEach(({ el }) => el.classList.remove('active'));
    currentLakeId = null;
    currentStockingHistory = {};
}

function clearFilters() {
    document.getElementById('species-filter').value = '';
    document.getElementById('access-filter').value = '';
    document.getElementById('area-min').value = '';
    document.getElementById('area-max').value = '';
    applyFilters();
}

// ── API Helper ─────────────────────────────────────────────────────────────
async function api(endpoint, params = {}) {
    const url = new URL(endpoint, window.location.origin);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

// ── UI Helpers ─────────────────────────────────────────────────────────────
function showLoader(msg = 'Loading...') {
    document.getElementById('loader-message').textContent = msg;
    document.getElementById('global-loader').classList.remove('hidden');
}
function hideLoader() { document.getElementById('global-loader').classList.add('hidden'); }

function setStatus(state, text = '') {
    const badge = document.getElementById('status-badge');
    badge.className = `status-badge${state === 'loading' ? ' loading' : state === 'error' ? ' error' : ''}`;
    badge.textContent = state === 'ready' ? 'Ready' : text || state;
}

function showNoResults(msg) {
    hideLoader(); setStatus('ready');
    document.getElementById('results-list').innerHTML = `<div class="empty-state"><img src="logo_notext.png" class="empty-icon-img" alt="Search" /><p>${msg}</p></div>`;
    document.getElementById('results-count').textContent = '';
}

function showError(msg) {
    setStatus('error', 'Error');
    document.getElementById('results-list').innerHTML = `<div class="empty-state"><img src="logo_notext.png" class="empty-icon-img" alt="Warning" /><p>${msg}</p></div>`;
    document.getElementById('results-count').textContent = '';
}

// ── Utils ──────────────────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
    if (lat2 == null || lon2 == null) return null;
    const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function capitalize(str) { return str.replace(/\b\w/g, c => c.toUpperCase()); }

function setupKeyboardShortcuts() {
    document.getElementById('lake-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') searchByName(); });
    document.getElementById('address-input').addEventListener('keydown', e => { if (e.key === 'Enter') searchByLocation(); });
    document.getElementById('species-search-input').addEventListener('keydown', e => { if (e.key === 'Enter') searchBySpecies(); });
}
