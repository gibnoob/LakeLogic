const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function main() {
    const UA = 'LakeLogicLocal/1.0';
    const DOWNUM = '10005900'; // Lake Minnetonka

    // First check showreport.html for historical survey list
    const repHtml = await fetch(`https://www.dnr.state.mn.us/lakefind/showreport.html?downum=${DOWNUM}`, { headers: { 'User-Agent': UA } }).then(r => r.text());
    const $1 = cheerio.load(repHtml);
    const surveyOptions = [];
    $1('select[name="surveydate"] option, select[id="surveydate"] option, form select option, a[href*="showreport"]').each((i, el) => {
        const val = $1(el).val() || $1(el).attr('href');
        const text = $1(el).text().trim();
        if (text && val && (text.includes('-') || val.includes('date='))) surveyOptions.push({ text, val });
    });
    console.log('Historical surveys from showreport.html:', surveyOptions.slice(0, 10));

    // Also check desktop survey endpoints for how it requests different dates
    // e.g. showreport.html?downum=10005900&surveydate=...

    // Now look at lk_survey_mobile.cgi for length data
    const mobHtml = await fetch(`https://maps.dnr.state.mn.us/cgi-bin/lakefinder/lk_survey_mobile.cgi?downum=${DOWNUM}`, { headers: { 'User-Agent': UA } }).then(r => r.text());

    // Look for ldata
    const hasLdata = mobHtml.includes('ldata');
    console.log('Mobile CGI has ldata:', hasLdata);

    const ldataPushBlocks = mobHtml.match(/ldata\['[A-Z]+'\]\s*=\s*\[[^\]]+\];/g);
    if (ldataPushBlocks) {
        console.log('Mobile ldata sample:', ldataPushBlocks.slice(0, 3));
    }

    // Look for how history is represented in mobile
    const $2 = cheerio.load(mobHtml);
    const mobOptions = [];
    $2('select option, a').each((i, el) => {
        const text = $2(el).text().trim();
        if (text.match(/20\d\d-\d\d-\d\d/)) mobOptions.push(text);
    });
    console.log('Mobile CGI date options:', mobOptions.slice(0, 5));
}
main().catch(console.error);
