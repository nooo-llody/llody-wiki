// /galaxy-gallery/utils.js
// ★ 使用 esm.sh 完整 URL

import * as THREE from 'https://esm.sh/three@0.160.0';

export function collectMaterials(root) {
    const out = [];
    root.traverse((o) => {
        if (o.isMesh) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            out.push(...mats);
        }
    });
    return out;
}

export function fadeAll(root, target, duration, gsap) {
    if (target > 0) root.visible = true;
    collectMaterials(root).forEach((m) => {
        m.transparent = true;
        gsap.killTweensOf(m, 'opacity');
        gsap.to(m, { opacity: target, duration, ease: 'power2.out' });
    });
}

export function isDescendant(obj, ancestor) {
    while (obj) { if (obj === ancestor) return true; obj = obj.parent; }
    return false;
}

export function findAncestor(obj, type) {
    while (obj) {
        if (obj.userData && obj.userData.type === type) return obj;
        obj = obj.parent;
    }
    return null;
}

export function makeBuilding(color, seed) {
    let s = seed * 9301 + 49297;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };

    const group = new THREE.Group();
    const towerCount = 2 + Math.floor(rnd() * 2);

    for (let i = 0; i < towerCount; i++) {
        const w = 0.45 + rnd() * 0.35;
        const d = 0.45 + rnd() * 0.35;
        const h = 1.0 + rnd() * 2.2;

        const mat = new THREE.MeshStandardMaterial({
            color, metalness: 0.32, roughness: 0.48,
            emissive: new THREE.Color(color).multiplyScalar(0.1),
            transparent: true, opacity: 1,
        });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set((rnd() - 0.5) * 0.8, h / 2, (rnd() - 0.5) * 0.8);
        group.add(mesh);
    }

    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    group.children.forEach((c) => { c.position.sub(center); });

    return group;
}