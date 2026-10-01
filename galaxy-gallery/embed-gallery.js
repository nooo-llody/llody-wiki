// /galaxy-gallery/embed-gallery.js
// 嵌入式 3D 画廊 — iPhone 真机专版修复

import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { makeBuilding, fadeAll, findAncestor, isDescendant } from './utils.js';
import { createGalaxyLabel } from './labels.js';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

/* 全局 WebGL 上下文计数（Safari 有硬上限） */
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

    console.log(`[embed] 初始化 | iOS=${isIOS} Safari=${isSafari} 移动端=${isMobile} 星系数=${total}`);
    console.log(`[embed] 当前 WebGL 上下文数：${globalContextCount}/${MAX_CONTEXTS}`);

    /* ============================================================
       ①  参数
       ============================================================ */
    const orbitRadius    = userOptions.orbitRadius    ?? (isMobile ? 1.5 : 2.2);
    const starScale      = userOptions.starScale      ?? (isMobile ? 1.1 : 1.6);
    const planetScale    = userOptions.planetScale    ?? (isMobile ? 0.42 : 0.6);
    const spacing        = userOptions.spacing        ?? (isMobile ? 5.6 : 8);
    const zoomFactor     = userOptions.zoomFactor     ?? 1.8;
    const blockHeightMul = userOptions.blockHeightMul ?? 1;

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

    /* ============================================================
       ②  背景色 & 场景
       ============================================================ */
    const backgroundColor =
        userOptions.backgroundColor ||
        getComputedStyle(document.documentElement)
            .getPropertyValue('--bg').trim() || '#f7f9fc';

    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(backgroundColor);
    scene.background = bgColor;
    scene.fog = new THREE.Fog(bgColor, 24, 55);

    const getW = () => Math.max(1, container.clientWidth  || window.innerWidth  || 375);
    const getH = () => Math.max(1, container.clientHeight || 450);

    const camera = new THREE.PerspectiveCamera(50, getW() / getH(), 0.1, 100);
    camera.position.set(0, 2.2, isMobile ? 10 : 11);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(6, 12, 8);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x6688ff, 1.2);
    rimLight.position.set(-8, 4, -6);
    scene.add(rimLight);

    /* ============================================================
       ③  ★ 渲染器（iOS 关键修复）
       ============================================================ */
    if (globalContextCount >= MAX_CONTEXTS) {
        console.error(`[embed] ✗ WebGL 上下文数达到上限 ${MAX_CONTEXTS}，跳过创建`);
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;opacity:0.5;font-size:0.9rem;">3D 视图数量已达上限</div>';
        return { destroy() {} };
    }

    let renderer;
    try {
        /* ★ iOS 上降低 DPR、关闭部分特性，减小显存占用 */
        const dprCap = isIOS ? 1.25 : (isMobile ? 1.5 : 2);

        renderer = new THREE.WebGLRenderer({
            antialias: !isIOS,                     // iOS 关抗锯齿，用 DPR 弥补
            alpha: false,
            powerPreference: 'default',
            failIfMajorPerformanceCaveat: false,
            preserveDrawingBuffer: false,          // 关，省内存
            stencil: false,                        // 关，省内存
            depth: true,
        });

        renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
        renderer.setSize(getW(), getH());
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;

        /* ★ 清除色 = 背景色，避免黑屏 */
        renderer.setClearColor(bgColor, 1);

    } catch (err) {
        console.error('[embed] ✗ WebGL 创建失败：', err);
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;opacity:0.6;">此设备不支持 3D 视图</div>';
        return { destroy() {} };
    }

    globalContextCount++;

    renderer.domElement.style.display = 'block';
    renderer.domElement.style.cursor = 'grab';
    container.appendChild(renderer.domElement);

    console.log(`[embed] ✓ WebGL 已创建 | canvas 属性尺寸=${renderer.domElement.width}×${renderer.domElement.height} | CSS 尺寸=${getW()}×${getH()} | DPR=${renderer.getPixelRatio()}`);

    /* ★ WebGL 上下文丢失处理 —— iPhone 的核心问题 */
    let contextLost = false;
    const onContextLost = (e) => {
        e.preventDefault();
        contextLost = true;
        console.warn('[embed] ⚠ WebGL 上下文丢失');
    };
    const onContextRestored = () => {
        contextLost = false;
        console.log('[embed] ✓ WebGL 上下文已恢复');
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored, false);

    /* ============================================================
       ④  CSS2D 渲染器
       ============================================================ */
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(getW(), getH());
    Object.assign(labelRenderer.domElement.style, {
        position: 'absolute', top: '0', left: '0',
        width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: '5',
    });
    container.appendChild(labelRenderer.domElement);

    /* ============================================================
       ⑤  世界 & 模型工厂
       ============================================================ */
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
            try {
                return await loadModel(url);
            } catch (err) {
                console.warn(`[embed] GLB 加载失败，回退到方块: ${url}`, err);
            }
        }
        return makeTallBuilding(color, seed);
    }

    /* ============================================================
       ⑥  构建星系
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

        const star = await getModel(data.color, gi * 100 + 7, data.starModel);
        star.scale.setScalar(starScale);
        star.userData = { type: 'star', galaxyIndex: gi, url: data.starUrl };
        galaxyGroup.add(star);

        const orbitRing = new THREE.Group();
        galaxyGroup.add(orbitRing);

        const planets = [];
        const models = data.models || [];
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
        label.position.set(offsetX, -orbitRadius - 1.6, 0);
        worldGroup.add(label);

        galaxyList.push({
            group: galaxyGroup, orbitRing, star, planets, data,
            baseX: offsetX, baseY: 0,
            targetTilt: initialTilt, spinVel: 0,
            label, labelEl: label.userData.labelEl,
        });
    }

    console.log(`[embed] 星系构建完成，共 ${galaxyList.length} 个`);

    /* ============================================================
       ⑦  状态
       ============================================================ */
    let state = 'overview';
    let activeGalaxyIndex = 0;

    /* ============================================================
       ⑧  返回按钮
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
       ⑨  移动端 ‹ › 按钮
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

        gsap.to(worldGroup.position, {
            x: -galaxyList[newIdx].baseX, y: 0, z: 0,
            duration: 0.8, ease: 'power3.inOut',
        });
    }

    /* ============================================================
       ⑩  进入 / 返回星系
       ============================================================ */
    function enterGalaxy(index) {
        state = 'galaxy';
        activeGalaxyIndex = index;
        backBtn.classList.add('show');

        if (isMobile && total > 1) {
            navPrev.classList.remove('show');
            navNext.classList.remove('show');
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

    /* ============================================================
       ⑪  行星 ⇄ 恒星 交换
       ============================================================ */
    function swapStarPlanet(galaxy, planet) {
        const oldStar = galaxy.star;
        const planetSlot = planet.position.clone();

        galaxy.group.attach(planet);
        galaxy.orbitRing.attach(oldStar);

        const D = swapDuration, E = swapEase;

        gsap.to(planet.position, { x: 0, y: 0, z: 0, duration: D, ease: E });
        gsap.to(planet.scale, { x: starScale, y: starScale, z: starScale, duration: D, ease: E });
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
        oldStar.userData.type = 'planet';
        galaxy.star = planet;
        galaxy.planets = galaxy.planets.filter((p) => p !== planet);
        galaxy.planets.push(oldStar);
    }

    /* ============================================================
       ⑫  输入
       ============================================================ */
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const mouseNDC = new THREE.Vector2(0, 0);
    let mouseActive = false;
    let isDragging = false;
    let dragMoved = false;
    let lastX = 0, lastY = 0;

    const onPointerDown = (e) => {
        isDragging = true;
        dragMoved = false;
        lastX = e.clientX;
        lastY = e.clientY;
        try { container.setPointerCapture(e.pointerId); } catch (_) {}
    };

    const onPointerMove = (e) => {
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

        if (isMobile && total > 1) return;

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

            if (!hits.length) { revertOverview(); return; }
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
                return;
            }

            revertOverview();
        }
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointerleave', onPointerLeave);
    container.addEventListener('click', onClick);

    /* ============================================================
       ⑬  渲染循环
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

        /* ★ 上下文丢失时跳过渲染 */
        if (contextLost) {
            rafId = requestAnimationFrame(animate);
            return;
        }

        const dt = Math.min(clock.getDelta(), 0.05);
        syncSize();

        const activeList = state === 'overview'
            ? (isMobile && total > 1
                ? [galaxyList[activeGalaxyIndex]]
                : galaxyList)
            : (activeGalaxyIndex >= 0 ? [galaxyList[activeGalaxyIndex]] : []);

        activeList.forEach((g) => {
            if (!g.group.visible) return;

            if (isMobile) {
                g.orbitRing.rotation.y += 0.4 * dt;
                g.star.rotation.y += (0 - g.star.rotation.y) * 0.03;
                g.star.rotation.x += (0 - g.star.rotation.x) * 0.03;
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

                const desiredYaw = THREE.MathUtils.clamp(
                    dx * starYawGain, -starYawMax, starYawMax
                );
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
            console.log(`[embed] 第 ${frameCount} 帧 | canvas=${renderer.domElement.width}×${renderer.domElement.height} | 上下文丢失=${contextLost}`);
        }

        rafId = requestAnimationFrame(animate);
    }

    /* ★ 首帧直接渲染 */
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

    /* IO 只负责暂停/恢复 */
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

    /* 页面切回前台时恢复渲染 */
    const onVisibilityChange = () => {
        if (!document.hidden && visible && !rafId) {
            clock.getDelta();
            rafId = requestAnimationFrame(animate);
        }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    /* ============================================================
       ⑭  自适应
       ============================================================ */
    const onResize = () => syncSize();
    window.addEventListener('resize', onResize);

    /* ============================================================
       ⑮  对外接口
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
            renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
            renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
            backBtn.remove();
            navPrev.remove();
            navNext.remove();

            /* ★ 释放 WebGL 上下文（关键！否则 iPhone 会累积耗尽） */
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