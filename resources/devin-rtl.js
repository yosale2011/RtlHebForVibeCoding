(() => {
    'use strict';
    if (window.__rtlHebrewDevinLoaded) {
        window.__cursorRtlScanAll?.();
        return;
    }
    window.__rtlHebrewDevinLoaded = true;

    const RTL = /[\u0590-\u05ff\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/g;
    const LETTER = /\p{L}/gu;
    const BLOCKS = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dt,dd';
    const LISTS = 'ul,ol,[role="list"]';
    const INPUTS = 'textarea,input,[contenteditable="true"]';

    function dirFor(text) {
        const value = text || '';
        const rtl = (value.match(RTL) || []).length;
        const letters = (value.match(LETTER) || []).length;
        if (!letters) return 'ltr';
        return rtl / letters >= 0.3 ? 'rtl' : 'ltr';
    }

    function apply(root = document) {
        root.querySelectorAll(BLOCKS).forEach((el) => {
            if (el.closest('pre,code,[class*="diff" i],[class*="terminal" i]')) return;
            el.dir = dirFor(el.textContent);
            el.style.textAlign = 'start';
        });
        root.querySelectorAll(LISTS).forEach((el) => {
            el.dir = dirFor(el.textContent);
            el.style.textAlign = 'start';
        });
        root.querySelectorAll(INPUTS).forEach((el) => {
            if (el.closest('pre,code')) return;
            el.dir = 'auto';
            el.style.textAlign = 'start';
        });
        root.querySelectorAll('pre,code').forEach((el) => {
            el.dir = 'ltr';
            el.style.textAlign = 'left';
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
})();
