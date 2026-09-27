// config.js
import * as THREE from 'three';

export const DEFAULTS = {
  categories: [],
  galaxies: [],

  /* 环形布局 */
  orbitRadius: 2.0,
  starScale:   1.4,
  planetScale: 0.5,
  galaxyZoom:  2.4,

  /* 网格列数 */
  gridColsDesktop: 4,
  gridColsTablet:  2,
  gridColsMobile:  1,

  /* 固定间距 */
  spacingX: 9.5,
  spacingY: 9.5,
  edgeMargin: 2,

  /* ★ 自由排版 */
  freeLayout: true,        // 开启后星系有错落偏移，像图片一样自由摆放
  freeJitterX: 3,          // 水平最大偏移 ±3
  freeJitterY: 3,          // 垂直最大偏移 ±3
  /* 如果某个星系想手动定位，在 galaxies[i] 里写：
     position: { x: -8, y: 3 }   —— 直接用它作为世界坐标 */

  /* 文字 */
  labelOffsetY: 4.5,
  hideLabelsOnMobile: false,
  hideCategoryNameOnMobile: false,
  /* ★ 移动端点击标签切换下一个 */
  tapLabelToSwitch: true,

  /* 断点 */
  mobileBreakpoint: 768,
  tabletBreakpoint: 1024,
  mobileSingleView: true,

  backgroundColor: '#f7f9fc',

  initialTiltDeg: 15,
  leftTiltDeg:    8,

  dragSpeedX:   0.00144,
  tiltSpeedY:   0.000396,
  hoverSpeed:   0.175,
  maxTiltDeg:   20,

  starYawGain:     1.8,
  starYawMaxDeg:   81,
  starPitchGain:   1.2,
  starPitchMaxDeg: 27,
  starFollowTilt:  1.0,

  hoverEase:    0.06,
  tiltEase:     0.10,
  starTurnEase: 0.09,

  swapDuration: 1.7,
  swapEase:     'sine.inOut',

  loadModel: null,
};

export function normalizeConfig(userOptions) {
  const cfg = { ...DEFAULTS, ...userOptions };
  cfg.initialTilt  = THREE.MathUtils.degToRad(cfg.initialTiltDeg);
  cfg.leftTilt     = THREE.MathUtils.degToRad(cfg.leftTiltDeg);
  cfg.maxTilt      = THREE.MathUtils.degToRad(cfg.maxTiltDeg);
  cfg.starYawMax   = THREE.MathUtils.degToRad(cfg.starYawMaxDeg);
  cfg.starPitchMax = THREE.MathUtils.degToRad(cfg.starPitchMaxDeg);
  return cfg;
}