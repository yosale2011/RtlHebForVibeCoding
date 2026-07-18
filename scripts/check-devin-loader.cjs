const fs = require('fs');
const p = 'C:\\Users\\NoName11\\AppData\\Local\\Programs\\Devin\\resources\\app\\out\\cursor-rtl-loader.cjs';
try {
    const s = fs.readFileSync(p, 'utf8');
    const v = (s.match(/LOADER_VERSION = "([^"]+)"/) || [])[1];
    console.log('version:', v);
    console.log('has runDomDiagnostics:', s.includes('runDomDiagnostics'));
    console.log('has diagnosticsRequest:', s.includes('diagnosticsRequest'));
    console.log('has collectDomMetadata:', s.includes('collectDomMetadata'));
    console.log('mtime:', fs.statSync(p).mtime.toISOString());
} catch (e) {
    console.log('NOT FOUND:', e.message);
}
