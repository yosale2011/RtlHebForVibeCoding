import test from 'node:test';
import assert from 'node:assert';
import { compareVersions } from '../version';

test('compareVersions orders dotted numeric versions', () => {
    assert.strictEqual(compareVersions('0.4.5', '0.4.5'), 0);
    assert.strictEqual(compareVersions('0.4', '0.4.0'), 0);
    assert.ok(compareVersions('0.4.5', '0.4.4') > 0);
    assert.ok(compareVersions('0.4.4', '0.4.5') < 0);
    assert.ok(compareVersions('0.10.0', '0.9.9') > 0);
    assert.ok(compareVersions('1.0.0', '0.99.99') > 0);
    assert.ok(compareVersions('0.4.4', '1.0.0') < 0);
});
