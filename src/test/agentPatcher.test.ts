import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, test } from 'node:test';
import { AgentTarget, patchCodex, restoreCodex } from '../agentPatcher';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

test('Codex patch is idempotent and restore verifies the backup', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-agent-'));
    dirs.push(dir);
    const file = path.join(dir, 'bundle.js');
    const runtime = path.join(dir, 'runtime.js');
    fs.writeFileSync(file, 'console.log("codex");');
    fs.writeFileSync(runtime, 'window.__safeRtl = true;');
    const target: AgentTarget = { name: 'test', file, patched: false, backup: false };

    patchCodex(target, runtime);
    const once = fs.readFileSync(file, 'utf8');
    patchCodex(target, runtime);
    assert.equal(fs.readFileSync(file, 'utf8'), once);
    assert.match(once, /RTL-HEBREW-CODEX-INJECTION/);

    restoreCodex({ ...target, patched: true, backup: true });
    assert.equal(fs.readFileSync(file, 'utf8'), 'console.log("codex");');
    assert.equal(fs.existsSync(file + '.rtl-hebrew-backup'), false);
});

test('Codex restore refuses a modified backup', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-agent-'));
    dirs.push(dir);
    const file = path.join(dir, 'bundle.js');
    const runtime = path.join(dir, 'runtime.js');
    fs.writeFileSync(file, 'original');
    fs.writeFileSync(runtime, 'runtime');
    const target: AgentTarget = { name: 'test', file, patched: false, backup: false };
    patchCodex(target, runtime);
    fs.writeFileSync(file + '.rtl-hebrew-backup', 'tampered');
    assert.throws(() => restoreCodex(target), /checksum mismatch/);
});
