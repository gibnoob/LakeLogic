const fs = require('fs');
const path = require('path');

const surveyDir = path.join(__dirname, '../data/surveys');
const files = fs.readdirSync(surveyDir);

const names = {};

files.forEach(f => {
    if (!f.endsWith('.json')) return;
    try {
        const data = JSON.parse(fs.readFileSync(path.join(surveyDir, f)));
        if (data.fish) {
            data.fish.forEach(fsh => {
                if (fsh.code && fsh.name && fsh.name.toLowerCase() !== fsh.code.toLowerCase()) {
                    names[fsh.code] = fsh.name;
                }
            });
        }
        // In fishCatchSummaries, sometimes we get gear/species with names ? Not usually.
    } catch (e) { }
});

// Also check lakes.json for fishSpecies
try {
    const lakes = require('../data/lakes.json').results || [];
    // The fishSpecies in gazetteer might not map codes to names, but just list names.
} catch (e) { }

const missingCodes = ['BCS', 'BKF', 'BKS', 'BLB', 'BNM', 'BNS', 'BST', 'CAP', 'CNM', 'CSH', 'FTD', 'IOD', 'JND', 'LED', 'PGS', 'SFS', 'SPO', 'TPM'];
console.log("Missing codes full names:");
missingCodes.forEach(c => {
    if (names[c]) console.log(`${c}: ${names[c]}`);
    else console.log(`${c}: ???`);
});

const out = Object.keys(names).sort().map(c => `'${c}': '${names[c]}'`);
fs.writeFileSync(path.join(__dirname, 'found_species.txt'), out.join(',\n'));
