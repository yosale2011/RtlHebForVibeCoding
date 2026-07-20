// Trigger the loader DOM diagnostics and capture EVERY distinct report
// variant. Qoder, Cursor and Devin all watch ~/.cursor-rtl-config.json and
// write to the same report path within milliseconds of each other, so poll
// aggressively and re-trigger a few times until Devin's report is caught.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const configPath = path.join(os.homedir(), '.cursor-rtl-config.json');
const reportPath = path.join(os.homedir(), 'rtl-dom-report.json');

let baseCfg = {};
try { baseCfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}

function trigger() {
    const req = 'devin-capture-' + Date.now();
    fs.writeFileSync(configPath, JSON.stringify({ ...baseCfg, diagnosticsRequest: req, diagnosticsReportPath: reportPath }, null, 2));
    console.log('triggered:', req);
}

function cleanupConfig() {
    try {
        const live = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        delete live.diagnosticsRequest;
        delete live.diagnosticsReportPath;
        fs.writeFileSync(configPath, JSON.stringify(live, null, 2));
    } catch {}
}

const seen = new Set();
const variants = [];
let lastVariantCount = 0;
let quietSince = Date.now();
const overallDeadline = Date.now() + 120000;

try { fs.unlinkSync(reportPath); } catch {}
trigger();

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
                variants.push({ urls, raw });
                console.log('variant', variants.length, '-', urls.length, 'windows; first:', (urls[0] || '').slice(0, 80));
                if (urls.some((u) => /devin/i.test(u))) {
                    clearInterval(timer);
                    cleanupConfig();
                    const out = path.join(__dirname, '..', 'devin-dom.json');
                    fs.writeFileSync(out, JSON.stringify(JSON.parse(raw), null, 2));
                    console.log('\nDEVIN report captured ->', out);
                    process.exit(0);
                }
            } catch {}
        }
    }
    if (variants.length !== lastVariantCount) {
        lastVariantCount = variants.length;
        quietSince = Date.now();
    }
    // Re-trigger when things went quiet (race lost) — up to the deadline.
    if (Date.now() - quietSince > 8000) {
        console.log('quiet for 8s, re-triggering...');
        quietSince = Date.now();
        trigger();
    }
    if (Date.now() > overallDeadline) {
        clearInterval(timer);
        cleanupConfig();
        console.error('\nno Devin variant after 120s;', variants.length, 'variants seen');
        process.exit(1);
    }
}, 5);
