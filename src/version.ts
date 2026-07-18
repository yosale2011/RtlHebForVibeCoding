// Version comparison shared by the updater and its tests. Kept in a separate
// module with no 'vscode' import so the node:test bundle can load it outside
// the extension host.

// Compare two dotted numeric versions ("0.4.4" vs "0.10.0"):
// negative when a < b, zero when equal, positive when a > b.
export function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map((part) => parseInt(part, 10) || 0);
    const pb = b.split('.').map((part) => parseInt(part, 10) || 0);
    const length = Math.max(pa.length, pb.length);
    for (let i = 0; i < length; i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
}
