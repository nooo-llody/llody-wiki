// states.js
import { fadeAll } from './utils.js';

/** 淡入 / 淡出标签 */
function fadeLabel(galaxy, target, duration, gsap, ease = 'power2.out') {
  if (!galaxy.labelEl) return;
  gsap.killTweensOf(galaxy.labelEl.style);
  gsap.to(galaxy.labelEl.style, { opacity: target, duration, ease });
}

export function createStateMachine(galaxies, config, gsap) {

  /* ============================================================
     总览 → 聚焦某个星系
     ============================================================ */
  function enterGalaxy(index, worldGroup) {
    const target = galaxies[index];

    gsap.to(worldGroup.position, {
      x: -target.baseX,
      y: -target.baseY,
      z: 0,
      duration: 2.4,
      ease: 'power3.inOut',
    });

    gsap.to(target.group.scale, {
      x: config.galaxyZoom,
      y: config.galaxyZoom,
      z: config.galaxyZoom,
      duration: 2.4,
      ease: 'power3.inOut',
    });
    fadeAll(target.group, 1, 1.0, gsap);

    /* ★ 目标星系标签淡出（进入星系后不需要它的名字了） */
    fadeLabel(target, 0, 0.8, gsap, 'power2.in');

    galaxies.forEach((g, i) => {
      if (i === index) return;

      fadeAll(g.group, 0, 1.6, gsap);
      fadeLabel(g, 0, 1.0, gsap);

      gsap.to(g.group.scale, {
        x: 0.25, y: 0.25, z: 0.25,
        duration: 2.2,
        ease: 'power3.in',
      });

      const dx = g.baseX - target.baseX;
      const dy = g.baseY - target.baseY;
      const len = Math.hypot(dx, dy) || 1;

      gsap.to(g.group.position, {
        x: g.baseX + (dx / len) * 8,
        y: g.baseY + (dy / len) * 8,
        z: 10,
        duration: 2.2,
        ease: 'power3.in',
      });
    });
  }

  /* ============================================================
     行星 ⇄ 恒星 交换
     ============================================================ */
  function swapStarPlanet(galaxy, planet) {
    const oldStar = galaxy.star;
    const planetSlot = planet.position.clone();

    galaxy.group.attach(planet);
    galaxy.orbitRing.attach(oldStar);

    const D = config.swapDuration;
    const E = config.swapEase;

    gsap.to(planet.position, {
      x: 0, y: 0, z: 0,
      duration: D, ease: E,
    });
    gsap.to(planet.scale, {
      x: config.starScale,
      y: config.starScale,
      z: config.starScale,
      duration: D, ease: E,
    });
    gsap.to(planet.rotation, {
      x: 0, z: 0,
      duration: D, ease: E,
    });

    gsap.to(oldStar.position, {
      x: planetSlot.x,
      y: planetSlot.y,
      z: planetSlot.z,
      duration: D, ease: E,
    });
    gsap.to(oldStar.scale, {
      x: config.planetScale,
      y: config.planetScale,
      z: config.planetScale,
      duration: D, ease: E,
    });
    gsap.to(oldStar.rotation, {
      x: 0, z: 0,
      duration: D, ease: E,
    });

    galaxy.planets.forEach((p) => {
      if (p === planet || p === oldStar) return;
      gsap.to(p.scale, {
        x: config.planetScale * 1.2,
        y: config.planetScale * 1.2,
        z: config.planetScale * 1.2,
        duration: D, ease: E,
      });
    });

    planet.userData.type = 'star';
    oldStar.userData.type = 'planet';
    galaxy.star = planet;
    galaxy.planets = galaxy.planets.filter((p) => p !== planet);
    galaxy.planets.push(oldStar);
  }

  /* ============================================================
     撤销交换
     ============================================================ */
  function revertSwap(galaxy) {
    if (!galaxy._lastSwap) return;

    const { currentStar, previousStar, planetOriginalSlot } = galaxy._lastSwap;

    galaxy.orbitRing.attach(currentStar);
    galaxy.group.attach(previousStar);

    const D = config.swapDuration;
    const E = config.swapEase;

    gsap.to(currentStar.position, {
      x: planetOriginalSlot.x,
      y: planetOriginalSlot.y,
      z: planetOriginalSlot.z,
      duration: D, ease: E,
    });
    gsap.to(currentStar.scale, {
      x: config.planetScale,
      y: config.planetScale,
      z: config.planetScale,
      duration: D, ease: E,
    });
    gsap.to(currentStar.rotation, { x: 0, z: 0, duration: D, ease: E });

    gsap.to(previousStar.position, {
      x: 0, y: 0, z: 0,
      duration: D, ease: E,
    });
    gsap.to(previousStar.scale, {
      x: config.starScale,
      y: config.starScale,
      z: config.starScale,
      duration: D, ease: E,
    });
    gsap.to(previousStar.rotation, { x: 0, z: 0, duration: D, ease: E });

    galaxy.planets.forEach((p) => {
      if (p === previousStar || p === currentStar) return;
      gsap.to(p.scale, {
        x: config.planetScale,
        y: config.planetScale,
        z: config.planetScale,
        duration: D, ease: E,
      });
    });

    currentStar.userData.type = 'planet';
    previousStar.userData.type = 'star';
    galaxy.star = previousStar;
    galaxy.planets = galaxy.planets.filter((p) => p !== previousStar);
    galaxy.planets.push(currentStar);
    galaxy._lastSwap = null;
  }

  /* ============================================================
     星系 → 总览
     ============================================================ */
  function revertToOverview(worldGroup, options = {}) {
    const { overlapped = false, activeIndex = -1 } = options;

    gsap.to(worldGroup.position, {
      x: 0, y: 0, z: 0,
      duration: 1.8,
      ease: 'power3.inOut',
    });

    galaxies.forEach((g, i) => {
      gsap.to(g.group.scale, {
        x: 1, y: 1, z: 1,
        duration: 1.8,
        ease: 'power3.inOut',
      });
      gsap.to(g.group.position, {
        x: g.baseX,
        y: g.baseY,
        z: 0,
        duration: 1.8,
        ease: 'power3.inOut',
      });

      if (!overlapped) {
        fadeAll(g.group, 1, 1.2, gsap);
        fadeLabel(g, 1, 1.2, gsap);
      } else {
        if (i === activeIndex) {
          g.group.visible = true;
          fadeAll(g.group, 1, 1.2, gsap);
          fadeLabel(g, 1, 1.2, gsap);
        } else {
          g.group.visible = false;
          if (g.labelEl) gsap.set(g.labelEl.style, { opacity: 0 });
        }
      }
    });
  }

  /* ============================================================
     点击恒星 → 跳转
     ============================================================ */
  function launchJump(model, galaxy, scene, onComplete) {
    scene.attach(model);

    gsap.to(model.position, {
      x: 0, y: 1.2, z: 13,
      duration: 2.7,
      ease: 'power3.in',
    });
    gsap.to(model.scale, {
      x: 2.6, y: 2.6, z: 2.6,
      duration: 2.7,
      ease: 'power3.in',
    });
    gsap.to(model.rotation, {
      y: model.rotation.y + Math.PI * 0.6,
      duration: 2.7,
      ease: 'power3.in',
    });

    galaxy.planets.forEach((p) => fadeAll(p, 0, 1.4, gsap));
    fadeAll(galaxy.star, 0, 1.1, gsap);

    /* 所有标签淡出 */
    galaxies.forEach((g) => fadeLabel(g, 0, 1.0, gsap));

    galaxies.forEach((g) => {
      if (g.group !== galaxy.group) fadeAll(g.group, 0, 1.4, gsap);
    });

    gsap.delayedCall(2.65, () => {
      if (onComplete) onComplete();
    });
  }

  return {
    enterGalaxy,
    swapStarPlanet,
    revertSwap,
    revertToOverview,
    launchJump,
  };
}