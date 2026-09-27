// category-nav.js

/**
 * 底部类别切换栏：类别名字 + 圆点导航。
 * 支持点击圆点和鼠标滚轮切换。
 */
export function createCategoryNav(container, { categories, onChange }) {
    let current = 0;
  
    /* 容器 */
    const nav = document.createElement('div');
    nav.className = 'galaxy-category-nav';
  
    /* 类别名字 */
    const nameEl = document.createElement('div');
    nameEl.className = 'galaxy-category-name';
    nameEl.textContent = categories[0].name;
    nav.appendChild(nameEl);
  
    /* 圆点 */
    const dotsWrap = document.createElement('div');
    dotsWrap.className = 'galaxy-category-dots';
    nav.appendChild(dotsWrap);
  
    const dots = categories.map((c, i) => {
      const dot = document.createElement('button');
      dot.className = 'galaxy-category-dot' + (i === 0 ? ' active' : '');
      dot.type = 'button';
      dot.setAttribute('aria-label', c.name);
      dot.addEventListener('click', () => go(i));
      dotsWrap.appendChild(dot);
      return dot;
    });
  
    document.body.appendChild(nav);
  
    /* 切换 */
    function go(i) {
      if (i === current) return;
      const prev = current;
      current = (i + categories.length) % categories.length;
  
      /* 圆点状态 */
      dots[prev].classList.remove('active');
      dots[current].classList.add('active');
  
      /* 名字渐隐 → 更新 → 渐显 */
      const gsap = window.gsap;
      if (gsap) {
        gsap.to(nameEl, {
          opacity: 0, duration: 0.15,
          onComplete: () => {
            nameEl.textContent = categories[current].name;
            gsap.to(nameEl, { opacity: 1, duration: 0.25 });
          },
        });
      } else {
        nameEl.textContent = categories[current].name;
      }
  
      onChange(current);
    }
  
    /* 滚轮 */
    let wheelLock = false;
    const onWheel = (e) => {
      if (!nav.classList.contains('show')) return;
      if (Math.abs(e.deltaY) < 8) return;
      if (wheelLock) return;
      wheelLock = true;
      go(current + (e.deltaY > 0 ? 1 : -1));
      setTimeout(() => { wheelLock = false; }, 600);
    };
    document.addEventListener('wheel', onWheel, { passive: true });
  
    return {
      show() { nav.classList.add('show'); },
      hide() { nav.classList.remove('show'); },
      getNameEl: () => nameEl,
      getCurrent: () => current,
      destroy() {
        document.removeEventListener('wheel', onWheel);
        nav.remove();
      },
    };
  }