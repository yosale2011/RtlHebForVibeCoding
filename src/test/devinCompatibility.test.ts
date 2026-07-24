import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(__dirname, '..', '..');

test('loader discovers Devin extensions and accepts fork workbench URLs', () => {
    const loader = fs.readFileSync(path.join(root, 'resources', 'cursor-rtl-loader.cjs'), 'utf8');
    assert.match(loader, /\.devin["'], ["']extensions/);
    assert.match(loader, /\.qoder["'], ["']extensions/);
    assert.match(loader, /\/workbench\/i\.test\(url\)/);
    assert.match(loader, /collectDomMetadata/);
    assert.match(loader, /Structural metadata only/);
    assert.match(loader, /getComputedStyle\(el, "::before"\)/);
    assert.match(loader, /rtlElements/);
    assert.match(loader, /shadowRootCount/);
    assert.match(loader, /#SHADOW-HOST/);
    assert.match(loader, /web-contents-created/);
    assert.match(loader, /vscode-webview/);
    assert.match(loader, /getAllWebContents/);
    assert.match(loader, /devin-rtl\.js/);
});

test('runtime includes generic Devin chat selectors and protects code surfaces', () => {
    const runtime = fs.readFileSync(path.join(root, 'resources', 'rtl.js'), 'utf8');
    assert.match(runtime, /\.rendered-markdown p/);
    assert.match(runtime, /\.rendered-markdown ul/);
    assert.match(runtime, /\[class\*="markdown" i\] ul/);
    assert.match(runtime, /\[role="list"\]/);
    assert.match(runtime, /role=\\?"tree\\?"/);
    assert.match(runtime, /part\.auxiliarybar ul > li/);
    assert.match(runtime, /content: "•"/);
    assert.match(runtime, /counter\(list-item\)/);
    assert.match(runtime, /ensureShadowStyle/);
    assert.match(runtime, /data-rtl-hebrew-shadow-style/);
    assert.match(runtime, /SHADOW_LIST_STYLE/);
    assert.match(runtime, /message-content/);
    assert.match(runtime, /contenteditable/);
    // Qoder chat: headings and prose blocks inside .streaming-prose, plus the
    // inline-block paragraph workaround and the sent user message bubble.
    assert.match(runtime, /\.streaming-prose p/);
    assert.match(runtime, /\.streaming-prose h2/);
    assert.match(runtime, /\.streaming-prose p \{/);
        // Qoder chat tables: the table element itself needs dir (column order)
        // and an RTL table must be pushed to the right edge of its LTR container.
    assert.match(runtime, /'\.streaming-prose table',/);
    assert.match(runtime, /\.streaming-prose table\[dir="rtl"\]/);
    assert.match(runtime, /\[class\*="markdown" i\] table\[dir="rtl"\]/);
    assert.match(runtime, /margin-left: auto !important/);
    assert.match(runtime, /\.user-message-content/);
        // Devin's sent user message bubble (pre-wrap text in a message-wrapper card).
    assert.match(runtime, /message-wrapper/);
    assert.match(runtime, /whitespace-pre-wrap/);
    assert.match(runtime, /\[class\*="markdown" i\] h1/);
    assert.match(runtime, /monaco-diff-editor/);
    assert.match(runtime, /terminal/);
    assert.match(runtime, /unicode-bidi: isolate !important/);
        // Devin/Cascade chat list items render their text inside an INLINE <p>
        // (a bidi isolate island). With unicode-bidi:plaintext on the li, the
        // island contributes no strong character, the item's line direction
        // collapses to LTR, and the text anchors left while the marker (which
        // follows the dir attribute) stays right. Explicit dir must win.
    assert.match(runtime, /\.chat-client-root li\[dir="rtl"\]/);
    assert.match(runtime, /\.chat-client-root li\[dir="ltr"\]/);
        // Direction detection excludes code children (textWithoutCode) and
        // strips leading LTR noise (filenames/URLs) before first-strong check.
    assert.match(runtime, /function textWithoutCode/);
    assert.match(runtime, /function stripLeadingLTR/);
    assert.match(runtime, /function firstStrongDir/);
    assert.match(runtime, /function detectDir/);
        // Bare arithmetic isolation prevents bidi mirroring of "2 + 3 = 5".
    assert.match(runtime, /function findMathRanges/);
    assert.match(runtime, /function isolateMathRanges/);
    assert.match(runtime, /data-rtl-math/);
        // The list/table container majority must use the first-strong detector
        // so an <ol> agrees with the direction its <li> children receive
        // (otherwise the numbered marker detaches to the wrong side).
    assert.match(runtime, /getMajorityDir[\s\S]*?detectDir\(els\[i\]\)/);
});

test('Devin webview uses a minimal layout-safe runtime', () => {
    const runtime = fs.readFileSync(path.join(root, 'resources', 'devin-rtl.js'), 'utf8');
    assert.match(runtime, /p,li,h1/);
    assert.match(runtime, /pre,code/);
    // Claude Code tables: the table element itself gets dir (column order)
    // and RTL tables are anchored to the right edge.
    assert.match(runtime, /querySelectorAll\('table'\)/);
    assert.match(runtime, /table\[dir="rtl"\]/);
    assert.doesNotMatch(runtime, /monaco-editor|position:\s*absolute|transform:/);
});

test('Codex runtime adopts first-strong detection and math isolation', () => {
    const runtime = fs.readFileSync(path.join(root, 'resources', 'codex-rtl.js'), 'utf8');
    // First-strong, code-aware detection (upgraded from a crude 0.3 ratio).
    assert.match(runtime, /function textWithoutCode/);
    assert.match(runtime, /function stripLeadingLTR/);
    assert.match(runtime, /function firstStrongDir/);
    assert.match(runtime, /function detectDir/);
    // Bare-arithmetic / version-number isolation.
    assert.match(runtime, /function findMathRanges/);
    assert.match(runtime, /function isolateMath/);
    assert.match(runtime, /data-rtl-math/);
    // Inline emphasis is isolated so a leading bold Latin label stays at start.
    assert.match(runtime, /'strong,em,b,i'/);
    // Code surfaces stay LTR.
    assert.match(runtime, /pre,code,\.monaco-editor/);
    // A marker-scoped !important stylesheet makes the RTL decision authoritative
    // over Codex's Tailwind utility classes and survives React re-renders.
    assert.match(runtime, /function ensureStyle/);
    assert.match(runtime, /data-rtl-heb/);
    assert.match(runtime, /text-align:right !important/);
    // Codex streams tokens: coalesce every mutation into a debounced full
    // re-scan and observe characterData, not just added nodes.
    assert.match(runtime, /function schedule/);
    assert.match(runtime, /apply\(document\)/);
    assert.match(runtime, /characterData: true/);
});

