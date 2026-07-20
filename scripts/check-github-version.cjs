const https = require('https');
function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'yb-rtl-check' }, timeout: 10000 }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
        }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
    });
}
(async () => {
    const r = await get('https://raw.githubusercontent.com/yosale2011/RtlHebForVibeCoding/main/package.json');
    console.log('HTTP', r.status);
    if (r.status === 200) {
        const pkg = JSON.parse(r.body);
        console.log('GitHub main package.json version:', pkg.version);
    } else {
        console.log(r.body.slice(0, 200));
    }
})().catch((e) => console.log('ERROR:', e.message));
