// /galaxy-gallery/embed-gallery.js
// 嵌入式 3D 画廊 — iOS 兼容 + 双指缩放/平移 + 恒星选择

import * as THREE from 'https://esm.sh/three@0.160.0';
import { CSS2DRenderer } from 'https://esm.sh/three@0.160.0/examples/jsm/renderers/CSS2DRenderer.js';
import { makeBuilding, fadeAll, findAncestor, isDescendant } from './utils.js';
import { createGalaxyLabel } from './labels.js';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

let globalContextCount = 0;
const MAX_CONTEXTS = 8;

export async function createEmbedGallery(container, userOptions = {}) {

    const gsap = window.gsap;
    if (!gsap) throw new Error('请先引入 GSAP');

    const galaxies = userOptions.galaxies || [];
    const total = galaxies.length;
    if (!total) return { destroy() {} };

    const isMobile =
        window.matchMedia('(max-width: 767px)').matches ||
        container.clientWidth < 768;

    console.log(`[embed] 初始化 | iOS=${isIOS} 移动端=${isMobile} 星系数=${total}`);

    /* ============================================================
       参数
       ============================================================ */
    const orbitRadius    = userOptions.orbitRadius    ?? (isMobile ? 1.5 : 2.2);
    const starScale      = userOptions.starScale      ?? (isMobile ? 1.1 : 1.6);
    const planetScale    = userOptions.planetScale    ?? (isMobile ? 0.42 : 0.6);
    const spacing        = userOptions.spacing        ?? (isMobile ? 5.6 : 8);
    const zoomFactor     = userOptions.zoomFactor     ?? 1.8;
    const blockHeightMul = userOptions.blockHeightMul ?? 1;

    const lonelyStarMul  = userOptions.lonelyStarMul  ?? 1.6;

    const initialTiltDeg = userOptions.initialTiltDeg ?? 15;
    const leftTiltDeg    = userOptions.leftTiltDeg    ?? 0;
    const initialTilt = THREE.MathUtils.degToRad(initialTiltDeg);
    const leftTilt    = THREE.MathUtils.degToRad(leftTiltDeg);

    const hoverSpeed    = userOptions.hoverSpeed    ?? 0.5;
    const hoverEase     = userOptions.hoverEase     ?? 0.06;
    const dragSpeedX    = userOptions.dragSpeedX    ?? 0.006;
    const tiltSpeedY    = userOptions.tiltSpeedY    ?? 0.0015;
    const maxTilt       = userOptions.maxTilt       ?? 0.45;

    const starYawGain   = userOptions.starYawGain   ?? 2.0;
    const starYawMax    = THREE.MathUtils.degToRad(userOptions.starYawMaxDeg ?? 75);
    const starPitchGain = userOptions.starPitchGain ?? 1.2;
    const starPitchMax  = THREE.MathUtils.degToRad(userOptions.starPitchMaxDeg ?? 25);
    const starFollow    = userOptions.starFollowTilt ?? 1.0;
    const starTurnEase  = userOptions.starTurnEase  ?? 0.09;

    const swapDuration  = userOptions.swapDuration  ?? 1.4;
    const swapEase      = userOptions.swapEase      ?? 'sine.inOut';
    const loadModel     = userOptions.loadModel || null;

    const PINCH_MIN = userOptions.pinchMin ?? 0.4;
    const PINCH_MAX = userOptions.pinchMax ?? 3.0;

    /* ============================================================
       背景色 & 场景
       ============================================================ */
    const backgroundColor =
        userOptions.backgroundColor ||
        getComputedStyle(document.documentElement)
            .getPropertyValue('--bg').trim() || '#f7f9fc';

    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(backgroundColor);
    scene.background = bgColor;
    scene.fog = new THREE.Fog(bgColor, 24, 55);

    const getW = () => Math.max(1, container.clientWidth || window.innerWidth || 375);
    const getH = () => Math.max(1, container.clientHeight || 450);

    /* ============================================================
       ★ 相机状态（用 target + distance 描述）
       ============================================================ */
    const baseDist = isMobile ? 10 : 11;

    const camState = {
        target: new THREE.Vector3(0, 0, 0),    /* 相机看向的点 */
        dist: baseDist,                         /* 相机到 target 的距离 */
        offsetY: 2.2,                           /* 相机相对 target 的 Y 偏移 */
        baseDist: baseDist,
        minDist: baseDist / PINCH_MAX,          /* 最近（放大到最大） */
        maxDist: baseDist / PINCH_MIN,          /* 最远（缩小到最小） */
    };

    const camera = new THREE.PerspectiveCamera(50, getW() / getH(), 0.1, 100);

    function updateCamera() {
        camera.position.set(
            camState.target.x,
            camState.target.y + camState.offsetY,
            camState.target.z + camState.dist
        );
        camera.lookAt(camState.target);
    }
    updateCamera();

    scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(6, 12, 8);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x6688ff, 1.2);
    rimLight.position.set(-8, 4, -6);
    scene.add(rimLight);

    /* ============================================================
       上下文上限
       ============================================================ */
    if (globalContextCount >= MAX_CONTEXTS) {
        console.error(`[embed] WebGL 上下文数达上限`);
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;opacity:0.5;">3D 视图数量已达上限</div>';
        return { destroy() {} };
    }

    /* ============================================================
       渲染器
       ============================================================ */
    let renderer;
    try {
        const dprCap = isIOS ? 1.25 : (isMobile ? 1.5 : 2);

        renderer = new THREE.WebGLRenderer({
            antialias: !isIOS,
            alpha: false,
            powerPreference: 'default',
            failIfMajorPerformanceCaveat: false,
            preserveDrawingBuffer: false,
            stencil: false,
            depth: true,
        });

        renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
        renderer.setSize(getW(), getH());
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.setClearColor(bgColor, 1);

    } catch (err) {
        console.error('[embed] ✗ WebGL 创建失败：', err);
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;opacity:0.6;">此设备不支持 3D 视图</div>';
        return { destroy() {} };
    }

    globalContextCount++;

    renderer.domElement.style.display = 'block';
    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.style.touchAction = 'none';
    container.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    console.log(`[embed] ✓ WebGL 已创建 | ${renderer.domElement.width}×${renderer.domElement.height} | DPR=${renderer.getPixelRatio()}`);

    /* 上下文丢失监听 */
    let contextLost = false;
    const onContextLost = (e) => { e.preventDefault(); contextLost = true; console.warn('[embed] ⚠ 上下文丢失'); };
    const onContextRestored = () => { contextLost = false; console.log('[embed] ✓ 上下文恢复'); };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored, false);

    /* CSS2D */
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(getW(), getH());
    Object.assign(labelRenderer.domElement.style, {
        position: 'absolute', top: '0', left: '0',
        width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: '5',
    });
    container.appendChild(labelRenderer.domElement);

    /* 世界 */
    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    function makeTallBuilding(color, seed) {
        const g = makeBuilding(color, seed);
        if (blockHeightMul === 1) return g;
        g.children.forEach((c) => {
            c.scale.y *= blockHeightMul;
            c.position.y *= blockHeightMul;
        });
        return g;
    }

    async function getModel(color, seed, url) {
        if (loadModel && url) {
            try { return await loadModel(url); } catch (err) {
                console.warn(`[embed] GLB 失败，回退方块: ${url}`, err);
            }
        }
        return makeTallBuilding(color, seed);
    }

    /* ============================================================
       构建星系
       ============================================================ */
    const galaxyList = [];
    const offsets = [];
    for (let i = 0; i < total; i++) {
        offsets.push((i - (total - 1) / 2) * spacing);
    }

    for (let gi = 0; gi < total; gi++) {
        const data = galaxies[gi];
        const offsetX = offsets[gi];

        const galaxyGroup = new THREE.Group();
        galaxyGroup.position.set(offsetX, 0, 0);
        galaxyGroup.rotation.x = initialTilt;
        galaxyGroup.rotation.z = leftTilt;
        galaxyGroup.userData = { type: 'galaxy', index: gi };
        worldGroup.add(galaxyGroup);

        const models = data.models || [];
        const isLonely = models.length === 0;

        const thisStarScale = isLonely ? starScale * lonelyStarMul : starScale;

        const star = await getModel(data.color, gi * 100 + 7, data.starModel);
        star.scale.setScalar(thisStarScale);

        const starLabel = data.starLabel || data.name || '恒星';

        star.userData = {
            type: 'star',
            galaxyIndex: gi,
            url: data.starUrl,
            label: starLabel,
            isLonely,
        };
        galaxyGroup.add(star);

        const orbitRing = new THREE.Group();
        galaxyGroup.add(orbitRing);

        const planets = [];
        for (let mi = 0; mi < models.length; mi++) {
            const mData = models[mi];
            const planet = await getModel(data.color, gi * 100 + mi + 1, mData.model);
            const angle = (mi / Math.max(1, models.length)) * Math.PI * 2;
            planet.position.set(
                Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius
            );
            planet.scale.setScalar(planetScale);
            planet.userData = {
                type: 'planet', galaxyIndex: gi, modelIndex: mi,
                url: mData.url, label: mData.label,
            };
            orbitRing.add(planet);
            planets.push(planet);
        }

        const label = createGalaxyLabel(data.name || `星系 ${gi + 1}`, data.color);
        const labelY = isLonely
            ? -(orbitRadius + 1.6) * 1.4
            : -(orbitRadius + 1.6);
        label.position.set(offsetX, labelY, 0);
        worldGroup.add(label);

        galaxyList.push({
            group: galaxyGroup, orbitRing, star, planets, data,
            baseX: offsetX, baseY: 0,
            targetTilt: initialTilt, spinVel: 0,
            label, labelEl: label.userData.labelEl,
            isLonely,
        });
    }

    console.log(`[embed] 星系构建完成，共 ${galaxyList.length} 个`);

    let state = 'overview';
    let activeGalaxyIndex = 0;

    /* ============================================================
       返回按钮
       ============================================================ */
    const backBtn = document.createElement('button');
    backBtn.className = 'galaxy-embed-back';
    backBtn.type = 'button';
    backBtn.innerHTML = '‹ 返回';
    container.appendChild(backBtn);
    backBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state === 'galaxy') revertOverview();
    });

    /* ============================================================
       移动端 ‹ › 切换星系
       ============================================================ */
    const navPrev = document.createElement('button');
    navPrev.className = 'galaxy-embed-nav galaxy-embed-nav-prev';
    navPrev.type = 'button';
    navPrev.innerHTML = '‹';
    navPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        switchMobileGalaxy(-1);
    });

    const navNext = document.createElement('button');
    navNext.className = 'galaxy-embed-nav galaxy-embed-nav-next';
    navNext.type = 'button';
    navNext.innerHTML = '›';
    navNext.addEventListener('click', (e) => {
        e.stopPropagation();
        switchMobileGalaxy(+1);
    });

    /* ============================================================
       恒星选择菜单
       ============================================================ */
    const starMenu = document.createElement('div');
    starMenu.className = 'galaxy-embed-star-menu';
    container.appendChild(starMenu);

    const starMenuBtn = document.createElement('button');
    starMenuBtn.className = 'galaxy-embed-star-btn';
    starMenuBtn.type = 'button';
    starMenuBtn.textContent = '选择恒星';
    container.appendChild(starMenuBtn);
    starMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        starMenu.classList.toggle('show');
    });

    function refreshStarMenu() {
        const galaxy = galaxyList[activeGalaxyIndex];
        if (!galaxy) return;

        starMenu.innerHTML = '';

        const currentStarItem = document.createElement('div');
        currentStarItem.className = 'galaxy-embed-star-item active';
        currentStarItem.textContent = galaxy.star.userData.label || '恒星';
        starMenu.appendChild(currentStarItem);

        galaxy.planets.forEach((planet) => {
            const item = document.createElement('div');
            item.className = 'galaxy-embed-star-item';
            item.textContent = planet.userData.label || ('行星 ' + (planet.userData.modelIndex + 1));
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                swapStarPlanet(galaxy, planet);
                starMenu.classList.remove('show');
                setTimeout(refreshStarMenu, swapDuration * 1000 + 100);
            });
            starMenu.appendChild(item);
        });
    }

    /* 初始化显示 */
    if (isMobile && total > 1) {
        container.appendChild(navPrev);
        container.appendChild(navNext);
        navPrev.classList.add('show');
        navNext.classList.add('show');

        requestAnimationFrame(() => {
            galaxyList.forEach((g, i) => {
                g.group.visible = (i === 0);
                if (g.labelEl) g.labelEl.style.opacity = (i === 0) ? '1' : '0';
            });
            gsap.set(worldGroup.position, { x: -galaxyList[0].baseX });
        });
    }

    function switchMobileGalaxy(dir) {
        if (state !== 'overview') return;
        if (total <= 1) return;

        const oldIdx = activeGalaxyIndex;
        const newIdx = (oldIdx + dir + total) % total;

        galaxyList[oldIdx].group.visible = false;
        if (galaxyList[oldIdx].labelEl) galaxyList[oldIdx].labelEl.style.opacity = '0';

        galaxyList[newIdx].group.visible = true;
        if (galaxyList[newIdx].labelEl) galaxyList[newIdx].labelEl.style.opacity = '1';

        activeGalaxyIndex = newIdx;

        starMenu.classList.remove('show');

        gsap.to(worldGroup.position, {
            x: -galaxyList[newIdx].baseX, y: 0, z: 0,
            duration: 0.8, ease: 'power3.inOut',
        });
    }

    function enterGalaxy(index) {
        state = 'galaxy';
        activeGalaxyIndex = index;
        backBtn.classList.add('show');

        if (isMobile && total > 1) {
            navPrev.classList.remove('show');
            navNext.classList.remove('show');
        }
        if (isMobile) {
            starMenuBtn.classList.add('show');
            refreshStarMenu();
        }

        const target = galaxyList[index];

        gsap.to(worldGroup.position, {
            x: -target.baseX, y: -target.baseY, z: 0,
            duration: 1.2, ease: 'power3.inOut',
        });
        gsap.to(target.group.scale, {
            x: zoomFactor, y: zoomFactor, z: zoomFactor,
            duration: 1.2, ease: 'power3.inOut',
        });
        fadeAll(target.group, 1, 0.5, gsap);
        gsap.to(target.labelEl.style, { opacity: 0, duration: 0.4 });

        galaxyList.forEach((g, i) => {
            if (i === index) return;
            if (isMobile && total > 1) return;

            fadeAll(g.group, 0, 0.9, gsap);
            gsap.to(g.group.scale, {
                x: 0.3, y: 0.3, z: 0.3,
                duration: 1.0, ease: 'power3.in',
            });
            const dir = Math.sign(g.baseX - target.baseX) || 1;
            gsap.to(g.group.position, {
                x: g.baseX + dir * 5, z: 5,
                duration: 1.0, ease: 'power3.in',
            });
            if (g.labelEl) gsap.to(g.labelEl.style, { opacity: 0, duration: 0.6 });
        });
    }

    function revertOverview() {
        state = 'overview';
        backBtn.classList.remove('show');

        if (isMobile && total > 1) {
            navPrev.classList.add('show');
            navNext.classList.add('show');
        }

        starMenuBtn.classList.remove('show');
        starMenu.classList.remove('show');

        gsap.to(worldGroup.position, {
            x: (isMobile && total > 1) ? -galaxyList[activeGalaxyIndex].baseX : 0,
            y: 0, z: 0,
            duration: 1.0, ease: 'power3.inOut',
        });

        galaxyList.forEach((g, i) => {
            gsap.to(g.group.scale, { x: 1, y: 1, z: 1, duration: 1.0, ease: 'power3.inOut' });
            gsap.to(g.group.position, {
                x: g.baseX, y: g.baseY, z: 0,
                duration: 1.0, ease: 'power3.inOut',
            });
            fadeAll(g.group, 1, 0.8, gsap);

            if (isMobile && total > 1) {
                const show = (i === activeGalaxyIndex);
                g.group.visible = show;
                if (g.labelEl) gsap.to(g.labelEl.style, { opacity: show ? 1 : 0, duration: 0.6 });
            } else {
                if (g.labelEl) gsap.to(g.labelEl.style, { opacity: 1, duration: 0.6, delay: 0.2 });
            }
        });
    }

    function swapStarPlanet(galaxy, planet) {
        const oldStar = galaxy.star;
        const planetSlot = planet.position.clone();

        galaxy.group.attach(planet);
        galaxy.orbitRing.attach(oldStar);

        const D = swapDuration, E = swapEase;

        const willBeLonely = galaxy.planets.length === 0;
        const targetStarScale = willBeLonely
            ? starScale * lonelyStarMul
            : starScale;

        gsap.to(planet.position, { x: 0, y: 0, z: 0, duration: D, ease: E });
        gsap.to(planet.scale, {
            x: targetStarScale, y: targetStarScale, z: targetStarScale,
            duration: D, ease: E,
        });
        gsap.to(planet.rotation, { x: 0, z: 0, duration: D, ease: E });

        gsap.to(oldStar.position, {
            x: planetSlot.x, y: planetSlot.y, z: planetSlot.z,
            duration: D, ease: E,
        });
        gsap.to(oldStar.scale, {
            x: planetScale, y: planetScale, z: planetScale,
            duration: D, ease: E,
        });
        gsap.to(oldStar.rotation, { x: 0, z: 0, duration: D, ease: E });

        planet.userData.type = 'star';
        planet.userData.isLonely = willBeLonely;
        oldStar.userData.type = 'planet';
        oldStar.userData.isLonely = false;

        galaxy.star = planet;
        galaxy.planets = galaxy.planets.filter((p) => p !== planet);
        galaxy.planets.push(oldStar);
        galaxy.isLonely = willBeLonely;
    }

    /* ============================================================
       输入：单指拖动 + 双指缩放/平移
       ============================================================ */
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const mouseNDC = new THREE.Vector2(0, 0);
    let mouseActive = false;
    let isDragging = false;
    let dragMoved = false;
    let lastX = 0, lastY = 0;

    /* ★ 双指手势状态 */
    const pinchState = {
        active: false,
        startDist: 0,
        startMidX: 0,
        startMidY: 0,
        startCamTarget: new THREE.Vector3(),
        startCamDist: 0,
        focalPoint: new THREE.Vector3(),   /* 手指中点对应的世界空间焦点 */
    };

    const onPointerDown = (e) => {
        if (pinchState.active) return;
        isDragging = true;
        dragMoved = false;
        lastX = e.clientX;
        lastY = e.clientY;
        try { container.setPointerCapture(e.pointerId); } catch (_) {}
    };

    const onPointerMove = (e) => {
        if (pinchState.active) return;

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

        const affected = state === 'overview'
            ? galaxyList
            : (activeGalaxyIndex >= 0 ? [galaxyList[activeGalaxyIndex]] : []);

        affected.forEach((g) => {
            g.group.rotation.y += dx * dragSpeedX;
            g.targetTilt += dy * tiltSpeedY;
            g.targetTilt = Math.max(
                initialTilt - maxTilt,
                Math.min(initialTilt + maxTilt, g.targetTilt)
            );
        });
    };

    const onPointerUp = (e) => {
        isDragging = false;
        try { container.releasePointerCapture(e.pointerId); } catch (_) {}
    };

    const onPointerLeave = () => {
        mouseActive = false;
        mouseNDC.set(0, 0);
    };

    const onClick = (e) => {
        if (state === 'jumping') return;
        if (dragMoved) return;
        if (pinchState.active) return;

        if (!starMenu.contains(e.target) && e.target !== starMenuBtn) {
            starMenu.classList.remove('show');
        }

        const rect = container.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);

        const hits = raycaster.intersectObjects(worldGroup.children, true);

        if (state === 'overview') {
            if (!hits.length) return;
            const g = findAncestor(hits[0].object, 'galaxy');
            if (g) enterGalaxy(g.userData.index);
            return;
        }

        if (state === 'galaxy') {
            const galaxy = galaxyList[activeGalaxyIndex];
            if (!galaxy) return;

            if (!hits.length) return;
            const hit = hits[0].object;

            if (isDescendant(hit, galaxy.star)) {
                const url = galaxy.star.userData.url;
                if (url) {
                    state = 'jumping';
                    window.location.href = url;
                }
                return;
            }

            const planet = galaxy.planets.find((p) => isDescendant(hit, p));
            if (planet) {
                swapStarPlanet(galaxy, planet);
                if (isMobile) setTimeout(refreshStarMenu, swapDuration * 1000 + 100);
                return;
            }
        }
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointerleave', onPointerLeave);
    container.addEventListener('click', onClick);

    /* ============================================================
       ★ 双指缩放 + 平移
       ============================================================ */

    /**
     * 计算 NDC 坐标对应的世界空间焦点
     * 焦点位于「过 camTarget 且垂直于相机视线」的平面上
     */
    function computeFocalPoint(ndcX, ndcY) {
        const r = new THREE.Raycaster();
        r.setFromCamera({ x: ndcX, y: ndcY }, camera);

        /* 相机视线方向 */
        const viewDir = new THREE.Vector3()
            .subVectors(camState.target, camera.position)
            .normalize();

        /* 过 camTarget 的平面 */
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
            viewDir, camState.target
        );

        const out = new THREE.Vector3();
        r.ray.intersectPlane(plane, out);

        /* 如果射线与平面平行（极少见），退化到 camTarget */
        if (!out) return camState.target.clone();
        return out;
    }

    const onTouchStart = (e) => {
        if (e.touches.length === 2) {
            isPinching = true;      /* 用于兼容旧代码，实际状态用 pinchState */
            isDragging = false;
            dragMoved = true;

            const t0 = e.touches[0];
            const t1 = e.touches[1];

            const midX = (t0.clientX + t1.clientX) / 2;
            const midY = (t0.clientY + t1.clientY) / 2;
            const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);

            const rect = container.getBoundingClientRect();
            const ndcX = ((midX - rect.left) / rect.width) * 2 - 1;
            const ndcY = -((midY - rect.top) / rect.height) * 2 + 1;

            pinchState.active = true;
            pinchState.startDist = dist;
            pinchState.startMidX = midX;
            pinchState.startMidY = midY;
            pinchState.startCamTarget.copy(camState.target);
            pinchState.startCamDist = camState.dist;
            /* 起始状态计算焦点（此时相机还没变） */
            pinchState.focalPoint.copy(computeFocalPoint(ndcX, ndcY));
        }
    };

    /* 兼容变量（沿用旧名字） */
    let isPinching = false;

    const onTouchMove = (e) => {
        if (!pinchState.active || e.touches.length !== 2) return;

        e.preventDefault();

        const t0 = e.touches[0];
        const t1 = e.touches[1];

        const midX = (t0.clientX + t1.clientX) / 2;
        const midY = (t0.clientY + t1.clientY) / 2;
        const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);

        /* ---------- 1. 计算缩放比例 ---------- */
        const ratio = dist / pinchState.startDist;
        /* 手指张开（ratio > 1）→ 相机靠近 → 视觉放大 */
        let newDist = pinchState.startCamDist / ratio;
        newDist = Math.max(camState.minDist, Math.min(camState.maxDist, newDist));

        /* ---------- 2. 以手指中点为焦点的缩放 ---------- */
        /* t = 0 时 target 不变；t → 1 时 target 移向焦点 */
        const t = newDist / pinchState.startCamDist;
        const fp = pinchState.focalPoint;

        const baseX = fp.x + (pinchState.startCamTarget.x - fp.x) * t;
        const baseY = fp.y + (pinchState.startCamTarget.y - fp.y) * t;
        const baseZ = fp.z + (pinchState.startCamTarget.z - fp.z) * t;

        /* ---------- 3. 双指平移 ---------- */
        const dpx = midX - pinchState.startMidX;
        const dpy = midY - pinchState.startMidY;

        /* 屏幕像素 → 世界距离 */
        const fovRad = camera.fov * Math.PI / 180;
        const screenH = Math.max(1, container.clientHeight);
        const worldPerPixel = 2 * Math.tan(fovRad / 2) * newDist / screenH;

        /* 手指右移 → 内容右移 → 相机左移 → target.x 减小
           手指下移 → 内容下移 → 相机上移 → target.y 增大 */
        const offsetX = -dpx * worldPerPixel;
        const offsetY =  dpy * worldPerPixel;

        camState.target.set(
            baseX + offsetX,
            baseY + offsetY,
            baseZ
        );
        camState.dist = newDist;

        updateCamera();
    };

    const onTouchEnd = (e) => {
        if (e.touches.length < 2) {
            pinchState.active = false;
            isPinching = false;
            /* 抬起后短时间不响应 click */
            setTimeout(() => { dragMoved = false; }, 50);
        }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    container.addEventListener('touchcancel', onTouchEnd, { passive: true });

    /* ============================================================
       渲染循环
       ============================================================ */
    const clock = new THREE.Clock();
    const _starWorld = new THREE.Vector3();
    const _starNDC = new THREE.Vector3();
    let rafId = null;
    let visible = true;
    let lastW = 0, lastH = 0;
    let frameCount = 0;

    function syncSize() {
        const w = getW();
        const h = getH();
        if (w > 0 && h > 0 && (w !== lastW || h !== lastH)) {
            lastW = w;
            lastH = h;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
            labelRenderer.setSize(w, h);
        }
    }

    function animate() {
        if (!visible) { rafId = null; return; }
        if (contextLost) { rafId = requestAnimationFrame(animate); return; }

        const dt = Math.min(clock.getDelta(), 0.05);
        syncSize();

        const activeList = state === 'overview'
            ? (isMobile && total > 1 ? [galaxyList[activeGalaxyIndex]] : galaxyList)
            : (activeGalaxyIndex >= 0 ? [galaxyList[activeGalaxyIndex]] : []);

        activeList.forEach((g) => {
            if (!g.group.visible) return;

            if (isMobile) {
                g.orbitRing.rotation.y += 0.4 * dt;

                if (!isDragging && !pinchState.active) {
                    g.star.rotation.y += (0 - g.star.rotation.y) * 0.03;
                    g.star.rotation.x += (0 - g.star.rotation.x) * 0.03;
                }
                g.group.rotation.x += (g.targetTilt - g.group.rotation.x) * 0.1;
                return;
            }

            if (isDragging) {
                g.spinVel *= 0.75;
            } else if (mouseActive) {
                const targetVel = mouseNDC.x * hoverSpeed;
                g.spinVel += (targetVel - g.spinVel) * hoverEase;
                g.group.rotation.y += g.spinVel * dt;
            } else {
                g.spinVel *= 0.92;
                g.group.rotation.y += g.spinVel * dt;
            }

            g.group.rotation.x += (g.targetTilt - g.group.rotation.x) * 0.1;

            if (mouseActive) {
                g.star.getWorldPosition(_starWorld);
                _starNDC.copy(_starWorld).project(camera);

                const dx = mouseNDC.x - _starNDC.x;
                const dy = mouseNDC.y - _starNDC.y;

                const desiredYaw = THREE.MathUtils.clamp(dx * starYawGain, -starYawMax, starYawMax);
                const curYaw = g.group.rotation.y + g.star.rotation.y;
                g.star.rotation.y += (desiredYaw - curYaw) * starTurnEase;

                const desiredPitch = THREE.MathUtils.clamp(
                    -dy * starPitchGain + g.group.rotation.x * starFollow,
                    -starPitchMax * 2, starPitchMax * 2
                );
                const curPitch = g.group.rotation.x + g.star.rotation.x;
                g.star.rotation.x += (desiredPitch - curPitch) * starTurnEase;
            } else {
                const tY = 0, cY = g.group.rotation.y + g.star.rotation.y;
                g.star.rotation.y += (tY - cY) * 0.05;
                g.star.rotation.x += (0 - g.star.rotation.x) * 0.05;
            }
        });

        try {
            renderer.render(scene, camera);
            labelRenderer.render(scene, camera);
        } catch (err) {
            console.error('[embed] 渲染错误：', err);
        }

        frameCount++;
        if (frameCount === 1 || frameCount === 60) {
            console.log(`[embed] 第 ${frameCount} 帧 | camDist=${camState.dist.toFixed(2)} target=(${camState.target.x.toFixed(2)},${camState.target.y.toFixed(2)},${camState.target.z.toFixed(2)})`);
        }

        rafId = requestAnimationFrame(animate);
    }

    syncSize();
    try {
        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);
        console.log('[embed] ✓ 首帧渲染完成');
    } catch (err) {
        console.error('[embed] ✗ 首帧渲染失败：', err);
    }

    visible = true;
    clock.getDelta();
    rafId = requestAnimationFrame(animate);

    let io = null;
    if (typeof IntersectionObserver !== 'undefined') {
        io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                visible = entry.isIntersecting;
                if (visible && !rafId) {
                    clock.getDelta();
                    rafId = requestAnimationFrame(animate);
                }
            });
        }, { rootMargin: '200px 0px' });
        io.observe(container);
    }

    const onVisibilityChange = () => {
        if (!document.hidden && visible && !rafId) {
            clock.getDelta();
            rafId = requestAnimationFrame(animate);
        }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const onResize = () => syncSize();
    window.addEventListener('resize', onResize);

    /* ============================================================
       对外接口
       ============================================================ */
    return {
        destroy() {
            if (rafId) cancelAnimationFrame(rafId);
            if (io) io.disconnect();
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('resize', onResize);
            container.removeEventListener('pointerdown', onPointerDown);
            container.removeEventListener('pointermove', onPointerMove);
            container.removeEventListener('pointerup', onPointerUp);
            container.removeEventListener('pointerleave', onPointerLeave);
            container.removeEventListener('click', onClick);
            container.removeEventListener('touchstart', onTouchStart);
            container.removeEventListener('touchmove', onTouchMove);
            container.removeEventListener('touchend', onTouchEnd);
            container.removeEventListener('touchcancel', onTouchEnd);
            renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
            renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
            backBtn.remove();
            navPrev.remove();
            navNext.remove();
            starMenuBtn.remove();
            starMenu.remove();
            try {
                renderer.dispose();
                renderer.forceContextLoss();
            } catch (e) {}
            if (renderer.domElement.parentNode) {
                renderer.domElement.parentNode.removeChild(renderer.domElement);
            }
            if (labelRenderer.domElement.parentNode) {
                labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
            }
            globalContextCount = Math.max(0, globalContextCount - 1);
        },
    };
}