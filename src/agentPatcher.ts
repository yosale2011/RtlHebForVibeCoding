import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const MARKER = '/* RTL-HEBREW-CODEX-INJECTION */';
const BACKUP_SUFFIX = '.rtl-hebrew-backup';

export type AgentTarget = { name: string; file: string; patched: boolean; backup: boolean };

function sha256(data: Buffer | string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function extensionRoots(): string[] {
    const home = os.homedir();
    return [
        path.join(home, '.cursor', 'extensions'),
        path.join(home, '.vscode', 'extensions'),
        path.join(home, '.qoder', 'extensions'),
        path.join(home, '.cursor-server', 'extensions'),
        path.join(home, '.vscode-server', 'extensions'),
        path.join(home, '.qoder-server', 'extensions'),
    ];
}

function resolveCodexBundle(dir: string): string | undefined {
    const webview = path.join(dir, 'webview');
    const index = path.join(webview, 'index.html');
    if (!fs.existsSync(index)) return undefined;
    const html = fs.readFileSync(index, 'utf8');
    const matches = [...html.matchAll(/<script[^>]+src=["']\.\/([^"']+\.js)["']/gi)];
    for (const match of matches.reverse()) {
        const candidate = path.join(webview, match[1].replace(/[\\/]/g, path.sep));
        if (fs.existsSync(candidate)) return candidate;
    }
    return undefined;
}

export function findCodexTargets(): AgentTarget[] {
    const found: AgentTarget[] = [];
    for (const root of extensionRoots()) {
        if (!fs.existsSync(root)) continue;
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory() || !entry.name.startsWith('openai.chatgpt-')) continue;
            const file = resolveCodexBundle(path.join(root, entry.name));
            if (!file) continue;
            const content = fs.readFileSync(file, 'utf8');
            found.push({
                name: entry.name,
                file,
                patched: content.includes(MARKER),
                backup: fs.existsSync(file + BACKUP_SUFFIX),
            });
        }
    }
    return found;
}

export function patchCodex(target: AgentTarget, runtimeFile: string): void {
    const original = fs.readFileSync(target.file);
    if (original.toString('utf8').includes(MARKER)) return;
    const backup = target.file + BACKUP_SUFFIX;
    const metadata = backup + '.json';
    if (!fs.existsSync(backup)) {
        fs.copyFileSync(target.file, backup);
        fs.writeFileSync(metadata, JSON.stringify({ source: target.file, sha256: sha256(original), createdAt: new Date().toISOString() }, null, 2));
    }
    const runtime = fs.readFileSync(runtimeFile, 'utf8');
    const temp = target.file + '.rtl-hebrew-tmp';
    fs.writeFileSync(temp, Buffer.concat([original, Buffer.from(`\n\n${MARKER}\n${runtime}\n`, 'utf8')]));
    fs.renameSync(temp, target.file);
}

export function restoreCodex(target: AgentTarget): void {
    const backup = target.file + BACKUP_SUFFIX;
    if (!fs.existsSync(backup)) throw new Error(`Backup not found: ${backup}`);
    const metadata = backup + '.json';
    if (fs.existsSync(metadata)) {
        const expected = JSON.parse(fs.readFileSync(metadata, 'utf8')).sha256;
        const actual = sha256(fs.readFileSync(backup));
        if (expected !== actual) throw new Error(`Backup checksum mismatch: ${backup}`);
    }
    fs.copyFileSync(backup, target.file);
    fs.unlinkSync(backup);
    if (fs.existsSync(metadata)) fs.unlinkSync(metadata);
}
