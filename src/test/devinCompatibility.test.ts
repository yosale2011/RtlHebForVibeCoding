import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(__dirname, '..', '..');

test('loader discovers Devin extensions and accepts fork workbench URLs', () => {
    const loader = fs.readFileSync(path.join(root, 'resources', 'cursor-rtl-loader.cjs'), 'utf8');
    assert.match(loader, /\.devin["'], ["']extensions/);
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
    assert.match(runtime, /monaco-diff-editor/);
    assert.match(runtime, /terminal/);
    assert.match(runtime, /unicode-bidi: isolate !important/);
});

test('Devin webview uses a minimal layout-safe runtime', () => {
    const runtime = fs.readFileSync(path.join(root, 'resources', 'devin-rtl.js'), 'utf8');
    assert.match(runtime, /p,li,h1/);
    assert.match(runtime, /pre,code/);
    assert.doesNotMatch(runtime, /monaco-editor|position:\s*absolute|transform:/);
});
