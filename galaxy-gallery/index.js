// index.js
import * as THREE from 'three';
import { normalizeConfig } from './config.js';
import { createScene } from './scene.js';
import { createModelFactory } from './models.js';
import { buildGalaxies } from './galaxy.js';
import { attachInput } from './input.js';
import { createStateMachine } from './states.js';
import { createBackButton } from './back-button.js';
import { createMobileNav } from './mobile-nav.js';
import { createCategoryNav } from './category-nav.js';
import { createPlanetNav } from './planet-nav.js';

function readCssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name).trim();
  return v || fallback;
}

function computeNavOffset(camera, container) {
  const navHeightPx = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--nav-height')
  ) || 64;
  const halfNavPx = navHeightPx / 2;

  const vFOV = THREE.MathUtils.degToRad(camera.fov);
  const dist = camera.position.length();
  const visibleHeight = 2 * Math.tan(vFOV / 2) * dist;
  const worldPerPixel = visibleHeight / container.clientHeight;

  return -halfNavPx * worldPerPixel;
}

export async function createGalaxyGallery(container, userOptions = {}) {
  const gsap = window.gsap;
  if (!gsap) throw new Error('请先引入 GSAP');

  const backgroundColor = userOptions.backgroundColor
    || readCssVar('--bg', '#f7f9fc');

  const config = normalizeConfig({ ...userOptions, backgroundColor });

  /* ---------- 1. 解析类别 ---------- */
  const rawCategories = (userOptions.categories && userOptions.categories.length)
    ? userOptions.categories
    : [{ name: '全部', galaxies: userOptions.galaxies || [] }];

  const flatGalaxies = [];
  const categories = [];
  for (const cat of rawCategories) {
    const startIdx = flatGalaxies.length;
    for (const g of cat.galaxies) flatGalaxies.push(g);
    categories.push({
      name: cat.name,
      galaxyIndices: Array.from(
        { length: cat.galaxies.length },
        (_, i) => startIdx + i
      ),
    });
  }
  config.galaxies = flatGalaxies;

  /* ---------- 2. 场景 ---------- */
  const { renderer, labelRenderer, scene, camera, worldGroup, rootOffset } =
    createScene(container, backgroundColor);

  /* ---------- 3. 布局 ---------- */
  const isMobile = container.clientWidth < config.mobileBreakpoint;
  const isTablet = !isMobile && container.clientWidth < config.tabletBreakpoint;

  const vFOV = THREE.MathUtils.degToRad(camera.fov);
  const camDist = camera.position.length();
  const visibleHeight = 2 * Math.tan(vFOV / 2) * camDist;
  const visibleWidth = visibleHeight * camera.aspect;

  const layout = {
    isMobile,
    isTablet,
    visibleWidth,
    visibleHeight,
    overlapped: isMobile && config.mobileSingleView,
    cols: isMobile
      ? config.gridColsMobile
      : (isTablet
          ? config.gridColsTablet
          : Math.max(2, Math.min(
              config.gridColsDesktop,
              Math.floor(container.clientWidth / 320)
            ))),
  };

  rootOffset.position.y = computeNavOffset(camera, container);

  /* ---------- 4. 构建 ---------- */
  const createModel = createModelFactory(config);
  const galaxies = await buildGalaxies(worldGroup, config, layout, createModel);

  /* ---------- 5. 状态机 ---------- */
  const stateMachine = createStateMachine(galaxies, config, gsap);

  let state = 'overview';
  let currentCategoryIdx = 0;

  /* ---------- 6. 返回按钮 ---------- */
  const backBtn = createBackButton(container, {
    onClick: () => {
      if (state === 'model') {
        const galaxy = galaxies[input.getActiveGalaxy()];
        if (galaxy) stateMachine.revertSwap(galaxy);
        state = 'galaxy';
        syncBackBtn();
      } else if (state === 'galaxy') {
        stateMachine.revertToOverview(worldGroup, {
          overlapped: layout.overlapped,
          activeIndex: input.getActiveGalaxy(),
        });
        if (!layout.overlapped) input.setActiveGalaxy(-1);
        state = 'overview';
        syncBackBtn();
        if (mobileNav) mobileNav.show();
        if (categoryNav) categoryNav.show();
      } else {
        if (history.length > 1) history.back();
        else window.location.href = '/';
      }
    },
  });

  function syncBackBtn() {
    if (state === 'galaxy' || state === 'model') backBtn.show();
    else backBtn.hide();
  }

  /* ---------- 7. 移动端专用 UI ---------- */
  let mobileNav = null;
  if (layout.overlapped) {
    mobileNav = createMobileNav(container, {
      onPrev: () => switchMobileGalaxy(-1),
      onNext: () => switchMobileGalaxy(+1),
    });
    mobileNav.show();
  }

  let categoryNav = null;
  if (layout.overlapped && categories.length > 1) {
    categoryNav = createCategoryNav(container, {
      categories,
      onChange: (i) => {
        if (i === currentCategoryIdx) return;
        currentCategoryIdx = i;
        switchMobileCategory(i);
      },
    });
    categoryNav.show();

    if (config.hideCategoryNameOnMobile && isMobile) {
      const nameEl = categoryNav.getNameEl();
      if (nameEl) nameEl.style.display = 'none';
    }
  }

  let planetNav = null;
  if (layout.overlapped) {
    planetNav = createPlanetNav(container, { onNext: cycleNextPlanet });
  }

  /* ---------- 8. 输入 ---------- */
  const input = attachInput({
    domElement: renderer.domElement,
    container, camera, scene, galaxies, config,
    getState: () => state,
    layout,

    onGalaxyClick: (i) => {
      state = 'galaxy';
      syncBackBtn();
      if (mobileNav) mobileNav.hide();
      if (categoryNav) categoryNav.hide();
      if (planetNav) planetNav.show();
      stateMachine.enterGalaxy(i, worldGroup);
    },
    onPlanetClick: (planet) => {
      state = 'model';
      syncBackBtn();
      const galaxy = galaxies[planet.userData.galaxyIndex];
      galaxy._lastSwap = {
        previousStar: galaxy.star,
        currentStar: planet,
        planetOriginalSlot: planet.position.clone(),
      };
      stateMachine.swapStarPlanet(galaxy, planet);
    },
    onStarClick: (star) => {
      state = 'jumping';
      syncBackBtn();
      if (mobileNav) mobileNav.hide();
      if (categoryNav) categoryNav.hide();
      if (planetNav) planetNav.hide();
      const galaxy = galaxies[star.userData.galaxyIndex];
      stateMachine.launchJump(star, galaxy, scene, () => {
        window.location.href = star.userData.url;
      });
    },
  });

  /* ---------- 9. ★ 移动端：点击标签切换下一个星系 ---------- */
  if (layout.overlapped && config.tapLabelToSwitch) {
    galaxies.forEach((g) => {
      if (!g.labelEl) return;
      g.labelEl.style.pointerEvents = 'auto';
      g.labelEl.style.cursor = 'pointer';
      g.labelEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state === 'overview') {
          switchMobileGalaxy(+1);
        }
      });
    });
  }

  /* ---------- 10. 移动端切换逻辑 ---------- */
  function switchMobileCategory(catIdx) {
    const cat = categories[catIdx];
    const list = cat.galaxyIndices;
    if (!list.length) return;

    const firstIdx = list[0];
    input.setActiveGalaxy(firstIdx);

    galaxies.forEach((g, i) => {
      const show = (i === firstIdx);
      g.group.visible = show;
      if (g.labelEl) {
        const shouldShowLabel = show && !(config.hideLabelsOnMobile && isMobile);
        g.labelEl.style.opacity = shouldShowLabel ? '1' : '0';
        g.labelEl.style.pointerEvents = shouldShowLabel ? 'auto' : 'none';
      }
    });
  }

  function switchMobileGalaxy(dir) {
    const cat = categories[currentCategoryIdx];
    const list = cat.galaxyIndices;
    if (!list.length) return;

    const currentLocal = list.indexOf(input.getActiveGalaxy());
    const nextLocal = (currentLocal + dir + list.length) % list.length;
    const nextGlobal = list[nextLocal];

    input.setActiveGalaxy(nextGlobal);

    galaxies.forEach((g, i) => {
      const show = (i === nextGlobal);
      g.group.visible = show;
      if (g.labelEl) {
        const shouldShowLabel = show && !(config.hideLabelsOnMobile && isMobile);
        g.labelEl.style.opacity = shouldShowLabel ? '1' : '0';
        g.labelEl.style.pointerEvents = shouldShowLabel ? 'auto' : 'none';
      }
    });
  }

  function cycleNextPlanet() {
    if (state !== 'galaxy') return;
    const galaxy = galaxies[input.getActiveGalaxy()];
    if (!galaxy) return;

    const currentIdx = galaxy.star.userData.modelIndex ?? -1;
    const nextIdx = (currentIdx + 1) % galaxy.data.models.length;

    const target = galaxy.planets.find((p) => p.userData.modelIndex === nextIdx);
    if (!target) return;

    galaxy._lastSwap = {
      previousStar: galaxy.star,
      currentStar: target,
      planetOriginalSlot: target.position.clone(),
    };
    stateMachine.swapStarPlanet(galaxy, target);
  }

  /* ---------- 11. 初始化 ---------- */
  if (layout.overlapped) {
    input.setActiveGalaxy(categories[0].galaxyIndices[0]);
    switchMobileCategory(0);
  }

  /* ---------- 12. 渲染循环 ---------- */
  const clock = new THREE.Clock();
  const _starWorld = new THREE.Vector3();
  const _starNDC = new THREE.Vector3();
  let rafId;

  function animate() {
    const dt = Math.min(clock.getDelta(), 0.05);

    if (state !== 'jumping') {
      const activeIdx = input.getActiveGalaxy();
      const mouseNDC = input.getMouseNDC();
      const mouseActive = input.isMouseActive();
      const isDragging = input.isDragging();

      galaxies.forEach((g, i) => {
        if (!g.group.visible) return;
        const isActive = state === 'overview' || i === activeIdx;
        if (!isActive) return;

        if (isDragging) {
          g.spinVel *= 0.75;
        } else if (mouseActive) {
          const targetVel = mouseNDC.x * config.hoverSpeed;
          g.spinVel += (targetVel - g.spinVel) * config.hoverEase;
          g.group.rotation.y += g.spinVel * dt;
        } else {
          g.spinVel *= 0.92;
          g.group.rotation.y += g.spinVel * dt;
        }

        g.group.rotation.x +=
          (g.targetTilt - g.group.rotation.x) * config.tiltEase;

        if (mouseActive) {
          g.star.getWorldPosition(_starWorld);
          _starNDC.copy(_starWorld).project(camera);

          const dx = mouseNDC.x - _starNDC.x;
          const dy = mouseNDC.y - _starNDC.y;

          const desiredYaw = THREE.MathUtils.clamp(
            dx * config.starYawGain, -config.starYawMax, config.starYawMax
          );
          const curYaw = g.group.rotation.y + g.star.rotation.y;
          g.star.rotation.y += (desiredYaw - curYaw) * config.starTurnEase;

          const desiredPitch = THREE.MathUtils.clamp(
            -dy * config.starPitchGain +
              g.group.rotation.x * config.starFollowTilt,
            -config.starPitchMax * 2, config.starPitchMax * 2
          );
          const curPitch = g.group.rotation.x + g.star.rotation.x;
          g.star.rotation.x += (desiredPitch - curPitch) * config.starTurnEase;
        } else {
          const tY = 0, cY = g.group.rotation.y + g.star.rotation.y;
          g.star.rotation.y += (tY - cY) * 0.05;
          g.star.rotation.x += (0 - g.star.rotation.x) * 0.05;
        }
      });
    }

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    rafId = requestAnimationFrame(animate);
  }
  rafId = requestAnimationFrame(animate);

  /* ---------- 13. 自适应 ---------- */
  const onResize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    rootOffset.position.y = computeNavOffset(camera, container);
  };
  window.addEventListener('resize', onResize);

  /* ---------- 14. 对外接口 ---------- */
  return {
    destroy() {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      backBtn.destroy();
      if (mobileNav) mobileNav.destroy();
      if (categoryNav) categoryNav.destroy();
      if (planetNav) planetNav.destroy();
      input.destroy();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      if (labelRenderer.domElement.parentNode) {
        labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
      }
    },
  };
}