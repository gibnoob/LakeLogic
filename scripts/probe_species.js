const fs = require('fs');
const path = require('path');

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
    BOF: 'Bowfin (Dogfish)', QIL: 'Quillback', GOS: 'Golden Shiner', WHS: 'White Sucker'
};

const surveyDir = path.join(__dirname, '../data/surveys');
const files = fs.readdirSync(surveyDir);

const missing = new Set();
const names = {};

files.forEach(f => {
    if (!f.endsWith('.json')) return;
    try {
        const data = JSON.parse(fs.readFileSync(path.join(surveyDir, f)));
        if (data.fish) {
            data.fish.forEach(fsh => {
                if (fsh.code && !SPECIES_NAMES[fsh.code]) {
                    missing.add(fsh.code);
                    names[fsh.code] = fsh.name || fsh.code;
                }
            });
        }
        if (data.surveys) {
            data.surveys.forEach(s => {
                if (s.lengths) {
                    Object.keys(s.lengths).forEach(c => {
                        if (!SPECIES_NAMES[c]) missing.add(c);
                    });
                }
                (s.fishCatchSummaries || []).forEach(fc => {
                    if (!SPECIES_NAMES[fc.species]) {
                        missing.add(fc.species);
                    }
                });
            });
        }
    } catch (e) { }
});

console.log("Missing codes:");
const out = Array.from(missing).sort().map(c => `'${c}': '${capitalizeWords(names[c] || c)}'`);
console.log(out.join(',\n'));

function capitalizeWords(str) {
    if (!str) return '';
    return str.replace(/\b\w/g, c => c.toUpperCase());
}
