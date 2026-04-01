const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function main() {
    const UA = 'LakeLogicLocal/1.0';
    const html = await fetch('https://maps.dnr.state.mn.us/cgi-bin/lakefinder/lk_survey_mobile.cgi?downum=31006700',
        { headers: { 'User-Agent': UA } }).then(r => r.text());

    const $ = cheerio.load(html);

    // Check all tables
    console.log('Tables found:', $('table').length);
    $('table').each((i, t) => {
        const text = $(t).text().slice(0, 200).replace(/\s+/g, ' ');
        console.log(`Table ${i}:`, text);
    });

    // Look for access info in plain text
    const accessIdx = html.indexOf('Access');
    const publicIdx = html.indexOf('Public');
    console.log('\nAccess at:', accessIdx, 'Public at:', publicIdx);
    if (accessIdx > 0) console.log('Access context:', html.slice(accessIdx - 50, accessIdx + 400));
}
main().catch(console.error);
