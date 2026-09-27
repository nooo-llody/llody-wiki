// input.js
import * as THREE from 'three';
import { findAncestor, isDescendant } from './utils.js';

export function attachInput({
  domElement,
  container,
  camera,
  scene,
  galaxies,
  config,
  getState,
  layout,
  onGalaxyClick,
  onPlanetClick,
  onStarClick,
}) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const mouseNDC = new THREE.Vector2(0, 0);

  let isDragging = false;
  let dragMoved = false;
  let lastX = 0;
  let lastY = 0;
  let mouseActive = false;
  let activeGalaxyIndex = -1;

  /* ============================================================
     pointerdown
     ============================================================ */
  const onDown = (e) => {
    isDragging = true;
    dragMoved = false;
    lastX = e.clientX;
    lastY = e.clientY;
    try { domElement.setPointerCapture(e.pointerId); } catch (_) {}
  };

  /* ============================================================
     pointermove（悬停 + 拖拽）
     ============================================================ */
  const onMove = (e) => {
    const rect = container.getBoundingClientRect();
    mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    mouseActive = true;

    if (!isDragging) return;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragMoved = true;

    /* 移动端重叠模式：不响应拖拽倾斜 */
    if (layout && layout.overlapped) return;

    const state = getState();

    galaxies.forEach((g, i) => {
      const isActive = state === 'overview' || i === activeGalaxyIndex;
      if (!isActive) return;

      g.group.rotation.y += dx * config.dragSpeedX;

      g.targetTilt += dy * config.tiltSpeedY;
      g.targetTilt = Math.max(
        config.initialTilt - config.maxTilt,
        Math.min(config.initialTilt + config.maxTilt, g.targetTilt)
      );
    });
  };

  /* ============================================================
     pointerup
     ============================================================ */
  const onUp = (e) => {
    isDragging = false;
    try { domElement.releasePointerCapture(e.pointerId); } catch (_) {}
  };

  /* ============================================================
     mouseleave
     ============================================================ */
  const onLeave = () => {
    mouseActive = false;
    mouseNDC.set(0, 0);
  };

  /* ============================================================
     click
     ============================================================ */
  const onClick = (e) => {
    const state = getState();
    if (state === 'jumping') return;
    if (dragMoved) return;

    const rect = container.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObjects(scene.children, true);
    if (!hits.length) return;
    const hit = hits[0].object;

    /* 总览：点星系 → 聚焦 */
    if (state === 'overview') {
      const g = findAncestor(hit, 'galaxy');
      if (g) {
        activeGalaxyIndex = g.userData.index;
        onGalaxyClick(g.userData.index);
      }
      return;
    }

    /* 星系 / 模型视图 */
    const galaxy = galaxies[activeGalaxyIndex];
    if (!galaxy) return;

    if (isDescendant(hit, galaxy.star)) {
      onStarClick(galaxy.star);
      return;
    }

    const planet = galaxy.planets.find((p) => isDescendant(hit, p));
    if (planet) onPlanetClick(planet);
  };

  /* ============================================================
     绑定
     ============================================================ */
  domElement.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  document.addEventListener('mouseleave', onLeave);
  domElement.addEventListener('click', onClick);

  /* ============================================================
     对外接口
     ============================================================ */
  return {
    getMouseNDC: () => mouseNDC,
    isMouseActive: () => mouseActive,
    isDragging: () => isDragging,
    getActiveGalaxy: () => activeGalaxyIndex,
    setActiveGalaxy: (i) => { activeGalaxyIndex = i; },

    destroy() {
      domElement.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('mouseleave', onLeave);
      domElement.removeEventListener('click', onClick);
    },
  };
}