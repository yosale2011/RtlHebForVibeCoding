// Dump message-sized RTL elements from the Devin workbench report in visual
// order (by rect.y), including ones that DID get dir=rtl — hunting the user
// message bubble from the screenshot.
const fs = require('fs');
const path = require('path');

const report = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'devin-dom.json'), 'utf8'));
const win = report.windows[0]; // Devin workbench
const els = (win.rtlElements || [])
    .filter((el) => el.textLength >= 40 && el.textLength <= 600 && el.childElementCount <= 6)
    .sort((a, b) => a.rect.y - b.rect.y);

const out = [];
for (const el of els) {
    const cls = (el.className || '').split(' ').slice(0, 6).join(' ');
    const anc = (el.ancestors || []).slice(0, 4).map((a) => `${a.tag.toLowerCase()}.${(a.className || '').split(' ').slice(0, 3).join('.')}`).join(' < ');
    out.push(`y=${el.rect.y} x=${el.rect.x} w=${el.rect.width} dir=${el.dir || 'none'} ${el.tag}.${cls}`);
    out.push(`   align=${el.computed.textAlign} dir-css=${el.computed.direction} kids=${el.childElementCount} len=${el.textLength}`);
    out.push(`   <- ${anc}`);
}
fs.writeFileSync(path.join(__dirname, 'devin-analysis.txt'), out.join('\n'));
console.log(els.length, 'elements ->', 'scripts/devin-analysis.txt');
