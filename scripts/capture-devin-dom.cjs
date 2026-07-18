// Trigger the loader DOM diagnostics and capture EVERY distinct report
// variant. Qoder, Cursor and Devin all watch ~/.cursor-rtl-config.json and
// all write to the same report path within ~1s of each other (last writer
// wins), so read in a tight loop and hash-dedupe to catch Devin's report
// before another loader overwrites it.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const configPath = path.join(os.homedir(), '.cursor-rtl-config.json');
const reportPath = path.join(os.homedir(), 'rtl-dom-report.json');
const outDir = __dirname;

const request = 'devin-user-bubble-' + Date.now();

let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
try { fs.unlinkSync(reportPath); } catch {}

fs.writeFileSync(configPath, JSON.stringify({ ...cfg, diagnosticsRequest: request, diagnosticsReportPath: reportPath }, null, 2));
console.log('diagnostics requested:', request);

const seen = new Set();
const variants = [];

function cleanupConfig() {
    try {
        const live = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        delete live.diagnosticsRequest;
        delete live.diagnosticsReportPath;
        fs.writeFileSync(configPath, JSON.stringify(live, null, 2));
    } catch {}
}

const deadline = Date.now() + 60000;
const timer = setInterval(() => {
    let raw = null;
    try { raw = fs.readFileSync(reportPath, 'utf8'); } catch {}
    if (raw && raw.length > 100) {
        const hash = crypto.createHash('sha1').update(raw).digest('hex');
        if (!seen.has(hash)) {
            seen.add(hash);
            try {
                const report = JSON.parse(raw);
                const urls = (report.windows || []).map((w) => w.url || '');
                variants.push({ hash, urls, raw });
                console.log('variant', variants.length, '-', urls.length, 'windows; first:', (urls[0] || '').slice(0, 90));
            } catch (e) {
                console.log('unparseable variant (skipped):', e.message, '| head:', raw.slice(0, 120));
            }
        }
    }
    if (Date.now() > deadline) {
        clearInterval(timer);
        cleanupConfig();
        const devin = variants.find((v) => v.urls.some((u) => /devin/i.test(u)));
        if (devin) {
            const out = path.join(outDir, '..', 'devin-dom.json');
            fs.writeFileSync(out, JSON.stringify(JSON.parse(devin.raw), null, 2));
            console.log('\nDEVIN report captured ->', out);
            for (const u of devin.urls) console.log('-', u.slice(0, 130));
            process.exit(0);
        }
        console.error('\nno Devin variant in', variants.length, 'captured reports');
        try {
            const log = fs.readFileSync(path.join(os.homedir(), 'cursor-rtl.log'), 'utf8').trim().split('\n');
            console.error('--- log lines mentioning diagnostics ---');
            console.error(log.filter((l) => /diagnostics|fail|error/i.test(l)).slice(-15).join('\n'));
        } catch {}
        process.exit(1);
    }
}, 25);
