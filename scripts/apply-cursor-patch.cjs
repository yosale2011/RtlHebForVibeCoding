// One-time elevated apply of the yb-rtl Cursor patch.
// Mirrors src/patcher.ts applyPatch() + copyLoader() exactly.
const fs = require('fs');
const path = require('path');

const PATCH_LINE =
    'import{createRequire}from"module";try{createRequire(import.meta.url)("./cursor-rtl-loader.cjs")}catch(e){console.error("[Cursor RTL] error loading ./cursor-rtl-loader.cjs: ", e)}';
const LOADER_FILENAME = 'cursor-rtl-loader.cjs';
const BACKUP_PREFIX = 'main.js.rtl-backup-';

const mainJsPath = process.argv[2];
const loaderSrc = process.argv[3];
const resultFile = process.argv[4];

function ts() {
    const n = new Date(), p = (x) => String(x).padStart(2, '0');
    return n.getFullYear() + p(n.getMonth() + 1) + p(n.getDate()) + 'T' + p(n.getHours()) + p(n.getMinutes()) + p(n.getSeconds());
}

try {
    const content = fs.readFileSync(mainJsPath, 'utf-8');
    if (!content.includes('Copyright (C) Microsoft Corporation')) {
        throw new Error('main.js missing Microsoft copyright signature');
    }
    if (!content.includes(PATCH_LINE)) {
        const dir = path.dirname(mainJsPath);
        const backupPath = path.join(dir, BACKUP_PREFIX + ts());
        fs.copyFileSync(mainJsPath, backupPath);
        try {
            const lines = content.split('\n');
            const idx = lines.findIndex((l) => l.startsWith('import{createRequire'));
            if (idx !== -1) {
                lines[idx] = PATCH_LINE;
                fs.writeFileSync(mainJsPath, lines.join('\n'), 'utf-8');
            } else {
                const end = content.indexOf('*/');
                if (end === -1) throw new Error('Could not find end of copyright comment');
                const pos = end + 2;
                fs.writeFileSync(mainJsPath, content.substring(0, pos) + '\n' + PATCH_LINE + content.substring(pos), 'utf-8');
            }
        } catch (err) {
            fs.copyFileSync(backupPath, mainJsPath);
            throw err;
        }
    }
    fs.copyFileSync(loaderSrc, path.join(path.dirname(mainJsPath), LOADER_FILENAME));
    fs.writeFileSync(resultFile, 'OK');
} catch (e) {
    fs.writeFileSync(resultFile, 'ERROR: ' + (e && e.message ? e.message : String(e)));
    process.exit(1);
}
