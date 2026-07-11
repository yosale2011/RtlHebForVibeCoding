(() => {
    'use strict';
    if (window.__rtlHebrewCodexLoaded) return;
    window.__rtlHebrewCodexLoaded = true;

    const RTL = /[\u0590-\u05ff\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/g;
    const LETTER = /\p{L}/gu;
    const SELECTOR = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,textarea,[contenteditable="true"]';

    function direction(text) {
        const rtl = (text.match(RTL) || []).length;
        const letters = (text.match(LETTER) || []).length;
        if (!letters) return null;
        return rtl / letters >= 0.3 ? 'rtl' : 'ltr';
    }

    function apply(root) {
        const elements = [];
        if (root.nodeType === 1 && root.matches?.(SELECTOR)) elements.push(root);
        root.querySelectorAll?.(SELECTOR).forEach(el => elements.push(el));
        for (const el of elements) {
            if (el.closest('pre,code,.monaco-editor,[data-language]')) continue;
            const dir = direction(el.textContent || el.value || '');
            if (!dir) continue;
            el.dir = dir;
            el.style.textAlign = 'start';
            el.style.unicodeBidi = 'plaintext';
        }
        root.querySelectorAll?.('pre,code,.monaco-editor').forEach(el => {
            el.dir = 'ltr';
            el.style.textAlign = 'left';
        });
    }

    let scheduled = false;
    const observer = new MutationObserver(records => {
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
