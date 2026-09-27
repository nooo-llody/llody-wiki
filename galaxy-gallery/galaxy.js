// galaxy.js
import * as THREE from 'three';
import { createGalaxyLabel } from './labels.js';

/** 确定性伪随机（同一个 seed 每次结果相同） */
function makeRng(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** 计算桌面端每个星系的位置 */
function computePosition(gi, data, config, layout) {
  /* 1. 显式指定位置 —— 优先级最高 */
  if (data.position && typeof data.position.x === 'number') {
    return { x: data.position.x, y: data.position.y };
  }

  /* 2. 自动布局 */
  const cols = layout.cols;
  const col = gi % cols;
  const row = Math.floor(gi / cols);

  const startX = -layout.visibleWidth / 2 + config.edgeMargin;
  const startY =  layout.visibleHeight / 2 - config.edgeMargin;

  const baseX = startX + config.spacingX * (col + 0.5);
  const baseY = startY - config.spacingY * (row + 0.5);

  /* 3. 自由排版：加确定性错落偏移 */
  if (config.freeLayout) {
    const rnd = makeRng(gi + 1);
    const offX = (rnd() - 0.5) * 2 * config.freeJitterX;
    const offY = (rnd() - 0.5) * 2 * config.freeJitterY;
    return { x: baseX + offX, y: baseY + offY };
  }

  return { x: baseX, y: baseY };
}

export async function buildGalaxies(worldGroup, config, layout, createModel) {
  const galaxies = [];
  const total = config.galaxies.length;

  for (let gi = 0; gi < total; gi++) {
    const data = config.galaxies[gi];

    /* ---------- 位置 ---------- */
    const pos = layout.overlapped
      ? { x: 0, y: 0 }
      : computePosition(gi, data, config, layout);
    const { x, y } = pos;

    /* ---------- 星系组 ---------- */
    const galaxyGroup = new THREE.Group();
    galaxyGroup.position.set(x, y, 0);
    galaxyGroup.rotation.x = config.initialTilt;
    galaxyGroup.rotation.z = config.leftTilt;
    galaxyGroup.userData = { type: 'galaxy', index: gi };
    worldGroup.add(galaxyGroup);

    /* 恒星 */
    const star = await createModel({
      color: data.color, seed: gi * 100 + 7, url: data.starModel || null,
    });
    star.scale.setScalar(config.starScale);
    star.userData = { type: 'star', galaxyIndex: gi, url: data.starUrl };
    galaxyGroup.add(star);

    /* 行星环 */
    const orbitRing = new THREE.Group();
    galaxyGroup.add(orbitRing);

    /* 行星 */
    const planets = [];
    for (let mi = 0; mi < data.models.length; mi++) {
      const mData = data.models[mi];
      const planet = await createModel({
        color: data.color, seed: gi * 100 + mi + 1, url: mData.model || null,
      });

      const angle = (mi / data.models.length) * Math.PI * 2;
      planet.position.set(
        Math.cos(angle) * config.orbitRadius,
        0,
        Math.sin(angle) * config.orbitRadius
      );
      planet.scale.setScalar(config.planetScale);
      planet.userData = {
        type: 'planet', galaxyIndex: gi, modelIndex: mi,
        url: mData.url, label: mData.label,
      };
      orbitRing.add(planet);
      planets.push(planet);
    }

    /* 文字标签 */
    const label = createGalaxyLabel(data.name || `星系 ${gi + 1}`, data.color);
    label.position.set(x, y - config.labelOffsetY, 0);
    worldGroup.add(label);

    /* 移动端重叠模式：初始只显示第一个 */
    if (layout.overlapped) {
      galaxyGroup.visible = (gi === 0);
      label.userData.labelEl.style.opacity = (gi === 0) ? '1' : '0';
    }

    galaxies.push({
      group: galaxyGroup, orbitRing, star, planets, data,
      baseX: x, baseY: y,
      targetTilt: config.initialTilt, spinVel: 0, _lastSwap: null,
      label, labelEl: label.userData.labelEl,
    });
  }

  return galaxies;
}