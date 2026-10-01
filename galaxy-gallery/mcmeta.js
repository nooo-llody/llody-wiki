// /galaxy-gallery/mcmeta.js
// 起床战争 3D 画廊 — 主逻辑 + Minecraft 动态纹理 + 实时颜色更新

import { createEmbedGallery } from '/galaxy-gallery/embed-gallery.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as THREE from 'three';


/* ============================================================
   ①  全局状态
   ============================================================ */

const animatedTextures = [];
const animatedTextureIds = new Set();

/* ★ 所有画廊实例（用于主题变化时重建） */
let galleryInstances = [];

/* ★ 多帧贴图存放目录 */
const ANIMATED_TEXTURE_DIR = '/image/minecraft/mcmeta/';

/* ============================================================
   ★ fps 配置表
   ============================================================ */
const FPS_CONFIG = [
    { keys: ['soul_fire'],           fps: 20 },
    { keys: ['soul_campfire'],       fps: 20 },
    { keys: ['nether_portal'],       fps: 20 },
    { keys: ['command_block'],       fps: 10 },
    { keys: ['respawn_anchor'],      fps: 20 },
    { keys: ['jack_o_lantern'],      fps: 20 },
    { keys: ['blast_furnace'],       fps: 20 },
    { keys: ['slime_block'],         fps: 20 },
    { keys: ['sea_lantern'],         fps: 20 },
    { keys: ['cave_vines'],          fps: 20 },
    { keys: ['fire'],                fps: 20 },
    { keys: ['campfire'],            fps: 20 },
    { keys: ['water'],               fps: 10 },
    { keys: ['lava'],                fps: 10 },
    { keys: ['magma'],               fps: 20 },
    { keys: ['portal'],              fps: 20 },
    { keys: ['prismarine'],          fps: 20 },
    { keys: ['kelp'],                fps: 20 },
    { keys: ['seagrass'],            fps: 20 },
    { keys: ['smoker'],              fps: 20 },
    { keys: ['lantern'],             fps: 20 },
];

function extractAnimatedResourceName(textureName) {
    if (!textureName) return '';
    let name = textureName.toLowerCase();
    name = name.replace(/^minecraft_block_/, '');
    name = name.replace(/^minecraft_/, '');
    name = name.replace(/^block_/, '');
    name = name.replace(/_animated_\d+$/, '');
    return name;
}

function isAnimatedTextureName(textureName) {
    return /_animated_/.test((textureName || '').toLowerCase());
}

function matchFps(resourceName) {
    if (!resourceName) return 20;
    const lower = resourceName.toLowerCase();
    for (const cfg of FPS_CONFIG) {
        for (const key of cfg.keys) {
            if (lower.includes(key)) return cfg.fps;
        }
    }
    return 20;
}


/* ============================================================
   ②  动态纹理播放器
   ============================================================ */
function createAnimatedTexture(texture, frameCount, fps = 20) {
    let currentFrame = 0;
    let accumulator = 0;
    const frameDuration = 1 / fps;
    const frameHeight = 1 / frameCount;

    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.y = frameHeight;
    texture.offset.y = 0;
    texture.needsUpdate = true;

    return function tick(dt) {
        accumulator += dt;
        if (accumulator >= frameDuration) {
            while (accumulator >= frameDuration) {
                accumulator -= frameDuration;
                currentFrame = (currentFrame + 1) % frameCount;
            }
            texture.offset.y = currentFrame * frameHeight;
            texture.needsUpdate = true;
        }
    };
}


/* ============================================================
   ③  加载外部多帧贴图
   ============================================================ */
async function loadAnimatedTexture(resourceName) {
    const url = ANIMATED_TEXTURE_DIR + resourceName + '.png';
    const loader = new THREE.TextureLoader();

    try {
        const texture = await loader.loadAsync(url);

        texture.flipY = false;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;

        return texture;
    } catch (err) {
        console.warn(`[mcmeta] ✗ 多帧贴图加载失败：${url}`);
        return null;
    }
}


/* ============================================================
   ④  GLB 加载
   ============================================================ */

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(
    'https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/'
);
dracoLoader.preload();

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

async function loadGLB(url) {
    let gltf;
    try {
        gltf = await gltfLoader.loadAsync(url);
    } catch (err) {
        console.error(`[mcmeta] ✗ 模型加载失败：${url}`, err);
        return new THREE.Group();
    }

    const model = gltf.scene;
    if (!model) return new THREE.Group();

    const asyncTasks = [];
    let meshCount = 0;
    let processedCount = 0;

    model.traverse((child) => {
        if (!child.isMesh) return;
        meshCount++;

        try {
            if (!child.material) return;

            child.material = child.material.clone();
            child.material.transparent = true;

            if (child.material.map) {
                const originalMap = child.material.map;
                const texName = (originalMap.name || '').toLowerCase();

                if (isAnimatedTextureName(texName)) {
                    const resourceName = extractAnimatedResourceName(texName);
                    const fps = matchFps(resourceName);

                    console.log(
                        `[mcmeta] 检测到动态纹理: ${texName} → 资源名 "${resourceName}" @ ${fps}fps`
                    );

                    asyncTasks.push((async () => {
                        const newMap = await loadAnimatedTexture(resourceName);
                        if (!newMap) return;

                        child.material.map = newMap;
                        if (child.material.emissiveMap === originalMap) {
                            child.material.emissiveMap = newMap;
                        }

                        child.material.side = THREE.DoubleSide;
                        child.material.alphaTest = 0.5;
                        child.material.depthWrite = false;
                        child.material.emissive = new THREE.Color(0xffffff);
                        child.material.emissiveIntensity = 1.0;
                        child.material.emissiveMap = newMap;
                        child.material.needsUpdate = true;

                        const frames = Math.round(
                            newMap.image.height / newMap.image.width
                        );
                        if (frames > 1) {
                            console.log(
                                `[mcmeta] ★ 注册动画: ${resourceName} ${newMap.image.width}×${newMap.image.height} → ${frames} 帧 @ ${fps}fps`
                            );
                            animatedTextures.push(
                                createAnimatedTexture(newMap, frames, fps)
                            );
                        }
                    })());
                } else {
                    try {
                        originalMap.magFilter = THREE.NearestFilter;
                        originalMap.minFilter = THREE.NearestFilter;
                        originalMap.generateMipmaps = false;
                        originalMap.colorSpace = THREE.SRGBColorSpace;
                        originalMap.needsUpdate = true;
                    } catch (e) {}
                }
            }

            try {
                child.material.polygonOffset = true;
                child.material.polygonOffsetFactor = 1;
                child.material.polygonOffsetUnits = 1;
            } catch (e) {}

            processedCount++;
        } catch (err) {
            console.warn(`[mcmeta] 处理 mesh 出错（已跳过）:`, err);
        }
    });

    if (asyncTasks.length > 0) {
        await Promise.all(asyncTasks);
    }

    console.log(
        `[mcmeta] 模型 ${url.split('/').pop()} 处理完成：${processedCount}/${meshCount} mesh`
    );

    try {
        const box = new THREE.Box3().setFromObject(model);
        if (!box.isEmpty()) {
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
                const s = 1.6 / maxDim;
                model.scale.setScalar(s);

                const box2 = new THREE.Box3().setFromObject(model);
                const center = box2.getCenter(new THREE.Vector3());
                model.position.sub(center);
            }
        }
    } catch (err) {
        console.warn(`[mcmeta] 归一化失败（已跳过）:`, err);
    }

    const wrap = new THREE.Group();
    wrap.add(model);
    return wrap;
}


/* ============================================================
   ⑤  尺寸参数
   ============================================================ */
const isMobile = window.innerWidth < 768;
const MOBILE_SCALE = 0.7;

const sizeOpts = isMobile
    ? {
        starScale:   1.6 * MOBILE_SCALE,
        planetScale: 0.6 * MOBILE_SCALE,
        orbitRadius: 2.2 * MOBILE_SCALE,
        spacing:     8   * MOBILE_SCALE,
    }
    : {
        starScale:   1.6,
        planetScale: 0.6,
        orbitRadius: 2.2,
        spacing:     8,
    };


/* ============================================================
   ⑥  颜色解析（支持 CSS 变量）
   ============================================================ */
function parseColor(c, fallback = 0x5b8def) {
    if (typeof c === 'number') return c;

    if (typeof c === 'string') {
        const s = c.trim();

        /* ★ 支持 CSS 变量：var(--accent) / --accent / accent */
        let varName = '';
        if (s.startsWith('var(')) {
            varName = s.slice(4, -1).trim();
        } else if (s.startsWith('--')) {
            varName = s;
        }

        if (varName) {
            const cssValue = getComputedStyle(document.documentElement)
                .getPropertyValue(varName)
                .trim();

            if (cssValue) {
                return parseColor(cssValue, fallback);
            }
            console.warn(`[mcmeta] CSS 变量 ${varName} 未定义，使用默认色`);
            return fallback;
        }

        /* #xxxxxx 和 0xxxxx */
        if (s.startsWith('0x') || s.startsWith('0X')) return parseInt(s.slice(2), 16);
        if (s.startsWith('#')) return parseInt(s.slice(1), 16);

        /* rgb() / rgba() */
        if (s.startsWith('rgb')) {
            try {
                return new THREE.Color(s).getHex();
            } catch (e) {}
        }

        /* 尝试十六进制 */
        const n = parseInt(s, 16);
        if (!isNaN(n)) return n;
    }

    return fallback;
}


/* ============================================================
   ⑦  从 HTML 里的 JSON 读取星系数据
   ============================================================ */
function normalizeGalaxyData(data) {
    if (!Array.isArray(data)) return [];
    return data.map((g) => ({
        ...g,
        color: parseColor(g.color, 0x5b8def),
    }));
}

function readGalaxyDataFromContainer(el) {
    const scriptEl = el.querySelector('script[type="application/json"]');
    if (!scriptEl) {
        console.warn(`[mcmeta] 容器内找不到 <script type="application/json">`);
        return null;
    }

    const text = scriptEl.textContent.trim();
    if (!text) return null;

    try {
        const data = JSON.parse(text);
        return normalizeGalaxyData(data);
    } catch (err) {
        console.error(`[mcmeta] JSON 解析失败：`, err);
        return null;
    }
}


/* ============================================================
   ⑧  初始化所有容器
   ============================================================ */
async function initAllGalleries() {
    const embeds = document.querySelectorAll('.galaxy-embed');

    console.log(`[mcmeta] 找到 ${embeds.length} 个 .galaxy-embed 容器`);

    let index = 0;
    for (const el of embeds) {
        index++;
        const data = readGalaxyDataFromContainer(el);

        if (!data || data.length === 0) {
            console.warn(`[mcmeta] 第 ${index} 个容器数据无效，跳过`);
            continue;
        }

        try {
            const inst = await createEmbedGallery(el, {
                galaxies: data,
                loadModel: loadGLB,
                blockHeightMul: 1,
                starScale:   sizeOpts.starScale,
                planetScale: sizeOpts.planetScale,
                orbitRadius: sizeOpts.orbitRadius,
                spacing:     sizeOpts.spacing,
            });
            galleryInstances.push(inst);
        } catch (err) {
            console.error(`[mcmeta] ✗ 第 ${index} 个容器初始化失败：`, err);
        }
    }
}


/* ============================================================
   ⑨  ★ 主题变化 → 重建所有画廊
   ============================================================ */
async function rebuildAllGalleries() {
    console.log('[mcmeta] 主题变化，重建所有画廊…');

    /* 销毁旧的 */
    galleryInstances.forEach((inst) => {
        try { inst.destroy(); } catch (e) {}
    });
    galleryInstances = [];

    /* 清空动态纹理 */
    animatedTextures.length = 0;
    animatedTextureIds.clear();

    /* 重新初始化 */
    try {
        await initAllGalleries();
        console.log('[mcmeta] ✓ 主题更新完成，动态纹理数量:', animatedTextures.length);
    } catch (err) {
        console.error('[mcmeta] ✗ 主题更新失败：', err);
    }
}

/* 防抖计时器 */
let themeChangeTimer = null;

/* 监听 :root 上的 style 属性变化 */
const themeObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'style') {
            clearTimeout(themeChangeTimer);
            /* 350ms 防抖：如果用户拖动颜色选择器，不会每帧都重建 */
            themeChangeTimer = setTimeout(rebuildAllGalleries, 350);
            return;
        }
    }
});

/* 开始监听 */
themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style'],
});


/* ============================================================
   ⑩  动态纹理主循环
   ============================================================ */
function startAnimatedTextureLoop() {
    const clock = new THREE.Clock();

    function tick() {
        requestAnimationFrame(tick);
        const dt = Math.min(clock.getDelta(), 0.05);

        if (dt > 0) {
            for (let i = 0; i < animatedTextures.length; i++) {
                try {
                    animatedTextures[i](dt);
                } catch (e) {
                    console.warn(`[mcmeta] 动态纹理 tick 失败:`, e);
                }
            }
        }
    }
    tick();
}


/* ============================================================
   ⑪  启动
   ============================================================ */
(async function main() {
    console.log('[mcmeta] ★ 模块已加载');

    try {
        await initAllGalleries();
    } catch (err) {
        console.error('[mcmeta] 初始化出错：', err);
    }

    try {
        startAnimatedTextureLoop();
    } catch (err) {
        console.error('[mcmeta] 动态纹理循环启动失败：', err);
    }

    window.addEventListener('beforeunload', () => {
        galleryInstances.forEach((i) => {
            try { i.destroy(); } catch (e) {}
        });
    });

    console.log('[mcmeta] ★ 初始化完成，动态纹理数量:', animatedTextures.length);
})();