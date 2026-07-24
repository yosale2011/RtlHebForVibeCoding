(() => {
    'use strict';
    if (window.__rtlHebrewCodexLoaded) return;
    window.__rtlHebrewCodexLoaded = true;

    const RTL = /[\u0590-\u05ff\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/g;
    // First-strong RTL ranges (Hebrew, Arabic, Syriac, Thaana, presentation forms).
    const RTL_FIRST = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FF\u0870-\u089F\u08A0-\u08FF\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFE]/;
    const LTR_FIRST = /[A-Za-z]/;
    const LETTER = /\p{L}/gu;
    const SELECTOR = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,textarea,[contenteditable="true"]';

    // --- Direction detection (first-strong, code-aware) --------------------
    // Mirrors the proven logic in the main rtl.js runtime so Codex webviews
    // get the same quality as Cursor/Qoder chat instead of a crude ratio.

    // Text excluding <code>/<pre> children: code identifiers must not tip a
    // Hebrew sentence to LTR.
    function textWithoutCode(el) {
        let out = '';
        const nodes = el.childNodes || [];
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (n.nodeType === 3) out += n.textContent;
            else if (n.nodeType === 1 && n.tagName !== 'CODE' && n.tagName !== 'PRE') out += textWithoutCode(n);
        }
        return out;
    }

    // Remove leading LTR-only noise (filenames/URLs/paths/backtick-code) so a
    // Hebrew sentence starting with "main.js" still detects as RTL.
    function stripLeadingLTR(text) {
        return text
            .replace(/^\s*(?:[\w.\-]+\.[\w]{1,5})\s*/g, '')
            .replace(/https?:\/\/\S+/g, '')
            .replace(/[\w.\-]+[\/\\][\w.\-\/\\]+/g, '')
            .replace(/`[^`]+`/g, '');
    }

    function firstStrongDir(text) {
        if (!text) return null;
        const r = RTL_FIRST.exec(text);
        const l = LTR_FIRST.exec(text);
        if (!r) return l ? 'ltr' : null;
        if (!l) return 'rtl';
        return r.index < l.index ? 'rtl' : 'ltr';
    }

    function ratioDir(text) {
        const rtl = (text.match(RTL) || []).length;
        const letters = (text.match(LETTER) || []).length;
        if (!letters) return null;
        return rtl / letters >= 0.3 ? 'rtl' : 'ltr';
    }

    // 3-layer detection: first-strong on code-free text, then again after
    // stripping leading LTR noise, then a weighted ratio fallback.
    function detectDir(el) {
        const noCode = textWithoutCode(el);
        if (!(noCode.match(RTL) || []).length) {
            return ratioDir(el.textContent || el.value || '');
        }
        let d = firstStrongDir(noCode);
        if (d === 'rtl') return 'rtl';
        d = firstStrongDir(stripLeadingLTR(noCode));
        if (d === 'rtl') return 'rtl';
        return ratioDir(noCode);
    }

    // --- Bare arithmetic isolation -----------------------------------------
    // Inside an RTL paragraph the bidi algorithm lays "2 + 3 = 5" right-to-left
    // (rendered mirrored). Wrap each numeric/arithmetic run in an ltr-isolated
    // span so version numbers ("1.95.0"), counts and formulas keep their order.

    const MATH_OP_CHARS = '+\\-*/=<>%' + String.fromCharCode(
        0xD7, 0xF7, 0xB1, 0x2212, 0x2264, 0x2265, 0x2260,
        0x2248, 0x2192, 0xB7, 0x2022, 0x2219, 0x2217, 0x22C5, 0x221A);
    const MATH_OP_RE = new RegExp('[' + MATH_OP_CHARS + ']');
    const MATH_DIGIT_RE = /[0-9]/;
    const MATH_TOKEN_RE = new RegExp('^(?:[0-9.,:;()\\[\\]{}|' + MATH_OP_CHARS + ']+|[A-Za-z])$');
    const MATH_ISLAND_ATTR = 'data-rtl-math';

    const isMathyToken = (t) => !!t && MATH_TOKEN_RE.test(t);
    const isOperandToken = (t) => MATH_DIGIT_RE.test(t) || /^[A-Za-z]$/.test(t);

    function findMathRanges(text) {
        const ranges = [];
        if (!text || !MATH_OP_RE.test(text) || !MATH_DIGIT_RE.test(text)) return ranges;
        let base = 0;
        const lines = text.split('\n');
        for (let li = 0; li < lines.length; li++) {
            scanLine(lines[li], base);
            base += lines[li].length + 1;
        }
        return ranges;

        function scanLine(line, off) {
            const toks = [];
            const re = /\S+/g;
            let m;
            while ((m = re.exec(line)) !== null) {
                toks.push({ v: m[0], start: m.index, end: m.index + m[0].length });
            }
            let i = 0;
            while (i < toks.length) {
                if (!isMathyToken(toks[i].v)) { i++; continue; }
                let j = i;
                while (j + 1 < toks.length && isMathyToken(toks[j + 1].v)) j++;
                let a = i, b = j;
                while (a <= b && !isOperandToken(toks[a].v)) a++;
                while (b >= a && !isOperandToken(toks[b].v)) b--;
                if (a <= b) {
                    let s = off + toks[a].start;
                    let e = off + toks[b].end;
                    while (e > s && '.,:;'.indexOf(text.charAt(e - 1)) !== -1) e--;
                    while (e > s && ',:;'.indexOf(text.charAt(s)) !== -1) s++;
                    const sub = text.slice(s, e);
                    if (e - s >= 2 && MATH_DIGIT_RE.test(sub) && MATH_OP_RE.test(sub)) {
                        ranges.push([s, e]);
                    }
                }
                i = j + 1;
            }
        }
    }

    function segmentMathText(text) {
        const segs = [];
        if (!text) return segs;
        const ranges = findMathRanges(text);
        if (!ranges.length) { segs.push({ type: 'text', value: text }); return segs; }
        let pos = 0;
        for (let i = 0; i < ranges.length; i++) {
            if (ranges[i][0] > pos) segs.push({ type: 'text', value: text.slice(pos, ranges[i][0]) });
            segs.push({ type: 'math', value: text.slice(ranges[i][0], ranges[i][1]) });
            pos = ranges[i][1];
        }
        if (pos < text.length) segs.push({ type: 'text', value: text.slice(pos) });
        return segs;
    }

    function isolateMath(root) {
        if (!root || typeof document.createTreeWalker !== 'function') return;
        if (root.nodeType !== 1 && root.nodeType !== 9) return;
        const walker = document.createTreeWalker(root, 4 /* SHOW_TEXT */, {
            acceptNode(node) {
                const v = node.nodeValue;
                if (!v || !MATH_DIGIT_RE.test(v) || !MATH_OP_RE.test(v)) return 2;
                const p = node.parentElement;
                if (!p) return 2;
                if (p.tagName === 'SCRIPT' || p.tagName === 'STYLE') return 2;
                if (p.closest('pre, code, .monaco-editor, [data-language], [' + MATH_ISLAND_ATTR + '], [contenteditable="true"]')) return 2;
                return 1;
            }
        });
        const targets = [];
        let n;
        while ((n = walker.nextNode())) targets.push(n);
        for (const textNode of targets) {
            const segs = segmentMathText(textNode.nodeValue);
            if (!segs.some((s) => s.type === 'math')) continue;
            const frag = document.createDocumentFragment();
            for (const seg of segs) {
                if (seg.type === 'math') {
                    const span = document.createElement('span');
                    span.setAttribute(MATH_ISLAND_ATTR, '1');
                    span.style.unicodeBidi = 'isolate';
                    span.style.direction = 'ltr';
                    span.textContent = seg.value;
                    frag.appendChild(span);
                } else {
                    frag.appendChild(document.createTextNode(seg.value));
                }
            }
            if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
        }
    }

    // --- Apply --------------------------------------------------------------
    function apply(root) {
        const elements = [];
        if (root.nodeType === 1 && root.matches?.(SELECTOR)) elements.push(root);
        root.querySelectorAll?.(SELECTOR).forEach((el) => elements.push(el));
        for (const el of elements) {
            if (el.closest('pre,code,.monaco-editor,[data-language]')) continue;
            const dir = detectDir(el);
            if (!dir) continue;
            el.dir = dir;
            el.style.textAlign = 'start';
        }
        // Isolate inline emphasis so a leading bold Latin label ("Qoder:")
        // sits at the RTL start (right) instead of being pushed to the left.
        root.querySelectorAll?.('strong,em,b,i').forEach((el) => {
            if (el.closest('pre,code,.monaco-editor,[data-language]')) return;
            el.style.unicodeBidi = 'isolate';
        });
        root.querySelectorAll?.('pre,code,.monaco-editor').forEach((el) => {
            el.dir = 'ltr';
            el.style.textAlign = 'left';
        });
        try { isolateMath(root); } catch (e) {}
    }

    let scheduled = false;
    const observer = new MutationObserver((records) => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            for (const record of records) for (const node of record.addedNodes) apply(node);
        });
    });
    apply(document);
    observer.observe(document.documentElement, { childList: true, subtree: true });
})();
