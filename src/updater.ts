import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';
import { compareVersions } from './version';

// Update source: the public GitHub repository declared in package.json.
// The check is strictly user-initiated (menu command) — the extension never
// phones home on its own, in line with the privacy-first posture.
const REPO = 'yosale2011/RtlHebForVibeCoding';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const USER_AGENT = 'yb-rtl-updater';
const TIMEOUT_MS = 15000;

interface HttpResponse {
    status: number;
    body: Buffer;
}

// Minimal HTTPS GET with redirect following (GitHub release assets redirect
// to objects.githubusercontent.com) and a hard timeout.
function httpsGet(url: string, redirectsLeft = 5): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
        const req = https.get(
            url,
            {
                headers: {
                    'User-Agent': USER_AGENT,
                    Accept: 'application/vnd.github+json',
                },
                timeout: TIMEOUT_MS,
            },
            (res) => {
                const status = res.statusCode || 0;
                if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
                    res.resume();
                    resolve(httpsGet(res.headers.location, redirectsLeft - 1));
                    return;
                }
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => resolve({ status, body: Buffer.concat(chunks) }));
                res.on('error', reject);
            }
        );
        req.on('timeout', () => req.destroy(new Error('request timed out')));
        req.on('error', reject);
    });
}

// The repository root package.json is the single source of truth for the
// latest published version (releases may lag behind the repo).
async function fetchLatestVersion(): Promise<string> {
    const res = await httpsGet(`${RAW_BASE}/package.json`);
    if (res.status !== 200) {
        throw new Error(`GitHub returned HTTP ${res.status} for package.json`);
    }
    const pkg = JSON.parse(res.body.toString('utf8')) as { version?: unknown };
    if (typeof pkg.version !== 'string' || !pkg.version) {
        throw new Error('no version field in the repository package.json');
    }
    return pkg.version;
}

// Prefer a VSIX attached to the latest GitHub Release; fall back to the
// VSIX committed at the repository root (yb-rtl-<version>.vsix).
async function findVsixUrl(version: string): Promise<string> {
    try {
        const res = await httpsGet(RELEASES_API);
        if (res.status === 200) {
            const release = JSON.parse(res.body.toString('utf8')) as {
                assets?: Array<{ name?: unknown; browser_download_url?: unknown }>;
            };
            const assets = Array.isArray(release.assets) ? release.assets : [];
            for (const asset of assets) {
                if (
                    typeof asset.name === 'string' &&
                    asset.name.endsWith('.vsix') &&
                    typeof asset.browser_download_url === 'string'
                ) {
                    return asset.browser_download_url;
                }
            }
        }
    } catch {
        // No release (or offline API) — the repo-root fallback below handles it.
    }
    return `${RAW_BASE}/yb-rtl-${version}.vsix`;
}

async function downloadVsix(url: string, version: string): Promise<string> {
    const res = await httpsGet(url);
    if (res.status !== 200 || res.body.length === 0) {
        throw new Error(`could not download the VSIX (HTTP ${res.status})`);
    }
    const dest = path.join(os.tmpdir(), `yb-rtl-${version}.vsix`);
    fs.writeFileSync(dest, res.body);
    return dest;
}

export async function runUpdateCheck(context: vscode.ExtensionContext): Promise<void> {
    const currentRaw = context.extension.packageJSON.version;
    const current = typeof currentRaw === 'string' ? currentRaw : '0.0.0';

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'YB RTL: checking GitHub for updates...',
            cancellable: false,
        },
        async () => {
            try {
                const latest = await fetchLatestVersion();
                if (compareVersions(latest, current) <= 0) {
                    vscode.window.showInformationMessage(
                        `YB RTL ${current} is up to date (GitHub has ${latest}).`
                    );
                    return;
                }

                const pick = await vscode.window.showInformationMessage(
                    `YB RTL ${latest} is available on GitHub (installed: ${current}).`,
                    'Download & Install',
                    'Later'
                );
                if (pick !== 'Download & Install') {
                    return;
                }

                const url = await findVsixUrl(latest);
                const file = await downloadVsix(url, latest);
                await vscode.commands.executeCommand(
                    'workbench.extensions.action.installVSIX',
                    vscode.Uri.file(file)
                );
            } catch (err) {
                vscode.window.showErrorMessage(
                    `YB RTL update check failed: ${err instanceof Error ? err.message : String(err)}`
                );
            }
        }
    );
}
