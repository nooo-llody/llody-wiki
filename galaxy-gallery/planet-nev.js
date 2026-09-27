// planet-nav.js

/**
 * 移动端"下一个行星"按钮。
 * 点击时切换到下一个行星（与当前恒星交换）。
 */
export function createPlanetNav(container, { onNext }) {
    const btn = document.createElement('button');
    btn.className = 'galaxy-planet-next';
    btn.type = 'button';
    btn.setAttribute('aria-label', '下一个行星');
  
    btn.innerHTML = `
      <span>下一个</span>
      <span class="next-arrow">›</span>
    `;
  
    btn.addEventListener('click', onNext);
    document.body.appendChild(btn);
  
    return {
      show() { btn.classList.add('show'); },
      hide() { btn.classList.remove('show'); },
      destroy() {
        btn.removeEventListener('click', onNext);
        btn.remove();
      },
    };
  }