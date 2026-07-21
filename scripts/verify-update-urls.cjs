const https = require('https');
function head(url) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, { method: 'GET', headers: { 'User-Agent': 'yb-rtl-check', Range: 'bytes=0-0' }, timeout: 15000 }, (res) => {
            res.resume();
            resolve(res.statusCode);
        });
        req.on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
        req.end();
    });
}
(async () => {
    for (const u of [
        'https://raw.githubusercontent.com/yosale2011/RtlHebForVibeCoding/main/package.json',
        'https://raw.githubusercontent.com/yosale2011/RtlHebForVibeCoding/main/yb-rtl-0.4.6.vsix',
    ]) {
        console.log(await head(u), u);
    }
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
