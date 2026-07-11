import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, test } from 'node:test';
import { applyPatch, hasBackups, isPatched, removePatch } from '../patcher';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function fixture(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-patcher-'));
    dirs.push(dir);
    const file = path.join(dir, 'main.js');
    fs.writeFileSync(file, '/* Copyright (C) Microsoft Corporation */\nconsole.log("cursor");\n');
    return file;
}

test('applyPatch creates a backup and removePatch restores the original', () => {
    const file = fixture();
    const original = fs.readFileSync(file, 'utf8');
    applyPatch(file);
    assert.equal(isPatched(file), true);
    assert.equal(hasBackups(file), true);
    removePatch(file);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
});

test('applyPatch rejects an unexpected main.js', () => {
    const file = fixture();
    fs.writeFileSync(file, 'console.log("not cursor");');
    assert.throws(() => applyPatch(file), /expected Microsoft copyright signature/);
});
