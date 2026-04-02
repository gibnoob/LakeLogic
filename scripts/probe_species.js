const fs = require('fs');
const path = require('path');

const SPECIES_NAMES = {
    // Game Fish
    WAE: 'Walleye', NOP: 'Northern Pike', MUE: 'Muskellunge', SXS: 'Saugeye', SAR: 'Sauger', WON: 'White Bass',
    // Bass & Panfish
    LMB: 'Largemouth Bass', SMB: 'Smallmouth Bass', BLG: 'Bluegill Sunfish', BOG: 'Bluegill Sunfish',
    BLC: 'Black Crappie', BCS: 'Black Crappie', WHC: 'White Crappie', RKB: 'Rock Bass',
    YEP: 'Yellow Perch', PKS: 'Pumpkinseed Sunfish', PMK: 'Pumpkinseed Sunfish', HSF: 'Hybrid Sunfish', GSF: 'Green Sunfish',
    // Trout & Salmon
    BKT: 'Brook Trout', BNT: 'Brown Trout', RBT: 'Rainbow Trout', LKT: 'Lake Trout', LAT: 'Lake Trout',
    SPK: 'Splake', TLC: 'Tullibee (Cisco)',
    // Catfish & Bullheads
    CCF: 'Channel Catfish', FHC: 'Flathead Catfish', BRB: 'Brown Bullhead', BKB: 'Black Bullhead',
    BLB: 'Black Bullhead', YEB: 'Yellow Bullhead',
    // Other Sportfish
    LKS: 'Lake Sturgeon', PSH: 'Paddlefish', BUR: 'Burbot', BOF: 'Bowfin (Dogfish)',
    // Rough Fish & Carp
    COC: 'Common Carp', CAP: 'Common Carp', GZS: 'Gizzard Shad', QIL: 'Quillback', WTS: 'White Sucker', WHS: 'White Sucker',
    // Minnows, Shiners & Darters
    FHM: 'Fathead Minnow', GOS: 'Golden Shiner', BNM: 'Bluntnose Minnow', CSH: 'Common Shiner',
    BNS: 'Blacknose Shiner', SPO: 'Spottail Shiner', SFS: 'Spotfin Shiner', BKS: 'Blackchin Shiner',
    PGS: 'Pugnose Shiner', FTD: 'Finescale Dace', BND: 'Blacknose Dace', LND: 'Longnose Dace',
    CRC: 'Creek Chub', CNM: 'Central Mudminnow', JND: 'Johnny Darter', IOD: 'Iowa Darter',
    LED: 'Least Darter', TPM: 'Tadpole Madtom', BST: 'Brook Stickleback'
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
