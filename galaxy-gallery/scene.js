// scene.js
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

export function createScene(container, backgroundColor = '#f7f9fc') {
  /* ---------- WebGL 渲染器 ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.cursor = 'grab';
  container.appendChild(renderer.domElement);

  /* ---------- CSS2D 渲染器（用于文字标签） ---------- */
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.width = '100%';
  labelRenderer.domElement.style.height = '100%';
  labelRenderer.domElement.style.pointerEvents = 'none';
  labelRenderer.domElement.style.zIndex = '5';
  container.appendChild(labelRenderer.domElement);

  /* ---------- 场景 ---------- */
  const scene = new THREE.Scene();

  const bgColor = new THREE.Color(backgroundColor);
  scene.background = bgColor;
  scene.fog = new THREE.Fog(bgColor, 40, 90);

  /* ---------- 相机 ---------- */
  const camera = new THREE.PerspectiveCamera(
    45, container.clientWidth / container.clientHeight, 0.1, 200
  );
  camera.position.set(0, 5.5, 22);
  camera.lookAt(0, 0, 0);

  /* ---------- 灯光 ---------- */
  scene.add(new THREE.AmbientLight(0xffffff, 1.8));

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(6, 12, 8);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x6688ff, 1.2);
  rimLight.position.set(-8, 4, -6);
  scene.add(rimLight);

  /* ---------- 分组：rootOffset 用来整体下移，worldGroup 由状态机平移 ---------- */
  const rootOffset = new THREE.Group();
  scene.add(rootOffset);

  const worldGroup = new THREE.Group();
  rootOffset.add(worldGroup);

  return { renderer, labelRenderer, scene, camera, worldGroup, rootOffset };
}