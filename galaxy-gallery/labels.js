// labels.js
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * 创建一个跟随 3D 位置的 HTML 标签。
 * @param {string} text      显示文字
 * @param {number} colorHex  主题色（用于左侧点缀条）
 * @returns {CSS2DObject}
 */
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