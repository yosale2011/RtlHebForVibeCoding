import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { validatePaths, getMainJsPath, getAppOutDir, getConfigPath } from './paths';
import {
    isPatched,
    hasBackups,
    applyPatch,
    removePatch,
    copyLoader,
    getLoaderVersion,
    getDryRunSummary,
    handlePermissionError,
} from './patcher';
import { LOADER_FILENAME } from './constants';
import { runDiagnostics } from './diagnostics';
import { init as initActions, action, error as actionError, dispose as disposeActions } from './actions';
import { findCodexTargets, patchCodex, restoreCodex } from './agentPatcher';

let statusBarItem: vscode.StatusBarItem;
let fileWatcher: fs.FSWatcher | undefined;
let blinkInterval: ReturnType<typeof setInterval> | undefined;
let blinkTimeout: ReturnType<typeof setTimeout> | undefined;

type PatchState = 'on' | 'off' | 'update-needed';

function getPatchState(mainJsPath: string): PatchState {
    if (!fs.existsSync(mainJsPath)) {
        return 'off';
    }
    if (isPatched(mainJsPath)) {
        return 'on';
    }
    if (hasBackups(mainJsPath)) {
        return 'update-needed';
    }
    return 'off';
}

function startBlink(themeColorId: string): void {
    const BLINK_DURATION_MS = 60_000;

    statusBarItem.backgroundColor = new vscode.ThemeColor(themeColorId);
    blinkInterval = setInterval(() => {
        statusBarItem.backgroundColor = statusBarItem.backgroundColor
            ? undefined
            : new vscode.ThemeColor(themeColorId);
    }, 800);
    blinkTimeout = setTimeout(() => {
        if (blinkInterval) {
            clearInterval(blinkInterval);
            blinkInterval = undefined;
        }
        statusBarItem.backgroundColor = new vscode.ThemeColor(themeColorId);
        blinkTimeout = undefined;
    }, BLINK_DURATION_MS);
}

function updateStatusBar(state: PatchState): void {
    const config = vscode.workspace.getConfiguration('cursorRtl');
    if (!config.get<boolean>('showStatusBar', true)) {
        statusBarItem.hide();
        return;
    }

    if (blinkInterval) {
        clearInterval(blinkInterval);
        blinkInterval = undefined;
    }
    if (blinkTimeout) {
        clearTimeout(blinkTimeout);
        blinkTimeout = undefined;
    }

    switch (state) {
        case 'on':
            statusBarItem.text = '$(check) RTL: ON';
            statusBarItem.backgroundColor = undefined;
            statusBarItem.tooltip = 'RTL patch is active. Click for options.';
            break;
        case 'off':
            statusBarItem.text = '$(circle-slash) RTL: OFF';
            statusBarItem.tooltip = 'RTL patch is not applied. Click for options.';
            startBlink('statusBarItem.errorBackground');
            break;
        case 'update-needed':
            statusBarItem.text = '$(warning) RTL: UPDATE NEEDED';
            statusBarItem.tooltip =
                'Cursor was updated and the RTL patch needs to be re-applied. Click for options.';
            startBlink('statusBarItem.warningBackground');
            break;
    }

    statusBarItem.show();
}

async function showQuickPick(): Promise<void> {
    const mainJsPath = getMainJsPath();
    const state = getPatchState(mainJsPath);

    const items: vscode.QuickPickItem[] = [];

    if (state === 'on') {
        items.push(
            { label: '$(circle-slash) Disable RTL', description: 'Remove patch and restore original main.js' },
            { label: '$(info) Check Status', description: 'Show current RTL patch status' }
        );
    } else if (state === 'update-needed') {
        items.push(
            { label: '$(refresh) Fix RTL After Cursor Update', description: 'Re-apply the patch that the Cursor update removed' },
            { label: '$(info) Check Status', description: 'Show current RTL patch status' }
        );
    } else {
        items.push(
            { label: '$(check) Enable RTL', description: 'Apply RTL patch to Cursor' },
            { label: '$(info) Check Status', description: 'Show current RTL patch status' }
        );
    }

    items.push({
        label: '$(text-size) Code Editor Direction',
        description: `Currently: ${getEditorRtlMode()}`,
    });

    items.push({
        label: '$(pulse) Diagnostics',
        description: 'Generate a full diagnostics report',
    });

    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Cursor RTL',
    });

    if (!picked) {
        return;
    }

    if (picked.label.includes('Enable') || picked.label.includes('Fix RTL')) {
        await vscode.commands.executeCommand('cursorRtl.enable');
    } else if (picked.label.includes('Disable')) {
        await vscode.commands.executeCommand('cursorRtl.disable');
    } else if (picked.label.includes('Editor Direction')) {
        await vscode.commands.executeCommand('cursorRtl.setEditorRtl');
    } else if (picked.label.includes('Diagnostics')) {
        await vscode.commands.executeCommand('cursorRtl.diagnostics');
    } else if (picked.label.includes('Status')) {
        await vscode.commands.executeCommand('cursorRtl.status');
    }
}

type EditorRtlMode = 'auto' | 'always' | 'off';

function getEditorRtlMode(): EditorRtlMode {
    const value = vscode.workspace
        .getConfiguration('cursorRtl')
        .get<string>('editorRtl', 'auto');
    return value === 'always' || value === 'off' ? value : 'auto';
}

// Persist the editor-RTL mode where the injected loader can read it. The
// loader watches this file and pushes changes live into open windows.
function writeEditorConfig(): void {
    try {
        let existing: Record<string, unknown> = {};
        try {
            existing = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
        } catch {}
        fs.writeFileSync(
            getConfigPath(),
            JSON.stringify({ ...existing, editorRtl: getEditorRtlMode() })
        );
    } catch {
        // Non-critical: the loader defaults to 'auto' when the file is absent.
    }
}

async function setEditorRtlCommand(): Promise<void> {
    const current = getEditorRtlMode();
    const options: Array<{ label: string; description: string; mode: EditorRtlMode }> = [
        { label: '$(sparkle) Auto', description: "Follow each file's dominant language", mode: 'auto' },
        { label: '$(arrow-right) Always RTL', description: 'Force every code editor right-to-left', mode: 'always' },
        { label: '$(circle-slash) Off', description: "Never change the code editor's direction", mode: 'off' },
    ];

    const picked = await vscode.window.showQuickPick(
        options.map((item) => ({
            ...item,
            label: item.mode === current ? `${item.label} $(check)` : item.label,
        })),
        { placeHolder: `Code editor RTL direction (current: ${current})` }
    );

    if (!picked) {
        return;
    }

    await vscode.workspace
        .getConfiguration('cursorRtl')
        .update('editorRtl', picked.mode, vscode.ConfigurationTarget.Global);
    action('editor_rtl_set', { mode: picked.mode });
}

// Single apply entry point for both "enable" and "fix after a Cursor
// update" — the underlying operation is identical (copy loader + apply
// patch, both idempotent). Only a first-ever enable asks for consent with a
// dry-run preview; once the user has enabled before (backups exist or the
// patch is present), it runs straight away.
async function enableCommand(context: vscode.ExtensionContext): Promise<void> {
    const validation = validatePaths();
    if (!validation.valid) {
        vscode.window.showErrorMessage(`Cursor RTL: ${validation.error}`);
        return;
    }

    const mainJsPath = validation.mainJsPath;
    const outDir = getAppOutDir();
    const firstTime = !isPatched(mainJsPath) && !hasBackups(mainJsPath);

    if (firstTime) {
        const dryRun = getDryRunSummary(mainJsPath);
        const detail = dryRun.map((a) => `• ${a}`).join('\n');

        const confirm = await vscode.window.showWarningMessage(
            'Enable RTL support for Cursor?\n\nThis will modify Cursor app files.',
            { modal: true, detail },
            'Enable'
        );

        if (confirm !== 'Enable') {
            return;
        }
    }

    try {
        copyLoader(outDir, context.extensionPath);
        applyPatch(mainJsPath);
        action(firstTime ? 'patch_apply' : 'patch_reapply');
        updateStatusBar('on');
        setupFileWatcher(mainJsPath, context);

        const restart = await vscode.window.showInformationMessage(
            firstTime
                ? 'RTL patch applied successfully! Please close and reopen all Cursor windows to activate.'
                : 'RTL patch re-applied successfully! Please close and reopen all Cursor windows to activate.',
            'Quit Cursor',
            'Later'
        );

        if (restart === 'Quit Cursor') {
            await vscode.commands.executeCommand('workbench.action.quit');
        }
    } catch (err) {
        actionError(err, { op: firstTime ? 'patch_apply' : 'patch_reapply' });
        vscode.window.showErrorMessage(`Cursor RTL: ${handlePermissionError(err)}`);
    }
}

async function disableCommand(): Promise<void> {
    const validation = validatePaths();
    if (!validation.valid) {
        vscode.window.showErrorMessage(`Cursor RTL: ${validation.error}`);
        return;
    }

    const mainJsPath = validation.mainJsPath;

    const confirm = await vscode.window.showWarningMessage(
        'Disable RTL support?\n\nThis will restore the original main.js from backup.',
        { modal: true },
        'Disable'
    );

    if (confirm !== 'Disable') {
        return;
    }

    try {
        removePatch(mainJsPath);
        action('patch_remove');
        updateStatusBar('off');

        const restart = await vscode.window.showInformationMessage(
            'RTL patch removed. Please close and reopen all Cursor windows to apply changes.',
            'Quit Cursor',
            'Later'
        );

        if (restart === 'Quit Cursor') {
            await vscode.commands.executeCommand('workbench.action.quit');
        }
    } catch (err) {
        actionError(err, { op: 'patch_remove' });
        vscode.window.showErrorMessage(`Cursor RTL: ${handlePermissionError(err)}`);
    }
}

async function statusCommand(): Promise<void> {
    const validation = validatePaths();
    if (!validation.valid) {
        vscode.window.showErrorMessage(`Cursor RTL: ${validation.error}`);
        return;
    }

    const state = getPatchState(validation.mainJsPath);
    action('status_check', { state });

    switch (state) {
        case 'on':
            vscode.window.showInformationMessage(
                'Cursor RTL: Patch is ACTIVE. RTL support is enabled.'
            );
            break;
        case 'off':
            vscode.window.showInformationMessage(
                'Cursor RTL: Patch is NOT applied. Use "Cursor RTL: Enable" to activate.'
            );
            break;
        case 'update-needed': {
            const choice = await vscode.window.showWarningMessage(
                'Cursor RTL: Cursor was updated and the patch needs to be re-applied.',
                'Fix Now'
            );
            if (choice === 'Fix Now') {
                await vscode.commands.executeCommand('cursorRtl.enable');
            }
            break;
        }
    }
}

function refreshLoader(context: vscode.ExtensionContext): void {
    try {
        const outDir = getAppOutDir();
        copyLoader(outDir, context.extensionPath);
    } catch {
        // Non-critical — loader is self-discovering, works even if outdated
    }
}

// After refreshLoader has tried to silently update the installed loader, a
// remaining version gap means the copy failed (usually permissions on the
// Cursor app directory) or the loader file is gone — offer a proper Re-apply,
// which surfaces permission errors with guidance.
function checkLoaderVersionGap(context: vscode.ExtensionContext): void {
    const bundled = getLoaderVersion(
        path.join(context.extensionPath, 'resources', LOADER_FILENAME)
    );
    if (!bundled) {
        return;
    }

    const installed = getLoaderVersion(path.join(getAppOutDir(), LOADER_FILENAME));
    if (installed === bundled) {
        return;
    }

    action('loader_gap', { bundled, installed: installed ?? 'missing-or-pre-1.3.0' });
    void vscode.window
        .showWarningMessage(
            `Cursor RTL: The loader installed in Cursor is outdated ` +
            `(installed: ${installed ?? 'unknown'}, expected: ${bundled}). ` +
            `Re-apply the RTL patch to update it.`,
            'Fix Now',
            'Later'
        )
        .then(async (choice) => {
            if (choice === 'Fix Now') {
                await vscode.commands.executeCommand('cursorRtl.enable');
            }
        });
}

function setupFileWatcher(
    mainJsPath: string,
    context: vscode.ExtensionContext
): void {
    if (fileWatcher) {
        fileWatcher.close();
    }

    try {
        fileWatcher = fs.watch(mainJsPath, (eventType) => {
            if (eventType === 'change') {
                setTimeout(async () => {
                    const state = getPatchState(mainJsPath);
                    if (state === 'update-needed' || state === 'off') {
                        action('update_detect');
                        updateStatusBar('update-needed');

                        const config = vscode.workspace.getConfiguration('cursorRtl');
                        if (config.get<boolean>('autoReapply', false)) {
                            await enableCommand(context);
                        } else {
                            const choice = await vscode.window.showWarningMessage(
                                'Cursor was updated and the RTL patch was removed. Fix now?',
                                'Fix Now',
                                'Dismiss'
                            );
                            if (choice === 'Fix Now') {
                                await vscode.commands.executeCommand('cursorRtl.enable');
                            }
                        }
                    }
                }, 1000);
            }
        });
    } catch {
        // fs.watch may fail on some platforms/configurations -- non-critical
    }
}

async function exportDomDiagnostics(): Promise<void> {
    const configPath = getConfigPath();
    const reportPath = path.join(path.dirname(configPath), 'rtl-hebrew-dom-report.json');
    let config: Record<string, unknown> = {};
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
    const request = `${Date.now()}-${process.pid}`;
    try {
        if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);
        fs.writeFileSync(configPath, JSON.stringify({
            ...config,
            editorRtl: getEditorRtlMode(),
            diagnosticsRequest: request,
            diagnosticsReportPath: reportPath,
        }));
    } catch (err) {
        vscode.window.showErrorMessage(`RTL Hebrew: Could not request diagnostics: ${err}`);
        return;
    }

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'RTL Hebrew: Collecting DOM metadata…' },
        () => new Promise<void>((resolve) => {
            const started = Date.now();
            const timer = setInterval(() => {
                if (fs.existsSync(reportPath) || Date.now() - started > 5_000) {
                    clearInterval(timer);
                    resolve();
                }
            }, 200);
        })
    );

    if (!fs.existsSync(reportPath)) {
        vscode.window.showWarningMessage('RTL Hebrew: No DOM report was produced. Re-apply the patch and restart Devin.');
        return;
    }
    const document = await vscode.workspace.openTextDocument(reportPath);
    await vscode.window.showTextDocument(document);
}

async function enableCodexRtl(context: vscode.ExtensionContext): Promise<void> {
    const targets = findCodexTargets().filter((target) => !target.patched);
    if (targets.length === 0) {
        vscode.window.showInformationMessage('RTL Hebrew: No unpatched Codex installation was found.');
        return;
    }
    const details = targets.map((target) => `• ${target.file}`).join('\n');
    const choice = await vscode.window.showWarningMessage(
        `Enable RTL in Codex?\n\nThe following local Codex bundle files will be modified after a checksum-backed backup is created:\n${details}\n\nNo network access or automatic approvals are used.`,
        { modal: true },
        'Enable RTL'
    );
    if (choice !== 'Enable RTL') return;
    const runtime = path.join(context.extensionPath, 'resources', 'codex-rtl.js');
    try {
        for (const target of targets) patchCodex(target, runtime);
        vscode.window.showInformationMessage('Codex RTL enabled. Restart the Extension Host or reload Cursor.');
    } catch (err) {
        actionError(err, { op: 'codex_patch' });
        vscode.window.showErrorMessage(`Could not enable Codex RTL: ${err instanceof Error ? err.message : String(err)}`);
    }
}

async function disableCodexRtl(): Promise<void> {
    const targets = findCodexTargets().filter((target) => target.backup);
    if (targets.length === 0) {
        vscode.window.showInformationMessage('RTL Hebrew: No Codex backups were found.');
        return;
    }
    const choice = await vscode.window.showWarningMessage(
        `Restore ${targets.length} Codex installation(s) from verified backups?`,
        { modal: true },
        'Restore'
    );
    if (choice !== 'Restore') return;
    try {
        for (const target of targets) restoreCodex(target);
        vscode.window.showInformationMessage('Codex files restored. Reload Cursor to finish.');
    } catch (err) {
        actionError(err, { op: 'codex_restore' });
        vscode.window.showErrorMessage(`Could not restore Codex: ${err instanceof Error ? err.message : String(err)}`);
    }
}

function getExtensionVersion(context: vscode.ExtensionContext): string {
    const version = context.extension.packageJSON.version;
    return typeof version === 'string' ? version : '0.0.0';
}

export function activate(context: vscode.ExtensionContext): void {
    const channel = (process.env as Record<string, string | undefined>).CURSOR_CHANNEL
        ?? (process.env as Record<string, string | undefined>).VSCODE_CHANNEL
        ?? '';
    initActions({
        clientVersion: vscode.version,
        extensionVersion: getExtensionVersion(context),
        channel,
    });

    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.command = 'cursorRtl.quickPick';
    context.subscriptions.push(statusBarItem);

    context.subscriptions.push(
        vscode.commands.registerCommand('cursorRtl.quickPick', showQuickPick)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursorRtl.enable', () =>
            enableCommand(context)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursorRtl.disable', () =>
            disableCommand()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursorRtl.status', () =>
            statusCommand()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursorRtl.setEditorRtl', () =>
            setEditorRtlCommand()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursorRtl.diagnostics', () =>
            runDiagnostics(context)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('rtlHebrew.enableCodex', () => enableCodexRtl(context)),
        vscode.commands.registerCommand('rtlHebrew.disableCodex', () => disableCodexRtl()),
        vscode.commands.registerCommand('rtlHebrew.exportDomDiagnostics', () => exportDomDiagnostics()),
        vscode.commands.registerCommand('rtlHebrew.codexStatus', () => {
            const targets = findCodexTargets();
            if (targets.length === 0) {
                vscode.window.showInformationMessage('RTL Hebrew: Codex is not installed or its webview bundle was not found.');
                return;
            }
            const summary = targets.map((target) => `${target.name}: ${target.patched ? 'RTL ON' : 'RTL OFF'}${target.backup ? ' (backup available)' : ''}`).join('\n');
            vscode.window.showInformationMessage(summary, { modal: true });
        })
    );

    writeEditorConfig();

    const mainJsPath = getMainJsPath();
    const state = getPatchState(mainJsPath);

    updateStatusBar(state);

    if (state === 'on') {
        refreshLoader(context);
        checkLoaderVersionGap(context);
    }

    if (fs.existsSync(mainJsPath) && (state === 'on' || state === 'update-needed')) {
        setupFileWatcher(mainJsPath, context);
    }

    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('cursorRtl.showStatusBar')) {
            const currentState = getPatchState(mainJsPath);
            updateStatusBar(currentState);
        }
        if (e.affectsConfiguration('cursorRtl.editorRtl')) {
            writeEditorConfig();
        }
    }, null, context.subscriptions);

    const mainJsState = getPatchState(mainJsPath);
    action('ext_start', { state: mainJsState, platform: process.platform });

}

export function deactivate(): Promise<void> {
    action('ext_stop');
    if (blinkInterval) {
        clearInterval(blinkInterval);
        blinkInterval = undefined;
    }
    if (blinkTimeout) {
        clearTimeout(blinkTimeout);
        blinkTimeout = undefined;
    }
    if (fileWatcher) {
        fileWatcher.close();
        fileWatcher = undefined;
    }
    return disposeActions().catch(() => {});
}
