(() => {
    'use strict';
    if (window.__rtlHebrewDevinLoaded) {
        window.__cursorRtlScanAll?.();
        return;
    }
    window.__rtlHebrewDevinLoaded = true;

    const RTL_CHAR = /[\u0590-\u05ff\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/;
    const LETTER = /\p{L}/u;
    const BLOCKS = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dt,dd';
    const LISTS = 'ul,ol,[role="list"]';
    // Claude Code's composer uses contenteditable="plaintext-only".
    const INPUTS = 'textarea,input,[contenteditable="true"],[contenteditable="plaintext-only"]';
    const SKIP = 'pre,code,[class*="diff" i],[class*="terminal" i]';
    const SAMPLE_LIMIT = 4000;
    const RLM = '\u200F';

    // First-strong + ratio hybrid: the first strong letter decides the
    // direction; a Latin start still flips to RTL when >=30% of the letters
    // are RTL (e.g. "1. Run: פקודה בעברית").
    function dirFor(text) {
        const value = (text || '').slice(0, SAMPLE_LIMIT);
        let first = null;
        let rtl = 0;
        let letters = 0;
        for (const ch of value) {
            if (RTL_CHAR.test(ch)) {
                rtl++;
                letters++;
                if (first === null) first = 'rtl';
            } else if (LETTER.test(ch)) {
                letters++;
                if (first === null) first = 'ltr';
            }
        }
        if (!letters) return 'ltr';
        if (first === 'rtl') return 'rtl';
        return rtl / letters >= 0.3 ? 'rtl' : 'ltr';
    }

    function startsWithLtrLetter(text) {
        const value = (text || '').slice(0, 200);
        for (const ch of value) {
            if (RTL_CHAR.test(ch)) return false;
            if (LETTER.test(ch)) return true;
        }
        return false;
    }

    // An RTL block that *renders* starting with Latin/neutral content can get
    // visually reordered by the bidi algorithm; a leading Right-to-Left Mark
    // anchors it. Idempotent — skipped if the mark is already there.
    function ensureRlm(el) {
        const first = el.firstChild;
        if (first && first.nodeType === 3 && first.textContent.startsWith(RLM)) return;
        if (!startsWithLtrLetter(el.textContent)) return;
        el.insertBefore(document.createTextNode(RLM), first || null);
    }

    // Write-only-on-change so the 200ms re-sync loop doesn't spam mutations.
    function setDir(el, dir) {
        if (el.getAttribute('dir') !== dir) el.dir = dir;
        if (el.style.textAlign !== 'start') el.style.textAlign = 'start';
    }

    function clearDir(el) {
        if (el.getAttribute('dir')) {
            el.removeAttribute('dir');
            el.style.textAlign = '';
        }
    }

    // Elements whose dir *we* set — so the re-sync loop only ever clears its
    // own work and never strips a dir attribute the app itself rendered.
    const touched = new WeakSet();

    // User-message bubbles are usually plain text inside a bare <div> or a
    // <span> wrapped by a div (Codex: div.text-size-chat > span; Claude Code:
    // div.content_* > span) — no markdown <p>/<li> structure, so the BLOCKS
    // selector never reaches them. Handle leaf elements explicitly. When the
    // leaf is an inline <span> whose direct parent is a plain <div>, the dir
    // goes on that div so text-align applies at block level; otherwise it
    // stays on the leaf itself (harmless bidi isolation) to avoid flipping
    // unrelated UI containers like toolbars.
    function applyPlainLeaves(root) {
        root.querySelectorAll('div,span').forEach((el) => {
            if (el.childElementCount) return;
            if (el.isContentEditable) return;
            const text = el.textContent;
            if (!text || !text.trim()) return;
            if (el.closest(SKIP)) return;
            if (el.closest('ul,ol,[role="list"]')) return;
            let target = el;
            if (el.tagName === 'SPAN' && el.parentElement && el.parentElement.tagName === 'DIV') {
                target = el.parentElement;
            }
            // Respect a dir the app rendered itself.
            if (target.getAttribute('dir') && !touched.has(target)) return;
            if (dirFor(text) === 'rtl') {
                touched.add(target);
                setDir(target, 'rtl');
            } else if (touched.has(target)) {
                clearDir(target);
                touched.delete(target);
            }
        });
    }

    function apply(root = document) {
        applyPlainLeaves(root);
        root.querySelectorAll(BLOCKS).forEach((el) => {
            if (el.closest(SKIP)) return;
            // Direction is decided once per list (below) and inherited by its
            // items; per-item detection breaks mixed Hebrew/English lists.
            if (el.closest('ul,ol,[role="list"]')) {
                clearDir(el);
                return;
            }
            const dir = dirFor(el.textContent);
            setDir(el, dir);
            if (dir === 'rtl') ensureRlm(el);
        });
        root.querySelectorAll(LISTS).forEach((el) => {
            // Nested lists inherit the top-level list's direction.
            if (el.parentElement && el.parentElement.closest('ul,ol,[role="list"]')) {
                clearDir(el);
                return;
            }
            setDir(el, dirFor(el.textContent));
        });
        root.querySelectorAll(INPUTS).forEach((el) => {
            if (el.closest('pre,code')) return;
            if (el.getAttribute('dir') !== 'auto') el.dir = 'auto';
            if (el.style.textAlign !== 'start') el.style.textAlign = 'start';
        });
        root.querySelectorAll('pre,code').forEach((el) => {
            if (el.getAttribute('dir') !== 'ltr') el.dir = 'ltr';
            if (el.style.textAlign !== 'left') el.style.textAlign = 'left';
        });
    }

    const style = document.createElement('style');
    style.dataset.rtlHebrewDevin = 'true';
    style.textContent = `
        p code, li code, blockquote code {
            direction: ltr !important;
            unicode-bidi: isolate !important;
        }
        ul[dir="rtl"], ol[dir="rtl"], [role="list"][dir="rtl"] {
            padding-inline-start: 1.5em !important;
            padding-inline-end: 0 !important;
        }
    `;
    document.head.appendChild(style);

    let pending = false;
    const observer = new MutationObserver(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
            pending = false;
            apply();
        });
    });
    window.__cursorRtlScanAll = apply;
    apply();
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

    // React-based panels re-render and silently strip our dir attributes
    // without necessarily producing childList/characterData mutations we
    // observe. A low-cost periodic re-sync (writes only on change) keeps the
    // direction stable; paused while the document is hidden.
    setInterval(() => {
        if (!document.hidden) apply();
    }, 200);
})();
