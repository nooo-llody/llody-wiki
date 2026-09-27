// mobile-nav.js
export function createMobileNav(container, { onPrev, onNext }) {
    const prev = document.createElement('button');
    prev.className = 'galaxy-mobile-nav galaxy-mobile-nav-prev';
    prev.type = 'button';
    prev.setAttribute('aria-label', '上一个星系');
    prev.innerHTML = '‹';
    prev.addEventListener('click', onPrev);
  
    const next = document.createElement('button');
    next.className = 'galaxy-mobile-nav galaxy-mobile-nav-next';
    next.type = 'button';
    next.setAttribute('aria-label', '下一个星系');
    next.innerHTML = '›';
    next.addEventListener('click', onNext);
  
    container.appendChild(prev);
    container.appendChild(next);
  
    return {
      show() { prev.classList.add('show'); next.classList.add('show'); },
      hide() { prev.classList.remove('show'); next.classList.remove('show'); },
      destroy() {
        prev.removeEventListener('click', onPrev);
        next.removeEventListener('click', onNext);
        prev.remove();
        next.remove();
      },
    };
  }