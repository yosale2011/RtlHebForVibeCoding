// Dump every list-related element in the Devin report: tag, dir, classes,
// ancestors — to see why list markers render on the wrong side.
const fs = require('fs');
const path = require('path');

const report = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'devin-dom.json'), 'utf8'));
const out = [];

for (const win of report.windows) {
    const url = (win.url || '').slice(0, 90);
    const lists = (win.structuralElements || []);
    const rtl = (win.rtlElements || []).filter((el) => /^(UL|OL|LI|P|H1|H2|H3|TABLE|DIV|SPAN)$/.test(el.tag));
    out.push(`\n=== ${url} | structural: ${lists.length} | rtl: ${(win.rtlElements || []).length} ===`);

    const seen = new Set();
    const rows = [];
    for (const el of [...lists, ...rtl]) {
        const key = el.tag + '|' + el.className + '|' + el.rect.x + ',' + el.rect.y;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(el);
    }
    // Visible viewport only — scrolled-away (negative y) rows are noise.
    const visible = rows.filter((el) => el.rect.y >= -50 && el.rect.y <= 1000);
    visible.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);

    for (const el of visible.slice(0, 120)) {
        const cls = (el.className || '').split(' ').slice(0, 5).join(' ');
        const anc = (el.ancestors || []).slice(0, 3).map((a) => `${a.tag.toLowerCase()}.${(a.className || '').split(' ').slice(0, 2).join('.')}${a.dir ? '[dir=' + a.dir + ']' : ''}`).join(' < ');
        out.push(`${el.tag.padEnd(6)} dir=${(el.dir || 'none').padEnd(4)} list-style=${el.computed.listStyleType}/${el.computed.listStylePosition} disp=${el.computed.display} y=${el.rect.y} len=${el.textLength} .${cls}`);
        out.push(`       <- ${anc}`);
    }
}

fs.writeFileSync(path.join(__dirname, 'devin-analysis.txt'), out.join('\n'));
console.log('written scripts/devin-analysis.txt,', out.length, 'lines');
