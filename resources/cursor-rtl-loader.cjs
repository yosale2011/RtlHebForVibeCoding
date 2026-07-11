(function() {
    var fs = require("fs");
    var path = require("path");
    var os = require("os");

    // Write log file to home directory — definitely writable by any user process
    var LOG_PREFIX = "[Cursor RTL Loader]";
    var homeDir = os.homedir();
    var LOG_FILE = path.join(homeDir, "cursor-rtl.log");
    var CONFIG_FILE = path.join(homeDir, ".cursor-rtl-config.json");
    // Machine-readable version marker. The extension compares this string
    // between its bundled loader and the copy installed next to main.js to
    // detect when the installed loader is stale and a Re-apply is needed.
    // Keep the exact `var LOADER_VERSION = "x.y.z"` form — it is parsed by regex.
    var LOADER_VERSION = "1.5.0";

    function readConfig() {
        try {
            var raw = fs.readFileSync(CONFIG_FILE, "utf-8");
            var parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") return parsed;
        } catch (e) {}
        return { editorRtl: "auto" };
    }

    function log() {
        var args = Array.prototype.slice.call(arguments);
        var line = new Date().toISOString() + " " + args.join(" ") + "\n";
        try { fs.appendFileSync(LOG_FILE, line); } catch(e) {}
        console.warn.apply(console, [LOG_PREFIX].concat(args));
    }

    try {
        fs.writeFileSync(LOG_FILE, "=== cursor-rtl-loader started at " + new Date().toISOString() + " ===\nhome=" + homeDir + "\n");
    } catch(initErr) {
        console.warn(LOG_PREFIX, "FATAL: cannot write log to", LOG_FILE, initErr.message);
    }

    log("pid=" + process.pid, "version=" + LOADER_VERSION);

    // --- require electron (this is the most likely failure point) ---
    var electron;
    try {
        electron = require("electron");
        log("electron required ok. app=" + (electron.app ? "ok" : "undefined") + " BrowserWindow=" + (electron.BrowserWindow ? "ok" : "undefined"));
    } catch(e) {
        log("FATAL: require('electron') failed:", e.message);
        return;
    }

    // Extension dirs must be compared by semver, not lexicographically:
    // "1.1.10" sorts before "1.1.9" as a string but is the newer version.
    function parseExtensionVersion(dirName) {
        var m = dirName.match(/^(?:local\.yb-rtl|local\.rtl-hebrew-unified|motcke\.cursor-rtl)-(\d+)\.(\d+)\.(\d+)/);
        if (!m) return [0, 0, 0];
        return [Number(m[1]), Number(m[2]), Number(m[3])];
    }

    function compareExtensionDirs(a, b) {
        var va = parseExtensionVersion(a);
        var vb = parseExtensionVersion(b);
        for (var i = 0; i < 3; i++) {
            if (va[i] !== vb[i]) return va[i] - vb[i];
        }
        return 0;
    }

    function candidateExtensionDirs() {
        var dirs = [];
        var args = process.argv;
        for (var i = 0; i < args.length; i++) {
            if (args[i] === "--extensions-dir" && args[i + 1]) { dirs.push(args[i + 1]); break; }
            if (typeof args[i].startsWith === "function" && args[i].startsWith("--extensions-dir=")) {
                dirs.push(args[i].slice("--extensions-dir=".length));
                break;
            }
        }
        var home = os.homedir();
        function add(p) { if (dirs.indexOf(p) === -1) dirs.push(p); }
        add(path.join(home, ".cursor", "extensions"));
        add(path.join(home, ".vscode", "extensions"));
        add(path.join(home, ".devin", "extensions"));
        add(path.join(home, ".cursor-server", "extensions"));
        add(path.join(home, ".vscode-server", "extensions"));
        add(path.join(home, ".antigravity", "extensions"));
        return dirs;
    }

    function compareVersions(va, vb) {
        for (var i = 0; i < 3; i++) {
            if (va[i] !== vb[i]) return va[i] - vb[i];
        }
        return 0;
    }

    function findRtlScript() {
        var candidates = candidateExtensionDirs();
        var bestPath = "";
        var bestVersion = [0, 0, 0];
        for (var i = 0; i < candidates.length; i++) {
            var extDir = candidates[i];
            try {
                var entries = fs.readdirSync(extDir);
                var dirs = entries.filter(function(d) { return /^(?:local\.yb-rtl|local\.rtl-hebrew-unified|motcke\.cursor-rtl)-\d/.test(d); });
                for (var j = 0; j < dirs.length; j++) {
                    var v = parseExtensionVersion(dirs[j]);
                    var rtlPath = path.join(extDir, dirs[j], "resources", "rtl.js");
                    var exists = fs.existsSync(rtlPath);
                    log("checking", extDir, dirs[j], "version:", v.join("."), "exists:", exists);
                    if (exists && compareVersions(v, bestVersion) > 0) {
                        bestVersion = v;
                        bestPath = rtlPath;
                    }
                }
            } catch (e) {
                log("findRtlScript error in", extDir, e.message);
            }
        }
        log("selected rtl.js:", bestPath);
        return bestPath;
    }

    function isWorkbenchUrl(url) {
        // Cursor, Devin and other VS Code forks use slightly different
        // workbench filenames, but all keep "workbench" in the main window URL.
        return typeof url === "string" && /workbench/i.test(url);
    }

    function isInjectableUrl(url) {
        if (typeof url !== "string") return false;
        return isWorkbenchUrl(url) || /^vscode-webview:/i.test(url) || /\/webview\//i.test(url);
    }

    function isRtlRuntimeAlive(wc) {
        return wc.executeJavaScript('typeof window.__cursorRtlScanAll === "function"');
    }

    // --- frame-level injection ---
    // Extension panels (Claude Code, Codex, the Devin/Windsurf agent) are
    // vscode-webview iframes INSIDE the workbench webContents, not separate
    // webContents. executeJavaScript on the webContents only reaches the main
    // frame, so these panels must be injected per-frame via webFrameMain.
    function isWebviewFrameUrl(url) {
        return typeof url === "string" && (/^vscode-webview:/i.test(url) || /\/webview\//i.test(url));
    }

    function injectIntoFrame(frame, label) {
        if (!frame) return;
        var url = "";
        try { url = frame.url || ""; } catch (e) { return; }
        if (!isWebviewFrameUrl(url)) return;
        var rtlPath = findRtlScript();
        if (!rtlPath) { log(label, "frame: rtl.js NOT FOUND"); return; }
        var scriptPath = path.join(path.dirname(rtlPath), "devin-rtl.js");
        if (!fs.existsSync(scriptPath)) { log(label, "frame: devin-rtl.js NOT FOUND"); return; }
        var script = fs.readFileSync(scriptPath, "utf-8");
        var cfg = readConfig();
        var configScript = "window.__cursorRtlConfig = " + JSON.stringify(cfg) + ";\n";
        frame.executeJavaScript(configScript + script)
            .then(function() { log(label, "frame injected OK url=" + url.slice(0, 80)); })
            .catch(function(err) { log(label, "frame inject ERROR:", err && err.message, "url=" + url.slice(0, 80)); });
    }

    function injectIntoFrames(wc, label) {
        try {
            if (!wc || wc.isDestroyed() || !wc.mainFrame) return;
            var frames = wc.mainFrame.framesInSubtree || [];
            for (var i = 0; i < frames.length; i++) {
                if (frames[i] === wc.mainFrame) continue;
                injectIntoFrame(frames[i], label);
            }
        } catch (e) {
            log(label, "injectIntoFrames error:", e.message);
        }
    }

    function runRtlScript(wc, label, currentUrl) {
        var rtlPath = findRtlScript();
        if (!rtlPath) {
            log(label, "rtl.js NOT FOUND");
            wc.__rtlInjecting = false;
            return;
        }
        var scriptPath = isWorkbenchUrl(currentUrl)
            ? rtlPath
            : path.join(path.dirname(rtlPath), "devin-rtl.js");
        if (!fs.existsSync(scriptPath)) {
            log(label, "runtime script NOT FOUND:", scriptPath);
            wc.__rtlInjecting = false;
            return;
        }
        var script = fs.readFileSync(scriptPath, "utf-8");
        var cfg = readConfig();
        var configScript = "window.__cursorRtlConfig = " + JSON.stringify(cfg) + ";\n";
        log(label, "calling executeJavaScript, runtime:", path.basename(scriptPath), "script length:", script.length, "editorRtl:", cfg.editorRtl);
        wc.executeJavaScript(configScript + script)
            .then(function() { return isRtlRuntimeAlive(wc); })
            .then(function(alive) {
                wc.__rtlInjecting = false;
                if (alive) {
                    wc.__rtlInjectedUrl = currentUrl;
                    log(label, "executeJavaScript OK, runtime verified");
                } else {
                    wc.__rtlInjectedUrl = "";
                    log(label, "executeJavaScript finished but runtime not verified");
                }
            })
            .catch(function(err) {
                wc.__rtlInjecting = false;
                wc.__rtlInjectedUrl = "";
                log(label, "executeJavaScript ERROR:", err && err.message);
            });
    }

    function injectIntoWebContents(wc, label) {
        if (!wc || wc.isDestroyed()) { log(label, "wc destroyed, skip"); return; }
        if (wc.__rtlInjecting) { log(label, "injection in flight, skip"); return; }
        var currentUrl = "";
        try { currentUrl = wc.getURL ? wc.getURL() : ""; } catch(e) { currentUrl = ""; }
        if (!isInjectableUrl(currentUrl)) {
            log(label, "not an injectable workbench/webview, skip url=" + currentUrl);
            return;
        }
        if (wc.__rtlInjectedUrl === currentUrl) {
            isRtlRuntimeAlive(wc)
                .then(function(alive) {
                    if (alive) {
                        log(label, "runtime already active for url, skip");
                        return;
                    }
                    log(label, "injection flag set but runtime missing, re-injecting");
                    wc.__rtlInjectedUrl = "";
                    injectIntoWebContents(wc, label + "-revive");
                })
                .catch(function() {
                    wc.__rtlInjectedUrl = "";
                    injectIntoWebContents(wc, label + "-revive");
                });
            return;
        }
        wc.__rtlInjecting = true;
        try {
            runRtlScript(wc, label, currentUrl);
        } catch (e) {
            wc.__rtlInjecting = false;
            wc.__rtlInjectedUrl = "";
            log(label, "inject error:", e.message);
        }
    }

    function scheduleInjectFallback(wc, winId) {
        var delays = [250, 1000];
        for (var i = 0; i < delays.length; i++) {
            (function(delay) {
                setTimeout(function() {
                    if (!wc || wc.isDestroyed()) return;
                    var url = "";
                    try { url = wc.getURL ? wc.getURL() : ""; } catch(e) { url = ""; }
                    if (!isInjectableUrl(url)) return;
                    isRtlRuntimeAlive(wc)
                        .then(function(alive) {
                            if (!alive) {
                                injectIntoWebContents(wc, "inject-fallback[" + winId + "@" + delay + "ms]");
                            }
                        })
                        .catch(function() {
                            injectIntoWebContents(wc, "inject-fallback[" + winId + "@" + delay + "ms]");
                        });
                    injectIntoFrames(wc, "frames-fallback[" + winId + "@" + delay + "ms]");
                }, delay);
            })(delays[i]);
        }
    }

    function setupWebContents(wc, label) {
        if (!wc || wc.isDestroyed()) { log(label, "no live webContents"); return; }
        if (wc.__rtlSetupDone) return;
        wc.__rtlSetupDone = true;
        var winId = wc.id;
        var url = "";
        try { url = wc.getURL ? wc.getURL() : "?"; } catch(e) { url = "err"; }
        log(label, "id=" + winId, "url=" + url, "loading=" + wc.isLoading());
        wc.on("did-start-loading", function() {
            wc.__rtlInjectedUrl = "";
            log("did-start-loading win=" + winId, "cleared injection flag");
        });
        wc.on("did-finish-load", function() {
            var u = "";
            try { u = wc.getURL ? wc.getURL() : "?"; } catch(e) { u = "err"; }
            log("did-finish-load win=" + winId, "url=" + u);
            injectIntoWebContents(wc, "inject[" + winId + "]");
            injectIntoFrames(wc, "frames[" + winId + "]");
        });
        wc.on("did-frame-finish-load", function(ev, isMainFrame, frameProcessId, frameRoutingId) {
            if (isMainFrame) return;
            try {
                if (!electron.webFrameMain || !electron.webFrameMain.fromId) return;
                var frame = electron.webFrameMain.fromId(frameProcessId, frameRoutingId);
                injectIntoFrame(frame, "frame[" + winId + "]");
            } catch (e) {
                log("frame[" + winId + "] did-frame-finish-load error:", e.message);
            }
        });
        scheduleInjectFallback(wc, winId);
        if (!wc.isLoading() && !wc.isDestroyed()) {
            injectIntoWebContents(wc, "inject-now[" + winId + "]");
        }
    }

    function setupWindow(win, label) {
        if (!win || !win.webContents) { log(label, "no webContents"); return; }
        setupWebContents(win.webContents, label);
    }

    try {
        electron.app.on("browser-window-created", function(ev, win) {
            log("browser-window-created id=" + win.id);
            setupWindow(win, "setup[" + win.id + "]");
        });
        log("browser-window-created listener registered");
        electron.app.on("web-contents-created", function(ev, wc) {
            log("web-contents-created id=" + wc.id + " type=" + (wc.getType ? wc.getType() : "unknown"));
            setupWebContents(wc, "webcontents[" + wc.id + "]");
        });
        log("web-contents-created listener registered");
    } catch(e) {
        log("FATAL: app.on failed:", e.message);
        return;
    }

    try {
        var existing = electron.BrowserWindow.getAllWindows();
        log("existing windows at loader start:", existing.length);
        for (var i = 0; i < existing.length; i++) {
            setupWindow(existing[i], "existing[" + existing[i].id + "]");
        }
        if (electron.webContents && electron.webContents.getAllWebContents) {
            var existingContents = electron.webContents.getAllWebContents();
            log("existing webContents at loader start:", existingContents.length);
            for (var c = 0; c < existingContents.length; c++) {
                setupWebContents(existingContents[c], "existing-webcontents[" + existingContents[c].id + "]");
            }
        }
    } catch (e) {
        log("getAllWindows error:", e.message);
    }

    // Live-push editor RTL mode changes to open workbench windows so toggling
    // the setting/quick-pick applies without a reload.
    function pushEditorMode(mode) {
        try {
            var wins = electron.BrowserWindow.getAllWindows();
            for (var i = 0; i < wins.length; i++) {
                (function(win) {
                    try {
                        var wc = win.webContents;
                        if (!wc || wc.isDestroyed()) return;
                        var url = wc.getURL ? wc.getURL() : "";
                        if (!isWorkbenchUrl(url)) return;
                        wc.executeJavaScript(
                            "window.__cursorRtlSetEditorMode && window.__cursorRtlSetEditorMode(" +
                            JSON.stringify(mode) + ")"
                        ).catch(function() {});
                    } catch (e) {}
                })(wins[i]);
            }
        } catch (e) {
            log("pushEditorMode error:", e.message);
        }
    }

    // Runs inside the workbench renderer. It deliberately records structural
    // metadata only—never textContent, file names, prompts, or chat contents.
    function collectDomMetadata() {
        function classText(el) {
            return typeof el.className === "string" ? el.className.slice(0, 300) : "";
        }
        function ancestorPath(el) {
            var parts = [];
            var current = el.parentElement;
            for (var depth = 0; current && depth < 6; depth++, current = current.parentElement) {
                parts.push({
                    tag: current.tagName,
                    className: classText(current),
                    role: current.getAttribute("role") || "",
                    dir: current.getAttribute("dir") || ""
                });
            }
            var root = el.getRootNode ? el.getRootNode() : null;
            if (root && root.host) {
                parts.push({
                    tag: "#SHADOW-HOST:" + root.host.tagName,
                    className: classText(root.host),
                    role: root.host.getAttribute("role") || "",
                    dir: root.host.getAttribute("dir") || ""
                });
            }
            return parts;
        }
        var roots = [document];
        var all = [];
        for (var rootIndex = 0; rootIndex < roots.length; rootIndex++) {
            var nodes = roots[rootIndex].querySelectorAll("*");
            for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
                all.push(nodes[nodeIndex]);
                if (nodes[nodeIndex].shadowRoot && roots.indexOf(nodes[nodeIndex].shadowRoot) === -1) {
                    roots.push(nodes[nodeIndex].shadowRoot);
                }
            }
        }
        var rtlElements = [];
        var structuralElements = [];
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            var rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            var style = getComputedStyle(el);
            var text = el.textContent || "";
            var hasRtl = /[\u0590-\u05ff\u0600-\u06ff]/.test(text);
            var role = el.getAttribute("role") || "";
            var isStructural = /^(UL|OL|LI)$/.test(el.tagName) || role === "list" || role === "listitem" || style.display === "list-item";
            if (!hasRtl && !isStructural) continue;
            var before = getComputedStyle(el, "::before");
            var marker = getComputedStyle(el, "::marker");
            var record = {
                tag: el.tagName,
                className: classText(el),
                role: role,
                dir: el.getAttribute("dir") || "",
                rtlApplied: el.getAttribute("dir") === "rtl",
                childElementCount: el.childElementCount,
                textLength: text.length,
                hasRtl: hasRtl,
                computed: {
                    direction: style.direction,
                    display: style.display,
                    textAlign: style.textAlign,
                    listStyleType: style.listStyleType,
                    listStylePosition: style.listStylePosition,
                    paddingInlineStart: style.paddingInlineStart,
                    paddingInlineEnd: style.paddingInlineEnd
                },
                pseudo: {
                    beforeContent: before.content,
                    beforeDisplay: before.display,
                    beforePosition: before.position,
                    markerContent: marker.content,
                    markerDisplay: marker.display
                },
                rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
                ancestors: ancestorPath(el)
            };
            if (hasRtl && rtlElements.length < 500) rtlElements.push(record);
            if (isStructural && structuralElements.length < 300) structuralElements.push(record);
        }
        return { url: location.href, shadowRootCount: roots.length - 1, rtlElements: rtlElements, structuralElements: structuralElements };
    }

    function runDomDiagnostics(cfg) {
        if (!cfg.diagnosticsRequest || !cfg.diagnosticsReportPath) return;
        try {
            var contents = electron.webContents && electron.webContents.getAllWebContents
                ? electron.webContents.getAllWebContents()
                : electron.BrowserWindow.getAllWindows().map(function(win) { return win.webContents; });
            var jobs = [];
            for (var i = 0; i < contents.length; i++) {
                var wc = contents[i];
                if (!wc || wc.isDestroyed() || !isInjectableUrl(wc.getURL ? wc.getURL() : "")) continue;
                jobs.push(wc.executeJavaScript("(" + collectDomMetadata.toString() + ")()"));
                // Include webview iframes (Claude Code / Codex / agent panels).
                try {
                    var frames = wc.mainFrame ? (wc.mainFrame.framesInSubtree || []) : [];
                    for (var f = 0; f < frames.length; f++) {
                        if (frames[f] === wc.mainFrame) continue;
                        if (!isWebviewFrameUrl(frames[f].url || "")) continue;
                        jobs.push(frames[f].executeJavaScript("(" + collectDomMetadata.toString() + ")()"));
                    }
                } catch (e) {
                    log("DOM diagnostics frames error:", e.message);
                }
            }
            Promise.all(jobs).then(function(reports) {
                fs.writeFileSync(cfg.diagnosticsReportPath, JSON.stringify({
                    generatedAt: new Date().toISOString(),
                    request: cfg.diagnosticsRequest,
                    privacy: "Structural metadata only; no chat text is included.",
                    windows: reports
                }, null, 2));
                log("DOM diagnostics written:", cfg.diagnosticsReportPath);
            }).catch(function(err) { log("DOM diagnostics failed:", err.message); });
        } catch (e) {
            log("DOM diagnostics setup failed:", e.message);
        }
    }

    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify({ editorRtl: "auto" }));
        }
        var configWatchTimer = null;
        fs.watch(CONFIG_FILE, function() {
            if (configWatchTimer) return;
            configWatchTimer = setTimeout(function() {
                configWatchTimer = null;
                var cfg = readConfig();
                log("config changed, pushing editorRtl:", cfg.editorRtl);
                pushEditorMode(cfg.editorRtl || "auto");
                runDomDiagnostics(cfg);
            }, 150);
        });
        log("watching config file:", CONFIG_FILE);
    } catch (e) {
        log("config watch not active:", e.message);
    }

    log("loader setup complete.");
})();
