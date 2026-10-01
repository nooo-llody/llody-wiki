// /galaxy-gallery/labels.js
// ★ 使用 esm.sh 完整 URL

import { CSS2DObject } from 'https://esm.sh/three@0.160.0/examples/jsm/renderers/CSS2DRenderer.js';

export function createGalaxyLabel(text, colorHex) {
    const el = document.createElement('div');
    el.className = 'galaxy-label';
    el.textContent = text;

    const colorCss = '#' + colorHex.toString(16).padStart(6, '0');
    el.style.setProperty('--label-color', colorCss);

    const obj = new CSS2DObject(el);
    obj.userData.labelEl = el;
    return obj;
}