// /galaxy-gallery/mcmeta.js
// 起床战争 3D 画廊 — 主逻辑 + Minecraft 动态纹理（外部加载版）

import { createEmbedGallery } from '/galaxy-gallery/embed-gallery.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as THREE from 'three';


/* ============================================================
   ①  动态纹理系统
   ============================================================ */

const animatedTextures = [];
const animatedTextureIds = new Set();

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

/**
 * 从名字里提取资源名
 * 例："minecraft_block_fire_0_animated_000" → "fire_0"
 */
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
   ★ 动态纹理播放器
   flipY = false 时，UV 的 y 方向是从下往上，offset 从 0 递增
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
   ★ 加载外部多帧贴图
   flipY = false 是关键 —— 和 GLB 内部贴图保持一致，防止上下颠倒
   ============================================================ */
async function loadAnimatedTexture(resourceName) {
    const url = ANIMATED_TEXTURE_DIR + resourceName + '.png';
    const loader = new THREE.TextureLoader();

    try {
        const texture = await loader.loadAsync(url);

        /* ★ 和 GLB 内部贴图一致，防止上下颠倒 */
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
   ②  GLB 加载
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

                        /* 替换贴图 */
                        child.material.map = newMap;
                        if (child.material.emissiveMap === originalMap) {
                            child.material.emissiveMap = newMap;
                        }

                        /* 动态纹理材质设置 */
                        child.material.side = THREE.DoubleSide;
                        child.material.alphaTest = 0.5;
                        child.material.depthWrite = false;
                        child.material.emissive = new THREE.Color(0xffffff);
                        child.material.emissiveIntensity = 1.0;
                        child.material.emissiveMap = newMap;
                        child.material.needsUpdate = true;

                        /* 注册动画 */
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
                    /* 非动态纹理：像素化 */
                    try {
                        originalMap.magFilter = THREE.NearestFilter;
                        originalMap.minFilter = THREE.NearestFilter;
                        originalMap.generateMipmaps = false;
                        originalMap.colorSpace = THREE.SRGBColorSpace;
                        originalMap.needsUpdate = true;
                    } catch (e) {}
                }
            }

            /* Z-fighting 处理 */
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
        console.log(`[mcmeta] 等待 ${asyncTasks.length} 张多帧贴图加载…`);
        await Promise.all(asyncTasks);
    }

    console.log(
        `[mcmeta] 模型 ${url.split('/').pop()} 处理完成：${processedCount}/${meshCount} mesh`
    );

    /* 归一化 */
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
   ③  尺寸参数
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
   ④  星系数据
   ============================================================ */
const EMBED_DATA = {

    'solo-小型地图': [
        {
            name: 'solo',
            color: 0x59c39a,
            starUrl: '/lloyd_specIalIzed_community/work/minecraft_build/4v4v4v4/bw_4v4v4v4_basement',
            starModel: '/modle/build/bedwars/4v4v4v4/bw_4v4v4v4_basement/base.glb',
            models: [
                {
                    label: 'solo',
                    url: '/lloyd_specIalIzed_community/work/minecraft_build/solo/bw_solo_snow_field',
                    model: '/modle/build/bedwars/solo/bw_solo_snow_field/base.glb',
                },
                {
                    label: 'bw_solo_machine_chinampa',
                    url: '/lloyd_specIalIzed_community/work/minecraft_build/solo/bw_solo_machine_chinampa',
                    model: '/modle/build/bedwars/solo/bw_solo_machine_chinampa/base.glb',
                },
                {
                    label: 'bw_solo_flesh_reforged',
                    url: '/lloyd_specIalIzed_community/work/minecraft_build/solo/bw_solo_flesh_reforged',
                    model: '/modle/build/bedwars/solo/bw_solo_flesh_reforged/base.glb',
                },
            ],
        },
    ],

    '4v4v4v4': [
        {
            name: '4v4v4v4',
            color: 0x59c39a,
            starUrl: '/lloyd_specIalIzed_community/work/minecraft_build/4v4v4v4/bw_4v4v4v4_speedrun',
            starModel: '/modle/build/bedwars/4v4v4v4/bw_4v4v4v4_speedrun/base.glb',
            models: [
                {
                    label: 'bw_4v4v4v4_pale_dwelling',
                    url: '/lloyd_specIalIzed_community/work/minecraft_build/4v4v4v4/bw_4v4v4v4_pale_dwelling',
                    model: '/modle/build/bedwars/4v4v4v4/bw_4v4v4v4_pale_dwelling/base.glb',
                },
                {
                    label: 'bw_4v4v4v4_basement',
                    url: '/lloyd_specIalIzed_community/work/minecraft_build/4v4v4v4/bw_4v4v4v4_basement',
                    model: '/modle/build/bedwars/4v4v4v4/bw_4v4v4v4_basement/base.glb',
                },
                {
                    label: 'bw_4v4v4v4_desert_castle',
                    url: '/lloyd_specIalIzed_community/work/minecraft_build/4v4v4v4/bw_4v4v4v4_desert_castle',
                    model: '/modle/build/bedwars/4v4v4v4/bw_4v4v4v4_desert_castle/base.glb',
                },
            ],
        },
    ],

    'diamond-ring-4': [
        {
            name: '钻石环岛 4 队',
            color: 0x9b6bd1,
            starUrl: '/lloyd_specIalIzed_community/work/minecraft_build/4v4v4v4/bw_4v4v4v4_desert_castle',
            starModel: '/modle/build/bedwars/4v4v4v4/bw_4v4v4v4_desert_castle/base.glb',
            models: [
                {
                    label: 'bw_4v4v4v4_desert_castle',
                    url: '/lloyd_specIalIzed_community/work/minecraft_build/4v4v4v4/bw_4v4v4v4_desert_castle',
                    model: '/modle/build/bedwars/4v4v4v4/bw_4v4v4v4_desert_castle/all.glb',
                },
            ],
        },
    ],

};


/* ============================================================
   ⑤  初始化所有容器
   ============================================================ */
async function initAllGalleries() {
    const embeds = document.querySelectorAll('.galaxy-embed');
    const instances = [];

    for (const el of embeds) {
        const key = el.dataset.galaxySet;
        const data = EMBED_DATA[key];

        if (!data) {
            console.warn(`[mcmeta] 未找到 data-galaxy-set="${key}" 的数据`);
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
            instances.push(inst);
        } catch (err) {
            console.error(`[mcmeta] ✗ 初始化 "${key}" 失败：`, err);
        }
    }

    window.addEventListener('beforeunload', () => {
        instances.forEach((i) => {
            try { i.destroy(); } catch (e) {}
        });
    });
}


/* ============================================================
   ⑥  动态纹理主循环
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
   ⑦  启动
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

    console.log('[mcmeta] ★ 初始化完成，动态纹理数量:', animatedTextures.length);
})();